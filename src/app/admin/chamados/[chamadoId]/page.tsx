import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { getChamado, getSolicitacaoDoChamado } from "@/lib/chamados-data";
import { rotuloStatus } from "@/lib/chamados-tipos";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ChamadoThread } from "@/components/chamados/chamado-thread";
import { ChamadoResponder } from "@/components/chamados/chamado-responder";
import { estadoDaResposta } from "@/components/chamados/estado-resposta";
import { FaixaSolicitacao } from "@/components/chamados/faixa-solicitacao";
import { AcoesSolicitacao } from "@/components/admin/chamados/acoes-solicitacao";

/**
 * 🔑 `cache()` do React: `generateMetadata` e a página pedem o MESMO chamado, e
 * as duas rodam na mesma requisição. Sem isto, pôr o assunto no título custaria
 * uma segunda leitura de `gps.chamados` + mensagens por abertura de tela.
 */
const carregarChamado = cache(getChamado);

/**
 * O assunto no título da aba. Com oito abas abertas — o dia normal da equipe —
 * "Admin — Chamado" oito vezes não distingue nada.
 *
 * A guarda de papel está aqui também: metadata é gerada em paralelo com a
 * página, e quem não é admin não deve ver o assunto nem pelo título.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ chamadoId: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") return { title: "Chamado" };
  const { chamadoId } = await params;
  const dados = await carregarChamado(chamadoId);
  if (!dados) return { title: "Chamado" };
  const assunto = dados.chamado.assunto?.trim();
  return { title: assunto ? `${assunto} — chamado` : "Chamado" };
}

/**
 * A thread na visão da equipe.
 *
 * 🔴 `podeAnexar={false}` (B5-c): só o aluno anexa. A equipe responde com
 * texto e link — o Drive já é o repositório do time. Isso corta metade da
 * superfície de upload e metade do crescimento de storage por um custo quase
 * nulo. Esconder o campo não é a fronteira: `criarUploadAssinadoDeAnexo`
 * recusa para o admin e a policy `gps.pode_anexar_chamado` recusa de novo.
 *
 * `suporteAberto` entra como `true` de propósito: o interruptor fecha a
 * ENTRADA (o aluno), nunca a saída. A equipe continua respondendo e fechando
 * mesmo com o canal desligado — desligar não pode deixar ninguém no meio do
 * caminho sem resposta.
 */
export default async function AdminChamadoPage({
  params,
}: {
  params: Promise<{ chamadoId: string }>;
}) {
  const { chamadoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const dados = await carregarChamado(chamadoId);
  if (!dados) notFound();

  const { chamado, mensagens } = dados;
  const ehTroca =
    chamado.categoria === "troca_cliente" || chamado.categoria === "troca_socio";
  const [aluno, solicitacao] = await Promise.all([
    getAlunoById(chamado.aluno_id),
    ehTroca ? getSolicitacaoDoChamado(chamadoId) : Promise.resolve(null),
  ]);
  const estado = estadoDaResposta(chamado, mensagens.length, "admin", true);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <Link
              href="/admin/chamados"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar à fila
            </Link>
          }
          titulo={chamado.assunto}
          descricao={
            <span className="flex flex-wrap items-center gap-2">
              <Badge
                variant={chamado.status === "fechado" ? "secondary" : "default"}
              >
                {rotuloStatus(chamado.status, "admin")}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {aluno?.nome ?? "Ambiente sem nome"}
              </span>
            </span>
          }
          acao={
            <Link
              href={`/admin/aluno/${chamado.aluno_id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Abrir o ambiente
            </Link>
          }
        />

        <div className="grid gap-6">
          {solicitacao ? (
            <div className="grid gap-3">
              <FaixaSolicitacao solicitacao={solicitacao} />
              <AcoesSolicitacao
                chamadoId={chamado.id}
                alunoId={chamado.aluno_id}
                assuntoChamado={chamado.assunto}
                solicitacao={solicitacao}
              />
            </div>
          ) : null}
          <ChamadoThread mensagens={mensagens} visao="admin" />
          <ChamadoResponder
            chamadoId={chamado.id}
            visao="admin"
            podeAnexar={false}
            bloqueio={estado.bloqueio}
            aviso={estado.aviso}
            podeFechar={estado.podeFechar}
          />
        </div>
      </main>
    </>
  );
}
