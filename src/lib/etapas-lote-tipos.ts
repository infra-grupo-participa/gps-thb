/**
 * Contrato da liberação de etapa EM LOTE (N alunos × N etapas).
 *
 * Espelha `gps.admin_definir_liberacao_etapas_lote` (migração
 * `…_gps_admin_liberacao_etapas_lote.sql`): teto de 50 alunos e motivo 3..300
 * são impostos NO BANCO; as constantes aqui servem à validação barata da
 * action e ao `maxLength` da tela. Mudou lá, muda aqui.
 *
 * Sem `"use server"`: este arquivo é importado por componentes cliente.
 */

export const LOTE_ETAPAS_MAX_ALUNOS = 50;
export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 300; // mesmo CHECK de gps.etapa_liberacao_aluno.motivo

/** `liberada: null` = volta à regra geral (`gps.etapas.liberada`). */
export type ItemLiberacaoEtapa = { etapa: number; liberada: boolean | null };

/** Só os pares (aluno, etapa) que de fato mudaram. `liberada` é o override pedido. */
export type ItemAlterado = {
  aluno_id: string;
  etapa: number;
  liberada: boolean | null;
  removido: boolean;
};

export type ResultadoLoteEtapas = {
  alterados: number;
  semMudanca: number;
  itens: ItemAlterado[];
};
