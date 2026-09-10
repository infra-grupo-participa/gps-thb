import Link from "next/link";
import { CadastroForm } from "./cadastro-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";

export const metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
        <div>
          {/* Marca, não título: o `h1` da página é "Criar conta". */}
          <p className="font-heading text-lg font-semibold">
            Implementação Assistida
          </p>
          <p className="text-sm text-muted-foreground">Time Holding Brasil</p>
        </div>
      </div>

      {/* Mesma família das outras três telas de entrada: `Card raised lg` e
          `h1` na escala de título. */}
      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Criar conta</h1>
          {/* 🔴 A promessa anterior ("seus dados são vinculados automaticamente
              e você já acessa o programa") só se cumpre quando o CPF/CNPJ casa
              com um cadastro do Time Holding Brasil. Sem match, o gatilho abre
              uma SOLICITAÇÃO e a pessoa fica esperando alguém aprovar — a tela
              prometia o caminho feliz para os dois casos. */}
          <p className="text-sm text-muted-foreground">
            Cadastre-se com seu CPF/CNPJ e e-mail. Se o seu CPF/CNPJ estiver na
            nossa base, você já entra; se não, sua solicitação fica registrada e
            a equipe libera o acesso.
          </p>
        </CardHeader>
        <CardContent>
          <CadastroForm />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
