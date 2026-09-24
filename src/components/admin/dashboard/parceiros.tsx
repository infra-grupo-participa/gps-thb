/**
 * Ranking de parceiros — a Fatia 5 do redesenho da Visão geral.
 *
 * Server Component, sem estado: os agregados vêm prontos de
 * `dados.parceiros` (`gps.admin_dashboard()`) e a lista JÁ chega ordenada
 * pelo banco (`clientes desc, nome`) — não se reordena aqui.
 *
 * 🔴 `itens` tem teto de 200 linhas; os 7 agregados do cabeçalho são
 * calculados no banco sobre TODOS os parceiros (hoje 86), não sobre o que
 * está na tela. Não somar `itens` para "conferir" a média — o 201º parceiro
 * mentiria.
 *
 * 🔴 `honorarios` é `number | null`. `null` nunca vira "R$ 0,00" — a célula
 * fica em branco (travessão), mesmo critério de `brlOuTraco`
 * (`src/lib/moeda.ts`): ausência de contratado com valor não é zero.
 *
 * 🔴 `dias_sem_abrir` pode vir negativo (registro com data futura). Um valor
 * `<= 0` não é "sem abrir" — é lido como "abriu hoje/recentemente", nunca
 * como "-3 dias".
 *
 * 🔑 O rótulo da coluna carrega o prazo ("sem abrir há 14+ dias") de
 * propósito: a tela já tem OUTROS dois cortes de tempo (7 dias para cliente
 * parado, 30 nos filtros antigos) — "parado", sozinho, faria os três
 * parecerem a mesma régua.
 *
 * 🔴 **`limite` (23/09/2026, medido em Chromium): a tabela INTEIRA na sub-aba
 * padrão deixava a página MAIOR que os 20 cards que ela substitui.** 37 px por
 * linha × 86 parceiros de produção = ~4.399 px em 1920, contra os 3.326 px do
 * desenho antigo. Na sub-aba padrão (`index.tsx`, as 7 variantes) o ranking vai
 * com `limite={15}`; na sub-aba Parceiros (`base.tsx`) vai SEM `limite` — lá a
 * tabela é a razão da tela existir, e o default é "tudo".
 *
 * 🔴 **E o `limite` SÓ morde quando o `foco` NÃO recorta (24/09/2026).** São
 * três comportamentos, e só o primeiro ignora o `limite`:
 *
 *   · **foco que RECORTA** (`mensagem`, `favorito`, `contrato`) → tabela
 *     INTEIRA do recorte, sem link. O critério do Marcio manda a métrica
 *     clicada abrir *"a lista das pessoas daquela lista específica"* — cortar
 *     os 37 de `favorito` em 15 entrega meia lista e contradiz o pedido.
 *   · **foco SEM RECORTE** (`entrou`, `onboarding`) → 15 linhas + link
 *     `ver todos os 86 →`, mais o token "sem recorte por este estágio". Não há
 *     dado por linha de parceiro para esses dois (ver a Zona 3 abaixo).
 *   · **foco de IDENTIDADE** (`cadastrou`) → 15 linhas + link, **sem token**.
 *     Aqui o recorte não existe por outro motivo: o ranking JÁ É a lista de
 *     quem cadastrou cliente (todo item de `itens` tem `clientes >= 1`), então
 *     filtrar por `cadastrou` devolveria os mesmos 86. Não é falta de dado — é
 *     tautologia. O token de "sem recorte" mentiria ao sugerir que o estágio
 *     não dá para filtrar.
 *
 * O link leva a `?vis=parceiros` (sem `&foco=`, porque é para lá que ele de
 * fato vai). Quando o corte acontece, o cabeçalho continua dizendo o TOTAL
 * real — para `cadastrou`, `86 de 86`.
 *
 * 🔴 **Zona 3 (23/09/2026): filtro por `foco` sobre `itens`, em memória.**
 * `itens` já está no servidor (`gps.admin_dashboard()` já rodou); recortar é
 * `.filter()` sobre um array que já existe — não é query nova, não precisa de
 * RPC nova. `entrou` e `onboarding` **não filtram**: o dado desses dois
 * estágios não está por linha de parceiro (seria 2 subqueries extras POR
 * PARCEIRO na RPC mais lida do admin, e ninguém pediu esse custo ainda) — a
 * tabela mostra tudo e o cabeçalho avisa com o token "sem recorte por este
 * estágio". Filtrar mantém a ORDEM que o banco mandou (`clientes desc,
 * nome`) — nunca reordenar depois do filtro.
 */

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brlOuTraco } from "@/lib/moeda";
import { cn } from "@/lib/utils";
import type { DashboardParceiros, DashboardParceiroItem } from "@/lib/data/dashboard";
import type { Foco } from "@/components/admin/alunos-ativos-lista/estado-na-url";

