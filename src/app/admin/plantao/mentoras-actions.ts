"use server";

/**
 * Plantão de Dúvidas — Server Actions do ADMIN sobre as MENTORAS
 * (`gps.plantao_mentoras`), antes só editáveis por SQL direto.
 *
 * Recortado de `src/app/admin/plantao/actions.ts` (CD5) sem mudança de
 * comportamento. Aquele arquivo virou o agregador que reexporta daqui.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { emailValido, normalizarEmail } from "@/lib/plantao";
import type { ResultadoAcao } from "@/lib/plantao-tipos";

export interface CriarMentoraInput {
  nome: string;
  email?: string;
}

export async function criarMentora(input: CriarMentoraInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const nome = input.nome.trim();
  if (!nome) return { ok: false, erro: "Informe o nome da mentora." };

  const emailBruto = input.email?.trim() ?? "";
  if (emailBruto && !emailValido(emailBruto)) {
    return { ok: false, erro: "E-mail inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").from("plantao_mentoras").insert({
    nome,
    email: emailBruto ? normalizarEmail(emailBruto) : null,
  });

  if (error) return { ok: false, erro: "Não foi possível cadastrar a mentora." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

export interface EditarMentoraInput {
  mentoraId: string;
  nome: string;
  email?: string;
}

/**
 * Edita nome/e-mail. Validação de e-mail no CLIENTE (feedback imediato) E
 * aqui — a Server Action é o endpoint real; um `fetch` direto ao mesmo path
 * contornaria qualquer checagem só de tela.
 */
export async function editarMentora(input: EditarMentoraInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const nome = input.nome.trim();
  if (!nome) return { ok: false, erro: "Informe o nome da mentora." };

  const emailBruto = input.email?.trim() ?? "";
  if (emailBruto && !emailValido(emailBruto)) {
    return { ok: false, erro: "E-mail inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("plantao_mentoras")
    .update({
      nome,
      email: emailBruto ? normalizarEmail(emailBruto) : null,
    })
    .eq("id", input.mentoraId);

  if (error) return { ok: false, erro: "Não foi possível salvar as alterações." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Ativa/desativa uma mentora. Desativar NÃO apaga nada — só some do seletor
 * de "criar novo plantão" (ver filtro em `FormularioSlot`, que já mantém a
 * mentora atual visível ao editar mesmo se ela virar inativa). Plantões já
 * publicados dela continuam de pé.
 *
 * Ao desativar, avisa (no retorno, não bloqueia) quantos plantões PUBLICADOS
 * e FUTUROS ficam sem a mentora reaparecer no seletor — a equipe decide se
 * quer remarcar ou deixar como está. Reativar nunca precisa desse aviso.
 */
export async function alternarAtivaMentora(
  mentoraId: string,
  ativa: boolean,
): Promise<ResultadoAcao & { plantoesFuturos?: number }> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  // Sustentabilidade: usa o índice parcial `idx_plantao_slots_agenda
  // (inicio_em) where publicado` (migration 20260901000001) — já restringe a
  // varredura a "publicados e futuros" antes de aplicar `mentora_id`, que sem
  // índice próprio é filtro residual barato sobre um recorte de dezenas de
  // linhas (agenda mensal de 3 mentoras). Sem crescimento de risco a 10x o
  // volume atual: o corte por `publicado`+`inicio_em` é o que domina o custo.
  let plantoesFuturos = 0;
  if (!ativa) {
    const { count } = await supabase
      .schema("gps")
      .from("plantao_slots")
      .select("id", { count: "exact", head: true })
      .eq("mentora_id", mentoraId)
      .eq("publicado", true)
      .gt("inicio_em", new Date().toISOString());
    plantoesFuturos = count ?? 0;
  }

  const { error } = await supabase
    .schema("gps")
    .from("plantao_mentoras")
    .update({ ativa })
    .eq("id", mentoraId);

  if (error) return { ok: false, erro: "Não foi possível atualizar a mentora." };

  revalidatePath("/admin/plantao");
  return { ok: true, plantoesFuturos };
}
