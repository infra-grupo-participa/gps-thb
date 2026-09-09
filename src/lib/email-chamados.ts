import "server-only";

/**
 * Chamados (suporte do portal) — e-mails transacionais.
 *
 * Reaproveita a infra de `src/lib/email.ts` (`enviar`, `esc`, `layout`,
 * `botao`) — NÃO reescreve envio, layout nem remetente. Nenhuma função aqui
 * lança: falha de e-mail nunca desfaz um chamado nem uma resposta.
 *
 * 🔑 NENHUM DOS DOIS E-MAILS LEVA O TEXTO DA MENSAGEM. Só o assunto do chamado
 * e um botão para o portal. E-mail é canal menos controlado que o portal (fica
 * em caixa de entrada compartilhada, em backup, em encaminhamento) e a mensagem
 * de suporte pode conter dado pessoal do aluno ou de cliente dele.
 *
 * 🔑 QUANDO SAI: só na MUDANÇA DE STATUS do chamado, e quem decide isso é o
 * banco — as RPCs `gps.chamado_abrir`/`gps.chamado_responder` devolvem `avisar`
 * preenchido apenas na transição. Cinco mensagens seguidas do aluno geram UM
 * e-mail. A trava anti-flood é o modelo, não um contador aqui.
 */

import { enviar, esc, layout, botao, type ResultadoEmail } from "@/lib/email";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://programa.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Link só com id no formato de UUID — nunca interpolar id cru numa URL. */
function linkDoChamado(base: "chamados" | "admin/chamados", id: string): string {
  return UUID_REGEX.test(id) ? `${APP_URL}/${base}/${id}` : `${APP_URL}/${base}`;
}

/** Assunto do chamado no assunto do e-mail, cortado e sem quebra de linha
 *  (CR/LF em cabeçalho de e-mail é injeção — o banco já barra, aqui é a
 *  segunda camada). */
function assuntoSeguro(v: string): string {
  const limpo = (v ?? "").replace(/[\r\n]+/g, " ").trim();
  return limpo.length > 80 ? `${limpo.slice(0, 77)}...` : limpo || "sem assunto";
}

/**
 * Chamado ABERTO pelo aluno → avisa a equipe.
 *
 * `para` é a lista de `gps.config.chamados_email_equipe` (editável em
 * /admin/chamados, sem deploy) ou, se ela estiver vazia, `EMAIL_SUPORTE`. Lista
 * vazia nas duas pontas = ninguém é avisado, e quem chama REGISTRA isso — a
 * tela do admin mostra o aviso em destaque.
 */
export async function enviarChamadoAbertoParaEquipe(params: {
  para: string[];
  alunoNome: string;
  assunto: string;
  chamadoId: string;
}): Promise<ResultadoEmail> {
  const { para, alunoNome, assunto, chamadoId } = params;
  if (!para.length) return { ok: false, erro: "Sem destinatário." };

  const url = linkDoChamado("admin/chamados", chamadoId);
  const nome = (alunoNome ?? "").trim() || "Um aluno";

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>${esc(nome)}</strong> abriu um chamado no portal.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Assunto: <strong>${esc(assuntoSeguro(assunto))}</strong>
    </p>
    ${botao(url, "Abrir o chamado")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      A mensagem fica no portal — este aviso não a reproduz.
    </p>`;

  const texto = [
    `${nome} abriu um chamado no portal.`,
    `Assunto: ${assuntoSeguro(assunto)}`,
    "",
    `Responder em: ${url}`,
    "A mensagem fica no portal — este aviso não a reproduz.",
  ].join("\n");

  return enviar({
    para,
    assunto: `Novo chamado: ${assuntoSeguro(assunto)}`,
    html: layout({
      preheader: "Um aluno abriu um chamado no portal.",
      titulo: "Novo chamado no portal",
      corpo,
    }),
    texto,
  });
}

/** A equipe RESPONDEU → avisa o aluno. */
export async function enviarChamadoRespondidoParaAluno(params: {
  para: string;
  assunto: string;
  chamadoId: string;
}): Promise<ResultadoEmail> {
  const { para, assunto, chamadoId } = params;
  if (!para) return { ok: false, erro: "Sem destinatário." };

  const url = linkDoChamado("chamados", chamadoId);

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      A equipe respondeu o seu chamado
      <strong>${esc(assuntoSeguro(assunto))}</strong>.
    </p>
    ${botao(url, "Ver a resposta")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      A resposta está no portal — por segurança, ela não vai por e-mail.
    </p>`;

  const texto = [
    `A equipe respondeu o seu chamado "${assuntoSeguro(assunto)}".`,
    "",
    `Ver a resposta em: ${url}`,
    "A resposta está no portal — por segurança, ela não vai por e-mail.",
  ].join("\n");

  return enviar({
    para,
    assunto: `Resposta ao seu chamado: ${assuntoSeguro(assunto)}`,
    html: layout({
      preheader: "A equipe respondeu o seu chamado no portal.",
      titulo: "A equipe respondeu",
      corpo,
    }),
    texto,
  });
}
