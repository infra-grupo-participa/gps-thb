import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getAmbiente } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { PastaView } from "@/components/pasta/pasta-view";

export const metadata = { title: "Pasta" };

export default async function PastaPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, ambiente] = await Promise.all([
    getAlunoById(ctx.alunoId),
    getAmbiente(ctx.alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        {/* UX6 — o cabeçalho afirmava "todos os documentos… organizados no
            Drive" mesmo para quem ainda não tem pasta nenhuma. A descrição
            passa a depender do estado real do ambiente. */}
        <PageHeader
          titulo="Minha pasta"
          descricao={
            ambiente?.pasta_drive_url
              ? "Os documentos do seu processo, organizados na sua pasta do Drive."
              : "Aqui fica a sua pasta de documentos no Drive, criada pela equipe durante a implementação."
          }
        />

        {/* PF4 — o formulário de admin NÃO é importado aqui: se estivesse,
            o código dele e a referência da Server Action de admin entrariam
            no bundle do aluno mesmo sem nunca renderizar. */}
        <PastaView pastaUrl={ambiente?.pasta_drive_url ?? null} isAdmin={false} />
      </main>
    </>
  );
}
