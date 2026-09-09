/**
 * Constantes e rótulos da lista de alunos do painel. Sem React: só tipo,
 * número e texto que os outros arquivos de `alunos-ativos-lista/` dividem.
 */

import type { AtendimentoDoAluno } from "@/lib/data";

export type OrdemAlunos =
  | "recentes"
  | "nome"
  | "progresso"
  | "clientes"
  | "tempo_de_casa"
  | "ultimo_acesso"
  | "nota_recente"
  | "honorarios";

/**
 * Rótulo de cada ordenação. Existe porque `SelectValue` do Base UI mostra o
 * VALOR selecionado, não o texto do `SelectItem`: sem este mapa (e sem a função
 * passada ao `SelectValue`), o gatilho fechado exibia "recentes"/"ultimo_acesso"
 * — código cru, em inglês misturado, na cara do usuário.
 */
export const ROTULO_ORDEM: Record<OrdemAlunos, string> = {
  recentes: "mais recentes",
  nome: "nome",
  progresso: "progresso",
  clientes: "clientes",
  tempo_de_casa: "mais tempo de casa",
  ultimo_acesso: "acesso mais recente",
  nota_recente: "nota mais recente",
  honorarios: "honorários",
};

export const ORDENS: OrdemAlunos[] = [
  "recentes",
  "nome",
  "progresso",
  "clientes",
  "tempo_de_casa",
  "ultimo_acesso",
  "nota_recente",
  "honorarios",
];

export const DIAS_INATIVO = 30;
export const META_CLIENTES = 30;
/** Janela do filtro "com nota nos últimos N dias" — dias de CALENDÁRIO. */
export const DIAS_NOTA_RECENTE = 7;

/** Trecho vindo do banco (`left(texto,140)`). Ver `AtendimentoDoAluno`. */
export const TAMANHO_RESUMO = 140;

export const SEM_ATENDIMENTO: AtendimentoDoAluno = {
  pendenciasAbertas: 0,
  ultimaNotaEm: null,
  ultimaNotaTipo: null,
  ultimaNotaResumo: null,

  chamadosAbertos: 0,
};
