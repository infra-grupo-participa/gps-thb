"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  FileText,
  ExternalLink,
  Search,
  Lock,
} from "lucide-react";
import type { Material, TipoMaterial } from "@/lib/materiais";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function MateriaisView({
  materiais,
  etapaNomes,
  etapasLiberadas,
  basePath,
  podeAbrirBloqueadas,
}: {
  materiais: Material[];
  etapaNomes: Record<number, string>;
  etapasLiberadas: Record<number, boolean>;
  basePath: string;
  /** admin pode acessar etapas bloqueadas. */
  podeAbrirBloqueadas: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoMaterial>("todos");

  const totalAulas = materiais.filter((m) => m.tipo === "aula").length;
  const totalModelos = materiais.filter((m) => m.tipo === "modelo").length;

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = materiais.filter((m) => {
      if (tipo !== "todos" && m.tipo !== tipo) return false;
      if (!q) return true;
      return (
        m.titulo.toLowerCase().includes(q) ||
        m.tarefaTitulo.toLowerCase().includes(q) ||
        (etapaNomes[m.etapa] ?? "").toLowerCase().includes(q)
      );
    });
    const porEtapa = new Map<number, Material[]>();
    for (const m of filtrados) {
      if (!porEtapa.has(m.etapa)) porEtapa.set(m.etapa, []);
      porEtapa.get(m.etapa)!.push(m);
    }
    return [...porEtapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [materiais, busca, tipo, etapaNomes]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aula ou modelo..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip ativo={tipo === "todos"} onClick={() => setTipo("todos")}>
            Todos ({materiais.length})
          </Chip>
          <Chip ativo={tipo === "aula"} onClick={() => setTipo("aula")}>
            Aulas ({totalAulas})
          </Chip>
          <Chip ativo={tipo === "modelo"} onClick={() => setTipo("modelo")}>
            Modelos ({totalModelos})
          </Chip>
        </div>
      </div>

      {grupos.length === 0 ? (
        <EmptyState
          titulo="Nenhum material encontrado."
          descricao="Tente outra busca ou volte o filtro para “Todos”."
        />
      ) : (
        grupos.map(([etapa, itens]) => {
          const liberada = etapasLiberadas[etapa];
          const acessivel = liberada || podeAbrirBloqueadas;
          return (
            <div key={etapa}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">
                  Etapa {String(etapa).padStart(2, "0")} —{" "}
                  {etapaNomes[etapa] ?? ""}
                </h2>
                {!liberada ? (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Lock className="size-3" /> bloqueada
                  </Badge>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {itens.map((m, i) => (
                  <MaterialCard
                    key={`${m.etapa}-${m.tarefaNum}-${m.tipo}-${i}`}
                    material={m}
                    etapaHref={
                      acessivel ? `${basePath}/etapa/${m.etapa}` : null
                    }
                    // PL1 (decisão F.1) — o acervo abria o que a etapa
                    // trancava: 10 aulas/modelos das etapas 2, 3 e 4 tinham
                    // link ativo ao lado do badge "bloqueada". O card continua
                    // LISTADO (o aluno vê o que vem pela frente) e o link some
                    // até a etapa liberar. Admin e prévia (`podeAbrirBloqueadas`)
                    // continuam abrindo tudo.
                    liberado={acessivel}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function MaterialCard({
  material: m,
  etapaHref,
  liberado,
}: {
  material: Material;
  etapaHref: string | null;
  /** Etapa liberada (ou admin). `false` = material listado, sem link ativo. */
  liberado: boolean;
}) {
  const Icon = m.tipo === "aula" ? GraduationCap : FileText;
  return (
    <Card
      className={
        liberado
          ? "transition hover:border-primary/40"
          : // Mesma regra do card de etapa: estado por FORMA, nunca opacidade —
            // o título do material precisa continuar legível.
            "border-dashed bg-muted/20"
      }
    >
      <CardContent className="flex items-start gap-3 py-3">
        <div
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            (m.tipo === "aula"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground")
          }
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {m.tipo}
            </Badge>
            {etapaHref ? (
              <Link
                href={etapaHref}
                className="text-[11px] text-muted-foreground underline-offset-4 hover:text-accent-foreground hover:underline"
              >
                Tarefa {m.tarefaNum}
              </Link>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                Tarefa {m.tarefaNum}
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium" title={m.titulo}>
            {m.titulo}
          </div>
          <div className="mt-1">
            {!liberado ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                Libera com a Etapa {String(m.etapa).padStart(2, "0")}
              </span>
            ) : m.url ? (
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground underline-offset-4 hover:underline"
              >
                {m.tipo === "aula" ? "Assistir" : "Abrir modelo"}
                <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only">(abre em nova aba)</span>
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">
                Disponível em breve
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition " +
        (ativo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted")
      }
    >
      {children}
    </button>
  );
}
