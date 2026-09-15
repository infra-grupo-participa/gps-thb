"use server";

/**
 * Reunião preliminar — Server Actions do PARCEIRO (Fatia 4 da esteira,
 * migração 20260915000263): aceitar ou contestar uma proposta de data.
 *
 * A guarda de verdade é `gps.aluno_atual()` dentro de `gps.reuniao_responder`
 * (SECURITY DEFINER — só o dono do ambiente, titular ou sócio, responde por
 * ele). Não há checagem de papel aqui: a RPC é a fronteira real, no mesmo
 * espírito de `clientes/minuta-actions.ts`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { traduzirErroBanco } from "@/lib/erros";
import type {
  ReuniaoResponderInput,
  ReuniaoResultado,
} from "@/lib/reuniao-preliminar-tipos";
import {
  CONTESTACAO_MOTIVO_MINIMO,
  CONTESTACAO_MOTIVO_MAXIMO,
} from "@/lib/reuniao-preliminar-tipos";

function revalidar(alunoId?: string) {
  revalidatePath("/clientes", "layout");
  revalidatePath("/", "layout");
  if (alunoId) revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/**
 * O parceiro aceita ou contesta a proposta de data da reunião preliminar.
 * Motivo obrigatório (3..300 caracteres) só na contestação — a RPC recusa a
 * segunda contestação do mesmo cliente ("contestação 1 vez só").
 */
export async function responderPropostaReuniao(
  input: ReuniaoResponderInput,
): Promise<ReuniaoResultado> {
  const propostaId = (input.propostaId ?? "").trim();
  if (!propostaId) return { ok: false, erro: "Faltou informar a proposta." };

  if (input.resposta !== "aceita" && input.resposta !== "contestada") {
    return { ok: false, erro: "Escolha uma resposta válida." };
  }

  let motivo: string | null = null;
  if (input.resposta === "contestada") {
    motivo = (input.motivo ?? "").trim();
    if (motivo.length < CONTESTACAO_MOTIVO_MINIMO) {
      return {
        ok: false,
        erro: `Escreva o motivo da contestação (ao menos ${CONTESTACAO_MOTIVO_MINIMO} caracteres).`,
      };
    }
    if (motivo.length > CONTESTACAO_MOTIVO_MAXIMO) {
      return { ok: false, erro: `O motivo passa de ${CONTESTACAO_MOTIVO_MAXIMO} caracteres.` };
    }
  }

  const supabase = await createClient();
  const { data: propostaAntes } = await supabase
    .schema("gps")
    .from("reuniao_preliminar_propostas")
    .select("aluno_id")
    .eq("id", propostaId)
    .maybeSingle();

  const { error } = await supabase.schema("gps").rpc("reuniao_responder", {
    p_proposta_id: propostaId,
    p_resposta: input.resposta,
    p_motivo: motivo,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("responderPropostaReuniao", error, {
        rpc: "gps.reuniao_responder",
      }),
    };
  }

  revalidar((propostaAntes as { aluno_id?: string } | null)?.aluno_id);
  return { ok: true };
}
