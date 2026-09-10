import Link from "next/link";
import { ResgateForm } from "./resgate-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";

/**
 * O caminho de quem não consegue entrar — sem e-mail e sem operador.
 *
 * 🔑 SERVE TAMBÉM PARA QUEM NUNCA TEVE LOGIN. Medido em 10/09/2026: dos 137
 * titulares, **19 não têm conta em `auth.users`** — exatamente as pessoas
 * que mais vão procurar este caminho. `gps.resgate_concluir` cria a conta
 * quando não há, então a copy fala em "criar sua senha", nunca em
 * "redefinir": para 19 pessoas não há o que redefinir.
 *
 * ⚠️ Rota pública — precisa estar na allowlist de
 * `src/lib/supabase/middleware.ts`, senão o proxy manda para o `/login` e a
 * tela fica inalcançável justamente para quem não consegue logar.
 */

export const metadata = { title: "Não consigo entrar" };

export default function ResgatePage() {
  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
      </div>

      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Não consigo entrar</h1>
          <p className="corpo-sm text-muted-foreground">
            Com o código que a equipe divulgou, você cria a sua senha na hora — sem esperar e-mail
            e sem falar com ninguém.
          </p>
        </CardHeader>
        <CardContent>
          <ResgateForm />
        </CardContent>
      </Card>

      <p className="mt-6 text-center corpo-sm text-muted-foreground">
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
