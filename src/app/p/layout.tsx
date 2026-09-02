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
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 py-4 sm:max-w-lg sm:px-4">
        <header className="flex items-center gap-2.5">
          <ThbLogo size="sm" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">
              Plantão de Dúvidas
            </div>
            <div className="truncate text-xs text-muted-foreground">
              Acelera Holding — Time Holding Brasil
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4">{children}</main>

        <footer className="pt-2 pb-1 text-center text-[11px] leading-snug text-muted-foreground">
          Time Holding Brasil
        </footer>
      </div>
    </div>
  );
}
