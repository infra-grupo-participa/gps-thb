import {
  Ban,
  CalendarCheck,
  CircleCheck,
  CircleHelp,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { Badge } from "@/components/ui/badge";
import { DetalhesEquipe } from "@/components/financeiro/detalhes-equipe";
import { Progress } from "@/components/ui/progress";
import { formatarData, formatarDataSoDia, hojeSaoPaulo } from "@/lib/datas";
import { brl, brlInteiro } from "@/lib/moeda";
import { excedentePago, type ContratoFinanceiro, type SituacaoContrato } from "@/lib/financeiro";
import { cn } from "@/lib/utils";

/**
 * Um contrato do programa — "quanto é, quanto já paguei, o que falta".
 *
 * 🔴 **Enxuto por decisão do João (09/09/2026).** O aluno lê quatro coisas:
 * situação, pago de total (com barra), parcelas e próximo vencimento. Origem
 * do dado, id do cadastro, divergência e excedente são assunto da equipe e
 * vivem em `DetalhesEquipe`, uma gaveta fechada que só existe no ramo
 * `ehAdmin`. Nome de view e "divergência de cadastro" na tela de quem só quer
 * saber se está em dia é ruído — e exposição desnecessária da nossa cozinha.
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

/**
 * Aparência da situação — cor, ícone e palavra, sempre os três juntos.
 *
 * 🎨 Os quatro pares semânticos da Onda A (`sucesso · atencao · risco ·
 * neutro`, contraste medido em `globals.css`) são a ESCADA DE SEVERIDADE do
 * portal, e o `Badge` já os desenha. O mapa antigo era Tailwind crua
 * (`emerald/sky/red/amber-*`): cinco cores que não existem em lugar nenhum do
 * sistema, e um "Em dia" azul que não dizia se era bom ou ruim.
 *
 * 🔑 `Quitado` e `Em dia` caem os dois em `success` de propósito: são os dois
 * estados em que **não há nada a fazer**, e a escada tem um degrau só para
 * isso. O que os separa é o ícone (`CircleCheck` × `CalendarCheck`) e a
 * palavra — nunca a cor sozinha (WCAG 1.4.1). Pintar "Em dia" de cinza seria
 * repetir o defeito que a Onda A corrigiu: estado BOM com o mesmo cinza de
 * "não temos essa informação", que é justamente o `neutral` do `indefinido`.
 */
const SITUACOES: Record<
  SituacaoContrato,
  {
    texto: string;
    variante: "success" | "warning" | "danger" | "neutral";
    icone: LucideIcon;
  }
> = {
  quitado: { texto: "Quitado", variante: "success", icone: CircleCheck },
  em_dia: { texto: "Em dia", variante: "success", icone: CalendarCheck },
  atrasado: { texto: "Atrasado", variante: "danger", icone: TriangleAlert },
  cancelado: { texto: "Cancelado", variante: "warning", icone: Ban },
  indefinido: {
    texto: "Não informado",
    variante: "neutral",
    icone: CircleHelp,
  },
};

/**
 * "dd/mm/aaaa" em São Paulo; `null` quando não dá para ler.
 *
 * 🔑 Data-only ("2026-08-21") vai por RECORTE DE STRING. A RPC devolve
 * `ultimo_pagamento_em`/`cancelamento_em` já como `date` no fuso de São Paulo,
 * e `new Date("2026-08-21")` os leria como meia-noite UTC — 21/08 virava 20/08
 * na tela, um dia a menos. É a mesma armadilha que `proximaCobrancaEm` já
 * evitava com `formatarDataSoDia`. Com hora, vai pelo formatador com fuso.
 */
function dataHora(iso: string | null): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return formatarDataSoDia(iso);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? formatarDataSoDia(iso) : formatarData(iso);
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
  /** `risco`, o MESMO par do badge "Atrasado" — não `atencao`, que é o do
      contrato cancelado. Duas severidades, duas cores. */
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5",
        alerta && "text-risco-foreground",
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

  // Caso 3.1 (decisão do Marcio, 09/09): pagou MAIS que o pacote. É
  // informação, não erro de cadastro — por isso linha própria, discreta, sem
  // o tom de "confira antes de responder ao aluno" da divergência positiva
  // (que É um problema: falta dinheiro na conta apesar do "quitado").
  const excedente = ehAdmin ? excedentePago(contrato) : null;

  // O aluno vê o vencimento (o que ele precisa fazer) e o crédito (dinheiro
  // dele). Entrada e último pagamento saíram do card: os dois já aparecem na
  // lista de pagamentos logo abaixo, e repeti-los aqui engordava a tela sem
  // responder nada de novo.
  const temDetalhes =
    (proximaCobranca !== null && !cancelado && !quitado) || credito !== null;

  const temDetalhesEquipe =
    ehAdmin &&
    (ultimoPagamento !== null ||
      contrato.entradaValor !== null ||
      ehAurum ||
      excedente !== null ||
      divergencia !== null ||
      contrato.semRegistroSip ||
      contrato.contatoHmId !== null);

  return (
    <Card
      className={cn(
        cancelado && "border-atencao-foreground/25 bg-atencao",
      )}
    >
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
          <Badge variant={aparencia.variante} icone={aparencia.icone}>
            {aparencia.texto}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        {cancelado ? (
          /* `moldura={false}`: o card inteiro já está na superfície de
             atenção — outra caixa âmbar dentro dela não separaria nada. */
          <AvisoInline moldura={false}>
            Contrato cancelado{canceladoEm ? ` em ${canceladoEm}` : ""}. Fale
            com a equipe.
          </AvisoInline>
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

            {/* `Progress` do sistema (trilho afundado + inset ring, h-2), no
                lugar da barra desenhada à mão que este card tinha. O `pct` já
                chega limitado a 0–100 por `derivarPct` (`@/lib/financeiro`);
                a UI não refaz a conta, só arredonda para falar. Só renderiza
                com `pct` conhecido — `null` mostra frase, não barra de 0%. */}
            {contrato.pagoPct === null ? null : (
              <Progress
                // Arredondado no `value`, não só no `aria-valuetext`: o
                // `Progress` deriva `aria-valuenow` do mesmo número, e 41,6
                // anunciado ao lado de "42% pago" seria a barra discordando
                // de si mesma. 0,4 ponto de largura ninguém vê.
                value={Math.round(contrato.pagoPct)}
                aria-label={`Pagamento do ${contrato.produto ?? "programa"}`}
                aria-valuetext={`${Math.round(contrato.pagoPct)}% pago`}
              />
            )}

            {quitado ? (
              <p className="text-sm font-medium text-sucesso-foreground">
                Está tudo pago. Nada em aberto.
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
                A equipe ainda está conferindo o saldo deste programa.
              </p>
            )}
          </div>
        ) : (
          /* `semRegistroSip`: o contrato existe em `cs.contatos_hm` mas não
             tem linha na view financeira — lacuna de cadastro, não bug do
             portal. O aluno lê a frase acolhedora; a causa fica na gaveta da
             equipe, senão a lacuna some para sempre. */
          <p className="text-sm text-muted-foreground">
            Os valores deste programa ainda não chegaram aqui — a equipe está
            cuidando disso.
          </p>
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

            {credito !== null ? (
              <Detalhe
                rotulo="Crédito aplicado"
                valor={brl(credito)}
                ressalva="Não entra no saldo acima."
              />
            ) : null}
          </dl>
        ) : null}
      </CardContent>

      {temDetalhesEquipe ? (
        <CardFooter>
          <DetalhesEquipe>
            <p className="font-mono break-all">
              cs.vw_hm_financeiro · contato_hm_id {contrato.contatoHmId ?? "—"}
            </p>

            {contrato.semRegistroSip ? (
              <p>
                Sem linha em{" "}
                <code className="font-mono">cs.vw_hm_financeiro</code> para este
                contrato — lacuna de cadastro, não erro do portal.
              </p>
            ) : null}

            {ultimoPagamento ? <p>Último pagamento: {ultimoPagamento}</p> : null}

            {contrato.entradaValor !== null ? (
              <p>
                Entrada: {brl(contrato.entradaValor)}
                {entradaPagoEm ? ` em ${entradaPagoEm}` : ""}
              </p>
            ) : null}

            {ehAurum ? (
              <p>Produto AURUM: valores consolidados fora deste portal.</p>
            ) : null}

            {excedente !== null ? (
              /* Discreta de propósito (decisão do Marcio, 09/09): não é erro,
                 é informação — "ele vê que pagou os 15k, mas a equipe vê que
                 ele tem 18k pagos". Sem ícone de alerta: pagou a mais, ponto. */
              <p>Pagou {brl(excedente)} além do pacote.</p>
            ) : divergencia !== null ? (
              /* FN1 — divergência POSITIVA: dito quitado, mas falta dinheiro
                 na conta. Este sim é problema de cadastro a conferir. */
              <AvisoInline icone={Info}>
                Contrato apresentado como quitado, mas o saldo apurado é{" "}
                {brl(divergencia)}. Confira no cadastro financeiro antes de
                responder ao aluno.
              </AvisoInline>
            ) : null}
          </DetalhesEquipe>
        </CardFooter>
      ) : null}
    </Card>
  );
}
