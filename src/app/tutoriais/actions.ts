"use server";

/**
 * Aba de Tutoriais — Server Action do ALUNO (15/09/2026).
 *
 * 🔴 Server Action é ENDPOINT HTTP. A fronteira real é a RPC `SECURITY
 * DEFINER` `gps.tutorial_reagir`, que resolve a pessoa por
 * `gps.pessoa_atual()` no servidor, confere o interruptor e recusa voto em
 * tutorial inexistente OU não publicado com o MESMO erro (P0002) — votar em
 * rascunho tem de ser impossível. A guarda de sessão aqui é UX: erro em
 * português antes de gastar ida ao banco.
 *
 * Titular e sócio votam de forma independente (a RPC usa `pessoa_atual()`,
 * não `aluno_atual()`) — cada pessoa do ambiente tem o próprio voto.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type { ResultadoAcao } from "@/lib/tutoriais-tipos";

/**
 * Frases REAIS de `gps.tutorial_reagir` (migração
 * `20260915000257_gps_tutoriais.sql`), texto literal do `raise exception` —
 * o match de `traduzirErroBanco` é por igualdade EXATA.
 */
const FRASES_TUTORIAL: Record<string, string> = {
  "Sem permissão.": "Sem permissão para esta ação.",
  "tutorial nao informado":
    "Faltou um dado obrigatório para concluir esta ação. Recarregue a tela e tente de novo.",
  "Tutorial não encontrado.": "Tutorial não encontrado. Atualize a lista e tente de novo.",
};

/**
 * Vota útil (`true`) / não útil (`false`) / desfaz o voto (`null`) num
 * tutorial publicado. Quem chama sem sessão recebe erro em português antes
 * de gastar ida ao banco; a RPC segue recusando com 42501 mesmo assim.
 */
export async function reagirTutorial(
  tutorialId: string,
  util: boolean | null,
): Promise<ResultadoAcao> {
  const ctx = await getContextoSessao();
  if (!ctx) return { ok: false, erro: "Faça login para continuar." };
  if (!tutorialId) return { ok: false, erro: "Tutorial não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("tutorial_reagir", {
    p_tutorial_id: tutorialId,
    p_util: util,
  });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("reagirTutorial", error, undefined, FRASES_TUTORIAL) };
  }

  // 🔴 OS DOIS ESPELHOS. `/tutoriais` é a tela do parceiro; a de assistência
  // (`/admin/aluno/<id>/tutoriais`) renderiza o MESMO componente com o mesmo
  // voto, e revalidar só a primeira deixaria a prévia "como o aluno vê"
  // mostrando o botão desmarcado depois de o voto já ter gravado. É o defeito
  // que a biblioteca de vídeos já pagou uma vez (ver `src/lib/data/videos.ts`).
  //
  // O id CONCRETO com "layout" é a convenção do projeto (`clientes/actions.ts`
  // `revalidar()`): `revalidatePath` com o padrão literal `[alunoId]` não casa
  // rota concreta nenhuma. `ctx.alunoId` é o ambiente de quem votou — e é
  // justamente a página que a equipe abre para conferir.
  revalidatePath("/tutoriais");
  if (ctx.alunoId) revalidatePath(`/admin/aluno/${ctx.alunoId}`, "layout");
  return { ok: true };
}
