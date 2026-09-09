import { CircleCheck, Info, TriangleAlert, WalletMinimal } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarData } from "@/lib/datas";
import { hojeSaoPaulo } from "@/lib/plantao";
import type { ContratoFinanceiro, ResultadoFinanceiro } from "@/lib/financeiro";
import { cn } from "@/lib/utils";

/**
 * Aba Financeiro — a MESMA tela para o aluno titular e para o admin em modo
 * assistência. `ehAdmin` só ACRESCENTA linha técnica; nenhum número muda de
 * valor entre as duas, senão admin e aluno discutiriam olhando telas
 * diferentes.
 *
 * 🔴 Três regras que esta tela existe para respeitar:
 *
 * 1. **`null` é "não informado", nunca R$ 0,00** (B7-d). 4 dos 96 registros
 *    medidos não têm nem saldo manual nem os dois lados da aritmética. Dizer
 *    "você pagou R$ 0,00" para quem pagou é pior do que admitir o buraco — foi
 *    assim que um `coalesce(..., 0)` virou "taxa zero" por 5 semanas no
 *    sistema de disparos.
 * 2. **`creditoValorPago` e `cancelamentoValor` NÃO entram em conta alguma**
 *    (B7-c). A semântica dos dois é do `sip` e não está provada aqui: se o
 *    crédito já está dentro de `valorPago`, somar conta duas vezes; se não
 *    está, omitir subestima. Aparecem como linha própria, rotulada, com a
 *    ressalva escrita ao lado. Exibir sem calcular é honesto.
 * 3. **Um card por CONTRATO, nunca uma soma por aluno.** Há aluno com dois
 *    produtos (HM e AURUM); agregar misturaria o dinheiro dos dois — é o
 *    mesmo defeito do `where comprador_id` que quebrou 7 funções no disparos.
 *
 * ⚠️ **A UI não refaz conta.** `situacao`, `saldoExibido` e
 * `divergenciaQuitacao` vêm derivados de `src/lib/financeiro.ts`. Recalcular
 * aqui criaria um segundo lugar para a regra divergir.
 *
 * Somente leitura: nenhum formulário, nenhuma Server Action, nenhum `input`.
 * O rodapé de cada card diz de onde o número vem e que o portal não edita (C5).
 */

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** `timestamptz` do banco → "dd/mm/aaaa" no fuso de São Paulo (via `@/lib/datas`). */
function dataHora(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : formatarData(iso);
}

/**
 * `date` do Postgres ("2026-08-11") → "11/08/2026" por recorte de string.
 *
 * Sem `new Date`: `date` não tem fuso, e `new Date("2026-08-11")` é meia-noite
 * UTC — formatado em São Paulo volta um dia (10/08). Um vencimento exibido com
 * um dia de erro é o tipo de defeito que ninguém reporta e todo mundo usa.
 */
function dataSimples(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
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

/** Célula do trio Total · Pago · Saldo. */
function Numero({
  rotulo,
  valor,
  destaque,
  nota,
}: {
  rotulo: string;
  /** `null` = o banco não sabe. Vira "não informado", NUNCA R$ 0,00. */
  valor: number | null;
  destaque?: boolean;
  nota?: string | null;
}) {
  const informado = valor !== null;
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5",
        // O saldo é o número que a pessoa abriu a tela para ver: ganha painel
        // próprio em vez de cor — laranja da marca em texto de 24px não chega
        // aos 4.5:1 sobre branco.
        destaque ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/60",
      )}
    >
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd
        className={cn(
          "mt-1 tabular-nums",
          destaque ? "text-2xl font-semibold" : "text-lg font-medium",
          // "não informado" é frase, não número: perde o corpo do valor para
          // não competir com os números que a tela realmente conhece.
          informado
            ? "text-foreground"
            : "text-sm font-normal text-muted-foreground",
        )}
      >
        {informado ? brl.format(valor) : "não informado"}
      </dd>
      {nota ? (
        <dd className="mt-1 text-xs text-muted-foreground">{nota}</dd>
      ) : null}
    </div>
  );
}

/** Linha de apoio do card (parcelamento, vencimento, crédito…). */
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
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5",
        alerta && "text-amber-700 dark:text-amber-400",
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

