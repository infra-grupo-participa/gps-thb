import { FileSignature, LifeBuoy, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";

import { BarraEmpilhada, Barras, pctDe } from "@/components/ui/graficos";
import { brlOuTraco } from "@/lib/moeda";
import type { Dashboard, ResumoAtendimento } from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";
import { LINK_LISTA, ROTULO_GRAU_RELACAO } from "./tipos";

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
  const linhasEquipe = [
    { rotulo: "Titulares", valor: equipe.titulares },
    { rotulo: "Sócios", valor: equipe.socios },
    ...(equipe.socios > 0
      ? [{ rotulo: "Sócios ativos (30 dias)", valor: equipe.sociosAtivos30d }]
      : []),
    ...(equipe.convitesPendentes > 0
      ? [{ rotulo: "Convites em aberto", valor: equipe.convitesPendentes }]
      : []),
  ];

  const grauInformado = dados.grauRelacao.itens.reduce((s, g) => s + g.qtd, 0);
  const totalGrau = grauInformado + dados.grauRelacao.naoInformado;

  const fila = [
    {
      rotulo: "Pendências do Diário",
      valor: atendimento.pendenciasAbertas,
      href: `${LINK_LISTA}&f=pendencia`,
    },
    {
      rotulo: "Chamados abertos",
      valor: atendimento.chamadosAbertos,
      href: `${LINK_LISTA}&f=chamado`,
    },
    {
      rotulo: "Sem nota no Diário",
      valor: atendimento.semNenhumaNota,
      href: `${LINK_LISTA}&f=sem_nota`,
    },
    {
      rotulo: "Sem acessar há 30+ dias",
      valor: atendimento.semAcesso30d,
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
                className="foco-visivel -mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-superficie-afundada"
              >
                <span className="min-w-0 corpo text-muted-foreground">
                  {l.rotulo}
                </span>
                <span className="numero shrink-0 text-2xl font-semibold">
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
        contexto={`Pessoas com acesso, em ${equipe.titulares} ambientes.`}
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
            <li
              key={l.rotulo}
              className="-mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5"
            >
              <span className="min-w-0 corpo text-muted-foreground">
                {l.rotulo}
              </span>
              <span className="shrink-0 numero tabular-nums">{l.valor}</span>
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
