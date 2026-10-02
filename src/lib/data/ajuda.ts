import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import {
  rotaDeAjuda,
  type ArtigoAjuda,
  type ArtigoAjudaAdmin,
  type CategoriaAjuda,
  type LeituraAjuda,
  type MetricasAjuda,
} from "@/lib/ajuda-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Central de ajuda — LEITURAS (migração `20261002000342`).
//
// Parceiro: `gps.ajuda_por_rota` (INVOKER, RLS `ativo`) e `gps.ajuda_ativo()`.
// Admin: select direto em `gps.ajuda_artigos` sob a policy só-admin (vê
// arquivados) + `gps.admin_ajuda_metricas()` (agregado, sem pessoa).
//
// 🔑 Cache: `cache()` do React = memo POR REQUISIÇÃO. Sem cache entre
// requisições: o cliente do Supabase lê o cookie da sessão, e cache
// persistente (`unstable_cache`) é proibido neste repo (`src/lib/auth.ts`) —
// cookie dentro de cache cross-request é vazamento de sessão.
//
// 🔴 Falha devolve `{ ok: false }`, nunca lista vazia: "não há artigo para
// esta tela" é uma afirmação; a consulta ter falhado não a prova.
// ─────────────────────────────────────────────────────────────────────────

interface LinhaArtigo {
  id: string;
  titulo: string;
  corpo: string;
  rotas: string[] | null;
  categorias: string[] | null;
  ordem: number;
}

interface LinhaArtigoAdmin extends LinhaArtigo {
  palavras_chave: string | null;
  sinonimos: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const COLUNAS_ARTIGO_ADMIN =
  "id, titulo, corpo, rotas, categorias, ordem, palavras_chave, sinonimos, ativo, criado_em, atualizado_em";

export function mapearArtigo(l: LinhaArtigo): ArtigoAjuda {
  return {
    id: l.id,
    titulo: l.titulo,
    corpo: l.corpo,
    rotas: l.rotas ?? [],
    categorias: (l.categorias ?? []) as CategoriaAjuda[],
    ordem: l.ordem,
  };
}

/**
 * Interruptor `gps.config.ajuda_ativo`. Falha FECHADA (`false`): sem saber,
 * o botão de ajuda não aparece — pior caso é ajuda a menos, nunca tela quebrada.
 */
export const getAjudaAtiva = cache(async function getAjudaAtiva(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("ajuda_ativo");
  if (error) {
    logErro("ajuda/getAjudaAtiva", error);
    return false;
  }
  return data === true;
});

/**
 * Até 10 artigos ativos ligados à tela (`/clientes` casa `/clientes/<id>`).
 * Aceita o `pathname` cru — normaliza com `rotaDeAjuda` (inclusive o modo
 * assistência). Rota fora do formato → `{ ok: true, dados: [] }` sem ida ao banco.
 */
export const getAjudaPorRota = cache(async function getAjudaPorRota(
  pathname: string,
): Promise<LeituraAjuda<ArtigoAjuda[]>> {
  const rota = rotaDeAjuda(pathname);
  if (!rota) return { ok: true, dados: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("ajuda_por_rota", { p_rota: rota });
  if (error) {
    logErro("ajuda/getAjudaPorRota", error, { rota });
    return { ok: false };
  }
  return { ok: true, dados: ((data ?? []) as LinhaArtigo[]).map(mapearArtigo) };
});

/** Todos os artigos (ativos e arquivados) — só ADMIN. */
export async function getArtigosAjudaAdmin(): Promise<LeituraAjuda<ArtigoAjudaAdmin[]>> {
  if (!(await ehAdmin())) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("ajuda_artigos")
    .select(COLUNAS_ARTIGO_ADMIN)
    .order("ordem", { ascending: true })
    .order("titulo", { ascending: true })
    .limit(500);
  if (error) {
    logErro("ajuda/getArtigosAjudaAdmin", error);
    return { ok: false };
  }
  return {
    ok: true,
    dados: ((data ?? []) as LinhaArtigoAdmin[]).map((l) => ({
      ...mapearArtigo(l),
      palavrasChave: l.palavras_chave,
      sinonimos: l.sinonimos,
      ativo: l.ativo,
      criadoEm: l.criado_em,
      atualizadoEm: l.atualizado_em,
    })),
  };
}

interface MetricasBrutas {
  janela_dias?: number;
  artigos?: {
    artigo_id: string;
    titulo: string;
    ativo: boolean;
    vistas: number;
    resolveu_sim: number;
    resolveu_nao: number;
    ultimo_em: string | null;
  }[];
  termos_sem_resultado?: { termo: string; vezes: number; ultimo_em: string }[];
}

/** Métricas agregadas da ajuda (vistas, resolveu sim/não, buscas vazias) — só ADMIN. */
export async function getMetricasAjudaAdmin(): Promise<LeituraAjuda<MetricasAjuda>> {
  if (!(await ehAdmin())) return { ok: false };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_ajuda_metricas");
  if (error || !data || typeof data !== "object") {
    if (error) logErro("ajuda/getMetricasAjudaAdmin", error);
    return { ok: false };
  }
  const m = data as MetricasBrutas;
  return {
    ok: true,
    dados: {
      janelaDias: m.janela_dias ?? 90,
      artigos: (m.artigos ?? []).map((a) => ({
        artigoId: a.artigo_id,
        titulo: a.titulo,
        ativo: a.ativo,
        vistas: Number(a.vistas) || 0,
        resolveuSim: Number(a.resolveu_sim) || 0,
        resolveuNao: Number(a.resolveu_nao) || 0,
        ultimoEm: a.ultimo_em,
      })),
      termosSemResultado: (m.termos_sem_resultado ?? []).map((t) => ({
        termo: t.termo,
        vezes: Number(t.vezes) || 0,
        ultimoEm: t.ultimo_em,
      })),
    },
  };
}
