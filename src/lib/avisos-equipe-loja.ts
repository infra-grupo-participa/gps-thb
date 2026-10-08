/**
 * Loja do sino da equipe — UMA por aba, no escopo do módulo.
 *
 * 🔑 Por que módulo e não estado do componente: o `AppHeader` NÃO vive num
 * layout — cada `page.tsx` o renderiza (46 páginas). Trocar de página
 * desmonta e remonta o sino. Com estado no componente, cada navegação faria
 * um `avisos_contar` novo e abriria um canal Realtime novo. Aqui a contagem,
 * o canal e o polling sobrevivem à remontagem: 1 `avisos_contar` por
 * carregamento da aba, 0 por navegação. O canal só fecha quando o último
 * sino some e não volta em `PAUSA_DESMONTE_MS` (saiu de vez das telas de
 * admin) — aí, se voltar, relê a contagem uma vez.
 *
 * 🔑 Realtime é só SINAL: o payload não é lido. Cada INSERT agenda uma
 * releitura por `avisos_listar` (que traz `toast`, `lido` e a contagem).
 *
 * 🔑 Polling SEMPRE ligado com a aba visível (veredito de 08/10): canal
 * `SUBSCRIBED` não prova entrega — se o JWT do canal estiver atrasado, a RLS
 * do Realtime filtra em silêncio e o sino ficaria mudo para sempre. Canal
 * saudável: `avisos_contar` a cada 300 s; sem canal: 120 s. Aba oculta: nada;
 * ao voltar, relê 1× (se a última leitura tem ≥ 30 s).
 *
 * 🔑 Pop-up uma vez só entre abas/janelas do mesmo admin: `BroadcastChannel`
 * por e-mail. Quem quer mostrar o aviso X anuncia e espera `JANELA_DISPUTA_MS`;
 * quem anunciou antes ganha, empate vai para o menor id de aba. Sem
 * `BroadcastChannel`, cada aba mostra o seu (fallback silencioso).
 *
 * 🔑 O SDK do Supabase entra por `import()` (regra da Onda 4: 64 KB gzip fora
 * do carregamento inicial de toda rota de admin).
 */

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  AVISOS_REALTIME,
  type AvisoItem,
  type AvisosContagem,
  type AvisosLista,
  type AvisosMarcados,
} from "./avisos-tipos";
import {
  decidirToast,
  enfileirar,
  FILA_VAZIA,
  novosParaToast,
  idsQueGanhei,
  type FilaToast,
  type PlanoToast,
  type ReivindicacaoAlheia,
} from "./avisos-toast";

export type FaseAvisos = "carregando" | "pronto" | "indisponivel" | "oculto";

export interface EstadoAvisos {
  /** `oculto` = interruptor desligado ou sem permissão (42501): sem sino. */
  fase: FaseAvisos;
  naoLidos: number;
  ultimoId: number | null;
  silenciado: boolean;
}

const POLL_MS = 120_000;
const POLL_SAUDAVEL_MS = 300_000;
const RELER_AO_VOLTAR_MS = 30_000;
const JANELA_DISPUTA_MS = 400;
const ESPERA_CONEXAO_MS = 15_000;
const PAUSA_DESMONTE_MS = 5_000;
const JUNTAR_SINAIS_MS = 1_000;
const LIMITE_RELEITURA = 20;
const LIMITE_PAINEL = 30;

const INICIAL: EstadoAvisos = {
  fase: "carregando",
  naoLidos: 0,
  ultimoId: null,
  silenciado: false,
};

let estado: EstadoAvisos = INICIAL;
const ouvintes = new Set<() => void>();
let aoToast: ((p: PlanoToast) => void) | null = null;

let iniciado = false;
let chaveSilencio: string | null = null;
let clientePromessa: Promise<SupabaseClient> | null = null;
let canal: RealtimeChannel | null = null;
let conectado = false;
let caiuAlgumaVez = false;
let timerConexao: ReturnType<typeof setTimeout> | null = null;
let timerPoll: ReturnType<typeof setTimeout> | null = null;
/** Instante da última leitura de contagem (contar/listar), para o "voltar à aba". */
let ultimaLeituraEm = 0;
/** Id desta aba na disputa do pop-up. */
const ABA = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let bc: BroadcastChannel | null = null;
/** Ids que ESTA aba anunciou e ainda não decidiu. */
const minhas = new Set<number>();
/** Anúncios das outras abas, por id de aviso. */
const alheias = new Map<number, ReivindicacaoAlheia[]>();
let timerDesmonte: ReturnType<typeof setTimeout> | null = null;
let timerSinal: ReturnType<typeof setTimeout> | null = null;
let timerToast: ReturnType<typeof setTimeout> | null = null;
let fila: FilaToast = FILA_VAZIA;
/** Maior id já considerado — base para decidir o que é "novo" no pop-up. */
let ultimoVisto: number | null = null;
/** Chegou sinal com a aba oculta: relê a contagem ao voltar. */
let sujo = false;
/** Cache da lista do painel: reabrir sem aviso novo não relê. */
let cacheLista: { itens: AvisoItem[]; ultimoId: number | null } | null = null;

