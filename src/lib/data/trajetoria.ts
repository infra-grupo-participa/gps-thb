import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import {
  calcularPendentes,
  type EtapaTrajetoria,
  type TrajetoriaCliente,
} from "@/lib/trajetoria-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Trajetória da ficha do cliente (…345). Leitura só; a escrita é
// `src/app/clientes/trajetoria-actions.ts` (RPCs).
//
// UMA ida ao banco: o catálogo com as marcações vivas embutidas (embed do
// PostgREST pela FK `cliente_trajetoria.etapa_codigo`), filtradas por
// `cliente_id` e `desmarcado_em is null` DENTRO do embed — etapa sem marcação
// volta com `cliente_trajetoria: []` (left join), não some.
//
// A GUARDA É A RLS (admin ou membro do ambiente do cliente), com a sessão de
// quem chama. Nada de `service_role`. Cliente de outro ambiente chega com
// todas as etapas desmarcadas — quem barra a ficha é a página.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS =
  "codigo, nome, pai_codigo, ordem, ativo, cliente_trajetoria(etapa_codigo, marcado_em)";

interface LinhaEtapa {
  codigo: string;
  nome: string;
  pai_codigo: string | null;
  ordem: number;
  ativo: boolean;
  cliente_trajetoria: { etapa_codigo: string; marcado_em: string }[] | null;
}

/**
 * Árvore da trajetória de UM cliente + pendentes calculados.
 * Falha de leitura devolve `null` (com `logErro`), nunca uma trajetória vazia:
 * "nada marcado" é afirmação sobre o cliente, e falha não prova isso.
 */
export async function getTrajetoriaDoCliente(
  clienteId: string,
): Promise<TrajetoriaCliente | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("cliente_etapa_tipos")
    .select(COLUNAS)
    .eq("cliente_trajetoria.cliente_id", clienteId)
    .is("cliente_trajetoria.desmarcado_em", null)
    .order("ordem", { ascending: true });

  if (error) {
    logErro("getTrajetoriaDoCliente", error, { clienteId });
    return null;
  }
  return montarTrajetoria((data ?? []) as unknown as LinhaEtapa[]);
}

function montarTrajetoria(linhas: LinhaEtapa[]): TrajetoriaCliente {
  const marcadoEm = new Map<string, string>();
  for (const l of linhas) {
    const m = l.cliente_trajetoria?.[0];
    if (m) marcadoEm.set(l.codigo, m.marcado_em);
  }
  const marcadas = [...marcadoEm.keys()];
  // ⚠️ SEM o funil de origem: esta leitura corre no mesmo `Promise.all` que a
  // do cliente e não o conhece (buscar seria uma query a mais por ficha). A
  // page aplica `comFunilOrigem(trajetoria, cliente.funil_origem)` depois — e a
  // ficha recalcula de novo no client a cada clique, com a mesma função.
  const pendentes = calcularPendentes(
    linhas.map((l) => ({
      codigo: l.codigo,
      paiCodigo: l.pai_codigo,
      ordem: l.ordem,
      ativo: l.ativo,
    })),
    marcadas,
  );
  const pend = new Set(pendentes);

  // Aposentada só entra na árvore se estiver marcada (a marcação antiga
  // continua visível e desmarcável).
  const visiveis = linhas.filter((l) => l.ativo || marcadoEm.has(l.codigo));
  const filhasDe = (pai: string | null): EtapaTrajetoria[] =>
    visiveis
      .filter((l) => l.pai_codigo === pai)
      .sort((a, b) => a.ordem - b.ordem)
      .map((l) => ({
        codigo: l.codigo,
        nome: l.nome,
        paiCodigo: l.pai_codigo,
        ordem: l.ordem,
        ativo: l.ativo,
        marcada: marcadoEm.has(l.codigo),
        marcadoEm: marcadoEm.get(l.codigo) ?? null,
        pendente: pend.has(l.codigo),
        filhas: filhasDe(l.codigo),
      }));

  return { etapas: filhasDe(null), marcadas, pendentes };
}
