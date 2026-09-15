import Link from "next/link";
import { ThbLogo } from "@/components/thb-logo";
import { MenuDeContas } from "@/components/menu-de-contas";
import { lerContas } from "@/lib/contas-do-navegador";
import { NavTabs, type NavItem } from "@/components/nav-tabs";
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
            />
          </div>
        </div>

        {navItems && navItems.length > 0 ? (
          // Um `NavTabs` só por REGIÃO (A11Y4): antes existiam dois nós para
          // as MESMAS abas — `hidden md:block` e `md:hidden` — o que duplicava
          // o DOM e punha cada link duas vezes na ordem de tabulação. Aqui
          // continua valendo: o trilho rola na horizontal quando não cabe
          // (pior caso: 8 abas em 360 px, com fade nas bordas), e a aba FIXA
          // (`navFixo`) mora num `NavTabs` SEPARADO, fora do scroller — cada
          // link do menu aparece exatamente uma vez no DOM, fixo ou não.
          //
          // 🔑 Por que a fixa não pode viver dentro do scroller: o contêiner é
          // `overflow-x-auto` e o `<nav>` interno é `w-max` — ele mede a
          // largura do PRÓPRIO CONTEÚDO, não a do contêiner. Um `ml-auto` no
          // último item não tem folga nenhuma para consumir ali dentro, então
          // não empurra nada: foi tentado e não funcionou. A saída é a aba
          // fixa morar num IRMÃO do scroller, dentro de um `flex` que os dois
          // compartilham — só assim ela fica de fato fora da rolagem.
          //
          // Nenhuma media query: `flex` + `min-w-0` (o scroller cede largura)
          // + `shrink-0` (o fixo nunca cede) são o mecanismo para qualquer
          // largura, inclusive 360 px — MEDIDO, ver o comentário abaixo.
          <div className="border-t">
            <div className="mx-auto flex w-full max-w-6xl items-stretch">
              <div className="scrollbar-none fade-lateral min-w-0 flex-1 overflow-x-auto pl-4">
                <NavTabs items={navItems} />
              </div>
              {navFixo ? (
                // 🔑 `bg-background` sólido é obrigatório, não decorativo: o
                // `<header>` é `bg-background/95 backdrop-blur` (translúcido).
                // Sem um fundo OPACO próprio aqui, o momentum scroll do
                // Safari/iOS deixa o conteúdo do trilho (que continua rolando
                // por baixo, fora da viewport visível) aparecer por
                // transparência atrás da aba fixa por uma fração de segundo.
                //
                // ✅ MEDIDO em 15/09/2026, no Chrome, com o CSS compilado de
                // produção e as 9 abas reais do parceiro, em SEIS larguras
                // (320/360/390/414/768/1366), sempre com o trilho **rolado
                // até o fim** — o pior caso:
                //
                //   largura  aba fixa   % da tela   trilho rola   sobrepõe?
                //     320     116,9 px    38,3%         sim          NÃO
                //     360     116,9 px    33,9%         sim          NÃO
                //     390     116,9 px    31,2%         sim          NÃO
                //     414     116,9 px    29,3%         sim          NÃO
                //     768     116,9 px    15,5%         sim          NÃO
                //    1366     116,9 px     8,7%         NÃO          NÃO
                //
                // Em todas: aba fixa inteira dentro da viewport, ZERO overflow
                // horizontal na página, rótulo "Tutoriais" visível (nunca só
                // ícone) e header estável em 98,2 px. Em 1366 o trilho para de
                // rolar e a aba fica colada à direita com o divisor — que é o
                // desenho pedido. Em 360 sobram 227,9 px de trilho rolável.
                //
                // 🔑 `bg-background` sólido é obrigatório, não decorativo: o
                // `<header>` é `bg-background/95 backdrop-blur` (translúcido).
                // Sem um fundo OPACO próprio aqui, o momentum scroll do
                // Safari/iOS deixa o conteúdo do trilho (que continua rolando
                // por baixo) aparecer por transparência atrás da aba fixa por
                // uma fração de segundo.
                //
                // ⚠️ O que a medição NÃO cobre: o momentum scroll do iOS
                // Safari (medido no Chrome desktop, que não o reproduz). O
                // `bg-background` é a defesa, mas só um aparelho iOS fecha
                // essa ponta.
                //
                // `border-l` some junto quando `navFixo` é `undefined`
                // (interruptor desligado): não há divisor órfão — garantia de
                // JSX (renderização condicional), não depende de medição.
                <div className="flex shrink-0 items-stretch border-l bg-background pr-4 pl-1">
                  <NavTabs items={[]} fixo={navFixo} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
