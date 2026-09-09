import Link from "next/link";
import { NotebookPen, AlertCircle } from "lucide-react";
import type { ResumoDiario } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_VOZ,
  ROTULO_TIPO,
  variantePorTipo,
  formatarDataHora,
} from "@/components/admin/diario-labels";

const TAMANHO_TRUNCAGEM = 220;

function truncar(texto: string, tamanho: number): string {
  if (texto.length <= tamanho) return texto;
  return texto.slice(0, tamanho).trimEnd() + "…";
}

/**
 * Card do topo do Modo Assistência: última nota do diário da EQUIPE +
 * pendências abertas. Estado vazio é caminho normal (aluno novo), não erro.
 */
export function DiarioResumoCard({
  resumo,
  basePath,
}: {
  resumo: ResumoDiario;
  basePath: string;
}) {
  const hrefDiario = `${basePath}/diario`;

  if (!resumo.ultima) {
    return (
      <Link
        href={hrefDiario}
        className="previa-oculta group flex items-center gap-4 rounded-xl border border-dashed px-5 py-4 transition hover:border-primary/50 hover:bg-muted/40"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <NotebookPen className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Diário do aluno
          </div>
          <div className="text-sm text-muted-foreground">
            Nenhuma nota registrada — registre a primeira.
          </div>
        </div>
        <span className="text-sm font-medium text-primary">Registrar</span>
      </Link>
    );
  }

  const nota = resumo.ultima;

  return (
    <Link
      href={hrefDiario}
      className="previa-oculta group flex flex-col gap-3 rounded-xl border px-5 py-4 transition hover:border-primary/50 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <NotebookPen className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Diário do aluno
          </span>
          <Badge variant="outline" className="text-[10px]">
            {ROTULO_VOZ[nota.voz]}
          </Badge>
          <Badge
            variant={variantePorTipo(nota.tipo, Boolean(nota.resolvido_em))}
            className="text-[10px]"
          >
            {ROTULO_TIPO[nota.tipo]}
          </Badge>
        </div>
        <p className="truncate text-sm">{truncar(nota.texto, TAMANHO_TRUNCAGEM)}</p>
        <div className="text-xs text-muted-foreground">
          {nota.autor_nome ?? "Equipe"} · {formatarDataHora(nota.criado_em)}
        </div>
      </div>
      {resumo.pendenciasAbertas > 0 ? (
        <Badge variant="destructive" className="shrink-0 gap-1">
          <AlertCircle className="size-3" />
          {resumo.pendenciasAbertas}{" "}
          {resumo.pendenciasAbertas === 1 ? "pendência" : "pendências"}
        </Badge>
      ) : null}
    </Link>
  );
}
