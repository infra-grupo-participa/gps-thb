"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import {
  ANEXO_PATH_REGEX,
  ANEXO_TAMANHO_MAXIMO,
  EXTENSAO_POR_MIME,
  ehAnexoMime,
  nomeDeArquivoSeguro,
} from "@/lib/chamados-tipos";
import { GRAUS_RELACAO } from "@/lib/types";
import type { ClienteEtapa1, FaseCliente, ModoEnfase } from "@/lib/types";

/*
 * CD3 (09/09/2026) — este arquivo morava em `src/app/etapa-1/`, uma pasta com
 * `actions.ts` e NENHUM `page.tsx`. `/etapa-1` não é rota (a tela é
 * `/etapa/[n]`), então o caminho do módulo mentia — a mesma forma de
 * `src/app/agenda/`, apagada em 09/09 por ter Server Actions órfãs expostas.
 * Aqui as actions ESTÃO em uso: são as dos clientes da Etapa 01, cuja tela é
 * `/clientes`. Mudou o endereço, não o comportamento.
 *
 * O redirect `/etapa-1 → /etapa/1` do `next.config.ts` continua: ele serve a
 * link e bookmark antigos, e nunca teve relação com este módulo.
 */

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
    // 🔴 `nivel_relacionamento` e `perda_inercia` SAÍRAM daqui em 10/09/2026
    // (decisão do Marcio). Tirar da allowlist é o que CONGELA de verdade: o
    // tipo abaixo só vale em compilação, mas Server Action é endpoint HTTP e
    // uma chamada forjada mandaria a coluna direto. Sem esta remoção, o
    // congelamento seria só promessa. As colunas continuam no banco com o
    // dado histórico; nenhum caminho de escrita as toca.
    | "problemas"
    | "registro_contato"
    | "mensagem_padrao_enviada"
    | "estudo_caso_enviado"
    | "ligacao_realizada"
    | "fase"
    | "data_reuniao_preliminar"
    | "aderiu_reuniao"
    | "perfil_disc"
    | "valor_honorarios"
    | "contrato_url"
    | "grau_relacao"
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
  "problemas",
  "registro_contato",
  "mensagem_padrao_enviada",
  "estudo_caso_enviado",
  "ligacao_realizada",
  "fase",
  "data_reuniao_preliminar",
  "aderiu_reuniao",
  "perfil_disc",
  // Honorários e link do contrato (migração 20260909000090). Estar só no
  // `Pick` acima não bastaria: o tipo some na compilação e o filtro abaixo
  // descartaria os dois em runtime — a feature nasceria morta, sem erro.
  "valor_honorarios",
  "contrato_url",
  // Grau de relação (migração 20260910000202). Mesma armadilha dos dois acima:
  // estar só no `Pick` não basta — o tipo some na compilação e o filtro abaixo
  // descartaria o campo em runtime, e a feature nasceria morta, sem erro.
  "grau_relacao",
]);

/**
 * ⚠️ `acompanhamento_confirmado_em`/`_por` NÃO entram na allowlist, e não é
 * esquecimento: quem confirma e libera o acompanhamento é a equipe, por RPC
 * (`gps.admin_confirmar_acompanhamento`/`_liberar_`). A trigger
 * `trg_etapa1_clientes_acompanhamento_travado` recusa a escrita de quem não é
 * admin mesmo pelo PostgREST — a trava é do banco, esta lista é conveniência.
 *
 * ⚠️ As 5 colunas de `contrato_*` (migração ...214) também ficam de fora, pelo
 * mesmo motivo: a escrita é só por `gps.cliente_definir_contrato` /
 * `gps.cliente_remover_contrato`, que conferem o objeto REAL no bucket. Sem
 * essa passagem obrigatória, `contrato_path` seria um campo de texto livre —
 * "contrato anexado" sem arquivo nenhum do outro lado. A trigger
 * `trg_etapa1_clientes_contrato_travado` é quem garante; esta lista é
 * conveniência. `contrato_url` (o link do Drive, LEGADO) continua na lista:
 * ele nunca prometeu ser prova de nada.
 */

function filtrarPatch(patch: PatchCliente): PatchCliente {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (CHAVES_PATCH_CLIENTE.has(k)) limpo[k] = v;
  }
  return limpo as PatchCliente;
}

