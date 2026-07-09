import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembro } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PastaView } from "@/components/pasta/pasta-view";

export const metadata = { title: "Pasta | GPS" };

export default async function PastaPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, membro] = await Promise.all([
    getAlunoById(ctx.alunoId),
    getMembro(ctx.alunoId),
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
          <h1 className="text-2xl font-semibold">Minha pasta</h1>
          <p className="text-muted-foreground">
            Todos os documentos e arquivos do seu processo, organizados no Drive.
          </p>
        </div>

        <PastaView
          alunoId={ctx.alunoId}
          pastaUrl={membro?.pasta_drive_url ?? null}
          isAdmin={false}
        />
      </main>
    </>
  );
}
