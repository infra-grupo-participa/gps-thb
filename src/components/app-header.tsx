import Link from "next/link";
import { ThbLogo } from "@/components/thb-logo";
import { MenuDeContas } from "@/components/menu-de-contas";
import { lerContas } from "@/lib/contas-do-navegador";
import { TrilhoDeNavegacao, type NavItem } from "@/components/nav-tabs";
import { AutoLogout } from "@/components/auto-logout";

export async function AppHeader({
  nome,
  email,
  papelRotulo,
  homeHref = "/",
  navItems,
  navFixo,
}: {
  nome: string | null;
  email: string | null;
  papelRotulo: string;
  homeHref?: string;
  navItems?: NavItem[];
  /** Aba que NÃO rola com o trilho — hoje só "Tutoriais". `undefined`/ausente
   *  = sem aba fixa (a maioria das páginas, e todo header sem `navItems`). */
  navFixo?: NavItem;
}) {
  // 🔑 O header busca as contas SOZINHO. Passar por prop obrigaria as 20
  // páginas que o renderizam a saber da feature — e a primeira que
  // esquecesse mostraria um menu sem a troca de conta, sem erro nenhum.
  //
  // A conta ATUAL sai da lista: trocar para si mesmo não é troca.
  const outrasContas = (await lerContas())
    .filter((c) => c.email !== email)
    .map(({ userId, email: e, nome: n }) => ({ userId, email: e, nome: n }));

  // 🔑 Item marcado `noMenuDeContas` EXISTE no array (é `nav.ts` quem decide
  // se o usuário tem direito a ele — hoje "Equipe", atrás da flag de sempre),
  // mas mora no menu "Sua conta" em vez do trilho. Um único array continua
  // sendo a fonte de verdade de "o que este usuário alcança"; o que muda é
  // ONDE cada item aparece, e essa decisão é do header, não de `nav.ts`.
  //
  // 🔴 A partição é EXAUSTIVA de propósito: `TrilhoDeNavegacao` filtra o mesmo
  // predicado ao contrário. Se um dos dois lados esquecesse de filtrar, o item
  // apareceria duas vezes (dois alvos para o mesmo destino, dobrado na ordem
  // de tabulação — o defeito A11Y4 de novo) ou em lugar nenhum, que é
  // "feature sem porta de entrada".
  const itensExtras = (navItems ?? [])
    // 🔴 `emBreve`/`adminOnly` NÃO entram no menu (achado BAIXO do kirad,
    // 24/09): no trilho eles viram rótulo apagado ou ganham `previa-oculta`;
    // no menu virariam `<Link>` clicável sem nenhuma dessas travas.
    .filter((i) => i.noMenuDeContas && !i.emBreve && !i.adminOnly)
    .map(({ href, label }) => ({ href, label }));

  return (
    <>
      {/* O header só é renderizado em tela autenticada, então é o lugar
          natural para o relógio de inatividade viver. */}
      <AutoLogout />
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {/* DUAS LINHAS SEMPRE (linha 1 = marca + conta; linha 2 = abas).
            Antes era uma linha com `flex-wrap` + `md:h-16`, e em 1366 px com 8
            abas o bloco de marca colapsava para QUATRO linhas ("Time / Holding
            Brasil / Programa de / Implementação / Assistida"), estourando os
            64 px do header e empurrando a faixa "Modo assistência" por cima do
            subtítulo. Com as abas na própria linha, a marca nunca disputa
            largura com elas — o header fica igual com 3 ou com 8 abas. */}
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-x-4 px-4">
          <Link
            href={homeHref}
            className="foco-visivel flex min-w-0 items-center gap-2.5 rounded-md"
          >
            <ThbLogo size="sm" className="size-10" />
            {/* UMA linha. O subtítulo "Programa de Implementação Assistida"
                saiu daqui: já está no `<title>` e no `PageHeader` de toda
                página, e era ele que causava a quebra em 4 linhas. */}
            <span className="truncate font-heading text-[0.9375rem] font-semibold">
              Time Holding Brasil
            </span>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-3">
            {/* Perfil, trocar de conta e sair vivem num menu só. O botão de
                logout solto saiu: eram dois alvos para a mesma área, e a
                troca de conta não teria onde morar. */}
            <MenuDeContas
              nome={nome}
              email={email}
              papelRotulo={papelRotulo}
              outrasContas={outrasContas}
              itensExtras={itensExtras}
            />
          </div>
        </div>

        {navItems && navItems.length > 0 ? (
          // O trilho inteiro (linha de abas + a 3ª linha de sub-abas, quando
          // o grupo ativo tem filhos) vive em `TrilhoDeNavegacao`, que é o
          // ÚNICO Client Component da navegação. O JSX do scroller e da aba
          // fixa MIGROU para lá intacto, com as medições de 15/09 — este
          // arquivo é Server Component e não pode chamar `usePathname()`, e
          // era ele que decidia a geometria das linhas.
          //
          // 🔑 A fronteira cliente sobe para UM nó: com ela em cada `NavTabs`,
          // as três a quatro instâncias da mesma tela assinariam o router
          // separadamente e releriam o `sessionStorage` do painel uma vez cada.
          <TrilhoDeNavegacao items={navItems} fixo={navFixo} />
        ) : null}
      </header>
    </>
  );
}
