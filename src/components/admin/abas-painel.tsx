"use client";

/**
 * O SELETOR DE CONTEÚDO do painel de `/admin` — qual das quatro seções aparece,
 * conforme `?aba=`.
 *
 * 🔴 **Este arquivo NÃO desenha mais as abas de 1º nível.** Até 24/09/2026 ele
 * tinha uma `TabsList` com "Visão geral · Parceiros · Solicitações · Etapas";
 * essas quatro viraram as SUB-ABAS do grupo "Parceiros" na 3ª linha do header
 * (`SubNavTabs`, em `components/nav-tabs.tsx`). Duas réguas de abas empilhadas
 * — uma no header, outra 40 px abaixo, com os mesmos rótulos — faziam a mesma
 * pergunta duas vezes e nenhuma das duas dizia qual mandava.
 *
 * 🔴 **O CONTADOR DE SOLICITAÇÕES PENDENTES foi junto, e mudou de dono.** A
 * `TabsList` desenhava `pendentes` como badge na aba "Solicitações"; hoje o
 * número desce por `adminNavItems({ solicitacoesPendentes })` (`src/lib/nav.ts`)
 * e é pintado pelo mecanismo de `badge` do `NavItem` — no GRUPO quando ele
 * está fechado, na SUB-ABA quando está aberto. Por isso este componente não
 * recebe mais `totalAlunos`/`pendentes`: prop que ninguém desenha é promessa
 * de que o número aparece em algum lugar, e na 1ª rodada de 24/09 ele não
 * aparecia em lugar nenhum. Quem passa o número é `/admin/page.tsx`, do mesmo
 * `pendentes.length` que já estava na página — ZERO consulta nova.
 *
 * 🔴 **UM ESCRITOR SÓ POR PARÂMETRO — e o de `aba` mudou de dono.** O
 * `trocar()` que existia aqui foi APAGADO no mesmo commit: quem grava `aba`
 * agora é `SubNavTabs`. Este componente ficou só com a LEITURA. Dois
 * componentes com estado próprio disputando a mesma chave se sobrescrevem: o
 * último a rodar devolve o valor velho que leu na montagem.
 *
 * ✅ `?vis=` (as 3 sub-abas da Visão geral) CONTINUA aqui, intocado — `trocarVis`
 * e a `Tabs` aninhada com sua `TabsList`. É a pergunta "o que está acontecendo
 * no programa", que é de DENTRO da Visão geral e não tem lugar no header.
 *
 * 🔑 Por que `switch` e não `Tabs` do Base UI no 1º nível: sem `TabsList` não
 * existe `role="tab"` para nomear o painel, e `TabsPanel` sozinho renderiza um
 * `role="tabpanel"` com `aria-labelledby` apontando para um id que não existe —
 * ARIA quebrado que nenhum `tsc` pega. Sem lista de abas, o certo é não fingir
 * que há um widget de abas: é só conteúdo condicional. As sub-abas da 3ª linha
 * do header são `<button>`/`<a>` com `aria-current="page"`, que é o padrão de
 * NAVEGAÇÃO — que é o que elas de fato são.
 *
 * 🔴 **`window.history.replaceState`, e NÃO `router.replace`** (vale para o
 * `?vis=` que ficou, e para o `?aba=` que mudou de arquivo). Em App Router, um
 * `router.replace` que muda `searchParams` numa página `ƒ (Dynamic)` que lê
 * `searchParams` **re-executa o Server Component**: cada clique refaria
 * `getDashboard()` (RPC de ~60 ms, medida em 23/09) para mostrar conteúdo que
 * **já estava na página**. As quatro seções e as três sub-abas chegam
 * pré-renderizadas por prop (`visaoPrograma`, `ativos`, …); a troca é escolha
 * de qual nó já montado aparece, não navegação.
 *
 * Desde o Next 14.1 o `useSearchParams()` **sincroniza com `pushState`/
 * `replaceState` nativos** sem ir ao servidor (docs: "Using the native History
 * API"). O `replaceState` troca o endereço, o `useSearchParams()` reavalia no
 * mesmo tick, este componente re-renderiza e a seção certa aparece.
 *
 * ⚠️ **Não "uniformize" isto de volta para `router.replace`.** A troca é
 * deliberada e foi medida; `regua.tsx` faz o mesmo pela mesma razão.
 *
 * Sem `scroll: false` porque não há navegação para mover a rolagem — a History
 * API não mexe na posição, que é justamente o que se queria.
 */

import { usePathname, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ABAS,
  ABA_PADRAO,
  SUBABAS_VISAO,
  SUBABA_VISAO_PADRAO,
  type AbaPainel,
  type SubAbaVisao,
} from "./alunos-ativos-lista/estado-na-url";

