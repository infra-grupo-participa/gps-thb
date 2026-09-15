import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { ehAdmin } from "@/lib/auth";
import type { TutorialDoAluno, TutorialGps } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Aba de Tutoriais (`gps.tutoriais` + `gps.tutorial_reacoes`, 15/09/2026).
//
// Aluno: só publicados, com passos e `minhaReacao` já resolvidos — via RPC
// `gps.tutoriais_do_aluno` (mesmo padrão de `getVideosDoAluno`: o corte de
// visibilidade acontece NO BANCO). SEM amarração a etapa — decisão do
// Marcio, a seção "etapas" é editorial.
// Admin: lista tudo (publicado e rascunho, qualquer seção) — select direto
// com colunas explícitas, sob a RLS de admin, + `gps.admin_tutoriais_resumo()`
// para o placar agregado de reações (nenhuma coluna de pessoa).
//
// `gps.tutoriais_ativo()` é o interruptor geral da aba — decide se ela
// aparece para o aluno (interruptor desligado = a aba SOME).
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_TUTORIAL_ADMIN =
  "id, titulo, resumo, secao, youtube_id, passos, ordem, publicado, criado_em";

interface LinhaTutorialAdmin {
  id: string;
  titulo: string;
  resumo: string | null;
  secao: string;
  youtube_id: string | null;
  passos: unknown;
  ordem: number;
  publicado: boolean;
  criado_em: string;
}

/** Shape de retorno de `gps.tutoriais_do_aluno` (RETURNS TABLE). */
interface LinhaTutorialAluno {
  id: string;
  titulo: string;
  resumo: string | null;
  secao: string;
  youtube_id: string | null;
  passos: unknown;
  ordem: number;
  minha_reacao: boolean | null;
}

/** `gps.tutoriais.passos` é jsonb; o Postgres já devolve array — este cast só protege contra formato inesperado. */
function comoPassos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Interruptor geral da aba de Tutoriais. `false` esconde a aba inteira do
 * aluno (o admin continua vendo/editando em `/admin/tutoriais`).
 *
 * Falha FECHADA: se a RPC falhar, o aluno simplesmente não vê a aba — pior
 * caso é conteúdo a menos, nunca uma tela quebrada.
 *
 * 🔑 MEMOIZADA POR REQUISIÇÃO com `cache()` do React (mesmo padrão de
 * `getContextoSessao` em `src/lib/auth.ts:65`). A aba fixa agora é resolvida
 * em ~25 páginas (`navFixoDoAluno`) — sem `cache()`, cada uma refaria a
 * mesma RPC de 1 linha dentro da MESMA requisição. `cache()` tem escopo de
 * requisição, não de processo — não vaza entre alunos. NUNCA trocar por
 * `unstable_cache` (proibido em `auth.ts:60-63`: cache persistente
 * cross-request vazaria estado entre sessões).
 */
export const getTutoriaisAtivo = cache(async function getTutoriaisAtivo(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("tutoriais_ativo");
  if (error) {
    logErro("getTutoriaisAtivo", error);
    return false;
  }
  return data === true;
});

/**
 * Tutoriais publicados, agrupados na ordem das 8 seções — o que o ALUNO vê.
 * O corte de "publicado" e a resolução de `minhaReacao` acontecem dentro da
 * RPC `gps.tutoriais_do_aluno`, não aqui.
 */
export async function getTutoriaisDoAluno(): Promise<TutorialDoAluno[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("tutoriais_do_aluno");
  if (error) {
    logErro("getTutoriaisDoAluno", error);
    return [];
  }
  return ((data ?? []) as LinhaTutorialAluno[]).map((l) => ({
    id: l.id,
    titulo: l.titulo,
    resumo: l.resumo,
    secao: l.secao as TutorialDoAluno["secao"],
    youtubeId: l.youtube_id,
    passos: comoPassos(l.passos),
    ordem: l.ordem,
    minhaReacao: l.minha_reacao,
  }));
}

/**
 * Todos os tutoriais (publicados e rascunho) com o placar agregado de
 * reações — só para o painel do ADMIN. `ehAdmin()` é defesa em
 * profundidade; a fronteira real é a RLS de `gps.tutoriais` e o `gp_is_admin()`
 * de `gps.admin_tutoriais_resumo`.
 *
 * 🔴 O placar nunca traz coluna de pessoa — `gps.admin_tutoriais_resumo` não
 * devolve `pessoa_aluno_id` nem nada equivalente (decisão do Marcio, LGPD).
 */
export async function getTutoriaisAdmin(): Promise<TutorialGps[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const [{ data: linhas, error: erroLista }, { data: resumo, error: erroResumo }] =
    await Promise.all([
      supabase
        .schema("gps")
        .from("tutoriais")
        .select(COLUNAS_TUTORIAL_ADMIN)
        .order("secao")
        .order("ordem"),
      supabase.schema("gps").rpc("admin_tutoriais_resumo"),
    ]);

  if (erroLista) {
    logErro("getTutoriaisAdmin", erroLista);
    return [];
  }
  if (erroResumo) {
    // Placar é aditivo à listagem — falha nele não pode esconder o catálogo
    // inteiro do admin, só zera os contadores.
    logErro("getTutoriaisAdmin.resumo", erroResumo);
  }

  const placarPorId = new Map<string, { uteis: number; nao_uteis: number }>();
  for (const linha of (resumo ?? []) as { tutorial_id: string; uteis: number; nao_uteis: number }[]) {
    placarPorId.set(linha.tutorial_id, linha);
  }

  return ((linhas ?? []) as LinhaTutorialAdmin[]).map((l) => {
    const placar = placarPorId.get(l.id);
    return {
      id: l.id,
      titulo: l.titulo,
      resumo: l.resumo,
      secao: l.secao as TutorialGps["secao"],
      youtubeId: l.youtube_id,
      passos: comoPassos(l.passos),
      ordem: l.ordem,
      publicado: l.publicado,
      uteis: placar?.uteis ?? 0,
      naoUteis: placar?.nao_uteis ?? 0,
      criadoEm: l.criado_em,
    };
  });
}
