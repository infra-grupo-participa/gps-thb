"use server";

/**
 * Entrevista prévia — Server Actions do ADMIN (Fatia 3 da esteira, migração
 * 20260915000262). Roda com o admin que já existe (`ehAdmin()`), sem papel de
 * operador — o papel novo é a fatia 5, fora de escopo aqui.
 *
 * A guarda de verdade é `gp_is_admin()` dentro de `gps.entrevista_gravar`
 * (SECURITY DEFINER); `ehAdmin()` aqui evita uma viagem ao banco à toa e
 * devolve erro cedo, no mesmo padrão de `diario-actions.ts`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import {
  RESULTADOS_ENTREVISTA,
  ENTREVISTA_OBSERVACOES_MAXIMO,
  DECISOR_NOME_MAXIMO,
  DECISOR_PAPEL_MAXIMO,
  type EntrevistaGravarInput,
  type EntrevistaGravarResultado,
} from "@/lib/entrevista-tipos";
import type { PerfilDisc } from "@/lib/types";

const PERFIS_DISC: readonly PerfilDisc[] = ["D", "I", "S", "C"];

function revalidar(alunoId?: string) {
  revalidatePath("/admin/entrevistas");
  revalidatePath("/admin", "layout");
  if (alunoId) revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/**
 * Grava o resultado de UMA ligação (resultado + DISC + observações +
 * decisores), numa chamada só à RPC `gps.entrevista_gravar` — a transação é
 * do banco, não desta action. Validação aqui é a MESMA do banco, para o erro
 * chegar em português sem precisar de uma ida e volta ao Postgres.
 */
export async function gravarEntrevista(
  input: EntrevistaGravarInput,
): Promise<EntrevistaGravarResultado> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const clienteId = (input.clienteId ?? "").trim();
  if (!clienteId) return { ok: false, erro: "Faltou informar o cliente." };

  if (!RESULTADOS_ENTREVISTA.includes(input.resultado)) {
    return { ok: false, erro: "Escolha um resultado válido para a ligação." };
  }

  const disc = input.disc ?? null;
  if (disc !== null && !PERFIS_DISC.includes(disc)) {
    return { ok: false, erro: "Perfil DISC inválido." };
  }

  const observacoes = (input.observacoes ?? "").trim();
  if (observacoes.length > ENTREVISTA_OBSERVACOES_MAXIMO) {
    return {
      ok: false,
      erro: `As observações passam de ${ENTREVISTA_OBSERVACOES_MAXIMO} caracteres.`,
    };
  }

  let decisoresPayload: { nome: string; papel_no_negocio: string | null; principal: boolean }[] | null =
    null;
  if (input.decisores) {
    decisoresPayload = [];
    for (const d of input.decisores) {
      const nome = (d.nome ?? "").trim();
      if (!nome) return { ok: false, erro: "Todo decisor precisa de nome." };
      if (nome.length > DECISOR_NOME_MAXIMO) {
        return { ok: false, erro: `O nome do decisor passa de ${DECISOR_NOME_MAXIMO} caracteres.` };
      }
      const papel = (d.papelNoNegocio ?? "").trim();
      if (papel.length > DECISOR_PAPEL_MAXIMO) {
        return {
          ok: false,
          erro: `O papel do decisor no negócio passa de ${DECISOR_PAPEL_MAXIMO} caracteres.`,
        };
      }
      decisoresPayload.push({
        nome,
        papel_no_negocio: papel || null,
        principal: Boolean(d.principal),
      });
    }
  }

  const supabase = await createClient();
  const { data: clienteAntes } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("aluno_id")
    .eq("id", clienteId)
    .maybeSingle();

  const { error } = await supabase.schema("gps").rpc("entrevista_gravar", {
    p_cliente_id: clienteId,
    p_resultado: input.resultado,
    p_disc: disc,
    p_observacoes: observacoes || null,
    p_decisores: decisoresPayload,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("gravarEntrevista", error, {
        rpc: "gps.entrevista_gravar",
      }),
    };
  }

  revalidar((clienteAntes as { aluno_id?: string } | null)?.aluno_id);
  return { ok: true };
}
