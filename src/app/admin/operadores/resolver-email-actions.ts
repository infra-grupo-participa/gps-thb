"use server";

/**
 * Resolve um e-mail digitado para o `user_id` de um login existente —
 * usado SÓ pela tela de gestão do papel de operador (`/admin/operadores`),
 * para poder chamar `definirOperador(userId, ...)` (`src/app/admin/
 * operador-actions.ts`), que exige um `user_id` já existente em
 * `auth.users` e nunca aceita e-mail cru.
 *
 * DIVERGÊNCIA DO PLANO: este arquivo não estava na lista de "seus arquivos"
 * do plano da Fatia 5. Foi necessário porque `gps.operador_definir` (a RPC
 * de `operador-actions.ts`, que é do backend e não deve ser tocada) pede
 * `p_user_id uuid` — e não existe, em nenhum arquivo já entregue, uma
 * resolução de e-mail arbitrário → `user_id` fora do fluxo de aluno
 * (`definirSenhaAluno`, `adicionarSocioAluno` etc. resolvem o e-mail do
 * MEMBRO já vinculado a um `alunoId`, não um e-mail digitado livre). Reusa
 * a RPC já existente e já liberada a `authenticated`, `gps.
 * admin_programas_do_email` (mesma chamada usada em `admin/actions.ts` e
 * `admin/senha-actions.ts`) — nenhuma função nova no banco.
 *
 * Padrão de toda action deste repo: `ehAdmin()` primeiro, `traduzirErroBanco`
 * no erro, retorno `{ ok, erro? }`.
 */

import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import { emailValido } from "@/lib/texto";
import type { LoginResolvidoResultado } from "@/lib/resolver-login-tipos";

/**
 * `gps.admin_programas_do_email` devolve `tem_login`/`user_id`/`email` (e a
 * lista de programas em que o login já atua — não usada aqui, a tela de
 * operador não precisa dela: ativar o papel não troca senha nem derruba
 * sessão de ninguém, ao contrário de `definirSenhaAluno`).
 */
export async function resolverLoginPorEmail(
  email: string,
): Promise<LoginResolvidoResultado> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const limpo = email.trim();
  if (!emailValido(limpo)) {
    return { ok: false, erro: "Informe um e-mail válido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_programas_do_email", { p_email: limpo });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("operadores/resolverLoginPorEmail", error, {
        rpc: "gps.admin_programas_do_email",
      }),
    };
  }

  const resultado = data as { tem_login?: boolean; user_id?: string; email?: string } | null;
  if (!resultado?.tem_login || !resultado.user_id) {
    return {
      ok: false,
      erro: "Não existe login com este e-mail. A pessoa precisa ter uma conta em algum sistema do grupo antes de virar operador.",
    };
  }

  return { ok: true, userId: resultado.user_id, email: resultado.email ?? limpo };
}
