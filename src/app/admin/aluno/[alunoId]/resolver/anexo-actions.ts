"use server";

/**
 * A porta de DOWNLOAD dos anexos do questionário inicial na Central — a única
 * leitura desta rota que precisa acontecer no CLIQUE.
 *
 * Por que existe: `urlDoAnexoOnboarding` mora em `src/lib/data/onboarding.ts`,
 * que roda só no servidor e não é Server Action — a Central é um Client
 * Component e não consegue chamá-la. E a URL **não pode** ser assinada durante
 * o render: ela vive 60 segundos, então nasceria morta em qualquer tela aberta
 * por mais tempo do que isso, e ainda imprimiria um portador (quem tem a URL,
 * baixa) no HTML de cada anexo — inclusive os que ninguém vai abrir.
 * Precedente literal: `src/app/chamados/anexo-actions.ts`.
 *
 * 🔴 Isto NÃO é a fronteira. Quem decide é a policy
 * `gps_onboarding_anexo_select` em `storage.objects`, avaliada com a SESSÃO de
 * quem chama — nunca `service_role`. O `ehAdmin()` daqui só estreita: esta
 * porta é da Central, que é tela de admin.
 *
 * 🔴 A URL sai SEMPRE com `download=` (quem monta é `urlDoAnexoOnboarding`). O
 * MIME de um objeto de storage é o que o cliente declarou no PUT: servir inline
 * é o que transforma um "PNG" em HTML executando no domínio do portal.
 */

import { ehAdmin } from "@/lib/auth";
import { urlDoAnexoOnboarding } from "@/lib/data";

export type ResultadoUrlAnexoOnboarding =
  | { ok: true; url: string }
  | { ok: false; erro: string };

export async function urlDoAnexoDoQuestionario(
  path: string,
  nome: string,
): Promise<ResultadoUrlAnexoOnboarding> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const url = await urlDoAnexoOnboarding(path, nome);
  if (!url) {
    // Uma frase só para todos os casos (não existe, foi removido, a policy
    // recusou): distinguir aqui transformaria a tela num oráculo sobre arquivo
    // alheio. O motivo real fica no `logErro` do servidor.
    return {
      ok: false,
      erro: "Não foi possível abrir este anexo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url };
}
