import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunosGps,
  getSolicitacoes,
  acharAlunosPorEmails,
  getEtapas,
  getPendenciasPorAluno,
} from "@/lib/data";
import { Users, UserCheck, UserX, Inbox } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { adminNavItems } from "@/lib/nav";
import { CriarAcesso } from "@/components/admin/criar-acesso";
import { SolicitacaoCard } from "@/components/admin/solicitacao-card";
import { EtapasControle } from "@/components/admin/etapas-controle";
import { AlunosAtivosLista } from "@/components/admin/alunos-ativos-lista";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Admin — Alunos" };

export default async function AdminPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  // A sugestão de vínculo depende da lista de pendentes, então são 2 estágios
  // — mas o segundo dispara assim que `getSolicitacoes` resolve, em paralelo
  // com as outras leituras, em vez de esperar o `Promise.all` inteiro.
  // Antes: um `acharAlunoPorEmail` POR solicitação, em série, depois de tudo.
  const pendentesPromise = getSolicitacoes("pendente");
  const [alunos, pendentes, etapas, pendenciasDiario, alunosPorEmail] =
    await Promise.all([
      getAlunosGps(),
      pendentesPromise,
      getEtapas(),
      getPendenciasPorAluno(),
      pendentesPromise.then((ps) => acharAlunosPorEmails(ps.map((s) => s.email))),
    ]);
  const pendenciasPorAluno = Object.fromEntries(pendenciasDiario);
  const solicitacoesComMatch = pendentes.map((s) => ({
    solicitacao: s,
    alunoSugerido:
      alunosPorEmail.get((s.email ?? "").trim().toLowerCase()) ?? null,
  }));

  const comLogin = alunos.filter((a) => a.temLogin).length;
  const semLogin = alunos.length - comLogin;

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Painel do administrador</h1>
            <p className="text-muted-foreground">
              Gerencie os acessos e acompanhe os alunos em implementação
              assistida.
            </p>
          </div>
          <CriarAcesso />
        </div>

        {/* Resumo */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="size-4" />}
            label="Alunos no programa"
            value={String(alunos.length)}
            hint="em implementação assistida"
            destaque
          />
          <StatCard
            icon={<UserCheck className="size-4" />}
            label="Com login"
            value={String(comLogin)}
            hint="já podem acessar"
          />
          <StatCard
            icon={<UserX className="size-4" />}
            label="Sem login"
            value={String(semLogin)}
            hint="ambiente sem acesso"
          />
          <StatCard
            icon={<Inbox className="size-4" />}
            label="Solicitações"
            value={String(pendentes.length)}
            hint="aguardando decisão"
          />
        </div>

        <Tabs defaultValue="ativos" className="gap-6">
          <TabsList>
            <TabsTrigger value="ativos">
              Alunos ativos
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {alunos.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="solicitacoes">
              Solicitações
              {pendentes.length > 0 ? (
                <Badge className="ml-1.5 text-[10px]">{pendentes.length}</Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="etapas">Etapas</TabsTrigger>
          </TabsList>

          {/* Alunos ativos */}
          <TabsContent value="ativos">
            <AlunosAtivosLista
              alunos={alunos}
              pendenciasPorAluno={pendenciasPorAluno}
            />
          </TabsContent>

          {/* Solicitações */}
          <TabsContent value="solicitacoes">
            {solicitacoesComMatch.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  Nenhuma solicitação pendente.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {solicitacoesComMatch.map(({ solicitacao, alunoSugerido }) => (
                  <SolicitacaoCard
                    key={solicitacao.id}
                    solicitacao={solicitacao}
                    alunoSugerido={alunoSugerido}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Etapas */}
          <TabsContent value="etapas">
            <EtapasControle etapasIniciais={etapas} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
