/**
 * Busca, filtro por fase e ordenação da lista de clientes — sem React, sem
 * JSX, testáveis. Saíram do `useMemo` do `ClientesManager` no corte da Onda 3
 * (CD5): mesmo código, mesma ordem, mesmo desempate.
 *
 * 🔑 Tudo roda em memória sobre os ≤ 30 clientes já carregados: nenhuma ida
 * nova ao banco para contar, somar ou filtrar. E a meta de faturamento NÃO
 * passa por aqui — ela usa a lista inteira, porque filtrar por fase não pode
 * mudar o faturamento do ambiente.
 */

import type { ClienteEtapa1, FaseCliente, GrauRelacao } from "@/lib/types";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import type { FiltroGrau, Ordenacao } from "./tipos";

/** Quantos clientes há em cada fase, na ordem oficial de `FASES_CLIENTE`. */
export function contarPorFase(clientes: ClienteEtapa1[]) {
  return FASES_CLIENTE.map((f) => ({
    ...f,
    qtd: clientes.filter((c) => c.fase === f.id).length,
  }));
}

/**
 * Quantos clientes há em cada grau de relação, mais o "Não informado".
 *
 * 🔑 `null` tem chip PRÓPRIO e é o último da fila. Nunca cai dentro de "Lead":
 * a ausência de resposta sobre um terceiro é "não informado", não um palpite
 * sobre a vida dele (§B.6 do plano).
 *
 * Grau com zero cliente **não vira chip** — seis filtros vazios acima da lista
 * são seis alvos de clique que devolvem nada.
 */
export function contarPorGrau(
  clientes: ClienteEtapa1[],
): { id: FiltroGrau; rotulo: string; ajuda?: string; qtd: number }[] {
  const itens = GRAUS_RELACAO_UI.map((g) => ({
    id: g.id as FiltroGrau,
    rotulo: g.rotulo,
    ajuda: g.ajuda,
    qtd: clientes.filter((c) => c.grau_relacao === g.id).length,
  })).filter((g) => g.qtd > 0);

  const semGrau = clientes.filter((c) => c.grau_relacao == null).length;
  if (semGrau > 0) {
    itens.push({
      id: "nao_informado",
      rotulo: "Não informado",
      ajuda: "Clientes sem grau de relação preenchido na ficha.",
      qtd: semGrau,
    });
  }
  return itens;
}

/**
 * A equipe assumiu o acompanhamento DESTE cliente?
 *
 * `acompanhamento_confirmado_em` preenchido = o banco recusa (42501) desmarcar
 * a estrela, apagar o cliente e voltar a fase para `prospeccao` — trigger
 * `trg_etapa1_clientes_acompanhamento_travado` (migração ...203). A UI usa
 * isto para **não oferecer** o que vai falhar; a trava mesmo é do banco.
 */
export function travadoPelaEquipe(c: ClienteEtapa1): boolean {
  return c.acompanhamento_confirmado_em != null;
}

/**
 * Como a estrela deste cliente aparece para quem está vendo a tela.
 *
 * 🔴 Migração ...215 — **a escolha do aluno virou definitiva**. A trigger
 * `etapa1_clientes_acompanhamento_travado` passou a recusar (42501, com a
 * frase "Para trocar o cliente que a equipe acompanha, abra um chamado no
 * Suporte.") DUAS coisas que antes passavam: o aluno desmarcar a estrela e o
 * aluno marcar um segundo cliente. E `definirClienteEquipe` desmarca TODOS
 * antes de marcar um (o índice único parcial obriga), então marcar o segundo
 * bate na trava já no primeiro `update`.
 *
 * Por isso, para o ALUNO, basta existir favorito no ambiente:
 *   · no favorito, a estrela é SINAL (`escolhida`) — não há clique possível;
 *   · em todos os outros, ela some (`ausente`).
 *
 * Para o ADMIN nada mudou: ele é o caminho da equipe trocar. Só o cliente já
 * CONFIRMADO continua com a estrela travada para os dois.
 */
