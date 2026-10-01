// deno test supabase/functions/calendar-espelho/
// Sem rede: todo fetch é o falso abaixo. Sem import remoto (roda offline e
// passa no tsc do Next).

import {
  assinatura,
  atender,
  type Deps,
  idDeterministico,
  limparTexto,
  montarEvento,
  montarTitulo,
  paraSaoPaulo,
  type Pendente,
  RPC_CONFIG,
  RPC_PENDENTES,
  RPC_RESULTADO,
  segredoConfere,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
} from "./espelho.ts";

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
const CAL = "implementacao@group.calendar.google.com";
const UUID1 = "0f8e2a7c-1b3d-4e5f-9a6b-7c8d9e0f1a2b";
const UUID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PENDENTE_EM = "2026-10-01T12:00:00.123456+00:00";

function pendente(extra: Partial<Pendente> = {}): Pendente {
  return {
    origem: "sessao",
    origem_id: UUID1,
    pendente_em: PENDENTE_EM,
    tentativas: 0,
    google_event_id: null,
    assinatura: null,
    modo: null,
    existe: true,
    tipo_id: 1,
    tipo_etapa: 1,
    tipo_nome: "EP",
    estado: "agendado",
    inicio_em: "2026-10-05T13:00:00+00:00",
    fim_em: "2026-10-05T14:00:00+00:00",
    link_reuniao: "https://zoom.us/j/123",
    aluno_nome: "Maria Souza",
    cliente_nome: "Cliente Sigiloso",
    responsavel_email: " Aldri@Exemplo.com ",
    responsavel_nome: "Aldri",
    ...extra,
  };
}

type Chamada = { metodo: string; url: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

/** fetch falso: `google` decide a resposta das chamadas ao Calendar. */
function cenario(opts: {
  pendentes: Pendente[];
  ativo?: string;
  configStatus?: number;
  token?: Resposta;
  google?: (c: Chamada) => Resposta;
}) {
  const chamadas: Chamada[] = [];
  const resultados: Record<string, unknown>[] = [];
  const pedidosPendentes: Record<string, unknown>[] = [];
  const responder = (r: Resposta) =>
    new Response(r.corpo === undefined ? null : JSON.stringify(r.corpo), { status: r.status });

  const atenderFalso = (input: RequestInfo | URL, init?: RequestInit): Response => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    const bruto = init?.body ? String(init.body) : "";
    let corpo: unknown = bruto;
    try {
      corpo = bruto ? JSON.parse(bruto) : null;
    } catch { /* form-urlencoded do token */ }
    const c = { metodo, url, corpo };
    chamadas.push(c);

    if (url.endsWith(`/rpc/${RPC_CONFIG}`)) {
      if (opts.configStatus) return responder({ status: opts.configStatus, corpo: { code: "42501" } });
      return responder({
        status: 200,
        corpo: [
          { chave: "gcal_calendar_id", valor: CAL },
          { chave: "gcal_espelho_ativo", valor: opts.ativo ?? "true" },
        ],
      });
    }
    if (url.endsWith(`/rpc/${RPC_PENDENTES}`)) {
      pedidosPendentes.push(corpo as Record<string, unknown>);
      return responder({ status: 200, corpo: opts.pendentes });
    }
    if (url.endsWith(`/rpc/${RPC_RESULTADO}`)) {
      resultados.push(corpo as Record<string, unknown>);
      return responder({ status: 200, corpo: { ainda_pendente: false, tentativas: 0, proxima_em: null } });
    }
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return responder(opts.token ?? { status: 200, corpo: { access_token: "tok", expires_in: 3600 } });
    }
    if (url.startsWith("https://www.googleapis.com/calendar/v3/")) {
      return responder(opts.google ? opts.google(c) : { status: 200, corpo: {} });
    }
    throw new Error("rede não mockada: " + url);
  };
  const fakeFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve().then(() => atenderFalso(input, init))) as typeof fetch;

  const env: Record<string, string> = {
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    ESPELHO_SEGREDO: SEGREDO,
    GCAL_CLIENT_ID: "cid",
    GCAL_CLIENT_SECRET: "csecret",
    GCAL_REFRESH_TOKEN: "rtoken",
  };
  const deps: Deps = { env: (k) => env[k], fetch: fakeFetch };
  const google = () => chamadas.filter((c) => c.url.includes("googleapis.com"));
  const calendar = () => chamadas.filter((c) => c.url.includes("/calendar/v3/"));
  return { deps, chamadas, resultados, pedidosPendentes, google, calendar };
}

