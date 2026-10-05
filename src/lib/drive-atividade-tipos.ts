// Atividade da pasta do cliente no Drive (view `gps.vw_cliente_drive_atividade`,
// migração …349) — tipos e regras puras. Sem `server-only` e sem `"use client"`:
// a leitura (`src/lib/data/drive-atividade.ts`) monta, o card
// (`src/components/clientes/pasta-atividade.tsx`) exibe, e o teste roda no Node.

import {
  CATALOGO_TRAJETORIA,
  ehCodigoEtapaCliente,
  type CodigoEtapaCliente,
} from "@/lib/trajetoria-tipos";

/** As 6 subpastas fixas da pasta do cliente, na ordem do Drive. */
export const SUBPASTAS_CLIENTE = [
  { codigo: "01", nome: "Documentos recebidos" },
  { codigo: "02", nome: "Viabilidade e Croqui" },
  { codigo: "03", nome: "Minutas" },
  { codigo: "04", nome: "ITCMD e ITBI" },
  { codigo: "05", nome: "Junta Comercial" },
  { codigo: "06", nome: "Entrega" },
] as const;

export type CodigoSubpasta = (typeof SUBPASTAS_CLIENTE)[number]["codigo"];

/**
 * Espelho do mapa da view (…349): 03 → elaboracao_minutas, 05 →
 * junta_comercial, 06 → entrega_pasta. O banco decide QUANDO sugerir; isto
 * só diz de que subpasta veio a sugestão, para a frase.
 */
const SUBPASTA_DA_ETAPA: Partial<Record<CodigoEtapaCliente, CodigoSubpasta>> = {
  elaboracao_minutas: "03",
  junta_comercial: "05",
  entrega_pasta: "06",
};

/** Uma linha da view, só com as colunas que a leitura pede. */
export interface LinhaAtividadeDrive {
  subpasta: string;
  arquivos: number;
  ultima_modificacao_em: string | null;
  ultima_modificacao_por: string | null;
  ultima_alteracao_03_em: string | null;
  sugere_etapa: string | null;
}

export interface SubpastaAtividade {
  /** `raiz` ou `01`..`06`, como vem da view. */
  subpasta: string;
  arquivos: number;
  ultimaEm: string | null;
  ultimoPor: string | null;
}

export interface AtividadeDrive {
  ultimaMinuta: { em: string; por: string | null } | null;
  /** Só as subpastas que a view devolveu. Vazio = nada lido na pasta. */
  subpastas: SubpastaAtividade[];
  sugestoes: CodigoEtapaCliente[];
  /**
   * Relógio da LEITURA (servidor), em ms. O "há 2 horas" é calculado contra
   * ele, e não contra `Date.now()` no render: o mesmo número serve a SSR e a
   * hidratação.
   */
  lidoEm: number;
}

/** Linhas da view → atividade. Sugestão desconhecida ou repetida é descartada. */
export function montarAtividade(
  linhas: LinhaAtividadeDrive[],
  lidoEm: number,
): AtividadeDrive {
  // `ultima_alteracao_03_em` é POR CLIENTE (repetida em toda linha) e conta
  // remoção; o "por" só existe na linha da 03 (último arquivo vivo dela).
  const em03 = linhas.find(
    (l) => l.ultima_alteracao_03_em,
  )?.ultima_alteracao_03_em;
  const linha03 = linhas.find((l) => l.subpasta === "03");
  const sugestoes: CodigoEtapaCliente[] = [];
  for (const l of linhas) {
    const s = l.sugere_etapa;
    if (ehCodigoEtapaCliente(s) && !sugestoes.includes(s)) sugestoes.push(s);
  }
  return {
    ultimaMinuta: em03
      ? { em: em03, por: linha03?.ultima_modificacao_por ?? null }
      : null,
    subpastas: linhas.map((l) => ({
      subpasta: l.subpasta,
      arquivos: l.arquivos ?? 0,
      ultimaEm: l.ultima_modificacao_em,
      ultimoPor: l.ultima_modificacao_por,
    })),
    sugestoes,
    lidoEm,
  };
}

/** As 6 subpastas sempre, na ordem; a que não veio na view sai com 0 arquivos. */
export function listarSubpastas(subpastas: SubpastaAtividade[]): {
  codigo: CodigoSubpasta;
  rotulo: string;
  arquivos: number;
  ultimaEm: string | null;
}[] {
  return SUBPASTAS_CLIENTE.map((s) => {
    const l = subpastas.find((x) => x.subpasta === s.codigo);
    return {
      codigo: s.codigo,
      rotulo: `${s.codigo} ${s.nome}`,
      arquivos: l?.arquivos ?? 0,
      ultimaEm: l?.ultimaEm ?? null,
    };
  });
}

/**
 * "sem movimento recente", "1 arquivo novo ou alterado", "3 arquivos novos ou
 * alterados". A contagem só vê o que mexeu DEPOIS que a leitura foi ligada; o
 * que já existia não é inventariado. Zero NUNCA vira "nenhum arquivo".
 */
export function rotuloArquivos(n: number): string {
  if (n <= 0) return "sem movimento recente";
  return n === 1
    ? "1 arquivo novo ou alterado"
    : `${n} arquivos novos ou alterados`;
}

/** "Apareceu arquivo em 05 Junta Comercial. Marcar a etapa Junta Comercial?" */
export function fraseSugestao(etapa: CodigoEtapaCliente): string {
  const nome = nomeEtapa(etapa);
  const cod = SUBPASTA_DA_ETAPA[etapa];
  const sub = SUBPASTAS_CLIENTE.find((s) => s.codigo === cod);
  const onde = sub ? `${sub.codigo} ${sub.nome}` : "na pasta do cliente";
  return `Apareceu arquivo em ${onde}. Marcar a etapa ${nome}?`;
}

export function nomeEtapa(etapa: CodigoEtapaCliente): string {
  return CATALOGO_TRAJETORIA.find((e) => e.codigo === etapa)?.nome ?? etapa;
}
