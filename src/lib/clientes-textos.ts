/**
 * OS TEXTOS DO PRÉ-REQUISITO DA ESTRELA — um lugar só, para a ficha e a lista.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE (medido em 23/09/2026): o botão "Marcar como
 * cliente da equipe" falhava para **48 de 86 parceiros** (57%) com a frase
 * genérica *"Algum campo está fora do formato aceito"* — e não havia campo
 * errado nenhum. O que recusava era o CHECK
 * `chk_etapa1_clientes_favorito_e_selecionado` em `gps.etapa1_clientes`:
 * `(NOT acompanhado_equipe) OR selecionado_entrevista`, ou seja, só vira
 * estrela quem JÁ está entre os 5 escolhidos para a Entrevista Prévia.
 *
 * 🔴 **A REGRA FICA** (decisão do Marcio, 23/09/2026 — não reabrir): o CHECK
 * não cai. O que muda é a TELA, que passa a dizer **o que falta, com nome**, e
 * a oferecer o caminho. Palavras dele: *"não deixa em aberto isso, confunde o
 * cliente"*.
 *
 * 🔑 Nenhuma frase daqui cita constraint, código de banco, tabela ou coluna —
 * quem lê é o parceiro, não o DBA.
 *
 * 🔑 O nome do botão aparece LITERAL, como está na tela
 * (`clientes-manager/index.tsx`). Se ele for renomeado lá, estas frases
 * mandam o usuário procurar um botão que não existe: renomear é mudar os dois
 * lugares.
 */

/** O nome do botão que abre o seletor dos 5, exatamente como está na tela. */
export const BOTAO_ESCOLHER_OS_5 = "Escolher os 5 da entrevista";

/**
 * A ficha, para o PARCEIRO. O `<NOME>` do cliente entra interpolado (em
 * negrito na tela) — por isso o texto vem partido em duas metades, e não como
 * função que devolve string: o nome precisa ser um nó React próprio.
 *
 * "Vá em Clientes" é LINK para a lista de clientes (respeitando o `basePath`).
 */
export const FICHA_PARCEIRO_ANTES =
  "Só é possível marcar como cliente da equipe quem está entre os 5 escolhidos para a Entrevista Prévia. ";
export const FICHA_PARCEIRO_DEPOIS_NOME =
  " ainda não está nessa lista. ";
/** O texto do link "Vá em Clientes". */
export const FICHA_PARCEIRO_LINK = "Vá em Clientes";
export const FICHA_PARCEIRO_FIM = ` e use "${BOTAO_ESCOLHER_OS_5}" para incluí-lo.`;

/**
 * A ficha, para o ADMIN em Modo Assistência.
 *
 * 🔴 Frase DIFERENTE de propósito: ele precisa saber de quem é a escolha.
 * Lendo a frase do parceiro, o admin procuraria um botão de admin que não
 * existe — a seleção dos 5 é do parceiro, dentro do ambiente dele.
 */
export const FICHA_ADMIN = `Este cliente não está entre os 5 escolhidos para a Entrevista Prévia. A seleção é do parceiro — para marcá-lo como cliente da equipe, primeiro inclua-o na lista pelo botão "${BOTAO_ESCOLHER_OS_5}", na aba Clientes deste ambiente.`;

/**
 * A lista/quadro de clientes (usada pelo `ClientesManager`). Aqui o botão está
 * na MESMA tela, logo acima — por isso "acima" em vez de "Vá em Clientes".
 */
export const LISTA_ANTES = "";
export const LISTA_DEPOIS_NOME = ` não está entre os 5 escolhidos para a Entrevista Prévia. Use "${BOTAO_ESCOLHER_OS_5}", acima, para incluí-lo.`;

/**
 * A frase inteira da lista, já com o nome — para quem monta o texto como
 * string única (toast, `title`, `aria-label`).
 */
export function textoListaNaoSelecionado(nome: string): string {
  return `${nome}${LISTA_DEPOIS_NOME}`;
}
