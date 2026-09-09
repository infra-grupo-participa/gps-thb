"use server";

/**
 * A porta de DOWNLOAD do anexo — a única escrita-zero deste diretório.
 *
 * Por que existe (desvio consciente do contrato §14, que não previu nada para
 * o download): `urlAssinadaDoAnexo` mora em `chamados-data.ts`, que é
 * `server-only` e não é Server Action — um componente de cliente não consegue
 * chamá-la. E a URL **não pode** ser assinada durante o render da thread: ela
 * vive 60 segundos, então nasceria morta em qualquer tela que ficasse aberta
 * mais do que isso (e ainda vazaria um portador para dentro do HTML de cada
 * mensagem, mesmo as que ninguém vai baixar). O link é emitido no clique.
 *
 * 🔴 Isto NÃO é a fronteira. A policy `gps_chamados_anexo_select` decide quem
 * assina o quê, com a sessão do usuário — nunca `service_role`. Além dela,
 * `urlAssinadaDoAnexo` confere que o `path` casa com `<uuid>/<uuid>.<ext>`,
 * que existe uma mensagem VISÍVEL para quem pede e que o anexo ainda não foi
 * expurgado.
 *
 * Arquivo separado de `actions.ts` de propósito: aquele é o arquivo de ESCRITA
 * (abrir/responder/fechar/upload) entregue pelo backend nesta mesma fase, e
 * misturar as duas coisas obrigaria a reabrir o arquivo do outro agente para
 * acrescentar uma leitura.
 */

import { urlAssinadaDoAnexo } from "@/lib/chamados-data";

export type ResultadoUrlAnexo =
  | { ok: true; url: string }
  | { ok: false; erro: string };

/**
 * Devolve a URL assinada (60 s, `download=`) de um anexo da thread.
 *
 * O `nome` do arquivo baixado vem da TABELA, não daqui — quem assina lê
 * `anexo_nome` da mensagem. O parâmetro existe só como último recurso quando a
 * coluna está vazia.
 */
export async function urlDeDownloadDoAnexo(
  path: string,
  nome: string,
): Promise<ResultadoUrlAnexo> {
  const url = await urlAssinadaDoAnexo(path, nome);
  if (!url) {
    // Uma frase só para os três casos (não existe / não é seu / foi
    // expurgado): distinguir aqui transformaria a tela num oráculo sobre
    // anexo alheio. O motivo real fica no `console.error` do servidor.
    return {
      ok: false,
      erro: "Não foi possível abrir este anexo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url };
}
