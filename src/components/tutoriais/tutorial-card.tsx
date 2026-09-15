"use client";

/**
 * Card de um tutorial na listagem do aluno — fechado mostra título + resumo;
 * expandido mostra vídeo (se houver) + passo a passo (se houver) + feedback.
 *
 * Expansão INLINE, não rota própria (`/tutoriais/[id]` não existe — decisão
 * do plano). O controle do estado é manual (`aria-expanded`/`aria-controls`,
 * não `<details>/<summary>`) por dois motivos: (1) o iframe do YouTube só
 * pode montar DEPOIS do clique — `<details>` não avisa o momento certo sem
 * um listener a mais; (2) o link profundo por hash precisa abrir o card e
 * rolar até ele na montagem, o que é mais direto controlando o próprio
 * `useState` do que sincronizando com o estado nativo de `<details>`.
 *
 * 🔴 SEMPRE renderiza FECHADO na primeira passada (SSR e hidratação) — nunca
 * `useState(() => window.location...)`. O servidor não conhece `location.hash`;
 * inicializar por ele faz o cliente hidratar com um valor DIFERENTE do HTML
 * do servidor (React loga erro de hydration mismatch e repinta a árvore).
 *
 * O link profundo é lido por `useSyncExternalStore` (não `useState` +
 * `useEffect`/`useLayoutEffect` com `setState` no corpo): é o hook feito para
 * ler uma fonte de dado EXTERNA ao React (aqui, o hash da URL) com um
 * `getServerSnapshot` que devolve `false` no servidor — hidrata sem mismatch
 * e sem disparar `react-hooks/set-state-in-effect` (que reprovaria um
 * `setState` incondicional dentro de efeito, o defeito já corrigido uma vez
 * neste arquivo). O clique manual (abrir/fechar) continua em `useState`
 * separado; o card está aberto se QUALQUER um dos dois disser que sim.
 */

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import type { TutorialDoAluno } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { YoutubePlayer } from "@/components/videos/youtube-player";
import { FeedbackBotoes } from "@/components/tutoriais/feedback-botoes";
import { cn } from "@/lib/utils";

function inscreverHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function TutorialCard({
  tutorial,
  somenteLeitura = false,
}: {
  tutorial: TutorialDoAluno;
  /** `true` no espelho de assistência — repassado ao `FeedbackBotoes`. */
  somenteLeitura?: boolean;
}) {
  const domId = `t-${tutorial.id}`;

  // `true` quando o hash da URL aponta para ESTE card. Servidor sempre `false`
  // (ele não conhece `location.hash`) — hidrata sem mismatch.
  const abertoPeloHash = useSyncExternalStore(
    inscreverHash,
    () => window.location.hash === `#${domId}`,
    () => false,
  );
  // Estado do CLIQUE manual — independente do hash, para poder fechar um
  // card que abriu por link profundo (e reabrir um que o clique fechou).
  const [abertoPeloClique, setAbertoPeloClique] = useState(false);
  const aberto = abertoPeloHash || abertoPeloClique;

  // Rolar até o card é sincronizar com um sistema externo (a posição de
  // scroll do documento), não `setState` — só dispara quando o hash apontou
  // para este card, antes da pintura do browser (evita o piscar de posição).
  useLayoutEffect(() => {
    if (abertoPeloHash) {
      document.getElementById(domId)?.scrollIntoView({ block: "nearest" });
    }
  }, [abertoPeloHash, domId]);

  function alternar() {
    const proximo = !aberto;
    setAbertoPeloClique(proximo);
    // Reflete no hash SEM navegar (history.replaceState) — é o que permite a
    // equipe mandar "abre o tutorial X" por um link, sem existir rota própria.
    // `replaceState` não dispara `hashchange`, então não conflita com
    // `abertoPeloHash`: o clique manda sozinho a partir daqui.
    const url = new URL(window.location.href);
    url.hash = proximo ? domId : "";
    window.history.replaceState(null, "", proximo ? url.toString() : url.pathname + url.search);
  }

  return (
    <Card id={domId} className="scroll-mt-20">
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={`${domId}-painel`}
          className="foco-visivel flex w-full items-start justify-between gap-3 rounded-md text-left"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">{tutorial.titulo}</p>
            {tutorial.resumo ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{tutorial.resumo}</p>
            ) : null}
          </div>
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
              aberto && "rotate-180",
            )}
          />
        </button>

        {aberto ? (
          <div id={`${domId}-painel`} className="flex flex-col gap-4 border-t pt-3">
            {/* O iframe só monta ao expandir — nunca carregar N de uma vez. */}
            {tutorial.youtubeId ? (
              <YoutubePlayer youtubeId={tutorial.youtubeId} titulo={tutorial.titulo} />
            ) : null}

            {tutorial.passos.length > 0 ? (
              <ol className="grid gap-2 pl-5 text-sm [&>li]:list-decimal [&>li]:pl-1">
                {tutorial.passos.map((passo, i) => (
                  <li key={i}>{passo}</li>
                ))}
              </ol>
            ) : null}

            <FeedbackBotoes
              tutorialId={tutorial.id}
              minhaReacao={tutorial.minhaReacao}
              somenteLeitura={somenteLeitura}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
