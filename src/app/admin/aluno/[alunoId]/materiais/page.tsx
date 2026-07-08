import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getEtapas, getMembro } from "@/lib/data";
import { listarMateriais } from "@/lib/materiais";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { MateriaisView } from "@/components/materiais/materiais-view";

export default async function AdminAlunoMateriaisPage({
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
  const [aluno, etapas] = await Promise.all([
    getAlunoById(alunoId),
    getEtapas(),
  ]);
  const nomes: Record<number, string> = {};
  const liberadas: Record<number, boolean> = {};
  for (const e of etapas) {
    nomes[e.id] = e.nome;
    liberadas[e.id] = e.liberada;
  }

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
          <h1 className="text-2xl font-semibold">Materiais</h1>
          <p className="text-muted-foreground">
            Acervo de aulas e modelos de todas as etapas.
          </p>
        </div>

        <MateriaisView
          materiais={listarMateriais()}
          etapaNomes={nomes}
          etapasLiberadas={liberadas}
          basePath={base}
          podeAbrirBloqueadas
        />
      </main>
    </>
  );
}
