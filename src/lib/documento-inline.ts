/**
 * Pré-visualização INLINE de documento da ficha do cliente — a parte pura.
 *
 * 🔴 CONTEXTO: no resto do repo, TODO anexo sai com `download=` na URL
 * assinada (chamado, onboarding, contrato, minuta). O motivo está escrito em
 * `src/lib/chamados-data.ts` e em `urlDeDownloadDoContratoCliente`: o MIME de
 * um objeto de Storage é o que o cliente DECLAROU no PUT, não resultado de
 * inspeção de bytes — servir inline confiando nele transformaria um "PNG" em
 * HTML executando no domínio do Supabase.
 *
 * A rota `/clientes/[clienteId]/documento/[tipo]/[id]` é a PRIMEIRA exceção, e
 * só pode existir porque fecha exatamente esse vetor: o `Content-Type` da
 * resposta NÃO vem do metadado, vem de `detectarTipoPorMagicBytes` lendo o
 * começo real do arquivo. Nada aqui lê banco nem sessão — é função pura, para
 * poder ser testada sem harness e sem rede.
 *
 * ⚠️ Este módulo NÃO é a fronteira de segurança sozinho. Ele é uma das camadas:
 *   1. a RLS de `gps.etapa1_clientes` / `gps.cliente_minutas` /
 *      `gps.cliente_croquis` (quem vê a linha);
 *   2. as policies de `storage.objects` (quem baixa o byte, com a sessão de
 *      quem pede — nunca `service_role`);
 *   3. ESTE módulo (o que o navegador é autorizado a renderizar);
 *   4. os cabeçalhos da resposta (`nosniff`, `CSP: sandbox`, `no-store`).
 * Tirar qualquer uma reabre o vetor; a 3 sem a 4 ainda deixa o navegador
 * adivinhar o tipo.
 */

/** Os tipos que o navegador pode renderizar inline com segurança aceitável. */
export type TipoInlineDetectado =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "image/webp";

/**
 * Lê a ASSINATURA REAL do arquivo (magic bytes) e devolve o `Content-Type`
 * que pode ser prometido ao navegador, ou `null` quando não reconhece.
 *
 * 🔴 OFFSET 0, SEMPRE. Nunca procurar a assinatura DENTRO do buffer. Um HTML
 * que contenha `%PDF-` no meio do corpo é um arquivo HTML — se a busca fosse
 * `indexOf`, ele passaria como PDF, seria servido inline e o `<script>` dele
 * rodaria. Pelo mesmo motivo, PDF cuja assinatura comece no byte 1 (com um
 * byte de lixo na frente) é RECUSADO: só o que é inequivocamente do tipo é
 * servido. Recusar um arquivo legítimo é aborrecimento; aceitar um arquivo
 * disfarçado é o incidente.
 *
 * 🔴 `null` NÃO é "deixa o navegador decidir" — quem chama devolve 415 e não
 * serve byte nenhum. Não existe caminho "tipo desconhecido, manda assim".
 *
 * Não valida o arquivo INTEIRO: magic byte diz o que o arquivo AFIRMA ser no
 * começo, não que o resto seja um PDF/PNG válido. Isso basta aqui porque o
 * risco que fechamos é o navegador INTERPRETAR o conteúdo como outra coisa
 * (HTML/SVG), e para isso o sniffing só olha o início — com `nosniff` +
 * `CSP: sandbox` na resposta, nem isso.
 */
