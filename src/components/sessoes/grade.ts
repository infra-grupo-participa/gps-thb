/**
 * Funções PURAS da tela de sessões do aluno — agrupamento e formatação.
 *
 * Fora do JSX de propósito (mesma decisão de `ordenacao.ts` e
 * `datas-da-serie.ts` na rodada de 09/09): são as únicas partes desta fatia
 * que dá para conferir sem navegador. O resto — geometria, foco, o que
 * realmente pinta — só se prova em navegador que pinta, e não foi provado
 * aqui (ver o relatório).
 *
 * 🔴 NENHUM `150` E NENHUM "2h30" NESTE ARQUIVO. A duração vem sempre de
 * `duracao_min`, que a RPC devolve a partir de `gps.sessao_tipos` — é a regra
 * literal de §5.4 do PRD: "a duração vive só em `gps.sessao_tipos.duracao_min`.
 * Nenhuma outra tabela, função ou componente pode ter `150` escrito". Ajustar
 * o bloco é UPDATE de uma linha, sem migration e sem deploy; um literal aqui
 * quebraria essa promessa em silêncio.
 *
 * 🔴 NENHUM `Intl.*` NOVO e NENHUM `new Date()` sobre `date`. `data` vem como
 * `"YYYY-MM-DD"` (tipo `date` do Postgres, sem fuso): `new Date("2026-09-23")`
 * é meia-noite **UTC** e, formatado em São Paulo, volta um dia (22/09). Por
 * isso o dia sai de `formatarDataSoDia` (recorte de string, `src/lib/datas.ts`)
 * e o dia da semana sai de `Date.UTC` + `getUTCDay`, que não passa por fuso
 * nenhum. `inicio_em`/`fim_em` são `timestamptz` e aí sim `Date` é seguro —
 * mas quem formata hora é `horaDeTime`, por recorte, porque o valor já vem
 * pronto em `hora_inicio`.
 */

import { formatarDataSoDia } from "@/lib/datas";
import type { HorarioLivre, SessaoAgendamento } from "@/lib/sessoes-tipos";

/**
 * `"14:00:00"` (tipo `time` do Postgres) → `"14:00"`.
 *
 * Recorte de string, sem `Date` no meio: `time` não tem data nem fuso, e
 * qualquer conversão inventaria os dois.
 */
export function horaDeTime(hora: string): string {
  return hora.slice(0, 5);
}

/**
 * Dia da semana por extenso de um `date` `"YYYY-MM-DD"`, em minúsculas.
 *
 * 🔴 `Date.UTC(...)` + `getUTCDay()`, nunca `new Date(iso).getDay()`: o
 * segundo lê a string como meia-noite UTC e o `getDay` a converte para o fuso
 * do processo — na Hostinger (UTC) coincide, na máquina de quem desenvolve
 * (UTC−3) devolve o dia anterior. Aritmética de calendário em UTC puro não
 * tem esse modo de falha. A tabela é fixa e local: o `Intl` daria o mesmo
 * resultado por um caminho que depende de fuso, e o projeto proíbe `Intl`
 * novo (`src/lib/datas.ts` é o único formatador).
 */
const DIAS_DA_SEMANA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export function diaDaSemanaDeData(data: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return null;
  const dow = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  ).getUTCDay();
  return DIAS_DA_SEMANA[dow] ?? null;
}

/**
 * `"quarta-feira, 23/09/2026"` — o cabeçalho de cada dia da grade.
 *
 * Devolve o recorte cru quando a data não é reconhecível, em vez de inventar
 * texto: `formatarDataSoDia` já segue essa regra ("chamador decide o texto de
 * ausência, esta função não inventa").
 */
export function rotuloDoDia(data: string): string {
  const dia = formatarDataSoDia(data) ?? data;
  const semana = diaDaSemanaDeData(data);
  return semana ? `${semana}, ${dia}` : dia;
}

/**
 * `150` → `"2h30"`, `120` → `"2h"`, `45` → `"45 min"`.
 *
 * 🔴 O NÚMERO ENTRA COMO ARGUMENTO, SEMPRE. Esta função FORMATA uma duração;
 * ela não SABE nenhuma. Trocar o bloco para 1h30 no catálogo muda o texto da
 * tela sem tocar em código — que é exatamente o que §5.4 exige.
 */
