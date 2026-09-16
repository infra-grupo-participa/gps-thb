import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
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
/**
 * Solicitação de acesso do usuário logado.
 *
 * 🔴 DISTINGUE "não existe" de "não deu para saber" (16/09/2026). Antes esta
 * função descartava o `error` e devolvia `null` nos dois casos — e a home usa
 * justamente a ausência de solicitação para escolher a frase da tela. Com o
 * erro engolido, uma falha transitória do banco fazia a tela AFIRMAR um fato
 * sobre o cadastro da pessoa ("não há pedido registrado") que ela não tinha
 * como saber. Mentira nova no lugar da antiga ("aguardando liberação", quando
 * `gps.solicitacoes_acesso` está vazia).
 *
 * `solicitacao: null` + `falhou: false` = consultado, não existe.
 * `solicitacao: null` + `falhou: true`  = não foi possível consultar.
 *
 * A policy `solicitacoes_self_select` (`user_id = auth.uid()`) e o UNIQUE em
 * `user_id` garantem que o `null` sem falha é mesmo ausência de linha, e não
 * recorte de RLS.
 */
export async function getMinhaSolicitacao(
  userId: string,
): Promise<{ solicitacao: Solicitacao | null; falhou: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("solicitacoes_acesso")
    .select(COLUNAS_SOLICITACAO)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logErro("getMinhaSolicitacao", error);
    return { solicitacao: null, falhou: true };
  }

  return { solicitacao: (data as Solicitacao) ?? null, falhou: false };
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
  const { data, error } = await query;
  // ⚠️ A assinatura continua devolvendo lista (5 pontos de uso no painel do
  // admin), mas o erro para de sumir: sem isto, uma falha do banco vira "zero
  // pendentes" na fila — o admin conclui que está em dia justamente quando
  // não dá para saber. Distinguir os dois na TELA do admin é mudança maior,
  // fora deste escopo; o log ao menos deixa rastro.
  if (error) logErro("getSolicitacoes", error, { status: status ?? null });
  return (data ?? []) as Solicitacao[];
}
