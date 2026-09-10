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
  const { referencia, programa, acesso, clientes, honorarios } = dados;

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
        link={{
          href: `${LINK_LISTA}&ordem=recentes`,
          rotulo: "Ver os recentes",
        }}
      />

      <KpiTile
        rotulo="Já entraram no portal"
        valor={String(jaEntraram)}
        pct={pctDe(jaEntraram, acesso.total)}
        contexto={`de ${acesso.total} · ${acesso.semLogin} sem login`}
        link={{ href: `${LINK_LISTA}&f=sem_login`, rotulo: "Ver sem login" }}
      />

      <KpiTile
        rotulo="Ativos nos últimos 30 dias"
        valor={String(acesso.ativos30d)}
        pct={pctDe(acesso.ativos30d, acesso.total)}
        contexto={`${acesso.semAcesso30d} sem acessar há 30+ dias`}
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
        contexto={`${clientes.noMes} em ${mesAtual}`}
        link={{ href: `${LINK_LISTA}&ordem=clientes`, rotulo: "Ver por clientes" }}
      />

      <KpiTile
        rotulo="Clientes em fechamento"
        valor={String(clientes.fechamento)}
        pct={pctDe(clientes.fechamento, clientes.total)}
        contexto={`${honorarios.clientesContratados} contratados`}
        link={{
          href: `${LINK_LISTA}&f=tem_fechamento`,
          rotulo: "Ver em fechamento",
        }}
      />

      <KpiTile
        rotulo="Etapa 01 concluída"
        valor={String(faixaCem)}
        pct={pctDe(faixaCem, ambientesNaTrilha)}
        contexto={`${naoComecaram} não começaram`}
        link={{ href: ORDEM_POR_PROGRESSO, rotulo: "Ver por progresso" }}
      />
    </div>
  );
}
