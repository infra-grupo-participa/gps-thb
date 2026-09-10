import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import type { Etapa, ModoEnfase, ProgressoTarefa } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Etapas, progresso de tarefa e ênfase — o "onde o aluno está" do programa.
//
// Recortado de `src/lib/data.ts` (CD5) sem mudança de comportamento: as
// mesmas consultas, as mesmas colunas explícitas, os mesmos retornos.
// `src/lib/data.ts` reexporta tudo daqui, para os importadores não mudarem.
//
// ⚠️ CONTRATO das constantes `COLUNAS_*` (herdado do P6 do polimento): cada
// uma tem de listar TUDO que o tipo consumidor declara em `src/lib/types.ts`.
// Um `select` explícito NÃO falha quando falta coluna — o campo chega
// `undefined` e a tela mostra vazio em silêncio. Ao acrescentar coluna no
// banco E no tipo, acrescente aqui na MESMA mudança.
// ─────────────────────────────────────────────────────────────────────────

/** `gps.etapas` → `Etapa`. */
const COLUNAS_ETAPA = "id, nome, descricao, ordem, liberada";
/** `gps.progresso` → `ProgressoTarefa`. */
const COLUNAS_PROGRESSO =
  "id, aluno_id, etapa, tarefa, concluida, concluida_em";
/**
 * As 6 etapas do programa e o estado de liberação de cada uma.
 *
 * 🔴 ESTA FUNÇÃO PRECISA FALHAR ALTO (10/09/2026).
 *
 * Ela descartava o `error` e devolvia `[]`. Parece defensivo; é o contrário.
 * Num engasgo de rede — o `fetch failed` intermitente que o log de produção
 * mostra e que o `server.js` documenta — a home renderizava **"Tudo em dia
 * nas etapas liberadas"** com a jornada vazia: o portal afirmava ao aluno
 * que ele havia concluído tudo.
 *
 * 🔑 Tela de ERRO é honesta; tela VAZIA mentindo, não. O `error.tsx` da rota
 * já existe e diz "não foi possível carregar — tente de novo", que é a
 * verdade. Lista vazia legítima (nenhuma etapa cadastrada) continua
 * devolvendo `[]` sem erro.
 */
export async function getEtapas(): Promise<Etapa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapas")
    .select(COLUNAS_ETAPA)
    .order("ordem");
  if (error) {
    logErro("getEtapas", error);
    throw new Error("Não foi possível carregar as etapas.");
  }
  return (data ?? []) as Etapa[];
}
/** Todo o progresso do aluno (todas as etapas). */
export async function getProgressoAluno(
  alunoId: string,
): Promise<ProgressoTarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("progresso")
    .select(COLUNAS_PROGRESSO)
    .eq("aluno_id", alunoId);
  return (data ?? []) as ProgressoTarefa[];
}
export async function getProgressoEtapa(
  alunoId: string,
  etapa: number,
): Promise<ProgressoTarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("progresso")
    .select(COLUNAS_PROGRESSO)
    .eq("aluno_id", alunoId)
    .eq("etapa", etapa);
  return (data ?? []) as ProgressoTarefa[];
}

/** Overrides de destaque de tarefa (definidos pelo admin) para uma etapa. */
export async function getEnfasesEtapa(
  alunoId: string,
  etapa: number,
): Promise<Record<number, ModoEnfase>> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("tarefa_enfase")
    .select("tarefa, modo")
    .eq("aluno_id", alunoId)
    .eq("etapa", etapa);
  const out: Record<number, ModoEnfase> = {};
  for (const r of (data ?? []) as { tarefa: number; modo: ModoEnfase }[]) {
    out[r.tarefa] = r.modo;
  }
  return out;
}
