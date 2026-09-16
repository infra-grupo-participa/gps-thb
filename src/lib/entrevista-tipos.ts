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
 *
 * 🔴 ATUALIZADO EM 16/09/2026 (FATIA B, migração `…266`): a fila deixou de
 * perder quem não atendeu. `gps.entrevista_gravar` e `gps.fila_de_ligacoes`
 * trocaram de assinatura (a versão antiga foi DROPADA, não sobrecarregada) —
 * ver `TentativaEntrevista`, os campos novos de `EntrevistaGravarInput`/
 * `FilaDeLigacaoLinha` e o catálogo `MODOS_FILA` abaixo.
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

/**
 * Payload de `gps.entrevista_gravar` — os dados de UMA TENTATIVA de ligação
 * registrada de uma vez (fila B, migração `…266`, 16/09/2026: uma linha por
 * tentativa — `resultado` deixou de ser 1 valor único por cliente).
 */
export interface EntrevistaGravarInput {
  clienteId: string;
  resultado: ResultadoEntrevista;
  /** `null`/omitido = não mudar o DISC já registrado (ligação pode não render disso). */
  disc?: PerfilDisc | null;
  observacoes?: string | null;
  /** Substitui o conjunto de decisores do cliente por completo (mesmo padrão de `selecao_entrevista_definir`). */
  decisores?: DecisorInput[];
  /** Obrigatório (e no futuro) quando `resultado === "remarcar"`; ignorado nos demais. */
  retornoEm?: string | null;
  /** Nota de qualidade da ligação, 1-5, opcional — ver `QUALIDADE_MINIMA`/`QUALIDADE_MAXIMA`. */
  qualidade?: number | null;
}

/** Retorno de `gps.entrevista_gravar` — usado pela action para revalidar e confirmar. */
export interface EntrevistaGravarResultado {
  ok: boolean;
  erro?: string;
}

/** Teto/piso da nota de qualidade de UMA ligação (`gps.entrevista_tentativas.qualidade`). */
export const QUALIDADE_MINIMA = 1;
export const QUALIDADE_MAXIMA = 5;

/**
 * Os 3 modos de `gps.fila_de_ligacoes` (migração `…266`, decisão do Marcio
 * 16/09/2026): `fila` (não encerrado, sem retorno pendente futuro),
 * `sem_contato` (encerrado por TETO de 3 `nao_atendeu` consecutivas) e
 * `agendados` (não encerrado, retorno futuro). Modo fora deste catálogo →
 * a RPC recusa com 22023 ("Modo de fila inválido.").
 */
export const MODOS_FILA = ["fila", "sem_contato", "agendados"] as const;
export type ModoFila = (typeof MODOS_FILA)[number];

/**
 * Uma tentativa de ligação (`gps.entrevista_tentativas`) — histórico
 * completo de UM cliente, mais recente primeiro. Só para a ficha/dossiê de
 * UM cliente por vez: mesma regra de LGPD já escrita para `Decisor` acima —
 * `observacoes` e `qualidade` são o julgamento do operador sobre a ligação,
 * nunca entram em lista/CSV agregado.
 */
export interface TentativaEntrevista {
  id: string;
  clienteId: string;
  tentativaEm: string;
  /**
   * 🔴 QUEM LIGOU NÃO ENTRA no contrato (achado do pentester, 16/09/2026).
   * A `…267` tirou `tentativa_por` do dossiê de propósito, e nenhuma tela
   * mostra isso hoje. O campo existe na TABELA (auditoria), não no tipo que
   * a UI consome — assim não há shape pronto convidando a exibi-lo sem
   * decisão. Se um dia for exibir, volta junto com a tela que o justifica.
   */
  resultado: ResultadoEntrevista;
  qualidade: number | null;
  observacoes: string | null;
  retornoEm: string | null;
}

/**
 * Uma linha da fila de ligações (`gps.fila_de_ligacoes`) — o conjunto muda
 * conforme `ModoFila` (ver `MODOS_FILA`): `selecionado_entrevista = true` e,
 * dentro do modo, não encerrado/encerrado por teto/com retorno futuro.
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
  /** Total de tentativas já registradas para este cliente (histórico completo, não só as consecutivas). */
  tentativasTotal: number;
  /** Contador de `nao_atendeu` CONSECUTIVAS — zera a cada tentativa com outro resultado. */
  tentativasSemContato: number;
  ultimaTentativaEm: string | null;
  /** Resultado da ÚLTIMA tentativa (`null` se ainda não houve nenhuma). */
  ultimoResultado: ResultadoEntrevista | null;
  /** Data/hora do retorno pedido na última tentativa `remarcar`; `null` se não há retorno pendente. */
  retornoEm: string | null;
  totalLinhas: number;
}
