import "server-only";

/**
 * Envio de e-mails transacionais do programa via Resend (HTTP, sem SDK).
 *
 * Config por ambiente:
 * - RESEND_API_KEY  — segredo (painel da Hostinger em prod; .env.local em dev).
 * - EMAIL_FROM      — remetente. O domínio precisa estar VERIFICADO na Resend.
 * - NEXT_PUBLIC_APP_URL — URL do portal (para o botão/link de acesso).
 *
 * Nenhuma função aqui lança: falha de e-mail nunca deve bloquear a criação do
 * acesso. Sempre retornam { ok, erro? }.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM =
  process.env.EMAIL_FROM ||
  "Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://programa.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

const LARANJA = "#EA580C";

/**
 * Quem confirma as reuniões e precisa ser avisado quando um aluno solicita.
 * Vem SÓ do ambiente: este repositório é público, e-mail interno não entra no
 * código. Formato: `EMAIL_EQUIPE=fulano@x.com,ciclano@x.com`.
 */
export function emailsDaEquipe(): string[] {
  return (process.env.EMAIL_EQUIPE || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** true quando ninguém seria avisado — a tela do admin usa isso para alertar. */
export function equipeSemDestinatario(): boolean {
  return emailsDaEquipe().length === 0;
}

export interface ResultadoEmail {
  ok: boolean;
  erro?: string;
}

interface Anexo {
  filename: string;
  /** conteúdo já em base64 */
  content: string;
}

interface EnviarParams {
  para: string | string[];
  assunto: string;
  html: string;
  texto: string;
  anexos?: Anexo[];
}

async function enviar({
  para,
  assunto,
  html,
  texto,
  anexos,
}: EnviarParams): Promise<ResultadoEmail> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    console.warn("[email] RESEND_API_KEY ausente — e-mail não enviado.");
    return { ok: false, erro: "RESEND_API_KEY não configurada." };
  }
  const destinatarios = (Array.isArray(para) ? para : [para]).filter(Boolean);
  if (!destinatarios.length) {
    console.warn("[email] sem destinatário — e-mail não enviado.");
    return { ok: false, erro: "Sem destinatário." };
  }

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: destinatarios,
        subject: assunto,
        html,
        text: texto,
        ...(anexos?.length ? { attachments: anexos } : {}),
      }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      console.error("[email] Resend respondeu", resp.status, detalhe);
      return { ok: false, erro: `Resend ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] Falha ao chamar a Resend:", e);
    return { ok: false, erro: "Falha de rede ao enviar o e-mail." };
  }
}

/** Escapa texto para interpolar com segurança no HTML. */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Casca HTML comum (cabeçalho laranja + rodapé) para todos os e-mails. */
function layout(opts: { preheader: string; titulo: string; corpo: string }): string {
  const { preheader, titulo, corpo } = opts;
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
            <tr>
              <td style="background:${LARANJA};padding:20px 28px;">
                <div style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px;">Programa de Implementação Assistida</div>
                <div style="color:#ffe4d1;font-size:12px;margin-top:2px;">Time Holding Brasil</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1c1917;">${esc(titulo)}</h1>
                ${corpo}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #e7e5e4;background:#fafaf9;">
                <div style="font-size:12px;color:#78716c;line-height:1.5;">
                  Você recebeu este e-mail porque faz parte do Programa de Implementação Assistida do Time Holding Brasil.
                  Se não reconhece este acesso, ignore esta mensagem.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function botao(href: string, rotulo: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
    <tr><td style="border-radius:8px;background:${LARANJA};">
      <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">${esc(rotulo)}</a>
    </td></tr>
  </table>`;
}

/**
 * E-mail de credenciais: enviado quando o admin cria o login do aluno na hora.
 * Contém login (e-mail), senha temporária e o link do portal.
 */
