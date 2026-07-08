"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Aluno } from "@/lib/types";

/** Busca alunos (thb_alunos) por nome/e-mail que ainda não estão no GPS. */
export async function buscarAlunos(termo: string): Promise<Aluno[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();

  const { data: jaNoGps } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id");
  const idsNoGps = new Set((jaNoGps ?? []).map((m) => m.aluno_id));

  const { data } = await supabase
    .from("thb_alunos")
    .select(
      "id, nome, email, telefone, turma_id, plano, status_acesso, eh_socio",
    )
    .or(`nome.ilike.%${q}%,email.ilike.%${q}%`)
    .order("nome")
    .limit(20);

  return ((data ?? []) as Aluno[]).filter((a) => !idsNoGps.has(a.id));
}

/** Vincula um aluno ao GPS (cria o ambiente da Etapa 01). */
export async function adicionarAlunoGps(alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .insert({ aluno_id: alunoId });

  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return {};
}

/** Aprova uma solicitação: vincula o usuário a um thb_aluno e cria o membro. */
export async function aprovarSolicitacao(
  solicitacaoId: string,
  userId: string,
  alunoId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: erroMembro } = await supabase
    .schema("gps")
    .from("membros")
    .upsert(
      { aluno_id: alunoId, user_id: userId },
      { onConflict: "aluno_id" },
    );
  if (erroMembro) return { erro: erroMembro.message };

  const { error } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .update({
      status: "aprovada",
      aluno_id: alunoId,
      decidido_em: new Date().toISOString(),
      decidido_por: user?.id ?? null,
    })
    .eq("id", solicitacaoId);
  if (error) return { erro: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/solicitacoes");
  return {};
}

/** Recusa uma solicitação de acesso. */
export async function recusarSolicitacao(
  solicitacaoId: string,
  observacao?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .update({
      status: "recusada",
      observacao: observacao?.trim() || null,
      decidido_em: new Date().toISOString(),
      decidido_por: user?.id ?? null,
    })
    .eq("id", solicitacaoId);
  if (error) return { erro: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/solicitacoes");
  return {};
}

/** Remove o vínculo do aluno com o GPS (apaga o ambiente da Etapa 01). */
export async function removerAlunoGps(alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("membros")
    .delete()
    .eq("aluno_id", alunoId);

  if (error) return { erro: error.message };
  revalidatePath("/admin");
  return {};
}
