"use client";

/**
 * O estado do painel mora na **URL** — e a URL é lida com allowlist fechada.
 *
 * 🔑 Por que URL e não `useState` (nem `localStorage`):
 * o tamanho do lote (`?mais=`) já mora ali porque quem consulta o banco é o
 * Server Component. Colocar busca, ordem, filtros e aba no mesmo lugar faz
 * três coisas de graça: **recarregar** devolve a mesma tela, **voltar pelo
 * histórico** devolve a mesma tela, e **mandar o link a um colega** mostra a
 * ele a mesma tela. Nada disso um estado de cliente dá.
 *
 * 🔴 Toda leitura passa por allowlist. `ordem` fora de `ORDENS` vira o padrão;
 * `f` com nome desconhecido é DESCARTADO, nunca vira filtro. Sem isso, um
 * parâmetro qualquer na URL viraria um estado que a tela não sabe explicar —
 * e um filtro que ninguém consegue desmarcar.
 *
 * 🔴 Nada de PII aqui: `q` é o que o admin digitou (pode ser um nome), e é por
 * isso que a URL é a ÚNICA persistência de busca — nada vai para `localStorage`,
 * que sobrevive à sessão.
 *
 * 🔴 **Quem GRAVA o endereço usa `window.history.replaceState`, nunca
 * `router.replace`.** Vale para os três escritores de URL do painel —
 * `useEstadoDoPainel` (aqui, `q`/`ordem`/`f`/`classe`), `abas-painel.tsx`
 * (`aba`/`vis`) e `dashboard/regua.tsx` (`foco`). O porquê medido está no
 * comentário de `useEstadoDoPainel`, no fim deste arquivo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { ORDENS, type OrdemAlunos } from "./tipos";

/**
 * Os filtros que a barra pode ter. **Allowlist fechada**: o parse só aceita
 * um destes, e o link de um card do dashboard só pode apontar para um destes.
 *
 * O chip de cada filtro só APARECE quando ele separa alguém neste lote
 * (`disponivel`, em `filtros.ts`) — mas o parse aceita todos desde já, para o
 * link do dashboard funcionar no dia em que o primeiro aluno responder. Um
 * interruptor que não move nada é pior do que interruptor nenhum.
 */
export const FILTROS = [
  "pendencia",
  "listou30",
  "inativos",
  "nota_recente",
  "sem_nota",
  "chamado",
  "sem_login",
  "nunca_entrou",
  // 🔴 Os complementos (14/09/2026). Sem eles, o KPI "Já entraram 139" só
  // tinha para onde apontar o conjunto OPOSTO (`sem_login`, 1 pessoa) — e o
  // card virou alvo de clique hoje, então o erro passou a ser um clique, não
  // uma leitura de rodapé.
  "ja_entrou",
  "ativos30",
  "tem_fechamento",
  "onb_nao",
  "onb_andamento",
  "onb_ok",
  "contrato_enviado",
  // 🔴 `etapa1_ok` é `a.pct === 100` — o MESMO `pct` que `faixasDeTrilha` lê
  // (`src/lib/data/dashboard.ts`), então o card "Progresso na Etapa 01
  // (declarado)" e o chip da lista nunca podem divergir na definição de
  // "concluiu a Etapa 01". É DECLARADO (depende de marcar as 7 tarefas
  // manuais) — o card "Fecharam os 30 clientes" é o mesmo assunto em FATO,
  // e usa `listou30`/`clientes_incompleto`/`sem_cliente`, não este grupo.
  "etapa1_ok",
  "etapa1_zero",
  "etapa1_andamento",
  "sem_cliente",
  "clientes_incompleto",
] as const;

export type FiltroId = (typeof FILTROS)[number];

const FILTROS_SET = new Set<string>(FILTROS);
const ORDENS_SET = new Set<string>(ORDENS);

/**
 * As abas do painel. Mesma allowlist, mesmo motivo.
 *
 * 🔑 `visao` (a "Visão geral", onde vive o dashboard) é a PRIMEIRA e é o
 * PADRÃO: `/admin` sem `?aba=` abre o resumo do programa. O dashboard deixou
 * de ficar empilhado em cima da lista — eram duas telas na mesma rolagem, e
 * quem entrava para procurar um aluno tinha de passar por nove cards.
 *
 * 🔴 Consequência para quem monta link: `/admin?f=sem_login` agora cai na
 * Visão geral. Todo link que quer a LISTA precisa dizer `?aba=ativos&f=…` —
 * é por isso que os cards do dashboard escrevem a aba no `href`.
 */
