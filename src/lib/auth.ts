import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PapelMembro, Papel, Perfil } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
import { SessaoIndeterminadaError } from "@/lib/auth-erros";
import { logErro } from "@/lib/log";

export interface ContextoSessao {
  user: User;
  papel: Papel;
  perfil: Perfil | null;
  /**
   * aluno_id do AMBIENTE (do titular) quando o usuário é um aluno — resolvido
   * por `gps.aluno_atual()`. Sócio e titular compartilham este valor: é o que
   * os dados (clientes, progresso, ambiente) usam para filtrar.
   */
  alunoId: string | null;
  /**
   * aluno_id da PESSOA logada em `thb_alunos` (o "eu" da sessão). Para o
   * titular é igual a `alunoId`; para o sócio é o dele próprio, não o do
   * ambiente. Cabeçalho e "meu perfil" usam este, não `alunoId`.
   */
  membroAlunoId: string | null;
  /**
   * A identidade da pessoa em `public.thb_alunos`, lida de
   * `gps.membros.pessoa_aluno_id` — a MESMA linha que a sessão já carrega.
   * É a chave do onboarding (`gps.pessoa_atual()` no banco).
   *
   * `null` quando o membro ainda não tem cadastro vinculado (a Central resolve
   * com "Vincular pessoa"). Nesse caso o onboarding recusa com frase própria,
   * em vez de escrever a resposta na conta errada.
   */
  pessoaAlunoId: string | null;
  /*
   * ⚠️ NÃO reintroduzir `membroNome` aqui (removido em 10/09/2026, depois de
   * o último consumidor sair). Ele custava um `ilike` em
   * `public.thb_alunos.email` em TODA requisição de sócio só para descobrir um
   * nome — e casar pessoa por e-mail multiplica. Quem precisa do nome busca
   * com `getAlunoById(ctx.membroAlunoId)`, que as páginas já fazem.
   */
  /** Papel da pessoa dentro do ambiente ('titular' | 'socio'). */
  papelMembro: PapelMembro | null;
}

/**
 * Resolve o usuário autenticado e seu papel no GPS.
 * - admin: consta em public.perfis com cargo dev/admin e status ativo.
 * - aluno: consta em gps.membros (vínculo com um thb_aluno).
 * - sem_acesso: autenticado, mas sem vínculo.
 * Retorna null se não houver sessão.
 *
 * 🔑 MEMOIZADO POR REQUISIÇÃO com `cache()` do React (08/09/2026).
 * Antes, cada chamada refazia `auth.getUser()` — ida de rede ao GoTrue,
 * medida em ~57 ms contra sa-east-1 — mais o `select perfis`. Como
 * `ehAdmin()` chama esta função e quase toda leitura de `data.ts` chama
 * `ehAdmin()`, uma única página do Diário disparava 7 `getUser()` + 7
 * `select perfis` (mais 1 `getUser` do proxy = 8 idas ao GoTrue) só para
 * responder a MESMA pergunta. Agora é 1 por requisição.
 *
 * ⚠️ `cache()` do React tem escopo de REQUISIÇÃO, não de processo: nada de
 * sessão atravessa requests. NÃO trocar por `unstable_cache` (cache
 * persistente cross-request) — aqui isso seria vazamento de sessão entre
 * alunos. E NÃO trocar `getUser()` por `getSession()` para "ganhar" os
 * 57 ms: `getSession()` não valida o JWT no servidor.
 *
 * 🔴 LANÇA `SessaoIndeterminadaError`, NÃO devolve papel, quando a consulta a
 * `perfis` ou a `gps.membros` falha (16/09/2026 — achado do
 * `fable-orchestrator`, `CLAUDE.md`). As duas consultas usavam `maybeSingle()`
 * e descartavam o `error`: `maybeSingle()` devolve `data:null, error:null`
 * com 0 linhas, e `data:null` **com** `error` quando o transporte falha.
 * Descartar o `error` colapsava as duas situações em `papel:"sem_acesso"` —
 * um aluno com acesso real, mas com uma falha transitória de rede/banco na
 * hora de resolver o papel, lia "você não tem vínculo com o programa".
 *
 * Por que lança em vez de devolver um papel:
 * - Um 4º valor em `Papel` (`"indeterminado"`) foi REPROVADO no desenho: há
 *   63 comparações negativas no repo (`!== "admin"`, `!== "aluno"`) que
 *   aceitariam o valor novo sem ninguém ter pensado nele, e as `!== "aluno"`
 *   fazem `redirect("/")` — reproduziria o mesmo bug com nome novo.
 * - Um campo `indeterminado: boolean` também foi reprovado: só protege quem
 *   lembrar de checá-lo; os ~71 chamadores continuariam compilando sem ler.
 * - Lançar falha FECHADO por construção (nenhum ramo de autorização executa)
 *   e não afirma ausência de acesso. O tipo de retorno NÃO muda
 *   (`ContextoSessao | null`): `null` continua significando SÓ "não há
 *   sessão" — nunca "não deu para saber".
 *
 * 🔴 PROIBIDO envolver a chamada desta função em `try/catch` largo.
 * `redirect()` do Next **funciona lançando** (é assim que ele interrompe o
 * render), e `getContextoSessao()` é chamada imediatamente antes de
 * `redirect()` em ~40 páginas — um `catch` sem filtro ali engoliria o
 * redirect. Quem precisa reagir a `SessaoIndeterminadaError` faz
 * `catch (e) { if (!ehSessaoIndeterminada(e)) throw e; ... }`
 * (`@/lib/auth-erros`) — nunca um `catch` genérico.
 */
