"use client";

/**
 * As três abas de `/admin`, com a aba escolhida morando na **URL** (`?aba=`).
 *
 * 🔑 Por que na URL, e não em `useState`: é a mesma regra da busca, da ordem e
 * dos filtros (`alunos-ativos-lista/estado-na-url.ts`). O admin abre o
 * ambiente de um aluno a partir da lista e volta pelo navegador — sem a aba no
 * endereço, ele volta para "Alunos ativos" mesmo tendo saído de
 * "Solicitações", e a âncora de rolagem restauraria a posição numa aba que
 * não está na tela.
 *
 * 🔴 **Um escritor só por parâmetro.** Este componente escreve `aba` e mais
 * nada; `useEstadoDoPainel` escreve `q`, `ordem` e `f` e **não toca em `aba`**
 * (ele preserva o que já está no endereço). Dois `router.replace` com estado
 * local próprio disputando a mesma chave se sobrescrevem: o último a rodar
 * devolve o valor velho que ele leu na montagem.
 *
 * `scroll: false` porque trocar de aba não é mudar de página — pular para o
 * topo apagaria a posição de leitura do admin.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABAS, type AbaPainel } from "./alunos-ativos-lista/estado-na-url";

export function AbasPainel({
  totalAlunos,
  pendentes,
  ativos,
  solicitacoes,
  etapas,
}: {
  totalAlunos: number;
  pendentes: number;
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
    : "ativos";

  function trocar(valor: string) {
    if (!(ABAS as readonly string[]).includes(valor)) return;
    const sp = new URLSearchParams(searchParams.toString());
    // O padrão sai do endereço: `/admin` limpo tem de continuar `/admin`.
    if (valor === "ativos") sp.delete("aba");
    else sp.set("aba", valor);
    const q = sp.toString().replace(/%2C/g, ",");
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
  }

  return (
    <Tabs value={aba} onValueChange={(v) => trocar(String(v))} className="gap-6">
      <TabsList variant="line">
        <TabsTrigger value="ativos">
          Alunos ativos
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

      <TabsContent value="ativos">{ativos}</TabsContent>
      <TabsContent value="solicitacoes">{solicitacoes}</TabsContent>
      <TabsContent value="etapas">{etapas}</TabsContent>
    </Tabs>
  );
}