function definir(parcial: Partial<EstadoAvisos>) {
  const novo = { ...estado, ...parcial };
  if (
    novo.fase === estado.fase &&
    novo.naoLidos === estado.naoLidos &&
    novo.ultimoId === estado.ultimoId &&
    novo.silenciado === estado.silenciado
  ) {
    return;
  }
  estado = novo;
  for (const o of ouvintes) o();
}

function cliente(): Promise<SupabaseClient> {
  clientePromessa ??= import("./supabase/client").then((m) => m.createClient());
  return clientePromessa;
}

function visivel(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function ehSemPermissao(e: { code?: string } | null): boolean {
  return e?.code === "42501";
}

function aplicarContagem(d: Pick<AvisosContagem, "ativo" | "nao_lidos" | "ultimo_id">) {
  if (!d.ativo) {
    definir({ fase: "oculto" });
    desligarTudo();
    return;
  }
  definir({ fase: "pronto", naoLidos: d.nao_lidos ?? 0, ultimoId: d.ultimo_id ?? null });
}

async function contar(): Promise<void> {
  const sb = await cliente();
  ultimaLeituraEm = Date.now();
  const { data, error } = await sb.schema("gps").rpc("avisos_contar");
  if (error || !data) {
    if (ehSemPermissao(error)) {
      definir({ fase: "oculto" });
      desligarTudo();
    } else if (estado.fase === "carregando") {
      definir({ fase: "indisponivel" });
    }
    return;
  }
  const d = data as AvisosContagem;
  aplicarContagem(d);
  // Base do pop-up: o que já existia ao contar nunca vira pop-up.
  ultimoVisto = Math.max(ultimoVisto ?? 0, d.ultimo_id ?? 0);
}

/** Releitura disparada pelo sinal do Realtime (aba visível). */
async function relerPorSinal(): Promise<void> {
  const sb = await cliente();
  ultimaLeituraEm = Date.now();
  const { data, error } = await sb
    .schema("gps")
    .rpc("avisos_listar", { p_limite: LIMITE_RELEITURA });
  if (error || !data) {
    if (ehSemPermissao(error)) {
      definir({ fase: "oculto" });
      desligarTudo();
    }
    return;
  }
  const d = data as AvisosLista;
  aplicarContagem(d);
  if (!d.ativo) return;
  const ids = new Set(novosParaToast(d.itens ?? [], ultimoVisto));
  ultimoVisto = Math.max(ultimoVisto ?? 0, d.ultimo_id ?? 0);
  if (ids.size === 0 || estado.silenciado || !visivel()) return;
  const ganhos = new Set(await reivindicar([...ids]));
  if (ganhos.size === 0 || estado.silenciado) return;
  fila = enfileirar(
    fila,
    (d.itens ?? [])
      .filter((i) => ganhos.has(i.id))
      .sort((a, b) => a.id - b.id),
  );
  processarFila();
}

function abrirDisputa(email: string | null) {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    bc = new BroadcastChannel(`gps-avisos-toast:${(email ?? "").toLowerCase()}`);
    bc.onmessage = (e: MessageEvent) => {
      const m = e.data as { aba?: unknown; ids?: unknown } | null;
      if (!m || typeof m.aba !== "string" || !Array.isArray(m.ids)) return;
      for (const id of m.ids) {
        if (typeof id !== "number") continue;
        const lista = alheias.get(id) ?? [];
        // Ainda não anunciei este id = a outra aba chegou ANTES: ela ganha.
        lista.push({ aba: m.aba, antesDaMinha: !minhas.has(id) });
        alheias.set(id, lista);
      }
      // Teto de memória: só os 500 ids mais recentes importam.
      if (alheias.size > 500) {
        const velhos = [...alheias.keys()].sort((a, b) => a - b).slice(0, alheias.size - 500);
        for (const v of velhos) alheias.delete(v);
      }
    };
  } catch {
    bc = null; // fallback silencioso: cada aba mostra o seu
  }
}