export type ModoEstrela = "botao" | "escolhida" | "confirmada" | "ausente";

/** Quem está vendo a tela e o que já existe no ambiente. */
export type CtxEstrela = {
  admin: boolean;
  existeFavorito: boolean;
  existeConfirmado: boolean;
};

export function modoEstrela(c: ClienteEtapa1, ctx: CtxEstrela): ModoEstrela {
  if (travadoPelaEquipe(c)) return "confirmada";
  if (ctx.admin) return ctx.existeConfirmado ? "ausente" : "botao";
  if (c.acompanhado_equipe) return "escolhida";
  return ctx.existeFavorito ? "ausente" : "botao";
}


/**
 * "Excluir" pode ser oferecido?
 *
 * Confirmado: não, para ninguém (a trava da ...203 continua, e a ficha diz o
 * caminho). Favorito ainda não confirmado: não para o ALUNO — a ...215 recusa
 * o DELETE com a mesma frase do Suporte —, sim para o admin, que é quem troca.
 */
export function podeExcluirCliente(c: ClienteEtapa1, admin: boolean): boolean {
  if (travadoPelaEquipe(c)) return false;
  if (!admin && c.acompanhado_equipe) return false;
  return true;
}

/**
 * As fases que ESTE cliente ainda pode assumir.
 *
 * Travado, "Prospecção" sai da lista — o banco recusa a volta. A exceção do
 * `c.fase === "prospeccao"` não é detalhe: sem ela o cliente confirmado que
 * está em prospecção ficaria com um `Select` cujo valor atual não existe entre
 * as opções, e qualquer toque no campo o moveria de fase sem querer.
 */
export function fasesDisponiveis(c: ClienteEtapa1) {
  if (!travadoPelaEquipe(c) || c.fase === "prospeccao") return FASES_CLIENTE;
  return FASES_CLIENTE.filter((f) => f.id !== "prospeccao");
}

/** O grau de relação combina com o filtro escolhido? */
function casaGrau(c: ClienteEtapa1, grau: FiltroGrau | "todos"): boolean {
  if (grau === "todos") return true;
  if (grau === "nao_informado") return c.grau_relacao == null;
  return c.grau_relacao === (grau as GrauRelacao);
}

/** Nome ou telefone contendo o termo. Busca vazia devolve o array recebido. */
export function filtrarPorBusca(
  clientes: ClienteEtapa1[],
  busca: string,
): ClienteEtapa1[] {
  const q = busca.trim().toLowerCase();
  if (!q) return clientes;
  return clientes.filter(
    (c) =>
      (c.nome ?? "").toLowerCase().includes(q) ||
      (c.telefone ?? "").toLowerCase().includes(q),
  );
}

/**
 * Filtra por fase e por grau de relação, e ordena. "recentes" é a ordem em que
 * a lista chegou do servidor — não reordena. Cópia antes do `sort`: o array de
 * entrada é o estado do componente e `sort` muta no lugar.
 *
 * Os dois filtros são independentes e se somam (E, não OU): fase é o estágio
 * do negócio, grau é o tipo de vínculo — eixos ortogonais, existe parente em
 * fechamento e lead em prospecção.
 */
export function ordenarClientes(
  buscaFiltrada: ClienteEtapa1[],
  filtro: "todos" | FaseCliente,
  ordenacao: Ordenacao,
  grau: FiltroGrau | "todos" = "todos",
): ClienteEtapa1[] {
    const arr = buscaFiltrada.filter(
      (c) => (filtro === "todos" || c.fase === filtro) && casaGrau(c, grau),
    );
    const copia = [...arr];
    switch (ordenacao) {
      case "nome":
        copia.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        break;
      case "perda":
        copia.sort((a, b) => (b.perda_inercia ?? 0) - (a.perda_inercia ?? 0));
        break;
      case "reuniao":
        copia.sort((a, b) =>
          (a.data_reuniao_preliminar ?? "9999").localeCompare(
            b.data_reuniao_preliminar ?? "9999",
          ),
        );
        break;
    }
    return copia;
}
