import { Map } from "lucide-react";
import { redirect } from "next/navigation";
import { getContextoSessao, ehEquipeDaEsteira } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { linkWhatsapp } from "@/lib/whatsapp";
import { LogoutButton } from "@/components/logout-button";
import {
  getEtapas,
  getEtapasLiberadasPara,
  getAlunoById,
  getClientesEtapa1,
  getProgressoAluno,
  getMinhaSolicitacao,
  getMembroDoUsuario,
  getMembrosDoAmbiente,
  getTurmaCodigo,
  getClienteEquipe,
  alunoJaTemCliente,
  getTutoriaisAtivo,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  etapasComLiberacaoDoAluno,
  pctPorEtapa,
  proximoPasso,
} from "@/lib/etapas";
import { calcularMetricasEtapa1, resumoHonorarios } from "@/lib/etapa1";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { EtapasOverview } from "@/components/etapas-overview";
import { FavoritoDestaque } from "@/components/etapa/favorito-destaque";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { TudoEmDiaCard } from "@/components/etapa/tudo-em-dia-card";
import { HomeResumo } from "@/components/home-resumo";
import { PerfilHero } from "@/components/perfil/perfil-hero";
import { ThbLogo } from "@/components/thb-logo";
import { AmbienteCompartilhadoBanner } from "@/components/ambiente-compartilhado-banner";
import type { Aluno } from "@/lib/types";

/**
 * O root layout traz `title.template = "%s | Programa de Implementação
 * Assistida"`, mas sem `metadata` aqui a aba caía no `default` do template —
 * o mesmo rótulo do portal inteiro. Com oito abas abertas nada distinguia o
 * início das outras telas.
 */
export const metadata = { title: "Início" };

