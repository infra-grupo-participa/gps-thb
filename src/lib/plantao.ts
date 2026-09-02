/**
 * Plantão de Dúvidas — Acelera Holding. Helpers puros (sem I/O, sem "use server").
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir. As tabelas `gps.reuniao_*`
 * ficam órfãs e intocadas.
 *
 * `hojeSaoPaulo`, `horaCurta`, `faixaHorario` e `rotuloData` são PORTE de
 * `git show b457005^:src/lib/reuniao.ts` — mesmo comportamento, adaptado ao
 * plantão (duração variável em vez de fixa em 2h).
 */

/** Data-only "YYYY-MM-DD" → Date em UTC meia-noite (sem drift de fuso). */
function dataUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "YYYY-MM-DD" de hoje no fuso de São Paulo (o servidor pode estar em UTC). */
export function hojeSaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD; timeZone garante o dia certo no Brasil.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Normaliza um horário do banco (ex.: "09:00:00") para "HH:MM". */
export function horaCurta(horario: string): string {
  return horario.slice(0, 5);
}

/** "10:00" + 60 → "10h00–11h00" (fim = início + duração, em minutos). */
export function faixaHorario(horario: string, duracaoMin: number): string {
  const [hh, mm] = horaCurta(horario).split(":").map(Number);
  const inicioMin = hh * 60 + mm;
  const fimMin = inicioMin + duracaoMin;
  const fmt = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}h${String(min % 60).padStart(2, "0")}`;
  return `${fmt(inicioMin)}–${fmt(fimMin)}`;
}

/** Rótulo "qua, 30/07" para uma data-only. */
export function rotuloData(iso: string): string {
  return dataUTC(iso).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

/** Ano e mês corrente no fuso de São Paulo (para o calendário abrir no mês certo). */
export function mesAtualSaoPaulo(): { ano: number; mes: number } {
  const hoje = hojeSaoPaulo();
  const [ano, mes] = hoje.split("-").map(Number);
  return { ano, mes };
}

/**
 * Limites [início, fim) do mês em ISO de data-only, para filtrar
 * `inicio_em >= $1 and inicio_em < $2` (meia-aberta — não perde o último dia
 * nem inclui o primeiro dia do mês seguinte).
 */
export function limitesDoMes(
  ano: number,
  mes: number,
): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const fim = `${proxAno}-${String(proxMes).padStart(2, "0")}-01`;
  return { inicio, fim };
}

/**
 * Normaliza e-mail para gravação/comparação no plantão: minúsculo + trim.
 * MESMA normalização usada na carga (`plantao-carga.ts`) e no login
 * (RPC `gps.plantao_login`, que normaliza de novo no banco) — uma fonte só.
 * Não confundir com a normalização de `auth.users` (`lower(btrim(email))`)
 * nem de `thb_alunos` (`lower(trim(both from email))`): a identidade do
 * plantão é isolada de propósito.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
