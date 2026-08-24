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
 */
export async function getContextoSessao(): Promise<ContextoSessao | null> {
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
        .ilike("email", user.email)
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
}
