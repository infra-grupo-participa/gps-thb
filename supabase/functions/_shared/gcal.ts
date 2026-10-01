// Cliente mínimo do Google Calendar v3 (REST via fetch, sem SDK).
//
// - Troca o refresh token por access token em https://oauth2.googleapis.com/token
//   (env GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_REFRESH_TOKEN — lidos por quem
//   chama, nunca aqui, para o teste injetar valores falsos).
// - Todo erro sai como `GcalErro` com `tipo` decidível pelo chamador:
//     nao_encontrado  404/410 (evento apagado ou inexistente)
//     conflito        409 (id já usado: insert vira PATCH)
//     credencial      invalid_grant / invalid_client / 401 persistente — para o lote
//     transitorio     429, 5xx, 403 de rate limit, timeout/rede — tentar depois
//     outro           o resto (400 de payload, 403 de permissão na agenda...)
// - Nunca inclui token, segredo ou corpo do evento na mensagem de erro.
//
// Sem import remoto e sem a global `Deno`: o arquivo também passa no `tsc` do
// Next (o tsconfig da raiz inclui `**/*.ts`).

export type GcalErroTipo =
  | "nao_encontrado"
  | "conflito"
  | "credencial"
  | "transitorio"
  | "outro";

export class GcalErro extends Error {
  constructor(
    readonly tipo: GcalErroTipo,
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "GcalErro";
  }
}

export type GcalHorario = { dateTime: string; timeZone: string };

export type GcalEvento = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GcalHorario;
  end?: GcalHorario;
  attendees?: { email: string }[];
  extendedProperties?: { private?: Record<string, string> };
};

export type GcalConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

// Google exige id de evento em base32hex minúsculo: 0-9 e a-v, 5 a 1024 chars.
export const ID_EVENTO_VALIDO = /^[0-9a-v]{5,1024}$/;

function erroDeStatus(status: number, motivo: string, onde: string): GcalErro {
  if (status === 404 || status === 410) {
    return new GcalErro("nao_encontrado", status, `${onde}: ${status}`);
  }
  if (status === 409) return new GcalErro("conflito", status, `${onde}: 409`);
  if (status === 429 || status >= 500) {
    return new GcalErro("transitorio", status, `${onde}: ${status} ${motivo}`.trim());
  }
  if (
    status === 403 &&
    /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(motivo)
  ) {
    return new GcalErro("transitorio", status, `${onde}: 403 ${motivo}`);
  }
  return new GcalErro("outro", status, `${onde}: ${status} ${motivo}`.trim());
}

// Extrai só o código/razão do erro do Google (nunca o corpo inteiro).
async function motivoDoErro(res: Response): Promise<string> {
  try {
    const j = await res.json();
    const reason = j?.error?.errors?.[0]?.reason;
    const codigo = typeof j?.error === "string" ? j.error : j?.error?.status;
    return String(reason ?? codigo ?? "").slice(0, 80);
  } catch {
    return "";
  }
}

export function criarGcal(cfg: GcalConfig) {
  const f = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 15000;
  let token: { valor: string; expiraEm: number } | null = null;

  async function chamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const nome = e instanceof Error ? e.name : "erro";
      throw new GcalErro("transitorio", 0, `rede: ${nome}`);
    }
  }

  async function obterToken(forcar = false): Promise<string> {
    if (!forcar && token && Date.now() < token.expiraEm) return token.valor;
    if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
      throw new GcalErro("credencial", 0, "token: credencial ausente no ambiente");
    }
    const corpo = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    });
    const res = await chamar(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
    });
    if (!res.ok) {
      const motivo = await motivoDoErro(res);
      if (/invalid_grant|invalid_client|unauthorized_client/.test(motivo)) {
        throw new GcalErro("credencial", res.status, `token: ${motivo}`);
      }
      throw erroDeStatus(res.status, motivo, "token");
    }
    const j = await res.json();
    if (typeof j?.access_token !== "string") {
      throw new GcalErro("outro", res.status, "token: resposta sem access_token");
    }
    const segundos = Number(j.expires_in) || 3600;
    // margem de 60 s para não usar token no limite da expiração
    token = { valor: j.access_token, expiraEm: Date.now() + (segundos - 60) * 1000 };
    return token.valor;
  }

  async function api(
    metodo: string,
    caminho: string,
    onde: string,
    corpo?: unknown,
  ): Promise<Response> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const t = await obterToken(tentativa > 0);
      const res = await chamar(`${API}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${t}`,
          ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      if (res.ok) return res;
      // 401 com token em cache: renova uma vez; 401 de novo = credencial morta.
      if (res.status === 401 && tentativa === 0) {
        await res.body?.cancel();
        continue;
      }
      const motivo = await motivoDoErro(res);
      if (res.status === 401) throw new GcalErro("credencial", 401, `${onde}: 401 ${motivo}`.trim());
      throw erroDeStatus(res.status, motivo, onde);
    }
    throw new GcalErro("credencial", 401, `${onde}: 401`); // inalcançável
  }

  const cal = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;
  const ev = (calendarId: string, eventId: string) =>
    `${cal(calendarId)}/${encodeURIComponent(eventId)}`;
  // sendUpdates=none: espelho nunca dispara e-mail de convite.
  const SEM_AVISO = "sendUpdates=none";

  return {
    obterToken: () => obterToken(false),

    async inserir(calendarId: string, evento: GcalEvento): Promise<GcalEvento> {
      const res = await api("POST", `${cal(calendarId)}?${SEM_AVISO}`, "insert", evento);
      return await res.json();
    },

    async atualizar(
      calendarId: string,
      eventId: string,
      parcial: GcalEvento,
    ): Promise<GcalEvento> {
      const res = await api("PATCH", `${ev(calendarId, eventId)}?${SEM_AVISO}`, "patch", parcial);
      return await res.json();
    },

    async apagar(calendarId: string, eventId: string): Promise<void> {
      const res = await api("DELETE", `${ev(calendarId, eventId)}?${SEM_AVISO}`, "delete");
      await res.body?.cancel();
    },

    async obter(calendarId: string, eventId: string): Promise<GcalEvento> {
      const res = await api("GET", ev(calendarId, eventId), "get");
      return await res.json();
    },

    // Busca eventos pela propriedade privada (ex.: gps_origem=sessao:<uuid>).
    async listarPorPropriedade(
      calendarId: string,
      chave: string,
      valor: string,
    ): Promise<GcalEvento[]> {
      const q = new URLSearchParams({
        privateExtendedProperty: `${chave}=${valor}`,
        showDeleted: "false",
        maxResults: "50",
      });
      const res = await api("GET", `${cal(calendarId)}?${q.toString()}`, "list");
      const j = await res.json();
      return Array.isArray(j?.items) ? j.items : [];
    },
  };
}

export type Gcal = ReturnType<typeof criarGcal>;