export const ABAS = ["visao", "ativos", "solicitacoes", "etapas"] as const;
export type AbaPainel = (typeof ABAS)[number];

/**
 * As SUB-abas de dentro da "Visão geral" (`?vis=`) — 23/09/2026.
 *
 * 🔑 **Por que um segundo parâmetro, e não 6 abas irmãs.** Uma barra de abas
 * responde a UMA pergunta. `ABAS` responde "que parte do painel eu opero"
 * (resumo · gente · pedidos · etapas); estas respondem "o que está acontecendo
 * no programa" (o programa · quem precisa de atenção · o ranking). Misturar as
 * duas perguntas numa régua só é o que faz barra de aba virar menu.
 *
 * 🔴 E há geometria medida no caminho: com QUATRO abas o conteúdo já
 * transbordava em 390 px e a primeira ficava inalcançável (`abas-painel.tsx`,
 * o comentário do `justify-start`). Seis irmãs seria reabrir esse defeito de
 * propósito.
 *
 * 🔴 `programa` é o PADRÃO e sai da URL quando escolhido: `/admin` sem
 * parâmetro nenhum tem de abrir exatamente onde abre hoje — `LINK_LISTA` e os
 * ~15 hrefs do dashboard dependem de `aba` continuar sozinha no endereço.
 *
 * Mesma allowlist fechada do resto do arquivo: `?vis=` desconhecido cai no
 * padrão, nunca deixa a Visão geral sem conteúdo.
 */
export const SUBABAS_VISAO = ["programa", "atencao", "parceiros"] as const;
export type SubAbaVisao = (typeof SUBABAS_VISAO)[number];

/** A sub-aba da Visão geral sem `?vis=`. */
export const SUBABA_VISAO_PADRAO: SubAbaVisao = "programa";

/**
 * `?foco=` — o estágio da jornada do parceiro que a régua da sub-aba
 * "O programa" marca, e que recorta o gráfico e a tabela abaixo dela
 * (23/09/2026, redesenho master-detail).
 *
 * 🔑 **Seis estágios, não nove.** A régua tem 1152 px de largura útil
 * (`max-w-6xl` do `/admin`): nove números dariam ~128 px cada, e um rótulo
 * de três palavras não cabe — a régua quebraria em duas linhas e deixaria de
 * ser régua. Os três estágios que ficaram de fora (`no programa`, `fechou os
 * 30`, `reuniao`) continuam na RPC; `no programa` é o denominador (148) e
 * aparece uma vez, escrito, não como item.
 *
 * 🔑 **Um escritor só: `dashboard/regua.tsx`.** Mesma regra de `?vis=` (cujo
 * único escritor é `abas-painel.tsx`). Ninguém mais grava `foco` na URL.
 *
 * Lida no NAVEGADOR, não no servidor: as variantes do gráfico e da tabela
 * vêm pré-renderizadas na página e a régua só alterna qual aparece — igual
 * às sub-abas. Clique instantâneo, zero RPC a mais (medido: a RPC custa
 * 60 ms, e re-executá-la a cada clique de exploração transformaria 1 chamada
 * em 6).
 *
 * `?foco=` fora desta lista → `null` → régua sem marcação, gráfico e tabela
 * no recorte "todos". Nunca quebra, nunca deixa a zona vazia.
 */
export const FOCOS = [
  "entrou",
  "onboarding",
  "cadastrou",
  "mensagem",
  "favorito",
  "contrato",
] as const;
export type Foco = (typeof FOCOS)[number];

export function lerFoco(bruto: string | null | undefined): Foco | null {
  return (FOCOS as readonly string[]).includes(bruto ?? "")
    ? (bruto as Foco)
    : null;
}

/**
 * As 5 classes do programa — os cards do desenho do Marcio (10/09/2026).
 *
 * A regra é DERIVADA (`gps.admin_classes_dos_alunos`), não um campo que
 * alguém marca: a mais avançada vence. A ordem aqui é a ordem dos cards na
 * tela, e é a ordem da jornada — não mexer sem mexer no desenho.
 */
export { CLASSES, type ClasseAluno } from "@/lib/types";
import { CLASSES, type ClasseAluno } from "@/lib/types";

const CLASSES_SET = new Set<string>(CLASSES);

