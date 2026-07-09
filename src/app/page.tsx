import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Users,
  BookOpen,
  ArrowRight,
  FolderOpen,
  TrendingUp,
  CalendarCheck,
  Coins,
} from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { sair } from "@/app/auth/actions";
import {
  getEtapas,
  getAlunoById,
  getClientesEtapa1,
  getProgressoAluno,
  getMinhaSolicitacao,
  getMembro,
  getTurmaCodigo,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { pctPorEtapa } from "@/lib/etapas";
import { calcularMetricasEtapa1 } from "@/lib/etapa1";
import { listarMateriais } from "@/lib/materiais";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { PerfilHero } from "@/components/perfil/perfil-hero";
import { StatCard } from "@/components/stat-card";
import { GpsLogo } from "@/components/gps-logo";
import type { Aluno } from "@/lib/types";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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
            <form action={sair}>
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
  const [etapas, aluno, clientes, progressoTodas, membro] = await Promise.all([
    getEtapas(),
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getProgressoAluno(alunoId),
    getMembro(alunoId),
  ]);
  const turma = await getTurmaCodigo(aluno?.turma_id);

  const pcts = pctPorEtapa(clientes, progressoTodas);
  const totalMateriais = listarMateriais().length;

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
        <div className="mb-8">
          <PerfilHero
            aluno={(aluno ?? { id: alunoId }) as Aluno}
            turma={turma}
            perfil={membro?.perfil ?? {}}
            editHref="/perfil"
          />
        </div>

        {/* Resumo */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="size-4" />}
            label="Progresso geral"
            value={`${progressoGeral}%`}
            hint="média das 6 etapas"
            destaque
          />
          <StatCard
            icon={<Users className="size-4" />}
            label="Clientes"
            value={`${m1.preenchidos}/30`}
            hint="da sua lista"
          />
          <StatCard
            icon={<CalendarCheck className="size-4" />}
            label="Reuniões agendadas"
            value={`${m1.agendados}/15`}
            hint="meta de 15"
          />
          <StatCard
            icon={<Coins className="size-4" />}
            label="Perda pela inércia"
            value={brl.format(m1.perdaTotal)}
            hint="soma dos clientes"
          />
        </div>

        {/* Atalhos */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <AtalhoCard
            href="/clientes"
            icon={<Users className="size-5" />}
            titulo="Clientes"
            detalhe={`${clientes.length} cadastrado${clientes.length === 1 ? "" : "s"}`}
          />
          <AtalhoCard
            href="/pasta"
            icon={<FolderOpen className="size-5" />}
            titulo="Pasta"
            detalhe="Documentos e arquivos no Drive"
          />
          <AtalhoCard
            href="/materiais"
            icon={<BookOpen className="size-5" />}
            titulo="Materiais"
            detalhe={`${totalMateriais} aulas e modelos`}
          />
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Seu caminho
        </h2>
        <EtapasOverview etapas={etapas} basePath="" pctPorEtapa={pcts} />
      </main>
    </>
  );
}

function AtalhoCard({
  href,
  icon,
  titulo,
  detalhe,
}: {
  href: string;
  icon: React.ReactNode;
  titulo: string;
  detalhe: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition hover:border-primary/50 hover:shadow-sm">
        <CardContent className="flex items-center gap-4 py-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{titulo}</div>
            <div className="truncate text-sm text-muted-foreground">
              {detalhe}
            </div>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
