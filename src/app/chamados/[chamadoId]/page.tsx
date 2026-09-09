import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { getChamado, getSuporteAberto } from "@/lib/chamados-data";
import { rotuloStatus } from "@/lib/chamados-tipos";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ChamadoThread } from "@/components/chamados/chamado-thread";
import { ChamadoResponder } from "@/components/chamados/chamado-responder";
import { estadoDaResposta } from "@/components/chamados/estado-resposta";

export const metadata = { title: "Chamado" };

/**
 * A thread de um chamado, na visão do aluno.
 *
 * `getChamado` devolve `null` tanto para "não existe" quanto para "não é seu"
 * — a RLS não distingue os dois, e a tela não pode distinguir também, senão
 * vira oráculo de existência de chamado alheio. Os dois viram 404.
 */
export default async function ChamadoPage({
  params,
}: {
  params: Promise<{ chamadoId: string }>;
}) {
  const { chamadoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect(`/admin/chamados/${chamadoId}`);
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, dados, suporteAberto] = await Promise.all([
    getAlunoById(ctx.alunoId),
    getChamado(chamadoId),
    getSuporteAberto(),
  ]);
  if (!dados) notFound();

  const { chamado, mensagens } = dados;
  const estado = estadoDaResposta(
    chamado,
    mensagens.length,
    "aluno",
    suporteAberto,
  );

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("", {
          financeiro: ctx.papelMembro === "titular",
        })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 py-8">
        <PageHeader
          voltar={
            <Link
              href="/chamados"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar aos chamados
            </Link>
          }
          titulo={chamado.assunto}
          descricao={
            <Badge
              variant={chamado.status === "fechado" ? "secondary" : "outline"}
            >
              {rotuloStatus(chamado.status, "aluno")}
            </Badge>
          }
        />

        <div className="grid gap-6">
          <ChamadoThread mensagens={mensagens} visao="aluno" />
          <ChamadoResponder
            chamadoId={chamado.id}
            visao="aluno"
            podeAnexar
            bloqueio={estado.bloqueio}
            aviso={estado.aviso}
            podeFechar={estado.podeFechar}
          />
        </div>
      </main>
    </>
  );
}
