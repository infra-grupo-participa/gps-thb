"use client";

/**
 * A PASTA COM FOLHAS — as cinco abas da ficha do cliente.
 *
 * Pedido do Marcio (24/09/2026): *"dando literalmente a ideia de uma
 * ficha/pasta com folhas — cada folha é uma aba"*. A ficha era um formulário
 * de ~1.000 px de rolagem com cinco seções empilhadas; agora são folhas (cinco desde 05/10/2026)
 * folhas, na ordem do funil, e a pasta abre na folha onde o caso está.
 *
 * Este arquivo é só a CASCA: a régua das abas, o contador de cada rótulo, a
 * marca de alteração e o estado na URL. O conteúdo chega por prop
 * (`ReactNode`), montado pelo `ClienteFicha` — que continua dono de todos os
 * `useState` do formulário.
 *
 * ── DENSO E CHAPADO ────────────────────────────────────────────────────────
 * Abas como botões de uma grade: borda de 2 px + `bg-card` na folha ativa
 * (o `TabsList variant="line"` do header, com a forma sobrescrita só aqui),
 * corpo em `bg-card`. Sem sombra, sem gradiente. Rótulo em `text-base`
 * (16 px, escala padrão do Tailwind — o `tailwind-merge` a reconhece como
 * tamanho). **Nunca** `text-*` custom, que ele trata como COR e descarta.
 *
 * ── 🔴 ÍCONES: IDENTIDADE E ESTADO, NUNCA ENFEITE (Marcio, 29/09/2026) ─────
 * A ficha é usada por pessoas de mais idade, e o pedido foi literal:
 * *"gatilhos visuais, orientações visuais, ícones que indicam as coisas
 * exatamente"*. Até 28/09 este cabeçalho dizia "sem ícone decorativo" — e
 * continua valendo: nenhum ícone aqui é decoração. São dois tipos, fixos:
 *   · **identidade da folha** — `Route` Trajetória (05/10/2026) · `User`
 *     Dados · `CalendarClock` Preliminar ·
 *     `PenTool` Croqui · `FilePenLine` Fechamento (o `FileSignature` do
 *     pedido virou `FilePenLine` no lucide 1.x). Sempre o mesmo por folha,
 *     para o olho achar a folha sem ler;
 *   · **estado** — só `CircleAlert` "N para corrigir", o único que barra o
 *     salvar. Sugestão e "Completa" saíram da aba (João, 06/10/2026: "ninguém
 *     vai ler esses textos"); continuam no nome acessível.
 * Todo ícone é `aria-hidden` e vem SEMPRE com texto ao lado (WCAG 1.4.1:
 * nunca só cor, nunca só forma). Cor de texto só pelos pares semânticos do
 * `globals.css` (`risco`/`atencao`/`sucesso`-foreground, ≥5,8:1) e
 * `accent-foreground` — nunca `text-primary` em texto.
 *
 * 🔴 **O texto do estado vem DEPOIS do rótulo**: o nome acessível da aba tem
 * de continuar começando pelo rótulo — `e2e/ficha-abas.spec.ts` casa
 * `^dados b(á|a)sicos`. Ícone antes do rótulo não atrapalha: `aria-hidden`
 * não entra no nome.
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
 * ── 🔴 ABA = ÍCONE + RÓTULO, 16 px (João, 06/10/2026) ─────────────────────
 * Público mais velho, "tem que ser simples, ninguém vai ler esses textos". O
 * contador (`contadorDaAba`), o estado não bloqueante e o "não salvo" saíram
 * da VISTA; ficam em `sr-only` DENTRO do botão, depois do rótulo: o leitor de
 * tela ouve "Dados básicos, 1 para corrigir, PJ" e `e2e/ficha-abas.spec.ts`
 * (teste 2, `innerText`) continua achando o contador. À vista, só o selo
 * "N para corrigir" — o que impede salvar. O "não salvo" de cada folha já é
 * nomeado pela barra de salvar (`fraseDaBarra`).
 *
 * ── 🔴 `keepMounted`: POR QUE O CONTEÚDO NÃO DESMONTA ───────────────────────
 * `TabsPanel` do Base UI é `keepMounted = false` por padrão — o conteúdo
 * inativo SAI do DOM. Para os campos do formulário isso seria inofensivo (os
 * `useState` vivem no `ClienteFicha`, acima das abas, e sobrevivem à troca),
 * mas **`MinutasAnexo` e `ContratoAnexo` têm estado PRÓPRIO** (o texto de
 * contexto da minuta, o arquivo escolhido, a mensagem de erro do upload) —
 * e esse estado morre ao desmontar. Alguém escrevendo "o que mudou" numa
 * minuta, indo conferir um problema na aba 2 e voltando, perderia o texto
 * sem nenhum aviso. Com `keepMounted`, as cinco folhas ficam no DOM e o
 * painel inativo leva `hidden`.
 *
 * ⚠️ Consequência aceita e medida: o markup das cinco folhas existe desde a
 * primeira pintura. É o mesmo DOM que a ficha tinha ANTES das abas (as cinco
 * seções empilhadas) — não há custo novo de rede nem de consulta, só de nós.
 *
 * ⚠️ `hidden` não é prova de invisibilidade para teste: filho "visível"
 * dentro de pai oculto dá verde falso. Quem prova é `offsetParent`, em
 * navegador que pinta.
 *
 * ── 🔴 GRADE, NÃO FAIXA QUE ROLA (João, 06/10/2026) ───────────────────────
 * Em 390 px a faixa tinha `scrollWidth 622` contra `clientWidth 366` e
 * obrigava a arrastar para o lado. Agora é grade: 2 colunas no celular (a
 * Trajetória ocupa a linha inteira), 5 a partir de `md` (768). Em `sm`
 * (640) as 5 colunas davam 111 px e "Fechamento" com ícone pede 124:
 * `scrollWidth 630` × `clientWidth 608`, medido. Nada rola, então
 * a aba ativa está sempre à vista — a rolagem até a aba ativa saiu.
 */

