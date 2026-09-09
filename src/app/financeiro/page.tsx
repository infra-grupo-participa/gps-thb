import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { getFinanceiroDoAluno } from "@/lib/financeiro";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { FinanceiroView } from "@/components/financeiro/financeiro-view";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Financeiro" };

/**
 * O contrato do programa do aluno TITULAR — só leitura, lido de
 * `cs.contatos_hm` pela RPC `gps.financeiro_do_aluno`.
 *
 * 🔴 DEFESA EM PROFUNDIDADE (B7-b): o sócio não vê o Financeiro. Esconder a
 * aba em `alunoNavItems` é cosmética — quem digita `/financeiro` na barra de
 * endereço chega aqui de qualquer jeito. Então a página reconfere o papel e
 * redireciona, e a RPC levanta 42501 mesmo que os dois falhem. `alunoId` é o
 * do AMBIENTE; para o titular ele é o próprio cadastro, e é justamente por
 * isso que o sócio (que compartilha o mesmo `alunoId`) precisa ser barrado
 * pelo PAPEL, nunca pelo id.
 */
export default async function FinanceiroPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");
  if (ctx.papelMembro !== "titular") redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, resultado] = await Promise.all([
    getAlunoById(alunoId),
    getFinanceiroDoAluno(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("", { financeiro: true })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader
          titulo="Financeiro"
          descricao="Seu contrato com o Grupo Participa: quanto é, quanto já foi pago e o que ainda falta."
        />
        <FinanceiroView resultado={resultado} ehAdmin={false} />
      </main>
    </>
  );
}
