import Link from "next/link";
import { Clock } from "lucide-react";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";
import { destinoInterno } from "@/lib/nav";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; motivo?: string }>;
}) {
  const { redirect, motivo } = await searchParams;
  const redirectTo = destinoInterno(redirect);
  // `auto-logout.tsx` manda para `/login?motivo=inatividade` depois de 30 min
  // parado. Nenhuma tela lia o parâmetro: a sessão caía no meio do uso e o
  // aluno reencontrava o login limpo, sem uma palavra — parecia defeito.
  // Allowlist de um valor só: nada do que vem na URL é ecoado na tela.
  const porInatividade = motivo === "inatividade";

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

      {porInatividade ? (
        // `role="status"`: quem já estava com o leitor de tela aberto quando a
        // sessão caiu precisa ouvir o porquê sem sair caçando pela página.
        <div role="status" className="mb-4">
          <AvisoInline icone={Clock}>
            Sua sessão foi encerrada por inatividade. Entre de novo.
          </AvisoInline>
        </div>
      ) : null}

      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Bem-vindo de volta</h1>
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
        <Link href="/cadastro" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthLayout>
  );
}
