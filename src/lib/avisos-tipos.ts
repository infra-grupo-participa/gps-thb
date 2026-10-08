// Central de avisos da equipe — contrato das RPCs da migração …379
// (`supabase/migrations/20261008000379_gps_avisos_equipe.sql`).
// Sem "use server" e sem import de `@/`: importável por Server Action, client
// component e teste.

/** Tipos v1 (catálogo `gps.aviso_tipos`). */
export const TIPOS_AVISO = [
  "chamado_aberto",
  "chamado_resposta",
  "minuta_anexada",
  "croqui_anexado",
  "sessao_marcada",
  "sessao_cancelada",
  "aluno_novo",
  "plantao_inscricao",
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/**
 * Um item do sino (`gps.avisos_listar`). `url` é sempre caminho relativo
 * dentro de /admin (CHECK no banco). `resumo` pode ter o PRIMEIRO nome do
 * aluno — só para a tela da equipe; nunca vai à notificação do sistema.
 * `entidade_id`: chamado_id (chamado_*), cliente_id (minuta/croqui),
 * agendamento_id (sessao_*), aluno_id (aluno_novo), slot_id (plantao).
 */
export interface AvisoItem {
  id: number;
  tipo: TipoAviso;
  rotulo: string;
  /** `true` = mostrar pop-up quando chegar (plantao_inscricao é `false`). */
  toast: boolean;
  /** Ambiente (thb_alunos.id do titular); `null` no plantão. */
  aluno_id: string | null;
  entidade_id: string | null;
  url: string;
  resumo: string;
  criado_em: string;
  lido: boolean;
}

/** Retorno de `gps.avisos_listar(p_limite int default 30)` — p_limite 1..100. */
export interface AvisosLista {
  /** `false` = interruptor `avisos_equipe_ativo` desligado: esconder o sino. */
  ativo: boolean;
  itens: AvisoItem[];
  /** 0..100; 100 = mostrar "99+". */
  nao_lidos: number;
  lido_ate: number | null;
  /** Maior id existente — passar para `avisos_marcar_lidos` ao abrir o sino. */
  ultimo_id: number | null;
}

/** Retorno de `gps.avisos_contar()`. */
export interface AvisosContagem {
  ativo: boolean;
  nao_lidos: number;
  ultimo_id: number | null;
}

/** Retorno de `gps.avisos_marcar_lidos(p_ate bigint)`. */
export interface AvisosMarcados {
  lido_ate: number;
  nao_lidos: number;
}

/** Teto da contagem de não lidos devolvida pelo banco. */
export const AVISOS_NAO_LIDOS_TETO = 100;

/**
 * Realtime: `postgres_changes`, evento INSERT, schema `gps`, tabela
 * `equipe_avisos` (RLS só admin). Use o evento SÓ como sinal e releia por
 * `avisos_listar` — o payload não traz `rotulo`/`toast` nem o estado de leitura.
 */
export const AVISOS_REALTIME = { schema: "gps", table: "equipe_avisos", event: "INSERT" } as const;
