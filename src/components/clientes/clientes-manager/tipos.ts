/** Ordem da LISTA de clientes (o quadro não ordena — a coluna é a ordem). */
export type Ordenacao = "recentes" | "nome" | "perda" | "reuniao";

/**
 * Rótulo de cada ordenação — UM lugar só, lido pelo `<SelectValue>` (que sem
 * função de render imprimiria `recentes`/`perda`) e pelos `<SelectItem>`.
 */
export const ROTULO_ORDENACAO: Record<Ordenacao, string> = {
  recentes: "mais recentes",
  nome: "nome",
  perda: "maior perda",
  reuniao: "data da reunião",
};