export function AbasPainel({
  visaoPrograma,
  visaoAtencao,
  visaoParceiros,
  apuradoEm,
  ativos,
  solicitacoes,
  etapas,
}: {
  /**
   * Sub-aba `programa` — o dashboard do programa. Aba padrão de `/admin` e
   * sub-aba padrão da Visão geral: `/admin` sem parâmetro nenhum cai aqui.
   */
  visaoPrograma: React.ReactNode;
  /** Sub-aba `atencao` — as 5 réguas da fila da equipe. */
  visaoAtencao: React.ReactNode;
  /** Sub-aba `parceiros` — o ranking. */
  visaoParceiros: React.ReactNode;
  /**
   * Quando os números foram apurados, já formatado pelo servidor.
   *
   * Vem pronto de propósito: formatar aqui usaria o fuso do NAVEGADOR e a
   * data mudaria para quem estivesse fora de America/Sao_Paulo. `null` quando
   * a RPC não respondeu — e aí a linha some, em vez de afirmar uma hora que
   * ninguém apurou.
   */
  apuradoEm?: string | null;
  ativos: React.ReactNode;
  solicitacoes: React.ReactNode;
  etapas: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Allowlist: `?aba=qualquercoisa` cai no padrão em vez de deixar as três
  // abas sem conteúdo visível.
  const bruto = searchParams.get("aba");
  const aba: AbaPainel = (ABAS as readonly string[]).includes(bruto ?? "")
    ? (bruto as AbaPainel)
    : ABA_PADRAO;

  // Mesma allowlist, segundo parâmetro. `?vis=` fora da lista cai no padrão —
  // nunca deixa a Visão geral sem conteúdo.
  const brutoVis = searchParams.get("vis");
  const vis: SubAbaVisao = (SUBABAS_VISAO as readonly string[]).includes(
    brutoVis ?? "",
  )
    ? (brutoVis as SubAbaVisao)
    : SUBABA_VISAO_PADRAO;

  /**
   * 🔴 **Um escritor só por parâmetro.** Este componente é dono de **`vis` e
   * só de `vis`** — `aba` mudou de dono em 24/09 e agora é escrito por
   * `SubNavTabs` (`components/nav-tabs.tsx`). `useEstadoDoPainel` não toca em
   * nenhum dos dois (ele parte da consulta atual, então os preserva de graça),
   * e `trocarVis` preserva `aba` pela mesma via.
   *
   * 🔴 `replaceState`, não `router.replace` — as três sub-abas já chegam
   * renderizadas em `visaoPrograma`/`visaoAtencao`/`visaoParceiros`, e ir ao
   * servidor aqui era a RPC de ~60 ms por clique. Ver o cabeçalho do arquivo
   * e `dashboard/regua.tsx`.
   */
  function trocarVis(valor: string) {
    if (!(SUBABAS_VISAO as readonly string[]).includes(valor)) return;
    const sp = new URLSearchParams(searchParams.toString());
    if (valor === SUBABA_VISAO_PADRAO) sp.delete("vis");
    else sp.set("vis", valor);
    const q = sp.toString().replace(/%2C/g, ",");
    window.history.replaceState(null, "", `${pathname}${q ? `?${q}` : ""}`);
  }

  // 🔑 O SELETOR. `switch`, não `Tabs`: sem `TabsList` no 1º nível não há
  // `role="tab"` para nomear o painel, e um `role="tabpanel"` com
  // `aria-labelledby` órfão é ARIA quebrado. Quem faz o papel da lista agora é
  // a 3ª linha do header, com `aria-current="page"` — semântica de NAVEGAÇÃO,
  // que é o que aquelas quatro sempre foram (elas mudam a URL).
  //
  // 🔑 O `switch` também DESMONTA a seção inativa, igual `TabsContent` sem
  // `keepMounted` fazia. Nenhuma das quatro carrega nada próprio: todas chegam
  // prontas por prop do Server Component. Se um dia uma delas ganhar `useEffect`
  // com busca, a desmontagem vira uma consulta por clique — o padrão da casa
  // (folha que desmonta por aba não carrega nada que não venha de prop).
  if (aba === "ativos") return <>{ativos}</>;
  if (aba === "solicitacoes") return <>{solicitacoes}</>;
  if (aba === "etapas") return <>{etapas}</>;

  // `visao` — o padrão (`ABA_PADRAO`), e o único ramo com estado próprio
  // (`?vis=`, as 3 sub-abas do programa).
  return (
    <div className="flex flex-col gap-6">
      {/* As sub-abas do programa. Segunda régua, segunda pergunta: a de cima
            é "que parte do painel eu opero", esta é "o que está acontecendo no
            programa". `justify-start` pela MESMA razão da lista de cima — o
            excesso tem de sair só pela direita, senão a primeira fica cortada
            e inalcançável em 390 px. */}
      <Tabs
        value={vis}
        onValueChange={(v) => trocarVis(String(v))}
        className="gap-4"
      >
        {/* 🔴 O carimbo de apuração vale para as TRÊS sub-abas e por isso
              mora aqui, não dentro de uma delas.

              Até 23/09/2026 o "Dados de …" existia só no rodapé de
              `DashboardExecutivo` — quem abria `?vis=atencao` ou
              `?vis=parceiros` via os números SEM nenhuma indicação de quando
              foram apurados. E são justamente as duas telas de decidir a quem
              ligar hoje. O dado é retrato de uma RPC, não tempo real: a
              diferença importa quando alguém age em cima dele. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="programa">O programa</TabsTrigger>
            <TabsTrigger value="atencao">Precisa de atenção</TabsTrigger>
            <TabsTrigger value="parceiros">Parceiros</TabsTrigger>
          </TabsList>
          {apuradoEm ? (
            <span className="corpo-sm text-muted-foreground">
              Apurado {apuradoEm}
            </span>
          ) : null}
        </div>

        <TabsContent value="programa">{visaoPrograma}</TabsContent>
        <TabsContent value="atencao">{visaoAtencao}</TabsContent>
        <TabsContent value="parceiros">{visaoParceiros}</TabsContent>
      </Tabs>
    </div>
  );
}
