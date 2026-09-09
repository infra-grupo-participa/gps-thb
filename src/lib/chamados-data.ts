import "server-only";

/**
 * Chamados (suporte do portal) — LEITURAS. Escrita nenhuma acontece aqui:
 * `src/app/chamados/actions.ts` (aluno) e `src/app/admin/chamados/actions.ts`
 * (equipe) são as únicas portas de escrita, e elas passam por RPC
 * `SECURITY DEFINER` — as tabelas têm `grant select` e mais nada.
 *
 * 🔑 A FRONTEIRA É A RLS, NÃO ESTE ARQUIVO. `gps.chamados` e
 * `gps.chamado_mensagens` só deixam ver o que é do ambiente do usuário
 * (`gps.aluno_atual()`) ou tudo, se `public.gp_is_admin()`. As guardas `ehAdmin()`
 * daqui são defesa em profundidade e servem para a falha ser barulhenta.
 *
 * Colunas listadas uma a uma (zero `select('*')`), todo `.from()` com filtro e
 * limite — mesmo padrão de `plantao-data.ts`.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import {
  ANEXO_PATH_REGEX,
  BUCKET_CHAMADOS,
  type AnexoParaExpurgo,
  type Chamado,
  type ChamadoMensagem,
  type ChamadoMensagemComAutor,
  type ChamadoNaFila,
} from "@/lib/chamados-tipos";

const COLUNAS_CHAMADO =
  "id, aluno_id, aberto_por, assunto, status, criado_em, ultima_mensagem_em, fechado_em, fechado_por";

const COLUNAS_MENSAGEM =
  "id, chamado_id, autor_id, autor_papel, criado_em, texto, anexo_path, anexo_nome, anexo_mime, anexo_tamanho, anexo_expurgado_em";

/**
 * Tetos de leitura. Não truncam nada em silêncio na prática: o banco limita a 5
 * chamados não-fechados por ambiente e 20 mensagens por chamado, então só o
 * HISTÓRICO (fechados) pode crescer. 200 chamados por ambiente é ~40 anos de
 * suporte no ritmo atual; a fila do admin com 500 abertos já seria um incidente
 * operacional, não uma tela.
 */
const LIMITE_CHAMADOS_AMBIENTE = 200;
const LIMITE_FILA = 500;
const LIMITE_MENSAGENS = 50;

/** Vida de uma URL assinada de anexo, em segundos. Curta de propósito: o link
 * é um portador (quem tiver a URL entra), então ele tem de morrer rápido. */
const SEGUNDOS_URL_ASSINADA = 60;

/**
 * Chamados de um ambiente, mais recente primeiro.
 *
 * Serve as duas telas: `/chamados` (aluno, com o próprio `alunoId`) e
 * `/admin/aluno/[alunoId]/chamados` (equipe assistindo). O filtro por
 * `aluno_id` é redundante para o aluno (a RLS já corta) e necessário para o
 * admin — que vê tudo.
 * Servido por `idx_chamados_ambiente (aluno_id, ultima_mensagem_em desc)`.
 */
export async function getChamadosDoAmbiente(
  alunoId: string,
): Promise<Chamado[]> {
  if (!alunoId) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("gps")
    .from("chamados")
    .select(COLUNAS_CHAMADO)
    .eq("aluno_id", alunoId)
    .order("ultima_mensagem_em", { ascending: false })
    .limit(LIMITE_CHAMADOS_AMBIENTE);

  if (error) {
    logErro("getChamadosDoAmbiente", error, { alunoId });
    return [];
  }
  return (data ?? []) as Chamado[];
}

/**
 * Um chamado com a thread inteira, ou `null` quando não existe **ou** quando o
 * usuário não pode vê-lo — a RLS não distingue os dois, e a tela não deve
 * distinguir também (senão vira oráculo de existência de chamado alheio).
 */
export async function getChamado(chamadoId: string): Promise<{
  chamado: Chamado;
  mensagens: ChamadoMensagemComAutor[];
} | null> {
  if (!chamadoId) return null;
  const supabase = await createClient();

  const { data: chamado, error } = await supabase
    .schema("gps")
    .from("chamados")
    .select(COLUNAS_CHAMADO)
    .eq("id", chamadoId)
    .maybeSingle();

  if (error || !chamado) return null;

  const { data: mensagens } = await supabase
    .schema("gps")
    .from("chamado_mensagens")
    .select(COLUNAS_MENSAGEM)
    .eq("chamado_id", chamadoId)
    .order("criado_em", { ascending: true })
    .limit(LIMITE_MENSAGENS);

  return {
    chamado: chamado as Chamado,
    mensagens: await comNomesDeAutor(
      supabase,
      (mensagens ?? []) as ChamadoMensagem[],
    ),
  };
}

