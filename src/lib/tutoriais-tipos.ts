/**
 * Aba de Tutoriais — contratos e catálogo (feature 15/09/2026).
 *
 * NASCE LIMPO: nenhum "use server" aqui. Módulo de tipos/constantes puro,
 * importado tanto pelo frontend (client components) quanto pelas Server
 * Actions (`import type` + valores) — ver a lição registrada no CLAUDE.md:
 * `"use server"` só exporta `async function`, então tipo e constante moram
 * SEMPRE num arquivo separado, ao lado (molde: `videos-tipos.ts`).
 */

/**
 * As 8 seções do tutorial, NA ORDEM DE EXIBIÇÃO da tela (decisão do Marcio —
 * `etapas` vem em 7º de propósito, depois de todo o operacional e antes só
 * de "Conta e acesso").
 *
 * 🔴 Este array espelha EXATAMENTE o CHECK de `gps.tutoriais.secao` no banco
 * (`supabase/migrations/20260915000257_gps_tutoriais.sql`). Os dois lados
 * precisam ter os mesmos 8 ids — sempre. Acrescentar um valor só no banco
 * sem acrescentar aqui não dá erro nenhum: o tutorial simplesmente FICA
 * INVISÍVEL na listagem, porque nada no TypeScript exige a chave nova (é a
 * mesma classe de bug do `Record<TipoEvento, string>` que não obriga chave
 * ausente da união — "some calado", registrado no CLAUDE.md). Mudar aqui
 * SEM mudar o CHECK do banco tem o efeito oposto: a RPC `tutorial_salvar`
 * aceita uma seção que o banco recusa com 23514.
 */
export const SECOES_TUTORIAL = [
  { id: "primeiros_passos", rotulo: "Primeiros passos" },
  { id: "clientes", rotulo: "Clientes" },
  { id: "pasta", rotulo: "Pasta" },
  { id: "materiais", rotulo: "Materiais" },
  { id: "suporte", rotulo: "Suporte" },
  { id: "equipe", rotulo: "Equipe" },
  { id: "etapas", rotulo: "As 6 etapas do programa" },
  { id: "conta", rotulo: "Conta e acesso" },
] as const;

export type SecaoTutorial = (typeof SECOES_TUTORIAL)[number]["id"];

/**
 * Limites de campo — espelham exatamente os CHECKs de `gps.tutorial_salvar`
 * (migração `20260915000257_gps_tutoriais.sql`). Mudar aqui sem mudar o
 * banco (ou vice-versa) faz a validação do cliente e a da RPC divergirem
 * silenciosamente — mesmo cuidado de `VIDEO_TITULO_MAXIMO` em `videos-tipos.ts`.
 */
export const TUTORIAL_TITULO_MINIMO = 3;
export const TUTORIAL_TITULO_MAXIMO = 200;
export const TUTORIAL_RESUMO_MAXIMO = 500;
export const TUTORIAL_PASSOS_MAXIMO = 30;
export const TUTORIAL_PASSO_MAXIMO = 500;

/** Retorno padrão das Server Actions de tutoriais — mesmo shape de vídeos/chamados/plantão. */
export type ResultadoAcao = { ok: true } | { ok: false; erro: string };

/**
 * Entrada de `salvarTutorial` (`src/app/admin/tutoriais/actions.ts`).
 *
 * 🔴 MORA AQUI, não no arquivo da action — mesma razão de `SalvarVideoInput`
 * em `videos-tipos.ts`: módulo `"use server"` só pode exportar função
 * async, e um tipo exportado de lá passa pelo `tsc`/build mas quebra em
 * runtime (`ReferenceError`), já derrubou produção 3 vezes.
 */
export interface SalvarTutorialInput {
  id?: string;
  titulo: string;
  resumo: string;
  secao: SecaoTutorial;
  /** String vazia = sem vídeo. A extração do `youtube_id` acontece na action, como em vídeos. */
  url: string;
  passos: string[];
  ordem: number;
}
