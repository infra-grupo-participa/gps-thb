import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById, getMembro } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { ClienteFicha } from "@/components/clientes/cliente-ficha";

export default async function AdminAlunoClienteFichaPage({
  params,
}: {
  params: Promise<{ alunoId: string; clienteId: string }>;
}) {
  const { alunoId, clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const membro = await getMembro(alunoId);
  if (!membro) notFound();

  const cliente = await getClienteById(clienteId);
  if (!cliente || cliente.aluno_id !== alunoId) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const aluno = await getAlunoById(alunoId);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={alunoNavItems(base)}
      />
      <AssistBanner aluno={aluno} />

      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Link
            href={`${base}/clientes`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar aos clientes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {cliente.nome || "Novo cliente"}
          </h1>
        </div>

        <ClienteFicha cliente={cliente} alunoId={alunoId} />
      </main>
    </>
  );
}
