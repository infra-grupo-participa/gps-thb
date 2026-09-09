import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getAmbiente,
  contarMembrosDoAmbiente,
} from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { PastaView } from "@/components/pasta/pasta-view";

export default async function AdminAlunoPastaPage({
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

  const [aluno, qtdMembros] = await Promise.all([
    getAlunoById(alunoId),
    contarMembrosDoAmbiente(alunoId),
  ]);

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
          titulo={`Pasta de ${aluno?.nome ?? ""}`}
          descricao="Configure e acompanhe a pasta do Drive do aluno."
        />

        <PastaView
          alunoId={alunoId}
          pastaUrl={ambiente.pasta_drive_url}
          isAdmin
        />
      </main>
    </>
  );
}
