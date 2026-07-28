"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { linkLiveValido, HORARIOS_REUNIAO, horaCurta } from "@/lib/reuniao";
import { buscarAlunos, type AlunoBusca } from "@/app/admin/actions";

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
 * Agenda (ou remarca) a reunião do aluno com a equipe. 1 por aluno — faz upsert
 * por aluno_id.
 *
 * Regras por autor:
 * - **Aluno** (age por si): favorito e link **obrigatórios** — a reunião é sempre
 *   com o cliente favoritado e ele informa a sala que criou.
 * - **Admin** (agenda por um aluno em `/admin/reunioes`): favorito e link são
 *   **opcionais** — pode marcar antes de o aluno favoritar/ter link e completar
 *   depois (o aluno cola o link normalmente pelo card).
 */
export async function agendarReuniao(input: {
  alunoId?: string;
  data: string;
  horario: string;
  linkLive?: string;
}) {
  const alvo = await resolverAlvo(input.alunoId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { alunoId, isAdmin } = alvo;

  const horario = horaCurta(input.horario);
  if (!input.data || !HORARIOS_REUNIAO.includes(horario as never)) {
    return { erro: "Escolha um horário válido." };
  }

  const link = (input.linkLive ?? "").trim();
  // O aluno é obrigado a informar um link válido; o admin pode deixar em branco.
  if (!isAdmin) {
    if (!linkLiveValido(link)) {
      return {
        erro: "Informe um link de reunião válido (começando com https://).",
      };
    }
  } else if (link && !linkLiveValido(link)) {
    return { erro: "O link informado é inválido (deve começar com https://)." };
  }

  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // Favorito: obrigatório para o aluno; opcional para o admin (grava se existir).
  const { data: favorito } = await gps
    .from("etapa1_clientes")
    .select("id")
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true)
    .maybeSingle();
  if (!favorito && !isAdmin) {
    return {
      erro: "Escolha primeiro o cliente que a equipe vai acompanhar (favorito).",
    };
  }

  // Slot não pode estar fechado — nem a quarta inteira (horario NULL), nem o slot.
  const { data: bloqueios } = await gps
    .from("reuniao_bloqueios")
    .select("horario")
    .eq("data", input.data);
  const fechado = (bloqueios ?? []).some(
    (b: { horario: string | null }) =>
      b.horario === null || horaCurta(b.horario) === horario,
  );
  if (fechado) return { erro: "Este horário não está disponível." };

  // No upsert por aluno_id, um remarque não deve apagar dados já preenchidos:
  // se o admin remarca sem link, preserva o link/cliente que já existiam.
  const { data: atual } = await gps
    .from("reuniao_agendamentos")
    .select("cliente_id, link_live")
    .eq("aluno_id", alunoId)
    .maybeSingle();

  const clienteId = favorito?.id ?? atual?.cliente_id ?? null;
  const linkFinal = link || atual?.link_live || null;

  const { error } = await gps.from("reuniao_agendamentos").upsert(
    {
      aluno_id: alunoId,
      cliente_id: clienteId,
      data: input.data,
      horario,
      link_live: linkFinal,
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

/** Admin: fecha a quarta inteira (feriado) — bloqueio com horario NULL. */
export async function bloquearQuarta(data: string, motivo?: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };
  if (!data) return { erro: "Informe a data." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .insert({ data, horario: null, motivo: motivo?.trim() || null });

  // 23505 = já estava bloqueada; trata como sucesso (idempotente).
  if (error && error.code !== "23505") return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: reabre a quarta inteira (remove só o bloqueio de dia todo). */
export async function desbloquearQuarta(data: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .delete()
    .eq("data", data)
    .is("horario", null);

  if (error) return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: fecha um horário pontual de uma quarta (bloqueio com horario preenchido). */
export async function bloquearSlot(data: string, horario: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };
  const h = horaCurta(horario);
  if (!data || !HORARIOS_REUNIAO.includes(h as never)) {
    return { erro: "Horário inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .insert({ data, horario: h, motivo: null });

  if (error && error.code !== "23505") return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: reabre um horário pontual de uma quarta. */
export async function desbloquearSlot(data: string, horario: string) {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." };
  const h = horaCurta(horario);

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .delete()
    .eq("data", data)
    .eq("horario", h);

  if (error) return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/**
 * Admin: busca alunos para agendar em nome deles na tela de Reuniões.
 * Reusa a busca tolerante de `admin/actions` e restringe aos que já estão no
 * GPS (a reunião é do programa; não faz sentido marcar por quem não entrou).
 */
export async function buscarAlunosParaAgenda(
  termo: string,
): Promise<AlunoBusca[]> {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return [];
  const alunos = await buscarAlunos(termo);
  return alunos.filter((a) => a.jaNoGps);
}
