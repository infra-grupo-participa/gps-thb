import "server-only";

/**
 * Plantão de Dúvidas — Acelera Holding. E-mails transacionais.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Reaproveita a infra de `src/lib/email.ts` (`enviar`, `esc`, `layout`,
 * `botao`) — NÃO reescreve envio, layout nem remetente. Nenhuma função aqui
 * lança: falha de e-mail nunca bloqueia a inscrição nem o registro de NPS.
 */

import { enviar, esc, layout, botao, type ResultadoEmail } from "@/lib/email";
import { horaCurta } from "@/lib/plantao";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://programa.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

/** "2026-09-15" → "terça-feira, 15 de setembro de 2026" (fuso fixo em UTC — data-only). */
function dataLongaBrasilia(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Pede a avaliação (NPS) depois que o plantão termina. */
export async function enviarPlantaoNps(params: {
  para: string;
  nome?: string | null;
  mentoraNome: string;
}): Promise<ResultadoEmail> {
  const { para, nome, mentoraNome } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const portalUrl = `${APP_URL}/p/plantao`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Como foi o seu plantão de dúvidas com <strong>${esc(mentoraNome)}</strong>?
      Sua avaliação ajuda a melhorar os próximos encontros.
    </p>
    ${botao(portalUrl, "Avaliar o plantão")}`;

  const texto = [
    ola,
    "",
    `Como foi o seu plantão de dúvidas com ${mentoraNome}? Sua avaliação ajuda a melhorar os próximos encontros.`,
    `Avalie em: ${portalUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: "Como foi o seu plantão de dúvidas?",
    html: layout({
      preheader: "Conte pra gente como foi o seu plantão.",
      titulo: "Sua opinião sobre o plantão",
      corpo,
    }),
    texto,
  });
}

/**
 * Avisa o INSCRITO de que o plantão dele foi cancelado pela equipe.
 *
 * 🔑 É o e-mail que justifica `cancelado_em` existir como coluna em vez de o
 * slot simplesmente ser apagado: sem os dados do plantão preservados não há
 * de onde tirar data, hora e mentora para escrever esta mensagem.
 *
 * ⚠️ `motivo` é TEXTO LIVRE digitado no painel e vai para dezenas de caixas
 * de entrada. Passa por `esc()` na versão HTML como todo o resto — sem isso,
 * um motivo com `<a href>` viraria link clicável em nome do Time Holding
 * Brasil. O teto de 300 caracteres é do CHECK no banco.
 *
 * A inscrição JÁ foi cancelada quando este e-mail sai, então o CTA leva ao
 * calendário público para a pessoa escolher outro dia — nunca para uma tela
 * que ainda mostraria a inscrição morta.
 *
 * Não lança: falha de envio nunca desfaz o cancelamento (ver `cancelarSlot`).
 */
export async function enviarPlantaoCancelamento(params: {
  para: string;
  nome?: string | null;
  data: string;
  horaInicio: string;
  mentoraNome: string;
  motivo?: string | null;
}): Promise<ResultadoEmail> {
  const { para, nome, data, horaInicio, mentoraNome, motivo } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const dataLonga = dataLongaBrasilia(data);
  const hora = horaCurta(horaInicio);
  const motivoLimpo = motivo?.trim() || null;
  const portalUrl = `${APP_URL}/p/plantao`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      O plantão de dúvidas de <strong>${esc(dataLonga)}</strong>, às
      <strong>${esc(hora)}</strong>, com <strong>${esc(mentoraNome)}</strong>,
      <strong>foi cancelado</strong>. Sua inscrição foi encerrada e você não
      precisa fazer nada.
    </p>
    ${
      motivoLimpo
        ? `<p style="margin:0 0 16px;padding:12px 16px;background:#faf9f8;border-left:3px solid #F97316;font-size:15px;line-height:1.6;">
      ${esc(motivoLimpo)}
    </p>`
        : ""
    }
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Você já pode escolher outro dia no calendário — as demais datas seguem
      abertas.
    </p>
    ${botao(portalUrl, "Escolher outro dia")}`;

  const texto = [
    ola,
    "",
    `O plantão de dúvidas de ${dataLonga}, às ${hora}, com ${mentoraNome}, foi cancelado. Sua inscrição foi encerrada e você não precisa fazer nada.`,
    ...(motivoLimpo ? ["", motivoLimpo] : []),
    "",
    "Você já pode escolher outro dia no calendário — as demais datas seguem abertas.",
    `Calendário: ${portalUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: `Plantão cancelado — ${hora} com ${mentoraNome}`,
    html: layout({
      preheader: `O plantão de ${hora} com ${mentoraNome} foi cancelado. Escolha outro dia.`,
      titulo: "Seu plantão foi cancelado",
      corpo,
    }),
    texto,
  });
}

/**
 * Aviso à MENTORA na véspera do plantão: quem vai participar, que horas,
 * quantas pessoas.
 *
 * Diferente dos e-mails ao aluno, este LISTA NOMES — a mentora precisa saber
 * quem vai atender. É o único ponto do módulo onde nome de participante sai
 * por e-mail, e por isso o destinatário é sempre o endereço cadastrado em
 * `gps.plantao_mentoras.email` (nunca um endereço vindo de input).
 *
 * NÃO manda link do Zoom: a decisão do Marcio (08/09/2026) foi validar o
 * agendamento primeiro; quando o link existir, ele entra aqui.
 */
