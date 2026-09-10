import {
  FileSignature,
  GraduationCap,
  IdCard,
  LifeBuoy,
  ListChecks,
  TrendingUp,
  UserRound,
  UserRoundPlus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Barras, BarraEmpilhada, Funil, Linha, Rosca } from "@/components/ui/graficos";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { Secao } from "@/components/ui/secao";
import { brlOuTraco } from "@/lib/moeda";
import { formatarDataHora } from "@/lib/datas";
import { FASES_CLIENTE } from "@/lib/etapa1";
import type {
  Dashboard,
  FaixaDeTrilha,
  ResumoAtendimento,
} from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";
import { VariacaoDoMes } from "./variacao";
import {
  ORDEM_POR_PROGRESSO,
  ROTULO_GRAU_RELACAO,
  TOM_DA_FAIXA,
  TOM_DA_FASE,
  diaCurto,
  nomeDoMes,
  rotuloDoMes,
} from "./tipos";

/**
 * Dashboard executivo do painel — **macro → micro → onde atacar**.
 *
 * 🔑 Quatro regras que este arquivo existe para cumprir:
 *
 * 1. **Um card, um número, um destino.** Todo card lidera com o macro, reparte
 *    em micro na linha seguinte e termina num link para a lista filtrada de
 *    gente. Os dois que não têm destino (atividade e grau de relação) dizem
 *    por escrito que são leitura, não fila. **Todo `href` daqui aponta para um
 *    valor da allowlist de `alunos-ativos-lista/estado-na-url.ts`** — link
 *    para filtro inventado é descartado no parse e vira um clique que não faz
 *    nada.
 * 2. **Vazio é resultado, com instrução** — nunca tela quebrada, nunca dado de
 *    demonstração. O card 3 nasce 0/0/158 e diz o que fazer; o 5 nasce zerado;
 *    o 9 nasce inteiro em "não informado". Precedente: o hero do Financeiro
 *    sem contratado mostra a instrução, não "R$ 0 de R$ 150.000".
 * 3. **Nenhum número inventado.** `META_HONORARIOS` é por ambiente; somar
 *    158 × 150 mil para fabricar uma "meta do programa" é proibido. O card 5
 *    mostra o absoluto e quantos ambientes bateram a meta DELES. E nenhuma
 *    tela escreve valor de saldo do programa (BLOQUEIO B-S1).
 * 4. **Comparação só onde ela existe.** Os cards 1 e 4 comparam com o MESMO
 *    intervalo do mês anterior e escrevem "até o dia N". O card 3 não compara:
 *    a RPC devolve `concluidos_no_mes` e não tem o par do mês anterior —
 *    então ele diz o número do mês e para por aí, em vez de fabricar um "vs."
 *    a partir de zero.
 *
 * Recebe TUDO pronto: `dados` vem de UMA RPC agregada (`gps.admin_dashboard()`)
 * e os cards 6 e 7 vêm de duas funções PURAS sobre o que `/admin` já carregou
 * (`getAlunosGps` e `getAtendimentoPorAluno`) — **zero consulta nova**, que é o
 * crédito de otimização desta frente. Server Component: os cinco gráficos são
 * SVG e custam 0 KB de JavaScript.
 */
