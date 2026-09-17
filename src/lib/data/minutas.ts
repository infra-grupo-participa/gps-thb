import { cache } from "react";
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
  "id, cliente_id, path, nome, tamanho, notas, enviado_em, enviado_por, enviado_pela_equipe, caso, o_que_foi_feito, ponto_de_ajuda, o_que_mudou";

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

/**
 * O interruptor `gps.config.minuta_contexto_obrigatorio` (default LIGADO).
 *
 * 🔑 Vai por RPC, não por `select` em `gps.config`: aquela tabela só tem
 * policy de ADMIN — o parceiro leria 0 linhas e cairia no fallback para
 * sempre, com o interruptor ligado ou desligado. Mesmo molde de
 * `getTutoriaisAtivo` (`src/lib/data/tutoriais.ts`).
 *
 * Memoizada por requisição (`cache()` do React): as duas telas da ficha
 * chamam na mesma renderização.
 *
 * ⚠️ Erro → devolve `true` (o padrão SEGURO é EXIGIR o contexto). Falha de
 * leitura não pode afrouxar a regra que o João pediu; no máximo faz a tela
 * marcar campo obrigatório que a RPC também exigiria de qualquer forma.
 */
export const getMinutaContextoObrigatorio = cache(
  async function getMinutaContextoObrigatorio(): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("gps")
      .rpc("minuta_contexto_obrigatorio");
    if (error) {
      logErro("getMinutaContextoObrigatorio", error, {
        efeito: "assume LIGADO — o padrão seguro é exigir o contexto",
      });
      return true;
    }
    return data !== false;
  },
);
