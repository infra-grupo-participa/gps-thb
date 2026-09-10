import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import type {
  AlunoNota,
  AlunoNotaComAutor,
  ResumoDiario,
  AlunoEvento,
  AlunoEventoComAutor,
  AcaoAdministrativa,
  TipoNota,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Diário do aluno — linha do tempo da EQUIPE. Visualização EXCLUSIVA do
// admin (LGPD: dado pessoal de terceiros no texto livre — ver comentário
// no topo da migração 20260908000001). Cada função abaixo confere `ehAdmin()`
// por conta própria: `data.ts` também é importado por páginas do ALUNO, e
// não é seguro confiar que todo chamador vai lembrar de checar antes.
//
// Recortado de `src/lib/data.ts` (CD5) sem mudança de comportamento — as
// guardas `ehAdmin()` de cada função vieram junto, uma a uma.
// `src/lib/data.ts` reexporta tudo daqui, para os importadores não mudarem.
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

  // @menções (gps.nota_mencoes, ...207): uma consulta pequena pelos ids das
  // notas já em mãos; os perfis mencionados entram na MESMA busca de nomes
  // dos autores, para não abrir uma terceira ida a `perfis`.
  const { data: mencoesRaw } = await supabase
    .schema("gps")
    .from("nota_mencoes")
    .select("nota_id, perfil_id")
    .in(
      "nota_id",
      notas.map((n) => n.id),
    );
  const mencoesPorNota = new Map<string, string[]>();
  for (const m of (mencoesRaw ?? []) as { nota_id: string; perfil_id: string }[]) {
    idsAutores.add(m.perfil_id);
    const lista = mencoesPorNota.get(m.nota_id) ?? [];
    lista.push(m.perfil_id);
    mencoesPorNota.set(m.nota_id, lista);
  }

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
    mencoes: (mencoesPorNota.get(n.id) ?? []).map((id) => ({
      id,
      nome: nomePorId.get(id) ?? null,
    })),
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
 * (`getAtendimentoPorAluno`, que agrega a base inteira no banco) seguia
 * contando.
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
 * Resumo de atendimento de UM ambiente, para os cards de `/admin`.
 *
 * ⚠️ `ultimaNotaResumo` é um TRECHO de no máximo 140 caracteres, cortado no
 * BANCO (`left(texto,140)` em `gps.admin_painel_atendimento`) — o texto
 * integral da nota, que pode ter dado pessoal de terceiro, nunca sai para uma
 * tela de LISTA. Não reconstituir a nota inteira a partir daqui.
 */
export interface AtendimentoDoAluno {
  pendenciasAbertas: number;
  /** ISO da nota mais recente do ambiente. `null` = nenhuma nota no Diário. */
  ultimaNotaEm: string | null;
  ultimaNotaTipo: TipoNota | null;
  /** Trecho de até 140 caracteres, cortado no BANCO. Nunca o texto integral. */
  ultimaNotaResumo: string | null;
  /** Chamados de suporte não fechados do ambiente (migração 20260909000115). */
  chamadosAbertos: number;
}

/** Linha crua de `gps.admin_painel_atendimento()` (migração 20260909000080). */
interface LinhaPainelAtendimento {
  aluno_id: string;
  pendencias_abertas: number;
  chamados_abertos?: number | null;
  ultima_nota_em: string | null;
  ultima_nota_tipo: TipoNota | null;
  ultima_nota_resumo: string | null;
}

/**
 * Resumo do Diário da base inteira, por ambiente — pendências abertas e um
 * trecho da última nota, para os cards de `/admin`.
 *
 * UMA consulta: a RPC `gps.admin_painel_atendimento()` agrega onde o dado
 * está. A função anterior (removida na Fase 5, migração 20260909000080)
 * trazia uma linha por pendência aberta da BASE INTEIRA e contava num laço em
 * JavaScript — o custo crescia com o total de pendências do sistema, não com
 * os ambientes exibidos.
 *
 * Só ambientes COM nota aparecem no Map. Ausência = "Sem nota no Diário", que
 * é informação, não erro.
 *
 * A RPC é SECURITY INVOKER e a RLS só-admin de `gps.aluno_notas` continua
 * sendo a fonte de verdade; a guarda `gp_is_admin()` dentro dela devolve 42501
 * para não-admin — por isso não há `ehAdmin()` aqui, pelo mesmo motivo de
 * `getAlunosGps`.
 */
export async function getAtendimentoPorAluno(): Promise<
  Map<string, AtendimentoDoAluno>
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_painel_atendimento");

  if (error) {
    // Falha aqui não pode virar "nenhuma pendência em lugar nenhum" em
    // silêncio: a tela ficaria idêntica à de um Diário vazio. Registra e só
    // então devolve o Map vazio.
    logErro("getAtendimentoPorAluno", error, {
      rpc: "gps.admin_painel_atendimento",
      efeito: "cards do painel sem resumo do Diario",
    });
    return new Map<string, AtendimentoDoAluno>();
  }

  const linhas = (data ?? []) as LinhaPainelAtendimento[];
  return new Map(
    linhas.map((l) => [
      l.aluno_id,
      {
        pendenciasAbertas: l.pendencias_abertas,
        chamadosAbertos: l.chamados_abertos ?? 0,
        ultimaNotaEm: l.ultima_nota_em,
        ultimaNotaTipo: l.ultima_nota_tipo,
        ultimaNotaResumo: l.ultima_nota_resumo,
      },
    ]),
  );
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
