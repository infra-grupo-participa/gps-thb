import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import type { ClienteMinuta } from "@/lib/minutas-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Minutas da ficha do cliente (`gps.cliente_minutas`) — histórico de
// VERSÕES, mais recente primeiro. Leitura só; a escrita é
// `src/app/clientes/minuta-actions.ts`.
//
// Mesmo contrato de `COLUNAS_*` de `src/lib/data/clientes.ts`: a constante
// abaixo tem de listar TUDO que `ClienteMinuta` declara — um `select`
// explícito não falha quando falta coluna, o campo chega `undefined` e a
// tela mostra vazio em silêncio.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_MINUTA =
  "id, cliente_id, path, nome, tamanho, notas, enviado_em, enviado_por, enviado_pela_equipe";

/**
 * Lista as minutas de UM cliente, mais recente primeiro. A RLS de
 * `gps.cliente_minutas` (`cliente_minutas_select`) já restringe a quem pode
 * ver: admin ou membro do ambiente do cliente — esta função não repete a
 * guarda, só filtra por `cliente_id` (que é exatamente o predicado do
 * índice `cliente_minutas_cliente_idx`).
 *
 * Sem teto: minuta é N por cliente, mas N é pequeno por natureza (revisão de
 * um mesmo documento ao longo da Etapa 05) — não é log de evento nem trilha
 * de auditoria que cresce sozinha. Se um dia isso mudar, a paginação entra
 * aqui, não na tela.
 */
export async function getMinutasDoCliente(
  clienteId: string,
): Promise<ClienteMinuta[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("cliente_minutas")
    .select(COLUNAS_MINUTA)
    .eq("cliente_id", clienteId)
    .order("enviado_em", { ascending: false });

  if (error) {
    logErro("getMinutasDoCliente", error, { clienteId });
    return [];
  }
  return (data ?? []) as ClienteMinuta[];
}
