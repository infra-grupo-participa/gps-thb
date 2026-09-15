import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import type {
  Operador,
  DossieDoCliente,
  DossieDecisor,
  DossiePropostaReuniao,
} from "@/lib/operador-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Papel de operador + dossiê do cliente (Fatia 5, ÚLTIMA da esteira,
// migração 20260915000264).
//
// Arquivo NOVO e SEPARADO de `src/lib/data/entrevistas.ts` e
// `reuniao-preliminar.ts` de propósito: aqueles são a fila de trabalho da
// equipe; este é a GESTÃO do papel (quem é operador) e o DOSSIÊ (visão
// consolidada de um cliente para a reunião preliminar) — dois assuntos
// novos desta fatia, mesmo padrão de separação por assunto do repo.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Todos os operadores cadastrados (ativos e inativos) — para a tela de
 * gestão do papel em `/admin`. `ehAdmin()` de guarda: só admin gerencia o
 * papel (a RLS de `gps.operadores` também restringe: operador só lê a
 * própria linha, admin lê todas).
 */
export async function getOperadores(): Promise<{ linhas: Operador[]; erro?: string }> {
  if (!(await ehAdmin())) return { linhas: [], erro: "Sem permissão." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("operadores")
    .select("user_id, nome, ativo, criado_em")
    .order("nome");

  if (error) {
    return {
      linhas: [],
      erro: traduzirErroBanco("getOperadores", error, { tabela: "gps.operadores" }),
    };
  }

  const linhas = ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    userId: String(d.user_id),
    nome: String(d.nome ?? ""),
    ativo: Boolean(d.ativo),
    criadoEm: String(d.criado_em ?? ""),
  }));

  return { linhas };
}

/**
 * `true` se o usuário logado é operador ATIVO — para a tela decidir se
 * mostra a fila de ligações. Lê a PRÓPRIA linha (policy `gps_operadores_select`
 * já permite: operador lê a si mesmo). `userId` vem do contexto de sessão do
 * chamador, nunca de parâmetro externo — mesma regra de `alunoId` no resto
 * do repo.
 *
 * 🔑 Isto é conveniência de UI, não a fronteira: a fronteira real é
 * `gps.eh_equipe()` dentro de cada RPC da esteira (`fila_de_ligacoes`,
 * `entrevista_gravar`, `reuniao_propor_data`, `dossie_do_cliente`).
 */
export async function souOperadorAtivo(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("operadores")
    .select("ativo")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data?.ativo);
}

/**
 * `gps.dossie_do_cliente(...)` → o dossiê de UM cliente, para a reunião
 * preliminar / a ligação da entrevista.
 *
 * 🔴 Cada chamada grava trilha em `gps.acessos_log` (`dossie_acessado`) —
 * dentro da própria RPC, sempre, mesmo em leitura. Não chamar em loop para
 * montar lista: é para a ficha de UM cliente por vez.
 */
export async function getDossieDoCliente(
  clienteId: string,
): Promise<{ dossie: DossieDoCliente | null; erro?: string }> {
  // 🔑 Sem `ehAdmin()` de guarda aqui, ao contrário do resto do `data/`:
  // aquele atalho é "é admin?", e um OPERADOR (não-admin) também tem
  // direito a esta leitura. A fronteira real é `gps.eh_equipe()` dentro da
  // RPC — quem filtra é o banco, não esta função.
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("dossie_do_cliente", { p_cliente_id: clienteId })
    .single();

  if (error) {
    return {
      dossie: null,
      erro: traduzirErroBanco("getDossieDoCliente", error, {
        rpc: "gps.dossie_do_cliente",
      }),
    };
  }

  return { dossie: mapearDossie(data as Record<string, unknown>) };
}

function mapearDossie(d: Record<string, unknown>): DossieDoCliente {
  const entrevista = (d.entrevista ?? {}) as Record<string, unknown>;
  const reuniao = (d.reuniao ?? {}) as Record<string, unknown>;
  const decisores = ((d.decisores ?? []) as Record<string, unknown>[]).map(mapearDecisor);
  const propostas = ((reuniao.propostas ?? []) as Record<string, unknown>[]).map(
    mapearPropostaHistorico,
  );

  return {
    clienteId: String(d.cliente_id),
    alunoId: String(d.aluno_id),
    parceiroNome: (d.parceiro_nome as string | null) ?? null,
    clienteNome: String(d.cliente_nome ?? ""),
    telefone: (d.telefone as string | null) ?? null,
    grauRelacao: (d.grau_relacao as string | null) ?? null,
    fase: String(d.fase ?? "prospeccao"),
    perfilDisc: (d.perfil_disc as string | null) ?? null,
    acompanhadoEquipe: Boolean(d.acompanhado_equipe),
    selecionadoEntrevista: Boolean(d.selecionado_entrevista),
    entrevista: {
      resultado: (entrevista.resultado as string | null) ?? null,
      observacoes: (entrevista.observacoes as string | null) ?? null,
      em: (entrevista.em as string | null) ?? null,
      por: (entrevista.por as string | null) ?? null,
    },
    decisores,
    reuniao: {
      dataAceita: (reuniao.data_aceita as string | null) ?? null,
      aderiu: Boolean(reuniao.aderiu),
      propostaVivaId: (reuniao.proposta_viva_id as string | null) ?? null,
      propostaVivaData: (reuniao.proposta_viva_data as string | null) ?? null,
      propostas,
    },
  };
}

function mapearDecisor(d: Record<string, unknown>): DossieDecisor {
  return {
    id: String(d.id),
    nome: String(d.nome ?? ""),
    papelNoNegocio: (d.papel_no_negocio as string | null) ?? null,
    principal: Boolean(d.principal),
  };
}

function mapearPropostaHistorico(d: Record<string, unknown>): DossiePropostaReuniao {
  return {
    id: String(d.id),
    dataProposta: String(d.data_proposta),
    propostaEm: String(d.proposta_em),
    estado: String(d.estado ?? ""),
    respostaEm: (d.resposta_em as string | null) ?? null,
    contestacaoMotivo: (d.contestacao_motivo as string | null) ?? null,
  };
}
