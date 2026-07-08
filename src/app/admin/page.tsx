import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunosGps, contarSolicitacoesPendentes } from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { AdicionarAluno } from "@/components/admin/adicionar-aluno";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Admin — Alunos | GPS" };

export default async function AdminPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const [alunos, pendentes] = await Promise.all([
    getAlunosGps(),
    contarSolicitacoesPendentes(),
  ]);

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
            <h1 className="text-2xl font-semibold">Alunos no GPS</h1>
            <p className="text-muted-foreground">
              {alunos.length} aluno{alunos.length === 1 ? "" : "s"} em
              implementação assistida.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/solicitacoes"
              className={buttonVariants({ variant: "outline" })}
            >
              Solicitações
              {pendentes > 0 ? (
                <Badge className="ml-2">{pendentes}</Badge>
              ) : null}
            </Link>
            <AdicionarAluno />
          </div>
        </div>

        {alunos.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nenhum aluno no GPS ainda. Clique em{" "}
              <span className="font-medium">Adicionar aluno</span> para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {alunos.map(({ aluno, membro, pct, clientesPreenchidos, agendados }) => (
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
                          <Badge variant="secondary" className="text-[10px]">
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
            ))}
          </div>
        )}
      </main>
    </>
  );
}
