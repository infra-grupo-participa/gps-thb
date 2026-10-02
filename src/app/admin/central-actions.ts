"use server";

/**
 * Central de resolução — as ESCRITAS.
 *
 * Arquivo próprio de propósito: `actions.ts` já tem três assuntos e 660 linhas,
 * `senha-actions.ts` tem um (senha/login) e 400. Aqui moram as correções de
 * VÍNCULO (pessoa ⇄ membro, titular, ambiente, contrato financeiro) e de
 * TRILHA (liberação de etapa, reabrir etapa).
 *
 * Padrão de toda action deste repo:
 *   1. `ehAdmin()` como primeira porta. Não é a fronteira — quem decide é o
 *      `public.gp_is_admin()` da RPC, que devolve 42501 sem JWT. A checagem
 *      aqui evita uma viagem ao banco e devolve erro cedo;
 *   2. `traduzirErroBanco(...)` no erro. **Nunca `error.message` cru** na tela;
 *   3. `revalidatePath` explícito das telas afetadas;
 *   4. retorno `{ erro?: string }` ou payload — nunca `throw` para a UI.
 *
 * ⚠️ `atualizarEmailAluno` (alinhar o e-mail do CADASTRO ao do LOGIN) NÃO é
 * reexportada daqui. Reexporte em módulo `"use server"` sai do build com zero
 * exports (o barril `admin/plantao/actions.ts` registra o caso: "The export
 * trocarMentoraSlot was not found"). A Central importa a action direto de
 * `@/app/admin/actions` — é a mesma função, agora com uma tela que a chama.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import { SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import {
  LOTE_ETAPAS_MAX_ALUNOS,
  MOTIVO_MAX,
  MOTIVO_MIN,
  type ItemAlterado,
  type ItemLiberacaoEtapa,
  type ResultadoLoteEtapas,
} from "@/lib/etapas-lote-tipos";
import {
  FAVORITO_LOTE_MAXIMO,
  type EntradaFavoritoLote,
  type ItemFavoritoLote,
  type ResultadoFavoritoLote,
  type ResultadoItemFavoritoLote,
} from "@/lib/favorito-lote-tipos";
import {
  getPreviaConversaoSocio,
  type PreviaConversaoSocio,
} from "@/lib/data/conversao-socio";

/**
 * As telas que mudam quando um vínculo ou a trilha muda.
 *
 * `"/"` com `"layout"` cobre TODAS as páginas do aluno (home, `/etapa/[n]`,
 * `/materiais`, `/clientes`, `/financeiro`, `/pasta`) — é o mesmo alcance que
 * `definirEtapaLiberada` já usa para o interruptor global, e liberação
 * individual muda exatamente as mesmas telas.
 * `/admin/aluno/<id>` com `"layout"` cobre o modo assistência inteiro (incluindo
 * a Central, o Diário e o Financeiro), e `/admin` cobre o painel e a fila.
 */
function revalidar(alunoId?: string | null) {
  if (alunoId) revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
}

type Resultado<T = Record<string, unknown>> = { erro?: string } & Partial<T>;

// ── trilha ────────────────────────────────────────────────────────────────

/**
 * A mesma liberação, para até `LOTE_ETAPAS_MAX_ALUNOS` alunos × N etapas numa
 * chamada só. Atômica: a RPC valida tudo antes de escrever e qualquer erro
 * desfaz o lote inteiro. Pares que já estão no estado pedido são pulados
 * (`semMudanca`) — não geram linha, log nem evento.
 */
