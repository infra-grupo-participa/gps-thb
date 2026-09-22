import { createClient } from "@/lib/supabase/server";
import { traduzirErroBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import {
  ESTADOS_SESSAO,
  type EstadoSessao,
  type HorarioLivre,
  type SessaoAgendamento,
  type SessaoBriefing,
  type SessaoResponsavel,
  type SessaoTipo,
} from "@/lib/sessoes-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Agenda de Sessões com a Equipe Jurídica — leituras (FATIA 3).
//
// PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md`. Contrato de
// banco: `…291` (estrutura) e `…292` (RPCs) — MEDIDO, não suposto.
//
// 🔴 Nenhuma guarda de papel é replicada aqui. A RLS de `…291` e as guardas
// dentro das RPCs de `…292` (`gps.aluno_atual()`, `responsavel_id =
// auth.uid()`, `public.gp_is_admin()`) já decidem quem vê o quê — inclusive
// devolvendo LISTA VAZIA (não erro) quando o aluno não é elegível (PRD §7.1).
// Repetir a guarda aqui duplicaria a fonte de verdade e arriscaria divergir
// dela, como o CLAUDE.md adverte para filtro replicado em duas camadas.
//
// 🔴 `briefing_snapshot` NUNCA aparece num `.select()` desta tabela — está
// fora do grant de coluna de `authenticated` (`…291` §6) e devolveria 42501
// para qualquer chamador, inclusive admin e a doutora dona da sessão. A
// única porta é `getBriefingDaSessao`, que chama a RPC `sessao_briefing_ler`.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_SESSAO_TIPO =
  "id, nome, duracao_min, intervalo_min, exige_briefing, ativo, etapa_id";

// 🔴 Sem `briefing_snapshot` — ver o cabeçalho do arquivo.
// 🔴 `resumo` (o texto) NÃO entra aqui, e não é descuido: está fora do grant
// de coluna (P4/LGPD) — pedi-lo devolve 42501 para a linha inteira. Quem pode
// lê por `gps.sessao_resumo_ler`. Além do mais são 4 KB por linha, e o egress
// do Supabase é teto da ORGANIZAÇÃO, dividido com o `sip`: numa lista isso
// multiplica por linha exibida sem ninguém ter aberto nada.
// `briefing_snapshot` fica fora pela mesma razão.
const COLUNAS_AGENDAMENTO =
  "id, tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio, " +
  "inicio_em, fim_em, duracao_min, estado, link_reuniao, " +
  "link_definido_por, link_por_equipe, link_em, resumo_em, resumo_por, " +
  "cancelado_em, cancelado_por, cancelado_motivo, criado_por, criado_em, atualizado_em";

/**
 * Mapa id → nome das doutoras (`gps.sessao_responsaveis()`), para nomear
 * `sessao_agendamentos.responsavel_id` fora da grade — a TABELA, lida direto
 * pelo PostgREST (`getSessoesDoAmbiente`, `getSessoesDaResponsavel`,
 * `getSessaoPorId`), só tem o uuid; `auth.users` não é legível por
 * `authenticated` e `public.perfis` bloqueia todo aluno com ambiente
 * (`gps_block_aluno`). Só a RPC `SECURITY DEFINER` alcança o nome.
 *
 * 🔴 Busque UMA VEZ e case por id em memória (são 2 doutoras hoje) — nunca
 * uma chamada por linha de agendamento. Medido: 0,927 ms, `Seq Scan` aceito
 * (tabela pequena por natureza; não se cria índice nem se troca por
 * `select distinct`, ver a migration `…292`).
 *
 * Devolve `Map<responsavel_id, nome>`; `nome` pode ser `null` (doutora sem
 * linha em `perfis`) — quem consome decide o fallback ("equipe jurídica"),
 * esta função não inventa rótulo.
 */
export async function getMapaDeResponsaveis(): Promise<Map<string, string | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("sessao_responsaveis");

  if (error) {
    logErro("getMapaDeResponsaveis", error);
    return new Map();
  }

  return new Map(
    ((data ?? []) as SessaoResponsavel[]).map((r) => [r.responsavel_id, r.responsavel_nome]),
  );
}

/**
 * Tipos de sessão ATIVOS (`gps.sessao_tipos`), para popular a escolha do
 * tipo antes de pedir a grade. Leitura aberta a todo `authenticated`
 * (`…291`: não há dado pessoal no catálogo).
 */
export async function getTiposDeSessaoAtivos(): Promise<SessaoTipo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("sessao_tipos")
    .select(COLUNAS_SESSAO_TIPO)
    .eq("ativo", true)
    .order("id");

  if (error) {
    logErro("getTiposDeSessaoAtivos", error);
    return [];
  }
  return (data ?? []) as SessaoTipo[];
}

/**
 * A GRADE, derivada na leitura (PRD §5.4) — `gps.sessao_horarios_livres`.
 *
 * Para o ALUNO: `p_responsavel_id`/`p_de`/`p_ate` normalmente ficam de fora
 * (a RPC usa `gps.aluno_atual()` e a janela default de 8 semanas); se ele
 * não for elegível para o tipo, a RPC devolve **lista vazia**, não erro —
 * este wrapper preserva isso (não convertemos vazio em `erro`).
 *
 * Para a EQUIPE (admin/operador): pode filtrar por `responsavelId` para ver
 * a grade de uma doutora específica.
 *
 * 🔴 `tipoId` é obrigatório porque a duração/folga vêm do catálogo daquele
 * tipo (`…292` §3) — sem ele a RPC recusa com 22023.
 */
