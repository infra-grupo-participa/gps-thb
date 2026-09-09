import {
  Ban,
  CalendarCheck,
  CircleCheck,
  CircleHelp,
  Info,
  TriangleAlert,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarDataSoDia } from "@/lib/datas";
import { brl, brlInteiro } from "@/lib/moeda";
import { hojeSaoPaulo } from "@/lib/plantao";
import type { ContratoFinanceiro, SituacaoContrato } from "@/lib/financeiro";
import { cn } from "@/lib/utils";

/**
 * Um contrato do programa — "quanto é, quanto já paguei, o que falta".
 *
 * 🔴 Três regras que este card existe para respeitar:
 *
 * 1. **`null` é "não informado", nunca R$ 0,00** (B7-d). Dizer "você pagou
 *    R$ 0,00" para quem pagou é pior do que admitir o buraco — foi assim que
 *    um `coalesce(..., 0)` virou "taxa zero" por 5 semanas no sistema de
 *    disparos. Sem valor não há barra, não há percentual, há frase.
 * 2. **`credito` NÃO entra em conta alguma** (B7-c). A semântica é do sip: se
 *    o crédito já está dentro de `pago`, somar conta duas vezes; se não está,
 *    omitir subestima. Aparece como linha própria, rotulada, com a ressalva
 *    ao lado. Exibir sem calcular é honesto.
 * 3. **Um card por CONTRATO, nunca uma soma por aluno.** Há aluno com dois
 *    produtos (HM e AURUM); agregar misturaria o dinheiro dos dois — é o
 *    mesmo defeito do `where comprador_id` que quebrou 7 funções no disparos.
 *
 * ⚠️ **A UI não refaz conta.** `situacao`, `saldoExibido` e `pagoPct` vêm
 * derivados de `src/lib/financeiro.ts`, que lê a regra do sip
 * (`cs.vw_hm_financeiro`). Recalcular aqui criaria um segundo lugar para a
 * regra divergir do financeiro que cobra de verdade.
 *
 * ♿ Situação NUNCA é só cor: cada estado tem ícone + palavra + cor.
 */

/** Aparência da situação — cor, ícone e palavra, sempre os três juntos. */
const SITUACOES: Record<
  SituacaoContrato,
  { texto: string; classe: string; icone: React.ReactNode }
> = {
  quitado: {
    texto: "Quitado",
    classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800",
    icone: <CircleCheck aria-hidden />,
  },
  em_dia: {
    texto: "Em dia",
    classe: "border-sky-500/40 bg-sky-500/10 text-sky-800",
    icone: <CalendarCheck aria-hidden />,
  },
  atrasado: {
    texto: "Atrasado",
    classe: "border-red-500/40 bg-red-500/10 text-red-800",
    icone: <TriangleAlert aria-hidden />,
  },
  cancelado: {
    texto: "Cancelado",
    classe: "border-amber-500/40 bg-amber-500/10 text-amber-800",
    icone: <Ban aria-hidden />,
  },
  indefinido: {
    texto: "Não informado",
    classe: "border-border bg-muted text-muted-foreground",
    icone: <CircleHelp aria-hidden />,
  },
};

/** `timestamptz` → "dd/mm/aaaa" em São Paulo; `null` quando não dá para ler. */
function dataHora(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatarData(iso);
}

/**
 * `true` quando a data-only já passou em São Paulo. Comparação de string
 * "YYYY-MM-DD" contra "YYYY-MM-DD": ordem lexicográfica = ordem cronológica,
 * e nenhum `Date` no meio para trocar o dia de fuso.
 *
 * Função de módulo, fora do corpo do componente: `react-hooks/purity` reprova
 * `new Date()` chamado direto na renderização.
 */
function jaVenceu(diaIso: string | null): boolean {
  if (!diaIso) return false;
  return diaIso.slice(0, 10) < hojeSaoPaulo();
}

/**
 * Barra do pagamento do programa. Só é chamada com `pct` conhecido — quem
 * tem `null` mostra frase, não barra de 0%.
 */