/** Devolve os ids que ESTA aba ganhou o direito de mostrar. */
async function reivindicar(ids: number[]): Promise<number[]> {
  if (!bc) return ids;
  // Outra aba já anunciou antes de o sinal chegar aqui: é dela.
  const livres = ids.filter((id) => !alheias.has(id));
  if (livres.length === 0) return [];
  for (const id of livres) minhas.add(id);
  try {
    bc.postMessage({ aba: ABA, ids: livres });
  } catch {
    for (const id of livres) minhas.delete(id);
    return livres;
  }
  await new Promise((r) => setTimeout(r, JANELA_DISPUTA_MS));
  const ganhos = idsQueGanhei(livres, ABA, alheias);
  for (const id of livres) minhas.delete(id);
  return ganhos;
}

function processarFila() {
  if (timerToast) {
    clearTimeout(timerToast);
    timerToast = null;
  }
  const r = decidirToast(fila, Date.now(), visivel());
  fila = r.fila;
  if (r.plano && aoToast && !estado.silenciado) aoToast(r.plano);
  if (r.esperarMs !== null) timerToast = setTimeout(processarFila, r.esperarMs);
}

function aoSinal() {
  if (!visivel()) {
    sujo = true;
    return;
  }
  if (timerSinal) clearTimeout(timerSinal);
  timerSinal = setTimeout(() => {
    timerSinal = null;
    void relerPorSinal();
  }, JUNTAR_SINAIS_MS);
}

/**
 * (Re)agenda o próximo `avisos_contar`. Sempre ligado com a aba visível; o
 * canal só alonga o intervalo (300 s saudável, 120 s sem canal).
 */
function agendarPoll() {
  pararPolling();
  if (!iniciado || estado.fase === "oculto" || !visivel()) return;
  timerPoll = setTimeout(
    () => {
      timerPoll = null;
      if (!visivel()) return; // aba oculta: para; o retorno religa
      void contar().finally(agendarPoll);
    },
    conectado ? POLL_SAUDAVEL_MS : POLL_MS,
  );
}

function pararPolling() {
  if (timerPoll) clearTimeout(timerPoll);
  timerPoll = null;
}

async function abrirCanal() {
  if (canal || estado.fase === "oculto") return;
  const sb = await cliente();
  // Reler pelo getter: durante o `await` a fase pode ter virado "oculto".
  if (!iniciado || canal || lerEstado().fase === "oculto") return;
  conectado = false;
  canal = sb
    .channel("gps-avisos-equipe")
    .on(
      "postgres_changes",
      {
        event: AVISOS_REALTIME.event,
        schema: AVISOS_REALTIME.schema,
        table: AVISOS_REALTIME.table,
      },
      () => aoSinal(),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (timerConexao) clearTimeout(timerConexao);
        timerConexao = null;
        const voltou = caiuAlgumaVez;
        conectado = true;
        agendarPoll(); // NÃO para: só passa a 300 s
        // Reconectou depois de cair (ou a contagem inicial falhou): o que
        // chegou no buraco só vem relendo.
        if ((voltou || estado.fase === "indisponivel") && visivel()) void contar();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        const estava = conectado;
        conectado = false;
        caiuAlgumaVez = true;
        if (estava) agendarPoll(); // volta a 120 s
      }
    });
  timerConexao = setTimeout(() => {
    timerConexao = null;
    if (!conectado) caiuAlgumaVez = true;
  }, ESPERA_CONEXAO_MS);
}

function aoMudarVisibilidade() {
  if (!visivel()) {
    pararPolling();
    return;
  }
  const reler = sujo || Date.now() - ultimaLeituraEm >= RELER_AO_VOLTAR_MS;
  sujo = false;
  if (reler) void contar().finally(agendarPoll);
  else agendarPoll();
}

function desligarTudo() {
  pararPolling();
  for (const t of [timerConexao, timerSinal, timerToast]) if (t) clearTimeout(t);
  timerConexao = timerSinal = timerToast = null;
  fila = FILA_VAZIA;
  if (canal) {
    const c = canal;
    canal = null;
    void cliente().then((sb) => sb.removeChannel(c));
  }
  conectado = false;
  caiuAlgumaVez = false;
  if (bc) {
    try {
      bc.close();
    } catch {
      /* nada */
    }
    bc = null;
  }
  minhas.clear();
  alheias.clear();
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  }
}

