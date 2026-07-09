"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClienteEtapa1, ModoEnfase } from "@/lib/types";

/** Campos do cliente que a UI pode atualizar. */
export type PatchCliente = Partial<
  Pick<
    ClienteEtapa1,
    | "nome"
    | "telefone"
    | "nivel_relacionamento"
    | "problemas"
    | "perda_inercia"
    | "registro_contato"
    | "mensagem_padrao_enviada"
    | "estudo_caso_enviado"
    | "ligacao_realizada"
    | "status"
    | "data_reuniao_preliminar"
    | "aderiu_reuniao"
    | "perfil_disc"
  >
>;

function revalidar(alunoId: string) {
  revalidatePath("/etapa-1");
  revalidatePath("/clientes");
  revalidatePath("/clientes", "layout");
  revalidatePath("/etapa", "layout");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

export async function criarCliente(alunoId: string) {
  const supabase = await createClient();

  const { data: ultimos } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("ordem")
    .eq("aluno_id", alunoId)
    .order("ordem", { ascending: false })
    .limit(1);

  const proximaOrdem = (ultimos?.[0]?.ordem ?? 0) + 1;

  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .insert({ aluno_id: alunoId, ordem: proximaOrdem })
    .select("id")
    .single();

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return { id: data.id as string };
}

export async function atualizarCliente(
  clienteId: string,
  alunoId: string,
  patch: PatchCliente,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .update(patch)
    .eq("id", clienteId);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

export async function mudarStatusCliente(
  clienteId: string,
  alunoId: string,
  status: ClienteEtapa1["status"],
) {
  return atualizarCliente(clienteId, alunoId, { status });
}

/** Define (ou remove) o cliente acompanhado pela equipe — no máximo um por aluno. */
export async function definirClienteEquipe(
  clienteId: string,
  alunoId: string,
  ativar: boolean,
) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // Desmarca todos primeiro (respeita o índice único parcial).
  const { error: e1 } = await gps
    .from("etapa1_clientes")
    .update({ acompanhado_equipe: false })
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true);
  if (e1) return { erro: e1.message };

  if (ativar) {
    const { error: e2 } = await gps
      .from("etapa1_clientes")
      .update({ acompanhado_equipe: true })
      .eq("id", clienteId);
    if (e2) return { erro: e2.message };
  }

  revalidar(alunoId);
  return {};
}

export async function removerCliente(clienteId: string, alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .delete()
    .eq("id", clienteId);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

export async function marcarTarefa(
  alunoId: string,
  etapa: number,
  tarefa: number,
  concluida: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("progresso")
    .upsert(
      {
        aluno_id: alunoId,
        etapa,
        tarefa,
        concluida,
        concluida_em: concluida ? new Date().toISOString() : null,
      },
      { onConflict: "aluno_id,etapa,tarefa" },
    );

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

/**
 * Define (ou remove, com modo=null) o override de destaque de uma tarefa para
 * um aluno. Só o admin usa — a RLS de gps.tarefa_enfase garante isso.
 */
export async function definirEnfaseTarefa(
  alunoId: string,
  etapa: number,
  tarefa: number,
  modo: ModoEnfase | null,
) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  if (modo === null) {
    const { error } = await gps
      .from("tarefa_enfase")
      .delete()
      .eq("aluno_id", alunoId)
      .eq("etapa", etapa)
      .eq("tarefa", tarefa);
    if (error) return { erro: error.message };
  } else {
    const { error } = await gps
      .from("tarefa_enfase")
      .upsert(
        { aluno_id: alunoId, etapa, tarefa, modo },
        { onConflict: "aluno_id,etapa,tarefa" },
      );
    if (error) return { erro: error.message };
  }

  revalidar(alunoId);
  return {};
}

export async function salvarDataAgendamento(
  alunoId: string,
  data: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .update({ data_agendamento_disponivel: data })
    .eq("aluno_id", alunoId);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}