function BarraPagamento({ pct, rotulo }: { pct: number; rotulo: string }) {
  const largura = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(largura)}
      aria-valuetext={`${Math.round(largura)}% pago`}
      className="relative h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/5 ring-inset"
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${largura}%` }}
      />
    </div>
  );
}

/**
 * Trilha de parcelas — bolinha cheia = parcela paga.
 *
 * `aria-hidden`: a frase "3 de 12 parcelas pagas" logo ao lado já diz tudo, e
 * 12 pontos anunciados um a um seriam ruído. Acima de 24 parcelas os pontos
 * não cabem em 360 px e somem: fica só o texto, que nunca some.
 */
function TrilhaParcelas({ pagas, total }: { pagas: number; total: number }) {
  if (total <= 0 || total > 24) return null;
  return (
    <div aria-hidden className="flex flex-wrap gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-full",
            i < pagas ? "bg-primary" : "bg-muted ring-1 ring-border ring-inset",
          )}
        />
      ))}
    </div>
  );
}

/** Linha de apoio do card (vencimento, entrada, crédito…). */
function Detalhe({
  rotulo,
  valor,
  ressalva,
  alerta,
}: {
  rotulo: string;
  valor: string;
  /** Explicação VISÍVEL — não `title`: tooltip não chega por teclado. */
  ressalva?: string;
  /** Vermelho, o MESMO tom do badge "Atrasado" — não amber, que é o do
      contrato cancelado. Duas severidades, duas cores. */
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5",
        alerta && "text-red-800",
      )}
    >
      <dt className={cn(!alerta && "text-muted-foreground")}>{rotulo}:</dt>
      <dd className="font-medium tabular-nums">{valor}</dd>
      {ressalva ? (
        <dd className="w-full text-xs text-muted-foreground">{ressalva}</dd>
      ) : null}
    </div>
  );
}

export function ProgramaCard({
  contrato,
  ehAdmin,
}: {
  contrato: ContratoFinanceiro;
  ehAdmin: boolean;
}) {
  const cancelado = contrato.situacao === "cancelado";
  const quitado = contrato.situacao === "quitado";
  const aparencia = SITUACOES[contrato.situacao] ?? SITUACOES.indefinido;

  const canceladoEm = dataHora(contrato.cancelamentoEm);
  const ultimoPagamento = dataHora(contrato.ultimoPagamentoEm);
  // `formatarDataSoDia` é recorte de string: `date` não tem fuso, e
  // `new Date` o leria como meia-noite UTC — um dia a menos em São Paulo.
  const proximaCobranca = formatarDataSoDia(contrato.proximaCobrancaEm);
  const entradaPagoEm = formatarDataSoDia(contrato.entradaPagoEm);
  // 🔑 "Vencido em" só quando a SITUAÇÃO é atrasado. A data de cobrança do
  // sip pode estar no passado num contrato "Em dia" (a régua ainda não rodou):
  // gritar "Vencido" ali contradiria o badge logo acima, e a tela passaria a
  // discordar de si mesma na única pergunta que ela responde. Nesse caso o
  // rótulo vira neutro — a data continua na tela, sem alarme falso.
  const atrasado = contrato.situacao === "atrasado";
  const dataJaPassou = jaVenceu(contrato.proximaCobrancaEm);

  const temValores =
    contrato.pago !== null || contrato.valorPrograma !== null;

  // Saldo só é cobrança quando há contrato vivo: exibir "falta pagar" em
  // contrato cancelado sugeriria dívida que não existe.
  const faltaPagar =
    !cancelado && !quitado && contrato.saldoExibido !== null
      ? contrato.saldoExibido
      : null;

  const credito =
    contrato.credito !== null && contrato.credito > 0 ? contrato.credito : null;

  const parcelas =
    contrato.parcelasContratadas !== null && contrato.parcelasContratadas > 0
      ? {
          pagas: contrato.parcelasPagas ?? 0,
          total: contrato.parcelasContratadas,
        }
      : null;

  // O saldo do AURUM vem de planilha, não da compra (medido: 2 alunos no GPS).
  // Sem este aviso o número da tela parece o extrato completo — e não é.
  const ehAurum = /aurum/i.test(contrato.produto ?? "");

  // Só a equipe: contrato apresentado como quitado cuja aritmética discorda.
  // O aluno não é público de conflito de cadastro.
  const divergencia =
    ehAdmin && contrato.divergenciaQuitacao !== null
      ? contrato.divergenciaQuitacao
      : null;

  const temDetalhes =
    (proximaCobranca !== null && !cancelado && !quitado) ||
    ultimoPagamento !== null ||
    contrato.entradaValor !== null ||
    credito !== null ||
    ehAurum;

  return (
    <Card className={cn(cancelado && "bg-amber-500/5 ring-amber-500/30")}>
      <CardHeader>
        <CardTitle>{contrato.produto ?? "Programa"}</CardTitle>
        {contrato.plano || contrato.turma ? (
          <div className="flex flex-wrap gap-1.5">
            {contrato.plano ? (
              <Badge variant="secondary">{contrato.plano}</Badge>
            ) : null}
            {contrato.turma ? (
              <Badge variant="outline">Turma {contrato.turma}</Badge>
            ) : null}
          </div>
        ) : null}
        <CardAction>
          <Badge variant="outline" className={aparencia.classe}>
            {aparencia.icone}
            {aparencia.texto}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        {cancelado ? (
          <p className="flex items-start gap-2 text-sm font-medium text-amber-800">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Contrato cancelado{canceladoEm ? ` em ${canceladoEm}` : ""}. Fale
              com a equipe.
            </span>
          </p>
        ) : null}

        {temValores ? (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span
                className="text-2xl font-semibold tabular-nums"
                title={contrato.pago === null ? undefined : brl(contrato.pago)}
              >
                {contrato.pago === null
                  ? "não informado"
                  : brlInteiro(contrato.pago)}
              </span>
              {contrato.valorPrograma === null ? null : (
                <span
                  className="text-muted-foreground tabular-nums"
                  title={brl(contrato.valorPrograma)}
                >
                  de {brlInteiro(contrato.valorPrograma)} pagos
                </span>
              )}
            </div>

            {contrato.pagoPct === null ? null : (
              <BarraPagamento
                pct={contrato.pagoPct}
                rotulo={`Pagamento do ${contrato.produto ?? "programa"}`}
              />
            )}

            {quitado ? (
              <p className="text-sm font-medium text-emerald-800">
                Nada em aberto no cadastro.
              </p>
            ) : faltaPagar !== null ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Falta pagar </span>
                <span className="font-semibold tabular-nums text-accent-foreground">
                  {brl(faltaPagar)}
                </span>
              </p>
            ) : cancelado ? null : (
              <p className="text-sm text-muted-foreground">
                Saldo não informado no cadastro.
              </p>
            )}
          </div>
        ) : (
          /* `semRegistroSip`: o contrato existe em `cs.contatos_hm` mas não
             tem linha na view financeira — lacuna de cadastro no sip, não bug
             do portal. O aluno lê a frase simples; o admin lê a causa, senão
             a lacuna fica invisível para sempre. */
          <div className="grid gap-1 text-sm text-muted-foreground">
            <p>
              Os valores deste contrato ainda não estão no cadastro financeiro.
              Fale com a equipe.
            </p>
            {ehAdmin && contrato.semRegistroSip ? (
              <p className="previa-oculta text-xs">
                Sem linha em{" "}
                <code className="font-mono">cs.vw_hm_financeiro</code> para este
                contrato.
              </p>
            ) : null}
          </div>
        )}

        {parcelas ? (
          <div className="grid gap-2 border-t pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-sm">
                <span className="font-medium tabular-nums">
                  {parcelas.pagas} de {parcelas.total}
                </span>{" "}
                <span className="text-muted-foreground">
                  {parcelas.total === 1 ? "parcela paga" : "parcelas pagas"}
                </span>
              </span>
              {contrato.valorParcela === null ? null : (
                <span
                  className="text-sm text-muted-foreground tabular-nums"
                  title={brl(contrato.valorParcela)}
                >
                  {brl(contrato.valorParcela)} cada
                </span>
              )}
            </div>
            <TrilhaParcelas pagas={parcelas.pagas} total={parcelas.total} />
          </div>
        ) : null}

        {temDetalhes ? (
          <dl className="grid gap-2 border-t pt-4 text-sm">
            {!cancelado && !quitado && proximaCobranca ? (
              atrasado && dataJaPassou ? (
                <Detalhe rotulo="Vencido em" valor={proximaCobranca} alerta />
              ) : dataJaPassou ? (
                <Detalhe rotulo="Cobrança prevista em" valor={proximaCobranca} />
              ) : (
                <Detalhe rotulo="Próximo vencimento" valor={proximaCobranca} />
              )
            ) : null}

            {ultimoPagamento ? (
              <Detalhe rotulo="Último pagamento" valor={ultimoPagamento} />
            ) : null}

            {contrato.entradaValor !== null ? (
              <Detalhe
                rotulo="Entrada"
                valor={
                  entradaPagoEm
                    ? `${brl(contrato.entradaValor)} em ${entradaPagoEm}`
                    : brl(contrato.entradaValor)
                }
              />
            ) : null}

            {credito !== null ? (
              <Detalhe
                rotulo="Crédito aplicado"
                valor={brl(credito)}
                ressalva="Informado pelo Grupo Participa; não entra no cálculo do saldo."
              />
            ) : null}

            {ehAurum ? (
              <div className="text-xs text-muted-foreground">
                Os valores do AURUM são consolidados fora deste portal.
              </div>
            ) : null}
          </dl>
        ) : null}

        {divergencia !== null ? (
          /* FN1 — a divergência vem também NEGATIVA (pagou acima do total).
             Chamar isso de "quitado, mas o saldo é −R$ X" seria errado duas
             vezes: não é dívida, é crédito. Dois ramos, duas frases. */
          <p className="previa-oculta flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">Só a equipe vê esta linha.</span>{" "}
              {divergencia < 0 ? (
                <>
                  Pago acima do total em {brl(-divergencia)}. Confira no
                  cadastro financeiro antes de responder ao aluno.
                </>
              ) : (
                <>
                  Contrato apresentado como quitado, mas o saldo apurado é{" "}
                  {brl(divergencia)}. Confira no cadastro financeiro antes de
                  responder ao aluno.
                </>
              )}
            </span>
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="grid gap-1 text-xs text-muted-foreground">
        <p>
          Fonte: cadastro financeiro do Grupo Participa, atualizado pela equipe.
          Não é editável aqui. Encontrou divergência? Fale com a equipe.
        </p>
        {ehAdmin ? (
          <p className="previa-oculta font-mono break-all">
            cs.vw_hm_financeiro · contato_hm_id {contrato.contatoHmId ?? "—"}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
