import { createClient } from "@/lib/supabase/server";
import type { Solicitacao, StatusSolicitacao } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Solicitações de acesso (`gps.solicitacoes_acesso`) — a fila que o admin
// aprova/recusa dentro de `/admin`.
//
// Recortado de `src/lib/data.ts` (CD5) sem mudança de comportamento.
// `src/lib/data.ts` reexporta tudo daqui, para os importadores não mudarem.
// ─────────────────────────────────────────────────────────────────────────

/** `gps.solicitacoes_acesso` → `Solicitacao`. */
const COLUNAS_SOLICITACAO =
  "id, user_id, nome, email, telefone, status, aluno_id, observacao, criado_em, decidido_em";
/** Solicitação de acesso do usuário logado (ou null). */
export async function getMinhaSolicitacao(
  userId: string,
): Promise<Solicitacao | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select(COLUNAS_SOLICITACAO)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as Solicitacao) ?? null;
}

/** Solicitações de acesso (para o admin), filtradas por status. */
export async function getSolicitacoes(
  status?: StatusSolicitacao,
): Promise<Solicitacao[]> {
  const supabase = await createClient();
  let query = supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select(COLUNAS_SOLICITACAO)
    .order("criado_em", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as Solicitacao[];
}
