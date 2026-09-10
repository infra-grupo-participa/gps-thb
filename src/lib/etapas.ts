// Registro do conteúdo (tarefas) de cada etapa do GPS.

import {
  TAREFAS_ETAPA1,
  calcularMetricasEtapa1,
  type TarefaDef,
} from "@/lib/etapa1";
import { TAREFAS_ETAPA2, META_ETAPA2 } from "@/lib/etapa2";
import { TAREFAS_ETAPA3 } from "@/lib/etapa3";
import { TAREFAS_ETAPA4 } from "@/lib/etapa4";
import { TAREFAS_ETAPA5 } from "@/lib/etapa5";
import { TAREFAS_ETAPA6 } from "@/lib/etapa6";
import type { ClienteEtapa1, Etapa, ProgressoTarefa } from "@/lib/types";

export interface ConteudoEtapa {
  tarefas: TarefaDef[];
  meta?: string;
}

export const CONTEUDO_ETAPAS: Record<number, ConteudoEtapa> = {
  1: { tarefas: TAREFAS_ETAPA1 },
  2: { tarefas: TAREFAS_ETAPA2, meta: META_ETAPA2 },
  3: { tarefas: TAREFAS_ETAPA3 },
  4: { tarefas: TAREFAS_ETAPA4 },
  5: { tarefas: TAREFAS_ETAPA5 },
  6: { tarefas: TAREFAS_ETAPA6 },
};

