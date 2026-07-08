import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getSolicitacoes, acharAlunoPorEmail } from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { SolicitacaoCard } from "@/components/admin/solicitacao-card";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Admin — Solicitações | GPS" };

export default async function SolicitacoesPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const pendentes = await getSolicitacoes("pendente");
  const comMatch = await Promise.all(
    pendentes.map(async (s) => ({
      solicitacao: s,
      alunoSugerido: await acharAlunoPorEmail(s.email),
    })),
  );

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar aos alunos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Solicitações de acesso
          </h1>
          <p className="text-muted-foreground">
            {pendentes.length} solicitação{pendentes.length === 1 ? "" : "ões"}{" "}
            pendente{pendentes.length === 1 ? "" : "s"}.
          </p>
        </div>

        {pendentes.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nenhuma solicitação pendente.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {comMatch.map(({ solicitacao, alunoSugerido }) => (
              <SolicitacaoCard
                key={solicitacao.id}
                solicitacao={solicitacao}
                alunoSugerido={alunoSugerido}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
