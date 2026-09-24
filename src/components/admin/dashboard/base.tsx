import Link from "next/link";

import { Barras } from "@/components/ui/graficos";
import { META_CLIENTES } from "@/lib/etapa1";
import type { Dashboard, FaixaDeTrilha, ResumoClientes30 } from "@/lib/data/dashboard";
import { RankingDeParceiros } from "./parceiros";
import {
  LINK_CLIENTES,
  LINK_LISTA,
  ROTULO_GRAU_RELACAO,
  TOM_DA_FAIXA,
  rotuloDoMes,
} from "./tipos";

/**
 * A sub-aba **"Parceiros"** (`?vis=parceiros`) — o ranking primeiro, e abaixo
 * dele a COMPOSIÇÃO DA BASE de parceiros.
 *
 * 🔑 **Por que estes cinco blocos vieram parar aqui** (23/09/2026, redesenho
 * das 3 zonas). Eram cinco cards de `/admin?vis=programa` que respondiam à
 * mesma pergunta — *quem são os 148, e como eles se distribuem?* — mas viviam
 * espalhados entre `faixa-kpis`, `graficos` e `fila`, cada um dentro da
 * própria moldura. A sub-aba "O programa" passou a ser régua + gráfico +
 * ranking recortado; retrato da base não é recorte de estágio, então desceu
 * para a aba onde o ranking já morava.
 *
 * Os cinco, com a origem:
 *
 *   1. **fecharam os 30** — era KPI em `faixa-kpis.tsx`. É meta POR PARCEIRO,
 *      e vive ao lado do ranking que ordena os parceiros por cliente.
 *   2. **entradas por mês** — era o gráfico 1 de `graficos.tsx`.
 *   3. **progresso Etapa 01** — era o gráfico 4 de `graficos.tsx`.
 *   4. **titulares e sócios** — era card de `fila.tsx`.
 *   5. **grau de relação** — era card de `fila.tsx`.
 *
 * 🔴 **Sem card, sem ícone, sem prosa.** Cada bloco é: título de até 3
 * palavras · número · denominador · desenho · link. Nada de `CardDashboard`
 * nem `KpiTile` — a hierarquia é por POSIÇÃO (ordem dos blocos, separados por
 * espaço), que é o pedido do Marcio para toda tela que se lê sentado. As
 * frases de metodologia que vinham nos `contexto=` daqueles cards estão nos
 * comentários abaixo, nunca no DOM.
 *
 * 🔴 **Todo `href` migrou JUNTO com o número.** Cinco filtros só tinham porta
 * de entrada nos cards antigos e continuam alcançáveis daqui: `listou30`
 * (bloco 1), `ordem=recentes` (bloco 2), `etapa1_ok` (bloco 3) e os dois
 * `grau=` de `/admin/clientes` (bloco 5). Nenhum valor fora da allowlist de
 * `alunos-ativos-lista/estado-na-url.ts`, e todos com `aba=ativos&classe=todas`
 * por `LINK_LISTA`.
 *
 * ⚠️ **Dois denominadores diferentes nesta tela**, e cada bloco escreve o seu
 * no próprio subtítulo: os blocos 1–4 são sobre PARCEIROS/AMBIENTES (148), o
 * bloco 5 é sobre CLIENTES (~1.704). Ler o percentual de um com o denominador
 * do outro é o erro que os subtítulos existem para impedir.
 *
 * ⚠️ `trilha` e `clientes30` são funções PURAS sobre o lote que `/admin` já
 * carregou (`faixasDeTrilha`, `resumoClientes30`) — **zero consulta nova**.
 * Quando o lote não cobre a base inteira, o rodapé diz isso: número parcial
 * apresentado como total é a mesma classe de erro do "R$ 0,00" em campo vazio.
 *
 * Server Component, 0 KB de JS.
 */
