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
 * O caso deste cliente JÁ ANDOU? — e, por isso, a troca dele virou assunto de
 * chamado.
 *
 * 🔴 **Decisão do Marcio, 23/09/2026 (migração ...304).** A trava do favorito
 * deixou de depender da confirmação manual da equipe e passa a nascer sozinha
 * quando o caso anda. A condição é a MESMA da trigger
 * `trg_etapa1_clientes_acompanhamento_travado`, caractere a caractere:
 *
 *   `fase <> 'prospeccao'`  **ou**  `data_reuniao_preliminar` preenchida
 *
 * Por que mudou: em 3 meses foram 37 clientes escolhidos e **zero**
 * confirmados — a equipe nunca carimbava, então a trava só existia no papel, e
 * a diferença entre o que a tela prometia e o que o banco fazia gerou 7
 * chamados. Agora o gatilho é um FATO do caso, que o próprio aluno produz.
 *
 * A UI usa isto para **não oferecer** o que o banco vai recusar; a trava mesmo
 * continua sendo do banco. Se as duas condições divergirem, a estrela fica
 * clicável numa linha que o `update` recusa — que é exatamente o defeito que
 * esta função existe para impedir.
 *
 * ⚠️ Lê o dado do SERVIDOR, que é o `old` da próxima escrita. O cliente em
 * prospecção sem reunião pode ser movido de fase e ganhar data livremente: é o
 * UPDATE que faz o caso andar, e ele passa. O SEGUINTE é que trava.
 */
export function casoAndou(c: ClienteEtapa1): boolean {
  return c.fase !== "prospeccao" || c.data_reuniao_preliminar != null;
}

/**
 * A troca deste cliente está travada para o aluno?
 *
 * 🔴 Desde 23/09/2026 é `casoAndou(c)` — **não** mais
 * `acompanhamento_confirmado_em != null`. O nome continua o mesmo porque o que
 * ele responde continua o mesmo ("posso oferecer o botão?"); o que mudou é o
 * que liga a trava. `acompanhamento_confirmado_em` segue existindo como
 * registro da equipe e continua sendo escrita exclusiva dela, mas não decide
 * mais nada aqui.
 */
export function travadoPelaEquipe(c: ClienteEtapa1): boolean {
  return casoAndou(c);
}

/**
 * A estrela DESTE cliente está travada? = ele é o favorito **e** o caso andou.
 *
 * 🔴 **As duas condições, juntas (23/09/2026).** `travadoPelaEquipe` sozinho
 * responde "o caso andou", e isso vale para clientes que NUNCA foram favorito
 * — hoje, 26 dos 37. Usá-lo sozinho para a estrela esconderia o botão de toda
 * linha em fechamento, incluindo a de quem ainda nem escolheu ninguém: a tela
 * ficaria sem saída para o aluno que só avançou clientes.
 *
 * O que o banco recusa é DESMARCAR o marcado e APAGAR o marcado. MARCAR um
 * cliente que já andou continua livre (`old.acompanhado_equipe` é falso e
 * nada dispara) — desde que não haja outro marcado-e-travado para desmarcar
 * antes, que é o que `existeTravado` cobre no contexto.
 */
export function estrelaTravada(c: ClienteEtapa1): boolean {
  return c.acompanhado_equipe && casoAndou(c);
}

/**
 * Como a estrela deste cliente aparece para quem está vendo a tela.
 *
 * 🔴 **Migração ...304 (23/09/2026)** — a trava passou a nascer do caso ter
 * andado, não da confirmação da equipe. A trigger
 * `etapa1_clientes_acompanhamento_travado` recusa (42501, com a frase "Para
 * trocar o cliente que a equipe acompanha, abra um chamado no Suporte.")
 * desmarcar a estrela e apagar o cliente marcado **quando o caso andou**.
 *
 * E `definirClienteEquipe` desmarca TODOS antes de marcar um (o índice único
 * parcial obriga): com um favorito travado no ambiente, marcar outro bate na
 * trava já no primeiro `update`. Por isso `existeTravado` esconde a estrela
 * dos demais — não é enfeite, é o `update` que falharia.
 *
 * Os quatro estados, para o ALUNO:
 *   · favorito com caso andado → `confirmada` (sinal, sem clique);
 *   · favorito em prospecção sem reunião → `escolhida` (clicável, desmarca);
 *   · existe outro favorito travado → `ausente`;
 *   · o resto → `botao`.
 *
 * Para o ADMIN nada mudou: ele é o caminho da equipe trocar, e a trigger não o
 * barra — mas a estrela dos outros continua escondida quando há um travado,
 * porque ele troca na ficha DAQUELE cliente.
 */
export type ModoEstrela = "botao" | "escolhida" | "confirmada" | "ausente";

/** Quem está vendo a tela e o que já existe no ambiente. */
export type CtxEstrela = {
  admin: boolean;
  /**
   * 🔴 Era `existeConfirmado` (= alguém com `acompanhamento_confirmado_em`),
   * que em produção foi SEMPRE falso — 0 confirmados em 3 meses. Agora é
   * "existe favorito cujo caso já andou", a condição que de fato faz o
   * `update` falhar.
   */
  existeTravado: boolean;
};

export function modoEstrela(c: ClienteEtapa1, ctx: CtxEstrela): ModoEstrela {
  if (estrelaTravada(c)) return "confirmada";
  if (ctx.admin) return ctx.existeTravado ? "ausente" : "botao";
  // Enquanto o favorito do ambiente não travou, o parceiro troca de ideia — a
  // estrela dos OUTROS clientes tem de continuar clicável, senão quem escolheu
  // errado não tem botão em tela nenhuma. Medido em 11/09/2026: 29 ambientes,
  // 570 clientes sem saída.
  if (c.acompanhado_equipe) return "escolhida";
  return ctx.existeTravado ? "ausente" : "botao";
}


/**
 * "Excluir" pode ser oferecido?
 *
 * 🔴 `estrelaTravada`, não `travadoPelaEquipe` (23/09/2026). A trigger recusa
 * o DELETE de quem **está com a estrela E cujo caso andou** — apagar um
 * cliente qualquer que foi para fechamento continua livre, e sempre foi. Usar
 * `travadoPelaEquipe` aqui esconderia a lixeira dos 26 clientes que só
 * avançaram de fase: exatamente o defeito de 11/09/2026, quando a linha
 * `if (!admin && c.acompanhado_equipe)` escondia a exclusão de 39 clientes que
 * o banco deixaria apagar.
 */
export function podeExcluirCliente(c: ClienteEtapa1): boolean {
  return !estrelaTravada(c);
}

/**
 * As fases que ESTE cliente ainda pode assumir.
 *
 * 🔴 A trigger recusa voltar para `prospeccao` **qualquer** cliente cujo caso
 * já andou — com ou sem estrela (é o que impediria "desandar" o caso para
 * destravar a troca). Por isso aqui é `travadoPelaEquipe` mesmo, e não
 * `estrelaTravada`.
 *
 * A exceção do `c.fase === "prospeccao"` não é detalhe: o cliente que está em
 * prospecção COM reunião marcada já conta como "andou", e sem ela ficaria com
 * um `Select` cujo valor atual não existe entre as opções — qualquer toque no
 * campo o moveria de fase sem querer. (A trigger também o deixa ficar onde
 * está: ela só recusa `new.fase = 'prospeccao'` quando `old.fase` era outra.)
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
      // "perda" (maior perda pela inércia) REMOVIDA por decisão do Marcio
      // (10/09/2026) — o conceito saiu do sistema.
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
