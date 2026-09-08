"use server";

/**
 * Plantão de Dúvidas — Acelera Holding. Server Actions PÚBLICAS.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * 🔄 SEM LOGIN desde 08/09/2026. Não há senha, sessão, token nem cookie: a
 * rota é pública e a identidade é o **e-mail**, conferido contra a base de
 * compradores (`gps.plantao_alunos`) dentro de cada RPC.
 *
 * 🔴 O que isso significa, dito sem eufemismo: o e-mail é uma AFIRMAÇÃO, não
 * uma prova. Quem souber o e-mail de um comprador consegue inscrever,
 * cancelar e marcar presença por ele. Risco apresentado e aceito pelo Marcio
 * — a senha padrão anterior era a mesma para os 422 e ninguém a trocou, então
 * na prática o modelo antigo já era isto, com 4 telas e 2 tabelas em cima.
 *
 * Como a rota não tem autenticação nenhuma, o **rate limit é a única trava**:
 * ele vive NO BANCO (dentro das RPCs), nunca aqui — Server Action é endpoint
 * HTTP, e validar só no cliente não protegeria nada.
 */

import { headers } from "next/headers";
import { createHash } from "crypto";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { JANELA_ANTES_MIN, JANELA_DEPOIS_MIN } from "@/lib/plantao-tipos";
import { normalizarEmail } from "@/lib/plantao";
import type {
  ResultadoAcao,
  SlotPublico,
  MinhaInscricao,
} from "@/lib/plantao-tipos";

/**
 * Cliente Supabase "cru" (sem `@supabase/ssr`, sem cookie de auth): o plantão
 * nunca dependeu do Supabase Auth, e agora não depende de sessão nenhuma.
 */
function clientePublico() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).schema("gps");
}

/**
 * Hash do IP do requisitante, para rate limit sem guardar IP em claro.
 *
 * ⚠️ Pega o ÚLTIMO hop de `x-forwarded-for`, não o primeiro.
 *
 * `x-forwarded-for` é uma lista que cada proxy ANEXA: `cliente, proxy1, proxy2`.
 * O primeiro valor é escrito pelo CLIENTE e é livremente forjável — usá-lo
 * daria um "IP" diferente a cada requisição só trocando um header, zerando o
 * rate limit e liberando varredura da base de compradores. O último valor é o
 * que o proxy imediatamente à frente (LiteSpeed/Passenger da Hostinger)
 * escreveu, e o cliente não consegue falsificá-lo: qualquer coisa que ele
 * injete fica ANTES na lista.
 *
 * `server.js` é `http.createServer` puro, sem `trust proxy` — então nenhuma
 * camada normaliza esse header antes de chegar aqui. A escolha do último hop
 * é a defesa.
 *
 * 🔑 Sem login, esta função ficou MAIS crítica: o rate limit que ela alimenta
 * é a única barreira contra enumerar os 422 compradores pelo formulário.
 */
async function ipHashAtual(): Promise<string | null> {
  const h = await headers();
  const encaminhados = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const ip =
    encaminhados.length > 0
      ? encaminhados[encaminhados.length - 1]
      : h.get("x-real-ip")?.trim() || null;

  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Calendário do mês. `email` é OPCIONAL: sem ele a rota pública responde o
 * calendário mesmo assim (é o ponto da mudança); com ele, marca qual slot é
 * a inscrição da pessoa.
 */
export async function buscarCalendario(
  ano: number,
  mes: number,
  email?: string | null,
): Promise<{ ok: true; slots: SlotPublico[] } | { ok: false; erro: string }> {
  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_calendario", {
    p_ano: ano,
    p_mes: mes,
    p_email: email ? normalizarEmail(email) : null,
  });

  if (error) return { ok: false, erro: "Não foi possível carregar o calendário." };

  const slots = ((data ?? []) as Array<{
    slot_id: string;
    data: string;
    hora_inicio: string;
    duracao_min: number;
    mentora_nome: string;
    inscritos_qtd: number;
    minha_inscricao: boolean;
    encerrado: boolean;
    inscricao_encerrada: boolean;
  }>).map((r) => ({
    slotId: r.slot_id,
    data: r.data,
    horaInicio: r.hora_inicio.slice(0, 5),
    duracaoMin: r.duracao_min,
    mentoraNome: r.mentora_nome,
    inscritosQtd: r.inscritos_qtd,
    minhaInscricao: r.minha_inscricao,
    encerrado: r.encerrado,
    inscricaoEncerrada: r.inscricao_encerrada,
  }));

  return { ok: true, slots };
}

