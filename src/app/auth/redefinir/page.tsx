import { RedefinirForm } from "./redefinir-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GpsLogo } from "@/components/gps-logo";
import { AuthLayout } from "@/components/auth-layout";

export const metadata = { title: "Nova senha | GPS" };

export default function RedefinirSenhaPage() {
  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <GpsLogo />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Criar nova senha</h2>
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
