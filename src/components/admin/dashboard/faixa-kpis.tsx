import { pctDe } from "@/components/ui/graficos";
import type { Dashboard, FaixaDeTrilha } from "@/lib/data/dashboard";
import { KpiTile } from "./kpi-tile";
import { VariacaoDoMes } from "./variacao";
import {
  LINK_LISTA,
  ORDEM_POR_PROGRESSO,
  nomeDoMes,
  rotuloDoMes,
} from "./tipos";

/**
 * **Seção A — a faixa de KPIs.** Seis números, nenhum gráfico, uma leitura.
 *
 * 🔑 É a resposta ao diagnóstico de 11/09: o painel liderava com nove cards de
 * mesmo peso e nenhum deles dizia "de quanto". Aqui todo número vem com o
 * percentual do próprio universo ao lado, e cada tile termina numa lista
 * filtrada — inclusive os dois que a RPC já devolvia e ninguém mostrava
 * (`acesso.ativos30d` e `acesso.semAcesso30d`).
 *
 * 🔴 Todo `href` é valor da allowlist de `alunos-ativos-lista/estado-na-url.ts`
 * (`FILTROS` e `ORDENS`) e leva `aba=ativos` por `LINK_LISTA` — link que o
 * parse descarta é botão que não faz nada.
 */
