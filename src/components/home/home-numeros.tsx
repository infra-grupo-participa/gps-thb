import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { META_CLIENTES, META_HONORARIOS, META_REUNIOES } from "@/lib/etapa1";
import { brl, brlInteiro } from "@/lib/moeda";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A fileira de números da home: Clientes, Reuniões, Faturamento e, quando
 * existe, o cliente acompanhado pela equipe.
 *
 * Cada número aparece UMA vez na home (antes a meta saía no hero e na coluna
 * de apoio). Card inteiro é o link: não há outro elemento interativo dentro.
 * Os três números levam a Clientes — é lá que a lista, as reuniões e a meta
 * de faturamento (`MetaHonorarios`) moram; o Financeiro está "em breve".
 *
 * `faturamento === null` = nenhum contratado com valor: mostra "—", nunca
 * R$ 0 (seria afirmar um faturamento que o portal não conhece).
 */
export function HomeNumeros({
  clientes,
  reunioes,
  faturamento,
  acompanhado,
}: {
  /** Clientes com nome e telefone — o que a tarefa 1 cobra. */
  clientes: number;
  reunioes: number;
  faturamento: number | null;
  acompanhado: { id: string; nome: string } | null;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4",
        acompanhado ? "lg:grid-cols-4" : "lg:grid-cols-3",
      )}
    >
      <Numero
        href="/clientes"
        rotulo="Clientes"
        valor={String(clientes)}
        de={`de ${META_CLIENTES}`}
      />
      <Numero
        href="/clientes"
        rotulo="Reuniões"
        valor={String(reunioes)}
        de={`de ${META_REUNIOES}`}
      />
      <Numero
        href="/clientes"
        rotulo="Faturamento"
        valor={faturamento === null ? "—" : brlInteiro(faturamento)}
        titulo={faturamento === null ? undefined : brl(faturamento)}
        de={`meta ${brlInteiro(META_HONORARIOS)}`}
      />
      {acompanhado ? (
        <Link
          href={`/clientes/${acompanhado.id}`}
          className="foco-visivel block min-w-0 rounded-xl"
        >
          <Card interativo className="h-full">
            <CardContent className="flex h-full flex-col gap-1">
              <span className="text-base text-muted-foreground">
                Cliente acompanhado
              </span>
              <span className="font-heading text-lg font-semibold break-words">
                {acompanhado.nome || "Sem nome"}
              </span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-base font-medium text-accent-foreground">
                Abrir ficha <ArrowRight aria-hidden className="size-4" />
              </span>
            </CardContent>
          </Card>
        </Link>
      ) : null}
    </div>
  );
}

function Numero({
  href,
  rotulo,
  valor,
  de,
  titulo,
}: {
  href: string;
  rotulo: string;
  valor: string;
  de: string;
  titulo?: string;
}) {
  return (
    <Link href={href} className="foco-visivel block min-w-0 rounded-xl">
      <Card interativo className="h-full">
        <CardContent className="flex h-full flex-col gap-1">
          <span className="flex items-center justify-between gap-2 text-base text-muted-foreground">
            {rotulo}
            <ChevronRight aria-hidden className="size-5 shrink-0" />
          </span>
          <span className="numero text-2xl font-semibold break-words lg:text-3xl" title={titulo}>
            {valor}
          </span>
          <span className="text-base text-muted-foreground">{de}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
