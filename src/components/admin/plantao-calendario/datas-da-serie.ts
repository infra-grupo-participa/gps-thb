/**
 * Aritmética de data do calendário do Plantão — sem React, sem DOM, testável.
 *
 * Saiu de `plantao-calendario.tsx` no corte da Onda 3 (CD5). É movimento: as
 * funções são as mesmas, linha por linha.
 *
 * 🔑 Tudo aqui trata data-only ("2026-09-15") como TEXTO ou como aritmética em
 * `Date.UTC`. Nunca `new Date("2026-09-15")` no fuso local: isso é meia-noite
 * UTC e, formatado em São Paulo, volta um dia — a mesma armadilha documentada
 * em `formatarDataSoDia` (`src/lib/datas.ts`).
 */

export function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}
export function proximoMes(ano: number, mes: number) {
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}
export function paramMes(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function diasDaGrade(ano: number, mes: number): (string | null)[] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1));
  const totalDias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaSemanaInicio = primeiro.getUTCDay();
  const dias: (string | null)[] = Array(diaSemanaInicio).fill(null);
  for (let d = 1; d <= totalDias; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (dias.length % 7 !== 0) dias.push(null);
  return dias;
}

/** "2026-09-15" → "15/09". Data-only tratada como texto: sem drift de fuso. */
export function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

/** A série semanal a partir de uma data-only: a própria + `repeticoes` semanas. */
export function datasDaSerie(inicio: string, repeticoes: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];
  const [y, m, d] = inicio.split("-").map(Number);
  const datas: string[] = [];
  for (let i = 0; i <= repeticoes; i++) {
    // Aritmética em UTC: `Date.UTC` normaliza a virada de mês/ano sozinho.
    datas.push(new Date(Date.UTC(y, m - 1, d + 7 * i)).toISOString().slice(0, 10));
  }
  return datas;
}
