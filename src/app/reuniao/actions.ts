"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { linkLiveValido, horaCurta } from "@/lib/reuniao";
import { buscarAlunos, type AlunoBusca } from "@/app/admin/actions";
import {
  enviarReuniaoConfirmada,
  enviarReuniaoRecusada,
  enviarSolicitacaoParaEquipe,
  enviarConfirmacaoParaEquipe,
} from "@/lib/email";

/** Limite de texto livre que o aluno/equipe escreve (pauta, motivo da recusa). */
const MAX_TEXTO = 500;

function revalidar(alunoId: string) {
  revalidatePath("/");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  revalidatePath("/admin/reunioes");
  revalidatePath("/admin");
}

/** "HH:MM" válido? (o horário em si é validado contra `gps.reuniao_horarios`). */
function formatoHorarioValido(h: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
}

function limpar(texto: string | undefined | null): string | null {
  const v = (texto ?? "").trim();
  if (!v) return null;
  return v.slice(0, MAX_TEXTO);
}

/**
 * Resolve o aluno alvo da ação e se o autor pode agir por ele.
 * - Aluno logado: só age por si mesmo (ignora alunoId vindo do cliente).
 * - Admin: age pelo alunoId informado (modo assistência).
 */
async function resolverAlvo(alunoIdArg?: string) {
  const ctx = await getContextoSessao();
  if (!ctx) return { erro: "Sessão expirada." as const };
  if (ctx.papel === "aluno") {
    if (!ctx.alunoId) return { erro: "Aluno não vinculado." as const };
    return { alunoId: ctx.alunoId, isAdmin: false as const, userId: ctx.user.id };
  }
  if (ctx.papel === "admin") {
    if (!alunoIdArg) return { erro: "Aluno não informado." as const };
    return { alunoId: alunoIdArg, isAdmin: true as const, userId: ctx.user.id };
  }
  return { erro: "Sem permissão." as const };
}

/** Só admin. Devolve o id do usuário da equipe (para registrar quem respondeu). */
async function exigirAdmin() {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return { erro: "Sem permissão." as const };
  return { userId: ctx.user.id };
}

/** Nome, e-mail e telefone do aluno, para os avisos. */
async function contatoDoAluno(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select("nome, email, telefone")
    .eq("id", alunoId)
    .maybeSingle();
  return (data ?? null) as {
    nome: string | null;
    email: string | null;
    telefone: string | null;
  } | null;
}

