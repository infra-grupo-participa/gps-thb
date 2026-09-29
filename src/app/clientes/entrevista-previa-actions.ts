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
 *
 * ── 3.0 (29/09/2026) ───────────────────────────────────────────────────────
 * • Tudo que vem do navegador passa por `normalizarRespostas` (allowlist de
 *   pergunta e de opção): Server Action é endpoint HTTP, o tipo não vale em
 *   runtime.
 * • 🔴 FORMATO GRAVADO SÓ COM STRINGS: múltipla = "a|b", `frases_cliente` =
 *   uma frase por linha. A definição viva de `entrevista_previa_salvar`/
 *   `_concluir` NÃO foi lida nesta entrega (sem acesso ao banco); string é o
 *   formato que as entrevistas já gravadas provam aceito. A leitura aceita
 *   os dois formatos (`opcoesMarcadas`/`frasesDoCliente`).
 * • `frases_cliente`: 0 a 3, até 150 caracteres, aparadas AQUI — o limite de
 *   tamanho só existe no TypeScript.
 * • A conclusão PODA as respostas de pergunta ativa que a condição escondeu.
 * • `agendamento_preliminar` (agora · ja_marcada · nao_agendou) é
 *   OBRIGATÓRIO na conclusão; `agendamento_motivo` só com `nao_agendou`.
 * • Só quem DECIDE JUNTO (`dj`) vai para `gps.cliente_decisores` (e trava a
 *   Preliminar). Opina/avisa ficam no relatório.
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
  ROTULO_PAPEL,
} from "@/lib/entrevista-previa-calculo";
import {
  lerAgendamento,
  MSG_AGENDAMENTO_OBRIGATORIO,
  normalizarRespostas,
  podarRespostasOcultas,
  serializarFrases,
  validarFrases,
} from "@/lib/entrevista-previa-fluxo";
import {
  CHAVE_FRASES_CLIENTE,
  type LetraDisc,
  type RespostasEntrevista,
  type SinalDecisor,
} from "@/lib/entrevista-previa-perguntas";

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
    // Trava da `…321` (trigger em `gps.entrevista_previa`), mesmas frases de `validarFrases`.
    "Respostas grandes demais.": "Respostas grandes demais.",
    "Respostas com chave inválida.": "Respostas com chave inválida.",
    "Resposta grande demais.": "Resposta grande demais.",
    "Anote no máximo 3 frases do cliente.": "Anote no máximo 3 frases do cliente.",
    "Cada frase do cliente pode ter até 150 caracteres.":
      "Cada frase do cliente pode ter até 150 caracteres.",
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do nome digitado (o banco aceita até 200 em decisor, 120 em entrevistado). */
const NOME_MAXIMO = 120;

function nomeLimpo(bruto: unknown): string {
  return typeof bruto === "string" ? bruto.replace(/\s+/g, " ").trim().slice(0, NOME_MAXIMO) : "";
}

/**
 * Respostas como vão para o banco: normalizadas e SÓ com strings.
 * `frases` já validadas; lista vazia = a chave não é gravada.
 */
function paraGravar(respostas: RespostasEntrevista, frases: string[]): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(respostas)) {
    if (typeof v === "string" && v) saida[k] = v;
  }
  if (frases.length > 0) saida[CHAVE_FRASES_CLIENTE] = serializarFrases(frases);
  return saida;
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
  if (typeof input?.entrevistaId !== "string" || !UUID.test(input.entrevistaId)) {
    return { ok: false };
  }

  // Rascunho: normaliza, mas NÃO poda (quem volta atrás não perde nada).
  // Frase inválida não derruba o rascunho — fica de fora, e a conclusão
  // devolve a mensagem certa.
  const { respostas } = normalizarRespostas(input.respostas);
  const frases = validarFrases(input.respostas?.[CHAVE_FRASES_CLIENTE]);

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("entrevista_previa_salvar", {
    p_entrevista_id: input.entrevistaId,
    p_respostas: paraGravar(respostas, frases.ok ? frases.frases : []),
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
  /** Pode trazer `frases_cliente` (array de até 3 strings). */
  respostas: RespostasEntrevista;
  /** Nome digitado para cada decisor, pela chave do sinal (`conjuge`, `filhos`, `socio`). */
  nomesDecisores?: Partial<Record<SinalDecisor, string>>;
  entrevistado?: string | null;
}): Promise<
  | {
      ok: true;
      entrevistaId: string;
      clienteId: string;
      perfilDisc: string | null;
      secundaria: LetraDisc | null;
      confianca: "alta" | "media" | "baixa";
      decisoresTotal: number;
      exigeTodosNaPreliminar: boolean;
    }
  | { ok: false; erro: string }
