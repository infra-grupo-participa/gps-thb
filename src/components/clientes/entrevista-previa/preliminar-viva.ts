import "server-only";

import { logErro } from "@/lib/log";
import { TIPO_REUNIAO_PRELIMINAR } from "@/lib/sessoes-tipos";
import { createClient } from "@/lib/supabase/server";

/**
 * A Reunião Preliminar VIVA (tipo 2, `agendado`) de um ambiente, se houver.
 *
 * Lida pelas duas páginas de entrevista (para oferecer "Já está marcada") e
 * pela rota `/agendar` (estado D). Uma leitura só, num lugar só.
 *
 * 🔴 `falhou` SEPARADO de `sessao: null`: "não há nada marcado" com a leitura
 * caída mandaria o parceiro à grade para bater na trava de sessão viva.
 * `getSessoesDoAmbiente` devolve `[]` no erro, por isso não serve aqui — e
 * traria todas as colunas de todas as sessões vivas para usar 2 de uma.
 *
 * 🔑 `aluno_id` explícito: para o PARCEIRO a RLS já restringe ao ambiente
 * dele; para o ADMIN (policy `gps_sessao_agend_admin`, lê tudo) é o filtro
 * que impede pegar a sessão de outro ambiente. No máximo 1 linha por
 * desenho (índice `sessao_aluno_tipo_viva`).
 */
export async function getPreliminarViva(alunoId: string): Promise<{
  sessao: { cliente_id: string; inicio_em: string } | null;
  falhou: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("sessao_agendamentos")
    .select("cliente_id, inicio_em")
    .eq("aluno_id", alunoId)
    .eq("tipo_id", TIPO_REUNIAO_PRELIMINAR)
    .eq("estado", "agendado")
    .limit(1)
    .maybeSingle();
  if (error) {
    logErro("getPreliminarViva", error);
    return { sessao: null, falhou: true };
  }
  return {
    sessao: (data as { cliente_id: string; inicio_em: string } | null) ?? null,
    falhou: false,
  };
}

/**
 * `data_reuniao_preliminar` da ficha, se for de hoje em diante — a data que
 * o parceiro combinou com o cliente antes da entrevista. Passada não é
 * sugestão, é histórico.
 */
export function dataCombinadaFutura(data: string | null | undefined, hoje: string): string | null {
  if (!data) return null;
  const dia = data.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && dia >= hoje ? dia : null;
}
