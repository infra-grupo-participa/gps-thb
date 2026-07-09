import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembro, getTurmaCodigo } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { PerfilEditor } from "@/components/perfil/perfil-editor";
import type { Aluno } from "@/lib/types";

export const metadata = { title: "Perfil do aluno" };

export default async function AdminAlunoPerfilPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const membro = await getMembro(alunoId);
  if (!membro) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const aluno = await getAlunoById(alunoId);
  const turma = await getTurmaCodigo(aluno?.turma_id);

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

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link
            href={base}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao ambiente do aluno
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Perfil de {aluno?.nome}
          </h1>
        </div>

        <PerfilEditor
          aluno={(aluno ?? { id: alunoId }) as Aluno}
          turma={turma}
          perfilInicial={membro.perfil ?? {}}
          alunoId={alunoId}
        />
      </main>
    </>
  );
}
