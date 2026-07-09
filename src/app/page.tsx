import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import {
  getEtapas,
  getAlunoById,
  getClientesEtapa1,
  getProgressoAluno,
  getMinhaSolicitacao,
  getMembro,
  getTurmaCodigo,
  getClienteEquipe,
  getReuniaoJanelas,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { pctPorEtapa, proximoPasso } from "@/lib/etapas";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { FavoritoDestaque } from "@/components/etapa/favorito-destaque";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { HomeResumo } from "@/components/home-resumo";
import { PerfilHero } from "@/components/perfil/perfil-hero";
import { GpsLogo } from "@/components/gps-logo";
import type { Aluno } from "@/lib/types";

export default async function HomePage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  if (ctx.papel === "admin") redirect("/admin");

  if (ctx.papel === "sem_acesso") {
    const solicitacao = await getMinhaSolicitacao(ctx.user.id);
    const recusada = solicitacao?.status === "recusada";

    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
            <GpsLogo />
            <Badge variant={recusada ? "destructive" : "secondary"}>
              {recusada ? "Solicitação não aprovada" : "Aguardando liberação"}
            </Badge>
            <div>
              <h1 className="text-lg font-semibold">
                {recusada
                  ? "Sua solicitação não foi aprovada"
                  : "Solicitação recebida!"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {recusada ? (
                  <>
                    Fale com a equipe do Time Holding Brasil para entender os
                    próximos passos.
                    {solicitacao?.observacao
                      ? ` Observação: ${solicitacao.observacao}`
                      : ""}
                  </>
                ) : (
                  <>
                    Sua conta ({ctx.user.email}) está aguardando a liberação da
                    equipe do Time Holding Brasil. Você receberá acesso ao
                    programa assim que for aprovado.
                  </>
                )}
              </p>
            </div>
            <LogoutButton linkStyle />
          </CardContent>
        </Card>
      </main>
    );
  }

  // Aluno
  const alunoId = ctx.alunoId!;
  const [etapas, aluno, clientes, progressoTodas, membro, favorito, janelas] =
    await Promise.all([
      getEtapas(),
      getAlunoById(alunoId),
      getClientesEtapa1(alunoId),
      getProgressoAluno(alunoId),
      getMembro(alunoId),
      getClienteEquipe(alunoId),
      getReuniaoJanelas(alunoId),
    ]);
  const turma = await getTurmaCodigo(aluno?.turma_id);

  const pcts = pctPorEtapa(clientes, progressoTodas);
  const passo = proximoPasso(etapas, clientes, progressoTodas);

  const manual1: Record<number, boolean> = {};
  for (const p of progressoTodas.filter((p) => p.etapa === 1))
    manual1[p.tarefa] = p.concluida;
  const m1 = calcularMetricasEtapa1(clientes, manual1);
  const valoresPct = Object.values(pcts);
  const progressoGeral = valoresPct.length
    ? Math.round(valoresPct.reduce((a, b) => a + b, 0) / valoresPct.length)
    : 0;

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("")}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <PerfilHero
          aluno={(aluno ?? { id: alunoId }) as Aluno}
          turma={turma}
          perfil={membro?.perfil ?? {}}
          editHref="/perfil"
        />

        {passo ? (
          <div className="mt-6">
            <ProximoPassoCard passo={passo} basePath="" />
          </div>
        ) : null}

        {/* Conteúdo: jornada (principal) + resumo (apoio) lado a lado. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {favorito ? (
              <FavoritoDestaque
                alunoId={alunoId}
                cliente={favorito}
                janelas={janelas}
                isAdmin={false}
                basePath=""
              />
            ) : null}

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Seu caminho
              </h2>
              <EtapasOverview etapas={etapas} basePath="" pctPorEtapa={pcts} dense />
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <HomeResumo
                progressoGeral={progressoGeral}
                clientes={m1.preenchidos}
                agendados={m1.agendados}
                perdaTotal={m1.perdaTotal}
              />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
