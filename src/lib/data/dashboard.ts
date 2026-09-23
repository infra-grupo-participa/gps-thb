import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import { META_CLIENTES, META_HONORARIOS } from "@/lib/etapa1";
import type { GrauRelacao } from "@/lib/types";
import type { AlunoGps } from "@/lib/data/alunos";
import type { AtendimentoDoAluno } from "@/lib/data/diario";

// ─────────────────────────────────────────────────────────────────────────
// Dashboard executivo de /admin (migração 20260910000209).
//
// 🔑 UMA IDA AO BANCO por abertura de /admin. Nenhum card consulta por conta
// própria — é o defeito que `chamados-data.ts` já documenta.
//
// 🔑 E DOIS dos nove cards NÃO vêm da RPC, de propósito:
//   · `faixasDeTrilha(alunos)` usa o `pct` que `getAlunosGps()` já calculou com
//     `resumoEtapa1`. Reescrever o catálogo de tarefas em SQL criaria um
//     segundo lugar para a MESMA regra divergir;
//   · `resumoAtendimento(...)` usa o Map que `getAtendimentoPorAluno()` já
//     devolve — a RPC `gps.admin_painel_atendimento()` que /admin JÁ chama.
// As duas são funções PURAS, sem I/O: custo zero, e testáveis.
//
// 🔑 PII MÍNIMA no retorno da RPC: nome e id do parceiro no ranking
//    (`parceiros.itens`). Todo o RESTO continua sendo só contagem, soma e
//    data. Até 23/09/2026 este cabeçalho prometia "ZERO PII, nem `aluno_id`",
//    e a promessa deixou de valer por decisão do Marcio: o ranking sem nome
//    não responde "quem são os 10 parceiros parados", que é a pergunta que
//    ele resolve. O nome vem de `public.thb_alunos.nome`, a mesma fonte que
//    `getAlunoById` já usa. Nada de e-mail, telefone ou dado de cliente.
// ─────────────────────────────────────────────────────────────────────────

export interface DashboardReferencia {
  fuso: string;
  /** Data local (America/Sao_Paulo) em que o dashboard foi gerado. */
  hoje: string;
  /**
   * Dia do mês. A tela é OBRIGADA a escrever "até o dia N" ao lado da
   * variação: sem isso, todo dia 1º o painel anunciaria −95% e alguém tomaria
   * decisão em cima disso.
   */
  dia: number;
  mes: string;
  mesAnterior: string;
}

export interface DashboardPrograma {
  /** Ambientes no programa (distintos em `gps.membros`). */
  total: number;
  /** Titulares que entraram no mês corrente. */
  noMes: number;
  /** Titulares que entraram no mês anterior ATÉ O MESMO DIA. */
  noMesAnteriorAteODia: number;
  porMes: { mes: string; qtd: number }[];
}

export interface DashboardAcesso {
  total: number;
  comLogin: number;
  semLogin: number;
  /** Tem login e `last_sign_in_at` nulo — nunca entrou. */
  nuncaEntraram: number;
  semAcesso30d: number;
  ativos30d: number;
}

export interface DashboardOnboarding {
  /** Denominador: PESSOAS com cadastro vinculado (o questionário é da pessoa). */
  pessoas: number;
  concluidos: number;
  emAndamento: number;
  /** Derivado: `pessoas - concluidos - emAndamento`, nunca negativo. */
  naoIniciados: number;
  concluidosNoMes: number;
  /** Em andamento há mais de 7 dias sem tocar — a fila da equipe. */
  parados7d: number;
  comCliente1: number;
  emExecucao: number;
}

export interface DashboardClientes {
  total: number;
  prospeccao: number;
  fechamento: number;
  contratado: number;
  noMes: number;
  noMesAnteriorAteODia: number;
}

