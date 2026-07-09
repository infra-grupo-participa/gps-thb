import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunosGps,
  getSolicitacoes,
  acharAlunoPorEmail,
  getEtapas,
} from "@/lib/data";
import { Users, UserCheck, UserX, Inbox } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { CriarAcesso } from "@/components/admin/criar-acesso";
import { SolicitacaoCard } from "@/components/admin/solicitacao-card";
import { EtapasControle } from "@/components/admin/etapas-controle";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Admin — Alunos" };

export default async function AdminPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const [alunos, pendentes, etapas] = await Promise.all([
    getAlunosGps(),
    getSolicitacoes("pendente"),
    getEtapas(),
  ]);
  const solicitacoesComMatch = await Promise.all(
    pendentes.map(async (s) => ({
      solicitacao: s,
      alunoSugerido: await acharAlunoPorEmail(s.email),
    })),
  );

  const comLogin = alunos.filter((a) => a.membro.user_id).length;
  const semLogin = alunos.length - comLogin;

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
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
            {alunos.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  Nenhum aluno ativo ainda. Use{" "}
                  <span className="font-medium">Criar acesso</span> para começar.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {alunos.map(
                  ({ aluno, membro, pct, clientesPreenchidos, agendados }) => (
                    <Link
                      key={membro.id}
                      href={`/admin/aluno/${membro.aluno_id}`}
                      className="block"
                    >
                      <Card className="transition hover:border-primary/50 hover:shadow-sm">
                        <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {aluno?.nome ?? "Aluno sem nome"}
                              </span>
                              {membro.user_id ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  com login
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  sem login
                                </Badge>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {aluno?.email}
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <div className="text-sm font-semibold">
                                {clientesPreenchidos}/30
                              </div>
                              <div className="text-[10px] uppercase text-muted-foreground">
                                clientes
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-sm font-semibold">
                                {agendados}/15
                              </div>
                              <div className="text-[10px] uppercase text-muted-foreground">
                                reuniões
                              </div>
                            </div>
                            <div className="w-32">
                              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                                <span>Etapa 01</span>
                                <span>{pct}%</span>
                              </div>
                              <Progress value={pct} />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ),
                )}
              </div>
            )}
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