> {
  const guarda = await guardaDeSessao();
  if (!guarda.ok) return guarda;
  if (
    typeof input?.entrevistaId !== "string" || !UUID.test(input.entrevistaId) ||
    typeof input?.clienteId !== "string" || !UUID.test(input.clienteId)
  ) {
    return { ok: false, erro: "Entrevista não encontrada." };
  }

  const frases = validarFrases(input.respostas?.[CHAVE_FRASES_CLIENTE]);
  if (!frases.ok) return { ok: false, erro: frases.erro };

  // Normaliza (allowlist) e PODA o que a condição escondeu: o que se grava
  // na conclusão é exatamente o caminho que a tela mostrou.
  const respostas = podarRespostasOcultas(normalizarRespostas(input.respostas).respostas);
  // 🔴 Obrigatório (ajuste do Marcio, 29/09): o parceiro tem de dizer se a
  // Reunião Preliminar foi marcada — inclusive "não agendou".
  if (!lerAgendamento(respostas).preliminar) {
    return { ok: false, erro: MSG_AGENDAMENTO_OBRIGATORIO };
  }

  const disc = calcularDisc(respostas);
  const decisores = mapearDecisores(respostas);
  const relatorio = gerarRelatorio(respostas, disc, decisores);

  // O entrevistado é o decisor PRINCIPAL por definição. 🔴 Os demais são SÓ
  // os que decidem junto (`dj`): é esta lista que substitui
  // `gps.cliente_decisores` e que a trava da Reunião Preliminar conta.
  // Opina/avisa não entram (decisão do Marcio, 29/09, item c).
  const nomes = (input.nomesDecisores ?? {}) as Record<string, unknown>;
  const listaDecisores = [
    { nome: nomeLimpo(input.entrevistado) || "Entrevistado", papel: "Decisor principal", principal: true },
    ...decisores.decideJunto.map((d) => ({
      nome: nomeLimpo(nomes[d.sinal]) || ROTULO_DECISOR[d.sinal],
      papel: `${ROTULO_DECISOR[d.sinal]} (${ROTULO_PAPEL[d.papel].toLowerCase()})`,
      principal: false,
    })),
  ];

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("entrevista_previa_concluir", {
      p_entrevista_id: input.entrevistaId,
      p_respostas: paraGravar(respostas, frases.frases),
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
  // 🔴 Espelho do admin (24/09/2026): esta action não recebe `alunoId`, só
  // `clienteId` — não dá para montar `/admin/aluno/[alunoId]/clientes/...`.
  // `"layout"` revalida a árvore inteira sob `/admin/aluno`.
  revalidatePath("/admin/aluno", "layout");

  const r = data as {
    perfil_disc: string | null;
    decisores_total: number;
    exige_todos_na_preliminar: boolean;
  };
  return {
    ok: true,
    entrevistaId: input.entrevistaId,
    clienteId: input.clienteId,
    perfilDisc: r.perfil_disc,
    secundaria: disc.secundaria,
    confianca: disc.confianca,
    decisoresTotal: r.decisores_total,
    exigeTodosNaPreliminar: r.exige_todos_na_preliminar,
  };
}
