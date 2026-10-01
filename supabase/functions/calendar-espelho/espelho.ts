// Espelho das sessões EP/RP do GPS na agenda Google "IMPLEMENTAÇÃO".
//
// Lógica pura + orquestração do lote. `index.ts` só liga isto ao Deno.serve;
// o teste (`espelho.test.ts`) chama `atender()` com fetch e env falsos.
//
// Contrato com o banco (migration 20261001000325_gps_gcal_espelho.sql):
//   RPC_PENDENTES  gps.gcal_espelho_pendentes(p_origem_id uuid, p_limite int)
//   RPC_RESULTADO  gps.gcal_espelho_marcar(p_origem, p_origem_id, p_pendente_em,
//                    p_ok, p_google_event_id, p_assinatura, p_modo, p_erro)
//   RPC_CONFIG     gps.gcal_espelho_config() → (chave, valor): gcal_calendar_id, gcal_espelho_ativo
//                  (service_role NÃO tem grant em gps.config; só esta RPC)
//   modo           'criado' | 'adotado' | 'apagado_fora' (chk_gcal_espelho_modo)
//   corpo          {origem:'sessao', origem_id} vindo de gcal_espelho_chamar (pg_net)
//
// Backoff: esta função NÃO conta tentativas nem agenda nada. Em falha ela chama
// RPC_RESULTADO com p_ok=false e `p_erro`; a RPC decide `tentativas` e
// `proxima_em`. Em sucesso p_ok=true e a RPC só limpa a pendência se
// `p_pendente_em` ainda for o lido (mudança no meio continua pendente).

// Deno exige a extensão .ts; o tsc do Next (tsconfig da raiz inclui **/*.ts)
// recusa com TS5097. O ignore vale só para esta linha.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { criarGcal, type Gcal, GcalErro, type GcalEvento, ID_EVENTO_VALIDO } from "../_shared/gcal.ts";

export const RPC_PENDENTES = "gcal_espelho_pendentes";
export const RPC_RESULTADO = "gcal_espelho_marcar";
export const SCHEMA = "gps";
export const RPC_CONFIG = "gcal_espelho_config";
export const CHAVE_CALENDAR_ID = "gcal_calendar_id";
export const CHAVE_ATIVO = "gcal_espelho_ativo";
export const HEADER_SEGREDO = "x-espelho-segredo";

export const MODO_GPS = "criado"; // evento criado e mantido pelo espelho
export const MODO_ADOTADO = "adotado"; // evento manual da Aldri: só data/hora/local
export const MODO_APAGADO_FORA = "apagado_fora"; // apagado na agenda: não recria
// gps.sessao_agendamentos.estado: agendado | realizado | cancelado | falta.
// Realizado/falta mantêm o evento (a sessão aconteceu ou estava marcada).
export const ESTADOS_CANCELADOS = new Set(["cancelado"]);

export const FUSO = "America/Sao_Paulo";
export const PROPRIEDADE_ORIGEM = "gps_origem";
const VERSAO_ASSINATURA = "v1";
const LIMITE_PADRAO = 25;
const LIMITE_MAXIMO = 100;
const ORCAMENTO_MS = 100_000; // para antes do limite de parede da Edge Function
const SEGREDO_MINIMO = 32;

/** Linha de gps.gcal_espelho_pendentes. `existe=false` = sessão apagada. */
export type Pendente = {
  origem: string;
  origem_id: string;
  pendente_em: string | null;
  tentativas?: number | null;
  google_event_id: string | null;
  assinatura: string | null;
  modo: string | null;
  existe: boolean;
  tipo_id: number | null;
  tipo_etapa: number | null;
  tipo_nome: string | null;
  estado: string | null;
  inicio_em: string | null;
  fim_em: string | null;
  link_reuniao: string | null;
  aluno_nome: string | null;
  cliente_nome: string | null;
  responsavel_email: string | null;
  responsavel_nome?: string | null;
};

