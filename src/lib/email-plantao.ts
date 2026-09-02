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

/**
 * Confirmação de inscrição no plantão. NÃO manda o link do Zoom — o link só
 * é revelado dentro da janela (1h antes a 1h depois do início) e revelar
 * registra presença; mandar por e-mail antes da hora quebraria essa regra.
 */
export async function enviarPlantaoConfirmado(params: {
  para: string;
  nome?: string | null;
  data: string;
  horaInicio: string;
  mentoraNome: string;
}): Promise<ResultadoEmail> {
  const { para, nome, data, horaInicio, mentoraNome } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const portalUrl = `${APP_URL}/p/plantao`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Sua vaga no <strong>Plantão de Dúvidas</strong> está confirmada:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e7e5e4;border-radius:8px;">
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#78716c;width:90px;">Data</td>
        <td style="padding:12px 16px;font-size:15px;font-weight:bold;">${esc(dataLongaBrasilia(data))}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#78716c;border-top:1px solid #f0efee;">Horário</td>
        <td style="padding:12px 16px;font-size:15px;font-weight:bold;border-top:1px solid #f0efee;">${esc(horaCurta(horaInicio))} (Brasília)</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#78716c;border-top:1px solid #f0efee;">Mentora</td>
        <td style="padding:12px 16px;font-size:15px;font-weight:bold;border-top:1px solid #f0efee;">${esc(mentoraNome)}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#57534e;">
      O link do Zoom fica disponível no portal a partir de <strong>1 hora antes</strong> do início.
    </p>
    ${botao(portalUrl, "Abrir o plantão")}`;

  const texto = [
    ola,
    "",
    "Sua vaga no Plantão de Dúvidas está confirmada:",
    `Data: ${dataLongaBrasilia(data)}`,
    `Horário: ${horaCurta(horaInicio)} (Brasília)`,
    `Mentora: ${mentoraNome}`,
    "",
    "O link do Zoom fica disponível no portal a partir de 1 hora antes do início.",
    `Acesse: ${portalUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: "Sua vaga no Plantão de Dúvidas está confirmada",
    html: layout({
      preheader: "Confirmação da sua vaga no Plantão de Dúvidas.",
      titulo: "Vaga confirmada",
      corpo,
    }),
    texto,
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
