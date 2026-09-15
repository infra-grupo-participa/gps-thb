import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import type { PropostaReuniao } from "@/lib/reuniao-preliminar-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Reunião preliminar — proposta de data, aceite e contestação (Fatia 4 da
// esteira, migração 20260915000263).
//
// Leitura direta de `gps.reuniao_preliminar_propostas` (a policy
// `gps_reuniao_preliminar_propostas_select` já restringe a admin ou dono do
// ambiente via `gps.aluno_atual()` — mesmo padrão de `getDecisoresDoCliente`
// em `src/lib/data/entrevistas.ts`, nenhuma RPC necessária para LER).
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_PROPOSTA =
  "id, cliente_id, aluno_id, data_proposta, proposta_em, proposta_por, estado, resposta_em, resposta_por, contestacao_motivo";

function mapearProposta(d: Record<string, unknown>): PropostaReuniao {
  return {
    id: String(d.id),
    clienteId: String(d.cliente_id),
    alunoId: String(d.aluno_id),
    dataProposta: String(d.data_proposta),
    propostaEm: String(d.proposta_em),
    propostaPor: String(d.proposta_por),
    estado: d.estado as PropostaReuniao["estado"],
    respostaEm: (d.resposta_em as string | null) ?? null,
    respostaPor: (d.resposta_por as string | null) ?? null,
    contestacaoMotivo: (d.contestacao_motivo as string | null) ?? null,
  };
}

/**
 * Todas as propostas de UM ambiente (titular ou sócio, ou admin em modo
 * assistência), mais recente primeiro — usa o índice
 * `reuniao_preliminar_propostas_aluno_idx (aluno_id, proposta_em desc)`.
 * Histórico completo: "propôs → contestou → propôs de novo" precisa
 * aparecer inteiro, não só a proposta viva.
 */
export async function getPropostasDoAluno(alunoId: string): Promise<PropostaReuniao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("reuniao_preliminar_propostas")
    .select(COLUNAS_PROPOSTA)
    .eq("aluno_id", alunoId)
    .order("proposta_em", { ascending: false });

  if (error) {
    logErro("getPropostasDoAluno", error, { alunoId });
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapearProposta);
}

/**
 * A proposta VIVA (estado='proposta') de um cliente, se houver — usa o
 * índice único parcial `reuniao_preliminar_propostas_cliente_viva_uk`.
 * `null` = nenhuma proposta aguardando resposta para este cliente agora
 * (pode ainda não ter sido proposta, ou a última já foi aceita/contestada/
 * cancelada).
 */
export async function getPropostaVivaDoCliente(
  clienteId: string,
): Promise<PropostaReuniao | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("reuniao_preliminar_propostas")
    .select(COLUNAS_PROPOSTA)
    .eq("cliente_id", clienteId)
    .eq("estado", "proposta")
    .maybeSingle();

  if (error) {
    logErro("getPropostaVivaDoCliente", error, { clienteId });
    return null;
  }

  return data ? mapearProposta(data as Record<string, unknown>) : null;
}

/**
 * Quantas propostas deste cliente já foram CONTESTADAS — espelha a guarda de
 * `gps.reuniao_responder` ("contestação 1 vez só"). Usada pela tela para
 * decidir se mostra o formulário de contestação ou o aviso "abra um
 * chamado".
 */
export async function contarContestacoesDoCliente(clienteId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .schema("gps")
    .from("reuniao_preliminar_propostas")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", clienteId)
    .eq("estado", "contestada");

  if (error) {
    logErro("contarContestacoesDoCliente", error, { clienteId });
    return 0;
  }

  return count ?? 0;
}

/**
 * Propostas AGUARDANDO RESPOSTA de todos os ambientes, para a fila da
 * equipe em `/admin` (não confundir com `gps.admin_painel_atendimento`, que
 * só devolve a CONTAGEM de contestadas por aluno — esta função é para a
 * tela dedicada de propor/cancelar, se existir; `ehAdmin()` de guarda, a
 * fronteira real é a RLS/RPC).
 */
export async function getPropostasVivasDaEquipe(): Promise<PropostaReuniao[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("reuniao_preliminar_propostas")
    .select(COLUNAS_PROPOSTA)
    .eq("estado", "proposta")
    .order("proposta_em", { ascending: true });

  if (error) {
    logErro("getPropostasVivasDaEquipe", error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapearProposta);
}