/**
 * Normaliza e valida os dois campos de contrato ANTES de mandar ao banco.
 *
 * Os CHECKs de `gps.etapa1_clientes` (migração ...090) são a garantia — esta
 * função existe para o erro chegar ao aluno em português em vez de
 * `23514 violates check constraint`, e para que o campo esvaziado na tela vire
 * `null` em vez de `''` (string vazia não casa `^https://…` e derrubaria o
 * salvamento inteiro da ficha).
 *
 * Server Action é endpoint HTTP: os `typeof` não são paranoia, uma chamada
 * forjada manda o que quiser.
 */
function validarPatch(patch: PatchCliente): {
  patch?: PatchCliente;
  erro?: string;
} {
  const saida: Record<string, unknown> = { ...patch };

  if ("valor_honorarios" in saida) {
    const v = saida.valor_honorarios;
    if (v === null || v === undefined || v === "") {
      saida.valor_honorarios = null;
    } else if (typeof v !== "number" || !Number.isFinite(v)) {
      return { erro: "Honorários: informe um valor numérico." };
    } else if (v < 0) {
      return { erro: "Honorários não podem ser negativos." };
    } else if (v > 9_999_999_999.99) {
      // Teto do numeric(12,2) da coluna — sem isso o erro vira 22003.
      return { erro: "Honorários: valor acima do limite permitido." };
    }
  }

  if ("grau_relacao" in saida) {
    const v = saida.grau_relacao;
    if (v === null || v === undefined || v === "") {
      // Campo esvaziado na tela vira `null` = NÃO INFORMADO, nunca `''` (que
      // não passa no CHECK e derrubaria o salvamento inteiro da ficha).
      saida.grau_relacao = null;
    } else if (
      typeof v !== "string" ||
      !(GRAUS_RELACAO as readonly string[]).includes(v)
    ) {
      return { erro: "Escolha um grau de relação da lista." };
    }
  }

  if ("contrato_url" in saida) {
    const v = saida.contrato_url;
    if (v === null || v === undefined) {
      saida.contrato_url = null;
    } else if (typeof v !== "string") {
      return { erro: "Link do contrato inválido." };
    } else {
      const url = v.trim();
      if (url === "") {
        saida.contrato_url = null;
      } else if (!url.startsWith("https://")) {
        return {
          erro: "O link do contrato precisa começar com https:// (o endereço do Drive).",
        };
      } else if (/\s/.test(url)) {
        return { erro: "O link do contrato não pode conter espaços." };
      } else if (url.length < 12 || url.length > 2000) {
        return { erro: "Link do contrato inválido (tamanho fora do permitido)." };
      } else {
        saida.contrato_url = url;
      }
    }
  }

  return { patch: saida as PatchCliente };
}

