// Links do Drive na ficha do cliente (`gps.cliente_links_drive`) — tipos e
// constantes. Moram aqui, e não em `link-drive-actions.ts`, porque arquivo
// `"use server"` só pode exportar `async function`.

export const LINKS_DRIVE_MAXIMO = 20;
export const LINK_NOME_MAXIMO = 120;
export type OrigemLinkDrive = "equipe" | "parceiro";
export interface LinkDrive {
  id: string;
  nome: string;
  url: string;
  criadoEm: string;
  criadoPorNome: string;
  origem: OrigemLinkDrive;
  podeRemover: boolean;
}

/**
 * Frases das exceções de `gps.cliente_link_drive_adicionar`/`_remover`,
 * repassadas a `traduzirErroBanco` como `frasesExtras`. A chave é a `message`
 * exata do `raise exception`.
 */
/** Frase do banco E da tela para link fora do formato — um lugar só. */
export const FRASE_LINK_INVALIDO =
  "Cole o link do Drive (Compartilhar > Copiar link). Ele começa com drive.google.com/ ou docs.google.com/.";

export const FRASES_LINKS_DRIVE: Record<string, string> = {
  "O nome do link tem caractere inválido.": "O nome do link tem caractere inválido.",
  "No máximo 20 links por cliente.": "No máximo 20 links por cliente.",
  [FRASE_LINK_INVALIDO]: FRASE_LINK_INVALIDO,
  "Este link já está na ficha.": "Este link já está na ficha.",
  "Este link foi colocado pela equipe; peça a ela para remover.":
    "Este link foi colocado pela equipe; peça a ela para remover.",
  "Link não encontrado.": "Link não encontrado.",
};
