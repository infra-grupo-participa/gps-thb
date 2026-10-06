// Trajetória do cliente (`gps.cliente_etapa_tipos` + `gps.cliente_trajetoria`,
// migração …345) — catálogo tipado, tipos de leitura e a regra pura de
// "pendente". Moram aqui, e não em `trajetoria-actions.ts`, porque arquivo
// `"use server"` só pode exportar `async function`.
//
// 🔑 A trajetória DECIDE `etapa1_clientes.fase` (decisão do Marcio, 05/10/2026;
// supera o "trajetória ≠ fase" anterior). Um gatilho no banco recalcula a fase
// a cada etapa marcada/desmarcada — a etapa mais avançada manda:
// nada/Prospecção → `prospeccao`; Reunião Preliminar/Viabilidade/Croqui →
// `fechamento`; Execução e subetapas → `contratado` (rótulo "Execução");
// Entrega da pasta → `concluido`. A regra vive SÓ no banco; o front mostra e
// nunca grava `fase` (o gatilho de guarda recusa com 42501). Marcar etapa
// continua sendo só ato humano: nada é marcado sozinho.

/**
 * Espelho EXATO das 11 linhas do catálogo no banco (…345). O banco é a fonte
 * (a leitura da ficha usa o que vem de lá); este espelho existe para tipar as
 * actions e testar `calcularPendentes` sem banco. Mudou lá, muda aqui.
 */
export const CATALOGO_TRAJETORIA = [
  { codigo: "prospeccao", nome: "Prospecção", paiCodigo: null, ordem: 1 },
  {
    codigo: "reuniao_preliminar",
    nome: "Reunião Preliminar",
    paiCodigo: null,
    ordem: 2,
  },
  {
    codigo: "sessao_viabilidade",
    nome: "Sessão de Viabilidade",
    paiCodigo: null,
    ordem: 3,
  },
  {
    codigo: "croqui_estrutural",
    nome: "Croqui Estrutural",
    paiCodigo: null,
    ordem: 4,
  },
  { codigo: "execucao", nome: "Execução", paiCodigo: null, ordem: 5 },
  {
    codigo: "reuniao_inicial_execucao",
    nome: "Reunião Inicial de Execução",
    paiCodigo: "execucao",
    ordem: 1,
  },
  {
    codigo: "elaboracao_minutas",
    nome: "Elaboração das Minutas",
    paiCodigo: "execucao",
    ordem: 2,
  },
  {
    codigo: "junta_comercial",
    nome: "Junta Comercial",
    paiCodigo: "execucao",
    ordem: 3,
  },
  {
    codigo: "entrega_pasta",
    nome: "Entrega da pasta",
    paiCodigo: "execucao",
    ordem: 4,
  },
  {
    codigo: "processamento_itcmd",
    nome: "Processamento do ITCMD",
    paiCodigo: "elaboracao_minutas",
    ordem: 1,
  },
  {
    codigo: "processamento_itbi",
    nome: "Processamento do ITBI",
    paiCodigo: "elaboracao_minutas",
    ordem: 2,
  },
] as const;

export type CodigoEtapaCliente = (typeof CATALOGO_TRAJETORIA)[number]["codigo"];

const CODIGOS = new Set<string>(CATALOGO_TRAJETORIA.map((e) => e.codigo));

/** Guarda de runtime (Server Action é endpoint HTTP). A fronteira real é a RPC. */
export function ehCodigoEtapaCliente(v: unknown): v is CodigoEtapaCliente {
  return typeof v === "string" && CODIGOS.has(v);
}

/** Mínimo que `calcularPendentes` precisa de cada etapa do catálogo. */
export interface EtapaCatalogoBase {
  codigo: string;
  paiCodigo: string | null;
  /** Posição ENTRE IRMÃOS (no topo: 1..5). */
  ordem: number;
  /** `false` = aposentada no catálogo; nunca vira pendente. Ausente = ativa. */
  ativo?: boolean;
}

