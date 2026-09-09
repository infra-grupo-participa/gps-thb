import { Target } from "lucide-react";
import { META_HONORARIOS, type ResumoHonorarios } from "@/lib/etapa1";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Valor cheio (com centavos) — usado nos `title`, onde o número exato importa
 * e não há disputa por espaço.
 */
const brlExato = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Valor sem centavos para a linha de destaque. Uma meta de R$ 150.000 lida com
 * ",00" atrás rouba a atenção do número que interessa; o valor exato continua
 * no `title`, então nada se perde.
 */
const brlRedondo = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/**
 * Barra da meta de faturamento do ambiente (B8): soma de `valor_honorarios`
 * dos clientes em `fase='contratado'`, programa inteiro, valor CONTRATADO.
 *
 * 🔑 As duas colunas nasceram NULL nas 879 linhas (migração ...090). Um KPI
 * ingênuo sobre coluna recém-criada mostra vazio como se fosse resultado —
 * "R$ 0,00 de R$ 150.000" com a barra zerada é uma afirmação sobre o
 * faturamento do aluno que o portal não tem como fazer. Por isso os três
 * estados abaixo são obrigatórios e só o último desenha barra.
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

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Target className="size-4 text-primary" aria-hidden />
          Meta de faturamento
        </span>
        {total !== null ? (
          <span className="shrink-0 tabular-nums" title={brlExato.format(total)}>
            <span className="font-semibold text-accent-foreground">
              {brlRedondo.format(total)}
            </span>{" "}
            <span className="text-muted-foreground">
              de {brlRedondo.format(META_HONORARIOS)}
            </span>
          </span>
        ) : (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            meta de {brlRedondo.format(META_HONORARIOS)}
          </span>
        )}
      </div>

      {total !== null && pct !== null ? (
        <>
          <Progress
            value={pct}
            className="mt-2"
            aria-label={`Meta de faturamento: ${brlExato.format(total)} de ${brlExato.format(META_HONORARIOS)}`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {pct}% da meta · honorários contratados de {contratados}{" "}
            {contratados === 1 ? "cliente" : "clientes"}
            {contratadosSemValor > 0 ? (
              <>
                {" · "}
                <span className="text-amber-700 dark:text-amber-400">
                  {contratadosSemValor} de {contratados} contratados ainda sem
                  valor registrado
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
              {brlRedondo.format(META_HONORARIOS)} começa a contar quando você
              mover um cliente para Contratado.
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
