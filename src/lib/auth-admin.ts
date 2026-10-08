import { SessaoIndeterminadaError } from "./auth-erros";
import { logErro } from "./log";

/** O mínimo do cliente Supabase que a consulta usa (permite teste sem rede). */
export interface ClienteAdmins {
  schema(nome: "gps"): {
    from(tabela: "admins"): {
      select(colunas: "ativo"): {
        eq(coluna: "user_id", valor: string): {
          maybeSingle(): PromiseLike<{
            data: { ativo: boolean | null } | null;
            error: unknown;
          }>;
        };
      };
    };
  };
}

/**
 * Decisão única de "quem é admin do GPS": existe linha em `gps.admins` com
 * `user_id = userId` e `ativo = true` (`public.perfis.cargo`
 * deixou de decidir papel em 07/10/2026, quando outro sistema o alterou e
 * derrubou os admins do GPS).
 *
 * 🔴 Falha FECHADA: `error` preenchido LANÇA `SessaoIndeterminadaError`
 * ("não deu para saber"), nunca devolve `false` ("não é admin"). Sem linha
 * (`data:null, error:null`) ou `ativo` diferente de `true` → `false`.
 */
export async function consultarAdminAtivo(
  supabase: ClienteAdmins,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .schema("gps")
    .from("admins")
    .select("ativo")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logErro("getContextoSessao", error, { escopo: "admins" });
    throw new SessaoIndeterminadaError("admins");
  }

  return data?.ativo === true;
}
