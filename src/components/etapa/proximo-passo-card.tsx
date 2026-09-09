import Link from "next/link";
import { PlayCircle, ArrowRight, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { ProximoPasso } from "@/lib/etapas";

/**
 * "Continue de onde parou" — o elemento mais proeminente da home.
 *
 * 🔑 Ele tem DOIS estados, e a diferença é a razão do card existir:
 *
 * - **livre**: leva à etapa da próxima tarefa pendente;
 * - **bloqueado** (`passo.bloqueio`): TODAS as tarefas pendentes estão
 *   travadas. Antes disso, o card mandava o aluno para uma tarefa cinza, com
 *   o checkbox desabilitado — o card mais visível do produto era um beco sem
 *   saída. Agora ele diz o que destravar e leva para onde se destrava
 *   (Clientes), em vez de para a porta trancada.
 *
 * 🎨 Onda B (B3): a peça mais forte da home. Era uma tira de 70 px com laranja
 * a 5% embaixo de um hero de 200 px — o produto gritava a identidade e
 * sussurrava a tarefa. Ganhou elevação de repouso, ícone de 48 px, título em
 * `titulo-h2` e a AÇÃO em botão sólido.
 *
 * ⚠️ O botão é um `<span>` com as classes do `Button`, não um `<button>`: o
 * card inteiro é o `<a>`, e elemento interativo dentro de âncora é HTML
 * inválido (some do Tab e o clique disputa com a navegação). Aqui ele é
 * afordância visual da MESMA ação do link que o contém.
 */
export function ProximoPassoCard({
  passo,
  basePath,
}: {
  passo: ProximoPasso;
  basePath: string;
}) {
  // Contrato da Onda 1 (`src/lib/etapas.ts`): `bloqueio` só vem preenchido
  // quando TODAS as tarefas pendentes estão travadas — nunca há uma livre
  // esperando. Os dois valores possíveis ("Liste os 30 clientes" e "Escolha o
  // cliente que a equipe vai acompanhar") se resolvem na aba Clientes.
  const bloqueio = passo.bloqueio;

  if (bloqueio) {
    return (
      <Link
        href={`${basePath}/clientes`}
        // `min-w-0`: as linhas de dentro usam `truncate` (white-space:nowrap),
        // então o min-content do card é o texto INTEIRO. Sem isto o card se
        // recusa a encolher quando o pai é flex/grid e empurra o layout —
        // medido a 360 px: 750 px de largura, com barra horizontal na página.
        className="group flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-dashed bg-card px-5 py-5 shadow-(--shadow-raised) transition-[box-shadow,transform,border-color] duration-150 ease-out hover:-translate-y-px hover:border-borda-forte hover:shadow-(--shadow-hover)"
      >
        <div
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-superficie-afundada text-neutro-foreground"
        >
          <Lock className="size-6" />
        </div>
        <div className="min-w-40 flex-1">
          <div className="rotulo text-accent-foreground">
            Destrave o próximo passo
          </div>
          <div className="font-heading titulo-h2 text-balance">{bloqueio}</div>
          <div className="corpo-sm text-muted-foreground">
            Depois disso, o passo {passo.codigo} ({passo.titulo}) abre na Etapa{" "}
            {String(passo.etapa).padStart(2, "0")}.
          </div>
        </div>
        <span
          className={`${buttonVariants({ variant: "default" })} ml-auto shrink-0`}
        >
          Ir para Clientes
          <ArrowRight
            aria-hidden
            className="transition group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`${basePath}/etapa/${passo.etapa}`}
      className="group flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-primary/30 bg-card px-5 py-5 shadow-(--shadow-raised) transition-[box-shadow,transform,border-color] duration-150 ease-out hover:-translate-y-px hover:border-primary/60 hover:shadow-(--shadow-hover)"
    >
      <div
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground"
      >
        <PlayCircle className="size-6" />
      </div>
      <div className="min-w-40 flex-1">
        <div className="rotulo text-accent-foreground">
          Continue de onde parou
        </div>
        <div className="font-heading titulo-h2 text-balance">
          {passo.codigo}. {passo.titulo}
        </div>
        <div className="corpo-sm text-muted-foreground">
          Etapa {String(passo.etapa).padStart(2, "0")} — {passo.etapaNome}
        </div>
      </div>
      <span
        className={`${buttonVariants({ variant: "default" })} ml-auto shrink-0`}
      >
        Continuar
        <ArrowRight
          aria-hidden
          className="transition group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
