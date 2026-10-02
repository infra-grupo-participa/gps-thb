import { headers } from "next/headers";
import { getAjudaAtiva, getAjudaPorRota } from "@/lib/data/ajuda";
import { rotaDeAjuda, type ArtigoAjuda } from "@/lib/ajuda-tipos";

/**
 * Lê, NO SERVIDOR, o que o botão "Como faço?" precisa — e devolve `null`
 * quando ele não deve aparecer. Chamada pelo `AppHeader` só para o parceiro.
 *
 * Custo: 2 RPCs por render de página do parceiro (`gps.ajuda_ativo` e
 * `gps.ajuda_por_rota`), em paralelo e memoizadas por requisição (`cache()`):
 * a página de Suporte, que também lê o interruptor, não paga a 2ª vez.
 * Abrir o painel não consulta nada.
 *
 * A rota vem do header `x-gps-rota`, gravado pelo proxy
 * (`src/lib/supabase/middleware.ts`) a cada requisição.
 *
 * 🔴 Falha FECHADA: interruptor desligado, leitura com `{ ok: false }` ou
 * qualquer exceção → nada na tela. Ajuda a menos nunca derruba o header.
 */
export async function lerAjudaDaTela(): Promise<{ rota: string; artigos: ArtigoAjuda[] } | null> {
  try {
    const bruta = (await headers()).get("x-gps-rota");
    const rota = rotaDeAjuda(bruta);
    if (!rota) return null;
    const [ativa, leitura] = await Promise.all([getAjudaAtiva(), getAjudaPorRota(rota)]);
    if (!ativa || !leitura.ok) return null;
    return { rota, artigos: leitura.dados };
  } catch {
    return null;
  }
}
