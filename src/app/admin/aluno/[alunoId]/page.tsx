import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClienteEquipe,
  getClientesEtapa1,
  getEtapas,
  getEtapasLiberadasPara,
  getAmbiente,
  getProgressoAluno,
  getResumoDiario,
  contarMembrosDoAmbiente,
  alunoJaTemCliente,
} from "@/lib/data";
import {
  etapasComLiberacaoDoAluno,
  pctPorEtapa,
  proximoPasso,
} from "@/lib/etapas";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EtapasOverview } from "@/components/etapas-overview";
import { FavoritoDestaque } from "@/components/etapa/favorito-destaque";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { AssistBanner } from "@/components/admin/assist-banner";
import { GerenciarAcesso } from "@/components/admin/gerenciar-acesso";
import { DiarioResumoCard } from "@/components/admin/diario-resumo-card";
import { VoltarAoPainel } from "@/components/admin/voltar-ao-painel";

export default async function AdminAlunoInicioPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [
    aluno,
    { etapas, overrides },
    clientes,
    progressoTodas,
    favorito,
    resumoDiario,
    qtdMembros,
    jaTemCliente
  ] = await Promise.all([
    getAlunoById(alunoId),
    // Mesma regra do ambiente do aluno: `coalesce(override, global)`. Sem
    // isto o admin veria a etapa TRAVADA para este aluno como liberada e
    // acompanharia um caminho que não é o dele.
    // Os overrides seguem vivos: `EtapasOverview` explica "travada/liberada
    // pela equipe" com o motivo, igual à home do aluno.
    Promise.all([getEtapas(), getEtapasLiberadasPara(alunoId)]).then(
      ([todas, overrides]) => ({
        etapas: etapasComLiberacaoDoAluno(todas, overrides),
        overrides,
      }),
    ),
    getClientesEtapa1(alunoId),
    getProgressoAluno(alunoId),
    getClienteEquipe(alunoId),
    getResumoDiario(alunoId),
    contarMembrosDoAmbiente(alunoId),
    alunoJaTemCliente(alunoId)
  ]);

  const pcts = pctPorEtapa(clientes, progressoTodas);
  // Mesma regra do ambiente do aluno (PL2): tarefa travada não é próximo
  // passo. O admin vê o mesmo card que o aluno vê.
  const passo = proximoPasso(etapas, clientes, progressoTodas, {
    temFavorito: favorito !== null,
    // 🔑 Sem isto a HOME trava o passo que a Etapa 01 mostra liberado: quem
    // chegou COM cliente não é travado pela tarefa dos 30, e as duas telas
    // precisam dizer a mesma coisa.
    jaTemCliente,
  });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: qtdMembros > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={aluno?.nome ?? "Aluno"}
          descricao={aluno?.email}
          // 🔴 `href="/admin"` fixo apagava a aba, a busca, a ordem e os
          // filtros que a URL do painel guardava — e a âncora por `alunoId`
          // então apontava para um card fora da nova lista. `VoltarAoPainel`
          // devolve a ÚLTIMA URL do painel (`admin/painel-url.ts`).
          voltar={<VoltarAoPainel />}
          acao={
            <GerenciarAcesso alunoId={alunoId} nomeAluno={aluno?.nome ?? null} />
          }
        />

        <div className="mb-6">
          <DiarioResumoCard resumo={resumoDiario} basePath={base} />
        </div>

        {passo ? (
          <div className="mb-6">
            <ProximoPassoCard passo={passo} basePath={base} />
          </div>
        ) : null}

        {favorito ? (
          <div className="mb-6">
            <FavoritoDestaque cliente={favorito} basePath={base} />
          </div>
        ) : null}

        <EtapasOverview
          etapas={etapas}
          basePath={base}
          pctPorEtapa={pcts}
          overrides={overrides}
          allowLockedPreview
        />
      </main>
    </>
  );
}
