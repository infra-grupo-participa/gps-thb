import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClientesEtapa1, getMembro } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { ClientesManager } from "@/components/clientes/clientes-manager";

export default async function AdminAlunoClientesPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const membro = await getMembro(alunoId);
  if (!membro) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [aluno, clientes] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={alunoNavItems(base)}
      />
      <AssistBanner aluno={aluno} />

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Clientes de {aluno?.nome}</h1>
          <p className="text-muted-foreground">
            Gerencie os clientes e documentos no ambiente do aluno.
          </p>
        </div>

        <ClientesManager
          alunoId={alunoId}
          clientesIniciais={clientes}
          basePath={base}
        />
      </main>
    </>
  );
}
