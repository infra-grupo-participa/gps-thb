import Link from "next/link";
import { NotebookPen } from "lucide-react";
import type { ResumoDiario, TipoNota } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  ROTULO_VOZ,
  ROTULO_TIPO,
  variantePorTipo,
} from "@/components/admin/diario-labels";
import { formatarDataHora } from "@/lib/datas";
import { cn } from "@/lib/utils";

const TAMANHO_TRUNCAGEM = 220;

function truncar(texto: string, tamanho: number): string {
  if (texto.length <= tamanho) return texto;
  return texto.slice(0, tamanho).trimEnd() + "…";
}

/**
 * Faixa lateral de 3 px na cor do TIPO da nota. É o que dá forma própria a
 * este card: no modo assistência ele, o "Continue de onde parou" e o "Cliente
 * acompanhado" eram três tiras idênticas em sequência (mesmo retângulo, mesmo
 * chip de ícone à esquerda, duas delas com o mesmo fundo laranja claro), e o
 * admin não distinguia "aviso da equipe" de "estado do aluno" pela forma.
 *
 * A cor segue a MESMA regra do badge (`variantePorTipo`): pendência aberta é
 * risco, pendência resolvida e as demais notas são neutras. Cor sozinha não é
 * informação — o badge com rótulo continua ao lado (WCAG 1.4.1).
 */
function corDaFaixa(tipo: TipoNota, resolvida: boolean): string {
  if (tipo === "pendencia" && !resolvida) return "before:bg-risco-foreground";
  if (tipo === "duvida") return "before:bg-atencao-foreground";
  if (tipo === "combinado") return "before:bg-sucesso-foreground";
  return "before:bg-borda-forte";
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
        className="previa-oculta group relative flex items-center gap-4 overflow-hidden rounded-xl border border-dashed bg-card py-3 pr-4 pl-5 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-borda-forte hover:bg-muted/40"
      >
        <NotebookPen
          aria-hidden
          className="size-5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <div className="rotulo text-muted-foreground">Diário do parceiro</div>
          <div className="corpo-sm text-muted-foreground">
            Nenhuma nota registrada — registre a primeira.
          </div>
        </div>
        <span className="text-sm font-medium text-accent-foreground">
          Registrar
        </span>
      </Link>
    );
  }

  const nota = resumo.ultima;
  const resolvida = Boolean(nota.resolvido_em);

  return (
    // `flat` de propósito (sem sombra, sem laranja): esta é a voz da EQUIPE
    // sobre o aluno — contexto, não a ação da tela. Quem levanta da página no
    // modo assistência é o "Continue de onde parou".
    <Link
      href={hrefDiario}
      className={cn(
        "previa-oculta group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card py-3 pr-4 pl-5 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4",
        corDaFaixa(nota.tipo, resolvida),
      )}
    >
      <NotebookPen
        aria-hidden
        className="size-5 shrink-0 text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className="rotulo text-muted-foreground">Diário do parceiro</span>
          <Badge variant="outline" className="text-[10px]">
            {ROTULO_VOZ[nota.voz]}
          </Badge>
          <Badge
            variant={variantePorTipo(nota.tipo, resolvida)}
            className="text-[10px]"
          >
            {ROTULO_TIPO[nota.tipo]}
          </Badge>
        </div>
        <p className="truncate text-sm">
          {truncar(nota.texto, TAMANHO_TRUNCAGEM)}
        </p>
        <div className="text-xs text-muted-foreground">
          {nota.autor_nome ?? "Equipe"} · {formatarDataHora(nota.criado_em)}
        </div>
      </div>
      {resumo.pendenciasAbertas > 0 ? (
        <Badge variant="danger" className="shrink-0">
          {resumo.pendenciasAbertas}{" "}
          {resumo.pendenciasAbertas === 1 ? "pendência" : "pendências"}
        </Badge>
      ) : null}
    </Link>
  );
}
