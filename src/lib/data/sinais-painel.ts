import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";

/** Sinais por ambiente de `gps.admin_painel_sinais()` (migração 20261002000339). */
export interface SinaisDoPainel {
  etapaAlemDa2Liberada: boolean;
  /** ISO do menor `ultima_mensagem_em` entre chamados `aberto`; `null` = nenhum. */
  chamadoAbertoDesde: string | null;
}

interface LinhaSinais {
  aluno_id: string;
  etapa_alem_da_2_liberada: boolean | null;
  chamado_aberto_desde: string | null;
}

/**
 * UMA chamada por requisição (`cache()`): `getAlunosGps` e
 * `getAtendimentoPorAluno` rodam em paralelo na mesma página e dividem o
 * resultado. Falha (migração ainda não aplicada) → `null`, com log: os campos
 * ficam `undefined` e os chips correspondentes ficam escondidos.
 */
export const getSinaisDoPainel = cache(
  async function getSinaisDoPainel(): Promise<Map<string, SinaisDoPainel> | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema("gps")
      .rpc("admin_painel_sinais");
    if (error) {
      logErro("getSinaisDoPainel", error, {
        rpc: "gps.admin_painel_sinais",
        efeito: "chips 'Parado na etapa' e 'Chamado sem resposta 24h+' escondidos",
      });
      return null;
    }
    return new Map(
      ((data ?? []) as LinhaSinais[]).map((l) => [
        l.aluno_id,
        {
          etapaAlemDa2Liberada: l.etapa_alem_da_2_liberada === true,
          chamadoAbertoDesde: l.chamado_aberto_desde ?? null,
        },
      ]),
    );
  },
);
