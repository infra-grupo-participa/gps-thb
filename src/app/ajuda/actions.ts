"use server";

/**
 * Central de ajuda — Server Actions do PARCEIRO (Onda 5, 02/10/2026).
 *
 * 🔴 Server Action é ENDPOINT HTTP. A fronteira real é o banco:
 *  - `gps.ajuda_buscar` (DEFINER com `where ativo` + guarda de `auth.uid()`);
 *  - `gps.ajuda_registrar_feedback` (DEFINER, pessoa = `auth.uid()`, teto de
 *    30 por pessoa/hora, artigo precisa existir e estar ativo).
 * As checagens daqui só poupam ida ao banco e dão a frase certa.
 *
 * Sem `getContextoSessao()` de propósito: ela custa `getUser` + 2 selects por
 * chamada (ação = requisição nova, o `cache()` não ajuda) e não acrescenta
 * barreira — sem sessão o PostgREST chama como `anon`, que não tem EXECUTE
 * nas RPCs (42501, traduzido por `traduzirErroBanco`).
 *
 * ⚠️ Módulo `"use server"`: só exporta `async function`. Tipos e constantes
 * moram em `src/lib/ajuda-tipos.ts` (3 quedas de produção por isso).
 */

import { createClient } from "@/lib/supabase/server";
import { traduzirErroBanco } from "@/lib/erros";
import { logAviso } from "@/lib/log";
import {
  buscaAjudaValida,
  ehCategoriaAjuda,
  ehOrigemAjuda,
  ehUuid,
  normalizarTermoAjuda,
  rotaDeAjuda,
  type EntradaFeedbackAjuda,
  type ResultadoAcaoAjuda,
  type ResultadoBuscaAcao,
  type ResultadoBuscaAjuda,
} from "@/lib/ajuda-tipos";

/** Frases literais dos `raise exception` da migração `…342`. */
const FRASES_AJUDA: Record<string, string> = {
  "Artigo não encontrado.": "Este artigo não está mais disponível. Atualize a página.",
  "Origem da avaliação inválida.":
    "Não foi possível registrar agora. Atualize a página e tente de novo.",
  "Muitas avaliações em pouco tempo. Tente de novo mais tarde.":
    "Muitas avaliações em pouco tempo. Tente de novo mais tarde.",
};

interface LinhaBusca {
  id: string;
  titulo: string;
  corpo: string;
  rotas: string[] | null;
  categorias: string[] | null;
  ordem: number;
  relevancia: number;
}

/**
 * Busca na central de ajuda. Até 5 resultados, do mais relevante ao menos.
 * `q` com menos de 3 caracteres úteis → `{ ok: true, resultados: [] }` sem ida
 * ao banco. `rota` (pathname cru) e `categoria` só dão bônus de ordenação.
 *
 * Não registra nada: busca sem resultado é registrada pelo front com
 * `registrarFeedbackAjuda({ artigoId: null, resolveu: false, origem: "busca", termo })`
 * quando a pessoa CONCLUI a busca (enter/debounce final), nunca por tecla.
 */
export async function buscarAjuda(
  q: string,
  rota?: string | null,
  categoria?: string | null,
): Promise<ResultadoBuscaAcao> {
  const termo = normalizarTermoAjuda(typeof q === "string" ? q : "");
  if (!buscaAjudaValida(termo)) return { ok: true, resultados: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("ajuda_buscar", {
    p_q: termo,
    p_rota: typeof rota === "string" ? rotaDeAjuda(rota) : null,
    p_categoria: ehCategoriaAjuda(categoria) ? categoria : null,
  });
  if (error) {
    return { ok: false, erro: traduzirErroBanco("ajuda/buscarAjuda", error, undefined, FRASES_AJUDA) };
  }

  const resultados: ResultadoBuscaAjuda[] = ((data ?? []) as LinhaBusca[]).map((l) => ({
    id: l.id,
    titulo: l.titulo,
    corpo: l.corpo,
    rotas: l.rotas ?? [],
    categorias: (l.categorias ?? []).filter(ehCategoriaAjuda),
    ordem: l.ordem,
    relevancia: Number(l.relevancia) || 0,
  }));
  return { ok: true, resultados };
}

/**
 * Registra uso da ajuda pela pessoa logada:
 *  - vista: `{ artigoId, resolveu: null, origem }` ao abrir o artigo;
 *  - "isso resolveu?": `{ artigoId, resolveu: true|false, origem }`;
 *  - busca vazia: `{ artigoId: null, resolveu: false, origem: "busca", termo }`.
 *
 * Teto de 30 por pessoa/hora: acima disso devolve `{ ok:false }` com a frase —
 * para VISTA, o front pode ignorar o erro em silêncio (não é ação da pessoa).
 * Admin e interruptor desligado: o banco não grava e devolve sucesso.
 */
export async function registrarFeedbackAjuda(
  entrada: EntradaFeedbackAjuda,
): Promise<ResultadoAcaoAjuda> {
  if (!entrada || !ehOrigemAjuda(entrada.origem)) {
    return { ok: false, erro: FRASES_AJUDA["Origem da avaliação inválida."] };
  }
  if (entrada.termo != null && typeof entrada.termo !== "string") {
    return { ok: false, erro: FRASES_AJUDA["Artigo não encontrado."] };
  }
  const artigoId = entrada.artigoId ?? null;
  if (artigoId !== null && !ehUuid(artigoId)) {
    return { ok: false, erro: FRASES_AJUDA["Artigo não encontrado."] };
  }
  const resolveu =
    entrada.resolveu === true || entrada.resolveu === false ? entrada.resolveu : null;
  const termo = normalizarTermoAjuda(entrada.termo) || null;
  if (artigoId === null && (entrada.origem !== "busca" || !termo)) {
    return { ok: false, erro: FRASES_AJUDA["Artigo não encontrado."] };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("ajuda_registrar_feedback", {
    p_artigo: artigoId,
    p_resolveu: resolveu,
    p_origem: entrada.origem,
    p_termo: termo,
  });
  if (error) {
    if (error.code === "P0001") {
      // Teto por hora: previsto, não é falha do sistema — log sem alarde.
      logAviso("ajuda/registrarFeedbackAjuda", "teto de 30 por hora atingido");
      return { ok: false, erro: FRASES_AJUDA["Muitas avaliações em pouco tempo. Tente de novo mais tarde."] };
    }
    return {
      ok: false,
      erro: traduzirErroBanco("ajuda/registrarFeedbackAjuda", error, undefined, FRASES_AJUDA),
    };
  }
  return { ok: true };
}
