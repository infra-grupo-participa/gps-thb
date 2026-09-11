import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembrosDoAmbiente } from "@/lib/data";
import { getChamadosDoAmbiente } from "@/lib/chamados-data";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChamadosLista } from "@/components/chamados/chamados-lista";

export const metadata = { title: "Chamados do parceiro" };

/**
 * Modo assistência: a MESMA lista que o aluno vê, do lado da equipe — inclusive
 * os chamados FECHADOS, que não aparecem na fila de `/admin/chamados` (aquela
 * lê só o que ainda espera resposta). É aqui que se responde "o que já
 * aconteceu com esse ambiente".
 *
 * Sem botão de abrir chamado: o admin NÃO abre chamado em nome do aluno
 * (B5-c/`gps.chamado_abrir` exige `gps.aluno_atual()`, que é nulo para a
 * equipe). Se a equipe precisa registrar algo sobre o aluno, o lugar é o
 * Diário.
 *
 * Os itens levam para `/admin/chamados/<id>` — a thread do admin —, não para
 * `/chamados/<id>`, que redireciona o admin de volta.
 */
export default async function AdminAlunoChamadosPage({
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

  const [aluno, chamados] = await Promise.all([
    getAlunoById(alunoId),
    getChamadosDoAmbiente(alunoId),
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

      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <Link
              href={`/admin/aluno/${alunoId}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao ambiente do parceiro
            </Link>
          }
          titulo={`Chamados de ${aluno?.nome ?? "parceiro"}`}
          descricao="Todos os chamados deste ambiente, abertos e fechados. Responder e fechar acontece na thread."
        />

        {chamados.length === 0 ? (
          <EmptyState
            icone={<LifeBuoy />}
            titulo="Este parceiro nunca abriu um chamado."
            descricao="A aba Suporte já aparece no portal dele. Quando abrir, o chamado entra na fila da equipe."
          />
        ) : (
          <ChamadosLista
            chamados={chamados}
            basePath="/admin/chamados"
            visao="admin"
          />
        )}
      </main>
    </>
  );
}
