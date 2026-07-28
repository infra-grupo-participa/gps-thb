/**
 * Regras da reunião de implementação com a equipe.
 *
 * Grade FIXA e recorrente: toda **quarta-feira**, nos horários 09h/11h/13h/15h
 * (reuniões de 2h coladas, 9h→17h). A grade é gerada aqui em código; o banco só
 * guarda os agendamentos (`gps.reuniao_agendamentos`) e as quartas que a equipe
 * fecha (`gps.reuniao_bloqueios`).
 *
 * Regras de negócio:
 * - 1 agendamento por aluno (único `aluno_id`);
 * - 1 aluno por slot (único `data,horario`) — ao ser pego, o slot some;
 * - a reunião é sempre com o cliente favoritado (`acompanhado_equipe`).
 */

import type { ReuniaoAgendamento, SlotReuniao } from "@/lib/types";

/** Dia da semana da reunião: 3 = quarta (padrão getUTCDay, domingo=0). */
export const DIA_SEMANA_REUNIAO = 3;

/** Horários de início, em ordem. Fonte de verdade única (espelha o CHECK do banco). */
export const HORARIOS_REUNIAO = ["09:00", "11:00", "13:00", "15:00"] as const;

/** Duração de cada reunião, em horas (só para exibição "09h–11h"). */
export const DURACAO_REUNIAO_H = 2;

/** Quantas quartas para a frente a grade oferece por padrão. */
export const SEMANAS_GRADE_PADRAO = 8;

/** Normaliza um horário do banco (ex.: "09:00:00") para "HH:MM". */
export function horaCurta(horario: string): string {
  return horario.slice(0, 5);
}

/** "09:00" → "09h–11h" (fim = início + duração). */
export function faixaHorario(horario: string): string {
  const hh = Number(horaCurta(horario).slice(0, 2));
  const fim = hh + DURACAO_REUNIAO_H;
  return `${String(hh).padStart(2, "0")}h–${String(fim).padStart(2, "0")}h`;
}

/** Data-only "YYYY-MM-DD" → Date em UTC meia-noite (sem drift de fuso). */
function dataUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date UTC → "YYYY-MM-DD". */
function isoData(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" de hoje no fuso de São Paulo (o servidor pode estar em UTC). */
export function hojeSaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD; timeZone garante o dia certo no Brasil.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/**
 * As próximas `semanas` quartas a partir de (e incluindo) `hojeIso`.
 * Retorna as datas em "YYYY-MM-DD".
 */
export function proximasQuartas(
  hojeIso: string,
  semanas = SEMANAS_GRADE_PADRAO,
): string[] {
  const hoje = dataUTC(hojeIso);
  const dow = hoje.getUTCDay();
  // Dias até a próxima quarta (0 se hoje já é quarta — a de hoje entra na grade).
  const ate = (DIA_SEMANA_REUNIAO - dow + 7) % 7;
  const primeira = new Date(hoje);
  primeira.setUTCDate(hoje.getUTCDate() + ate);

  const out: string[] = [];
  for (let i = 0; i < semanas; i++) {
    const d = new Date(primeira);
    d.setUTCDate(primeira.getUTCDate() + i * 7);
    out.push(isoData(d));
  }
  return out;
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

export interface DiaGrade {
  data: string;
  bloqueado: boolean;
  slots: SlotReuniao[];
}

/**
 * Monta a grade (quartas × horários) marcando cada slot como livre/ocupado/
 * bloqueado/passado. `ocupados` e `bloqueios` cobrem a mesma janela de datas.
 * `meuAgendamento` (se houver) marca o slot do próprio aluno como "meu".
 */
export function montarGrade(params: {
  hojeIso: string;
  semanas?: number;
  ocupados: Pick<ReuniaoAgendamento, "data" | "horario">[];
  bloqueios: string[];
  meuAgendamento?: Pick<ReuniaoAgendamento, "data" | "horario"> | null;
}): DiaGrade[] {
  const { hojeIso, semanas, ocupados, bloqueios, meuAgendamento } = params;
  const ocupadoSet = new Set(
    ocupados.map((o) => `${o.data}|${horaCurta(o.horario)}`),
  );
  const bloqueioSet = new Set(bloqueios);
  const meuSlot = meuAgendamento
    ? `${meuAgendamento.data}|${horaCurta(meuAgendamento.horario)}`
    : null;

  return proximasQuartas(hojeIso, semanas).map((data) => {
    const bloqueado = bloqueioSet.has(data);
    const passado = data < hojeIso;
    const slots: SlotReuniao[] = HORARIOS_REUNIAO.map((horario) => {
      const chave = `${data}|${horario}`;
      const meu = chave === meuSlot;
      const ocupado = ocupadoSet.has(chave);
      let estado: SlotReuniao["estado"];
      if (meu) estado = "meu";
      else if (bloqueado || passado) estado = "indisponivel";
      else if (ocupado) estado = "ocupado";
      else estado = "livre";
      return { data, horario, estado };
    });
    return { data, bloqueado, slots };
  });
}

/** A quarta da semana que contém (ou segue) `iso`. */
export function quartaDaSemana(iso: string): string {
  const d = dataUTC(iso);
  const dow = d.getUTCDay();
  const ate = (DIA_SEMANA_REUNIAO - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + ate);
  return isoData(d);
}

/** Soma `semanas` (pode ser negativo) a uma quarta, devolvendo outra quarta. */
export function somarSemanas(iso: string, semanas: number): string {
  const d = dataUTC(iso);
  d.setUTCDate(d.getUTCDate() + semanas * 7);
  return isoData(d);
}

/** Rótulo longo "quarta-feira, 30 de julho de 2026". */
export function rotuloDataLongo(iso: string): string {
  return dataUTC(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Validação leve de URL da live (http/https). */
export function linkLiveValido(url: string): boolean {
  const v = url.trim();
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}
