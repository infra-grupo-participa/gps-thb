"use server";

/**
 * Evolução da Agenda de Sessões — Server Actions do CARD DA DOUTORA
 * (FATIA F). PRD: `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md`
 * (§3 fatia F · §4 P3/P4).
 *
 * 🔴 MÓDULO `"use server"` SÓ EXPORTA `async function` — `export type`,
 * `export interface`, `export const` passam no `tsc` e no `next build`, e
 * quebram em RUNTIME (já derrubou `/admin` e `/admin/videos`). Nenhum tipo
 * é exportado deste arquivo; os retornos são inline.
 *
 * 🔴 `src/app/admin/sessoes/actions.ts` NÃO é tocado (fatia F do PRD) — a
 * action nova vive aqui, em arquivo próprio.
 *
 * Contrato de banco usado aqui (aplicado, medido pelo Marcio em 23/09):
 *   `gps.sessao_concluir(uuid, text default null)`
 *   `gps.sessao_resumo_editar(uuid, text)`
 *   `gps.sessao_link_definir(uuid, text)` / `gps.sessao_link_remover(uuid)`
 *     — fatia D, em paralelo. Se ainda não aplicadas quando isto rodar, a
 *     RPC devolve erro de função inexistente e a action traduz para a
 *     mensagem genérica (ver `frasesDasTravas`); não verificado neste turno.
 *
 * 🔴 O aluno NÃO conclui e NÃO edita resumo — o banco já recusa com 42501
 * (guarda "admin ou a responsável da sessão"), mas a guarda de FORMA aqui
 * evita a ida ao banco por quem nem é equipe. Quem barra de verdade é a RPC.
 */

import { revalidatePath } from "next/cache";

import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { MSG_SESSAO_INDETERMINADA, traduzirErroBanco } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

/**
 * Frases das travas de `sessao_concluir` / `sessao_resumo_editar` /
 * `sessao_link_definir` / `sessao_link_remover`, repassadas sem reescrita
 * (mesmo padrão de `src/app/admin/sessoes/actions.ts` e
 * `src/app/sessoes/actions.ts`).
 */
function frasesDasTravas(): Record<string, string> {
  return {
    "Sessão não encontrada.": "Sessão não encontrada.",
    "Esta sessão não está marcada — não há o que concluir.":
      "Esta sessão não está marcada — não há o que concluir.",
    "Esta sessão ainda não começou. A conclusão só pode ser registrada depois do horário.":
      "Esta sessão ainda não começou. A conclusão só pode ser registrada depois do horário.",
    "O resumo precisa de ao menos 10 caracteres. Se preferir escrever depois, conclua sem resumo e registre em seguida.":
      "O resumo precisa de ao menos 10 caracteres. Se preferir escrever depois, conclua sem resumo e registre em seguida.",
    "O resumo passa de 4000 caracteres.": "O resumo passa de 4000 caracteres.",
    "O resumo só existe em sessão concluída. Conclua a sessão primeiro.":
      "O resumo só existe em sessão concluída. Conclua a sessão primeiro.",
    "Escreva o resumo (ao menos 10 caracteres). Para corrigir, reescreva o texto — o resumo não pode ser apagado.":
      "Escreva o resumo (ao menos 10 caracteres). Para corrigir, reescreva o texto — o resumo não pode ser apagado.",
    "O resumo precisa de ao menos 10 caracteres.":
      "O resumo precisa de ao menos 10 caracteres.",
    "Esta sessão não está marcada — não há sala para definir.":
      "Esta sessão não está marcada — não há sala para definir.",
    "A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.":
      "A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.",
    "Cole o link da sala.": "Cole o link da sala.",
    "O link não pode conter quebra de linha. Cole a URL numa linha só.":
      "O link não pode conter quebra de linha. Cole a URL numa linha só.",
    "O link passa de 500 caracteres.": "O link passa de 500 caracteres.",
    "O link precisa começar com https://": "O link precisa começar com https://",
    "Esta sessão não tem link para remover.":
      "Esta sessão não tem link para remover.",
  };
}

async function guardaDeEquipe(): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx || ctx.papel !== "admin") {
      return { ok: false, erro: "Sem permissão para esta ação." };
    }
    return { ok: true };
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }
}

/**
 * Conclui a sessão (agendado → realizado), com resumo OPCIONAL no mesmo
 * clique. `resumo` vazio ou só espaço vira `null` — a RPC já normaliza, mas
 * evitamos mandar string vazia para não depender só do `nullif` do banco.
 */
export async function concluirSessao(input: {
  agendamentoId: string;
  resumo?: string | null;
}): Promise<
  | {
      ok: true;
      resultado: { estado: "realizado"; comResumo: boolean; resumoCaracteres: number };
    }
  | { ok: false; erro: string }
