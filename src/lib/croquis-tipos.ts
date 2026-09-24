/**
 * Croquis da ficha do cliente — tipos e limites.
 *
 * O croqui é a folha (PDF) apresentada ao cliente, em **N versões com
 * histórico**: cada envio é uma versão NOVA, as anteriores ficam. Molde
 * literal de `src/lib/minutas-tipos.ts` (migração `…309` copia a `…259`) com
 * **dois desvios**, e só eles:
 *
 *   1. bucket próprio `gps-croquis` (não `gps-minutas`) — o `bucket_id` é o
 *      que uma policy de `storage.objects` discrimina, e uma policy cobrindo
 *      dois buckets teria de afrouxar a guarda de um para caber o outro;
 *   2. campos próprios da versão: `apresentado_em` (o DIA do ato daquela
 *      folha) e `observacoes` (texto sobre ESTA folha). **Nenhum contexto
 *      obrigatório** — a regra da `…273` (caso / o que foi feito / ponto de
 *      ajuda / o que mudou) é da MINUTA e não se replica aqui.
 *
 * Arquivo SEM `server-only` de propósito: o campo de upload é componente
 * client e precisa do MIME, do teto de 5 MB e da extensão ANTES de subir.
 * Nada aqui lê banco nem sessão.
 *
 * 🔑 Cada limite daqui existe TAMBÉM no banco (bucket `gps-croquis` +
 * `gps.cliente_croqui_anexar`). Estas constantes são para a mensagem chegar
 * boa ao usuário — **nunca** são a barreira: Server Action é endpoint HTTP e
 * o upload direto ao Storage é uma requisição do navegador.
 */

/** Único MIME aceito — a allowlist do bucket `gps-croquis` é `{application/pdf}`. */
export const CROQUI_MIME = "application/pdf" as const;
export type CroquiMime = typeof CROQUI_MIME;

export function ehCroquiMime(v: string): v is CroquiMime {
  return v === CROQUI_MIME;
}

export const CROQUI_EXTENSAO = "pdf" as const;

export const CROQUI_TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const BUCKET_CROQUIS = "gps-croquis";

/**
 * Teto de `observacoes` — o mesmo 2000 do CHECK
 * `chk_cliente_croquis_observacoes` e do `raise` dentro de
 * `gps.cliente_croqui_anexar`. Mudar aqui sem mudar os dois faz a tela
 * aceitar texto que o banco recusa com 23514.
 */
export const CROQUI_OBSERVACOES_MAXIMO = 2000;

/** `<ambiente_aluno_id>/<uuid>.pdf` — o MESMO formato que o CHECK
 * `chk_cliente_croquis_path`, a policy `gps_croquis_insert` e a RPC exigem. */
export const CROQUI_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/**
 * Tira separador de caminho e caractere de controle do nome que o usuário
 * mandou, e corta em 120 — mesmo contrato de `nomeDeMinutaSeguro`
 * (`src/lib/minutas-tipos.ts`) e de `nomeDeArquivoSeguro`
 * (`src/lib/chamados-tipos.ts`). Cópia deliberada e não import, pelo mesmo
 * motivo escrito lá: croqui não compartilha bucket nem CHECK com os outros,
 * e acoplar os módulos por esta função faria mudar o teto de um exigir
 * revisar os outros dois.
 */
export function nomeDeCroquiSeguro(nome: string): string {
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
 * Uma folha de croqui na ficha do cliente. Sem UPDATE de conteúdo: cada
 * envio é uma linha nova (o histórico É a lista de linhas).
 * `gps.cliente_croqui_remover` tira a LINHA (DELETE físico) — o BYTE continua
 * no bucket até o expurgo do admin (B-R1): SQL não apaga arquivo no object
 * store.
 *
 * ⚠️ As chaves são as do banco (`snake_case`), porque a leitura vem do
 * PostgREST com `select` de colunas explícitas — o mesmo contrato de
 * `ClienteMinuta`.
 */
export interface ClienteCroqui {
  id: string;
  cliente_id: string;
  path: string;
  nome: string;
  tamanho: number;
  /** DIA em que ESTA folha foi apresentada (`date`, sem hora). `null` = não
   * informado. Aceita qualquer data, inclusive futura — nenhuma regra de
   * negócio foi definida (decisão do arquiteto, 24/09/2026). */
  apresentado_em: string | null;
  /** Texto livre sobre ESTA folha (≤ 2000). Mora na versão, não na ficha: na
   * ficha seria caixa compartilhada entre N versões. */
  observacoes: string | null;
  enviado_em: string;
  enviado_por: string | null;
  /** `true` quando quem enviou foi a equipe (modo assistência), não o aluno. */
  enviado_pela_equipe: boolean;
}

/** "3,7 MB" — mesmo formato de `minutaTamanhoLegivel`, copiado pelo mesmo
 * motivo de não acoplar os módulos. */
export function croquiTamanhoLegivel(bytes: number | null): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
