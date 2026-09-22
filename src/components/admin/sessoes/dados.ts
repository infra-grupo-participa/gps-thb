import "server-only";

import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { ESTADOS_SESSAO, type EstadoSessao, type SessaoAgendamento } from "@/lib/sessoes-tipos";

/**
 * Leitura EXCLUSIVA da tela `/admin/sessoes` (fatia 5) — sessões de UM
 * responsável, sem impor `p_responsavel_id` fixo.
 *
 * 🔴 POR QUE NÃO ESTÁ EM `src/lib/data/sessoes.ts` (fatia 3, do `juan`): duas
 * fatias não editam o mesmo arquivo (PRD §10, regra do CLAUDE.md — "nunca
 * dois agentes no mesmo arquivo"). `getSessoesDaResponsavel` daquele módulo
 * já existe e EXIGE um `responsavelId`; ela serve à doutora (`ctx.user.id`),
 * mas não ao admin, que precisa ver as sessões de TODAS as doutoras.
 *
 * 🔑 A diferença é resolvida por RLS, não por código aqui: para a doutora
 * (`gps_sessao_agend_responsavel_select`, `responsavel_id = auth.uid()`), um
 * SELECT sem filtro já devolve só as dela. Para o admin
 * (`gps_sessao_agend_admin`, `for all using (gp_is_admin())`), o mesmo SELECT
 * sem filtro devolve TODAS. Esta função nunca decide quem vê o quê — ela só
 * não acrescenta um `.eq("responsavel_id", …)` que restringiria o admin a
 * "só as próprias", que seria ERRADO para o papel dele.
 *
 * `briefing_snapshot` continua fora da seleção — está fora do grant de coluna
 * de `authenticated` (…291 §6); pedir a coluna aqui devolveria 42501 para
 * QUALQUER chamador, doutora e admin inclusive. O briefing só se lê pela RPC
 * `gps.sessao_briefing_ler` (`getBriefingDaSessao`, fatia 3).
 */
const COLUNAS_AGENDAMENTO =
  "id, tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, " +
  "inicio_em, fim_em, duracao_min, estado, link_reuniao, " +
  "cancelado_em, cancelado_por, cancelado_motivo, criado_por, criado_em, atualizado_em";

/**
 * Teto de linhas por leitura. 🔴 Existe porque `sessao_agendamentos` só
 * CRESCE: sem teto, a tela da equipe passaria a carregar o acervo inteiro
 * pela vida do sistema — custo que cresce com a base, não com o que se
 * mostra. Molde de `getEventosDoAluno` (teto 300 + aviso na tela).
 *
 * 300 é folgado de propósito: a 8 sessões/semana são ~9 meses de histórico.
 * Quando cortar, a tela DIZ que cortou — nunca finge que aquilo é tudo.
 */
export const TETO_SESSOES = 300;

export async function getSessoesVisiveisNaEquipe(opts?: {
  estados?: EstadoSessao[];
  /** Só sessões a partir deste instante (o "Próximas" usa `now()`). */
  desde?: string;
}): Promise<{
  sessoes: SessaoAgendamento[];
  truncado: boolean;
  erro?: string;
}> {
  const supabase = await createClient();
  const estados = opts?.estados?.length ? opts.estados : [...ESTADOS_SESSAO];

  let consulta = supabase
    .schema("gps")
    .from("sessao_agendamentos")
    .select(COLUNAS_AGENDAMENTO)
    .in("estado", estados);

  // 🔴 Compara com `inicio_em` (coluna GERADA, timestamptz), nunca com `data`
  // isolada — o servidor roda em UTC e `data` mentiria o corte entre 21h e
  // meia-noite. Lição já paga neste projeto.
  if (opts?.desde) consulta = consulta.gte("inicio_em", opts.desde);

  // Pede 1 a mais que o teto: é como se sabe que cortou sem uma 2ª consulta
  // de contagem.
  const { data, error } = await consulta
    .order("inicio_em", { ascending: true })
    .limit(TETO_SESSOES + 1);

  if (error) {
    logErro("getSessoesVisiveisNaEquipe", error, { estados: opts?.estados?.join(",") ?? null });
    return {
      sessoes: [],
      truncado: false,
      erro: "Não foi possível carregar as sessões agora.",
    };
  }

  const linhas = (data ?? []) as unknown as SessaoAgendamento[];
  const truncado = linhas.length > TETO_SESSOES;
  return { sessoes: truncado ? linhas.slice(0, TETO_SESSOES) : linhas, truncado };
}
