import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClienteEquipe,
  getClientesEtapa1,
  getEtapas,
  getMembro,
  getProgressoAluno,
  getReuniaoJanelas,
} from "@/lib/data";
import { pctPorEtapa, proximoPasso } from "@/lib/etapas";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { FavoritoDestaque } from "@/components/etapa/favorito-destaque";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { AssistBanner } from "@/components/admin/assist-banner";
import { BotaoRedefinirSenha } from "@/components/admin/botao-redefinir-senha";

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
  const [aluno, etapas, clientes, progressoTodas, favorito, janelas] =
    await Promise.all([
      getAlunoById(alunoId),
      getEtapas(),
      getClientesEtapa1(alunoId),
      getProgressoAluno(alunoId),
      getClienteEquipe(alunoId),
      getReuniaoJanelas(alunoId),
    ]);

  const pcts = pctPorEtapa(clientes, progressoTodas);
  const passo = proximoPasso(etapas, clientes, progressoTodas);

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
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{aluno?.nome ?? "Aluno"}</h1>
              <p className="text-muted-foreground">{aluno?.email}</p>
            </div>
            {membro.user_id ? (
              <BotaoRedefinirSenha alunoId={alunoId} />
            ) : null}
          </div>
        </div>

        {passo ? (
          <div className="mb-6">
            <ProximoPassoCard passo={passo} basePath={base} />
          </div>
        ) : null}

        {favorito ? (
          <div className="mb-6">
            <FavoritoDestaque
              alunoId={alunoId}
              cliente={favorito}
              janelas={janelas}
              isAdmin
              basePath={base}
            />
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
