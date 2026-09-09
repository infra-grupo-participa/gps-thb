"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ClienteEtapa1, FaseCliente, ModoEnfase } from "@/lib/types";

/**
 * Campos do cliente que a UI pode atualizar.
 *
 * `status` saiu da lista de propósito (migração 20260909000060): a coluna
 * ficou CONGELADA no banco e é o caminho de volta da Fase 4 — enquanto
 * nenhuma escrita a toca, `drop column fase` restaura o estado anterior sem
 * restore de backup. Se voltar aqui, o caminho de volta morre em silêncio.
 */
export type PatchCliente = Partial<
  Pick<
    ClienteEtapa1,
    | "nome"
    | "telefone"
    | "nivel_relacionamento"
    | "problemas"
    | "perda_inercia"
    | "registro_contato"
    | "mensagem_padrao_enviada"
    | "estudo_caso_enviado"
    | "ligacao_realizada"
    | "fase"
    | "data_reuniao_preliminar"
    | "aderiu_reuniao"
    | "perfil_disc"
  >
>;

/**
 * Allowlist em RUNTIME das chaves de PatchCliente. O tipo acima só vale em
 * compilação: Server Action é endpoint HTTP, e uma chamada forjada pode mandar
 * `{ status: ... }` ou qualquer coluna da tabela. Sem esta lista, o
 * congelamento de `status` (migração ...060) seria só uma promessa de tipo.
 * Achado do pentest de 08/09/2026 (MÉDIO). Manter espelhada no Pick acima.
 */
const CHAVES_PATCH_CLIENTE: ReadonlySet<string> = new Set([
  "nome",
  "telefone",
  "nivel_relacionamento",
  "problemas",
  "perda_inercia",
  "registro_contato",
  "mensagem_padrao_enviada",
  "estudo_caso_enviado",
  "ligacao_realizada",
  "fase",
  "data_reuniao_preliminar",
  "aderiu_reuniao",
  "perfil_disc",
]);

function filtrarPatch(patch: PatchCliente): PatchCliente {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (CHAVES_PATCH_CLIENTE.has(k)) limpo[k] = v;
  }
  return limpo as PatchCliente;
}

function revalidar(alunoId: string) {
  revalidatePath("/etapa-1");
  revalidatePath("/clientes");
  revalidatePath("/clientes", "layout");
  revalidatePath("/etapa", "layout");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

export async function criarCliente(alunoId: string) {
  const supabase = await createClient();

  const { data: ultimos } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("ordem")
    .eq("aluno_id", alunoId)
    .order("ordem", { ascending: false })
    .limit(1);

  const proximaOrdem = (ultimos?.[0]?.ordem ?? 0) + 1;

  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .insert({ aluno_id: alunoId, ordem: proximaOrdem })
    .select("id")
    .single();

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return { id: data.id as string };
}

export async function atualizarCliente(
  clienteId: string,
  alunoId: string,
  patch: PatchCliente,
) {
  const seguro = filtrarPatch(patch);
  if (Object.keys(seguro).length === 0) return { erro: "Nada para salvar." };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .update(seguro)
    .eq("id", clienteId);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

/**
 * Move o cliente de fase (prospeccao | fechamento | contratado). Substitui
 * `mudarStatusCliente`, removida na Fase 4 — as duas convivendo deixariam a
 * coluna congelada aberta a escrita por um caminho esquecido.
 *
 * Sem catraca: o cliente pode voltar de fase (o quadro arrasta nos dois
 * sentidos). A mudança é auditada no diário como `cliente_fase_mudou` pela
 * trigger gps.aluno_eventos_capturar_etapa1_clientes.
 *
 * A autorização é do banco, não daqui: a RLS de gps.etapa1_clientes só deixa
 * o dono do ambiente (gps.aluno_atual()) ou o admin (public.gp_is_admin())
 * atualizarem a linha — `alunoId` serve para revalidar as rotas certas, não
 * como credencial.
 */
export async function mudarFaseCliente(
  clienteId: string,
  alunoId: string,
  fase: FaseCliente,
): Promise<{ erro?: string }> {
  return atualizarCliente(clienteId, alunoId, { fase });
}

/** Define (ou remove) o cliente acompanhado pela equipe — no máximo um por aluno. */
export async function definirClienteEquipe(
  clienteId: string,
  alunoId: string,
  ativar: boolean,
) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // Desmarca todos primeiro (respeita o índice único parcial).
  const { error: e1 } = await gps
    .from("etapa1_clientes")
    .update({ acompanhado_equipe: false })
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true);
  if (e1) return { erro: e1.message };

  if (ativar) {
    const { error: e2 } = await gps
      .from("etapa1_clientes")
      .update({ acompanhado_equipe: true })
      .eq("id", clienteId);
    if (e2) return { erro: e2.message };
  }

  revalidar(alunoId);
  return {};
}

export async function removerCliente(clienteId: string, alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .delete()
    .eq("id", clienteId);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

export async function marcarTarefa(
  alunoId: string,
  etapa: number,
  tarefa: number,
  concluida: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("progresso")
    .upsert(
      {
        aluno_id: alunoId,
        etapa,
        tarefa,
        concluida,
        concluida_em: concluida ? new Date().toISOString() : null,
      },
      { onConflict: "aluno_id,etapa,tarefa" },
    );

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}

/**
 * Define (ou remove, com modo=null) o override de destaque de uma tarefa para
 * um aluno. Só o admin usa — a RLS de gps.tarefa_enfase garante isso.
 */
export async function definirEnfaseTarefa(
  alunoId: string,
  etapa: number,
  tarefa: number,
  modo: ModoEnfase | null,
) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  if (modo === null) {
    const { error } = await gps
      .from("tarefa_enfase")
      .delete()
      .eq("aluno_id", alunoId)
      .eq("etapa", etapa)
      .eq("tarefa", tarefa);
    if (error) return { erro: error.message };
  } else {
    const { error } = await gps
      .from("tarefa_enfase")
      .upsert(
        { aluno_id: alunoId, etapa, tarefa, modo },
        { onConflict: "aluno_id,etapa,tarefa" },
      );
    if (error) return { erro: error.message };
  }

  revalidar(alunoId);
  return {};
}

/** Data é do AMBIENTE (compartilhada entre titular e sócios), não da pessoa. */
export async function salvarDataAgendamento(
  alunoId: string,
  data: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("ambientes")
    .update({ data_agendamento_disponivel: data })
    .eq("aluno_id", alunoId);

  if (error) return { erro: error.message };
  revalidar(alunoId);
  return {};
}