export type Deps = {
  env: (chave: string) => string | undefined;
  fetch: typeof fetch;
  agora?: () => number;
};

type Acao = "criado" | "atualizado" | "apagado" | "pulado" | "apagado_fora" | "erro";

type Resultado = {
  acao: Acao;
  google_event_id: string | null;
  modo: string | null;
  assinatura: string | null;
  erro: string | null;
};

// ---------------------------------------------------------------- puras

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "gps" + uuid sem hífens, minúsculo. Só 0-9 e a-v (base32hex do Google). */
export function idDeterministico(origemId: string): string {
  if (!UUID.test(origemId)) throw new Error("origem_id não é uuid");
  const id = "gps" + origemId.toLowerCase().replace(/-/g, "");
  if (!ID_EVENTO_VALIDO.test(id)) throw new Error("id fora de base32hex");
  return id;
}

/** Tira controle/formatação invisível (inclui CR/LF e bidi), colapsa espaço, corta. */
export function limparTexto(valor: unknown, max: number): string {
  const t = String(valor ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pontos = Array.from(t); // corta por code point, não quebra emoji/acento
  return pontos.length > max ? pontos.slice(0, max - 1).join("").trimEnd() + "…" : t;
}

export function montarTitulo(tipo: unknown, nome: unknown): string {
  const t = limparTexto(tipo, 40) || "Sessão";
  const n = limparTexto(nome, 80) || "Parceiro";
  return `${t} - ${n} - Implementação`;
}

export function limparLink(link: unknown): string {
  const l = limparTexto(link, 500);
  return /^https:\/\/[^\s]+$/i.test(l) ? l : "";
}

export function limparEmail(email: unknown): string | null {
  const e = String(email ?? "").trim().toLowerCase();
  if (e.length > 254) return null;
  return /^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/.test(e) ? e : null;
}

const fmtSP = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Instante ISO qualquer → "YYYY-MM-DDTHH:mm:ss-03:00" no fuso de São Paulo. */
export function paraSaoPaulo(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) throw new Error("data inválida");
  const p: Record<string, string> = {};
  for (const x of fmtSP.formatToParts(d)) p[x.type] = x.value;
  const localUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offMin = Math.round((localUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sinal = offMin < 0 ? "-" : "+";
  const abs = Math.abs(offMin);
  const off = `${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
}

function horarios(p: Pendente) {
  if (!p.inicio_em || !p.fim_em) throw new Error("inicio_em/fim_em ausente");
  const ini = new Date(p.inicio_em).getTime();
  const fim = new Date(p.fim_em).getTime();
  if (Number.isNaN(ini) || Number.isNaN(fim)) throw new Error("inicio_em/fim_em inválido");
  if (fim <= ini) throw new Error("fim_em não é posterior a inicio_em");
  return {
    start: { dateTime: paraSaoPaulo(p.inicio_em), timeZone: FUSO },
    end: { dateTime: paraSaoPaulo(p.fim_em), timeZone: FUSO },
  };
}

/** Nome do título: o aluno (parceiro GPS); sem aluno, o cliente. */
export function nomeDoTitulo(p: Pendente): string | null {
  return limparTexto(p.aluno_nome, 80) || limparTexto(p.cliente_nome, 80) || null;
}

const marcaOrigem = (p: Pendente) => ({
  private: { [PROPRIEDADE_ORIGEM]: `${p.origem}:${p.origem_id}` },
});

/** Evento completo (modo criado). Nome só no título; descrição sem dado pessoal (LGPD). */
export function montarEvento(p: Pendente): GcalEvento {
  const tipo = limparTexto(p.tipo_nome, 40) || "Sessão";
  const email = limparEmail(p.responsavel_email);
  return {
    summary: montarTitulo(p.tipo_nome, nomeDoTitulo(p)),
    description: `Sessão ${tipo} do Programa de Implementação Assistida.\nGerenciado pelo sistema GPS: alterações feitas aqui são sobrescritas.`,
    location: limparLink(p.link_reuniao),
    ...horarios(p),
    attendees: email ? [{ email }] : [],
    extendedProperties: marcaOrigem(p),
  };
}

/**
 * Evento adotado (manual da Aldri): título, descrição e convidados não mudam.
 * Leva a marca privada gps_origem (invisível na agenda; o PATCH do Google
 * mescla o mapa `private`) para o script de reconciliação não achá-lo de novo
 * como evento manual — pedido no comentário de gps.gcal_espelho_adotar.
 */
export function montarEventoAdotado(p: Pendente): GcalEvento {
  return { location: limparLink(p.link_reuniao), ...horarios(p), extendedProperties: marcaOrigem(p) };
}

export function normalizarModo(modo: string | null): string {
  return modo === MODO_ADOTADO || modo === MODO_APAGADO_FORA ? modo : MODO_GPS;
}

/** Cancelada ou apagada do banco (existe=false): o evento sai da agenda. */
export function estaCancelado(p: Pendente): boolean {
  return p.existe === false || ESTADOS_CANCELADOS.has(String(p.estado ?? "").toLowerCase());
}

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash do que seria enviado ao Google (+ modo e agenda). Igual ao gravado → pula. */
export async function assinatura(p: Pendente, calendarId: string): Promise<string> {
  const modo = normalizarModo(p.modo);
  const corpo = estaCancelado(p)
    ? { cancelado: true }
    : modo === MODO_ADOTADO
    ? montarEventoAdotado(p)
    : montarEvento(p);
  return await sha256Hex(JSON.stringify([VERSAO_ASSINATURA, calendarId, modo, corpo]));
}

/** Comparação em tempo constante: compara os SHA-256 byte a byte, sem saída antecipada. */
export async function segredoConfere(recebido: string, esperado: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recebido)),
    crypto.subtle.digest("SHA-256", enc.encode(esperado)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

// ---------------------------------------------------------- um pendente

async function aplicarNoGoogle(
  gcal: Gcal,
  calendarId: string,
  p: Pendente,
): Promise<Resultado> {
  const modoAtual = normalizarModo(p.modo);
  const modoGravado = p.modo ?? MODO_GPS;
  const assin = await assinatura(p, calendarId);

  if (modoAtual === MODO_APAGADO_FORA) {
    // A Aldri apagou na agenda: o espelho não recria nem apaga. Só tira da fila.
    return { acao: "pulado", google_event_id: p.google_event_id, modo: modoGravado, assinatura: assin, erro: null };
  }

  if (estaCancelado(p)) {
    if (p.assinatura === assin && !p.google_event_id) {
      return { acao: "pulado", google_event_id: null, modo: modoGravado, assinatura: assin, erro: null };
    }
    // Sem id gravado no modo gps, apaga o determinístico (insert cujo resultado se perdeu).
    const alvo = p.google_event_id ?? (modoAtual === MODO_GPS ? idDeterministico(p.origem_id) : null);
    if (alvo) {
      try {
        await gcal.apagar(calendarId, alvo);
      } catch (e) {
        if (!(e instanceof GcalErro && e.tipo === "nao_encontrado")) throw e;
      }
    }
    return { acao: "apagado", google_event_id: null, modo: modoGravado, assinatura: assin, erro: null };
  }

  if (p.assinatura === assin && p.google_event_id) {
    return { acao: "pulado", google_event_id: p.google_event_id, modo: modoGravado, assinatura: assin, erro: null };
  }

  const apagadoFora: Resultado = {
    acao: "apagado_fora",
    google_event_id: p.google_event_id,
    modo: MODO_APAGADO_FORA,
    assinatura: assin,
    erro: null,
  };

  // Evento já existente (gps ou adotado): confere se ainda vive, depois PATCH.
  if (p.google_event_id) {
    const parcial = modoAtual === MODO_ADOTADO ? montarEventoAdotado(p) : montarEvento(p);
    try {
      const atual = await gcal.obter(calendarId, p.google_event_id);
      // Evento apagado no Google pode voltar 200 com status "cancelled".
      if (atual.status === "cancelled") return apagadoFora;
      await gcal.atualizar(calendarId, p.google_event_id, parcial);
    } catch (e) {
      if (e instanceof GcalErro && e.tipo === "nao_encontrado") return apagadoFora;
      throw e;
    }
    return { acao: "atualizado", google_event_id: p.google_event_id, modo: modoGravado, assinatura: assin, erro: null };
  }

  if (modoAtual === MODO_ADOTADO) {
    throw new Error("modo adotado sem google_event_id");
  }

  // Novo: insert com id determinístico; 409 = já existe (inclusive cancelado
  // antes e remarcado agora) → PATCH completo restaurando status.
  const id = idDeterministico(p.origem_id);
  const evento = montarEvento(p);
  try {
    await gcal.inserir(calendarId, { id, ...evento });
    return { acao: "criado", google_event_id: id, modo: MODO_GPS, assinatura: assin, erro: null };
  } catch (e) {
    if (!(e instanceof GcalErro && e.tipo === "conflito")) throw e;
  }
  await gcal.atualizar(calendarId, id, { ...evento, status: "confirmed" });
  return { acao: "atualizado", google_event_id: id, modo: MODO_GPS, assinatura: assin, erro: null };
}

function textoErro(e: unknown): string {
  if (e instanceof GcalErro) return limparTexto(`gcal_${e.tipo}: ${e.message}`, 300);
  if (e instanceof Error) return limparTexto(`espelho: ${e.message}`, 300);
  return "espelho: erro desconhecido";
}

// --------------------------------------------------------------- banco

function rest(deps: Deps) {
  const url = (deps.env("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const chave = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !chave) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausente");
  const base = { apikey: chave, Authorization: `Bearer ${chave}` };

  async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
    const res = await deps.fetch(`${url}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: { ...base, "Content-Type": "application/json", "Content-Profile": SCHEMA, "Accept-Profile": SCHEMA },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`rpc ${nome}: ${res.status}`);
    }
    const txt = await res.text();
    return (txt ? JSON.parse(txt) : null) as T;
  }

  async function config(): Promise<Record<string, string>> {
    const linhas = (await rpc<{ chave: string; valor: string }[]>(RPC_CONFIG, {})) ?? [];
    return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  }

  return { rpc, config };
}