export async function enviarPlantaoAvisoMentora(params: {
  para: string;
  mentoraNome: string;
  data: string;
  horaInicio: string;
  participantes: { nome: string | null; email: string }[];
}): Promise<ResultadoEmail> {
  const { para, mentoraNome, data, horaInicio, participantes } = params;
  const primeiroNome = mentoraNome.trim().split(/\s+/)[0] || mentoraNome;
  const qtd = participantes.length;
  const dataLonga = dataLongaBrasilia(data);
  const hora = horaCurta(horaInicio);
  const painelUrl = `${APP_URL}/admin/plantao`;

  const linhas = participantes
    .map(
      (p) => `
      <tr>
        <td style="padding:8px 16px;font-size:14px;border-top:1px solid #f0efee;">
          ${esc(p.nome?.trim() || "(sem nome no cadastro)")}
        </td>
        <td style="padding:8px 16px;font-size:14px;color:#6b6560;border-top:1px solid #f0efee;">
          ${esc(p.email)}
        </td>
      </tr>`,
    )
    .join("");

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Olá, ${esc(primeiroNome)}!</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Amanhã é o seu plantão de dúvidas: <strong>${esc(dataLonga)}</strong>,
      às <strong>${esc(hora)}</strong>.
      ${
        qtd === 1
          ? "Há <strong>1 pessoa</strong> inscrita."
          : `Há <strong>${qtd} pessoas</strong> inscritas.`
      }
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
           style="border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <th align="left" style="padding:8px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b6560;">Nome</th>
        <th align="left" style="padding:8px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b6560;">E-mail</th>
      </tr>
      ${linhas}
    </table>
    ${botao(painelUrl, "Abrir o painel do plantão")}`;

  const texto = [
    `Olá, ${primeiroNome}!`,
    "",
    `Amanhã é o seu plantão de dúvidas: ${dataLonga}, às ${hora}.`,
    qtd === 1 ? "Há 1 pessoa inscrita." : `Há ${qtd} pessoas inscritas.`,
    "",
    ...participantes.map(
      (p) => `- ${p.nome?.trim() || "(sem nome)"} — ${p.email}`,
    ),
    "",
    `Painel: ${painelUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: `Amanhã, ${hora}: seu plantão com ${qtd} ${qtd === 1 ? "inscrito" : "inscritos"}`,
    html: layout({
      preheader: `${qtd} ${qtd === 1 ? "pessoa inscrita" : "pessoas inscritas"} no seu plantão de amanhã.`,
      titulo: "Seu plantão é amanhã",
      corpo,
    }),
    texto,
  });
}

/**
 * E-mail com o LINK DA SALA, enviado 1 hora antes do início.
 *
 * 🔑 Substitui o envio no ato da inscrição (decisão do Marcio, 08/09/2026).
 * Antes, o aluno recebia a confirmação no momento em que se inscrevia e
 * nunca recebia o link — tinha de voltar ao portal na hora. Agora é o
 * contrário: nada no ato, e 1h antes chega o e-mail já com a sala.
 *
 * A partir desse envio o cancelamento TRAVA (`plantao_cancelar`): a vaga
 * está consumida porque o link já saiu.
 *
 * ⚠️ Só é disparado quando o slot TEM `zoom_url` — a RPC
 * `plantao_email_sala_pendente` filtra isso. Sem sala não há o que entregar,
 * e o aluno não perde o direito de cancelar por falha da equipe.
 *
 * ⚠️ `zoomUrl` vira `href`. A validação de `https://` acontece na escrita
 * (`validarZoomUrl` em `src/app/admin/plantao/actions.ts`), mas repetimos a
 * checagem aqui: um valor `javascript:` que escapasse viraria link clicável
 * no cliente de e-mail. Sem `https://`, manda-se o e-mail sem o botão.
 */
export async function enviarPlantaoSala(params: {
  para: string;
  nome?: string | null;
  data: string;
  horaInicio: string;
  mentoraNome: string;
  zoomUrl: string;
}): Promise<ResultadoEmail> {
  const { para, nome, data, horaInicio, mentoraNome, zoomUrl } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const dataLonga = dataLongaBrasilia(data);
  const hora = horaCurta(horaInicio);
  const linkSeguro = /^https:\/\//i.test(zoomUrl.trim()) ? zoomUrl.trim() : null;
  const portalUrl = `${APP_URL}/p/plantao`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Seu plantão de dúvidas começa em <strong>1 hora</strong>:
      <strong>${esc(dataLonga)}</strong>, às <strong>${esc(hora)}</strong>,
      com <strong>${esc(mentoraNome)}</strong>.
    </p>
    ${
      linkSeguro
        ? `${botao(linkSeguro, "Entrar na sala")}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b6560;">
      Se o botão não funcionar, copie este endereço:<br>
      <span style="word-break:break-all;">${esc(linkSeguro)}</span>
    </p>`
        : `${botao(portalUrl, "Abrir o plantão")}`
    }`;

  const texto = [
    ola,
    "",
    `Seu plantão de dúvidas começa em 1 hora: ${dataLonga}, às ${hora}, com ${mentoraNome}.`,
    linkSeguro ? `Sala: ${linkSeguro}` : `Acesse: ${portalUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: `Seu plantão começa em 1 hora — ${hora} com ${mentoraNome}`,
    html: layout({
      preheader: `Seu plantão com ${mentoraNome} começa em 1 hora.`,
      titulo: "Seu plantão é daqui a pouco",
      corpo,
    }),
    texto,
  });
}
