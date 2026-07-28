"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { linkLiveValido, HORARIOS_REUNIAO, horaCurta } from "@/lib/reuniao";

function revalidar(alunoId: string) {
  revalidatePath("/");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  revalidatePath("/admin/reunioes");
}

/**
 * Resolve o aluno alvo da ação e se o autor pode agir por ele.
 * - Aluno logado: só age por si mesmo (ignora alunoId vindo do cliente).
 * - Admin: age pelo alunoId informado (modo assistência).
 */
async function resolverAlvo(alunoIdArg?: string) {
  const ctx = await getContextoSessao();
  if (!ctx) return { erro: "Sessão expirada." as const };
  if (ctx.papel === "aluno") {
    if (!ctx.alunoId) return { erro: "Aluno não vinculado." as const };
    return { alunoId: ctx.alunoId, isAdmin: false as const };
  }
  if (ctx.papel === "admin") {
    if (!alunoIdArg) return { erro: "Aluno não informado." as const };
    return { alunoId: alunoIdArg, isAdmin: true as const };
  }
  return { erro: "Sem permissão." as const };
}

/**
 * Agenda (ou remarca) a reunião do aluno com a equipe, para o cliente
 * favoritado. 1 por aluno — faz upsert por aluno_id. Valida favorito, slot e link.
 */
export async function agendarReuniao(input: {
  alunoId?: string;
  data: string;
  horario: string;
  linkLive: string;
}) {
  const alvo = await resolverAlvo(input.alunoId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { alunoId } = alvo;

  const horario = horaCurta(input.horario);
  if (!input.data || !HORARIOS_REUNIAO.includes(horario as never)) {
    return { erro: "Escolha um horário válido." };
  }
  const link = input.linkLive.trim();
  if (!linkLiveValido(link)) {
    return { erro: "Informe um link de reunião válido (começando com https://)." };
  }

  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // O cliente favoritado é obrigatório — é com ele que a reunião acontece.
  const { data: favorito } = await gps
    .from("etapa1_clientes")
    .select("id")
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true)
    .maybeSingle();
  if (!favorito) {
    return {
      erro: "Escolha primeiro o cliente que a equipe vai acompanhar (favorito).",
    };
  }

  // Slot não pode estar bloqueado (feriado).
  const { data: bloqueio } = await gps
    .from("reuniao_bloqueios")
    .select("data")
    .eq("data", input.data)
    .maybeSingle();
  if (bloqueio) return { erro: "Esta data não está disponível." };

  const { error } = await gps.from("reuniao_agendamentos").upsert(
    {
      aluno_id: alunoId,
      cliente_id: favorito.id,
      data: input.data,
      horario,
      link_live: link,
    },
    { onConflict: "aluno_id" },
  );

  if (error) {
    // 23505 = violação de unique. Se for o slot, alguém pegou antes.
    if (error.code === "23505") {
      return { erro: "Esse horário acabou de ser preenchido. Escolha outro." };
    }
    return { erro: "Não foi possível agendar: " + error.message };
  }

  revalidar(alunoId);
  return {};
}

/** Cancela a reunião do aluno (libera o slot). */
export async function cancelarReuniao(alunoIdArg?: string) {
  const alvo = await resolverAlvo(alunoIdArg);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { alunoId } = alvo;

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .delete()
    .eq("aluno_id", alunoId);

  if (error) return { erro: "Não foi possível cancelar: " + error.message };
  revalidar(alunoId);
  return {};
}

/** Admin: bloqueia uma quarta inteira (feriado). */
export async function bloquearQuarta(data: string, motivo?: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };
  if (!data) return { erro: "Informe a data." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .upsert({ data, motivo: motivo?.trim() || null }, { onConflict: "data" });

  if (error) return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: desbloqueia uma quarta. */
export async function desbloquearQuarta(data: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .delete()
    .eq("data", data);

  if (error) return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}
