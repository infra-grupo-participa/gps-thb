import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ConducaoDaEntrevista } from "@/components/clientes/entrevista-previa/conducao";
import { PageHeader } from "@/components/ui/page-header";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";

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
 * 🔴 O render SÓ LÊ (01/10/2026). Abrir a linha no servidor a cada GET
 * gerava EP vazia/duplicada (prefetch, refresh, aba repetida). A linha nasce
 * no "Começar", e a primeira pergunta só abre depois do ok da RPC — falha
 * de rede vira erro na abertura, nunca pergunta respondida sem gravar. Ver
 * `ConducaoDaEntrevista`.
 */
export const metadata = { title: "Entrevista Prévia" };

export default async function EntrevistaPreviaPage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ nova?: string | string[] }>;
}) {
  const [{ clienteId }, sp] = await Promise.all([params, searchParams]);
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
          descricao={`Conversa com ${cliente.nome ?? "o cliente"}. Leia as perguntas em voz alta e marque o que ele responder. São perguntas rápidas (até 15), cerca de 8 minutos, e no fim já marca a Reunião Preliminar.`}
        />
        <ConducaoDaEntrevista
          alunoId={alunoId}
          clienteId={clienteId}
          clienteNome={cliente.nome ?? null}
          dataReuniaoPreliminar={cliente.data_reuniao_preliminar}
          conduzidoPor="parceiro"
          voltarHref={`/clientes/${clienteId}`}
          nova={sp.nova === "1"}
        />
      </main>
    </>
  );
}
