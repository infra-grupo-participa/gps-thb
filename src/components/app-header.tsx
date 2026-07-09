import Link from "next/link";
import { sair } from "@/app/auth/actions";
import { GpsLogo } from "@/components/gps-logo";
import { NavTabs, type NavItem } from "@/components/nav-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href={homeHref} className="flex items-center gap-3">
            <GpsLogo size="sm" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">GPS</div>
              <div className="text-xs text-muted-foreground">
                Implementação Assistida
              </div>
            </div>
          </Link>
          {navItems && navItems.length > 0 ? (
            <div className="hidden md:block">
              <NavTabs items={navItems} />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">
              {nome ?? email}
            </div>
            <div className="text-xs text-muted-foreground">{email}</div>
          </div>
          <Badge variant="secondary" className="hidden md:inline-flex">
            {papelRotulo}
          </Badge>
          <form action={sair}>
            <Button variant="outline" size="sm" type="submit">
              Sair
            </Button>
          </form>
        </div>
      </div>

      {navItems && navItems.length > 0 ? (
        <div className="border-t px-4 py-2 md:hidden">
          <NavTabs items={navItems} />
        </div>
      ) : null}
    </header>
  );
}
