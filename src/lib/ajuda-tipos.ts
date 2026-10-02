/**
 * Central de ajuda (Onda 5, 02/10/2026) — tipos, limites e funções puras.
 *
 * SEM `"use server"` e sem import de valor: é lido pelo client component do
 * painel de ajuda, pelas Server Actions e pelo teste `node --test`
 * (`ajuda-tipos.test.mjs`). As leituras ficam em `src/lib/data/ajuda.ts`; as
 * escritas em `src/app/ajuda/actions.ts` e `src/app/admin/ajuda/actions.ts`.
 *
 * 🔑 Cada limite daqui existe TAMBÉM no banco (migração
 * `20261002000342_gps_central_de_ajuda.sql`). Aqui é para a mensagem chegar
 * boa e para não gastar ida ao banco à toa — nunca é a barreira.
 *
 * SEM IA no produto (decisão do João): artigo curado pela equipe e busca por
 * texto do Postgres (`websearch_to_tsquery`, sem acento).
 */

import type { CategoriaChamado } from "@/lib/chamados-tipos";

/** Mesmos tetos dos CHECK de `gps.ajuda_artigos` / `gps.ajuda_feedback`. */
export const AJUDA_TITULO_MINIMO = 3;
export const AJUDA_TITULO_MAXIMO = 120;
export const AJUDA_CORPO_MINIMO = 10;
export const AJUDA_CORPO_MAXIMO = 4000;
export const AJUDA_PALAVRAS_MAXIMO = 1000;
export const AJUDA_ROTAS_MAXIMO = 20;
/** Busca com menos que isto devolve vazio no banco — não chame. */
export const AJUDA_BUSCA_MINIMO = 3;
/** O banco corta a busca e o termo gravado em 120. */
export const AJUDA_TERMO_MAXIMO = 120;
/** Teto de avaliações por pessoa por hora (P0001 acima disto). */
export const AJUDA_FEEDBACK_POR_HORA = 30;

/** Onde a pessoa estava quando usou a ajuda (CHECK `origem`). */
export type OrigemAjuda = "tela" | "busca" | "chamado";
export const ORIGENS_AJUDA: readonly OrigemAjuda[] = ["tela", "busca", "chamado"] as const;

/** As 4 categorias de chamado (`CATEGORIAS_CHAMADO`), repetidas no CHECK. */
export type CategoriaAjuda = CategoriaChamado;
const CATEGORIAS: readonly string[] = ["sistema", "troca_cliente", "troca_socio", "outros"];

/** Artigo como o PARCEIRO recebe (`gps.ajuda_por_rota`). Só ativo. */
export interface ArtigoAjuda {
  id: string;
  titulo: string;
  /** Texto simples; parágrafos separados por linha em branco — ver `paragrafosDoCorpo`. */
  corpo: string;
  rotas: string[];
  categorias: CategoriaAjuda[];
  ordem: number;
}

/** Resultado de `gps.ajuda_buscar` — o artigo + a relevância (maior = melhor). */
export interface ResultadoBuscaAjuda extends ArtigoAjuda {
  relevancia: number;
}

