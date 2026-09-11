/**
 * Chamados (suporte do portal) — tipos e limites.
 *
 * Arquivo SEM `server-only` de propósito: `anexo-campo.tsx` é client component
 * e precisa da allowlist de MIME, do teto de 5 MB e do mapa MIME→extensão para
 * validar ANTES de subir o arquivo. Nada aqui lê banco nem sessão — as leituras
 * ficam em `chamados-data.ts` (server-only) e as escritas nas actions.
 *
 * 🔑 Cada limite daqui existe TAMBÉM no banco (migrações
 * `20260909000110`/`...111`) e no bucket (`...112`). Estas constantes são para a
 * mensagem chegar boa ao usuário — nunca são a barreira. Server Action é
 * endpoint HTTP e o upload direto ao Storage é uma requisição do navegador:
 * quem garante é a RPC, a policy e o bucket.
 *
 * ANEXO ≠ DOCUMENTO DO CLIENTE (decisão de 07/2026, mantida): anexo de chamado
 * é prova de um problema no portal (print, comprovante), efêmero, com retenção
 * de 180 dias. Contrato, RG e matrícula do cliente continuam só no Drive.
 */

/** Os três estados do CHECK de `gps.chamados.status`. Ninguém itera sobre a
 * lista — quem valida é o banco —, então é união de literais, não tupla. */
export type StatusChamado = "aberto" | "respondido" | "fechado";

/**
 * Categoria do chamado (feature de 11/09/2026, `gps.chamados_categorias_ativo`).
 *
 * `troca_cliente` e `troca_socio` abrem uma `ChamadoSolicitacao` associada
 * (atual × novo, aprovar/declinar). `sistema` e `outros` seguem o formulário
 * de sempre — texto livre, sem alvo.
 *
 * União de literais, não tupla: quem valida é o banco. `CATEGORIAS_CHAMADO`
 * abaixo é só para a UI iterar (select, chip de filtro).
 */
export type CategoriaChamado =
  | "sistema"
  | "troca_cliente"
  | "troca_socio"
  | "outros";

export const CATEGORIAS_CHAMADO: readonly CategoriaChamado[] = [
  "sistema",
  "troca_cliente",
  "troca_socio",
  "outros",
] as const;

/**
 * Rótulo em português — FONTE ÚNICA para as duas telas (parceiro e equipe).
 * Nenhum componente escreve a copy de categoria de novo lugar nenhum.
 */
export const ROTULO_CATEGORIA_CHAMADO: Record<CategoriaChamado, string> = {
  sistema: "Dificuldade no sistema",
  troca_cliente: "Troca de cliente",
  troca_socio: "Troca de sócio",
  outros: "Outros",
};

export function rotuloCategoriaChamado(
  categoria: CategoriaChamado | null | undefined,
): string {
  if (!categoria) return ROTULO_CATEGORIA_CHAMADO.sistema;
  return ROTULO_CATEGORIA_CHAMADO[categoria] ?? ROTULO_CATEGORIA_CHAMADO.sistema;
}

export interface Chamado {
  id: string;
  /** AMBIENTE (thb_alunos.id do titular), nunca a pessoa logada. */
  aluno_id: string;
  aberto_por: string | null;
  assunto: string;
  status: StatusChamado;
  criado_em: string;
  ultima_mensagem_em: string;
  fechado_em: string | null;
  fechado_por: string | null;
  /**
   * `null` = chamado aberto antes da feature de categoria, ou o interruptor
   * `chamados_categorias_ativo` estava desligado no momento — a UI trata como
   * "Dificuldade no sistema" (`rotuloCategoriaChamado`), nunca como erro.
   */
  categoria: CategoriaChamado | null;
}

/** Os dois tipos de solicitação de troca — mesmo fluxo de aprovação. */
export type TipoSolicitacao = "troca_cliente" | "troca_socio";
export type EstadoSolicitacao = "pendente" | "aprovada" | "declinada";

/**
 * `gps.chamado_solicitacoes` — o "atual × novo" de uma troca.
 *
 * 🔑 `alvo_atual_rotulo`/`alvo_novo_rotulo` são CÓPIA do nome no instante do
 * pedido (contrato do banco). A tela usa SEMPRE estes dois campos — nunca
 * busca o nome do cliente/sócio de novo, porque ele pode ter sido apagado ou
 * trocado entre o pedido e a leitura.
 */
export interface ChamadoSolicitacao {
  chamado_id: string;
  tipo: TipoSolicitacao;
  alvo_atual_id: string | null;
  alvo_novo_id: string | null;
  alvo_atual_rotulo: string | null;
  alvo_novo_rotulo: string | null;
  estado: EstadoSolicitacao;
  decidida_em: string | null;
  motivo_decisao: string | null;
}

