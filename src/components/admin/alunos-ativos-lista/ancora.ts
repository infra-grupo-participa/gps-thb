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
 *
 * 🔴 **A marca tem VALIDADE.** A chave só era consumida quando a lista
 * MONTAVA — e a aba "Alunos ativos" desmonta quando o admin vai para
 * "Plantão". Sair por outra aba e voltar meia hora depois fazia a tela pular
 * sozinha para um card que ninguém pediu, que é exatamente o caso que este
 * arquivo existe para evitar. Agora a marca guarda o instante e vence em
 * {@link VALIDADE_MS}: passou disso, é lixo e é descartada sem rolar nada.
 */
const CHAVE = "gps.admin.painel.ultimoAluno";

/** Quanto tempo a marca "eu saí deste card" continua valendo. */
const VALIDADE_MS = 10 * 60 * 1000;

/** Chamado no clique do card, antes de sair da página. */
export function marcarUltimoAluno(alunoId: string) {
  try {
    // `id|timestamp`: um `JSON.parse` a menos e o formato antigo (só o id)
    // simplesmente não casa o `split`, então vence por ausência de data.
    sessionStorage.setItem(CHAVE, `${alunoId}|${Date.now()}`);
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
 * A chave é consumida numa tentativa só — e vence em {@link VALIDADE_MS}, para
 * o caso em que a lista nem chega a montar (o admin saiu pela aba Plantão).
 */
export function useAncoraDoPainel(): void {
  useLayoutEffect(() => {
    let bruto: string | null = null;
    try {
      bruto = sessionStorage.getItem(CHAVE);
      // Consome SEMPRE que existir: uma tentativa só, válida ou vencida.
      if (bruto) sessionStorage.removeItem(CHAVE);
    } catch {
      return;
    }
    if (!bruto) return;

    const [alvo, carimbo] = bruto.split("|");
    const marcadoEm = Number(carimbo);
    if (!alvo || !Number.isFinite(marcadoEm)) return;
    if (Date.now() - marcadoEm > VALIDADE_MS) return; // marca velha: não rola

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
