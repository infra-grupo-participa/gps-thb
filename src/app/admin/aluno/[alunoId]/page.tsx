import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClienteEquipe,
  getClientesEtapa1,
  getEtapas,
  getAmbiente,
  getProgressoAluno,
  getResumoDiario,
} from "@/lib/data";
import { pctPorEtapa, proximoPasso } from "@/lib/etapas";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { FavoritoDestaque } from "@/components/etapa/favorito-destaque";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { AssistBanner } from "@/components/admin/assist-banner";
import { GerenciarAcesso } from "@/components/admin/gerenciar-acesso";
import { DiarioResumoCard } from "@/components/admin/diario-resumo-card";

export default async function AdminAlunoInicioPage({
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
  const [aluno, etapas, clientes, progressoTodas, favorito, resumoDiario] =
    await Promise.all([
      getAlunoById(alunoId),
      getEtapas(),
      getClientesEtapa1(alunoId),
      getProgressoAluno(alunoId),
      getClienteEquipe(alunoId),
      getResumoDiario(alunoId),
    ]);

  const pcts = pctPorEtapa(clientes, progressoTodas);
  // Mesma regra do ambiente do aluno (PL2): tarefa travada não é próximo
  // passo. O admin vê o mesmo card que o aluno vê.
  const passo = proximoPasso(etapas, clientes, progressoTodas, {
    temFavorito: favorito !== null,
  });

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

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo={aluno?.nome ?? "Aluno"}
          descricao={aluno?.email}
          voltar={
            <Link
              href="/admin"
              className="previa-oculta text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar aos alunos
            </Link>
          }
          acao={
            <GerenciarAcesso alunoId={alunoId} nomeAluno={aluno?.nome ?? null} />
          }
        />

        <div className="mb-6">
          <DiarioResumoCard resumo={resumoDiario} basePath={base} />
        </div>

        {passo ? (
          <div className="mb-6">
            <ProximoPassoCard passo={passo} basePath={base} />
          </div>
        ) : null}

        {favorito ? (
          <div className="mb-6">
            <FavoritoDestaque cliente={favorito} basePath={base} />
          </div>
        ) : null}

        <EtapasOverview
          etapas={etapas}
          basePath={base}
          pctPorEtapa={pcts}
          allowLockedPreview
        />
      </main>
    </>
  );
}