export interface DashboardHonorarios {
  clientesContratados: number;
  contratadosSemValor: number;
  ambientesComContratado: number;
  /**
   * `null` = nenhum contratado com valor registrado. **Nunca exibir como
   * R$ 0,00** — `coalesce(total, 0)` transformaria buraco em resultado.
   */
  totalReais: number | null;
  /**
   * Quantos AMBIENTES bateram `META_HONORARIOS` (o **AURUM**, o próximo nível
   * do programa — o dashboard chamava isso de "Áureo", que estava errado; o
   * cálculo não mudou). Calculado aqui, com
   * a constante que já existe: a meta é POR AMBIENTE, e somar 158 × 150k para
   * inventar uma "meta do programa" seria número inventado.
   */
  ambientesNoAurum: number;
}

export interface DashboardAtividadeDia {
  dia: string;
  aluno: number;
  equipe: number;
  sistema: number;
}

export interface DashboardGrauRelacao {
  itens: { grau: GrauRelacao; qtd: number }[];
  /**
   * Clientes sem grau informado. Sai SEPARADO e nunca vira uma fatia chamada
   * "Lead": ausência de resposta sobre um terceiro não é um palpite.
   */
  naoInformado: number;
}

/**
 * Quem é quem no sistema, em números (pedido do Marcio, 11/09/2026).
 *
 * 🔑 `sociosAtivos30d` é o número que importa, não `socios`: em 11/09 havia
 * 10 sócios com login e só 4 acessando nos últimos 30 dias. Cadastrar sócio
 * não é o mesmo que ter sócio participando — e a tela precisa dizer isso.
 */
export interface DashboardEquipe {
  titulares: number;
  socios: number;
  sociosAtivos30d: number;
  sociosNuncaEntraram: number;
  /** Titulares/sócios que JÁ abriram o portal ao menos uma vez. */
  titularesJaEntraram: number;
  sociosJaEntraram: number;
  titularesAtivos30d: number;
  /** Tem conta e NUNCA entrou — o mesmo corte do filtro `nunca_entrou`. */
  nuncaEntraram: number;
  /** Ambientes com mais de um membro (titular + sócio dividindo o portal). */
  ambientesCompartilhados: number;
  /** Convites de sócio em aberto, ainda dentro do prazo de 7 dias. */
  convitesPendentes: number;
}

/**
 * Os 4 passos da ficha do cliente, em CONTAGENS PARALELAS.
 *
 * 🔴 NÃO É FUNIL, e por isso não existe taxa de conversão aqui — nem no
 * jsonb da RPC. `ficha-blocos-estado.ts:71-94` trata isso como "N de 4
 * passos" (quantos foram marcados), e `cliente-ficha.tsx:186-188` são três
 * `useState` independentes, sem `disabled` encadeado: dá para marcar
 * `ligacao` sem nunca ter marcado `mensagem`. Logo `estudo` NÃO é
 * subconjunto de `mensagem`, e dividir um pelo outro produz um número falso.
 * Se precisar de funil, encadeie os passos na ficha ANTES.
 */
export interface DashboardPassos {
  mensagem: number;
  estudo: number;
  ligacao: number;
  aderiu: number;
  total: number;
}

/**
 * A cadeia que TEM sequência real (ao contrário de `DashboardPassos`).
 *
 * 🔴 `entrevista` vem de `gps.entrevista_previa`, NUNCA de
 * `etapa1_clientes.entrevista_em` — essa coluna é legado da esteira antiga e
 * vale 0 na base inteira. O nome da coluna velha é mais óbvio que o da
 * tabela nova; trocar zera o número em silêncio.
 */
export interface DashboardCaminho {
  favorito: number;
  entrevista: number;
  reuniao: number;
  aderiu: number;
  prospeccao: number;
  fechamento: number;
  contratado: number;
  comValor: number;
}

/**
 * As 5 réguas da fila da equipe.
 *
 * ⚠️ Os cortes de tempo são DIFERENTES de propósito: `favoritoParado` usa
 * 7 dias (o cliente esfriou) e `semAbrir14d` de `DashboardParceiros` usa 14
 * (o parceiro sumiu). São perguntas distintas — não unificar.
 */
export interface DashboardAtencao {
  favoritoParado: number;
  reuniaoSemEntrevista: number;
  socioPendente: number;
  ambienteSemCliente: number;
  parceiroSemMensagem: number;
}

