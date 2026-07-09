import Link from "next/link";
import { EsqueciForm } from "./esqueci-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GpsLogo } from "@/components/gps-logo";
import { AuthLayout } from "@/components/auth-layout";

export const metadata = { title: "Esqueci minha senha | GPS" };

export default function EsqueciSenhaPage() {
  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <GpsLogo />
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Redefinir senha</h2>
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
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
