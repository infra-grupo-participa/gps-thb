/**
 * Contrato de "tirar a estrela de vários alunos de uma vez".
 *
 * Espelha `gps.admin_remover_favorito_lote` (migração
 * `20261002000331_gps_admin_remover_favorito_lote.sql`): teto de 50 alunos e
 * motivo 3..300 são impostos NO BANCO; a constante aqui serve à validação
 * barata da action e à tela. Mudou lá, muda aqui. Motivo 3..300: usar
 * `MOTIVO_MIN`/`MOTIVO_MAX` de `@/lib/etapas-lote-tipos` (fonte única).
 *
 * Sem `"use server"`: este arquivo é importado por componentes cliente.
 */

export const FAVORITO_LOTE_MAXIMO = 50;
export type ResultadoItemFavoritoLote = "removido" | "sem_favorito" | "pulado";
export interface ItemFavoritoLote { alunoId: string; clienteId: string | null; resultado: ResultadoItemFavoritoLote; motivos: string[]; }
export interface ResultadoFavoritoLote { removidos: number; semFavorito: number; pulados: number; itens: ItemFavoritoLote[]; }
export interface EntradaFavoritoLote { alunoIds: string[]; motivo: string; simular: boolean; forcar: boolean; }
