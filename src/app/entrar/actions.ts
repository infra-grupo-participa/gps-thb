"use server";

/**
 * Entrada pelo código do grupo — e-mail + código, sem CPF e sem confirmação.
 *
 * Pedido do Marcio (10/09/2026, durante o evento de acessos): *"sem
 * confirmação, ele coloca a senha de 1 a 8 e entra no sistema; com base no
 * e-mail que ele colocar, cria o acesso dele... quero evitar dor de cabeça
 * com acesso, facilita pra eles"*.
 *
 * 🔑 COMO FUNCIONA: a pessoa digita o e-mail da compra e o código. O servidor
 * gera uma senha temporária ALEATÓRIA, entra com ela na hora, e o passo 0 do
 * onboarding obriga a pessoa a criar a própria senha. Quem já fez o
 * onboarding cai direto na tela inicial.
 *
 * A senha temporária nunca chega ao navegador como algo a digitar: ela é
 * criada e consumida dentro desta action.
 *
 * ⚠️ O QUE ISTO CUSTA, dito na hora da decisão: o código é público no grupo,
 * então quem souber o e-mail de um colega entra na conta dele — e vê os
 * clientes que ele cadastrou. `auth.users` é dos 7 sistemas do grupo, então
 * a senha nova vale nos outros portais também.
 *
 * O que reduz o estrago, e foi medido antes de construir:
 *   · **nenhuma conta de aluno é admin** (0 de 150) — não há escalada
 *   · conta de EQUIPE é recusada com 42501 (`admin_alvo_e_equipe`)
 *   · o Diário (PII de terceiros) é só-admin e continua fora do alcance
 *   · rate limit de 20/15min por IP — generoso o bastante para uma sala
 *     inteira na mesma rede, apertado o bastante para barrar varredura
 *   · toda entrada fica registrada em `gps.resgate_tentativas`
 *
 * 🔴 DESLIGAR SEM DEPLOY, quando o evento acabar:
 *   update gps.config set valor='false' where chave='entrada_codigo_ativa';
 */

import { headers } from "next/headers";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroBanco } from "@/lib/erros";
import { normalizarEmail } from "@/lib/texto";
import { guardarConta } from "@/lib/contas-do-navegador";
import { nomeDoUsuario } from "@/lib/nome-do-usuario";

function anon() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Balde de rate limit. É IP, não identidade — por isso vai em hash. */
async function ipHash(): Promise<string | null> {
  const h = await headers();
  const bruto =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip");
  if (!bruto) return null;
  return createHash("sha256").update(bruto).digest("hex").slice(0, 32);
}

export interface EntrarState {
  erro?: string;
  email?: string;
  /** `true` = entrou; o formulário navega. */
  ok?: boolean;
}

export async function entrarPeloCodigo(
  _estado: EntrarState,
  form: FormData,
): Promise<EntrarState> {
  const email = normalizarEmail(String(form.get("email") ?? ""));
  const codigo = String(form.get("codigo") ?? "").trim();

  if (!email) return { erro: "Informe o seu e-mail." };
  if (!codigo) return { erro: "Informe o código.", email };

  // 1. O banco confere o código, resolve quem é a pessoa, cria o login se
  //    não houver e devolve uma senha temporária de uso imediato.
  const { data, error } = await anon()
    .schema("gps")
    .rpc("entrada_pelo_codigo", {
      p_email: email,
      p_codigo: codigo,
      p_ip_hash: await ipHash(),
    });

  if (error) return { erro: traduzirErroBanco("entrar/codigo", error, { email }), email };

  const cred = data as { email?: string; senha?: string; nome?: string } | null;
  if (!cred?.email || !cred?.senha) {
    return { erro: "Não foi possível entrar agora. Tente de novo.", email };
  }

  // 2. Entra de fato, com a sessão gravada nos cookies do navegador.
  const supabase = await createClient();
  const { data: sessao, error: eLogin } = await supabase.auth.signInWithPassword({
    email: cred.email,
    password: cred.senha,
  });

  if (eLogin) {
    // A senha foi gerada agora, então falha aqui é rede/GoTrue, não credencial.
    return { erro: "Não foi possível entrar agora. Tente de novo.", email };
  }

  // 3. A conta passa a aparecer no menu "trocar de conta" deste navegador.
  //    Falha aqui NÃO derruba o login — é conveniência, não requisito.
  try {
    if (sessao.session?.refresh_token && sessao.user) {
      await guardarConta({
        userId: sessao.user.id,
        email: sessao.user.email ?? cred.email,
        nome: await nomeDoUsuario(supabase, sessao.user.id),
        refreshToken: sessao.session.refresh_token,
      });
    }
  } catch {
    // silencioso por desenho
  }

  // 🔑 Não chama `redirect()` aqui: ele funciona lançando exceção, e dentro
  // do `useActionState` do formulário isso vira "rota não encontrada" (a
  // mesma lição que quebrou a troca de contas em 10/09). Quem navega é o
  // cliente, ao ver `ok: true`.
  return { ok: true };
}
