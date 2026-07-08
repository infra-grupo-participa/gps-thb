import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import type { Aluno } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

/**
 * Sinaliza claramente que o admin está DENTRO do ambiente de um aluno
 * (modo assistência), para não confundir com o painel principal do admin:
 * - barra informativa no topo;
 * - moldura laranja em volta da tela;
 * - etiqueta fixa no canto com o nome do aluno e atalho para voltar.
 */
export function AssistBanner({ aluno }: { aluno: Aluno | null }) {
  const nome = aluno?.nome ?? "aluno";

  return (
    <>
      {/* Moldura ao redor da tela */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 border-[3px] border-primary"
      />

      {/* Barra informativa */}
      <div className="border-b border-primary/30 bg-primary/10">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm">
          <Badge className="gap-1">
            <ShieldCheck className="size-3" /> Modo assistência
          </Badge>
          <span className="text-muted-foreground">
            Você está no ambiente de{" "}
            <span className="font-medium text-foreground">{nome}</span>. As
            alterações são salvas na conta do aluno.
          </span>
        </div>
      </div>

      {/* Etiqueta fixa no canto */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-primary/40 bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg">
        <ShieldCheck className="size-3.5" />
        <span className="max-w-[40vw] truncate">Assistindo: {nome}</span>
        <Link
          href="/admin"
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/20 px-2 py-0.5 hover:bg-primary-foreground/30"
        >
          <ArrowLeft className="size-3" /> Sair
        </Link>
      </div>
    </>
  );
}
