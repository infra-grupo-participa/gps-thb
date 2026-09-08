import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getAmbiente,
  getDiarioDoAluno,
  getPendenciasAbertasDoAluno,
} from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { DiarioForm } from "@/components/admin/diario-form";
import { DiarioTimeline } from "@/components/admin/diario-timeline";

export const metadata = { title: "Diário do aluno" };

/**
 * Diário do aluno — linha do tempo da EQUIPE. Visualização EXCLUSIVA do
 * admin (LGPD: texto livre pode conter dado pessoal de terceiros). Ver
 * aviso em `assistenciaNavItems` (`src/lib/nav.ts`) e `CLAUDE.md`.
 */
export default async function AdminAlunoDiarioPage({
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

  const [aluno, notas, pendenciasAbertas] = await Promise.all([
    getAlunoById(alunoId),
    getDiarioDoAluno(alunoId),
    // Todas as pendências abertas, sem o teto de 50 da timeline — senão uma
    // pendência antiga ficaria sem botão de baixa na tela.
    getPendenciasAbertasDoAluno(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId)}
      />
      <AssistBanner aluno={aluno} />

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Diário de {aluno?.nome}</h1>
          <p className="text-muted-foreground">
            Linha do tempo de observações, dúvidas, combinados e pendências
            registrados pela equipe. Visível só para o admin.
          </p>
        </div>

        <div className="mb-8">
          <DiarioForm alunoId={alunoId} />
        </div>

        <DiarioTimeline notas={notas} pendenciasAbertas={pendenciasAbertas} />
      </main>
    </>
  );
}
