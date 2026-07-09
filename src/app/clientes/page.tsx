import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClientesEtapa1 } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { ClientesManager } from "@/components/clientes/clientes-manager";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, clientes] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("")}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-muted-foreground">
            Cadastre e acompanhe seus clientes potenciais e o contato com eles.
          </p>
        </div>

        <ClientesManager
          alunoId={alunoId}
          clientesIniciais={clientes}
          basePath=""
        />
      </main>
    </>
  );
}
