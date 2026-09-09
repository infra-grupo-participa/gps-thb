"use server";

/**
 * Plantão de Dúvidas — Server Actions do ADMIN sobre os ALUNOS do Acelera:
 * carga do lote de compradores, revogar e reativar acesso.
 *
 * ⚠️ "Aluno do Plantão" (`gps.plantao_alunos`) NÃO é o aluno do GPS
 * (`public.thb_alunos` + `gps.membros`): o Plantão é do Acelera Holding e a
 * pessoa não tem login no portal. Ver `src/lib/plantao-carga.ts`.
 *
 * Recortado de `src/app/admin/plantao/actions.ts` (CD5) sem mudança de
 * comportamento. Aquele arquivo virou o agregador que reexporta daqui.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import type { ResultadoAcao } from "@/lib/plantao-tipos";

/**
 * Roda a carga dos compradores ativos do Acelera Holding
 * (`src/lib/plantao-carga.ts`) a partir do painel. Ver ali as regras de
 * upsert idempotente (nunca desativa por ausência, nunca sobrescreve
 * preenchido com vazio, nunca toca acessos/inscrições).
 */
export async function carregarLoteAcelera(): Promise<
  ResultadoAcao & { inseridos?: number; atualizados?: number; inalterados?: number }
> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const { carregarAcelera } = await import("@/lib/plantao-carga");
  const resultado = await carregarAcelera();

  revalidatePath("/admin/plantao");
  return { ok: true, ...resultado };
}

/**
 * Revoga o acesso ao plantão: desativa o aluno.
 *
 * Não há mais sessão a derrubar — `plantao_sessoes` foi dropada com o login
 * (08/09/2026). Sem login, `ativo = false` é a revogação completa: as RPCs
 * públicas exigem `ativo` para qualquer operação, então a pessoa deixa de
 * conseguir se inscrever, cancelar ou revelar a sala na mesma hora.
 */
export async function revogarAcessoPlantao(alunoPlantaoId: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  const { error } = await supabase
    .schema("gps")
    .from("plantao_alunos")
    .update({ ativo: false })
    .eq("id", alunoPlantaoId);
  if (error) return { ok: false, erro: "Não foi possível revogar o acesso." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

export async function reativarAcessoPlantao(alunoPlantaoId: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("plantao_alunos")
    .update({ ativo: true })
    .eq("id", alunoPlantaoId);
  if (error) return { ok: false, erro: "Não foi possível reativar o acesso." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}
