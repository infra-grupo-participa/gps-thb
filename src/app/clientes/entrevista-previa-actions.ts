"use server";

/**
 * Server Actions da Entrevista Prévia 2.0 — o formulário guiado que o
 * PARCEIRO conduz ao vivo na ficha do cliente (pedido do Marcio, 23/09/2026).
 *
 * 🔴 MÓDULO `"use server"` SÓ EXPORTA `async function`. `export type`,
 * `export interface` e `export const` passam no `tsc` e no `next build`, e
 * quebram em RUNTIME — já derrubou `/admin` e `/admin/videos`. Os tipos deste
 * fluxo vivem em `src/lib/entrevista-previa-*.ts`; aqui só há funções.
 *
 * Contrato de banco (aplicado e medido em 23/09, 8 passos em rollback):
 *   `gps.entrevista_previa_iniciar(uuid, text)` → uuid (retoma a em aberto)
 *   `gps.entrevista_previa_salvar(uuid, jsonb)`
 *   `gps.entrevista_previa_concluir(uuid, jsonb, text, jsonb, text, text, text, jsonb)`
 *   `gps.cliente_decisores_pendentes(uuid)` → jsonb
 *
 * 🔑 O CÁLCULO do DISC acontece AQUI (TypeScript), não no banco: os pesos
 * vivem no roteiro (`entrevista-previa-perguntas.ts`) e duplicá-los em
 * plpgsql criaria duas fontes de verdade que divergem no primeiro ajuste de
 * pergunta. O banco valida a FORMA (letra no catálogo, tamanhos), não o mérito.
 */

import { revalidatePath } from "next/cache";

import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { MSG_SESSAO_INDETERMINADA, traduzirErroBanco } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import {
  calcularDisc,
  gerarRelatorio,
  mapearDecisores,
  ROTULO_DECISOR,
  type RespostasEntrevista,
} from "@/lib/entrevista-previa-calculo";

/** Frases das travas das RPCs, repassadas sem reescrita. */
function frasesDasTravas(): Record<string, string> {
  return {
    "Sem permissão.": "Sem permissão.",
    "Cliente não encontrado.": "Cliente não encontrado.",
    "Entrevista não encontrada.": "Entrevista não encontrada.",
    "Esta entrevista já foi concluída.": "Esta entrevista já foi concluída.",
    "Esta entrevista já foi concluída. Inicie uma nova para registrar outra conversa.":
      "Esta entrevista já foi concluída. Inicie uma nova para registrar outra conversa.",
    "O perfil DISC precisa ser D, I, S ou C.":
      "O perfil DISC precisa ser D, I, S ou C.",
    "O nome do entrevistado precisa de ao menos 2 caracteres.":
      "O nome do entrevistado precisa de ao menos 2 caracteres.",
    "Respostas em formato inválido.": "Respostas em formato inválido.",
  };
}

async function guardaDeSessao(): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx) return { ok: false, erro: "Faça login para continuar." };
    return { ok: true };
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }
}

/**
 * Abre a entrevista, ou retoma a que estiver em aberto para este cliente.
 *
 * 🔑 Retomar não é conveniência: a conversa é AO VIVO e a aba pode cair no
 * meio. Sem isso, cada refresh abriria uma linha nova e o histórico do
 * cliente encheria de entrevistas vazias.
 */
export async function iniciarEntrevistaPrevia(input: {
  clienteId: string;
  entrevistado?: string | null;
}): Promise<{ ok: true; entrevistaId: string } | { ok: false; erro: string }> {
  const guarda = await guardaDeSessao();
  if (!guarda.ok) return guarda;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("entrevista_previa_iniciar", {
      p_cliente_id: input.clienteId,
      p_entrevistado: (input.entrevistado ?? "").trim() || null,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "iniciarEntrevistaPrevia",
        error,
        { rpc: "gps.entrevista_previa_iniciar", clienteId: input.clienteId },
        frasesDasTravas(),
      ),
    };
  }
  return { ok: true, entrevistaId: data as string };
}

