"use server";

/**
 * Papel de operador — gestão (Fatia 5, ÚLTIMA da esteira, migração
 * 20260915000264, decisão do Marcio de 15/09).
 *
 * 🔑 UM PAPEL SÓ: "equipe da esteira". Ativar/desativar alguém aqui dá a essa
 * pessoa a fila de ligações E o dossiê do cliente — nada mais. A guarda de
 * verdade é `gp_is_admin()` dentro de `gps.operador_definir` (SECURITY
 * DEFINER; NÃO `eh_equipe()` — operador não promove operador); `ehAdmin()`
 * aqui evita uma viagem ao banco à toa, mesmo padrão de `central-actions.ts`.
 *
 * Padrão de toda action deste repo:
 *   1. `ehAdmin()` como primeira porta;
 *   2. `traduzirErroBanco(...)` no erro — nunca `error.message` cru na tela;
 *   3. `revalidatePath` explícito das telas afetadas;
 *   4. retorno `{ ok, erro? }` — nunca `throw` para a UI.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type { OperadorResultado } from "@/lib/operador-tipos";

function revalidar() {
  revalidatePath("/admin", "layout");
}

/**
 * Ativa ou desativa o papel de operador para um login existente em
 * `auth.users`. `nome` é opcional (a RPC usa o e-mail se faltar).
 *
 * `userId` precisa ser um login já existente — não cria conta nova aqui;
 * quem provisiona acesso é o fluxo de "Criar acesso"/Gerenciar acesso
 * já existente. Isto só liga/desliga o papel transversal.
 */
export async function definirOperador(
  userId: string,
  ativo: boolean,
  nome?: string | null,
): Promise<OperadorResultado> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const id = (userId ?? "").trim();
  if (!id) return { ok: false, erro: "Faltou informar o usuário." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("operador_definir", {
    p_user_id: id,
    p_ativo: ativo,
    p_nome: (nome ?? "").trim() || null,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("definirOperador", error, {
        rpc: "gps.operador_definir",
      }),
    };
  }

  revalidar();
  return { ok: true };
}