/**
 * O sentinela que faz os 15 links do dashboard funcionarem de fato
 * (15/09/2026). **Antes deste sentinela, `LINK_LISTA = "/admin?aba=ativos"`
 * não passava `classe` nenhuma** — a aba Parceiros só monta a lista DEPOIS de
 * uma classe escolhida (`AlunosAtivosLista`, `index.tsx`), então todo link do
 * dashboard caía nos 5 cards de fase, com o filtro (`f=…`) marcado na URL e
 * invisível: o admin clicava em "Ativos 30 dias" e via os 5 cards, sem saber
 * por quê.
 *
 * `"todas"` é aceito por `lerEstado` e significa "mostre a lista, sem cortar
 * por classe" — o filtro (`f=`) faz o recorte de verdade. Não é uma 6ª classe
 * real: não entra em `CLASSES`, não tem card em `CardsDeClasse`.
 */
export const CLASSE_TODAS = "todas" as const;
export type ClasseNaUrl = ClasseAluno | typeof CLASSE_TODAS;

/** O rótulo de cada card. Copy do desenho. */
export const ROTULO_CLASSE: Record<ClasseAluno, string> = {
  inicial: "Inicial",
  captacao: "Captação / Fechamento",
  execucao: "Execução",
  orientacao: "Orientação",
  finalizado: "Finalizados",
};

/** Uma linha explicando o que separa cada classe — a tela não adivinha. */
export const AJUDA_CLASSE: Record<ClasseAluno, string> = {
  // 🔑 OS CARDS SÃO FUNIL DE ATENÇÃO, não cobrança de etapa cumprida
  // (decisão do Marcio, 10/09/2026): *"se ele já tem alguém avançado, faz
  // sentido listar ele mais avançado também, para termos uma atenção maior
  // com ele em específico"*.
  //
  // O aluno aparece no ponto MAIS AVANÇADO que a evidência mostra. Os 30
  // não travam a fase — viram o selo "N/30 fichas" no cartão, para a equipe
  // ver a dívida sem que a pessoa suma da fase em que precisa de atenção.
  inicial: "Ainda montando a lista de clientes",
  captacao: "Reunião marcada ou lista dos 30 pronta, sem contrato fechado",
  execucao: "Cliente contratado com honorários pactuados",
  orientacao: "Holding entregue, em acompanhamento",
  finalizado: "Bateram a meta de R$ 150 mil",
};

/** A aba de `/admin` sem `?aba=`. Escrita uma vez, lida por três arquivos. */
export const ABA_PADRAO: AbaPainel = "visao";

export interface EstadoDoPainel {
  aba: AbaPainel;
  /**
   * O card escolhido. `null` = nenhum, tela mostra os 5 cards.
   * `"todas"` (`CLASSE_TODAS`) = lista SEM corte de classe — é o destino dos
   * links do dashboard, que recortam por `filtros`, não por fase.
   */
  classe: ClasseNaUrl | null;
  termo: string;
  ordem: OrdemAlunos;
  filtros: Set<FiltroId>;
}

/** Teto do termo de busca lido da URL — barra URL gigante colada por engano. */
const MAX_TERMO = 80;

/** Lê o estado da URL. Qualquer coisa fora da allowlist vira o padrão. */
function lerEstado(sp: URLSearchParams): EstadoDoPainel {
  const aba = sp.get("aba");
  const classe = sp.get("classe");
  const ordem = sp.get("ordem");
  const f = (sp.get("f") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x): x is FiltroId => FILTROS_SET.has(x));
  return {
    aba: (ABAS as readonly string[]).includes(aba ?? "")
      ? (aba as AbaPainel)
      : ABA_PADRAO,
    classe:
      classe === CLASSE_TODAS
        ? CLASSE_TODAS
        : CLASSES_SET.has(classe ?? "")
          ? (classe as ClasseAluno)
          : null,
    termo: (sp.get("q") ?? "").slice(0, MAX_TERMO),
    ordem: ORDENS_SET.has(ordem ?? "") ? (ordem as OrdemAlunos) : "recentes",
    filtros: new Set(f),
  };
}

/**
 * Escreve o estado na URL preservando o que não é nosso (`mais=`, e o que vier
 * a existir). Valor no padrão é REMOVIDO do endereço: `/admin` limpo tem de
 * continuar sendo `/admin`, não `/admin?aba=ativos&q=&ordem=recentes&f=`.
 */
