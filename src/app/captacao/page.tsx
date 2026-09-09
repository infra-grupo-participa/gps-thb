import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Captação" };

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
      {/* O cabeçalho é o mesmo `PageHeader` das outras 17 páginas — o card
          continua sendo o corpo, agora só com o texto. Antes o `h1` morava
          dentro do card centralizado e o topo desta aba não batia com o de
          nenhuma outra. */}
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader
          titulo="Portal de Captação"
          acao={<Badge variant="outline">Em breve</Badge>}
        />
        <Card>
          <CardContent>
            <p className="max-w-prose text-muted-foreground">
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
