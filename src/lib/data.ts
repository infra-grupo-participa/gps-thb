import { createClient } from "@/lib/supabase/server";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import { ehAdmin } from "@/lib/auth";
import type {
  Aluno,
  Ambiente,
  ClienteEtapa1,
  Etapa,
  Membro,
  ModoEnfase,
  ProgressoTarefa,
  AgendaItem,
  AgendaItemComAluno,
  Solicitacao,
  StatusSolicitacao,
  AlunoNota,
  AlunoNotaComAutor,
  ResumoDiario,
  AlunoEvento,
  AlunoEventoComAutor,
  AcaoAdministrativa,
} from "@/lib/types";

export async function getEtapas(): Promise<Etapa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapas")
    .select("*")
    .order("ordem");
  return (data ?? []) as Etapa[];
}

export async function getAlunoById(alunoId: string): Promise<Aluno | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio, profissao, cidade, estado, instagram_url, youtube_url, site_profissional, link_facebook",
    )
    .eq("id", alunoId)
    .maybeSingle();
  return (data as Aluno) ?? null;
}

/** Código/nome da turma do aluno (thb_turmas). */
export async function getTurmaCodigo(
  turmaId: number | null | undefined,
): Promise<string | null> {
  if (turmaId == null) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_turmas")
    .select("codigo")
    .eq("id", turmaId)
    .maybeSingle();
  return (data?.codigo as string) ?? null;
}

/**
 * O ambiente do GPS (pasta do Drive, data de agendamento). Um por
 * `aluno_id` titular, compartilhado por todos os membros — não usar
 * `gps.membros` para esses campos, senão o sócio lê `null`.
 */
export async function getAmbiente(alunoId: string): Promise<Ambiente | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("ambientes")
    .select("aluno_id, pasta_drive_url, data_agendamento_disponivel, criado_em, atualizado_em")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return (data as Ambiente) ?? null;
}

/** O registro de `gps.membros` da PESSOA logada (identidade + perfil próprio). */
export async function getMembroDoUsuario(
  userId: string,
): Promise<Membro | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("membros")
    .select("id, aluno_id, user_id, papel, perfil")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Membro) ?? null;
}

/** Todos os membros (titular + sócios) de um ambiente. */
export async function getMembrosDoAmbiente(
  alunoId: string,
): Promise<Membro[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("membros")
    .select("id, aluno_id, user_id, papel, perfil")
    .eq("aluno_id", alunoId)
    .order("papel", { ascending: true });
  return (data ?? []) as Membro[];
}

export async function getClientesEtapa1(
  alunoId: string,
): Promise<ClienteEtapa1[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("ordem")
    .order("criado_em");
  return (data ?? []) as ClienteEtapa1[];
}

export interface AlunoGps {
  alunoId: string;
  temLogin: boolean;
  qtdMembros: number;
  aluno: Aluno | null;
  pct: number;
  clientesPreenchidos: number;
  agendados: number;
}

/**
 * Lista os AMBIENTES vinculados ao GPS (um por `aluno_id` titular) com um
 * resumo da Etapa 01. `gps.membros` agora tem N linhas por ambiente (titular
 * + sócios) — agrupa por `aluno_id`, senão o painel mostra o mesmo ambiente
 * repetido e infla os `.in()` a seguir.
 */
