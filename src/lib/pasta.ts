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
 * Contas da equipe com que o parceiro compartilha a pasta antes de colar o
 * link (Marcio, 30/09/2026). Sem isso a equipe abre o link e cai em "Você
 * precisa de acesso". Mostradas na tela do parceiro (`pasta-parceiro-form`).
 */
export const EMAILS_EQUIPE_PASTA = [
  "cristiane@advmais.com",
  "aldri@advmais.com",
  "isabela@advmais.com",
] as const;

/** Teto de tamanho do link — o mesmo do CHECK no banco. */
const PASTA_URL_MAXIMO = 2048;

/**
 * O link aponta para o Google Drive/Docs, em HTTPS? Mesma regra na gravação
 * (`salvarPastaDriveUrl`, `salvarMinhaPasta`) e na leitura (`/pasta/abrir`,
 * antes do redirect).
 *
 * 🔗 ESPELHO de três lugares que têm de continuar idênticos (migração
 * `20260930180726_gps_pasta_drive_pelo_parceiro`): o CHECK
 * `ambientes_pasta_drive_url_formato` e o IF de `gps.pasta_drive_definir`.
 * A fronteira é o banco; esta função existe para o erro chegar em português
 * e para `/pasta/abrir` não redirecionar para valor antigo fora da regra.
 *
 * Recusa `https://(drive|docs).google.com/url…` — é o redirecionador do
 * Google (`/url?q=<qualquer site>`): aceitá-lo faria `/pasta/abrir` virar
 * redirect aberto a partir do nosso domínio. Recusa também espaço em branco.
 */
export function ehUrlDoDrive(url: string): boolean {
  return (
    /^https:\/\/(drive|docs)\.google\.com\//.test(url) &&
    !/^https:\/\/(drive|docs)\.google\.com\/url/.test(url) &&
    // `/x/../url` e `%2e%2e` são normalizados para `/url` pelo navegador e
    // pelo `new URL()` do redirect; barra invertida idem. Mesmo termo no banco.
    !/(\/\.{1,2}(\/|\?|#|$)|%2e|\\)/i.test(url) &&
    !/\s/.test(url) &&
    url.length <= PASTA_URL_MAXIMO
  );
}

/**
 * Frases das exceções de `gps.pasta_drive_definir`, repassadas a
 * `traduzirErroBanco` como `frasesExtras` (sem isso a frase do banco cairia na
 * genérica). A chave é a `message` exata do `raise exception`.
 */
export const FRASES_PASTA_DRIVE: Record<string, string> = {
  "A pasta já foi definida pela equipe.": "A pasta já foi definida pela equipe.",
  "O link mudou enquanto você editava; recarregue.":
    "O link mudou enquanto você editava; recarregue.",
  "Informe um link válido do Google Drive.": "Informe um link válido do Google Drive.",
  "Informe o link da pasta.": "Informe o link da pasta.",
  "Ambiente não encontrado.": "Ambiente não encontrado.",
  "Ambiente não informado.": "Ambiente não informado.",
  "Sessão expirada. Entre de novo.": "Sessão expirada. Entre de novo.",
};
