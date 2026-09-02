import "server-only";

/**
 * Plantão de Dúvidas — Acelera Holding. Leituras do admin.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Colunas listadas uma a uma (zero `select('*')`), todo `.from()` com filtro
 * e limite — este módulo é de uso exclusivo do admin (`src/app/admin/plantao`),
 * que já valida `papel === "admin"` antes de chamar.
 */

import { createClient } from "@/lib/supabase/server";
import { limitesDoMes } from "@/lib/plantao";
import type {
  SlotAdmin,
  InscritoAdmin,
  AlunoPlantaoAdmin,
  MentoraAdmin,
} from "@/lib/plantao-tipos";

// Teto de leitura da lista de acesso do admin. 421 já carregados no lote
// 2026-08; com 500 o PRÓXIMO lote truncaria a lista em silêncio, e o admin
// concluiria que um aluno "não está na base" quando ele só ficou fora da
// página. `getAlunosPlantao` sinaliza quando bate no teto (ver `truncado`).
const LIMITE_ALUNOS = 2000;
const LIMITE_INSCRITOS = 500;

/** Slots do mês (todos — publicados ou não), para o painel de gestão. */
export async function getSlotsDoMesAdmin(
  ano: number,
  mes: number,
): Promise<SlotAdmin[]> {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const supabase = await createClient();

  const { data } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .select(
      "id, data, hora_inicio, duracao_min, zoom_url, publicado, gravacao_url, observacao, inicio_em, plantao_mentoras(nome)",
    )
    .gte("inicio_em", inicio)
    .lt("inicio_em", fim)
    .order("inicio_em")
    .limit(LIMITE_ALUNOS);

  if (!data) return [];

  // Contagem de inscritos ativos por slot, numa única query agregada (evita
  // N+1: sem `await` dentro de `map`).
  const slotIds = data.map((s) => s.id as string);
  const contagens = await contarInscritosPorSlot(slotIds);

  return data.map((s) => {
    const mentora = s.plantao_mentoras as unknown as { nome: string } | null;
    return {
      slotId: s.id as string,
      data: s.data as string,
      horaInicio: (s.hora_inicio as string).slice(0, 5),
      duracaoMin: s.duracao_min as number,
      mentoraNome: mentora?.nome ?? "",
      inscritosQtd: contagens.get(s.id as string) ?? 0,
      minhaInscricao: false, // não se aplica ao admin
      encerrado: new Date(s.inicio_em as string) <= new Date(),
      zoomUrl: (s.zoom_url as string) ?? null,
      publicado: s.publicado as boolean,
      gravacaoUrl: (s.gravacao_url as string) ?? null,
      observacao: (s.observacao as string) ?? null,
    };
  });
}

/** Contagem de inscrições ativas por slot, para os slots informados. */
async function contarInscritosPorSlot(
  slotIds: string[],
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (!slotIds.length) return mapa;

  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("plantao_inscricoes")
    .select("slot_id")
    .in("slot_id", slotIds)
    .is("cancelado_em", null)
    // Teto fixo: sem limite de vagas por slot, mas o mês inteiro (todos os
    // slots somados) não passa de 5000 inscrições ativas nesta leitura.
    .limit(5000);

  for (const row of data ?? []) {
    const id = row.slot_id as string;
    mapa.set(id, (mapa.get(id) ?? 0) + 1);
  }
  return mapa;
}

/** Inscritos de um slot específico, com nome/e-mail — só para o admin. */
export async function getInscritosDoSlot(slotId: string): Promise<InscritoAdmin[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("plantao_inscricoes")
    .select("presenca_em, nps_nota, plantao_alunos(nome, email)")
    .eq("slot_id", slotId)
    .is("cancelado_em", null)
    .order("inscrito_em")
    .limit(LIMITE_INSCRITOS);

  return (data ?? []).map((row) => {
    const aluno = row.plantao_alunos as unknown as { nome: string; email: string } | null;
    return {
      nome: aluno?.nome ?? "",
      email: aluno?.email ?? "",
      presencaEm: (row.presenca_em as string) ?? null,
      npsNota: (row.nps_nota as number) ?? null,
    };
  });
}

/** Lista de alunos do plantão para o painel de gestão de acesso. */
export async function getAlunosPlantao(): Promise<AlunoPlantaoAdmin[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("plantao_alunos")
    .select(
      "id, nome, email, lote, ativo, documento, liberado_sem_documento, plantao_acessos(ultimo_login_em), plantao_inscricoes(id)",
    )
    .order("nome")
    .limit(LIMITE_ALUNOS);

  return (data ?? []).map((a) => {
    const acesso = a.plantao_acessos as unknown as
      | { ultimo_login_em: string | null }
      | { ultimo_login_em: string | null }[]
      | null;
    const acessoRow = Array.isArray(acesso) ? acesso[0] : acesso;
    const inscricoes = (a.plantao_inscricoes as unknown[]) ?? [];
    return {
      id: a.id as string,
      nome: a.nome as string,
      email: a.email as string,
      lote: a.lote as string,
      temSenha: Boolean(acessoRow),
      temDocumento: String(a.documento ?? "").replace(/\D/g, "").length >= 4,
      liberadoSemDocumento: Boolean(a.liberado_sem_documento),
      ultimoLoginEm: acessoRow?.ultimo_login_em ?? null,
      ativo: a.ativo as boolean,
      inscricoesQtd: inscricoes.length,
    };
  });
}

/**
 * Mentoras do plantão, para o admin escolher ao criar/editar um horário.
 * Sem índice além da PK, e é o certo: a tabela tem 3 linhas — Seq Scan é a
 * escolha correta do planner nessa escala.
 */
export async function getMentoras(): Promise<MentoraAdmin[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("plantao_mentoras")
    .select("id, nome, ativa")
    .order("nome")
    .limit(50);

  return (data ?? []).map((m) => ({
    id: m.id as string,
    nome: m.nome as string,
    ativa: m.ativa as boolean,
  }));
}
