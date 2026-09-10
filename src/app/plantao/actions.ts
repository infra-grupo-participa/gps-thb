"use server";

/**
 * Plantão de Dúvidas — Acelera Holding. Server Actions da aba LOGADA
 * (`/plantao`), exclusiva do aluno do Programa de Implementação Assistida.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * ⚠️ NÃO é a rota pública `/p/plantao` (embedada na Hotmart). As duas
 * convivem de propósito, com identidade completamente separada:
 *
 *   /p/plantao   — pública, sem sessão. Identidade = e-mail digitado no
 *                  formulário, conferido contra a base de compradores do
 *                  Acelera DENTRO da RPC (`gps.plantao_inscrever` etc).
 *   /plantao     — dentro do sistema, aluno do Programa autenticado.
 *                  Identidade = SESSÃO (`gps.pessoa_atual()`, resolvida no
 *                  banco a partir de `auth.uid()`). Nenhuma função aqui
 *                  aceita e-mail/nome como parâmetro — não há CAMPO para
 *                  informar, exatamente como pedido: "associados automático
 *                  sem precisar colocar email e nome".
 *
 * As RPCs chamadas (`gps.plantao_*_logado`) são NOVAS — não são as públicas
 * com um parâmetro a mais. Migration `20260910000236`.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  ResultadoAcao,
  SlotPublico,
  MinhaInscricao,
} from "@/lib/plantao-tipos";

/** Calendário do mês, visto pelo aluno do Programa logado. */
export async function buscarCalendarioLogado(
  ano: number,
  mes: number,
): Promise<{ ok: true; slots: SlotPublico[] } | { ok: false; erro: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("plantao_calendario_logado", { p_ano: ano, p_mes: mes });

  if (error) return { ok: false, erro: "Não foi possível carregar o calendário." };

  const slots = ((data ?? []) as Array<{
    slot_id: string;
    data: string;
    hora_inicio: string;
    duracao_min: number;
    mentora_nome: string;
    inscritos_qtd: number;
    minha_inscricao: boolean;
    encerrado: boolean;
    inscricao_encerrada: boolean;
  }>).map((r) => ({
    slotId: r.slot_id,
    data: r.data,
    horaInicio: r.hora_inicio.slice(0, 5),
    duracaoMin: r.duracao_min,
    mentoraNome: r.mentora_nome,
    inscritosQtd: r.inscritos_qtd,
    minhaInscricao: r.minha_inscricao,
    encerrado: r.encerrado,
    inscricaoEncerrada: r.inscricao_encerrada,
  }));

  return { ok: true, slots };
}

/** A inscrição ativa do aluno do Programa logado (ou null). */
export async function buscarMinhaInscricaoLogado(): Promise<MinhaInscricao | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("plantao_minha_inscricao_logado");
  if (error || !data || !Array.isArray(data) || !data.length) return null;

  const row = data[0] as {
    inscricao_id: string;
    slot_id: string;
    data: string;
    hora_inicio: string;
    mentora_nome: string;
    presenca_em: string | null;
    nps_em: string | null;
    inicio_em: string;
    tem_sala: boolean;
    pode_cancelar: boolean;
    duracao_min: number;
    fim_em: string;
  };

  const inicioEm = new Date(row.inicio_em).getTime();
  const fimEm = new Date(row.fim_em).getTime();
  const agora = Date.now();

  // Mesma regra de `buscarMinhaInscricao` (rota pública): a sala abre 1h
  // antes e fecha no FIM da sessão, nunca no início.
  const JANELA_ANTES_MIN = 60;
  const janelaAberta =
    agora >= inicioEm - JANELA_ANTES_MIN * 60_000 && agora < fimEm;

  return {
    inscricaoId: row.inscricao_id,
    slotId: row.slot_id,
    data: row.data,
    horaInicio: row.hora_inicio.slice(0, 5),
    mentoraNome: row.mentora_nome,
    presencaEm: row.presenca_em,
    npsEm: row.nps_em,
    encerrado: fimEm <= agora,
    janelaAberta,
    temSala: Boolean(row.tem_sala),
    podeCancelar: Boolean(row.pode_cancelar),
  };
}

/**
 * Inscreve o aluno do Programa logado. Sem e-mail, sem nome — a identidade é
 * a sessão. Os dois primeiros parâmetros existem só para a MESMA assinatura
 * de `inscrever()` (rota pública) — `InscricaoPainel` chama qualquer uma das
 * duas ações sem saber qual é; aqui eles são ignorados.
 */
export async function inscreverLogado(
  _email: string | null,
  _nome: string | null,
  slotId: string,
): Promise<ResultadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("plantao_inscrever_logado", { p_slot_id: slotId });

  if (error) return { ok: false, erro: "Não foi possível concluir a inscrição." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível se inscrever." };
  return { ok: true };
}

/**
 * Cancela a inscrição do aluno do Programa logado.
 *
 * `_email` existe só para casar a assinatura de `cancelar()` (rota pública)
 * que `MinhaInscricaoCard` espera — é ignorado aqui.
 */
export async function cancelarLogado(
  _email: string,
  inscricaoId: string,
): Promise<ResultadoAcao> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("plantao_cancelar_logado", { p_inscricao_id: inscricaoId });

  if (error) return { ok: false, erro: "Não foi possível cancelar." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível cancelar." };
  return { ok: true };
}

/** Revela o link da sala do aluno do Programa logado — e isso registra presença. */
export async function revelarLinkLogado(
  _email: string,
  inscricaoId: string,
): Promise<ResultadoAcao & { zoomUrl?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("plantao_revelar_link_logado", { p_inscricao_id: inscricaoId });

  if (error) return { ok: false, erro: "Não foi possível abrir o link." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null; zoom_url: string | null }
    | undefined;

  if (!row?.ok || !row.zoom_url) {
    return { ok: false, erro: row?.motivo || "Link indisponível." };
  }
  return { ok: true, zoomUrl: row.zoom_url };
}
