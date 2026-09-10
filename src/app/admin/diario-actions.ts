"use server";

/**
 * Diário do aluno — Server Actions do ADMIN.
 *
 * Visualização e escrita EXCLUSIVAS do admin (LGPD — ver comentário na
 * migração `20260908000001_gps_aluno_notas.sql`). Ambas as actions abrem com
 * `ehAdmin()`: render-time gating não é fronteira de segurança (a proteção
 * real são as policies RLS via `public.gp_is_admin()`), mas a checagem aqui
 * evita uma viagem ao banco à toa e devolve erro cedo.
 *
 * `autor_id`/`resolvido_por` vêm SEMPRE de `ctx.user.id` do servidor —
 * nunca de um campo enviado pelo cliente, que poderia forjar autoria.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao, ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import { notificarMencao } from "@/lib/slack";
import {
  TIPOS_NOTA,
  ORIGENS_NOTA,
  VOZES_NOTA,
  type TipoNota,
  type OrigemNota,
  type VozNota,
} from "@/lib/types";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://programa.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

/** Uma nota não vira disparo em massa. O banco aplica o mesmo teto. */
const MAX_MENCOES = 10;

function revalidar(alunoId: string) {
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  revalidatePath("/admin", "layout");
}

export interface RegistrarNotaInput {
  alunoId: string;
  voz: VozNota;
  tipo: TipoNota;
  origem: OrigemNota;
  texto: string;
  /** Liga a nota a um evento do log (gps.aluno_eventos) — ex.: comentário em cima de "Listou 15 clientes". */
  eventoId?: string;
  /**
   * Ids de `public.perfis` mencionados (@).
   *
   * 🔴 O cliente ESCOLHE destinatário; nunca AUTORIZA. Cada id é revalidado no
   * BANCO (`gps.registrar_mencoes`) contra `ativo` + cargo dev/admin, e o que
   * não passar é descartado — a menção não cria leitor novo para um Diário que
   * é só-admin por LGPD. Teto de 10 aqui e no banco.
   */
  mencoes?: string[];
}

/** Só admin. Devolve id e NOME — **nunca** e-mail (vai parar no payload do cliente). */
export async function listarMencionaveis(): Promise<
  { id: string; nome: string }[]
> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_mencionaveis");

  if (error) {
    logErro("listarMencionaveis", error, {
      rpc: "gps.admin_mencionaveis",
      efeito: "o autocompletar de @ fica vazio; a nota continua funcionando",
    });
    return [];
  }
  return ((data ?? []) as { id: string; nome: string | null }[]).map((p) => ({
    id: p.id,
    nome: p.nome ?? "Sem nome",
  }));
}

export type ResultadoDiarioAcao =
  | { ok: true }
  | { ok: false; erro: string };