function lerSilencio(chave: string): boolean {
  try {
    return window.localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}

async function iniciar(email: string | null) {
  chaveSilencio = `gps:avisos:silenciar:${(email ?? "").toLowerCase()}`;
  definir({ silenciado: lerSilencio(chaveSilencio) });
  iniciado = true;
  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  abrirDisputa(email);
  await contar();
  if (!iniciado || lerEstado().fase === "oculto") return;
  agendarPoll();
  await abrirCanal();
}

/**
 * Só para teste (`avisos-equipe-loja.test.mjs`): injeta um cliente falso no
 * lugar do `import()` do SDK. Nenhum código de produto chama.
 */
export function definirClienteParaTeste(sb: unknown) {
  clientePromessa = Promise.resolve(sb as SupabaseClient);
}

// ── API do componente ────────────────────────────────────────────────────

export function lerEstado(): EstadoAvisos {
  return estado;
}

export function lerEstadoServidor(): EstadoAvisos {
  return INICIAL;
}

/**
 * Assina a loja. O 1º assinante da aba liga tudo (1 `avisos_contar` + canal);
 * desmontar e remontar em < 5 s (troca de página) não relê nada.
 */
export function assinar(ouvinte: () => void, email: string | null): () => void {
  ouvintes.add(ouvinte);
  if (timerDesmonte) {
    clearTimeout(timerDesmonte);
    timerDesmonte = null;
  }
  if (!iniciado && estado.fase !== "oculto") void iniciar(email);
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size > 0) return;
    timerDesmonte = setTimeout(() => {
      timerDesmonte = null;
      if (ouvintes.size > 0) return;
      iniciado = false;
      desligarTudo();
      // Contagem pode ter ficado velha sem canal: a próxima montagem relê.
      if (estado.fase !== "oculto") definir({ fase: "carregando" });
      cacheLista = null;
    }, PAUSA_DESMONTE_MS);
  };
}

/** Quem desenha o pop-up (o sino montado). Devolve a função de soltar. */
export function registrarToast(fn: (p: PlanoToast) => void): () => void {
  aoToast = fn;
  return () => {
    if (aoToast === fn) aoToast = null;
  };
}

export function definirSilencio(silenciar: boolean) {
  if (chaveSilencio) {
    try {
      if (silenciar) window.localStorage.setItem(chaveSilencio, "1");
      else window.localStorage.removeItem(chaveSilencio);
    } catch {
      /* armazenamento bloqueado: vale só nesta aba */
    }
  }
  if (silenciar) fila = FILA_VAZIA;
  definir({ silenciado: silenciar });
}

export type ResultadoLista =
  | { ok: true; itens: AvisoItem[] }
  | { ok: false; erro: string };

/**
 * Lista do painel (só ao abrir). Reabrir sem aviso novo usa o cache. Depois de
 * ler, marca como lido até o `ultimo_id` e devolve os itens com o `lido` de
 * ANTES da marcação — o destaque mostra o que era novo nesta abertura.
 */
export async function abrirLista(): Promise<ResultadoLista> {
  const sb = await cliente();
  if (cacheLista && cacheLista.ultimoId === estado.ultimoId && estado.naoLidos === 0) {
    return { ok: true, itens: cacheLista.itens };
  }
  const { data, error } = await sb
    .schema("gps")
    .rpc("avisos_listar", { p_limite: LIMITE_PAINEL });
  if (error || !data) {
    if (ehSemPermissao(error)) {
      definir({ fase: "oculto" });
      desligarTudo();
    }
    return { ok: false, erro: "Não foi possível carregar os avisos agora." };
  }
  ultimaLeituraEm = Date.now();
  const d = data as AvisosLista;
  aplicarContagem(d);
  const itens = d.itens ?? [];
  const ultimoId = d.ultimo_id ?? null;
  ultimoVisto = Math.max(ultimoVisto ?? 0, ultimoId ?? 0);
  cacheLista = { itens: itens.map((i) => ({ ...i, lido: true })), ultimoId };

  if (ultimoId !== null && d.nao_lidos > 0) {
    const r = await sb.schema("gps").rpc("avisos_marcar_lidos", { p_ate: ultimoId });
    if (!r.error && r.data) {
      definir({ naoLidos: (r.data as AvisosMarcados).nao_lidos ?? 0 });
    }
  }
  return { ok: true, itens };
}

let chavePushPromessa: Promise<string> | null = null;

/**
 * Chave VAPID PÚBLICA (`gps.config.push_vapid_publica`) para o botão "Receber
 * avisos neste aparelho". Lida só na 1ª abertura do painel, 1× por aba;
 * falha ou ausência = "" (o botão não aparece) e a próxima abertura tenta de novo.
 */
export function lerChavePush(): Promise<string> {
  chavePushPromessa ??= cliente()
    .then((sb) =>
      sb
        .schema("gps")
        .from("config")
        .select("valor")
        .eq("chave", "push_vapid_publica")
        .maybeSingle(),
    )
    .then(({ data, error }) => {
      if (error) throw error;
      return String((data as { valor?: string } | null)?.valor ?? "").trim();
    })
    .catch(() => {
      chavePushPromessa = null;
      return "";
    });
  return chavePushPromessa;
}
