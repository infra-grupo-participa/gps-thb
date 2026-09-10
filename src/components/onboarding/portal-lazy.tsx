"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

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

export function OnboardingPortalLazy(
  props: ComponentProps<typeof OnboardingPortal>,
) {
  return <Portal {...props} />;
}
