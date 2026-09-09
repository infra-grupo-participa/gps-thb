/**
 * Formatação de data/hora do portal — um lugar só.
 *
 * Estava em `src/components/admin/diario-labels.ts`, importado por 5
 * componentes de `components/admin/`. A Fase 6 (chamados) precisa da MESMA
 * formatação em `components/chamados/`, e componente de chamado não pode
 * importar de `components/admin/` — o Diário é dado exclusivo do admin (LGPD)
 * e o acoplamento convidaria a arrastar rótulo de nota para uma tela do aluno.
 *
 * 🔑 `timeZone` SEMPRE explícito: metade destes componentes é Server Component
 * e, sem ele, o horário sai no fuso do processo Node (Hostinger), não no do
 * usuário — mesma lição de `src/lib/plantao.ts`. Sem `"use client"` e sem
 * `server-only`: os dois lados formatam igual.
 */

/**
 * O fuso do portal, exportado (CD2): havia 17 literais `"America/Sao_Paulo"`
 * em 12 arquivos. Literal repetido não é constante — é 17 chances de alguém
 * digitar `America/Sao_paulo` e o `Intl` cair no fuso do processo em silêncio.
 */
export const FUSO = "America/Sao_Paulo";

/** "09/09/2026 14:32" */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

/** "09/09/2026" — para frase corrida ("fechado em 09/09/2026"). */
export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FUSO,
  });
}

/**
 * `date` do Postgres ("2026-08-11") → "11/08/2026", **por recorte de string**.
 *
 * 🔑 Não use `formatarData` aqui. `date` não tem fuso, e `new Date("2026-08-11")`
 * é meia-noite **UTC** — formatado em São Paulo volta um dia (10/08). Uma data
 * de reunião exibida com um dia de erro é o tipo de defeito que ninguém reporta
 * e todo mundo usa. Sem `Date` no meio, não há o que virar.
 *
 * Devolve `null` quando a entrada não é uma data-only reconhecível — chamador
 * decide o texto de ausência ("—", "sem data"), esta função não inventa.
 */
export function formatarDataSoDia(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/**
 * "YYYY-MM-DD" de hoje no fuso de São Paulo (o servidor pode estar em UTC).
 *
 * Morava em `src/lib/plantao.ts`, que é o módulo do **Plantão de Dúvidas** —
 * e o card do Financeiro importava de lá só para saber que dia é hoje. Data é
 * assunto deste arquivo (CD2); `plantao.ts` reexporta para os chamadores dele
 * não mudarem.
 *
 * Devolve string, não `Date`: quem compara "YYYY-MM-DD" com "YYYY-MM-DD" tem
 * ordem lexicográfica = ordem cronológica e nenhum `Date` no meio do caminho
 * para trocar o dia de fuso.
 */
export function hojeSaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD; timeZone garante o dia certo no Brasil.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}
