import "server-only";

/**
 * Envio de e-mails transacionais do GPS via Resend (HTTP, sem SDK).
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
  "GPS — Time Holding Brasil <acesso@gps.timeholdingbrasil.com.br>";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://gps.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

const LARANJA = "#EA580C";

export interface ResultadoEmail {
  ok: boolean;
  erro?: string;
}

interface EnviarParams {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

async function enviar({
  para,
  assunto,
  html,
  texto,
}: EnviarParams): Promise<ResultadoEmail> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    console.warn("[email] RESEND_API_KEY ausente — e-mail não enviado.");
    return { ok: false, erro: "RESEND_API_KEY não configurada." };
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
        to: [para],
        subject: assunto,
        html,
        text: texto,
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
                <div style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px;">GPS — Programa de Implementação Assistida</div>
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
      Seu acesso ao <strong>GPS</strong>, o portal onde acompanhamos a implementação da sua primeira holding, já está criado.
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
    ${botao(loginUrl, "Acessar o GPS")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      Por segurança, recomendamos trocar a senha após o primeiro acesso.
      Se o botão não funcionar, copie e cole este endereço no navegador:<br />
      <a href="${esc(loginUrl)}" style="color:${LARANJA};">${esc(loginUrl)}</a>
    </p>`;

  const texto = [
    ola,
    "",
    "Seu acesso ao GPS (Time Holding Brasil) já está criado.",
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
    assunto: "Seu acesso ao GPS foi criado",
    html: layout({
      preheader: "Suas credenciais de acesso ao portal GPS.",
      titulo: "Seu acesso ao GPS está pronto",
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
      Boa notícia: seu acesso ao <strong>GPS</strong> foi liberado. Já pode entrar com o e-mail e a senha
      que você cadastrou e começar a <strong>Etapa 01 — Estrutura e contato com a base de clientes</strong>.
    </p>
    ${botao(loginUrl, "Entrar no GPS")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      Se o botão não funcionar, copie e cole este endereço no navegador:<br />
      <a href="${esc(loginUrl)}" style="color:${LARANJA};">${esc(loginUrl)}</a>
    </p>`;

  const texto = [
    ola,
    "",
    "Seu acesso ao GPS (Time Holding Brasil) foi liberado.",
    "Entre com o e-mail e a senha que você cadastrou.",
    "",
    `Acesse: ${loginUrl}`,
  ].join("\n");

  return enviar({
    para,
    assunto: "Seu acesso ao GPS foi liberado",
    html: layout({
      preheader: "Seu acesso ao portal GPS foi liberado.",
      titulo: "Seu acesso foi liberado",
      corpo,
    }),
    texto,
  });
}
