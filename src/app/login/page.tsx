import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GpsLogo } from "@/components/gps-logo";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = redirect?.startsWith("/") ? redirect : "/";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <GpsLogo />
          <div>
            <h1 className="text-lg font-semibold">Implementação Assistida</h1>
            <p className="text-sm text-muted-foreground">
              Time Holding Brasil
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-base font-medium">Acesse sua conta</h2>
          </CardHeader>
          <CardContent>
            <LoginForm redirectTo={redirectTo} />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link href="/cadastro" className="text-primary underline">
            Criar conta
          </Link>
        </p>
      </div>
    </main>
  );
}