/**
 * Salva o progresso. Chamada a cada resposta marcada.
 *
 * 🔴 Silenciosa por desenho: um erro aqui NÃO pode interromper a conversa com
 * o cliente. O parceiro está falando com uma pessoa; um toast vermelho no
 * meio da pergunta 12 faz mais estrago que a perda de um rascunho. A
 * conclusão reenvia todas as respostas, então nada se perde de fato.
 */
export async function salvarProgressoEntrevista(input: {
  entrevistaId: string;
  respostas: RespostasEntrevista;
}): Promise<{ ok: boolean }> {
  const guarda = await guardaDeSessao();
  if (!guarda.ok) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("entrevista_previa_salvar", {
    p_entrevista_id: input.entrevistaId,
    p_respostas: input.respostas,
  });
  return { ok: !error };
}

/**
 * Conclui: calcula o DISC, monta o relatório, grava tudo na FICHA do cliente
 * e substitui a lista de decisores.
 *
 * Pedido literal: *"ao final, eh gerado um relatorio geral do perfil disc
 * dele, automatico, sem precisar informar, anexar"*.
 */
export async function concluirEntrevistaPrevia(input: {
  entrevistaId: string;
  clienteId: string;
  respostas: RespostasEntrevista;
  /** Nomes que o parceiro digitou para cada decisor detectado. */
  nomesDecisores?: Record<string, string>;
  entrevistado?: string | null;
}): Promise<
  | {
      ok: true;
      perfilDisc: string | null;
      decisoresTotal: number;
      exigeTodosNaPreliminar: boolean;
    }
  | { ok: false; erro: string }
> {
  const guarda = await guardaDeSessao();
  if (!guarda.ok) return guarda;

  const disc = calcularDisc(input.respostas);
  const decisores = mapearDecisores(input.respostas);
  const relatorio = gerarRelatorio(input.respostas, disc, decisores);

  // O entrevistado é o decisor PRINCIPAL por definição: é com ele que a
  // conversa aconteceu. Os demais saem dos sinais do roteiro, com o nome que
  // o parceiro digitou (ou o rótulo do tipo, quando ele não soube o nome).
  const listaDecisores = [
    {
      nome: (input.entrevistado ?? "").trim() || "Entrevistado",
      papel: "Decisor principal",
      principal: true,
    },
    ...decisores.adicionais.map((d) => ({
      nome:
        (input.nomesDecisores?.[d.sinal] ?? "").trim() || ROTULO_DECISOR[d.sinal],
      papel: ROTULO_DECISOR[d.sinal],
      principal: false,
    })),
  ];

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("entrevista_previa_concluir", {
      p_entrevista_id: input.entrevistaId,
      p_respostas: input.respostas,
      p_perfil_disc: disc.letra,
      p_disc_pontos: disc.pontos,
      p_consciencia: relatorio.consciencia,
      p_gatilhos: relatorio.gatilhos,
      p_relacionamento: relatorio.relacionamento,
      p_decisores: listaDecisores,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "concluirEntrevistaPrevia",
        error,
        { rpc: "gps.entrevista_previa_concluir", entrevistaId: input.entrevistaId },
        frasesDasTravas(),
      ),
    };
  }

  // O DISC mudou a ficha do cliente — as telas que o mostram precisam reler.
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${input.clienteId}`);
  revalidatePath("/sessoes");
  revalidatePath("/admin/sessoes");

  const r = data as {
    perfil_disc: string | null;
    decisores_total: number;
    exige_todos_na_preliminar: boolean;
  };
  return {
    ok: true,
    perfilDisc: r.perfil_disc,
    decisoresTotal: r.decisores_total,
    exigeTodosNaPreliminar: r.exige_todos_na_preliminar,
  };
}
