/**
 * Diário do aluno — Fase 2: agregação da trilha (log de eventos + notas da
 * equipe + ações administrativas) em `ItemTrilha[]`.
 *
 * FUNÇÃO PURA, SEM I/O. Não importa `supabase/server`, não é "use server".
 * Recebe os dados já buscados (por `src/lib/data.ts`) e devolve a lista
 * pronta para a UI — assim é testável isolada e não duplica regra de negócio
 * entre camadas.
 *
 * Regra de agregação (decisão do Marcio):
 *  - Macro é POR DIA (não por rajada/sessão), agrupando eventos do MESMO
 *    `tipo`, do MESMO aluno, no MESMO dia local America/Sao_Paulo.
 *  - Rótulo mostra o intervalo de horário da macro (menor e maior
 *    `ocorrido_em` do grupo), ex. "Listou 15 clientes · 14h02–21h40".
 *  - Grupo com 1 item só NÃO vira macro — vira `ItemTrilha` de evento solto
 *    (dropdown de 1 item é ruído).
 *  - Marcos de origem (conta_criada, email_confirmado, entrou_no_programa,
 *    primeiro_acesso) e `cliente_excluido` NUNCA agregam — são sempre
 *    únicos por natureza (marco) ou merecem aparecer individualmente
 *    (exclusão é evento sensível, não deve "sumir" dentro de uma macro).
 *  - Ações administrativas (gps.acessos_log) NUNCA agregam.
 *
 * A conversão para dia local acontece SÓ AQUI, em memória — nunca no SQL
 * (ver nota em `getEventosDoAluno`, `src/lib/data.ts`): o filtro no banco é
 * sempre por `ocorrido_em` cru, para não perder o índice
 * `idx_aluno_eventos_timeline`.
 */

import type {
  AlunoEventoComAutor,
  AlunoNotaComAutor,
  AcaoAdministrativa,
  ItemTrilha,
  MacroAcao,
  TipoEvento,
} from "@/lib/types";

/** Tipos que nunca agregam, mesmo repetidos no mesmo dia — sempre aparecem soltos. */
const TIPOS_NUNCA_AGREGAM: ReadonlySet<TipoEvento> = new Set([
  "conta_criada",
  "email_confirmado",
  "primeiro_acesso",
  "entrou_no_programa",
  "cliente_excluido",
]);

