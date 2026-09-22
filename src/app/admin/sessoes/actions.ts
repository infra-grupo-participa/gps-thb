"use server";

/**
 * Agenda de Sessões com a Equipe Jurídica — Server Actions da tela DA EQUIPE
 * (FATIA 5). PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md` (§7.2,
 * §9-ter B2, §9 D7).
 *
 * 🔴 MÓDULO `"use server"` SÓ EXPORTA `async function` — `export type`,
 * `export interface`, `export const` passam no `tsc` e no `next build`, e
 * quebram em RUNTIME (já derrubou `/admin` em 10/09 e `/admin/videos` em
 * 11/09). Os tipos desta feature vivem em `src/lib/sessoes-tipos.ts`.
 *
 * 🔴 Guarda de FORMA aqui (evitar ida ao banco por quem não é equipe); quem
 * barra de verdade é a RLS/guarda dentro das RPCs (`responsavel_id =
 * auth.uid()` ou `gp_is_admin()` — nunca `gps.eh_equipe()`, que incluiria o
 * operador puro da esteira, que não é dona de sessão nenhuma).
 */

import { revalidatePath } from "next/cache";

import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { MSG_SESSAO_INDETERMINADA, traduzirErroBanco } from "@/lib/erros";
import { getBriefingDaSessao } from "@/lib/data/sessoes";
import { createClient } from "@/lib/supabase/server";
import type {
  SessaoBriefing,
  SessaoCancelarResultado,
  SessaoMarcarFaltaResultado,
} from "@/lib/sessoes-tipos";

/**
 * Frases das travas de `gps.sessao_cancelar`/`gps.sessao_marcar_falta` que a
 * RPC já escreve em português — repassadas sem reescrita (mesmo padrão de
 * `src/app/sessoes/actions.ts`, fatia 4; duplicado aqui de propósito: duas
 * fatias não compartilham arquivo `"use server"`, e a tabela é pequena).
 */
function frasesDasTravas(): Record<string, string> {
  return {
    "Sessão não encontrada.": "Sessão não encontrada.",
    "Esta sessão não está marcada — nada a cancelar.":
      "Esta sessão não está marcada — nada a cancelar.",
    "Esta sessão não está marcada — não há falta a registrar.":
      "Esta sessão não está marcada — não há falta a registrar.",
    "Escreva o motivo do cancelamento (ao menos 3 caracteres).":
      "Escreva o motivo do cancelamento (ao menos 3 caracteres).",
    "O motivo passa de 300 caracteres.": "O motivo passa de 300 caracteres.",
    "A observação passa de 300 caracteres.":
      "A observação passa de 300 caracteres.",
    "Esta sessão ainda não começou. A falta só pode ser registrada depois do horário.":
      "Esta sessão ainda não começou. A falta só pode ser registrada depois do horário.",
  };
}

/**
 * Cancela uma sessão — pela DOUTORA dona ou pelo admin.
 *
 * `motivo` é OBRIGATÓRIO aqui (§9 D7: "doutora cancela a qualquer momento com
 * motivo (3–300 chars)") — diferente da action do aluno, onde é opcional. A
 * validação de tamanho é cortesia de tela; quem recusa de fato é o CHECK do
 * banco e a própria RPC.
 */
export async function cancelarSessaoNaEquipe(input: {
  agendamentoId: string;
  motivo: string;
}): Promise<
  { ok: true; sessao: SessaoCancelarResultado } | { ok: false; erro: string }
> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx || ctx.papel !== "admin") {
      return { ok: false, erro: "Sem permissão para esta ação." };
    }
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }

  const motivo = input.motivo.trim();
  if (motivo.length < 3 || motivo.length > 300) {
    return {
      ok: false,
      erro: "O motivo precisa ter entre 3 e 300 caracteres.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("sessao_cancelar", {
    p_agendamento_id: input.agendamentoId,
    p_motivo: motivo,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "cancelarSessaoNaEquipe",
        error,
        { rpc: "gps.sessao_cancelar", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  revalidatePath("/admin/sessoes");
  return { ok: true, sessao: data as SessaoCancelarResultado };
}

/**
 * Marca falta numa sessão — só a doutora DONA ou admin, só depois do
 * horário (§9 D7). O aluno nunca marca a própria falta.
 */
export async function marcarFaltaNaSessao(input: {
  agendamentoId: string;
  observacao?: string | null;
}): Promise<
  | { ok: true; sessao: SessaoMarcarFaltaResultado }
  | { ok: false; erro: string }
> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx || ctx.papel !== "admin") {
      return { ok: false, erro: "Sem permissão para esta ação." };
    }
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }

  const observacao = (input.observacao ?? "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_marcar_falta", {
      p_agendamento_id: input.agendamentoId,
      p_observacao: observacao === "" ? null : observacao,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "marcarFaltaNaSessao",
        error,
        { rpc: "gps.sessao_marcar_falta", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  revalidatePath("/admin/sessoes");
  return { ok: true, sessao: data as SessaoMarcarFaltaResultado };
}

/**
 * Busca o briefing de UMA sessão, SOB DEMANDA (ao abrir a ficha) — nunca na
 * listagem. `getBriefingDaSessao` (fatia 3) chama `gps.sessao_briefing_ler`,
 * que GRAVA trilha LGPD a cada leitura (§9-ter, "…292" §8): carregar o
 * briefing de N sessões para montar a lista geraria N registros de acesso a
 * dado pessoal sem ninguém ter de fato lido nada. Esta action existe só para
 * o componente CLIENTE poder disparar a leitura no clique de "Ver briefing",
 * porque `getBriefingDaSessao` não é `"use server"` por si (mora no módulo de
 * leitura da fatia 3).
 */
export async function abrirBriefingDaSessao(
  agendamentoId: string,
): Promise<{ ok: true; briefing: SessaoBriefing | null } | { ok: false; erro: string }> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx || ctx.papel !== "admin") {
      return { ok: false, erro: "Sem permissão para esta ação." };
    }
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }

  const { briefing, erro } = await getBriefingDaSessao(agendamentoId);
  if (erro) return { ok: false, erro };
  return { ok: true, briefing };
}
