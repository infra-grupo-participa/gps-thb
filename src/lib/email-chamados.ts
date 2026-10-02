import "server-only";
import { UUID_RE } from "@/lib/texto";

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
 * 🔑 QUANDO SAI — quem decide é o banco (`gps.chamado_abrir`/
 * `gps.chamado_responder` devolvem `avisar` preenchido ou nulo):
 *   - para a EQUIPE: na MUDANÇA DE STATUS (aluno escreve num chamado que
 *     não estava `aberto`) e, desde a `…335` (02/10/2026), também a cada nova
 *     mensagem do parceiro num chamado já aberto — AGRUPADO: no máximo 1
 *     e-mail por chamado a cada 30 min, citando quantas chegaram. A janela
 *     vive no banco (`chamados.ultimo_aviso_equipe_em`), não aqui. Chave
 *     `gps.config.chamados_aviso_por_mensagem` = 'false' volta à regra antiga.
 *   - para o PARCEIRO: a CADA resposta da equipe (`…319`, 28/09/2026). A
 *     resposta que vinha depois de um "aguarde" ficava sem e-mail e o parceiro
 *     só a via dias depois. Quem escreve é a equipe: não há vetor de rajada.
 */

import { APP_URL, enviar, esc, layout, botao, type ResultadoEmail } from "@/lib/email";


/** Link só com id no formato de UUID — nunca interpolar id cru numa URL. */
function linkDoChamado(base: "chamados" | "admin/chamados", id: string): string {
  return UUID_RE.test(id) ? `${APP_URL}/${base}/${id}` : `${APP_URL}/${base}`;
}

/** Assunto do chamado no assunto do e-mail, cortado e sem quebra de linha
 *  (CR/LF em cabeçalho de e-mail é injeção — o banco já barra, aqui é a
 *  segunda camada). */
function assuntoSeguro(v: string): string {
  const limpo = (v ?? "").replace(/[\r\n]+/g, " ").trim();
  return limpo.length > 80 ? `${limpo.slice(0, 77)}...` : limpo || "sem assunto";
}

/**
 * Aviso à EQUIPE: chamado aberto pelo aluno, ou mensagem nova dele num
 * chamado existente.
 *
 * `para` é a lista de `gps.config.chamados_email_equipe` (editável em
 * /admin/chamados, sem deploy) ou, se ela estiver vazia, `EMAIL_SUPORTE`. Lista
 * vazia nas duas pontas = ninguém é avisado, e quem chama REGISTRA isso — a
 * tela do admin mostra o aviso em destaque.
 *
 * `mensagensNovas` ausente = chamado NOVO (copy "abriu um chamado"). Presente
 * (≥ 1) = o parceiro escreveu num chamado que já existia; o número é o que o
 * banco contou desde o último aviso (`gps.chamado_responder`, …335).
 */
export async function enviarChamadoAbertoParaEquipe(params: {
  para: string[];
  alunoNome: string;
  assunto: string;
  chamadoId: string;
  mensagensNovas?: number;
}): Promise<ResultadoEmail> {
  const { para, alunoNome, assunto, chamadoId } = params;
  if (!para.length) return { ok: false, erro: "Sem destinatário." };

  const url = linkDoChamado("admin/chamados", chamadoId);
  const nome = (alunoNome ?? "").trim() || "Um aluno";
  const n =
    typeof params.mensagensNovas === "number" && Number.isFinite(params.mensagensNovas)
      ? Math.max(1, Math.floor(params.mensagensNovas))
      : null;

  // Frase do que aconteceu, em texto puro (o HTML escapa `nome` à parte).
  const acao =
    n === null
      ? "abriu um chamado no portal."
      : n === 1
        ? "escreveu no chamado."
        : `mandou ${n} mensagens novas no chamado.`;
  const assuntoEmail =
    n === null
      ? `Novo chamado: ${assuntoSeguro(assunto)}`
      : n === 1
        ? `Nova mensagem no chamado: ${assuntoSeguro(assunto)}`
        : `${n} mensagens novas no chamado: ${assuntoSeguro(assunto)}`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>${esc(nome)}</strong> ${esc(acao)}
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Assunto: <strong>${esc(assuntoSeguro(assunto))}</strong>
    </p>
    ${botao(url, "Abrir o chamado")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      A mensagem fica no portal — este aviso não a reproduz.
    </p>`;

  const texto = [
    `${nome} ${acao}`,
    `Assunto: ${assuntoSeguro(assunto)}`,
    "",
    `Responder em: ${url}`,
    "A mensagem fica no portal — este aviso não a reproduz.",
  ].join("\n");

  return enviar({
    para,
    assunto: assuntoEmail,
    html: layout({
      preheader:
        n === null
          ? "Um aluno abriu um chamado no portal."
          : "Um aluno escreveu num chamado do portal.",
      titulo: n === null ? "Novo chamado no portal" : "Mensagem nova no chamado",
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
