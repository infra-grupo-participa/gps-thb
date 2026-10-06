/**
 * Chamada de Server Action a partir do navegador, sem derrubar a tela.
 *
 * 🔴 Por que existe (06/10/2026, chamado da Gabriela Gavioli): o push na
 * `main` publica sozinho. Uma aba aberta ANTES da publicação continua com os
 * ids de ação da versão anterior; ao enviar, o servidor responde "Failed to
 * find Server Action" e a action LANÇA em vez de devolver `{ ok:false }`.
 * Dentro de `startTransition` isso subia até o `error.tsx` ("erro de rota")
 * e a mensagem digitada se perdia. Aqui a exceção vira frase na tela e o
 * formulário fica como estava.
 */

import { unstable_isUnrecognizedActionError } from "next/navigation";

export type FalhaDeChamada = { ok: false; erro: string };

const VERSAO_ANTIGA =
  /server action|failed-to-find-server-action|was not found on the server/i;

export function frasePorFalhaDeChamada(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (unstable_isUnrecognizedActionError(e) || VERSAO_ANTIGA.test(msg)) {
    return "O sistema foi atualizado. Copie seu texto, recarregue a página (F5) e envie de novo.";
  }
  return "Não foi possível enviar agora. Confira a internet e tente de novo.";
}

/** Executa a action; exceção de transporte vira `{ ok:false, erro }`. */
export async function chamarAcao<T>(
  acao: () => Promise<T>,
): Promise<T | FalhaDeChamada> {
  try {
    return await acao();
  } catch (e) {
    return { ok: false, erro: frasePorFalhaDeChamada(e) };
  }
}