import {
  CalendarClock,
  CircleAlert,
  FilePenLine,
  PenTool,
  Route,
  User,
  type LucideIcon,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ABAS_FICHA,
  ROTULO_DA_ABA,
  type AbaFicha,
  type EstadoDaAba,
} from "@/components/clientes/ficha-abas-estado";

/** O ícone de IDENTIDADE de cada folha — fixo. Ver o cabeçalho. */
const ICONE_DA_ABA: Record<AbaFicha, LucideIcon> = {
  trajetoria: Route,
  dados: User,
  preliminar: CalendarClock,
  croqui: PenTool,
  fechamento: FilePenLine,
};

export function FichaAbas({
  aba,
  onAba,
  contadores,
  abasAlteradas,
  estados,
  trajetoria,
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
  /** Abas com alteração não salva — ganham "não salvo" ao lado do rótulo. */
  abasAlteradas: readonly AbaFicha[];
  /**
   * O estado de cada aba (`estadoDaAba`): "N para corrigir", sugestão ou
   * "Completa". `null` = nada a dizer.
   */
  estados: Record<AbaFicha, EstadoDaAba>;
  /** A folha "Trajetória" — grava na hora; nada dela passa pelo salvar. */
  trajetoria: React.ReactNode;
  dados: React.ReactNode;
  preliminar: React.ReactNode;
  croqui: React.ReactNode;
  fechamento: React.ReactNode;
}) {
  const conteudo: Record<AbaFicha, React.ReactNode> = {
    trajetoria,
    dados,
    preliminar,
    croqui,
    fechamento,
  };

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
         padrão é `auto` (= o tamanho do conteúdo). Os rótulos com badge
         somam 535 px, o `Tabs` cresceu para 535, e `max-w-full` da lista virou
         "535 px" — ela nunca rolava, quem rolava era o `<body>`.
         Medido: `documentElement.scrollWidth` 578 → 390 em 390 px de viewport,
         nas cinco abas. Em 1366 não havia sintoma (cabia), e é por isso que
         só a medição no tamanho alvo pega isto. */
      className="min-w-0 gap-0"
    >
      {/* 🔴 GRADE (ver o cabeçalho). `grid` e `overflow-visible` vencem o
          `inline-flex`/`overflow-x-auto` do variant `line` pelo
          `tailwind-merge` (último da mesma família vence) — conferido no
          HTML. `items-stretch`: botões da mesma linha com a mesma altura.
          `ui/tabs.tsx` fica intacto: header e painéis usam o mesmo variant. */}
      <TabsList
        variant="line"
        className="grid w-full! grid-cols-2 items-stretch gap-2 overflow-visible pb-2 md:grid-cols-5"
      >
        {ABAS_FICHA.map((id) => {
          const contador = contadores[id];
          const alterada = abasAlteradas.includes(id);
          const estado = estados[id];
          const IconeAba = ICONE_DA_ABA[id];
          const bloqueia = estado?.tipo === "corrigir";
          return (
            <TabsTrigger
              key={id}
              value={id}
              className={cn(
                // Alvo ≥ 44 px, texto quebra em vez de cortar.
                "h-auto! min-h-11 flex-col items-start justify-center gap-1 whitespace-normal px-3 py-2 text-left text-base",
                // Ativa: borda de 2 px + fundo de card + peso (Base UI põe
                // `aria-selected`). Inativa tem a mesma borda em cinza, para
                // não pular 1 px na troca. A régua `after:` do variant sai —
                // somaria 4 px embaixo. `marca-solida` (#B04300) e não
                // `primary`: dá 3:1 contra o card (WCAG 1.4.11).
                "rounded-md border-2 border-borda-fina after:hidden",
                "data-active:border-marca-solida data-active:bg-card!",
                id === "trajetoria" && "col-span-2 md:col-span-1",
              )}
            >
              <span className="flex items-center gap-2">
                <IconeAba aria-hidden className="size-5 shrink-0" />
                {ROTULO_DA_ABA[id]}
              </span>
              {/* O SELO — só quando algo barra o salvar. Texto + ícone, nunca
                  só cor. Vem DEPOIS do rótulo: o nome acessível começa pelo
                  rótulo (`^dados b(á|a)sicos` no spec). */}
              {bloqueia ? (
                <span className="flex items-center gap-1 rounded-sm bg-risco px-1.5 font-semibold text-risco-foreground">
                  <CircleAlert aria-hidden className="size-4 shrink-0" />
                  <span className="sr-only">, </span>
                  {estado.texto}
                </span>
              ) : null}
              {/* Só para leitor de tela (e para o teste 2, que lê
                  `innerText`). A vírgula vira pausa na leitura. */}
              <span className="sr-only">
                {estado && !bloqueia ? `, ${estado.texto}` : null}
                {alterada ? ", alterações não salvas" : null}
                {contador ? `, ${contador}` : null}
              </span>
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
