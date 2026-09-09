import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembrosDoAmbiente } from "@/lib/data";
import { getFinanceiroDoAluno } from "@/lib/financeiro";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { FinanceiroView } from "@/components/financeiro/financeiro-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Financeiro do aluno" };

/**
 * O mesmo extrato que o aluno vê, do lado da equipe — é a tela que o admin
 * abre quando o aluno pergunta "quanto eu ainda devo?".
 *
 * `ehAdmin` só ACRESCENTA: a frase técnica do estado sem registro (para o time
 * saber que é lacuna de cadastro, não bug) e a linha de divergência de cálculo.
 * Nenhum número muda de valor entre as duas telas — se mudasse, admin e aluno
 * discutiriam olhando dados diferentes.
 *
 * Somente leitura aqui também: quem edita o contrato é o cadastro financeiro
 * do Grupo Participa, e a RPC não tem um único comando de escrita.
 */
export default async function AdminAlunoFinanceiroPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const membros = await getMembrosDoAmbiente(alunoId);
  if (membros.length === 0) notFound();

  const [aluno, resultado] = await Promise.all([
    getAlunoById(alunoId),
    getFinanceiroDoAluno(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: membros.length > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader
          voltar={
            <Link
              href={`/admin/aluno/${alunoId}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao ambiente do aluno
            </Link>
          }
          titulo={`Financeiro de ${aluno?.nome ?? "aluno"}`}
          descricao="Contrato do programa lido do cadastro financeiro do Grupo Participa. Somente leitura — o portal não edita esses valores. O sócio do ambiente não vê esta aba."
        />
        <FinanceiroView resultado={resultado} ehAdmin />
      </main>
    </>
  );
}
