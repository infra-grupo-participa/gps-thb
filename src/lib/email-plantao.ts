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

import {
  LARANJA_ACELERA,
  botao,
  enviar,
  esc,
  layout,
  remetente,
  type ResultadoEmail,
} from "@/lib/email";

/** Os e-mails do Plantão saem como Acelera Holding (migração …173), no mesmo endereço verificado. */
const DE_ACELERA = remetente("Acelera Holding");
import { horaCurta } from "@/lib/plantao";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://programa.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

/** "2026-09-15" → "terça-feira, 15 de setembro de 2026" (fuso fixo em UTC — data-only). */
/**
 * "Problema no acesso → monitoria" (decisão do Marcio, 09/09/2026). O e-mail
 * que sai do BANCO (`gps.plantao_disparar_emails_sala`, migração …174) já
 * leva este link; o caminho HTTP precisa dizer o mesmo (paridade cobrada pelo
 * Auditor D no war-room de 10/09).
 */
const MONITORIA_URL = "https://o.aceleraholding.com.br/monitoria";

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
        ? `<p style="margin:0 0 16px;padding:12px 16px;background:#faf9f8;border-left:3px solid #ED6D05;font-size:15px;line-height:1.6;">
      ${esc(motivoLimpo)}
    </p>`
        : ""
    }
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Você já pode escolher outro dia no calendário — as demais datas seguem
      abertas.
    </p>
    ${botao(portalUrl, "Escolher outro dia", LARANJA_ACELERA)}`;

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
    de: DE_ACELERA,
    para,
    assunto: `Plantão cancelado — ${hora} com ${mentoraNome}`,
    html: layout({
      marca: "acelera",
      preheader: `O plantão de ${hora} com ${mentoraNome} foi cancelado. Escolha outro dia.`,
      titulo: "Seu plantão foi cancelado",
      corpo,
    }),
    texto,
  });
}



/**
 * Confirmação no ATO da inscrição.
 *
 * Pedido do Marcio (10/09/2026): *"no ato da inscrição do plantão, receber um
 * e-mail de confirmação"*.
 *
 * 🔴 SEM O LINK DA SALA, de propósito. Revelar o Zoom é o que GRAVA PRESENÇA
 * (`plantao_revelar_link`), e a sala só abre 1 hora antes. Mandar o link aqui
 * furaria a contagem de presença e o controle de janela — a decisão de não
 * expor o Zoom em e-mail é de 09/2026 e continua valendo.
 *
 * O que este e-mail faz é o que faltava: dizer "deu certo, está marcado, é
 * neste dia e nesta hora". Quem se inscrevia não recebia nada até 1 hora
 * antes, e ficava sem saber se a inscrição pegou.
 */
export async function enviarPlantaoConfirmacao(params: {
  para: string;
  nome?: string | null;
  data: string;
  horaInicio: string;
  mentoraNome: string;
  /** `true` quando a inscrição veio da aba logada do Programa. */
  doPrograma?: boolean;
}): Promise<ResultadoEmail> {
  const { para, nome, data, horaInicio, mentoraNome, doPrograma } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const dataLonga = dataLongaBrasilia(data);
  const hora = horaCurta(horaInicio);
  // A aba logada vive em `/plantao`; a pública, em `/p/plantao`. Mandar a
  // pessoa para a porta errada faria o Programa cair na tela que pede e-mail.
  const portalUrl = `${APP_URL}${doPrograma ? "/plantao" : "/p/plantao"}`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Sua inscrição está confirmada:
      <strong>${esc(dataLonga)}</strong>, às <strong>${esc(hora)}</strong>,
      com <strong>${esc(mentoraNome)}</strong>.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>O link da sala chega 1 hora antes</strong>, por e-mail. Não
      precisa fazer mais nada até lá.
    </p>
    ${botao(portalUrl, "Ver minha inscrição", LARANJA_ACELERA)}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b6560;">
      Precisa cancelar? Dá para fazer no portal até 1 hora antes do início.
    </p>
    <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#6b6560;">
      Problemas para entrar? <a href="${MONITORIA_URL}" style="color:#9a3412;font-weight:bold;">Fale com a monitoria</a>.
    </p>`;

  const texto = [
    ola,
    "",
    `Sua inscrição está confirmada: ${dataLonga}, às ${hora}, com ${mentoraNome}.`,
    "O link da sala chega 1 hora antes, por e-mail. Não precisa fazer mais nada até lá.",
    "",
    `Ver minha inscrição: ${portalUrl}`,
    "Precisa cancelar? Dá para fazer no portal até 1 hora antes do início.",
    "",
    `Problemas para entrar? Fale com a monitoria: ${MONITORIA_URL}`,
  ].join("\n");

  return enviar({
    de: DE_ACELERA,
    para,
    assunto: `Inscrição confirmada — ${dataLonga}, ${hora}`,
    html: layout({
      marca: "acelera",
      preheader: `Plantão marcado: ${dataLonga}, às ${hora}, com ${mentoraNome}.`,
      titulo: "Inscrição confirmada",
      corpo,
    }),
    texto,
  });
}
