"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import {
  INTERRUPTORES_POR_CHAVE,
  type ResultadoAcaoConfig,
} from "@/lib/config-tipos";

/**
 * Liga/desliga um interruptor de `gps.config` pela tela em `/admin`.
 *
 * 🔴 A allowlist é conferida AQUI e DE NOVO no banco (`gps.config_definir`,
 * migração `20260915000260`). Chave fora de `INTERRUPTORES_POR_CHAVE` é
 * recusada sem sequer chamar a RPC — mesmo assim a RPC também recusa, porque
 * Server Action é endpoint HTTP: quem chamasse o PostgREST direto pulando
 * esta action bateria na mesma trava. Sem a dupla checagem, esta função
 * viraria escrita arbitrária em `gps.config`, incluindo `resend_api_key` e
 * `resgate_codigo`.
 *
 * A trilha (quem ligou/desligou o quê, quando) é gravada dentro da RPC, em
 * `gps.acessos_log` — é o ponto todo desta feature: hoje a mesma mudança
 * feita por SQL direto não deixa rastro de autor.
 */
export async function alternarInterruptor(
  chave: string,
  ligado: boolean,
): Promise<ResultadoAcaoConfig> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão para esta ação." };

  if (!INTERRUPTORES_POR_CHAVE.has(chave)) {
    return { ok: false, erro: "Este interruptor não existe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("config_definir", {
    p_chave: chave,
    p_valor: ligado ? "true" : "false",
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("admin/alternarInterruptor", error, { chave }),
    };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}
