import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembro, getTurmaCodigo } from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PerfilEditor } from "@/components/perfil/perfil-editor";
import type { Aluno } from "@/lib/types";

export const metadata = { title: "Meu perfil | GPS" };

export default async function PerfilPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, membro] = await Promise.all([
    getAlunoById(ctx.alunoId),
    getMembro(ctx.alunoId),
  ]);
  const turma = await getTurmaCodigo(aluno?.turma_id);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("")}
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao início
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Meu perfil</h1>
        </div>

        <PerfilEditor
          aluno={(aluno ?? { id: ctx.alunoId }) as Aluno}
          turma={turma}
          perfilInicial={membro?.perfil ?? {}}
        />
      </main>
    </>
  );
}
