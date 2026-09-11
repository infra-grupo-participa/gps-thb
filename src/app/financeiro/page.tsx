import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
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

  const sessao = ctx;

  // ⏸️ EM ESPERA (decisão do Marcio, 10/09/2026). A aba já aparece apagada
  // com "em breve" (`navDoAluno`), mas a ROTA continuava aberta por URL —
  // esconder o link nunca foi fronteira. Quem digitar `/financeiro` vê a
  // mesma promessa, não a tela pela metade.
  //
  // 🔑 O corpo antigo (cálculo, guarda do sócio B7-b, avisos de dado
  // ausente) NÃO ficou comentado aqui: código morto que nem compila é pior
  // que código removido. Ele está inteiro no git — `git show 985b708 --
  // src/app/financeiro/page.tsx` devolve a página que funcionava. As RPCs
  // (`gps.financeiro_do_aluno`, `financeiro_extrato_do_aluno`) seguem VIVAS
  // e guardadas no banco; nada foi apagado do lado do dado.
  return (
    <>
      <AppHeader
        nome={null}
        email={sessao.user?.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(sessao)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-6">
        <PageHeader
          titulo="Financeiro"
          descricao="Seu progresso de faturamento e o pagamento do programa."
        />
        <EmptyState
          icone={<Clock />}
          titulo="Em breve"
          descricao="Estamos finalizando esta área. Assim que ela ficar pronta, você verá aqui o seu faturamento no programa e a situação do seu pagamento."
        />
      </main>
    </>
  );
}
