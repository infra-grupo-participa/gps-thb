import type { Metadata } from "next";
import { ThbLogo } from "@/components/thb-logo";

/**
 * Layout PRÓPRIO da área pública "/p" (Plantão de Dúvidas).
 *
 * Esta rota é embedada em IFRAME dentro da área de membros da Hotmart
 * (https://hm.nivelouro.com.br/acelera-holding). NÃO é o portal GPS:
 * sem AppHeader, sem NavTabs, sem logout, sem nada que pressuponha sessão
 * do portal — a sessão aqui é a do aluno do Plantão (cookie próprio),
 * resolvida página a página.
 *
 * Regras de layout por causa do iframe:
 * - largura contida e mobile-first de verdade: a Hotmart não dá largura
 *   generosa ao iframe;
 * - NENHUM elemento `sticky`: dentro de iframe o elemento que rola nem
 *   sempre é o `body` da própria página — `sticky` fica "grudado" em lugar
 *   nenhum ou não gruda em nada (lição já registrada no projeto).
 *
 * NÃO é o "agendamento de reunião com a equipe" removido em 10/08 (commit
 * b457005) — proibido reconstruir aquele fluxo.
 */

export const metadata: Metadata = {
  title: {
    default: "Plantão de Dúvidas | Acelera Holding",
    template: "%s | Plantão de Dúvidas",
  },
  description: "Plantão de dúvidas do Acelera Holding — Time Holding Brasil.",
};

export default function PlantaoPublicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-foreground">
      {/*
        O `body` do portal e pintado por `@layer base { body { bg-background } }`
        em globals.css - cinza (#f4f5f8). Esta rota e embedada em iframe sobre
        fundo branco na Hotmart, entao o cinza virava uma "caixa" visivel no
        meio da aula. Pintar so esta div nao resolve: quem pinta a area toda do
        iframe e o body. So `/p/*` e afetada - o style vive no layout de `/p`.
      */}
      <style>{`html,body{background:#fff !important;}`}</style>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 py-4 sm:max-w-lg sm:px-4">
        <header className="flex items-center gap-2.5">
          <ThbLogo size="sm" />
          <div className="min-w-0 leading-tight">
            {/* `h1` da área pública (A11Y2): `/p/plantao` não tinha nenhum.
                O título já é este — vira o cabeçalho de documento em vez de
                ganhar uma segunda faixa repetindo a mesma frase no iframe. */}
            <h1 className="truncate text-sm font-semibold">
              Plantão de Dúvidas
            </h1>
            <div className="truncate text-xs text-muted-foreground">
              Acelera Holding — Time Holding Brasil
            </div>
          </div>
        </header>

        <main id="conteudo" className="flex flex-1 flex-col gap-4">
          {children}
        </main>

        <p className="pt-1 text-center text-xs leading-snug text-muted-foreground">
          Está com problema para acessar?{" "}
          <a
            href="https://o.aceleraholding.com.br/monitoria"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent-foreground underline underline-offset-4 hover:no-underline"
          >
            Fale com a monitoria
          </a>
        </p>

        <footer className="pt-2 pb-1 text-center text-[11px] leading-snug text-muted-foreground">
          Time Holding Brasil
        </footer>
      </div>
    </div>
  );
}
