import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, brlOuTraco } from "@/lib/moeda";

/**
 * De onde veio o número do hero — cliente por cliente.
 *
 * Um total sem a lista que o compõe é um número em que o aluno não consegue
 * mexer: ele vê "R$ 40.000" e não sabe qual holding entrou nem qual ficou de
 * fora. Cada linha leva à ficha, que é onde o valor se corrige.
 *
 * 🔑 `valor` pode ser `null` (contratado sem honorários informados) e sai como
 * "—" via `brlOuTraco` — nunca R$ 0,00. O aviso de quantos estão assim já
 * está no hero; aqui a linha mostra QUAL é.
 *
 * A linha inteira é o link (alvo grande no toque; 44 px de altura no 360),
 * com o nome, o valor e "Abrir ficha" dentro do nome acessível — em vez de um
 * link "Abrir ficha" solto, que numa lista de 12 clientes daria 12 links com
 * o mesmo texto e nenhum contexto para quem navega por lista de links.
 */
export function ContratosFechados({
  clientes,
  total,
  basePath,
}: {
  clientes: { clienteId: string; nome: string | null; valor: number | null }[];
  /** Soma dos que têm valor — vem do servidor (`ProgressoFaturamento`). */
  total: number | null;
  basePath: string;
}) {
  if (clientes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos fechados</CardTitle>
        {/* `CardAction` e não um `Badge` solto: sem o slot, o `CardHeader`
            empilha a contagem embaixo do título e o card ganha uma linha
            vazia à direita. */}
        <CardAction>
          <Badge variant="secondary">
            {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ul className="-mx-2 grid">
          {clientes.map((c) => (
            <li key={c.clienteId}>
              <Link
                href={`${basePath}/clientes/${c.clienteId}`}
                className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.nome?.trim() || "Cliente sem nome"}
                </span>
                <span
                  className="shrink-0 tabular-nums"
                  title={c.valor === null ? undefined : brl(c.valor)}
                >
                  {brlOuTraco(c.valor)}
                </span>
                <span className="sr-only">Abrir ficha</span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>

      {total === null ? null : (
        <CardFooter className="justify-between gap-3 text-sm">
          <span className="font-medium">Total informado</span>
          <span className="font-semibold tabular-nums text-accent-foreground">
            {brl(total)}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
