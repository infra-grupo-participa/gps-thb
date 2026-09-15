/**
 * Contrato do cadastro obrigatório do sócio convidado.
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *   `src/app/onboarding/socio-actions.ts` leva `"use server"`, e um módulo com
 *   essa diretiva SÓ pode exportar `async function` — `export type`/`export
 *   interface` passam no `tsc` e no `next build`, e quebram em RUNTIME (já
 *   derrubou `/admin` e `/admin/videos` em 10 e 11/09/2026). Os tipos moram
 *   aqui, importados por `import type` dos dois lados (server action e UI do
 *   frontend).
 *
 * Os 10 campos gravados batem 1:1 com os parâmetros de
 * `gps.socio_cadastro_gravar` (migração `…256`) — e-mail NÃO é um deles: vem
 * de `auth.users.email` lido no servidor.
 */

/** Os 10 campos que o formulário do sócio preenche. */
export interface SocioCadastroPayload {
  nome: string;
  documento: string;
  telefone: string;
  cep: string;
  cidade: string;
  /** Sigla de 2 letras — `thb_alunos.estado` é `character(2)`. */
  estado: string;
  bairro: string;
  logradouro: string;
  numero: string;
  pais: string;
}

/** Retorno de `gravarCadastroSocio`. */
export interface SocioCadastroResultado {
  ok: boolean;
  /** Frase em português pronta para a tela — nunca `error.message` cru. */
  erro?: string;
  /**
   * `true` quando o CPF já pertencia a OUTRO membro do programa: os dados
   * foram gravados em `thb_alunos`, mas `pessoa_aluno_id` ficou `null` (a
   * entrada foi liberada mesmo assim). A tela avisa sem citar nome nem
   * ambiente de terceiro.
   */
  cpfDeOutroMembro?: boolean;
}

/** As 27 UFs do Brasil, para o `<select>` fechado do formulário. */
export const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export type UfBrasil = (typeof UFS_BRASIL)[number];
