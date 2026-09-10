import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunosGps,
  getSolicitacoes,
  acharAlunosPorEmails,
  getEtapas,
  getAtendimentoPorAluno,
  getDashboard,
  faixasDeTrilha,
  resumoAtendimento,
  LIMITE_PAINEL_ALUNOS,
  LIMITE_PAINEL_ALUNOS_MAX,
} from "@/lib/data";
import { Inbox } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { adminNavItems } from "@/lib/nav";
import { CriarAcesso } from "@/components/admin/criar-acesso-botao";
import { SolicitacaoCard } from "@/components/admin/solicitacao-card";
import { EtapasControle } from "@/components/admin/etapas-controle";
import { AlunosAtivosLista } from "@/components/admin/alunos-ativos-lista";
import { AbasPainel } from "@/components/admin/abas-painel";
import { DashboardExecutivo } from "@/components/admin/dashboard";
import { RegistrarUrlDoPainel } from "@/components/admin/voltar-ao-painel";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { EmptyState } from "@/components/ui/empty-state";

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
  const [pagina, pendentes, etapas, atendimentoDiario, alunosPorEmail, dashboard] =
    await Promise.all([
      getAlunosGps({ limite }),
      pendentesPromise,
      getEtapas(),
      getAtendimentoPorAluno(),
      pendentesPromise.then((ps) => acharAlunosPorEmails(ps.map((s) => s.email))),
      // UMA ida ao banco para os 7 blocos agregados do dashboard
      // (`gps.admin_dashboard()`). Os cards 6 e 7 NÃO consultam nada: saem de
      // `faixasDeTrilha` e `resumoAtendimento`, funções puras sobre o que as
      // duas leituras acima já trouxeram.
      getDashboard(),
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

  // PL5 — contador da aba "Chamados" a partir do Map JÁ carregado
  // (`getAtendimentoPorAluno`): ZERO consulta nova. Sem ele, chamado novo só
  // aparecia para quem abrisse `/admin/chamados` por hábito — e a lista de
  // e-mails da equipe está vazia, então ninguém era avisado por fora também.
  // Conta o LOTE carregado, como todo número desta tela.
  const chamadosAbertos = [...atendimentoDiario.values()].reduce(
    (soma, a) => soma + a.chamadosAbertos,
    0,
  );

  // 🔑 C-9 — os 4 KPIs antigos ("Alunos no programa", "Com login", "Sem
  // login", "Solicitações") FORAM REMOVIDOS: os cards 1, 2 e 7 do dashboard
  // dizem os mesmos números **com variação do mês e com clique**, e o badge da
  // aba Solicitações já mostra a fila. Manter os dois seria dois lugares
  // dizendo o mesmo número — a tela substitui, não acumula.
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
        navItems={adminNavItems({ chamadosAbertos })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Painel do administrador"
          descricao="Gerencie os acessos e acompanhe os alunos em implementação assistida."
          acao={<CriarAcesso />}
        />

        {/* Grava a URL do painel (aba, busca, ordem, filtros, lote) a cada
            mudança, para o "← Voltar aos alunos" da ficha do aluno devolver
            esta mesma tela. Ver `admin/painel-url.ts`. */}
        <RegistrarUrlDoPainel />

        <AbasPainel
          totalAlunos={totalAlunos}
          pendentes={pendentes.length}
          visao={
            dashboard ? (
              <DashboardExecutivo
                dados={dashboard}
                trilha={faixasDeTrilha(alunos)}
                atendimento={resumoAtendimento(alunos, atendimentoDiario)}
                ambientesCarregados={alunos.length}
              />
            ) : (
              // `getDashboard()` devolve `null` em falha — e a tela diz isso
              // em vez de desenhar nove cards zerados. Um dashboard todo em
              // zero é indistinguível de um sistema vazio, e é assim que
              // alguém decide em cima de dado que não existe. A aba "Alunos"
              // continua funcionando.
              <AvisoInline>
                Não foi possível carregar a visão do programa agora. A aba
                Alunos não depende dela.
              </AvisoInline>
            )
          }
          ativos={
            <AlunosAtivosLista
              alunos={alunos}
              atendimentoPorAluno={atendimentoPorAluno}
              total={totalAlunos}
              carregarMaisHref={carregarMaisHref}
              carregarMaisQtd={proximoLote}
            />
          }
          solicitacoes={
            solicitacoesComMatch.length === 0 ? (
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
            )
          }
          etapas={<EtapasControle etapasIniciais={etapas} />}
        />
      </main>
    </>
  );
}