/** Registra uma nota nova no diário do aluno. Append-only — sempre INSERT. */
export async function registrarNota(
  input: RegistrarNotaInput,
): Promise<ResultadoDiarioAcao> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") {
    return { ok: false, erro: "Sem permissão." };
  }

  if (!input.alunoId) return { ok: false, erro: "Aluno não informado." };
  if (!VOZES_NOTA.includes(input.voz)) {
    return { ok: false, erro: "Voz inválida." };
  }
  if (!TIPOS_NOTA.includes(input.tipo)) {
    return { ok: false, erro: "Tipo inválido." };
  }
  if (!ORIGENS_NOTA.includes(input.origem)) {
    return { ok: false, erro: "Origem inválida." };
  }
  const texto = input.texto.trim();
  if (texto.length < 1 || texto.length > 8000) {
    return { ok: false, erro: "O texto precisa ter entre 1 e 8000 caracteres." };
  }

  const supabase = await createClient();

  // Confere que o evento pertence ao MESMO aluno_id antes de gravar — sem
  // isso, um `eventoId` forjado no cliente amarraria a nota de um aluno a
  // um evento de outro (o insert abaixo não tem como validar isso sozinho:
  // não há FK entre aluno_notas.evento_id e aluno_notas.aluno_id, só entre
  // evento_id e aluno_eventos.id).
  if (input.eventoId) {
    const { data: evento, error: erroEvento } = await supabase
      .schema("gps")
      .from("aluno_eventos")
      .select("aluno_id")
      .eq("id", input.eventoId)
      .maybeSingle();

    if (erroEvento || !evento) {
      return { ok: false, erro: "Evento não encontrado." };
    }
    if ((evento as { aluno_id: string }).aluno_id !== input.alunoId) {
      return { ok: false, erro: "Evento não pertence a este aluno." };
    }
  }

  // `.select("id")`: sem o id da nota não há como gravar a menção, e um insert
  // que não devolve linha é o mesmo caso de `salvarPerfilAluno` — sucesso
  // aparente sem gravação.
  const { data: nota, error } = await supabase
    .schema("gps")
    .from("aluno_notas")
    .insert({
      aluno_id: input.alunoId,
      autor_id: ctx.user.id,
      voz: input.voz,
      tipo: input.tipo,
      origem: input.origem,
      texto,
      evento_id: input.eventoId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, erro: "Não foi possível salvar a nota." };

  const notaId = (nota as { id?: string } | null)?.id ?? null;

  // 🔑 A NOTA JÁ ESTÁ GRAVADA. Daqui para baixo, nada pode desfazê-la: menção
  // e Slack são subproduto. Qualquer falha vira `logErro` e a action continua
  // devolvendo `ok: true` — a alternativa seria a equipe perder o texto que
  // escreveu porque um webhook caiu.
  const mencoes = [...new Set(input.mencoes ?? [])]
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, MAX_MENCOES);

  if (notaId && mencoes.length > 0) {
    await registrarEAvisar(notaId, input.alunoId, ctx.perfil?.nome ?? null, mencoes, texto);
  }

  revalidar(input.alunoId);
  return { ok: true };
}

/**
 * Grava as menções (revalidadas no banco) e tenta o aviso no Slack.
 * Nunca lança; nunca desfaz a nota.
 */
async function registrarEAvisar(
  notaId: string,
  alunoId: string,
  autorNome: string | null,
  mencoes: string[],
  textoDaNota: string,
): Promise<void> {
  const supabase = await createClient();

  const { data, error } = await supabase.schema("gps").rpc("registrar_mencoes", {
    p_nota_id: notaId,
    p_perfis: mencoes,
  });

  if (error) {
    logErro("registrarNota.mencoes", error, {
      rpc: "gps.registrar_mencoes",
      efeito: "a nota FOI gravada; as mencoes nao",
    });
    return;
  }

  const retorno = data as
    | { quantidade?: number; mencionados?: { perfil_id: string; nome: string }[] }
    | null;
  const quantidade = Number(retorno?.quantidade ?? 0);
  // Zero válidos (todos inativos, gestor, ou id que nem é perfil): não há a
  // quem avisar, e não é erro.
  if (quantidade < 1) return;

  // ── Interruptor `gps.config.slack_mencoes_ativo` ──
  // Lido só AGORA, e não no topo: sem menção válida não se paga a consulta.
  // O admin lê `gps.config` pela policy `gps_config_admin` — nenhuma RPC nova.
  // ⚠️ O SEGREDO (a URL do webhook) NÃO está aqui: mora na env
  // `SLACK_WEBHOOK_MENCOES`, fora do alcance da REST (C-7).
  const { data: cfg } = await supabase
    .schema("gps")
    .from("config")
    .select("valor")
    .eq("chave", "slack_mencoes_ativo")
    .maybeSingle();
  const ativo = (cfg as { valor?: string } | null)?.valor === "true";

  if (!ativo) return;

  // O NOME DO ALUNO e os E-MAILS dos mencionados (só para o Slack achar a
  // conta de cada um; o e-mail não entra na mensagem). Duas consultas, só
  // quando há alguém para avisar e o canal está ligado.
  const ids = (retorno?.mencionados ?? []).map((m) => m.perfil_id);
  const [{ data: aluno }, { data: perfis }] = await Promise.all([
    supabase.from("thb_alunos").select("nome").eq("id", alunoId).maybeSingle(),
    ids.length > 0
      ? supabase.from("perfis").select("id, nome, email").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; nome: string | null; email: string | null }[] }),
  ]);
  const alunoNome = (aluno as { nome?: string | null } | null)?.nome ?? "um aluno";
  const mencionados = ((perfis ?? []) as { id: string; nome: string | null; email: string | null }[]).map(
    (p) => ({ nome: p.nome ?? "membro da equipe", email: p.email }),
  );

  // Decisão do João (10/09): a mensagem leva o trecho da nota (300 caracteres)
  // e o link direto para o Diário do aluno. Ver o cabeçalho de `src/lib/slack.ts`.
  await notificarMencao(
    {
      autor: autorNome ?? "Alguém da equipe",
      aluno: alunoNome,
      url: `${APP_URL}/admin/aluno/${alunoId}/diario`,
      texto: textoDaNota,
      mencionados,
    },
    ativo,
  );
}