/**
 * Nome de quem escreveu, em UMA query no total — nunca `await` dentro de `map`.
 *
 * 🔑 Mensagem da EQUIPE não resolve nome nenhum: o rótulo é sempre "Equipe".
 * O aluno não precisa saber qual pessoa do time respondeu, `public.perfis` é a
 * tabela da equipe (não do aluno) e uma consulta a menos é uma consulta a
 * menos. Para o autor 'aluno', o nome sai de `gps.membros` → `thb_alunos`; se a
 * RLS não deixar (ou a conta já tiver sido excluída), fica `null` e a UI diz
 * "Você"/"Aluno" — nunca quebra a linha.
 */
async function comNomesDeAutor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mensagens: ChamadoMensagem[],
): Promise<ChamadoMensagemComAutor[]> {
  const idsAlunos = [
    ...new Set(
      mensagens
        .filter((m) => m.autor_papel === "aluno")
        .map((m) => m.autor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const nomePorUser = new Map<string, string | null>();

  if (idsAlunos.length > 0) {
    const { data: membros } = await supabase
      .schema("gps")
      .from("membros")
      .select("user_id, aluno_id")
      .in("user_id", idsAlunos);

    const linhas = (membros ?? []) as { user_id: string; aluno_id: string }[];
    if (linhas.length > 0) {
      const alunoIds = [...new Set(linhas.map((m) => m.aluno_id))];
      const { data: alunos } = await supabase
        .from("thb_alunos")
        .select("id, nome")
        .in("id", alunoIds);
      const nomePorAluno = new Map(
        ((alunos ?? []) as { id: string; nome: string | null }[]).map((a) => [
          a.id,
          a.nome,
        ]),
      );
      for (const m of linhas) {
        nomePorUser.set(m.user_id, nomePorAluno.get(m.aluno_id) ?? null);
      }
    }
  }

  return mensagens.map((m) => ({
    ...m,
    autor_nome:
      m.autor_papel === "equipe"
        ? "Equipe"
        : m.autor_id
          ? (nomePorUser.get(m.autor_id) ?? null)
          : null,
  }));
}

/**
 * Fila de `/admin/chamados`: tudo que não está fechado, o mais parado primeiro
 * (`ultima_mensagem_em` crescente — quem espera há mais tempo aparece no topo).
 * Servido pelo índice PARCIAL `idx_chamados_fila`.
 *
 * O nome do ambiente vem numa segunda query por `in (...)`, nunca num laço:
 * `gps.chamados.aluno_id` não tem FK para `public.thb_alunos` (tabela
 * compartilhada com o sip), então o PostgREST não sabe embutir.
 */
export async function getFilaChamados(): Promise<ChamadoNaFila[]> {
  if (!(await ehAdmin())) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("gps")
    .from("chamados")
    .select(COLUNAS_CHAMADO)
    .neq("status", "fechado")
    .order("ultima_mensagem_em", { ascending: true })
    .limit(LIMITE_FILA);

  if (error) {
    logErro("getFilaChamados", error);
    return [];
  }

  const chamados = (data ?? []) as Chamado[];
  if (chamados.length === 0) return [];

  const alunoIds = [...new Set(chamados.map((c) => c.aluno_id))];
  const { data: alunos } = await supabase
    .from("thb_alunos")
    .select("id, nome, email")
    .in("id", alunoIds);

  const porId = new Map(
    ((alunos ?? []) as { id: string; nome: string | null; email: string | null }[]).map(
      (a) => [a.id, a],
    ),
  );

  return chamados.map((c) => ({
    ...c,
    aluno_nome: porId.get(c.aluno_id)?.nome ?? null,
    aluno_email: porId.get(c.aluno_id)?.email ?? null,
  }));
}

/**
 * Quantos chamados VIVOS (aberto + respondido) cada ambiente tem.
 *
 * 🔑 ANTES DE USAR: se a página já chama `getAtendimentoPorAluno()`
 * (`src/lib/data.ts`), o número já vem de lá — a RPC `gps.admin_painel_atendimento()`
 * passou a devolver `chamados_abertos` na migração `20260909000115`, na MESMA
 * ida ao banco do resumo do Diário. Esta função existe para telas que NÃO
 * carregam aquele resumo; chamar as duas na mesma página é uma consulta a mais
 * pelo mesmo dado.
 *
 * Memoizada por requisição (`cache()` do React, escopo de REQUISIÇÃO — nada
 * atravessa requests, como em `getContextoSessao`).
 */
export const contarChamadosAbertosPorAluno = cache(
  async function contarChamadosAbertosPorAluno(): Promise<Map<string, number>> {
    const vazio = new Map<string, number>();
    if (!(await ehAdmin())) return vazio;
    const supabase = await createClient();

    const { data, error } = await supabase
      .schema("gps")
      .rpc("admin_painel_atendimento");

    if (error) {
      // Falha aqui não pode virar "ninguém tem chamado" em silêncio: a tela
      // ficaria idêntica à de uma fila vazia.
      logErro("contarChamadosAbertosPorAluno", error, {
        rpc: "gps.admin_painel_atendimento",
      });
      return vazio;
    }

    const linhas = (data ?? []) as {
      aluno_id: string;
      chamados_abertos: number | null;
    }[];
    return new Map(
      linhas
        .filter((l) => (l.chamados_abertos ?? 0) > 0)
        .map((l) => [l.aluno_id, l.chamados_abertos ?? 0]),
    );
  },
);

/**
 * Estado do interruptor + para quem a equipe é avisada. Só admin
 * (`gps.config` tem policy `gp_is_admin()`).
 *
 * `emailEquipe` vazio é o estado INICIAL e significa que ninguém recebe aviso
 * de chamado novo — a tela avisa isso em destaque. Falha silenciosa é o modo de
 * falha proibido nesta feature.
 */
export async function getChamadosConfig(): Promise<{
  aberto: boolean;
  emailEquipe: string[];
}> {
  const padrao = { aberto: true, emailEquipe: [] as string[] };
  if (!(await ehAdmin())) return padrao;
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("gps")
    .from("config")
    .select("chave, valor")
    .in("chave", ["chamados_aberto", "chamados_email_equipe"]);

  if (error) {
    logErro("getChamadosConfig", error);
    return padrao;
  }

  const porChave = new Map(
    ((data ?? []) as { chave: string; valor: string }[]).map((l) => [
      l.chave,
      l.valor,
    ]),
  );

  return {
    // Ausente = ABERTO, igual ao banco: o default tem de ser funcionar.
    aberto: (porChave.get("chamados_aberto") ?? "true") !== "false",
    emailEquipe: (porChave.get("chamados_email_equipe") ?? "")
      .split(/[;,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean),
  };
}

/**
 * O interruptor, na visão de quem NÃO é admin (o aluno não lê `gps.config`).
 * Lê pela RPC `SECURITY DEFINER`. Falha de leitura devolve `true` — o mesmo
 * default do banco: um erro de rede não pode fechar o canal de suporte, e quem
 * de fato barra a escrita é a RPC.
 */
export async function getSuporteAberto(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("chamados_abertos");
  if (error) {
    logErro("getSuporteAberto", error, { rpc: "gps.chamados_abertos" });
    return true;
  }
  return data !== false;
}

/** Lista o que a retenção já pode apagar (180 dias) + os órfãos. Só admin. */
export async function getAnexosParaExpurgo(): Promise<AnexoParaExpurgo[]> {
  if (!(await ehAdmin())) return [];
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("gps")
    .rpc("chamados_anexos_para_expurgo");

  if (error) {
    // Propositalmente barulhento no log: lista de expurgo que devolve vazio por
    // erro é indistinguível de "não há nada a expurgar" — a falha silenciosa
    // que esta feature proíbe.
    logErro("getAnexosParaExpurgo", error, {
      rpc: "gps.chamados_anexos_para_expurgo",
    });
    return [];
  }

  return ((data ?? []) as {
    mensagem_id: string | null;
    chamado_id: string | null;
    aluno_id: string | null;
    path: string;
    motivo: "retencao" | "orfao";
    referencia: string;
  }[]).map((l) => ({
    mensagemId: l.mensagem_id,
    chamadoId: l.chamado_id,
    alunoId: l.aluno_id,
    path: l.path,
    motivo: l.motivo,
    referencia: l.referencia,
  }));
}

/**
 * URL assinada (60 s) para baixar um anexo, emitida COM A SESSÃO DO USUÁRIO —
 * nunca `service_role`. Quem não pode ler o objeto não consegue assinar: a
 * policy `gps_chamados_anexo_select` decide, e ela exige que o prefixo do
 * caminho seja o ambiente do próprio aluno (ou que quem pede seja admin).
 *
 * Antes de assinar, confere que o caminho está numa mensagem VISÍVEL para o
 * usuário e ainda não expurgada. Isso impede assinar um órfão (arquivo subido e
 * nunca enviado) e devolver link de arquivo que a thread diz ter sumido.
 *
 * `download=` sempre, mesmo para imagem: PDF renderizado inline abriria no
 * domínio do Supabase, e baixar é a opção que não depende disso.
 */
export async function urlAssinadaDoAnexo(
  path: string,
  nome: string,
): Promise<string | null> {
  if (!path || !ANEXO_PATH_REGEX.test(path)) return null;

  const supabase = await createClient();

  const { data: mensagem } = await supabase
    .schema("gps")
    .from("chamado_mensagens")
    .select("id, anexo_nome, anexo_expurgado_em")
    .eq("anexo_path", path)
    .is("anexo_expurgado_em", null)
    .limit(1)
    .maybeSingle();

  if (!mensagem) return null;

  // O nome do download sai da TABELA, não do parâmetro: o parâmetro vem da
  // tela e a tela renderiza o que veio do banco, mas assinar com o valor
  // gravado corta o caminho de alguém injetar outro nome na chamada.
  const nomeArquivo =
    ((mensagem as { anexo_nome: string | null }).anexo_nome ?? nome) || "anexo";

  const { data, error } = await supabase.storage
    .from(BUCKET_CHAMADOS)
    .createSignedUrl(path, SEGUNDOS_URL_ASSINADA, { download: nomeArquivo });

  if (error || !data?.signedUrl) {
    logErro("urlAssinadaDoAnexo", error, { path });
    return null;
  }
  return data.signedUrl;
}
