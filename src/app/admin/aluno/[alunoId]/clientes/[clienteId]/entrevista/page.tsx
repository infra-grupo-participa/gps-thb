import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { FormularioEntrevistaPrevia } from "@/components/clientes/entrevista-previa/formulario";
import { PageHeader } from "@/components/ui/page-header";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById, contarMembrosDoAmbiente } from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";
import { iniciarEntrevistaPrevia } from "@/app/clientes/entrevista-previa-actions";
import { getEntrevistaEmAberto } from "@/lib/data/entrevista-previa";
import type { RespostasEntrevista } from "@/lib/entrevista-previa-calculo";

/**
 * `/admin/aluno/[alunoId]/clientes/[clienteId]/entrevista` — espelho da
 * entrevista do parceiro.
 *
 * 🔴 POR QUE EXISTE (defeito em produção, 24/09/2026): o painel da Entrevista
 * Prévia passou a aparecer no espelho do admin (23/09), mas o link "Nova
 * entrevista" continuava mirando `/clientes/[clienteId]/entrevista` — rota do
 * PARCEIRO, que redireciona `papel === "admin"` para `/admin`. Clique do
 * admin parecia "não iniciar nada". Decisão do orquestrador: em modo
 * assistência, o admin passa a CONDUZIR a entrevista por aqui, na rota que
 * ele de fato alcança.
 *
 * A RPC `gps.entrevista_previa_iniciar` só exige sessão (aceita admin); quem
 * grava é o `auth.uid()` de quem chama — a entrevista conduzida por aqui fica
 * com `criado_por` do ADMIN, não do parceiro.
 */
export const metadata = { title: "Entrevista Prévia" };

export default async function AdminAlunoEntrevistaPreviaPage({
  params,
}: {
  params: Promise<{ alunoId: string; clienteId: string }>;
}) {
  const { alunoId, clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const [cliente, aluno, qtdMembros] = await Promise.all([
    getClienteById(clienteId),
    getAlunoById(alunoId),
    contarMembrosDoAmbiente(alunoId),
  ]);
  // Mesma guarda da ficha espelho: o cliente tem de ser deste ambiente.
  if (!cliente || cliente.aluno_id !== alunoId) notFound();

  const abertura = await iniciarEntrevistaPrevia({
    clienteId,
    entrevistado: cliente.nome,
  });

  if (!abertura.ok) {
    return (
      <>
        <AppHeader
          nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
          email={ctx.user.email ?? null}
          papelRotulo="Admin"
          homeHref="/admin"
          navItems={assistenciaNavItems(alunoId, { ambienteCompartilhado: qtdMembros > 1 })}
        />
        <AssistBanner aluno={aluno} />
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
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, { ambienteCompartilhado: qtdMembros > 1 })}
      />
      <AssistBanner aluno={aluno} />
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
          conduzidoPor="admin"
          voltarHref={`/admin/aluno/${alunoId}/clientes/${clienteId}`}
        />
      </main>
    </>
  );
}
