"use server";

/**
 * Agenda de Sessões com a Equipe Jurídica — Server Actions da tela do ALUNO
 * (FATIA 4). PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md`
 * (§5.4 · §7.1 · §7.3 · §9 D4/D7).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe" removido em 10/08/2026.
 * Aquela decisão foi REVOGADA pelo Marcio em 22/09/2026 ("agora a
 * disponibilidade parte delas") e a revogação autorizou `gps.sessao_*` — e
 * SÓ isso. As tabelas `gps.reuniao_*` e `gps.agenda` seguem órfãs e
 * PROIBIDAS; nada neste arquivo as toca.
 *
 * 🔴 MÓDULO `"use server"` SÓ EXPORTA `async function`. `export type`,
 * `export interface` e `export const` passam no `tsc` E no `next build`, e
 * quebram em RUNTIME (já derrubou `/admin` em 10/09 e `/admin/videos` em
 * 11/09). Os tipos desta feature vivem em `src/lib/sessoes-tipos.ts`; o
 * resultado das actions é declarado inline na assinatura, não exportado.
 *
 * 🔴 A LEITURA NÃO MORA AQUI. `src/lib/data/sessoes.ts` (fatia 3) é a camada
 * de leitura; este arquivo só ESCREVE (agendar/cancelar). Duplicar a leitura
 * daria a ela liberdade de divergir do que a página já busca.
 */

import { revalidatePath } from "next/cache";

import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { MSG_SESSAO_INDETERMINADA, traduzirErroBanco } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import type {
  SessaoAgendarResultado,
  SessaoCancelarResultado,
} from "@/lib/sessoes-tipos";

/**
 * 🔴 AS FRASES DAS TRAVAS — por que elas precisam passar por aqui.
 *
 * `traduzirErroBanco` casa a mensagem crua por IGUALDADE em `FRASES_DO_BANCO`
 * e, se não casar, **descarta o texto** e devolve `POR_CODIGO[code]`. As
 * frases da `…292` são novas e não estão naquele mapa: sem esta tabela, o
 * aluno leria "Já existe um registro com esses dados." (o genérico do 23505)
 * no lugar de "Alguém acabou de pegar esse horário." — e, pior, leria o MESMO
 * texto genérico nos dois 23505, que têm causas OPOSTAS:
 *
 *   23505 `sessao_slot_unico`      → culpa de terceiro; escolher outro resolve
 *   23505 `sessao_aluno_tipo_viva` → estado do próprio aluno; tentar de novo
 *                                    NUNCA resolve (ele precisa cancelar antes)
 *
 * Colapsar as duas faria o aluno tentar para sempre no segundo caso. A `…292`
 * escreveu duas frases distintas de propósito; o papel desta função é **não
 * perdê-las no caminho** — a frase continua sendo a que veio do banco, não uma
 * reescrita do cliente.
 *
 * ⚠️ `frasesExtras` (4º parâmetro de `traduzirErroBanco`) é o gancho que já
 * existe para isto. Nada em `src/lib/erros.ts` é editado a partir daqui.
 *
 * 🔴 `Você já tem uma % marcada` é DINÂMICA (interpola `v_tipo.nome`) e por
 * isso nunca casa por igualdade — é tratada por `frasePreservada()`, não aqui.
 *
 * Função e não `const`: módulo `"use server"` só exporta `async function`, e
 * manter o valor dentro de uma função evita que alguém o exporte por engano.
 */
function frasesDasTravas(): Record<string, string> {
  return {
    // ── gps.sessao_agendar ───────────────────────────────────────────────
    "Alguém acabou de pegar esse horário. Escolha outro na lista.":
      "Alguém acabou de pegar esse horário. Escolha outro na lista.",
    "Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.":
      "Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.",
    "Esse horário não está mais disponível. Escolha outro na lista.":
      "Esse horário não está mais disponível. Escolha outro na lista.",
    "Esse horário já passou. Escolha outro.":
      "Esse horário já passou. Escolha outro.",
    "Escolha um horário para continuar.": "Escolha um horário para continuar.",
    "Você ainda não pode agendar esta sessão. É preciso ter um cliente marcado como o que a equipe acompanha, e a etapa correspondente liberada.":
      "Você ainda não pode agendar esta sessão. É preciso ter um cliente marcado como o que a equipe acompanha, e a etapa correspondente liberada.",
    "Tipo de sessão não encontrado.": "Tipo de sessão não encontrado.",

    // ── gps.sessao_cancelar ──────────────────────────────────────────────
    "Sessão não encontrada.": "Sessão não encontrada.",
    "Esta sessão não está marcada — nada a cancelar.":
      "Esta sessão não está marcada — nada a cancelar.",
    "O prazo para cancelar terminou (é até 24 horas antes). Abra um chamado no Suporte para falar com a equipe.":
      "O prazo para cancelar terminou (é até 24 horas antes). Abra um chamado no Suporte para falar com a equipe.",
    "O motivo passa de 300 caracteres.": "O motivo passa de 300 caracteres.",
  };
}

