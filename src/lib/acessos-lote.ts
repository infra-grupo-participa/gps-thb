/**
 * Limites do lote de criação de acesso — fora de `src/app/admin/actions.ts` de
 * propósito.
 *
 * 🔴 **Um arquivo `"use server"` só pode exportar função async.** A constante
 * nasceu dentro de `actions.ts` (`export const LOTE_ACESSOS_MAXIMO = 20`) e
 * isso invalidava o módulo INTEIRO para o cliente: o Turbopack respondia
 * *"Export criarAcessosEmLote doesn't exist in target module — the module has
 * no exports at all"* e a tela de `/admin` caía em 500. Não era erro de
 * digitação numa linha: era um `export` a mais derrubando os 12 vizinhos, e
 * `tsc --noEmit` não vê nada disso.
 *
 * O número tem de existir nos DOIS lados — o botão diz o teto e a action o
 * impõe —, então ele mora aqui, num módulo neutro que os dois importam. Cópia
 * seria a chance de a tela prometer 20 e o servidor aceitar 10.
 */

/**
 * Quantos acessos por clique.
 *
 * A Resend limita 10 requisições por segundo e a action pausa
 * {@link LOTE_PAUSA_MS} entre os envios: 20 × 150 ms ≈ 3 s de fila, ~6,7 req/s.
 * O war-room de 09/09 perdeu 11 de 20 e-mails exatamente por não ter essa
 * conta feita antes de começar.
 */
export const LOTE_ACESSOS_MAXIMO = 20;

/** Pausa ENTRE envios (não antes do primeiro). */
export const LOTE_PAUSA_MS = 150;
