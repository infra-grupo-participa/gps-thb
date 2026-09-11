import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatarDataHora } from "@/lib/datas";
import {
  CATEGORIAS_CHAMADO,
  ROTULO_CATEGORIA_CHAMADO,
  rotuloCategoriaChamado,
  rotuloStatus,
  type CategoriaChamado,
  type ChamadoNaFila,
} from "@/lib/chamados-tipos";
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
  { valor: "respondido", rotulo: "Aguardando o parceiro" },
] as const;

export type FiltroFila = (typeof FILTROS)[number]["valor"];

export function parseFiltroFila(v: string | undefined): FiltroFila {
  return v === "aberto" || v === "respondido" ? v : "todos";
}

/**
 * Filtro por categoria (`?c=`), somando ao de status (`?f=`) — MESMA
 * allowlist em URL, mesmo padrão de `parseFiltroFila`: valor fora da lista
 * cai em "todos" em silêncio, nunca em erro de rota.
 */
export type FiltroCategoria = "todos" | CategoriaChamado;

export function parseFiltroCategoria(v: string | undefined): FiltroCategoria {
  return (CATEGORIAS_CHAMADO as readonly string[]).includes(v ?? "")
    ? (v as CategoriaChamado)
    : "todos";
}

function hrefFila(filtro: FiltroFila, categoria: FiltroCategoria): string {
  const params = new URLSearchParams();
  if (filtro !== "todos") params.set("f", filtro);
  if (categoria !== "todos") params.set("c", categoria);
  const q = params.toString();
  return q ? `/admin/chamados?${q}` : "/admin/chamados";
}

/** Iniciais do ambiente, para dar rosto a fila. */
function iniciais(nome: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Ha quantos dias inteiros o chamado esta parado.
 *
 * 🔑 E o SINAL QUE ORDENA A FILA e nao aparecia nela: a lista vem do banco por
 * `ultima_mensagem_em` crescente, e a tela mostrava "Última mensagem em
 * 02/09/2026, 08:20". A data e o dado; "parado ha 7 dias" e a informacao — e
 * sem ela a ordem da lista parecia arbitraria.
 *
 * Calculado no SERVIDOR (este e um Server Component, sem hidratacao): nao ha
 * relogio de cliente para divergir. A data exata continua na tela, ao lado.
 */
/**
 * Relógio da requisição, isolado do corpo do componente.
 *
 * Mesmo motivo (e mesmo padrão) de `desdeDaJanela` em
 * `admin/aluno/[alunoId]/diario/page.tsx`: o linter do React Compiler
 * (`react-hooks/purity`) reprova `Date.now()` chamado direto durante o render,
 * inclusive em Server Component. Lido UMA vez por render, nunca por item — com
 * uma leitura por chamado, dois da mesma hora poderiam sair como "há 6 dias" e
 * "há 7 dias" na virada do dia.
 */
function agoraMs(): number {
  return Date.now();
}

function diasParado(iso: string, agora: number): number {
  const ms = agora - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function ChamadosFila({
  chamados,
  filtro,
  filtroCategoria = "todos",
}: {
  chamados: ChamadoNaFila[];
  filtro: FiltroFila;
  filtroCategoria?: FiltroCategoria;
}) {
  const porStatus =
    filtro === "todos" ? chamados : chamados.filter((c) => c.status === filtro);
  const visiveis =
    filtroCategoria === "todos"
      ? porStatus
      : porStatus.filter(
          (c) => (c.categoria ?? "sistema") === filtroCategoria,
        );
  const agora = agoraMs();

  return (
    <div className="grid gap-3">
      <nav aria-label="Filtrar a fila por situação" className="flex flex-wrap gap-1">
        {FILTROS.map((op) => {
          const qtd =
            op.valor === "todos"
              ? chamados.length
              : chamados.filter((c) => c.status === op.valor).length;
          return (
            <Link
              key={op.valor}
              href={hrefFila(op.valor, filtroCategoria)}
              prefetch={false}
              aria-current={filtro === op.valor ? "true" : undefined}
              className={cn(
                // Mesma linguagem de chip da aba Clientes e do painel.
                // `bg-marca-acao` (#C74600) com branco: 4,88:1, medido.
                "foco-visivel rounded-full border px-3 py-1 text-xs font-medium transition",
                filtro === op.valor
                  ? "border-marca-acao bg-marca-acao text-white"
                  : "border-borda-forte bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {op.rotulo} ({qtd})
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Filtrar a fila por categoria" className="flex flex-wrap gap-1">
        {(["todos", ...CATEGORIAS_CHAMADO] as const).map((cat) => {
          const rotulo = cat === "todos" ? "Todas as categorias" : ROTULO_CATEGORIA_CHAMADO[cat];
          const qtd =
            cat === "todos"
              ? porStatus.length
              : porStatus.filter((c) => (c.categoria ?? "sistema") === cat).length;
          return (
            <Link
              key={cat}
              href={hrefFila(filtro, cat)}
              prefetch={false}
              aria-current={filtroCategoria === cat ? "true" : undefined}
              className={cn(
                "foco-visivel rounded-full border px-3 py-1 text-xs font-medium transition",
                filtroCategoria === cat
                  ? "border-foreground bg-foreground text-background"
                  : "border-borda-forte bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {rotulo} ({qtd})
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
              ? "Quando um parceiro abrir um chamado, ele aparece aqui — o mais parado no topo. Chamados fechados ficam no ambiente de cada parceiro."
              : "Troque o filtro acima para ver o resto da fila."
          }
        />
      ) : (
        <ul className="grid gap-2">
          {visiveis.map((c) => {
            const dias = diasParado(c.ultima_mensagem_em, agora);
            // So vira chip quando ha espera de verdade: "parado ha 0 dias" nao
            // e sinal, e ruido. A partir de 3 dias o tom sobe para risco — a
            // escada de severidade que a fila nao tinha.
            const espera =
              dias >= 1
                ? {
                    texto: `parado há ${dias} ${dias === 1 ? "dia" : "dias"}`,
                    variante:
                      dias >= 3 ? ("danger" as const) : ("warning" as const),
                  }
                : null;
            return (
              <li key={c.id}>
                <Card
                  interativo
                  className="[--card-spacing:--spacing(3)] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50"
                >
                  <CardContent className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-superficie-afundada font-heading text-xs font-semibold text-neutro-foreground"
                    >
                      {iniciais(c.aluno_nome)}
                    </span>
                    {/* Mesma razão da lista do aluno: em 360 px a pílula na
                        mesma linha do assunto cortava o assunto. */}
                    <div className="grid min-w-0 flex-1 gap-1">
                      <h3 className="min-w-0">
                        <Link
                          href={`/admin/chamados/${c.id}`}
                          prefetch={false}
                          className="font-heading text-sm font-semibold outline-none hover:underline"
                        >
                          {c.assunto}
                        </Link>
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.aluno_nome ?? "Ambiente sem nome"}
                        {c.aluno_email ? ` · ${c.aluno_email}` : null}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Badge
                          variant={c.status === "aberto" ? "warning" : "neutral"}
                          className="text-[10px]"
                        >
                          {rotuloStatus(c.status, "admin")}
                        </Badge>
                        <Badge variant="outline" icone={false} className="text-[10px]">
                          {rotuloCategoriaChamado(c.categoria)}
                        </Badge>
                        {espera ? (
                          <Badge
                            variant={espera.variante}
                            icone={false}
                            className="text-[10px]"
                          >
                            {espera.texto}
                          </Badge>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
