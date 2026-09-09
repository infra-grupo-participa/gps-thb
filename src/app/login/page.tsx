import Link from "next/link";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";
import { destinoInterno } from "@/lib/nav";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = destinoInterno(redirect);

  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
        <div>
          {/* Marca, não título: o `h1` da página é "Bem-vindo de volta", que
              existe nos dois tamanhos de tela (A11Y2). */}
          <p className="font-heading text-lg font-semibold">
            Implementação Assistida
          </p>
          <p className="text-sm text-muted-foreground">Time Holding Brasil</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground">
            Acesse sua conta para continuar.
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo={redirectTo} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  );
}
