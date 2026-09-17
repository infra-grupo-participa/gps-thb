/**
 * Minutas da ficha do cliente — tipos e limites.
 *
 * Decisão do Marcio (15/09/2026): a minuta é anexada na ficha do CLIENTE
 * (`gps.etapa1_clientes`), não na tarefa da Etapa 05. **Só PDF** — o parceiro
 * exporta o Word em PDF antes de anexar; `.docx` não é liberado. **Várias
 * versões por cliente**, com histórico visível e data: cada envio é uma
 * versão NOVA, as anteriores ficam (não é "substitui como o contrato").
 *
 * Arquivo SEM `server-only` de propósito: um componente client (o campo de
 * upload) precisa do MIME único, do teto de 5 MB e da extensão ANTES de
 * subir o arquivo. Nada aqui lê banco nem sessão.
 *
 * 🔑 Cada limite daqui existe TAMBÉM no banco (bucket `gps-minutas` +
 * `gps.cliente_minuta_anexar`). Estas constantes são para a mensagem chegar
 * boa ao usuário — nunca são a barreira: Server Action é endpoint HTTP e o
 * upload direto ao Storage é uma requisição do navegador.
 *
 * ⚠️ NÃO confundir com o CONTRATO da ficha (`contrato_*`, migração ...214):
 * o contrato é UM anexo travado (tudo-ou-nada, substitui). A minuta é N
 * anexos com histórico — por isso é TABELA própria (`gps.cliente_minutas`),
 * não mais 5 colunas na ficha.
 */

/** Único MIME aceito. Não é união de literais com mais opções: é PDF, ponto —
 * o Marcio foi explícito ("Ele exporta o Word em PDF antes de anexar"). */
export const MINUTA_MIME = "application/pdf" as const;
export type MinutaMime = typeof MINUTA_MIME;

export function ehMinutaMime(v: string): v is MinutaMime {
  return v === MINUTA_MIME;
}

export const MINUTA_EXTENSAO = "pdf" as const;

export const MINUTA_TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const BUCKET_MINUTAS = "gps-minutas";

/**
 * Contexto obrigatório da minuta (decisão do Marcio, 17/09/2026 — migração
 * `20260917000273`). Mesmo teto de `notas`: 2000 caracteres por campo. A
 * OBRIGATORIEDADE em si (1ª minuta exige `caso`/`oQueFoiFeito`/`pontoDeAjuda`;
 * da 2ª em diante exige `oQueMudou`) é decidida pela RPC
 * `gps.cliente_minuta_anexar` — este arquivo só valida TAMANHO local, nunca
 * replica a obrigatoriedade (a fronteira é o banco; duas verdades divergem
 * no dia em que o interruptor `minuta_contexto_obrigatorio` mudar).
 */
export const MINUTA_CONTEXTO_MAXIMO = 2000;

/** `<ambiente_aluno_id>/<uuid>.pdf` — o MESMO formato que o CHECK e a policy
 * exigem. Só uma extensão possível (PDF), ao contrário do padrão de 4 MIMEs
 * do chamado/onboarding/contrato. */
export const MINUTA_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/** Nota da minuta — orientação do parceiro sobre o que mudou, NÃO validada
 * nem comparada pelo sistema (é texto livre para a equipe, ver `notas` na
 * migração). Mesmo teto de motivo usado noutras notas curtas do produto. */
export const MINUTA_NOTA_MAXIMO = 2000;

/**
 * Tira separador de caminho e caractere de controle do nome que o usuário
 * mandou, e corta em 120 — mesmo contrato de `nomeDeArquivoSeguro`
 * (`src/lib/chamados-tipos.ts`). Cópia deliberada e não import: minutas não
 * usa bucket nem CHECK compartilhado com chamado/onboarding/contrato (é PDF
 * só, bucket próprio), então acoplar os dois módulos por essa função criaria
 * uma dependência sem propósito — mudar o teto de nome de um não deveria
 * exigir revisar o outro.
 */
export function nomeDeMinutaSeguro(nome: string): string {
  const limpo = Array.from(nome ?? "")
    .filter((c) => {
      if (c === "/" || c === "\\") return false;
      const cod = c.charCodeAt(0);
      return cod >= 32 && cod !== 127;
    })
    .join("")
    .trim();
  return limpo.slice(0, 120);
}

/**
 * Uma versão de minuta na ficha do cliente. Sem UPDATE de conteúdo: cada
 * envio é uma linha nova (o histórico É a lista de linhas). `admin_remover`
 * tira a LINHA (DELETE físico, mesmo padrão de `gps.onboarding_remover_anexo`
 * e do contrato) — o BYTE continua no bucket até o expurgo do admin (B-R1):
 * SQL não apaga arquivo no object store.
 */
export interface ClienteMinuta {
  id: string;
  cliente_id: string;
  path: string;
  nome: string;
  tamanho: number;
  notas: string | null;
  enviado_em: string;
  enviado_por: string | null;
  /** `true` quando quem enviou foi a equipe (modo assistência), não o aluno. */
  enviado_pela_equipe: boolean;
  /** Só preenchido na 1ª minuta do cliente (contexto obrigatório, 17/09/2026). */
  caso: string | null;
  /** Só preenchido na 1ª minuta do cliente (contexto obrigatório, 17/09/2026). */
  o_que_foi_feito: string | null;
  /** Só preenchido na 1ª minuta do cliente (contexto obrigatório, 17/09/2026). */
  ponto_de_ajuda: string | null;
  /** Só preenchido a partir da 2ª minuta do cliente (contexto obrigatório, 17/09/2026). */
  o_que_mudou: string | null;
}

/** "3,7 MB" — mesmo formato de `tamanhoLegivel` de `chamados-tipos.ts`,
 * copiado pelo mesmo motivo de não acoplar os dois módulos. */
export function minutaTamanhoLegivel(bytes: number | null): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
