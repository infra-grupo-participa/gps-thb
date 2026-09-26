import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import type { CompradorHmAguardando } from "@/lib/admin-acesso-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Fila "Compradores do HM aguardando acesso" (26/09/2026, migração `…317`).
//
// O webhook da Hotmart já cria o card e o cadastro em `thb_alunos` quando o
// HM cheio é pago. Esta leitura mostra quem, desses, ainda não tem ambiente no
// Programa. Liberar é CLIQUE da equipe (regra do Marcio, 11/09): a RPC só lê.
// ─────────────────────────────────────────────────────────────────────────

interface LinhaRpc {
  aluno_id: string;
  nome: string | null;
  email: string | null;
  comprado_em: string;
  oferta_codigo: string;
  valor: number | string | null;
  metodo_pagamento: string | null;
  tem_login: boolean;
}

/**
 * 🔴 `falhou` distingue "ninguém esperando" de "não deu para saber" — fila
 * vazia por erro de banco faria a equipe concluir que está em dia justamente
 * quando há comprador parado.
 */
export async function getCompradoresHmAguardando(): Promise<{
  compradores: CompradorHmAguardando[];
  falhou: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_compradores_hm_aguardando");

  if (error) {
    logErro("getCompradoresHmAguardando", error);
    return { compradores: [], falhou: true };
  }

  const compradores = ((data ?? []) as LinhaRpc[]).map((l) => ({
    alunoId: l.aluno_id,
    aluno: { nome: l.nome, email: l.email, telefone: null },
    compradoEm: l.comprado_em,
    ofertaCodigo: l.oferta_codigo,
    valor: l.valor === null ? null : Number(l.valor),
    metodoPagamento: l.metodo_pagamento,
    temLogin: Boolean(l.tem_login),
  }));
  return { compradores, falhou: false };
}
