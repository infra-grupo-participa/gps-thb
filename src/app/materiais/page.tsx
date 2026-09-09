import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getEtapas } from "@/lib/data";
import { listarMateriais } from "@/lib/materiais";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { MateriaisView } from "@/components/materiais/materiais-view";

export const metadata = { title: "Materiais" };

export default async function MateriaisPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, etapas] = await Promise.all([
    getAlunoById(ctx.alunoId),
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
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Materiais"
          descricao="Seu acervo de aulas e modelos — reunidos de todas as etapas, num só lugar."
        />

        <MateriaisView
          materiais={listarMateriais()}
          etapaNomes={nomes}
          etapasLiberadas={liberadas}
          basePath=""
          podeAbrirBloqueadas={false}
        />
      </main>
    </>
  );
}
