/**
 * Log estruturado do servidor — UMA linha JSON por evento.
 *
 * POR QUE EXISTE
 *   Até 09/09/2026 o portal só tinha `console.error` avulso, cada um com um
 *   formato: às vezes string interpolada, às vezes objeto, às vezes as duas
 *   coisas. Erro em produção na Hostinger cai no log do Passenger, que é uma
 *   pilha de texto — sem campo fixo não dá para filtrar por rota nem contar
 *   ocorrência. Uma linha JSON por erro resolve isso sem dependência nova:
 *   `grep '"nivel":"erro"' | jq -r .escopo | sort | uniq -c` já responde
 *   "o que está quebrando mais".
 *
 * 🔒 SEM PII. NUNCA passe e-mail, nome, telefone, documento, texto de nota do
 *    Diário ou conteúdo de mensagem no `contexto`. `alunoId` PODE — é um UUID
 *    opaco, é o que liga a queixa do aluno ao log, e é o mesmo identificador
 *    que já viaja na URL do admin. O tipo de `contexto` aceita só escalares
 *    justamente para não deixar ninguém despejar o objeto inteiro do cliente
 *    ali dentro.
 *
 *    A trava do tipo não impede alguém digitar `{ email }` à mão, então há uma
 *    segunda linha de defesa: `redigir()` apaga e-mails e sequências longas de
 *    dígitos (CPF/CNPJ/telefone) do texto do ERRO antes de emitir. Isso
 *    importa porque mensagem de Postgres carrega VALOR: um 23505 volta como
 *    `Key (email)=(fulano@x.com) already exists`. Sem a redação, uma violação
 *    de unicidade escreveria e-mail de aluno no log da Hostinger.
 *
 * NÃO É SENTRY. A decisão de instalar Sentry (dependência + DSN + custo) é do
 * João e está pendente. Este helper é o ponto único onde plugar quando ele
 * decidir: um `Sentry.captureException` aqui dentro cobre o portal inteiro.
 */

/** Só escalares: objeto aninhado é o caminho fácil para vazar PII sem querer. */
export type ContextoLog = Record<string, string | number | boolean | null>;

type NivelLog = "erro" | "aviso";

type ErroNormalizado = {
  code: string | null;
  message: string | null;
  details: string | null;
  hint: string | null;
};

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/**
 * 8+ dígitos seguidos: CPF (11), CNPJ (14), telefone com DDD (10-11).
 * Não pega UUID — os grupos de um UUID são hexadecimais e têm no máximo 12
 * caracteres com letras no meio; um grupo 100% numérico de 12 dígitos é raro
 * o bastante para não valer o risco inverso (deixar CPF passar).
 */
const RE_DIGITOS_LONGOS = /\d{8,}/g;

function redigir(texto: string | null): string | null {
  if (!texto) return texto ?? null;
  return texto.replace(RE_EMAIL, "<email>").replace(RE_DIGITOS_LONGOS, "<num>");
}

/**
 * Achata as três formas de erro que aparecem no projeto num shape só:
 * `PostgrestError` ({code, message, details, hint}), `Error` e qualquer outra
 * coisa que caia num `catch`.
 */
function normalizar(erro: unknown): ErroNormalizado {
  if (erro && typeof erro === "object") {
    const e = erro as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
    const code = texto(e.code) ?? texto(e.name);
    const message = texto(e.message);
    if (code || message) {
      return {
        code,
        message: redigir(message),
        details: redigir(texto(e.details)),
        hint: redigir(texto(e.hint)),
      };
    }
  }
  if (typeof erro === "string") {
    return { code: null, message: redigir(erro), details: null, hint: null };
  }
  // Nem Error nem PostgrestError: registra o tipo, não o valor — o valor pode
  // ser qualquer coisa, inclusive o objeto do aluno.
  return { code: null, message: `erro nao-padrao (${typeof erro})`, details: null, hint: null };
}

function emitir(nivel: NivelLog, escopo: string, erro: unknown, contexto?: ContextoLog) {
  const linha = {
    nivel,
    escopo,
    ...normalizar(erro),
    contexto: contexto ?? null,
    em: new Date().toISOString(),
  };
  // `JSON.stringify` numa chamada só: o log do Passenger intercala saída de
  // requisições concorrentes, então um evento partido em várias linhas fica
  // ilegível. Uma linha = um evento, sempre.
  const serializado = JSON.stringify(linha);
  if (nivel === "erro") console.error(serializado);
  else console.warn(serializado);
}

/**
 * Registra uma falha. Não lança e não muda controle de fluxo — quem chama
 * decide o que devolver (`[]`, `null`, 503...).
 *
 * @param escopo  identificador estável da origem, ex. "getAlunosGps".
 * @param erro    o erro cru (PostgrestError, Error, string, unknown).
 * @param contexto escalares SEM PII. `alunoId` é permitido.
 */
export function logErro(escopo: string, erro: unknown, contexto?: ContextoLog): void {
  emitir("erro", escopo, erro, contexto);
}

/** Mesmo formato, para o que merece atenção mas não é falha. */
export function logAviso(escopo: string, motivo: unknown, contexto?: ContextoLog): void {
  emitir("aviso", escopo, motivo, contexto);
}
