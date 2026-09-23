import Link from "next/link";
import { Footprints, Route, UserRound } from "lucide-react";

import { Barras, Funil } from "@/components/ui/graficos";
import { FASES_CLIENTE } from "@/lib/etapa1";
import type { Dashboard } from "@/lib/data/dashboard";
import { CardDashboard } from "./card-dashboard";
import { LINK_CLIENTES, TOM_DA_FASE } from "./tipos";

/**
 * **O caminho do cliente** — três cards, e a diferença entre eles é o que esta
 * seção existe para proteger: **dois são sequência de verdade, um não é.**
 *
 * 🔴 **`passos` NÃO É FUNIL, e por isso não desenha funil.** Os quatro passos
 * da ficha (mensagem · estudo · ligação · aderiu) são marcados de forma
 * INDEPENDENTE: `ficha-blocos-estado.ts:71-94` os trata como "N de 4 passos"
 * (contagem), e `cliente-ficha.tsx:186-188` são três `useState` sem `disabled`
 * encadeado — dá para marcar "ligação" sem nunca ter marcado "mensagem". Logo
 * `estudo` **não é subconjunto** de `mensagem`, e escrever "de 117 que
 * receberam mensagem, 18 viraram estudo" seria mentira: os 18 não saíram dos
 * 117. O próprio contrato (`DashboardPassos`, `src/lib/data/dashboard.ts`) diz
 * isso e é por isso que a RPC não devolve taxa de conversão nenhuma.
 * **Barras paralelas, com o mesmo denominador em todas.** Se um dia a ficha
 * encadear os passos, aí sim vira funil — antes, não.
 *
 * ✅ O `Funil` continua valendo onde a sequência é real: `caminho`
 * (favorito → entrevista → reunião → aderiu) e as três fases
 * (prospecção → fechamento → contratado), que é uma escada de estado único
 * por cliente.
 *
 * 🔴 **Toda barra escreve o denominador.** Hoje 1.640 dos 1.701 clientes estão
 * em prospecção sem marcação nenhuma — **96% da base não tem nada marcado**, e
 * a tela vai mostrar barras quase vazias. Isso é o retrato correto: vazio é
 * resultado, dito em número (`N de 1.701`), nunca escondido e nunca maquiado
 * de progresso. O precedente é o card de onboarding em `graficos.tsx`.
 *
 * Server Component, 0 KB de JS — como o resto do dashboard.
 */
