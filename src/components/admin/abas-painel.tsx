"use client";

/**
 * As quatro abas de `/admin`, com a aba escolhida morando na **URL** (`?aba=`).
 *
 * 🔑 **"Visão geral" é uma aba, não um bloco em cima da lista.** Até 10/09 o
 * dashboard ficava empilhado acima das abas: nove cards de rolagem entre o
 * título da página e a lista de alunos, que é a razão pela qual a equipe abre
 * esta tela. Agora são dois lugares irmãos — o resumo do programa e a lista de
 * gente — e `/admin` sem parâmetro abre o resumo.
 *
 * 🔑 Por que na URL, e não em `useState`: é a mesma regra da busca, da ordem e
 * dos filtros (`alunos-ativos-lista/estado-na-url.ts`). O admin abre o
 * ambiente de um aluno a partir da lista e volta pelo navegador — sem a aba no
 * endereço, ele volta para "Alunos ativos" mesmo tendo saído de
 * "Solicitações", e a âncora de rolagem restauraria a posição numa aba que
 * não está na tela.
 *
 * 🔴 **Um escritor só por parâmetro.** Este componente escreve `aba` e `vis`
 * (as sub-abas da Visão geral, 23/09/2026) e mais nada; `useEstadoDoPainel`
 * escreve `q`, `ordem` e `f` e **não toca em nenhum dos dois** (ele preserva o
 * que já está no endereço). Dois escritores com estado local próprio
 * disputando a mesma chave se sobrescrevem: o último a rodar devolve o valor
 * velho que ele leu na montagem.
 *
 * 🔴 **`window.history.replaceState`, e NÃO `router.replace` — o precedente é
 * `dashboard/regua.tsx` (leia o cabeçalho dele).** Em App Router, um
 * `router.replace` que muda `searchParams` numa página `ƒ (Dynamic)` que lê
 * `searchParams` **re-executa o Server Component**: `/admin/page.tsx` lê
 * `?mais=`, então cada clique numa aba refazia `getDashboard()`,
 * `getAlunosGps()` e as outras cinco leituras — a RPC de ~60 ms de novo, para
 * mostrar conteúdo que **já estava na página**. As quatro abas e as três
 * sub-abas chegam pré-renderizadas por prop (`visaoPrograma`, `ativos`, …); a
 * troca é escolha de qual nó já montado aparece, não navegação.
 *
 * Desde o Next 14.1 o `useSearchParams()` **sincroniza com `pushState`/
 * `replaceState` nativos** sem ir ao servidor (docs: "Using the native History
 * API"). O `replaceState` troca o endereço, o `useSearchParams()` reavalia no
 * mesmo tick, este componente re-renderiza e a aba certa aparece.
 *
 * ⚠️ **Não "uniformize" isto de volta para `router.replace`.** A troca é
 * deliberada e foi medida; `regua.tsx` faz o mesmo pela mesma razão.
 *
 * 🔑 **Por que trocar de aba nunca precisa do servidor**, inclusive
 * `?aba=ativos` com filtro: a lista de parceiros filtra **em memória sobre o
 * lote** já carregado (`useEstadoDoPainel` + `ordenacao.ts`); `page.tsx` lê
 * **só `?mais=`**, e `mais` só muda por `<Link>` ("Mostrar mais"), que é
 * navegação de verdade e não passa por aqui. `trocar()` preserva os demais
 * parâmetros, então o conteúdo de `ativos` já veio pronto.
 *
 * Sem `scroll: false` porque não há navegação para mover a rolagem — a
 * History API não mexe na posição, que é justamente o que se queria.
 */

import { usePathname, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
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
  totalAlunos,
  pendentes,
  visaoPrograma,
  visaoAtencao,
  visaoParceiros,
  apuradoEm,
  ativos,
  solicitacoes,
  etapas,
}: {
  totalAlunos: number;
  pendentes: number;
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

  function trocar(valor: string) {
    if (!(ABAS as readonly string[]).includes(valor)) return;
    const sp = new URLSearchParams(searchParams.toString());
    // O padrão sai do endereço: `/admin` limpo tem de continuar `/admin`.
    if (valor === ABA_PADRAO) sp.delete("aba");
    else sp.set("aba", valor);
    // 🔴 Sair da Visão geral leva o `vis` junto: `?aba=ativos&vis=atencao` é
    // estado de uma aba que não está na tela, e voltaria a valer numa próxima
    // visita sem que ninguém o tenha escolhido de novo.
    if (valor !== "visao") sp.delete("vis");
    const q = sp.toString().replace(/%2C/g, ",");
    window.history.replaceState(null, "", `${pathname}${q ? `?${q}` : ""}`);
  }

  /**
   * 🔴 **Um escritor só por parâmetro**, a mesma regra do `aba` acima: este
   * componente é o dono de `aba` e de `vis`, e `useEstadoDoPainel` não toca em
   * nenhum dos dois (ele parte da consulta atual, então preserva os dois de
   * graça).
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

  return (
    <Tabs value={aba} onValueChange={(v) => trocar(String(v))} className="gap-6">
      {/* 🔴 `justify-start`: a `TabsList` nasce `justify-center` e, quando as
          quatro abas não cabem (390 px), o conteúdo centralizado transborda
          para os DOIS lados — a primeira aba ("Visão geral") ficava cortada e
          **inalcançável**, porque `scrollLeft` já está em 0. Alinhada à
          esquerda, o excesso sai só pela direita e a faixa rola até ele. */}
      <TabsList variant="line" className="justify-start">
        <TabsTrigger value="visao">Visão geral</TabsTrigger>
        <TabsTrigger value="ativos">
          Parceiros
          <Badge variant="secondary" className="ml-1.5 text-[10px]">
            {totalAlunos}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="solicitacoes">
          Solicitações
          {pendentes > 0 ? (
            <Badge className="ml-1.5 text-[10px]">{pendentes}</Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="etapas">Etapas</TabsTrigger>
      </TabsList>

      <TabsContent value="visao">
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
      </TabsContent>
      <TabsContent value="ativos">{ativos}</TabsContent>
      <TabsContent value="solicitacoes">{solicitacoes}</TabsContent>
      <TabsContent value="etapas">{etapas}</TabsContent>
    </Tabs>
  );
}
