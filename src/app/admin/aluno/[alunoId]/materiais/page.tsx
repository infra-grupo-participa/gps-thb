import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getEtapas,
  getAmbiente,
  contarMembrosDoAmbiente,
} from "@/lib/data";
import { listarMateriais } from "@/lib/materiais";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
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

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [aluno, etapas, qtdMembros] = await Promise.all([
    getAlunoById(alunoId),
    getEtapas(),
    contarMembrosDoAmbiente(alunoId),
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
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: qtdMembros > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Materiais"
          descricao="Acervo de aulas e modelos de todas as etapas."
        />

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