/** Linha da fila de `/admin/chamados` — o nome do ambiente vem junto. */
export interface ChamadoNaFila extends Chamado {
  aluno_nome: string | null;
  aluno_email: string | null;
}

export interface ChamadoMensagem {
  id: string;
  chamado_id: string;
  autor_id: string | null;
  autor_papel: "aluno" | "equipe";
  criado_em: string;
  texto: string;
  anexo_path: string | null;
  /** Nome ORIGINAL do arquivo. Texto do usuário — escapar ao exibir. */
  anexo_nome: string | null;
  anexo_mime: string | null;
  anexo_tamanho: number | null;
  /** Preenchido = arquivo apagado pela retenção. O nome FICA, o link não. */
  anexo_expurgado_em: string | null;
}

export interface ChamadoMensagemComAutor extends ChamadoMensagem {
  autor_nome: string | null;
}

export interface AnexoParaExpurgo {
  /** `null` quando `motivo === "orfao"` (não há mensagem para carimbar). */
  mensagemId: string | null;
  chamadoId: string | null;
  alunoId: string | null;
  path: string;
  motivo: "retencao" | "orfao";
  referencia: string;
}

/** O que a tela manda para a action depois de subir o arquivo. */
export interface AnexoInput {
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
}

export type ResultadoAcao = { ok: true } | { ok: false; erro: string };
export type ResultadoAbrir =
  | {
      ok: true;
      chamadoId: string;
      /**
       * `true` só quando o e-mail para a equipe SAIU (há destinatário e a
       * Resend aceitou). A tela não pode dizer "a equipe foi avisada" por
       * suposição: em 10/09 `chamados_email_equipe` estava vazio em produção.
       */
      equipeAvisada: boolean;
    }
  | { ok: false; erro: string };

const ANEXO_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;
export type AnexoMime = (typeof ANEXO_MIMES)[number];

/**
 * Extensão derivada do **tipo do arquivo**, nunca do nome que o usuário deu.
 * `contrato.pdf.html` com `file.type = image/png` vira `<uuid>.png` — o nome
 * original é guardado só na tabela, para exibir.
 */
export const EXTENSAO_POR_MIME: Record<AnexoMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const ANEXO_TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const CHAMADOS_MAX_ABERTOS = 5;
export const CHAMADO_MAX_MENSAGENS = 20;
export const CHAMADO_TEXTO_MAXIMO = 4000;
export const CHAMADO_ASSUNTO_MAXIMO = 120;
export const CHAMADO_ASSUNTO_MINIMO = 3;
export const CHAMADO_REABRIR_DIAS = 7;
export const ANEXO_RETENCAO_DIAS = 180;
export const BUCKET_CHAMADOS = "gps-chamados";

/** Motivo de aprovar/declinar solicitação — mesmo limite de
 * `AcoesAcompanhamento` (`confirmarAcompanhamento`/`liberarAcompanhamento`). */
export const SOLICITACAO_MOTIVO_MINIMO = 3;
export const SOLICITACAO_MOTIVO_MAXIMO = 300;

/** `<aluno_id>/<uuid>.<ext>` — o MESMO formato que o CHECK e a policy exigem. */
export const ANEXO_PATH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$/;

export function ehAnexoMime(v: string): v is AnexoMime {
  return (ANEXO_MIMES as readonly string[]).includes(v);
}

/**
 * Tira separador de caminho e caractere de controle do nome que o usuário
 * mandou, e corta em 120 (o CHECK das colunas `*_nome` recusa mais que isso).
 *
 * Sem regex de propósito: caractere de controle dentro de classe de caractere
 * é o que `no-control-regex` proíbe, e o filtro explícito diz o que está sendo
 * tirado — `/`, `\` e todo caractere de controle.
 *
 * ⚠️ Mora aqui com o resto do contrato do anexo (mesmos MIMEs, mesmo teto,
 * mesmo formato de caminho) porque os TRÊS lugares que sobem arquivo no GPS —
 * chamado, questionário inicial e contrato do cliente (migração ...214) —
 * gravam o nome na mesma forma de coluna. Eram três cópias idênticas da mesma
 * função; a quarta cópia seria o dia em que uma delas deixa passar um `\`.
 */
export function nomeDeArquivoSeguro(nome: string): string {
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
 * Rótulo de status na visão de quem está lendo. Diz **de quem é a bola**, não o
 * estado interno — é o que faz a fila ser lida sem treinamento.
 */
export function rotuloStatus(
  status: StatusChamado,
  visao: "aluno" | "admin",
): string {
  if (status === "fechado") return "Fechado";
  if (status === "aberto") return "Aguardando a equipe";
  return visao === "aluno" ? "Aguardando você" : "Aguardando o aluno";
}

/** "3,7 MB" — para a tela dizer o tamanho do anexo sem inventar precisão. */
export function tamanhoLegivel(bytes: number | null): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
