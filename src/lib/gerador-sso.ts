import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";

/**
 * Acesso único ao Gerador de minutas (migração …358 + edge `gerador-sso`).
 *
 * O servidor do GPS chama a edge `gerador-sso` com o JWT da sessão do
 * parceiro (o `functions.invoke` do cliente de servidor manda o access token
 * dos cookies). A edge (verify_jwt = true) pergunta a `gps.gerador_sso_dados()`
 * quem pode e assina um JWT ES256 de 60 s com a chave privada que só ela tem.
 * O token vai no FRAGMENTO de `…/sso#t=<token>&next=/dashboard`: o navegador
 * não manda `#…` ao servidor, então ele não cai em log de acesso nem em
 * `Referer`.
 *
 * Quem chama (`page.tsx`) já validou a sessão
 * com `getContextoSessao()` (`getUser`). A edge e o PostgREST revalidam o JWT.
 *
 * 🔒 O token NUNCA é logado. Falha (sem ambiente, e-mail ≠ cadastro, admin,
 *    edge sem chave, rede) cai no `/dashboard` com login manual — a aba nunca
 *    quebra por causa do acesso único.
 */
// Produção por padrão. `GERADOR_MINUTAS_ORIGEM` (só servidor) aponta para a
// prévia da Lovable no teste local; aceita apenas https sem caminho.
const ORIGEM_PADRAO = "https://gmthb.holdingmasters.com.br";
const origemEnv = process.env.GERADOR_MINUTAS_ORIGEM?.trim();
export const GERADOR_ORIGEM =
  origemEnv && /^https:\/\/[a-z0-9.-]+$/i.test(origemEnv) ? origemEnv : ORIGEM_PADRAO;
const GERADOR_DASHBOARD_URL = `${GERADOR_ORIGEM}/dashboard`;

/** Forma de JWT (3 partes base64url). Qualquer outra coisa não entra na URL. */
const FORMA_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TIMEOUT_MS = 8000;

/** URL do gerador com token novo, ou o `/dashboard` simples se não der. */
export async function urlDoGeradorComAcessoUnico(): Promise<string> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.functions.invoke<{ token?: unknown }>(
      "gerador-sso",
      { method: "POST", timeout: TIMEOUT_MS },
    );
    if (error) {
      // 403 (regra do banco) é caminho esperado: o parceiro usa o login manual.
      logErro("geradorSso", error);
      return GERADOR_DASHBOARD_URL;
    }
    const token = data?.token;
    if (typeof token !== "string" || !FORMA_JWT.test(token)) {
      logErro("geradorSso", new Error("token fora do formato"));
      return GERADOR_DASHBOARD_URL;
    }
    return `${GERADOR_ORIGEM}/sso#t=${token}&next=/dashboard`;
  } catch (e) {
    logErro("geradorSso", e);
    return GERADOR_DASHBOARD_URL;
  }
}
