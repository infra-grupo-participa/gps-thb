/**
 * Notificação de @menção do Diário no Slack — o ÚNICO canal de saída do
 * Diário, e o mais restrito possível.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SAI DAQUI — e só isto
 * ═══════════════════════════════════════════════════════════════════════════
 *   "<Autor> mencionou você no diário de <Nome do aluno> · <link>"
 *
 * 🔴 NUNCA o texto da nota. Nunca o tipo, nunca a origem, nunca o nome do
 * CLIENTE do aluno, nunca e-mail, nunca telefone. O Diário é só-admin por LGPD
 * porque o texto livre carrega dado pessoal de TERCEIRO; mandar esse texto para
 * um workspace externo por conveniência é tirar PII do perímetro. O link leva a
 * `/admin/aluno/<id>/diario`, que exige login de admin — o Slack não vira porta.
 *
 * ⚠️ Um webhook posta num CANAL, não em DM: os ~19 admins veem "X mencionou Y
 * no diário de Z". O nome do ALUNO é o nome de um cliente da empresa, num canal
 * interno da empresa — aceitável, e registrado como decisão. O dado do cliente
 * DO aluno é que não pode sair, e não sai. Se o João quiser DM, é o mesmo
 * payload por `chat.postMessage` (outra credencial) e o desenho não muda.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONDE MORA O SEGREDO — NÃO em `gps.config` (C-7)
 * ═══════════════════════════════════════════════════════════════════════════
 *   Medido em 10/09/2026: `gps.config` tem policy única `gps_config_admin
 *   [ALL]`, logo qualquer um dos 16 admins lê `resend_api_key` pela REST.
 *   Repetir o padrão com o webhook seria repetir um furo conhecido.
 *   → O webhook mora na env `SLACK_WEBHOOK_MENCOES` (painel da Hostinger) e o
 *     POST sai do Node, dentro da própria Server Action:
 *       · o segredo nunca toca o banco — nenhum admin o lê pela REST e ele não
 *         aparece em `pg_get_functiondef`;
 *       · não precisa de `pg_net` nem de cron: a menção é síncrona com um
 *         clique humano. Sem `net.http_post` assíncrono, SEM a classe de falha
 *         das 13:00 de 09/09 (o carimbo gravado antes do resultado).
 *   O INTERRUPTOR (`gps.config.slack_mencoes_ativo`) fica no banco porque NÃO é
 *   segredo: desliga o canal para todos sem deploy, no padrão de
 *   `chamados_aberto`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FALHA NUNCA BLOQUEIA A NOTA
 * ═══════════════════════════════════════════════════════════════════════════
 *   `registrarNota` grava, e SÓ DEPOIS tenta o webhook, com timeout de 3 s.
 *   Erro vira `logErro` e a action devolve `ok: true`. Precedente:
 *   `enviarChamadoAbertoParaEquipe`. O contrário — a nota falhar porque o Slack
 *   caiu — seria perder trabalho da equipe por causa de um aviso.
 *
 * 🔑 "env presente não é env válida": `webhookConfigurado()` responde
 *   **configurado**, nunca **funcionando**. A tela do admin mostra só o
 *   booleano, jamais a URL (precedente literal: `getChamadosConfig().fallbackEnv`).
 */

import { logErro } from "@/lib/log";

const TIMEOUT_MS = 3_000;

/** Não é segredo — é o que a tela do admin pode mostrar. */
export function webhookConfigurado(): boolean {
  return Boolean((process.env.SLACK_WEBHOOK_MENCOES ?? "").trim());
}

export interface MencaoParaSlack {
  /** Nome de quem escreveu a nota. */
  autor: string;
  /** Nome do ALUNO (o cliente da empresa) — nunca o cliente DO aluno. */
  aluno: string;
  /** `/admin/aluno/<id>/diario` — o link exige login de admin. */
  url: string;
  /** Quantas pessoas foram mencionadas (só a contagem entra na mensagem). */
  quantidade: number;
}

/**
 * Posta a notificação. Retorna `{ ok }` e **nunca lança** — quem chama já
 * gravou a nota e não pode ser desfeito por isto.
 *
 * `enviar = false` (interruptor desligado ou webhook ausente) devolve
 * `{ ok: true, enviado: false }`: não é erro, é o canal desligado.
 */
export async function notificarMencao(
  dados: MencaoParaSlack,
  ativo: boolean,
): Promise<{ ok: boolean; enviado: boolean }> {
  const webhook = (process.env.SLACK_WEBHOOK_MENCOES ?? "").trim();

  // Duas chaves independentes: o interruptor do banco (a equipe desliga sem
  // deploy) e a env (o João configura). Falta de qualquer uma = canal fechado,
  // e isso NÃO é falha.
  if (!ativo || !webhook) return { ok: true, enviado: false };

  // Texto montado aqui, num lugar só, para nenhum chamador conseguir injetar
  // conteúdo da nota. `quantidade` entra como número, nunca como lista de
  // nomes — a lista já está na tela de quem tem acesso.
  // mrkdwn do Slack trata `<`, `>` e `&` como marcação (link, menção): um
  // nome com `<` viraria link. Escapar é o que a própria doc do Slack manda.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const texto =
    `${esc(dados.autor)} mencionou você no diário de ${esc(dados.aluno)} · ${dados.url}` +
    (dados.quantidade > 1 ? ` (${dados.quantidade} pessoas mencionadas)` : "");

  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: texto }),
      signal: controlador.signal,
      cache: "no-store",
    });

    if (!r.ok) {
      // Só o status. O corpo da resposta do Slack pode devolver a URL do
      // webhook, e o log não é lugar de segredo.
      logErro("slack.notificarMencao", `HTTP ${r.status}`, {
        status: r.status,
        efeito: "a nota FOI gravada; o aviso nao saiu",
      });
      return { ok: false, enviado: false };
    }
    return { ok: true, enviado: true };
  } catch (erro) {
    logErro("slack.notificarMencao", erro, {
      efeito: "a nota FOI gravada; o aviso nao saiu",
    });
    return { ok: false, enviado: false };
  } finally {
    clearTimeout(timer);
  }
}
