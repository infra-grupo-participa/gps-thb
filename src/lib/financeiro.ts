/**
 * Financeiro do aluno v2 — "Meu progresso financeiro" (09/09/2026).
 *
 * A aba é o **painel de progresso do aluno na mentoria**, não um extrato frio.
 * Duas perguntas, duas fontes que não se misturam:
 *
 * 1. **Quanto EU faturei** — honorários dos clientes em `fase='contratado'`,
 *    do banco do GPS (`gps.etapa1_clientes`). Meta R$ 150.000 = o **AURUM**,
 *    o objetivo do programa e a única régua da tela. Vive em
 *    `progressoFaturamento` (`@/lib/etapa1`), reexportado aqui.
 * 2. **Quanto EU devo do programa** — contrato com o Grupo Participa, lido do
 *    **sip** por `gps.financeiro_do_aluno` e `gps.financeiro_extrato_do_aluno`
 *    (migração `20260909000140`). Este módulo **nunca escreve** lá.
 *
 * 🔴 QUEM VÊ o item 2 (B7-b): admin e o **titular** do ambiente. O **sócio não
 * vê** — o contrato de pagamento é do titular, o sócio nunca assinou. A guarda
 * de verdade é a da RPC (42501, `gps.financeiro_pode_ler`); a daqui é defesa em
 * profundidade, para que uma página futura não vaze extrato por esquecer o
 * redirect. O item 1 NÃO tem essa trava: honorário é do ambiente e o sócio já
 * vê a aba Clientes inteira.
 *
 * 🔑 ARITMÉTICA (B7-c/B7-d): `credito` é exibido e **jamais somado/subtraído** —
 * a semântica dele é do sip e não está provada aqui. Valor que o sip não sabe
 * chega `null` e a tela diz "não informado"; `?? 0` transformaria buraco em
 * número (foi assim que um COALESCE virou "taxa zero" plausível por 5 semanas
 * no sistema de disparos).
 *
 * 🔑 A UI NÃO REFAZ CONTA. `situacao`, `saldoExibido`, `pagoPct` e
 * `divergenciaQuitacao` são derivados AQUI, uma vez, para a tela do aluno e a
 * do admin darem a MESMA resposta.
 */

import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { getClientesHonorarios } from "@/lib/data/clientes";
import { progressoFaturamento } from "@/lib/etapa1";
import { logErro, logAviso } from "@/lib/log";

export type {
  ProgressoFaturamento,
  ContratadoResumo,
  NivelFaturamento,
} from "@/lib/etapa1";

/*
 * `progressoFaturamento` NÃO é reexportada daqui (war-room 10/09): o reexporte
 * tinha ZERO consumidores — quem usa a conta importa de `@/lib/etapa1`, que é
 * puro e serve também ao client (`MetaHonorarios`). Este módulo importa
 * `@/lib/supabase/server`, então reexportar por aqui só oferecia um caminho
 * que puxa o SDK do Supabase para o bundle de quem se enganar. A função
 * continua sendo usada INTERNAMENTE, no import da linha 36.
 */

/**
 * Abaixo disto, diferença é ruído de arredondamento — não é dívida nem
 * crédito. Medido em 09/09: há contrato com pago 15.000,06 contra total
 * 15.000,00. Sem esta tolerância a tela mostraria "−R$ 0,06 a pagar" para quem
 * quitou.
 */
const TOLERANCIA_CENTAVOS = 0.5;

/**
 * Teto do que se espera de uma leitura de contratos. Não trunca nada (truncar
 * esconderia contrato); só registra no log se algum dia passar disso — hoje o
 * máximo medido é 1 linha por aluno.
 */
const CONTRATOS_ESPERADOS = 20;

/**
 * Teto do extrato, imposto no SQL (`limit 200`). O SQL ordena por `pago_em`
 * DESC, então o corte perde o pagamento MAIS ANTIGO, nunca o mais recente.
 * Medido em 09/09: 232 pagamentos no sistema inteiro — ninguém é truncado hoje.
 */