function escreverEstado(
  atual: URLSearchParams,
  estado: EstadoDoPainel,
): string {
  const sp = new URLSearchParams(atual.toString());
  const por = (chave: string, valor: string, padrao: string) => {
    if (valor === padrao) sp.delete(chave);
    else sp.set(chave, valor);
  };
  // 🔴 `aba` (e `vis`, e `foco`, e `mais`) NÃO são escritas aqui. Quem manda
  // em `aba`/`vis` é `AbasPainel` (`src/components/admin/abas-painel.tsx`), em
  // `foco` é `dashboard/regua.tsx` e em `mais` é o servidor; este hook só as
  // PRESERVA, porque `sp` já parte da consulta atual. Dois componentes com
  // estado local próprio escrevendo a mesma chave se sobrescrevem: o último a
  // gravar o endereço devolve o valor que ele leu na montagem, e trocar de aba
  // "voltaria" sozinho 300 ms depois de digitar uma letra na busca.
  // Sem classe escolhida a tela mostra os 5 cards — e a URL fica limpa.
  por("classe", estado.classe ?? "", "");
  por("q", estado.termo.trim(), "");
  por("ordem", estado.ordem, "recentes");
  por(
    "f",
    // Ordem estável (a da allowlist): sem isso, marcar A e depois B geraria
    // uma URL diferente de marcar B e depois A para a MESMA tela.
    FILTROS.filter((x) => estado.filtros.has(x)).join(","),
    "",
  );
  // `URLSearchParams` escapa a vírgula como `%2C`. Ela é um separador legal de
  // consulta e este link é feito para ser LIDO e colado num chat da equipe:
  // `?f=chamado,sem_login` se entende, `?f=chamado%2Csem_login` não. O parse
  // aceita os dois (o navegador decodifica antes de `lerEstado` ver).
  const q = sp.toString().replace(/%2C/g, ",");
  return q ? `?${q}` : "";
}

/**
 * O estado do painel, sincronizado com a URL.
 *
 * A tela responde na hora (o estado é local) e a URL é atualizada **com 300 ms
 * de atraso** — sem o debounce, cada tecla digitada reescreveria o endereço.
 *
 * 🔴 **`window.history.replaceState`, e NÃO `router.replace` — este é o
 * TERCEIRO e último escritor de URL do painel a fazer a troca.** Os outros
 * dois são `abas-painel.tsx` (`aba`/`vis`) e `dashboard/regua.tsx` (`foco`);
 * leia o cabeçalho dos dois. Em App Router, um `router.replace` que muda
 * `searchParams` numa página que lê `searchParams` **re-executa o Server
 * Component**: `/admin/page.tsx` lê `?mais=`, então cada tecla na busca
 * refazia `getDashboard()` (a RPC de ~60 ms), `getAlunosGps()` e as outras
 * quatro leituras — para filtrar uma lista que **já está em memória** no
 * cliente.
 *
 * 🔑 **Por que filtrar aqui nunca precisa do servidor.** `page.tsx` tipa
 * `searchParams` como `{ mais?: string }` e lê **só `mais`**; `q`, `ordem`,
 * `f` e `classe` não são lidos por servidor nenhum. Busca, ordem e filtro
 * rodam sobre o array `alunos` que já desceu por prop (`index.tsx` +
 * `ordenacao.ts` + `filtros.ts`) — é a regra escrita no CLAUDE.md: *"busca e
 * filtro do painel são em memória sobre o lote"*. O endereço aqui serve para
 * recarregar, voltar pelo histórico e mandar o link a um colega; nada mais.
 *
 * Desde o Next 14.1 o `useSearchParams()` **sincroniza com `pushState`/
 * `replaceState` nativos** sem ir ao servidor (docs: "Using the native History
 * API") — é o que mantém `RegistrarUrlDoPainel` (`voltar-ao-painel.tsx`), que
 * observa `[pathname, searchParams]`, gravando a URL certa no `sessionStorage`.
 *
 * ⚠️ **Não "uniformize" isto de volta para `router.replace`.** Os TRÊS
 * escritores de URL do painel usam a History API, pela mesma razão medida.
 * Não há mais `scroll: false` porque não existe navegação para mover a
 * rolagem — a History API não mexe na posição, que é justamente o que se
 * queria enquanto o admin digita no meio da lista.
 */
