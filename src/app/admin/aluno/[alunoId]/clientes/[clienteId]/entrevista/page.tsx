import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { ConducaoDaEntrevista } from "@/components/clientes/entrevista-previa/conducao";
import { PageHeader } from "@/components/ui/page-header";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById, contarMembrosDoAmbiente } from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";

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
 *
 * 🔴 O render SÓ LÊ (01/10/2026): a linha nasce no "Começar" — ver
 * `ConducaoDaEntrevista`. É o destino do "Abrir entrevista" de
 * `/admin/sessoes`, e o prefetch daquele `<Link>` não pode gravar nada.
 */
export const metadata = { title: "Entrevista Prévia" };

export default async function AdminAlunoEntrevistaPreviaPage({
  params,
  searchParams,
}: {
  params: Promise<{ alunoId: string; clienteId: string }>;
  searchParams: Promise<{ nova?: string | string[] }>;
}) {
  const [{ alunoId, clienteId }, sp] = await Promise.all([params, searchParams]);
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
          descricao={`Conversa com ${cliente.nome ?? "o cliente"}. Leia as perguntas em voz alta e marque o que ele responder. São perguntas rápidas (até 15), cerca de 8 minutos. A equipe não marca a Reunião Preliminar por aqui: o horário se combina com o parceiro.`}
        />
        <ConducaoDaEntrevista
          alunoId={alunoId}
          clienteId={clienteId}
          clienteNome={cliente.nome ?? null}
          dataReuniaoPreliminar={cliente.data_reuniao_preliminar}
          conduzidoPor="admin"
          voltarHref={`/admin/aluno/${alunoId}/clientes/${clienteId}`}
          nova={sp.nova === "1"}
        />
      </main>
    </>
  );
}
