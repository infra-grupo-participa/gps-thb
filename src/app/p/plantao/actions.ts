"use server";

/**
 * Plantão de Dúvidas — Acelera Holding. Server Actions PÚBLICAS.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Rota embedada em iframe na área de membros da Hotmart
 * (https://hm.nivelouro.com.br/acelera-holding). Server Action é endpoint
 * HTTP público: rate limit e backoff vivem NO BANCO (dentro de
 * `gps.plantao_login`), não aqui. Toda ação lê o token do cookie e delega
 * a validação (sessão, dono da inscrição, janela do Zoom) para a RPC —
 * nunca monta SQL nem confia em id vindo do cliente sem checagem no banco.
 */

import { cookies, headers } from "next/headers";
import { createHash } from "crypto";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import {
  COOKIE_SESSAO,
  SENHA_MIN,
  JANELA_ANTES_MIN,
  JANELA_DEPOIS_MIN,
} from "@/lib/plantao-tipos";
import { normalizarEmail } from "@/lib/plantao";
import { enviarPlantaoConfirmado } from "@/lib/email-plantao";
import type {
  ResultadoAcao,
  SlotPublico,
  SessaoPlantao,
  MinhaInscricao,
} from "@/lib/plantao-tipos";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  partitioned: true,
  path: "/p",
  maxAge: 60 * 60 * 24 * 90, // 90 dias
};

/**
 * Cliente Supabase "cru" (sem `@supabase/ssr`, sem cookie de auth do
 * Supabase): o plantão tem identidade PRÓPRIA, isolada de `auth.users` — as
 * RPCs de plantão não dependem de sessão do Supabase Auth, só do token
 * opaco que este módulo gerencia.
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
 * rate limit de login (20 tentativas/15 min) e liberando força bruta e
 * varredura de contas em massa. O último valor é o que o proxy imediatamente
 * à frente (LiteSpeed/Passenger da Hostinger) escreveu, e o cliente não
 * consegue falsificá-lo: qualquer coisa que ele injete fica ANTES na lista.
 *
 * `server.js` é `http.createServer` puro, sem `trust proxy` — então nenhuma
 * camada normaliza esse header antes de chegar aqui. A escolha do último hop
 * é a defesa.
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

async function tokenDaSessao(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_SESSAO)?.value ?? null;
}

/** Resolve a sessão atual do plantão (ou null se não houver/expirou). */
export async function sessaoAtual(): Promise<SessaoPlantao | null> {
  const token = await tokenDaSessao();
  if (!token) return null;

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_sessao", { p_token: token });
  if (error || !data || !Array.isArray(data) || !data.length) return null;

  const row = data[0] as { aluno_plantao_id: string; nome: string };
  return { alunoPlantaoId: row.aluno_plantao_id, nome: row.nome };
}

/** Login (e 1º acesso, que já cria a senha). */
/**
 * Entra no plantão. No PRIMEIRO acesso a senha é criada na hora, e por isso
 * `documento` (4 últimos dígitos do documento da compra) é exigido pelo banco
 * — sem ele, saber o e-mail bastaria para tomar a conta de quem ainda não
 * entrou, e a resposta denunciaria quem está nessa janela, permitindo varrer
 * a base inteira. Nos acessos seguintes o documento é ignorado.
 *
 * A checagem real mora em `gps.plantao_login`; aqui só repassamos. Server
 * Action é endpoint HTTP: validar só na tela não protegeria nada.
 */
export async function entrar(
  email: string,
  senha: string,
  documento?: string,
): Promise<ResultadoAcao & { primeiroAcesso?: boolean }> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado || !senha) {
    return { ok: false, erro: "Informe e-mail e senha." };
  }
  if (senha.length < SENHA_MIN) {
    return { ok: false, erro: `A senha precisa ter ao menos ${SENHA_MIN} caracteres.` };
  }

  const ipHash = await ipHashAtual();
  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_login", {
    p_email: emailNormalizado,
    p_senha: senha,
    p_ip_hash: ipHash,
    p_documento: documento?.replace(/\D/g, "") || null,
  });

  if (error) return { ok: false, erro: "Não foi possível entrar. Tente novamente." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ok: boolean;
        motivo: string | null;
        sessao_token: string | null;
        primeiro_acesso: boolean;
      }
    | undefined;

  if (!row?.ok || !row.sessao_token) {
    return { ok: false, erro: row?.motivo || "E-mail ou senha inválidos." };
  }

  const jar = await cookies();
  jar.set(COOKIE_SESSAO, row.sessao_token, COOKIE_OPTS);

  return { ok: true, primeiroAcesso: row.primeiro_acesso };
}

