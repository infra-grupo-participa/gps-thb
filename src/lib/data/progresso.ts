import { createClient } from "@/lib/supabase/server";
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
export async function getEtapas(): Promise<Etapa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapas")
    .select(COLUNAS_ETAPA)
    .order("ordem");
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
