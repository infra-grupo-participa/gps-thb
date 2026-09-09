/**
 * Foco de volta ao gatilho — compartilhado entre o `index.tsx` (diálogo de
 * cancelamento) e o `interruptor-inscricoes.tsx` (diálogo de pausa), por isso
 * mora fora dos dois. Sem React: só `requestAnimationFrame` + `document`.
 */

/** Devolve o foco ao gatilho quando o diálogo fecha, se ele ainda existe. */
export function devolverFoco(ref: { current: HTMLButtonElement | null }) {
  requestAnimationFrame(() => {
    const el = ref.current;
    if (el && document.contains(el)) el.focus();
  });
}
