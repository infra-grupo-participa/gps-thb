import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { ehAdmin } from "@/lib/auth";
import type { VideoDoAluno, VideoGps } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Biblioteca de vídeos das reuniões (`gps.videos`, demanda 5, 11/09/2026).
//
// Aluno: só publicados, só etapa liberada — via RPC `gps.videos_do_aluno`
// (o corte de etapa acontece NO BANCO, não na renderização; mesmo cuidado de
// `listarMateriais` em `src/lib/materiais.ts`). A RPC devolve um shape mais
// estreito (sem `publicado`/`criado_em` — ver `VideoDoAluno`).
// Admin: lista tudo (publicado e rascunho, qualquer etapa) — select direto,
// mesmo padrão de `getMentorasAdmin`/`plantao_mentoras`, sob a RLS de admin.
//
// `gps.videos_ativo()` é o interruptor geral da biblioteca (RPC própria,
// booleana) — decide se a seção aparece para o aluno em `/materiais`.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_VIDEO_ADMIN =
  "id, titulo, descricao, youtube_id, etapa, ordem, publicado, criado_em";

interface LinhaVideoAdmin {
  id: string;
  titulo: string;
  descricao: string | null;
  youtube_id: string;
  etapa: number | null;
  ordem: number;
  publicado: boolean;
  criado_em: string;
}

/** Shape de retorno de `gps.videos_do_aluno` (RETURNS TABLE, sem `publicado`). */
interface LinhaVideoAluno {
  id: string;
  titulo: string;
  descricao: string | null;
  youtube_id: string;
  etapa: number | null;
  ordem: number;
}

/**
 * Interruptor geral da biblioteca de vídeos. `false` esconde a seção inteira
 * do aluno (o admin continua vendo/editando em `/admin/videos`).
 *
 * Falha aberta ou fechada? Fechada: se a RPC falhar, o aluno simplesmente não
 * vê a seção de gravações — pior caso é conteúdo a menos, nunca um iframe
 * quebrado ou um erro na tela de materiais inteira.
 */
export async function getVideosAtivo(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("videos_ativo");
  if (error) {
    logErro("getVideosAtivo", error);
    return false;
  }
  return data === true;
}

/**
 * Vídeos publicados de uma etapa (ou de todos os gerais + de toda etapa
 * liberada, se `etapa` for omitido) — o que o ALUNO vê. O corte de "etapa
 * liberada" e "publicado" é feito dentro da RPC `gps.videos_do_aluno`, não
 * aqui.
 */
export async function getVideosDoAluno(etapa?: number): Promise<VideoDoAluno[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("videos_do_aluno", { p_etapa: etapa ?? null });
  if (error) {
    logErro("getVideosDoAluno", error, etapa != null ? { etapa } : undefined);
    return [];
  }
  return ((data ?? []) as LinhaVideoAluno[]).map((l) => ({
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    youtubeId: l.youtube_id,
    etapa: l.etapa,
    ordem: l.ordem,
  }));
}

/**
 * Todos os vídeos (publicados e rascunho) — só para o painel do ADMIN.
 * `ehAdmin()` é defesa em profundidade; a fronteira real é a RLS de
 * `gps.videos`.
 */
export async function getVideosAdmin(): Promise<VideoGps[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("videos")
    .select(COLUNAS_VIDEO_ADMIN)
    .order("etapa", { nullsFirst: true })
    .order("ordem");

  if (error) {
    logErro("getVideosAdmin", error);
    return [];
  }
  return ((data ?? []) as LinhaVideoAdmin[]).map((l) => ({
    id: l.id,
    titulo: l.titulo,
    descricao: l.descricao,
    youtubeId: l.youtube_id,
    etapa: l.etapa,
    ordem: l.ordem,
    publicado: l.publicado,
    criadoEm: l.criado_em,
  }));
}
