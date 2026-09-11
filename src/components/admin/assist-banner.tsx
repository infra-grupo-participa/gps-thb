import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import type { Aluno } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { PreviaAlunoToggle } from "@/components/admin/previa-aluno";

/**
 * Sinaliza claramente que o admin está DENTRO do ambiente de um aluno
 * (modo assistência), para não confundir com o painel principal do admin:
 * - barra informativa no topo;
 * - moldura laranja em volta da tela;
 * - etiqueta fixa no canto com o nome do aluno e atalho para voltar.
 *
 * Os três somem na pré-visualização "como o aluno vê" (`previa-oculta`); a
 * pílula que liga/desliga a prévia fica FORA do trecho oculto, senão não
 * haveria como sair dela.
 */
export function AssistBanner({ aluno }: { aluno: Aluno | null }) {
  const nome = aluno?.nome ?? "parceiro";

  return (
    <>
      {/* Faixa superior de 4 px, no lugar da moldura de 3 px em `fixed
          inset-0`: a moldura atravessava o header e encostava no conteúdo sem
          respiro — parecia erro de renderização, não sinal de contexto. E,
          por ser `fixed`, passava POR CIMA da marca no canto superior
          esquerdo. Uma faixa no fluxo não cobre nada. */}
      <div aria-hidden className="previa-oculta h-1 w-full bg-primary" />

      {/* Barra informativa */}
      <div className="previa-oculta border-b border-primary/30 bg-accent">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
          <Badge icone={ShieldCheck}>Modo assistência</Badge>
          <span className="text-muted-foreground">
            Você está no ambiente de{" "}
            <span className="font-medium text-foreground">{nome}</span>. As
            alterações são salvas na conta do parceiro.
          </span>
        </div>
      </div>

      {/* Etiqueta fixa no canto. `z-30` (era 50): abaixo de diálogo e toast,
          senão a pílula cobria o que o admin acabou de abrir.
          `data-assistindo` é o gancho da regra do `globals.css` que dá
          `padding-bottom` ao `<main>` — a pílula é `fixed`, não ocupa espaço no
          fluxo e COBRIA o fim do conteúdo (na foto do diagnóstico, o card da
          Etapa 06). Uma regra, em vez de um `pb-*` esquecido na página nova. */}
      <div data-assistindo className="previa-oculta fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-marca-solida px-3 py-1.5 text-xs font-medium text-white shadow-(--shadow-hover)">
        <ShieldCheck className="size-3.5" />
        <span className="max-w-[40vw] truncate">Assistindo: {nome}</span>
        <Link
          href="/admin"
          // Branco sobre `primary-foreground/20` (laranja clareado) dava 2,47:1.
          // Fundo branco sólido com o texto no laranja escuro: 5,75:1.
          className="foco-visivel ml-1 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-semibold text-accent-foreground hover:bg-white/90"
        >
          <ArrowLeft className="size-3" /> Sair
        </Link>
      </div>

      <PreviaAlunoToggle />
    </>
  );
}
