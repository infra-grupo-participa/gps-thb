"use server";

/**
 * Entrevista prévia — Server Actions da EQUIPE (Fatia 3 da esteira, migração
 * 20260915000262).
 *
 * 🔴 ATUALIZADO EM 16/09/2026 (FATIA B-1): o comentário anterior dizia que
 * a guarda de verdade era `ehAdmin()`/`gp_is_admin()` — isso ficou FALSO a
 * partir da migração `…264` (15/09), que trocou a guarda de
 * `gps.entrevista_gravar` para `gps.eh_equipe()` (admin OU operador ativo
 * da esteira) sem que este arquivo acompanhasse. Resultado: o operador puro
 * abria a fila e a action recusava antes de chegar ao banco, que já o
 * aceitava. A guarda de verdade é `gps.eh_equipe()` DENTRO da RPC (SECURITY
 * DEFINER); `ehEquipeDaEsteira()` aqui é conveniência que evita uma viagem
 * ao banco à toa e devolve erro cedo, no mesmo padrão de `ehAdmin()` em
 * `diario-actions.ts`.
 *
 * 🔑 Regra para não repetir o bug: quando uma RPC muda de guarda no banco,
 * buscar os chamadores em TypeScript é parte DA MESMA migração, não passo
 * seguinte — foi a falta dessa varredura em 15/09 que produziu o bug.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehEquipeDaEsteira } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import {
  RESULTADOS_ENTREVISTA,
  ENTREVISTA_OBSERVACOES_MAXIMO,
  DECISOR_NOME_MAXIMO,
  DECISOR_PAPEL_MAXIMO,
  QUALIDADE_MINIMA,
  QUALIDADE_MAXIMA,
  type EntrevistaGravarInput,
  type EntrevistaGravarResultado,
} from "@/lib/entrevista-tipos";
import type { PerfilDisc } from "@/lib/types";

const PERFIS_DISC: readonly PerfilDisc[] = ["D", "I", "S", "C"];

function revalidar(alunoId?: string) {
  revalidatePath("/admin/entrevistas");
  revalidatePath("/admin", "layout");
  if (alunoId) revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/**
 * Grava UMA TENTATIVA de ligação (resultado + DISC + observações +
 * decisores + retorno + qualidade), numa chamada só à RPC
 * `gps.entrevista_gravar` — a transação é do banco, não desta action.
 * Validação aqui ESPELHA a do banco (migração `…266`), para o erro comum
 * chegar em português sem precisar de uma ida e volta ao Postgres — a RPC
 * continua sendo a fronteira real.
 */
export async function gravarEntrevista(
  input: EntrevistaGravarInput,
): Promise<EntrevistaGravarResultado> {
  if (!(await ehEquipeDaEsteira())) return { ok: false, erro: "Sem permissão." };

  const clienteId = (input.clienteId ?? "").trim();
  if (!clienteId) return { ok: false, erro: "Faltou informar o cliente." };

  if (!RESULTADOS_ENTREVISTA.includes(input.resultado)) {
    return { ok: false, erro: "Escolha um resultado válido para a ligação." };
  }

  const disc = input.disc ?? null;
  if (disc !== null && !PERFIS_DISC.includes(disc)) {
    return { ok: false, erro: "Perfil DISC inválido." };
  }

  const qualidade = input.qualidade ?? null;
  if (
    qualidade !== null &&
    (qualidade < QUALIDADE_MINIMA || qualidade > QUALIDADE_MAXIMA)
  ) {
    return { ok: false, erro: "A nota de qualidade vai de 1 a 5." };
  }

  // Decisão 3 da migração `…266`: `remarcar` exige data futura; qualquer
  // outro resultado ignora `retornoEm` (a RPC também ignora — não é erro
  // mandar, só não tem efeito).
  let retornoEm: string | null = null;
  if (input.resultado === "remarcar") {
    const bruto = (input.retornoEm ?? "").trim();
    if (!bruto) {
      return { ok: false, erro: "Informe a data do retorno para remarcar." };
    }
    const data = new Date(bruto);
    if (Number.isNaN(data.getTime())) {
      return { ok: false, erro: "Informe a data do retorno para remarcar." };
    }
    if (data.getTime() <= Date.now()) {
      return { ok: false, erro: "A data do retorno precisa ser no futuro." };
    }
    retornoEm = data.toISOString();
  }

  const observacoes = (input.observacoes ?? "").trim();
  if (observacoes.length > ENTREVISTA_OBSERVACOES_MAXIMO) {
    return {
      ok: false,
      erro: `As observações passam de ${ENTREVISTA_OBSERVACOES_MAXIMO} caracteres.`,
    };
  }

  let decisoresPayload: { nome: string; papel_no_negocio: string | null; principal: boolean }[] | null =
    null;
  if (input.decisores) {
    decisoresPayload = [];
    for (const d of input.decisores) {
      const nome = (d.nome ?? "").trim();
      if (!nome) return { ok: false, erro: "Todo decisor precisa de nome." };
      if (nome.length > DECISOR_NOME_MAXIMO) {
        return { ok: false, erro: `O nome do decisor passa de ${DECISOR_NOME_MAXIMO} caracteres.` };
      }
      const papel = (d.papelNoNegocio ?? "").trim();
      if (papel.length > DECISOR_PAPEL_MAXIMO) {
        return {
          ok: false,
          erro: `O papel do decisor no negócio passa de ${DECISOR_PAPEL_MAXIMO} caracteres.`,
        };
      }
      decisoresPayload.push({
        nome,
        papel_no_negocio: papel || null,
        principal: Boolean(d.principal),
      });
    }
  }

  const supabase = await createClient();
  const { data: clienteAntes } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("aluno_id")
    .eq("id", clienteId)
    .maybeSingle();

  const { error } = await supabase.schema("gps").rpc("entrevista_gravar", {
    p_cliente_id: clienteId,
    p_resultado: input.resultado,
    p_disc: disc,
    p_observacoes: observacoes || null,
    p_decisores: decisoresPayload,
    p_retorno_em: retornoEm,
    p_qualidade: qualidade,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco("gravarEntrevista", error, {
        rpc: "gps.entrevista_gravar",
      }),
    };
  }

  revalidar((clienteAntes as { aluno_id?: string } | null)?.aluno_id);
  return { ok: true };
}