export default async function HomePage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  if (ctx.papel === "admin") redirect("/admin");

  // 🔴 A ORDEM AQUI É A TRAVA — não mover para antes do `redirect("/admin")`
  // acima. `ehEquipeDaEsteira()` devolve `true` também para admin (é
  // ADITIVA a `ehAdmin()`, ver o comentário em `auth.ts:172`). Se este bloco
  // viesse ANTES do redirect de admin, os 14 admins perderiam `/admin` e
  // cairiam todos em `/admin/fila` — regressão que COMPILA e passa no
  // build. O guard é `ctx.papel !== "aluno"` (não `=== "sem_acesso"`): assim
  // os 135 alunos nunca chamam `ehEquipeDaEsteira()` (custo zero para eles),
  // e o admin já saiu pelo redirect acima antes de chegar aqui.
  if (ctx.papel !== "aluno") {
    if (await ehEquipeDaEsteira()) redirect("/admin/fila");
  }

  if (ctx.papel === "sem_acesso") {
    const { solicitacao, falhou } = await getMinhaSolicitacao(ctx.user.id);
    const recusada = solicitacao?.status === "recusada";
    // `null` = nem pendente nem recusada: o cargo dela não é lido pelo GPS
    // (gps.membros não tem vínculo, e agora também não é operador ativo).
    // `gps.solicitacoes_acesso` está VAZIA — ninguém preencheu ela pedindo
    // aprovação, então "Aguardando liberação" seria mentira: não há fila,
    // não há o que a equipe aprovar. Ver Tarefa B1.
    //
    // 🔑 `!falhou` é a trava: a frase nova AFIRMA um fato sobre o cadastro da
    // pessoa ("não há pedido registrado"). Só se pode afirmar isso depois de
    // conseguir consultar. Com o banco fora do ar, cai no ramo neutro — que
    // não promete aprovação nem nega a existência do pedido.
    const semSolicitacao = solicitacao === null && !recusada && !falhou;

    // 🔑 SÓ para quem não tem solicitação. Os outros dois estados já dizem a
    // verdade ("aguardando" tem pedido de verdade na fila; "não aprovada" tem
    // decisão registrada) e continuam idênticos — inclusive sem a ida ao
    // banco, que é desperdício em quem já tem a frase certa.
    //
    // **Falha fechado**, mesmo contrato do `BotaoSecretaria`: sem número
    // configurado em `gps.config.whatsapp_secretaria` o link não aparece e a
    // tela fica só com a frase honesta. Melhor sem saída do que com uma saída
    // que abre conversa vazia. A equipe troca o número pelo painel, sem deploy.
    let zapSecretaria: string | null = null;
    if (semSolicitacao || falhou) {
      const supabase = await createClient();
      const { data } = await supabase.schema("gps").rpc("whatsapp_secretaria");
      if (typeof data === "string" && data) {
        // `ctx.user.email` é `string | undefined` no tipo `User` do Supabase.
        // Sem o fallback, um e-mail ausente escreveria a palavra "undefined"
        // dentro da mensagem que a pessoa manda para a secretaria.
        const email = ctx.user.email ?? "";
        // A mensagem muda com o estado: no ramo `falhou` não se pode afirmar
        // que a conta está sem acesso — só que a consulta não respondeu.
        const assunto = falhou
          ? "mas a tela não conseguiu verificar minha situação"
          : "mas minha conta não está ligada a nenhum acesso";
        zapSecretaria = linkWhatsapp(
          data,
          `Olá! Entrei no Programa de Implementação Assistida${email ? ` com o e-mail ${email}` : ""}, ${assunto}.`,
        );
      }
    }

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
            <Badge
              variant={
                recusada
                  ? "destructive"
                  : falhou || semSolicitacao
                    ? "outline"
                    : "secondary"
              }
            >
              {recusada
                ? "Solicitação não aprovada"
                : falhou
                  ? "Não foi possível verificar"
                  : semSolicitacao
                    ? "Conta sem acesso vinculado"
                    : "Aguardando liberação"}
            </Badge>
            <div>
              <h1 className="text-lg font-semibold">
                {recusada
                  ? "Sua solicitação não foi aprovada"
                  : falhou
                    ? "Não conseguimos verificar seu acesso agora"
                    : semSolicitacao
                      ? "Sua conta ainda não está ligada ao Programa"
                      : "Solicitação recebida!"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {falhou ? (
                  <>
                    Houve uma falha ao consultar a situação da sua conta (
                    {ctx.user.email}). Isso não diz nada sobre o seu acesso —
                    só que a consulta não respondeu. Atualize a página em
                    alguns instantes; se continuar, fale com a equipe.
                  </>
                ) : semSolicitacao ? (
                  <>
                    Sua conta ({ctx.user.email}) foi autenticada, mas não está
                    ligada a nenhum acesso do Programa — e não há pedido de
                    liberação registrado para ela. Isto não é uma fila de
                    espera: ninguém foi avisado automaticamente. Fale com a
                    equipe para pedir o vínculo.
                  </>
                ) : recusada ? (
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
            {zapSecretaria ? (
              <a
                href={zapSecretaria}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium underline underline-offset-4"
              >
                Falar com a secretaria
              </a>
            ) : null}
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
    etapasEOverrides,
    alunoAmbiente,
    clientes,
    progressoTodas,
    membro,
    favorito,
    membros,
    alunoSocio,
    jaTemCliente
  ] = await Promise.all([
    // Liberação POR ALUNO: `coalesce(override, global)`. O override
    // (`gps.etapa_liberacao_aluno`) manda nos dois sentidos — libera quem está
    // adiantado e trava quem precisa refazer. As duas leituras vão juntas para
    // não virar `await` em série no caminho crítico da home.
    // Os overrides seguem VIVOS depois de resolver a liberação: `EtapasOverview`
    // precisa deles para dizer POR QUE uma etapa está travada (ou aberta) só
    // para este aluno — a decisão da equipe vem com motivo escrito.
    Promise.all([getEtapas(), getEtapasLiberadasPara(alunoId)]).then(
      ([todas, overrides]) => ({
        etapas: etapasComLiberacaoDoAluno(todas, overrides),
        overrides,
      }),
    ),
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getProgressoAluno(alunoId),
    getMembroDoUsuario(ctx.user.id),
    getClienteEquipe(alunoId),
    getMembrosDoAmbiente(alunoId),
    souSocio && ctx.membroAlunoId
      ? getAlunoById(ctx.membroAlunoId)
      : Promise.resolve(null),
    alunoJaTemCliente(alunoId)
  ]);
  const { etapas, overrides } = etapasEOverrides;
  const aluno = souSocio ? alunoSocio : alunoAmbiente;
  // `alunoSocio` já é `getAlunoById(ctx.membroAlunoId)` — o nome do sócio vem
  // dali. O `?? ctx.membroNome` que existia aqui era o último consumidor de um
  // campo que ficou SEMPRE null em 10/09 (o `ilike` em `thb_alunos.email` saiu
  // do contexto de sessão), ou seja: um fallback que nunca mais caía.
  const nomeExibicao = aluno?.nome ?? null;
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
    // 🔑 Sem isto a HOME trava o passo que a Etapa 01 mostra liberado: quem
    // chegou COM cliente não é travado pela tarefa dos 30, e as duas telas
    // precisam dizer a mesma coisa.
    jaTemCliente,
  });

  const manual1: Record<number, boolean> = {};
  for (const p of progressoTodas.filter((p) => p.etapa === 1))
    manual1[p.tarefa] = p.concluida;
  const m1 = calcularMetricasEtapa1(clientes, manual1);
  // Meta de faturamento (B8): mesma lista de clientes já carregada acima —
  // zero query nova. A regra mora em `resumoHonorarios` para que a home, a aba
  // Clientes e o painel do admin mostrem o MESMO número.
  const honorarios = resumoHonorarios(clientes);
  // 🔑 Progresso geral = média das etapas LIBERADAS (decisão de produto de
  // 09/09/2026), não das seis. Dividindo por 6, a Etapa 01 inteira — tudo o
  // que o aluno TEM como fazer hoje — aparecia como 17%, e ele lia isso como
  // "quase nada feito". A régua vai escrita na tela ("1 de 6 etapas"), e
  // `pctPorEtapa` continua igual: o número POR etapa não mudou.
  const liberadas = etapas.filter((e) => e.liberada);
  const valoresPct = liberadas.map((e) => pcts[e.id] ?? 0);
  const progressoGeral = valoresPct.length
    ? Math.round(valoresPct.reduce((a, b) => a + b, 0) / valoresPct.length)
    : 0;

  // A etapa que o hero anuncia é a do próximo passo; sem passo pendente (tudo
  // em dia), é a liberada mais avançada. Nunca inventa etapa: sem nenhuma
  // liberada, o hero fica só com a identidade.
  // A próxima etapa que ainda não abriu para ele — só para a frase de
  // expectativa do "tudo em dia". `null` quando as seis já estão liberadas.
  const proximaBloqueada =
    [...etapas]
      .sort((a, b) => a.ordem - b.ordem)
      .find((e) => !e.liberada) ?? null;

  const etapaDoHero =
    (passo ? etapas.find((e) => e.id === passo.etapa) : null) ??
    [...liberadas].sort((a, b) => b.ordem - a.ordem)[0] ??
    null;

  const tutoriaisAtivo = await getTutoriaisAtivo();

  return (
    <>
      <AppHeader
        nome={nomeExibicao ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      {/* `pb-16`: o conteúdo encostava no fim da viewport (B.3 do plano). */}
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
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
          programa={
            etapaDoHero
              ? {
                  etapaOrdem: etapaDoHero.ordem,
                  etapaNome: etapaDoHero.nome,
                  pct: pcts[etapaDoHero.id] ?? 0,
                  honorariosTotal: honorarios.total,
                }
              : undefined
          }
        />

        {/* O lugar mais forte da home nunca fica vazio: com passo pendente é o
            `ProximoPassoCard`; sem nenhum, o card diz que está tudo em dia e o
            que esperar. Antes o bloco simplesmente sumia. */}
        <div className="mt-6">
          {passo ? (
            <ProximoPassoCard passo={passo} basePath="" />
          ) : (
            <TudoEmDiaCard proximaEtapa={proximaBloqueada} />
          )}
        </div>

        {/* Conteúdo: jornada (principal) + resumo (apoio) lado a lado.
            🔑 No CELULAR o resumo sobe (`order-first`): a home mobile tinha
            5.350 px e o painel com progresso, meta e números do aluno era a
            ÚLTIMA coisa da página — ele rolava seis cards de etapa (≈900 px)
            para chegar aos próprios números. `order-*` no grid, sem duplicar
            DOM: um só `<aside>`, que no desktop volta para a direita. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {favorito ? (
              <FavoritoDestaque cliente={favorito} basePath="" />
            ) : null}

            <Secao titulo="Seu caminho" icone={<Map />}>
              <EtapasOverview
                etapas={etapas}
                basePath=""
                pctPorEtapa={pcts}
                overrides={overrides}
                dense
              />
            </Secao>
          </div>

          <aside className="order-first lg:order-none lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <HomeResumo
                progressoGeral={progressoGeral}
                etapasLiberadas={liberadas.length}
                totalEtapas={etapas.length}
                clientes={m1.preenchidos}
                clientesComDados={m1.comDados}
                agendados={m1.agendados}
                honorarios={honorarios}
              />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
