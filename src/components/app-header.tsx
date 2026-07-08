import Link from "next/link";
import { GpsLogo } from "@/components/gps-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AppHeader({
  nome,
  email,
  papelRotulo,
  homeHref = "/",
}: {
  nome: string | null;
  email: string | null;
  papelRotulo: string;
  homeHref?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={homeHref} className="flex items-center gap-3">
          <GpsLogo size="sm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold">GPS</div>
            <div className="text-xs text-muted-foreground">
              Implementação Assistida
            </div>
          </div>
        </Link>

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
          <form action="/auth/signout" method="post">
            <Button variant="outline" size="sm" type="submit">
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
