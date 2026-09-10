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
 *
 * 🔑 Falha vai para `logErro`/`logAviso` (`src/lib/log.ts`), nunca `console.*`
 * avulso: uma linha JSON por evento é o que permite contar quantos e-mails a
 * Resend recusou na Hostinger, e o helper redige e-mail e CPF do texto do erro
 * antes de emitir — o corpo de erro da Resend cita o destinatário.
 */

import { logAviso, logErro } from "@/lib/log";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM =
  process.env.EMAIL_FROM ||
  "Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>";

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://programa.timeholdingbrasil.com.br"
).replace(/\/+$/, "");

// #C74600 é o `--color-marca-acao` do portal: branco sobre ele dá 4,88:1
// (WCAG AA). O #EA580C antigo dava 3,56:1 — reprovado como texto de botão
// (Auditor G, war-room 10/09).
const LARANJA = "#C74600";
/** Laranja da marca Acelera Holding (migração …173) — só nos e-mails do Plantão. */
export const LARANJA_ACELERA = "#ED6D05";
export type MarcaEmail = "thb" | "acelera";

export interface ResultadoEmail {
  ok: boolean;
  erro?: string;
}

interface EnviarParams {
  para: string | string[];
  assunto: string;
  html: string;
  texto: string;
  /** Remetente alternativo (só o NOME muda — o endereço é sempre o do domínio verificado). */
  de?: string;
}

/**
 * Mesmo endereço do `FROM` (o único domínio verificado na Resend), com outro
 * nome de exibição — "Acelera Holding <acesso@programa.…>". Trocar o DOMÍNIO
 * sem verificá-lo na Resend derrubaria todo o envio (migração …173).
 */
export function remetente(nome: string): string {
  const m = FROM.match(/<([^>]+)>/);
  const endereco = m ? m[1] : FROM;
  return `${nome} <${endereco}>`;
}

export async function enviar({
  para,
  assunto,
  html,
  texto,
  de,
}: EnviarParams): Promise<ResultadoEmail> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    logAviso("email.enviar", "RESEND_API_KEY ausente", { enviado: false });
    return { ok: false, erro: "RESEND_API_KEY não configurada." };
  }
  const destinatarios = (Array.isArray(para) ? para : [para]).filter(Boolean);
  if (!destinatarios.length) {
    logAviso("email.enviar", "sem destinatário", { enviado: false });
    return { ok: false, erro: "Sem destinatário." };
  }

  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      // Resend lenta não pode segurar uma Server Action: cancelarSlot chama
      // isto em loop (até 500 inscritos). 10 s por envio; estouro vira falha
      // contada, nunca ação pendurada (pentest de 08/09).
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: de ?? FROM,
        to: destinatarios,
        subject: assunto,
        html,
        text: texto,
      }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      // `logErro` redige e-mail e sequências longas de dígitos do texto antes
      // de emitir — o corpo de erro da Resend cita o destinatário.
      logErro("email.enviar", { code: `resend_${resp.status}`, message: detalhe }, {
        status: resp.status,
        destinatarios: destinatarios.length,
      });
      return { ok: false, erro: `Resend ${resp.status}` };
    }
    return { ok: true };
  } catch (e) {
    logErro("email.enviar", e, { destinatarios: destinatarios.length });
    return { ok: false, erro: "Falha de rede ao enviar o e-mail." };
  }
}

/** Escapa texto para interpolar com segurança no HTML. */
export function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Casca HTML comum (cabeçalho + rodapé) para todos os e-mails.
 *
 * `marca: "acelera"` = os e-mails do Plantão de Dúvidas, que é produto do
 * **Acelera Holding** (decisão do Marcio, 09/09 — migração …173 já fazia isso
 * no e-mail que sai do banco; o caminho TypeScript ficou com a marca do THB
 * até o Auditor G pegar em 10/09). Cabeçalho ESCURO porque a logo do Acelera
 * é branco→prata e some sobre branco e sobre laranja; PNG porque Gmail e
 * Outlook não renderizam SVG.
 */
export function layout(opts: {
  preheader: string;
  titulo: string;
  corpo: string;
  marca?: MarcaEmail;
}): string {
  const { preheader, titulo, corpo, marca = "thb" } = opts;
  const cabecalho =
    marca === "acelera"
      ? `<td style="background:#180b00;padding:18px 28px;">
                <img src="${APP_URL}/logo-acelera-email.png" width="240" height="auto" alt="Acelera Holding" style="display:block;max-width:240px;height:auto;border:0;">
                <div style="color:#d6d3d1;font-size:12px;margin-top:8px;">Plantão de Dúvidas</div>
              </td>`
      : `<td style="background:${LARANJA};padding:20px 28px;">
                <div style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px;">Programa de Implementação Assistida</div>
                <div style="color:#ffe4d1;font-size:12px;margin-top:2px;">Time Holding Brasil</div>
              </td>`;
  const rodape =
    marca === "acelera"
      ? "Você recebeu este e-mail porque se inscreveu no plantão de dúvidas, exclusivo de quem faz parte do Acelera Holding."
      : "Você recebeu este e-mail porque faz parte do Programa de Implementação Assistida do Time Holding Brasil.";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
            <tr>
              ${cabecalho}
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
                  ${rodape}
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

export function botao(href: string, rotulo: string, cor: string = LARANJA): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
    <tr><td style="border-radius:8px;background:${cor};">
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
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
      Na primeira entrada o portal vai pedir que você crie a sua própria senha.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
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
    "Na primeira entrada o portal vai pedir que você crie a sua própria senha.",
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
