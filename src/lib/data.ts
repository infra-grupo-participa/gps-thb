import { createClient } from "@/lib/supabase/server";
import { resumoEtapa1 } from "@/lib/etapa1";
import { ehAdmin } from "@/lib/auth";
import type {
  Aluno,
  Ambiente,
  ClienteEtapa1,
  Etapa,
  Membro,
  ModoEnfase,
  ProgressoTarefa,
  Solicitacao,
  StatusSolicitacao,
  AlunoNota,
  AlunoNotaComAutor,
  ResumoDiario,
  AlunoEvento,
  AlunoEventoComAutor,
  AcaoAdministrativa,
  TipoNota,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// COLUNAS EXPLÍCITAS POR TABELA (P6 do polimento)
//
// Substituem os `select("*")` que este arquivo usava. Motivo: o egress do
// Supabase tem teto DA ORGANIZAÇÃO, dividido com o sip — e `etapa1_clientes`
// é a tabela larga (879 linhas), lida na home, na Etapa 01 e na aba Clientes.
//
// ⚠️ CONTRATO: cada constante tem de listar TUDO que o tipo consumidor
// declara em src/lib/types.ts. Um `select` explícito NÃO falha quando falta
// coluna — o campo chega `undefined` e a tela mostra vazio em silêncio. Ao
// acrescentar coluna no banco E no tipo, acrescente aqui na MESMA mudança.
// (`COLUNAS_NOTA` e `COLUNAS_EVENTO`, do Diário, ficam junto das suas seções
// mais abaixo — este bloco não as move para não desencontrar comentário e uso.)
// ─────────────────────────────────────────────────────────────────────────

/** `gps.etapas` → `Etapa`. */
const COLUNAS_ETAPA = "id, nome, descricao, ordem, liberada";

/**
 * `gps.etapa1_clientes` → `ClienteEtapa1`. As 20 colunas do tipo.
 *
 * 🔑 `status` entra de propósito, mesmo CONGELADO desde a migração ...060:
 * o marcador "Recusou" da UI ainda o lê (1 linha na base). Sai daqui quando
 * a coluna sair do banco, não antes.
 * 🔑 `fase`, `valor_honorarios` e `contrato_url` nasceram hoje (migrações
 * ...060/...090) — sem elas na lista, o quadro de fases e a coluna de
 * honorários ficariam vazios sem erro nenhum.
 * `criado_em`/`atualizado_em` NÃO entram: ninguém os lê. `criado_em` continua
 * servindo de critério de `.order()`, e o PostgREST ordena por coluna que não
 * está no `select`.
 */
const COLUNAS_CLIENTE =
  "id, aluno_id, nome, telefone, nivel_relacionamento, problemas, perda_inercia, registro_contato, mensagem_padrao_enviada, estudo_caso_enviado, ligacao_realizada, status, fase, data_reuniao_preliminar, aderiu_reuniao, perfil_disc, acompanhado_equipe, ordem, valor_honorarios, contrato_url";

/** `gps.solicitacoes_acesso` → `Solicitacao`. */
const COLUNAS_SOLICITACAO =
  "id, user_id, nome, email, telefone, status, aluno_id, observacao, criado_em, decidido_em";

/** `gps.etapa3_agendamentos` → `Etapa3Agendamento`. */
const COLUNAS_ETAPA3_AGENDAMENTO =
  "id, aluno_id, cliente_id, descricao, data, horario, equipe_participa, criado_em";

/** `gps.etapa3_revisao` → `Etapa3Revisao`. */
const COLUNAS_ETAPA3_REVISAO = "aluno_id, duvidas, correcoes, atualizado_em";

/** `gps.progresso` → `ProgressoTarefa`. */
const COLUNAS_PROGRESSO =
  "id, aluno_id, etapa, tarefa, concluida, concluida_em";

export async function getEtapas(): Promise<Etapa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapas")
    .select(COLUNAS_ETAPA)
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
    .select(COLUNAS_CLIENTE)
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
  /** Entrada no programa: menor `gps.membros.criado_em` do ambiente. ISO. */
  desde: string | null;
  /** Maior `auth.users.last_sign_in_at` entre os membros. ISO. `null` = nunca entrou. */
  ultimoAcesso: string | null;
  /**
   * Soma de `valor_honorarios` dos clientes em `fase='contratado'`, em reais.
   * `null` = nenhum contratado com valor registrado — NUNCA exibir como
   * `R$ 0,00` (a coluna nasceu vazia nas 879 linhas na migração ...090).
   */
  honorariosContratados: number | null;
  /** Quantos clientes do ambiente estão em `fase='contratado'`. */
  contratados: number;
  /** Desses, quantos ainda sem `valor_honorarios`. */
  contratadosSemValor: number;
}