export async function getAlunosGps(): Promise<AlunoGps[]> {
  const supabase = await createClient();

  const { data: membros } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id, user_id, criado_em")
    .order("criado_em", { ascending: false });

  const lista = (membros ?? []) as {
    aluno_id: string;
    user_id: string | null;
    criado_em: string;
  }[];
  if (lista.length === 0) return [];

  // Agrupa por ambiente, preservando a ordem (ambiente mais recente primeiro).
  const porAmbiente = new Map<
    string,
    { user_id: string | null; criado_em: string }[]
  >();
  for (const m of lista) {
    const arr = porAmbiente.get(m.aluno_id) ?? [];
    arr.push({ user_id: m.user_id, criado_em: m.criado_em });
    porAmbiente.set(m.aluno_id, arr);
  }
  const alunoIds = [...porAmbiente.keys()];

  const [{ data: alunos }, { data: clientes }, { data: progresso }] =
    await Promise.all([
      supabase
        .from("thb_alunos")
        .select(
          "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
        )
        .in("id", alunoIds),
      supabase
        .schema("gps")
        .from("etapa1_clientes")
        .select("*")
        .in("aluno_id", alunoIds),
      supabase
        .schema("gps")
        .from("progresso")
        .select("*")
        .in("aluno_id", alunoIds)
        .eq("etapa", 1),
    ]);

  const alunosMap = new Map(
    ((alunos ?? []) as Aluno[]).map((a) => [a.id, a]),
  );

  return alunoIds.map((alunoId) => {
    const membrosDoAmbiente = porAmbiente.get(alunoId)!;
    const cs = ((clientes ?? []) as ClienteEtapa1[]).filter(
      (c) => c.aluno_id === alunoId,
    );
    const manual: Record<number, boolean> = {};
    for (const p of (progresso ?? []) as ProgressoTarefa[]) {
      if (p.aluno_id === alunoId) manual[p.tarefa] = p.concluida;
    }
    const m = calcularMetricasEtapa1(cs, manual);
    return {
      alunoId,
      temLogin: membrosDoAmbiente.some((mb) => mb.user_id),
      qtdMembros: membrosDoAmbiente.length,
      aluno: alunosMap.get(alunoId) ?? null,
      pct: m.pct,
      clientesPreenchidos: m.preenchidos,
      agendados: m.agendados,
    };
  });
}

/** Solicitação de acesso do usuário logado (ou null). */
export async function getMinhaSolicitacao(
  userId: string,
): Promise<Solicitacao | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Solicitacao) ?? null;
}

/** Solicitações de acesso (para o admin), filtradas por status. */
export async function getSolicitacoes(
  status?: StatusSolicitacao,
): Promise<Solicitacao[]> {
  const supabase = await createClient();
  let query = supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select("*")
    .order("criado_em", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as Solicitacao[];
}

export async function contarSolicitacoesPendentes(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  return count ?? 0;
}

/** Procura um thb_aluno pelo e-mail (para sugerir vínculo na aprovação). */
export async function acharAlunoPorEmail(
  email: string | null,
): Promise<Aluno | null> {
  if (!email) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
    )
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  return (data as Aluno) ?? null;
}

export async function getClienteById(
  clienteId: string,
): Promise<ClienteEtapa1 | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("*")
    .eq("id", clienteId)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

export async function getAgendamentosEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("data", { ascending: true, nullsFirst: false })
    .order("criado_em");
  return data ?? [];
}

export async function getRevisaoEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_revisao")
    .select("*")
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return data ?? null;
}

/** Todo o progresso do aluno (todas as etapas). */
export async function getProgressoAluno(
  alunoId: string,
): Promise<ProgressoTarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("progresso")
    .select("*")
    .eq("aluno_id", alunoId);
  return (data ?? []) as ProgressoTarefa[];
}

/** Cliente marcado como acompanhado pela equipe (ou null). */
export async function getClienteEquipe(
  alunoId: string,
): Promise<ClienteEtapa1 | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("*")
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

export async function getProgressoEtapa(
  alunoId: string,
  etapa: number,
): Promise<ProgressoTarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("progresso")
    .select("*")
    .eq("aluno_id", alunoId)
    .eq("etapa", etapa);
  return (data ?? []) as ProgressoTarefa[];
}

/** Overrides de destaque de tarefa (definidos pelo admin) para uma etapa. */
export async function getEnfasesEtapa(
  alunoId: string,
  etapa: number,
): Promise<Record<number, ModoEnfase>> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("tarefa_enfase")
    .select("tarefa, modo")
    .eq("aluno_id", alunoId)
    .eq("etapa", etapa);
  const out: Record<number, ModoEnfase> = {};
  for (const r of (data ?? []) as { tarefa: number; modo: ModoEnfase }[]) {
    out[r.tarefa] = r.modo;
  }
  return out;
}

