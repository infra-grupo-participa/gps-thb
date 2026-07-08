import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById, getDocumentos } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { ClienteFicha } from "@/components/clientes/cliente-ficha";
import type { Documento } from "@/lib/types";

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

  const [aluno, documentos] = await Promise.all([
    getAlunoById(alunoId),
    getDocumentos(clienteId),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("")}
      />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/clientes"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar aos clientes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {cliente.nome || "Novo cliente"}
          </h1>
        </div>

        <ClienteFicha
          cliente={cliente}
          alunoId={alunoId}
          documentosIniciais={documentos as Documento[]}
        />
      </main>
    </>
  );
}
