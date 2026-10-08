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
import { MSG_SESSAO_INDETERMINADA, SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import { getBriefingDaSessao, getHorariosLivres } from "@/lib/data/sessoes";
import { createClient } from "@/lib/supabase/server";
import type {
  HorarioLivre,
  SessaoBriefing,
  SessaoCancelarResultado,
  SessaoMarcarFaltaResultado,
  SessaoRemarcarResultado,
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
    // gps.sessao_remarcar (…327) — mesmas frases, sem reescrita.
    "Escolha o novo horário para continuar.": "Escolha o novo horário para continuar.",
    "Escreva o motivo da remarcação (ao menos 3 caracteres).":
      "Escreva o motivo da remarcação (ao menos 3 caracteres).",
    "Esta sessão não está marcada — não há o que remarcar.":
      "Esta sessão não está marcada — não há o que remarcar.",
    "Esta sessão já começou. Só uma sessão futura pode ser remarcada.":
      "Esta sessão já começou. Só uma sessão futura pode ser remarcada.",
    "Esse horário já passou. Escolha outro.": "Esse horário já passou. Escolha outro.",
    "A sessão já está marcada nesse horário.": "A sessão já está marcada nesse horário.",
    "Esse horário não está na agenda livre desta profissional. Escolha outro na lista.":
      "Esse horário não está na agenda livre desta profissional. Escolha outro na lista.",
    "Alguém acabou de pegar esse horário. Escolha outro na lista.":
      "Alguém acabou de pegar esse horário. Escolha outro na lista.",
    "Este aluno já tem outra sessão deste tipo marcada.":
      "Este aluno já tem outra sessão deste tipo marcada.",
    // gatilho trg_sessao_aluno_sem_choque (…376)
    "Este aluno já tem outra reunião marcada nesse horário. Escolha outro.":
      "Este aluno já tem outra reunião marcada nesse horário. Escolha outro.",
    "Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.":
      "Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.",
    "Esta sessão já foi remarcada 3 vezes nas últimas 24 horas. Fale com o aluno antes de mudar de novo.":
      "Esta sessão já foi remarcada 3 vezes nas últimas 24 horas. Fale com o aluno antes de mudar de novo.",
  };
}

/**
 * Guarda de FORMA das actions de remarcação: só admin — o MESMO recorte do
 * cancelar desta tela. A fronteira real é `gps.sessao_remarcar`
 * (`gp_is_admin()` ou a dona da sessão). Devolve a frase de recusa, ou `null`.
 */
async function recusaSeNaoForAdmin(): Promise<string | null> {
  try {
    const ctx = await getContextoSessao();
    return ctx?.papel === "admin" ? null : SEM_PERMISSAO;
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return MSG_SESSAO_INDETERMINADA;
  }
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `YYYY-MM-DD` que existe no calendário (rejeita 2026-02-30). */
function dataValida(s: string): boolean {
  if (!RE_DATA.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Remarca uma sessão FUTURA e `agendado` para outro horário LIVRE da grade do
 * MESMO responsável — só a equipe. `data`/`hora` são o horário LOCAL de São
 * Paulo (`YYYY-MM-DD`, `HH:MM`), exatamente os campos `data`/`hora_inicio` de
 * `HorarioLivre` que `listarHorariosParaRemarcar` devolve. Motivo 3..300
 * obrigatório (vai no e-mail ao aluno e na trilha).
 *
 * Validação aqui é cortesia de tela; quem recusa de fato é a RPC (guarda,
 * grade revalidada sob `for update`, travas 23505/23P01).
 */
export async function remarcarSessao(input: {
  sessaoId: string;
  data: string;
  hora: string;
  motivo: string;
}): Promise<
  { ok: true; sessao: SessaoRemarcarResultado } | { ok: false; erro: string }
> {
  const recusa = await recusaSeNaoForAdmin();
  if (recusa) return { ok: false, erro: recusa };

  const data = (input.data ?? "").trim();
  const hora = (input.hora ?? "").trim().slice(0, 5);
  if (!input.sessaoId || !dataValida(data) || !RE_HORA.test(hora)) {
    return { ok: false, erro: "Escolha o novo horário para continuar." };
  }

  const motivo = (input.motivo ?? "").trim();
  if (motivo.length < 3 || motivo.length > 300) {
    return {
      ok: false,
      erro: "O motivo precisa ter entre 3 e 300 caracteres.",
    };
  }

  const supabase = await createClient();
  const { data: resultado, error } = await supabase
    .schema("gps")
    .rpc("sessao_remarcar", {
      p_sessao_id: input.sessaoId,
      p_data: data,
      p_hora: hora,
      p_motivo: motivo,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "remarcarSessao",
        error,
        { rpc: "gps.sessao_remarcar", sessaoId: input.sessaoId },
        frasesDasTravas(),
      ),
    };
  }

  revalidatePath("/admin/sessoes");
  revalidatePath("/sessoes");
  return { ok: true, sessao: resultado as SessaoRemarcarResultado };
}

/**
 * A grade livre para o diálogo de remarcar — chamada pelo componente CLIENTE
 * ao abrir o diálogo (sob demanda, nunca na listagem). Envolve
 * `getHorariosLivres` (a MESMA RPC que `gps.sessao_remarcar` usa para
 * revalidar, então a tela nunca oferece o que a RPC recusa). `responsavelId`
 * é obrigatório: a remarcação é sempre para a MESMA profissional.
 */
export async function listarHorariosParaRemarcar(input: {
  tipoId: number;
  responsavelId: string;
  de?: string;
  ate?: string;
}): Promise<{ ok: true; horarios: HorarioLivre[] } | { ok: false; erro: string }> {
  const recusa = await recusaSeNaoForAdmin();
  if (recusa) return { ok: false, erro: recusa };

  if (!Number.isInteger(input.tipoId) || !input.responsavelId) {
    return { ok: false, erro: "Sessão sem tipo ou profissional definidos." };
  }
  if ((input.de && !dataValida(input.de)) || (input.ate && !dataValida(input.ate))) {
    return { ok: false, erro: "Período inválido." };
  }

  const { horarios, erro } = await getHorariosLivres({
    tipoId: input.tipoId,
    responsavelId: input.responsavelId,
    de: input.de,
    ate: input.ate,
  });
  if (erro) return { ok: false, erro };
  return { ok: true, horarios };
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
      return { ok: false, erro: SEM_PERMISSAO };
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
      return { ok: false, erro: SEM_PERMISSAO };
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
      return { ok: false, erro: SEM_PERMISSAO };
    }
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }

  const { briefing, erro } = await getBriefingDaSessao(agendamentoId);
  if (erro) return { ok: false, erro };
  return { ok: true, briefing };
}
