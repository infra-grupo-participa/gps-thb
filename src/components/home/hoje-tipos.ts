/**
 * "Hoje no programa" (home do parceiro, item 1.6) — contrato entre a leitura
 * (`src/lib/data/hoje.ts`) e a tela (`hoje-no-programa.tsx`), mais as regras
 * PURAS: validação dos atalhos e o "quando" de um horário.
 *
 * Sem React, sem Supabase, sem `"use server"`: é o que deixa
 * `hoje-tipos.test.mjs` rodar em `node --test` sem runner novo.
 *
 * 🔑 Cada parte do bloco é `null` quando a LEITURA falhou — e aí a parte some
 * da tela (com `logErro` no servidor). Lista vazia/nenhum horário NÃO é
 * `null`: é resultado, e a tela diz isso. Falha não vira "nada marcado".
 */

/** Um horário do Plantão como a home mostra. Nunca carrega link de sala. */
export interface PlantaoSlotHoje {
  slotId: string;
  /** "YYYY-MM-DD" (date do Postgres, sem fuso). */
  data: string;
  /** "HH:MM" */
  horaInicio: string;
  duracaoMin: number;
  mentoraNome: string;
  inicioEm: string;
  fimEm: string;
  prazoEm: string | null;
  inscricaoAberta: boolean;
  emIntervalo: boolean;
}

export interface MinhaInscricaoHoje {
  data: string;
  horaInicio: string;
  duracaoMin: number;
  mentoraNome: string;
  inicioEm: string;
  fimEm: string;
}

export interface PlantaoHoje {
  /** O próximo publicado que ainda não terminou (o de hoje em andamento conta). */
  proximo: PlantaoSlotHoje | null;
  /** O primeiro que a pessoa ainda pode pegar, quando NÃO é o `proximo`. */
  abertoParaVoce: PlantaoSlotHoje | null;
  /** Inscrição que ainda não terminou. */
  minhaInscricao: MinhaInscricaoHoje | null;
}

export interface SessaoHoje {
  tipoNome: string | null;
  clienteNome: string | null;
  data: string;
  horaInicio: string;
  inicioEm: string;
}

export interface AtalhoHome {
  rotulo: string;
  url: string;
  descricao: string | null;
}

export interface HojeNoPrograma {
  plantao: PlantaoHoje | null;
  /** `{ proxima: null }` = nenhuma marcada; `null` = a leitura falhou. */
  sessoes: { proxima: SessaoHoje | null } | null;
  /** `[]` = nenhum configurado (a parte some); `null` = a leitura falhou. */
  atalhos: AtalhoHome[] | null;
  /** Instante da leitura (ms) — a tela não chama `Date.now()` no render. */
  agoraMs: number;
  /** "YYYY-MM-DD" de hoje em São Paulo. */
  hoje: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Atalhos — gps.config.home_atalhos
// ─────────────────────────────────────────────────────────────────────────

export const ATALHOS_MAXIMO = 8;
export const ATALHO_ROTULO_MAXIMO = 60;
export const ATALHO_DESCRICAO_MAXIMO = 140;
export const ATALHO_URL_MAXIMO = 500;

// Caractere de controle (C0, DEL e C1) — quebra de linha colada vira lixo na tela.
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

function textoLimpo(v: unknown, maximo: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > maximo || CONTROLE.test(s)) return null;
  return s;
}

/** Só `https://`, sem usuário/senha embutidos, sem espaço nem barra invertida. */
export function urlHttpsSegura(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > ATALHO_URL_MAXIMO) return null;
  if (!s.toLowerCase().startsWith("https://")) return null;
  if (/[\s\\]/.test(s) || CONTROLE.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return null;
  return u.href;
}

export interface AtalhosValidados {
  atalhos: AtalhoHome[];
  /** Itens recusados (formato, URL, rótulo) — vai para o log, não para a tela. */
  descartados: number;
  /** Itens válidos que passaram do teto de 8 e foram cortados. */
  cortados: number;
  /** O texto não é um array JSON. A parte some inteira. */
  invalido: boolean;
}

/**
 * Valida o texto cru de `gps.config.home_atalhos`. Item ruim é DESCARTADO
 * (os bons continuam); texto que não é array JSON zera a lista. Nunca lança.
 */
export function validarAtalhos(bruto: unknown): AtalhosValidados {
  const vazio = (invalido: boolean): AtalhosValidados => ({
    atalhos: [],
    descartados: 0,
    cortados: 0,
    invalido,
  });
  if (typeof bruto !== "string") return vazio(true);
  let lista: unknown;
  try {
    lista = JSON.parse(bruto);
  } catch {
    return vazio(true);
  }
  if (!Array.isArray(lista)) return vazio(true);

  const validos: AtalhoHome[] = [];
  let descartados = 0;
  for (const item of lista) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      descartados++;
      continue;
    }
    const o = item as Record<string, unknown>;
    const rotulo = textoLimpo(o.rotulo, ATALHO_ROTULO_MAXIMO);
    const url = urlHttpsSegura(o.url);
    if (!rotulo || !url) {
      descartados++;
      continue;
    }
    // Descrição é opcional: inválida vira ausente, não derruba o atalho.
    const descricao =
      o.descricao == null ? null : textoLimpo(o.descricao, ATALHO_DESCRICAO_MAXIMO);
    validos.push({ rotulo, url, descricao });
  }
  return {
    atalhos: validos.slice(0, ATALHOS_MAXIMO),
    descartados,
    cortados: Math.max(0, validos.length - ATALHOS_MAXIMO),
    invalido: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Plantão — estado da inscrição em relação à sala
// ─────────────────────────────────────────────────────────────────────────

/** A sala libera 1h antes do início e fica aberta até o fim (…171/…172). */
export const SALA_ABRE_ANTES_MS = 60 * 60 * 1000;

export type EstadoSala = "aguardando" | "aberta" | "encerrada";

export function estadoDaSala(inicioEm: string, fimEm: string, agoraMs: number): EstadoSala {
  const inicio = new Date(inicioEm).getTime();
  const fim = new Date(fimEm).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return "aguardando";
  if (agoraMs >= fim) return "encerrada";
  if (agoraMs >= inicio - SALA_ABRE_ANTES_MS) return "aberta";
  return "aguardando";
}
