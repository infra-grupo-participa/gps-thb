import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type { FaseCliente, GrauRelacao } from "@/lib/types";
import type { FiltroReuniao } from "@/components/admin/clientes-programa/estado-na-url";

// ─────────────────────────────────────────────────────────────────────────
// Lista consolidada de clientes do programa (item 3 dos 9, 14/09/2026).
// Ver docs/audits/2026-09-14-esteira/01-listas-clicaveis.md para as
// decisões e as medições que sustentam esta leitura.
//
// 🔴 DECISÃO DE LGPD DO MARCIO: `registro_contato` NÃO entra aqui — nem
// `valor_honorarios`, nem `contrato_*`, nem `problemas`. Os 1.214 clientes
// são terceiros; a anotação livre do parceiro sobre a vida deles fica só
// na ficha individual (com trilha própria). A RPC `gps.admin_clientes_lista`
// já não devolve essas colunas — não é "esconder na tela".
//
// Arquivo NOVO e SEPARADO de `src/lib/data/clientes.ts` de propósito:
// aquele é o CRM do ALUNO (a própria ficha, `gps.etapa1_clientes` por
// `aluno_id`); este é a visão consolidada do ADMIN sobre TODOS os
// ambientes — mesmo padrão de separação que já existe entre
// `src/lib/data/alunos.ts` (painel) e `src/lib/data/dashboard.ts`.
// ─────────────────────────────────────────────────────────────────────────

/** Uma linha da lista consolidada — as colunas exatas de `admin_clientes_lista`. */
export interface ClienteDoPrograma {
  id: string;
  alunoId: string;
  parceiroNome: string;
  clienteNome: string;
  telefone: string | null;
  fase: FaseCliente;
  grauRelacao: GrauRelacao | null;
  perfilDisc: string | null;
  dataReuniaoPreliminar: string | null;
  aderiuReuniao: boolean;
  acompanhadoEquipe: boolean;
  criadoEm: string;
}

export interface FiltrosClientesDoPrograma {
  limite?: number;
  offset?: number;
  /** `null`/ausente = todas as fases. */
  fase?: FaseCliente | null;
  /** `"_nulo"` = sem grau informado (mesma convenção da RPC). */
  grau?: GrauRelacao | "_nulo" | null;
  /** Nome do cliente OU do parceiro. */
  busca?: string | null;
  /** `null`/ausente = todos. Ver `FiltroReuniao` em `estado-na-url.ts`. */
  reuniao?: FiltroReuniao;
}

/**
 * `gps.admin_clientes_lista(...)` → `{ linhas, total }`.
 *
 * `total` é o universo do FILTRO (o `count(*) over()` da RPC), não o
 * tamanho da página — é o número que a tela usa para dizer "100 de 1.214".
 *
 * `ehAdmin()` de guarda (mesmo padrão de `getDashboard`): evita uma viagem
 * ao banco à toa. A fronteira real é `gp_is_admin()` na RPC (42501).
 */
export async function getClientesDoPrograma(
  opts?: FiltrosClientesDoPrograma,
): Promise<{ linhas: ClienteDoPrograma[]; total: number; erro?: string }> {
  if (!(await ehAdmin())) return { linhas: [], total: 0, erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_clientes_lista", {
    p_limite: opts?.limite ?? 100,
    p_offset: opts?.offset ?? 0,
    p_fase: opts?.fase ?? null,
    p_grau: opts?.grau ?? null,
    p_busca: opts?.busca ?? null,
    p_reuniao: opts?.reuniao ?? null,
  });

  if (error) {
    return {
      linhas: [],
      total: 0,
      erro: traduzirErroBanco("getClientesDoPrograma", error, {
        rpc: "gps.admin_clientes_lista",
      }),
    };
  }

  const linhas = ((data ?? []) as Record<string, unknown>[]).map(mapearLinha);
  const total = linhas.length > 0 ? Number(data![0].total_linhas ?? 0) : 0;

  return { linhas, total };
}

function mapearLinha(d: Record<string, unknown>): ClienteDoPrograma {
  return {
    id: String(d.id),
    alunoId: String(d.aluno_id),
    parceiroNome: String(d.parceiro_nome ?? ""),
    clienteNome: String(d.cliente_nome ?? ""),
    telefone: (d.telefone as string | null) ?? null,
    fase: (d.fase as FaseCliente) ?? "prospeccao",
    grauRelacao: (d.grau_relacao as GrauRelacao | null) ?? null,
    perfilDisc: (d.perfil_disc as string | null) ?? null,
    dataReuniaoPreliminar: (d.data_reuniao_preliminar as string | null) ?? null,
    aderiuReuniao: Boolean(d.aderiu_reuniao),
    acompanhadoEquipe: Boolean(d.acompanhado_equipe),
    criadoEm: String(d.criado_em ?? ""),
  };
}
