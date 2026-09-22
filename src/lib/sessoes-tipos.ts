/**
 * Agenda de Sessões com a Equipe Jurídica — tipos (FATIA 3).
 *
 * PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md`.
 * Contrato de banco: migrations `20260922000291_gps_sessao_estrutura.sql` e
 * `20260922000292_gps_sessao_rpcs.sql` — MEDIDAS, não supostas. Este arquivo
 * NÃO leva `"use server"`: é só tipo, importado com `import type` pelos dois
 * lados (leitura em `src/lib/data/sessoes.ts`, telas em `src/components/sessoes/**`).
 *
 * 🔴 A DURAÇÃO NÃO APARECE AQUI COMO VALOR. `duracao_min` vem sempre do
 * banco (`gps.sessao_tipos.duracao_min`, hoje 150) — nenhum literal `150`
 * neste arquivo nem em `src/lib/data/sessoes.ts` (PRD §5.4, `…291`/`…292`).
 */

/** Estados possíveis de `gps.sessao_agendamentos.estado` (CHECK `chk_sessao_agend_estado`). */
export const ESTADOS_SESSAO = ["agendado", "realizado", "cancelado", "falta"] as const;
export type EstadoSessao = (typeof ESTADOS_SESSAO)[number];

/** Rótulo em português de cada estado, para badge/filtro na tela. */
export const ROTULO_ESTADO_SESSAO: Record<EstadoSessao, string> = {
  agendado: "Agendada",
  realizado: "Realizada",
  cancelado: "Cancelada",
  falta: "Falta",
};

export function ehEstadoSessao(v: string): v is EstadoSessao {
  return (ESTADOS_SESSAO as readonly string[]).includes(v);
}

/**
 * `gps.sessao_tipos` — catálogo. A duração e a folga (`duracao_min`,
 * `intervalo_min`) vêm SEMPRE desta linha; não copiar o valor para uma
 * constante do TypeScript (a `…291` é explícita: mudar o tipo é UPDATE de
 * uma linha, sem migration e sem deploy — copiar o número aqui quebraria
 * essa promessa).
 */
export interface SessaoTipo {
  id: number;
  nome: string;
  duracao_min: number;
  intervalo_min: number;
  exige_briefing: boolean;
  ativo: boolean;
  /** Etapa que precisa estar liberada para o ambiente poder agendar este
   * tipo (`gps.etapa_liberada_para`). `null` = o tipo não exige etapa. */
  etapa_id: number | null;
}

/**
 * `gps.sessao_disponibilidade` — a JANELA declarada pela doutora (regra
 * semanal). NÃO é o horário de uma sessão: quantos blocos cabem na faixa é
 * conta de leitura (`sessao_horarios_livres`), nunca gravada aqui.
 */
export interface SessaoDisponibilidade {
  id: string;
  responsavel_id: string;
  /** 0=domingo .. 6=sábado, convenção de `extract(dow)`. */
  dia_semana: number;
  /** "HH:MM:SS" (tipo `time` do Postgres). */
  hora_inicio: string;
  hora_fim: string;
  /** `null` = a faixa vale para qualquer tipo de sessão. */
  tipo_id: number | null;
  vigencia_inicio: string;
  /** `null` = sem prazo — a regra não expira. */
  vigencia_fim: string | null;
  ativo: boolean;
}

/** `gps.sessao_bloqueios` — exceção à grade (feriado, férias, imprevisto). */
export interface SessaoBloqueio {
  id: string;
  responsavel_id: string;
  inicio: string;
  fim: string;
  motivo: string;
}

/**
 * `gps.sessao_agendamentos` — o compromisso, tal como `authenticated` pode
 * lê-lo. 🔴 NÃO inclui `briefing_snapshot`: a coluna está FORA do grant de
 * coluna de `authenticated` (`…291` §6) — um `select` que a peça devolve
 * 42501, inclusive para a doutora e o admin. O briefing só se lê pela RPC
 * `gps.sessao_briefing_ler` (ver `SessaoBriefing` abaixo).
 */
