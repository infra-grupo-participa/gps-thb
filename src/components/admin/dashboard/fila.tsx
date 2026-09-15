import { FileSignature, LifeBuoy, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";

import { BarraEmpilhada, Barras, pctDe } from "@/components/ui/graficos";
import { brlOuTraco } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import type { Dashboard, ResumoAtendimento } from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";
import { LINK_CLIENTES, LINK_LISTA, ROTULO_GRAU_RELACAO } from "./tipos";

/**
 * **Seção C — a fila e a base.** O que a equipe deve fazer, e o estado do
 * cadastro que sustenta o resto.
 *
 * 🔴 **Quatro números, nunca a soma.** Pendência do Diário é um combinado que
 * a equipe anotou; chamado é uma mensagem do aluno esperando resposta; "sem
 * nota" e "sem acessar" são ausências. Unidades diferentes somadas viram um
 * total que não existe em lugar nenhum — por isso este card não tem macro
 * (`valor` fica de fora) e a regra está escrita na tela, em uma linha.
 *
 * Cada linha é um LINK para a sua lista filtrada: a fila só serve se der para
 * atacá-la, e o escopo ("no lote carregado") está escrito, porque estes dois
 * números valem sobre os ambientes carregados enquanto o badge do header vale
 * sobre a base inteira.
 */
export function FilaEBase({
  dados,
  atendimento,
  ambientesCarregados,
}: {
  dados: Dashboard;
  atendimento: ResumoAtendimento;
  ambientesCarregados: number;
}) {
  const { honorarios, equipe } = dados;

  // 🔴 Quatro números que NÃO se somam entre si (mesma regra do card da fila):
  // "sócios" é um subconjunto de pessoas, "ativos" um subconjunto de sócios, e
  // "convites" nem virou pessoa ainda. O macro do card é titulares + sócios;
  // estas linhas detalham, não empilham.
  // 🔑 SUBMÉTRICAS DE ACESSO POR PAPEL (11/09/2026, pedido do Marcio: "total
  // de acessos, porém em submétricas quem é titular de quem é sócio").
  //
  // O macro do card é o total de PESSOAS com acesso; cada linha abre em
  // "quantos desses entraram". "Nunca entrou" só aparece quando existe — e é
  // o mesmo corte do filtro `nunca_entrou` da lista, para os dois números
  // nunca divergirem.
  // 🔑 Formato de PAR (14/09/2026, pedido do Marcio): rótulo à esquerda,
  // número à direita, sem frase. O `detalhe` em prosa ("139 já entraram · 120
  // nos últimos 30 dias") obrigava a ler para achar os números; agora cada um
  // é uma linha própria, indentada sob o grupo a que pertence.
  const linhasEquipe = [
    {
      rotulo: "Titulares",
      valor: equipe.titulares,
      detalhe: null as string | null,
      sub:
        equipe.titulares > 0
          ? [
              { rotulo: "já entraram", valor: equipe.titularesJaEntraram },
              { rotulo: "ativos 30 dias", valor: equipe.titularesAtivos30d },
            ]
          : [],
    },
    {
      rotulo: "Sócios",
      valor: equipe.socios,
      detalhe: equipe.socios === 0 ? "nenhum sócio no sistema ainda" : null,
      sub:
        equipe.socios > 0
          ? [
              { rotulo: "já entraram", valor: equipe.sociosJaEntraram },
              { rotulo: "ativos 30 dias", valor: equipe.sociosAtivos30d },
            ]
          : [],
    },
    ...(equipe.nuncaEntraram > 0
      ? [
          {
            rotulo: "Nunca entraram",
            valor: equipe.nuncaEntraram,
            // Explicação, não dado: não vira par (não há número a alinhar).
            detalhe: "têm conta criada e ainda não abriram o portal",
            sub: [],
          },
        ]
      : []),
    ...(equipe.convitesPendentes > 0
      ? [
          {
            rotulo: "Convites em aberto",
            valor: equipe.convitesPendentes,
            detalhe: "aguardando o sócio aceitar",
            sub: [],
          },
        ]
      : []),
  ];

  const grauInformado = dados.grauRelacao.itens.reduce((s, g) => s + g.qtd, 0);
  const totalGrau = grauInformado + dados.grauRelacao.naoInformado;

  /**
   * 🔴 15/09/2026 (decisão do Marcio): o número GRANDE de cada linha passa a
   * ser o que o CLIQUE entrega — quantos AMBIENTES a lista vai mostrar
   * (`ambientesComPendencia`/`ambientesComChamado`) — e a quantidade de itens
   * (pendência, chamado) vira texto secundário: *"6 pendências em 3
   * parceiros"*. Antes o número grande era a contagem de itens
   * (`pendenciasAbertas`/`chamadosAbertos`), que podia ser maior do que a
   * lista teria linhas — um ambiente com 3 pendências abertas mostrava "3" e
   * a lista filtrada trazia 1 card.
   *
   * `ambientesComPendencia`/`ambientesComChamado` já são calculados em
   * `resumoAtendimento` (`src/lib/data/dashboard.ts:386,388`) e não eram
   * usados em lugar nenhum — código morto que passa a viver.
   */
  const fila = [
    {
      rotulo: "Pendências do Diário",
      valor: atendimento.ambientesComPendencia,
      detalhe:
        atendimento.pendenciasAbertas > 0
          ? `${atendimento.pendenciasAbertas} ${atendimento.pendenciasAbertas === 1 ? "pendência" : "pendências"} em ${atendimento.ambientesComPendencia} ${atendimento.ambientesComPendencia === 1 ? "parceiro" : "parceiros"}`
          : null,
      href: `${LINK_LISTA}&f=pendencia`,
    },
    {
      rotulo: "Chamados abertos",
      valor: atendimento.ambientesComChamado,
      detalhe:
        atendimento.chamadosAbertos > 0
          ? `${atendimento.chamadosAbertos} ${atendimento.chamadosAbertos === 1 ? "chamado" : "chamados"} em ${atendimento.ambientesComChamado} ${atendimento.ambientesComChamado === 1 ? "parceiro" : "parceiros"}`
          : null,
      href: `${LINK_LISTA}&f=chamado`,
    },
    {
      rotulo: "Sem nota no Diário",
      valor: atendimento.semNenhumaNota,
      detalhe: null as string | null,
      href: `${LINK_LISTA}&f=sem_nota`,
    },
    {
      rotulo: "Sem acessar há 30+ dias",
      valor: atendimento.semAcesso30d,
      detalhe: null as string | null,
      href: `${LINK_LISTA}&f=inativos`,
    },
  ];

  return (
    // `items-start`: "Grau de relação" com a base inteira em branco é uma
    // linha e um trilho vazio, e esticá-lo até a altura da fila devolveria o
    // vão em branco que o diagnóstico de 11/09 apontou.
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      <CardDashboard
        icone={<LifeBuoy />}
        rotulo="Esperando a equipe"
        link={null}
        semLink={`Cada linha abre a lista filtrada · nos ${ambientesCarregados} ambientes deste lote. Não se somam.`}
      >
        <ul className="grid gap-0.5">
          {fila.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                prefetch={false}
                aria-label={
                  l.detalhe ? `${l.rotulo}: ${l.detalhe}` : `${l.rotulo}: ${l.valor}`
                }
                className="foco-visivel -mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-superficie-afundada"
              >
                <span className="min-w-0">
                  <span className="block corpo text-muted-foreground">
                    {l.rotulo}
                  </span>
                  {/* 🔴 15/09/2026: a contagem de ITENS (não mais o número
                      grande) vira texto secundário — "6 pendências em 3
                      parceiros". O número grande agora É a contagem de
                      parceiros, que é o que a lista filtrada vai mostrar. */}
                  {l.detalhe ? (
                    <span className="block text-xs text-muted-foreground/80">
                      {l.detalhe}
                    </span>
                  ) : null}
                </span>
                {/* 🔑 O ZERO É UMA BOA NOTÍCIA (14/09/2026). Todas as quatro
                    linhas são TRABALHO PENDENTE, então o número não é neutro:
                    0 significa "nada esperando" e merece ler como resolvido;
                    qualquer valor acima disso é fila. Antes os dois tinham o
                    mesmo peso, e "0 chamados abertos" parecia tão urgente
                    quanto "20".

                    Discreto de propósito: verde apagado para o zero (é
                    ausência de trabalho, não conquista) e cor de texto cheia
                    para o resto — quem salta é o número alto, pela tipografia
                    que já existe, não por vermelho em cima de tudo. */}
                <span
                  className={cn(
                    "numero shrink-0 text-2xl font-semibold tabular-nums",
                    l.valor === 0
                      ? "text-sucesso-foreground/55"
                      : "text-foreground",
                  )}
                >
                  {l.valor}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardDashboard>

      {/* 🔑 QUEM É QUEM, EM NÚMEROS (pedido do Marcio, 11/09/2026).
          O número que a equipe precisa ver não é "10 sócios" — é quantos
          deles ESTÃO USANDO. Em 11/09: 10 com login, 4 ativos nos últimos 30
          dias. Cadastrar sócio não é o mesmo que ter sócio participando, e a
          tela diz isso com a linha de contexto, não com um gráfico. */}
      <CardDashboard
        icone={<UsersRound />}
        rotulo="Titulares e sócios"
        valor={String(equipe.titulares + equipe.socios)}
        variante="grafico"
        // O card "Parceiros" do TOPO já dá o total e a divisão titular/sócio
        // (14/09/2026). Aqui o que justifica o card é o DETALHE — quantos de
        // cada grupo entraram e estão ativos —, então o contexto sai e o
        // espaço fica para os números.
        contexto={undefined}
        link={null}
        semLink={
          equipe.socios === 0
            ? "Nenhum sócio no sistema ainda."
            : `${equipe.ambientesCompartilhados} ${
                equipe.ambientesCompartilhados === 1 ? "ambiente é" : "ambientes são"
              } compartilhado${equipe.ambientesCompartilhados === 1 ? "" : "s"} entre titular e sócio.`
        }
      >
        <ul className="grid gap-0.5">
          {linhasEquipe.map((l) => (
            <li key={l.rotulo} className="-mx-2 rounded-md px-2 py-1.5">
              <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="block corpo text-muted-foreground">
                  {l.rotulo}
                </span>
                {l.detalhe ? (
                  <span className="block text-xs text-muted-foreground/80">
                    {l.detalhe}
                  </span>
                ) : null}
              </span>
                <span className="shrink-0 numero tabular-nums">{l.valor}</span>
              </div>
              {l.sub.length > 0 ? (
                <dl className="mt-0.5 grid gap-0.5 pl-3 text-xs">
                  {l.sub.map((x) => (
                    <div
                      key={x.rotulo}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <dt className="text-muted-foreground/80">{x.rotulo}</dt>
                      <dd className="numero shrink-0 tabular-nums text-muted-foreground">
                        {x.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      </CardDashboard>

      <CardDashboard
        icone={<UserRoundPlus />}
        rotulo="Grau de relação"
        valor={String(grauInformado)}
        variante="grafico"
        // `h-full` do card venceria o `items-start` da grade (num item de grade,
        // `height:100%` resolve contra a ALTURA DA LINHA, não contra o
        // conteúdo). Só no estado vazio — com dado, os dois cards se emparelham.
        className={grauInformado === 0 ? "lg:h-auto" : undefined}
        // Com a base inteira em branco, a frase "clientes com o vínculo
        // informado, de 879" repetiria o que a linha do estado vazio já diz.
        contexto={
          grauInformado === 0
            ? undefined
            : `Clientes com o vínculo informado, de ${totalGrau}.`
        }
        link={null}
        semLink="Só leitura da base de clientes."
      >
        {grauInformado === 0 ? (
          // Vazio é resultado: o trilho vazio diz "medimos e ninguém preencheu".
          // Sem caixa âmbar — o aviso gritava mais alto do que os números que
          // existem, e este aqui não pede ação da equipe.
          <div className="grid gap-2">
            <p className="corpo-sm text-muted-foreground">
              <span className="numero font-semibold text-foreground">
                {dados.grauRelacao.naoInformado}
              </span>{" "}
              clientes sem o grau informado.
            </p>
            <div
              aria-hidden
              className="h-6 w-full rounded-md bg-superficie-afundada inset-ring inset-ring-black/5"
            />
          </div>
        ) : (
          <div className="grid gap-3">
            {/* A barra empilhada responde "quanto da base já tem vínculo
                informado" — DUAS fatias, que é o limite em que a cor separa
                sozinha. A repartição pelos 6 graus vai abaixo, em linhas
                rotuladas: seis tons quentes não se distinguem (a conta está em
                `ui/graficos/tipos.ts`). */}
            <BarraEmpilhada
              altura={20}
              mostrarLegenda={false}
              segmentos={[
                { rotulo: "Com grau informado", valor: grauInformado, tom: "sucesso" },
                {
                  rotulo: "Não informado",
                  valor: dados.grauRelacao.naoInformado,
                  tom: "neutro",
                },
              ]}
            />
            <Barras
              orientacao="horizontal"
              total={totalGrau}
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

            {/* 🔴 14/09/2026: `Barras` é DESENHO puro (compartilhado por
                outros cards) e não carrega link — cada grau ganha uma linha
                própria com âncora de verdade abaixo do gráfico, para
                `/admin/clientes?grau=…`. "Não informado" leva a `_nulo`, a
                mesma convenção de `gps.admin_clientes_lista`. */}
            <ul className="grid gap-0.5 border-t border-borda-fina pt-2">
              {dados.grauRelacao.itens.map((g) => (
                <li key={g.grau}>
                  <Link
                    href={`${LINK_CLIENTES}?grau=${g.grau}`}
                    prefetch={false}
                    className="foco-visivel -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
                  >
                    Ver {(ROTULO_GRAU_RELACAO[g.grau] ?? g.grau).toLowerCase()}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={`${LINK_CLIENTES}?grau=_nulo`}
                  prefetch={false}
                  className="foco-visivel -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
                >
                  Ver sem grau informado
                </Link>
              </li>
            </ul>
          </div>
        )}
      </CardDashboard>

      {/* A ponta contratada só ganha card quando existe. Enquanto for zero, ela
          vive como o tile "Clientes em fechamento" da faixa de KPIs — card
          inteiro para anunciar um zero era 80% de espaço em branco.
          🔴 Sem gráfico: os números são de unidades diferentes (clientes,
          ambientes, reais) e uma barra que os comparasse mentiria. E NENHUM
          valor de saldo do programa (BLOQUEIO B-S1). */}
      {honorarios.clientesContratados > 0 ? (
        <CardDashboard
          icone={<FileSignature />}
          rotulo="Clientes contratados"
          valor={String(honorarios.clientesContratados)}
          contexto={
            pctDe(honorarios.clientesContratados, dados.clientes.total) === null
              ? undefined
              : `${pctDe(honorarios.clientesContratados, dados.clientes.total)}% dos clientes cadastrados.`
          }
          pares={[
            {
              rotulo: "Ambientes",
              valor: String(honorarios.ambientesComContratado),
            },
            {
              rotulo: "Sem honorários",
              valor: String(honorarios.contratadosSemValor),
            },
            { rotulo: "Honorários", valor: brlOuTraco(honorarios.totalReais) },
            // "AURUM" é o nome do produto/próximo nível. "Áureo" estava errado
            // — o cálculo (`META_HONORARIOS` por ambiente) não mudou.
            {
              rotulo: "No AURUM",
              valor: String(honorarios.ambientesNoAurum),
            },
          ]}
          link={{
            href: `${LINK_LISTA}&f=contrato_enviado`,
            rotulo: "Ver quem enviou o contrato",
          }}
        />
      ) : null}
    </div>
  );
}
