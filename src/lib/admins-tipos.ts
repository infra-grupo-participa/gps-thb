/**
 * Admins do programa — tipos e frases (08/10/2026).
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *   `src/app/admin/admins-actions.ts` leva `"use server"`, e módulo com essa
 *   diretiva SÓ pode exportar `async function` (`export const`/`type` passa no
 *   `tsc` e quebra em runtime). Tipos, limites e frases moram aqui, lidos pela
 *   action, pela tela e por `src/lib/erros.ts`.
 *
 * Contrato do banco (Victor, schema `gps`):
 *   - `admins_listar()` → {user_id, nome, email, ativo, concedido_em,
 *     revogado_em, motivo, concedido_por_nome}; 42501 se não for admin.
 *   - `admin_definir(p_email, p_ativo, p_motivo, p_simular default false)` →
 *     jsonb {user_id, email, ativo, mudou | mudaria, criado_em, ultimo_login};
 *     com `p_simular=true` valida tudo e NÃO grava. 42501 · 22023 (motivo
 *     3..300 / e-mail fora de `^[a-z0-9._-]+@advmais\.com$` / conta de aluno
 *     do programa) · P0002 (sem login) · P0001 (último admin / a si mesmo).
 *   - `admins_historico(p_limite)` → {em, acao, alvo_nome, alvo_email,
 *     ator_nome, motivo}.
 */

export interface AdminDoPrograma {
  userId: string;
  nome: string;
  email: string;
  ativo: boolean;
  concedidoEm: string | null;
  revogadoEm: string | null;
  motivo: string | null;
  concedidoPorNome: string | null;
}

export type AcaoHistoricoAdmin = "concedido" | "revogado" | "reativado";

export interface EventoAdmin {
  em: string;
  acao: AcaoHistoricoAdmin;
  alvoNome: string;
  alvoEmail: string;
  atorNome: string | null;
  motivo: string | null;
}

export interface DefinirAdminResultado {
  ok: boolean;
  erro?: string;
  /**
   * `false` quando a pessoa já estava no estado pedido. Na simulação é o
   * `mudaria` do banco (o que ACONTECERIA), no modo real o `mudou`.
   */
  mudou?: boolean;
  /** `true` quando foi só conferência (`p_simular`) — nada gravado. */
  simulado?: boolean;
  /** Quando o login foi criado (`auth.users`), para conferir a conta. */
  criadoEm?: string | null;
  /** Último login; `null` = nunca entrou. */
  ultimoLogin?: string | null;
}

/** Limites do motivo — os mesmos do `gps.admin_definir` (22023 fora deles). */
export const MOTIVO_ADMIN_MIN = 3;
export const MOTIVO_ADMIN_MAX = 300;

/** Só conta da equipe vira admin do programa (a RPC recusa o resto). */
export const DOMINIO_ADMIN = "@advmais.com";

// ── Frases. As duas primeiras são o texto VERBATIM do `raise` da RPC (casam
// por igualdade em `FRASES_DO_BANCO`); as demais traduzem o código SQLSTATE
// no escopo `admin/definirAdmin` (ver `POR_CODIGO_DO_ESCOPO` em erros.ts).
export const FRASE_ADMIN_SO_EQUIPE =
  "Só contas da equipe (@advmais.com) podem ser admin do programa.";
export const FRASE_ADMIN_SEM_LOGIN = "Não existe login com este e-mail.";
export const FRASE_ADMIN_MOTIVO = `O motivo precisa ter de ${MOTIVO_ADMIN_MIN} a ${MOTIVO_ADMIN_MAX} caracteres.`;
export const FRASE_ADMIN_ULTIMO =
  "Não é possível remover: o programa ficaria sem nenhum admin ativo.";
export const FRASE_ADMIN_SI_MESMO =
  "Você não pode remover a si mesmo. Peça a outro admin.";
export const FRASE_ADMIN_EMAIL_INVALIDO = "Informe um e-mail válido.";
/**
 * 22023 que chega do banco. A action já barra motivo fora de 3..300 e e-mail
 * fora de @advmais.com antes da RPC; o que sobra para o banco recusar é
 * e-mail com caractere fora do padrão ou conta que é de ALUNO do programa —
 * texto do `raise` não conhecido verbatim, por isso uma frase que cobre os
 * casos sem afirmar qual deles foi.
 */
export const FRASE_ADMIN_CONTA_RECUSADA =
  "Esta conta não pode ser admin do programa. Use a conta @advmais.com da pessoa na equipe, sem caracteres especiais e que não seja conta de aluno do programa.";
