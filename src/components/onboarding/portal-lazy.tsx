"use client";

import dynamic from "next/dynamic";
import { useState, type ComponentProps } from "react";

import type { MeuOnboarding } from "@/lib/types";
import type { OnboardingPortal } from "./index";

/**
 * O portal do questionário **fora do carregamento inicial**.
 *
 * ## Por que este arquivo existe
 *
 * `OnboardingGate` mora no layout da raiz e devolve `null` para quase todo
 * mundo — mas **guarda de servidor não é guarda de bundle**. Um `import`
 * estático de client component entra no `page_client-reference-manifest.js` de
 * **toda** rota, e o portal (o diálogo do Base UI, as máscaras de moeda e
 * telefone, os 10 passos, o tour, o upload) são ~14 KB gzip que iam para o
 * primeiro lote de JS do `/login` — uma tela de dois campos onde ninguém está
 * logado — e do `/p/plantao`, que é rota pública em iframe. Medido: `/login`
 * saiu de 236 para 260 KB gzip, contra um aceite de ≤ 245.
 *
 * 🔑 `ssr: false` é obrigatório **e** é o motivo de o arquivo ser client: o
 * layout da raiz é Server Component, e `next/dynamic({ ssr: false })` só é
 * permitido dentro de um client component (é a mesma razão de
 * `ui/toaster-lazy.tsx` existir). Não custa nada em experiência: o portal é um
 * diálogo modal — não há conteúdo a hidratar, nem altura a reservar, nem
 * layout a deslocar. O chunk começa a baixar assim que a página hidrata.
 *
 * ⚠️ O `import type` acima é **erasado** pelo compilador: ele dá o tipo das
 * props sem criar aresta estática para `./index`. Trocar por `import` normal
 * desfaz a otimização inteira em silêncio — `tsc` continua verde e só a
 * medição de bundle acusa.
 */
const Portal = dynamic(
  () => import("./index").then((m) => m.OnboardingPortal),
  { ssr: false },
);

/**
 * ## A trava de montagem (Auditor F, war-room 10/09)
 *
 * `concluir()` revalida o layout enquanto o questionário está aberto. O gate
 * (Server Component) volta com `status: "concluido"`; se a decisão "abrir ou
 * não" fosse tomada a cada render, o portal seria desmontado no instante da
 * conclusão e a apresentação (passos 8/9) nunca apareceria — foi exatamente o
 * que aconteceu com todo aluno até aqui.
 *
 * Por isso a decisão é tomada **uma vez, na montagem**, e os `dados` daquela
 * montagem ficam congelados enquanto o componente viver: o portal continua
 * de pé, `concluir()` avança para o tour, e quem fecha o diálogo deixa este
 * componente rendendo `null` até a próxima carga completa da página. Quem não
 * precisa (já concluiu e não tem senha temporária) nunca dispara o `import()`
 * do chunk — a otimização de bundle acima continua valendo.
 */
export function OnboardingPortalLazy({
  dados,
  ...props
}: Omit<ComponentProps<typeof OnboardingPortal>, "dados"> & {
  /**
   * `null` = "este aluno já concluiu e não tem senha temporária": o gate manda
   * `null` em vez do objeto inteiro para não serializar as respostas
   * (nome do cliente, descrição do caso) no RSC de TODA página do aluno.
   */
  dados: MeuOnboarding | null;
}) {
  const [congelado] = useState(() => dados);
  // `soTour` é o "Rever a apresentação" do /perfil: monta com status concluído
  // de propósito e tem de abrir.
  const [precisa] = useState(
    () =>
      dados !== null &&
      (Boolean(props.soTour) ||
        dados.status !== "concluido" ||
        Boolean(dados.precisaTrocarSenha)),
  );
  if (!precisa || congelado === null) return null;
  // As actions e as abas vêm sempre do render atual (são estáveis); só os
  // `dados` ficam congelados — é neles que "concluido" chega no meio do tour.
  return <Portal {...props} dados={congelado} />;
}