/** O prazo de "parceiro sumiu", dito uma vez — nunca a palavra nua "parado". */
const PRAZO_SEM_ABRIR_DIAS = 14;

/**
 * O predicado de cada `foco`, aplicado sobre uma linha já carregada.
 *
 * `null`/`undefined` e `cadastrou` não filtram por desenho: todo item de
 * `itens` já é um parceiro com pelo menos 1 cliente (é assim que ele aparece
 * no ranking), então `cadastrou` (`clientes >= 1`) já vale para os 86.
 * `entrou`/`onboarding` também não filtram, mas por FALTA de dado por linha
 * — ver o comentário no topo do arquivo. Exportado para o teste em Node
 * (sem navegador) provar o recorte sem duplicar a regra.
 */
export function passaNoFoco(item: DashboardParceiroItem, foco?: Foco | null) {
  switch (foco) {
    case "mensagem":
      return item.mensagens > 0;
    case "favorito":
      return item.favoritos > 0;
    case "contrato":
      return item.contratados > 0;
    case "cadastrou":
    case "entrou":
    case "onboarding":
    case null:
    case undefined:
    default:
      return true;
  }
}

/**
 * Os dois focos que a tabela não sabe recortar **por falta de dado por linha**
 * — e só esses dois exibem o token "sem recorte por este estágio".
 */
const FOCOS_SEM_RECORTE = new Set<Foco>(["entrou", "onboarding"]);

/**
 * O foco que é a **identidade** do ranking: `cadastrou` (`clientes >= 1`) vale
 * para os 86, porque é assim que o parceiro entra em `itens`.
 *
 * 🔴 **Constante separada de `FOCOS_SEM_RECORTE` de propósito (24/09/2026).**
 * As duas desligam o recorte — e por isso as duas deixam o `limite` morder,
 * senão a sub-aba padrão desenharia os 86 inteiros (~4.400 px), que é
 * exatamente o que o `limite` existe para impedir. O que NÃO se compartilha é
 * o token: "sem recorte por este estágio" diz *"não dá para filtrar por
 * isto"*, e aqui dá — o ranking JÁ É a lista de quem cadastrou. O token
 * induziria a ler falta de dado onde há tautologia.
 */
const FOCOS_IDENTIDADE = new Set<Foco>(["cadastrou"]);

function celulaDiasSemAbrir(dias: number) {
  // `dias <= 0` cobre o negativo (data futura) e o "abriu agora": nenhum dos
  // dois é "sem abrir há N dias".
  if (dias <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        dias >= PRAZO_SEM_ABRIR_DIAS && "font-medium text-destructive",
      )}
    >
      {dias}
    </span>
  );
}

