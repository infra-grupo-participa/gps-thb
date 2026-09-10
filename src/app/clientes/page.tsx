import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClientesEtapa1 } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ClientesManager } from "@/components/clientes/clientes-manager";

export const metadata = { title: "Clientes" };

export default async function ClientesPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, clientes] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        {/* A aba deixou de se apresentar como "os 30 da Etapa 01": ela é a
            central de TODOS os clientes do aluno, em qualquer estágio (§E.2).
            Quem chega com um caso em execução precisa saber que ele cabe aqui
            — o portal já aceitava, mas não dizia. */}
        <PageHeader
          titulo="Clientes"
          descricao="Todos os seus clientes — os novos, os que já estão em andamento e os que já estão em execução."
        />

        <ClientesManager
          alunoId={alunoId}
          clientesIniciais={clientes}
          basePath=""
        />
      </main>
    </>
  );
}