export async function definirLiberacaoEtapasEmLote(
  alunoIds: string[],
  itens: ItemLiberacaoEtapa[],
  motivo: string,
): Promise<Resultado<ResultadoLoteEtapas>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  // Server Action é endpoint POST: o formato não é garantido pelo tipo.
  if (!Array.isArray(alunoIds) || !Array.isArray(itens)) {
    return { erro: "Pedido fora do formato." };
  }
  const ids = Array.from(
    new Set(alunoIds.filter((id): id is string => typeof id === "string" && id !== "")),
  );
  if (ids.length === 0) return { erro: "Selecione ao menos um aluno." };
  if (ids.length > LOTE_ETAPAS_MAX_ALUNOS) {
    return { erro: `No máximo ${LOTE_ETAPAS_MAX_ALUNOS} alunos por vez.` };
  }
  if (itens.length === 0 || itens.some((i) => !i || typeof i !== "object")) {
    return { erro: "Escolha ao menos uma etapa." };
  }
  const texto = (typeof motivo === "string" ? motivo : "").trim();
  if (texto.length < MOTIVO_MIN) {
    return { erro: "Escreva o motivo — ele fica no histórico deste aluno." };
  }
  if (texto.length > MOTIVO_MAX) {
    return { erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_definir_liberacao_etapas_lote", {
      p_alunos: ids,
      p_itens: itens.map((i) => ({ etapa: i.etapa, liberada: i.liberada })),
      p_motivo: texto,
    });
  if (error) {
    const traduzida = traduzirErroBanco(
      "central/definirLiberacaoEtapasEmLote",
      error,
      { alunos: ids.length, itens: itens.length },
    );
    // Frase com contagem ("Sem ambiente no programa: 2 de 10 …") não casa por
    // igualdade em FRASES_DO_BANCO; o prefixo é fixo e escrito por nós.
    const bruto = (error.message ?? "").trim();
    return {
      erro: bruto.startsWith("Sem ambiente no programa:") ? bruto : traduzida,
    };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const alterados = Array.isArray(d.itens) ? (d.itens as ItemAlterado[]) : [];
  // Revalida só quem mudou: com 0 alterados nada do que o aluno vê mudou.
  for (const alunoId of new Set(alterados.map((i) => i.aluno_id))) {
    revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  }
  revalidatePath("/admin", "layout");
  if (alterados.length > 0) revalidatePath("/", "layout");

  return {
    alterados: Number(d.alterados ?? 0),
    semMudanca: Number(d.sem_mudanca ?? 0),
    itens: alterados,
  };
}

const RESULTADOS_FAVORITO_LOTE: readonly ResultadoItemFavoritoLote[] = [
  "removido",
  "sem_favorito",
  "pulado",
];

/**
 * Tira a estrela (cliente favorito) de até `FAVORITO_LOTE_MAXIMO` alunos.
 * Atômica: a RPC valida tudo antes de escrever. Favorito que já andou
 * (confirmado, contrato, sessão, EP, proposta) é PULADO, salvo `forcar` —
 * aí sai como removido e `motivos` diz o que ficou preso ao cliente antigo.
 * `simular` devolve o mesmo resultado sem escrever nada.
 */