const TETO_EXTRATO = 200;

/**
 * Situação do contrato, derivada uma única vez aqui — a UI não recalcula.
 *
 * O mapa vem da regra do sip (`situacao` + `status_parcela` de
 * `cs.vw_hm_financeiro`), medido em 09/09:
 *   situacao       → quitado(64) mensalidade_em_curso(27) saldo_parado(3)
 *                    cancelado(1) incalculavel(1)
 *   status_parcela → quitado(64) aguardando(26) em_dia(5) atrasado(1)
 */
export type SituacaoContrato =
  /** `cancelado` do sip ou `cancelamento_em` preenchido. Não apresenta saldo. */
  | "cancelado"
  /** Quitado pela regra do sip. */
  | "quitado"
  /** Inadimplente ou parcela atrasada — é o único estado que pede ação. */
  | "atrasado"
  /** Mensalidade em curso / aguardando cobrança: nada a fazer agora. */
  | "em_dia"
  /**
   * `incalculavel`, contrato sem linha na view, ou tudo nulo. A tela escreve
   * "Não informado" — **nunca** "Em dia", que seria afirmar solvência sem base.
   */
  | "indefinido";

export interface ContratoFinanceiro {
  /**
   * Identificador OPACO do contrato no sip (`cs.contatos_hm.id` como texto).
   * Serve para a linha técnica do admin e para casar as linhas do extrato com
   * o contrato. Não é para exibir ao aluno.
   */
  contatoHmId: string | null;
  produto: string | null;
  plano: string | null;
  turma: string | null;

  // ── A regra do sip (fonte de verdade financeira) ─────────────────────────
  /** `pacote_regra`: quanto o programa custa pela regra do sip. */
  valorPrograma: number | null;
  pago: number | null;
  /** `saldo_a_perseguir`: o que a régua de cobrança ainda persegue. */
  saldo: number | null;
  /** B7-c: exibido rotulado, NUNCA somado a nada. */
  credito: number | null;
  parcelasPagas: number | null;
  parcelasContratadas: number | null;
  valorParcela: number | null;
  quitado: boolean | null;
  cancelado: boolean | null;
  inadimplente: boolean | null;
  /** `situacao` crua do sip — só para diagnóstico do admin. */
  situacaoSip: string | null;
  /** `status_parcela` cru do sip — só para diagnóstico do admin. */
  statusParcela: string | null;
  /** "YYYY-MM-DD" no fuso de São Paulo (o SQL já devolve `date`). */
  proximaCobrancaEm: string | null;
  ultimoPagamentoEm: string | null;
  entradaValor: number | null;
  entradaPagoEm: string | null;
  cancelamentoEm: string | null;

  // ── Derivados (calculados aqui, no servidor) ─────────────────────────────

  /** Ver `SituacaoContrato`. */
  situacao: SituacaoContrato;
  /**
   * O saldo que a tela deve mostrar:
   * - `"cancelado"` → `null` (contrato cancelado não apresenta saldo a pagar);
   * - `"quitado"`   → `0` (nunca "−R$ 0,06");
   * - demais        → o saldo como está, **`null` continua `null`** e a tela
   *   escreve "não informado" (B7-d).
   */
  saldoExibido: number | null;
  /**
   * Percentual pago, 0–100, **pronto para a barra**: `pago_pct` do sip quando
   * existe; senão calculado de `pago / valorPrograma`; `null` quando não dá
   * para saber — e aí a tela mostra frase, não uma barra de 0%, que afirmaria
   * "você não pagou nada".
   */
  pagoPct: number | null;
  /**
   * Só para o **admin**: contrato apresentado como quitado cuja aritmética
   * discorda (`saldo` fora da tolerância), **nos dois sentidos** (FN1):
   * positivo → dito quitado com dívida na conta; negativo → pagou acima do
   * total. `null` quando não há divergência. Para o aluno o contrato continua
   * "Quitado" — quem precisa do número é quem vai conferir com o financeiro.
   */
  divergenciaQuitacao: number | null;
  /**
   * `true` quando o contrato existe em `cs.contatos_hm` mas **não tem linha**
   * em `cs.vw_hm_financeiro` (o `left join` da RPC). É lacuna de cadastro no
   * sip, não bug do portal — e o admin precisa enxergar isso escrito, senão a
   * lacuna fica invisível para sempre.
   */
  semRegistroSip: boolean;
}

