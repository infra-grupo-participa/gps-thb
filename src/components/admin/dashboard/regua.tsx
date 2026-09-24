"use client";

/**
 * **Zona 1 do redesenho da sub-aba "O programa" — a régua da jornada.**
 *
 * Os seis estágios do parceiro como números grandes em linha, e abaixo deles
 * só a variante (gráfico + tabela) do estágio marcado. Substitui os 20 cards
 * que empilhavam o mesmo assunto em vinte molduras.
 *
 * 🔑 **Por que `"use client"` num dashboard que é Server Component inteiro.**
 * O clique da régua não pode ir ao servidor: as variantes já vêm
 * pré-renderizadas na página (uma RPC, ~60 ms) e re-executá-las a cada clique
 * de exploração transformaria 1 chamada em 6.
 *
 * 🔴 **`window.history.replaceState`, e NÃO `router.replace` — a diferença é
 * o motivo desta zona existir.** `abas-painel.tsx` escreve `?vis=` com
 * `router.replace(url, { scroll: false })`, e em App Router isso **re-executa
 * o Server Component** quando a página lê `searchParams` (e `page.tsx` lê):
 * a RPC roda de novo a cada troca de sub-aba. Aqui, com seis estágios feitos
 * para serem varridos em sequência, esse desenho transformaria uma exploração
 * de 6 cliques em 6 RPCs.
 *
 * Desde o Next 14.1 o `useSearchParams()` **sincroniza com `pushState`/
 * `replaceState` nativos** sem ir ao servidor (docs: "Using the native History
 * API"). O `replaceState` troca o endereço, o `useSearchParams()` reavalia no
 * mesmo tick, este componente re-renderiza e a variante certa aparece — zero
 * fetch, e sem `scroll: false` porque não há navegação para mover a rolagem.
 *
 * ⚠️ **Não "uniformize" isto com `abas-painel.tsx`.** A diferença é
 * deliberada e tem direção: quem está certo é este arquivo. O `?vis=` de lá
 * merece a MESMA troca, em outra fatia — o comentário do `page.tsx` que diz
 * "trocar de sub-aba não busca nada" está errado sobre o próprio `?vis=`.
 *
 * 🔴 **Um escritor só: este arquivo é o dono de `?foco=`.** Mesma regra que
 * `abas-painel.tsx` cumpre para `aba`/`vis` e `useEstadoDoPainel` para
 * `q`/`ordem`/`f`. Dois componentes com estado local disputando a mesma chave
 * se sobrescrevem: o último `router.replace` a rodar devolve o valor velho que
 * leu na montagem. Ninguém mais grava `foco`.
 *
 * 🔑 **Nenhum estado local, nem `useState`.** O foco é derivado da URL a cada
 * render (`lerFoco(searchParams.get("foco"))`). `useEstadoDoPainel` guarda
 * estado local porque a busca é digitada letra a letra e precisa responder
 * antes do `replace` de 300 ms chegar; um clique não tem esse problema. Sem
 * estado espelhado não existe o caso de a URL e a marcação divergirem —
 * inclusive no "voltar" do navegador, que aqui repinta sozinho.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

import { cn } from "@/lib/utils";
import { lerFoco, type Foco } from "../alunos-ativos-lista/estado-na-url";

/** Um estágio da régua: a chave da URL, o que se lê e quantos são. */
export interface EstagioRegua {
  foco: Foco;
  /**
   * 🔴 Até 3 palavras. A régua tem ~192 px por item em 1152 px; rótulo mais
   * longo quebra em duas linhas e a fita deixa de ser fita. Os seis de hoje
   * são de uma palavra só.
   */
  rotulo: string;
  valor: number;
}

