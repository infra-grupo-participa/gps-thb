// Pasta do aluno no Google Drive: só o que a UI usa hoje — a URL de
// pré-visualização embutida.
//
// O catálogo `ESTRUTURA_PASTA` (a "PASTA PADRÃO", 6 seções) saiu em 09/09:
// o card "Como sua pasta é organizada" foi removido da UI em 07/2026 e o
// dado ficou dois meses sem nenhum leitor. Catálogo sem tela é documentação
// disfarçada de código — a estrutura de referência vive no Drive.

/** Extrai o ID de uma URL de pasta do Google Drive. */
function idPastaDrive(url: string | null | undefined): string | null {
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