/**
 * Etapas de TOPO que ficaram para trás: as que vêm antes (pela `ordem` do
 * topo) da mais avançada já alcançada e que não foram alcançadas.
 *
 * - Uma marcação em subetapa conta para o TOPO dela (ex.: `junta_comercial`
 *   marcada ⇒ alcançou `execucao`, ordem 5) — mas NÃO marca a mãe.
 * - Topo "alcançado" = ele ou qualquer descendente marcado. Assim `execucao`
 *   com só uma filha marcada não aparece como pendente.
 * - Só o topo vira pendente; subetapas nunca (regra do plano: "pela ordem do topo").
 * - Etapa inativa nunca é pendente. Código marcado fora do catálogo é ignorado.
 *
 * Pura e determinística: devolve códigos na ordem do topo. Nada é gravado.
 */
export function calcularPendentes(
  catalogo: readonly EtapaCatalogoBase[],
  marcadas: Iterable<string>,
): string[] {
  const porCodigo = new Map<string, EtapaCatalogoBase>();
  for (const e of catalogo) porCodigo.set(e.codigo, e);

  const topoDe = (codigo: string): EtapaCatalogoBase | null => {
    let atual = porCodigo.get(codigo);
    // Teto de saltos: catálogo com ciclo (não deveria existir) não trava a ficha.
    for (let i = 0; atual && atual.paiCodigo !== null && i < 16; i++) {
      atual = porCodigo.get(atual.paiCodigo);
    }
    return atual && atual.paiCodigo === null ? atual : null;
  };

  const toposAlcancados = new Set<string>();
  let maxOrdem = -Infinity;
  for (const m of marcadas) {
    const topo = topoDe(m);
    if (!topo) continue;
    toposAlcancados.add(topo.codigo);
    if (topo.ordem > maxOrdem) maxOrdem = topo.ordem;
  }
  if (maxOrdem === -Infinity) return [];

  return catalogo
    .filter(
      (e) =>
        e.paiCodigo === null &&
        e.ativo !== false &&
        e.ordem < maxOrdem &&
        !toposAlcancados.has(e.codigo),
    )
    .sort((a, b) => a.ordem - b.ordem)
    .map((e) => e.codigo);
}

// ── Contrato de leitura (src/lib/data/trajetoria.ts) ─────────────────────

/** Um nó da árvore da trajetória, já com o estado deste cliente. */
export interface EtapaTrajetoria {
  codigo: string;
  nome: string;
  paiCodigo: string | null;
  ordem: number;
  /** `false` = aposentada; só aparece na árvore se estiver marcada. */
  ativo: boolean;
  marcada: boolean;
  /** ISO 8601 da marcação viva; `null` quando não marcada. */
  marcadoEm: string | null;
  /** Calculado por `calcularPendentes` — só topo pode ser `true`. */
  pendente: boolean;
  /** Subetapas, ordenadas por `ordem`. Folha = `[]`. */
  filhas: EtapaTrajetoria[];
}

export interface TrajetoriaCliente {
  /** Raiz da árvore: só as etapas de topo, por `ordem`. */
  etapas: EtapaTrajetoria[];
  /** Códigos marcados (vivos), em qualquer nível. */
  marcadas: string[];
  /** Códigos de topo pendentes, na ordem do topo. */
  pendentes: string[];
}

/**
 * Frases das exceções de `gps.cliente_trajetoria_marcar`/`_desmarcar`,
 * repassadas a `traduzirErroBanco`. A chave é a `message` exata do `raise`.
 */
/**
 * Chave = `message` EXATA do `raise` de
 * `gps.etapa1_clientes_acompanhamento_travado` (migração …305, linha 111).
 * Com a fase calculada, quem a dispara é DESMARCAR etapa do favorito
 * confirmado até o recálculo devolver `prospeccao`. Exportada para
 * `FRASES_DO_BANCO` (erros.ts) usar o MESMO texto — uma frase, um lugar.
 */
export const RAISE_FAVORITO_FASE_NAO_VOLTA =
  "A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.";
export const FRASE_FAVORITO_FASE_NAO_VOLTA =
  "Este cliente é o acompanhado pela equipe e já avançou: a fase dele não pode voltar para Prospecção. Para trocar, abra um chamado.";

export const FRASES_TRAJETORIA: Record<string, string> = {
  "Sessão expirada. Entre de novo.": "Sessão expirada. Entre de novo.",
  "Cliente não encontrado.": "Cliente não encontrado.",
  "Etapa inválida.": "Etapa inválida.",
  "Sem permissão.": "Sem permissão para alterar a trajetória deste cliente.",
  [RAISE_FAVORITO_FASE_NAO_VOLTA]: FRASE_FAVORITO_FASE_NAO_VOLTA,
};
