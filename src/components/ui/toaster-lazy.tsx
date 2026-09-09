"use client";

import dynamic from "next/dynamic";

/**
 * O `<Toaster>` do root layout, fora do carregamento inicial.
 *
 * Por quê: o layout raiz vale para TODA rota, então o `sonner` (10,9 KB gzip,
 * com os 5 ícones do `ui/sonner.tsx`) entrava no primeiro lote de JavaScript
 * até do `/login` — uma tela de dois campos que nunca emite um toast.
 *
 * 🔑 Não é truque de medição: nenhum toast do portal aparece antes de alguém
 * clicar em alguma coisa. O chunk começa a baixar assim que a página hidrata,
 * muito antes do primeiro clique possível — só deixou de ser bloco do caminho
 * crítico. Nas páginas autenticadas o `sonner` continua no bundle de qualquer
 * forma, porque elas importam `toast` diretamente.
 *
 * `ssr: false` é obrigatório aqui e é o motivo deste arquivo existir: o root
 * layout é Server Component, e `next/dynamic` com `ssr: false` só é permitido
 * dentro de um client component. O `<Toaster>` também não tem o que renderizar
 * no servidor — nasce vazio.
 */
const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);

export function ToasterLazy() {
  return <Toaster richColors position="top-center" />;
}
