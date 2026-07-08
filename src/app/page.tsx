import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getEtapas,
  getAlunoById,
  getClientesEtapa1,
  getProgressoEtapa,
  getMinhaSolicitacao,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { GpsLogo } from "@/components/gps-logo";
import { Card, CardContent } from "@/components/ui/card";

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
            <form action="/auth/signout" method="post">
              <button className="text-sm text-primary underline" type="submit">
                Sair
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Aluno
  const alunoId = ctx.alunoId!;
  const [etapas, aluno, clientes, progresso] = await Promise.all([
    getEtapas(),
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getProgressoEtapa(alunoId, 1),
  ]);

  const manual: Record<number, boolean> = {};
  for (const p of progresso) manual[p.tarefa] = p.concluida;
  const metricas = calcularMetricasEtapa1(clientes, manual);

  const primeiroNome = (aluno?.nome ?? "").split(" ")[0];

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("")}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">
            Olá{primeiroNome ? `, ${primeiroNome}` : ""}!
          </h1>
          <p className="text-muted-foreground">
            Acompanhe aqui a implementação da sua 1ª holding, etapa por etapa.
          </p>
        </div>

        <EtapasOverview
          etapas={etapas}
          basePath=""
          pctPorEtapa={{ 1: metricas.pct }}
        />
      </main>
    </>
  );
}
