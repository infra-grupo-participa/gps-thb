// Integração Google Drive (migração …347) — tipos, frases e funções puras.
// Moram aqui, e não em `src/app/drive/actions.ts`, porque arquivo
// `"use server"` só pode exportar `async function`.
//
// Sem import de `@/`: o teste (`drive-tipos.test.mjs`) importa direto pelo Node.

/** 'revogar' não aparece na tela: é interna (sem aluno, gps.drive_estado não a devolve). */
export type TipoTarefaDrive = "provisionar_parceiro" | "criar_pasta_cliente" | "compartilhar" | "revogar";
export type EstadoTarefaDrive = "pendente" | "rodando" | "feito" | "erro";
export type AvisoDrive = "email_nao_google" | "sem_login" | "documentos_ausente";

/** O que a tela mostra. `nenhuma` = nunca pediram (e não há link). */
export type SituacaoPastaDrive = "nenhuma" | "criando" | "pronta" | "erro";

export interface EstadoPastaDrive {
  situacao: SituacaoPastaDrive;
  tarefaId: string | null;
  /**
   * Tipo da última tarefa (`compartilhar` × `provisionar_parceiro` no parceiro;
   * `criar_pasta_cliente` no cliente). `null` = sem tarefa ou valor desconhecido.
   */
  tipo: TipoTarefaDrive | null;
  /** Frase pronta para a tela (só em `erro`). */
  erro: string | null;
  /** Técnico (status/razão do Google). Só vem para a equipe; `null` para o parceiro. */
  erroDetalhe: string | null;
  avisos: AvisoDrive[];
  /** Link atual (ambiente ou ficha), venha ele do sistema ou colado à mão. */
  url: string | null;
  atualizadoEm: string | null;
}

/** Lado do parceiro: o estado da tarefa + o que só existe para o parceiro (…348). */
export interface EstadoPastaParceiroDrive extends EstadoPastaDrive {
  /**
   * Existe `raiz_parceiro` E `clientes` em `gps.drive_pastas` para o aluno: a
   * equipe organizou a pasta e a do cliente pode ser pedida. Com `ativo=false`
   * o banco não consulta e vale `false`.
   */
  organizada: boolean;
  /**
   * Só a equipe recebe: há permissão que o sistema deu, marcada para revogar e
   * ainda viva (pendente ou desistida). `null` para o parceiro e com `ativo=false`.
   */
  revogacaoPendente: boolean | null;
}

export interface EstadoDrive {
  /** Interruptor `gps.config.drive_provisionar_ativo`. Desligado: esconder o botão. */
  ativo: boolean;
  parceiro: EstadoPastaParceiroDrive;
  /** `null` quando a leitura não pediu cliente. */
  cliente: EstadoPastaDrive | null;
}

export const ROTULO_SITUACAO: Record<SituacaoPastaDrive, string> = {
  nenhuma: "",
  criando: "Criando…",
  pronta: "Pronta",
  erro: "Não deu certo",
};

export const TEXTO_AVISO: Record<AvisoDrive, string> = {
  email_nao_google:
    "A pasta foi criada, mas o e-mail de login do parceiro não é conta Google, então não deu para compartilhar. Peça um e-mail Google e compartilhe pelo Drive.",
  sem_login:
    "A pasta foi criada, mas o parceiro ainda não tem login no portal, então ninguém recebeu o convite.",
  documentos_ausente:
    "A pasta não tem a subpasta \"1) DOCUMENTOS\"; o parceiro recebeu acesso só à pasta principal e a 5) CLIENTES.",
};

const AVISOS: readonly AvisoDrive[] = ["email_nao_google", "sem_login", "documentos_ausente"];

/** "a,b" → avisos conhecidos, sem repetição. Código desconhecido é ignorado. */
export function lerAvisos(bruto: unknown): AvisoDrive[] {
  if (typeof bruto !== "string" || !bruto) return [];
  const vistos = new Set<AvisoDrive>();
  for (const p of bruto.split(",")) {
    const c = p.trim() as AvisoDrive;
    if (AVISOS.includes(c)) vistos.add(c);
  }
  return [...vistos];
}

