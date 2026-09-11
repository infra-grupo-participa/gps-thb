import Link from "next/link";
import { ConviteForm } from "./convite-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThbLogo } from "@/components/thb-logo";
import { AuthLayout } from "@/components/auth-layout";

/**
 * Aceite do convite de sócio (feature Equipe, 11/09/2026) — `/convite?t=<token>`.
 *
 * 🔴 ROTA PÚBLICA — está na allowlist de `src/lib/supabase/middleware.ts` e
 * FORA de `publicaQuePrecisaDeSessao` (o `getUser()` custa ~390 ms e
 * derrubaria a tela de quem ainda não tem conta, exatamente o público que
 * `/convite` atende).
 *
 * Sem token na URL, a tela nem mostra o formulário: um `?t=` vazio ou
 * ausente não é "convite inválido genérico" — é link quebrado ou copiado
 * pela metade, e a pessoa não tem o que fazer aqui além de pedir outro link.
 */
export const metadata = { title: "Aceitar convite" };

export default async function ConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const bruto = (await searchParams).t;
  const token = typeof bruto === "string" ? bruto.trim() : "";

  return (
    <AuthLayout>
      <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
        <ThbLogo />
      </div>

      <Card elevacao="raised" size="lg">
        <CardHeader>
          <h1 className="font-heading titulo-h2">Você foi convidado</h1>
          <p className="corpo-sm text-muted-foreground">
            Crie sua senha para entrar no Programa de Implementação Assistida como sócio(a) —
            vocês vão compartilhar o mesmo ambiente: os mesmos clientes, tarefas e progresso.
          </p>
        </CardHeader>
        <CardContent>
          {token ? (
            <ConviteForm token={token} />
          ) : (
            <p className="corpo-sm text-muted-foreground">
              Este link está incompleto ou foi copiado pela metade. Peça ao seu titular para
              reenviar o convite pela aba Equipe.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center corpo-sm text-muted-foreground">
        Já tem conta em outro sistema do grupo?{" "}
        <Link
          href="/login"
          className="font-medium text-accent-foreground underline-offset-4 hover:underline"
        >
          Entre com a sua senha atual
        </Link>
      </p>
    </AuthLayout>
  );
}