export interface ReguaProps {
  /** `jornada.ambientes` — o "de 148", escrito UMA vez no fim da fita. */
  denominador: number;
  /** Os seis estágios, na ordem de `FOCOS`. */
  estagios: EstagioRegua[];
  /**
   * O gráfico + a tabela já renderizados no servidor para cada recorte. A
   * régua não busca nada: ela só escolhe qual dos sete nós já montados
   * aparece. É o mesmo desenho de `abas-painel.tsx` com
   * `visaoPrograma`/`visaoAtencao`/`visaoParceiros`.
   */
  variantes: Record<"todos" | Foco, React.ReactNode>;
}

export function Regua({ denominador, estagios, variantes }: ReguaProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Allowlist fechada, no arquivo do contrato: `?foco=` desconhecido vira
  // `null` — régua sem marcação e variante "todos". Nunca deixa a zona vazia.
  const focoAtivo = lerFoco(searchParams.get("foco"));

  /**
   * Os botões, para mover o foco de teclado com as setas (roving tabindex).
   * Só referência de DOM — nada é medido aqui.
   */
  const itens = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * Escreve `?foco=` **pela History API nativa** (ver o cabeçalho do arquivo:
   * `router.replace` iria ao servidor e rodaria a RPC de novo).
   *
   * Do `trocarVis` de `abas-painel.tsx` fica o que é bom: partir da consulta
   * ATUAL, para preservar o que não é nosso (`aba`, `vis`, `mais`, `q`…), e a
   * allowlist fechada. O que muda é só quem escreve o endereço.
   *
   * 🔑 `replaceState` e não `pushState`: os seis estágios são um recorte da
   * MESMA tela, não seis páginas. Com `pushState`, varrer os seis e sair
   * exigiria seis "voltar" para deixar o dashboard.
   *
   * 🔴 `null` REMOVE a chave do endereço, não escreve `foco=todos`: `/admin`
   * limpo tem de continuar `/admin`, e `"todos"` não é valor de `FOCOS` — se
   * fosse escrito, `lerFoco` o descartaria no próximo carregamento e a URL
   * estaria afirmando um estado que a tela não reconhece.
   */
  const trocarFoco = useCallback(
    (valor: Foco | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (valor === null) sp.delete("foco");
      else sp.set("foco", valor);
      const q = sp.toString().replace(/%2C/g, ",");
      window.history.replaceState(null, "", `${pathname}${q ? `?${q}` : ""}`);
    },
    [pathname, searchParams],
  );

  /**
   * Clicar no item JÁ ativo limpa o foco.
   *
   * 🔑 Sem isto o admin fica preso no recorte: marcou "contrato" e não há
   * gesto para voltar ao conjunto inteiro a não ser editar a URL. É também a
   * razão de a régua não usar a `Tabs` da casa — aba selecionada não
   * desmarca, por contrato do componente.
   */
  const aoClicar = useCallback(
    (foco: Foco) => trocarFoco(foco === focoAtivo ? null : foco),
    [focoAtivo, trocarFoco],
  );

  /**
   * Setas navegam entre os itens sem selecionar (`Home`/`End` vão às pontas),
   * `Enter`/`Espaço` selecionam — o `<button>` já faz isso sozinho.
   *
   * 🔑 Move o FOCO, não a seleção: com seleção automática, atravessar a régua
   * com o teclado trocaria a variante seis vezes e faria o leitor de tela
   * anunciar seis conteúdos que ninguém pediu.
   */
  const aoTeclar = useCallback((e: React.KeyboardEvent, indice: number) => {
    // 🔴 O fim da régua é o último item RENDERIZADO, não `FOCOS.length - 1`:
    // se um dia a página passar cinco estágios, a seta pararia num índice
    // vazio e o foco sumiria da tela sem nada acontecer.
    const ultimo = itens.current.length - 1;
    if (ultimo < 0) return;
    let destino: number;
    switch (e.key) {
      case "ArrowRight":
        destino = indice === ultimo ? 0 : indice + 1;
        break;
      case "ArrowLeft":
        destino = indice === 0 ? ultimo : indice - 1;
        break;
      case "Home":
        destino = 0;
        break;
      case "End":
        destino = ultimo;
        break;
      default:
        return;
    }
    e.preventDefault();
    itens.current[destino]?.focus();
  }, []);

  return (
    <div className="ritmo-secao">
      {/* 🔑 `grid` de 6 colunas em `lg` (1024) e 3×2 no celular — a mesma
          escada de `faixa-kpis.tsx`. Grade, não `flex` com rolagem: em 390 px
          uma fita de seis números rolaria lateralmente e os três últimos
          estágios ficariam invisíveis para quem não descobrisse o arrasto.
          `grid-cols-3` já no menor tamanho porque os rótulos são de uma
          palavra e o número é o que carrega a leitura. */}
      <div
        role="tablist"
        aria-label="Estágio da jornada do parceiro"
        aria-orientation="horizontal"
        className="grid grid-cols-3 gap-x-2 gap-y-1 lg:grid-cols-6"
      >
        {estagios.map((estagio, i) => {
          const ativo = estagio.foco === focoAtivo;
          return (
            <button
              key={estagio.foco}
              ref={(el) => {
                itens.current[i] = el;
              }}
              type="button"
              role="tab"
              // 🔴 `aria-current` além de `aria-selected`: o pedido da casa é
              // que o ativo NUNCA seja só cor (padrão de
              // `clientes-programa/index.tsx`). Quem lê a tela recebe o estado
              // pelo ARIA; quem enxerga recebe pela régua de 2 px abaixo.
              aria-selected={ativo}
              aria-current={ativo ? "true" : undefined}
              // Roving tabindex: um único parada de Tab na régua inteira, e as
              // setas andam por dentro. Sem foco marcado, o primeiro item é a
              // porta de entrada.
              tabIndex={ativo || (!focoAtivo && i === 0) ? 0 : -1}
              onClick={() => aoClicar(estagio.foco)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={cn(
                // 🔴 Alvo de clique: `py-2` + a altura do número (30 px) passa
                // de 24 px com folga, e `text-left` mantém a leitura alinhada
                // à coluna — hierarquia por POSIÇÃO, não por moldura.
                "foco-visivel min-h-11 border-b-2 px-1 py-2 text-left",
                // 🔑 Todos os seis clicam, então todos os seis têm de PARECER
                // alvo: `cursor-pointer` e realce no hover nos seis, não só no
                // ativo. Número solto que reage ao mouse é o que diferencia
                // "isto é botão" de "isto é resultado".
                "cursor-pointer transition-colors hover:bg-superficie-afundada",
                // A marcação do ativo é a RÉGUA (2 px), não o fundo nem a cor
                // do texto. Sem card, sem borda em volta, sem sombra.
                ativo ? "border-primary" : "border-transparent",
              )}
            >
              <span
                className={cn(
                  "block numero-lg",
                  ativo ? "text-foreground" : "text-foreground/90",
                )}
              >
                {estagio.valor}
              </span>
              <span
                className={cn(
                  "block rotulo",
                  ativo ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {estagio.rotulo}
              </span>
            </button>
          );
        })}
      </div>

      {/* 🔑 O denominador UMA vez, no fim da fita — não `de 148` colado em
          cada um dos seis. Os seis números dividem o mesmo universo
          (`jornada.ambientes`), e repetir o divisor seis vezes é o enfeite que
          faz a régua parecer seis cards. Alinhado à direita: é rodapé da fita,
          não item dela. */}
      <p className="rotulo text-right font-normal text-muted-foreground">
        de {denominador} parceiros
      </p>

      {/* 🔴 Só a variante ativa entra no DOM — igual a `abas-painel.tsx`. As
          outras seis não ficam escondidas com `hidden`: elemento invisível
          continua contando na área rolável do ancestral, e sete tabelas
          empilhadas dariam rolagem sobre o vazio. */}
      <div
        role="tabpanel"
        aria-label={
          focoAtivo
            ? (estagios.find((e) => e.foco === focoAtivo)?.rotulo ?? "Todos")
            : "Todos os parceiros"
        }
      >
        {variantes[focoAtivo ?? "todos"]}
      </div>
    </div>
  );
}
