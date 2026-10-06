"use server";

/**
 * Trajetória do cliente — server actions (marcar, desmarcar).
 *
 * 🔴 `"use server"` SÓ EXPORTA `async function`. Tipos e constantes moram em
 * `src/lib/trajetoria-tipos.ts`.
 *
 * 🔴 Nada aqui é a fronteira de segurança: quem decide é a RPC
 * (`gps.cliente_trajetoria_marcar`/`_desmarcar`, guarda admin OU membro do
 * ambiente do cliente) e a RLS. As validações daqui existem para o erro
 * chegar em português sem gastar ida ao banco com entrada obviamente inválida.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { traduzirErroBanco, MSG_SESSAO_INDETERMINADA } from "@/lib/erros";
import { UUID_RE } from "@/lib/texto";
import {
  ehCodigoEtapaCliente,
  FRASES_TRAJETORIA,
  type CodigoEtapaCliente,
} from "@/lib/trajetoria-tipos";

function revalidarFichas(clienteId: string) {
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/admin/aluno/[alunoId]/clientes/[clienteId]", "page");
  // 🔴 Desde 05/10 marcar/desmarcar MUDA `etapa1_clientes.fase` (gatilho da
  // …353). Quem lê a fase fora da ficha também cai: lista e quadro
  // (/clientes), meta de honorários (/etapa/1), favorito na home (/) e o
  // espelho admin do parceiro. Mesmas rotas de `revalidarClientes`, que pede o
  // alunoId — aqui o escritor pode ser o admin, sem alunoId na sessão, então
  // a rota do admin vai pelo padrão dinâmico.
  revalidatePath("/etapa/1");
  revalidatePath("/clientes", "layout");
  revalidatePath("/etapa", "layout");
  revalidatePath("/", "layout");
  revalidatePath("/admin/aluno/[alunoId]", "layout");
}

/** `null` = pode seguir; string = recusa pronta para a tela. */
async function recusaDeSessao(): Promise<string | null> {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return MSG_SESSAO_INDETERMINADA;
  }
  if (!ctx || (ctx.papel !== "aluno" && ctx.papel !== "admin")) {
    return "Sem permissão para alterar a trajetória deste cliente.";
  }
  return null;
}

async function alternar(
  rpc: "cliente_trajetoria_marcar" | "cliente_trajetoria_desmarcar",
  e: { clienteId: string; etapa: CodigoEtapaCliente },
): Promise<
  | {
      ok: true;
      etapa: CodigoEtapaCliente;
      marcada: boolean;
      marcadoEm: string | null;
      mudou: boolean;
    }
  | { ok: false; erro: string }
> {
  if (typeof e?.clienteId !== "string" || !UUID_RE.test(e.clienteId)) {
    return { ok: false, erro: "Cliente não encontrado." };
  }
  if (!ehCodigoEtapaCliente(e.etapa)) {
    return { ok: false, erro: "Etapa inválida." };
  }
  const recusa = await recusaDeSessao();
  if (recusa) return { ok: false, erro: recusa };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc(rpc, { p_cliente_id: e.clienteId, p_etapa: e.etapa });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        rpc,
        error,
        { clienteId: e.clienteId, etapa: e.etapa },
        FRASES_TRAJETORIA,
      ),
    };
  }

  const r = data as {
    etapa_codigo: string;
    marcado: boolean;
    marcado_em: string | null;
    mudou: boolean;
  };
  if (r.mudou) revalidarFichas(e.clienteId);
  return {
    ok: true,
    etapa: e.etapa,
    marcada: r.marcado,
    marcadoEm: r.marcado_em,
    mudou: r.mudou,
  };
}

/** Marca a etapa. Já marcada = sucesso com `mudou: false`. Não marca a mãe. */
export async function marcarEtapaCliente(e: {
  clienteId: string;
  etapa: CodigoEtapaCliente;
}) {
  return alternar("cliente_trajetoria_marcar", e);
}

/** Desmarca (soft). Não marcada = sucesso com `mudou: false`. Não mexe nas filhas. */
export async function desmarcarEtapaCliente(e: {
  clienteId: string;
  etapa: CodigoEtapaCliente;
}) {
  return alternar("cliente_trajetoria_desmarcar", e);
}