function post(segredo: string | null = SEGREDO, corpo = "{}"): Request {
  const h = new Headers({ "Content-Type": "application/json" });
  if (segredo !== null) h.set("x-espelho-segredo", segredo);
  return new Request("http://local/calendar-espelho", { method: "POST", headers: h, body: corpo });
}

// ------------------------------------------------------------- puras

D.test("id determinístico: gps + uuid sem hífen, só 0-9a-v", () => {
  const id = idDeterministico(UUID1.toUpperCase());
  igual(id, "gps0f8e2a7c1b3d4e5f9a6b7c8d9e0f1a2b");
  ok(/^[0-9a-v]+$/.test(id), "fora de base32hex");
  igual(id.length, 35);
  igual(idDeterministico(UUID1), id, "não é determinístico");
  let lancou = false;
  try {
    idDeterministico("123; drop");
  } catch {
    lancou = true;
  }
  ok(lancou, "aceitou origem_id não-uuid");
});

D.test("sanitização: quebra de linha, controle, bidi e tamanho", () => {
  igual(limparTexto("Ana\r\nBcc: x@y.z\u0000‮fim", 100), "Ana Bcc: x@y.z fim");
  igual(montarTitulo("RP\n", "  João\tda   Silva "), "RP - João da Silva - Implementação");
  igual(montarTitulo("", null), "Sessão - Parceiro - Implementação");
  const longo = montarTitulo("EP", "á".repeat(500));
  ok(Array.from(longo).length <= 40 + 80 + 20, "título não foi limitado");
  ok(longo.includes("…"), "corte sem reticências");
  ok(!/[\r\n]/.test(longo), "quebra de linha no título");
});

D.test("horário com offset de São Paulo", () => {
  igual(paraSaoPaulo("2026-10-05T13:00:00+00:00"), "2026-10-05T10:00:00-03:00");
  igual(paraSaoPaulo("2026-12-31T02:30:00Z"), "2026-12-30T23:30:00-03:00");
});

D.test("payload: sem dado pessoal além do nome, só o responsável convidado", () => {
  const ev = montarEvento(pendente({ link_reuniao: "javascript:alert(1)" }));
  igual(ev.summary, "EP - Maria Souza - Implementação");
  ok(!String(ev.description).includes("Maria"), "nome na descrição");
  ok(!JSON.stringify(ev).includes("Cliente Sigiloso"), "nome do cliente vazou com aluno presente");
  igual(montarEvento(pendente({ aluno_nome: null })).summary, "EP - Cliente Sigiloso - Implementação");
  igual(ev.location, "", "link não-https deveria sumir");
  igual(ev.attendees, [{ email: "aldri@exemplo.com" }]);
  igual(ev.start, { dateTime: "2026-10-05T10:00:00-03:00", timeZone: "America/Sao_Paulo" });
  igual(ev.extendedProperties, { private: { gps_origem: `sessao:${UUID1}` } });
  igual(montarEvento(pendente({ responsavel_email: "lixo" })).attendees, []);
});

D.test("segredo em tempo constante", async () => {
  ok(await segredoConfere(SEGREDO, SEGREDO), "igual deveria passar");
  ok(!(await segredoConfere(SEGREDO + "x", SEGREDO)), "diferente passou");
  ok(!(await segredoConfere("", SEGREDO)), "vazio passou");
});

// ----------------------------------------------------------- handler

D.test("sem header → 401 e nenhuma chamada de rede", async () => {
  const s = cenario({ pendentes: [pendente()] });
  igual((await atender(post(null), s.deps)).status, 401);
  igual((await atender(post("errado"), s.deps)).status, 401);
  igual(s.chamadas.length, 0);
  const get = new Request("http://local/", { method: "GET" });
  igual((await atender(get, s.deps)).status, 405);
  const opt = await atender(new Request("http://local/", { method: "OPTIONS" }), s.deps);
  ok(!opt.headers.has("access-control-allow-origin"), "CORS exposto");
});

D.test("espelho inativo → não chama Google nem pendentes", async () => {
  const s = cenario({ ativo: "false", pendentes: [pendente()] });
  const r = await atender(post(), s.deps);
  igual(r.status, 200);
  igual(await r.json(), { ativo: false });
  igual(s.google().length, 0);
  ok(!s.chamadas.some((c) => c.url.includes(RPC_PENDENTES)), "leu pendentes inativo");
});

