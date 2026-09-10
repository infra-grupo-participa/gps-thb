"use client";

import { useLayoutEffect } from "react";

/**
 * "Volte para onde eu parei" — a âncora do painel.
 *
 * 🔑 Âncora por **`alunoId`, nunca por pixel**. Salvar `scrollY` falha
 * exatamente no caso que o pedido descreve: a lista é filtrada NO CLIENTE, o
 * navegador restaura a rolagem antes de a lista ter altura e o admin cai no
 * topo. Pior: o lote pode ter mudado (`?mais=`) e o mesmo pixel aponta para
 * outra pessoa.
 *
 * 🔑 `sessionStorage`, não `localStorage`: morre com a aba, e o que fica
 * guardado é um uuid opaco — nunca nome, e-mail ou telefone.
 *
 * 🔴 **Se o aluno não estiver na lista atual, não faz nada.** Rolar para o
 * lugar errado é pior do que não rolar: o admin acharia que está olhando o
 * card de quem ele abriu.
 *
 * 🔑 O destaque é aplicado **direto no DOM** (`data-ancorado`), sem estado de
 * React. É o caso que o `useLayoutEffect` existe para atender — sincronizar
 * com um sistema externo (a página) — e evita re-renderizar a lista inteira
 * duas vezes por causa de um anel que dura 2,6 s.
 */
const CHAVE = "gps.admin.painel.ultimoAluno";

/** Chamado no clique do card, antes de sair da página. */
export function marcarUltimoAluno(alunoId: string) {
  try {
    sessionStorage.setItem(CHAVE, alunoId);
  } catch {
    // Aba anônima com storage bloqueado: a âncora é conforto, não função.
  }
}

/**
 * Rola até o card de onde o admin saiu e o destaca por instantes.
 *
 * Roda **depois** de a lista filtrada existir no DOM (ela é calculada durante
 * o render), que é a condição que o `scrollY` não conseguia satisfazer.
 *
 * A chave é consumida numa tentativa só: sem isso, mudar o filtro cinco
 * minutos depois faria a tela pular sozinha para um card que ninguém pediu.
 */
export function useAncoraDoPainel(): void {
  useLayoutEffect(() => {
    let alvo: string | null = null;
    try {
      alvo = sessionStorage.getItem(CHAVE);
      if (alvo) sessionStorage.removeItem(CHAVE);
    } catch {
      return;
    }
    if (!alvo) return;

    const el = document.querySelector<HTMLElement>(
      `[data-aluno-id="${CSS.escape(alvo)}"]`,
    );
    if (!el) return; // filtro mudou: não rola para o lugar errado

    el.setAttribute("data-ancorado", "");
    // `behavior: "auto"` e não `"smooth"`: quem pede menos movimento não deve
    // levar um deslize de página inteira, e aqui o destino importa mais do que
    // o trajeto.
    el.scrollIntoView({ block: "center", behavior: "auto" });

    // O anel some sozinho: é um "olha, é este", não um estado permanente.
    const t = setTimeout(() => el.removeAttribute("data-ancorado"), 2600);
    return () => {
      clearTimeout(t);
      el.removeAttribute("data-ancorado");
    };
  }, []);
}
