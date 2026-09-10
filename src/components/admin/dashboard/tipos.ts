/**
 * Rótulos, tons e formatação do dashboard executivo.
 *
 * 🔑 **O contrato `Dashboard` NÃO mora mais aqui.** Na Onda 1 este arquivo
 * carregava a interface inteira, como proposta para a RPC. A `…209` foi
 * aplicada e o tipo publicado vive em `src/lib/data/dashboard.ts` (dono:
 * backend) — importar de lá é o que garante que a tela e a consulta digam a
 * mesma coisa. Aqui ficam só as decisões de APRESENTAÇÃO: qual palavra, qual
 * tom, qual recorte.
 *
 * 🔴 Um desvio do que a Onda 1 pediu, e o motivo: o contrato proposto tinha
 * `mesAtual: "setembro"` vindo do banco (`to_char(..., 'TMMonth')`). A RPC
 * entregue devolve `"2026-09"`. **Não vou formatar isso com `Intl`** — é a
 * classe de erro que o `brlCompacto` já custou a este projeto (o ICU do Node
 * da Hostinger divergiu do ICU do navegador). Doze strings numa tabela fixa
 * (`MESES_PT`) resolvem sem `Intl`, sem locale de processo e sem risco de
 * hidratação. É mais barato do que uma migration para renomear um mês.
 */

import type { FaseCliente, GrauRelacao } from "@/lib/types";
import type { FaixaTrilha } from "@/lib/data/dashboard";
import type { TomGrafico } from "@/components/ui/graficos";
import { GRAUS_RELACAO_UI } from "@/lib/etapa1";

/**
 * A comparação do mês, no formato que `<VariacaoDoMes>` consome.
 *
 * `ateODia` é o dia em que os DOIS lados foram cortados — a tela é obrigada a
 * escrever esse número, senão a comparação mente todo começo de mês.
 */
export interface VariacaoMes {
  atual: number;
  anterior: number;
  ateODia: number;
}

/**
 * Os doze meses, escritos à mão.
 *
 * Sem `Intl.DateTimeFormat`: ele depende do ICU do processo, e este projeto já
 * teve `/admin` inteiro quebrando a hidratação por causa de uma diferença de
 * ICU entre o Node da Hostinger e o navegador. Doze palavras não mudam.
 */
const MESES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const MESES_ABREVIADOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

function indiceDoMes(aaaaMm: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(aaaaMm ?? "");
  if (!m) return null;
  const i = Number(m[2]) - 1;
  return i >= 0 && i <= 11 ? i : null;
}

/** `"2026-09"` → `"setembro"`. Devolve a entrada crua se não reconhecer. */
export function nomeDoMes(aaaaMm: string): string {
  const i = indiceDoMes(aaaaMm);
  return i === null ? aaaaMm : MESES_PT[i];
}

/**
 * `"2026-09"` → `"set"`, ou `"set/26"` quando a série cruza mais de um ano
 * (senão dois setembros diferentes viram o mesmo rótulo no gráfico).
 */
export function rotuloDoMes(aaaaMm: string, comAno: boolean): string {
  const i = indiceDoMes(aaaaMm);
  if (i === null) return aaaaMm;
  return comAno ? `${MESES_ABREVIADOS[i]}/${aaaaMm.slice(2, 4)}` : MESES_ABREVIADOS[i];
}

/** `"2026-09-01"` (um `date` do Postgres) → `"01/09"`, por recorte de string. */
export function diaCurto(aaaaMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(aaaaMmDd ?? "");
  return m ? `${m[3]}/${m[2]}` : aaaaMmDd;
}

/** Rótulo de cada grau de relação, no vocabulário de `src/lib/etapa1.ts`. */
export const ROTULO_GRAU_RELACAO: Record<GrauRelacao, string> =
  Object.fromEntries(GRAUS_RELACAO_UI.map((g) => [g.id, g.rotulo])) as Record<
    GrauRelacao,
    string
  >;

/**
 * Tom do gráfico por fase do cliente — o MESMO significado de cor que
 * `FASES_CLIENTE.cor` já usa nos chips (cinza / âmbar / verde). Não é uma
 * paleta nova: é o mesmo par semântico, dito no vocabulário do gráfico.
 */
export const TOM_DA_FASE: Record<FaseCliente, TomGrafico> = {
  prospeccao: "neutro",
  fechamento: "atencao",
  contratado: "sucesso",
};

/**
 * Faixa de progresso: escada de estado, do parado ao concluído.
 *
 * Quem NÃO COMEÇOU é o problema; estar em 1–49% é estar andando. A escada sobe
 * do risco ao sucesso — pintar "1–49%" de vermelho diria que progredir é ruim.
 */
export const TOM_DA_FAIXA: Record<FaixaTrilha, TomGrafico> = {
  "0": "risco",
  "1-49": "atencao",
  "50-99": "marca",
  "100": "sucesso",
};

/**
 * O prefixo de TODO link de card para a lista de alunos.
 *
 * 🔴 `aba=ativos` é obrigatório: o padrão de `/admin` passou a ser a aba
 * "Visão geral" (`ABA_PADRAO`, em `alunos-ativos-lista/estado-na-url.ts`), e
 * um `/admin?f=sem_login` sem aba devolveria o admin a este mesmo dashboard
 * com um filtro marcado que ele não veria. Escrito num lugar só para não
 * depender de nove `href` lembrarem da regra.
 */
export const LINK_LISTA = "/admin?aba=ativos";

/**
 * O que o card 6 abre.
 *
 * ⚠️ Só existem `ordem=progresso` e os filtros da allowlist de
 * `estado-na-url.ts` — não há filtro por faixa de progresso, e inventar um
 * `?f=faixa_0` que o parse descarta daria um link que não faz nada. Ordenar
 * por progresso põe exatamente essa gente no topo (ou no fim) da lista, que é
 * o que o card promete.
 */
export const ORDEM_POR_PROGRESSO = `${LINK_LISTA}&ordem=progresso`;