export function conteudoEtapa(n: number): ConteudoEtapa | null {
  return CONTEUDO_ETAPAS[n] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Liberação de etapa POR ALUNO — a regra `coalesce(override, global)`.
//
// `gps.etapas.liberada` é o interruptor GLOBAL; `gps.etapa_liberacao_aluno`
// (migração ...152) é o override de UM ambiente. O override manda nos DOIS
// sentidos: libera quem está adiantado e trava quem precisa refazer.
//
// 🔑 As funções abaixo recebem o MAPA já carregado — não vão ao banco. A
// leitura acontece uma vez por página (`getEtapasLiberadasPara`, em
// `src/lib/data/central.ts`) e o resultado atravessa a árvore como dado.
// A regra também existe em SQL (`gps.etapa_liberada_para`), para o que roda
// dentro do banco; as duas dizem `coalesce(override, global)` e é isso que
// precisa continuar verdade se uma delas mudar.
//
// Tipo estrutural de propósito: `etapas.ts` é importado por Client Components
// e não pode arrastar `src/lib/data/*` (server-only) junto.
// ─────────────────────────────────────────────────────────────────────────

/** O que o override diz para uma etapa. `motivo` é opcional aqui: a regra de
 *  liberação não depende dele — quem exibe o motivo é a UI. */
export interface OverrideLiberacao {
  liberada: boolean;
  motivo?: string;
}

/** Overrides do ambiente, indexados pelo número da etapa. */
export type OverridesLiberacao = Record<number, OverrideLiberacao>;

/** Esta etapa está liberada PARA ESTE ALUNO? `coalesce(override, global)`.
 *  INTERNA: o único consumidor é `etapasComLiberacaoDoAluno`, logo abaixo —
 *  exportá-la oferecia uma segunda porta para a MESMA regra de liberação. */
function etapaLiberadaPara(
  etapa: Pick<Etapa, "id" | "liberada">,
  overrides: OverridesLiberacao,
): boolean {
  const o = overrides[etapa.id];
  return o ? o.liberada : etapa.liberada;
}

/**
 * As etapas com `liberada` JÁ RESOLVIDA para este aluno — a forma que os
 * consumidores existentes esperam (`proximoPasso`, `EtapasOverview`,
 * `/etapa/[n]`, materiais, progresso geral). Trocar `getEtapas()` por
 * `etapasComLiberacaoDoAluno(await getEtapas(), overrides)` é uma linha por
 * página, e nada abaixo precisa saber que existe override.
 *
 * Devolve um array novo (não muta o de entrada) e preserva a ordem.
 */
export function etapasComLiberacaoDoAluno(
  etapas: Etapa[],
  overrides: OverridesLiberacao,
): Etapa[] {
  return etapas.map((e) => {
    const liberada = etapaLiberadaPara(e, overrides);
    return liberada === e.liberada ? e : { ...e, liberada };
  });
}

/** Progresso (%) de uma etapa cujas tarefas são todas manuais (etapas >= 2). */
function pctEtapaManual(
  tarefas: TarefaDef[],
  progresso: ProgressoTarefa[],
): number {
  if (tarefas.length === 0) return 0;
  const feitas = new Set(
    progresso.filter((p) => p.concluida).map((p) => p.tarefa),
  );
  const concluidas = tarefas.filter((t) => feitas.has(t.num)).length;
  return Math.round((concluidas / tarefas.length) * 100);
}

export interface ProximoPasso {
  etapa: number;
  etapaNome: string;
  tarefaNum: number;
  codigo: string;
  titulo: string;
  /**
   * Preenchido só quando **todas** as tarefas pendentes estão travadas: diz, em
   * uma frase, o que o aluno tem de fazer para destravar. O card da home usa
   * isso para virar CTA de destravamento em vez de link para uma porta
   * trancada. `undefined` = a tarefa está liberada, pode marcar.
   */
  bloqueio?: string;
}

/**
 * Frases de destravamento. Ficam aqui (e não no componente) para o card do
 * aluno e o do modo assistência dizerem a MESMA coisa.
 *
 * A trava de tarefa vem antes da de favorito quando as duas valem: é a que o
 * aluno resolve primeiro. Mesma precedência do `Etapa1Guide`.
 */
const BLOQUEIO_TAREFA = "Liste os 30 clientes";
const BLOQUEIO_FAVORITO = "Escolha o cliente que a equipe vai acompanhar";

export interface OpcoesProximoPasso {
  /** O ambiente já tem um cliente marcado como acompanhado pela equipe. */
  temFavorito: boolean;
  /**
   * O aluno chegou ao programa COM cliente (respondeu "já tenho" no
   * questionário inicial)? Quem já tem não é travado pela tarefa dos 30.
   */
  jaTemCliente?: boolean;
}

/**
 * A próxima tarefa pendente do aluno: primeira **que ele consegue fazer** na
 * etapa liberada mais avançada em que ainda há pendência. Retorna null quando
 * está tudo em dia.
 *
 * 🔑 Tarefa travada não é "próximo passo" (PL2, 09/09/2026). Até 09/09 esta
 * função escolhia a primeira não concluída sem olhar `exigeFavorito` nem
 * `exigeTarefa` — o card mais proeminente da home mandava o aluno para um
 * checkbox desabilitado. Agora:
 *   1. procura, nas etapas liberadas em ordem, a primeira pendente LIVRE;
 *   2. se não houver nenhuma livre em etapa alguma, devolve a primeira pendente
 *      com `bloqueio` preenchido — a tela diz o que destravar, em vez de mentir.
 *
 * `opts` é obrigatório de propósito: uma página nova que esqueça o favorito
 * não compila, em vez de reintroduzir o beco sem saída em silêncio.
 */
export function proximoPasso(
  etapas: Etapa[],
  clientes: ClienteEtapa1[],
  progressoTodas: ProgressoTarefa[],
  opts: OpcoesProximoPasso,
): ProximoPasso | null {
  const jaTemCliente = opts.jaTemCliente === true;
  const liberadas = [...etapas]
    .filter((e) => e.liberada)
    .sort((a, b) => a.ordem - b.ordem);

  /** Primeira pendente travada encontrada — só usada se nada estiver livre. */
  let travadaMaisProxima: ProximoPasso | null = null;

  for (const et of liberadas) {
    const conteudo = CONTEUDO_ETAPAS[et.id];
    if (!conteudo) continue;

    const progE = progressoTodas.filter((p) => p.etapa === et.id);
    let estaConcluida: (num: number) => boolean;
    if (et.id === 1) {
      const manual: Record<number, boolean> = {};
      for (const p of progE) manual[p.tarefa] = p.concluida;
      estaConcluida = calcularMetricasEtapa1(clientes, manual).tarefaConcluida;
    } else {
      const feitas = new Set(
        progE.filter((p) => p.concluida).map((p) => p.tarefa),
      );
      estaConcluida = (num) => feitas.has(num);
    }

    // Mesma regra do `Etapa1Guide` — se divergir, o card promete o que o
    // checkbox recusa.
    const motivoBloqueio = (t: TarefaDef): string | null => {
      // 🔑 A trava dos 30 vale para quem começa do ZERO. Quem chegou ao
      // programa COM cliente (respondeu "já tenho" no questionário inicial)
      // passa direto: mandar quem já está em fechamento voltar para montar
      // uma lista de 30 nomes é atrasar quem está adiantado.
      //
      // Decisão do Marcio, 10/09/2026: "o cara que marcar que vai começar da
      // captação, sua missão é listar os 30 primeiro, como impedimento, ele
      // não pode avançar sem listar os 30; se o cara já tem cliente, ele pode
      // avançar sem listar os 30, direto".
      if (t.exigeTarefa != null && !jaTemCliente && !estaConcluida(t.exigeTarefa)) {
        return BLOQUEIO_TAREFA;
      }
      if (t.exigeFavorito && !opts.temFavorito) return BLOQUEIO_FAVORITO;
      return null;
    };

    const monta = (t: TarefaDef, bloqueio: string | null): ProximoPasso => ({
      etapa: et.id,
      etapaNome: et.nome,
      tarefaNum: t.num,
      codigo: t.codigo ?? String(t.num),
      titulo: t.titulo,
      ...(bloqueio ? { bloqueio } : {}),
    });

    for (const t of conteudo.tarefas) {
      if (estaConcluida(t.num)) continue;
      const bloqueio = motivoBloqueio(t);
      if (!bloqueio) return monta(t, null);
      if (!travadaMaisProxima) travadaMaisProxima = monta(t, bloqueio);
    }
  }

  return travadaMaisProxima;
}

/** Progresso (%) de todas as etapas cadastradas, para o mapa do Início. */
export function pctPorEtapa(
  clientes: ClienteEtapa1[],
  progressoTodas: ProgressoTarefa[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [etapaStr, conteudo] of Object.entries(CONTEUDO_ETAPAS)) {
    const etapa = Number(etapaStr);
    const progressoEtapa = progressoTodas.filter((p) => p.etapa === etapa);
    if (etapa === 1) {
      const manual: Record<number, boolean> = {};
      for (const p of progressoEtapa) manual[p.tarefa] = p.concluida;
      out[etapa] = calcularMetricasEtapa1(clientes, manual).pct;
    } else {
      out[etapa] = pctEtapaManual(conteudo.tarefas, progressoEtapa);
    }
  }
  return out;
}