export interface SessaoAgendamento {
  id: string;
  tipo_id: number;
  responsavel_id: string;
  /** O AMBIENTE (`public.thb_alunos.id`), não `gps.membros.id`. */
  aluno_id: string;
  cliente_id: string;
  data: string;
  hora_inicio: string;
  /** Coluna GERADA. Toda comparação com "agora" usa esta, nunca `data` isolada. */
  inicio_em: string;
  /** Coluna GERADA — fim do bloco. Nunca recalcular `inicio_em + duracao_min` no TypeScript. */
  fim_em: string;
  /** Cópia CONGELADA de `sessao_tipos.duracao_min` no ato do agendamento. */
  duracao_min: number;
  estado: EstadoSessao;
  link_reuniao: string | null;
  /**
   * Quem colou o link, e se era equipe — a precedência P3.
   *
   * 🔴 `link_por_equipe` é o papel CONGELADO no ato da escrita, nunca o cargo
   * de hoje: consultar ao vivo faria a precedência mudar retroativamente
   * quando alguém é promovido ou desativado, sem evento nenhum.
   *
   * 🔴 A TELA PRECISA DESTES CAMPOS. Sem eles, o parceiro só descobre que "a
   * equipe já definiu o link" quando a RPC recusa com 22023 — a regra vira
   * surpresa em vez de informação. É por isso que estão no grant de coluna.
   *
   * ⚠️ `link_por_equipe` nulo = link que não passou pelas RPCs; a precedência
   * trata nulo como "não é da equipe".
   */
  link_definido_por: string | null;
  link_por_equipe: boolean | null;
  link_em: string | null;
  /**
   * Que HOUVE resumo — nunca o texto.
   *
   * 🔴 `resumo` (o texto) está FORA do grant de coluna (P4/LGPD): o aluno vê
   * que a equipe registrou o desfecho, jamais o que foi escrito. Quem pode
   * ler o texto usa `gps.sessao_resumo_ler`, que tem a mesma guarda da
   * escrita. **Não acrescente `resumo` a este tipo nem a COLUNAS_AGENDAMENTO**
   * — abrir depois é barato, fechar depois de ter mostrado não se desfaz.
   */
  resumo_em: string | null;
  resumo_por: string | null;
  cancelado_em: string | null;
  cancelado_por: string | null;
  cancelado_motivo: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Linha devolvida por `gps.sessao_horarios_livres` — a GRADE derivada na
 * leitura (PRD §5.4). Não é uma linha de tabela: é o resultado da função,
 * 7 colunas (contrato revisto após a entrega: `responsavel_nome` entrou na
 * 2ª posição — PRD §9 D5, "a tela mostra o nome"). Consumido por NOME, não
 * por posição, então a ordem de coluna no banco não importa aqui.
 */
export interface HorarioLivre {
  responsavel_id: string;
  /**
   * Nome da doutora, para a tela cumprir o PRD §9 D5. `left join` contra
   * `public.perfis` dentro da RPC (medido: 0,736 ms, plano intacto,
   * `Memoize` com 31 acertos/1 busca) — NÃO filtre nem substitua por
   * rótulo aqui: doutora sem linha em `perfis` continua com horário real
   * na grade, e a tela tem fallback próprio ("equipe jurídica").
   */
  responsavel_nome: string | null;
  data: string;
  /** "HH:MM:SS". */
  hora_inicio: string;
  inicio_em: string;
  fim_em: string;
  duracao_min: number;
}

/**
 * Linha de `gps.sessao_responsaveis()` — mapa id → nome das doutoras, para
 * nomear `sessao_agendamentos.responsavel_id` fora do contexto da grade
 * (a tabela, lida direto pelo PostgREST, só tem o uuid). Medido: 0,927 ms,
 * 2 linhas, `Seq Scan` aceito (tabela pequena por natureza — não se cria
 * índice nem se troca por `select distinct`, ver a migration).
 */
export interface SessaoResponsavel {
  responsavel_id: string;
  responsavel_nome: string | null;
}

/**
 * Retorno de `gps.sessao_briefing_ler` — a ÚNICA porta para o briefing
 * congelado. `briefing` é o jsonb bruto de `gps.sessao_briefing_montar`
 * (5 fontes: cliente, onboarding, entrevista, decisores, minutas); o shape
 * interno não é tipado aqui de propósito — quem exibe decompõe campo a
 * campo com o texto do PRD §6.5 ao lado, e tipar rígido aqui duplicaria o
 * contrato do jsonb montado no banco.
 */
export interface SessaoBriefing {
  agendamento_id: string;
  estado: EstadoSessao;
  inicio_em: string;
  cliente_id: string;
  briefing: Record<string, unknown> | null;
}

/** Retorno de `gps.sessao_agendar`. */
export interface SessaoAgendarResultado {
  agendamento_id: string;
  estado: "agendado";
  inicio_em: string;
  fim_em: string;
  duracao_min: number;
  tipo_nome: string;
}

/** Retorno de `gps.sessao_cancelar`. */
export interface SessaoCancelarResultado {
  agendamento_id: string;
  estado: "cancelado";
  por: "aluno" | "responsavel" | "admin";
}

/** Retorno de `gps.sessao_marcar_falta`. */
export interface SessaoMarcarFaltaResultado {
  agendamento_id: string;
  estado: "falta";
  por: "responsavel" | "admin";
}