/**
 * A frase DINÂMICA de `sessao_aluno_tipo_viva`.
 *
 * `raise exception 'Você já tem uma % marcada. Cancele a atual antes de
 * marcar outra.', v_tipo.nome` — o `%` vira "Entrevista Prévia" ou "Reunião
 * Preliminar" em tempo de execução, então **nenhum mapa por igualdade a
 * alcança**. O precedente no repo é o `P0004` de `POR_CODIGO`, que existe
 * exatamente porque a frase do banco era dinâmica.
 *
 * Aqui não dá para resolver pelo código: `23505` é o mesmo das duas travas. O
 * que distingue é o TEXTO — e a regra desta fatia é mostrar a frase que veio,
 * não reescrevê-la no cliente.
 *
 * O teste é conservador de propósito: só repassa o que casa com o molde
 * exato daquela frase, nunca "qualquer texto que o banco mandou". Deixar
 * passar erro cru de Postgres é justamente o que `traduzirErroBanco` existe
 * para impedir (nome de tabela e de constraint na tela do aluno).
 */
function frasePreservada(bruto: string | undefined): string | null {
  const texto = (bruto ?? "").trim();
  return /^Você já tem uma .{3,80} marcada\. Cancele a atual antes de marcar outra\.$/.test(
    texto,
  )
    ? texto
    : null;
}

/**
 * Agenda UMA sessão no horário escolhido.
 *
 * Os 4 argumentos são exatamente os de `gps.sessao_agendar`, e vêm da linha
 * da grade que o aluno clicou — nunca de campo digitado. A RPC revalida a
 * oferta inteira sob lock antes de gravar (§7.1 passo 5): a tela pode estar
 * aberta há 20 minutos e o horário já ter sido tomado.
 *
 * 🔴 `revalidatePath` NÃO repinta sozinho um Client Component que recebeu
 * estado por prop. A grade é montada pelo Server Component da página; o
 * componente cliente chama `router.refresh()` no sucesso. Sem isso o aluno
 * veria "agendado" com o horário ainda listado como livre, e o segundo
 * clique bateria na trava que ele mesmo acabou de criar.
 */
export async function agendarSessao(input: {
  tipoId: number;
  responsavelId: string;
  data: string;
  horaInicio: string;
}): Promise<
  { ok: true; sessao: SessaoAgendarResultado } | { ok: false; erro: string }
> {
  try {
    const ctx = await getContextoSessao();
    // Guarda de FORMA, não de segurança: quem barra de verdade é
    // `gps.aluno_atual()` dentro da RPC (42501) e a RLS. Aqui é só para não
    // gastar uma ida ao banco por quem nem sessão de aluno tem.
    if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
      return { ok: false, erro: "Sem permissão para esta ação." };
    }
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("sessao_agendar", {
    p_tipo_id: input.tipoId,
    p_responsavel_id: input.responsavelId,
    p_data: input.data,
    p_hora_inicio: input.horaInicio,
  });

  if (error) {
    // 1º a frase DINÂMICA (nenhum mapa por igualdade a alcança);
    // 2º as frases fixas das travas, via `frasesExtras`.
    const dinamica = frasePreservada(error.message);
    if (dinamica) return { ok: false, erro: dinamica };
    return {
      ok: false,
      erro: traduzirErroBanco(
        "agendarSessao",
        error,
        { rpc: "gps.sessao_agendar", tipoId: input.tipoId },
        frasesDasTravas(),
      ),
    };
  }

  revalidatePath("/sessoes");
  return { ok: true, sessao: data as SessaoAgendarResultado };
}

/**
 * Cancela uma sessão marcada.
 *
 * O prazo do aluno (24h antes, §9 D7) é decidido DENTRO da RPC, contra
 * `inicio_em` — nunca aqui, e nunca contra `data` isolada: o servidor roda em
 * UTC e `data` mentiria o prazo das 21h à meia-noite (lição já paga neste
 * projeto em `plantao_slots.inicio_em` e no `hojeISO` do Financeiro).
 *
 * 🔑 A tela esconde o botão quando faltam menos de 24h e escreve o motivo,
 * mas isso é cortesia. A fronteira é a RPC: com a página aberta desde ontem,
 * quem recusa é o banco, com a frase certa.
 *
 * `motivo` é opcional para o aluno — a RPC grava "Cancelado pelo aluno."
 * quando vem vazio, porque o CHECK da `…291` exige 3..300 em qualquer
 * cancelamento. Doutora e admin cancelam pela fatia 5, não por aqui.
 */
export async function cancelarSessao(input: {
  agendamentoId: string;
  motivo?: string | null;
}): Promise<
  { ok: true; sessao: SessaoCancelarResultado } | { ok: false; erro: string }
> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
      return { ok: false, erro: "Sem permissão para esta ação." };
    }
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }

  const motivo = (input.motivo ?? "").trim();

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("sessao_cancelar", {
    p_agendamento_id: input.agendamentoId,
    p_motivo: motivo === "" ? null : motivo,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "cancelarSessao",
        error,
        { rpc: "gps.sessao_cancelar", agendamentoId: input.agendamentoId },
        frasesDasTravas(),
      ),
    };
  }

  revalidatePath("/sessoes");
  return { ok: true, sessao: data as SessaoCancelarResultado };
}
