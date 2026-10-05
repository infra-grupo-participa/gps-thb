import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import {
  montarAtividade,
  type AtividadeDrive,
  type LinhaAtividadeDrive,
} from "@/lib/drive-atividade-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Atividade da pasta do cliente no Drive (view `gps.vw_cliente_drive_atividade`,
// …349). Leitura só; UMA consulta, colunas explícitas.
//
// A GUARDA É A RLS (`security_invoker`: admin ou dono do cliente), com a
// sessão de quem chama. Nada de `service_role`. Com
// `gps.config.drive_atividade_ativo` desligada a view volta vazia — e vazio
// não é erro: o card simplesmente não aparece.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS =
  "subpasta, arquivos, ultima_modificacao_em, ultima_modificacao_por, ultima_alteracao_03_em, sugere_etapa";

/**
 * Atividade de UM cliente. Falha de leitura devolve `null` (com `logErro`),
 * nunca uma atividade vazia: "nada na pasta" é afirmação sobre o cliente, e
 * falha não prova isso.
 */
export async function getAtividadeDriveDoCliente(
  clienteId: string,
): Promise<AtividadeDrive | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("vw_cliente_drive_atividade")
    .select(COLUNAS)
    .eq("cliente_id", clienteId)
    .order("subpasta", { ascending: true });

  if (error) {
    logErro("getAtividadeDriveDoCliente", error, { clienteId });
    return null;
  }
  return montarAtividade((data ?? []) as LinhaAtividadeDrive[], Date.now());
}
