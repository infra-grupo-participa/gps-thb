import { emailParaIlike } from "@/lib/texto";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PapelMembro, Papel, Perfil } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

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
  /** Nome da pessoa logada (thb_alunos.nome do `membroAlunoId`). */
  membroNome: string | null;
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
 */
export const getContextoSessao = cache(async function getContextoSessao(): Promise<ContextoSessao | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Admin?
  const { data: perfil } = await supabase
    .from("perfis")
    .select("id, nome, email, cargo, status")
    .eq("id", user.id)
    .maybeSingle();

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
      membroNome: null,
      papelMembro: null,
    };
  }

  // Aluno?
  const { data: membro } = await supabase
    .schema("gps")
    .from("membros")
    .select("aluno_id, papel")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membro) {
    // aluno_id do AMBIENTE (titular) já veio na linha. O aluno_id da PESSOA
    // logada (para o sócio, diferente do ambiente) não vive em gps.membros —
    // resolve pelo e-mail do login, mesmo casamento usado no onboarding.
    let membroAlunoId = membro.aluno_id;
    let membroNome: string | null = null;
    if (membro.papel === "socio" && user.email) {
      const { data: pessoa } = await supabase
        .from("thb_alunos")
        .select("id, nome")
        .ilike("email", emailParaIlike(user.email))
        .limit(1)
        .maybeSingle();
      if (pessoa) {
        membroAlunoId = pessoa.id;
        membroNome = pessoa.nome;
      }
    }

    return {
      user,
      papel: "aluno",
      perfil: null,
      alunoId: membro.aluno_id,
      membroAlunoId,
      membroNome,
      papelMembro: membro.papel,
    };
  }

  return {
    user,
    papel: "sem_acesso",
    perfil: null,
    alunoId: null,
    membroAlunoId: null,
    membroNome: null,
    papelMembro: null,
  };
});

/**
 * Atalho para Server Actions/queries que só o admin pode chamar (era
 * triplicado em `admin/actions.ts`, `admin/senha-actions.ts` e
 * `admin/plantao/actions.ts` — extraído para cá).
 *
 * Também memoizado por requisição: é chamado ~43 vezes no repo, e sem isso
 * cada guarda de `data.ts` custaria um round-trip ao GoTrue. A resposta não
 * muda no meio de uma requisição — o papel é do usuário da sessão.
 */
export const ehAdmin = cache(async function ehAdmin(): Promise<boolean> {
  const ctx = await getContextoSessao();
  return ctx?.papel === "admin";
});