export function CaminhoDoCliente({ dados }: { dados: Dashboard }) {
  const { passos, caminho } = dados;

  /**
   * O denominador de TUDO nesta seção: os clientes cadastrados.
   *
   * 🔑 Vem de `passos.total` (a RPC conta sobre a mesma base das quatro
   * marcações) e não de `clientes.total`, para que numerador e denominador
   * saiam sempre da mesma consulta. Dois totais de fontes diferentes divergem
   * no dia em que um dos dois ganhar um recorte.
   */
  const total = passos.total;

  /** As três fases — escada de estado real, uma fase por cliente. */
  const porFase = [
    { fase: "prospeccao" as const, valor: caminho.prospeccao },
    { fase: "fechamento" as const, valor: caminho.fechamento },
    { fase: "contratado" as const, valor: caminho.contratado },
  ].map((f) => ({
    rotulo: FASES_CLIENTE.find((x) => x.id === f.fase)?.rotulo ?? f.fase,
    valor: f.valor,
    tom: TOM_DA_FASE[f.fase],
  }));

  const totalNasFases =
    caminho.prospeccao + caminho.fechamento + caminho.contratado;

  /** Quantos contratados ainda não têm honorário informado. */
  const contratadosSemValor = Math.max(
    0,
    caminho.contratado - caminho.comValor,
  );

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {/* 1 — os 4 passos da ficha. BARRAS PARALELAS, jamais funil. */}
      <CardDashboard
        icone={<Footprints />}
        rotulo="Passos marcados na ficha"
        valor={`${passos.mensagem} de ${total}`}
        valorDescricao={`${passos.mensagem} clientes de ${total} com a mensagem marcada`}
        variante="grafico"
        // A linha de prosa carrega a trava conceitual: quem lê a tela precisa
        // saber que estes quatro números NÃO se encadeiam, senão vai ler a
        // queda de 117 para 18 como perda de conversão — que é o erro que esta
        // seção inteira existe para impedir.
        contexto="Cada passo é marcado por conta própria, sem ordem. Um cliente pode ter a ligação sem a mensagem — os números não se somam nem viram etapa."
        link={null}
        semLink="Marcação da ficha do cliente; não há lista por passo."
      >
        {/* `total` é o denominador de TODAS as linhas: o `%` responde "de
            quantos clientes", nunca "de quantos marcaram o passo anterior". */}
        <Barras
          orientacao="horizontal"
          total={total}
          dados={[
            { rotulo: "Mensagem enviada", valor: passos.mensagem, tom: "marca" },
            { rotulo: "Estudo de caso", valor: passos.estudo, tom: "marca" },
            { rotulo: "Ligação feita", valor: passos.ligacao, tom: "marca" },
            { rotulo: "Aderiu à reunião", valor: passos.aderiu, tom: "sucesso" },
          ]}
          resumo={`Passos marcados, cada um sobre os mesmos ${total} clientes e sem ordem entre eles: mensagem ${passos.mensagem}, estudo de caso ${passos.estudo}, ligação ${passos.ligacao}, aderiu à reunião ${passos.aderiu}.`}
        />
      </CardDashboard>

      {/* 2 — os marcos do caminho até a reunião.
          🔴 TAMBÉM NÃO É FUNIL, e a razão só aparece contra o dado real.
          Os quatro números são `count(*)` INDEPENDENTES, cada um sobre uma
          coluna/tabela diferente (migração `…306`): `favorito` =
          `acompanhado_equipe`; `entrevista` = linhas em `gps.entrevista_previa`;
          `reuniao` = `data_reuniao_preliminar is not null`; `aderiu` =
          `aderiu_reuniao`. Nenhum é recorte do anterior — dá para ter reunião
          marcada sem nunca ter sido favoritado.
          Medido com o dado de produção (37 · 1 · 52 · 22), o `Funil` anunciava
          **"5200% passam de entrevista prévia para reunião marcada"**: a conta
          de passagem só é honesta em cadeia de subconjunto. Mesma família do
          card 1, com rótulo mais convincente — e por isso mais perigoso. */}
      <CardDashboard
        icone={<Route />}
        rotulo="Marcos até a reunião"
        valor={`${caminho.aderiu} de ${total}`}
        valorDescricao={`${caminho.aderiu} clientes de ${total} aderiram à reunião`}
        variante="grafico"
        contexto="Quatro marcos contados à parte, cada um sobre a base inteira. Não são etapas de um mesmo caminho: há cliente com reunião marcada que nunca foi favoritado."
        link={null}
        semLink="Marcos da ficha; a lista de clientes filtra por fase, não por marco."
      >
        <Barras
          orientacao="horizontal"
          total={total}
          dados={[
            { rotulo: "Favoritado pela equipe", valor: caminho.favorito, tom: "neutro" },
            { rotulo: "Entrevista prévia feita", valor: caminho.entrevista, tom: "marca" },
            { rotulo: "Reunião marcada", valor: caminho.reuniao, tom: "atencao" },
            { rotulo: "Aderiu à reunião", valor: caminho.aderiu, tom: "sucesso" },
          ]}
          resumo={`Marcos do caminho, cada um contado à parte sobre os mesmos ${total} clientes: favoritado ${caminho.favorito}, entrevista prévia ${caminho.entrevista}, reunião marcada ${caminho.reuniao}, aderiu ${caminho.aderiu}.`}
        />
      </CardDashboard>

      {/* 3 — as fases. ABSORVEU o antigo card 3 de `graficos.tsx`
          ("Funil de clientes"), que desenhava exatamente estes três números a
          partir de `clientes.prospeccao/fechamento/contratado`. Dois cards
          desenhando a mesma coisa em abas diferentes é o defeito que o plano
          mandou não criar — e a fase pertence ao caminho do cliente, não à
          faixa de gráficos do programa.

          Os 3 links por fase vêm junto, no padrão "Grau de relação"
          (`link={null}` + âncoras por linha): `CardDashboard` só aceita UM
          link de rodapé (o `after:inset-0` cobre o card inteiro e engoliria os
          outros dois). */}
      <CardDashboard
        icone={<UserRound />}
        rotulo="Fase dos clientes"
        valor={String(totalNasFases)}
        variante="grafico"
        contexto="Cada cliente está em uma fase só. Aqui a sequência é real."
        link={null}
        semLink="Cada fase abaixo abre a lista de clientes daquela fase."
        pares={
          caminho.contratado > 0
            ? [
                {
                  rotulo: "Com honorário informado",
                  valor: `${caminho.comValor} de ${caminho.contratado}`,
                },
                // 🔴 Só aparece quando existe: "0 sem valor" num card sem
                // contratado nenhum é ruído que parece problema.
                ...(contratadosSemValor > 0
                  ? [
                      {
                        rotulo: "Contratados sem valor",
                        valor: String(contratadosSemValor),
                      },
                    ]
                  : []),
              ]
            : undefined
        }
      >
        <div className="grid gap-3">
          {/* 🔴 `mostrarPassagem={false}`. As três fases são MUTUAMENTE
              EXCLUSIVAS (`fase` é uma coluna só, e as três somam exatamente
              os {total} clientes): quem está em fechamento SAIU da prospecção,
              não é subconjunto dela. Com a passagem ligada, o card afirmaria
              "3% passam de prospecção para fechamento" — que lê como taxa de
              conversão e é falso, porque o denominador (1.640) é justamente
              quem NÃO avançou. A escada de magnitude continua honesta; a frase
              de conversão, não. */}
          <Funil etapas={porFase} mostrarPassagem={false} />
          <ul className="grid gap-0.5 border-t border-borda-fina pt-2">
            {[
              { fase: "prospeccao" as const, rotulo: "prospecção" },
              { fase: "fechamento" as const, rotulo: "fechamento" },
              { fase: "contratado" as const, rotulo: "contratado" },
            ].map((f) => (
              <li key={f.fase}>
                <Link
                  href={`${LINK_CLIENTES}?fase=${f.fase}`}
                  prefetch={false}
                  className="foco-visivel -mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
                >
                  Ver {f.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </CardDashboard>
    </div>
  );
}
