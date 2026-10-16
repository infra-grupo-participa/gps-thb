import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import { mapearLinhaAtencao, type LinhaAtencao } from "@/lib/atencao-acoes";

/**
 * As linhas do painel "Precisa de atenção" — UMA chamada a
 * `gps.admin_atencao_acoes()` (…392), base inteira de parceiros.
 *
 * `null` em falha: a tela diz que não carregou em vez de mostrar quatro cards
 * zerados (zero é indistinguível de "ninguém travado").
 */
export async function getAtencaoAcoes(): Promise<LinhaAtencao[] | null> {
  if (!(await ehAdmin())) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_atencao_acoes");

  if (error) {
    logErro("getAtencaoAcoes", error, {
      rpc: "gps.admin_atencao_acoes",
      efeito: "aba 'Precisa de atenção' mostra aviso no lugar dos cards de ação",
    });
    return null;
  }

  return ((data ?? []) as Record<string, unknown>[]).map(mapearLinhaAtencao);
}