export async function sair(): Promise<ResultadoAcao> {
  const token = await tokenDaSessao();
  if (token) {
    const supabase = clientePublico();
    await supabase.rpc("plantao_logout", { p_token: token });
  }
  const jar = await cookies();
  jar.delete({ name: COOKIE_SESSAO, path: "/p" });
  return { ok: true };
}

/** Calendário do mês para o aluno logado. */
export async function buscarCalendario(
  ano: number,
  mes: number,
): Promise<{ ok: true; slots: SlotPublico[] } | { ok: false; erro: string }> {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_calendario", {
    p_token: token,
    p_ano: ano,
    p_mes: mes,
  });

  if (error) return { ok: false, erro: "Não foi possível carregar o calendário." };

  const slots: SlotPublico[] = (data ?? []).map(
    (r: {
      slot_id: string;
      data: string;
      hora_inicio: string;
      duracao_min: number;
      mentora_nome: string;
      inscritos_qtd: number;
      minha_inscricao: boolean;
      encerrado: boolean;
    }) => ({
      slotId: r.slot_id,
      data: r.data,
      horaInicio: r.hora_inicio.slice(0, 5),
      duracaoMin: r.duracao_min,
      mentoraNome: r.mentora_nome,
      inscritosQtd: r.inscritos_qtd,
      minhaInscricao: r.minha_inscricao,
      encerrado: r.encerrado,
    }),
  );

  return { ok: true, slots };
}

/**
 * A inscrição ativa (ou a mais recente) do aluno logado, para a UI decidir
 * entre "escolher plantão" e "sua vaga está marcada". `plantao_inscricoes`
 * não tem policy de RLS para `anon`/`authenticated` (só admin) — por isso a
 * leitura passa pela RPC `plantao_minha_inscricao`, nunca por `.from()`
 * direto, que voltaria sempre vazio.
 */
export async function buscarMinhaInscricao(): Promise<MinhaInscricao | null> {
  const token = await tokenDaSessao();
  if (!token) return null;

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_minha_inscricao", {
    p_token: token,
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
  };
}

export async function inscrever(
  slotId: string,
): Promise<ResultadoAcao & { inscricaoId?: string }> {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_inscrever", {
    p_token: token,
    p_slot_id: slotId,
  });

  if (error) return { ok: false, erro: "Não foi possível concluir a inscrição." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ok: boolean;
        motivo: string | null;
        inscricao_id: string | null;
        email: string | null;
        nome: string | null;
        data: string | null;
        hora_inicio: string | null;
        mentora_nome: string | null;
      }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível se inscrever." };

  // E-mail de confirmação é cortesia: falha aqui nunca desfaz a inscrição.
  // A RPC já devolve os dados do PRÓPRIO aluno inscrito — evita uma segunda
  // leitura direta em `plantao_slots`/`plantao_alunos`, que o RLS bloquearia
  // (só admin tem policy nessas tabelas).
  if (row.email && row.data && row.hora_inicio) {
    await enviarPlantaoConfirmado({
      para: row.email,
      nome: row.nome,
      data: row.data,
      horaInicio: row.hora_inicio,
      mentoraNome: row.mentora_nome ?? "",
    }).catch(() => undefined);
  }

  return { ok: true, inscricaoId: row.inscricao_id ?? undefined };
}

export async function cancelar(inscricaoId: string): Promise<ResultadoAcao> {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_cancelar", {
    p_token: token,
    p_inscricao_id: inscricaoId,
  });

  if (error) return { ok: false, erro: "Não foi possível cancelar." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível cancelar." };
  return { ok: true };
}

export async function revelarLink(
  inscricaoId: string,
): Promise<ResultadoAcao & { zoomUrl?: string }> {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_revelar_link", {
    p_token: token,
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

export async function registrarNps(
  inscricaoId: string,
  nota: number,
  comentario: string,
): Promise<ResultadoAcao> {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_registrar_nps", {
    p_token: token,
    p_inscricao_id: inscricaoId,
    p_nota: nota,
    p_comentario: comentario?.trim() || null,
  });

  if (error) return { ok: false, erro: "Não foi possível registrar a avaliação." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) return { ok: false, erro: row?.motivo || "Não foi possível registrar a avaliação." };
  return { ok: true };
}
