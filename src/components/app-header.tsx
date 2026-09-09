import Link from "next/link";
import { ThbLogo } from "@/components/thb-logo";
import { LogoutButton } from "@/components/logout-button";
import { NavTabs, type NavItem } from "@/components/nav-tabs";
import { AutoLogout } from "@/components/auto-logout";
import { Badge } from "@/components/ui/badge";

export function AppHeader({
  nome,
  email,
  papelRotulo,
  homeHref = "/",
  navItems,
}: {
  nome: string | null;
  email: string | null;
  papelRotulo: string;
  homeHref?: string;
  navItems?: NavItem[];
}) {
  return (
    <>
      {/* O header só é renderizado em tela autenticada, então é o lugar
          natural para o relógio de inatividade viver. */}
      <AutoLogout />
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {/* DUAS LINHAS SEMPRE (linha 1 = marca + conta; linha 2 = abas).
            Antes era uma linha com `flex-wrap` + `md:h-16`, e em 1366 px com 8
            abas o bloco de marca colapsava para QUATRO linhas ("Time / Holding
            Brasil / Programa de / Implementação / Assistida"), estourando os
            64 px do header e empurrando a faixa "Modo assistência" por cima do
            subtítulo. Com as abas na própria linha, a marca nunca disputa
            largura com elas — o header fica igual com 3 ou com 8 abas. */}
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-x-4 px-4">
          <Link
            href={homeHref}
            className="foco-visivel flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <ThbLogo size="sm" className="size-10" />
            {/* UMA linha. O subtítulo "Programa de Implementação Assistida"
                saiu daqui: já está no `<title>` e no `PageHeader` de toda
                página, e era ele que causava a quebra em 4 linhas. */}
            <span className="truncate font-heading text-[0.9375rem] font-semibold">
              Time Holding Brasil
            </span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm leading-tight font-medium">
                {nome ?? email}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {email}
              </div>
            </div>
            <Badge variant="secondary" className="hidden md:inline-flex">
              {papelRotulo}
            </Badge>
            <LogoutButton />
          </div>
        </div>

        {navItems && navItems.length > 0 ? (
          // Um `NavTabs` só (A11Y4): antes existiam dois — `hidden md:block` e
          // `md:hidden` — o que duplicava o DOM e punha cada link duas vezes
          // na ordem de tabulação. Aqui o mesmo nó rola na horizontal quando
          // não cabe (pior caso: 8 abas em 360 px), com máscara de fade nas
          // bordas para sinalizar que há mais aba fora da tela.
          <div className="border-t">
            <div className="scrollbar-none fade-lateral mx-auto w-full max-w-6xl overflow-x-auto px-4">
              <NavTabs items={navItems} />
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
