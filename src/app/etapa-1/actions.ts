"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClienteEtapa1 } from "@/lib/types";

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
  revalidatePath(`/admin/aluno/${alunoId}`);
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
        etapa: 1,
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
