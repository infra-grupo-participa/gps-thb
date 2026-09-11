import type { PapelMembro } from "@/lib/types";

/**
 * Tipos de "Gerenciar acesso" — extraídos de `src/app/admin/senha-actions.ts`
 * (feature "trocar e-mail do login pela tela do admin", 11/09/2026).
 *
 * POR QUE SAÍRAM DE UM MÓDULO `"use server"`
 *   `senha-actions.ts` é `"use server"`: um módulo desses só pode exportar
 *   função async — `export interface` é aceito pelo compilador, mas é bomba
 *   armada (já derrubou produção 3 vezes nesta classe de defeito). Os
 *   componentes cliente que só precisam do TIPO (`dialogos.tsx`,
 *   `membros-view.tsx`, `painel.tsx`, `senha-de-membro.tsx`) agora importam
 *   daqui com `import type`, sem depender do bundling de Server Action.
 */

export interface MembroAcesso {
  membroId: string;
  papel: PapelMembro;
  userId: string | null;
  email: string | null;
  temSenha: boolean;
  emailConfirmado: boolean;
  ultimoAcesso: string | null;
}

export interface StatusAcesso {
  temLogin: boolean;
  emailCadastro: string | null;
  emailLogin: string | null;
  emailBate: boolean;
  emailConfirmado: boolean;
  temSenha: boolean;
  ultimoAcesso: string | null;
  noGps: boolean;
  vinculoCompleto: boolean;
  solicitacaoPendente: boolean;
  /** Ambiente compartilhado: todos os membros (titular + sócios). */
  qtdMembros: number;
  membros: MembroAcesso[];
}
