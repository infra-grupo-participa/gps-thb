// Cliente mínimo do Google Drive v3 (REST via fetch, sem SDK). Molde de gcal.ts.
//
// - Troca o refresh token por access token em https://oauth2.googleapis.com/token
//   (env GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN — lidos por
//   quem chama, nunca aqui, para o teste injetar valores falsos).
// - Todo erro sai como `GdriveErro` com `tipo` decidível pelo chamador:
//     nao_encontrado            404 (arquivo apagado ou sem acesso)
//     credencial                invalid_grant / invalid_client / 401 persistente /
//                               API desligada / escopo insuficiente — para o lote
//     transitorio               429, 5xx, 403 de rate limit, timeout/rede
//     compartilhamento_recusado 400 ao compartilhar (e-mail sem conta Google etc.)
//     outro                     o resto
// - Retry com recuo exponencial em 429 e 403 rateLimitExceeded (o Google NÃO
//   executou o pedido). Em ESCRITA, 5xx e falha de rede NÃO repetem aqui: o
//   pedido pode ter sido executado e a resposta perdida — quem chama procura
//   pelo appProperties.gps_id antes de criar de novo (idempotência no Drive).
// - No máximo ~3 escritas/s (intervalo mínimo entre escritas).
// - Nunca inclui token, segredo ou corpo de resposta na mensagem de erro.
//
// Sem import remoto, sem a global `Deno` e sem parameter properties: o arquivo
// passa no `tsc` do Next, no `deno check` e roda no Node (`node --test`).

export type GdriveErroTipo =
  | "nao_encontrado"
  | "credencial"
  | "transitorio"
  | "compartilhamento_recusado"
  | "outro";

export class GdriveErro extends Error {
  readonly tipo: GdriveErroTipo;
  readonly status: number;
  readonly motivo: string;
  constructor(tipo: GdriveErroTipo, status: number, mensagem: string, motivo = "") {
    super(mensagem);
    this.name = "GdriveErro";
    this.tipo = tipo;
    this.status = status;
    this.motivo = motivo;
  }
}

export const MIME_PASTA = "application/vnd.google-apps.folder";
export const MIME_ATALHO = "application/vnd.google-apps.shortcut";
export const CHAVE_GPS_ID = "gps_id";

export type ArquivoDrive = {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
  shortcutDetails?: { targetId?: string; targetMimeType?: string };
};

export type PermissaoDrive = {
  id: string;
  type?: string;
  role?: string;
  emailAddress?: string;
};

export type PapelCompartilhamento = "reader" | "writer";

export type GdriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Intervalo mínimo entre escritas (padrão 340 ms ≈ 3/s). */
  intervaloEscritaMs?: number;
  /** Tentativas em 429/rate limit (padrão 4). */
  maxTentativas?: number;
  /** Recuo inicial (padrão 1000 ms; dobra a cada tentativa, teto 16 s). */
  recuoBaseMs?: number;
  dormir?: (ms: number) => Promise<void>;
  agora?: () => number;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const CAMPOS_ARQUIVO = "id,name,mimeType,parents,trashed,appProperties,shortcutDetails";
const MAX_PAGINAS = 200;

// ------------------------------------------------------------------ puras