/** Linha completa, só para a tela do ADMIN (select sob a RLS de admin). */
export interface ArtigoAjudaAdmin extends ArtigoAjuda {
  palavrasChave: string | null;
  sinonimos: string | null;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** Entrada de `salvarArtigoAjuda`. `id` ausente/null = cria. */
export interface EntradaArtigoAjuda {
  id?: string | null;
  titulo: string;
  corpo: string;
  rotas: string[];
  categorias: CategoriaAjuda[];
  palavrasChave?: string | null;
  sinonimos?: string | null;
  /** `false` arquiva (some do parceiro). Nunca se apaga artigo. */
  ativo: boolean;
  ordem: number;
}

/**
 * Entrada de `registrarFeedbackAjuda`.
 *  - `resolveu: null`  → VISTA (abriu o artigo).
 *  - `resolveu: true/false` → "isso resolveu?".
 *  - `artigoId: null` → busca SEM resultado: exige `origem: "busca"` e `termo`.
 */
export interface EntradaFeedbackAjuda {
  artigoId: string | null;
  resolveu: boolean | null;
  origem: OrigemAjuda;
  termo?: string | null;
}

/** Métricas agregadas (`gps.admin_ajuda_metricas`) — nenhuma coluna de pessoa. */
export interface MetricaArtigoAjuda {
  artigoId: string;
  titulo: string;
  ativo: boolean;
  vistas: number;
  resolveuSim: number;
  resolveuNao: number;
  ultimoEm: string | null;
}
export interface TermoSemResultado {
  termo: string;
  vezes: number;
  ultimoEm: string;
}
export interface MetricasAjuda {
  janelaDias: number;
  artigos: MetricaArtigoAjuda[];
  termosSemResultado: TermoSemResultado[];
}

/** Leitura que distingue "vazio" de "não deu para saber". */
export type LeituraAjuda<T> = { ok: true; dados: T } | { ok: false };

export type ResultadoAcaoAjuda = { ok: true } | { ok: false; erro: string };
export type ResultadoBuscaAcao =
  | { ok: true; resultados: ResultadoBuscaAjuda[] }
  | { ok: false; erro: string };
export type ResultadoSalvarArtigo = { ok: true; id: string } | { ok: false; erro: string };

// ─────────────────────────────────────────────────────────────────────────
// Funções puras (testadas em `ajuda-tipos.test.mjs`)
// ─────────────────────────────────────────────────────────────────────────

/** Espaços colapsados, sem controle, cortado em 120. Espelha o banco. */
export function normalizarTermoAjuda(q: string | null | undefined): string {
  return (q ?? "")
    .replace(/[\u0000-\u001f\u007f\s]+/g, " ")
    .trim()
    .slice(0, AJUDA_TERMO_MAXIMO)
    .trim();
}

/** `true` se vale chamar `buscarAjuda` (o banco devolve vazio abaixo de 3). */
export function buscaAjudaValida(q: string | null | undefined): boolean {
  return normalizarTermoAjuda(q).length >= AJUDA_BUSCA_MINIMO;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTA = /^\/[a-z0-9/_-]{0,80}$/;

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/**
 * Rota da tela → a forma que `gps.ajuda_artigos.rotas` usa. Mesma regra de
 * `gps.ajuda_normalizar_rota`: minúscula, sem `?query`/`#hash`, sem barra final
 * (exceto `/`). O modo assistência (`/admin/aluno/<uuid>/x`) vira a rota do
 * parceiro (`/x`) — é a mesma tela. Fora do formato → `null`.
 */
export function rotaDeAjuda(pathname: string | null | undefined): string | null {
  let r = (pathname ?? "").trim().toLowerCase().split("?")[0].split("#")[0];
  const assist = /^\/admin\/aluno\/[0-9a-f-]{36}(\/.*)?$/.exec(r);
  if (assist) r = assist[1] ?? "/";
  if (r.length > 1) r = r.replace(/\/+$/, "");
  return ROTA.test(r) ? r : null;
}

export function ehCategoriaAjuda(v: unknown): v is CategoriaAjuda {
  return typeof v === "string" && CATEGORIAS.includes(v);
}

export function ehOrigemAjuda(v: unknown): v is OrigemAjuda {
  return typeof v === "string" && (ORIGENS_AJUDA as readonly string[]).includes(v);
}

/** Corpo em texto simples → parágrafos (linha em branco separa; CRLF aceito). */
export function paragrafosDoCorpo(corpo: string | null | undefined): string[] {
  return (corpo ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);
}

/**
 * Valida a entrada do admin ANTES da RPC (mensagem igual à do banco).
 * Devolve a frase do primeiro problema, ou `null` se está tudo certo.
 */
export function problemaNoArtigo(e: EntradaArtigoAjuda): string | null {
  // Server Action é endpoint HTTP: o tipo só vale em compilação.
  if (
    typeof e.titulo !== "string" ||
    typeof e.corpo !== "string" ||
    (e.palavrasChave != null && typeof e.palavrasChave !== "string") ||
    (e.sinonimos != null && typeof e.sinonimos !== "string") ||
    !Array.isArray(e.rotas) ||
    !e.rotas.every((r) => typeof r === "string") ||
    !Array.isArray(e.categorias)
  ) {
    return "Preencha o artigo antes de salvar.";
  }
  const titulo = e.titulo.replace(/\s+/g, " ").trim();
  if (titulo.length < AJUDA_TITULO_MINIMO || titulo.length > AJUDA_TITULO_MAXIMO) {
    return `O título precisa ter de ${AJUDA_TITULO_MINIMO} a ${AJUDA_TITULO_MAXIMO} caracteres.`;
  }
  const corpo = e.corpo.replace(/\r\n/g, "\n").trim();
  if (corpo.length < AJUDA_CORPO_MINIMO || corpo.length > AJUDA_CORPO_MAXIMO) {
    return `O texto precisa ter de ${AJUDA_CORPO_MINIMO} a ${AJUDA_CORPO_MAXIMO} caracteres.`;
  }
  if (
    (e.palavrasChave ?? "").trim().length > AJUDA_PALAVRAS_MAXIMO ||
    (e.sinonimos ?? "").trim().length > AJUDA_PALAVRAS_MAXIMO
  ) {
    return `Palavras-chave e sinônimos aceitam até ${AJUDA_PALAVRAS_MAXIMO} caracteres cada.`;
  }
  if (e.rotas.some((r) => rotaDeAjuda(r) === null)) {
    return "Rota inválida: use o caminho da tela, como /clientes.";
  }
  if (new Set(e.rotas.map(rotaDeAjuda)).size > AJUDA_ROTAS_MAXIMO) {
    return `No máximo ${AJUDA_ROTAS_MAXIMO} rotas por artigo.`;
  }
  if (!e.categorias.every(ehCategoriaAjuda)) return "Categoria inválida.";
  if (!Number.isInteger(e.ordem) || Math.abs(e.ordem) > 1_000_000) {
    return "A ordem precisa ser um número inteiro (até 1.000.000).";
  }
  if (e.id != null && !ehUuid(e.id)) return "Artigo não encontrado.";
  return null;
}
