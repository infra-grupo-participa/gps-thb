"use client";

/**
 * A PASTA COM FOLHAS — as quatro abas da ficha do cliente.
 *
 * Pedido do Marcio (24/09/2026): *"dando literalmente a ideia de uma
 * ficha/pasta com folhas — cada folha é uma aba"*. A ficha era um formulário
 * de ~1.000 px de rolagem com cinco seções empilhadas; agora são quatro
 * folhas, na ordem do funil, e a pasta abre na folha onde o caso está.
 *
 * Este arquivo é só a CASCA: a régua das abas, o contador de cada rótulo, a
 * marca de alteração e o estado na URL. O conteúdo chega por prop
 * (`ReactNode`), montado pelo `ClienteFicha` — que continua dono de todos os
 * `useState` do formulário.
 *
 * ── DENSO E CHAPADO ────────────────────────────────────────────────────────
 * Abas como APARADORES de pasta: régua laranja de 2 px na folha ativa (o
 * mesmo `TabsList variant="line"` do header e do painel do admin), uma linha
 * fina separando, corpo em `bg-card`. Sem sombra, sem gradiente, sem ícone
 * decorativo, sem fonte grande. Hierarquia por POSIÇÃO. Tipografia pelas
 * `@utility` (`rotulo`, `corpo-sm`) — **nunca** `text-*` custom, que o
 * `tailwind-merge` trata como COR e descarta.
 *
 * ── 🔴 O ESTADO MORA NA URL, ESCRITO COM `replaceState` ────────────────────
 * Precedente: `src/components/admin/abas-painel.tsx` e `dashboard/regua.tsx`
 * (leia os cabeçalhos dos dois). `router.replace` numa página que lê
 * `searchParams` RE-EXECUTA o Server Component — aqui seria refazer
 * `getClienteById`, `getMinutasDoCliente`, `getDecisoresPendentes` e
 * `getEntrevistasDoCliente` a cada clique numa aba, para mostrar conteúdo que
 * já está montado na página.
 *
 * Conferido em 24/09/2026: **nenhuma das duas `page.tsx` da ficha lê
 * `searchParams`** (`/clientes/[clienteId]` e
 * `/admin/aluno/[alunoId]/clientes/[clienteId]`), então nem haveria
 * re-execução por dependência — mas `replaceState` é a regra da casa e o
 * precedente vale de qualquer forma: no dia em que uma delas passar a ler a
 * consulta, a troca de aba não vira ida ao banco sem ninguém perceber.
 *
 * 🔴 **Um escritor só de `aba`.** Este componente é o único que escreve a
 * chave `aba`, em toda a ficha. Ele preserva os demais parâmetros da consulta
 * (parte de `searchParams.toString()`), então não disputa com ninguém.
 *
 * 🔴 **O padrão SAI do endereço**: `/clientes/[id]` limpo continua limpo.
 * Escrever `?aba=preliminar` só porque a fase é "prospecção" congelaria num
 * link uma fase que muda.
 *
 * ── 🔴 CONTADOR NO RÓTULO DE TODA ABA ──────────────────────────────────────
 * "Recolhido não pode ser invisível": aba inativa É conteúdo escondido. Cada
 * rótulo carrega o que tem dentro (`contadorDaAba`), em `Badge
 * variant="neutral"` — texto, nunca cor sozinha. A única aba que pode ficar
 * sem badge é "Dados básicos" sem razão social, e aí não há fato a esconder.
 *
 * ── 🔴 `keepMounted`: POR QUE O CONTEÚDO NÃO DESMONTA ───────────────────────
 * `TabsPanel` do Base UI é `keepMounted = false` por padrão — o conteúdo
 * inativo SAI do DOM. Para os campos do formulário isso seria inofensivo (os
 * `useState` vivem no `ClienteFicha`, acima das abas, e sobrevivem à troca),
 * mas **`MinutasAnexo` e `ContratoAnexo` têm estado PRÓPRIO** (o texto de
 * contexto da minuta, o arquivo escolhido, a mensagem de erro do upload) —
 * e esse estado morre ao desmontar. Alguém escrevendo "o que mudou" numa
 * minuta, indo conferir um problema na aba 2 e voltando, perderia o texto
 * sem nenhum aviso. Com `keepMounted`, as quatro folhas ficam no DOM e o
 * painel inativo leva `hidden`.
 *
 * ⚠️ Consequência aceita e medida: o markup das quatro folhas existe desde a
 * primeira pintura. É o mesmo DOM que a ficha tinha ANTES das abas (as cinco
 * seções empilhadas) — não há custo novo de rede nem de consulta, só de nós.
 *
 * ⚠️ `hidden` não é prova de invisibilidade para teste: filho "visível"
 * dentro de pai oculto dá verde falso. Quem prova é `offsetParent`, em
 * navegador que pinta.
 *
 * ── 🔴 A FAIXA ROLA ATÉ A ABA ATIVA (medido em 390 px, 24/09/2026) ─────────
 * A `TabsList` tem `overflow-x-auto` e, em 390 px, `scrollWidth = 622` contra
 * `clientWidth = 366`. Ela nasce com `scrollLeft = 0` — e a aba ativa NEM
 * SEMPRE é a primeira: cliente em fase `contratado` abre em "Fechamento da
 * Holding" (`abaPadraoPorFase`), e `?aba=croqui` / `?aba=fechamento` também
 * chegam de fora. Nesses casos o trigger ativo começava depois dos 366 px e a
 * pessoa via "Dados básicos | Reunião preliminar | Cro…" **sem nenhuma
 * etiqueta marcada**: a régua laranja existia, fora do campo de visão.
 *
 * `rolarAbaAtivaParaDentro` (puro, em `ficha-abas-estado.ts`) calcula o
 * `scrollLeft` mínimo e o efeito o aplica na montagem e a cada troca.
 *
 * 🔴 **Por que NÃO `scrollIntoView`**: ele age sobre TODOS os ancestrais
 * roláveis. Mesmo com `block: "nearest"` (que não mexe no eixo vertical de
 * elemento já visível), o `inline: "nearest"` sobe até o
 * `documentElement` — e numa página com rolagem horizontal residual ele a
 * moveria. Escrever `scrollLeft` do container toca UM elemento, por
 * construção, e é a razão de o teste medir `scrollY` e `scrollWidth` da
 * página junto.
 *
 * 🔴 **Sem `behavior: "smooth"`**: a rolagem da montagem não é resposta a um
 * gesto — animá-la é movimento não solicitado (WCAG 2.3.3), exatamente o que
 * `prefers-reduced-motion` pede para não existir. Atribuição direta de
 * `scrollLeft` é instantânea e honra a preferência sem precisar consultá-la.
 *
 * ⚠️ `useEffect`, não `useLayoutEffect`: nada aqui é medido para pintar o
 * React — o efeito escreve no DOM e pronto. `useLayoutEffect` só trocaria um
 * frame de rolagem por bloqueio síncrono da pintura, e ainda avisaria no SSR.
 */

