/**
 * Entrevista prévia + decisores (Fatia 3 da esteira, migração `…262`,
 * 15/09/2026, decisões do Marcio).
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *   `src/app/admin/entrevista-actions.ts` leva `"use server"`, e um módulo com
 *   essa diretiva SÓ pode exportar `async function` — `export type`/`export
 *   const`/`export interface` passam no `tsc` e no `next build`, e quebram em
 *   RUNTIME (já derrubou `/admin` e `/admin/videos` em 10 e 11/09/2026). Os
 *   tipos moram aqui, importados por `import type` dos dois lados (a action e
 *   a UI do frontend).
 *
 * A fatia roda com o ADMIN que já existe (`gp_is_admin()`), sem papel de
 * operador — o papel novo é a fatia 5, fora de escopo aqui.
 */

import type { PerfilDisc } from "@/lib/types";

/**
 * Catálogo FECHADO do resultado da ligação (`entrevista_resultado`,
 * CHECK `chk_etapa1_clientes_entrevista_resultado` no banco).
 *
 * "Não atendeu" é separado de "sem interesse" DE PROPÓSITO (decisão do
 * Marcio, 15/09): virar um no outro seria falso e sumiria com quem só
 * precisa de nova tentativa — misturar os dois apagaria a diferença entre
 * "ainda não consegui falar" e "falei e ele recusou".
 */
export const RESULTADOS_ENTREVISTA = [
  "interessado",
  "sem_interesse",
  "nao_atendeu",
  "remarcar",
] as const;
export type ResultadoEntrevista = (typeof RESULTADOS_ENTREVISTA)[number];

/** Teto de `entrevista_observacoes` — mesmo padrão de `RegistrarNotaInput.texto`. */
export const ENTREVISTA_OBSERVACOES_MAXIMO = 2000;

/**
 * Um decisor do negócio do cliente (`gps.cliente_decisores`).
 *
 * 🔴 LGPD, o ponto mais sensível desta fatia: decisor é PESSOA FÍSICA que
 * nunca ouviu falar do portal, nomeada por um terceiro (o cliente, numa
 * ligação). Fica FORA da lista consolidada (`gps.admin_clientes_lista`), FORA
 * do CSV e FORA da fila de ligações (`gps.fila_de_ligacoes`) — só aparece na
 * ficha individual do cliente e no dossiê da entrevista. Nunca serializar
 * este tipo num payload que alimenta lista/exportação.
 */
export interface Decisor {
  id: string;
  clienteId: string;
  nome: string;
  papelNoNegocio: string | null;
  /** Um decisor marcado como o principal — não é exclusividade imposta pelo banco. */
  principal: boolean;
  criadoEm: string;
}

/** Payload de um decisor NOVO, como o formulário envia (sem `id`/`criadoEm`). */
export interface DecisorInput {
  nome: string;
  papelNoNegocio?: string | null;
  principal?: boolean;
}

/** Teto de caracteres dos campos de texto de um decisor — mesma régua do nome do cliente. */
export const DECISOR_NOME_MAXIMO = 200;
export const DECISOR_PAPEL_MAXIMO = 200;

/** Payload de `gps.entrevista_gravar` — os 4 dados de UMA ligação registrada de uma vez. */
export interface EntrevistaGravarInput {
  clienteId: string;
  resultado: ResultadoEntrevista;
  /** `null`/omitido = não mudar o DISC já registrado (ligação pode não render disso). */
  disc?: PerfilDisc | null;
  observacoes?: string | null;
  /** Substitui o conjunto de decisores do cliente por completo (mesmo padrão de `selecao_entrevista_definir`). */
  decisores?: DecisorInput[];
}

/** Retorno de `gps.entrevista_gravar` — usado pela action para revalidar e confirmar. */
export interface EntrevistaGravarResultado {
  ok: boolean;
  erro?: string;
}

/**
 * Uma linha da fila de ligações (`gps.fila_de_ligacoes`) — os clientes
 * `selecionado_entrevista = true` com entrevista PENDENTE (sem
 * `entrevista_resultado` ainda).
 *
 * 🔴 Molde: `gps.admin_clientes_lista` (migração `…255`) — mesma exclusão de
 * PII (nem `registro_contato`, nem decisores, nem honorários) e mesmo
 * `total_linhas` como universo do filtro, não da página.
 */
export interface FilaDeLigacaoLinha {
  clienteId: string;
  clienteNome: string;
  telefone: string | null;
  parceiroNome: string | null;
  grauRelacao: string | null;
  favorito: boolean;
  perfilDisc: PerfilDisc | null;
  totalLinhas: number;
}
