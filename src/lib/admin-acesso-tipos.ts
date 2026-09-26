import type { Aluno } from "@/lib/types";

/**
 * Tipos de `src/app/admin/actions.ts` (busca de aluno, duplicata, diagnóstico
 * de login, resultado do lote de acesso) — extraídos daqui em 24/09/2026.
 *
 * POR QUE SAÍRAM DE UM MÓDULO `"use server"`
 *   `actions.ts` é `"use server"`: um módulo desses só pode exportar função
 *   async — `export interface` é aceito pelo compilador e pelo `next build`,
 *   mas é bomba armada em runtime (mesma classe que já derrubou produção 3
 *   vezes: `LOTE_ACESSOS_MAXIMO` em 10/09, `ErroDeBanco`/`SalvarVideoInput`
 *   em `admin/videos/actions.ts` em 11/09, e `MembroAcesso`/`StatusAcesso`
 *   em `admin/senha-actions.ts`, que EXPLODIU em produção em 24/09 —
 *   `ReferenceError: MembroAcesso is not defined` matando todas as actions
 *   de exclusão/definição de senha na avaliação do módulo). Os componentes
 *   cliente que só precisam do tipo importam daqui com `import type`.
 */

/**
 * O mínimo que o lote de acesso (`LoteDeAcesso`) precisa de cada pessoa: o id
 * do cadastro e como chamá-la/falar com ela. `AlunoGps` (painel) e
 * `CompradorHmAguardando` (fila do HM, 26/09/2026) satisfazem por estrutura —
 * um componente só para os dois caminhos, nenhuma segunda porta de criação.
 */
export interface CandidatoAoLote {
  alunoId: string;
  aluno: Pick<Aluno, "nome" | "email" | "telefone"> | null;
}

/**
 * Comprador do HM cheio aguardando acesso ao Programa
 * (`gps.admin_compradores_hm_aguardando`, migração `…317`).
 */
export interface CompradorHmAguardando extends CandidatoAoLote {
  compradoEm: string;
  ofertaCodigo: string;
  valor: number | null;
  metodoPagamento: string | null;
  /** O e-mail já tem login em outro portal do grupo — autorizar pede decisão. */
  temLogin: boolean;
}

export interface AlunoBusca extends Aluno {
  documento: string | null;
  jaNoGps: boolean;
}

export interface AlunoDuplicado {
  id: string;
  nome: string | null;
  email: string | null;
  documento: string | null;
  motivo: "documento" | "email";
}

export interface ProgramaDoLogin {
  programa: string;
  detalhe: string | null;
}

export interface DiagnosticoLogin {
  temLogin: boolean;
  email: string | null;
  origem: string | null;
  ultimoAcesso: string | null;
  eEquipe: boolean;
  programas: ProgramaDoLogin[];
  temDireito: boolean;
  motivoDireito: string | null;
}

export interface ResultadoAcessoEmLote {
  alunoId: string;
  ok: boolean;
  erro?: string;
  email?: string;
  senha?: string;
  emailEnviado?: boolean;
  /** Login já existe em outro portal: exige decisão nomeada, uma a uma. */
  precisaDecisao?: boolean;
  programas?: string[];
}
