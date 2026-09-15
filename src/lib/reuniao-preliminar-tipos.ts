/**
 * Reunião preliminar — proposta de data, aceite e contestação (Fatia 4 da
 * esteira, migração `…263`, 15/09/2026, decisões do Marcio).
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *   `src/app/admin/reuniao-actions.ts` e `src/app/clientes/reuniao-actions.ts`
 *   levam `"use server"`, e um módulo com essa diretiva SÓ pode exportar
 *   `async function` — `export type`/`export const`/`export interface`
 *   passam no `tsc` e no `next build`, e quebram em RUNTIME (já derrubou
 *   `/admin` e `/admin/videos` em 10 e 11/09/2026). Os tipos moram aqui,
 *   importados por `import type` dos dois lados (equipe e parceiro).
 *
 * 🔴 AS TABELAS `gps.reuniao_*` ANTIGAS (`reuniao_agendamentos`,
 *   `reuniao_horarios`, `reuniao_bloqueios`, `reuniao_eventos`, `gps.agenda`)
 *   SÃO PROIBIDAS — removidas em 08/2026 por decisão operacional do Marcio
 *   ("a equipe não estava comparecendo"), já reconstruídas por engano uma vez
 *   (05/08), com escrita revogada e triggers não versionadas. Modelo errado:
 *   `aluno_id UNIQUE` (1 por ambiente) e `check (dow = 3)` (só quarta). Esta
 *   feature usa uma tabela NOVA, `gps.reuniao_preliminar_propostas`, nome
 *   distinto de propósito.
 */

/**
 * Estado da proposta (`gps.reuniao_preliminar_propostas.estado`, CHECK no
 * banco). Append-only: cada resposta é uma transição de estado na MESMA
 * linha, nunca uma linha nova — "propôs → contestou → propôs de novo" vira
 * DUAS linhas (a contestada e a nova proposta viva), não uma linha reescrita
 * por cima, porque o histórico é o que a equipe precisa enxergar.
 *
 * `caduca` NÃO tem cron — é derivado NA LEITURA comparando `proposta_em` com
 * `now()` (3 dias úteis). Ver `diasUteisDesde`/`propostaCaducou` abaixo.
 */
export const ESTADOS_PROPOSTA_REUNIAO = [
  "proposta",
  "aceita",
  "contestada",
  "cancelada",
  "caduca",
] as const;
export type EstadoPropostaReuniao = (typeof ESTADOS_PROPOSTA_REUNIAO)[number];

/** Prazo de resposta do parceiro, em dias ÚTEIS (decisão do Marcio, 15/09). */
export const PRAZO_RESPOSTA_DIAS_UTEIS = 3;

/** Teto de caracteres do motivo da contestação (CHECK no banco: 3..300). */
export const CONTESTACAO_MOTIVO_MINIMO = 3;
export const CONTESTACAO_MOTIVO_MAXIMO = 300;

/**
 * Uma proposta de data de reunião preliminar — linha crua de
 * `gps.reuniao_preliminar_propostas`, já com `aluno_id` desnormalizado (é o
 * predicado da fila do `/admin`: "quem está com proposta pendente de
 * resposta", sem join).
 */
export interface PropostaReuniao {
  id: string;
  clienteId: string;
  alunoId: string;
  dataProposta: string;
  propostaEm: string;
  propostaPor: string;
  /**
   * Estado GRAVADO no banco — nunca `'caduca'` (o banco não escreve isso
   * sozinho, não há cron). Para saber se uma proposta `'proposta'` já passou
   * do prazo, use `propostaCaducou(p)`, que deriva na leitura.
   */
  estado: Exclude<EstadoPropostaReuniao, "caduca">;
  respostaEm: string | null;
  respostaPor: string | null;
  contestacaoMotivo: string | null;
}

/**
 * Estado EFETIVO de uma proposta para exibição — igual ao gravado, exceto
 * que `'proposta'` vencida (3 dias úteis sem resposta) aparece como
 * `'caduca'`. Nunca escrever este valor de volta no banco a partir daqui:
 * é só a leitura que decide, o banco continua com `'proposta'` até a equipe
 * cancelar ou o parceiro responder — "caducar não é aceitar" (decisão do
 * Marcio): ninguém decide no lugar do parceiro só porque o prazo passou.
 */
export function estadoEfetivo(p: PropostaReuniao): EstadoPropostaReuniao {
  if (p.estado === "proposta" && propostaCaducou(p)) return "caduca";
  return p.estado;
}

/**
 * `true` quando uma proposta `'proposta'` já passou do prazo de resposta (3
 * dias úteis desde `propostaEm`). Só faz sentido chamar com `estado ===
 * 'proposta'` — uma proposta já respondida/cancelada não "caduca".
 *
 * Dias úteis = segunda a sexta, sem calendário de feriados (o projeto não
 * tem tabela de feriados; o prazo é uma cortesia operacional, não um SLA
 * jurídico com data-limite exata).
 */
export function propostaCaducou(p: Pick<PropostaReuniao, "propostaEm">): boolean {
  return diasUteisDesde(new Date(p.propostaEm), new Date()) >= PRAZO_RESPOSTA_DIAS_UTEIS;
}

/** Conta dias úteis (seg–sex) estritamente entre `inicio` e `fim`. */
function diasUteisDesde(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;
  let contados = 0;
  const cursor = new Date(inicio);
  cursor.setHours(0, 0, 0, 0);
  const limite = new Date(fim);
  limite.setHours(0, 0, 0, 0);
  while (cursor < limite) {
    cursor.setDate(cursor.getDate() + 1);
    const diaDaSemana = cursor.getDay(); // 0 = domingo, 6 = sábado
    if (diaDaSemana !== 0 && diaDaSemana !== 6) contados += 1;
  }
  return contados;
}

/** Payload de `gps.reuniao_propor_data` — a equipe propondo uma data nova. */
export interface ReuniaoProporInput {
  clienteId: string;
  dataProposta: string;
}

/**
 * Payload de `gps.reuniao_responder` — o parceiro aceitando ou contestando.
 * `motivo` é obrigatório (3..300) quando `resposta === "contestada"`.
 */
export interface ReuniaoResponderInput {
  propostaId: string;
  resposta: "aceita" | "contestada";
  motivo?: string | null;
}

/** Retorno comum das 3 RPCs desta fatia — usado pelas actions para revalidar. */
export interface ReuniaoResultado {
  ok: boolean;
  erro?: string;
}
