import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getAmbiente,
  contarMembrosDoAmbiente,
  getTutoriaisAtivo,
} from "@/lib/data";
import { getEstadoDrive } from "@/lib/data/drive";
import { assistenciaNavItems, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { PastaView } from "@/components/pasta/pasta-view";
import { PastaConfigForm } from "@/components/pasta/pasta-config-form";
import { PastaDriveAdmin } from "@/components/pasta/pasta-drive-admin";

/** Título da aba — sem isto, herdava o rótulo genérico do portal. */
export const metadata = { title: "Pasta" };

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

  const [aluno, qtdMembros, tutoriaisAtivo, estadoDrive] = await Promise.all([
    getAlunoById(alunoId),
    contarMembrosDoAmbiente(alunoId),
    getTutoriaisAtivo(),
    getEstadoDrive(alunoId),
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
        navFixo={navFixoDoAluno(`/admin/aluno/${alunoId}`, { tutoriais: tutoriaisAtivo })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-pagina px-4 pt-8 pb-16">
        <PageHeader
          titulo={`Pasta de ${aluno?.nome ?? ""}`}
        />

        <div className="grid gap-6">
          <PastaDriveAdmin
            alunoId={alunoId}
            nome={aluno?.nome ?? ""}
            estado={estadoDrive}
            temLink={Boolean(ambiente.pasta_drive_url)}
          />
          {/* PF4 — o campo de configuração é do admin e só existe aqui. */}
          <PastaConfigForm
            alunoId={alunoId}
            pastaUrl={ambiente.pasta_drive_url}
            origem={ambiente.pasta_drive_origem}
          />
          <PastaView
            pastaUrl={ambiente.pasta_drive_url}
            isAdmin
            porNome={ambiente.pasta_drive_por_nome}
            em={ambiente.pasta_drive_em}
            origem={ambiente.pasta_drive_origem}
          />
        </div>
      </main>
    </>
  );
}