// --------------------------------------------------------------- lote

export type Resumo = Record<Acao, number> & { falha_registro: number; restantes: number };

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function executarLote(
  deps: Deps,
  limite: number,
  origemId: string | null = null,
): Promise<Response> {
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  const db = rest(deps);

  let cfg: Record<string, string>;
  try {
    cfg = await db.config();
  } catch (e) {
    // RPC_CONFIG sem grant/ausente cai aqui (fail closed, sem Google).
    console.error("calendar-espelho:", e instanceof Error ? e.message : "config");
    return json(503, { erro: "config ilegível", motivo: "config" });
  }
  if (String(cfg[CHAVE_ATIVO] ?? "").trim().toLowerCase() !== "true") {
    return json(200, { ativo: false });
  }
  const calendarId = String(cfg[CHAVE_CALENDAR_ID] ?? "").trim();
  if (!calendarId) return json(503, { erro: `${CHAVE_CALENDAR_ID} ausente` });

  const pendentes = (await db.rpc<Pendente[]>(RPC_PENDENTES, {
    p_origem_id: origemId,
    p_limite: limite,
  })) ?? [];
  const resumo: Resumo = {
    criado: 0, atualizado: 0, apagado: 0, pulado: 0, apagado_fora: 0, erro: 0,
    falha_registro: 0, restantes: 0,
  };
  if (pendentes.length === 0) return json(200, { ativo: true, ...resumo });

  const gcal = criarGcal({
    clientId: deps.env("GCAL_CLIENT_ID") ?? "",
    clientSecret: deps.env("GCAL_CLIENT_SECRET") ?? "",
    refreshToken: deps.env("GCAL_REFRESH_TOKEN") ?? "",
    fetch: deps.fetch,
  });

  const registrar = async (p: Pendente, r: Resultado) => {
    resumo[r.acao]++;
    try {
      await db.rpc(RPC_RESULTADO, {
        p_origem: p.origem,
        p_origem_id: p.origem_id,
        p_pendente_em: p.pendente_em,
        p_ok: r.acao !== "erro",
        p_google_event_id: r.google_event_id,
        p_assinatura: r.assinatura,
        p_modo: r.modo,
        p_erro: r.erro,
      });
    } catch {
      // Insert feito e registro perdido é seguro: na próxima volta o insert dá
      // 409 e vira PATCH no mesmo id determinístico.
      resumo.falha_registro++;
    }
  };
  const falha = (p: Pendente, erro: string): Resultado => ({
    acao: "erro",
    google_event_id: p.google_event_id,
    modo: p.modo, // null = a RPC mantém o gravado
    assinatura: p.assinatura,
    erro,
  });

  for (let i = 0; i < pendentes.length; i++) {
    const p = pendentes[i];
    if (agora() - inicio > ORCAMENTO_MS) {
      resumo.restantes = pendentes.length - i;
      break;
    }
    try {
      await registrar(p, await aplicarNoGoogle(gcal, calendarId, p));
    } catch (e) {
      const erro = textoErro(e);
      await registrar(p, falha(p, erro));
      if (e instanceof GcalErro && e.tipo === "credencial") {
        // Credencial morta: nenhum pendente vai passar. Erro visível em todos, 503.
        for (const resto of pendentes.slice(i + 1)) await registrar(resto, falha(resto, erro));
        return json(503, { ativo: true, ...resumo, motivo: "gcal_credencial" });
      }
      if (e instanceof GcalErro && e.tipo === "transitorio" && e.status === 429) {
        // Rate limit: para o lote; o resto volta na próxima execução.
        resumo.restantes = pendentes.length - i - 1;
        break;
      }
    }
  }
  return json(200, { ativo: true, ...resumo });
}

