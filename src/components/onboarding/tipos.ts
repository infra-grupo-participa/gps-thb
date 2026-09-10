/**
 * A COPY do onboarding e o contrato das ações que o portal injeta.
 *
 * 🔑 **Os TIPOS saíram daqui.** Na Onda 1 este arquivo carregava `MeuOnboarding`,
 * `OnboardingAnexo`, `GrauRelacao` e companhia como proposta; as migrações
 * `…202/…204/…206/…210` foram aplicadas e o contrato publicado vive em
 * `src/lib/types.ts` (dono: backend), com os rótulos em `src/lib/etapa1.ts`
 * (`GRAUS_RELACAO_UI`, `FASES_CLIENTE1_UI`). Importar de lá é o que garante
 * que a tela, a action e o CHECK da coluna digam a mesma coisa — a duplicata
 * era a chance de o portal aceitar um grau que o banco recusa.
 *
 * 🔴 A copy do João é LITERAL. As frases marcadas abaixo foram escritas por
 * ele no pedido de 10/09/2026 e não podem ser reescritas, resumidas nem
 * "melhoradas" — são a pergunta do negócio, não texto de interface.
 */

import type { PatchOnboarding } from "@/app/onboarding/actions";
import { FASES_CLIENTE1_UI } from "@/lib/etapa1";
import {
  ANEXO_TAMANHO_MAXIMO,
  EXTENSAO_POR_MIME,
} from "@/lib/chamados-tipos";
import type {
  FaseCliente1,
  OnboardingAnexo,
  OrigemCliente1,
  TipoAnexoOnboarding,
} from "@/lib/types";

/**
 * As Server Actions do onboarding, **injetadas por prop**.
 *
 * 🔑 Existe por dois motivos que não são estilo: o `/perfil` monta o MESMO
 * componente em modo "só apresentação", com um objeto inerte que não chama o
 * servidor (rever o tour não é responder de novo); e a máquina do questionário
 * fica testável sem banco.
 *
 * ⚠️ As assinaturas espelham `src/app/onboarding/actions.ts` **exatamente**,
 * inclusive o `PatchOnboarding` em snake_case: ele é a allowlist literal de
 * `gps.onboarding_salvar_passo`, e a RPC **aborta** com chave desconhecida.
 * Um segundo vocabulário aqui (camelCase) exigiria um tradutor no meio — e o
 * tradutor é justamente onde uma chave se perde em silêncio.
 */
export interface OnboardingActions {
  salvarPasso(passo: number, dados: PatchOnboarding): Promise<{ erro?: string }>;
  criarUploadAssinado(i: {
    nome: string;
    mime: string;
    tamanho: number;
    tipo: TipoAnexoOnboarding;
  }): Promise<
    { ok: true; path: string; token: string; nome: string } | { ok: false; erro: string }
  >;
  registrarAnexo(i: {
    tipo: TipoAnexoOnboarding;
    path: string;
    nome: string;
    mime: string;
    tamanho: number;
  }): Promise<{ erro?: string; anexo?: OnboardingAnexo }>;
  removerAnexo(id: string): Promise<{ erro?: string }>;
  concluir(): Promise<{
    erro?: string;
    clienteId?: string | null;
    favoritado?: boolean;
  }>;
  trocarSenha(nova: string): Promise<{ erro?: string }>;
}

/* ──────────────────────────────── copy ───────────────────────────────── */

/** 🔴 LITERAL do João. */
export const FRASE_ABERTURA =
  "No Programa de Implementação Assistida, nós faremos junto com você a sua primeira Holding.";

/** 🔴 LITERAL do João. */
export const PERGUNTA_CLIENTE1 =
  "De onde virá o seu cliente 1, este que nós faremos a Holding juntos?";

