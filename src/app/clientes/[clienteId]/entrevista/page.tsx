import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { FormularioEntrevistaPrevia } from "@/components/clientes/entrevista-previa/formulario";
import { PageHeader } from "@/components/ui/page-header";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { iniciarEntrevistaPrevia } from "@/app/clientes/entrevista-previa-actions";
import { getEntrevistaEmAberto } from "@/lib/data/entrevista-previa";
import type { RespostasEntrevista } from "@/lib/entrevista-previa-calculo";

/**
 * `/clientes/[clienteId]/entrevista` — a Entrevista Prévia 2.0.
 *
 * Pedido do Marcio (23/09/2026): *"tem que ter na aba do cliente um botão pra
 * iniciar a entrevista prévia"*, e o botão leva para cá.
 *
 * 🔴 ROTA PRÓPRIA, não um diálogo dentro da ficha. A entrevista dura 15-20
 * minutos ao vivo, com o parceiro falando ao telefone: um modal que fecha por
 * Esc ou clique-fora perderia a conversa inteira. Rota tem URL, sobrevive a
 * refresh, e a RPC retoma a entrevista em aberto.
 *
 * 🔴 A entrevista abre NO SERVIDOR, antes de pintar a tela. Se ela nascesse
 * no clique do primeiro botão, uma falha de rede deixaria o parceiro
 * respondendo perguntas que não estão sendo gravadas em lugar nenhum.
 */
export const metadata = { title: "Entrevista Prévia" };

export default async function EntrevistaPreviaPage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [cliente, aluno] = await Promise.all([
    getClienteById(clienteId),
    getAlunoById(alunoId),
  ]);
  // Mesma guarda da ficha: o cliente tem de ser deste ambiente.
  if (!cliente || cliente.aluno_id !== alunoId) notFound();

  const abertura = await iniciarEntrevistaPrevia({
    clienteId,
    entrevistado: cliente.nome,
  });

  if (!abertura.ok) {
    return (
      <>
        <AppHeader
          nome={aluno?.nome ?? ctx.user.email ?? null}
          email={ctx.user.email ?? null}
          papelRotulo="Parceiro"
          navItems={navDoAluno(ctx)}
        />
        <main id="conteudo" className="mx-auto w-full max-w-2xl px-4 pt-8 pb-16">
          <PageHeader titulo="Entrevista Prévia" />
          <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
            {abertura.erro}
          </p>
        </main>
      </>
    );
  }

  // Retomada: se a conversa caiu no meio, as respostas já marcadas voltam.
  const emAberto = await getEntrevistaEmAberto(abertura.entrevistaId);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-2xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Entrevista Prévia"
          descricao={`Conversa com ${cliente.nome ?? "o cliente"}. Leia as perguntas em voz alta e marque o que ele responder — o perfil DISC é gerado no final, sozinho.`}
        />
        <FormularioEntrevistaPrevia
          entrevistaId={abertura.entrevistaId}
          clienteId={clienteId}
          clienteNome={cliente.nome ?? "o cliente"}
          entrevistado={cliente.nome ?? null}
          respostasIniciais={(emAberto?.respostas ?? {}) as RespostasEntrevista}
          voltarHref={`/clientes/${clienteId}`}
        />
      </main>
    </>
  );
}