D.test("novo: insert com id determinístico, sendUpdates=none, resultado gravado", async () => {
  const s = cenario({ pendentes: [pendente()] });
  const r = await atender(post(), s.deps);
  igual(r.status, 200);
  const [ins] = s.calendar();
  igual(ins.metodo, "POST");
  ok(ins.url.includes(encodeURIComponent(CAL)), "agenda errada");
  ok(ins.url.includes("sendUpdates=none"), "sem sendUpdates=none");
  igual((ins.corpo as { id: string }).id, "gps0f8e2a7c1b3d4e5f9a6b7c8d9e0f1a2b");
  igual(s.resultados.length, 1);
  const res = s.resultados[0];
  igual(res.p_google_event_id, "gps0f8e2a7c1b3d4e5f9a6b7c8d9e0f1a2b");
  igual(res.p_modo, "criado");
  igual(res.p_ok, true);
  igual(res.p_pendente_em, PENDENTE_EM, "pendente_em não devolvido como lido");
  igual(res.p_erro, null);
  igual(s.pedidosPendentes, [{ p_origem_id: null, p_limite: 25 }]);
  igual(res.p_assinatura, await assinatura(pendente(), CAL));
  const txt = JSON.stringify(await r.json());
  ok(!txt.includes(SEGREDO) && !txt.includes("Maria"), "resposta vaza segredo ou nome");
});

D.test("insert 409 → PATCH no mesmo id restaurando status", async () => {
  const s = cenario({
    pendentes: [pendente()],
    google: (c) => (c.metodo === "POST" ? { status: 409, corpo: { error: { status: "ALREADY_EXISTS" } } } : { status: 200, corpo: {} }),
  });
  await atender(post(), s.deps);
  const [, patch] = s.calendar();
  igual(patch.metodo, "PATCH");
  ok(patch.url.includes("/events/gps0f8e2a7c1b3d4e5f9a6b7c8d9e0f1a2b?sendUpdates=none"), patch.url);
  igual((patch.corpo as { status: string }).status, "confirmed");
  igual(s.resultados[0].p_erro, null);
});

D.test("adotado: PATCH só de start/end/location, título intocado", async () => {
  const s = cenario({
    pendentes: [pendente({ modo: "adotado", google_event_id: "manualaldri123" })],
    google: () => ({ status: 200, corpo: { status: "confirmed" } }),
  });
  await atender(post(), s.deps);
  const [get, patch] = s.calendar();
  igual(get.metodo, "GET");
  igual(patch.metodo, "PATCH");
  igual(Object.keys(patch.corpo as object).sort(), ["end", "extendedProperties", "location", "start"]);
  igual((patch.corpo as { extendedProperties: unknown }).extendedProperties, {
    private: { gps_origem: `sessao:${UUID1}` },
  });
  igual(s.resultados[0].p_modo, "adotado");
});

D.test("evento existente apagado fora (404 / cancelled) → apagado_fora, não recria", async () => {
  for (const resposta of [{ status: 404 }, { status: 200, corpo: { status: "cancelled" } }]) {
    const s = cenario({
      pendentes: [pendente({ google_event_id: idDeterministico(UUID1), assinatura: "velha" })],
      google: (c) => (c.metodo === "GET" ? resposta : { status: 200, corpo: {} }),
    });
    await atender(post(), s.deps);
    igual(s.calendar().map((c) => c.metodo), ["GET"], "chamou além do GET");
    igual(s.resultados[0].p_modo, "apagado_fora");
    igual(s.resultados[0].p_erro, null);
  }
});

D.test("patch 410 em evento existente → apagado_fora", async () => {
  const s = cenario({
    pendentes: [pendente({ google_event_id: idDeterministico(UUID1), assinatura: "velha" })],
    google: (c) => (c.metodo === "PATCH" ? { status: 410 } : { status: 200, corpo: { status: "confirmed" } }),
  });
  await atender(post(), s.deps);
  igual(s.calendar().map((c) => c.metodo), ["GET", "PATCH"]);
  igual(s.resultados[0].p_modo, "apagado_fora");
});

D.test("cancelado → DELETE; 410 conta como apagado", async () => {
  const s = cenario({
    pendentes: [pendente({ estado: "cancelado", google_event_id: idDeterministico(UUID1) })],
    google: () => ({ status: 410 }),
  });
  await atender(post(), s.deps);
  const [del] = s.calendar();
  igual(del.metodo, "DELETE");
  ok(del.url.includes("sendUpdates=none"), "delete sem sendUpdates=none");
  igual(s.resultados[0].p_erro, null);
  igual(s.resultados[0].p_google_event_id, null);
});

