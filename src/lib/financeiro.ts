/**
 * Financeiro do aluno (Fase 7-A) — leitura do contrato do programa.
 *
 * A fonte é `cs.contatos_hm`, tabela do **sip**, lida SÓ pela RPC
 * `gps.financeiro_do_aluno(uuid)` (SECURITY DEFINER, migração
 * `20260909000100_gps_financeiro_do_aluno.sql`). Este módulo **nunca escreve**
 * lá — o portal exibe, a equipe financeira atualiza.
 *
 * 🔴 QUEM VÊ (B7-b): admin e o **titular** do ambiente. O **sócio não vê** — o
 * contrato de pagamento é do titular, o sócio nunca assinou. A guarda de
 * verdade é a da RPC (42501); a guarda daqui é defesa em profundidade, para
 * que uma página futura não vaze extrato por esquecer o redirect.
 *
 * 🔑 ARITMÉTICA (B7-c/B7-d): `creditoValorPago` e `cancelamentoValor` são
 * exibidos e **jamais somados/subtraídos** — a semântica deles é do sip e não
 * está provada aqui. Saldo desconhecido é `null` e a tela diz "não informado";
 * `coalesce(..., 0)` transformaria buraco em número (foi assim que um COALESCE
 * virou "taxa zero" por 5 semanas no sistema de disparos).
 */

import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { logErro, logAviso } from "@/lib/log";

/**
 * Abaixo disto, diferença é ruído de arredondamento — não é dívida nem
 * crédito. Medido no banco em 09/09: há contrato com `valor_pago` 15.000,06
 * contra `valor_total` 15.000,00, ou seja saldo −0,06. Sem esta tolerância a
 * tela mostraria "−R$ 0,06 a pagar" para quem quitou.
 */
export const TOLERANCIA_CENTAVOS = 0.5;

/**
 * Teto do que se espera de uma leitura. Não trunca nada (truncar esconderia
 * contrato); só registra no log se algum dia passar disso — hoje o máximo
 * medido é 1 linha por aluno, 0 duplicados por (aluno, produto).
 */
const CONTRATOS_ESPERADOS = 20;

/** Situação do contrato, derivada uma única vez aqui — a UI não recalcula. */
export type SituacaoContrato =
  /** `cancelamento_em` preenchido. A tela NÃO apresenta saldo a pagar. */
  | "cancelado"
  /** Quitado por data (`quitado_em`) ou porque o saldo zerou/ficou negativo. */
  | "quitado"
  /** Há saldo positivo conhecido. */
  | "em_aberto"
  /** Não dá para saber: sem saldo manual e sem os dois valores da conta. */
  | "indefinido";

export interface ContratoFinanceiro {
  produto: string | null;
  plano: string | null;
  turma: string | null;
  valorTotal: number | null;
  valorPago: number | null;
  /** `null` = não dá para calcular. NUNCA tratar como zero. */
  saldo: number | null;
  /** `true` = veio de `saldo_a_pagar_manual` (a equipe digitou). */
  saldoEManual: boolean;
  creditoValorPago: number | null;
  cancelamentoValor: number | null;
  cancelamentoEm: string | null;
  pagamentoForma: string | null;
  pagamentoParcelas: number | null;
  pagamentoEm: string | null;
  pagamentoPrevistoEm: string | null;
  quitadoEm: string | null;

  // ── Derivados (calculados aqui, no servidor, para as duas telas darem a
  //    MESMA resposta). A UI lê estes campos; não refaz a conta. ──────────

  /** Ver `SituacaoContrato`. */
  situacao: SituacaoContrato;
  /**
   * O saldo que a tela deve mostrar:
   * - `"quitado"` → `0` (nunca "−R$ 0,06");
   * - `"cancelado"` → `null` (contrato cancelado não apresenta saldo a pagar);
   * - `"indefinido"` → `null` → a tela escreve **"não informado"**;
   * - `"em_aberto"` → o valor.
   */
  saldoExibido: number | null;
  /**
   * Só para o **admin**: contrato marcado como quitado cuja aritmética
   * discorda (`valor_total − valor_pago` fora da tolerância). `null` quando
   * não há divergência. O aluno não é o público de uma divergência interna.
   */
  divergenciaQuitacao: number | null;
}

