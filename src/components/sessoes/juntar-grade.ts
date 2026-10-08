/**
 * Junção PURA dos horários livres com os já reservados por outros alunos.
 *
 * Fora de `grade.ts` de propósito: `grade.ts` importa `@/lib/datas` (alias do
 * bundler) e fica impossível de importar num `node --test`. Aqui só há tipo e
 * `if` — o teste está em `juntar-grade.test.mjs`.
 *
 * Reservado é só informação ("por que este horário não aparece como livre"):
 * nunca é selecionável. A fronteira real continua no banco
 * (`gps.sessao_agendar`); isto é apresentação.
 */

import type { HorarioLivre } from "@/lib/sessoes-tipos";

/** Um bloco da grade: livre (clicável) ou reservado (só leitura). */
export interface ItemDaGrade {
  horario: HorarioLivre;
  reservado: boolean;
}

function instante(h: HorarioLivre): number {
  const t = Date.parse(h.inicio_em);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Livres + reservados, em ordem de `inicio_em` (empate: livre antes, depois a
 * ordem de chegada — `sort` é estável).
 *
 * - Reservado com o mesmo `inicio_em` e o mesmo `responsavel_id` de um livre
 *   é descartado: vale o livre, sem duplicar.
 * - Reservado repetido (mesmo `inicio_em` + `responsavel_id`) entra uma vez.
 * - `diaPrimeiro` ("YYYY-MM-DD"): os itens desse dia vão para o começo, o
 *   resto segue cronológico (a sugestão da ficha na Reunião Preliminar).
 */
export function juntarLivresEReservados(
  livres: HorarioLivre[],
  reservados: HorarioLivre[] = [],
  diaPrimeiro: string | null = null,
): ItemDaGrade[] {
  const chave = (h: HorarioLivre) => `${instante(h)}|${h.responsavel_id}`;
  const vistos = new Set(livres.map(chave));

  const itens: ItemDaGrade[] = livres.map((horario) => ({
    horario,
    reservado: false,
  }));
  for (const horario of reservados) {
    const k = chave(horario);
    if (vistos.has(k)) continue;
    vistos.add(k);
    itens.push({ horario, reservado: true });
  }

  itens.sort((a, b) => instante(a.horario) - instante(b.horario));

  if (!diaPrimeiro) return itens;
  return [
    ...itens.filter((i) => i.horario.data === diaPrimeiro),
    ...itens.filter((i) => i.horario.data !== diaPrimeiro),
  ];
}
