import Link from "next/link";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { getFinanceiroDoAluno } from "@/lib/financeiro";
import { alunoNavItems, navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { FinanceiroView } from "@/components/financeiro/financeiro-view";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Financeiro" };

/**
 * O contrato do programa do aluno TITULAR — só leitura, lido de
 * `cs.contatos_hm` pela RPC `gps.financeiro_do_aluno`.
 *
 * 🔴 DEFESA EM PROFUNDIDADE (B7-b): o sócio não vê o Financeiro. Esconder a
 * aba em `navDoAluno` é cosmética — quem digita `/financeiro` na barra de
 * endereço chega aqui de qualquer jeito. Então a página reconfere o papel, e
 * a RPC levanta 42501 mesmo que os dois falhem. `alunoId` é o do AMBIENTE;
 * para o titular ele é o próprio cadastro, e é justamente por isso que o
 * sócio (que compartilha o mesmo `alunoId`) precisa ser barrado pelo PAPEL,
 * nunca pelo id.
 *
 * ⚠️ A recusa do sócio é uma PÁGINA, não um `redirect("/")` (FN2). O redirect
 * mudo mandava o sócio de volta à home sem dizer nada: o mesmo efeito de um
 * link quebrado, e ele tentava de novo. A regra tem um motivo simples de
 * escrever — o contrato é de quem contratou —, então a tela escreve. E manda
 * ao Suporte, que é do AMBIENTE e onde a equipe responde.
 *
 * 🔒 Para o sócio a página NÃO chama `getFinanceiroDoAluno`. A guarda da RPC
 * continua de pé (42501), mas pedir um dado que se sabe negado só produziria
 * um erro previsível no log — e a tela não tem nada a fazer com a resposta.
 */
export default async function FinanceiroPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;

  if (ctx.papelMembro !== "titular") {
    // `alunoId` é o ambiente, ou seja, o cadastro do TITULAR; `membroAlunoId`
    // é o do sócio logado — o header mostra o nome dele, o texto mostra o do
    // titular. Sem cadastro legível, o texto cai numa frase que não depende
    // de nome nenhum, em vez de exibir um espaço em branco.
    const [pessoa, titular] = await Promise.all([
      getAlunoById(ctx.membroAlunoId ?? alunoId),
      getAlunoById(alunoId),
    ]);
    const nomeTitular = titular?.nome?.trim();

    return (
      <>
        <AppHeader
          nome={pessoa?.nome ?? ctx.user.email ?? null}
          email={ctx.user.email ?? null}
          papelRotulo="Aluno"
          navItems={navDoAluno(ctx)}
        />
        <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-8">
          <PageHeader titulo="Financeiro" />
          <EmptyState
            icone={<LifeBuoy />}
            titulo="O Financeiro é do titular do ambiente"
            descricao={`O contrato do programa está no nome de ${
              nomeTitular || "quem contratou o programa"
            }. Se precisar de algo dele, fale com a equipe pelo Suporte.`}
            acao={
              <Link href="/chamados" className={buttonVariants()}>
                Ir para o Suporte
              </Link>
            }
          />
        </main>
      </>
    );
  }

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
