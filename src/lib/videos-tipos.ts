/** Retorno padrão das Server Actions de vídeos — mesmo shape de chamados/plantão. */
export type ResultadoAcao = { ok: true } | { ok: false; erro: string };

/**
 * Limites de campo — espelham exatamente os CHECKs de `gps.video_salvar`
 * (migração `20260911000251_gps_videos_biblioteca.sql`): título 3..200,
 * descrição até 2.000. Mudar aqui sem mudar o banco (ou vice-versa) faz a
 * validação do cliente e a da RPC divergirem silenciosamente.
 */
export const VIDEO_TITULO_MINIMO = 3;
export const VIDEO_TITULO_MAXIMO = 200;
export const VIDEO_DESCRICAO_MAXIMO = 2000;