export async function getHorariosLivres(params: {
  tipoId: number;
  responsavelId?: string;
  de?: string;
  ate?: string;
}): Promise<{ horarios: HorarioLivre[]; erro?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_horarios_livres", {
      p_tipo_id: params.tipoId,
      p_responsavel_id: params.responsavelId ?? null,
      p_de: params.de ?? null,
      p_ate: params.ate ?? null,
    });

  if (error) {
    return {
      horarios: [],
      erro: traduzirErroBanco("getHorariosLivres", error, {
        rpc: "gps.sessao_horarios_livres",
        tipoId: params.tipoId,
      }),
    };
  }

  return { horarios: (data ?? []) as HorarioLivre[] };
}

/**
 * As sessões do AMBIENTE do usuário logado (titular e sócio veem as mesmas —
 * `aluno_id` é o ambiente, não a pessoa). A RLS (`gps_sessao_agend_aluno_select`)
 * já restringe a `aluno_id = gps.aluno_atual()`; este filtro por `estado` é
 * conveniência de tela (aba "Próximas" × "Histórico"), não uma segunda
 * fronteira de segurança.
 */
export async function getSessoesDoAmbiente(opts?: {
  estados?: EstadoSessao[];
}): Promise<SessaoAgendamento[]> {
  const supabase = await createClient();
  const estados = opts?.estados?.length ? opts.estados : [...ESTADOS_SESSAO];
  const { data, error } = await supabase
    .schema("gps")
    .from("sessao_agendamentos")
    .select(COLUNAS_AGENDAMENTO)
    .in("estado", estados)
    .order("inicio_em", { ascending: true });

  if (error) {
    logErro("getSessoesDoAmbiente", error, { estados: opts?.estados?.join(",") ?? null });
    return [];
  }
  return (data ?? []) as unknown as SessaoAgendamento[];
}

/**
 * As sessões de UMA doutora (`responsavel_id`) — tela dela. A RLS
 * (`gps_sessao_agend_responsavel_select`) restringe a `responsavel_id =
 * auth.uid()`: se o chamador não for a própria doutora nem admin, a query
 * volta vazia por RLS, não por este filtro.
 */
export async function getSessoesDaResponsavel(
  responsavelId: string,
  opts?: { estados?: EstadoSessao[] },
): Promise<SessaoAgendamento[]> {
  const supabase = await createClient();
  const estados = opts?.estados?.length ? opts.estados : [...ESTADOS_SESSAO];
  const { data, error } = await supabase
    .schema("gps")
    .from("sessao_agendamentos")
    .select(COLUNAS_AGENDAMENTO)
    .eq("responsavel_id", responsavelId)
    .in("estado", estados)
    .order("inicio_em", { ascending: true });

  if (error) {
    logErro("getSessoesDaResponsavel", error, {
      responsavelId,
      estados: opts?.estados?.join(",") ?? null,
    });
    return [];
  }
  return (data ?? []) as unknown as SessaoAgendamento[];
}

// ─────────────────────────────────────────────────────────────────────────
// 🔴 REMOVIDAS em 22/09 (achado do veredito): `getSessaoPorId`,
// `getDisponibilidadeDaResponsavel` e `getBloqueiosDaResponsavel` foram
// escritas na fatia 3 e NUNCA tiveram chamador — 0 referências em todo
// `src/`. Código de leitura entregue e não usado é dívida, não adiantamento:
// carrega manutenção, aparece em busca, e dá a impressão de contrato que
// ninguém exercita. Quando a tela precisar de uma delas, nasce com o
// consumidor junto — e aí o `select` de colunas é conferido contra o uso
// real, não contra o que se imaginou que a tela ia querer.
//
// `getSessoesDaResponsavel` FICOU: é citada por `dados.ts` como a leitura
// equivalente do lado da equipe.
// ─────────────────────────────────────────────────────────────────────────

/**
 * O briefing CONGELADO de uma sessão — a ÚNICA porta (`gps.sessao_briefing_ler`).
 *
 * 🔴 Grava trilha em `gps.acessos_log` a CADA chamada (LGPD: a trilha é a
 * guarda em leitura de dado pessoal, `…292` §8). Por isso esta função NÃO é
 * memoizada com `cache()` do React como as leituras "puras" deste arquivo —
 * memoizar esconderia chamadas repetidas do mesmo componente sem esconder a
 * trilha (a RPC já rodou na primeira vez); e duas aberturas de tela no
 * mesmo processo de render são casos raros o bastante para não valer o
 * risco de a trilha mentir sobre quantas vezes o briefing foi realmente lido.
 *
 * O ALUNO nunca chega a chamar isto com sucesso: a RPC recusa com 42501
 * antes de gravar qualquer trilha (§9-ter B2).
 */
export async function getBriefingDaSessao(
  agendamentoId: string,
): Promise<{ briefing: SessaoBriefing | null; erro?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_briefing_ler", { p_agendamento_id: agendamentoId });

  if (error) {
    return {
      briefing: null,
      erro: traduzirErroBanco("getBriefingDaSessao", error, {
        rpc: "gps.sessao_briefing_ler",
        agendamentoId,
      }),
    };
  }

  return { briefing: (data as SessaoBriefing | null) ?? null };
}
