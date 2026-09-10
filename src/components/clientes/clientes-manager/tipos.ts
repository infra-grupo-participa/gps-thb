import type { GrauRelacao } from "@/lib/types";

/** Ordem da LISTA de clientes (o quadro não ordena — a coluna é a ordem). */
export type Ordenacao = "recentes" | "nome" | "perda" | "reuniao";

/**
 * Valor do filtro de grau de relação.
 *
 * `"nao_informado"` é um valor de FILTRO, não um grau: ele não existe no CHECK
 * do banco nem em `GRAUS_RELACAO_UI`. Existe aqui porque 878 clientes estão sem
 * grau preenchido e "quem eu ainda não classifiquei" é a pergunta mais útil da
 * tela no dia 1 (migração ...202 nasceu com backfill zero).
 */
export type FiltroGrau = GrauRelacao | "nao_informado";

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