/** Uma linha do ranking de parceiros. Carrega PII mínima: `alunoId` e `nome`. */
export interface DashboardParceiroItem {
  alunoId: string;
  nome: string;
  clientes: number;
  mensagens: number;
  favoritos: number;
  reunioes: number;
  contratados: number;
  /**
   * `null` = nenhum contratado com valor. **Nunca exibir como R$ 0,00** —
   * mesmo critério de `DashboardHonorarios.totalReais`.
   */
  honorarios: number | null;
  dias: number;
}

/**
 * Ranking de parceiros + agregados.
 *
 * ⚠️ `itens` tem TETO DE 200 LINHAS (hoje são 86). Os agregados abaixo são
 * calculados no banco sobre TODOS os parceiros, não sobre os 200 — somar
 * `itens` no cliente para recalcular a média passaria a mentir no 201º.
 */
export interface DashboardParceiros {
  itens: DashboardParceiroItem[];
  totalParceiros: number;
  /**
   * Média de clientes por parceiro, 1 casa (`round(avg, 1)` do banco).
   *
   * `null` = **nenhum parceiro com cliente** — `avg` de conjunto vazio é
   * `null`, e "média 0" seria afirmação falsa sobre um conjunto que não
   * existe. Mesma regra de `DashboardHonorarios.totalReais` (B7-d): ausência
   * não vira zero. Hoje são 86 parceiros, então é inalcançável — mas o dia em
   * que a tela dissesse "média 0" ninguém desconfiaria do número.
   */
  mediaClientes: number | null;
  maxClientes: number;
  com30OuMais: number;
  semMensagem: number;
  comContratado: number;
  semAbrir14d: number;
}

/**
 * O caminho do parceiro: quantos AMBIENTES alcançaram cada estágio.
 *
 * 🔴 NÃO É FUNIL, e por isso não existe taxa de passagem aqui — nem no jsonb
 * da RPC. Cada número é sobre os mesmos `ambientes`, nunca sobre o estágio
 * anterior. Medido em 23/09/2026: 26 dos 37 que escolheram favorito nunca
 * mandaram mensagem; 11 mandaram mensagem sem ter os 30; 8 marcaram reunião
 * sem favorito; 8 fecharam contrato sem reunião; 11 cadastraram cliente sem
 * ter concluído o onboarding. Logo `escolheuFavorito` NÃO é subconjunto de
 * `mandouMsg`, e dividir um pelo outro daria taxa acima de 100%.
 *
 * ⚠️ `ambientes` conta o MESMO universo que `DashboardPrograma.total` — os
 * dois aparecem na mesma tela e divergir seria um número contradizendo o
 * outro. Se um dia divergirem, o defeito é no SQL (join sem agregar antes
 * multiplica ambiente com sócio), não na tela.
 */
export interface DashboardJornada {
  ambientes: number;
  /** Ambientes em que algum membro já abriu o portal (titular ou sócio). */
  entraram: number;
  onboardingOk: number;
  /** Ambientes com ao menos 1 cliente cadastrado. */
  cadastrou: number;
  /** Ficha completa = nome + telefone. Mesma regra de `parceiros.com30OuMais`. */
  fechou30: number;
  mandouMsg: number;
  escolheuFavorito: number;
  marcouReuniao: number;
  fechouContrato: number;
}

/** Uma semana da série. `semana` é `DD/MM` do início da semana. */
export interface DashboardSerieItem {
  semana: string;
  clientes: number;
  /**
   * 🔴 Estado ATUAL da flag `mensagem_padrao_enviada`, não "mandou naquela
   * semana": a coluna não tem data. Lê-se "dos clientes criados naquela
   * semana, quantos têm a flag hoje" — a mensagem pode ter saído semanas
   * depois, e o número de uma semana antiga pode subir amanhã. A tela precisa
   * dizer isso; é aproximação honesta, não série temporal de envio.
   */
  comMsg: number;
  /** Ambientes distintos que criaram cliente naquela semana (não é login). */
  parceirosAtivos: number;
}