/**
 * Linha crua de `gps.admin_painel_alunos()` (migração 20260909000050; as três
 * colunas de honorários entraram na 20260909000091 e `total_ambientes` na
 * 20260909000120).
 */
interface LinhaPainelAlunos {
  aluno_id: string;
  qtd_membros: number;
  tem_login: boolean;
  desde: string | null;
  ultimo_acesso: string | null;
  clientes_preenchidos: number;
  clientes_com_dados: number;
  clientes_com_perda: number;
  agendados: number;
  tarefas_concluidas: number[] | null;
  /** `numeric` do Postgres. Chega como número no JSON; `null` = nenhum valor. */
  honorarios_contratados: number | null;
  contratados: number;
  contratados_sem_valor: number;
  /**
   * TOTAL de ambientes do GPS — repetido em TODA linha (`count(*) over ()`
   * calculado antes do `limit`). Não é o tamanho do lote: é o universo.
   * Opcional no tipo porque um banco ainda sem a migração ...120 devolveria
   * `undefined` aqui, e o fallback (ver `getAlunosGps`) tem de existir.
   */
  total_ambientes?: number;
}

/**
 * Quantos ambientes o painel carrega por lote. Espelha o default de
 * `p_limite` em `gps.admin_painel_alunos()` — se um dia divergirem, quem
 * manda é o banco (a função prende `p_limite` em [1, 1000]).
 *
 * 200 e não 100: hoje são 125 ambientes, e um teto abaixo do total faria
 * TODA sessão de admin começar com "Mostrar mais" na tela por nada.
 */
export const LIMITE_PAINEL_ALUNOS = 200;

/** Teto duro do lote — o mesmo que a RPC aplica, replicado aqui para que um
 *  `?mais=` absurdo na URL não vire uma consulta que o banco vai cortar de
 *  qualquer jeito. */
export const LIMITE_PAINEL_ALUNOS_MAX = 1000;

/** O que `getAlunosGps` devolve: o LOTE + o tamanho do universo. */
export interface PaginaAlunosGps {
  /** Os ambientes deste lote, já na ordem do banco. */
  alunos: AlunoGps[];
  /**
   * Total de ambientes no GPS, independente do lote. É o que permite à tela
   * dizer "Mostrando 200 de 1.250" em vez de fingir que 200 é tudo.
   */
  total: number;
}

