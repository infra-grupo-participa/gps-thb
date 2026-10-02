import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { logErro } from "@/lib/log";

/**
 * Leitura do cadastro obrigatório do sócio convidado (15/09/2026).
 *
 * O sócio que aceita o convite (`gps.socio_convite_aceitar`, …244) entra sem
 * nenhum dado pessoal. `getSocioPrecisaCadastro()` diz ao gate do frontend se
 * o formulário deve travar a tela — nunca ESCREVE nada (a escrita é
 * `gravarCadastroSocio`, em `src/app/onboarding/socio-actions.ts`).
 *
 * Molde do interruptor: `getConviteSocioAtivo` (`src/lib/data/equipe.ts`).
 * `gps.config` só tem policy de admin — sem a RPC
 * `gps.socio_cadastro_obrigatorio()` o sócio leria 0 linhas e cairia no
 * fallback `false` para sempre, feature ligada ou não.
 */

export interface SocioPrecisaCadastro {
  /** `true` só quando: interruptor ligado + é sócio + ainda não tem pessoa. */
  precisa: boolean;
  titularNome: string | null;
  titularEmail: string | null;
  /**
   * `true` quando este login já teve o cadastro RECUSADO por CPF de outro
   * cadastro (`gps.socio_cadastro_recusado`, migração …343). Nesse caso
   * `precisa` é `false`: o formulário obrigatório não reabre (era o laço da
   * queixa C41) e a tela mostra só um aviso dispensável — a Central liga a
   * pessoa certa depois.
   */
  recusado: boolean;
}

const VAZIO: SocioPrecisaCadastro = {
  precisa: false,
  titularNome: null,
  titularEmail: null,
  recusado: false,
};

export async function getSocioPrecisaCadastro(): Promise<SocioPrecisaCadastro> {
  const ctx = await getContextoSessao();

  // Só se aplica a sócio com ambiente e sem pessoa vinculada ainda. Titular,
  // admin e sócio que já preencheu o próprio cadastro não veem nada disto —
  // `pessoaAlunoId` é exatamente o campo que a RPC de gravação preenche.
  if (
    ctx?.papel !== "aluno" ||
    ctx.papelMembro !== "socio" ||
    ctx.pessoaAlunoId ||
    !ctx.alunoId
  ) {
    return VAZIO;
  }

  const supabase = await createClient();

  const { data: obrigatorio, error: erroInterruptor } = await supabase
    .schema("gps")
    .rpc("socio_cadastro_obrigatorio");

  if (erroInterruptor) {
    // Falha fechado: erro na leitura do interruptor nunca bloqueia o sócio.
    logErro("socio-cadastro/getSocioPrecisaCadastro/interruptor", erroInterruptor);
    return VAZIO;
  }
  if (obrigatorio !== true) return VAZIO;

  // Já recusado por CPF de outro cadastro → nada de formulário obrigatório.
  // Erro na leitura NÃO vira "recusado": cai no comportamento anterior
  // (formulário), que é o lado que não esconde nada.
  const { data: recusado, error: erroRecusado } = await supabase
    .schema("gps")
    .rpc("socio_cadastro_recusado");
  if (erroRecusado) {
    logErro("socio-cadastro/getSocioPrecisaCadastro/recusado", erroRecusado);
  } else if (recusado === true) {
    return { ...VAZIO, recusado: true };
  }

  const { data: titular, error: erroTitular } = await supabase
    .from("thb_alunos")
    .select("nome, email")
    .eq("id", ctx.alunoId)
    .maybeSingle();

  if (erroTitular) {
    logErro("socio-cadastro/getSocioPrecisaCadastro/titular", erroTitular);
  }

  return {
    precisa: true,
    titularNome: (titular?.nome as string | null) ?? null,
    titularEmail: (titular?.email as string | null) ?? null,
    recusado: false,
  };
}