export const getContextoSessao = cache(async function getContextoSessao(): Promise<ContextoSessao | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Admin?
  const { data: perfil, error: erroPerfil } = await supabase
    .from("perfis")
    .select("id, nome, email, cargo, status")
    .eq("id", user.id)
    .maybeSingle();

  if (erroPerfil) {
    logErro("getContextoSessao", erroPerfil, { escopo: "perfis" });
    throw new SessaoIndeterminadaError("perfis");
  }

  if (
    perfil &&
    perfil.status === "ativo" &&
    (perfil.cargo === "dev" || perfil.cargo === "admin")
  ) {
    return {
      user,
      papel: "admin",
      perfil,
      alunoId: null,
      membroAlunoId: null,
      pessoaAlunoId: null,
      papelMembro: null,
    };
  }

  // Aluno?
  //
  // 🔑 `pessoa_aluno_id` vem na MESMA linha (migração ...154, backfill de
  // 09/09: 0 membros sem pessoa, com trigger garantindo o titular). Até
  // 10/09/2026 a identidade da PESSOA era resolvida com um `ilike` em
  // `public.thb_alunos.email` — uma consulta a mais em toda requisição de
  // sócio, casando gente por e-mail. Agora custa ZERO consulta.
  const { data: membro, error: erroMembro } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id, papel, pessoa_aluno_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (erroMembro) {
    logErro("getContextoSessao", erroMembro, { escopo: "membros" });
    throw new SessaoIndeterminadaError("membros");
  }

  if (membro) {
    const pessoaAlunoId = (membro.pessoa_aluno_id as string | null) ?? null;

    return {
      user,
      papel: "aluno",
      perfil: null,
      // aluno_id do AMBIENTE (titular) — o que filtra clientes, progresso e pasta.
      alunoId: membro.aluno_id,
      // A PESSOA. Para o titular coincide com o ambiente; para o sócio, não.
      // Cai no ambiente quando o membro ainda não tem cadastro vinculado —
      // mesmo comportamento de antes, quando o `ilike` não achava ninguém.
      membroAlunoId: pessoaAlunoId ?? membro.aluno_id,
      pessoaAlunoId,
      papelMembro: membro.papel,
    };
  }

  return {
    user,
    papel: "sem_acesso",
    perfil: null,
    alunoId: null,
    membroAlunoId: null,
    pessoaAlunoId: null,
    papelMembro: null,
  };
});

/**
 * Atalho para Server Actions/queries que só o admin pode chamar (era
 * triplicado em `admin/actions.ts`, `admin/senha-actions.ts` e
 * `admin/plantao/slots-actions.ts` — extraído para cá).
 *
 * Também memoizado por requisição: é chamado ~43 vezes no repo, e sem isso
 * cada guarda de `data.ts` custaria um round-trip ao GoTrue. A resposta não
 * muda no meio de uma requisição — o papel é do usuário da sessão.
 */
export const ehAdmin = cache(async function ehAdmin(): Promise<boolean> {
  const ctx = await getContextoSessao();
  return ctx?.papel === "admin";
});

/**
 * `true` se o usuário logado é ADMIN ou OPERADOR ATIVO da esteira
 * (`gps.operadores`, migração `…264`, decisão do Marcio 15/09/2026: "um
 * papel só — equipe da esteira"). Usada pelas telas de fila de ligações e
 * dossiê para decidir se mostram o conteúdo — a fronteira real é
 * `gps.eh_equipe()` dentro de cada RPC da esteira (não replicada aqui: esta
 * função lê `gps.operadores` diretamente, que é UMA linha por usuário, não
 * uma função SQL a mais para chamar do servidor).
 *
 * 🔴 NÃO confundir com "papel" em `ContextoSessao` — de propósito não
 * acrescentamos `"operador"` a `Papel`: 20 páginas têm `ctx.papel !==
 * "admin"` copiado, e um valor novo na união faria essas 20 continuarem
 * compilando com outro significado sem ninguém perceber. Um admin que
 * também é operador continua com `papel: "admin"`; esta função é ADITIVA,
 * não substitui `ehAdmin()`.
 *
 * Memoizada por requisição com `cache()`, mesmo padrão de `ehAdmin()` — evita
 * uma consulta a mais em `gps.operadores` toda vez que a página checar o
 * papel dentro do mesmo render.
 */
export const ehEquipeDaEsteira = cache(async function ehEquipeDaEsteira(): Promise<boolean> {
  if (await ehAdmin()) return true;

  const ctx = await getContextoSessao();
  if (!ctx) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("operadores")
    .select("ativo")
    .eq("user_id", ctx.user.id)
    .maybeSingle();

  return Boolean(data?.ativo);
});