/** Nome do cliente favoritado (o que a reunião vai tratar). */
async function clienteDaReuniao(clienteId: string | null | undefined) {
  if (!clienteId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("nome")
    .eq("id", clienteId)
    .maybeSingle();
  return (data?.nome as string | null) ?? null;
}

/**
 * O aluno **solicita** a reunião (ou troca de horário); o admin **agenda**.
 *
 * Diferença essencial entre os dois autores:
 * - **Aluno**: a linha nasce (ou volta a) `pendente` — quem confirma é a equipe.
 *   Favorito e link são obrigatórios: a reunião é sempre com o cliente
 *   favoritado e ele informa a sala que criou.
 * - **Admin** (`/admin/reunioes` ou modo assistência): já grava `confirmada` —
 *   se a equipe está marcando, a equipe estará lá. Favorito e link são
 *   opcionais (o aluno completa depois).
 *
 * O status nunca vem do cliente: o trigger `reuniao_guardar_status` no banco
 * decide pelo papel de quem escreve, mesmo que alguém chame a API direto.
 */
export async function agendarReuniao(input: {
  alunoId?: string;
  data: string;
  horario: string;
  linkLive?: string;
  pauta?: string;
}) {
  const alvo = await resolverAlvo(input.alunoId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { alunoId, isAdmin, userId } = alvo;

  const horario = horaCurta(input.horario);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data ?? "") || !formatoHorarioValido(horario)) {
    return { erro: "Escolha um horário válido." };
  }

  const link = (input.linkLive ?? "").trim();
  // O aluno é obrigado a informar um link válido; o admin pode deixar em branco.
  if (!isAdmin) {
    if (!linkLiveValido(link)) {
      return {
        erro: "Informe um link de reunião válido (começando com https://).",
      };
    }
  } else if (link && !linkLiveValido(link)) {
    return { erro: "O link informado é inválido (deve começar com https://)." };
  }

  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // O horário precisa existir e estar aberto na grade.
  const { data: horarioGrade } = await gps
    .from("reuniao_horarios")
    .select("ativo")
    .eq("horario", horario)
    .maybeSingle();
  if (!horarioGrade || (!horarioGrade.ativo && !isAdmin)) {
    return { erro: "Este horário não está disponível." };
  }

  // Favorito: obrigatório para o aluno; opcional para o admin (grava se existir).
  const { data: favorito } = await gps
    .from("etapa1_clientes")
    .select("id")
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true)
    .maybeSingle();
  if (!favorito && !isAdmin) {
    return {
      erro: "Escolha primeiro o cliente que a equipe vai acompanhar (favorito).",
    };
  }

  // Slot não pode estar fechado — nem a quarta inteira (horario NULL), nem o
  // slot. A equipe pode furar a própria grade e encaixar alguém.
  if (!isAdmin) {
    const { data: bloqueios } = await gps
      .from("reuniao_bloqueios")
      .select("horario")
      .eq("data", input.data);
    const fechado = (bloqueios ?? []).some(
      (b: { horario: string | null }) =>
        b.horario === null || horaCurta(b.horario) === horario,
    );
    if (fechado) return { erro: "Este horário não está disponível." };
  }

  // No upsert por aluno_id, um remarque não deve apagar dados já preenchidos:
  // se o admin remarca sem link, preserva o link/cliente que já existiam.
  const { data: atual } = await gps
    .from("reuniao_agendamentos")
    .select("cliente_id, link_live, pauta, data, horario, status")
    .eq("aluno_id", alunoId)
    .maybeSingle();

  const clienteId = favorito?.id ?? atual?.cliente_id ?? null;
  const linkFinal = link || atual?.link_live || null;
  const pautaFinal =
    input.pauta !== undefined ? limpar(input.pauta) : (atual?.pauta ?? null);

  // A equipe decide com base na pauta — sem ela, a solicitação chega vazia.
  if (!isAdmin && !pautaFinal) {
    return {
      erro: "Conte em uma frase o que você precisa resolver na reunião.",
    };
  }

  const linha: Record<string, unknown> = {
    aluno_id: alunoId,
    cliente_id: clienteId,
    data: input.data,
    horario,
    link_live: linkFinal,
    pauta: pautaFinal,
  };

  // NADA nasce confirmado — nem quando é a própria equipe que marca. Só a ação
  // explícita de "Confirmar presença" confirma, porque é ali que se confere
  // conflito de agenda. Marcar como confirmado sem esse passo foi o que gerou o
  // incidente de 05/08/2026: aluno viu "confirmado", apareceu na reunião, e
  // ninguém da equipe sabia.
  //
  // Só mexe no status quando o SLOT muda: assim, editar o link ou a pauta de uma
  // reunião já confirmada não a joga de volta para a fila.
  const mudouSlot =
    !atual || atual.data !== input.data || horaCurta(atual.horario) !== horario;
  if (mudouSlot) {
    linha.status = "pendente";
    linha.motivo_recusa = null;
    linha.respondido_em = null;
    linha.respondido_por = null;
  }

  const { error } = await gps
    .from("reuniao_agendamentos")
    .upsert(linha, { onConflict: "aluno_id" });

  if (error) {
    // 23505 = violação de unique. Se for o slot, alguém pegou antes.
    if (error.code === "23505") {
      return { erro: "Esse horário acabou de ser preenchido. Escolha outro." };
    }
    // P0001 = as validações do trigger, já escritas para o usuário final.
    if (error.code === "P0001") return { erro: error.message };
    return { erro: "Não foi possível agendar: " + error.message };
  }

  // Avisa quem confirma. Sem isto, a solicitação só existiria dentro do painel
  // e alguém teria de ficar olhando a tela para não perder pedido nenhum.
  if (mudouSlot) {
    const [contato, nomeCliente] = await Promise.all([
      contatoDoAluno(alunoId),
      clienteDaReuniao(clienteId),
    ]);
    await enviarSolicitacaoParaEquipe({
      aluno: contato?.nome || contato?.email || "Aluno do programa",
      alunoEmail: contato?.email,
      alunoTelefone: contato?.telefone,
      data: input.data,
      horario,
      pauta: pautaFinal,
      cliente: nomeCliente,
      linkLive: linkFinal,
      remarcacao: Boolean(atual),
    });
  }

  revalidar(alunoId);
  return {};
}

/**
 * Equipe confirma presença na reunião solicitada pelo aluno.
 * Avisa o aluno por e-mail (falha de envio não desfaz a confirmação).
 */