/** Linha devolvida por `gps.drive_estado` para o parceiro ou para o cliente. */
export interface LinhaEstadoDrive {
  tarefa_id?: string | null;
  tipo?: string | null;
  estado?: string | null;
  erro?: string | null;
  erro_detalhe?: string | null;
  aviso?: string | null;
  atualizado_em?: string | null;
  url?: string | null;
  /** Só no lado do parceiro (…348). */
  organizada?: boolean | null;
  /** Só no lado do parceiro e só para admin (…348). */
  revogacao_pendente?: boolean | null;
}

const TIPOS: readonly TipoTarefaDrive[] = ["provisionar_parceiro", "criar_pasta_cliente", "compartilhar", "revogar"];

/** Tipo conhecido ou `null`. */
export function lerTipo(bruto: unknown): TipoTarefaDrive | null {
  return typeof bruto === "string" && (TIPOS as readonly string[]).includes(bruto) ? (bruto as TipoTarefaDrive) : null;
}

/**
 * Estado da tela a partir da última tarefa + link atual:
 * - pendente/rodando → "criando" (mesmo que já exista link: é o compartilhar);
 * - erro → "erro" com a frase;
 * - feito, ou sem tarefa mas com link → "pronta";
 * - sem tarefa e sem link → "nenhuma".
 */
export function situacaoDaLinha(l: LinhaEstadoDrive | null | undefined): EstadoPastaDrive {
  const url = typeof l?.url === "string" && l.url ? l.url : null;
  const estado = l?.estado ?? null;
  const base: EstadoPastaDrive = {
    situacao: "nenhuma",
    tarefaId: l?.tarefa_id ?? null,
    tipo: lerTipo(l?.tipo),
    erro: null,
    erroDetalhe: null,
    avisos: lerAvisos(l?.aviso),
    url,
    atualizadoEm: l?.atualizado_em ?? null,
  };
  if (estado === "pendente" || estado === "rodando") return { ...base, situacao: "criando" };
  if (estado === "erro") {
    return {
      ...base,
      situacao: "erro",
      erro: l?.erro || "Não deu para criar a pasta. Tente de novo.",
      erroDetalhe: l?.erro_detalhe ?? null,
    };
  }
  if (estado === "feito" || url) return { ...base, situacao: url ? "pronta" : "nenhuma" };
  return base;
}

/**
 * Retorno cru de `gps.drive_estado` → estado da tela. Desligado, o banco
 * devolve só `{ativo:false}` (…348): o parceiro sai "nenhuma", não organizado.
 */
export function estadoDoRetorno(bruto: unknown, comCliente: boolean): EstadoDrive {
  const r = (bruto ?? {}) as { ativo?: unknown; parceiro?: LinhaEstadoDrive | null; cliente?: LinhaEstadoDrive | null };
  const ativo = r.ativo === true;
  const par = ativo ? r.parceiro : null;
  return {
    ativo,
    parceiro: {
      ...situacaoDaLinha(par),
      organizada: par?.organizada === true,
      revogacaoPendente: typeof par?.revogacao_pendente === "boolean" ? par.revogacao_pendente : null,
    },
    cliente: comCliente ? situacaoDaLinha(ativo ? r.cliente : null) : null,
  };
}

/**
 * Frases das exceções de `gps.drive_provisionar_parceiro`,
 * `gps.drive_criar_pasta_cliente` e `gps.drive_estado`, repassadas a
 * `traduzirErroBanco`. A chave é a `message` exata do `raise exception`.
 */
export const FRASES_DRIVE: Record<string, string> = {
  "A criação automática de pastas está desligada.":
    "A criação automática de pastas está desligada. Fale com a equipe.",
  "A pasta deste cliente já foi criada.": "A pasta deste cliente já foi criada.",
  "Este cliente já tem uma pasta ligada.": "Este cliente já tem uma pasta ligada.",
  "Ambiente não encontrado.": "Ambiente não encontrado.",
  "Ambiente não informado.": "Ambiente não encontrado.",
  "Cliente não encontrado.": "Cliente não encontrado.",
  "A pasta do parceiro ainda não foi organizada pela equipe.":
    "A pasta do parceiro ainda não foi organizada pela equipe.",
  "Limite de 20 pastas de cliente por dia atingido. Tente de novo amanhã.":
    "Limite de 20 pastas de cliente por dia atingido. Tente de novo amanhã.",
};
