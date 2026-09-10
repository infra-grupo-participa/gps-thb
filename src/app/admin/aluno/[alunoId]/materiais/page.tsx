import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getEtapas,
  getEtapasLiberadasPara,
  getAmbiente,
  contarMembrosDoAmbiente,
} from "@/lib/data";
import { etapasComLiberacaoDoAluno } from "@/lib/etapas";
import { listarMateriais } from "@/lib/materiais";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { MateriaisView } from "@/components/materiais/materiais-view";

/** Título da aba — sem isto, herdava o rótulo genérico do portal. */
export const metadata = { title: "Materiais" };

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
  const [aluno, etapasGlobais, overrides, qtdMembros] = await Promise.all([
    getAlunoById(alunoId),
    getEtapas(),
    // Mesma regra do ambiente do aluno: o admin vê o acervo com a liberação
    // individual já aplicada (e continua podendo abrir o bloqueado).
    getEtapasLiberadasPara(alunoId),
    contarMembrosDoAmbiente(alunoId),
  ]);
  const etapas = etapasComLiberacaoDoAluno(etapasGlobais, overrides);
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
          materiais={listarMateriais({ etapasLiberadas: liberadas, incluirBloqueados: true })}
          etapaNomes={nomes}
          etapasLiberadas={liberadas}
          basePath={base}
          podeAbrirBloqueadas
        />
      </main>
    </>
  );
}
