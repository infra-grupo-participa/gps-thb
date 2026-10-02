import "server-only";
import { UUID_RE } from "@/lib/texto";
import { APP_URL, enviar, esc, layout, botao, type ResultadoEmail } from "@/lib/email";

/**
 * Minutas da ficha do cliente — aviso ao parceiro quando a equipe REVISA uma
 * versão (migração `…341`, decisão do João 02/10/2026, card 86akryphf).
 *
 * Molde de `src/lib/email-chamados.ts`: reaproveita `enviar`/`esc`/`layout`/
 * `botao` e NUNCA lança — falha de e-mail não desfaz o parecer.
 *
 * 🔑 O PARECER NÃO VAI NO E-MAIL. Só o nome do cliente (pedido do card) e o
 * botão para a ficha. Mesmo motivo dos chamados: e-mail é canal menos
 * controlado (caixa compartilhada, backup, encaminhamento) e o parecer fala do
 * caso do cliente do parceiro.
 */

/** Link só com id no formato de UUID — nunca interpolar id cru numa URL. */
function linkDaFicha(clienteId: string): string {
  return UUID_RE.test(clienteId)
    ? `${APP_URL}/clientes/${clienteId}`
    : `${APP_URL}/clientes`;
}

/** Nome do cliente no ASSUNTO: sem CR/LF (injeção de cabeçalho) e cortado. */
function nomeSeguro(v: string | null | undefined): string {
  const limpo = (v ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!limpo) return "seu cliente";
  return limpo.length > 80 ? `${limpo.slice(0, 77)}...` : limpo;
}

export async function enviarMinutaRevisadaParaParceiro(params: {
  para: string;
  clienteNome: string | null;
  clienteId: string;
}): Promise<ResultadoEmail> {
  const { para, clienteId } = params;
  if (!para) return { ok: false, erro: "Sem destinatário." };

  const url = linkDaFicha(clienteId);
  const nome = nomeSeguro(params.clienteNome);

  const corpo = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
      A equipe revisou a minuta de <strong>${esc(nome)}</strong>.
    </p>
    ${botao(url, "Ver o parecer na ficha")}
    <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
      O parecer está no portal, na ficha do cliente — por segurança, ele não vai por e-mail.
    </p>`;

  const texto = [
    `A equipe revisou a minuta de ${nome}.`,
    "",
    `Ver o parecer em: ${url}`,
    "O parecer está no portal, na ficha do cliente — por segurança, ele não vai por e-mail.",
  ].join("\n");

  return enviar({
    para,
    assunto: `A equipe revisou a minuta de ${nome}`,
    html: layout({
      preheader: "A equipe revisou a sua minuta no portal.",
      titulo: "Minuta revisada",
      corpo,
    }),
    texto,
  });
}
