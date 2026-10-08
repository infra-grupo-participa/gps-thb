"use server";

/**
 * Admins do programa — incluir/remover (08/10/2026).
 *
 * 🔴 Módulo `"use server"`: SÓ exporta `async function`. Tipos, limites e
 * frases moram em `src/lib/admins-tipos.ts`.
 *
 * Padrão do repo: `ehAdmin()` primeiro · validação local antes da RPC ·
 * `traduzirErroBanco` no erro (nunca `error.message` cru) · `revalidatePath`
 * · retorno `{ ok, erro? }`, nunca `throw` para a UI.
 *
 * A fronteira real é a guarda de admin dentro de `gps.admin_definir`; a
 * validação daqui só poupa a viagem e dá a frase certa antes.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getContextoSessao } from "@/lib/auth";
import { SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import { emailValido } from "@/lib/texto";
import {
  DOMINIO_ADMIN,
  FRASE_ADMIN_EMAIL_INVALIDO,
  FRASE_ADMIN_MOTIVO,
  FRASE_ADMIN_SI_MESMO,
  FRASE_ADMIN_SO_EQUIPE,
  MOTIVO_ADMIN_MAX,
  MOTIVO_ADMIN_MIN,
  type DefinirAdminResultado,
} from "@/lib/admins-tipos";

export async function definirAdminDoPrograma(entrada: {
  email: string;
  ativo: boolean;
  motivo: string;
  /** `true` = só conferir (o banco valida tudo e NÃO grava). */
  simular?: boolean;
}): Promise<DefinirAdminResultado> {
  if (!(await ehAdmin())) return { ok: false, erro: SEM_PERMISSAO };

  const email = String(entrada?.email ?? "").trim().toLowerCase();
  const motivo = String(entrada?.motivo ?? "").trim();
  const ativo = entrada?.ativo;
  const simular = entrada?.simular === true;

  if (typeof ativo !== "boolean") {
    return { ok: false, erro: "Faltou dizer se é para incluir ou remover." };
  }
  if (!emailValido(email)) return { ok: false, erro: FRASE_ADMIN_EMAIL_INVALIDO };
  if (!email.endsWith(DOMINIO_ADMIN)) return { ok: false, erro: FRASE_ADMIN_SO_EQUIPE };
  if (motivo.length < MOTIVO_ADMIN_MIN || motivo.length > MOTIVO_ADMIN_MAX) {
    return { ok: false, erro: FRASE_ADMIN_MOTIVO };
  }

  // Remover a si mesmo: a RPC recusa com P0001, o mesmo código de "último
  // admin". Decidido aqui para cada caso ter a sua frase. `getContextoSessao`
  // é `cache()` por requisição e já foi resolvido por `ehAdmin()` acima —
  // não é consulta nova.
  if (!ativo) {
    const ctx = await getContextoSessao();
    if ((ctx?.user.email ?? "").trim().toLowerCase() === email) {
      return { ok: false, erro: FRASE_ADMIN_SI_MESMO };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_definir", {
    p_email: email,
    p_ativo: ativo,
    p_motivo: motivo,
    p_simular: simular,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("admin/definirAdmin", error, {
        rpc: "gps.admin_definir",
      }),
    };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const mudou = simular ? d.mudaria : d.mudou;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
  // Simulação não grava: nada a revalidar.
  if (!simular) revalidatePath("/admin/operadores");
  return {
    ok: true,
    mudou: mudou !== false,
    simulado: simular,
    criadoEm: texto(d.criado_em),
    ultimoLogin: texto(d.ultimo_login),
  };
}