export async function removerFavoritoEmLote(
  entrada: EntradaFavoritoLote,
): Promise<{ ok: true; resultado: ResultadoFavoritoLote } | { ok: false; erro: string }> {
  if (!(await ehAdmin())) return { ok: false, erro: SEM_PERMISSAO };
  // Server Action é endpoint POST: o formato não é garantido pelo tipo.
  if (!entrada || typeof entrada !== "object" || !Array.isArray(entrada.alunoIds)) {
    return { ok: false, erro: "Pedido fora do formato." };
  }
  // Recusa o pedido inteiro com id fora do formato (pentest 02/10, BAIXO):
  // sem isto, um id malformado virava erro genérico de tipo no banco.
  const UUID_ALUNO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (entrada.alunoIds.some((id) => typeof id !== "string" || !UUID_ALUNO.test(id))) {
    return { ok: false, erro: "Pedido fora do formato." };
  }
  const ids = Array.from(new Set(entrada.alunoIds as string[]));
  if (ids.length === 0) return { ok: false, erro: "Selecione ao menos um aluno." };
  if (ids.length > FAVORITO_LOTE_MAXIMO) {
    return { ok: false, erro: `No máximo ${FAVORITO_LOTE_MAXIMO} alunos por vez.` };
  }
  const texto = (typeof entrada.motivo === "string" ? entrada.motivo : "").trim();
  if (texto.length < MOTIVO_MIN) {
    return { ok: false, erro: "Escreva o motivo — ele fica no histórico deste aluno." };
  }
  if (texto.length > MOTIVO_MAX) {
    return { ok: false, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };
  }
  // Só `true` literal liga: valor forjado não vira escrita nem força.
  const simular = entrada.simular === true;
  const forcar = entrada.forcar === true;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_remover_favorito_lote", {
      p_alunos: ids,
      p_motivo: texto,
      p_simular: simular,
      p_forcar: forcar,
    });
  if (error) {
    const traduzida = traduzirErroBanco("central/removerFavoritoEmLote", error, {
      alunos: ids.length,
      simular,
      forcar,
    });
    // Frase com contagem não casa por igualdade em FRASES_DO_BANCO; o prefixo
    // é fixo e escrito por nós (mesmo caso do lote de etapas).
    const bruto = (error.message ?? "").trim();
    return {
      ok: false,
      erro: bruto.startsWith("Sem ambiente no programa:") ? bruto : traduzida,
    };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const brutos = Array.isArray(d.itens) ? (d.itens as Record<string, unknown>[]) : [];
  // Resultado fora do catálogo = contrato quebrado entre banco e tela: falha
  // ruidosa, nunca "pulado" em silêncio (veredito 02/10).
  if (brutos.some((i) => !RESULTADOS_FAVORITO_LOTE.includes(i.resultado as ResultadoItemFavoritoLote))) {
    logErro("removerFavoritoEmLote.contrato", { message: "resultado fora do catálogo" }, { simular });
    return {
      ok: false,
      erro: simular
        ? "Não deu para montar a prévia. Recarregue e tente de novo."
        : "A gravação respondeu fora do esperado. Recarregue a lista e confira as estrelas.",
    };
  }
  const itens: ItemFavoritoLote[] = brutos.map((i) => ({
    alunoId: String(i.aluno_id ?? ""),
    clienteId: typeof i.cliente_id === "string" ? i.cliente_id : null,
    resultado: RESULTADOS_FAVORITO_LOTE.includes(i.resultado as ResultadoItemFavoritoLote)
      ? (i.resultado as ResultadoItemFavoritoLote)
      : "pulado",
    motivos: Array.isArray(i.motivos)
      ? i.motivos.filter((m): m is string => typeof m === "string")
      : [],
  }));

  if (!simular) {
    const removidos = itens.filter((i) => i.resultado === "removido");
    for (const alunoId of new Set(removidos.map((i) => i.alunoId))) {
      revalidatePath(`/admin/aluno/${alunoId}`, "layout");
    }
    revalidatePath("/admin", "layout");
    if (removidos.length > 0) revalidatePath("/", "layout");
  }

  return {
    ok: true,
    resultado: {
      removidos: Number(d.removidos ?? 0),
      semFavorito: Number(d.sem_favorito ?? 0),
      pulados: Number(d.pulados ?? 0),
      itens,
    },
  };
}

/**
 * Reabre todas as tarefas manuais concluídas de UMA etapa. É `update`, nunca
 * `delete`: a trigger de captura do Diário ignora DELETE, então apagar sumiria
 * com o progresso sem deixar uma linha na trilha.
 */
export async function reabrirEtapa(
  alunoId: string,
  etapa: number,
  motivo: string,
): Promise<Resultado<{ reabertas: number }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!alunoId || !Number.isInteger(etapa)) {
    return { erro: "Aluno ou etapa não informado." };
  }
  const texto = motivo.trim();
  if (texto.length < MOTIVO_MIN) {
    return { erro: "Escreva o motivo — a trilha deste aluno vai registrar." };
  }
  if (texto.length > MOTIVO_MAX) return { erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_reabrir_etapa", {
      p_aluno_id: alunoId,
      p_etapa: etapa,
      p_motivo: texto,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/reabrirEtapa", error, { alunoId, etapa }),
    };
  }

  revalidar(alunoId);
  const d = (data ?? {}) as Record<string, unknown>;
  return { reabertas: Number(d.reabertas ?? 0) };
}

// ── vínculo de pessoa e de ambiente ───────────────────────────────────────

/**
 * Liga um membro ao cadastro da PESSOA em `public.thb_alunos`.
 * `pessoaAlunoId = null` desvincula (só sócio — o titular sem cadastro deixaria
 * o ambiente sem dono).
 *
 * `alunoId` entra só para o `revalidatePath`: quem decide o que pode é a RPC,
 * pelo `membroId`.
 */
export async function vincularPessoaMembro(
  membroId: string,
  pessoaAlunoId: string | null,
  alunoId?: string,
): Promise<Resultado<{ nome: string | null; email: string | null }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!membroId) return { erro: "Membro não informado." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_vincular_pessoa_membro", {
      p_membro_id: membroId,
      p_pessoa_aluno_id: pessoaAlunoId,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/vincularPessoaMembro", error, {
        membroId,
      }),
    };
  }

  revalidar(alunoId);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    nome: (d.nome as string) ?? null,
    email: (d.email as string) ?? null,
  };
}