/**
 * Evolução semanal: 10 semanas INTEIRAS, da mais antiga para a mais nova.
 *
 * ⚠️ A última semana é a CORRENTE e está sempre incompleta — é o presente, e
 * não se corrige cortando. `semanaCorrente` traz a chave `DD/MM` dela para a
 * tela marcar "em andamento" em vez de desenhar uma queda que não existe.
 * Comparar por igualdade com `item.semana`.
 */
export interface DashboardSerie {
  itens: DashboardSerieItem[];
  semanaCorrente: string;
}

export interface Dashboard {
  geradoEm: string;
  referencia: DashboardReferencia;
  programa: DashboardPrograma;
  acesso: DashboardAcesso;
  equipe: DashboardEquipe;
  onboarding: DashboardOnboarding;
  clientes: DashboardClientes;
  honorarios: DashboardHonorarios;
  atividade: DashboardAtividadeDia[];
  grauRelacao: DashboardGrauRelacao;
  passos: DashboardPassos;
  caminho: DashboardCaminho;
  atencao: DashboardAtencao;
  parceiros: DashboardParceiros;
  jornada: DashboardJornada;
  serie: DashboardSerie;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * O dashboard de `/admin` — UMA chamada a `gps.admin_dashboard()`.
 *
 * Devolve `null` em falha, e a tela mostra o painel de erro em vez de nove
 * cards zerados: um dashboard todo em zero é indistinguível de um sistema
 * vazio, e é assim que se toma decisão em cima de dado que não existe.
 */
export async function getDashboard(): Promise<Dashboard | null> {
  if (!(await ehAdmin())) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_dashboard");

  if (error) {
    logErro("getDashboard", error, {
      rpc: "gps.admin_dashboard",
      efeito: "painel mostra o bloco de erro, nunca nove cards zerados",
    });
    return null;
  }

  return mapearDashboard((data ?? {}) as Record<string, unknown>);
}

/**
 * Do jsonb da RPC para `Dashboard`. Pura (sem sessão, sem rede) — é o que
 * permite renderizar a Visão geral com um retrato do dado fora do `/admin`.
 */
export function mapearDashboard(d: Record<string, unknown>): Dashboard {
  const ref = (d.referencia ?? {}) as Record<string, unknown>;
  const pro = (d.programa ?? {}) as Record<string, unknown>;
  const ace = (d.acesso ?? {}) as Record<string, unknown>;
  const eqp = (d.equipe ?? {}) as Record<string, unknown>;
  const onb = (d.onboarding ?? {}) as Record<string, unknown>;
  const cli = (d.clientes ?? {}) as Record<string, unknown>;
  const hon = (d.honorarios ?? {}) as Record<string, unknown>;
  const gra = (d.grau_relacao ?? {}) as Record<string, unknown>;
  const pas = (d.passos ?? {}) as Record<string, unknown>;
  const cam = (d.caminho ?? {}) as Record<string, unknown>;
  const ate = (d.atencao ?? {}) as Record<string, unknown>;
  const par = (d.parceiros ?? {}) as Record<string, unknown>;
  const jor = (d.jornada ?? {}) as Record<string, unknown>;
  const ser = (d.serie ?? {}) as Record<string, unknown>;

  const somas = Array.isArray(hon.somas_por_ambiente)
    ? (hon.somas_por_ambiente as unknown[]).map((s) => n(s))
    : [];

  const pessoas = n(onb.pessoas);
  const concluidos = n(onb.concluidos);
  const emAndamento = n(onb.em_andamento);

  return {
    geradoEm: String(d.gerado_em ?? ""),
    referencia: {
      fuso: String(ref.fuso ?? "America/Sao_Paulo"),
      hoje: String(ref.hoje ?? ""),
      dia: n(ref.dia),
      mes: String(ref.mes ?? ""),
      mesAnterior: String(ref.mes_anterior ?? ""),
    },
    programa: {
      total: n(pro.total),
      noMes: n(pro.no_mes),
      noMesAnteriorAteODia: n(pro.no_mes_anterior_ate_o_dia),
      porMes: Array.isArray(pro.por_mes)
        ? (pro.por_mes as { mes?: string; qtd?: number }[]).map((m) => ({
            mes: String(m.mes ?? ""),
            qtd: n(m.qtd),
          }))
        : [],
    },
    acesso: {
      total: n(ace.total),
      comLogin: n(ace.com_login),
      semLogin: n(ace.sem_login),
      nuncaEntraram: n(ace.nunca_entraram),
      semAcesso30d: n(ace.sem_acesso_30d),
      ativos30d: n(ace.ativos_30d),
    },
    equipe: {
      titulares: n(eqp.titulares),
      socios: n(eqp.socios),
      sociosAtivos30d: n(eqp.socios_ativos_30d),
      sociosNuncaEntraram: n(eqp.socios_nunca_entraram),
      titularesJaEntraram: n(eqp.titulares_ja_entraram),
      sociosJaEntraram: n(eqp.socios_ja_entraram),
      titularesAtivos30d: n(eqp.titulares_ativos_30d),
      nuncaEntraram: n(eqp.nunca_entraram),
      ambientesCompartilhados: n(eqp.ambientes_compartilhados),
      convitesPendentes: n(eqp.convites_pendentes),
    },
    onboarding: {
      pessoas,
      concluidos,
      emAndamento,
      naoIniciados: Math.max(pessoas - concluidos - emAndamento, 0),
      concluidosNoMes: n(onb.concluidos_no_mes),
      parados7d: n(onb.parados_7d),
      comCliente1: n(onb.com_cliente1),
      emExecucao: n(onb.em_execucao),
    },
    clientes: {
      total: n(cli.total),
      prospeccao: n(cli.prospeccao),
      fechamento: n(cli.fechamento),
      contratado: n(cli.contratado),
      noMes: n(cli.no_mes),
      noMesAnteriorAteODia: n(cli.no_mes_anterior_ate_o_dia),
    },
    honorarios: {
      clientesContratados: n(hon.clientes_contratados),
      contratadosSemValor: n(hon.contratados_sem_valor),
      ambientesComContratado: n(hon.ambientes_com_contratado),
      totalReais: numeroOuNulo(hon.total_reais),
      ambientesNoAurum: somas.filter((s) => s >= META_HONORARIOS).length,
    },
    atividade: Array.isArray(d.atividade)
      ? (d.atividade as Record<string, unknown>[]).map((a) => ({
          dia: String(a.dia ?? ""),
          aluno: n(a.aluno),
          equipe: n(a.equipe),
          sistema: n(a.sistema),
        }))
      : [],
    grauRelacao: {
      itens: Array.isArray(gra.itens)
        ? (gra.itens as { grau?: string; qtd?: number }[]).map((g) => ({
            grau: g.grau as GrauRelacao,
            qtd: n(g.qtd),
          }))
        : [],
      naoInformado: n(gra.nao_informado),
    },
    passos: {
      mensagem: n(pas.mensagem),
      estudo: n(pas.estudo),
      ligacao: n(pas.ligacao),
      aderiu: n(pas.aderiu),
      total: n(pas.total),
    },
    caminho: {
      favorito: n(cam.favorito),
      entrevista: n(cam.entrevista),
      reuniao: n(cam.reuniao),
      aderiu: n(cam.aderiu),
      prospeccao: n(cam.prospeccao),
      fechamento: n(cam.fechamento),
      contratado: n(cam.contratado),
      comValor: n(cam.com_valor),
    },
    atencao: {
      favoritoParado: n(ate.favorito_parado),
      reuniaoSemEntrevista: n(ate.reuniao_sem_entrevista),
      socioPendente: n(ate.socio_pendente),
      ambienteSemCliente: n(ate.ambiente_sem_cliente),
      parceiroSemMensagem: n(ate.parceiro_sem_mensagem),
    },
    parceiros: {
      itens: Array.isArray(par.itens)
        ? (par.itens as Record<string, unknown>[]).map((p) => ({
            alunoId: String(p.aluno_id ?? ""),
            nome: String(p.nome ?? ""),
            clientes: n(p.clientes),
            mensagens: n(p.mensagens),
            favoritos: n(p.favoritos),
            reunioes: n(p.reunioes),
            contratados: n(p.contratados),
            honorarios: numeroOuNulo(p.honorarios),
            dias: n(p.dias_sem_abrir),
          }))
        : [],
      totalParceiros: n(par.total_parceiros),
      // `numeroOuNulo`, não `n()`: avg de conjunto vazio é null e não pode
      // virar 0 (ver o comentário do campo em DashboardParceiros).
      mediaClientes: numeroOuNulo(par.media_clientes),
      maxClientes: n(par.max_clientes),
      com30OuMais: n(par.com_30_ou_mais),
      semMensagem: n(par.sem_mensagem),
      comContratado: n(par.com_contratado),
      semAbrir14d: n(par.sem_abrir_14d),
    },
    jornada: {
      ambientes: n(jor.ambientes),
      entraram: n(jor.entraram),
      onboardingOk: n(jor.onboarding_ok),
      cadastrou: n(jor.cadastrou),
      fechou30: n(jor.fechou_30),
      mandouMsg: n(jor.mandou_msg),
      escolheuFavorito: n(jor.escolheu_favorito),
      marcouReuniao: n(jor.marcou_reuniao),
      fechouContrato: n(jor.fechou_contrato),
    },
    serie: {
      itens: Array.isArray(ser.itens)
        ? (ser.itens as Record<string, unknown>[]).map((s) => ({
            semana: String(s.semana ?? ""),
            clientes: n(s.clientes),
            comMsg: n(s.com_msg),
            parceirosAtivos: n(s.parceiros_ativos),
          }))
        : [],
      semanaCorrente: String(ser.semana_corrente ?? ""),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Os cards que NÃO custam consulta nova (funções puras sobre o lote que
// `/admin` já carregou: `faixasDeTrilha`, `resumoClientes30` logo abaixo, e
// `resumoAtendimento` mais adiante).
// ─────────────────────────────────────────────────────────────────────────

export type FaixaTrilha = "0" | "1-49" | "50-99" | "100";

export interface FaixaDeTrilha {
  faixa: FaixaTrilha;
  rotulo: string;
  qtd: number;
}

/**
 * Ambientes por faixa de progresso da Etapa 01, a partir do `pct` que
 * `getAlunosGps()` já calculou com `resumoEtapa1`.
 *
 * 🔑 Por que NÃO vem do banco: `pct` mistura tarefas automáticas (derivadas dos
 * clientes) com manuais (`gps.progresso`), e o catálogo de tarefas vive em
 * `src/lib/etapa1.ts`. Reescrevê-lo em SQL criaria um segundo lugar para a
 * mesma regra divergir — e o número da tela do aluno e o do painel têm de ser
 * o mesmo número.
 *
 * ⚠️ Vale sobre o LOTE carregado, como a busca e os filtros do painel (Leitura
 * A). Com 158 ambientes e lote de 200, é a base inteira; a tela diz quantos
 * carregou.
 */
export function faixasDeTrilha(alunos: AlunoGps[]): FaixaDeTrilha[] {
  const contagem: Record<FaixaTrilha, number> = {
    "0": 0,
    "1-49": 0,
    "50-99": 0,
    "100": 0,
  };
  for (const a of alunos) {
    const pct = a.pct;
    if (pct <= 0) contagem["0"] += 1;
    else if (pct < 50) contagem["1-49"] += 1;
    else if (pct < 100) contagem["50-99"] += 1;
    else contagem["100"] += 1;
  }
  return [
    { faixa: "0", rotulo: "Etapa 01: não começou", qtd: contagem["0"] },
    { faixa: "1-49", rotulo: "Até a metade", qtd: contagem["1-49"] },
    { faixa: "50-99", rotulo: "Passou da metade", qtd: contagem["50-99"] },
    { faixa: "100", rotulo: "Etapa 01 concluída (declarado)", qtd: contagem["100"] },
  ];
}

export interface ResumoClientes30 {
  /** `clientesComDados === 0` — nem começou a ficha. */
  semNenhumCliente: number;
  /** `0 < clientesComDados < META_CLIENTES` — começou, não fechou. */
  noMeioDos30: number;
  /** `clientesComDados >= META_CLIENTES` — fato observável, não depende de
   * o parceiro marcar tarefa nenhuma. */
  fecharamOs30: number;
}

/**
 * O card 6 da Visão geral (consertado em 15/09/2026): substitui "Etapa 01
 * concluída" (`pct === 100`, que depende do parceiro MARCAR a tarefa manual
 * — quase ninguém marca, então o card sempre mostrava 0) por "Fecharam os 30
 * clientes", um FATO que `gps.etapa1_clientes` já observa.
 *
 * 🔑 MESMO predicado de `clientesComDados`/`comDados` que decide a trava da
 * fase Inicial (`src/lib/etapa1.ts`) e o filtro `listou30` da lista — os
 * três não podem divergir na definição de "fechou os 30".
 *
 * ⚠️ Vale sobre o LOTE carregado, mesma Leitura A de `faixasDeTrilha`.
 */
export function resumoClientes30(alunos: AlunoGps[]): ResumoClientes30 {
  let semNenhumCliente = 0;
  let noMeioDos30 = 0;
  let fecharamOs30 = 0;
  for (const a of alunos) {
    if (a.clientesComDados === 0) semNenhumCliente += 1;
    else if (a.clientesComDados < META_CLIENTES) noMeioDos30 += 1;
    else fecharamOs30 += 1;
  }
  return { semNenhumCliente, noMeioDos30, fecharamOs30 };
}

export interface ResumoAtendimento {
  pendenciasAbertas: number;
  ambientesComPendencia: number;
  chamadosAbertos: number;
  ambientesComChamado: number;
  /** Ambientes carregados sem NENHUMA nota no Diário. */
  semNenhumaNota: number;
  /** Ambientes que não acessam há 30 dias ou mais (inclui quem nunca entrou). */
  semAcesso30d: number;
}

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * O card "Atendimento", montado a partir do que `/admin` JÁ carregou:
 * o Map de `getAtendimentoPorAluno()` e a lista de `getAlunosGps()`.
 * Zero consulta nova — o crédito de otimização desta frente.
 */
export function resumoAtendimento(
  alunos: AlunoGps[],
  atendimento: Map<string, AtendimentoDoAluno> | Record<string, AtendimentoDoAluno>,
): ResumoAtendimento {
  const mapa =
    atendimento instanceof Map
      ? atendimento
      : new Map(Object.entries(atendimento));

  let pendenciasAbertas = 0;
  let ambientesComPendencia = 0;
  let chamadosAbertos = 0;
  let ambientesComChamado = 0;
  let semNenhumaNota = 0;
  let semAcesso30d = 0;

  const corte = Date.now() - TRINTA_DIAS_MS;

  for (const a of alunos) {
    const at = mapa.get(a.alunoId);
    const pend = at?.pendenciasAbertas ?? 0;
    const cham = at?.chamadosAbertos ?? 0;
    pendenciasAbertas += pend;
    if (pend > 0) ambientesComPendencia += 1;
    chamadosAbertos += cham;
    if (cham > 0) ambientesComChamado += 1;
    // `ultimaNotaEm` nulo (ou ambiente ausente do Map) = nenhuma nota.
    if (!at?.ultimaNotaEm) semNenhumaNota += 1;
    // `null` = NUNCA entrou, e isso conta como "sem acesso" — é justamente
    // quem a equipe precisa alcançar primeiro.
    if (!a.ultimoAcesso || new Date(a.ultimoAcesso).getTime() < corte) {
      semAcesso30d += 1;
    }
  }

  return {
    pendenciasAbertas,
    ambientesComPendencia,
    chamadosAbertos,
    ambientesComChamado,
    semNenhumaNota,
    semAcesso30d,
  };
}
