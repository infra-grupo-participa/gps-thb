import { createClient } from "@/lib/supabase/server";
import { ehEquipeDaEsteira } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type { PerfilDisc } from "@/lib/types";
import type { Decisor, FilaDeLigacaoLinha } from "@/lib/entrevista-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Entrevista prévia + decisores (Fatia 3 da esteira, migração 20260915000262).
//
// Arquivo NOVO e SEPARADO de `src/lib/data/clientes.ts` de propósito — mesmo
// motivo de `clientes-admin.ts`: aquele é o CRM do ALUNO (a própria ficha);
// este é a fila de trabalho da EQUIPE sobre os clientes selecionados por
// todos os ambientes.
//
// 🔴 `entrevista_observacoes` e os decisores em si NÃO entram na fila (LGPD,
// ver cabeçalho da migração `…262`) — só `getDecisoresDoCliente` os lê, e
// isso acontece na FICHA de um cliente específico, já sob a RLS de
// `gps.cliente_decisores` (admin, ou dono do ambiente via `aluno_atual()`).
// ─────────────────────────────────────────────────────────────────────────

export interface FiltrosFilaDeLigacoes {
  limite?: number;
  offset?: number;
}

/**
 * `gps.fila_de_ligacoes(...)` → `{ linhas, total }`.
 *
 * `total` é o universo do FILTRO (o `count(*) over()` da RPC): quantos
 * clientes selecionados ainda têm entrevista pendente, não o tamanho da
 * página. `ehEquipeDaEsteira()` de guarda (evita viagem ao banco à toa; a
 * fronteira real é `gps.eh_equipe()` na RPC — admin OU operador ativo da
 * esteira, migração `…264`, 15/09/2026 — não `gp_is_admin()`, 42501).
 */
export async function getFilaDeLigacoes(
  opts?: FiltrosFilaDeLigacoes,
): Promise<{ linhas: FilaDeLigacaoLinha[]; total: number; erro?: string }> {
  if (!(await ehEquipeDaEsteira())) return { linhas: [], total: 0, erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("fila_de_ligacoes", {
    p_limite: opts?.limite ?? 100,
    p_offset: opts?.offset ?? 0,
  });

  if (error) {
    return {
      linhas: [],
      total: 0,
      erro: traduzirErroBanco("getFilaDeLigacoes", error, {
        rpc: "gps.fila_de_ligacoes",
      }),
    };
  }

  const linhas = ((data ?? []) as Record<string, unknown>[]).map(mapearLinhaFila);
  const total = linhas.length > 0 ? Number((data as Record<string, unknown>[])[0].total_linhas ?? 0) : 0;

  return { linhas, total };
}

function mapearLinhaFila(d: Record<string, unknown>): FilaDeLigacaoLinha {
  return {
    clienteId: String(d.cliente_id),
    clienteNome: String(d.cliente_nome ?? ""),
    telefone: (d.telefone as string | null) ?? null,
    parceiroNome: (d.parceiro_nome as string | null) ?? null,
    grauRelacao: (d.grau_relacao as string | null) ?? null,
    favorito: Boolean(d.favorito),
    perfilDisc: (d.perfil_disc as PerfilDisc | null) ?? null,
    totalLinhas: Number(d.total_linhas ?? 0),
  };
}

/**
 * Decisores de UM cliente, para a ficha/dossiê da entrevista. Leitura direta
 * de `gps.cliente_decisores` (a policy `gps_cliente_decisores_select` já
 * restringe a admin ou dono do ambiente — nenhuma RPC necessária, mesmo
 * padrão de `getClienteById`).
 *
 * 🔴 NUNCA chamar esta função para montar um payload de LISTA (a fila, o
 * CSV): ela é só para a ficha de UM cliente por vez — ver a decisão de LGPD
 * no cabeçalho da migração `…262`.
 */
export async function getDecisoresDoCliente(clienteId: string): Promise<Decisor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("cliente_decisores")
    .select("id, cliente_id, nome, papel_no_negocio, principal, criado_em")
    .eq("cliente_id", clienteId)
    .order("principal", { ascending: false })
    .order("criado_em");

  return ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    clienteId: String(d.cliente_id),
    nome: String(d.nome ?? ""),
    papelNoNegocio: (d.papel_no_negocio as string | null) ?? null,
    principal: Boolean(d.principal),
    criadoEm: String(d.criado_em ?? ""),
  }));
}
