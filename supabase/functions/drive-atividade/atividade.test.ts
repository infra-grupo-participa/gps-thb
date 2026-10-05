// deno test supabase/functions/drive-atividade/
// Sem rede: Google Drive e PostgREST são falsos em memória.

import {
  atender,
  executarAtividade,
  mapearMudanca,
  type ItemAtividade,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
} from "./atividade.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097
import type { Deps } from "../drive-provisionar/provisionar.ts";

type DenoTest = { test(nome: string, fn: () => void | Promise<void>): void };
const D = (globalThis as unknown as { Deno: DenoTest }).Deno;

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function igual<T>(a: T, b: T, msg = ""): void {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}\n  obtido:   ${x}\n  esperado: ${y}`);
}

const SEGREDO = "s".repeat(40);
const SB = "https://projeto.supabase.co";
const PASTA = "application/vnd.google-apps.folder";

type Pagina = { changes: unknown[]; nextPageToken?: string; newStartPageToken?: string };

class Mundo {
  /** Cursor do banco. `undefined` = travado/desligado (pegar devolve null). */
  cursor: string | null | undefined = "T0";
  /** Páginas do Google, por token de entrada. */
  paginas = new Map<string, Pagina>();
  aplicados: { itens: ItemAtividade[]; lido: string | null; novo: string }[] = [];
  chamadasLista: string[] = [];
  chamadasPegar = 0;
  tokenInicial = "START1";
  /** Cada leitura de changes.list consome isto do relógio. */
  custoPaginaMs = 0;
  relogio = 0;
  falhaCredencial = false;
  erros: string[] = [];
  /** Força P0001 já na N-ésima chamada a aplicar (1 = primeira). */
  conflitoNaAplicacao = 0;
}

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function deps(m: Mundo): Deps {
  const env: Record<string, string> = {
    DRIVE_SEGREDO: SEGREDO,
    SUPABASE_URL: SB,
    SUPABASE_SERVICE_ROLE_KEY: "srk",
    GDRIVE_CLIENT_ID: "c",
    GDRIVE_CLIENT_SECRET: "s",
    GDRIVE_REFRESH_TOKEN: "r",
  };
  const fetchFalso = async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada));
    if (url.hostname === "oauth2.googleapis.com") {
      if (m.falhaCredencial) return resposta(400, { error: "invalid_grant" });
      return resposta(200, { access_token: "t", expires_in: 3600 });
    }
    if (url.origin === SB) {
      const nome = url.pathname.split("/").pop();
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      if (nome === "drive_atividade_pegar") {
        m.chamadasPegar++;
        return resposta(200, m.cursor === undefined ? null : { page_token: m.cursor });
      }
      if (nome === "drive_atividade_aplicar") {
        if (corpo.p_erro) {
          m.erros.push(String(corpo.p_erro));
          return new Response("", { status: 200 });
        }
        const n = m.aplicados.length + 1;
        if (m.conflitoNaAplicacao === n || corpo.p_token_lido !== m.cursor) {
          return resposta(400, { code: "P0001", message: "Cursor mudou." });
        }
        m.aplicados.push({ itens: corpo.p_itens, lido: corpo.p_token_lido, novo: corpo.p_token_novo });
        m.cursor = corpo.p_token_novo;
        return new Response("", { status: 200 });
      }
      return resposta(404, { code: "PGRST202" });
    }
    if (url.pathname === "/drive/v3/changes/startPageToken") return resposta(200, { startPageToken: m.tokenInicial });
    if (url.pathname === "/drive/v3/changes") {
      const token = url.searchParams.get("pageToken") ?? "";
      m.chamadasLista.push(token);
      m.relogio += m.custoPaginaMs;
      const p = m.paginas.get(token);
      if (!p) return resposta(400, { error: { errors: [{ reason: "invalid" }] } });
      return resposta(200, p);
    }
    return resposta(404, {});
  };
  return {
    env: (k) => env[k],
    fetch: fetchFalso as typeof fetch,
    agora: () => m.relogio,
    dormir: async (ms) => {
      m.relogio += ms;
    },
  };
}

const arquivo = (id: string, extra: Record<string, unknown> = {}) => ({
  fileId: id,
  removed: false,
  file: {
    id,
    name: `n-${id}`,
    mimeType: "application/pdf",
    parents: ["PAI1", "PAI2"],
    trashed: false,
    modifiedTime: "2026-10-05T10:00:00.000Z",
    lastModifyingUser: { displayName: "Maria" },
    ...extra,
  },
});

const chamar = (m: Mundo, segredo = SEGREDO, metodo = "POST") =>
  atender(
    new Request("https://x/functions/v1/drive-atividade", {
      method: metodo,
      headers: { "x-drive-segredo": segredo },
      body: metodo === "POST" ? JSON.stringify({ page_token: "forjado" }) : undefined,
    }),
    deps(m),
  );

D.test("sem segredo ou método errado: 401/405 e nada acontece", async () => {
  const m = new Mundo();
  igual((await chamar(m, "errado".repeat(8))).status, 401);
  igual((await chamar(m, SEGREDO, "GET")).status, 405);
  igual(m.chamadasPegar, 0);
});

D.test("página única: aplica e o cursor vai para newStartPageToken", async () => {
  const m = new Mundo();
  m.paginas.set("T0", { changes: [arquivo("A1"), arquivo("A2", { mimeType: PASTA })], newStartPageToken: "T1" });
  const r = await chamar(m);
  igual(r.status, 200);
  igual(m.cursor, "T1");
  igual(m.aplicados.length, 1);
  igual(m.aplicados[0].lido, "T0");
  igual(m.aplicados[0].itens.map((i) => [i.file_id, i.eh_pasta, i.parent_id, i.modificado_por_nome]), [
    ["A1", false, "PAI1", "Maria"],
    ["A2", true, "PAI1", "Maria"],
  ]);
  igual((await r.json()).estado, "completo");
});

D.test("várias páginas: aplica uma a uma e o cursor termina no newStartPageToken", async () => {
  const m = new Mundo();
  m.paginas.set("T0", { changes: [arquivo("A1")], nextPageToken: "P2" });
  m.paginas.set("P2", { changes: [arquivo("A2")], nextPageToken: "P3" });
  m.paginas.set("P3", { changes: [arquivo("A3")], newStartPageToken: "T9" });
  const r = await chamar(m);
  igual(r.status, 200);
  igual(m.aplicados.map((a) => [a.lido, a.novo]), [["T0", "P2"], ["P2", "P3"], ["P3", "T9"]]);
  igual(m.cursor, "T9");
});

D.test("orçamento estourado no meio: o cursor fica na última página aplicada", async () => {
  const m = new Mundo();
  m.custoPaginaMs = 60_000; // cada leitura gasta 60 s; orçamento 110 s
  m.paginas.set("T0", { changes: [arquivo("A1")], nextPageToken: "P2" });
  m.paginas.set("P2", { changes: [arquivo("A2")], nextPageToken: "P3" });
  m.paginas.set("P3", { changes: [arquivo("A3")], newStartPageToken: "T9" });
  const r = await chamar(m);
  igual(r.status, 200);
  igual(m.aplicados.length, 2, "2 páginas dentro do orçamento (t=60 e t=120>110 para antes da 3ª)");
  igual(m.cursor, "P3", "retoma da 3ª na próxima execução");
  igual(m.chamadasLista, ["T0", "P2"], "3ª página nem foi lida");
  // próxima execução termina de onde parou
  m.relogio = 0;
  await chamar(m);
  igual(m.cursor, "T9");
});

D.test("conflito otimista (P0001): para sem repetir e sem avançar", async () => {
  const m = new Mundo();
  m.paginas.set("T0", { changes: [arquivo("A1")], nextPageToken: "P2" });
  m.paginas.set("P2", { changes: [arquivo("A2")], newStartPageToken: "T9" });
  m.conflitoNaAplicacao = 1;
  const r = await chamar(m);
  igual(r.status, 200);
  igual((await r.json()).estado, "conflito");
  igual(m.chamadasLista, ["T0"], "não leu a página seguinte");
  igual(m.aplicados.length, 0);
  igual(m.cursor, "T0");
});

D.test("item removido: vai com removed=true e o resto nulo", async () => {
  const m = new Mundo();
  m.paginas.set("T0", { changes: [{ fileId: "GONE1", removed: true }, arquivo("A1", { trashed: true })], newStartPageToken: "T1" });
  await chamar(m);
  igual(m.aplicados[0].itens[0], {
    file_id: "GONE1", nome: null, mime: null, eh_pasta: null, parent_id: null,
    modificado_em: null, modificado_por_nome: null, trashed: false, removed: true,
  });
  igual(m.aplicados[0].itens[1].trashed, true);
  igual(m.aplicados[0].itens[1].removed, false);
});

D.test("1ª vez (page_token null): pega o token inicial e aplica com itens vazios", async () => {
  const m = new Mundo();
  m.cursor = null;
  const r = await chamar(m);
  igual(r.status, 200);
  igual(m.aplicados, [{ itens: [], lido: null, novo: "START1" }]);
  igual(m.chamadasLista.length, 0, "não leu changes.list");
});

D.test("travado ou desligado (pegar devolve null): não toca no Google", async () => {
  const m = new Mundo();
  m.cursor = undefined;
  const r = await chamar(m);
  igual(r.status, 200);
  igual(m.chamadasLista.length, 0);
  igual(m.aplicados.length, 0);
});

D.test("credencial morta: 503, nada aplicado", async () => {
  const m = new Mundo();
  m.falhaCredencial = true;
  const r = await chamar(m);
  igual(r.status, 503);
  igual(m.aplicados.length, 0);
  igual(m.cursor, "T0");
  igual(m.erros.length, 1, "p_erro enviado");
  ok(!m.erros[0].includes("srk") && m.erros[0].includes("gdrive_credencial"), "mensagem curta sem segredo");
});

D.test("erro de changes.list: p_erro enviado e nada aplicado", async () => {
  const m = new Mundo(); // sem página para T0 → o Google devolve 400
  const r = await chamar(m);
  igual(r.status, 500);
  igual(m.aplicados.length, 0);
  igual(m.cursor, "T0");
  igual(m.erros.length, 1, "p_erro enviado");
});

D.test("executarAtividade sem waitUntil devolve o resumo", async () => {
  const m = new Mundo();
  m.paginas.set("T0", { changes: [arquivo("A1")], newStartPageToken: "T1" });
  const r = await executarAtividade(deps(m));
  igual(r.corpo, { estado: "completo", paginas: 1, itens: 1 });
});

D.test("mapearMudanca: sem id descarta; parent_id é o primeiro de parents", () => {
  igual(mapearMudanca({}), null);
  const i = mapearMudanca(arquivo("Z9"));
  ok(i && i.parent_id === "PAI1", "primeiro pai");
});
