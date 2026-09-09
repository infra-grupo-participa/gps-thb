"use server";

/**
 * Plantão de Dúvidas — o INTERRUPTOR de inscrições (`gps.config`, chave
 * `plantao_inscricao_aberta`). Uma ação só, de propósito: é o botão que
 * desliga TODAS as escritas públicas do Plantão sem deploy.
 *
 * Recortado de `src/app/admin/plantao/actions.ts` (CD5) sem mudança de
 * comportamento. Aquele arquivo virou o agregador que reexporta daqui.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { logErro } from "@/lib/log";
import type { ResultadoAcao } from "@/lib/plantao-tipos";

/**
 * Estado do interruptor de inscrições — o que era
 * `alter role authenticator set app.plantao_inscricao_aberta = 'false'`
 * (lacuna L4 da Fase 8: só um dev com acesso ao banco conseguia pausar).
 *
 * Grava em `gps.config` na chave `plantao_inscricao_aberta` (migração ...130;
 * antes era `gps.plantao_config`, que virou degrau de compatibilidade e sai
 * numa migração futura). Quem lê é `gps.plantao_escrita_liberada()`, que
 * guarda TODAS as escritas públicas: inscrever, cancelar, revelar link
 * (grava presença) e registrar NPS. A LEITURA continua liberada — pausado, o
 * calendário segue visível e só os botões param de funcionar.
 *
 * `atualizado_por` sai do `ctx.user.id` do SERVIDOR, nunca de parâmetro: id
 * de autor vindo do cliente é assinatura falsificável.
 */
export async function definirInscricoesAbertas(
  aberta: boolean,
): Promise<ResultadoAcao> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") {
    return { ok: false, erro: "Sem permissão." };
  }

  const supabase = await createClient();

  // `atualizado_em` NÃO vai no payload: quem carimba é o trigger
  // `trg_config_atualizado_em`. Relógio de servidor de aplicação não decide
  // "quando" num registro de auditoria.
  const { error } = await supabase
    .schema("gps")
    .from("config")
    .upsert(
      {
        chave: "plantao_inscricao_aberta",
        valor: aberta ? "true" : "false",
        atualizado_por: ctx.user.id,
      },
      { onConflict: "chave" },
    );

  if (error) {
    logErro("plantao/definirInscricoesAbertas", error, { aberta });
    return {
      ok: false,
      erro: aberta
        ? "Não foi possível reabrir as inscrições."
        : "Não foi possível pausar as inscrições.",
    };
  }

  revalidatePath("/admin/plantao");
  revalidatePath("/p/plantao");
  return { ok: true };
}
