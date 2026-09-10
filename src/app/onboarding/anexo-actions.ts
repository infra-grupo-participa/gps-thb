"use server";

/**
 * A porta de DOWNLOAD do anexo do onboarding — a única leitura deste diretório.
 *
 * Por que existe: `urlDoAnexoOnboarding` mora em `src/lib/data/onboarding.ts`,
 * que é módulo de servidor e **não** é Server Action — um componente de
 * cliente não consegue chamá-la. E a URL **não pode** ser assinada durante o
 * render: ela vive 60 segundos, então nasceria morta em qualquer tela que
 * ficasse aberta mais do que isso, e ainda imprimiria um portador (quem tem a
 * URL entra) dentro do HTML de cada anexo — inclusive os que ninguém vai
 * abrir. O link é emitido no CLIQUE.
 *
 * 🔴 Isto NÃO é a fronteira. Quem decide é a policy
 * `gps_onboarding_anexo_select` em `storage.objects`, com a SESSÃO de quem
 * pede — nunca `service_role`. E a URL sai sempre com `download=`, nunca
 * inline: o MIME do objeto vem do que o cliente declarou no PUT, e servir
 * inline no domínio do Supabase é o vetor que o bucket do chamado já fechou.
 *
 * Arquivo separado de `actions.ts` de propósito, no mesmo molde de
 * `src/app/chamados/anexo-actions.ts`: aquele é o arquivo de ESCRITA entregue
 * pelo backend, e misturar as duas coisas obrigaria a reabrir o arquivo do
 * outro agente para acrescentar uma leitura.
 */

import { urlDoAnexoOnboarding } from "@/lib/data/onboarding";

export type ResultadoUrlAnexoOnboarding =
  | { ok: true; url: string }
  | { ok: false; erro: string };

export async function urlDeDownloadDoAnexoOnboarding(
  path: string,
  nome: string,
): Promise<ResultadoUrlAnexoOnboarding> {
  const url = await urlDoAnexoOnboarding(path, nome);
  if (!url) {
    // Uma frase só para todos os casos (não existe / não é seu / bucket fora
    // do ar): distinguir aqui transformaria a tela num oráculo sobre anexo
    // alheio — e este anexo é o contrato de um TERCEIRO. O motivo real fica
    // no `console.error` do servidor.
    return {
      ok: false,
      erro: "Não foi possível abrir este arquivo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url };
}