export function SubAbaParceiros({
  dados,
  trilha,
  clientes30,
  ambientesCarregados,
}: {
  dados: Dashboard;
  /** `faixasDeTrilha(alunos)`, pura, sobre o lote carregado. */
  trilha: FaixaDeTrilha[];
  /** `resumoClientes30(alunos)`, pura, sobre o lote carregado. */
  clientes30: ResumoClientes30;
  /** Quantos ambientes o lote trouxe — o escopo dos blocos 1 e 3. */
  ambientesCarregados: number;
}) {
  const { programa, equipe, grauRelacao } = dados;

  /**
   * Os 12 meses vêm do banco, mas os meses ANTERIORES ao primeiro ingresso são
   * zeros de calendário, não resultado: o programa começou em julho/2026, e
   * nove colunas de "0" achatavam as três que existem. Corta só o começo — um
   * zero no MEIO da série é informação (um mês sem ninguém entrando) e
   * continua aparecendo. (Copiado de `graficos.tsx`, gráfico 1.)
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

  const ambientesNaTrilha = trilha.reduce((s, f) => s + f.qtd, 0);
  const faixaCem = trilha.find((f) => f.faixa === "100")?.qtd ?? 0;

  const grauInformado = grauRelacao.itens.reduce((s, g) => s + g.qtd, 0);
  const totalGrau = grauInformado + grauRelacao.naoInformado;

  const parcial = ambientesCarregados < programa.total;

  return (
    <section aria-labelledby="sub-aba-parceiros" className="grid gap-8">
      <h2 id="sub-aba-parceiros" className="sr-only">
        Parceiros
      </h2>

      {/* 🔴 O RANKING PRIMEIRO — é a peça que o Marcio aprovou, e hierarquia
          por POSIÇÃO quer dizer que o mais importante abre a tela. Sem `foco`:
          esta aba não tem régua, então não há estágio a recortar. */}
      <RankingDeParceiros parceiros={dados.parceiros} foco={null} />

      {/* ───── 1 · Fecharam os 30 ─────
          🔴 Era o KPI "Fecharam os N clientes" de `faixa-kpis.tsx`. O
          predicado é FATO OBSERVÁVEL (`clientesComDados >= META_CLIENTES`,
          ficha completa = nome + telefone), o MESMO do filtro `listou30` e da
          trava da fase Inicial (`src/lib/etapa1.ts`) — não depende de o
          parceiro marcar tarefa nenhuma. Foi por isso que ele substituiu
          "Etapa 01 concluída" em 15/09: 27 parceiros já tinham fechado os 30 e
          só 2 tinham marcado a tarefa, e o card mostrava 0.
          ⚠️ Vale sobre o LOTE carregado (o rodapé desta tela diz isso). */}
      <Bloco
        titulo={`Fecharam os ${META_CLIENTES}`}
        valor={clientes30.fecharamOs30}
        denominador={`de ${ambientesNaTrilha} parceiros`}
        link={{
          href: `${LINK_LISTA}&f=listou30`,
          rotulo: "Ver quem fechou",
          ariaLabel: `Ver os ${clientes30.fecharamOs30} parceiros que fecharam os ${META_CLIENTES} clientes`,
        }}
      >
        {/* 🔴 O comentário que estava aqui MENTIA (consertado em 24/09/2026,
            achado do João): dizia que "sem nenhum cliente" e "no meio dos 30"
            NÃO ficavam nesta tela — e a barra logo abaixo desenha os dois.
            O desenho é que está certo, e o texto é que estava velho.

            Por que os três aparecem aqui apesar de dois deles também viverem
            em `atencao.tsx`: aqui eles são **as três fatias de uma mesma
            escada** (`clientesComDados`: fechou · está no meio · não começou),
            e uma barra 100% empilhada sem as outras duas fatias não é barra,
            é um número com moldura. Lá eles são **fila de trabalho**, cada um
            com o próprio link. Mesmo dado, duas perguntas.

            ⚠️ E o "sem nenhum cliente" daqui NÃO é numericamente o de lá:
            esta barra mede `clientesComDados === 0` (a escada dos 30);
            `atencao.tsx` mede `clientesPreenchidos === 0`, que é o predicado
            do filtro `sem_cliente` que o link de lá abre. Ver o comentário
            de `semNenhumClienteCadastrado` em `dashboard.ts`. */}
        <Barras
          orientacao="horizontal"
          total={ambientesNaTrilha}
          dados={[
            {
              rotulo: `Fecharam os ${META_CLIENTES}`,
              valor: clientes30.fecharamOs30,
              tom: "sucesso",
            },
            {
              rotulo: `No meio dos ${META_CLIENTES}`,
              valor: clientes30.noMeioDos30,
              tom: "atencao",
            },
            {
              rotulo: "Sem nenhum cliente",
              valor: clientes30.semNenhumCliente,
              tom: "risco",
            },
          ]}
          resumo={`De ${ambientesNaTrilha} parceiros: ${clientes30.fecharamOs30} fecharam os ${META_CLIENTES} clientes, ${clientes30.noMeioDos30} estão no meio e ${clientes30.semNenhumCliente} não têm nenhum cliente.`}
        />
      </Bloco>

      {/* ───── 2 · No programa (entradas por mês) ─────
          Era o gráfico 1 de `graficos.tsx`. A comparação com o mês anterior
          (`VariacaoDoMes`) NÃO veio junto: ela é uma frase ("+3 vs. setembro
          até o dia 23"), e esta tela não tem frase.

          🔴 **O TÍTULO virou "No programa" (24/09/2026, achado do João).**
          Era "Entradas por mês" com 148 do lado — e número colado em título
          de série mensal lê como "entraram 148 este mês". 148 é o total
          acumulado da base. Das duas saídas possíveis (tirar o número do
          título, ou o título passar a descrever o número), escolhi a segunda:
          o par título+valor desta tela é sempre "rótulo · número · denominador"
          e um `Bloco` sem valor abriria exceção no contrato para resolver um
          problema de redação. O ritmo mensal continua legível — é o que as
          barras abaixo desenham, e o `aria-label` delas já diz "Entradas por
          mês" para quem não vê o gráfico. */}
      <Bloco
        titulo="No programa"
        valor={programa.total}
        denominador="parceiros no total"
        link={{
          href: `${LINK_LISTA}&ordem=recentes`,
          rotulo: "Ver os mais recentes",
          ariaLabel: "Ver os parceiros mais recentes",
        }}
      >
        <Barras
          dados={meses}
          tom="marca"
          altura={180}
          // O `aria-label` carrega a série INTEIRA em texto: é o canal de quem
          // não vê o desenho, e ele não pode ser mais pobre do que a tela.
          resumo={`Entradas por mês: ${meses.map((p) => `${p.rotulo} ${p.valor}`).join(", ")}.`}
          // Toda coluna já traz o próprio número em cima; a legenda repetiria
          // os mesmos valores logo abaixo.
          mostrarLegenda={false}
        />
      </Bloco>

      {/* ───── 3 · Progresso Etapa 01 ─────
          Era o gráfico 4 de `graficos.tsx`.
          🔑 É DECLARADO, não fato: a faixa "concluída" é `pct === 100`, que
          exige o parceiro MARCAR as tarefas manuais no checklist (só o passo
          1, os 30 clientes, é automático). O rótulo da própria faixa já
          carrega a palavra "(declarado)" — vem de `faixasDeTrilha`, e é por
          isso que a linha de prosa do card antigo ("Depende do parceiro
          marcar") não precisa existir no DOM. O bloco 1 acima é o MESMO
          assunto em versão FATO. */}
      <Bloco
        titulo="Progresso Etapa 01"
        valor={faixaCem}
        denominador={`de ${ambientesNaTrilha} parceiros · declarado`}
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
          resumo={`Parceiros por faixa de progresso da Etapa 01: ${trilha.map((f) => `${f.rotulo} ${f.qtd}`).join(", ")}.`}
        />
      </Bloco>

      {/* ───── 4 · Titulares e sócios ─────
          Era card de `fila.tsx`, e antes dele um par do KPI "Parceiros".
          🔑 O número que a equipe precisa ver não é "10 sócios" — é quantos
          deles ESTÃO USANDO (pedido do Marcio, 11/09/2026). Daí as
          submétricas por papel.
          🔴 `titulares + socios` conta PESSOAS; `programa.total` conta
          AMBIENTES. Os dois números são diferentes de propósito (sócio divide
          o ambiente do titular) e por isso o denominador deste bloco é
          "pessoas", não "de 148".
          🔴 Sem link: não há filtro "só sócio"/"só titular" em `FILTROS`, e a
          lista é por AMBIENTE. Inventar um `?f=` que o parse descarta daria um
          link que abre a lista cheia em silêncio. */}
      <Bloco
        titulo="Titulares e sócios"
        valor={equipe.titulares + equipe.socios}
        denominador={`pessoas · em ${programa.total} ambientes`}
        link={null}
      >
        <ul className="grid gap-0.5">
          {linhasDaEquipe(equipe).map((l) => (
            <li key={l.rotulo} className="-mx-2 rounded-md px-2 py-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="corpo text-muted-foreground">{l.rotulo}</span>
                <span className="numero shrink-0 tabular-nums">{l.valor}</span>
              </div>
              {l.sub.length > 0 ? (
                <dl className="mt-0.5 grid gap-0.5 pl-3">
                  {l.sub.map((x) => (
                    <div
                      key={x.rotulo}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <dt className="corpo-sm text-muted-foreground/80">
                        {x.rotulo}
                      </dt>
                      <dd className="numero shrink-0 corpo-sm tabular-nums text-muted-foreground">
                        {x.valor}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      </Bloco>

      {/* ───── 5 · Grau de relação ─────
          Era card de `fila.tsx`.
          🔴 OUTRO DENOMINADOR: este bloco é sobre CLIENTES (~1.704), não
          sobre os 148 parceiros. O subtítulo escreve isso uma vez, e o `%` de
          cada linha sai de `total={totalGrau}`.
          🔴 "Não informado" sai SEPARADO e por último, nunca como uma fatia
          chamada "Lead": ausência de resposta sobre a vida de um terceiro não
          é um palpite. Leva a `_nulo`, a mesma convenção de
          `gps.admin_clientes_lista`. */}
      <Bloco
        titulo="Grau de relação"
        valor={grauInformado}
        denominador={`de ${totalGrau} clientes`}
        link={null}
      >
        {grauInformado === 0 ? (
          // Vazio é resultado: o trilho vazio diz "medimos e ninguém
          // preencheu". Uma linha, sem caixa de alerta.
          <div className="grid gap-2">
            <p className="corpo-sm text-muted-foreground">
              <span className="numero font-semibold text-foreground">
                {grauRelacao.naoInformado}
              </span>{" "}
              sem o grau informado
            </p>
            <div
              aria-hidden
              className="h-6 w-full rounded-md bg-superficie-afundada inset-ring inset-ring-black/5"
            />
          </div>
        ) : (
          <Barras
            orientacao="horizontal"
            total={totalGrau}
            dados={[
              ...grauRelacao.itens.map((g) => ({
                rotulo: ROTULO_GRAU_RELACAO[g.grau] ?? g.grau,
                valor: g.qtd,
                tom: "marca" as const,
                href: `${LINK_CLIENTES}?grau=${g.grau}`,
                ariaLabel: `Ver os ${g.qtd} clientes com grau ${(ROTULO_GRAU_RELACAO[g.grau] ?? g.grau).toLowerCase()}`,
              })),
              {
                rotulo: "Não informado",
                valor: grauRelacao.naoInformado,
                tom: "neutro" as const,
                href: `${LINK_CLIENTES}?grau=_nulo`,
                ariaLabel: `Ver os ${grauRelacao.naoInformado} clientes sem grau informado`,
              },
            ]}
            resumo={`Clientes por grau de relação, de ${totalGrau}: ${grauRelacao.itens.map((g) => `${ROTULO_GRAU_RELACAO[g.grau] ?? g.grau} ${g.qtd}`).join(", ")}, não informado ${grauRelacao.naoInformado}.`}
          />
        )}
      </Bloco>

      {/* O escopo do lote — o único texto corrido desta tela, e ele existe
          porque os blocos 1 e 3 são puros sobre os ambientes JÁ carregados,
          não sobre o programa inteiro. Some quando o lote cobre a base. */}
      {parcial ? (
        <p className="corpo-sm text-muted-foreground">
          Blocos 1 e 3 sobre {ambientesCarregados} de {programa.total} ambientes
          carregados.
        </p>
      ) : null}
    </section>
  );
}

/**
 * As linhas do bloco "Titulares e sócios".
 *
 * 🔴 Quatro números que NÃO se somam entre si: "sócios" é um subconjunto de
 * pessoas, "ativos" um subconjunto de sócios, e "convites" nem virou pessoa
 * ainda. O macro do bloco é titulares + sócios; estas linhas detalham, não
 * empilham.
 *
 * "Nunca entraram" e "Convites em aberto" só aparecem quando existem — linha
 * de zero aqui seria ruído que parece problema (são fila, e fila vazia não é
 * fila). O corte de "nunca entrou" é o MESMO do filtro `nunca_entrou` da
 * lista, para os dois números nunca divergirem.
 */
function linhasDaEquipe(equipe: Dashboard["equipe"]) {
  return [
    {
      rotulo: "Titulares",
      valor: equipe.titulares,
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
      sub:
        equipe.socios > 0
          ? [
              { rotulo: "já entraram", valor: equipe.sociosJaEntraram },
              { rotulo: "ativos 30 dias", valor: equipe.sociosAtivos30d },
            ]
          : [],
    },
    ...(equipe.nuncaEntraram > 0
      ? [{ rotulo: "Nunca entraram", valor: equipe.nuncaEntraram, sub: [] }]
      : []),
    ...(equipe.ambientesCompartilhados > 0
      ? [
          {
            rotulo: "Ambientes compartilhados",
            valor: equipe.ambientesCompartilhados,
            sub: [],
          },
        ]
      : []),
    ...(equipe.convitesPendentes > 0
      ? [{ rotulo: "Convites em aberto", valor: equipe.convitesPendentes, sub: [] }]
      : []),
  ];
}

/**
 * Um bloco da base: título · número · denominador · desenho · link.
 *
 * 🔴 **Sem moldura.** Nada de `Card`, `border`, `bg-card` ou ícone — a
 * separação entre blocos é o `gap-8` da seção, e a hierarquia é a ordem.
 * Era exatamente o enfeite que o Marcio recusou ("como em sistemas
 * tradicionais").
 *
 * 🔴 O número é **sempre `<p>`, nunca âncora**, inclusive quando existe link.
 * O link é uma linha própria, com nome que diz para onde vai — ampliar o alvo
 * de clique muda o contrato do link, e número grande clicável não diz ao
 * teclado nem ao leitor de tela o que vai acontecer.
 */
function Bloco({
  titulo,
  valor,
  denominador,
  link,
  children,
}: {
  /** 🔴 Até 3 palavras. */
  titulo: string;
  valor: number;
  /** "de 148 parceiros" — escrito UMA vez por bloco, nunca por número. */
  denominador: string;
  link: { href: string; rotulo: string; ariaLabel?: string } | null;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex items-baseline gap-3">
          <h3 className="rotulo text-muted-foreground">{titulo}</h3>
          <p className="numero numero-lg font-semibold tabular-nums">{valor}</p>
          <p className="corpo-sm text-muted-foreground">{denominador}</p>
        </div>
        {link ? (
          <Link
            href={link.href}
            prefetch={false}
            aria-label={link.ariaLabel}
            className="foco-visivel -mx-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
          >
            {link.rotulo}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
