"use server";

/**
 * Avisos no computador (Web Push) da EQUIPE. Server Action é endpoint HTTP:
 * a guarda `ehAdmin()` está aqui, e a fronteira real é a RPC no banco.
 */

import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";

type Resultado = { ok: true } | { ok: false; erro: string };

const SO_EQUIPE = "Ação restrita à equipe.";
const MAX_TXT = 2048;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_TXT
    ? v
    : null;
}

export async function ativarAvisosPush(entrada: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<Resultado> {
  if (!(await ehAdmin())) return { ok: false, erro: SO_EQUIPE };
  const endpoint = texto(entrada?.endpoint);
  const p256dh = texto(entrada?.p256dh);
  const auth = texto(entrada?.auth);
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith("https://")) {
    return { ok: false, erro: "Não foi possível ativar os avisos." };
  }
  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("push_inscrever", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: String(entrada.userAgent ?? "").slice(0, 300),
  });
  if (error) {
    return { ok: false, erro: traduzirErroBanco("ativarAvisosPush", error) };
  }
  return { ok: true };
}

export async function desativarAvisosPush(
  endpoint: string,
): Promise<Resultado> {
  if (!(await ehAdmin())) return { ok: false, erro: SO_EQUIPE };
  const ep = texto(endpoint);
  if (!ep) return { ok: false, erro: "Não foi possível desligar os avisos." };
  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("push_desinscrever", { p_endpoint: ep });
  if (error) {
    return { ok: false, erro: traduzirErroBanco("desativarAvisosPush", error) };
  }
  return { ok: true };
}
