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
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  "tem_fechamento",
  "onb_nao",
  "onb_andamento",
  "onb_ok",
  "contrato_enviado",
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
 * As 5 classes do programa — os cards do desenho do Marcio (10/09/2026).
 *
 * A regra é DERIVADA (`gps.admin_classes_dos_alunos`), não um campo que
 * alguém marca: a mais avançada vence. A ordem aqui é a ordem dos cards na
 * tela, e é a ordem da jornada — não mexer sem mexer no desenho.
 */
export { CLASSES, type ClasseAluno } from "@/lib/types";
import { CLASSES, type ClasseAluno } from "@/lib/types";

const CLASSES_SET = new Set<string>(CLASSES);

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
  /** O card escolhido. `null` = nenhum, então a tela mostra os 5 cards. */
  classe: ClasseAluno | null;
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
    classe: CLASSES_SET.has(classe ?? "") ? (classe as ClasseAluno) : null,
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
  // 🔴 `aba` NÃO é escrita aqui. Quem manda nela é `AbasPainel`
  // (`src/components/admin/abas-painel.tsx`); este hook só a PRESERVA, porque
  // `sp` já parte da consulta atual. Dois componentes com estado local próprio
  // escrevendo a mesma chave se sobrescrevem: o último `router.replace` a
  // rodar devolve o valor que ele leu na montagem, e trocar de aba "voltaria"
  // sozinho 300 ms depois de digitar uma letra na busca.
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
 * de atraso**: `router.replace` a cada tecla digitada empilharia uma entrada
 * de navegação por caractere e faria o Server Component reavaliar sem
 * necessidade. `scroll: false` porque o admin está no meio da lista — pular
 * para o topo a cada letra digitada seria pior do que não persistir nada.
 */
export function useEstadoDoPainel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Só a leitura INICIAL vem da URL. Depois é o estado que manda: reler a cada
  // render faria a busca "pular" enquanto o `replace` não tivesse chegado.
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
      router.replace(`${pathname}${destino}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [estado, pathname, router, searchParams]);

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
   * Entra numa fase (o card) ou volta para os 5 cards (`null`).
   *
   * 🔑 Voltar LIMPA busca e filtros. Eles foram escolhidos dentro de uma
   * fase; carregá-los para a próxima faria o admin abrir "Execução" e ver
   * uma lista vazia por causa de um filtro que ele marcou em "Inicial" —
   * e o card diria 12 enquanto a tela mostra 0.
   */
  const definirClasse = useCallback(
    (classe: ClasseAluno | null) =>
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