function revalidar(alunoId: string) {
  // `/etapa/1` é a rota de verdade do guia da Etapa 01. Até 09/09 esta linha
  // revalidava o nome DESTA PASTA, que nunca teve `page.tsx`: rota
  // inexistente, e o cache do guia só caía pelo `revalidatePath("/etapa",
  // "layout")` abaixo (CD3).
  revalidatePath("/etapa/1");
  revalidatePath("/clientes");
  revalidatePath("/clientes", "layout");
  revalidatePath("/etapa", "layout");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/**
 * Cria o cliente. `inicial` (opcional) é o que o diálogo "Novo cliente" pede:
 * fase e grau de relação — validados aqui contra os catálogos (a allowlist do
 * `PatchCliente` vale para atualizar; criar tem a própria). Sem `inicial`
 * nasce em prospecção, sem vínculo, como sempre.
 */
export async function criarCliente(
  alunoId: string,
  inicial?: { nome?: string; fase?: FaseCliente; grau_relacao?: string | null },
) {
  // 🔴 O NOME É OBRIGATÓRIO AQUI, não só no diálogo (10/09/2026).
  //
  // Server Action é endpoint HTTP: desabilitar o botão impede o clique, não a
  // chamada. E o custo de não validar está medido — **21 fichas sem nome, em
  // 18 ambientes**, a mais antiga de 15/07, uma delas já em "contratado".
  // Elas nasciam porque a ficha era criada no banco ANTES de a pessoa digitar
  // qualquer coisa; quem fechava a aba deixava o fantasma na lista.
  //
  // Ficha sem nome não conta para os 30 (ficha completa = nome + telefone),
  // então o fantasma ainda atrapalhava a trava da fase Inicial.
  const nome = (inicial?.nome ?? "").trim();
  if (!nome) return { erro: "Informe o nome do cliente." };
  if (nome.length > 200) return { erro: "O nome é longo demais (máximo 200 caracteres)." };

  const fasesValidas: readonly string[] = ["prospeccao", "fechamento", "contratado"];
  const fase = inicial?.fase ?? "prospeccao";
  if (!fasesValidas.includes(fase)) return { erro: "Fase inválida." };
  const grau = inicial?.grau_relacao ? String(inicial.grau_relacao) : null;
  if (grau !== null && !(GRAUS_RELACAO as readonly string[]).includes(grau)) {
    return { erro: "Escolha um grau de relação da lista." };
  }
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
    .insert({ aluno_id: alunoId, nome, ordem: proximaOrdem, fase, grau_relacao: grau })
    .select("id")
    .single();

  if (error) return { erro: traduzirErroBanco("criarCliente", error) };
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
  const { patch: validado, erro: erroValidacao } = validarPatch(seguro);
  if (erroValidacao || !validado) return { erro: erroValidacao };
  const supabase = await createClient();
  // `.select("id")` NÃO é enfeite: sem ele, um `update` que não casa linha
  // nenhuma (id de outro ambiente, cliente já apagado, RLS recusando) volta
  // `error: null` e a ficha dizia "Ficha salva." tendo salvo NADA — a mesma
  // armadilha já fechada em `salvarPerfilAluno`. Com o `select`, a resposta
  // traz as linhas afetadas e 0 vira erro em português.
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .update(validado)
    .eq("id", clienteId)
    .select("id");

  if (error) return { erro: traduzirErroBanco("atualizarCliente", error) };
  if ((data ?? []).length === 0) {
    logErro("atualizarCliente", "update sem linha afetada", {
      alunoId,
      campos: Object.keys(validado).join(","),
    });
    return {
      erro:
        "Nada foi salvo — a ficha não foi encontrada ou você não tem acesso a ela.",
    };
  }
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

/**
 * Define (ou remove) o cliente acompanhado pela equipe — no máximo um por aluno.
 *
 * 🔴 A ESCOLHA É UMA SÓ (migração 20260910000215, pedido do João): a PRIMEIRA
 * marcação é livre; depois dela, o ALUNO não desmarca mais. Como esta função
 * desmarca TODOS antes de marcar um (o índice único parcial
 * `etapa1_clientes_unico_equipe` obriga), com favorito existente o primeiro
 * `update` abaixo bate na trigger e volta 42501 — e a ação inteira falha, que
 * é o comportamento PEDIDO. O que esta função garante é que a frase chegue em
 * português ("Para trocar o cliente que a equipe acompanha, abra um chamado no
 * Suporte."), e não um "Sem permissão" cru.
 *
 * A UI **não deve oferecer** a estrela nos outros cards nem o "desmarcar" no
 * card marcado enquanto houver favorito — botão que sempre falha é pior do que
 * botão ausente. Isso é tarefa do frontend; aqui é a rede de segurança.
 *
 * 🔑 O ADMIN passa pela trava: é por esta MESMA função, em Modo Assistência,
 * que a equipe troca o cliente acompanhado quando o aluno pede pelo Suporte.
 * (A ...203 continua valendo por dentro: `acompanhamento_confirmado_em` é a
 * confirmação formal da equipe e trava também a volta de fase.)
 */
export async function definirClienteEquipe(
  clienteId: string,
  alunoId: string,
  ativar: boolean,
) {
  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // 🔴 CONFERE O ALVO ANTES DE DESMARCAR (achado do Auditor A). A ordem
  // "desmarca todos → marca um" é OBRIGATÓRIA: o índice único parcial
  // `etapa1_clientes_unico_equipe` recusa duas linhas marcadas ao mesmo tempo,
  // então marcar primeiro é impossível. O defeito era outro: com um id fora do
  // ambiente, o segundo `update` não casava linha nenhuma, voltava sem erro —
  // e a estrela do aluno tinha sido apagada por nada.
  //
  // ESCOLHA: pré-checagem aqui, não RPC nova. Uma RPC exigiria migração
  // aplicada pelo João e duplicaria em SQL a regra que a trigger da ...215 já
  // impõe; a pré-checagem fecha o caso relatado (id de outro ambiente) ANTES
  // de qualquer escrita e não acrescenta superfície no banco. O `.eq(aluno_id)`
  // é defesa em profundidade — quem autoriza é a RLS, e para o admin em Modo
  // Assistência `alunoId` é o ambiente que ele está gerenciando.
  if (ativar) {
    const { data: alvo, error: eAlvo } = await gps
      .from("etapa1_clientes")
      .select("id")
      .eq("id", clienteId)
      .eq("aluno_id", alunoId)
      .maybeSingle();
    if (eAlvo) return { erro: traduzirErroBanco("definirClienteEquipe", eAlvo) };
    if (!alvo) {
      return {
        erro: "Cliente não encontrado neste ambiente. Recarregue a lista.",
      };
    }
  }

  // Desmarca todos primeiro (respeita o índice único parcial).
  const { error: e1 } = await gps
    .from("etapa1_clientes")
    .update({ acompanhado_equipe: false })
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true);
  if (e1) return { erro: traduzirErroBanco("definirClienteEquipe", e1) };

  if (ativar) {
    const { data: marcados, error: e2 } = await gps
      .from("etapa1_clientes")
      .update({ acompanhado_equipe: true })
      .eq("id", clienteId)
      .select("id");
    if (e2) return { erro: traduzirErroBanco("definirClienteEquipe", e2) };
    // Corrida estreita (a linha sumiu entre a checagem e o update): não dá
    // para restaurar a estrela anterior daqui, mas mentir "salvo" é pior —
    // a tela recarrega e o aluno vê o estado real.
    if ((marcados ?? []).length === 0) {
      logErro("definirClienteEquipe", "update sem linha afetada", { alunoId });
      revalidar(alunoId);
      return {
        erro:
          "Não foi possível marcar este cliente. Recarregue a lista e tente de novo.",
      };
    }
  }

  revalidar(alunoId);
  return {};
}

/**
 * 🔴 O cliente MARCADO como acompanhado não é excluído pelo aluno (migração
 * ...215): apagar a linha marcada é trocar de cliente por outro caminho. A
 * trigger `trg_etapa1_clientes_acompanhamento_travado` recusa o DELETE com
 * 42501 e a frase diz o que fazer ("abra um chamado no Suporte"). O mesmo vale
 * para o cliente CONFIRMADO pela equipe, mesmo sem a estrela (...203). A
 * confirmação nomeada da UI continua valendo para todos os outros.
 */
export async function removerCliente(clienteId: string, alunoId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .delete()
    .eq("id", clienteId);

  if (error) return { erro: traduzirErroBanco("removerCliente", error) };
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

  if (error) return { erro: traduzirErroBanco("marcarTarefa", error) };
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
    if (error) return { erro: traduzirErroBanco("definirEnfaseTarefa", error) };
  } else {
    const { error } = await gps
      .from("tarefa_enfase")
      .upsert(
        { aluno_id: alunoId, etapa, tarefa, modo },
        { onConflict: "aluno_id,etapa,tarefa" },
      );
    if (error) return { erro: traduzirErroBanco("definirEnfaseTarefa", error) };
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

  if (error) return { erro: traduzirErroBanco("salvarDataAgendamento", error) };
  revalidar(alunoId);
  return {};
}

// ═════════════════════════════════════════════════════════════════════════
// Contrato do cliente — ANEXO, não link (migração 20260910000214)
// ═════════════════════════════════════════════════════════════════════════
/**
 * 🔴 Nada aqui é a fronteira de segurança. A fronteira são, nesta ordem:
 *   1. o BUCKET `gps-onboarding` (privado, 5 MB, 4 MIMEs) — recusa por
 *      tamanho e tipo em qualquer caminho de upload;
 *   2. as POLICIES `gps_onboarding_anexo_insert`/`_select` em
 *      `storage.objects` — decidem por CAMINHO, com a SESSÃO de quem pede;
 *   3. as RPCs `gps.cliente_definir_contrato`/`gps.cliente_remover_contrato`
 *      (`SECURITY DEFINER`) — conferem posse, existência do objeto e
 *      MIME/tamanho REAIS em `storage.objects.metadata`;
 *   4. a trigger `trg_etapa1_clientes_contrato_travado` — recusa (42501)
 *      qualquer escrita das 5 colunas fora dessas RPCs.
 * As validações daqui existem para o erro chegar em PORTUGUÊS e para não
 * gastar ida ao banco com entrada obviamente inválida.
 *
 * 🔑 NUNCA `service_role`: upload e download usam a sessão do usuário.
 *
 * ⚠️ O BUCKET É O MESMO do questionário inicial, de propósito (...214): as
 * policies, o teto e a allowlist são idênticos, e um bucket a mais seria um
 * lugar a mais para eles divergirem. O bucket passou a significar "anexos do
 * ambiente".
 */
const BUCKET_ANEXOS = "gps-onboarding";

/**
 * A ficha do cliente, lida COM A SESSÃO de quem chama — a RLS de
 * `gps.etapa1_clientes` só devolve linha para o dono do ambiente
 * (`gps.aluno_atual()`) ou para o admin. Não há aqui nenhuma comparação com
 * `alunoId` vindo do cliente: o parâmetro é o id do CLIENTE e o ambiente sai
 * da linha.
 *
 * Uma frase só para "não existe" e "não é seu": distinguir transformaria a
 * action num oráculo sobre ficha alheia.
 */
async function fichaDoCliente(clienteId: string): Promise<
  | {
      ok: true;
      alunoId: string;
      contratoPath: string | null;
      contratoNome: string | null;
    }
  | { ok: false; erro: string }
> {
  if (!clienteId) return { ok: false, erro: "Cliente não informado." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("id, aluno_id, contrato_path, contrato_nome")
    .eq("id", clienteId)
    .maybeSingle();

  if (error) {
    return { ok: false, erro: traduzirErroBanco("fichaDoCliente", error) };
  }
  if (!data) return { ok: false, erro: "Cliente não encontrado." };
  return {
    ok: true,
    alunoId: data.aluno_id as string,
    contratoPath: (data.contrato_path as string | null) ?? null,
    contratoNome: (data.contrato_nome as string | null) ?? null,
  };
}

/**
 * URL assinada de UPLOAD, emitida com a sessão do aluno. Molde literal de
 * `criarUploadAssinadoOnboarding` (`src/app/onboarding/actions.ts`).
 *
 * O caminho é montado NO SERVIDOR — `<aluno_id do AMBIENTE>/<uuid>.<ext>`, com
 * a extensão derivada do MIME e **não** do nome do arquivo
 * (`contrato.pdf.html` com `type=image/png` vira `<uuid>.png`). O usuário
 * nunca escolhe onde grava.
 *
 * 🔴 O ADMIN NÃO ANEXA. `gps.pode_anexar_onboarding` exige
 * `gps.aluno_atual() = prefixo`, e o admin não tem ambiente: a URL assinada
 * nasceria e o PUT morreria com 403 depois de a pessoa já ter escolhido o
 * arquivo. Recusar aqui, com frase, é melhor do que falhar lá. A equipe BAIXA
 * e REMOVE; anexar é do aluno — a mesma regra do chamado.
 */
export async function criarUploadAssinadoContratoCliente(input: {
  clienteId: string;
  nome: string;
  mime: string;
  tamanho: number;
}): Promise<
  | { ok: true; path: string; token: string; nome: string }
  | { ok: false; erro: string }
> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return {
      ok: false,
      erro: "Só o aluno anexa o contrato do cliente pelo portal.",
    };
  }

  if (!ehAnexoMime(input.mime)) {
    return {
      ok: false,
      erro: "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",
    };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > ANEXO_TAMANHO_MAXIMO
  ) {
    return { ok: false, erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeArquivoSeguro(input.nome);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };

  const ficha = await fichaDoCliente(input.clienteId);
  if (!ficha.ok) return { ok: false, erro: ficha.erro };

  // O prefixo é o ambiente DO CLIENTE. Para o aluno é o mesmo `ctx.alunoId`
  // (a RLS não devolveria ficha de outro ambiente); a igualdade fica explícita
  // porque é ela que a policy do bucket confere depois.
  if (ficha.alunoId !== ctx.alunoId) {
    return { ok: false, erro: "Cliente não encontrado." };
  }

  const path = `${ficha.alunoId}/${randomUUID()}.${EXTENSAO_POR_MIME[input.mime]}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    logErro(
      "criarUploadAssinadoContratoCliente",
      error ?? "createSignedUploadUrl sem token",
      { clienteId: input.clienteId },
    );
    return {
      ok: false,
      erro: "Não foi possível preparar o envio do arquivo. Recarregue a página e tente de novo.",
    };
  }

  return { ok: true, path, token: data.token, nome };
}

/**
 * Grava o contrato na ficha DEPOIS de o arquivo subir. Quem confere que o
 * objeto existe e qual é o MIME/tamanho REAL é a RPC, lendo
 * `storage.objects.metadata` — o que chega daqui é declaração, nunca fonte.
 *
 * Anexar de novo SUBSTITUI. ⚠️ O byte antigo fica no bucket até o expurgo do
 * admin (a policy de delete de `storage.objects` é só de admin e o GPS não usa
 * `service_role`): a tela precisa dizer isso — fingir que o arquivo sumiu
 * seria mentira.
 */
export async function registrarContratoCliente(input: {
  clienteId: string;
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
}): Promise<{ erro?: string }> {
  if (!ANEXO_PATH_REGEX.test(input.path ?? "")) {
    return { erro: "Não foi possível anexar o arquivo. Tente enviar de novo." };
  }
  if (!ehAnexoMime(input.mime)) {
    return { erro: "Formato não aceito. Envie PNG, JPG, WEBP ou PDF." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > ANEXO_TAMANHO_MAXIMO
  ) {
    return { erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeArquivoSeguro(input.nome);
  if (!nome) return { erro: "Nome de arquivo inválido." };

  const ficha = await fichaDoCliente(input.clienteId);
  if (!ficha.ok) return { erro: ficha.erro };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("cliente_definir_contrato", {
      p_cliente_id: input.clienteId,
      p_path: input.path,
      p_nome: nome,
      p_mime: input.mime,
      p_tamanho: input.tamanho,
    });

  if (error) {
    return {
      erro: traduzirErroBanco("registrarContratoCliente", error, {
        clienteId: input.clienteId,
      }),
    };
  }

  revalidar(ficha.alunoId);
  return {};
}

/**
 * Tira o contrato da FICHA. O ARQUIVO continua no bucket até o expurgo do
 * admin — a mesma verdade do anexo do questionário.
 *
 * Dono do ambiente OU admin (quem decide é a RPC). A trava do favorito NÃO
 * bloqueia: contrato é ficha, não vínculo.
 */
export async function removerContratoCliente(
  clienteId: string,
): Promise<{ erro?: string }> {
  const ficha = await fichaDoCliente(clienteId);
  if (!ficha.ok) return { erro: ficha.erro };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("cliente_remover_contrato", { p_cliente_id: clienteId });

  if (error) {
    return {
      erro: traduzirErroBanco("removerContratoCliente", error, { clienteId }),
    };
  }

  revalidar(ficha.alunoId);
  return {};
}

/**
 * URL assinada de LEITURA, emitida NO CLIQUE e válida por 60 segundos.
 *
 * 🔴 `download` SEMPRE. O MIME de um objeto de storage vem do que o cliente
 * declarou no PUT, não de inspeção de bytes: servir inline é o que
 * transformaria um "PNG" em HTML executando no domínio do Supabase. Molde de
 * `src/app/onboarding/anexo-actions.ts`.
 *
 * Não assinar durante o render também é regra: a URL vive 60 segundos
 * (nasceria morta numa tela aberta há mais tempo) e imprimiria um PORTADOR no
 * HTML de toda ficha, inclusive as que ninguém vai abrir.
 *
 * Quem autoriza é a policy `gps_onboarding_anexo_select`, com a sessão de quem
 * pede: admin ou membro do ambiente que é PREFIXO do caminho.
 */
export async function urlDeDownloadDoContratoCliente(
  clienteId: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const ficha = await fichaDoCliente(clienteId);
  if (!ficha.ok) return { ok: false, erro: ficha.erro };
  if (!ficha.contratoPath) {
    return { ok: false, erro: "Este cliente não tem contrato anexado." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(ficha.contratoPath, 60, {
      download: ficha.contratoNome ?? "contrato",
    });

  if (error || !data?.signedUrl) {
    // Uma frase só para todos os casos (não existe / não é seu / bucket fora
    // do ar): o motivo real fica no log do servidor. Este arquivo é documento
    // de um TERCEIRO.
    logErro(
      "urlDeDownloadDoContratoCliente",
      error ?? "createSignedUrl sem url",
      { clienteId },
    );
    return {
      ok: false,
      erro: "Não foi possível abrir este arquivo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url: data.signedUrl };
}
