import { RedefinirForm } from "./redefinir-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";

export const metadata = { title: "Nova senha" };

export default function RedefinirSenhaPage() {
  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
      </div>

      {/* Mesma família das outras três telas de entrada: `Card raised lg` e
          `h1` na escala de título. */}
      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Criar nova senha</h1>
          <p className="text-sm text-muted-foreground">
            Defina a nova senha da sua conta.
          </p>
        </CardHeader>
        <CardContent>
          <RedefinirForm />
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
