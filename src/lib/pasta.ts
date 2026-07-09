// Estrutura padrão da pasta do aluno no Google Drive (a "PASTA PADRÃO"),
// espelhando o processo da holding. Conteúdo de referência (sem custo de banco).

export interface SecaoPasta {
  ordem: string;
  titulo: string;
  descricao: string;
  /** etapa relacionada (para o aluno saber quando usar). */
  etapa?: number;
  subpastas?: string[];
}

export const ESTRUTURA_PASTA: SecaoPasta[] = [
  {
    ordem: "0",
    titulo: "Contrato",
    descricao: "Contrato de honorários e documentos da contratação.",
    etapa: 4,
  },
  {
    ordem: "1",
    titulo: "Documentos",
    descricao: "Documentos do cliente, organizados por natureza.",
    etapa: 3,
    subpastas: ["Documentos pessoais", "Imóveis", "Empresas"],
  },
  {
    ordem: "2",
    titulo: "Vídeos das reuniões",
    descricao: "Gravações das reuniões (preliminar e apresentação do croqui).",
    etapa: 2,
  },
  {
    ordem: "3",
    titulo: "Croqui",
    descricao: "Croqui estrutural elaborado e sua versão final.",
    etapa: 3,
  },
  {
    ordem: "4",
    titulo: "Minutas",
    descricao: "Minutas das células e do acordo de sócios.",
    etapa: 5,
    subpastas: [
      "Célula Cofre",
      "Célula Veículo",
      "Célula Destino",
      "Acordo de Sócios",
    ],
  },
  {
    ordem: "5",
    titulo: "Pasta de entrega",
    descricao: "Documentos finais que compõem a entrega ao cliente.",
    etapa: 6,
  },
];

/** Extrai o ID de uma URL de pasta do Google Drive. */
export function idPastaDrive(url: string | null | undefined): string | null {
  if (!url) return null;
  const m =
    url.match(/\/folders\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/** URL de pré-visualização embutida (iframe) de uma pasta do Drive. */
export function embedPastaDrive(url: string | null | undefined): string | null {
  const id = idPastaDrive(url);
  return id
    ? `https://drive.google.com/embeddedfolderview?id=${id}#grid`
    : null;
}