/**
 * Dá baixa em uma pendência: grava `resolvido_em`/`resolvido_por` — é a
 * ÚNICA edição que o banco aceita (trigger de append-only). Confere as
 * linhas afetadas via `.select()`: um update que não casa nada volta sem
 * erro (lição de `salvarPerfilAluno`) e a UI mentiria "baixa dada".
 */
export async function darBaixaPendencia(
  notaId: string,
): Promise<ResultadoDiarioAcao> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") {
    return { ok: false, erro: "Sem permissão." };
  }
  if (!notaId) return { ok: false, erro: "Nota não informada." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("aluno_notas")
    .update({ resolvido_em: new Date().toISOString(), resolvido_por: ctx.user.id })
    .eq("id", notaId)
    .eq("tipo", "pendencia")
    .is("resolvido_em", null)
    .select("id, aluno_id");

  if (error) return { ok: false, erro: "Não foi possível dar baixa." };
  if (!data || data.length === 0) {
    // 0 linhas casadas = outro admin já resolveu esta pendência antes (a
    // guarda `.is("resolvido_em", null)` barrou o update). A tela deste
    // admin está desatualizada — revalida para tirar o botão obsoleto de
    // cena, senão só F5 resolve. O update não retornou linha, então busca
    // o `aluno_id` à parte só para saber o que revalidar (caminho raro).
    const { data: nota } = await supabase
      .schema("gps")
      .from("aluno_notas")
      .select("aluno_id")
      .eq("id", notaId)
      .maybeSingle();
    if (nota) revalidar((nota as { aluno_id: string }).aluno_id);

    return {
      ok: false,
      erro: "Pendência não encontrada ou já resolvida — nada foi alterado.",
    };
  }

  revalidar((data[0] as { aluno_id: string }).aluno_id);
  return { ok: true };
}

/**
 * Quem pode apagar nota do diário. A lista vive em
 * `gps.config.notas_podem_apagar` — trocar quem apaga é um update, sem deploy.
 *
 * 🔑 Isto é só para a TELA decidir se mostra o botão. A fronteira real é
 * `gps.admin_apagar_nota`, que confere a mesma lista no servidor: esconder o
 * botão não protege nada, e quem chamar a action direto recebe 42501.
 */
export async function podeApagarNota(): Promise<boolean> {
  if (!(await ehAdmin())) return false;
  const ctx = await getContextoSessao();
  const email = (ctx?.user?.email ?? "").trim().toLowerCase();
  if (!email) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("config")
    .select("valor")
    .eq("chave", "notas_podem_apagar")
    .maybeSingle();

  const lista = ((data as { valor?: string } | null)?.valor ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return lista.includes(email);
}

/**
 * Apaga uma nota do diário.
 *
 * 🔴 É DELETE de verdade, não soft-delete. Nota do Diário pode conter dado
 * pessoal de TERCEIRO (cliente do aluno, situação familiar) — foi por isso
 * que a tabela nasceu só-admin. Marcar como "apagada" e manter a linha não
 * cumpriria o pedido.
 *
 * A nota some; o FATO de ter sido apagada fica, no evento `nota_apagada`.
 */
export async function apagarNota(
  notaId: string,
  alunoId: string,
): Promise<ResultadoDiarioAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("admin_apagar_nota", { p_nota_id: notaId });

  if (error) {
    logErro("admin/apagarNota", error, { notaId });
    return {
      ok: false,
      erro:
        error.code === "42501"
          ? "Só Marcio, Elaine e Isabela podem apagar notas do diário."
          : "Não foi possível apagar a nota.",
    };
  }

  revalidatePath(`/admin/aluno/${alunoId}/diario`);
  revalidatePath("/admin");
  return { ok: true };
}
