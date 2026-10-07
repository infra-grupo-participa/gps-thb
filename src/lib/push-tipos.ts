// Avisos no computador (Web Push) para a equipe — contrato das RPCs da
// migração …357 (`supabase/migrations/20261006000357_gps_push_chamados.sql`).
// Sem import de `@/`: pode ser importado pelo Node em teste e pela edge.

/** Uma inscrição pronta para envio (sai de `gps.push_preparar`, só service_role). */
export interface PushInscricaoEnvio {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Retorno de `gps.push_preparar(p_mensagem_id)`. `null` = não enviar
 * (interruptor `push_chamados_ativo` desligado/ausente, mensagem inexistente
 * ou de autor_papel 'equipe'). `inscricoes` pode vir vazia.
 * O corpo NUNCA traz o assunto do chamado (pode conter nome de cliente).
 * Sugestão para o service worker: `tag = chamado_id` (colapsa rajada).
 */
export interface PushPreparado {
  chamado_id: string;
  titulo: "Nova mensagem no chamado";
  /** "Chamado de <primeiro nome do parceiro>" */
  corpo: string;
  /** "/admin/chamados/<chamado_id>" — caminho relativo ao portal. */
  url: string;
  inscricoes: PushInscricaoEnvio[];
}

/** Corpo que `gps.push_chamar` posta na edge `push-enviar` (header `x-push-segredo`). */
export interface PushChamadaEdge {
  mensagem_id: string;
}

/** Argumentos de `gps.push_inscrever` (authenticated, só admin; 42501 senão). */
export interface PushInscreverArgs {
  p_endpoint: string;
  p_p256dh: string;
  p_auth: string;
  p_user_agent: string | null;
}

/** Teto de inscrições ativas por pessoa — acima disso a RPC responde 22023. */
export const PUSH_INSCRICOES_MAXIMO = 10;

/** Falhas seguidas (status fora de 2xx/404/410) até a inscrição ser revogada. */
export const PUSH_FALHAS_ATE_REVOGAR = 5;
