import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { UUID_RE } from "@/lib/texto";
import { type EstadoDrive, estadoDoRetorno } from "@/lib/drive-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Integração Google Drive (…347) — LEITURA do estado para a tela.
// Escrita: `src/app/drive/actions.ts` (RPCs que enfileiram).
//
// Lê por `gps.drive_estado` (SECURITY DEFINER, guarda admin OU membro do
// ambiente) com a sessão de quem chama: `gps.drive_tarefas` é só-admin na RLS,
// e o parceiro precisa ver "Criando…" / "Pronta" / o erro. Nada de service_role.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Estado da pasta do parceiro e, com `clienteId`, da pasta do cliente.
 * Falha de leitura devolve `null` (com `logErro`), nunca "nenhuma": a tela
 * esconde os botões de criar em vez de oferecer criar de novo.
 */
export async function getEstadoDrive(
  alunoId: string,
  clienteId?: string | null,
): Promise<EstadoDrive | null> {
  if (!UUID_RE.test(alunoId) || (clienteId && !UUID_RE.test(clienteId))) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("drive_estado", {
    p_aluno_id: alunoId,
    p_cliente_id: clienteId ?? null,
  });
  if (error) {
    logErro("getEstadoDrive", error, { alunoId, clienteId: clienteId ?? null });
    return null;
  }

  return estadoDoRetorno(data, Boolean(clienteId));
}