/**
 * Lista os AMBIENTES vinculados ao GPS (um por `aluno_id` titular) com um
 * resumo da Etapa 01, já agregado pelo banco.
 *
 * São 2 consultas: a RPC `gps.admin_painel_alunos()` (uma linha por ambiente,
 * já agrupada — `gps.membros` tem N linhas por ambiente, titular + sócios) e a
 * leitura de `thb_alunos` pelos ids devolvidos. Antes eram 4, e duas delas
 * traziam `select *` de `gps.etapa1_clientes` e `gps.progresso` para contar 4
 * números em JavaScript: o custo do painel crescia com o TOTAL de clientes do
 * sistema, não com os ambientes exibidos.
 *
 * A RPC é SECURITY DEFINER e já barra não-admin com 42501 — por isso não há
 * `ehAdmin()` aqui. `pct` continua saindo de `resumoEtapa1`, a MESMA regra que
 * a tela do aluno usa (o catálogo de tarefas é código, nunca duplicado em SQL).
 *
 * 🔑 PAGINADA desde a migração 20260909000120 (P5): devolve um LOTE
 * (`limite`, 200 por padrão) e o TOTAL do universo. A busca e os filtros do
 * painel continuam em memória, sobre o lote — por isso quem consome é
 * OBRIGADO a exibir o total (ver `AlunosAtivosLista`): paginar em silêncio
 * transformaria "nenhum aluno para «Silva»" numa meia-verdade.
 *
 * O segundo `select` em `thb_alunos` usa `.in("id", alunoIds)` sobre os ids
 * do lote — ou seja, ele encolhe junto. Sem o teto na RPC, era ele que
 * crescia sem limite.
 */
export async function getAlunosGps(opts?: {
  limite?: number;
  offset?: number;
}): Promise<PaginaAlunosGps> {
  const supabase = await createClient();

  // Saneamento na fronteira: `limite`/`offset` vêm de searchParam. A RPC
  // prende de novo (defesa em profundidade), mas mandar `-1` daqui já seria
  // um round-trip jogado fora — e `NaN` viraria `null` no JSON, o que faz a
  // RPC cair no `coalesce` e devolver o lote padrão sem ninguém entender.
  const limite = Math.min(
    Math.max(Math.trunc(opts?.limite ?? LIMITE_PAINEL_ALUNOS) || LIMITE_PAINEL_ALUNOS, 1),
    LIMITE_PAINEL_ALUNOS_MAX,
  );
  const offset = Math.max(Math.trunc(opts?.offset ?? 0) || 0, 0);

  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_painel_alunos", { p_limite: limite, p_offset: offset });

  if (error) {
    // Falha aqui não pode virar "nenhum aluno no programa" em silêncio: a tela
    // ficaria idêntica à de um banco vazio. Registra e só então devolve [].
    console.error(
      "[getAlunosGps] gps.admin_painel_alunos() falhou; painel exibirá lista vazia",
      {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    );
    return { alunos: [], total: 0 };
  }

  const linhas = (data ?? []) as LinhaPainelAlunos[];
  if (linhas.length === 0) return { alunos: [], total: 0 };

  // O total vem repetido em toda linha; a primeira basta. O fallback para
  // `linhas.length` cobre o banco que ainda não recebeu a migração ...120:
  // coluna ausente é `undefined` em JS, não erro, e sem o fallback o rodapé
  // diria "de 0" para sempre sem ninguém notar.
  const total =
    typeof linhas[0].total_ambientes === "number"
      ? linhas[0].total_ambientes
      : linhas.length;

  const alunoIds = linhas.map((l) => l.aluno_id);
  const { data: alunos } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
    )
    .in("id", alunoIds);

  const alunosMap = new Map(((alunos ?? []) as Aluno[]).map((a) => [a.id, a]));

  const alunosGps = linhas.map((l) => {
    const manual: Record<number, boolean> = Object.fromEntries(
      (l.tarefas_concluidas ?? []).map((t) => [t, true]),
    );
    const { pct } = resumoEtapa1(
      {
        preenchidos: l.clientes_preenchidos,
        comDados: l.clientes_com_dados,
        comPerda: l.clientes_com_perda,
        agendados: l.agendados,
      },
      manual,
    );
    return {
      alunoId: l.aluno_id,
      temLogin: l.tem_login,
      qtdMembros: l.qtd_membros,
      aluno: alunosMap.get(l.aluno_id) ?? null,
      pct,
      clientesPreenchidos: l.clientes_preenchidos,
      agendados: l.agendados,
      desde: l.desde,
      ultimoAcesso: l.ultimo_acesso,
      // `numeric` pode chegar como string em alguns caminhos do PostgREST.
      // `Number(null)` é 0 — por isso o teste de nulidade vem ANTES da
      // conversão: transformar "não informado" em zero aqui produziria um
      // faturamento plausível e falso no card do painel.
      honorariosContratados:
        l.honorarios_contratados == null
          ? null
          : Number(l.honorarios_contratados),
      contratados: l.contratados ?? 0,
      contratadosSemValor: l.contratados_sem_valor ?? 0,
    };
  });

  return { alunos: alunosGps, total };
}

