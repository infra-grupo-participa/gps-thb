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
 * que já está no endereço). Dois `router.replace` com estado local próprio
 * disputando a mesma chave se sobrescrevem: o último a rodar devolve o valor
 * velho que ele leu na montagem.
 *
 * `scroll: false` porque trocar de aba não é mudar de página — pular para o
 * topo apagaria a posição de leitura do admin.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  ativos: React.ReactNode;
  solicitacoes: React.ReactNode;
  etapas: React.ReactNode;
}) {
  const router = useRouter();
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
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
  }

  /**
   * 🔴 **Um escritor só por parâmetro**, a mesma regra do `aba` acima: este
   * componente é o dono de `aba` e de `vis`, e `useEstadoDoPainel` não toca em
   * nenhum dos dois (ele parte da consulta atual, então preserva os dois de
   * graça).
   */
  function trocarVis(valor: string) {
    if (!(SUBABAS_VISAO as readonly string[]).includes(valor)) return;
    const sp = new URLSearchParams(searchParams.toString());
    if (valor === SUBABA_VISAO_PADRAO) sp.delete("vis");
    else sp.set("vis", valor);
    const q = sp.toString().replace(/%2C/g, ",");
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
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
          <TabsList variant="line" className="justify-start">
            <TabsTrigger value="programa">O programa</TabsTrigger>
            <TabsTrigger value="atencao">Precisa de atenção</TabsTrigger>
            <TabsTrigger value="parceiros">Parceiros</TabsTrigger>
          </TabsList>

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
