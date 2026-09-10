/**
 * Notificação de @menção do Diário no Slack.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SAI (decisão do João, 10/09/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *   "<Autor> mencionou <@você> no Diário de <Aluno>"
 *   > trecho da nota (até 300 caracteres)
 *   link direto para /admin/aluno/<id>/diario
 *
 *   O João pediu explicitamente o TEXTO da nota e o link direto para a tela do
 *   aluno. Fica registrado o custo: o Diário é só-admin por LGPD porque o texto
 *   livre pode citar TERCEIROS (o cliente do aluno). Por isso: (1) o trecho é
 *   cortado em 300 caracteres; (2) o canal recomendado é PRIVADO, só da equipe
 *   que já lê o Diário; (3) nunca vai e-mail, telefone ou nome do cliente do
 *   aluno além do que estiver no próprio texto que a equipe escreveu. O link
 *   exige login de admin — o Slack não vira porta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DOIS TRANSPORTES, MESMA MENSAGEM
 * ═══════════════════════════════════════════════════════════════════════════
 *   1. **Bot token** (`SLACK_BOT_TOKEN` = xoxb-… + `SLACK_CANAL_MENCOES` = C…):
 *      `chat.postMessage` no canal, com `<@U…>` de verdade para cada pessoa
 *      mencionada — o Slack notifica a pessoa. O id do Slack é resolvido pelo
 *      E-MAIL do `public.perfis` via `users.lookupByEmail` (scope
 *      `users:read.email`), com cache em memória do processo. Quem não tem
 *      conta com aquele e-mail aparece só pelo nome.
 *   2. **Incoming webhook** (`SLACK_WEBHOOK_MENCOES`): posta a mesma mensagem
 *      no canal do webhook, sem notificar pessoas individualmente.
 *   Com os dois configurados, o bot vence. Sem nenhum, o canal está fechado —
 *   e isso NÃO é falha.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONDE MORA O SEGREDO — NÃO em `gps.config` (C-7)
 * ═══════════════════════════════════════════════════════════════════════════
 *   `gps.config` tem policy única só-admin: qualquer admin lê `resend_api_key`
 *   pela REST. Token e webhook moram em ENV (painel da Hostinger). O
 *   INTERRUPTOR (`gps.config.slack_mencoes_ativo`) fica no banco porque não é
 *   segredo: desliga o canal para todos sem deploy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FALHA NUNCA BLOQUEIA A NOTA
 * ═══════════════════════════════════════════════════════════════════════════
 *   `registrarNota` grava e SÓ DEPOIS avisa, com timeout de 3 s por chamada.
 *   Erro vira `logErro` (sem o texto da nota) e a action devolve `ok: true`.
 *   "env presente não é env válida": `slackConfigurado()` diz *configurado*,
 *   nunca *funcionando*; a tela do admin mostra só o modo, jamais o segredo.
 */

import { logErro } from "@/lib/log";

const TIMEOUT_MS = 3_000;
const TRECHO_MAX = 300;

type Modo = "bot" | "webhook";

function modoAtivo(): { modo: Modo; token?: string; canal?: string; webhook?: string } | null {
  const token = (process.env.SLACK_BOT_TOKEN ?? "").trim();
  const canal = (process.env.SLACK_CANAL_MENCOES ?? "").trim();
  if (token && canal) return { modo: "bot", token, canal };
  const webhook = (process.env.SLACK_WEBHOOK_MENCOES ?? "").trim();
  if (webhook) return { modo: "webhook", webhook };
  return null;
}

/** Não é segredo — é o que a tela do admin pode mostrar. */
export function slackConfigurado(): { configurado: boolean; modo: Modo | null } {
  const m = modoAtivo();
  return { configurado: m !== null, modo: m?.modo ?? null };
}

/** @deprecated use `slackConfigurado()`; mantido para os chamadores antigos. */
export function webhookConfigurado(): boolean {
  return modoAtivo() !== null;
}

export interface MencaoParaSlack {
  /** Nome de quem escreveu a nota. */
  autor: string;
  /** Nome do ALUNO (o cliente da empresa). */
  aluno: string;
  /** `/admin/aluno/<id>/diario` — o link exige login de admin. */
  url: string;
  /** Texto da nota; é cortado em 300 caracteres aqui. */
  texto: string;
  /** Pessoas mencionadas (nome + e-mail do `perfis`; o e-mail só serve para achar o id no Slack). */
  mencionados: { nome: string; email: string | null }[];
}