/** 🔴 LITERAL do João (as duas opções, com a numeração dele). */
export const OPCOES_ORIGEM: { id: OrigemCliente1; rotulo: string; ajuda: string }[] = [
  {
    id: "captacao",
    rotulo: "Quero que façamos desde a captação, porque ele virá de lá.",
    ajuda:
      "A Etapa 01 começa montando a sua lista de clientes potenciais — é de lá que sai o cliente 1.",
  },
  {
    id: "ja_tenho",
    rotulo: "Eu já tenho esse cliente e quero começar por ele.",
    ajuda: "A gente cadastra esse cliente agora e continua de onde você está.",
  },
];

/** 🔴 LITERAL do João. */
export const PERGUNTA_FASE =
  "Em que fase da implementação você se encontra com este cliente?";

/**
 * As três respostas do passo 3, na forma que `<Escolha>` consome.
 *
 * 🔑 Derivadas de `FASES_CLIENTE1_UI` (`src/lib/etapa1.ts`), que é onde mora o
 * mapa resposta → fase do cliente e a flag `exigeContrato`. Reescrever os três
 * rótulos aqui criaria um segundo lugar para a copy do João divergir daquele
 * que a conclusão usa para criar o cliente.
 */
export const OPCOES_FASE: { id: FaseCliente1; rotulo: string }[] =
  FASES_CLIENTE1_UI.map((f) => ({ id: f.id, rotulo: f.rotulo }));

/** 🔴 LITERAL do João. */
export const ROTULO_HONORARIOS = "Valor dos honorários pactuados";
/** 🔴 LITERAL do João. */
export const PERGUNTA_CASO = "Descreva o seu caso";
/** 🔴 LITERAL do João. */
export const PERGUNTA_AJUDA = "No que podemos te ajudar de pronto?";
/** 🔴 LITERAL do João. */
export const TITULO_DOCUMENTOS = "Anexo de documentos necessários";

/**
 * 🔒 BLOQUEIO B-D1 — a lista de "documentos necessários" ainda não veio do
 * João. Enquanto não vier, o passo é GENÉRICO e OPCIONAL: sem a lista não dá
 * para exigir nada sem inventar exigência.
 */
export const AJUDA_DOCUMENTOS =
  "Se já tiver algum documento do caso, anexe aqui.";

/**
 * O que cada aba é, em uma linha ligada a fechar a 1ª holding (§D.1).
 *
 * 🔑 Indexado pelo RÓTULO da aba, e o tour itera `abas` (que vem de
 * `navDoAluno`): o sócio não vê Financeiro, e um tour com lista fixa mostraria
 * a ele uma aba que não existe. Aba sem frase aqui simplesmente não entra no
 * tour — nunca inventar descrição para item novo de menu.
 */
export const FRASE_DA_ABA: Record<string, string> = {
  Início:
    "Onde você está e o que fazer agora. Se estiver perdido, comece por aqui.",
  Clientes:
    "A sua central de clientes: os que você já tem, os que estão em andamento e os que já estão em execução. É daqui que sai a sua primeira holding.",
  Pasta: "A pasta do seu programa no Drive, compartilhada com a equipe.",
  Materiais: "As aulas e os modelos de cada etapa, num lugar só.",
  Financeiro: "O seu contrato com o programa e a sua meta de faturamento.",
  Suporte: "Fale com a equipe por aqui.",
  Perfil: "Seus dados e a sua senha.",
};

/**
 * Limites do anexo — os MESMOS de `gps.chamados`, importados e não copiados.
 *
 * O contrato do bucket `gps-onboarding` é idêntico byte a byte ao do
 * `gps-chamados` (4 MIMEs, 5 MB, caminho `<uuid>/<uuid>.<ext>`); a única coisa
 * que muda é o nome do bucket. `src/app/onboarding/actions.ts` importa das
 * mesmas constantes no servidor.
 */
export const MIMES_ACEITOS: readonly string[] = Object.keys(EXTENSAO_POR_MIME);
export const TAMANHO_MAXIMO = ANEXO_TAMANHO_MAXIMO;
export const BUCKET_ONBOARDING = "gps-onboarding";
