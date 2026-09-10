"use client";

/**
 * As três abas de `/admin/plantao`, com a aba escolhida morando na **URL**
 * (`?aba=`), no mesmo padrão de `abas-painel.tsx`.
 *
 * 🔴 Por que a aba não pode ser estado local aqui: a página é um Server
 * Component e o calendário navega o mês por `?m=YYYY-MM`. Com `defaultValue`,
 * cada clique na seta do mês recarregava o servidor e jogava o admin de volta
 * em "Calendário" — mesmo que ele estivesse em "Alunos" ou "Mentoras". Na URL,
 * a aba sobrevive à navegação do mês, ao F5, ao voltar do navegador e ao link
 * colado num chat da equipe.
 *
 * 🔴 Allowlist fechada: `?aba=qualquercoisa` cai no padrão, em vez de deixar
 * as três abas sem conteúdo visível.
 *
 * 🔑 Um escritor só por parâmetro: este componente escreve `aba` e NADA mais —
 * `m` é preservado porque `sp` parte da consulta atual. `scroll: false` porque
 * trocar de aba não é mudar de página.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ABAS_PLANTAO = ["calendario", "acessos", "mentoras"] as const;
type AbaPlantao = (typeof ABAS_PLANTAO)[number];

/** A aba de `/admin/plantao` sem `?aba=`. */
const ABA_PADRAO: AbaPlantao = "calendario";

export function PlantaoAbas({
  calendario,
  alunos,
  mentoras,
}: {
  calendario: React.ReactNode;
  alunos: React.ReactNode;
  mentoras: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const bruto = searchParams.get("aba");
  const aba: AbaPlantao = (ABAS_PLANTAO as readonly string[]).includes(
    bruto ?? "",
  )
    ? (bruto as AbaPlantao)
    : ABA_PADRAO;

  function trocar(valor: string) {
    if (!(ABAS_PLANTAO as readonly string[]).includes(valor)) return;
    const sp = new URLSearchParams(searchParams.toString());
    // O padrão sai do endereço: `/admin/plantao` limpo continua limpo.
    if (valor === ABA_PADRAO) sp.delete("aba");
    else sp.set("aba", valor);
    const q = sp.toString();
    router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
  }

  return (
    <Tabs value={aba} onValueChange={(v) => trocar(String(v))}>
      <TabsList variant="line">
        <TabsTrigger value="calendario">Calendário</TabsTrigger>
        <TabsTrigger value="acessos">Alunos</TabsTrigger>
        <TabsTrigger value="mentoras">Mentoras</TabsTrigger>
      </TabsList>

      <TabsContent value="calendario" className="mt-4">
        {calendario}
      </TabsContent>
      <TabsContent value="acessos" className="mt-4">
        {alunos}
      </TabsContent>
      <TabsContent value="mentoras" className="mt-4">
        {mentoras}
      </TabsContent>
    </Tabs>
  );
}