export function useEstadoDoPainel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Só a leitura INICIAL vem da URL. Depois é o estado que manda: reler a cada
  // render faria a busca "pular" enquanto o endereço não tivesse sido trocado.
  // 🔑 Não existe efeito de volta (URL -> estado), então `replaceState` mudar
  // o `useSearchParams()` NÃO realimenta o estado local: o fluxo é de mão
  // única e não há laço.
  const [estado, setEstado] = useState<EstadoDoPainel>(() =>
    lerEstado(new URLSearchParams(searchParams.toString())),
  );

  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => {
      const destino = escreverEstado(
        new URLSearchParams(searchParams.toString()),
        estado,
      );
      window.history.replaceState(null, "", `${pathname}${destino}`);
    }, 300);
    // 🔴 O `clearTimeout` no cleanup é o que impede o timer de escrever o
    // endereço depois que o painel saiu da tela (o admin troca de aba enquanto
    // os 300 ms correm). Sem ele, `replaceState` reescreveria a URL de uma
    // página que já mudou — e, diferente de `router.replace`, ninguém avisa.
    return () => clearTimeout(t);
  }, [estado, pathname, searchParams]);

  const alternarFiltro = useCallback((id: FiltroId, ligado: boolean) => {
    setEstado((e) => {
      const filtros = new Set(e.filtros);
      if (ligado) filtros.add(id);
      else filtros.delete(id);
      return { ...e, filtros };
    });
  }, []);

  const limparFiltros = useCallback(
    () => setEstado((e) => ({ ...e, filtros: new Set<FiltroId>() })),
    [],
  );

  const definirTermo = useCallback(
    (termo: string) => setEstado((e) => ({ ...e, termo })),
    [],
  );

  const definirOrdem = useCallback(
    (ordem: OrdemAlunos) => setEstado((e) => ({ ...e, ordem })),
    [],
  );

  /**
   * Entra numa fase (o card), abre a lista sem corte de classe (`"todas"`,
   * `CLASSE_TODAS`) ou volta para os 5 cards (`null`).
   *
   * 🔑 Voltar aos 5 CARDS (`null`) LIMPA busca e filtros. Eles foram
   * escolhidos dentro de uma fase (ou vieram de um link do dashboard); levá-
   * los para lá faria o admin abrir "Execução" e ver uma lista vazia por
   * causa de um filtro que ele marcou antes — e o card diria 12 enquanto a
   * tela mostra 0.
   *
   * 🔴 Voltar a `CLASSE_TODAS` PRESERVA o filtro — são dois botões distintos
   * na tela ("← Todas as fases" volta ao `"todas"` de onde o link trouxe;
   * "Ver os 5 cards" é que zera). Antes um botão só fazia as duas coisas.
   */
  const definirClasse = useCallback(
    (classe: ClasseNaUrl | null) =>
      setEstado((e) =>
        classe === null
          ? { ...e, classe: null, termo: "", filtros: new Set<FiltroId>() }
          : { ...e, classe },
      ),
    [],
  );

  /**
   * Costura o estado atual num link que o servidor gerou ("Mostrar mais", que
   * vem como `/admin?mais=2`).
   *
   * 🔑 Sem isso, "Mostrar mais" **apagaria a busca e os filtros**: o href é
   * montado no Server Component, que não sabe o que o admin marcou depois de a
   * página carregar. O parâmetro do servidor manda no que é dele (`mais`); o
   * resto vem do estado.
   */
  const hrefComEstado = useCallback(
    (href: string) => {
      const [caminho, consulta = ""] = href.split("?");
      const sp = new URLSearchParams(consulta);
      // 🔴 A aba não passa por `escreverEstado` (um escritor só), e o href do
      // servidor nasce sem ela (`/admin?mais=2`). Como o padrão do painel
      // passou a ser "Visão geral", sem esta linha "Mostrar mais" devolveria o
      // dashboard em vez da lista que o admin estava lendo. Copiar o que já
      // está no endereço não é escrever estado novo — é não perder o atual.
      const abaAtual = searchParams.get("aba");
      if (abaAtual && !sp.has("aba")) sp.set("aba", abaAtual);
      return `${caminho}${escreverEstado(sp, estado)}`;
    },
    [estado, searchParams],
  );

  return {
    estado,
    alternarFiltro,
    limparFiltros,
    definirTermo,
    definirOrdem,
    definirClasse,
    hrefComEstado,
  };
}
