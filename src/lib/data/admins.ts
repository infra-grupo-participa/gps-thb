import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import type {
  AcaoHistoricoAdmin,
  AdminDoPrograma,
  EventoAdmin,
} from "@/lib/admins-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Admins do programa (08/10/2026). Leitura por RPC (`gps.admins_listar`,
// `gps.admins_historico`) — a fronteira é a guarda de admin dentro delas;
// `ehAdmin()` aqui só evita a viagem ao banco (cache por requisição).
//
// 🔴 Em erro devolve `linhas: null` + `erro`, NUNCA `[]`: lista vazia diria
// "nenhum admin", que é falso e levaria alguém a "recriar" admins.
// ─────────────────────────────────────────────────────────────────────────

export type Leitura<T> =
  | { linhas: T[]; erro?: undefined }
  | { linhas: null; erro: string };

const texto = (v: unknown) => (v == null ? "" : String(v));
const textoOuNulo = (v: unknown) => (v == null || v === "" ? null : String(v));

export async function getAdminsDoPrograma(): Promise<Leitura<AdminDoPrograma>> {
  if (!(await ehAdmin())) return { linhas: null, erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admins_listar");

  if (error) {
    return {
      linhas: null,
      erro: traduzirErroBanco("admin/listarAdmins", error, {
        rpc: "gps.admins_listar",
      }),
    };
  }

  const linhas = ((data ?? []) as Record<string, unknown>[]).map((d) => ({
    userId: texto(d.user_id),
    nome: texto(d.nome) || texto(d.email),
    email: texto(d.email),
    ativo: d.ativo === true,
    concedidoEm: textoOuNulo(d.concedido_em),
    revogadoEm: textoOuNulo(d.revogado_em),
    motivo: textoOuNulo(d.motivo),
    concedidoPorNome: textoOuNulo(d.concedido_por_nome),
  }));

  return { linhas };
}

const ACOES: readonly AcaoHistoricoAdmin[] = ["concedido", "revogado", "reativado"];

export async function getHistoricoAdmins(
  limite = 50,
): Promise<Leitura<EventoAdmin>> {
  if (!(await ehAdmin())) return { linhas: null, erro: SEM_PERMISSAO };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admins_historico", { p_limite: limite });

  if (error) {
    return {
      linhas: null,
      erro: traduzirErroBanco("admin/historicoAdmins", error, {
        rpc: "gps.admins_historico",
      }),
    };
  }

  const linhas = ((data ?? []) as Record<string, unknown>[])
    // Ação fora do contrato não vira linha com rótulo inventado.
    .filter((d) => ACOES.includes(d.acao as AcaoHistoricoAdmin))
    .map((d) => ({
      em: texto(d.em),
      acao: d.acao as AcaoHistoricoAdmin,
      alvoNome: texto(d.alvo_nome) || texto(d.alvo_email),
      alvoEmail: texto(d.alvo_email),
      atorNome: textoOuNulo(d.ator_nome),
      motivo: textoOuNulo(d.motivo),
    }));

  return { linhas };
}