/**
 * Promove um sócio a titular e rebaixa o titular atual, na mesma transação.
 *
 * 🔴 A tela TEM de escrever a consequência antes de confirmar: o Financeiro do
 * ambiente é liberado pelo PAPEL (`gps.financeiro_pode_ler`), então o novo
 * titular passa a ver o contrato — que é o do titular anterior — e o anterior
 * deixa de ver. A Etapa 01, os clientes e o Diário continuam os mesmos. O
 * retorno traz `financeiroPassaAVer` para a copy não divergir da regra.
 */
export async function trocarTitular(
  alunoId: string,
  novoTitularMembroId: string,
): Promise<
  Resultado<{
    emailAnterior: string | null;
    emailAtual: string | null;
    financeiroPassaAVer: boolean;
  }>
> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!alunoId || !novoTitularMembroId) {
    return { erro: "Ambiente ou membro não informado." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_trocar_titular", {
      p_aluno_id: alunoId,
      p_novo_titular_membro_id: novoTitularMembroId,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/trocarTitular", error, { alunoId }),
    };
  }

  revalidar(alunoId);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    emailAnterior: (d.email_anterior as string) ?? null,
    emailAtual: (d.email_atual as string) ?? null,
    financeiroPassaAVer: Boolean(d.financeiro_passa_a_ver),
  };
}

/**
 * Move um SÓCIO para outro ambiente.
 *
 * 🔑 A tela precisa dizer: o que ele registrou (cliente, progresso, nota,
 * chamado) é do AMBIENTE e FICA no de origem. Revalida os dois lados.
 */
export async function moverMembro(
  membroId: string,
  novoAlunoId: string,
  alunoIdOrigem?: string,
): Promise<Resultado<{ de: string | null; para: string | null }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!membroId || !novoAlunoId) {
    return { erro: "Membro ou ambiente de destino não informado." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_mover_membro", {
      p_membro_id: membroId,
      p_novo_aluno_id: novoAlunoId,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/moverMembro", error, { membroId }),
    };
  }

  revalidar(alunoIdOrigem);
  revalidatePath(`/admin/aluno/${novoAlunoId}`, "layout");
  const d = (data ?? {}) as Record<string, unknown>;
  return { de: (d.de as string) ?? null, para: (d.para as string) ?? null };
}

// ── converter titular de ambiente próprio em sócio de outro ───────────────

/**
 * A PRÉVIA da conversão — leitura, zero escrita.
 *
 * Existe como Server Action (e não como leitura da página) porque o alvo só é
 * conhecido DEPOIS de o admin escolher o cadastro no seletor: a página do
 * Resolver não tem como saber, no servidor, qual titular ele vai procurar.
 * Buscar aqui é UMA ida ao banco por escolha, não por render.
 *
 * ⚠️ Módulo `"use server"` só exporta função async — `PreviaConversaoSocio`
 * **não é reexportada daqui**. O tipo mora em `@/lib/data/conversao-socio` e a
 * tela importa de lá com `import type`. (O caso está registrado em
 * `admin/plantao/actions.ts`: reexporte em módulo de servidor tira o export do
 * build.)
 */
export async function previaConversaoSocio(
  membroId: string,
  ambienteDestinoId: string,
): Promise<{ erro?: string; previa?: PreviaConversaoSocio }> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  return getPreviaConversaoSocio(membroId, ambienteDestinoId);
}

/**
 * Converte um TITULAR de ambiente próprio em SÓCIO de outro ambiente,
 * **levando o trabalho junto**.
 *
 * 🔴 A tela TEM de escrever três coisas antes de confirmar, e as três vêm do
 * servidor (nunca calculadas no cliente):
 *   1. quantos clientes são COPIADOS e quantos já existem no destino;
 *   2. que progresso, nota e chamado **ficam para trás** (decisão do projeto:
 *      progresso se refaz clicando; nota e chamado são atendimento passado);
 *   3. que a CÓPIA NÃO SE DESFAZ SOZINHA — o retrato na lixeira devolve o
 *      ambiente antigo, mas as linhas copiadas no destino ficam com id novo.
 *
 * `p_confirmar` é o **nome do ambiente de origem**, digitado pelo admin
 * (confirmação nomeada, como no "digite EXCLUIR"). A comparação de verdade é a
 * da RPC; a tela só evita a ida ao banco do caso óbvio.
 *
 * Revalida os DOIS lados: a origem some como ambiente próprio e o destino
 * ganha clientes. Sem a segunda linha, a Central do destino continuaria
 * mostrando o número velho de clientes.
 */
