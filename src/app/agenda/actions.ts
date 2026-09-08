/**
 * ⚠️ FEATURE INCOMPLETA — não há rota, nenhum componente importa estas
 * actions, e `/agenda` não existe no build.
 *
 * O que existe: a tabela `gps.agenda` (vazia, 0 linhas) e este arquivo.
 * Falta a página e a UI.
 *
 * As policies estão corretas e completas (conferido em 08/09/2026):
 * `agenda_owner_insert/update/delete/select` para o dono e
 * `agenda_admin_select` para o admin — ou seja, o admin apenas ENXERGA.
 * As actions abaixo rodariam sem erro de RLS se houvesse tela.
 *
 * Está versionado — em vez de apagado ou deixado solto na working tree —
 * porque o código está correto e a decisão de negócio de 10/08/2026 ainda
 * vale: agendamento no GPS é ORGANIZAÇÃO PESSOAL do aluno, nunca compromisso
 * com a equipe (ver "⚠️ Agendamento — REMOVIDO do sistema" no CLAUDE.md).
 *
 * ⚠️ NÃO confundir com o fluxo de reunião com a equipe, removido em
 * 10/08/2026 e PROIBIDO de reconstruir sem decisão explícita do Marcio.
 *
 */

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import type { AgendaItem } from "@/lib/types";

/**
 * Agenda pessoal do aluno — organização dele e só dele.
 *
 * Não existe versão "em nome do aluno": o admin apenas ENXERGA a agenda
 * (a policy de admin em `gps.agenda` é SELECT). Por isso toda action aqui
 * resolve o aluno pela sessão, nunca por um `alunoId` recebido de fora.
 */
async function alunoDaSessao(): Promise<string | null> {
  const ctx = await getContextoSessao();
  return ctx?.papel === "aluno" ? (ctx.alunoId ?? null) : null;
}

export async function addCompromisso(dados: {
  titulo: string;
  data: string;
  horario?: string | null;
  nota?: string | null;
}): Promise<{ erro?: string; item?: AgendaItem }> {
  const alunoId = await alunoDaSessao();
  if (!alunoId) return { erro: "Sessão inválida." };

  const titulo = dados.titulo.trim();
  if (!titulo) return { erro: "Dê um nome ao compromisso." };
  if (!dados.data) return { erro: "Escolha a data." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("agenda")
    .insert({
      aluno_id: alunoId,
      titulo,
      data: dados.data,
      horario: dados.horario || null,
      nota: dados.nota?.trim() || null,
    })
    .select()
    .maybeSingle();

  if (error) return { erro: "Não foi possível salvar." };
  revalidatePath("/agenda");
  return { item: data as AgendaItem };
}

export async function atualizarCompromisso(
  id: string,
  campos: {
    titulo?: string;
    data?: string;
    horario?: string | null;
    nota?: string | null;
  },
): Promise<{ erro?: string }> {
  const alunoId = await alunoDaSessao();
  if (!alunoId) return { erro: "Sessão inválida." };
  if (campos.titulo !== undefined && !campos.titulo.trim())
    return { erro: "Dê um nome ao compromisso." };

  const supabase = await createClient();
  // O `eq("aluno_id")` é redundante com a RLS, mas deixa a intenção explícita.
  const { data, error } = await supabase
    .schema("gps")
    .from("agenda")
    .update({
      ...(campos.titulo !== undefined ? { titulo: campos.titulo.trim() } : {}),
      ...(campos.data !== undefined ? { data: campos.data } : {}),
      ...(campos.horario !== undefined
        ? { horario: campos.horario || null }
        : {}),
      ...(campos.nota !== undefined ? { nota: campos.nota?.trim() || null } : {}),
    })
    .eq("id", id)
    .eq("aluno_id", alunoId)
    .select("id");

  if (error) return { erro: "Não foi possível salvar." };
  if (!data?.length) return { erro: "Compromisso não encontrado." };
  revalidatePath("/agenda");
  return {};
}

export async function removerCompromisso(
  id: string,
): Promise<{ erro?: string }> {
  const alunoId = await alunoDaSessao();
  if (!alunoId) return { erro: "Sessão inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("agenda")
    .delete()
    .eq("id", id)
    .eq("aluno_id", alunoId);

  if (error) return { erro: "Não foi possível remover." };
  revalidatePath("/agenda");
  return {};
}
