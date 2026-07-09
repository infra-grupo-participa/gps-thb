import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThbLogo } from "@/components/thb-logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <ThbLogo />
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Compass className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Página não encontrada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          O endereço pode ter mudado. Volte ao início para continuar.
        </p>
      </div>
      <Link href="/" className={buttonVariants()}>
        Ir para o início
      </Link>
    </main>
  );
}