export async function converterTitularEmSocio(
  membroId: string,
  ambienteDestinoId: string,
  confirmar: string,
  alunoIdOrigem?: string,
): Promise<
  Resultado<{
    clientesCopiados: number;
    clientesJaExistiam: number;
    origemNome: string | null;
    destinoNome: string | null;
  }>
> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!membroId || !ambienteDestinoId) {
    return { erro: "Membro ou ambiente de destino não informado." };
  }
  const texto = confirmar.trim();
  if (!texto) {
    return {
      erro: "Digite o nome do ambiente de origem para confirmar a conversão.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_converter_titular_em_socio", {
      p_membro_id: membroId,
      p_ambiente_destino: ambienteDestinoId,
      p_confirmar: texto,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/converterTitularEmSocio", error, {
        membroId,
        ambienteDestinoId,
      }),
    };
  }

  revalidar(alunoIdOrigem);
  revalidatePath(`/admin/aluno/${ambienteDestinoId}`, "layout");
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    clientesCopiados: Number(d.clientes_copiados ?? 0),
    clientesJaExistiam: Number(d.clientes_ja_existiam ?? 0),
    origemNome: (d.origem_nome as string) ?? null,
    destinoNome: (d.destino_nome as string) ?? null,
  };
}

// ── financeiro (escreve em cs.contatos_hm, do sip) ────────────────────────

/**
 * Vincula um contrato ÓRFÃO de `cs.contatos_hm` ao ambiente.
 *
 * O id vem da lista de candidatos do próprio diagnóstico — a RPC reconfere o
 * casamento (e-mail ou CPF/CNPJ) com a MESMA função que produziu a lista, e o
 * `and aluno_id is null` vive dentro do `update`, então uma corrida entre dois
 * admins vira erro, nunca contrato roubado.
 */
export async function vincularFinanceiro(
  alunoId: string,
  contatoHmId: string,
): Promise<Resultado> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!alunoId || !contatoHmId.trim()) {
    return { erro: "Contrato não informado." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("admin_financeiro_vincular", {
      p_aluno_id: alunoId,
      p_contato_hm_id: contatoHmId.trim(),
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/vincularFinanceiro", error, { alunoId }),
    };
  }

  revalidar(alunoId);
  return {};
}

/**
 * Desfaz o vínculo de um contrato com ESTE ambiente.
 *
 * `vinculadoPeloPortal = false` significa que o vínculo veio do sip — a tela
 * deve dizer isso antes de confirmar: desfazer o trabalho de outro sistema é
 * decisão, não clique. O log registra a origem de qualquer forma.
 */
export async function desvincularFinanceiro(
  alunoId: string,
  contatoHmId: string,
): Promise<Resultado<{ vinculadoPeloPortal: boolean }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!alunoId || !contatoHmId.trim()) {
    return { erro: "Contrato não informado." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_financeiro_desvincular", {
      p_aluno_id: alunoId,
      p_contato_hm_id: contatoHmId.trim(),
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/desvincularFinanceiro", error, {
        alunoId,
      }),
    };
  }

  revalidar(alunoId);
  const d = (data ?? {}) as Record<string, unknown>;
  return { vinculadoPeloPortal: Boolean(d.vinculado_pelo_portal) };
}

// ── acompanhamento do cliente pela equipe (migração ...203) ────────────────

/**
 * A EQUIPE assume o acompanhamento do cliente favoritado. A partir daí o aluno
 * não troca a estrela, não apaga o cliente e não volta a fase para
 * `prospeccao` — quem recusa é a trigger
 * `trg_etapa1_clientes_acompanhamento_travado`, com 42501 e frase própria.
 *
 * 🔑 CASA DE ORIGEM: a ficha do cliente no Modo Assistência — é onde o admin já
 * está olhando o cliente. A Central mostra a linha de diagnóstico com LINK para
 * a ficha: a regra é "nenhuma segunda porta para escrita que já existe".
 *
 * `alunoId` serve para revalidar as rotas certas, nunca como credencial — quem
 * autoriza é o `gp_is_admin()` da RPC.
 */
