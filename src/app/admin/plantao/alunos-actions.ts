"use server";

/**
 * Plantão de Dúvidas — Server Actions do ADMIN sobre os ALUNOS do Acelera:
 * revogar, reativar e liberar acesso pontual.
 *
 * ⚠️ "Aluno do Plantão" (`gps.plantao_alunos`) NÃO é o aluno do GPS
 * (`public.thb_alunos` + `gps.membros`): o Plantão é do Acelera Holding e a
 * pessoa não tem login no portal.
 *
 * Recortado de `src/app/admin/plantao/actions.ts` (CD5) sem mudança de
 * comportamento. Aquele arquivo virou o agregador que reexporta daqui.
 *
 * ⚠️ **`carregarLoteAcelera` foi removida em 09/09/2026** (junto com
 * `src/lib/plantao-carga.ts`): lia `data/plantao/acelera-ativos.json`, que
 * está no `.gitignore` e nunca existiu no servidor da Hostinger — o botão
 * falhava ou não fazia nada em produção, desde sempre. A base do Plantão
 * (`gps.plantao_alunos`) vem do histórico de vendas; para um caso pontual,
 * `liberarAlunoPlantao` (abaixo) é o caminho.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { emailValido } from "@/lib/texto";
import { traduzirErroBanco } from "@/lib/erros";
import type { ResultadoAcao } from "@/lib/plantao-tipos";

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

/**
 * Adiciona (ou reativa) alguém na base do Plantão pelo e-mail, sem SQL.
 *
 * `gps.plantao_alunos` é um CSV CONGELADO (421 linhas, lote 2026-08): nada
 * atualiza essa lista sozinho — o job noturno só REMOVE quem migrou para o
 * Programa, nunca ADICIONA quem comprou o Acelera depois da carga. Esta ação
 * é o remédio, no lugar de liberar por SQL direto (caso real: Bianca Estacio,
 * compradora desde 17/08, recusada na inscrição em 09/09).
 *
 * Idempotente: chamar de novo para o mesmo e-mail reativa e atualiza os
 * dados, nunca duplica (`on conflict (email)` na RPC).
 */
export async function liberarAlunoPlantao(dados: {
  email: string;
  nome: string;
  documento?: string;
  telefone?: string;
}): Promise<ResultadoAcao & { reativado?: boolean }> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const email = dados.email.trim();
  const nome = dados.nome.trim();
  if (!emailValido(email)) return { ok: false, erro: "Informe um e-mail válido." };
  if (!nome) return { ok: false, erro: "Informe o nome." };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_liberar_aluno_plantao", {
    p_email: email,
    p_nome: nome,
    p_documento: dados.documento?.trim() || null,
    p_telefone: dados.telefone?.trim() || null,
  });
  if (error) {
    return { ok: false, erro: traduzirErroBanco("admin/liberarAlunoPlantao", error, { email }) };
  }

  revalidatePath("/admin/plantao");
  return { ok: true, reativado: Boolean((data as { reativado?: boolean } | null)?.reativado) };
}