export function DashboardExecutivo({
  dados,
  trilha,
  atendimento,
  ambientesCarregados,
}: {
  dados: Dashboard;
  /** Card 6 — `faixasDeTrilha(alunos)`, pura, sobre o lote carregado. */
  trilha: FaixaDeTrilha[];
  /** Card 7 — `resumoAtendimento(alunos, atendimento)`, pura, sobre o lote. */
  atendimento: ResumoAtendimento;
  /**
   * Quantos ambientes o lote trouxe. Os cards 6 e 7 valem **sobre o lote**
   * (mesma Leitura A da busca e dos filtros); quando ele não cobre a base
   * inteira, os dois dizem isso — número parcial apresentado como total é a
   * mesma classe de erro do "R$ 0,00" em campo que nasceu vazio.
   */
  ambientesCarregados: number;
}) {
  const { referencia, programa, acesso, onboarding, clientes, honorarios } = dados;

  const mesAtual = nomeDoMes(referencia.mes);
  const mesAnterior = nomeDoMes(referencia.mesAnterior);
  const mes = { mesAtual, mesAnterior };

  const jaEntraram = Math.max(0, acesso.comLogin - acesso.nuncaEntraram);
  const ninguemRespondeu =
    onboarding.concluidos === 0 && onboarding.emAndamento === 0;
  const grauInformado = dados.grauRelacao.itens.reduce((s, g) => s + g.qtd, 0);
  const parcial = ambientesCarregados < programa.total;
  const sufixoDoLote = parcial
    ? ` · sobre os ${ambientesCarregados} ambientes carregados`
    : "";

  /**
   * Os 12 meses vêm do banco, mas os meses ANTERIORES ao primeiro ingresso são
   * zeros de calendário, não resultado: o programa começou em julho/2026, e
   * nove linhas de "0" empurravam o card para o dobro da altura dos vizinhos
   * sem dizer nada. Corta só o começo — um zero no MEIO da série é informação
   * (um mês sem ninguém entrando) e continua aparecendo.
   */
  const primeiroComEntrada = programa.porMes.findIndex((m) => m.qtd > 0);
  const mesesCrus =
    primeiroComEntrada > 0
      ? programa.porMes.slice(primeiroComEntrada)
      : programa.porMes;
  // Dois anos na mesma série exigem o ano no rótulo: senão dois setembros
  // diferentes viram a mesma coluna com o mesmo nome.
  const cruzaAno =
    new Set(mesesCrus.map((m) => m.mes.slice(0, 4))).size > 1;
  const mesesDoGrafico = mesesCrus.map((m) => ({
    rotulo: rotuloDoMes(m.mes, cruzaAno),
    valor: m.qtd,
  }));

  const variacaoPrograma = {
    atual: programa.noMes,
    anterior: programa.noMesAnteriorAteODia,
    ateODia: referencia.dia,
  };
  const variacaoClientes = {
    atual: clientes.noMes,
    anterior: clientes.noMesAnteriorAteODia,
    ateODia: referencia.dia,
  };

  const porFase = [
    { fase: "prospeccao" as const, clientes: clientes.prospeccao },
    { fase: "fechamento" as const, clientes: clientes.fechamento },
    { fase: "contratado" as const, clientes: clientes.contratado },
  ];

  const faixaCem = trilha.find((f) => f.faixa === "100")?.qtd ?? 0;
  const esperandoEquipe = atendimento.pendenciasAbertas + atendimento.chamadosAbertos;

  const atividade = dados.atividade.map((d) => ({
    dia: diaCurto(d.dia),
    aluno: d.aluno,
    equipe: d.equipe,
  }));
  const totalAluno = atividade.reduce((s, d) => s + d.aluno, 0);
  const totalEquipe = atividade.reduce((s, d) => s + d.equipe, 0);

  return (
    <Secao
      icone={<TrendingUp />}
      titulo="Visão do programa"
      descricao={`Cada número leva à lista de quem está por trás dele. As comparações do mês param no mesmo dia do mês anterior — está escrito em cada card. Dados de ${formatarDataHora(dados.geradoEm)}.`}
      className="mb-8"
      classeConteudo="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {/* 1 — quem está no programa */}
      <CardDashboard
        icone={<Users />}
        rotulo="No programa"
        valor={String(programa.total)}
        destaque
        variacao={
          <VariacaoDoMes
            variacao={variacaoPrograma}
            {...mes}
            substantivo="entradas"
          />
        }
        micro={`${programa.noMes} ${programa.noMes === 1 ? "entrou" : "entraram"} em ${mesAtual}`}
        link={{ href: "/admin?ordem=recentes", rotulo: "Ver os mais recentes" }}
      >
        <Barras
          dados={mesesDoGrafico}
          tom="marca"
          // O `aria-label` carrega a série INTEIRA em texto: é o canal de quem
          // não vê o desenho, e ele não pode ser mais pobre do que a tela.
          resumo={`Entradas por mês: ${mesesDoGrafico.map((p) => `${p.rotulo} ${p.valor}`).join(", ")}.`}
          tituloTabela="Entradas por mês"
          colunasTabela={mesesDoGrafico.length > 6 ? 2 : 1}
        />
      </CardDashboard>

      {/* 2 — acesso */}
      <CardDashboard
        icone={<IdCard />}
        rotulo="Acesso ao portal"
        valor={`${jaEntraram} de ${acesso.total}`}
        valorDescricao={`${jaEntraram} de ${acesso.total} ambientes já entraram no portal`}
        micro={`${acesso.semLogin} sem login · ${acesso.nuncaEntraram} com login que nunca entraram`}
        link={{ href: "/admin?f=sem_login", rotulo: "Ver quem está sem login" }}
      >
        <BarraEmpilhada
          segmentos={[
            { rotulo: "Já entraram", valor: jaEntraram, tom: "sucesso" },
            {
              rotulo: "Com login, nunca entraram",
              valor: acesso.nuncaEntraram,
              tom: "atencao",
            },
            { rotulo: "Sem login", valor: acesso.semLogin, tom: "risco" },
          ]}
          resumo={`De ${acesso.total} ambientes: ${jaEntraram} já entraram, ${acesso.nuncaEntraram} têm login mas nunca entraram e ${acesso.semLogin} não têm login.`}
          tituloTabela="Situação de acesso"
        />
      </CardDashboard>

      {/* 3 — onboarding. Sem "vs. mês anterior": a RPC devolve as conclusões do
          mês corrente e NÃO o mesmo intervalo do anterior. Fabricar a
          comparação a partir de zero anunciaria "+N" para sempre. */}
      <CardDashboard
        icone={<ListChecks />}
        rotulo="Onboarding"
        valor={String(onboarding.concluidos)}
        micro={
          ninguemRespondeu
            ? `${onboarding.pessoas} pessoas com cadastro vinculado`
            : `${onboarding.emAndamento} em andamento · ${onboarding.naoIniciados} ainda não começaram · ${onboarding.concluidosNoMes} ${onboarding.concluidosNoMes === 1 ? "concluído" : "concluídos"} em ${mesAtual}`
        }
        link={{ href: "/admin?f=onb_nao", rotulo: "Ver quem não respondeu" }}
      >
        {ninguemRespondeu ? (
          <AvisoInline>
            Ninguém respondeu ainda — o questionário abre no próximo acesso de
            cada aluno.
          </AvisoInline>
        ) : (
          <div className="grid gap-2">
            <Rosca
              fatias={[
                {
                  rotulo: "Concluído",
                  valor: onboarding.concluidos,
                  tom: "sucesso",
                },
                {
                  rotulo: "Em andamento",
                  valor: onboarding.emAndamento,
                  tom: "atencao",
                },
                {
                  rotulo: "Não iniciado",
                  valor: onboarding.naoIniciados,
                  tom: "neutro",
                },
              ]}
              centroValor={String(onboarding.concluidos)}
              centroRotulo="concluídos"
              resumo={`De ${onboarding.pessoas} pessoas: ${onboarding.concluidos} concluíram o onboarding, ${onboarding.emAndamento} estão em andamento e ${onboarding.naoIniciados} não começaram.`}
              tituloTabela="Onboarding por situação"
            />
            {onboarding.parados7d > 0 ? (
              <p className="corpo-sm text-atencao-foreground">
                {onboarding.parados7d}{" "}
                {onboarding.parados7d === 1
                  ? "pessoa começou e parou"
                  : "pessoas começaram e pararam"}{" "}
                há mais de 7 dias.
              </p>
            ) : null}
          </div>
        )}
      </CardDashboard>

      {/* 4 — funil de clientes */}
      <CardDashboard
        icone={<UserRound />}
        rotulo="Clientes cadastrados"
        valor={String(clientes.total)}
        variacao={
          <VariacaoDoMes
            variacao={variacaoClientes}
            {...mes}
            substantivo="clientes novos"
          />
        }
        micro={porFase
          .map(
            (f) =>
              `${f.clientes} em ${FASES_CLIENTE.find((x) => x.id === f.fase)?.rotulo.toLowerCase() ?? f.fase}`,
          )
          .join(" · ")}
        link={{
          href: "/admin?f=tem_fechamento",
          rotulo: "Ver quem tem cliente em fechamento",
        }}
      >
        <Funil
          etapas={porFase.map((f) => ({
            rotulo: FASES_CLIENTE.find((x) => x.id === f.fase)?.rotulo ?? f.fase,
            valor: f.clientes,
            tom: TOM_DA_FASE[f.fase],
          }))}
          resumo={`Funil de clientes: ${porFase.map((f) => `${FASES_CLIENTE.find((x) => x.id === f.fase)?.rotulo ?? f.fase} ${f.clientes}`).join(", ")}.`}
          tituloTabela="Clientes por fase"
        />
      </CardDashboard>

      {/* 5 — a ponta contratada. Sem gráfico: os números são de unidades
          diferentes (clientes, ambientes, reais) e uma barra que os comparasse
          mentiria. E NENHUM valor de saldo do programa (BLOQUEIO B-S1). */}
      <CardDashboard
        icone={<FileSignature />}
        rotulo="Clientes contratados"
        valor={String(honorarios.clientesContratados)}
        micro={`${honorarios.ambientesComContratado} ${honorarios.ambientesComContratado === 1 ? "ambiente" : "ambientes"} · ${honorarios.contratadosSemValor} sem valor de honorários registrado`}
        link={{
          href: "/admin?f=contrato_enviado",
          rotulo: "Ver quem enviou o contrato de honorários",
        }}
      >
        {honorarios.clientesContratados === 0 ? (
          <AvisoInline>
            Nenhum cliente chegou à fase Contratado ainda. O contrato de
            honorários assinado é pedido no onboarding de quem responde que já
            está com uma execução em andamento.
          </AvisoInline>
        ) : (
          <dl className="grid gap-1.5 corpo-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Honorários contratados</dt>
              <dd className="numero font-semibold">
                {brlOuTraco(honorarios.totalReais)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">
                Ambientes que bateram a meta deles
              </dt>
              <dd className="numero font-semibold">
                {honorarios.ambientesNoAureo}
              </dd>
            </div>
          </dl>
        )}
      </CardDashboard>

      {/* 6 — trilha. Vem do `pct` que a lista JÁ calculou (função pura), e não
          de SQL: reescrever o catálogo de tarefas no banco criaria um segundo
          lugar para a mesma regra divergir do número que o aluno vê. */}
      <CardDashboard
        icone={<GraduationCap />}
        rotulo="Progresso na Etapa 01"
        valor={String(faixaCem)}
        micro={`ambientes que concluíram a Etapa 01 inteira${sufixoDoLote}`}
        link={{ href: ORDEM_POR_PROGRESSO, rotulo: "Ver por progresso" }}
      >
        {/* Barra DEITADA, não em colunas: os quatro rótulos ("Passou da
            metade", "Etapa 01 concluída") têm 16–20 caracteres, e texto dentro
            de `viewBox` encolhe junto com a largura — medido no navegador, as
            legendas se sobrepunham já em 1366 px. Deitada, o rótulo é texto de
            verdade na escala tipográfica da casa. Mesma razão do card 9. */}
        <Barras
          orientacao="horizontal"
          dados={trilha.map((f) => ({
            rotulo: f.rotulo,
            valor: f.qtd,
            tom: TOM_DA_FAIXA[f.faixa],
          }))}
          resumo={`Ambientes por faixa de progresso da Etapa 01: ${trilha.map((f) => `${f.rotulo} ${f.qtd}`).join(", ")}.`}
        />
      </CardDashboard>

      {/* 7 — a fila de atendimento. Sem gráfico: é uma FILA, e fila se lê em
          números com destino, não em desenho. */}
      <CardDashboard
        icone={<LifeBuoy />}
        rotulo="Esperando a equipe"
        valor={String(esperandoEquipe)}
        micro={`${atendimento.pendenciasAbertas} ${atendimento.pendenciasAbertas === 1 ? "pendência" : "pendências"} do Diário em ${atendimento.ambientesComPendencia} ${atendimento.ambientesComPendencia === 1 ? "ambiente" : "ambientes"}${sufixoDoLote}`}
        link={{ href: "/admin?f=pendencia", rotulo: "Ver quem tem pendência" }}
      >
        <ul className="grid gap-1.5 corpo-sm">
          {[
            {
              rotulo: "Chamados abertos",
              valor: atendimento.chamadosAbertos,
              href: "/admin?f=chamado",
            },
            {
              rotulo: "Sem nenhuma nota no Diário",
              valor: atendimento.semNenhumaNota,
              href: "/admin?f=sem_nota",
            },
            {
              rotulo: "Sem acessar há 30+ dias",
              valor: atendimento.semAcesso30d,
              href: "/admin?f=inativos",
            },
          ].map((l) => (
            <li key={l.href} className="flex items-baseline justify-between gap-3">
              <Link
                href={l.href}
                prefetch={false}
                className="foco-visivel rounded-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                {l.rotulo}
              </Link>
              <span className="numero font-semibold">{l.valor}</span>
            </li>
          ))}
        </ul>
      </CardDashboard>

      {/* 8 — termômetro */}
      <CardDashboard
        icone={<TrendingUp />}
        rotulo="Atividade nos últimos 30 dias"
        valor={String(totalAluno + totalEquipe)}
        micro="eventos registrados — o que os alunos e a equipe fizeram no portal"
        link={null}
        semLink="Termômetro do sistema: mostra o ritmo, não uma fila para atacar."
      >
        {atividade.length === 0 ? (
          <AvisoInline>
            Nenhum evento nos últimos 30 dias — a trilha registra o que o aluno
            e a equipe fazem no portal.
          </AvisoInline>
        ) : (
          <Linha
            series={[
              {
                rotulo: "Alunos",
                tom: "marca",
                pontos: atividade.map((d) => ({ rotulo: d.dia, valor: d.aluno })),
              },
              {
                rotulo: "Equipe",
                tom: "neutro",
                pontos: atividade.map((d) => ({ rotulo: d.dia, valor: d.equipe })),
              },
            ]}
            resumo={`Eventos por dia nos últimos 30 dias: ${totalAluno} de alunos e ${totalEquipe} da equipe.`}
            tituloTabela="Eventos por origem"
          />
        )}
      </CardDashboard>

      {/* 9 — grau de relação. Barra deitada, não rosca: são 6 categorias de
          nome longo, e nome escrito é o canal de identidade que a cor não dá
          (a conta está em `ui/graficos/tipos.ts`). */}
      <CardDashboard
        icone={<UserRoundPlus />}
        rotulo="Grau de relação"
        valor={String(grauInformado)}
        micro={`${dados.grauRelacao.naoInformado} ${dados.grauRelacao.naoInformado === 1 ? "cliente ainda sem grau informado" : "clientes ainda sem grau informado"}`}
        link={null}
        semLink="Leitura macro da base de clientes — a ficha de cada cliente é do aluno."
      >
        {grauInformado === 0 ? (
          <AvisoInline>
            Nenhum cliente tem o grau de relação preenchido ainda — o campo é
            novo e aparece na ficha do cliente e no cadastro pelo onboarding.
          </AvisoInline>
        ) : (
          <Barras
            orientacao="horizontal"
            dados={[
              ...dados.grauRelacao.itens.map((g) => ({
                rotulo: ROTULO_GRAU_RELACAO[g.grau] ?? g.grau,
                valor: g.qtd,
                tom: "marca" as const,
              })),
              // 🔴 "Não informado" sai SEPARADO e por último, nunca como uma
              // fatia chamada "Lead": ausência de resposta sobre a vida de um
              // terceiro não é um palpite.
              {
                rotulo: "Não informado",
                valor: dados.grauRelacao.naoInformado,
                tom: "neutro" as const,
              },
            ]}
            resumo={`Clientes por grau de relação: ${dados.grauRelacao.itens.map((g) => `${ROTULO_GRAU_RELACAO[g.grau] ?? g.grau} ${g.qtd}`).join(", ")}, não informado ${dados.grauRelacao.naoInformado}.`}
          />
        )}
      </CardDashboard>
    </Secao>
  );
}