export function detectarTipoPorMagicBytes(
  buf: Uint8Array,
): TipoInlineDetectado | null {
  // `%PDF-` → 25 50 44 46 2D. Cinco bytes: `%PDF` sem o hífen casaria com
  // menos coisa do que parece, mas o hífen é parte da assinatura da spec.
  if (comecaCom(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";

  // PNG → 89 50 4E 47 0D 0A 1A 0A (os 8 bytes, não só `\x89PNG`: o CRLF/EOF
  // do meio existe justamente para detectar transferência corrompida).
  if (comecaCom(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // JPEG → FF D8 FF (SOI + primeiro marcador). O quarto byte varia por
  // variante (E0 JFIF, E1 Exif, DB raw…), por isso não entra no teste.
  if (comecaCom(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // WEBP → contêiner RIFF: `RIFF` no offset 0, tamanho nos bytes 4..7 (que
  // NÃO conferimos: é o tamanho declarado, dado do arquivo, não assinatura),
  // e `WEBP` no offset 8. Sem o segundo teste, qualquer RIFF (WAV, AVI)
  // passaria como imagem.
  if (
    comecaCom(buf, [0x52, 0x49, 0x46, 0x46]) &&
    ehIgualNoOffset(buf, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }

  return null;
}

/** `buf` começa EXATAMENTE por `assinatura` (offset 0). */
function comecaCom(buf: Uint8Array, assinatura: readonly number[]): boolean {
  return ehIgualNoOffset(buf, 0, assinatura);
}

function ehIgualNoOffset(
  buf: Uint8Array,
  offset: number,
  assinatura: readonly number[],
): boolean {
  // Buffer curto demais nunca "quase casa": falta byte = não é o tipo.
  if (buf.length < offset + assinatura.length) return false;
  for (let i = 0; i < assinatura.length; i++) {
    if (buf[offset + i] !== assinatura[i]) return false;
  }
  return true;
}

/**
 * Allowlist FECHADA dos documentos que a rota serve. Tipo fora desta lista
 * responde 404 (não 400): um 400 confirmaria que a rota existe e que o
 * vocabulário está errado; o 404 não conta nada a quem está sondando.
 *
 * ✅ `croqui` ENTROU na FATIA 6 (24/09/2026), junto com a trilha LGPD
 * (`gps.cliente_documento_registrar_leitura`, migração …311). Bucket próprio
 * `gps-croquis` (allowlist `{application/pdf}`), guarda = a policy
 * `cliente_croquis_select` — a MESMA forma do ramo `minuta`.
 *
 * ⚠️ Esta tupla e o `switch` de `resolverDocumento`
 * (`src/app/clientes/[clienteId]/documento/[tipo]/[id]/route.ts`) andam
 * JUNTOS: o `switch` é exaustivo sobre este tipo, então acrescentar valor
 * aqui sem acrescentar o ramo lá QUEBRA O BUILD — comportamento desejado, e
 * foi ele que guiou esta fatia.
 *
 * 🔑 Croqui é PDF por construção (CHECK do path + allowlist do bucket), e
 * ainda assim a detecção por magic bytes continua valendo INTEIRA: o MIME do
 * bucket é o que o cliente DECLAROU no PUT, e o CHECK do path olha a
 * EXTENSÃO do nome, não o byte. Nenhum dos dois prova que o conteúdo é PDF —
 * só `%PDF-` no offset 0 prova, e é ele que decide o `Content-Type`.
 */
export const TIPOS_DOCUMENTO = ["contrato", "minuta", "croqui"] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export function ehTipoDocumento(v: string): v is TipoDocumento {
  return (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

/**
 * Teto de bytes que a rota aceita CARREGAR NA MEMÓRIA. 5 MB — o mesmo teto
 * dos buckets `gps-onboarding` e `gps-minutas` (`MINUTA_TAMANHO_MAXIMO`,
 * `src/lib/minutas-tipos.ts`), repetido aqui e não importado de propósito:
 * o motivo é OUTRO. Lá é "o que o usuário pode subir"; aqui é "o que o
 * servidor aguenta segurar inteiro na RAM por requisição concorrente".
 *
 * 🔴 A rota compara este teto com o TAMANHO GRAVADO (`contrato_tamanho` /
 * `cliente_minutas.tamanho`, ambos escritos pela RPC a partir de
 * `storage.objects.metadata` — nunca do que o navegador declarou) ANTES de
 * baixar. Verificar depois do download não protegeria nada: o custo de RAM já
 * teria sido pago.
 */
export const LIMITE_DOCUMENTO_BYTES = 5_242_880;

/**
 * Monta o valor do `Content-Disposition` para servir INLINE com nome legível.
 *
 * 🔴 INJEÇÃO DE CABEÇALHO é o risco aqui, não estética. O nome vem do banco,
 * mas foi ESCRITO por quem subiu o arquivo. Um nome com CR/LF parte a resposta
 * HTTP em duas; um nome com `"` ou `;` fecha o parâmetro e acrescenta outro
 * (ex.: `x.pdf"; download; filename="y`). Por isso:
 *
 *   - o `filename=` ASCII (compatibilidade) sai com CR/LF/`"`/`;`/`\` e
 *     caracteres de controle REMOVIDOS, e com tudo que não é ASCII imprimível
 *     trocado por `_`;
 *   - o `filename*=UTF-8''…` sai PERCENT-ENCODED por `encodeURIComponent`,
 *     que já não emite nenhum dos caracteres perigosos — é ele que carrega o
 *     nome de verdade (acento, cedilha) nos navegadores atuais (RFC 5987).
 *
 * Nome vazio depois da limpeza vira `documento` — resposta sem `filename`
 * levaria o navegador a inventar um a partir da URL (que aqui é um UUID).
 */
export function nomeParaContentDisposition(nome: string): string {
  const bruto = (nome ?? "").trim();

  const ascii = Array.from(bruto)
    .map((c) => {
      const cod = c.codePointAt(0) ?? 0;
      // Controle (inclui CR e LF), aspas, ponto e vírgula, barra invertida e
      // qualquer coisa fora do ASCII imprimível: fora do parâmetro ASCII.
      if (cod < 0x20 || cod === 0x7f) return "";
      if (c === '"' || c === ";" || c === "\\") return "";
      if (cod > 0x7e) return "_";
      return c;
    })
    .join("")
    .trim()
    .slice(0, 120);

  const seguro = ascii || "documento";

  // `encodeURIComponent` não codifica `!'()*` — nenhum deles é especial em
  // `Content-Disposition`, e todos são válidos em `ext-value` (RFC 5987
  // `attr-char` cobre `!`, `'` e `*`; `(` e `)` não, então saem).
  const utf8 = encodeURIComponent(
    bruto.replace(/[\r\n]/g, " ").trim().slice(0, 120) || "documento",
  ).replace(/[()]/g, (c) => (c === "(" ? "%28" : "%29"));

  return `inline; filename="${seguro}"; filename*=UTF-8''${utf8}`;
}
