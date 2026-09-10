import Link from "next/link";
import { EntrarForm } from "./entrar-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";
import { destinoInterno } from "@/lib/nav";

/**
 * A entrada mais curta que existe: e-mail + código do grupo.
 *
 * Pedido do Marcio (10/09/2026, no meio do evento): *"preciso que essa
 * entrada seja facilitada ao máximo"* — dezenas de pessoas entrando ao mesmo
 * tempo, e cada senha individual virava um atendimento.
 *
 * Serve para TODO MUNDO, tenha login ou não:
 *   · nunca teve acesso  → a conta é criada na hora
 *   · esqueceu a senha   → entra do mesmo jeito
 *   · já usa o sistema   → entra e cai onde parou
 *
 * Em todos os casos o passo 0 do onboarding pede a senha nova; quem já fez o
 * onboarding vai direto para a tela inicial.
 *
 * ⚠️ Rota pública — precisa estar na allowlist de
 * `src/lib/supabase/middleware.ts`, senão o proxy manda para o `/login` e a
 * tela fica inalcançável para quem ela existe para atender.
 */

export const metadata = { title: "Entrar" };

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  // Mesmo validador do login: `//evil.com` e afins caem em "/".
  const destino = destinoInterno(redirect ?? "");

  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
      </div>

      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Entrar no Programa</h1>
          <p className="corpo-sm text-muted-foreground">
            Informe o seu e-mail e o código que a equipe passou. Você cria a sua
            senha assim que entrar.
          </p>
        </CardHeader>
        <CardContent>
          <EntrarForm destino={destino} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center corpo-sm text-muted-foreground">
        Problemas para entrar?{" "}
        <Link
          href="https://o.aceleraholding.com.br/monitoria"
          className="font-medium text-accent-foreground underline-offset-4 hover:underline"
        >
          Fale com a equipe
        </Link>
      </p>
    </AuthLayout>
  );
}
