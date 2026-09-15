"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { SocioCadastro } from "./index";

/**
 * `next/dynamic` obrigatório (`ssr:false`): import estático de client
 * component entra no `page_client-reference-manifest.js` de TODA rota — é
 * assim que o portal do onboarding foi parar no bundle de `/login` e de
 * `/p/plantao` (236 → 260 KB gzip). Molde:
 * `src/components/onboarding/portal-lazy.tsx`.
 *
 * ⚠️ O `import type` acima é **erasado** pelo compilador: dá o tipo das
 * props sem criar aresta estática para `./index`. Trocar por `import` normal
 * desfaz a otimização em silêncio.
 */
export const SocioCadastroPortalLazy = dynamic(
  () => import("./index").then((m) => m.SocioCadastro),
  { ssr: false },
) as (props: ComponentProps<typeof SocioCadastro>) => React.JSX.Element;
