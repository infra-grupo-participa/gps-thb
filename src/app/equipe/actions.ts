"use server";

/**
 * Feature "Equipe" — o TITULAR convida o próprio sócio (11/09/2026, decisão
 * do Marcio: "só o titular convida", teto de 1 por ambiente).
 *
 * Contrato com o banco (outro agente, em paralelo — NÃO migrar aqui):
 *   gps.socio_convite_criar(p_email, p_ip_hash)   → token em claro (1x)
 *   gps.socio_convite_revogar(p_id)
 *   gps.socio_convite_do_ambiente()               → convite pendente do ambiente
 *   gps.socio_convite_aceitar(p_token, p_email, p_senha) → PÚBLICA (ver src/app/convite/actions.ts)
 *
 * `p_ip_hash` no molde de `src/app/resgate/actions.ts`: hash de
 * `x-forwarded-for`/`x-real-ip`, nunca o IP cru — é balde de rate limit, não
 * identificação de pessoa.
 *
 * Guarda de PAPEL: só o TITULAR chama `convidarSocio`/`reenviarConvite`/
 * `revogarConvite` — a RPC decide de novo (é a fronteira real), esta guarda
 * aqui só poupa a viagem ao banco e devolve erro cedo, mesmo padrão de
 * `getDiagnosticoAmbiente`.
 */

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { emailValido, normalizarEmail } from "@/lib/texto";
import { traduzirErroBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { enviarConviteSocio } from "@/lib/email";

/**
 * O nome do TITULAR para o e-mail do convite. `ctx.perfil` é `null` para
 * papel `aluno` (só é populado para admin) — o nome do titular mora em
 * `thb_alunos`, alcançado por `ctx.alunoId` (o AMBIENTE; quem convida É o
 * titular, então `alunoId` aqui já é a pessoa certa).
 */
async function nomeDoTitular(alunoId: string, emailFallback: string | null) {
  const aluno = await getAlunoById(alunoId);
  return aluno?.nome?.trim() || emailFallback || "um parceiro do programa";
}

/** Mesmo hash de `src/app/resgate/actions.ts` — balde de rate limit, não identificação. */
async function ipHash(): Promise<string | null> {
  const h = await headers();
  const bruto =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    h.get("x-real-ip");
  if (!bruto) return null;
  return createHash("sha256").update(bruto).digest("hex").slice(0, 32);
}

export interface ConvidarSocioResultado {
  erro?: string;
  ok?: boolean;
  /** Link para o titular copiar — sempre devolvido, mesmo quando o e-mail sai. */
  link?: string;
  /** `false` quando a Resend falhou: a tela mostra o link para copiar na hora. */
  emailEnviado?: boolean;
}

export async function convidarSocio(
  _prev: unknown,
  formData: FormData,
): Promise<ConvidarSocioResultado> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { erro: "Sem permissão." };
  }
  // Guarda de papel — a RPC confere de novo (é a fronteira real).
  if (ctx.papelMembro !== "titular") {
    return { erro: "Só o titular do ambiente pode convidar um sócio." };
  }

  const email = normalizarEmail(String(formData.get("email") ?? ""));
  if (!email || !emailValido(email)) {
    return { erro: "Informe um e-mail válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc(
    "socio_convite_criar",
    { p_email: email, p_ip_hash: await ipHash() },
  );

  if (error) {
    return { erro: traduzirErroBanco("equipe/convidarSocio", error, { alunoId: ctx.alunoId }) };
  }

  const token = (data as { token?: string } | null)?.token ?? String(data ?? "");
  if (!token) {
    logErro("equipe/convidarSocio", { message: "RPC sem token" }, { alunoId: ctx.alunoId });
    return { erro: "Não foi possível gerar o convite agora. Tente de novo." };
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://programa.timeholdingbrasil.com.br"
  ).replace(/\/+$/, "");
  const link = `${appUrl}/convite?t=${encodeURIComponent(token)}`;

  // Falha de e-mail NUNCA bloqueia o convite (padrão de src/lib/email.ts:
  // `{ ok, erro? }`, nunca lança) — a tela mostra o link para o titular copiar.
  const nomeTitular = await nomeDoTitular(ctx.alunoId, ctx.user.email ?? null);
  const resultado = await enviarConviteSocio({
    paraEmail: email,
    nomeTitular,
    link,
  });

  revalidatePath("/equipe");
  return { ok: true, link, emailEnviado: resultado.ok };
}

export interface ReenviarConviteResultado {
  erro?: string;
  ok?: boolean;
  link?: string;
  emailEnviado?: boolean;
}

/**
 * Reenvio (decisão #7: validade de 7 dias, "com reenvio pelo titular") —
 * revoga o convite pendente e cria outro, mesmo e-mail. Dois passos porque
 * não há RPC de "renovar": é o par revogar+criar que a Central já usa em
 * outros fluxos de reemissão.
 */
export async function reenviarConvite(
  _prev: unknown,
  formData: FormData,
): Promise<ReenviarConviteResultado> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { erro: "Sem permissão." };
  }
  if (ctx.papelMembro !== "titular") {
    return { erro: "Só o titular do ambiente pode reenviar o convite." };
  }

  const convitePendenteId = String(formData.get("conviteId") ?? "");
  const email = normalizarEmail(String(formData.get("email") ?? ""));
  if (!convitePendenteId || !email || !emailValido(email)) {
    return { erro: "Não foi possível identificar o convite a reenviar." };
  }

  const supabase = await createClient();
  const { error: erroRevogar } = await supabase
    .schema("gps")
    .rpc("socio_convite_revogar", { p_id: convitePendenteId });
  if (erroRevogar) {
    return {
      erro: traduzirErroBanco("equipe/reenviarConvite.revogar", erroRevogar, {
        alunoId: ctx.alunoId,
      }),
    };
  }

  const { data, error } = await supabase.schema("gps").rpc(
    "socio_convite_criar",
    { p_email: email, p_ip_hash: await ipHash() },
  );
  if (error) {
    return {
      erro: traduzirErroBanco("equipe/reenviarConvite.criar", error, {
        alunoId: ctx.alunoId,
      }),
    };
  }

  const token = (data as { token?: string } | null)?.token ?? String(data ?? "");
  if (!token) {
    logErro("equipe/reenviarConvite", { message: "RPC sem token" }, { alunoId: ctx.alunoId });
    return { erro: "Não foi possível gerar o novo convite agora. Tente de novo." };
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://programa.timeholdingbrasil.com.br"
  ).replace(/\/+$/, "");
  const link = `${appUrl}/convite?t=${encodeURIComponent(token)}`;

  const nomeTitular = await nomeDoTitular(ctx.alunoId, ctx.user.email ?? null);
  const resultado = await enviarConviteSocio({ paraEmail: email, nomeTitular, link });

  revalidatePath("/equipe");
  return { ok: true, link, emailEnviado: resultado.ok };
}

export async function revogarConvite(
  conviteId: string,
): Promise<{ erro?: string; ok?: boolean }> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { erro: "Sem permissão." };
  }
  if (ctx.papelMembro !== "titular") {
    return { erro: "Só o titular do ambiente pode revogar o convite." };
  }
  if (!conviteId) return { erro: "Convite não informado." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("socio_convite_revogar", { p_id: conviteId });

  if (error) {
    return {
      erro: traduzirErroBanco("equipe/revogarConvite", error, {
        alunoId: ctx.alunoId,
      }),
    };
  }

  revalidatePath("/equipe");
  return { ok: true };
}
