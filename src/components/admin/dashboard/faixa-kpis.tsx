import { pctDe } from "@/components/ui/graficos";
import type { Dashboard, FaixaDeTrilha } from "@/lib/data/dashboard";
import { KpiTile } from "./kpi-tile";
import { VariacaoDoMes } from "./variacao";
import { LINK_CLIENTES, LINK_LISTA, nomeDoMes, rotuloDoMes } from "./tipos";

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
  const emAndamento = Math.max(
    0,
    ambientesNaTrilha - faixaCem - naoComecaram,
  );

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {/* 🔑 "Parceiros 152 · Titulares 140 · Sócios 12" — o formato que o
          Marcio pediu em 14/09: rótulo e número, sem frase. O macro passa a
          ser PESSOAS (152), não ambientes (140), porque é isso que o par
          embaixo soma; com "No programa 140" o leitor tentava fechar a conta
          e achava que faltavam 12. */}
      <KpiTile
        rotulo="Parceiros"
        valor={String(equipe.titulares + equipe.socios)}
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
        // 🔴 Titulares/sócios NÃO viram link próprio: não há filtro "só
        // sócio"/"só titular" em `FILTROS` (a lista é por AMBIENTE, e sócio
        // não tem linha própria — ver o `contexto` abaixo). Inventar um
        // `?f=` que o parse descarta daria um link que não faz nada.
        pares={[
          { rotulo: "Titulares", valor: String(equipe.titulares) },
          { rotulo: "Sócios", valor: String(equipe.socios) },
        ]}
        // 🔴 15/09/2026: o número deste tile é PESSOAS (titular + sócio); a
        // lista para a qual ele leva é por AMBIENTE — sócios dividem o
        // ambiente do titular, então a lista mostra menos linhas do que este
        // número. Decisão do Marcio (mantida): o macro fica em pessoas, e a
        // assimetria se explica em vez de se esconder.
        contexto="A lista abaixo é por ambiente — sócio soma aqui, mas não vira linha própria."
        // O card inteiro é clicável (14/09/2026) e leva à LISTA — é o que
        // quem clica em "152" espera. A ordenação por entrada recente fica,
        // mas o rótulo não promete um filtro que não existe (não há
        // "só sócios" em `FILTROS`).
        link={{
          href: `${LINK_LISTA}&ordem=recentes`,
          rotulo: "Ver a lista",
          ariaLabel: `Ver a lista dos ${equipe.titulares + equipe.socios} parceiros`,
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
        // Só "Sem login": "Nunca entraram" ao lado de "Já entraram" soa
        // contraditório, e o percentual do topo já diz a cobertura.
        pares={[
          {
            rotulo: "Sem login",
            valor: String(acesso.semLogin),
            href: `${LINK_LISTA}&f=sem_login`,
            ariaLabel: `Ver os ${acesso.semLogin} parceiros sem login`,
          },
        ]}
        // 🔴 ERA `f=sem_login` (14/09/2026): o card mostra 139 QUE ENTRARAM e
        // o clique abria a lista de 1 SEM LOGIN — o conjunto oposto. Passava
        // por "atalho para a exceção" enquanto só o link de 11 px do rodapé
        // era clicável e dizia "Ver sem login"; virou bug quando o card
        // inteiro virou alvo, no mesmo dia. Agora o destino é o número.
        link={{
          href: `${LINK_LISTA}&f=ja_entrou`,
          rotulo: "Ver quem entrou",
          ariaLabel: `Ver os ${jaEntraram} parceiros que já entraram no portal`,
        }}
      />

      <KpiTile
        rotulo="Ativos nos últimos 30 dias"
        valor={String(acesso.ativos30d)}
        pct={pctDe(acesso.ativos30d, acesso.total)}
        pctBom="alto"
        // O número solto não dizia que era o OPOSTO do 120 logo acima. "Os
        // outros N" amarra os dois: 120 ativos, os outros 19 parados.
        pares={[
          {
            rotulo: "Parados há 30+ dias",
            valor: String(acesso.semAcesso30d),
            href: `${LINK_LISTA}&f=inativos`,
            ariaLabel: `Ver os ${acesso.semAcesso30d} parceiros parados há 30 dias ou mais`,
          },
        ]}
        // 🔴 Mesmo defeito do card anterior: mostrava 120 ativos e levava aos
        // 19 parados.
        link={{
          href: `${LINK_LISTA}&f=ativos30`,
          rotulo: "Ver os ativos",
          ariaLabel: `Ver os ${acesso.ativos30d} parceiros ativos nos últimos 30 dias`,
        }}
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
        pares={[
          { rotulo: `Em ${mesAtual}`, valor: String(clientes.noMes) },
          {
            rotulo: "Média por parceiro",
            valor:
              programa.total > 0
                ? String(Math.round(clientes.total / programa.total))
                : "—",
          },
        ]}
        // 🔴 14/09/2026: passou a levar à lista CONSOLIDADA de clientes
        // (`/admin/clientes`, item 3 dos 9), não mais à lista de parceiros
        // ordenada por quantidade. É a pergunta que "Clientes cadastrados"
        // faz — "quem são" —, e antes o clique respondia "quais parceiros têm
        // mais". `KpiTile` só aceita UM link (o `after:inset-0` do rodapé
        // cobre o card inteiro): o card aponta inteiro para o destino novo,
        // em vez de tentar um segundo link que ficaria coberto e silenciosamente
        // inacessível.
        link={{
          href: LINK_CLIENTES,
          rotulo: "Ver os clientes",
          ariaLabel: `Ver os ${clientes.total} clientes cadastrados`,
        }}
      />

      <KpiTile
        rotulo="Clientes em fechamento"
        valor={String(clientes.fechamento)}
        pct={pctDe(clientes.fechamento, clientes.total)}
        // 🔴 "12 contratados" parecia submétrica dos 38 em fechamento — como
        // se 12 dos 38 já tivessem fechado. NÃO É: `clientesContratados` é a
        // fase SEGUINTE, um conjunto à parte. A palavra "já" e o verbo
        // desfazem a leitura de subconjunto.
        pares={[
          {
            rotulo: "Contratados",
            valor: String(honorarios.clientesContratados),
            href: `${LINK_CLIENTES}?fase=contratado`,
            ariaLabel: `Ver os ${honorarios.clientesContratados} clientes contratados`,
          },
        ]}
        // 🔴 14/09/2026: mesmo motivo do card acima — leva à lista
        // CONSOLIDADA de clientes, já filtrada pela fase (`?fase=fechamento`,
        // allowlist de `clientes-programa/estado-na-url.ts`), não mais à
        // lista de parceiros com `f=tem_fechamento`.
        link={{
          href: `${LINK_CLIENTES}?fase=fechamento`,
          rotulo: "Ver em fechamento",
          ariaLabel: `Ver os ${clientes.fechamento} clientes em fechamento`,
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
        // "Em andamento" some quando é 0: com 115 não começaram e 0
        // concluídos, a linha zerada não acrescenta nada.
        pares={[
          {
            rotulo: "Não começaram",
            valor: String(naoComecaram),
            href: `${LINK_LISTA}&f=etapa1_zero`,
            ariaLabel: `Ver os ${naoComecaram} parceiros que não começaram a Etapa 01`,
          },
          ...(emAndamento > 0
            ? [
                {
                  rotulo: "Em andamento",
                  valor: String(emAndamento),
                  href: `${LINK_LISTA}&f=etapa1_andamento`,
                  ariaLabel: `Ver os ${emAndamento} parceiros com a Etapa 01 em andamento`,
                },
              ]
            : []),
        ]}
        // 🔴 15/09/2026: `ORDEM_POR_PROGRESSO` (ordenar por progresso) morreu
        // — era a muleta enquanto não existia filtro de faixa. Com
        // `f=etapa1_ok` a lista já mostra EXATAMENTE quem concluiu, em vez de
        // só empurrar esse grupo para o topo de uma lista com todo mundo.
        link={{
          href: `${LINK_LISTA}&f=etapa1_ok`,
          rotulo: "Ver quem concluiu",
          ariaLabel: `Ver os ${faixaCem} parceiros com a Etapa 01 concluída`,
        }}
      />
    </div>
  );
}