export async function confirmarReuniao(alunoId: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  if (!alunoId) return { erro: "Aluno não informado." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("reuniao_agendamentos")
    .update({
      status: "confirmada",
      motivo_recusa: null,
      respondido_em: new Date().toISOString(),
      respondido_por: admin.userId,
    })
    .eq("aluno_id", alunoId)
    .select("data, horario, link_live, cliente_id, pauta")
    .maybeSingle();

  if (error) {
    // 23505 = enquanto isso outro aluno ocupou o horário (recusa já liberou).
    if (error.code === "23505") {
      return {
        erro: "Outro aluno já ocupou este horário. Combine outro com o aluno.",
      };
    }
    return { erro: "Não foi possível confirmar: " + error.message };
  }
  if (!data) return { erro: "Esta reunião não existe mais. Atualize a página." };

  const ctx = await getContextoSessao();
  const [contato, nomeCliente] = await Promise.all([
    contatoDoAluno(alunoId),
    clienteDaReuniao(data.cliente_id),
  ]);
  const nomeAluno = contato?.nome || contato?.email || "Aluno do programa";

  // Os dois lados são avisados: o aluno (que estava esperando resposta) e a
  // equipe (para o compromisso entrar na agenda de quem vai participar).
  await Promise.all([
    contato?.email
      ? enviarReuniaoConfirmada({
          para: contato.email,
          nome: contato.nome,
          data: data.data,
          horario: data.horario,
          linkLive: data.link_live,
          cliente: nomeCliente,
        })
      : Promise.resolve(null),
    enviarConfirmacaoParaEquipe({
      aluno: nomeAluno,
      confirmadoPor: ctx?.perfil?.nome ?? ctx?.user.email ?? null,
      data: data.data,
      horario: data.horario,
      linkLive: data.link_live,
      cliente: nomeCliente,
      pauta: data.pauta,
    }),
  ]);

  revalidar(alunoId);
  return {};
}

/**
 * Equipe recusa o horário ("não vou conseguir participar"). O aluno é avisado
 * com o motivo e precisa escolher outro horário — a linha continua existindo,
 * mas o slot volta a ficar livre (índice único parcial ignora `recusada`).
 *
 * `fecharHorario` fecha aquele slot da quarta para todos, quando o impedimento
 * é da agenda da equipe e não daquele aluno.
 */
export async function recusarReuniao(input: {
  alunoId: string;
  motivo?: string;
  fecharHorario?: boolean;
}) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  if (!input.alunoId) return { erro: "Aluno não informado." };

  const supabase = await createClient();
  const gps = supabase.schema("gps");

  const { data, error } = await gps
    .from("reuniao_agendamentos")
    .update({
      status: "recusada",
      motivo_recusa: limpar(input.motivo),
      respondido_em: new Date().toISOString(),
      respondido_por: admin.userId,
    })
    .eq("aluno_id", input.alunoId)
    .select("data, horario")
    .maybeSingle();

  if (error) return { erro: "Não foi possível recusar: " + error.message };
  if (!data) return { erro: "Esta reunião não existe mais. Atualize a página." };

  // Se o impedimento é da equipe, fecha o horário para todo mundo.
  if (input.fecharHorario) {
    const { error: erroBloqueio } = await gps.from("reuniao_bloqueios").insert({
      data: data.data,
      horario: horaCurta(data.horario),
      motivo: limpar(input.motivo),
    });
    // 23505 = já estava fechado.
    if (erroBloqueio && erroBloqueio.code !== "23505") {
      return {
        erro:
          "A recusa foi registrada, mas não deu para fechar o horário: " +
          erroBloqueio.message,
      };
    }
  }

  const contato = await contatoDoAluno(input.alunoId);
  if (contato?.email) {
    await enviarReuniaoRecusada({
      para: contato.email,
      nome: contato.nome,
      data: data.data,
      horario: data.horario,
      motivo: limpar(input.motivo),
    });
  }

  revalidar(input.alunoId);
  return {};
}

/**
 * Cancela a reunião do aluno (libera o slot e apaga a solicitação).
 *
 * Quando quem cancela é a **equipe**, o aluno precisa saber — senão ele aparece
 * numa reunião que não existe mais. Avisa por e-mail, como na recusa.
 */