export type ResultadoFinanceiro =
  | { estado: "ok"; contratos: ContratoFinanceiro[] }
  /** 0 linhas — os 31 ambientes sem cadastro em `cs.contatos_hm`. */
  | { estado: "sem_registro" }
  /** 42501 — sócio, outro ambiente, sem sessão. */
  | { estado: "sem_permissao" }
  /** Qualquer outra falha. NUNCA colapsar em `sem_registro`. */
  | { estado: "erro" };

/** Uma linha do extrato de pagamentos (`cs.vw_hm_extrato`). */
export interface LinhaExtrato {
  /**
   * Casa com `ContratoFinanceiro.contatoHmId`. Não é anulável: a linha vem de
   * um `join` pela CHAVE de `cs.contatos_hm`, então todo pagamento tem dono.
   */
  contatoHmId: string;
  /** `sinal` | `mensalidade` | `saldo` | `compra_cheia` — cru; a UI rotula. */
  categoria: string | null;
  /**
   * Número da parcela, quando o sip gravou um número. A RPC devolve `text`
   * (o sip pode gravar "1/12", e `::integer` sobre isso seria 22P02 em
   * runtime); aqui vira número só quando é número de verdade — senão `null`,
   * e a UI escreve "Parcela" sem inventar um índice.
   */
  parcela: number | null;
  valor: number | null;
  /** "YYYY-MM-DD" no fuso de São Paulo. */
  pagoEm: string | null;
  /** `CREDIT_CARD`, `PIX`, `BILLET`… cru; a UI traduz e cai no texto cru. */
  metodoPagamento: string | null;
}

export type ResultadoExtrato =
  | {
      estado: "ok";
      linhas: LinhaExtrato[];
      /** `true` quando bateu o teto de 200 — a UI avisa em vez de somar. */
      truncado: boolean;
    }
  /** Contrato existe, pagamento nenhum registrado. */
  | { estado: "sem_registro" }
  | { estado: "sem_permissao" }
  | { estado: "erro" };

/** Linha crua de `gps.financeiro_do_aluno()`. */
interface LinhaFinanceiro {
  contato_hm_id: string | null;
  produto: string | null;
  plano: string | null;
  turma: string | null;
  valor_programa: number | string | null;
  pago: number | string | null;
  saldo: number | string | null;
  credito: number | string | null;
  parcelas_pagas: number | string | null;
  parcelas_contratadas: number | string | null;
  valor_parcela: number | string | null;
  pago_pct: number | string | null;
  quitado: boolean | null;
  cancelado: boolean | null;
  inadimplente: boolean | null;
  situacao: string | null;
  status_parcela: string | null;
  proxima_cobranca_em: string | null;
  ultimo_pagamento_em: string | null;
  entrada_valor: number | string | null;
  entrada_pago_em: string | null;
  cancelamento_em: string | null;
}