/** "YYYY-MM-DD" de um ISO timestamptz no fuso de São Paulo. Mesmo padrão de `plantao.ts`. */
function diaLocalSaoPaulo(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

/** "2026-09-08T17:02:00Z" → "14h02" em America/Sao_Paulo. */
export function horaLocalCurta(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hh = partes.find((p) => p.type === "hour")?.value ?? "00";
  const mm = partes.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}h${mm}`;
}

/**
 * Agrupa os eventos de um aluno em macros por (tipo, dia local), funde com
 * notas e ações administrativas, e devolve a trilha ordenada (mais recente
 * primeiro) — pronta para renderizar.
 */
export function montarTrilha(
  eventos: AlunoEventoComAutor[],
  notas: AlunoNotaComAutor[],
  acoesAdministrativas: AcaoAdministrativa[],
): ItemTrilha[] {
  const itens: ItemTrilha[] = [];

  // Agrupa eventos por (tipo, ator, dia local) — dois alunos/atores
  // diferentes no mesmo dia com o mesmo tipo não devem virar uma macro só.
  const grupos = new Map<string, AlunoEventoComAutor[]>();
  for (const evento of eventos) {
    if (TIPOS_NUNCA_AGREGAM.has(evento.tipo)) {
      itens.push({
        variante: "evento",
        ocorrido_em: evento.ocorrido_em,
        evento,
      });
      continue;
    }

    const dia = diaLocalSaoPaulo(evento.ocorrido_em);
    const chave = `${evento.tipo}|${evento.ator}|${evento.ator_user_id ?? ""}|${dia}`;
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(evento);
    else grupos.set(chave, [evento]);
  }

  for (const grupo of grupos.values()) {
    if (grupo.length === 1) {
      const [evento] = grupo;
      itens.push({
        variante: "evento",
        ocorrido_em: evento.ocorrido_em,
        evento,
      });
      continue;
    }

    // Ordena o grupo por ocorrido_em para achar primeiro/último de forma
    // estável (a ordem de chegada de `eventos` não é garantida aqui).
    const ordenado = [...grupo].sort((a, b) =>
      a.ocorrido_em < b.ocorrido_em ? -1 : a.ocorrido_em > b.ocorrido_em ? 1 : 0,
    );
    const primeiro = ordenado[0];
    const ultimo = ordenado[ordenado.length - 1];

    const macro: MacroAcao = {
      tipo: primeiro.tipo,
      diaLocal: diaLocalSaoPaulo(primeiro.ocorrido_em),
      // Nº de CLIENTES distintos atingidos pela macro, não nº de eventos: o
      // mesmo cliente mudado 5x no mesmo dia é 1 cliente, não "5 clientes"
      // (achado do `fable-orchestrator`). Tipos sem `entidade_id` (ex.
      // marcos) usam a contagem de eventos mesmo, via fallback abaixo.
      quantidade: new Set(
        ordenado.map((e) => e.entidade_id ?? e.id),
      ).size,
      primeiroEm: primeiro.ocorrido_em,
      ultimoEm: ultimo.ocorrido_em,
      ator: primeiro.ator,
      atorUserId: primeiro.ator_user_id,
      atorNome: primeiro.ator_nome,
      itens: ordenado,
    };

    // A macro ordena pelo evento MAIS RECENTE do grupo — é quando ela "voltou
    // a acontecer" pela última vez, coerente com o resto da trilha (mais
    // recente primeiro).
    itens.push({ variante: "macro", ocorrido_em: ultimo.ocorrido_em, macro });
  }

  for (const nota of notas) {
    itens.push({ variante: "nota", ocorrido_em: nota.criado_em, nota });
  }

  for (const acao of acoesAdministrativas) {
    itens.push({
      variante: "acao_administrativa",
      ocorrido_em: acao.criado_em,
      acao,
    });
  }

  itens.sort((a, b) =>
    a.ocorrido_em < b.ocorrido_em ? 1 : a.ocorrido_em > b.ocorrido_em ? -1 : 0,
  );

  return itens;
}

/** Rótulo pronto da macro: "Listou 15 clientes · 14h02–21h40". */
export function rotuloMacro(macro: MacroAcao): string {
  const verbo =
    ROTULO_MACRO_POR_TIPO[macro.tipo] ?? ((n: number) => `${macro.tipo} (${n})`);
  const faixa =
    macro.primeiroEm === macro.ultimoEm
      ? horaLocalCurta(macro.primeiroEm)
      : `${horaLocalCurta(macro.primeiroEm)}–${horaLocalCurta(macro.ultimoEm)}`;
  return `${verbo(macro.quantidade)} · ${faixa}`;
}

/** Vocabulário do programa (não "Cadastrou") — decisão do Marcio. */
const ROTULO_MACRO_POR_TIPO: Partial<
  Record<TipoEvento, (n: number) => string>
> = {
  cliente_cadastrado: (n) => `Listou ${n} cliente${n === 1 ? "" : "s"}`,
  cliente_favoritado: (n) => `Favoritou ${n} cliente${n === 1 ? "" : "s"}`,
  cliente_desfavoritado: (n) =>
    `Desfavoritou ${n} cliente${n === 1 ? "" : "s"}`,
  cliente_status_mudou: (n) => `Mudou o status de ${n} clientes`,
  cliente_mensagem_padrao: (n) =>
    `Enviou a mensagem padrão para ${n} clientes`,
  cliente_estudo_caso: (n) =>
    `Enviou a mensagem de estudo de caso para ${n} clientes`,
  cliente_ligacao: (n) => `Registrou ligação com ${n} clientes`,
  cliente_aderiu_reuniao: (n) => `${n} clientes aderiram à reunião`,
  cliente_reuniao_agendada: (n) => `Agendou reunião com ${n} clientes`,
  tarefa_concluida: (n) => `Concluiu ${n} tarefas`,
  tarefa_reaberta: (n) => `Reabriu ${n} tarefas`,
};

// Nota sobre achado menor do `fable-orchestrator`: o `rotulo` de
// `tarefa_concluida`/`tarefa_reaberta` (ex. "tarefa 5") usa o `num` interno
// da `TarefaDef` (identidade estável, referenciada por `gps.progresso`), não
// o `codigo` exibido ao aluno (ex. "4" — ver `src/lib/etapa1.ts`). NÃO
// resolvido nesta passada: o texto do evento é gravado por trigger de banco
// (fora deste repo), sem o `alunoId`/etapa disponíveis aqui para resolver
// `conteudoEtapa(n).tarefas` sem I/O — e esta função é pura, de propósito
// (ver cabeçalho do arquivo). Corrigir exigiria a trigger gravar o `codigo`
// junto com o `num`, ou o rótulo, no INSERT — mudança de banco fora do
// escopo desta correção (nenhuma migration deveria mexer sem `explain
// analyze` e sem necessidade demonstrada aqui).