export type ResultadoFinanceiro =
  | { estado: "ok"; contratos: ContratoFinanceiro[] }
  /** 0 linhas — os 31 ambientes sem cadastro em `cs.contatos_hm`. */
  | { estado: "sem_registro" }
  /** 42501 — sócio, outro ambiente, sem sessão. */
  | { estado: "sem_permissao" }
  /** Qualquer outra falha. NUNCA colapsar em `sem_registro`. */
  | { estado: "erro" };

/** Linha crua da RPC `gps.financeiro_do_aluno()`. */
interface LinhaFinanceiro {
  produto: string | null;
  plano: string | null;
  turma: string | null;
  valor_total: number | string | null;
  valor_pago: number | string | null;
  saldo: number | string | null;
  saldo_e_manual: boolean | null;
  credito_valor_pago: number | string | null;
  cancelamento_valor: number | string | null;
  cancelamento_em: string | null;
  pagamento_forma: string | null;
  pagamento_parcelas: number | string | null;
  pagamento_em: string | null;
  pagamento_previsto_em: string | null;
  quitado_em: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `numeric` do Postgres pode chegar como number ou como string (PostgREST
 * serializa number, mas a precisão de `numeric` não é garantida em JS). Aceita
 * os dois e devolve `null` para qualquer coisa que não seja finita — string
 * vazia, `"NaN"`, `Infinity`. Buraco continua buraco: nunca vira 0.
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

/** Derivação de situação/saldo exibido — testável e usada num lugar só. */
function derivar(
  saldo: number | null,
  quitadoEm: string | null,
  canceladoEm: string | null,
): Pick<
  ContratoFinanceiro,
  "situacao" | "saldoExibido" | "divergenciaQuitacao"
> {
  const zerado = saldo !== null && saldo <= TOLERANCIA_CENTAVOS;

  if (canceladoEm !== null) {
    return {
      situacao: "cancelado",
      saldoExibido: null,
      divergenciaQuitacao: null,
    };
  }

  if (quitadoEm !== null || zerado) {
    // Marcado como quitado mas a conta ainda aponta dívida (ou crédito) acima
    // do ruído de centavos: o admin precisa ver o número; o aluno, não.
    const divergencia =
      quitadoEm !== null && saldo !== null && Math.abs(saldo) > TOLERANCIA_CENTAVOS
        ? saldo
        : null;
    return { situacao: "quitado", saldoExibido: 0, divergenciaQuitacao: divergencia };
  }

  if (saldo === null) {
    return {
      situacao: "indefinido",
      saldoExibido: null,
      divergenciaQuitacao: null,
    };
  }

  return { situacao: "em_aberto", saldoExibido: saldo, divergenciaQuitacao: null };
}

/**
 * Extrato do contrato do ambiente `alunoId`. Uma entrada por REGISTRO de
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

  // Defesa em profundidade. A fronteira é a guarda da RPC (42501); esta aqui
  // evita a ida ao banco e garante que nenhuma página nova exponha extrato por
  // esquecer o redirect. Barato: getContextoSessao é memoizado por requisição.
  const ctx = await getContextoSessao();
  const podeVer =
    ctx?.papel === "admin" ||
    (ctx?.papel === "aluno" &&
      ctx.papelMembro === "titular" &&
      ctx.alunoId === alunoId);
  if (!podeVer) return { estado: "sem_permissao" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("financeiro_do_aluno", { p_aluno_id: alunoId });

  if (error) {
    if (error.code === "42501") return { estado: "sem_permissao" };
    // Sem alunoId no log: identificador de ambiente é dado de pessoa. O código
    // do erro é o que serve para depurar.
    logErro("getFinanceiroDoAluno", error, {
      rpc: "gps.financeiro_do_aluno",
    });
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
    const cancelamentoEm = l.cancelamento_em ?? null;
    const quitadoEm = l.quitado_em ?? null;
    return {
      produto: l.produto ?? null,
      plano: l.plano ?? null,
      turma: l.turma ?? null,
      valorTotal: num(l.valor_total),
      valorPago: num(l.valor_pago),
      saldo,
      saldoEManual: l.saldo_e_manual === true,
      creditoValorPago: num(l.credito_valor_pago),
      cancelamentoValor: num(l.cancelamento_valor),
      cancelamentoEm,
      pagamentoForma: l.pagamento_forma ?? null,
      pagamentoParcelas: inteiro(l.pagamento_parcelas),
      pagamentoEm: l.pagamento_em ?? null,
      pagamentoPrevistoEm: l.pagamento_previsto_em ?? null,
      quitadoEm,
      ...derivar(saldo, quitadoEm, cancelamentoEm),
    };
  });

  return { estado: "ok", contratos };
}