export async function confirmarAcompanhamento(
  clienteId: string,
  alunoId: string,
  motivo: string,
): Promise<Resultado<{ clienteId: string }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!clienteId) return { erro: "Cliente não informado." };
  const texto = motivo.trim();
  if (texto.length < MOTIVO_MIN) {
    return { erro: "Escreva o motivo — a trilha deste aluno vai registrar." };
  }
  if (texto.length > MOTIVO_MAX) return { erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_confirmar_acompanhamento", {
      p_cliente_id: clienteId,
      p_motivo: texto,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/confirmarAcompanhamento", error, {
        alunoId,
      }),
    };
  }

  revalidar(alunoId);
  revalidatePath("/clientes", "layout");
  const d = (data ?? {}) as Record<string, unknown>;
  return { clienteId: String(d.cliente_id ?? clienteId) };
}

/**
 * Devolve ao ALUNO o direito de trocar o cliente acompanhado.
 *
 * ⚠️ NÃO desmarca a estrela: liberar é devolver a escolha, não desfazê-la —
 * desmarcar aqui travaria os passos 4–8 da Etapa 01 de quem não pediu nada.
 */
export async function liberarAcompanhamento(
  clienteId: string,
  alunoId: string,
  motivo: string,
): Promise<Resultado<{ clienteId: string }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };
  if (!clienteId) return { erro: "Cliente não informado." };
  const texto = motivo.trim();
  if (texto.length < MOTIVO_MIN) {
    return { erro: "Escreva o motivo — a trilha deste aluno vai registrar." };
  }
  if (texto.length > MOTIVO_MAX) return { erro: `O motivo passa de ${MOTIVO_MAX} caracteres.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_liberar_acompanhamento", {
      p_cliente_id: clienteId,
      p_motivo: texto,
    });
  if (error) {
    return {
      erro: traduzirErroBanco("central/liberarAcompanhamento", error, {
        alunoId,
      }),
    };
  }

  revalidar(alunoId);
  revalidatePath("/clientes", "layout");
  const d = (data ?? {}) as Record<string, unknown>;
  return { clienteId: String(d.cliente_id ?? clienteId) };
}

/**
 * Destrava o questionário inicial de um aluno.
 *
 * 🔴 EXISTE PORQUE O ONBOARDING É OBRIGATÓRIO. Desde 10/09/2026 não há
 * "Continuar depois", Esc nem clique fora: um erro de servidor no meio do
 * questionário deixa o aluno SEM ACESSO ao portal, e nenhuma outra ação da
 * Central escreve em `onboarding_respostas` — a saída não existia.
 *
 * 🔑 NÃO cria o cliente 1. `onboarding_concluir` cria porque o ALUNO
 * respondeu; aqui quem age é a equipe, e inventar um cliente com dado que
 * ninguém informou seria pior que a trava. O aluno cadastra depois, pela
 * aba Clientes.
 */
export async function destravarOnboarding(
  alunoId: string,
): Promise<Resultado<{ jaEstava: boolean }>> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_destravar_onboarding", { p_aluno_id: alunoId });

  if (error) {
    return { erro: traduzirErroBanco("central/destravarOnboarding", error) };
  }

  revalidatePath(`/admin/aluno/${alunoId}/resolver`);
  revalidatePath("/", "layout");

  return {
    jaEstava: (data as { ja_estava?: boolean } | null)?.ja_estava === true,
  };
}

/**
 * Marca (ou desmarca) o parceiro como FINALIZADO.
 *
 * Decisão do Marcio (10/09/2026): *"somente a equipe considera o aluno como
 * finalizado, depende da aprovação prévia da equipe"*.
 *
 * 🔴 Antes a fase virava sozinha ao somar R$ 150 mil em honorários — e era a
 * PRIMEIRA condição do `case`, então passava por cima até da trava dos 30. O
 * Carlos Henrique escancarou isso: 10 clientes, R$ 500 mil digitados, e
 * "Finalizado" na tela sem ninguém ter aprovado nada.
 *
 * Agora `gps.membros.finalizado_em` é o único caminho, e a RPC do painel
 * devolve `pronto_para_finalizar` — o sinal que a equipe olha para decidir.
 */
export async function marcarFinalizado(
  alunoId: string,
  finalizado: boolean,
): Promise<{ erro?: string; nome?: string }> {
  if (!(await ehAdmin())) return { erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_marcar_finalizado", {
      p_aluno_id: alunoId,
      p_finalizado: finalizado,
    });

  if (error) return { erro: traduzirErroBanco("marcarFinalizado", error, { alunoId }) };

  revalidatePath("/admin");
  revalidatePath(`/admin/aluno/${alunoId}`);
  return { nome: (data as { nome?: string } | null)?.nome };
}