export async function cancelarReuniao(alunoIdArg?: string) {
  const alvo = await resolverAlvo(alunoIdArg);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { alunoId, isAdmin } = alvo;

  const supabase = await createClient();
  const gps = supabase.schema("gps");

  // Guarda o que existia para conseguir avisar depois de apagar.
  const { data: antes } = await gps
    .from("reuniao_agendamentos")
    .select("data, horario, status")
    .eq("aluno_id", alunoId)
    .maybeSingle();

  const { error } = await gps
    .from("reuniao_agendamentos")
    .delete()
    .eq("aluno_id", alunoId);

  if (error) return { erro: "Não foi possível cancelar: " + error.message };

  if (isAdmin && antes && antes.status !== "recusada") {
    const contato = await contatoDoAluno(alunoId);
    if (contato?.email) {
      await enviarReuniaoRecusada({
        para: contato.email,
        nome: contato.nome,
        data: antes.data,
        horario: antes.horario,
        motivo: "A equipe cancelou este horário.",
      });
    }
  }

  revalidar(alunoId);
  return {};
}

/** Admin: fecha a quarta inteira (feriado) — bloqueio com horario NULL. */
export async function bloquearQuarta(data: string, motivo?: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  if (!data) return { erro: "Informe a data." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .insert({ data, horario: null, motivo: limpar(motivo) });

  // 23505 = já estava bloqueada; trata como sucesso (idempotente).
  if (error && error.code !== "23505") return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: reabre a quarta inteira (remove só o bloqueio de dia todo). */
export async function desbloquearQuarta(data: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .delete()
    .eq("data", data)
    .is("horario", null);

  if (error) return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: fecha um horário pontual de uma quarta (bloqueio com horario preenchido). */
export async function bloquearSlot(data: string, horario: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  const h = horaCurta(horario);
  if (!data || !formatoHorarioValido(h)) return { erro: "Horário inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .insert({ data, horario: h, motivo: null });

  if (error && error.code !== "23505") return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

/** Admin: reabre um horário pontual de uma quarta. */
export async function desbloquearSlot(data: string, horario: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  const h = horaCurta(horario);

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_bloqueios")
    .delete()
    .eq("data", data)
    .eq("horario", h);

  if (error) return { erro: error.message };
  revalidatePath("/admin/reunioes");
  return {};
}

// ---------------------------------------------------------------------------
// Disponibilidade padrão: quais horários existem na grade de toda quarta.
// (Fechar uma data ou um slot específico continua sendo bloqueio, acima.)
// ---------------------------------------------------------------------------

/** Admin: cria um horário novo na grade de todas as quartas. */
export async function criarHorarioReuniao(horario: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  const h = horaCurta(horario);
  if (!formatoHorarioValido(h)) {
    return { erro: "Informe um horário no formato HH:MM (ex.: 19:00)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_horarios")
    .insert({ horario: h, ativo: true });

  if (error) {
    if (error.code === "23505") return { erro: "Esse horário já existe." };
    return { erro: "Não foi possível criar o horário: " + error.message };
  }
  revalidatePath("/admin/reunioes");
  revalidatePath("/", "layout");
  return {};
}

/** Admin: abre/fecha um horário em todas as quartas (sem apagar histórico). */
export async function definirHorarioAtivo(horario: string, ativo: boolean) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  const h = horaCurta(horario);

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("reuniao_horarios")
    .update({ ativo })
    .eq("horario", h)
    .select("horario")
    .maybeSingle();

  if (error) return { erro: error.message };
  if (!data) return { erro: "Horário não encontrado." };
  revalidatePath("/admin/reunioes");
  revalidatePath("/", "layout");
  return {};
}

/**
 * Admin: remove um horário da grade. Só sai se nenhuma reunião apontar para ele
 * (FK com ON DELETE RESTRICT) — nesse caso, oriente a desativar em vez de apagar.
 */
export async function removerHorarioReuniao(horario: string) {
  const admin = await exigirAdmin();
  if ("erro" in admin) return { erro: admin.erro };
  const h = horaCurta(horario);

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .from("reuniao_horarios")
    .delete()
    .eq("horario", h);

  if (error) {
    // 23503 = ainda existe reunião nesse horário.
    if (error.code === "23503") {
      return {
        erro:
          "Existem reuniões nesse horário. Desative-o em vez de apagar — o histórico é preservado.",
      };
    }
    return { erro: "Não foi possível remover: " + error.message };
  }
  revalidatePath("/admin/reunioes");
  revalidatePath("/", "layout");
  return {};
}

/**
 * Admin: busca alunos para agendar em nome deles na tela de Reuniões.
 * Reusa a busca tolerante de `admin/actions` e restringe aos que já estão no
 * GPS (a reunião é do programa; não faz sentido marcar por quem não entrou).
 */
export async function buscarAlunosParaAgenda(
  termo: string,
): Promise<AlunoBusca[]> {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "admin") return [];
  const alunos = await buscarAlunos(termo);
  return alunos.filter((a) => a.jaNoGps);
}
