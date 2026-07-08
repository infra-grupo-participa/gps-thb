import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClientesEtapa1,
  getEtapas,
  getMembro,
  getProgressoEtapa,
} from "@/lib/data";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { AssistBanner } from "@/components/admin/assist-banner";

export default async function AdminAlunoInicioPage({
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
  const [aluno, etapas, clientes, progresso] = await Promise.all([
    getAlunoById(alunoId),
    getEtapas(),
    getClientesEtapa1(alunoId),
    getProgressoEtapa(alunoId, 1),
  ]);

  const manual: Record<number, boolean> = {};
  for (const p of progresso) manual[p.tarefa] = p.concluida;
  const metricas = calcularMetricasEtapa1(clientes, manual);

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
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar aos alunos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {aluno?.nome ?? "Aluno"}
          </h1>
          <p className="text-muted-foreground">{aluno?.email}</p>
        </div>

        <EtapasOverview
          etapas={etapas}
          basePath={base}
          pctPorEtapa={{ 1: metricas.pct }}
          allowLockedPreview
        />
      </main>
    </>
  );
}