export async function enviarCredenciaisAcesso(params: {
  para: string;
  nome?: string | null;
  senha: string;
  precisaConfirmar?: boolean;
}): Promise<ResultadoEmail> {
  const { para, nome, senha, precisaConfirmar } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const loginUrl = `${APP_URL}/login`;

  const avisoConfirmar = precisaConfirmar
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;">
         Antes de entrar, confirme seu e-mail pelo link que a plataforma enviou em uma mensagem separada.
       </p>`
    : "";

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Seu acesso ao <strong>Programa de Implementação Assistida</strong>, o portal onde acompanhamos a implementação da sua primeira holding, já está criado.
      Use as credenciais abaixo para entrar:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e7e5e4;border-radius:8px;">
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#78716c;width:80px;">Login</td>
        <td style="padding:12px 16px;font-size:15px;font-weight:bold;">${esc(para)}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:13px;color:#78716c;border-top:1px solid #f0efee;">Senha</td>
        <td style="padding:12px 16px;font-size:15px;font-weight:bold;font-family:'Courier New',monospace;border-top:1px solid #f0efee;">${esc(senha)}</td>
      </tr>
    </table>
    ${avisoConfirmar}
    ${botao(loginUrl, "Acessar o portal")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      Por segurança, recomendamos trocar a senha após o primeiro acesso.
      Se o botão não funcionar, copie e cole este endereço no navegador:<br />
      <a href="${esc(loginUrl)}" style="color:${LARANJA};">${esc(loginUrl)}</a>
    </p>`;

  const texto = [
    ola,
    "",
    "Seu acesso ao Programa de Implementação Assistida (Time Holding Brasil) já está criado.",
    "",
    `Login: ${para}`,
    `Senha: ${senha}`,
    "",
    precisaConfirmar
      ? "Antes de entrar, confirme seu e-mail pelo link enviado em outra mensagem."
      : "",
    `Acesse: ${loginUrl}`,
    "",
    "Por segurança, troque a senha após o primeiro acesso.",
  ]
    .filter(Boolean)
    .join("\n");

  return enviar({
    para,
    assunto: "Seu acesso ao Programa de Implementação Assistida foi criado",
    html: layout({
      preheader: "Suas credenciais de acesso ao portal do programa.",
      titulo: "Seu acesso ao programa está pronto",
      corpo,
    }),
    texto,
  });
}

/**
 * Instante UTC no formato do iCalendar ("20260812T160000Z").
 * O horário gravado é de Brasília, que é **UTC-3 o ano todo** — o horário de
 * verão acabou em 2019, então somar 3 h fixas está correto e não depende de
 * tabela de fuso. `somaHoras` desloca o fim do evento.
 */
