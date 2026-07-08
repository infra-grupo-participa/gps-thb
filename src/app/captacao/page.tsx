import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Captação | GPS" };

export default async function CaptacaoPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo={ctx.papel === "admin" ? "Admin" : "Aluno"}
        homeHref={ctx.papel === "admin" ? "/admin" : "/"}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-16">
        <Card className="w-full">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <Badge variant="outline">Em breve</Badge>
            <h1 className="text-2xl font-semibold">Portal de Captação</h1>
            <p className="max-w-md text-muted-foreground">
              O portal de captação — atração de clientes no ambiente digital —
              está sendo preparado e será liberado em breve. Por enquanto, o foco
              é a implementação da holding.
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