> {
  const guarda = await guardaDeEquipe();
  if (!guarda.ok) return guarda;

  const resumo = (input.resumo ?? "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("sessao_concluir", {
    p_agendamento_id: input.agendamentoId,
    p_resumo: resumo === "" ? null : resumo,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "concluirSessao",
        error,
        { rpc: "gps.sessao_concluir", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  const r = data as { com_resumo: boolean; resumo_caracteres: number };
  revalidatePath("/admin/sessoes");
  return {
    ok: true,
    resultado: {
      estado: "realizado",
      comResumo: r.com_resumo,
      resumoCaracteres: r.resumo_caracteres,
    },
  };
}

/**
 * Grava ou corrige o resumo de uma sessão JÁ concluída — aceita a primeira
 * escrita também (par de `concluirSessao` sem resumo).
 *
 * 🔴 Texto vazio é RECUSADO pela RPC, nunca apaga (§4 P4 do PRD: assimétrica
 * — mostrar depois é barato, esconder de novo não se desfaz. Aqui o espelho
 * é "apagar não existe": o caminho para corrigir é reescrever).
 */
export async function editarResumoDaSessao(input: {
  agendamentoId: string;
  resumo: string;
}): Promise<
  | { ok: true; resultado: { resumoCaracteres: number; primeiraEscrita: boolean } }
  | { ok: false; erro: string }
> {
  const guarda = await guardaDeEquipe();
  if (!guarda.ok) return guarda;

  const resumo = input.resumo.trim();
  if (resumo.length < 10 || resumo.length > 4000) {
    return {
      ok: false,
      erro: "O resumo precisa ter entre 10 e 4000 caracteres.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_resumo_editar", {
      p_agendamento_id: input.agendamentoId,
      p_resumo: resumo,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "editarResumoDaSessao",
        error,
        { rpc: "gps.sessao_resumo_editar", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  const r = data as { resumo_caracteres: number; primeira_escrita: boolean };
  revalidatePath("/admin/sessoes");
  return {
    ok: true,
    resultado: {
      resumoCaracteres: r.resumo_caracteres,
      primeiraEscrita: r.primeira_escrita,
    },
  };
}

/**
 * Define o link da sala — lado da equipe. `gps.sessao_link_definir` também
 * aceita o aluno (fatia E cuida da tela dele); aqui a guarda de FORMA é
 * "admin", porque esta action só é chamada de `/admin/sessoes`.
 *
 * 🔴 A PRECEDÊNCIA (equipe vence parceiro) é decidida NO BANCO — esta action
 * não replica a regra, só repassa o resultado.
 */
export async function definirLinkDaSessao(input: {
  agendamentoId: string;
  link: string;
}): Promise<
  | { ok: true; resultado: { alterado: boolean; dominio: string | null } }
  | { ok: false; erro: string }
> {
  const guarda = await guardaDeEquipe();
  if (!guarda.ok) return guarda;

  const link = input.link.trim();
  if (link === "") {
    return { ok: false, erro: "Cole o link da sala." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_link_definir", {
      p_agendamento_id: input.agendamentoId,
      p_link: link,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "definirLinkDaSessao",
        error,
        { rpc: "gps.sessao_link_definir", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  const r = data as { alterado: boolean; dominio?: string | null };
  revalidatePath("/admin/sessoes");
  return { ok: true, resultado: { alterado: r.alterado, dominio: r.dominio ?? null } };
}

/** Remove o link da sala — mesma guarda e mesma precedência de definir. */
export async function removerLinkDaSessao(input: {
  agendamentoId: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const guarda = await guardaDeEquipe();
  if (!guarda.ok) return guarda;

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("sessao_link_remover", {
    p_agendamento_id: input.agendamentoId,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "removerLinkDaSessao",
        error,
        { rpc: "gps.sessao_link_remover", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  revalidatePath("/admin/sessoes");
  return { ok: true };
}

/**
 * Lê o TEXTO do resumo já gravado — para o formulário de edição abrir com ele.
 *
 * 🔴 EXISTE PARA CORRIGIR PERDA DE DADO (achado ALTO do pentest, 22/09/2026).
 * `gps.sessao_resumo_ler` foi criada justamente porque o texto está fora do
 * grant de coluna (P4/LGPD) e a doutora não conseguia relê-lo — mas NENHUMA
 * linha de TypeScript a chamava. O form abria vazio, e `sessao_resumo_editar`
 * recusa texto vazio e **sobrescreve**: quem clicasse em "editar" numa sessão
 * que já tinha resumo apagava o anterior sem nunca tê-lo visto.
 *
 * E o texto antigo era IRRECUPERÁVEL: a trilha guarda só o tamanho
 * (`resumo_caracteres_antes/_depois`), nunca o conteúdo — decisão de LGPD da
 * `…295`, correta, que tem como efeito não haver cópia de segurança.
 *
 * ⚠️ O aluno NÃO alcança isto: a RPC recusa com 42501 (guarda de admin ou da
 * doutora dona). Ele vê `resumo_em` — que houve resumo —, nunca o texto.
 */
export async function lerResumoDaSessao(input: {
  agendamentoId: string;
}): Promise<
  { ok: true; resumo: string | null } | { ok: false; erro: string }
> {
  const guarda = await guardaDeEquipe();
  if (!guarda.ok) return guarda;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_resumo_ler", { p_agendamento_id: input.agendamentoId });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "lerResumoDaSessao",
        error,
        { rpc: "gps.sessao_resumo_ler", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  const r = (data ?? {}) as { resumo?: string | null };
  return { ok: true, resumo: r.resumo ?? null };
}