function ContratoCard({
  contrato,
  ehAdmin,
}: {
  contrato: ContratoFinanceiro;
  ehAdmin: boolean;
}) {
  const cancelado = contrato.situacao === "cancelado";
  const quitado = contrato.situacao === "quitado";

  const quitadoEm = dataHora(contrato.quitadoEm);
  const canceladoEm = dataHora(contrato.cancelamentoEm);
  const pagoEm = dataHora(contrato.pagamentoEm);
  const previstoEm = dataSimples(contrato.pagamentoPrevistoEm);
  // Vencimento só faz sentido com saldo em aberto: cobrar data de contrato
  // quitado ou cancelado é alarme falso.
  const vencido =
    contrato.situacao === "em_aberto" && jaVenceu(contrato.pagamentoPrevistoEm);

  const notaSaldo = contrato.saldoEManual
    ? "Saldo ajustado manualmente pela equipe."
    : quitado && !quitadoEm
      ? "Nada em aberto no cadastro."
      : null;

  // Só o admin: contrato marcado como quitado cuja conta ainda aponta valor.
  // O aluno não é público de conflito de cadastro — para ele o número bom já
  // está na tela e o rodapé diz o que fazer se discordar.
  const divergencia =
    ehAdmin && contrato.divergenciaQuitacao !== null
      ? contrato.divergenciaQuitacao
      : null;

  const credito =
    contrato.creditoValorPago !== null && contrato.creditoValorPago > 0
      ? contrato.creditoValorPago
      : null;

  const parcelamento =
    contrato.pagamentoParcelas !== null && contrato.pagamentoForma
      ? `${contrato.pagamentoParcelas}x em ${contrato.pagamentoForma}`
      : null;

  // O saldo do AURUM vem de planilha, não da compra (medido: 2 alunos no GPS).
  // Sem este aviso o número da tela parece o extrato completo — e não é.
  const ehAurum = /aurum/i.test(contrato.produto ?? "");

  const temDetalhes =
    parcelamento !== null ||
    (previstoEm !== null && !cancelado) ||
    pagoEm !== null ||
    credito !== null ||
    (cancelado && contrato.cancelamentoValor !== null) ||
    ehAurum;

  return (
    <Card
      className={cn(
        // Tom neutro-alerta do contrato cancelado. A cor não carrega a
        // informação sozinha: a frase e o ícone abaixo dizem o mesmo.
        cancelado && "bg-amber-500/5 ring-amber-500/30 dark:bg-amber-500/10",
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
        {quitado ? (
          <CardAction>
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            >
              <CircleCheck aria-hidden />
              {quitadoEm ? `Quitado em ${quitadoEm}` : "Quitado"}
            </Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-4">
        {cancelado ? (
          <p className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Contrato cancelado{canceladoEm ? ` em ${canceladoEm}` : ""}. Fale
              com a equipe.
            </span>
          </p>
        ) : null}

        <dl
          className={cn(
            "grid gap-3",
            // O saldo some no contrato cancelado: apresentar "saldo a pagar"
            // de contrato cancelado sugeriria cobrança que não existe.
            cancelado ? "sm:grid-cols-2" : "sm:grid-cols-3",
          )}
        >
          <Numero rotulo="Total" valor={contrato.valorTotal} />
          <Numero rotulo="Pago" valor={contrato.valorPago} />
          {cancelado ? null : (
            <Numero
              rotulo="Saldo"
              valor={contrato.saldoExibido}
              destaque
              nota={notaSaldo}
            />
          )}
        </dl>

        {divergencia !== null ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">Só a equipe vê esta linha.</span>{" "}
              Contrato marcado como quitado, mas o saldo apurado é{" "}
              {brl.format(divergencia)}. Confira no cadastro financeiro antes de
              responder ao aluno.
            </span>
          </p>
        ) : null}

        {temDetalhes ? (
          <dl className="grid gap-2 border-t pt-4 text-sm">
            {parcelamento ? (
              <Detalhe rotulo="Parcelamento" valor={parcelamento} />
            ) : null}

            {!cancelado && previstoEm ? (
              vencido ? (
                <Detalhe rotulo="Vencido em" valor={previstoEm} alerta />
              ) : (
                <Detalhe rotulo="Próximo vencimento" valor={previstoEm} />
              )
            ) : null}

            {pagoEm ? (
              <Detalhe rotulo="Último pagamento" valor={pagoEm} />
            ) : null}

            {credito !== null ? (
              <Detalhe
                rotulo="Crédito aplicado"
                valor={brl.format(credito)}
                ressalva="Informado pelo Grupo Participa; não entra no cálculo do saldo."
              />
            ) : null}

            {cancelado && contrato.cancelamentoValor !== null ? (
              <Detalhe
                rotulo="Valor do cancelamento"
                valor={brl.format(contrato.cancelamentoValor)}
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
      </CardContent>

      <CardFooter className="text-xs text-muted-foreground">
        <p>
          Fonte: cadastro financeiro do Grupo Participa, atualizado pela equipe
          — este portal apenas exibe e não é editável aqui. Encontrou
          divergência? Fale com a equipe.
        </p>
      </CardFooter>
    </Card>
  );
}

export function FinanceiroView({
  resultado,
  ehAdmin,
}: {
  resultado: ResultadoFinanceiro;
  ehAdmin: boolean;
}) {
  // 🔑 `erro` e `sem_registro` são estados DIFERENTES e continuam diferentes
  // aqui. Colapsar os dois faria uma falha de banco aparecer como "este aluno
  // não tem financeiro" — a tela mentiria com cara de normalidade.
  if (resultado.estado === "erro") {
    return (
      <EmptyState
        icone={<TriangleAlert />}
        titulo="Não foi possível carregar o financeiro agora."
        descricao="Tente de novo em alguns minutos. Se continuar, fale com a equipe."
      />
    );
  }

  if (resultado.estado === "sem_permissao") {
    return (
      <EmptyState
        icone={<WalletMinimal />}
        titulo="Este financeiro não está disponível para você."
        descricao="O contrato do programa é do titular do ambiente."
      />
    );
  }

  if (resultado.estado === "sem_registro" || resultado.contratos.length === 0) {
    return (
      <EmptyState
        icone={<WalletMinimal />}
        titulo="Financeiro não disponível para este cadastro — fale com a equipe."
        descricao={
          ehAdmin ? (
            <>
              Nenhum registro em{" "}
              <code className="font-mono">cs.contatos_hm</code> para este
              ambiente. Provável lacuna de cadastro, não erro do portal.
            </>
          ) : (
            "A equipe consegue conferir o seu contrato e atualizar o cadastro."
          )
        }
      />
    );
  }

  return (
    <div className="grid gap-4">
      {resultado.contratos.map((contrato, i) => (
        <ContratoCard
          // Não há id no retorno da RPC. A lista é estática (Server Component,
          // sem reordenação e sem estado de cliente) e a ordem vem do
          // `order by` da função — índice como chave aqui não tem o defeito
          // que teria numa lista editável.
          key={`${contrato.produto ?? "programa"}-${i}`}
          contrato={contrato}
          ehAdmin={ehAdmin}
        />
      ))}
    </div>
  );
}
