import { createClient } from "@/lib/supabase/server";
import { ehEquipeDaEsteira } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type { PerfilDisc } from "@/lib/types";
import type {
  Decisor,
  FilaDeLigacaoLinha,
  ModoFila,
  ResultadoEntrevista,
  TentativaEntrevista,
} from "@/lib/entrevista-tipos";

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
//
// 🔴 ATUALIZADO EM 16/09/2026 (Fatia B, migração `…266`): a mesma regra vale
// para `getTentativasDoCliente` — histórico completo de UMA ligação por
// tentativa, com `observacoes`/`qualidade`, é leitura de UM cliente por vez
// (ficha/dossiê), NUNCA de lista agregada. `getFilaDeLigacoes` ganhou `modo`
// e as colunas derivadas (5 na …266; +2 na …268, teto de `remarcar`), mas
// continua sem `observacoes`/decisores/qualidade.
// ─────────────────────────────────────────────────────────────────────────

export interface FiltrosFilaDeLigacoes {
  limite?: number;
  offset?: number;
  /** Ver `MODOS_FILA` em `entrevista-tipos.ts`. Default do banco: `'fila'`. */
  modo?: ModoFila;
}

/**
 * `gps.fila_de_ligacoes(...)` → `{ linhas, total }`.
 *
 * `total` é o universo do FILTRO (o `count(*) over()` da RPC): quantos
 * clientes selecionados caem no `modo` pedido, não o tamanho da página.
 * `ehEquipeDaEsteira()` de guarda (evita viagem ao banco à toa; a
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
    p_modo: opts?.modo ?? "fila",
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
    tentativasTotal: Number(d.tentativas_total ?? 0),
    tentativasSemContato: Number(d.tentativas_sem_contato ?? 0),
    ultimaTentativaEm: (d.ultima_tentativa_em as string | null) ?? null,
    ultimoResultado: (d.ultimo_resultado as ResultadoEntrevista | null) ?? null,
    retornoEm: (d.retorno_em as string | null) ?? null,
    entrevistaRemarcacoes: Number(d.entrevista_remarcacoes ?? 0),
    entrevistaMotivoEncerramento:
      (d.entrevista_motivo_encerramento as "sem_contato" | "remarcacoes" | "desfecho" | null) ?? null,
    totalLinhas: Number(d.total_linhas ?? 0),
  };
}

/**
 * Histórico de tentativas de ligação de UM cliente (`gps.entrevista_tentativas`),
 * mais recente primeiro — leitura direta (a policy `gps_entrevista_tentativas_select`
 * já restringe a `gps.eh_equipe()`, nenhuma RPC necessária).
 *
 * 🔴 NUNCA chamar esta função para montar um payload de LISTA (a fila, o
 * CSV): ela é só para a ficha/dossiê de UM cliente por vez — mesma regra de
 * LGPD de `getDecisoresDoCliente` acima, ver a migração `…266`.
 */
export async function getTentativasDoCliente(
  clienteId: string,
): Promise<TentativaEntrevista[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("entrevista_tentativas")
    // 🔴 `tentativa_por` NÃO entra (achado do pentester, 16/09/2026): a
    // decisão de produto da `…267` tirou "quem ligou" do dossiê, e esta
    // função é o caminho previsto para a ficha. Trazer a coluna aqui
    // deixaria o campo pronto para vazar numa tela futura que confiasse
    // no shape sem reler a regra. Se um dia "quem ligou" for exibido, é
    // decisão do Marcio — e aí a coluna volta junto com a tela.
    .select("id, cliente_id, tentativa_em, resultado, qualidade, observacoes, retorno_em")
    .eq("cliente_id", clienteId)
    .order("tentativa_em", { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
    id: String(t.id),
    clienteId: String(t.cliente_id),
    tentativaEm: String(t.tentativa_em ?? ""),
    resultado: t.resultado as ResultadoEntrevista,
    qualidade: (t.qualidade as number | null) ?? null,
    observacoes: (t.observacoes as string | null) ?? null,
    retornoEm: (t.retorno_em as string | null) ?? null,
  }));
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
