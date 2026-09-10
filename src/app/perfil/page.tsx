import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getMembroDoUsuario,
  getMeuOnboarding,
  getTurmaCodigo,
} from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { PerfilEditor } from "@/components/perfil/perfil-editor";
import { RespostasDoInicio } from "@/components/perfil/respostas-do-inicio";
import { TrocarNome } from "@/components/perfil/trocar-nome";
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
  const [aluno, membro, onboarding] = await Promise.all([
    getAlunoById(pessoaAlunoId),
    getMembroDoUsuario(ctx.user.id),
    // As respostas do dia 0 — só de leitura. A seção SOME quando a pessoa não
    // respondeu: quem ainda não passou pelo questionário não precisa de uma
    // caixa vazia dizendo isso, ele abre sozinho no próximo acesso.
    getMeuOnboarding(),
  ]);
  const turma = await getTurmaCodigo(aluno?.turma_id);
  const abas = navDoAluno(ctx);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={abas}
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

          <TrocarNome nomeAtual={aluno?.nome ?? null} />
          <TrocarSenha />

          {/* Somente leitura, e isso é decisão: a resposta é o RETRATO do dia
              0 e serve para a equipe saber de onde a pessoa partiu. O estado
              vivo é o cliente, na aba Clientes — deixar editar aqui criaria
              duas verdades sobre o mesmo caso, e a antiga venceria por ser a
              mais visível. Junto vem "Rever a apresentação", a contrapartida
              de o tour ser pulável (B-T2). */}
          <RespostasDoInicio dados={onboarding} />
        </div>
      </main>
    </>
  );
}