/** Comparação de nome de pasta: NFC, sem espaço nas pontas, espaço colapsado, maiúsculas. */
export function normalizarNome(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Tira controle/formatação invisível (inclui CR/LF e bidi), colapsa espaço, corta por code point. */
export function limparNome(valor: unknown, max = 120): string {
  const t = String(valor ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pontos = Array.from(t);
  return pontos.length > max ? pontos.slice(0, max).join("").trimEnd() : t;
}

export const SUFIXO_PASTA_PARCEIRO = " — Implementação Assistida";

/** "<Nome> — Implementação Assistida" (o mesmo padrão das pastas que a equipe já fez). */
export function nomePastaParceiro(nome: unknown): string {
  return `${limparNome(nome, 100) || "Parceiro"}${SUFIXO_PASTA_PARCEIRO}`;
}

export function nomePastaCliente(nome: unknown): string {
  return limparNome(nome, 120) || "Cliente sem nome";
}

/** Id de arquivo/pasta do Drive a partir de um link (/folders/<id>, /d/<id>, ?id=<id>). */
export function extrairIdDoDrive(url: unknown): string | null {
  const s = String(url ?? "").trim();
  const m =
    /\/folders\/([A-Za-z0-9_-]{10,200})(?:[/?#]|$)/.exec(s) ??
    /\/d\/([A-Za-z0-9_-]{10,200})(?:[/?#]|$)/.exec(s) ??
    /[?&]id=([A-Za-z0-9_-]{10,200})(?:[&#]|$)/.exec(s);
  return m ? m[1] : null;
}

export function ehIdDoDrive(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(id);
}

/** Escapa literal para a linguagem de consulta `q` do Drive (aspas simples e barra). */
export function escaparQ(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const RAZOES_RATE = /rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded|RATE_LIMIT_EXCEEDED/;
const RAZOES_CREDENCIAL =
  /accessNotConfigured|SERVICE_DISABLED|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|authError|invalidCredentials/;

/**
 * Classifica a resposta de erro do Google. `motivo` é só a razão curta
 * (error.errors[0].reason ou error.status), nunca o corpo inteiro.
 */
export function classificarErro(status: number, motivo: string, onde: string): GdriveErro {
  const msg = `${onde}: ${status} ${motivo}`.trim();
  if (status === 404) return new GdriveErro("nao_encontrado", status, msg, motivo);
  if (status === 401) return new GdriveErro("credencial", status, msg, motivo);
  if (status === 429 || status >= 500) return new GdriveErro("transitorio", status, msg, motivo);
  if (status === 403 && RAZOES_RATE.test(motivo)) {
    return new GdriveErro("transitorio", status, msg, motivo);
  }
  if (status === 403 && RAZOES_CREDENCIAL.test(motivo)) {
    return new GdriveErro("credencial", status, msg, motivo);
  }
  if (status === 0) return new GdriveErro("transitorio", 0, msg, motivo);
  return new GdriveErro("outro", status, msg, motivo);
}

/** Recusa definitiva do Google (não adianta repetir o mesmo pedido). */
export function ehRateLimit(e: unknown): boolean {
  return (
    e instanceof GdriveErro &&
    (e.status === 429 || (e.status === 403 && RAZOES_RATE.test(e.motivo)))
  );
}

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

const RANK_PAPEL: Record<string, number> = {
  reader: 1,
  commenter: 2,
  writer: 3,
  fileOrganizer: 4,
  organizer: 5,
  owner: 6,
};

/** O e-mail já tem papel igual ou maior que o pedido? (evita e-mail de convite repetido) */
export function jaTemAcesso(
  permissoes: PermissaoDrive[],
  email: string,
  papel: PapelCompartilhamento,
): boolean {
  const alvo = email.trim().toLowerCase();
  const pedido = RANK_PAPEL[papel] ?? 99;
  return permissoes.some(
    (p) =>
      p.type === "user" &&
      String(p.emailAddress ?? "").toLowerCase() === alvo &&
      (RANK_PAPEL[String(p.role)] ?? 0) >= pedido,
  );
}

// ---------------------------------------------------------------- cliente

export function criarGdrive(cfg: GdriveConfig) {
  const f = cfg.fetch ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 20000;
  const intervalo = cfg.intervaloEscritaMs ?? 340;
  const maxTentativas = Math.max(1, cfg.maxTentativas ?? 4);
  const recuoBase = cfg.recuoBaseMs ?? 1000;
  const dormir = cfg.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const agora = cfg.agora ?? Date.now;
  let token: { valor: string; expiraEm: number } | null = null;
  let ultimaEscrita = Number.NEGATIVE_INFINITY;
  let escritas = 0;
  let leituras = 0;

  async function chamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const nome = e instanceof Error ? e.name : "erro";
      throw new GdriveErro("transitorio", 0, `rede: ${nome}`, "rede");
    }
  }

  async function obterToken(forcar = false): Promise<string> {
    if (!forcar && token && agora() < token.expiraEm) return token.valor;
    if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) {
      throw new GdriveErro("credencial", 0, "token: credencial ausente no ambiente");
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
      if (/invalid_grant|invalid_client|unauthorized_client|invalid_scope/.test(motivo)) {
        throw new GdriveErro("credencial", res.status, `token: ${motivo}`, motivo);
      }
      throw classificarErro(res.status, motivo, "token");
    }
    const j = await res.json();
    if (typeof j?.access_token !== "string") {
      throw new GdriveErro("outro", res.status, "token: resposta sem access_token");
    }
    const segundos = Number(j.expires_in) || 3600;
    token = { valor: j.access_token, expiraEm: agora() + (segundos - 60) * 1000 };
    return token.valor;
  }

  async function aguardarVezDeEscrever(): Promise<void> {
    const espera = ultimaEscrita + intervalo - agora();
    if (espera > 0) await dormir(espera);
    ultimaEscrita = agora();
  }

  /**
   * Uma chamada à API com: renovação de token em 401 (uma vez), ritmo de
   * escrita e recuo em rate limit. Leitura também repete em 5xx/rede.
   */
  async function api(
    metodo: string,
    caminho: string,
    onde: string,
    opcoes: { corpo?: unknown; escrita: boolean },
  ): Promise<Response> {
    let renovou = false;
    for (let tentativa = 1; ; tentativa++) {
      if (opcoes.escrita) await aguardarVezDeEscrever();
      const t = await obterToken(false);
      let erro: GdriveErro;
      try {
        if (opcoes.escrita) escritas++;
        else leituras++;
        const res = await chamar(`${API}${caminho}`, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${t}`,
            ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
        });
        if (res.ok) return res;
        if (res.status === 401 && !renovou) {
          await res.body?.cancel();
          renovou = true;
          await obterToken(true);
          tentativa--; // renovar o token não conta como tentativa
          continue;
        }
        erro = classificarErro(res.status, await motivoDoErro(res), onde);
      } catch (e) {
        if (!(e instanceof GdriveErro)) throw e;
        erro = e;
      }
      const repete =
        tentativa < maxTentativas &&
        (ehRateLimit(erro) || (!opcoes.escrita && erro.tipo === "transitorio"));
      if (!repete) throw erro;
      const recuo = Math.min(16000, recuoBase * 2 ** (tentativa - 1));
      await dormir(recuo + Math.floor(Math.random() * 250));
    }
  }

  const qs = (p: Record<string, string>) => new URLSearchParams(p).toString();
  const DRIVES = { supportsAllDrives: "true" };

  async function listar(q: string, onde: string): Promise<ArquivoDrive[]> {
    const todos: ArquivoDrive[] = [];
    let pageToken = "";
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const params: Record<string, string> = {
        q,
        fields: `nextPageToken,files(${CAMPOS_ARQUIVO})`,
        pageSize: "1000",
        includeItemsFromAllDrives: "true",
        ...DRIVES,
      };
      if (pageToken) params.pageToken = pageToken;
      const res = await api("GET", `/files?${qs(params)}`, onde, { escrita: false });
      const j = await res.json();
      if (Array.isArray(j?.files)) todos.push(...j.files);
      pageToken = typeof j?.nextPageToken === "string" ? j.nextPageToken : "";
      if (!pageToken) return todos;
    }
    throw new GdriveErro("outro", 0, `${onde}: paginação passou de ${MAX_PAGINAS} páginas`);
  }

  function exigirId(id: string, onde: string): void {
    if (!ehIdDoDrive(id)) throw new GdriveErro("outro", 0, `${onde}: id inválido`);
  }

  async function listarFilhos(paiId: string, soPastas = false): Promise<ArquivoDrive[]> {
    exigirId(paiId, "list");
    const q =
      `'${escaparQ(paiId)}' in parents and trashed = false` +
      (soPastas ? ` and mimeType = '${MIME_PASTA}'` : "");
    return await listar(q, "list");
  }

  return {
    obterToken: () => obterToken(false),
    contadores: () => ({ escritas, leituras }),

    /** Metadados de um arquivo/pasta. `null` = não existe ou sem acesso (404). */
    async obter(id: string): Promise<ArquivoDrive | null> {
      exigirId(id, "get");
      try {
        const res = await api(
          "GET",
          `/files/${encodeURIComponent(id)}?${qs({ fields: CAMPOS_ARQUIVO, ...DRIVES })}`,
          "get",
          { escrita: false },
        );
        return await res.json();
      } catch (e) {
        if (e instanceof GdriveErro && e.tipo === "nao_encontrado") return null;
        throw e;
      }
    },

    /** Todos os filhos (não lixeira) da pasta, seguindo TODOS os nextPageToken. */
    listarFilhos,

    /** Filhos da pasta marcados com appProperties.gps_id = valor. */
    async buscarPorGpsId(paiId: string, gpsId: string): Promise<ArquivoDrive | null> {
      exigirId(paiId, "list");
      const q =
        `'${escaparQ(paiId)}' in parents and trashed = false and ` +
        `appProperties has { key='${CHAVE_GPS_ID}' and value='${escaparQ(gpsId)}' }`;
      const achados = await listar(q, "list");
      return achados[0] ?? null;
    },

    /** Subpasta pelo nome normalizado (trim, espaço colapsado, maiúsculas). Ex.: "1) DOCUMENTOS ". */
    async acharSubpasta(paiId: string, nome: string): Promise<ArquivoDrive | null> {
      const alvo = normalizarNome(nome);
      const pastas = await listarFilhos(paiId, true);
      return pastas.find((p) => normalizarNome(p.name) === alvo) ?? null;
    },

    async criarPasta(paiId: string, nome: string, gpsId: string): Promise<ArquivoDrive> {
      exigirId(paiId, "create");
      const res = await api(
        "POST",
        `/files?${qs({ fields: CAMPOS_ARQUIVO, ...DRIVES })}`,
        "create",
        {
          escrita: true,
          corpo: {
            name: nome,
            mimeType: MIME_PASTA,
            parents: [paiId],
            appProperties: { [CHAVE_GPS_ID]: gpsId },
          },
        },
      );
      return await res.json();
    },

    async copiarArquivo(
      origemId: string,
      paiId: string,
      nome: string,
      gpsId: string,
    ): Promise<ArquivoDrive> {
      exigirId(origemId, "copy");
      exigirId(paiId, "copy");
      const res = await api(
        "POST",
        `/files/${encodeURIComponent(origemId)}/copy?${qs({ fields: CAMPOS_ARQUIVO, ...DRIVES })}`,
        "copy",
        {
          escrita: true,
          corpo: { name: nome, parents: [paiId], appProperties: { [CHAVE_GPS_ID]: gpsId } },
        },
      );
      return await res.json();
    },

    /** Atalho não se copia: cria um novo apontando para o mesmo alvo. */
    async criarAtalho(
      paiId: string,
      nome: string,
      alvoId: string,
      gpsId: string,
    ): Promise<ArquivoDrive> {
      exigirId(paiId, "shortcut");
      exigirId(alvoId, "shortcut");
      const res = await api(
        "POST",
        `/files?${qs({ fields: CAMPOS_ARQUIVO, ...DRIVES })}`,
        "shortcut",
        {
          escrita: true,
          corpo: {
            name: nome,
            mimeType: MIME_ATALHO,
            parents: [paiId],
            shortcutDetails: { targetId: alvoId },
            appProperties: { [CHAVE_GPS_ID]: gpsId },
          },
        },
      );
      return await res.json();
    },

    async listarPermissoes(id: string): Promise<PermissaoDrive[]> {
      exigirId(id, "permissions.list");
      const todos: PermissaoDrive[] = [];
      let pageToken = "";
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const params: Record<string, string> = {
          fields: "nextPageToken,permissions(id,type,role,emailAddress)",
          pageSize: "100",
          ...DRIVES,
        };
        if (pageToken) params.pageToken = pageToken;
        const res = await api(
          "GET",
          `/files/${encodeURIComponent(id)}/permissions?${qs(params)}`,
          "permissions.list",
          { escrita: false },
        );
        const j = await res.json();
        if (Array.isArray(j?.permissions)) todos.push(...j.permissions);
        pageToken = typeof j?.nextPageToken === "string" ? j.nextPageToken : "";
        if (!pageToken) return todos;
      }
      throw new GdriveErro("outro", 0, "permissions.list: paginação sem fim");
    },

    /**
     * Compartilha com um usuário, com e-mail de aviso do Google.
     * 400 vira `compartilhamento_recusado` (ex.: e-mail sem conta Google).
     */
    async compartilhar(
      id: string,
      email: string,
      papel: PapelCompartilhamento,
      mensagem?: string,
    ): Promise<PermissaoDrive> {
      exigirId(id, "permissions.create");
      const params: Record<string, string> = {
        sendNotificationEmail: "true",
        fields: "id,type,role,emailAddress",
        ...DRIVES,
      };
      if (mensagem) params.emailMessage = mensagem.slice(0, 500);
      try {
        const res = await api(
          "POST",
          `/files/${encodeURIComponent(id)}/permissions?${qs(params)}`,
          "permissions.create",
          { escrita: true, corpo: { type: "user", role: papel, emailAddress: email } },
        );
        return await res.json();
      } catch (e) {
        if (e instanceof GdriveErro && e.status === 400) {
          throw new GdriveErro("compartilhamento_recusado", 400, e.message, e.motivo);
        }
        throw e;
      }
    },

    /**
     * Remove UMA permissão (a que o sistema concedeu). `false` = já não
     * existia (404). Nunca remove por e-mail: só pelo id registrado.
     */
    async removerPermissao(id: string, permissaoId: string): Promise<boolean> {
      exigirId(id, "permissions.delete");
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(permissaoId)) {
        throw new GdriveErro("outro", 0, "permissions.delete: id de permissão inválido");
      }
      try {
        const res = await api(
          "DELETE",
          `/files/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissaoId)}?${qs(DRIVES)}`,
          "permissions.delete",
          { escrita: true },
        );
        await res.body?.cancel();
        return true;
      } catch (e) {
        if (e instanceof GdriveErro && e.tipo === "nao_encontrado") return false;
        throw e;
      }
    },
  };
}

export type Gdrive = ReturnType<typeof criarGdrive>;
