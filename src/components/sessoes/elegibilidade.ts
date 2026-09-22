import "server-only";

import { logErro } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/**
 * "Este ambiente pode marcar este tipo de sessão?" — `gps.sessao_pode_agendar`.
 *
 * 🔴 POR QUE ESTA LEITURA EXISTE E POR QUE ELA MORA AQUI
 *
 * A RPC da grade (`gps.sessao_horarios_livres`) devolve **lista vazia** — não
 * erro — para o aluno que ainda não pode agendar (§7.1: *"'não há horário
 * para você' é um resultado, e a tela tem estado vazio honesto para ele"*).
 * Do lado do TypeScript, portanto, "não é elegível" e "não há bloco
 * publicado" chegam **idênticos**: uma lista de tamanho zero.
 *
 * São duas telas diferentes, com saídas diferentes (ver `sem-horario.tsx`):
 * o não elegível precisa ir escolher o cliente da equipe; o elegível sem
 * horário precisa voltar depois. Sem esta chamada, a tela escolheria uma das
 * duas frases no chute e estaria errada com metade das pessoas — e o aluno
 * sem cliente favoritado ficaria esperando por uma vaga que nunca
 * destravaria nada.
 *
 * ⚠️ `src/lib/data/sessoes.ts` (fatia 3, do `juan`) é a camada de leitura
 * desta feature e **não tem** um wrapper para esta RPC. Não a edito: são dois
 * agentes no mesmo arquivo, que é como se publica trabalho não revisado do
 * outro. Está no relatório como pedido de campo — o lugar natural dela é lá,
 * e esta função sai daqui no dia em que aparecer.
 *
 * 🔑 A guarda continua sendo do banco: `gps.sessao_pode_agendar` é
 * `security definer` com `search_path` vazio e chama
 * `gps.etapa_liberada_para`, que tem guarda própria (admin OU o próprio
 * aluno, falhando FECHADO sem JWT). Isto aqui decide TEXTO DE TELA, nunca
 * permissão — quem agenda de fato passa pela mesma função dentro de
 * `gps.sessao_agendar`.
 */
export async function getClienteElegivel(
  alunoId: string,
  tipoId: number,
): Promise<{ clienteId: string | null; falhou: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("sessao_pode_agendar", { p_aluno_id: alunoId, p_tipo_id: tipoId });

  if (error) {
    logErro("getClienteElegivel", error, {
      rpc: "gps.sessao_pode_agendar",
      tipoId,
    });
    // 🔴 `falhou` SEPARADO de `clienteId: null`. A consulta ter falhado NÃO
    // prova que o aluno é inelegível — dizer "você ainda não pode agendar"
    // para quem pode é a mesma mentira que o portal já pagou caro quando
    // `getContextoSessao` engolia o `error` e transformava falha de rede em
    // "sem acesso" (corrigido em 16/09). Quem chama mostra "não deu para
    // conferir agora", não um veredito.
    return { clienteId: null, falhou: true };
  }

  // A RPC devolve o uuid do cliente elegível, ou NULL.
  const id = typeof data === "string" && data.length > 0 ? data : null;
  return { clienteId: id, falhou: false };
}
