"use server";

/**
 * Reunião preliminar — Server Actions da EQUIPE (Fatia 4 da esteira,
 * migração 20260915000263): propor data e cancelar proposta.
 *
 * 🔴 ATUALIZADO EM 16/09/2026 (FATIA B-1): as duas RPCs NÃO têm mais a
 * mesma guarda. `gps.reuniao_propor_data` migrou para `gps.eh_equipe()`
 * (admin OU operador ativo da esteira) na migração `…264` (15/09);
 * `gps.reuniao_cancelar_proposta` continua em `gp_is_admin()` — não foi
 * tocada por aquela migração, e cancelar proposta segue de propósito
 * restrito ao admin. A guarda de verdade é sempre a de DENTRO da RPC
 * (SECURITY DEFINER); as guardas aqui são conveniência que evita uma
 * viagem ao banco à toa e devolve erro cedo, no mesmo padrão de
 * `entrevista-actions.ts`/`diario-actions.ts`.
 *
 * 🔑 Regra para não repetir o bug: quando uma RPC muda de guarda no banco,
 * buscar os chamadores em TypeScript é parte DA MESMA migração, não passo
 * seguinte.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, ehEquipeDaEsteira } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type { ReuniaoProporInput, ReuniaoResultado } from "@/lib/reuniao-preliminar-tipos";

function revalidar(alunoId?: string) {
  revalidatePath("/admin", "layout");
  if (alunoId) revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/**
 * Equipe propõe uma data para a reunião preliminar do cliente FAVORITO do
 * parceiro. A RPC recusa se o cliente não for o favorito ou se já houver
 * proposta viva (o índice único parcial garante isso no banco).
 */
export async function proporDataReuniao(
  input: ReuniaoProporInput,
): Promise<ReuniaoResultado> {
  if (!(await ehEquipeDaEsteira())) return { ok: false, erro: "Sem permissão." };

  const clienteId = (input.clienteId ?? "").trim();
  if (!clienteId) return { ok: false, erro: "Faltou informar o cliente." };

  const dataProposta = (input.dataProposta ?? "").trim();
  if (!dataProposta) return { ok: false, erro: "Informe a data proposta." };

  const supabase = await createClient();
  const { data: clienteAntes } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("aluno_id")
    .eq("id", clienteId)
    .maybeSingle();

  const { error } = await supabase.schema("gps").rpc("reuniao_propor_data", {
    p_cliente_id: clienteId,
    p_data: dataProposta,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("proporDataReuniao", error, {
        rpc: "gps.reuniao_propor_data",
      }),
    };
  }

  revalidar((clienteAntes as { aluno_id?: string } | null)?.aluno_id);
  return { ok: true };
}

/**
 * Equipe cancela uma proposta que ainda aguarda resposta do parceiro. Não
 * substitui a contestação: é para quando a própria equipe percebe que a
 * data proposta não serve mais (ex.: conflito de agenda descoberto depois).
 */
export async function cancelarPropostaReuniao(
  propostaId: string,
  alunoId?: string,
): Promise<ReuniaoResultado> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const id = (propostaId ?? "").trim();
  if (!id) return { ok: false, erro: "Faltou informar a proposta." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("reuniao_cancelar_proposta", {
    p_proposta_id: id,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("cancelarPropostaReuniao", error, {
        rpc: "gps.reuniao_cancelar_proposta",
      }),
    };
  }

  revalidar(alunoId);
  return { ok: true };
}