// -------------------------------------------------------------- entrada

export async function atender(req: Request, deps: Deps): Promise<Response> {
  // Chamado só por cron/pg_net: POST, sem CORS, sem JWT de usuário.
  if (req.method !== "POST") return json(405, { erro: "método não permitido" });

  const esperado = deps.env("ESPELHO_SEGREDO") ?? "";
  if (esperado.length < SEGREDO_MINIMO) return json(503, { erro: "não configurado" });
  const recebido = req.headers.get(HEADER_SEGREDO) ?? "";
  if (!(await segredoConfere(recebido, esperado))) return json(401, { erro: "não autorizado" });

  // Corpo do gcal_espelho_chamar: {origem:'sessao', origem_id: uuid|null}.
  // Com origem_id a RPC devolve só aquela sessão (ignora o recuo); sem ele, o lote vencido.
  let limite = LIMITE_PADRAO;
  let origemId: string | null = null;
  try {
    const corpo = await req.json();
    const n = Number(corpo?.limite);
    if (Number.isInteger(n) && n > 0) limite = Math.min(n, LIMITE_MAXIMO);
    if (typeof corpo?.origem_id === "string" && UUID.test(corpo.origem_id)) origemId = corpo.origem_id;
  } catch {
    // corpo vazio ou não-JSON: usa o padrão
  }

  try {
    return await executarLote(deps, limite, origemId);
  } catch (e) {
    // Mensagens daqui são nossas (sem token/segredo); nunca o corpo de resposta.
    console.error("calendar-espelho:", e instanceof Error ? e.message : "erro");
    return json(500, { erro: "falha interna" });
  }
}
