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

/**
 * Resolve a sessão atual do plantão a partir do cookie.
 *
 * `sessaoExpirou` distingue "nunca teve cookie" (`false`) de "tinha cookie e
 * não resolveu mais nada" (`true`) — a `page.tsx` usa isso só para trocar a
 * MENSAGEM da tela de login, nunca para diferenciar o motivo (expirou, foi
 * revogada ou o aluno foi bloqueado): é a mesma mensagem neutra em todos os
 * casos, para não confirmar a um estranho, pela rota pública, que aquele
 * e-mail comprou algo.
 *
 * `precisaTrocarSenha` vem direto de `senha_provisoria`, 3ª coluna de
 * `gps.plantao_sessao` desde 08/09/2026 — fonte única de verdade, sem
 * cookie-sinal duplicado que podia divergir do banco (e sumir mais fácil que
 * o cookie de sessão em Safari dentro de iframe, deixando o aluno preso na
 * senha padrão).
 *
 * A mesma RPC agora RECUSA aluno com `bloqueado_por_programa` (perdeu o
 * Plantão ao migrar para o Programa de Implementação) — para quem tinha
 * cookie de sessão válido e foi bloqueado, o retorno vem vazio como
 * qualquer outra sessão inválida, e o cookie morto é limpo aqui mesmo.
 */
export async function sessaoAtual(): Promise<{
  sessao: SessaoPlantao | null;
  sessaoExpirou: boolean;
}> {
  const token = await tokenDaSessao();
  if (!token) return { sessao: null, sessaoExpirou: false };

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_sessao", { p_token: token });
  if (error || !data || !Array.isArray(data) || !data.length) {
    const jar = await cookies();
    jar.delete({ name: COOKIE_SESSAO, path: "/p" });
    return { sessao: null, sessaoExpirou: true };
  }

  const row = data[0] as {
    aluno_plantao_id: string;
    nome: string;
    senha_provisoria: boolean;
  };

  return {
    sessao: {
      alunoPlantaoId: row.aluno_plantao_id,
      nome: row.nome,
      precisaTrocarSenha: row.senha_provisoria,
    },
    sessaoExpirou: false,
  };
}

/**
 * Entra no plantão. Desde 08/09/2026 o 1º acesso usa a SENHA PADRÃO
 * distribuída pela Hotmart (não mais os 4 últimos dígitos do documento) — o
 * parâmetro `p_documento` continua na assinatura de `gps.plantao_login` por
 * compatibilidade, mas é IGNORADO pelo banco; por isso não é mais coletado
 * aqui nem pedido na tela.
 *
 * Quando `precisa_trocar_senha` volta `true` (1º acesso com a senha padrão,
 * ou login seguinte de quem ainda não trocou), a sessão é criada normalmente
 * e o próprio banco continua marcando isso em `gps.plantao_sessao` — a
 * página só libera o calendário depois de `definirSenha()` ter sucesso.
 *
 * A checagem real mora em `gps.plantao_login`; aqui só repassamos. Server
 * Action é endpoint HTTP: validar só na tela não protegeria nada.
 */
export async function entrar(
  email: string,
  senha: string,
): Promise<ResultadoAcao & { primeiroAcesso?: boolean; precisaTrocarSenha?: boolean }> {
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
    p_documento: null,
  });

  if (error) return { ok: false, erro: "Não foi possível entrar. Tente novamente." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        ok: boolean;
        motivo: string | null;
        sessao_token: string | null;
        primeiro_acesso: boolean;
        nome: string | null;
        precisa_trocar_senha: boolean;
      }
    | undefined;

  if (!row?.ok || !row.sessao_token) {
    return { ok: false, erro: row?.motivo || "E-mail ou senha inválidos." };
  }

  const jar = await cookies();
  jar.set(COOKIE_SESSAO, row.sessao_token, COOKIE_OPTS);

  return {
    ok: true,
    primeiroAcesso: row.primeiro_acesso,
    precisaTrocarSenha: row.precisa_trocar_senha,
  };
}

/**
 * Define a senha definitiva no lugar da senha padrão (troca obrigatória do
 * 1º acesso). Usa o token da sessão já existente — o aluno não faz login de
 * novo. Mínimo de `SENHA_MIN` caracteres validado aqui E em
 * `gps.plantao_definir_senha`, que também recusa a própria senha padrão como
 * nova (Server Action é endpoint HTTP: validar só no cliente não protege).
 */
export async function definirSenha(senhaNova: string): Promise<ResultadoAcao> {
  const token = await tokenDaSessao();
  if (!token) return { ok: false, erro: "Sessão expirada. Entre novamente." };

  if (senhaNova.length < SENHA_MIN) {
    return { ok: false, erro: `A senha precisa ter ao menos ${SENHA_MIN} caracteres.` };
  }

  const supabase = clientePublico();
  const { data, error } = await supabase.rpc("plantao_definir_senha", {
    p_token: token,
    p_senha_nova: senhaNova,
  });

  if (error) return { ok: false, erro: "Não foi possível trocar a senha. Tente novamente." };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; motivo: string | null }
    | undefined;

  if (!row?.ok) {
    return { ok: false, erro: row?.motivo || "Não foi possível trocar a senha." };
  }

  return { ok: true };
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
    tem_sala: boolean;
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

  // 🔑 NÃO manda e-mail aqui (decisão do Marcio, 08/09/2026). O único e-mail
  // ao aluno sai **1 hora antes do início**, já com o link da sala, pelo job
  // diário (`plantao_email_sala_pendente` → `enviarPlantaoSala`).
  //
  // Motivo: o e-mail no ato da inscrição não podia carregar o link (a sala só
  // é revelada dentro da janela, porque revelar grava presença), então era um
  // aviso sem ação — e o aluno tinha de voltar ao portal na hora. Concentrar
  // num só envio, na hora que importa, resolve as duas pontas.
  //
  // Efeito colateral desejado: um envio por inscrição a menos, e some o vetor
  // de bombardeio de caixa por inscrever/cancelar em loop.

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
