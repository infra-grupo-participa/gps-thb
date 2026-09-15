import Link from "next/link";
import {
  GraduationCap,
  IdCard,
  ListChecks,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

import { Barras, Funil, Linha, Rosca, pctDe } from "@/components/ui/graficos";
import { FASES_CLIENTE } from "@/lib/etapa1";
import type { Dashboard, FaixaDeTrilha } from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";
import { VariacaoDoMes } from "./variacao";
import {
  LINK_CLIENTES,
  LINK_LISTA,
  TOM_DA_FAIXA,
  TOM_DA_FASE,
  diaCurto,
  nomeDoMes,
  rotuloDoMes,
} from "./tipos";

/** Altura útil da área de plotagem, em px. Abaixo disso o gráfico é enfeite. */
const ALTURA_GRAFICO = 190;

/**
 * **Seção B — os gráficos, grandes.** Duas colunas no desktop, uma no celular,
 * e o desenho ocupando o card inteiro.
 *
 * 🔑 O defeito de 10/09 era de PROPORÇÃO, não de escolha de gráfico: três
 * colunas de 60 px dentro de um card de 400, uma linha de 30 dias com 40 px de
 * altura, uma rosca que não aparecia. A altura agora é **prop em pixels**
 * (`ALTURA_GRAFICO`), não a razão de um `viewBox` multiplicada pela largura da
 * coluna — e o texto dos rótulos deixou de encolher junto (ver
 * `ui/graficos/tipos.ts`).
 *
 * O cabeçalho de cada card carrega o número macro em 24 px (`variante
 * "grafico"`): aqui o protagonista é o desenho, e o número é a escala dele.
 */
export function GraficosDoPrograma({
  dados,
  trilha,
}: {
  dados: Dashboard;
  trilha: FaixaDeTrilha[];
}) {
  const { referencia, programa, acesso, onboarding, clientes } = dados;

  const mesAtual = nomeDoMes(referencia.mes);
  const mesAnterior = nomeDoMes(referencia.mesAnterior);

  /**
   * Os 12 meses vêm do banco, mas os meses ANTERIORES ao primeiro ingresso são
   * zeros de calendário, não resultado: o programa começou em julho/2026, e
   * nove colunas de "0" achatavam as três que existem. Corta só o começo — um
   * zero no MEIO da série é informação (um mês sem ninguém entrando) e
   * continua aparecendo.
   */
  const primeiroComEntrada = programa.porMes.findIndex((m) => m.qtd > 0);
  const mesesCrus =
    primeiroComEntrada > 0
      ? programa.porMes.slice(primeiroComEntrada)
      : programa.porMes;
  // Dois anos na mesma série exigem o ano no rótulo: senão dois setembros
  // diferentes viram a mesma coluna com o mesmo nome.
  const cruzaAno = new Set(mesesCrus.map((m) => m.mes.slice(0, 4))).size > 1;
  const meses = mesesCrus.map((m) => ({
    rotulo: rotuloDoMes(m.mes, cruzaAno),
    valor: m.qtd,
  }));

  const jaEntraram = Math.max(0, acesso.comLogin - acesso.nuncaEntraram);
  const pctEntraram = pctDe(jaEntraram, acesso.total);

  const porFase = [
    { fase: "prospeccao" as const, valor: clientes.prospeccao },
    { fase: "fechamento" as const, valor: clientes.fechamento },
    { fase: "contratado" as const, valor: clientes.contratado },
  ].map((f) => ({
    rotulo: FASES_CLIENTE.find((x) => x.id === f.fase)?.rotulo ?? f.fase,
    valor: f.valor,
    tom: TOM_DA_FASE[f.fase],
  }));

  const atividade = dados.atividade.map((d) => ({
    dia: diaCurto(d.dia),
    aluno: d.aluno,
    equipe: d.equipe,
  }));
  const totalAluno = atividade.reduce((s, d) => s + d.aluno, 0);
  const totalEquipe = atividade.reduce((s, d) => s + d.equipe, 0);
  const totalAtividade = totalAluno + totalEquipe;
  const mediaPorDia =
    atividade.length > 0
      ? (totalAtividade / atividade.length).toFixed(1).replace(".", ",")
      : "0";

  const ambientesNaTrilha = trilha.reduce((s, f) => s + f.qtd, 0);
  const faixaCem = trilha.find((f) => f.faixa === "100")?.qtd ?? 0;

  const ninguemRespondeu =
    onboarding.concluidos === 0 && onboarding.emAndamento === 0;
  const pctOnboarding = pctDe(onboarding.concluidos, onboarding.pessoas);

  return (
    // `items-start` e não `stretch`: o card de onboarding vazio é curto de
    // propósito (tile compacto, não caixa de aviso), e esticá-lo até a altura
    // da rosca ao lado devolveria o vão em branco que o diagnóstico apontou.
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {/* 1 — entradas no programa, mês a mês */}
      <CardDashboard
        icone={<Users />}
        rotulo="Entradas no programa por mês"
        valor={String(programa.total)}
        variante="grafico"
        variacao={
          <VariacaoDoMes
            variacao={{
              atual: programa.noMes,
              anterior: programa.noMesAnteriorAteODia,
              ateODia: referencia.dia,
            }}
            mesAtual={mesAtual}
            mesAnterior={mesAnterior}
            substantivo="entradas"
          />
        }
        // Sem `contexto`: "titulares que entraram em cada mês" é a leitura
        // literal do rótulo do card. Prosa que repete o título é altura gasta.
        link={{
          href: `${LINK_LISTA}&ordem=recentes`,
          rotulo: "Ver os mais recentes",
          ariaLabel: "Ver os parceiros mais recentes",
        }}
      >
        <Barras
          dados={meses}
          tom="marca"
          altura={ALTURA_GRAFICO}
          // O `aria-label` carrega a série INTEIRA em texto: é o canal de quem
          // não vê o desenho, e ele não pode ser mais pobre do que a tela.
          resumo={`Entradas por mês: ${meses.map((p) => `${p.rotulo} ${p.valor}`).join(", ")}.`}
          // Toda coluna já traz o próprio número em cima; a legenda repetiria
          // os mesmos valores logo abaixo.
          mostrarLegenda={false}
        />
      </CardDashboard>

      {/* 2 — termômetro do portal */}
      <CardDashboard
        icone={<TrendingUp />}
        rotulo="Atividade nos últimos 30 dias"
        valor={String(totalAtividade)}
        variante="grafico"
        contexto={`Eventos no portal · média de ${mediaPorDia} por dia.`}
        link={null}
        semLink="Só leitura: ritmo, não fila."
      >
        {atividade.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhum evento nos últimos 30 dias.
          </p>
        ) : (
          <Linha
            altura={ALTURA_GRAFICO}
            series={[
              {
                rotulo: "Parceiros",
                tom: "marca",
                area: true,
                valorNoFim: true,
                pontos: atividade.map((d) => ({
                  rotulo: d.dia,
                  valor: d.aluno,
                })),
              },
              {
                rotulo: "Equipe",
                tom: "neutro",
                pontos: atividade.map((d) => ({
                  rotulo: d.dia,
                  valor: d.equipe,
                })),
              },
            ]}
            resumo={`Eventos por dia nos últimos 30 dias: ${totalAluno} de parceiros e ${totalEquipe} da equipe, média de ${mediaPorDia} por dia.`}
          />
        )}
      </CardDashboard>

      {/* 3 — funil de clientes, com a taxa de passagem entre as etapas.
          🔴 14/09/2026: CADA FATIA leva à sua própria fase em
          `/admin/clientes?fase=…` (lista CONSOLIDADA de clientes, não mais a
          de parceiros com `f=tem_fechamento`) — pedido do plano. `Funil` é
          componente de DESENHO puro, compartilhado por outras telas, e não
          carrega link nenhum (nem por fatia, nem só um): dar-lhe um link por
          etapa duplicaria a responsabilidade de navegação num componente que
          hoje só sabe desenhar. Como o `CardDashboard` também só aceita UM
          link de rodapé (`after:inset-0` cobre o card inteiro — um segundo
          link ficaria coberto e inacessível, a mesma armadilha do `KpiTile`),
          a saída aqui é `link={null}` no card e uma lista de 3 links PRÓPRIA,
          abaixo do funil, no vocabulário de `Funil` mas com âncora de
          verdade em cada linha. */}
      <CardDashboard
        icone={<UserRound />}
        rotulo="Funil de clientes"
        valor={String(clientes.total)}
        variante="grafico"
        contexto="Clientes cadastrados pelos parceiros, por fase."
        link={null}
        semLink="Cada fase abaixo abre a lista de clientes daquela fase."
      >
        <div className="grid gap-3">
          <Funil etapas={porFase} />
          <ul className="grid gap-0.5 border-t border-borda-fina pt-2">
            {(
              [
                { fase: "prospeccao" as const, rotulo: "Prospecção" },
                { fase: "fechamento" as const, rotulo: "Fechamento" },
                { fase: "contratado" as const, rotulo: "Contratado" },
              ]
            ).map((f) => (
              <li key={f.fase}>
                <Link
                  href={`${LINK_CLIENTES}?fase=${f.fase}`}
                  prefetch={false}
                  className="foco-visivel -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
                >
                  Ver {f.rotulo.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </CardDashboard>

      {/* 4 — progresso na Etapa 01, por faixa.
          🔑 DECLARADO, não fato: a faixa "concluída" é `pct === 100`, que
          exige o parceiro MARCAR as 7 tarefas manuais no checklist (só o
          passo 1, os 30 clientes, é automático). O rótulo e o contexto
          dizem isso — sem alarde, sem ícone, só a palavra (Problema 3 da
          rodada de 15/09). O card 6 da faixa de KPIs ("Fecharam os 30
          clientes") é o mesmo dado em versão FATO. */}
      <CardDashboard
        icone={<GraduationCap />}
        rotulo="Progresso na Etapa 01 (declarado)"
        valor={String(faixaCem)}
        variante="grafico"
        contexto={`Ambientes com as 8 tarefas marcadas, de ${ambientesNaTrilha}. Depende do parceiro marcar.`}
        link={{
          href: `${LINK_LISTA}&f=etapa1_ok`,
          rotulo: "Ver quem concluiu",
          ariaLabel: `Ver os ${faixaCem} parceiros com a Etapa 01 concluída (declarado)`,
        }}
      >
        {/* Barra DEITADA, não em colunas: os quatro rótulos ("Passou da
            metade", "Etapa 01 concluída") têm 16–20 caracteres e não cabem sob
            uma coluna. Deitada, o rótulo é uma linha de texto de verdade. */}
        <Barras
          orientacao="horizontal"
          total={ambientesNaTrilha}
          dados={trilha.map((f) => ({
            rotulo: f.rotulo,
            valor: f.qtd,
            tom: TOM_DA_FAIXA[f.faixa],
          }))}
          resumo={`Ambientes por faixa de progresso da Etapa 01: ${trilha.map((f) => `${f.rotulo} ${f.qtd}`).join(", ")}.`}
        />
      </CardDashboard>

      {/* 5 — acesso ao portal: a rosca que o João pediu.
          🔴 15/09/2026: DOIS ALVOS DISTINTOS, cada um honesto. O macro
          ("117 de 136") linka para o conjunto DELE — quem já entrou
          (`f=ja_entrou`) — e o link de rodapé continua indo ao complemento,
          com o rótulo dele ("Ver quem está sem login"). Antes só existia o
          link de rodapé, e clicar no número grande caía no complemento. */}
      <CardDashboard
        icone={<IdCard />}
        rotulo="Acesso ao portal"
        valor={`${jaEntraram} de ${acesso.total}`}
        valorHref={`${LINK_LISTA}&f=ja_entrou`}
        valorAriaLabel={`Ver os ${jaEntraram} parceiros que já entraram no portal`}
        variante="grafico"
        // Sem `contexto`: o rótulo, o "117 de 136" e o miolo da rosca ("86% já
        // entraram") já dizem a mesma frase três vezes. O espaço vai para o anel.
        link={{
          href: `${LINK_LISTA}&f=sem_login`,
          rotulo: "Ver quem está sem login",
          ariaLabel: `Ver os ${acesso.semLogin} parceiros sem login`,
        }}
      >
        <Rosca
          fatias={[
            { rotulo: "Já entraram", valor: jaEntraram, tom: "sucesso" },
            {
              rotulo: "Com login, nunca entraram",
              valor: acesso.nuncaEntraram,
              tom: "atencao",
            },
            { rotulo: "Sem login", valor: acesso.semLogin, tom: "risco" },
          ]}
          tamanho={168}
          centroValor={pctEntraram === null ? "—" : `${pctEntraram}%`}
          centroRotulo="já entraram"
          resumo={`De ${acesso.total} ambientes: ${jaEntraram} já entraram, ${acesso.nuncaEntraram} têm login mas nunca entraram e ${acesso.semLogin} não têm login.`}
        />
      </CardDashboard>

      {/* 6 — onboarding. Sem "vs. mês anterior": a RPC devolve as conclusões
          do mês corrente e NÃO o mesmo intervalo do anterior. Fabricar a
          comparação a partir de zero anunciaria "+N" para sempre.
          🔴 15/09/2026: mesmo padrão do card "Acesso ao portal" — o macro
          linka para quem CONCLUIU (`f=onb_ok`) e o rodapé continua indo a
          quem NÃO respondeu (`f=onb_nao`). Só quando há resposta: com a base
          inteira em "não iniciado" o filtro `onb_ok` não separaria ninguém
          (`disponivel` em `filtros.ts` já esconde o chip nesse caso; aqui o
          link do macro simplesmente não aparece). */}
      <CardDashboard
        icone={<ListChecks />}
        rotulo="Onboarding"
        valor={String(onboarding.concluidos)}
        valorHref={
          ninguemRespondeu ? undefined : `${LINK_LISTA}&f=onb_ok`
        }
        valorAriaLabel={`Ver os ${onboarding.concluidos} parceiros com o onboarding concluído`}
        variante="grafico"
        // Ver `fila.tsx`: `h-full` venceria o `items-start` da grade. Só no
        // estado vazio — com resposta, as duas roscas têm a mesma altura.
        className={ninguemRespondeu ? "lg:h-auto" : undefined}
        contexto={`Questionários concluídos, de ${onboarding.pessoas} pessoas.`}
        pares={
          ninguemRespondeu
            ? [
                {
                  rotulo: "Não iniciados",
                  valor: String(onboarding.naoIniciados),
                },
              ]
            : [
                {
                  rotulo: `Em ${mesAtual}`,
                  valor: String(onboarding.concluidosNoMes),
                },
                {
                  rotulo: "Parados há 7+ dias",
                  valor: String(onboarding.parados7d),
                },
              ]
        }
        link={{
          href: `${LINK_LISTA}&f=onb_nao`,
          rotulo: "Ver quem não respondeu",
          ariaLabel: `Ver os ${onboarding.naoIniciados} parceiros que não responderam o onboarding`,
        }}
      >
        {ninguemRespondeu ? (
          // 🔑 Vazio é resultado, e resultado se mostra em NÚMERO. A caixa
          // âmbar que estava aqui gritava mais alto do que os números que
          // existem — era o "estado vazio virou protagonista" do diagnóstico.
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="corpo-sm text-muted-foreground">
                Concluíram o questionário
              </span>
              <span className="numero shrink-0 font-semibold">
                {onboarding.concluidos}
                <span className="ml-1.5 corpo-sm font-normal text-muted-foreground">
                  de {onboarding.pessoas} ·{" "}
                  {pctOnboarding === null ? "—" : `${pctOnboarding}%`}
                </span>
              </span>
            </div>
            <div
              aria-hidden
              className="h-2.5 w-full rounded-full bg-superficie-afundada inset-ring inset-ring-black/5"
            />
            <p className="corpo-sm text-muted-foreground">
              Ninguém respondeu ainda.
            </p>
          </div>
        ) : (
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
            centroValor={pctOnboarding === null ? "—" : `${pctOnboarding}%`}
            centroRotulo="concluíram"
            resumo={`De ${onboarding.pessoas} pessoas: ${onboarding.concluidos} concluíram o onboarding, ${onboarding.emAndamento} estão em andamento e ${onboarding.naoIniciados} não começaram.`}
          />
        )}
      </CardDashboard>
    </div>
  );
}
