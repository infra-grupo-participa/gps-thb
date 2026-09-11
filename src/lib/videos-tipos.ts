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

/**
 * Entrada de `salvarVideo` (`src/app/admin/videos/actions.ts`).
 *
 * 🔴 MORA AQUI, não no arquivo da action. Módulo `"use server"` só pode
 * exportar função async — tipo exportado de lá passa pelo `tsc` e pelo
 * build, mas o Turbopack gera referência ao VALOR no chunk do servidor e a
 * página estoura em runtime com `ReferenceError: <Tipo> is not defined`.
 * Foi o que derrubou a tela de vídeos em 11/09/2026.
 */
export interface SalvarVideoInput {
  id?: string;
  titulo: string;
  descricao: string;
  url: string;
  /** `null` = vídeo GERAL, sem amarra a nenhuma etapa (`gps.videos.etapa`). */
  etapa: number | null;
  ordem: number;
}