D.test("assinatura igual → pula sem tocar no Google", async () => {
  const base = pendente({ google_event_id: idDeterministico(UUID1) });
  const s = cenario({ pendentes: [{ ...base, assinatura: await assinatura(base, CAL) }] });
  await atender(post(), s.deps);
  igual(s.google().length, 0);
  igual(s.resultados.length, 1, "pulado precisa sair da fila");
  igual(s.resultados[0].p_erro, null);
});

D.test("remarcação muda a assinatura", async () => {
  const a = await assinatura(pendente(), CAL);
  const b = await assinatura(pendente({ inicio_em: "2026-10-05T14:00:00Z", fim_em: "2026-10-05T15:00:00Z" }), CAL);
  const c = await assinatura(pendente({ link_reuniao: "https://meet.google.com/abc" }), CAL);
  const d = await assinatura(pendente({ responsavel_email: "outra@exemplo.com" }), CAL);
  ok(a !== b && a !== c && a !== d, "assinatura não detectou mudança");
});

D.test("invalid_grant → 503, erro visível em todo pendente, nenhum evento tocado", async () => {
  const s = cenario({
    pendentes: [pendente(), pendente({ origem_id: UUID2 })],
    token: { status: 400, corpo: { error: "invalid_grant" } },
  });
  const r = await atender(post(), s.deps);
  igual(r.status, 503);
  igual(s.calendar().length, 0);
  igual(s.google().length, 1, "tentou o token mais de uma vez");
  igual(s.resultados.length, 2);
  for (const res of s.resultados) ok(String(res.p_erro).includes("invalid_grant"), String(res.p_erro));
  ok(!JSON.stringify(s.resultados).includes("rtoken"), "refresh token vazou no erro");
});

D.test("429 → erro no atual e para o lote", async () => {
  const s = cenario({
    pendentes: [pendente(), pendente({ origem_id: UUID2 })],
    google: () => ({ status: 429, corpo: { error: { errors: [{ reason: "rateLimitExceeded" }] } } }),
  });
  const r = await atender(post(), s.deps);
  igual(r.status, 200);
  igual(s.calendar().length, 1);
  igual(s.resultados.length, 1);
  ok(String(s.resultados[0].p_erro).startsWith("gcal_transitorio"), String(s.resultados[0].p_erro));
  igual((await r.json()).restantes, 1);
});

D.test("sessão apagada do banco (existe=false) → DELETE do id gravado", async () => {
  const s = cenario({
    pendentes: [pendente({
      existe: false, estado: null, inicio_em: null, fim_em: null, tipo_nome: null, aluno_nome: null,
      google_event_id: idDeterministico(UUID1), modo: "criado",
    })],
    google: () => ({ status: 204 }),
  });
  igual((await atender(post(), s.deps)).status, 200);
  igual(s.calendar().map((c) => c.metodo), ["DELETE"]);
  igual(s.resultados[0].p_ok, true);
});

D.test("realizado / falta não apagam o evento", async () => {
  for (const estado of ["realizado", "falta"]) {
    const s = cenario({ pendentes: [pendente({ estado })] });
    await atender(post(), s.deps);
    igual(s.calendar().map((c) => c.metodo), ["POST"], estado);
  }
});

D.test("corpo do pg_net {origem, origem_id} → pendentes filtrado pela sessão", async () => {
  const s = cenario({ pendentes: [pendente()] });
  await atender(post(SEGREDO, JSON.stringify({ origem: "sessao", origem_id: UUID1 })), s.deps);
  igual(s.pedidosPendentes, [{ p_origem_id: UUID1, p_limite: 25 }]);
  const t = cenario({ pendentes: [] });
  await atender(post(SEGREDO, JSON.stringify({ origem: "sessao", origem_id: "x' or 1=1" })), t.deps);
  igual(t.pedidosPendentes, [{ p_origem_id: null, p_limite: 25 }], "origem_id não-uuid passou");
});

D.test("falha no Google → p_ok=false, modo gravado preservado (null)", async () => {
  const s = cenario({ pendentes: [pendente()], google: () => ({ status: 500 }) });
  await atender(post(), s.deps);
  igual(s.resultados[0].p_ok, false);
  igual(s.resultados[0].p_modo, null);
  igual(s.resultados[0].p_pendente_em, PENDENTE_EM);
});

D.test("RPC de config sem grant → 503, nada de pendentes nem Google", async () => {
  const s = cenario({ pendentes: [pendente()], configStatus: 403 });
  const r = await atender(post(), s.deps);
  igual(r.status, 503);
  igual(s.pedidosPendentes.length, 0);
  igual(s.google().length, 0);
});