export function RankingDeParceiros({
  parceiros,
  foco,
  limite,
}: {
  parceiros: DashboardParceiros;
  /**
   * O estágio marcado na régua. Três comportamentos, e o nome do foco decide
   * qual (ver as constantes no topo do arquivo):
   *
   *   · **recorta** (`mensagem`, `favorito`, `contrato`) → a tabela mostra a
   *     lista INTEIRA daquele recorte, sem link e **ignorando o `limite`**.
   *   · **sem recorte** (`entrou`, `onboarding`) → `limite` + link, mais o
   *     token "sem recorte por este estágio" (não há dado por linha).
   *   · **identidade** (`cadastrou`) → `limite` + link, **sem token**: o
   *     ranking já é a lista de quem cadastrou, então o filtro devolveria os
   *     mesmos 86 e o corte de altura continua valendo.
   *
   * Nulo/ausente = visão "todos": `limite` + link.
   */
  foco?: Foco | null;
  /**
   * Quantas linhas a tabela desenha **quando o `foco` não recorta** (inclusive
   * sem `foco`). **Ausente = todas** — é o contrato que a sub-aba Parceiros
   * (`base.tsx`) herda sem precisar declarar nada.
   *
   * 🔴 **Ignorado SÓ quando há `foco` que recorta** (`mensagem`, `favorito`,
   * `contrato`). Métrica clicada mostra a lista inteira daquele recorte
   * (direção do Marcio, 24/09). Nos focos que não recortam — `entrou`,
   * `onboarding` e `cadastrou` — o `limite` **morde**: sem isso a sub-aba
   * padrão desenharia os 86 inteiros (~4.400 px), que é o que ele existe
   * para impedir.
   *
   * 🔴 O corte é `.slice(0, limite)` sobre a lista JÁ ordenada pelo banco:
   * corta o fim, nunca reordena. E ele é só de DESENHO — os 7 agregados do
   * cabeçalho continuam vindo do banco sobre todos os parceiros, e o
   * denominador da tabela continua sendo o total real.
   */
  limite?: number;
}) {
  const {
    itens,
    totalParceiros,
    mediaClientes,
    maxClientes,
    com30OuMais,
    semMensagem,
    comContratado,
    semAbrir14d,
  } = parceiros;

  // `.filter()` preserva a ordem relativa dos itens que sobram — o `Array`
  // nativo não reordena, só remove. A ordem continua sendo a do banco.
  const itensFiltrados = foco ? itens.filter((p) => passaNoFoco(p, foco)) : itens;
  const semRecorte = foco != null && FOCOS_SEM_RECORTE.has(foco);
  const identidade = foco != null && FOCOS_IDENTIDADE.has(foco);
  // `recorta` decide o CORTE (e só ele). O cabeçalho "N de M" vale para
  // `recorta` E para `identidade` (`cadastrou` diz "86 de 86"); os focos sem
  // recorte (`entrou`/`onboarding`) continuam em "86 parceiros" — dizer
  // "86 de 86" ao lado do token "sem recorte por este estágio" seria afirmar
  // um recorte que não houve.
  const recorta = foco != null && !semRecorte && !identidade;

  // 🔴 **O CORTE SÓ VALE QUANDO O `foco` NÃO RECORTA** (24/09/2026, achado do
  // João). O critério do Marcio para esta tela é literal: *"clicando numa
  // métrica, ela tem que mostrar a lista das pessoas daquela lista
  // específica"*. Recortar a lista JÁ filtrada contradiz o pedido — quem
  // clicou em `favorito` quer os 37, não os 15 primeiros dos 37. Pior: o link
  // prometia "ver os 60 →" e o destino (`base.tsx`, que renderiza
  // `foco={null}`) mostrava os 86 sem recorte nenhum, sem aviso.
  //
  // Então o `limite` só morde quando não há recorte de verdade:
  //   · `foco = null`                → 15 linhas + "ver todos os 86 →"
  //   · `foco = favorito` (37)       → as 37, sem link
  //   · `entrou`/`onboarding`        → 15 + "ver todos" + token (falta dado
  //     por linha: `FOCOS_SEM_RECORTE`, e `itensFiltrados` é a lista inteira)
  //   · `cadastrou` (86 de 86)       → 15 + "ver todos", SEM token
  //     (`FOCOS_IDENTIDADE`: o ranking já é a lista de quem cadastrou)
  //
  // ⚠️ Altura, e ela é DECISÃO NOSSA, não aceitação de ninguém: a lista
  // inteira em foco que recorta deriva da direção do Marcio de 24/09 —
  // *"se clicar numa métrica, tem que mostrar a lista das pessoas daquela
  // lista específica"*. O custo de altura que isso traz foi medido e aceito
  // aqui: `favorito` tem 37 linhas e a página passa dos 1.802 px da visão
  // padrão. Não há registro de o Marcio ter avaliado esse custo — o que ele
  // pediu foi a lista. A visão PADRÃO, que é a que abre sozinha, continua
  // cortada em 15 justamente para o custo não virar o caso comum.
  const cortaAqui = limite != null && !recorta;
  const itensNaTela =
    cortaAqui && itensFiltrados.length > limite
      ? itensFiltrados.slice(0, limite)
      : itensFiltrados;
  const cortou = itensNaTela.length < itensFiltrados.length;

  // 🔴 Requisito dormente: no dia em que `totalParceiros > 200`, `itens` é o
  // TOPO 200 (teto documentado no cabeçalho do arquivo), não a base inteira
  // — o denominador tem de dizer "dos 200 primeiros", nunca `totalParceiros`
  // (que seria a base real, maior que o que `itens` de fato contém). Hoje
  // `totalParceiros` é 86, então este ramo nunca dispara — mas o dia em que
  // disparar, o texto já está certo sem precisar lembrar de mudar aqui.
  // 🔑 O endereço da sub-aba que mostra TODOS, montado igual ao `trocarVis` de
  // `abas-painel.tsx`. É `<Link>` — navegação, não `replaceState`: esta peça é
  // Server Component e não escreve endereço nenhum (o dono de `foco` continua
  // sendo `regua.tsx`, o dono de `vis` continua sendo `abas-painel.tsx`).
  //
  // 🔴 **SEM `&foco=`, e isto é o conserto de 24/09/2026.** O endereço antes
  // carregava o foco atual "para não perder o estágio marcado" — só que o
  // destino, `base.tsx`, renderiza `<RankingDeParceiros foco={null}>` e IGNORA
  // o parâmetro. O link dizia "ver os 60 →" e abria os 86, calado. Como agora
  // o corte só existe na visão sem recorte (ver `cortaAqui` abaixo), este link
  // só aparece quando `foco` é nulo ou sem recorte — e aí não há estágio a
  // preservar. O endereço passa a dizer a verdade sobre o que abre: todos.
  //
  // 🔴 `aba` fica de fora de propósito: `visao` é o `ABA_PADRAO` e sai do
  // endereço por contrato — `/admin?aba=visao` seria a forma que o próprio
  // `trocar()` apaga.
  const hrefTodos = "/admin?vis=parceiros";

  const acimaDoTeto = totalParceiros > 200;
  // 🔑 "N de M" só quando há recorte de verdade ou identidade (`cadastrou`
  // → "86 de 86", a resposta verdadeira para quem clicou no estágio). Sem
  // `foco`, ou com foco que não recorta (`entrou`/`onboarding`, que levam o
  // token), o denominador não tem com o que contrastar: "86 parceiros".
  const cabecalhoTabela = recorta || identidade
    ? acimaDoTeto
      ? `${itensFiltrados.length} dos 200 primeiros`
      : `${itensFiltrados.length} de ${totalParceiros}`
    : acimaDoTeto
      ? `dos 200 primeiros`
      : `${totalParceiros} parceiros`;

  return (
    <section aria-labelledby="ranking-parceiros" className="grid gap-3">
      <h2 id="ranking-parceiros" className="sr-only">
        Ranking de parceiros
      </h2>

      {/* Cabeçalho denso: os agregados como pares rótulo/valor.
          🔴 **Sem moldura (24/09/2026, achado do João).** Era
          `rounded-xl border bg-card p-3` — e moldura em volta de agregado é
          card, exatamente o que este redesenho tirou da tela. Fica `dl` nu,
          separado do resto pelo `gap` da seção, igual à régua.
          🔴 E o par "Parceiros 86" SAIU: a linha logo abaixo já é o
          denominador da tabela ("86 parceiros"). O mesmo número duas vezes,
          a dois centímetros um do outro, é ruído — não redundância útil. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="corpo-sm text-muted-foreground">Média de clientes</dt>
          {/* `null` = nenhum parceiro com cliente. Travessão, nunca "0" —
              média de conjunto vazio não é zero, é inexistente. Mesma
              convenção de `brlOuTraco` nos honorários abaixo. */}
          <dd className="numero tabular-nums">{mediaClientes ?? "—"}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Máximo</dt>
          <dd className="numero tabular-nums">{maxClientes}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Com 30 ou mais</dt>
          <dd className="numero tabular-nums">{com30OuMais}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Sem mensagem</dt>
          <dd className="numero tabular-nums">{semMensagem}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">Com contratado</dt>
          <dd className="numero tabular-nums">{comContratado}</dd>
        </div>
        <div>
          <dt className="corpo-sm text-muted-foreground">
            Sem abrir há {PRAZO_SEM_ABRIR_DIAS}+ dias
          </dt>
          <dd className="numero tabular-nums">{semAbrir14d}</dd>
        </div>
      </dl>

      {/* Cabeçalho da tabela: contagem + denominador (regra 2), e o token
          "sem recorte" nos dois focos sem dado por linha — nada de parágrafo
          explicando o motivo aqui, isso mora no comentário do topo.
          🔴 `cadastrou` também não recorta, e mesmo assim NÃO leva o token:
          ali o estágio é filtrável (é a identidade do ranking), e o token
          diria o contrário. Ver `FOCOS_IDENTIDADE`. */}
      <div className="flex items-center justify-between gap-2">
        <span id="ranking-parceiros-tabela" className="corpo-sm text-muted-foreground tabular-nums">
          {cabecalhoTabela}
        </span>
        {semRecorte && (
          <span className="corpo-sm text-muted-foreground">sem recorte por este estágio</span>
        )}
      </div>

      {/* Quem rola na horizontal (celular 390px) é o container do próprio
          `Table` (`ui/table.tsx`, `overflow-x-auto`) — o `<main>` do portal
          nunca rola. 🔴 Sem `scrollbar-none` de propósito: medido em 24/09,
          em 390 só `#` e `Parceiro` cabem na tela e as 7 colunas numéricas
          ficam fora; a barra é o único indício de que existe mais tabela.
          (Um `overflow-x-auto scrollbar-none` nesta caixa externa era letra
          morta: o container interno rola primeiro e mostrava a barra dele.) */}
      <div className="-mx-(--card-spacing) rounded-xl border bg-card px-(--card-spacing)">
        <Table className="min-w-[52rem]" aria-describedby="ranking-parceiros-tabela">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-right">#</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="text-right">Clientes</TableHead>
              <TableHead className="text-right">Mensagens</TableHead>
              <TableHead className="text-right">Favoritos</TableHead>
              <TableHead className="text-right">Reuniões</TableHead>
              <TableHead className="text-right">Contratados</TableHead>
              <TableHead className="text-right">Honorários</TableHead>
              <TableHead className="text-right">
                Sem abrir há {PRAZO_SEM_ABRIR_DIAS}+ dias
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itensNaTela.map((p, i) => (
              // `relative`: a `TableRow` vira o retângulo do `after:inset-0`
              // do link na primeira célula — linha inteira clicável sem
              // aninhar `<a>` dentro de `<tr>` (HTML inválido).
              <TableRow key={p.alunoId} className="relative">
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/aluno/${p.alunoId}`}
                    // 🔴 `prefetch={false}`: o padrão do Next dispara
                    // `GET /admin/aluno/<id>?_rsc=` para TODA linha que entra
                    // na viewport, sem clique. Medido em Chromium (23/09/2026):
                    // 20 requisições ao rolar 20 linhas. Na sub-aba Parceiros
                    // (86 linhas) seriam 86 fichas renderizadas no servidor só
                    // por abrir a tela.
                    prefetch={false}
                    className="foco-visivel after:absolute after:inset-0 after:content-['']"
                  >
                    {p.nome || "Sem nome"}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.clientes}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.mensagens}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.favoritos}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.reunioes}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.contratados}
                </TableCell>
                {/* `null` some da célula — nunca "R$ 0,00" (`brlOuTraco`
                    já resolve isso com travessão, mesma regra de
                    `DashboardHonorarios.totalReais`). */}
                <TableCell className="text-right tabular-nums">
                  {brlOuTraco(p.honorarios)}
                </TableCell>
                <TableCell className="text-right">
                  {celulaDiasSemAbrir(p.dias)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 🔑 A porta de saída do corte: rótulo com VERBO, não frase — "zero
          parágrafo no DOM" continua valendo. O número é o que sobrou de fora
          mais o que está na tela, ou seja, o conjunto inteiro que a sub-aba
          Parceiros mostra.

          🔴 `prefetch={false}`: a sub-aba Parceiros é a tela mais cara do
          admin (o ranking inteiro + 5 blocos de composição da base), e este
          link fica visível no fim de toda variante — prefetch aqui renderiza
          essa tela no servidor só por rolar até o rodapé da tabela. */}
      {cortou && (
        <Link
          href={hrefTodos}
          prefetch={false}
          className="foco-visivel corpo-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          ver todos os {itensFiltrados.length} →
        </Link>
      )}
    </section>
  );
}
