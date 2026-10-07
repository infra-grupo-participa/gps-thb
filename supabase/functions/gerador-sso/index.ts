// Edge Function gerador-sso: passe ES256 de 60 s para o Gerador de Minutas
// (migração …358).
//
// DEPLOY: `supabase functions deploy gerador-sso` — SEM `--no-verify-jwt`.
// verify_jwt = TRUE: só entra requisição com JWT válido do projeto. Quem chama
// é o servidor Next (`src/lib/gerador-sso.ts`) com o access token da sessão
// do parceiro; a edge repassa esse MESMO JWT a `gps.gerador_sso_dados()`, que
// decide quem pode (nunca service_role).
// Envs: SUPABASE_URL, SUPABASE_ANON_KEY (padrão da plataforma) e
// GERADOR_SSO_PRIVADA (PKCS8 DER da chave P-256 em base64 padrão; a pública
// correspondente está fixa no código do gerador).
// Toda a lógica está em ./assinar.ts. Nunca logar token nem e-mail.
//
// A global `Deno` é lida por cast para o arquivo passar também no `tsc` do
// Next (o tsconfig da raiz inclui `**/*.ts`).

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./assinar.ts";

type DenoMin = {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): unknown;
};

const D = (globalThis as unknown as { Deno: DenoMin }).Deno;

D.serve((req) =>
  atender(req, {
    env: (k) => D.env.get(k),
    fetch: (...a) => fetch(...a),
  }),
);
