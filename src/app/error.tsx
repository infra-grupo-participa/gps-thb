"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThbLogo } from "@/components/thb-logo";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <ThbLogo />
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Não foi possível carregar</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tivemos um problema momentâneo. Tente novamente ou volte ao início.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Tentar de novo</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Ir para o início
        </Link>
      </div>
    </main>
  );
}
