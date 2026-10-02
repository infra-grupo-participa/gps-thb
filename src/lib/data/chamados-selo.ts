import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { logErro } from "@/lib/log";

/**
 * Selo do menu "Chamados" do PARCEIRO (Onda 1.1, 02/10/2026): quantos
 * chamados do ambiente dele esperam a vez dele — não fechados e com a
 * ÚLTIMA mensagem escrita pela equipe ("respondido, sua vez").
 *
 * 🔑 "Última mensagem é da equipe" = `status = 'respondido'`. Não é
 * aproximação: o status é DERIVADO de quem escreveu por último e só muda em
 * `gps.chamado_gravar_mensagem` (aluno → 'aberto', equipe → 'respondido') e
 * em `gps.chamado_fechar` (→ 'fechado'). Nenhum outro caminho insere em
 * `chamado_mensagens` (conferido nas migrations …111/…116/…250/…319/…335).
 * Ler a thread para achar a última mensagem custaria um join por chamado
 * para responder a mesma pergunta.
 *
 * Uma query só, `count` com `head: true` (zero linha trafega), sob a RLS do
 * usuário (`gps_chamados_select`: admin ou `aluno_id = gps.aluno_atual()`).
 * O filtro por `aluno_id` é redundante para o parceiro e é o que impede o
 * ADMIN de contar a fila do programa inteiro — mas para o admin a função nem
 * chega ao banco: ele não tem ambiente (`alunoId` nulo) e o selo é 0.
 * Servida por `idx_chamados_ambiente (aluno_id, ultima_mensagem_em desc)`:
 * por ambiente são ≤ 5 não fechados + o histórico (teto de leitura 200).
 *
 * `cache()` do React: header, menu e página no mesmo render = 1 ida ao banco.
 *
 * Falha NUNCA vira número inventado para cima, e também não derruba o menu:
 * devolve 0 e registra em `logErro`. É um selo de atenção, não a fonte de
 * verdade — a lista `/chamados` mostra o estado real de cada chamado.
 */
export const contarChamadosAguardandoParceiro = cache(
  async function contarChamadosAguardandoParceiro(): Promise<number> {
    let ctx;
    try {
      ctx = await getContextoSessao();
    } catch (e) {
      if (!ehSessaoIndeterminada(e)) throw e;
      return 0;
    }
    if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) return 0;

    const supabase = await createClient();
    const { count, error } = await supabase
      .schema("gps")
      .from("chamados")
      .select("id", { count: "exact", head: true })
      .eq("aluno_id", ctx.alunoId)
      .eq("status", "respondido");

    if (error) {
      logErro("contarChamadosAguardandoParceiro", error);
      return 0;
    }
    return count ?? 0;
  },
);
