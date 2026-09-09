import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { resumoEtapa1 } from "@/lib/etapa1";
import { logErro } from "@/lib/log";
import type { Aluno, Ambiente, Membro } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Aluno, ambiente, membros e o PAINEL do admin (`/admin`).
//
// "Ambiente" = a linha de `gps.membros` por `aluno_id`; um ambiente tem um
// titular e pode ter sócios. O painel lê a RPC agregada
// `gps.admin_painel_alunos()` (SECURITY DEFINER, já barra não-admin).
//
// Recortado de `src/lib/data.ts` (CD5) sem mudança de comportamento: as
// mesmas consultas, as mesmas colunas explícitas, os mesmos retornos.
// `src/lib/data.ts` reexporta tudo daqui, para os importadores não mudarem.
// ─────────────────────────────────────────────────────────────────────────

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

/**
 * Só a CONTAGEM de membros do ambiente — para responder "este ambiente tem
 * sócio?" sem trazer as linhas (UX8: a prévia "como o aluno vê" esconde a aba
 * Financeiro quando há sócio, ver `assistenciaNavItems` em `src/lib/nav.ts`).
 *
 * `head: true` + `count: "exact"`: nenhuma linha volta pela rede, e o filtro
 * bate no índice `membros_aluno_id_idx`. Quem JÁ carrega os membros na página
 * (chamados, financeiro, perfil do admin) usa `membros.length` e não chama
 * isto — pagar duas idas ao banco pelo mesmo dado é o defeito que
 * `chamados-data.ts` documenta.
 *
 * Memoizada por requisição (`cache()` do React — escopo de REQUISIÇÃO, nada
 * atravessa usuário).
 *
 * Erro → devolve 1 (= ambiente sem sócio), que é o comportamento de antes do
 * UX8: a aba Financeiro continua visível na prévia. Falha aqui não pode
 * esconder informação do admin; a fronteira real do sócio é a RPC.
 */
export const contarMembrosDoAmbiente = cache(
  async function contarMembrosDoAmbiente(alunoId: string): Promise<number> {
    const supabase = await createClient();
    const { count, error } = await supabase
      .schema("gps")
      .from("membros")
      .select("id", { count: "exact", head: true })
      .eq("aluno_id", alunoId);

    if (error) {
      logErro("data/contarMembrosDoAmbiente", error, {
        alunoId,
        efeito: "assume ambiente sem socio (previa mostra Financeiro)",
      });
      return 1;
    }
    return count ?? 1;
  },
);
export interface AlunoGps {
  alunoId: string;
  temLogin: boolean;
  qtdMembros: number;
  aluno: Aluno | null;
  pct: number;
  clientesPreenchidos: number;
  /** Clientes com nome, telefone e nível preenchidos — o número que a tarefa 1 cobra (PL3). */
  clientesComDados: number;
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
    logErro("getAlunosGps", error, {
      rpc: "gps.admin_painel_alunos",
      efeito: "painel exibe lista vazia",
      limite,
      offset,
    });
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
      clientesComDados: l.clientes_com_dados,
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

