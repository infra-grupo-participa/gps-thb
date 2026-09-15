import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import {
  INTERRUPTORES_CONFIG,
  type InterruptorComEstado,
} from "@/lib/config-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Tela de interruptores em /admin — a LEITURA.
//
// 🔴 Só ADMIN, e só as chaves da ALLOWLIST (`INTERRUPTORES_CONFIG`) — nunca
// `select("*")` em `gps.config`. A tabela guarda `resend_api_key` e
// `resgate_codigo` na mesma linha de tipo (`chave, valor`); um select amplo
// devolveria as duas ao cliente, mascaradas ou não. `.in("chave", …)` com a
// lista fechada é a fronteira desta função — `alternarInterruptor`
// (`config-actions.ts`) repete a mesma allowlist na ESCRITA, e a RPC
// `gps.config_definir` a repete uma terceira vez no banco (defesa em
// profundidade: Server Action é endpoint HTTP).
//
// A RLS de `gps.config` já é só-admin (`gps_config_admin`, migração …110) —
// `ehAdmin()` aqui evita a viagem ao banco à toa para quem não é admin,
// não é a fronteira.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Os interruptores da allowlist com o estado atual lido de `gps.config`.
 * Chave ausente na tabela (nunca gravada) entra como `ligado: false` — não
 * existe estado "desconhecido" nesta tela; interruptor sem linha é
 * interruptor desligado até alguém ligar pela primeira vez.
 */
export async function getInterruptores(): Promise<InterruptorComEstado[]> {
  if (!(await ehAdmin())) return [];

  const chaves = INTERRUPTORES_CONFIG.map((i) => i.chave);
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("config")
    .select("chave, valor")
    .in("chave", chaves);

  if (error) {
    logErro("config/getInterruptores", error);
    // Falha fechada: sem saber o estado real, a tela mostra tudo desligado
    // em vez de arriscar mostrar "ligado" para algo que pode não estar.
    return INTERRUPTORES_CONFIG.map((i) => ({ ...i, ligado: false }));
  }

  const valorPorChave = new Map(
    ((data ?? []) as { chave: string; valor: string | null }[]).map((l) => [
      l.chave,
      l.valor,
    ]),
  );

  return INTERRUPTORES_CONFIG.map((i) => ({
    ...i,
    ligado: valorPorChave.get(i.chave) === "true",
  }));
}
