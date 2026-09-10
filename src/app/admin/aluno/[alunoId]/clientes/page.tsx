import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClientesEtapa1,
  getAmbiente,
  contarMembrosDoAmbiente,
} from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { ClientesManager } from "@/components/clientes/clientes-manager";

export default async function AdminAlunoClientesPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [aluno, clientes, qtdMembros] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    contarMembrosDoAmbiente(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: qtdMembros > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={`Clientes de ${aluno?.nome ?? ""}`}
          descricao="Gerencie os clientes e documentos no ambiente do aluno."
        />

        {/* `admin` mantém a estrela clicável no Modo Assistência: desde a
            migração ...215 a troca do cliente acompanhado é da EQUIPE, e é
            aqui que ela acontece. Quem autoriza é a trigger do banco. */}
        <ClientesManager
          alunoId={alunoId}
          clientesIniciais={clientes}
          basePath={base}
          admin
        />
      </main>
    </>
  );
}
