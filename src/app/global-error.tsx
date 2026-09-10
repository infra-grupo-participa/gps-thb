"use client";

import { ThbLogo } from "@/components/thb-logo";

/**
 * Último anteparo do portal: só entra em cena quando o próprio root layout
 * falha. Por isso ele substitui o layout inteiro e precisa emitir o `<html>` e
 * o `<body>` por conta própria.
 *
 * Duas consequências que ditam o formato deste arquivo:
 *
 * 1. **Sem `next/font`.** As fontes Inter/Space Grotesk são carregadas pelo
 *    root layout, que aqui não rodou — as variáveis `--font-sans`/`--font-display`
 *    não existem. Usar a pilha do sistema é o único jeito de a tela sair
 *    legível em vez de cair no Times New Roman do navegador.
 * 2. **Sem Tailwind e sem token de `globals.css`.** A folha global é importada
 *    pelo layout que quebrou; contar com ela seria apostar que a tela de erro
 *    depende do caminho que já falhou. O CSS vive aqui dentro, com os valores
 *    literais da paleta do Grupo Participa (laranja do logo + neutros) copiados
 *    de `globals.css`. Se a paleta mudar lá, mude aqui também — é dívida
 *    consciente, o preço de a tela de erro não ter dependência nenhuma.
 *
 * O selo (`ThbLogo`) entra porque não depende de provider: é `next/image`
 * `unoptimized`, ou seja, um `<img>` para `/logo-thb.svg` com `width`/`height`
 * fixos — sobrevive mesmo sem CSS. A palavra "Time Holding Brasil" fica ao
 * lado como rede de segurança, para o caso de o próprio SVG não carregar.
 */

const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #f4f5f8;
    color: #0f172a;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
      Arial, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .ge-tela {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .ge-cartao {
    width: 100%;
    max-width: 30rem;
    background: #ffffff;
    border: 1px solid #d4d8de;
    border-radius: 14px;
    padding: 32px 28px;
    text-align: center;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04),
      0 12px 32px -16px rgba(15, 23, 42, 0.18);
  }
  .ge-marca {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 24px;
  }
  .ge-marca-nome {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .ge-titulo {
    margin: 0 0 8px;
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .ge-texto {
    margin: 0;
    font-size: 0.875rem;
    color: #6b7280;
  }
  .ge-acoes {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 24px;
  }
  .ge-botao {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 40px;
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid transparent;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease;
  }
  .ge-botao--primario { background: #c34107; color: #ffffff; }
  .ge-botao--primario:hover { background: #e05700; }
  .ge-botao--secundario {
    background: #ffffff;
    border-color: #d4d8de;
    color: #0f172a;
  }
  .ge-botao--secundario:hover { background: #eef0f4; }
  /* Foco visível é obrigatório: sem ele o teclado não sabe onde está, e esta
     tela pode ser a única coisa de pé no portal. */
  .ge-botao:focus-visible {
    outline: 2px solid #ef7d00;
    outline-offset: 2px;
  }
  .ge-codigo {
    margin: 20px 0 0;
    font-size: 0.75rem;
    color: #6b7280;
  }
  .ge-codigo code {
    user-select: all;
    color: #0f172a;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  @media (prefers-reduced-motion: reduce) {
    .ge-botao { transition: none; }
  }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <style>{CSS}</style>
        <main className="ge-tela">
          <div className="ge-cartao">
            <p className="ge-marca">
              <ThbLogo size="sm" />
              <span className="ge-marca-nome">Time Holding Brasil</span>
            </p>
            <h1 className="ge-titulo">O portal não conseguiu abrir</h1>
            <p className="ge-texto">
              Uma falha interrompeu o carregamento antes da página montar. Não é
              nada que você tenha feito, e nenhum dado seu foi perdido.
            </p>
            <div className="ge-acoes">
              <button
                type="button"
                className="ge-botao ge-botao--primario"
                onClick={() => reset()}
              >
                Tentar de novo
              </button>
              {/* `<a>` e não `next/link` de propósito, e por isso a regra
                  está desligada nesta linha: o que quebrou foi o root layout,
                  ou seja, a árvore do App Router. Navegação client-side
                  reaproveitaria justamente o estado corrompido; só um
                  carregamento completo devolve o portal ao estado limpo. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className="ge-botao ge-botao--secundario" href="/">
                Ir para o início
              </a>
            </div>
            {/* `error.digest` liga a queixa ao log do servidor.
                `error.message` nunca aparece: pode carregar detalhe interno. */}
            {error.digest ? (
              <p className="ge-codigo">
                Código: <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
