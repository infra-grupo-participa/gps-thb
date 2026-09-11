"use server";

/**
 * Biblioteca de vídeos das reuniões — Server Actions do ADMIN
 * (demanda 5, briefing 11/09/2026).
 *
 * Autonomia de publicar SEM deploy: o admin cola o link do YouTube (não
 * listado), a tela extrai o `youtube_id` (`src/lib/youtube.ts`) e chama
 * `gps.video_salvar`. O banco guarda o ID, nunca a URL.
 *
 * 🔴 A EXTRAÇÃO DO ID É NO CLIENTE (pré-visualização) E CONFERIDA DE NOVO
 * AQUI: a Server Action é o endpoint real, um `fetch` direto ao mesmo path
 * contornaria a checagem da tela. Nunca gravar um `youtube_id` que não bateu
 * no formato de 11 caracteres — vira `src` de iframe quebrado no portal do
 * aluno.
 *
 * Contrato conferido contra a migração
 * `supabase/migrations/20260911000251_gps_videos_biblioteca.sql`:
 * `video_salvar(p_id, p_titulo, p_youtube_id, p_descricao?, p_etapa?, p_ordem?)`,
 * `video_publicar(p_id, p_publicado)`, `video_excluir(p_id)`. `etapa` é
 * NULLABLE no banco (vídeo GERAL, sem amarra a etapa nenhuma) — `SalvarVideoInput.etapa`
 * segue o mesmo tipo.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { extrairYoutubeId } from "@/lib/youtube";
import { traduzirErroBanco, type ErroDeBanco } from "@/lib/erros";
import {
  VIDEO_DESCRICAO_MAXIMO,
  VIDEO_TITULO_MAXIMO,
  VIDEO_TITULO_MINIMO,
  type ResultadoAcao,
} from "@/lib/videos-tipos";

/**
 * Frases REAIS de `gps.video_salvar` / `video_publicar` / `video_excluir`
 * (migração `20260911000251_gps_videos_biblioteca.sql`, texto literal do
 * `raise exception`). Confirmado com o backend-engineer — não é mais
 * suposição.
 */
const FRASES_VIDEO: Record<string, string> = {
  "Sem permissão.": "Sem permissão para esta ação.",
  "O título precisa ter de 3 a 200 caracteres.":
    "O título precisa ter de 3 a 200 caracteres.",
  "Informe o ID do vídeo do YouTube (11 caracteres) — cole o link que o sistema extrai o ID sozinho.":
    "O link não foi reconhecido como um vídeo do YouTube. Cole a URL completa e tente de novo.",
  "A descrição passa de 2.000 caracteres.":
    "A descrição passa de 2.000 caracteres.",
  "Etapa não encontrada.": "Etapa não encontrada.",
  "Vídeo não encontrado.": "Vídeo não encontrado. Atualize a lista e tente de novo.",
};

export interface SalvarVideoInput {
  id?: string;
  titulo: string;
  descricao: string;
  url: string;
  /** `null` = vídeo GERAL, sem amarra a nenhuma etapa (`gps.videos.etapa`). */
  etapa: number | null;
  ordem: number;
}

/**
 * Cria ou edita um vídeo. `id` presente = edição.
 *
 * Validação de FORMA no cliente (feedback imediato, inclusive a
 * pré-visualização) — repetida aqui porque a Server Action é o endpoint
 * real: um `fetch` direto ao mesmo path ignora qualquer checagem só de tela.
 */
export async function salvarVideo(input: SalvarVideoInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };

  const titulo = input.titulo.trim();
  if (titulo.length < VIDEO_TITULO_MINIMO || titulo.length > VIDEO_TITULO_MAXIMO) {
    return {
      ok: false,
      erro: `O título precisa ter de ${VIDEO_TITULO_MINIMO} a ${VIDEO_TITULO_MAXIMO} caracteres.`,
    };
  }

  const descricao = input.descricao.trim();
  if (descricao.length > VIDEO_DESCRICAO_MAXIMO) {
    return { ok: false, erro: `A descrição passa de ${VIDEO_DESCRICAO_MAXIMO} caracteres.` };
  }

  const youtubeId = extrairYoutubeId(input.url);
  if (!youtubeId) {
    return {
      ok: false,
      erro:
        "O link não foi reconhecido como um vídeo do YouTube. Cole a URL completa (ex.: https://www.youtube.com/watch?v=...) ou só o ID de 11 caracteres.",
    };
  }

  if (input.etapa != null && (!Number.isInteger(input.etapa) || input.etapa < 1 || input.etapa > 6)) {
    return { ok: false, erro: "Escolha uma etapa entre 1 e 6, ou deixe como vídeo geral." };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("video_salvar", {
    p_id: input.id ?? null,
    p_titulo: titulo,
    p_youtube_id: youtubeId,
    p_descricao: descricao || null,
    p_etapa: input.etapa,
    p_ordem: input.ordem,
  });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("salvarVideo", error, undefined, FRASES_VIDEO) };
  }

  revalidatePath("/admin/videos");
  revalidatePath("/materiais");
  return { ok: true };
}

/** Publica (`true`) ou volta a rascunho (`false`) um vídeo. */
export async function publicarVideo(id: string, publicado: boolean): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!id) return { ok: false, erro: "Vídeo não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("video_publicar", {
    p_id: id,
    p_publicado: publicado,
  });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("publicarVideo", error, undefined, FRASES_VIDEO) };
  }

  revalidatePath("/admin/videos");
  revalidatePath("/materiais");
  return { ok: true };
}

/** Exclui um vídeo. Sem confirmação aqui — quem confirma é `DialogoConfirmacao`. */
export async function excluirVideo(id: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!id) return { ok: false, erro: "Vídeo não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("video_excluir", { p_id: id });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("excluirVideo", error, undefined, FRASES_VIDEO) };
  }

  revalidatePath("/admin/videos");
  revalidatePath("/materiais");
  return { ok: true };
}

// `ErroDeBanco` reexportado só para o tipo não precisar ser importado duas
// vezes por quem eventualmente testar esta action fora daqui.
export type { ErroDeBanco };