/** Agenda pessoal do aluno, do mais próximo ao mais distante. */
export async function getAgenda(alunoId: string): Promise<AgendaItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("agenda")
    .select("*")
    .eq("aluno_id", alunoId)
    .order("data")
    .order("horario", { nullsFirst: true });
  return (data ?? []) as AgendaItem[];
}

/**
 * O que os alunos agendaram, de `deIso` em diante — visão de LEITURA do admin.
 * Duas consultas porque o PostgREST não faz join entre schemas: a agenda vive
 * em `gps` e o aluno em `public`.
 */
export async function getAgendaDeTodos(
  deIso: string,
): Promise<AgendaItemComAluno[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("agenda")
    .select("*")
    .gte("data", deIso)
    .order("data")
    .order("horario", { nullsFirst: true });

  const itens = (data ?? []) as AgendaItem[];
  if (!itens.length) return [];

  const alunoIds = [...new Set(itens.map((i) => i.aluno_id))];
  const { data: alunos } = await supabase
    .from("thb_alunos")
    .select("id, nome")
    .in("id", alunoIds);

  const nomePorId = new Map(
    ((alunos ?? []) as { id: string; nome: string | null }[]).map((a) => [
      a.id,
      a.nome,
    ]),
  );
  return itens.map((i) => ({
    ...i,
    aluno_nome: nomePorId.get(i.aluno_id) ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Diário do aluno — linha do tempo da EQUIPE. Visualização EXCLUSIVA do
// admin (LGPD: dado pessoal de terceiros no texto livre — ver comentário
// no topo da migração 20260908000001). Cada função abaixo confere `ehAdmin()`
// por conta própria: `data.ts` também é importado por páginas do ALUNO, e
// não é seguro confiar que todo chamador vai lembrar de checar antes.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_NOTA =
  "id, aluno_id, autor_id, criado_em, voz, tipo, origem, texto, resolvido_em, resolvido_por, evento_id";

/**
 * Junta nome de autor/quem deu baixa a partir de `public.perfis` (PostgREST
 * não faz join entre schemas gps↔public) e, quando a nota referencia um
 * evento (`evento_id`), o rótulo/tipo desse evento — para a UI mostrar
 * "sobre: Listou 15 clientes" em vez da nota aparecer solta na trilha.
 *
 * Busca só os eventos REFERENCIADOS pelas notas presentes, via `.in("id",
 * [...])` — nunca a base inteira. O evento pode estar fora da janela de
 * tempo carregada pela tela (nota de hoje sobre evento de 6 meses atrás),
 * então não dá para reaproveitar o array de `eventos` já buscado por
 * `getEventosDoAluno`; esta é uma segunda consulta, pequena e restrita ao
 * conjunto de IDs em mãos (tipicamente 0-50, o teto de notas da timeline).
 */
async function comNomesDeAutor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  notas: AlunoNota[],
): Promise<AlunoNotaComAutor[]> {
  if (notas.length === 0) return [];

  const idsAutores = new Set<string>();
  for (const n of notas) {
    idsAutores.add(n.autor_id);
    if (n.resolvido_por) idsAutores.add(n.resolvido_por);
  }

  const idsEventos = [
    ...new Set(
      notas
        .map((n) => n.evento_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: perfis }, { data: eventosRef }] = await Promise.all([
    supabase.from("perfis").select("id, nome").in("id", [...idsAutores]),
    idsEventos.length > 0
      ? supabase
          .schema("gps")
          .from("aluno_eventos")
          .select("id, rotulo, tipo")
          .in("id", idsEventos)
      : Promise.resolve({ data: [] as { id: string; rotulo: string; tipo: string }[] }),
  ]);

  const nomePorId = new Map(
    ((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [
      p.id,
      p.nome,
    ]),
  );

  const eventoPorId = new Map(
    (
      (eventosRef ?? []) as { id: string; rotulo: string; tipo: AlunoEvento["tipo"] }[]
    ).map((e) => [e.id, { rotulo: e.rotulo, tipo: e.tipo }]),
  );

  return notas.map((n) => ({
    ...n,
    autor_nome: nomePorId.get(n.autor_id) ?? null,
    resolvido_por_nome: n.resolvido_por
      ? (nomePorId.get(n.resolvido_por) ?? null)
      : null,
    eventoContexto: n.evento_id ? (eventoPorId.get(n.evento_id) ?? null) : null,
  }));
}

/**
 * Timeline do diário de um aluno, mais recente primeiro. Só admin.
 *
 * `desde` opcional aplica a MESMA janela de tempo escolhida na tela
 * (30/90/tudo) — sem isso, uma nota de 6 meses atrás aparecia mesmo com o
 * filtro em "30 dias" (achado do `fable-orchestrator`). Filtra por
 * `criado_em`, coerente com a ordenação.
 */
// ⚠️ DÍVIDA CONHECIDA: ao contrário de `getEventosDoAluno`, este teto de 50 não
// devolve sinal de truncamento — se um aluno passar de 50 notas na janela, a
// trilha corta em silêncio. Irrelevante hoje (22 notas na base inteira, e nota é
// escrita à mão pela equipe, não gerada por trigger). Quando doer, replicar aqui
// o padrão do `{ eventos, truncado }`: buscar `limite + 1` e descartar o extra.
export async function getDiarioDoAluno(
  alunoId: string,
  opts?: { limite?: number; desde?: string },
): Promise<AlunoNotaComAutor[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  let query = supabase
    .schema("gps")
    .from("aluno_notas")
    .select(COLUNAS_NOTA)
    .eq("aluno_id", alunoId)
    .order("criado_em", { ascending: false })
    .limit(opts?.limite ?? 50);

  if (opts?.desde) query = query.gte("criado_em", opts.desde);

  const { data } = await query;
  return comNomesDeAutor(supabase, (data ?? []) as AlunoNota[]);
}

/**
 * TODAS as pendências abertas de um aluno, sem teto — a timeline
 * (`getDiarioDoAluno`) corta em 50 notas e uma pendência antiga cairia fora
 * dela, ficando visível no badge do painel mas sem botão de baixa na tela.
 * Pendência que não fecha é o defeito que esta feature existe para consertar;
 * ela não pode sumir por causa de um limite de paginação.
 *
 * Sem `.limit()` de propósito: o filtro casa com o índice parcial
 * `idx_aluno_notas_pendencia_aberta` e o universo é o que ainda está ABERTO
 * num aluno — dezenas, não milhares. Se um dia um aluno acumular centenas de
 * pendências abertas, o problema é operacional (ninguém está fechando), não
 * de query.
 *
 * 🔴 ASSIMETRIA PROPOSITAL: ao contrário de `getDiarioDoAluno` e
 * `getAcoesAdministrativasDoAluno` (que aceitam `desde` — a janela 30/90/tudo
 * escolhida na tela), esta função NUNCA recebe `desde` nem teto. Pendência
 * aberta é sempre visível, em qualquer janela — o botão de baixa não pode
 * desaparecer só porque o admin filtrou "30 dias".
 */
export async function getPendenciasAbertasDoAluno(
  alunoId: string,
): Promise<AlunoNotaComAutor[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("aluno_notas")
    .select(COLUNAS_NOTA)
    .eq("aluno_id", alunoId)
    .eq("tipo", "pendencia")
    .is("resolvido_em", null)
    .order("criado_em", { ascending: false });

  return comNomesDeAutor(supabase, (data ?? []) as AlunoNota[]);
}

/**
 * Resumo do diário para cards (última nota + pendências em aberto) — DUAS
 * queries pequenas e indexadas, cada uma resolvendo só o que precisa:
 * a última nota (`.limit(1)`, não precisa varrer 50 linhas de `texto`) e a
 * contagem de pendências abertas (`count: exact, head: true`, sem trazer
 * linha nenhuma). Contar dentro de um `.limit(50)` mentia a partir da 51ª
 * nota — uma pendência antiga sumia do card enquanto o badge do painel
 * (`getPendenciasPorAluno`, que varre a base inteira) seguia contando.
 * A contagem casa exatamente com o índice parcial
 * `idx_aluno_notas_pendencia_aberta` (Index Only Scan, 0,108 ms medido).
 */
export async function getResumoDiario(alunoId: string): Promise<ResumoDiario> {
  if (!(await ehAdmin())) return { ultima: null, pendenciasAbertas: 0 };

  const supabase = await createClient();
  const [{ data: ultimaNota }, { count }] = await Promise.all([
    supabase
      .schema("gps")
      .from("aluno_notas")
      .select(COLUNAS_NOTA)
      .eq("aluno_id", alunoId)
      .order("criado_em", { ascending: false })
      .limit(1),
    supabase
      .schema("gps")
      .from("aluno_notas")
      .select("id", { count: "exact", head: true })
      .eq("aluno_id", alunoId)
      .eq("tipo", "pendencia")
      .is("resolvido_em", null),
  ]);

  const notas = (ultimaNota ?? []) as AlunoNota[];
  const [ultimaComNome] = notas.length
    ? await comNomesDeAutor(supabase, [notas[0]])
    : [];

  return { ultima: ultimaComNome ?? null, pendenciasAbertas: count ?? 0 };
}

/**
 * Pendências abertas da base inteira, por aluno — para badges na lista de
 * alunos do admin. Só `aluno_id` (nunca `texto`, que pode ter dado sensível
 * de terceiros).
 */
export async function getPendenciasPorAluno(): Promise<Map<string, number>> {
  const vazio = new Map<string, number>();
  if (!(await ehAdmin())) return vazio;

  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("aluno_notas")
    .select("aluno_id")
    .eq("tipo", "pendencia")
    .is("resolvido_em", null);

  const contagem = new Map<string, number>();
  for (const row of (data ?? []) as { aluno_id: string }[]) {
    contagem.set(row.aluno_id, (contagem.get(row.aluno_id) ?? 0) + 1);
  }
  return contagem;
}

// ─────────────────────────────────────────────────────────────────────────
// Diário do aluno — Fase 2: LOG DE AÇÕES DO ALUNO (`gps.aluno_eventos`).
// Mesma trava LGPD da Fase 1: cada função confere `ehAdmin()` por conta
// própria (ver comentário no bloco da Fase 1, acima).
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_EVENTO =
  "id, aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem";

/**
 * Junta o nome de quem agiu (`ator_user_id`) a partir de DUAS fontes, numa
 * só query cada — nunca `await` dentro de `map`:
 *   1. `public.perfis` (equipe) pelo `id`.
 *   2. Para quem sobrou (aluno/sócio), `gps.membros` pelo `user_id` resolve
 *      o `aluno_id` da PESSOA e então `thb_alunos.nome`. Um `ator_user_id`
 *      pode não estar em nenhuma das duas (backfill de conta já excluída,
 *      ou `ator_user_id` nulo em marcos antigos) — o nome fica `null`, sem
 *      quebrar a linha.
 */
async function comNomesDeAutorEvento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventos: AlunoEvento[],
): Promise<AlunoEventoComAutor[]> {
  if (eventos.length === 0) return [];

  const idsAtores = [
    ...new Set(
      eventos
        .map((e) => e.ator_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (idsAtores.length === 0) {
    return eventos.map((e) => ({ ...e, ator_nome: null }));
  }

  const [{ data: perfis }, { data: membros }] = await Promise.all([
    supabase.from("perfis").select("id, nome").in("id", idsAtores),
    supabase
      .schema("gps")
      .from("membros")
      .select("user_id, aluno_id")
      .in("user_id", idsAtores),
  ]);

  const nomePorId = new Map<string, string | null>(
    ((perfis ?? []) as { id: string; nome: string | null }[]).map((p) => [
      p.id,
      p.nome,
    ]),
  );

  const membrosSemNome = ((membros ?? []) as {
    user_id: string;
    aluno_id: string;
  }[]).filter((m) => !nomePorId.has(m.user_id));

  if (membrosSemNome.length > 0) {
    const alunoIds = [...new Set(membrosSemNome.map((m) => m.aluno_id))];
    const { data: alunos } = await supabase
      .from("thb_alunos")
      .select("id, nome")
      .in("id", alunoIds);
    const nomeAlunoPorId = new Map(
      ((alunos ?? []) as { id: string; nome: string | null }[]).map((a) => [
        a.id,
        a.nome,
      ]),
    );
    for (const m of membrosSemNome) {
      nomePorId.set(m.user_id, nomeAlunoPorId.get(m.aluno_id) ?? null);
    }
  }

  return eventos.map((e) => ({
    ...e,
    ator_nome: e.ator_user_id ? (nomePorId.get(e.ator_user_id) ?? null) : null,
  }));
}

/** Resultado de `getEventosDoAluno`: a lista (já cortada no teto) + se houve corte. */
export interface EventosDoAlunoResultado {
  eventos: AlunoEventoComAutor[];
  /** `true` quando existiam MAIS eventos que o teto — a UI deve sinalizar o corte. */
  truncado: boolean;
}

/**
 * Trilha de eventos de um aluno, mais recente primeiro, com teto (300 por
 * padrão). Só admin.
 *
 * 🔴 O filtro é sempre por `ocorrido_em` CRU (range de timestamptz), NUNCA
 * por expressão de fuso (`where date(ocorrido_em at time zone
 * 'America/Sao_Paulo') = $1`) — a expressão não bate com o índice
 * `idx_aluno_eventos_timeline (aluno_id, ocorrido_em desc)` e vira Seq Scan
 * (mesma classe do `btrim(lower())` vs `lower(btrim())` que travou produção
 * em 19/08). A conversão para dia local acontece só na agregação em memória
 * (`src/lib/log-agregacao.ts`).
 *
 * Busca `limite + 1` e descarta o excedente para detectar o corte sem uma
 * segunda query de `count` (mais barato: o índice já entrega a página+1 na
 * mesma varredura ordenada, count exigiria outra consulta).
 */
export async function getEventosDoAluno(
  alunoId: string,
  opts?: { desde?: string; limite?: number },
): Promise<EventosDoAlunoResultado> {
  if (!(await ehAdmin())) return { eventos: [], truncado: false };

  const limite = opts?.limite ?? 300;
  const supabase = await createClient();
  let query = supabase
    .schema("gps")
    .from("aluno_eventos")
    .select(COLUNAS_EVENTO)
    .eq("aluno_id", alunoId)
    .order("ocorrido_em", { ascending: false })
    .limit(limite + 1);

  if (opts?.desde) query = query.gte("ocorrido_em", opts.desde);

  const { data } = await query;
  const linhas = (data ?? []) as AlunoEvento[];
  const truncado = linhas.length > limite;
  const eventos = await comNomesDeAutorEvento(
    supabase,
    truncado ? linhas.slice(0, limite) : linhas,
  );
  return { eventos, truncado };
}

/**
 * Marcos da trilha que NÃO podem depender da janela de tempo escolhida na
 * tela (30/90/tudo): quando o primeiro acesso aconteceu e desde quando o log
 * detalhado existe (corte do backfill). Ver achado do `fable-orchestrator`
 * na Fase 2 — antes esses dois valores vinham do array já filtrado por
 * `desde` em `getEventosDoAluno`, e um aluno com primeiro acesso fora da
 * janela aparecia como "Nunca acessou".
 *
 * Duas queries pequenas e independentes de `desde`/`limite`, cada uma presa
 * a `aluno_id` (usa `idx_aluno_eventos_timeline`) e restrita a 1 linha —
 * não é a lista de eventos, é só o marco.
 *
 * O corte de backfill IGNORA `tipo='primeiro_acesso'`: o job de primeiro
 * acesso grava `origem='backfill'` mesmo para aluno recém-chegado, então um
 * aluno sem nenhum outro evento de backfill não pode "herdar" um corte
 * inexistente.
 */
export async function getMarcosDeTrilha(
  alunoId: string,
): Promise<{ primeiroAcessoEm: string | null; corteBackfillEm: string | null }> {
  if (!(await ehAdmin())) return { primeiroAcessoEm: null, corteBackfillEm: null };

  const supabase = await createClient();
  const [{ data: primeiroAcesso }, { data: corteBackfill }] = await Promise.all([
    supabase
      .schema("gps")
      .from("aluno_eventos")
      .select("ocorrido_em")
      .eq("aluno_id", alunoId)
      .eq("tipo", "primeiro_acesso")
      .order("ocorrido_em", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .schema("gps")
      .from("aluno_eventos")
      .select("ocorrido_em")
      .eq("aluno_id", alunoId)
      .eq("origem", "backfill")
      .neq("tipo", "primeiro_acesso")
      .order("ocorrido_em", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    primeiroAcessoEm: (primeiroAcesso as { ocorrido_em: string } | null)?.ocorrido_em ?? null,
    corteBackfillEm: (corteBackfill as { ocorrido_em: string } | null)?.ocorrido_em ?? null,
  };
}

/**
 * Ações administrativas (`gps.acessos_log`) de um aluno — definir senha,
 * excluir acesso etc. Essa tabela grava desde a Fase de gestão de acesso
 * (31/07) mas HOJE NÃO TEM LEITOR NA UI: 33 linhas gravadas e nunca
 * exibidas. A Fase 2 do diário passa a mostrá-las na mesma trilha (nunca
 * agregadas — ver `montarTrilha`). Só admin.
 *
 * `desde` opcional aplica a mesma janela de tempo da tela (30/90/tudo) —
 * mesmo motivo de `getDiarioDoAluno`: sem filtro, uma ação administrativa
 * de 6 meses atrás aparecia mesmo com "30 dias" selecionado. Sem `.limit()`
 * de propósito, igual às pendências abertas: o universo de ações
 * administrativas por aluno é pequeno (definir senha/excluir acesso não são
 * ações de rotina) — se a janela for "tudo", ainda assim não estoura.
 */
export async function getAcoesAdministrativasDoAluno(
  alunoId: string,
  opts?: { desde?: string },
): Promise<AcaoAdministrativa[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  let query = supabase
    .schema("gps")
    .from("acessos_log")
    .select(
      "id, acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por, criado_em",
    )
    .eq("aluno_id", alunoId)
    .order("criado_em", { ascending: false });

  if (opts?.desde) query = query.gte("criado_em", opts.desde);

  const { data } = await query;
  return (data ?? []) as AcaoAdministrativa[];
}

/**
 * Marcos de acesso para o cabeçalho da trilha (ex.: "último acesso").
 *
 * Último acesso é ESTADO (o que está valendo AGORA), não um evento gravado
 * na trilha — por isso reusa `gps.admin_status_acesso` (já existe, já é
 * SECURITY DEFINER, já devolve `ultimo_acesso` por membro) em vez de criar
 * função nova. Ver `src/app/admin/senha-actions.ts` para o mesmo contrato.
 */
export async function getMarcosDeAcesso(
  alunoId: string,
): Promise<{ ultimoAcesso: string | null } | null> {
  if (!(await ehAdmin())) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_status_acesso", { p_aluno_id: alunoId });

  if (error || !data) return null;

  const d = data as Record<string, unknown>;
  return { ultimoAcesso: (d.ultimo_acesso as string) ?? null };
}
