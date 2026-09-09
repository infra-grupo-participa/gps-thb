import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunosGps,
  getSolicitacoes,
  acharAlunosPorEmails,
  getEtapas,
  getAtendimentoPorAluno,
  LIMITE_PAINEL_ALUNOS,
  LIMITE_PAINEL_ALUNOS_MAX,
} from "@/lib/data";
import { Users, UserCheck, UserX, Inbox } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { adminNavItems } from "@/lib/nav";
import { CriarAcesso } from "@/components/admin/criar-acesso";
import { SolicitacaoCard } from "@/components/admin/solicitacao-card";
import { EtapasControle } from "@/components/admin/etapas-controle";
import { AlunosAtivosLista } from "@/components/admin/alunos-ativos-lista";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "Admin — Alunos" };

/**
 * Quantas vezes o admin já pediu "Mostrar mais". O lote DOBRA a cada rodada
 * (200 → 400 → 800 → …), preso ao teto que a RPC aplica de qualquer jeito.
 *
 * 🔑 O tamanho do lote mora na URL, não em `useState`: o Server Component é
 * quem consulta o banco, então guardar isso no cliente exigiria uma segunda
 * fonte de verdade (e um `useEffect` refazendo a busca). Com `?mais=`, voltar
 * pelo histórico devolve a mesma tela e recarregar não perde o lote.
 *
 * `mais` inválido (texto, negativo, `Infinity`) vira 0 — nunca erro de tela.
 */
function limiteDoPainel(mais: string | undefined): number {
  const rodadas = Math.min(Math.max(Math.trunc(Number(mais)) || 0, 0), 10);
  return Math.min(
    LIMITE_PAINEL_ALUNOS * 2 ** rodadas,
    LIMITE_PAINEL_ALUNOS_MAX,
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ mais?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { mais } = await searchParams;
  const rodadasPedidas = Math.min(Math.max(Math.trunc(Number(mais)) || 0, 0), 10);
  const limite = limiteDoPainel(mais);

  // A sugestão de vínculo depende da lista de pendentes, então são 2 estágios
  // — mas o segundo dispara assim que `getSolicitacoes` resolve, em paralelo
  // com as outras leituras, em vez de esperar o `Promise.all` inteiro.
  // Antes: um `acharAlunoPorEmail` POR solicitação, em série, depois de tudo.
  const pendentesPromise = getSolicitacoes("pendente");
  const [pagina, pendentes, etapas, atendimentoDiario, alunosPorEmail] =
    await Promise.all([
      getAlunosGps({ limite }),
      pendentesPromise,
      getEtapas(),
      getAtendimentoPorAluno(),
      pendentesPromise.then((ps) => acharAlunosPorEmails(ps.map((s) => s.email))),
    ]);
  const { alunos, total: totalAlunos } = pagina;
  // Map -> objeto simples porque `Map` não atravessa a fronteira Server ->
  // Client Component. Ambiente sem nota nenhuma não tem chave aqui.
  const atendimentoPorAluno = Object.fromEntries(atendimentoDiario);
  const solicitacoesComMatch = pendentes.map((s) => ({
    solicitacao: s,
    alunoSugerido:
      alunosPorEmail.get((s.email ?? "").trim().toLowerCase()) ?? null,
  }));

  const comLogin = alunos.filter((a) => a.temLogin).length;
  const semLogin = alunos.length - comLogin;
  // O lote não cobre a base inteira: os KPIs de login contam só o que veio, e
  // o `hint` tem de dizer isso. Número parcial apresentado como total é a
  // mesma classe de erro do "R$ 0,00" em campo que nasceu vazio.
  const parcial = alunos.length < totalAlunos;
  const proximoLimite = limiteDoPainel(String(rodadasPedidas + 1));
  // Quantos ambientes o próximo clique acrescenta DE FATO (nunca prometer
  // mais do que existe, nem mais do que o teto permite).
  const proximoLote = Math.min(proximoLimite, totalAlunos) - alunos.length;
  const carregarMaisHref =
    parcial && proximoLote > 0 ? `/admin?mais=${rodadasPedidas + 1}` : null;

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Painel do administrador"
          descricao="Gerencie os acessos e acompanhe os alunos em implementação assistida."
          acao={<CriarAcesso />}
        />

        {/* Resumo */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icone={<Users className="size-4" />}
            rotulo="Alunos no programa"
            valor={String(totalAlunos)}
            hint="em implementação assistida"
            destaque
          />
          <KpiCard
            icone={<UserCheck className="size-4" />}
            rotulo="Com login"
            valor={String(comLogin)}
            hint={
              parcial
                ? `entre os ${alunos.length} carregados`
                : "já podem acessar"
            }
          />
          <KpiCard
            icone={<UserX className="size-4" />}
            rotulo="Sem login"
            valor={String(semLogin)}
            hint={
              parcial
                ? `entre os ${alunos.length} carregados`
                : "ambiente sem acesso"
            }
          />
          <KpiCard
            icone={<Inbox className="size-4" />}
            rotulo="Solicitações"
            valor={String(pendentes.length)}
            hint="aguardando decisão"
          />
        </div>

        <Tabs defaultValue="ativos" className="gap-6">
          <TabsList>
            <TabsTrigger value="ativos">
              Alunos ativos
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {totalAlunos}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="solicitacoes">
              Solicitações
              {pendentes.length > 0 ? (
                <Badge className="ml-1.5 text-[10px]">{pendentes.length}</Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="etapas">Etapas</TabsTrigger>
          </TabsList>

          {/* Alunos ativos */}
          <TabsContent value="ativos">
            <AlunosAtivosLista
              alunos={alunos}
              atendimentoPorAluno={atendimentoPorAluno}
              total={totalAlunos}
              carregarMaisHref={carregarMaisHref}
              carregarMaisQtd={proximoLote}
            />
          </TabsContent>

          {/* Solicitações */}
          <TabsContent value="solicitacoes">
            {solicitacoesComMatch.length === 0 ? (
              <EmptyState
                icone={<Inbox />}
                titulo="Nenhuma solicitação pendente."
                descricao="Quando alguém pedir acesso ao portal, o pedido aparece aqui para você aprovar ou recusar."
              />
            ) : (
              <div className="grid gap-3">
                {solicitacoesComMatch.map(({ solicitacao, alunoSugerido }) => (
                  <SolicitacaoCard
                    key={solicitacao.id}
                    solicitacao={solicitacao}
                    alunoSugerido={alunoSugerido}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Etapas */}
          <TabsContent value="etapas">
            <EtapasControle etapasIniciais={etapas} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
