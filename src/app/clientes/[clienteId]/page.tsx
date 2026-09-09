import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ClienteFicha } from "@/components/clientes/cliente-ficha";

export default async function ClienteFichaPage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const cliente = await getClienteById(clienteId);
  if (!cliente || cliente.aluno_id !== alunoId) notFound();

  const aluno = await getAlunoById(alunoId);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={cliente.nome || "Novo cliente"}
          voltar={
            <Link
              href="/clientes"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar aos clientes
            </Link>
          }
        />

        <ClienteFicha cliente={cliente} alunoId={alunoId} />
      </main>
    </>
  );
}
