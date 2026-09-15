"use server";

/**
 * Aba de Tutoriais — Server Actions do ADMIN (15/09/2026).
 *
 * Autonomia de publicar SEM deploy: o admin escreve título/resumo/seção,
 * cola opcionalmente o link do YouTube (a tela extrai o `youtube_id`,
 * `src/lib/youtube.ts`) e/ou uma lista de passos, e chama
 * `gps.tutorial_salvar`. O banco guarda o ID do vídeo, nunca a URL — mesmo
 * padrão de `src/app/admin/videos/actions.ts`.
 *
 * 🔴 A EXTRAÇÃO DO ID É CONFERIDA AQUI (não só na pré-visualização do
 * cliente): a Server Action é o endpoint real, um `fetch` direto ao mesmo
 * path contornaria a checagem da tela.
 *
 * Contrato conferido contra a migração
 * `supabase/migrations/20260915000257_gps_tutoriais.sql`:
 * `tutorial_salvar(p_id, p_titulo, p_resumo, p_secao, p_youtube_id, p_passos, p_ordem)`,
 * `tutorial_publicar(p_id, p_publicado)`, `tutorial_excluir(p_id)`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { extrairYoutubeId } from "@/lib/youtube";
import { traduzirErroBanco } from "@/lib/erros";
import {
  SECOES_TUTORIAL,
  TUTORIAL_PASSOS_MAXIMO,
  TUTORIAL_PASSO_MAXIMO,
  TUTORIAL_RESUMO_MAXIMO,
  TUTORIAL_TITULO_MAXIMO,
  TUTORIAL_TITULO_MINIMO,
  type ResultadoAcao,
  type SalvarTutorialInput,
} from "@/lib/tutoriais-tipos";

/**
 * Frases REAIS de `gps.tutorial_salvar` / `tutorial_publicar` /
 * `tutorial_excluir` (migração `20260915000257_gps_tutoriais.sql`), texto
 * literal do `raise exception` — o match de `traduzirErroBanco` é por
 * igualdade EXATA.
 */
const FRASES_TUTORIAL: Record<string, string> = {
  "Sem permissão.": "Sem permissão para esta ação.",
  "O título precisa ter de 3 a 200 caracteres.":
    "O título precisa ter de 3 a 200 caracteres.",
  "O resumo passa de 500 caracteres.": "O resumo passa de 500 caracteres.",
  "Seção não encontrada.": "Seção não encontrada.",
  "Informe o ID do vídeo do YouTube (11 caracteres) — cole o link que o sistema extrai o ID sozinho.":
    "O link não foi reconhecido como um vídeo do YouTube. Cole a URL completa e tente de novo.",
  "Os passos precisam ser uma lista de textos.":
    "Os passos precisam ser uma lista de textos.",
  "No máximo 30 passos.": "No máximo 30 passos.",
  "Cada passo precisa ter de 1 a 500 caracteres de texto.":
    "Cada passo precisa ter de 1 a 500 caracteres de texto.",
  "Informe um vídeo ou ao menos um passo.":
    "Informe um vídeo ou ao menos um passo.",
  "Tutorial não encontrado.": "Tutorial não encontrado. Atualize a lista e tente de novo.",
};

const SECOES_VALIDAS = new Set(SECOES_TUTORIAL.map((s) => s.id));

/**
 * Cria ou edita um tutorial. `input.id` presente = edição.
 *
 * Validação de FORMA repetida aqui (feedback imediato no cliente também) —
 * a Server Action é o endpoint real: um `fetch` direto ao mesmo path ignora
 * qualquer checagem só de tela.
 */
export async function salvarTutorial(input: SalvarTutorialInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };

  const titulo = input.titulo.trim();
  if (titulo.length < TUTORIAL_TITULO_MINIMO || titulo.length > TUTORIAL_TITULO_MAXIMO) {
    return {
      ok: false,
      erro: `O título precisa ter de ${TUTORIAL_TITULO_MINIMO} a ${TUTORIAL_TITULO_MAXIMO} caracteres.`,
    };
  }

  const resumo = input.resumo.trim();
  if (resumo.length > TUTORIAL_RESUMO_MAXIMO) {
    return { ok: false, erro: `O resumo passa de ${TUTORIAL_RESUMO_MAXIMO} caracteres.` };
  }

  if (!SECOES_VALIDAS.has(input.secao)) {
    return { ok: false, erro: "Seção não encontrada." };
  }

  const url = input.url.trim();
  const youtubeId = url ? extrairYoutubeId(url) : null;
  if (url && !youtubeId) {
    return {
      ok: false,
      erro:
        "O link não foi reconhecido como um vídeo do YouTube. Cole a URL completa (ex.: https://www.youtube.com/watch?v=...) ou só o ID de 11 caracteres.",
    };
  }

  const passos = input.passos.map((p) => p.trim()).filter((p) => p.length > 0);
  if (passos.length > TUTORIAL_PASSOS_MAXIMO) {
    return { ok: false, erro: `No máximo ${TUTORIAL_PASSOS_MAXIMO} passos.` };
  }
  if (passos.some((p) => p.length > TUTORIAL_PASSO_MAXIMO)) {
    return { ok: false, erro: `Cada passo precisa ter de 1 a ${TUTORIAL_PASSO_MAXIMO} caracteres de texto.` };
  }

  if (!youtubeId && passos.length === 0) {
    return { ok: false, erro: "Informe um vídeo ou ao menos um passo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("tutorial_salvar", {
    p_id: input.id ?? null,
    p_titulo: titulo,
    p_resumo: resumo || null,
    p_secao: input.secao,
    p_youtube_id: youtubeId,
    p_passos: passos,
    p_ordem: input.ordem,
  });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("salvarTutorial", error, undefined, FRASES_TUTORIAL) };
  }

  revalidatePath("/admin/tutoriais");
  revalidatePath("/tutoriais");
  return { ok: true };
}

/** Publica (`true`) ou volta a rascunho (`false`) um tutorial. */
export async function publicarTutorial(id: string, publicado: boolean): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!id) return { ok: false, erro: "Tutorial não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("tutorial_publicar", {
    p_id: id,
    p_publicado: publicado,
  });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("publicarTutorial", error, undefined, FRASES_TUTORIAL) };
  }

  revalidatePath("/admin/tutoriais");
  revalidatePath("/tutoriais");
  return { ok: true };
}

/** Exclui um tutorial. Sem confirmação aqui — quem confirma é `DialogoConfirmacao`. */
export async function excluirTutorial(id: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!id) return { ok: false, erro: "Tutorial não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("tutorial_excluir", { p_id: id });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("excluirTutorial", error, undefined, FRASES_TUTORIAL) };
  }

  revalidatePath("/admin/tutoriais");
  revalidatePath("/tutoriais");
  return { ok: true };
}

// 🔴 NÃO REEXPORTAR TIPO NEM CONSTANTE DAQUI. Módulo `"use server"` só pode
// exportar função async — `export type`/`export interface`/`export const`
// passam pelo `tsc` e pelo `next build`, mas o Turbopack gera referência ao
// VALOR no chunk do servidor, e tipo não existe em runtime. Já derrubou
// produção 3 vezes (registrado em `src/app/admin/videos/actions.ts` e no
// CLAUDE.md). Quem precisar de `SalvarTutorialInput`/`ResultadoAcao`/
// `SECOES_TUTORIAL` importa de `@/lib/tutoriais-tipos`.
