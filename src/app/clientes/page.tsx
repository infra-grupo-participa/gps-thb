import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClientesEtapa1, getTutoriaisAtivo } from "@/lib/data";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ClientesManager } from "@/components/clientes/clientes-manager";

export const metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ novo?: string | string[] }>;
}) {
  // `?novo=1` vem do card "Continue de onde parou" e abre o "Novo cliente".
  // Só o valor EXATO "1" liga: qualquer outra coisa (array, "true", "") não.
  const { novo } = await searchParams;
  const abrirNovo = novo === "1";
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, clientes, tutoriaisAtivo] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getTutoriaisAtivo(),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        {/* João 06/10: sem parágrafo de descrição. */}
        <PageHeader
          titulo="Clientes"
        />

        <ClientesManager
          alunoId={alunoId}
          clientesIniciais={clientes}
          basePath=""
          abrirNovoAoMontar={abrirNovo}
        />
      </main>
    </>
  );
}