function instanteUtc(data: string, horario: string, somaHoras = 0): string {
  const [y, m, d] = data.split("-").map(Number);
  const hh = Number(horario.slice(0, 2));
  const mm = Number(horario.slice(3, 5));
  const dt = new Date(Date.UTC(y, m - 1, d, hh + 3 + somaHoras, mm));
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapa texto para dentro de um campo iCalendar (RFC 5545). */
function escIcs(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Convite de calendário da reunião. Anexado ao e-mail de confirmação, entra no
 * Google Agenda / Outlook / Apple com um clique — é o "vai para a agenda" sem
 * depender de integração com conta de serviço do Google.
 */
function convite(params: {
  data: string;
  horario: string;
  titulo: string;
  descricao: string;
  local: string;
  uid: string;
}): Anexo {
  const { data, horario, titulo, descricao, local, uid } = params;
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Time Holding Brasil//Programa de Implementacao Assistida//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${instanteUtc(data, horario)}`,
    `DTEND:${instanteUtc(data, horario, DURACAO_H)}`,
    `SUMMARY:${escIcs(titulo)}`,
    `DESCRIPTION:${escIcs(descricao)}`,
    ...(local ? [`LOCATION:${escIcs(local)}`] : []),
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escIcs(titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // O iCalendar exige CRLF entre as linhas — com \n puro alguns clientes ignoram.
  return {
    filename: "reuniao.ics",
    content: Buffer.from(linhas.join("\r\n"), "utf8").toString("base64"),
  };
}

/** Link "Adicionar à Google Agenda" (funciona sem nenhuma integração). */
function linkGoogleAgenda(params: {
  data: string;
  horario: string;
  titulo: string;
  descricao: string;
  local: string;
}): string {
  const { data, horario, titulo, descricao, local } = params;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: titulo,
    dates: `${instanteUtc(data, horario)}/${instanteUtc(data, horario, DURACAO_H)}`,
    details: descricao,
    ...(local ? { location: local } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Duração da reunião de implementação, em horas (espelha DURACAO_REUNIAO_H). */
const DURACAO_H = 2;

/** "2026-08-12" + "16:00:00" → "quarta-feira, 12 de agosto · 16h–18h". */
function quandoPorExtenso(data: string, horario: string): string {
  const [y, m, d] = data.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
  const hh = Number(horario.slice(0, 2));
  return `${dia} · ${String(hh).padStart(2, "0")}h–${String(hh + 2).padStart(2, "0")}h`;
}

/**
 * Reunião confirmada: a equipe garantiu presença no horário que o aluno pediu.
 * Disparado por `confirmarReuniao`.
 */
export async function enviarReuniaoConfirmada(params: {
  para: string;
  nome?: string | null;
  data: string;
  horario: string;
  linkLive?: string | null;
  cliente?: string | null;
}): Promise<ResultadoEmail> {
  const { para, nome, data, horario, linkLive, cliente } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const quando = quandoPorExtenso(data, horario);
  const titulo = `Reunião de implementação${cliente ? ` — ${cliente}` : ""} · Time Holding Brasil`;
  const descricao = `Reunião de implementação com a equipe do Time Holding Brasil.${cliente ? `\nCliente: ${cliente}` : ""}${linkLive ? `\nSala: ${linkLive}` : ""}`;
  const agenda = linkGoogleAgenda({
    data,
    horario,
    titulo,
    descricao,
    local: linkLive || "",
  });

  const blocoLink = linkLive
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
         Sala da reunião: <a href="${esc(linkLive)}" style="color:${LARANJA};">${esc(linkLive)}</a>
       </p>`
    : `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;">
         Falta o link da sala. Entre no portal e informe o link antes da reunião.
       </p>`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      A equipe <strong>confirmou presença</strong> na sua reunião de implementação:
    </p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:bold;line-height:1.5;text-transform:capitalize;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
      ${esc(quando)}
    </p>
    ${blocoLink}
    ${botao(agenda, "Adicionar à Google Agenda")}
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#78716c;">
      O convite também vai anexo (<strong>reuniao.ics</strong>) — abrindo o anexo,
      o compromisso entra no Outlook, Apple Calendar ou Google Agenda.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      Se precisar remarcar, faça pelo portal (<a href="${esc(APP_URL)}/" style="color:${LARANJA};">acessar</a>)
      — a equipe recebe a nova solicitação e confirma de novo.
    </p>`;

  const texto = [
    ola,
    "",
    "A equipe confirmou presença na sua reunião de implementação.",
    quando,
    linkLive ? `Sala: ${linkLive}` : "Falta informar o link da sala no portal.",
    "",
    `Adicionar à agenda: ${agenda}`,
    `Portal: ${APP_URL}/`,
  ].join("\n");

  return enviar({
    para,
    assunto: "Sua reunião com a equipe foi confirmada",
    html: layout({
      preheader: `Reunião confirmada: ${quando}.`,
      titulo: "Reunião confirmada",
      corpo,
    }),
    texto,
    anexos: [
      convite({
        data,
        horario,
        titulo,
        descricao,
        local: linkLive || "",
        uid: `gps-${data}-${horario.slice(0, 5).replace(":", "")}@programa.timeholdingbrasil.com.br`,
      }),
    ],
  });
}

/**
 * **Aviso para a equipe de que um aluno SOLICITOU** — o elo que faltava.
 * Sem isto, a única forma de saber de uma solicitação era entrar no painel,
 * e foi exatamente essa a falha relatada em 05/08/2026: aluno marcou, viu
 * "confirmado" e apareceu na reunião sem ninguém da equipe saber.
 */
export async function enviarSolicitacaoParaEquipe(params: {
  aluno: string;
  alunoEmail?: string | null;
  alunoTelefone?: string | null;
  data: string;
  horario: string;
  pauta?: string | null;
  cliente?: string | null;
  linkLive?: string | null;
  remarcacao?: boolean;
}): Promise<ResultadoEmail> {
  const para = emailsDaEquipe();
  if (!para.length) {
    console.warn("[email] EMAIL_EQUIPE ausente — equipe NÃO foi avisada da solicitação.");
    return { ok: false, erro: "EMAIL_EQUIPE não configurada." };
  }
  const { aluno, alunoEmail, alunoTelefone, data, horario, pauta, cliente, linkLive, remarcacao } =
    params;
  const quando = quandoPorExtenso(data, horario);
  const painel = `${APP_URL}/admin/reunioes`;

  const linha = (rotulo: string, valor: string) =>
    `<tr>
       <td style="padding:10px 14px;font-size:13px;color:#78716c;white-space:nowrap;vertical-align:top;border-top:1px solid #f0efee;">${esc(rotulo)}</td>
       <td style="padding:10px 14px;font-size:14px;vertical-align:top;border-top:1px solid #f0efee;">${valor}</td>
     </tr>`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      <strong>${esc(aluno)}</strong> ${remarcacao ? "trocou o horário da reunião" : "pediu uma reunião de implementação"}.
      A reunião <strong>ainda não vale</strong> — ela só é marcada quando alguém da equipe confirmar.
    </p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:bold;line-height:1.5;text-transform:capitalize;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;">
      ${esc(quando)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e7e5e4;border-radius:8px;">
      ${linha("Aluno", esc(aluno))}
      ${alunoEmail ? linha("E-mail", `<a href="mailto:${esc(alunoEmail)}" style="color:${LARANJA};">${esc(alunoEmail)}</a>`) : ""}
      ${alunoTelefone ? linha("Telefone", esc(alunoTelefone)) : ""}
      ${linha("Cliente", cliente ? esc(cliente) : "<span style='color:#a8a29e'>sem favorito ainda</span>")}
      ${linha("O que ele precisa resolver", pauta ? esc(pauta) : "<span style='color:#a8a29e'>não descrito</span>")}
      ${linkLive ? linha("Sala do aluno", `<a href="${esc(linkLive)}" style="color:${LARANJA};">${esc(linkLive)}</a>`) : ""}
    </table>
    ${botao(painel, "Confirmar ou recusar")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      Enquanto ninguém responder, o horário fica reservado para este aluno e
      indisponível para os demais.
    </p>`;

  const texto = [
    `${aluno} ${remarcacao ? "trocou o horário da" : "pediu uma"} reunião de implementação.`,
    `A reunião AINDA NÃO VALE — só é marcada quando a equipe confirmar.`,
    "",
    quando,
    alunoEmail ? `E-mail: ${alunoEmail}` : "",
    alunoTelefone ? `Telefone: ${alunoTelefone}` : "",
    `Cliente: ${cliente || "sem favorito ainda"}`,
    `Pauta: ${pauta || "não descrita"}`,
    linkLive ? `Sala: ${linkLive}` : "",
    "",
    `Confirmar ou recusar: ${painel}`,
  ]
    .filter(Boolean)
    .join("\n");

  return enviar({
    para,
    assunto: `[Reunião] ${aluno} pediu ${quandoCurto(data, horario)}`,
    html: layout({
      preheader: `${aluno} aguarda confirmação para ${quando}.`,
      titulo: remarcacao ? "Aluno trocou o horário" : "Nova solicitação de reunião",
      corpo,
    }),
    texto,
  });
}

/**
 * Cópia da confirmação para quem confirma — com o convite de calendário, para
 * o compromisso entrar na agenda da equipe também.
 */
export async function enviarConfirmacaoParaEquipe(params: {
  aluno: string;
  confirmadoPor?: string | null;
  data: string;
  horario: string;
  linkLive?: string | null;
  cliente?: string | null;
  pauta?: string | null;
}): Promise<ResultadoEmail> {
  const para = emailsDaEquipe();
  if (!para.length) return { ok: false, erro: "EMAIL_EQUIPE não configurada." };
  const { aluno, confirmadoPor, data, horario, linkLive, cliente, pauta } = params;
  const quando = quandoPorExtenso(data, horario);
  const titulo = `Reunião de implementação — ${aluno}${cliente ? ` (${cliente})` : ""}`;
  const descricao = `Aluno: ${aluno}${cliente ? `\nCliente: ${cliente}` : ""}${pauta ? `\nPauta: ${pauta}` : ""}${linkLive ? `\nSala: ${linkLive}` : ""}`;
  const agenda = linkGoogleAgenda({ data, horario, titulo, descricao, local: linkLive || "" });

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Reunião com <strong>${esc(aluno)}</strong> confirmada${confirmadoPor ? ` por ${esc(confirmadoPor)}` : ""}.
      O aluno já foi avisado.
    </p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:bold;line-height:1.5;text-transform:capitalize;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;">
      ${esc(quando)}
    </p>
    ${cliente ? `<p style="margin:0 0 8px;font-size:14px;">Cliente: <strong>${esc(cliente)}</strong></p>` : ""}
    ${pauta ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Pauta: ${esc(pauta)}</p>` : ""}
    ${linkLive ? `<p style="margin:0 0 16px;font-size:14px;">Sala: <a href="${esc(linkLive)}" style="color:${LARANJA};">${esc(linkLive)}</a></p>` : ""}
    ${botao(agenda, "Adicionar à Google Agenda")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      O convite vai anexo (<strong>reuniao.ics</strong>) para entrar direto na agenda.
    </p>`;

  const texto = [
    `Reunião com ${aluno} confirmada${confirmadoPor ? ` por ${confirmadoPor}` : ""}.`,
    quando,
    cliente ? `Cliente: ${cliente}` : "",
    pauta ? `Pauta: ${pauta}` : "",
    linkLive ? `Sala: ${linkLive}` : "",
    "",
    `Adicionar à agenda: ${agenda}`,
  ]
    .filter(Boolean)
    .join("\n");

  return enviar({
    para,
    assunto: `[Reunião confirmada] ${aluno} — ${quandoCurto(data, horario)}`,
    html: layout({
      preheader: `Confirmada com ${aluno}: ${quando}.`,
      titulo: "Reunião confirmada",
      corpo,
    }),
    texto,
    anexos: [
      convite({
        data,
        horario,
        titulo,
        descricao,
        local: linkLive || "",
        uid: `gps-equipe-${data}-${horario.slice(0, 5).replace(":", "")}@programa.timeholdingbrasil.com.br`,
      }),
    ],
  });
}

/** "12/08 às 13h" — para assunto de e-mail. */
function quandoCurto(data: string, horario: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m} às ${horario.slice(0, 2)}h`;
}

/**
 * Reunião recusada: a equipe não consegue participar naquele horário e o aluno
 * precisa escolher outro. Disparado por `recusarReuniao`.
 */
export async function enviarReuniaoRecusada(params: {
  para: string;
  nome?: string | null;
  data: string;
  horario: string;
  motivo?: string | null;
}): Promise<ResultadoEmail> {
  const { para, nome, data, horario, motivo } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const quando = quandoPorExtenso(data, horario);

  const blocoMotivo = motivo
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:12px 14px;">
         <strong>Motivo:</strong> ${esc(motivo)}
       </p>`
    : "";

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      A equipe <strong>não vai conseguir participar</strong> no horário que você pediu:
    </p>
    <p style="margin:0 0 16px;font-size:16px;font-weight:bold;line-height:1.5;text-transform:capitalize;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;">
      ${esc(quando)}
    </p>
    ${blocoMotivo}
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Sua reunião <strong>não está marcada</strong>. Entre no portal e escolha outro
      horário — a equipe confirma o novo pedido.
    </p>
    ${botao(`${APP_URL}/`, "Escolher outro horário")}`;

  const texto = [
    ola,
    "",
    `A equipe não vai conseguir participar em ${quando}.`,
    motivo ? `Motivo: ${motivo}` : "",
    "",
    "Sua reunião NÃO está marcada. Escolha outro horário no portal:",
    `${APP_URL}/`,
  ]
    .filter(Boolean)
    .join("\n");

  return enviar({
    para,
    assunto: "Precisamos remarcar sua reunião com a equipe",
    html: layout({
      preheader: "A equipe não pode neste horário — escolha outro.",
      titulo: "Vamos remarcar sua reunião",
      corpo,
    }),
    texto,
  });
}

/**
 * E-mail de acesso liberado: enviado quando o admin aprova uma solicitação.
 * O aluno já definiu a própria senha no cadastro — aqui é só o "pode entrar".
 */
export async function enviarAcessoLiberado(params: {
  para: string;
  nome?: string | null;
}): Promise<ResultadoEmail> {
  const { para, nome } = params;
  const primeiroNome = (nome?.trim().split(/\s+/)[0] || "").trim();
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const loginUrl = `${APP_URL}/login`;

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${esc(ola)}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      Boa notícia: seu acesso ao <strong>Programa de Implementação Assistida</strong> foi liberado. Já pode entrar com o e-mail e a senha
      que você cadastrou e começar a <strong>Etapa 01 — Estrutura e contato com a base de clientes</strong>.
    </p>
    ${botao(loginUrl, "Entrar no portal")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      Se o botão não funcionar, copie e cole este endereço no navegador:<br />
      <a href="${esc(loginUrl)}" style="color:${LARANJA};">${esc(loginUrl)}</a>
    </p>`;

  const texto = [
    ola,
    "",
    "Seu acesso ao Programa de Implementação Assistida (Time Holding Brasil) foi liberado.",
    "Entre com o e-mail e a senha que você cadastrou.",
    "",
    `Acesse: ${loginUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: "Seu acesso ao Programa de Implementação Assistida foi liberado",
    html: layout({
      preheader: "Seu acesso ao portal do programa foi liberado.",
      titulo: "Seu acesso foi liberado",
      corpo,
    }),
    texto,
  });
}