// mrkdwn do Slack trata `<`, `>` e `&` como marcação (link, menção).
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function trecho(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > TRECHO_MAX ? `${limpo.slice(0, TRECHO_MAX - 1)}…` : limpo;
}

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await fn(controlador.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Cache do processo: e-mail → id do Slack (ou null quando não existe). Vive
// enquanto o processo Node viver; um deploy zera. Evita 1 lookup por menção.
const cacheSlackId = new Map<string, string | null>();

async function slackIdPorEmail(token: string, email: string): Promise<string | null> {
  const chave = email.trim().toLowerCase();
  if (!chave) return null;
  if (cacheSlackId.has(chave)) return cacheSlackId.get(chave) ?? null;
  try {
    const r = await comTimeout((signal) =>
      fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(chave)}`,
        { headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" },
      ),
    );
    const j = (await r.json()) as { ok?: boolean; user?: { id?: string }; error?: string };
    const id = j.ok && j.user?.id ? j.user.id : null;
    cacheSlackId.set(chave, id);
    if (!j.ok && j.error && j.error !== "users_not_found") {
      logErro("slack.lookupByEmail", j.error, { efeito: "menção sai só pelo nome" });
    }
    return id;
  } catch (erro) {
    logErro("slack.lookupByEmail", erro, { efeito: "menção sai só pelo nome" });
    return null;
  }
}

/**
 * Posta a notificação. Retorna `{ ok, enviado }` e **nunca lança** — quem
 * chama já gravou a nota e não pode ser desfeito por isto.
 */
export async function notificarMencao(
  dados: MencaoParaSlack,
  ativo: boolean,
): Promise<{ ok: boolean; enviado: boolean }> {
  const cfg = modoAtivo();
  if (!ativo || !cfg) return { ok: true, enviado: false };

  // Quem foi mencionado: `<@U…>` quando o e-mail bate com uma conta do Slack
  // (só no modo bot), senão o nome em negrito.
  const pessoas: string[] = [];
  for (const m of dados.mencionados) {
    const id =
      cfg.modo === "bot" && m.email ? await slackIdPorEmail(cfg.token!, m.email) : null;
    pessoas.push(id ? `<@${id}>` : `*${esc(m.nome)}*`);
  }

  const texto =
    `:speech_balloon: *${esc(dados.autor)}* mencionou ${pessoas.join(", ") || "você"} ` +
    `no Diário de *${esc(dados.aluno)}*\n` +
    `> ${esc(trecho(dados.texto))}\n` +
    `<${dados.url}|Abrir o Diário do aluno>`;

  try {
    const r =
      cfg.modo === "bot"
        ? await comTimeout((signal) =>
            fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${cfg.token}`,
                "Content-Type": "application/json; charset=utf-8",
              },
              body: JSON.stringify({
                channel: cfg.canal,
                text: texto,
                unfurl_links: false,
                unfurl_media: false,
              }),
              signal,
              cache: "no-store",
            }),
          )
        : await comTimeout((signal) =>
            fetch(cfg.webhook!, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: texto }),
              signal,
              cache: "no-store",
            }),
          );

    // O bot responde 200 com `ok:false` em erro de negócio (canal errado,
    // token sem scope): tem de ler o corpo. O webhook responde pelo status.
    let okSlack = r.ok;
    let detalhe: string | undefined;
    if (cfg.modo === "bot") {
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      okSlack = r.ok && j.ok === true;
      detalhe = j.error;
    }
    if (!okSlack) {
      // Só status e código do Slack — nunca o texto da nota, nunca o segredo.
      logErro("slack.notificarMencao", `HTTP ${r.status}${detalhe ? ` ${detalhe}` : ""}`, {
        modo: cfg.modo,
        efeito: "a nota FOI gravada; o aviso nao saiu",
      });
      return { ok: false, enviado: false };
    }
    return { ok: true, enviado: true };
  } catch (erro) {
    logErro("slack.notificarMencao", erro, {
      modo: cfg.modo,
      efeito: "a nota FOI gravada; o aviso nao saiu",
    });
    return { ok: false, enviado: false };
  }
}
