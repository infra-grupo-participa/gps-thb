"use server";

/**
 * Integração Google Drive (…347) — server actions que ENFILEIRAM.
 *
 * 🔴 `"use server"` SÓ EXPORTA `async function`. Tipos e frases moram em
 * `src/lib/drive-tipos.ts`.
 *
 * 🔴 Nada aqui é a fronteira de segurança: quem decide é a RPC
 * (`gps.drive_provisionar_parceiro` só admin; `gps.drive_criar_pasta_cliente`
 * admin OU membro do ambiente do cliente). O navegador manda só o id do
 * ambiente/cliente; nenhum file_id passa por aqui. Quem fala com o Google é a
 * edge `drive-provisionar`, com service_role DENTRO da edge — nunca o Next.
 *
 * A pasta é criada em segundo plano: a action devolve o id da tarefa e a tela
 * acompanha por `getEstadoDrive` ("Criando…" → "Pronta" ou o erro).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { MSG_SESSAO_INDETERMINADA, SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import { UUID_RE } from "@/lib/texto";
import { FRASES_DRIVE } from "@/lib/drive-tipos";

type Resultado = { ok: true; tarefaId: string } | { ok: false; erro: string };

/** `true` = admin; `false` = aluno; string = recusa pronta para a tela. */
async function papelDeQuemChama(): Promise<boolean | string> {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return MSG_SESSAO_INDETERMINADA;
  }
  if (!ctx || (ctx.papel !== "aluno" && ctx.papel !== "admin")) return SEM_PERMISSAO;
  return ctx.papel === "admin";
}

/** Equipe pede a pasta do parceiro (cria ou adota + 5) CLIENTES + compartilha com o titular). */
export async function provisionarPastaParceiro(alunoId: string): Promise<Resultado> {
  if (typeof alunoId !== "string" || !UUID_RE.test(alunoId)) {
    return { ok: false, erro: "Ambiente não encontrado." };
  }
  const papel = await papelDeQuemChama();
  if (typeof papel === "string") return { ok: false, erro: papel };
  if (!papel) return { ok: false, erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("drive_provisionar_parceiro", { p_aluno_id: alunoId });
  if (error || typeof data !== "string") {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "provisionarPastaParceiro",
        error ?? { message: "resposta sem id de tarefa" },
        { alunoId },
        FRASES_DRIVE,
      ),
    };
  }

  revalidatePath(`/admin/aluno/${alunoId}/pasta`);
  return { ok: true, tarefaId: data };
}

/** Parceiro (titular/sócio) ou equipe pede a pasta do cliente dentro de 5) CLIENTES. */
export async function criarPastaCliente(clienteId: string): Promise<Resultado> {
  if (typeof clienteId !== "string" || !UUID_RE.test(clienteId)) {
    return { ok: false, erro: "Cliente não encontrado." };
  }
  const papel = await papelDeQuemChama();
  if (typeof papel === "string") return { ok: false, erro: papel };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("drive_criar_pasta_cliente", { p_cliente_id: clienteId });
  if (error || typeof data !== "string") {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "criarPastaCliente",
        error ?? { message: "resposta sem id de tarefa" },
        { clienteId },
        FRASES_DRIVE,
      ),
    };
  }

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/admin/aluno/[alunoId]/clientes/[clienteId]", "page");
  return { ok: true, tarefaId: data };
}
