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
    {/* O header só é renderizado em tela autenticada, então é o lugar natural
        para o relógio de inatividade viver. */}
    <AutoLogout />
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Um `NavTabs` só (A11Y4): antes existiam dois — `hidden md:block` e
          `md:hidden` — o que duplicava o DOM e punha cada link duas vezes na
          ordem de tabulação. Aqui o mesmo nó muda de posição por `order` +
          `flex-wrap`: no celular ele quebra para a segunda linha (rolando na
          horizontal), no desktop fica entre a marca e a conta. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 px-4 py-2.5 md:h-16 md:flex-nowrap md:py-0">
        <Link href={homeHref} className="order-1 flex items-center gap-3">
          <ThbLogo size="sm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Time Holding Brasil</div>
            <div className="text-xs text-muted-foreground">
              Programa de Implementação Assistida
            </div>
          </div>
        </Link>

        <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">
              {nome ?? email}
            </div>
            <div className="text-xs text-muted-foreground">{email}</div>
          </div>
          <Badge variant="secondary" className="hidden md:inline-flex">
            {papelRotulo}
          </Badge>
          <LogoutButton />
        </div>

        {navItems && navItems.length > 0 ? (
          // 360 px com 7 abas (modo assistência + Financeiro) não cabe: rola
          // na horizontal em vez de espremer. `md:overflow-visible` para o
          // anel de foco não ser cortado no desktop, onde tudo cabe.
          <div className="scrollbar-none order-3 -mx-4 mt-2 w-[calc(100%+2rem)] overflow-x-auto border-t px-4 pt-2 md:order-2 md:mx-0 md:mt-0 md:ml-2 md:w-auto md:flex-1 md:overflow-visible md:border-t-0 md:pt-0">
            <NavTabs items={navItems} />
          </div>
        ) : null}
      </div>
    </header>
    </>
  );
}