/** A inscrição ativa de quem informou o e-mail (ou null). */
export async function buscarMinhaInscricao(
  email: string,
): Promise<MinhaInscricao | null> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return null;

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_minha_inscricao", {
    p_email: emailNormalizado,
  });
  if (error || !data || !Array.isArray(data) || !data.length) return null;

  const row = data[0] as {
    inscricao_id: string;
    slot_id: string;
    data: string;
    hora_inicio: string;
    mentora_nome: string;
    presenca_em: string | null;
    nps_em: string | null;
    inicio_em: string;
    tem_sala: boolean;
    pode_cancelar: boolean;
  };

  const inicioEm = new Date(row.inicio_em).getTime();
  const agora = Date.now();
  const janelaAberta =
    agora >= inicioEm - JANELA_ANTES_MIN * 60_000 &&
    agora <= inicioEm + JANELA_DEPOIS_MIN * 60_000;

  return {
    inscricaoId: row.inscricao_id,
    slotId: row.slot_id,
    data: row.data,
    horaInicio: row.hora_inicio.slice(0, 5),
    mentoraNome: row.mentora_nome,
    presencaEm: row.presenca_em,
    npsEm: row.nps_em,
    encerrado: inicioEm <= agora,
    janelaAberta,
    temSala: Boolean(row.tem_sala),
    podeCancelar: Boolean(row.pode_cancelar),
  };
}

/**
 * Inscreve por nome + e-mail.
 *
 * NÃO manda e-mail aqui: o único e-mail ao aluno sai **1 hora antes do
 * início**, já com o link da sala, pelo job diário. Ver a etapa (a4) em
 * `src/app/api/plantao/manutencao/route.ts`.
 */
export async function inscrever(
  email: string,
  nome: string,
  slotId: string,
): Promise<ResultadoAcao & { inscricaoId?: string }> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return { ok: false, erro: "Informe um e-mail válido." };
  if (!nome?.trim()) return { ok: false, erro: "Informe seu nome." };

  const ipHash = await ipHashAtual();
  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_inscrever", {
    p_email: emailNormalizado,
    p_nome: nome.trim(),
    p_slot_id: slotId,
    p_ip_hash: ipHash,
  });

  if (error) return { ok: false, erro: "Não foi possível concluir a inscrição." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null; inscricao_id: string | null }
    | undefined;

  if (!row?.ok) {
    return { ok: false, erro: row?.motivo || "Não foi possível se inscrever." };
  }

  return { ok: true, inscricaoId: row.inscricao_id ?? undefined };
}

/**
 * Cancela a própria inscrição.
 *
 * ⚠️ A partir de 1h antes do início — quando o link da sala é liberado e o
 * e-mail com ele é enviado — o banco recusa. A tela mostra isso ANTES
 * (`podeCancelar`), para a pessoa não descobrir só no clique.
 */
export async function cancelar(
  email: string,
  inscricaoId: string,
): Promise<ResultadoAcao> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return { ok: false, erro: "Informe um e-mail válido." };

  const ipHash = await ipHashAtual();
  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_cancelar", {
    p_email: emailNormalizado,
    p_inscricao_id: inscricaoId,
    p_ip_hash: ipHash,
  });

  if (error) return { ok: false, erro: "Não foi possível cancelar." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível cancelar." };
  return { ok: true };
}

/**
 * Revela o link da sala — e isso REGISTRA PRESENÇA. Só funciona dentro da
 * janela (1h antes a 1h depois do início) e só quando há sala cadastrada.
 */
export async function revelarLink(
  email: string,
  inscricaoId: string,
): Promise<ResultadoAcao & { zoomUrl?: string }> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return { ok: false, erro: "Informe um e-mail válido." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_revelar_link", {
    p_email: emailNormalizado,
    p_inscricao_id: inscricaoId,
  });

  if (error) return { ok: false, erro: "Não foi possível abrir o link." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null; zoom_url: string | null }
    | undefined;

  if (!row?.ok || !row.zoom_url) {
    return { ok: false, erro: row?.motivo || "Link indisponível." };
  }
  return { ok: true, zoomUrl: row.zoom_url };
}

/** Registra a nota de NPS depois do plantão. */
export async function registrarNps(
  email: string,
  inscricaoId: string,
  nota: number,
  comentario: string,
): Promise<ResultadoAcao> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return { ok: false, erro: "Informe um e-mail válido." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_registrar_nps", {
    p_email: emailNormalizado,
    p_inscricao_id: inscricaoId,
    p_nota: nota,
    p_comentario: comentario?.trim() || null,
  });

  if (error) return { ok: false, erro: "Não foi possível registrar sua avaliação." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível avaliar." };
  return { ok: true };
}