export function formatarDuracao(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return "";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * `"14:00"` + 150 → `"16:30"` — o fim do bloco, só para EXIBIR.
 *
 * ⚠️ Isto NÃO é a fonte de verdade do fim. Quem manda é `fim_em`, coluna
 * GERADA em `gps.sessao_agendamentos` e devolvida pela grade; a `…292` é
 * explícita: "NÃO SE RECALCULA O FIM DO BLOCO", porque duas fórmulas do mesmo
 * fato divergem no dia em que uma das duas mudar. Aqui a conta é só de
 * relógio de parede (hora local + minutos), para escrever "14:00 – 16:30" sem
 * converter `timestamptz` para o fuso no cliente — e continua derivada de
 * `duracao_min`, nunca de literal.
 *
 * Soma aritmética em minutos, sem `Date`: `"14:00"` é relógio, não instante.
 */
export function horaFimDeBloco(horaInicio: string, duracaoMin: number): string {
  const m = /^(\d{2}):(\d{2})/.exec(horaInicio);
  if (!m || !Number.isFinite(duracaoMin)) return "";
  const total = Number(m[1]) * 60 + Number(m[2]) + Math.trunc(duracaoMin);
  const h = Math.floor(total / 60) % 24;
  const min = total % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Um dia da grade, com os blocos que a equipe publicou para ele. */
export interface DiaDaGrade {
  /** `"YYYY-MM-DD"` — a chave, e o que volta para a RPC no agendamento. */
  data: string;
  /** `"quarta-feira, 23/09/2026"`. */
  rotulo: string;
  horarios: HorarioLivre[];
}

/**
 * Agrupa a grade por DIA, preservando a ordem que a RPC já entregou
 * (`order by c.inicio_em, c.responsavel_id`).
 *
 * 🔑 Agrupar na leitura, não pedir dia a dia: a RPC devolve a janela inteira
 * numa ida (o comentário de `sessao_horarios_livres` diz isso — "a tela não
 * pede dia a dia; N telas = N queries é o que se está evitando"). Este
 * agrupamento é de APRESENTAÇÃO; nenhuma consulta nova sai daqui.
 *
 * `Map` preserva ordem de inserção, então a ordem cronológica da RPC vira a
 * ordem da tela sem nenhum `sort` — reordenar aqui seria uma segunda regra de
 * ordenação, livre para divergir da do banco.
 */
export function agruparPorDia(horarios: HorarioLivre[]): DiaDaGrade[] {
  const porDia = new Map<string, HorarioLivre[]>();
  for (const h of horarios) {
    const lista = porDia.get(h.data);
    if (lista) lista.push(h);
    else porDia.set(h.data, [h]);
  }
  return Array.from(porDia, ([data, lista]) => ({
    data,
    rotulo: rotuloDoDia(data),
    horarios: lista,
  }));
}

/**
 * O prazo de cancelamento do ALUNO: até 24h antes do início (§9 D7).
 *
 * 🔴 COMPARA CONTRA `inicio_em` (timestamptz), NUNCA contra `data` isolada —
 * a mesma regra que a `…292` aplica no banco. `data` sem fuso mentiria o
 * prazo entre 21h e a meia-noite, com o servidor em UTC.
 *
 * ⚠️ Isto NÃO é a fronteira, é cortesia de tela: esconder o botão evita
 * oferecer uma ação que vai falhar. Quem recusa de verdade é
 * `gps.sessao_cancelar`, com 22023 e a frase pronta — e é ela que vale se o
 * aluno estiver com a página aberta desde ontem.
 *
 * `agora` entra como argumento para a função ser determinística (e para o
 * servidor e o cliente poderem discordar sem que ninguém "descubra" a hora
 * por dentro).
 */
export function podeCancelarComoAluno(
  sessao: Pick<SessaoAgendamento, "estado" | "inicio_em">,
  agora: Date,
): boolean {
  if (sessao.estado !== "agendado") return false;
  const inicio = new Date(sessao.inicio_em).getTime();
  if (!Number.isFinite(inicio)) return false;
  return (inicio - agora.getTime()) / 3_600_000 >= 24;
}