export function FaixaKpis({
  dados,
  trilha,
}: {
  dados: Dashboard;
  trilha: FaixaDeTrilha[];
}) {
  const { referencia, programa, acesso, clientes, honorarios, equipe } = dados;

  const mesAtual = nomeDoMes(referencia.mes);
  const mesAnterior = nomeDoMes(referencia.mesAnterior);
  const mesAnteriorCurto = rotuloDoMes(referencia.mesAnterior, false);

  const jaEntraram = Math.max(0, acesso.comLogin - acesso.nuncaEntraram);
  // O denominador da trilha é o LOTE carregado, não a base: as faixas vêm de
  // uma função pura sobre o que `/admin` já trouxe. O rodapé da aba diz isso
  // quando o lote não cobre tudo.
  const ambientesNaTrilha = trilha.reduce((s, f) => s + f.qtd, 0);
  const faixaCem = trilha.find((f) => f.faixa === "100")?.qtd ?? 0;
  const naoComecaram = trilha.find((f) => f.faixa === "0")?.qtd ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        rotulo="No programa"
        valor={String(programa.total)}
        destaque
        variacao={
          <VariacaoDoMes
            variacao={{
              atual: programa.noMes,
              anterior: programa.noMesAnteriorAteODia,
              ateODia: referencia.dia,
            }}
            mesAtual={mesAtual}
            mesAnterior={mesAnterior}
            mesAnteriorCurto={mesAnteriorCurto}
            substantivo="entradas"
          />
        }
        // 🔑 A quebra titular × sócio existia só no bloco do FIM da página
        // (`FilaEBase`), e o Marcio não a encontrou (14/09/2026). O número do
        // TOPO é o que se olha primeiro — é ele que precisa dizer do que o
        // total é feito.
        //
        // 🔴 `programa.total` conta AMBIENTES (140), e titular+sócio conta
        // PESSOAS (152). Escrever "140 titulares · 12 sócios" ao lado de um
        // "140" fazia a tela se contradizer — parecia que 12 pessoas tinham
        // sumido da conta. A frase diz os sócios como QUEM SE SOMA, não como
        // parte do 140. `socios = 0` na maior parte dos dias, então ela some
        // em vez de exibir "+ 0 sócios".
        contexto={
          equipe.socios > 0
            ? `${equipe.titulares} ${equipe.titulares === 1 ? "titular" : "titulares"} + ${equipe.socios} ${equipe.socios === 1 ? "sócio" : "sócios"} = ${equipe.titulares + equipe.socios} pessoas`
            : `${equipe.titulares} ${equipe.titulares === 1 ? "titular" : "titulares"}, nenhum sócio`
        }
        link={{
          href: `${LINK_LISTA}&ordem=recentes`,
          rotulo: "Ver os recentes",
        }}
      />

      <KpiTile
        rotulo="Já entraram no portal"
        valor={String(jaEntraram)}
        pct={pctDe(jaEntraram, acesso.total)}
        pctBom="alto"
        // "de 140" repetia o que o 99% ao lado já diz. A submétrica passa a
        // carregar o que SOBRA — que é onde está a ação — e some quando não
        // sobra ninguém.
        contexto={
          acesso.semLogin === 0
            ? "todos com login criado"
            : acesso.semLogin === 1
              ? "falta 1 sem login"
              : `faltam ${acesso.semLogin} sem login`
        }
        link={{ href: `${LINK_LISTA}&f=sem_login`, rotulo: "Ver sem login" }}
      />

      <KpiTile
        rotulo="Ativos nos últimos 30 dias"
        valor={String(acesso.ativos30d)}
        pct={pctDe(acesso.ativos30d, acesso.total)}
        pctBom="alto"
        // O número solto não dizia que era o OPOSTO do 120 logo acima. "Os
        // outros N" amarra os dois: 120 ativos, os outros 19 parados.
        contexto={
          acesso.semAcesso30d === 0
            ? "todos acessaram no período"
            : acesso.semAcesso30d === 1
              ? "o outro está parado"
              : `os outros ${acesso.semAcesso30d} estão parados`
        }
        link={{ href: `${LINK_LISTA}&f=inativos`, rotulo: "Ver os parados" }}
      />

      <KpiTile
        rotulo="Clientes cadastrados"
        valor={String(clientes.total)}
        variacao={
          <VariacaoDoMes
            variacao={{
              atual: clientes.noMes,
              anterior: clientes.noMesAnteriorAteODia,
              ateODia: referencia.dia,
            }}
            mesAtual={mesAtual}
            mesAnterior={mesAnterior}
            mesAnteriorCurto={mesAnteriorCurto}
            substantivo="clientes novos"
          />
        }
        // 🔴 `${clientes.noMes} em ${mesAtual}` DUPLICAVA a variação logo
        // acima ("+243 vs. ago"), que já é sobre o mês. Duas linhas seguidas
        // sobre o mesmo recorte gastam altura e não somam leitura. A
        // submétrica passa a dizer a MÉDIA por ambiente, que é a pergunta
        // seguinte de quem vê 1.182: "isso é muito ou pouco por pessoa?"
        contexto={
          programa.total > 0
            ? `média de ${Math.round(clientes.total / programa.total)} por ambiente`
            : undefined
        }
        link={{ href: `${LINK_LISTA}&ordem=clientes`, rotulo: "Ver por clientes" }}
      />

      <KpiTile
        rotulo="Clientes em fechamento"
        valor={String(clientes.fechamento)}
        pct={pctDe(clientes.fechamento, clientes.total)}
        // 🔴 "12 contratados" parecia submétrica dos 38 em fechamento — como
        // se 12 dos 38 já tivessem fechado. NÃO É: `clientesContratados` é a
        // fase SEGUINTE, um conjunto à parte. A palavra "já" e o verbo
        // desfazem a leitura de subconjunto.
        contexto={
          honorarios.clientesContratados > 0
            ? honorarios.clientesContratados === 1
              ? "1 já fechou contrato"
              : `${honorarios.clientesContratados} já fecharam contrato`
            : "nenhum contrato fechado ainda"
        }
        link={{
          href: `${LINK_LISTA}&f=tem_fechamento`,
          rotulo: "Ver em fechamento",
        }}
      />

      <KpiTile
        rotulo="Etapa 01 concluída"
        valor={String(faixaCem)}
        pct={pctDe(faixaCem, ambientesNaTrilha)}
        pctBom="alto"
        // "115 não começaram" não dizia de quantos, e o macro (0) já é o
        // outro extremo. Com o denominador, a linha vira a régua do esforço
        // que falta.
        contexto={
          naoComecaram === 0
            ? `${ambientesNaTrilha} já começaram`
            : naoComecaram === ambientesNaTrilha
              ? "nenhum começou ainda"
              : `${naoComecaram} de ${ambientesNaTrilha} não começaram`
        }
        link={{ href: ORDEM_POR_PROGRESSO, rotulo: "Ver por progresso" }}
      />
    </div>
  );
}
