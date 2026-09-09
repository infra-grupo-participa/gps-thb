import Link from "next/link";
import { PlayCircle, ArrowRight, Lock } from "lucide-react";
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
        className="group flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed border-primary/40 bg-muted/30 px-5 py-4 transition hover:border-primary/60 hover:bg-muted/50"
      >
        <div
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
        >
          <Lock className="size-5" />
        </div>
        <div className="min-w-40 flex-1">
          <div className="rotulo text-accent-foreground">
            Destrave o próximo passo
          </div>
          <div className="font-medium">{bloqueio}</div>
          <div className="truncate text-sm text-muted-foreground">
            Depois disso, o passo {passo.codigo} ({passo.titulo}) abre na Etapa{" "}
            {String(passo.etapa).padStart(2, "0")}.
          </div>
        </div>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent-foreground">
          Ir para Clientes
          <ArrowRight
            aria-hidden
            className="size-4 transition group-hover:translate-x-0.5"
          />
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`${basePath}/etapa/${passo.etapa}`}
      className="group flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 transition hover:border-primary/60 hover:bg-primary/10"
    >
      <div
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
      >
        <PlayCircle className="size-6" />
      </div>
      <div className="min-w-40 flex-1">
        <div className="rotulo text-accent-foreground">
          Continue de onde parou
        </div>
        <div className="truncate font-medium">
          {passo.codigo}. {passo.titulo}
        </div>
        <div className="truncate text-sm text-muted-foreground">
          Etapa {String(passo.etapa).padStart(2, "0")} — {passo.etapaNome}
        </div>
      </div>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent-foreground">
        Continuar
        <ArrowRight
          aria-hidden
          className="size-4 transition group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
