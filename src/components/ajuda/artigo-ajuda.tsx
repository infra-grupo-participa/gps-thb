"use client";

/**
 * Um artigo da central de ajuda, como o PARCEIRO lê (Onda 5, 02/10/2026).
 *
 * Usado no painel "Como faço?" (`painel-ajuda.tsx`, origem `tela`/`busca`) e
 * na sugestão do diálogo de novo chamado (origem `chamado`).
 *
 * - `<details>/<summary>` nativo: abre e fecha com teclado e leitor de tela
 *   sem ARIA escrito à mão.
 * - Corpo SEMPRE como texto (`paragrafosDoCorpo`), nunca HTML — o artigo é
 *   texto curado pela equipe e o React escapa cada parágrafo.
 * - VISTA é registrada na 1ª abertura (por artigo + origem, na sessão da
 *   aba). Erro de vista é silencioso: não foi ação da pessoa.
 * - "Isso resolveu?" registra uma vez; o erro aparece na linha (`role=alert`).
 */

import { useState, useTransition } from "react";
import { registrarFeedbackAjuda } from "@/app/ajuda/actions";
import {
  paragrafosDoCorpo,
  type ArtigoAjuda,
  type OrigemAjuda,
} from "@/lib/ajuda-tipos";
import { Button } from "@/components/ui/button";

/** Vistas já registradas nesta aba do navegador — evita 1 vista por abre/fecha. */
const vistasRegistradas = new Set<string>();

function registrarVista(artigoId: string, origem: OrigemAjuda) {
  const chave = `${origem}:${artigoId}`;
  if (vistasRegistradas.has(chave)) return;
  vistasRegistradas.add(chave);
  // Silencioso de propósito (ver comentário do topo e de `registrarFeedbackAjuda`).
  registrarFeedbackAjuda({ artigoId, resolveu: null, origem }).catch(() => {});
}

export function ArtigoAjudaItem({
  artigo,
  origem,
  depoisDoNao,
}: {
  artigo: ArtigoAjuda;
  origem: OrigemAjuda;
  /** O que oferecer quando a resposta é "Não" (ex.: link para abrir chamado). */
  depoisDoNao?: React.ReactNode;
}) {
  const [voto, setVoto] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const paragrafos = paragrafosDoCorpo(artigo.corpo);

  function votar(resolveu: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await registrarFeedbackAjuda({ artigoId: artigo.id, resolveu, origem });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setVoto(resolveu);
    });
  }

  return (
    <details
      className="group border-b last:border-b-0"
      onToggle={(e) => {
        if (e.currentTarget.open) registrarVista(artigo.id, origem);
      }}
    >
      <summary className="foco-visivel flex list-none [&::-webkit-details-marker]:hidden min-h-11 cursor-pointer items-center gap-2 py-2 corpo-sm font-medium">
        <span aria-hidden className="inline-block w-3 shrink-0 text-muted-foreground group-open:rotate-90">
          ›
        </span>
        <span className="min-w-0">{artigo.titulo}</span>
      </summary>

      <div className="grid gap-2 pb-3 pl-5">
        {paragrafos.map((p, i) => (
          <p key={i} className="corpo-sm">
            {p}
          </p>
        ))}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {voto === null ? (
            <>
              <span className="corpo-sm text-muted-foreground">Isso resolveu?</span>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-16"
                disabled={pendente}
                onClick={() => votar(true)}
              >
                Sim
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-16"
                disabled={pendente}
                onClick={() => votar(false)}
              >
                Não
              </Button>
            </>
          ) : null}
          <p role="status" className="corpo-sm text-muted-foreground empty:hidden">
            {voto === true
              ? "Obrigado. Registramos que isso resolveu."
              : voto === false
                ? "Obrigado pelo retorno."
                : null}
          </p>
          {voto === false && depoisDoNao ? depoisDoNao : null}
        </div>
        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {erro}
        </p>
      </div>
    </details>
  );
}
