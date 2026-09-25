// Pasta do aluno no Google Drive.
//
// O catálogo `ESTRUTURA_PASTA` (a "PASTA PADRÃO", 6 seções) saiu em 09/09:
// o card "Como sua pasta é organizada" foi removido da UI em 07/2026 e o
// dado ficou dois meses sem nenhum leitor. Catálogo sem tela é documentação
// disfarçada de código — a estrutura de referência vive no Drive.
//
// A pré-visualização embutida (`embeddedfolderview`) saiu em 25/09/2026: a aba
// do aluno passou a abrir o Drive direto (`/pasta/abrir`), e o iframe só
// renderizava com a pasta compartilhada por link — vinha vazio nas privadas.

/**
 * O link aponta para o Google Drive/Docs, em HTTPS? Mesma regra na gravação
 * (`salvarPastaDriveUrl`) e na leitura (`/pasta/abrir`, antes do redirect).
 */
export function ehUrlDoDrive(url: string): boolean {
  return /^https:\/\/(drive|docs)\.google\.com\//.test(url);
}
