"use server";

/**
 * Diário do aluno — Server Actions do ADMIN.
 *
 * Visualização e escrita EXCLUSIVAS do admin (LGPD — ver comentário na
 * migração `20260908000001_gps_aluno_notas.sql`). Ambas as actions abrem com
 * `ehAdmin()`: render-time gating não é fronteira de segurança (a proteção
 * real são as policies RLS via `public.gp_is_admin()`), mas a checagem aqui
 * evita uma viagem ao banco à toa e devolve erro cedo.
 *
 * `autor_id`/`resolvido_por` vêm SEMPRE de `ctx.user.id` do servidor —
 * nunca de um campo enviado pelo cliente, que poderia forjar autoria.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import {
  TIPOS_NOTA,
  ORIGENS_NOTA,
  VOZES_NOTA,
  type TipoNota,
  type OrigemNota,
  type VozNota,
} from "@/lib/types";

function revalidar(alunoId: string) {
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  revalidatePath("/admin", "layout");
}

export interface RegistrarNotaInput {
  alunoId: string;
  voz: VozNota;
  tipo: TipoNota;
  origem: OrigemNota;
  texto: string;
  /** Liga a nota a um evento do log (gps.aluno_eventos) — ex.: comentário em cima de "Listou 15 clientes". */
  eventoId?: string;
}

export type ResultadoDiarioAcao =
  | { ok: true }
  | { ok: false; erro: string };

/** Registra uma nota nova no diário do aluno. Append-only — sempre INSERT. */
export async function registrarNota(
  input: RegistrarNotaInput,
): Promise<ResultadoDiarioAcao> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") {
    return { ok: false, erro: "Sem permissão." };
  }

  if (!input.alunoId) return { ok: false, erro: "Aluno não informado." };
  if (!VOZES_NOTA.includes(input.voz)) {
    return { ok: false, erro: "Voz inválida." };
  }
  if (!TIPOS_NOTA.includes(input.tipo)) {
    return { ok: false, erro: "Tipo inválido." };
  }
  if (!ORIGENS_NOTA.includes(input.origem)) {
    return { ok: false, erro: "Origem inválida." };
  }
  const texto = input.texto.trim();
  if (texto.length < 1 || texto.length > 8000) {
    return { ok: false, erro: "O texto precisa ter entre 1 e 8000 caracteres." };
  }

  const supabase = await createClient();

  // Confere que o evento pertence ao MESMO aluno_id antes de gravar — sem
  // isso, um `eventoId` forjado no cliente amarraria a nota de um aluno a
  // um evento de outro (o insert abaixo não tem como validar isso sozinho:
  // não há FK entre aluno_notas.evento_id e aluno_notas.aluno_id, só entre
  // evento_id e aluno_eventos.id).
  if (input.eventoId) {
    const { data: evento, error: erroEvento } = await supabase
      .schema("gps")
      .from("aluno_eventos")
      .select("aluno_id")
      .eq("id", input.eventoId)
      .maybeSingle();

    if (erroEvento || !evento) {
      return { ok: false, erro: "Evento não encontrado." };
    }
    if ((evento as { aluno_id: string }).aluno_id !== input.alunoId) {
      return { ok: false, erro: "Evento não pertence a este aluno." };
    }
  }

  const { error } = await supabase.schema("gps").from("aluno_notas").insert({
    aluno_id: input.alunoId,
    autor_id: ctx.user.id,
    voz: input.voz,
    tipo: input.tipo,
    origem: input.origem,
    texto,
    evento_id: input.eventoId ?? null,
  });

  if (error) return { ok: false, erro: "Não foi possível salvar a nota." };

  revalidar(input.alunoId);
  return { ok: true };
}

/**
 * Dá baixa em uma pendência: grava `resolvido_em`/`resolvido_por` — é a
 * ÚNICA edição que o banco aceita (trigger de append-only). Confere as
 * linhas afetadas via `.select()`: um update que não casa nada volta sem
 * erro (lição de `salvarPerfilAluno`) e a UI mentiria "baixa dada".
 */
export async function darBaixaPendencia(
  notaId: string,
): Promise<ResultadoDiarioAcao> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") {
    return { ok: false, erro: "Sem permissão." };
  }
  if (!notaId) return { ok: false, erro: "Nota não informada." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("aluno_notas")
    .update({ resolvido_em: new Date().toISOString(), resolvido_por: ctx.user.id })
    .eq("id", notaId)
    .eq("tipo", "pendencia")
    .is("resolvido_em", null)
    .select("id, aluno_id");

  if (error) return { ok: false, erro: "Não foi possível dar baixa." };
  if (!data || data.length === 0) {
    // 0 linhas casadas = outro admin já resolveu esta pendência antes (a
    // guarda `.is("resolvido_em", null)` barrou o update). A tela deste
    // admin está desatualizada — revalida para tirar o botão obsoleto de
    // cena, senão só F5 resolve. O update não retornou linha, então busca
    // o `aluno_id` à parte só para saber o que revalidar (caminho raro).
    const { data: nota } = await supabase
      .schema("gps")
      .from("aluno_notas")
      .select("aluno_id")
      .eq("id", notaId)
      .maybeSingle();
    if (nota) revalidar((nota as { aluno_id: string }).aluno_id);

    return {
      ok: false,
      erro: "Pendência não encontrada ou já resolvida — nada foi alterado.",
    };
  }

  revalidar((data[0] as { aluno_id: string }).aluno_id);
  return { ok: true };
}
