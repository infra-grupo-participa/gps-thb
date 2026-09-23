import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";

/**
 * Leituras da Entrevista Prévia 2.0.
 *
 * 🔴 Nenhuma guarda de papel é replicada aqui: a RLS de
 * `gps.entrevista_previa` (admin OU dono do ambiente, molde de
 * `gps.cliente_decisores`) já decide quais linhas voltam. Repetir a regra em
 * TypeScript duplicaria a fonte de verdade.
 */

/** Uma entrevista, como a tela precisa dela. */
export interface EntrevistaPreviaLinha {
  id: string;
  cliente_id: string;
  entrevistado: string | null;
  respostas: Record<string, string>;
  perfil_disc: string | null;
  decisores_total: number | null;
  concluida_em: string | null;
  criado_em: string;
}

const COLUNAS =
  "id, cliente_id, entrevistado, respostas, perfil_disc, decisores_total, concluida_em, criado_em";

/**
 * A entrevista aberta agora — para retomar o que já foi marcado quando a
 * conversa cai e o parceiro volta.
 */
export async function getEntrevistaEmAberto(
  entrevistaId: string,
): Promise<EntrevistaPreviaLinha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("entrevista_previa")
    .select(COLUNAS)
    .eq("id", entrevistaId)
    .maybeSingle();

  if (error) {
    // 🔑 Erro NÃO vira "entrevista vazia": o parceiro recomeçaria do zero uma
    // conversa já em andamento. Devolver null faz a tela abrir sem respostas,
    // que é o mesmo efeito — por isso o erro fica no log, onde se investiga.
    logErro("getEntrevistaEmAberto", error, { entrevistaId });
    return null;
  }
  return (data as EntrevistaPreviaLinha | null) ?? null;
}

/**
 * O histórico de entrevistas de um cliente — são ILIMITADAS (regra do
 * Marcio), então a ficha mostra a lista e usa a mais recente concluída.
 */
export async function getEntrevistasDoCliente(
  clienteId: string,
): Promise<EntrevistaPreviaLinha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("entrevista_previa")
    .select(COLUNAS)
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    // Teto: o histórico é informativo e cresce sem limite por desenho
    // (entrevistas ilimitadas). 20 cobre qualquer uso real de uma ficha.
    .limit(20);

  if (error) {
    logErro("getEntrevistasDoCliente", error, { clienteId });
    return [];
  }
  return (data ?? []) as EntrevistaPreviaLinha[];
}

/**
 * Os decisores do cliente + se o DISC já está na ficha — o que a tela precisa
 * para avisar antes de marcar a Reunião Preliminar.
 *
 * 🔴 `exige_todos` é a regra do Marcio: *"para realizar a reunião preliminar,
 * todos os decisores precisam"*.
 */
export async function getDecisoresPendentes(clienteId: string): Promise<{
  total: number;
  decisores: { nome: string; papel: string | null; principal: boolean }[];
  exigeTodos: boolean;
  temDisc: boolean;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("cliente_decisores_pendentes", { p_cliente_id: clienteId });

  if (error) {
    logErro("getDecisoresPendentes", error, { clienteId });
    return null;
  }

  const r = data as {
    total: number;
    decisores: { nome: string; papel: string | null; principal: boolean }[];
    exige_todos: boolean;
    tem_disc: boolean;
  } | null;
  if (!r) return null;

  return {
    total: r.total,
    decisores: r.decisores ?? [],
    exigeTodos: r.exige_todos,
    temDisc: r.tem_disc,
  };
}
