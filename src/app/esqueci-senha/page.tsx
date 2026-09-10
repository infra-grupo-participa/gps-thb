import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { EsqueciForm } from "./esqueci-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";

export const metadata = { title: "Esqueci minha senha" };

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  // `/auth/confirm` manda para cá com `?erro=link` quando o link do e-mail já
  // expirou ou já foi usado. Sem esta frase a pessoa voltava para o mesmo
  // formulário sem entender por que não caiu na tela de nova senha.
  // Allowlist de um valor: nada do que vem na URL vai para a tela.
  const linkInvalido = erro === "link";

  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
      </div>

      {linkInvalido ? (
        <div role="status" className="mb-4">
          <AvisoInline icone={LinkIcon}>
            Este link expirou ou já foi usado. Peça um novo.
          </AvisoInline>
        </div>
      ) : null}

      {/* Mesma família das outras três telas de entrada (`/login`,
          `/cadastro`, `/auth/redefinir`): `Card raised lg` e `h1` na escala
          de título, não um `text-lg` solto. */}
      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Redefinir senha</h1>
          <p className="text-sm text-muted-foreground">
            Informe seu e-mail e enviaremos um link para criar uma nova senha.
          </p>
        </CardHeader>
        <CardContent>
          <EsqueciForm />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Lembrou a senha?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-foreground underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
