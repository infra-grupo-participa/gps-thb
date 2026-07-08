import Link from "next/link";
import { CadastroForm } from "./cadastro-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GpsLogo } from "@/components/gps-logo";

export const metadata = { title: "Solicitar acesso | GPS" };

export default function CadastroPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <GpsLogo />
          <div>
            <h1 className="text-lg font-semibold">Implementação Assistida</h1>
            <p className="text-sm text-muted-foreground">Time Holding Brasil</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-base font-medium">Criar conta</h2>
            <p className="text-sm text-muted-foreground">
              Cadastre-se com seu CPF/CNPJ e e-mail. Seus dados são vinculados
              automaticamente e você já acessa o programa.
            </p>
          </CardHeader>
          <CardContent>
            <CadastroForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
