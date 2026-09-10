import { Target } from "lucide-react";
import { META_HONORARIOS, type ResumoHonorarios } from "@/lib/etapa1";
import { brl, brlInteiro } from "@/lib/moeda";
import { BarraMarcos } from "@/components/ui/barra-marcos";
import { cn } from "@/lib/utils";

/**
 * `brl` (com centavos) fica nos `title`, onde o número exato importa e não há
 * disputa por espaço; `brlInteiro` na linha de destaque — uma meta de
 * R$ 150.000 lida com ",00" atrás rouba a atenção do número que interessa, e
 * o valor exato continua no `title`, então nada se perde. Os dois vêm de
 * `@/lib/moeda` (CD1).
 */

/**
 * Barra da meta de faturamento do ambiente (B8): soma de `valor_honorarios`
 * dos clientes em `fase='contratado'`, programa inteiro, valor CONTRATADO.
 *
 * 🔴 O NOME "AURUM" NÃO APARECE PARA O ALUNO (decisão do Marcio, 10/09/2026):
 * a tela fala em META, e só. O nome interno do nível fica no código.
 *
 * A régua é UMA: R$ 150.000, o objetivo do programa. O desenho é
 * o mesmo da aba Financeiro, pelo mesmo componente (`BarraMarcos`), para que a
 * home e a aba não mostrem duas réguas diferentes do mesmo número.
 *
 * 🔑 As duas colunas nasceram NULL nas 879 linhas (migração ...090). Um KPI
 * ingênuo sobre coluna recém-criada mostra vazio como se fosse resultado —
 * "R$ 0,00 de R$ 150.000" com a barra zerada é uma afirmação sobre o
 * faturamento do aluno que o portal não tem como fazer. Por isso os três
 * estados abaixo são obrigatórios e só o último desenha barra.
 *
 * ⚠️ A comparação `total >= META_HONORARIOS` é a MESMA de
 * `ProgressoFaturamento` (`@/lib/financeiro`), e é comparação contra a
 * constante de `etapa1.ts` — não uma segunda conta. Ela mora aqui porque este
 * componente também roda no CLIENTE (`clientes-manager`), e `financeiro.ts`
 * importa o cliente Supabase de servidor. Trocar o valor da meta continua
 * sendo um lugar só: `META_HONORARIOS`.
 *
 * Sem `Card` de propósito: entra dentro do card de resumo da home e dentro do
 * cabeçalho da aba Clientes. Quem chama decide a moldura.
 */
export function MetaHonorarios({
  resumo,
  className,
}: {
  resumo: ResumoHonorarios;
  className?: string;
}) {
  const { total, contratados, contratadosSemValor, pct } = resumo;

  const bateuAMeta = total !== null && total >= META_HONORARIOS;
  const marcos = [
    { valor: META_HONORARIOS, rotulo: "Meta", atingido: bateuAMeta },
  ];

  return (
    <div className={cn("min-w-0", className)}>
      {/* `flex-wrap`: na coluna de apoio da home (~300 px) o título ocupa duas
          linhas e o valor era empurrado para fora do card. Quebrando, ele cai
          para a linha de baixo alinhado à direita, sem cortar número. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Target className="size-4 text-primary" aria-hidden />
          Meta de faturamento
        </span>
        {total !== null ? (
          <span className="ml-auto shrink-0 tabular-nums" title={brl(total)}>
            <span className="font-semibold text-accent-foreground">
              {brlInteiro(total)}
            </span>{" "}
            <span className="text-muted-foreground">
              {bateuAMeta
                ? "· meta atingida"
                : `de ${brlInteiro(META_HONORARIOS)}`}
            </span>
          </span>
        ) : (
          <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
            meta de {brlInteiro(META_HONORARIOS)}
          </span>
        )}
      </div>

      {total !== null && pct !== null ? (
        <>
          <BarraMarcos
            className="mt-2"
            valor={total}
            max={META_HONORARIOS}
            marcos={marcos}
            rotuloAcessivel="Meta de faturamento"
            textoAcessivel={
              bateuAMeta
                ? `${brlInteiro(total)}; meta alcançada.`
                : `${brlInteiro(total)} de ${brlInteiro(META_HONORARIOS)}.`
            }
          />
          {/* Uma linha só embaixo da barra: quanto falta para a meta. */}
          <p className="mt-1.5 text-xs text-muted-foreground">
            {bateuAMeta ? (
              <>Você atingiu a meta.</>
            ) : (
              <>
                Faltam{" "}
                <span className="tabular-nums">
                  {brlInteiro(META_HONORARIOS - total)}
                </span>{" "}
                para a meta · {pct}%
              </>
            )}
            {contratadosSemValor > 0 ? (
              <>
                {" · "}
                <span className="text-atencao-foreground">
                  {contratadosSemValor}{" "}
                  {contratadosSemValor === 1 ? "contratado" : "contratados"} sem
                  valor
                </span>
              </>
            ) : null}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {contratados === 0 ? (
            <>
              Nenhum cliente contratado ainda. A meta de{" "}
              {brlInteiro(META_HONORARIOS)} começa a contar quando
              você mover um cliente para Contratado.
            </>
          ) : (
            <>
              {contratados} {contratados === 1 ? "cliente" : "clientes"}{" "}
              {contratados === 1 ? "contratado" : "contratados"}, nenhum com
              honorários registrados. Registre o valor na ficha do cliente para
              acompanhar a meta.
            </>
          )}
        </p>
      )}
    </div>
  );
}
