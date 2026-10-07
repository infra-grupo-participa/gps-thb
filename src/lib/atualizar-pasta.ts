// Agenda da releitura da página enquanto a pasta do Drive está sendo criada.
// Pura (sem React, sem `@/`) para `node --test src/lib/atualizar-pasta.test.mjs`.

/** Recuo progressivo: 5 s, 10 s, 20 s e, daí em diante, o teto. */
export const INTERVALOS_BASE_MS = [5000, 10000, 20000, 30000] as const;

/** Maior intervalo entre duas releituras. */
export const TETO_INTERVALO_MS = 30000;

/**
 * Tempo ATIVO (aba visível) depois do qual a releitura automática para.
 * 10 min (07/10/2026): a edge leva ~7 min por pasta (várias passadas); com
 * 3 min a tela desistia antes de a pasta ficar pronta.
 */
export const TOTAL_MAXIMO_MS = 600000;

/**
 * Esperas entre as releituras, na ordem, sem passar do total. Com os valores
 * padrão: 5, 10, 20 e 18 × 30 s (575 s); a espera final fecha os 600 s.
 */
export function agendaDeIntervalos(
  totalMs: number = TOTAL_MAXIMO_MS,
): number[] {
  const esperas: number[] = [];
  let soma = 0;
  for (let i = 0; ; i++) {
    const d = Math.min(
      INTERVALOS_BASE_MS[Math.min(i, INTERVALOS_BASE_MS.length - 1)],
      TETO_INTERVALO_MS,
    );
    if (soma + d > totalMs) break;
    esperas.push(d);
    soma += d;
  }
  return esperas;
}

/** Quanto falta, depois da última releitura, para fechar o total (o hook para aí). */
export function esperaFinal(totalMs: number = TOTAL_MAXIMO_MS): number {
  return totalMs - agendaDeIntervalos(totalMs).reduce((a, b) => a + b, 0);
}
