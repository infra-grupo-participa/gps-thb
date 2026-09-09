import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarDataHora } from "@/lib/datas";
import { rotuloStatus, type ChamadoNaFila } from "@/lib/chamados-tipos";
import { cn } from "@/lib/utils";

/**
 * A fila de atendimento. Server Component: o filtro mora na URL
 * (`?f=aberto|respondido`) e é aplicado no servidor — sem `useState`, sem
 * `useEffect`, e voltar pelo histórico devolve a mesma tela (mesmo padrão dos
 * filtros do Diário).
 *
 * 🔑 A ordem vem do banco: mais PARADO primeiro (`ultima_mensagem_em`
 * crescente, índice parcial `idx_chamados_fila`). Quem espera há mais tempo
 * aparece no topo, e não quem chegou por último — a fila é para não deixar
 * ninguém sem resposta, não para mostrar novidade.
 *
 * ⚠️ CHAMADO FECHADO NÃO ESTÁ AQUI: `getFilaChamados()` lê só o que não está
 * fechado. O histórico de um aluno específico fica em
 * `/admin/aluno/<id>/chamados`, que lista o ambiente inteiro. Um filtro
 * "fechado" nesta tela mentiria — não há de onde ler.
 */
const FILTROS = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "aberto", rotulo: "Aguardando a equipe" },
  { valor: "respondido", rotulo: "Aguardando o aluno" },
] as const;

export type FiltroFila = (typeof FILTROS)[number]["valor"];

export function parseFiltroFila(v: string | undefined): FiltroFila {
  return v === "aberto" || v === "respondido" ? v : "todos";
}

export function ChamadosFila({
  chamados,
  filtro,
}: {
  chamados: ChamadoNaFila[];
  filtro: FiltroFila;
}) {
  const visiveis =
    filtro === "todos" ? chamados : chamados.filter((c) => c.status === filtro);

  return (
    <div className="grid gap-4">
      <nav aria-label="Filtrar a fila por situação" className="flex flex-wrap gap-1">
        {FILTROS.map((op) => {
          const qtd =
            op.valor === "todos"
              ? chamados.length
              : chamados.filter((c) => c.status === op.valor).length;
          return (
            <Link
              key={op.valor}
              href={op.valor === "todos" ? "/admin/chamados" : `/admin/chamados?f=${op.valor}`}
              prefetch={false}
              aria-current={filtro === op.valor ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                filtro === op.valor
                  ? "border-primary bg-primary/10 text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {op.rotulo} ({qtd})
            </Link>
          );
        })}
      </nav>

      {visiveis.length === 0 ? (
        <EmptyState
          icone={<Inbox />}
          titulo={
            chamados.length === 0
              ? "Nenhum chamado esperando resposta."
              : "Nenhum chamado nesta situação."
          }
          descricao={
            chamados.length === 0
              ? "Quando um aluno abrir um chamado, ele aparece aqui — o mais parado no topo. Chamados fechados ficam no ambiente de cada aluno."
              : "Troque o filtro acima para ver o resto da fila."
          }
        />
      ) : (
        <ul className="grid gap-3">
          {visiveis.map((c) => (
            <li key={c.id}>
              <Card className="transition hover:shadow-sm has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50">
                <CardContent className="flex items-center gap-3 py-4">
                  {/* Mesma razão da lista do aluno: em 360 px a pílula na
                      mesma linha do assunto cortava o assunto. */}
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Link
                      href={`/admin/chamados/${c.id}`}
                      prefetch={false}
                      className="font-medium outline-none hover:underline"
                    >
                      {c.assunto}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.aluno_nome ?? "Ambiente sem nome"}
                      {c.aluno_email ? ` · ${c.aluno_email}` : null}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge
                        variant={c.status === "aberto" ? "warning" : "neutral"}
                      >
                        {rotuloStatus(c.status, "admin")}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        Última mensagem em{" "}
                        <time dateTime={c.ultima_mensagem_em}>
                          {formatarDataHora(c.ultima_mensagem_em)}
                        </time>
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
