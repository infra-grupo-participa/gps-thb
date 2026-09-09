import { Map } from "lucide-react";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import {
  getEtapas,
  getAlunoById,
  getClientesEtapa1,
  getProgressoAluno,
  getMinhaSolicitacao,
  getMembroDoUsuario,
  getMembrosDoAmbiente,
  getTurmaCodigo,
  getClienteEquipe,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { pctPorEtapa, proximoPasso } from "@/lib/etapas";
import { calcularMetricasEtapa1, resumoHonorarios } from "@/lib/etapa1";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { EtapasOverview } from "@/components/etapas-overview";
import { FavoritoDestaque } from "@/components/etapa/favorito-destaque";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { HomeResumo } from "@/components/home-resumo";
import { PerfilHero } from "@/components/perfil/perfil-hero";
import { ThbLogo } from "@/components/thb-logo";
import { AmbienteCompartilhadoBanner } from "@/components/ambiente-compartilhado-banner";
import type { Aluno } from "@/lib/types";

export default async function HomePage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  if (ctx.papel === "admin") redirect("/admin");

  if (ctx.papel === "sem_acesso") {
    const solicitacao = await getMinhaSolicitacao(ctx.user.id);
    const recusada = solicitacao?.status === "recusada";

    return (
      <main
        id="conteudo"
        className="flex min-h-screen items-center justify-center p-4"
      >
        <Card className="max-w-md">
          {/* Sem `pt-6`: o `Card` já paga `py-(--card-spacing)` — o padding
              somava e o topo do card ficava maior que a base. */}
          <CardContent className="flex flex-col items-center gap-4 text-center">
            <ThbLogo />
            <Badge variant={recusada ? "destructive" : "secondary"}>
              {recusada ? "Solicitação não aprovada" : "Aguardando liberação"}
            </Badge>
            <div>
              <h1 className="text-lg font-semibold">
                {recusada
                  ? "Sua solicitação não foi aprovada"
                  : "Solicitação recebida!"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {recusada ? (
                  <>
                    Fale com a equipe do Time Holding Brasil para entender os
                    próximos passos.
                    {solicitacao?.observacao
                      ? ` Observação: ${solicitacao.observacao}`
                      : ""}
                  </>
                ) : (
                  <>
                    Sua conta ({ctx.user.email}) está aguardando a liberação da
                    equipe do Time Holding Brasil. Você receberá acesso ao
                    programa assim que for aprovado.
                  </>
                )}
              </p>
            </div>
            <LogoutButton linkStyle />
          </CardContent>
        </Card>
      </main>
    );
  }

  // Aluno — alunoId é o AMBIENTE (compartilhado); membroAlunoId é a PESSOA.
  const alunoId = ctx.alunoId!;
  const souSocio = ctx.papelMembro === "socio";
  // Identidade da PESSOA logada: o titular já é `alunoAmbiente`; o sócio
  // busca o próprio cadastro por `membroAlunoId` (não reaproveita o do
  // titular). Essa busca NÃO depende de nenhuma das outras, então entra no
  // mesmo lote — antes era um await em série pendurado no fim do caminho
  // crítico (~44 ms de round-trip a sa-east-1 só para o sócio).
  const [
    etapas,
    alunoAmbiente,
    clientes,
    progressoTodas,
    membro,
    favorito,
    membros,
    alunoSocio,
  ] = await Promise.all([
    getEtapas(),
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getProgressoAluno(alunoId),
    getMembroDoUsuario(ctx.user.id),
    getClienteEquipe(alunoId),
    getMembrosDoAmbiente(alunoId),
    souSocio && ctx.membroAlunoId
      ? getAlunoById(ctx.membroAlunoId)
      : Promise.resolve(null),
  ]);
  const aluno = souSocio ? alunoSocio : alunoAmbiente;
  const nomeExibicao = souSocio ? (aluno?.nome ?? ctx.membroNome) : aluno?.nome;
  // PF3 — único estágio 2 que sobrou, e ele FICA. Depende de `aluno.turma_id`,
  // que só existe depois do lote acima, e o aluno é `alunoAmbiente` OU
  // `alunoSocio` conforme o papel: não há como saber a turma antes de saber de
  // quem é a ficha. Resolver isto exige um join `thb_alunos → thb_turmas` em
  // `getAlunoById`, que é consulta de outra camada (`src/lib/data/alunos.ts`) e
  // muda o contrato de quem mais a chama — feature, não ajuste de onda.
  const turma = await getTurmaCodigo(aluno?.turma_id);

  const pcts = pctPorEtapa(clientes, progressoTodas);
  // `temFavorito` decide se os passos 4-8 da Etapa 01 contam como próximo
  // passo: sem o cliente da equipe eles ficam travados, e o card não pode
  // apontar para um checkbox desabilitado (PL2).
  const passo = proximoPasso(etapas, clientes, progressoTodas, {
    temFavorito: favorito !== null,
  });

  const manual1: Record<number, boolean> = {};
  for (const p of progressoTodas.filter((p) => p.etapa === 1))
    manual1[p.tarefa] = p.concluida;
  const m1 = calcularMetricasEtapa1(clientes, manual1);
  // Meta de faturamento (B8): mesma lista de clientes já carregada acima —
  // zero query nova. A regra mora em `resumoHonorarios` para que a home, a aba
  // Clientes e o painel do admin mostrem o MESMO número.
  const honorarios = resumoHonorarios(clientes);
  const valoresPct = Object.values(pcts);
  const progressoGeral = valoresPct.length
    ? Math.round(valoresPct.reduce((a, b) => a + b, 0) / valoresPct.length)
    : 0;

  return (
    <>
      <AppHeader
        nome={nomeExibicao ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Seu programa"
          descricao="Onde você está no Programa de Implementação Assistida — e o que fazer agora."
          className="mb-4"
        />

        {membros.length > 1 ? (
          <AmbienteCompartilhadoBanner
            nomeTitular={alunoAmbiente?.nome ?? null}
            souSocio={souSocio}
          />
        ) : null}

        <PerfilHero
          aluno={(aluno ?? { id: ctx.membroAlunoId ?? alunoId }) as Aluno}
          turma={turma}
          perfil={membro?.perfil ?? {}}
          editHref="/perfil"
        />

        {passo ? (
          <div className="mt-6">
            <ProximoPassoCard passo={passo} basePath="" />
          </div>
        ) : null}

        {/* Conteúdo: jornada (principal) + resumo (apoio) lado a lado. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {favorito ? (
              <FavoritoDestaque cliente={favorito} basePath="" />
            ) : null}

            <Secao titulo="Seu caminho" icone={<Map />}>
              <EtapasOverview etapas={etapas} basePath="" pctPorEtapa={pcts} dense />
            </Secao>
          </div>

          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <HomeResumo
                progressoGeral={progressoGeral}
                clientes={m1.preenchidos}
                clientesComDados={m1.comDados}
                agendados={m1.agendados}
                perdaTotal={m1.perdaTotal}
                honorarios={honorarios}
              />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
