"use server";

/**
 * Cadastro de clientes em lote (Onda 1.2, 02/10/2026) — "Colar lista".
 *
 * 🔴 Server Action é ENDPOINT HTTP. A fronteira é `gps.cadastrar_clientes_lote`
 * (SECURITY INVOKER): o insert passa pela MESMA policy do cadastro unitário
 * (`clientes_owner_insert`, `aluno_id = gps.aluno_atual()`), e o ambiente é
 * derivado no banco — esta action não recebe `alunoId` nenhum.
 *
 * Interruptor `gps.config.clientes_lote_ativo`: o parceiro não lê `gps.config`
 * (policy só-admin: a leitura voltaria vazia em silêncio), então a chave é
 * conferida DENTRO da RPC (`gps.clientes_lote_ativo()`) e a recusa chega aqui
 * como erro traduzido — uma ida ao banco, não duas.
 *
 * 🔴 Só `async function` exportada (módulo `"use server"`). Tipos e
 * constantes moram em `@/lib/clientes-lote-tipos`.
 */


import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { traduzirErroBanco, MSG_SESSAO_INDETERMINADA } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { revalidarClientes } from "./revalidar";
import {
  MOTIVO_DO_BANCO,
  prepararLoteClientes,
  type IgnoradoLote,
  type LinhaLoteEntrada,
  type ResultadoLoteClientes,
} from "@/lib/clientes-lote-tipos";

/** Mensagens CRUAS de `gps.cadastrar_clientes_lote` → frase de tela. */
const FRASES: Record<string, string> = {
  "sem ambiente": "Só o parceiro cadastra clientes em lote, no próprio ambiente.",
  "cadastro em lote desativado":
    "O cadastro em lote está desligado no momento. Cadastre um por vez em “Novo cliente”.",
  "lista vazia": "A lista está vazia.",
  "lista invalida": "Lista inválida.",
  "no maximo 50 clientes por vez":
    "No máximo 50 clientes por vez. Envie o restante em outra leva.",
};


export async function cadastrarClientesEmLote(
  linhas: LinhaLoteEntrada[],
): Promise<ResultadoLoteClientes> {
  const prep = prepararLoteClientes(linhas);
  if (!prep.ok) return { ok: false, inseridos: 0, ignorados: [], erro: prep.erro };

  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, inseridos: 0, ignorados: [], erro: MSG_SESSAO_INDETERMINADA };
  }
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { ok: false, inseridos: 0, ignorados: [], erro: FRASES["sem ambiente"] };
  }

  // Tudo recusado na validação: nada a gravar, mas o parceiro precisa ver o
  // motivo de cada linha (não é erro da chamada).
  if (prep.validas.length === 0) {
    return { ok: true, inseridos: 0, ignorados: prep.ignorados };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("cadastrar_clientes_lote", {
      p_linhas: prep.validas.map((v) =>
        v.telefone ? { nome: v.nome, telefone: v.telefone } : { nome: v.nome },
      ),
    });

  if (error) {
    return {
      ok: false,
      inseridos: 0,
      ignorados: [],
      erro: traduzirErroBanco(
        "cadastrarClientesEmLote",
        error,
        { linhas: prep.validas.length },
        FRASES,
      ),
    };
  }

  const d = (data ?? {}) as { inseridos?: unknown; ignorados?: unknown };
  const inseridos = typeof d.inseridos === "number" ? d.inseridos : 0;

  // A RPC numera pela lista que RECEBEU (só as válidas); volta à posição que
  // o parceiro enviou.
  const doBanco: IgnoradoLote[] = (Array.isArray(d.ignorados) ? d.ignorados : []).map(
    (i) => {
      const item = (i ?? {}) as { linha?: unknown; motivo?: unknown };
      const pos = typeof item.linha === "number" ? item.linha : 0;
      const bruto = typeof item.motivo === "string" ? item.motivo : "";
      return {
        linha: prep.validas[pos - 1]?.linha ?? pos,
        motivo: MOTIVO_DO_BANCO[bruto] ?? "Linha recusada.",
      };
    },
  );
  if (doBanco.length > 0) {
    // Esperado zero: a validação acima espelha a RPC. Se aparecer, as duas
    // divergiram — falha ruidosa no log, frase certa na tela.
    logErro("cadastrarClientesEmLote.divergencia", "RPC ignorou linha que a action aceitou", {
      quantas: doBanco.length,
    });
  }

  if (inseridos > 0) revalidarClientes(ctx.alunoId);

  return {
    ok: true,
    inseridos,
    ignorados: [...prep.ignorados, ...doBanco].sort((a, b) => a.linha - b.linha),
  };
}
