import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembroDoUsuario, getTurmaCodigo } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { PerfilEditor } from "@/components/perfil/perfil-editor";
import { TrocarSenha } from "@/components/perfil/trocar-senha";
import type { Aluno } from "@/lib/types";

export const metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  // A pessoa logada: para o titular é o mesmo aluno do ambiente; para o
  // sócio é o próprio cadastro (`membroAlunoId`), não o do titular.
  const pessoaAlunoId = ctx.membroAlunoId ?? ctx.alunoId;
  const [aluno, membro] = await Promise.all([
    getAlunoById(pessoaAlunoId),
    getMembroDoUsuario(ctx.user.id),
  ]);
  const turma = await getTurmaCodigo(aluno?.turma_id);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Meu perfil"
          voltar={
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início
            </Link>
          }
        />

        <div className="grid gap-6">
          <PerfilEditor
            aluno={(aluno ?? { id: pessoaAlunoId }) as Aluno}
            turma={turma}
            perfilInicial={membro?.perfil ?? {}}
          />

          <TrocarSenha />
        </div>
      </main>
    </>
  );
}
