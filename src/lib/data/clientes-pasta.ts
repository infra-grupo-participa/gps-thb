import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";

/**
 * Última modificação na pasta do Drive de cada cliente da página
 * (`gps.vw_cliente_drive_atividade`, `security_invoker`: uma linha por
 * cliente e subpasta). Uma consulta só, `.in("cliente_id", ids)`, só duas
 * colunas; a maior `ultima_modificacao_em` por cliente sai no TS.
 *
 * Falha NÃO derruba a lista: devolve mapa vazio e registra. Cliente ausente
 * do mapa = a tela mostra "—" (sem dado ≠ erro afirmado).
 */
export async function getUltimaModificacaoPasta(
  clienteIds: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (clienteIds.length === 0) return mapa;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("gps")
      .from("vw_cliente_drive_atividade")
      .select("cliente_id, ultima_modificacao_em")
      .in("cliente_id", clienteIds);
    if (error) {
      logErro("getUltimaModificacaoPasta", error, {
        clientes: clienteIds.length,
      });
      return mapa;
    }
    for (const l of (data ?? []) as {
      cliente_id: string;
      ultima_modificacao_em: string | null;
    }[]) {
      const em = l.ultima_modificacao_em;
      if (!em) continue;
      const atual = mapa.get(l.cliente_id);
      // Instante, não string: offsets diferentes quebrariam a comparação lexical.
      if (!atual || new Date(em).getTime() > new Date(atual).getTime()) {
        mapa.set(l.cliente_id, em);
      }
    }
  } catch (e) {
    logErro("getUltimaModificacaoPasta", e, { clientes: clienteIds.length });
    return new Map();
  }
  return mapa;
}
