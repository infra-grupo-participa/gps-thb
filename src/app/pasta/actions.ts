"use server";

// 🔴 Módulo "use server": SÓ exporta `async function`. Tipo e constante daqui
// quebram em runtime (ver CLAUDE.md, "use server só exporta função async").

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehUrlDoDrive, FRASES_PASTA_DRIVE } from "@/lib/pasta";
import { traduzirErroBanco } from "@/lib/erros";

/**
 * O PARCEIRO (titular ou sócio) define o link da pasta do Drive do próprio
 * ambiente.
 *
 * 🔑 O `alunoId` vem da SESSÃO (`ctx.alunoId`, que para o sócio já é o
 * ambiente do titular), nunca do cliente — Server Action é endpoint HTTP.
 *
 * A fronteira é `gps.pasta_drive_definir` (SECURITY DEFINER): confere que
 * quem chama é membro do ambiente, só deixa inserir quando vazio ou trocar
 * link que o próprio parceiro pôs, recusa remover e recusa link da equipe.
 * `urlAnterior` é a trava otimista: o valor que a tela mostrava.
 */
export async function salvarMinhaPasta(
  url: string,
  urlAnterior: string | null,
): Promise<{ erro?: string }> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { erro: "Sem permissão." };
  }
  const alunoId = ctx.alunoId;

  const valor = typeof url === "string" ? url.trim() : "";
  if (!valor) return { erro: "Informe o link da pasta." };
  if (!ehUrlDoDrive(valor)) {
    return { erro: "Informe um link válido do Google Drive." };
  }
  const anterior = typeof urlAnterior === "string" ? urlAnterior.trim() || null : null;

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("pasta_drive_definir", {
    p_aluno_id: alunoId,
    p_url: valor,
    p_url_anterior: anterior,
  });
  if (error) {
    return {
      erro: traduzirErroBanco("salvarMinhaPasta", error, { alunoId }, FRASES_PASTA_DRIVE),
    };
  }

  revalidatePath("/pasta");
  revalidatePath(`/admin/aluno/${alunoId}/pasta`);
  return {};
}