import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ABAS_FICHA,
  ROTULO_DA_ABA,
  rolarAbaAtivaParaDentro,
  type AbaFicha,
} from "@/components/clientes/ficha-abas-estado";

export function FichaAbas({
  aba,
  onAba,
  contadores,
  abasAlteradas,
  dados,
  preliminar,
  croqui,
  fechamento,
}: {
  /** A folha aberta. Resolvida pelo `ClienteFicha` (URL + fase). */
  aba: AbaFicha;
  /** Trocar de folha. O `ClienteFicha` grava o endereço. */
  onAba: (aba: AbaFicha) => void;
  /** O texto do badge de cada aba. `""` = sem badge (só "Dados básicos"). */
  contadores: Record<AbaFicha, string>;
  /** Abas com alteração não salva — ganham a marca ao lado do rótulo. */
  abasAlteradas: readonly AbaFicha[];
  dados: React.ReactNode;
  preliminar: React.ReactNode;
  croqui: React.ReactNode;
  fechamento: React.ReactNode;
}) {
  const conteudo: Record<AbaFicha, React.ReactNode> = {
    dados,
    preliminar,
    croqui,
    fechamento,
  };

  /** A faixa que rola (`overflow-x-auto`). */
  const faixaRef = useRef<HTMLDivElement | null>(null);
  /** Um nó por aba — o efeito só precisa do da aba ATIVA. */
  const triggersRef = useRef(new Map<AbaFicha, HTMLElement>());

  useEffect(() => {
    const faixa = faixaRef.current;
    const alvo = triggersRef.current.get(aba);
    if (!faixa || !alvo) return;

    // `offsetLeft` é relativo ao pai posicionado. A `TabsList` não tem
    // `position` declarada, então o `offsetParent` do trigger pode ser um
    // ancestral acima dela — por isso a conta sai de `getBoundingClientRect`,
    // que é absoluta em viewport nos DOIS elementos, e a diferença entre eles
    // é a posição do alvo dentro da faixa JÁ rolada.
    const faixaBox = faixa.getBoundingClientRect();
    const alvoBox = alvo.getBoundingClientRect();
    const inicio = alvoBox.left - faixaBox.left + faixa.scrollLeft;
    const fim = inicio + alvoBox.width;

    const destino = rolarAbaAtivaParaDentro({
      inicio,
      fim,
      scrollLeft: faixa.scrollLeft,
      clientWidth: faixa.clientWidth,
      scrollWidth: faixa.scrollWidth,
    });

    // `null` = já está inteiro dentro. Escrever `scrollLeft` igual ao atual
    // seria inofensivo, mas a guarda deixa o "não mexer" explícito.
    if (destino !== null) faixa.scrollLeft = destino;
  }, [aba]);

  return (
    <Tabs
      value={aba}
      onValueChange={(v) => {
        const valor = String(v);
        if ((ABAS_FICHA as readonly string[]).includes(valor)) {
          onAba(valor as AbaFicha);
        }
      }}
      /* 🔴 `min-w-0` NÃO é enfeite — é a correção de 145 px de rolagem
         HORIZONTAL na página inteira, medida em Chromium a 390 px.
         A `TabsList` já tem `max-w-full` + `overflow-x-auto`, mas `max-w-full`
         é relativo ao PAI: este `Tabs` é filho de um `grid`, cuja `min-width`
         padrão é `auto` (= o tamanho do conteúdo). Os quatro rótulos com badge
         somam 535 px, o `Tabs` cresceu para 535, e `max-w-full` da lista virou
         "535 px" — ela nunca rolava, quem rolava era o `<body>`.
         Medido: `documentElement.scrollWidth` 578 → 390 em 390 px de viewport,
         nas quatro abas. Em 1366 não havia sintoma (cabia), e é por isso que
         só a medição no tamanho alvo pega isto. */
      className="min-w-0 gap-0"
    >
      {/* 🔴 `justify-start`, pela MESMA razão medida em `abas-painel.tsx`: a
          `TabsList` nasce `justify-center` e, quando as quatro abas não cabem
          (390 px — e aqui cada rótulo ainda carrega um badge), o conteúdo
          centralizado transborda para os DOIS lados; a primeira folha ficaria
          cortada e INALCANÇÁVEL, porque `scrollLeft` já está em 0. Alinhada à
          esquerda, o excesso sai só pela direita e a faixa rola até ele.

          `items-end`: os rótulos com badge são mais altos que os sem, e sem
          isto as réguas de 2 px ficariam em alturas diferentes — o aparador
          da pasta tem de assentar numa linha só.

          🔴 `w-full!` derruba o `w-fit` da base, e a razão foi MEDIDA em
          Chromium: com `w-fit`, a faixa dimensiona pelo CONTEÚDO e o
          `max-w-full` da base resolve contra o `Tabs` já encolhido pelo
          `min-w-0`. Em **1366** a lista ficava com `clientWidth = 448` num
          espaço de 896 — ela rolava com folga de sobra, nascia com
          `scrollLeft = 86` e a **primeira aba aparecia cortada** ("…cos" no
          lugar de "Dados básicos"), exatamente o defeito que `abas-painel.tsx`
          documenta. Com `w-full`, a faixa ocupa a largura disponível e só rola
          quando de fato não cabe (390 px). Medido depois: `scrollLeft = 0` e
          primeira aba inteira nas 4 abas, nos 2 tamanhos. */}
      <TabsList
        ref={faixaRef}
        variant="line"
        className="w-full! items-end justify-start"
      >
        {ABAS_FICHA.map((id) => {
          const contador = contadores[id];
          const alterada = abasAlteradas.includes(id);
          return (
            <TabsTrigger
              key={id}
              value={id}
              ref={(n) => {
                if (n) triggersRef.current.set(id, n);
                else triggersRef.current.delete(id);
              }}
              className="h-auto! flex-col items-start gap-0.5 py-1.5"
            >
              <span className="flex items-center gap-1.5">
                {ROTULO_DA_ABA[id]}
                {/* 🔴 A MARCA DE ALTERAÇÃO — ponto **e** texto para leitor de
                    tela. Um ponto laranja sozinho é cor como único portador de
                    significado (WCAG 1.4.1); o `sr-only` diz o que ele é, e a
                    barra de salvar nomeia a folha em voz alta. */}
                {alterada ? (
                  <>
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full bg-accent-foreground"
                    />
                    <span className="sr-only">(alterações não salvas)</span>
                  </>
                ) : null}
              </span>
              {/* O contador. `Badge variant="neutral"` (cinza com ícone de
                  cadeado desligado): o que informa é o TEXTO. */}
              {contador ? (
                <Badge
                  variant="neutral"
                  icone={false}
                  className={cn(
                    "h-auto rounded-sm border-0 bg-transparent px-0 py-0",
                    "corpo-sm text-[0.6875rem] leading-tight font-normal text-muted-foreground",
                  )}
                >
                  {contador}
                </Badge>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {ABAS_FICHA.map((id) => (
        <TabsContent
          key={id}
          value={id}
          /* Ver o cabeçalho: o estado próprio de `MinutasAnexo`/`ContratoAnexo`
             morreria a cada troca de folha sem isto. */
          keepMounted
          className="border-x border-b border-borda-fina bg-card p-4 sm:p-6"
        >
          {conteudo[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
