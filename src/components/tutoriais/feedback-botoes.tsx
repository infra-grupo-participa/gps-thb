"use client";

/**
 * Útil / Não útil — feedback do aluno sobre um tutorial (feature "Aba de
 * Tutoriais", 15/09/2026). Clicar no botão já marcado DESMARCA (`util: null`)
 * — é a mesma pessoa dizendo "quero retirar meu voto", não um terceiro botão.
 *
 * 🔴 SEM estado otimista. O precedente `etapas-controle` já foi corrigido por
 * marcar/desmarcar na tela antes de a action confirmar — aqui o placar (e o
 * ícone pressionado) só muda depois que `reagirTutorial` devolve `{ ok: true }`.
 * Toast só em sucesso; erro fica só no `toast.error`, sem otimismo para desfazer.
 *
 * `somenteLeitura` — espelho de assistência (`/admin/aluno/[id]/tutoriais`):
 * `gps.pessoa_atual()` é NULL para o admin, então `reagirTutorial` sempre
 * recusa com 42501 ali. Em vez de deixar o clique falhar sempre (ruído numa
 * tela que existe para responder "o que você está vendo aí?"), os botões
 * ficam DESABILITADOS com `title`/`aria-label` explicando que o voto é do
 * parceiro. Não somem: a prévia existe para mostrar o que o aluno vê.
 *
 * ⚠️ Em `somenteLeitura`, `minhaReacao` chega SEMPRE `null` — a mesma
 * `pessoa_atual()` NULL que barra o voto também faz a RPC devolver o campo
 * vazio para o admin. Ou seja, `aria-pressed` nunca fica `true` ali e o
 * sufixo "(marcado)" do `aria-label` não é alcançável hoje. Os dois ramos
 * ficam de propósito: se um dia a equipe puder ver o voto (decisão de
 * produto + coluna nova na RPC, hoje barrada por LGPD), o rótulo acessível
 * já acompanha. **Não é engano de leitura — é ramo defensivo declarado.**
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { reagirTutorial } from "@/app/tutoriais/actions";

export function FeedbackBotoes({
  tutorialId,
  minhaReacao,
  somenteLeitura = false,
}: {
  tutorialId: string;
  /** `null` = a pessoa não votou ainda. */
  minhaReacao: boolean | null;
  /** `true` no espelho de assistência — vota é o aluno, admin só observa. */
  somenteLeitura?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function votar(util: boolean) {
    if (somenteLeitura) return;
    // Clicar no botão já marcado desmarca.
    const proximo = minhaReacao === util ? null : util;
    startTransition(async () => {
      const res = await reagirTutorial(tutorialId, proximo);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      // 🔴 `minhaReacao` vem por PROP do servidor. Sem o refresh, o voto grava
      // no banco, o toast diz "obrigado" e o botão continua sem marcar até a
      // pessoa recarregar a página — ela clicaria de novo achando que falhou,
      // e o segundo clique DESMARCA (o toggle acima). O `revalidatePath` da
      // action invalida o cache do servidor; é este `refresh` que manda a
      // árvore repintar com o valor novo.
      //
      // Continua SEM estado otimista: o refresh só acontece depois do
      // `{ ok: true }`, então a tela nunca mostra um voto que não gravou.
      router.refresh();
      toast.success(
        proximo === null
          ? "Seu voto foi retirado."
          : "Obrigado pelo retorno!",
      );
    });
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Este tutorial foi útil?">
      <span className="text-xs text-muted-foreground">Este tutorial ajudou?</span>
      <button
        type="button"
        aria-pressed={minhaReacao === true}
        disabled={pending || somenteLeitura}
        title={somenteLeitura ? "O voto é do parceiro — a equipe só observa." : undefined}
        aria-label={
          somenteLeitura
            ? `Útil — voto do parceiro, a equipe só observa${minhaReacao === true ? " (marcado)" : ""}`
            : undefined
        }
        onClick={() => votar(true)}
        className={cn(
          "foco-visivel inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
          minhaReacao === true
            ? "border-sucesso bg-sucesso text-sucesso-foreground"
            : "border-borda-fina text-muted-foreground hover:border-borda-forte hover:text-foreground",
        )}
      >
        <ThumbsUp className="size-3.5" aria-hidden />
        Útil
      </button>
      <button
        type="button"
        aria-pressed={minhaReacao === false}
        disabled={pending || somenteLeitura}
        title={somenteLeitura ? "O voto é do parceiro — a equipe só observa." : undefined}
        aria-label={
          somenteLeitura
            ? `Não útil — voto do parceiro, a equipe só observa${minhaReacao === false ? " (marcado)" : ""}`
            : undefined
        }
        onClick={() => votar(false)}
        className={cn(
          "foco-visivel inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-60",
          minhaReacao === false
            ? "border-risco bg-risco text-risco-foreground"
            : "border-borda-fina text-muted-foreground hover:border-borda-forte hover:text-foreground",
        )}
      >
        <ThumbsDown className="size-3.5" aria-hidden />
        Não útil
      </button>
    </div>
  );
}
