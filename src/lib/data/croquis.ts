import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import type { ClienteCroqui } from "@/lib/croquis-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Croquis da ficha do cliente (`gps.cliente_croquis`) — histórico de FOLHAS
// apresentadas, mais recente primeiro. Leitura só; a escrita é
// `src/app/clientes/croqui-actions.ts`.
//
// Molde literal de `src/lib/data/minutas.ts` (`getMinutasDoCliente`), sem a
// parte do interruptor (`getMinutaContextoObrigatorio`): croqui NÃO tem
// contexto obrigatório, então não há chave em `gps.config` para ler.
//
// Mesmo contrato de `COLUNAS_*` de `src/lib/data/clientes.ts`: a constante
// abaixo tem de listar TUDO que `ClienteCroqui` declara — um `select`
// explícito não falha quando falta coluna, o campo chega `undefined` e a
// tela mostra vazio em silêncio.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_CROQUI =
  "id, cliente_id, path, nome, tamanho, apresentado_em, observacoes, enviado_em, enviado_por, enviado_pela_equipe";

/**
 * Lista os croquis de UM cliente, mais recente primeiro.
 *
 * 🔑 A GUARDA É A RLS, e isso é deliberado — cópia da decisão de
 * `getMinutasDoCliente`. A policy `cliente_croquis_select` já restringe a
 * quem pode ver (admin via `gp_is_admin()` OU membro do ambiente do cliente
 * via `gps.aluno_atual()`), e o `createClient()` do servidor usa a SESSÃO de
 * quem chama, nunca `service_role`. Repetir a checagem aqui criaria uma
 * segunda verdade que pode divergir da policy — e a policy é a que vale,
 * porque o PostgREST é alcançável sem passar por esta função.
 *
 * O filtro é só `cliente_id` — exatamente o predicado do índice
 * `cliente_croquis_cliente_idx (cliente_id, enviado_em desc)`, incluindo a
 * ordenação: o plano sai sem nó de `Sort`.
 *
 * Sem teto: croqui é N por cliente, mas N é pequeno por natureza (as folhas
 * de UM caso) — não é log nem trilha de auditoria que cresce sozinha. Se
 * isso mudar, a paginação entra AQUI, não na tela.
 *
 * ⚠️ Erro vira lista vazia com `logErro` — mesmo comportamento (e mesma
 * limitação) de `getMinutasDoCliente`: a tela não distingue "nenhum croqui"
 * de "não deu para ler". Distinguir na tela é feature própria, igual à
 * pendência já registrada para `getSolicitacoes`.
 */
export async function getCroquisDoCliente(
  clienteId: string,
): Promise<ClienteCroqui[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("cliente_croquis")
    .select(COLUNAS_CROQUI)
    .eq("cliente_id", clienteId)
    .order("enviado_em", { ascending: false });

  if (error) {
    logErro("getCroquisDoCliente", error, { clienteId });
    return [];
  }
  return (data ?? []) as ClienteCroqui[];
}
