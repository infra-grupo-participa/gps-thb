/**
 * Regras da reunião de implementação com a equipe.
 *
 * Grade recorrente: toda **quarta-feira**, nos horários que a equipe mantém
 * abertos (`gps.reuniao_horarios` — hoje 10h/13h/16h, reuniões de 2h). A grade
 * de datas é gerada aqui em código; o banco guarda os horários, os agendamentos
 * (`gps.reuniao_agendamentos`) e o que a equipe fecha em `gps.reuniao_bloqueios`
 * — a quarta inteira (`horario` NULL) ou um horário pontual (`horario` preenchido).
 *
 * Regras de negócio:
 * - o aluno **solicita**; a reunião só existe de fato quando a equipe confirma;
 * - 1 reunião por aluno (único `aluno_id`);
 * - 1 aluno por slot enquanto a solicitação não for recusada (índice único
 *   parcial `data,horario where status <> 'recusada'`) — pendente já segura;
 * - recusada libera o slot e o aluno precisa escolher outro horário;
 * - a reunião é sempre com o cliente favoritado (`acompanhado_equipe`).
 */

import type {
  ReuniaoAgendamento,
  SlotReuniao,
  StatusReuniao,
} from "@/lib/types";

/** Dia da semana da reunião: 3 = quarta (padrão getUTCDay, domingo=0). */
export const DIA_SEMANA_REUNIAO = 3;

/**
 * Horários de fallback — os mesmos com que `gps.reuniao_horarios` foi semeada.
 * A fonte de verdade é o banco: use `getHorariosReuniao()`. Isto existe só para
 * a grade não vir vazia se a consulta falhar.
 */
export const HORARIOS_REUNIAO = ["10:00", "13:00", "16:00"] as const;

/** Rótulos e cores de cada status — mesma linguagem para aluno e equipe. */
export const ROTULO_STATUS: Record<
  StatusReuniao,
  { rotulo: string; aluno: string; equipe: string; cor: string }
> = {
  pendente: {
    rotulo: "Aguardando confirmação",
    aluno: "Sua solicitação foi enviada. A equipe ainda vai confirmar se participa neste horário.",
    equipe: "Solicitação do aluno — precisa da sua resposta.",
    cor: "bg-amber-100 text-amber-800 border-amber-300",
  },
  confirmada: {
    rotulo: "Confirmada",
    aluno: "A equipe confirmou presença. Pode contar com ela neste horário.",
    equipe: "Presença confirmada com o aluno.",
    cor: "bg-emerald-100 text-emerald-800 border-emerald-300",
  },
  recusada: {
    rotulo: "Equipe não pode participar",
    aluno: "A equipe não consegue participar neste horário. Escolha outro para seguir.",
    equipe: "Você recusou este horário. O aluno precisa escolher outro.",
    cor: "bg-red-100 text-red-800 border-red-300",
  },
};

/** Duração de cada reunião, em horas (só para exibição "10h–12h"). */
export const DURACAO_REUNIAO_H = 2;

/** Quantas quartas para a frente a grade oferece por padrão. */
export const SEMANAS_GRADE_PADRAO = 8;

/** Normaliza um horário do banco (ex.: "09:00:00") para "HH:MM". */
export function horaCurta(horario: string): string {
  return horario.slice(0, 5);
}

/** "10:00" → "10h–12h" (fim = início + duração). */
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
  /** true quando a quarta inteira está bloqueada (bloqueio com horario NULL). */
  bloqueado: boolean;
  slots: SlotReuniao[];
}

/** Um bloqueio: a quarta (`data`) e, opcionalmente, o horário (NULL = quarta inteira). */
export interface Bloqueio {
  data: string;
  horario: string | null;
}

/**
 * Monta a grade (quartas × horários) marcando cada slot como livre/ocupado/
 * bloqueado/passado. `ocupados` e `bloqueios` cobrem a mesma janela de datas.
 * Um bloqueio com `horario` NULL fecha a quarta inteira; com `horario` fecha só
 * aquele slot. `meuAgendamento` (se houver) marca o slot do próprio aluno como "meu".
 *
 * `horarios` vem de `gps.reuniao_horarios` (só os ativos) — a equipe decide
 * quais horários existem na grade.
 *
 * Um slot "ocupado" pode ser tanto uma reunião já confirmada quanto uma
 * solicitação pendente de outro aluno: pendente segura o horário. O aluno não
 * enxerga a diferença (não é dado dele).
 */
export function montarGrade(params: {
  hojeIso: string;
  semanas?: number;
  horarios: string[];
  ocupados: Pick<ReuniaoAgendamento, "data" | "horario">[];
  bloqueios: Bloqueio[];
  meuAgendamento?: Pick<ReuniaoAgendamento, "data" | "horario"> | null;
}): DiaGrade[] {
  const { hojeIso, semanas, ocupados, bloqueios, meuAgendamento } = params;
  const horarios = (
    params.horarios.length ? params.horarios : [...HORARIOS_REUNIAO]
  ).map(horaCurta);
  const ocupadoSet = new Set(
    ocupados.map((o) => `${o.data}|${horaCurta(o.horario)}`),
  );
  // Quartas inteiras fechadas (horario NULL) e slots pontuais fechados.
  const quartaBloqueada = new Set(
    bloqueios.filter((b) => b.horario === null).map((b) => b.data),
  );
  const slotBloqueado = new Set(
    bloqueios
      .filter((b) => b.horario !== null)
      .map((b) => `${b.data}|${horaCurta(b.horario as string)}`),
  );
  const meuSlot = meuAgendamento
    ? `${meuAgendamento.data}|${horaCurta(meuAgendamento.horario)}`
    : null;

  return proximasQuartas(hojeIso, semanas).map((data) => {
    const bloqueado = quartaBloqueada.has(data);
    const passado = data < hojeIso;
    const slots: SlotReuniao[] = horarios.map((horario) => {
      const chave = `${data}|${horario}`;
      const meu = chave === meuSlot;
      const ocupado = ocupadoSet.has(chave);
      let estado: SlotReuniao["estado"];
      if (meu) estado = "meu";
      else if (bloqueado || passado || slotBloqueado.has(chave))
        estado = "indisponivel";
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