/** Solicitação de acesso do usuário logado (ou null). */
export async function getMinhaSolicitacao(
  userId: string,
): Promise<Solicitacao | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select(COLUNAS_SOLICITACAO)
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
    .select(COLUNAS_SOLICITACAO)
    .order("criado_em", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as Solicitacao[];
}

const COLUNAS_ALUNO_SUGESTAO =
  "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio";

/**
 * Procura os thb_alunos de uma lista de e-mails em UMA query (para sugerir
 * vínculo na fila de aprovação).
 *
 * 🔑 Substitui o N+1 do painel: `/admin` chamava `acharAlunoPorEmail` uma vez
 * por solicitação pendente, em série depois do `Promise.all` das outras
 * leituras — com 20 solicitações eram 20 round-trips ao PostgREST
 * (~44 ms cada) empilhados no fim do caminho crítico.
 *
 * A chave do mapa é `lower(trim(email))`, a mesma normalização que o resto do
 * projeto usa para casar pessoa por e-mail (o índice único de `thb_alunos` é
 * em `lower(trim(email))`). O `.in()` é case-sensitive, por isso o casamento
 * final é feito em memória sobre a chave normalizada.
 */
export async function acharAlunosPorEmails(
  emails: (string | null)[],
): Promise<Map<string, Aluno>> {
  const chaves = [
    ...new Set(
      emails
        .map((e) => (e ?? "").trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  ];
  const mapa = new Map<string, Aluno>();
  if (!chaves.length) return mapa;

  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select(COLUNAS_ALUNO_SUGESTAO)
    .in("email", chaves);

  for (const a of (data ?? []) as Aluno[]) {
    const chave = (a.email ?? "").trim().toLowerCase();
    // Primeira linha vence: `thb_alunos` tem único em lower(trim(email)),
    // então empate não deveria existir — mas não sobrescrever mantém o
    // resultado estável se existir.
    if (chave && !mapa.has(chave)) mapa.set(chave, a);
  }
  return mapa;
}

/** Procura um thb_aluno pelo e-mail (para sugerir vínculo na aprovação). */
export async function acharAlunoPorEmail(
  email: string | null,
): Promise<Aluno | null> {
  if (!email) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select(COLUNAS_ALUNO_SUGESTAO)
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
    .select(COLUNAS_CLIENTE)
    .eq("id", clienteId)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

export async function getAgendamentosEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .select(COLUNAS_ETAPA3_AGENDAMENTO)
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
    .select(COLUNAS_ETAPA3_REVISAO)
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
    .select(COLUNAS_PROGRESSO)
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
    .select(COLUNAS_CLIENTE)
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
    .select(COLUNAS_PROGRESSO)
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
}

/** Linha crua de `gps.admin_painel_atendimento()` (migração 20260909000080). */
interface LinhaPainelAtendimento {
  aluno_id: string;
  pendencias_abertas: number;
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
    console.error(
      "[getAtendimentoPorAluno] gps.admin_painel_atendimento() falhou; cards sem resumo do Diário",
      {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    );
    return new Map<string, AtendimentoDoAluno>();
  }

  const linhas = (data ?? []) as LinhaPainelAtendimento[];
  return new Map(
    linhas.map((l) => [
      l.aluno_id,
      {
        pendenciasAbertas: l.pendencias_abertas,
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
