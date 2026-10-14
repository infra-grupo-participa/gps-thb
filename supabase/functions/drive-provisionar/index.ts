// Edge Function drive-provisionar: processa a fila gps.drive_tarefas (pasta do
// parceiro e pasta do cliente no Google Drive da conta joao@advmais.com).
// Autenticação só pelo header x-drive-segredo (env DRIVE_SEGREDO = segredo
// `gps_drive_segredo` do Vault). Deploy com --no-verify-jwt: quem chama é o
// cron/pg_net, nunca o navegador. Toda a lógica está em ./provisionar.ts.
//
// A global `Deno`/`EdgeRuntime` é lida por cast para o arquivo passar também no
// `tsc` do Next (o tsconfig da raiz inclui `**/*.ts`).

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { atender } from "./provisionar.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097
import { blindar } from "../drive-minutas/minutas.ts";

type DenoMin = {
  env: { get(k: string): string | undefined };
  serve(h: (req: Request) => Response | Promise<Response>): unknown;
};
type EdgeRuntimeMin = { waitUntil(p: Promise<unknown>): void };

const G = globalThis as unknown as { Deno: DenoMin; EdgeRuntime?: EdgeRuntimeMin };
const D = G.Deno;

D.serve((req) =>
  atender(req, {
    env: (k) => D.env.get(k),
    fetch: (...a) => fetch(...a),
    emSegundoPlano: G.EdgeRuntime ? (p) => G.EdgeRuntime?.waitUntil(p) : undefined,
    // Pasta nova de aluno já nasce blindada (as minutas saem da árvore dele). Não lê o
    // interruptor do cron (drive_minutas_varrer_ativo): desligar aqui exige novo deploy.
    // Vai por id (as pastas que o lote acabou de criar): a busca por nome do Drive não
    // enxerga pasta recém-criada. `blindar` revalida cada id (pasta, "minuta", árvore dos alunos).
    aposLote: async (orcamentoMs, ids) => {
      await blindar({ env: (k) => D.env.get(k), fetch: (...a) => fetch(...a), orcamentoMs }, ids.slice(0, 25), false);
    },
  }),
);