/** Linha crua de `gps.financeiro_extrato_do_aluno()`. */
interface LinhaExtratoBruta {
  contato_hm_id: string | null;
  categoria: string | null;
  parcela: string | null;
  valor: number | string | null;
  pago_em: string | null;
  metodo_pagamento: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `numeric` do Postgres pode chegar como number ou como string (a precisão de
 * `numeric` não é garantida em JS). Aceita os dois e devolve `null` para
 * qualquer coisa que não seja finita — string vazia, `"NaN"`, `Infinity`.
 * Buraco continua buraco: nunca vira 0.
 */
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function inteiro(v: number | string | null | undefined): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

function texto(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** `true` para o booleano do sip; `null`/`false` não afirmam nada. */
function verdadeiro(v: boolean | null | undefined): boolean {
  return v === true;
}

/**
 * Situação + saldo exibido + divergência, derivados num lugar só.
 *
 * A ordem dos ramos é a regra: cancelado ganha de tudo (contrato morto não tem
 * dívida a cobrar na tela), quitado ganha de atraso (parcela atrasada num
 * contrato já quitado é resíduo de cadastro), e o que sobra sem informação cai
 * em `indefinido` — **jamais** em `em_dia`, que seria afirmar solvência sem
 * base.
 */
function derivar(
  l: LinhaFinanceiro,
  saldo: number | null,
): Pick<
  ContratoFinanceiro,
  "situacao" | "saldoExibido" | "divergenciaQuitacao"
> {
  const cancelado = verdadeiro(l.cancelado) || l.cancelamento_em !== null;
  if (cancelado) {
    return {
      situacao: "cancelado",
      saldoExibido: null,
      divergenciaQuitacao: null,
    };
  }

  const situacaoSip = texto(l.situacao);
  const statusParcela = texto(l.status_parcela);

  if (
    verdadeiro(l.quitado) ||
    situacaoSip === "quitado" ||
    statusParcela === "quitado"
  ) {
    // A divergência sai nos DOIS sentidos (FN1): o ramo do saldo negativo era
    // dinheiro de gente que não aparecia em lugar nenhum, nem para o admin.
    const divergencia =
      saldo !== null && Math.abs(saldo) > TOLERANCIA_CENTAVOS ? saldo : null;
    return {
      situacao: "quitado",
      saldoExibido: 0,
      divergenciaQuitacao: divergencia,
    };
  }

  if (verdadeiro(l.inadimplente) || statusParcela === "atrasado") {
    return { situacao: "atrasado", saldoExibido: saldo, divergenciaQuitacao: null };
  }

  if (
    situacaoSip === "mensalidade_em_curso" ||
    statusParcela === "em_dia" ||
    statusParcela === "aguardando"
  ) {
    return { situacao: "em_dia", saldoExibido: saldo, divergenciaQuitacao: null };
  }

  // `incalculavel`, `saldo_parado` sem status de parcela, contrato sem linha na
  // view: o portal não sabe. Dizer "não informado" é a única resposta honesta.
  return {
    situacao: "indefinido",
    saldoExibido: saldo,
    divergenciaQuitacao: null,
  };
}

/**
 * Percentual pronto para a barra. `pago_pct` do sip quando existe; senão a
 * conta local; `null` quando não dá — e a tela mostra frase, não barra de 0%.
 * A conta local só roda com `valorPrograma > 0`: dividir por zero (ou por
 * `null`) produziria `Infinity`/`NaN` e uma barra cheia sem significado.
 */
function derivarPct(
  pagoPct: number | null,
  pago: number | null,
  valorPrograma: number | null,
): number | null {
  if (pagoPct !== null) return Math.max(0, Math.min(100, pagoPct));
  if (pago === null || valorPrograma === null || valorPrograma <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((pago / valorPrograma) * 100)));
}

/**
 * Quanto o contrato pagou ACIMA do pacote — só quando isso é fato, nunca
 * ruído de arredondamento (decisão do Marcio, 09/09: "ele vê que pagou os
 * 15k, mas a equipe vê que ele tem 18k pagos").
 *
 * É o MESMO número de `divergenciaQuitacao`, só que com nome e sinal que
 * dizem o que é: `divergenciaQuitacao` é fatia interna, pensada para os DOIS
 * sentidos (FN1); esta função existe para quem só quer responder "pagou a
 * mais?" sem reler o comentário do sinal. `null` quando não há excedente —
 * inclui contrato não quitado, contrato sem `divergenciaQuitacao` e a
 * divergência POSITIVA (quitado com dívida na conta, que é o problema
 * oposto: falta dinheiro, não sobra).
 *
 * Só para o admin: o aluno já vê "Quitado, R$ 0,00" e continua vendo — esta
 * função não é chamada na tela dele.
 */
export function excedentePago(
  contrato: Pick<ContratoFinanceiro, "situacao" | "divergenciaQuitacao">,
): number | null {
  if (contrato.situacao !== "quitado") return null;
  if (contrato.divergenciaQuitacao === null) return null;
  return contrato.divergenciaQuitacao < 0 ? -contrato.divergenciaQuitacao : null;
}

/**
 * Guarda TS do Financeiro do programa (defesa em profundidade da guarda da
 * RPC). Um lugar só, para as duas leituras (contrato e extrato) não poderem
 * divergir — alargar uma e esquecer a outra é como guarda de dinheiro vaza.
 */
async function podeVerFinanceiro(alunoId: string): Promise<boolean> {
  // Barato: `getContextoSessao` é memoizado por requisição (`cache()`).
  const ctx = await getContextoSessao();
  return (
    ctx?.papel === "admin" ||
    (ctx?.papel === "aluno" &&
      ctx.papelMembro === "titular" &&
      ctx.alunoId === alunoId)
  );
}

/**
 * Contrato do programa do ambiente `alunoId`. Uma entrada por REGISTRO de
 * `cs.contatos_hm` — nunca uma soma por aluno (há produtos diferentes na mesma
 * tabela; somar misturaria o dinheiro de dois contratos).
 *
 * Estados são distintos de propósito: `sem_registro` (o cadastro não existe) e
 * `erro` (o banco falhou) produzem telas diferentes. Colapsar os dois faria uma
 * falha de infraestrutura aparecer como "este aluno não tem financeiro" — a
 * tela mentiria com cara de normalidade.
 */
export async function getFinanceiroDoAluno(
  alunoId: string,
): Promise<ResultadoFinanceiro> {
  if (typeof alunoId !== "string" || !UUID_RE.test(alunoId)) {
    logErro("getFinanceiroDoAluno", "alunoId invalido", {
      tipo: typeof alunoId,
      tamanho: typeof alunoId === "string" ? alunoId.length : null,
    });
    return { estado: "erro" };
  }

  if (!(await podeVerFinanceiro(alunoId))) return { estado: "sem_permissao" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("financeiro_do_aluno", { p_aluno_id: alunoId });

  if (error) {
    if (error.code === "42501") return { estado: "sem_permissao" };
    // Sem alunoId no log: identificador de ambiente é dado de pessoa. O código
    // do erro é o que serve para depurar.
    logErro("getFinanceiroDoAluno", error, { rpc: "gps.financeiro_do_aluno" });
    return { estado: "erro" };
  }

  const linhas = (data ?? []) as LinhaFinanceiro[];
  if (linhas.length === 0) return { estado: "sem_registro" };
  if (linhas.length > CONTRATOS_ESPERADOS) {
    logAviso(
      "getFinanceiroDoAluno",
      "mais contratos que o esperado; nada foi truncado",
      { qtd: linhas.length, esperado: CONTRATOS_ESPERADOS },
    );
  }

  const contratos: ContratoFinanceiro[] = linhas.map((l) => {
    const saldo = num(l.saldo);
    const pago = num(l.pago);
    const valorPrograma = num(l.valor_programa);
    const situacaoSip = texto(l.situacao);
    const statusParcela = texto(l.status_parcela);

    return {
      contatoHmId: texto(l.contato_hm_id),
      produto: texto(l.produto),
      plano: texto(l.plano),
      turma: texto(l.turma),
      valorPrograma,
      pago,
      saldo,
      credito: num(l.credito),
      parcelasPagas: inteiro(l.parcelas_pagas),
      parcelasContratadas: inteiro(l.parcelas_contratadas),
      valorParcela: num(l.valor_parcela),
      quitado: l.quitado ?? null,
      cancelado: l.cancelado ?? null,
      inadimplente: l.inadimplente ?? null,
      situacaoSip,
      statusParcela,
      proximaCobrancaEm: l.proxima_cobranca_em ?? null,
      ultimoPagamentoEm: l.ultimo_pagamento_em ?? null,
      entradaValor: num(l.entrada_valor),
      entradaPagoEm: l.entrada_pago_em ?? null,
      cancelamentoEm: l.cancelamento_em ?? null,
      pagoPct: derivarPct(num(l.pago_pct), pago, valorPrograma),
      // Sem NENHUMA coluna da view: o `left join` não achou linha. É lacuna de
      // cadastro no sip, e o card diz isso ao admin em vez de fingir contrato.
      semRegistroSip:
        situacaoSip === null &&
        statusParcela === null &&
        valorPrograma === null &&
        pago === null &&
        saldo === null,
      ...derivar(l, saldo),
    };
  });

  return { estado: "ok", contratos };
}

/**
 * Extrato de pagamentos do programa — a prova por trás do acumulado.
 *
 * Mesma guarda do contrato: o sócio recebe `sem_permissao` (B7-b). A ordem é
 * do MAIS RECENTE para o mais antigo (imposta no SQL), porque o teto de 200 tem
 * de cortar o pagamento velho, nunca o de ontem.
 */
export async function getExtratoDoAluno(
  alunoId: string,
): Promise<ResultadoExtrato> {
  if (typeof alunoId !== "string" || !UUID_RE.test(alunoId)) {
    logErro("getExtratoDoAluno", "alunoId invalido", {
      tipo: typeof alunoId,
      tamanho: typeof alunoId === "string" ? alunoId.length : null,
    });
    return { estado: "erro" };
  }

  if (!(await podeVerFinanceiro(alunoId))) return { estado: "sem_permissao" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("financeiro_extrato_do_aluno", { p_aluno_id: alunoId });

  if (error) {
    if (error.code === "42501") return { estado: "sem_permissao" };
    logErro("getExtratoDoAluno", error, {
      rpc: "gps.financeiro_extrato_do_aluno",
    });
    return { estado: "erro" };
  }

  const brutas = (data ?? []) as LinhaExtratoBruta[];
  if (brutas.length === 0) return { estado: "sem_registro" };

  const linhas: LinhaExtrato[] = brutas.map((l) => ({
    // `?? ""` é inalcançável (o id é PK do lado interno do join) e existe só
    // para o tipo não mentir: uma chave vazia erra o `produtoPorContrato` e a
    // UI mostra "—", em vez de quebrar num índice nulo.
    contatoHmId: texto(l.contato_hm_id) ?? "",
    categoria: texto(l.categoria),
    parcela: inteiro(l.parcela),
    valor: num(l.valor),
    pagoEm: l.pago_em ?? null,
    metodoPagamento: texto(l.metodo_pagamento),
  }));

  const truncado = linhas.length >= TETO_EXTRATO;
  if (truncado) {
    logAviso("getExtratoDoAluno", "extrato no teto; linhas antigas omitidas", {
      qtd: linhas.length,
      teto: TETO_EXTRATO,
    });
  }

  return { estado: "ok", linhas, truncado };
}

/**
 * Progresso de faturamento do ambiente (meta de R$ 150.000 — o AURUM).
 *
 * ⚠️ **Sem a trava do titular de propósito.** Isto não é o contrato do
 * programa: são os honorários dos clientes DO AMBIENTE, que o sócio já vê
 * inteiros na aba Clientes. A barreira aqui é a RLS de `gps.etapa1_clientes`,
 * que já limita cada um ao próprio ambiente — pedir o progresso de um ambiente
 * alheio devolve lista vazia, não dado de outro.
 *
 * A conta é `progressoFaturamento` (`@/lib/etapa1`), a MESMA que a home e a aba
 * Clientes usam. Se fosse refeita aqui, o aluno veria dois números para a mesma
 * pergunta.
 */
export async function getProgressoFaturamento(alunoId: string) {
  if (typeof alunoId !== "string" || !UUID_RE.test(alunoId)) {
    logErro("getProgressoFaturamento", "alunoId invalido", {
      tipo: typeof alunoId,
      tamanho: typeof alunoId === "string" ? alunoId.length : null,
    });
    return progressoFaturamento([]);
  }
  return progressoFaturamento(await getClientesHonorarios(alunoId));
}
