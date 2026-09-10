import type { AlunoGps } from "@/lib/data/alunos";
import { META_CLIENTES } from "@/lib/etapa1";
import type { ClasseAluno } from "@/lib/types";

/**
 * As submétricas de cada fase — "bater o olho e saber quem está onde".
 *
 * Pedido do Marcio (10/09/2026): *"cara que já listou geral, cara que já
 * mandou a primeira mensagem, segunda, cara que já agendou reunião,
 * submétricas dentro de cada card específico de cada nível do aluno"*.
 *
 * 🔑 ZERO CONSULTA NOVA. Tudo sai dos agregados que `gps.admin_painel_alunos`
 * já devolve por ambiente (`clientesComDados`, `tarefasConcluidas`,
 * `agendados`, `emFechamento`, `contratados`, `honorariosContratados`). O
 * card só conta quantos do lote satisfazem cada recorte.
 *
 * 🔴 As submétricas NÃO SÃO EXCLUDENTES e não somam o total do card. Quem
 * agendou reunião também já listou os 30 — o mesmo aluno aparece nos dois
 * números. É de propósito: a pergunta que elas respondem é *"quantos já
 * chegaram até aqui?"*, não *"como o card se divide?"*. A tela diz isso.
 *
 * Os `num` das tarefas vêm de `TAREFAS_ETAPA1` (`src/lib/etapa1.ts`) e são a
 * identidade estável referenciada por `gps.progresso` — não o `codigo`, que
 * é só o rótulo exibido.
 */

/** `num` das tarefas da Etapa 01 que viram submétrica. */
const TAREFA_SEQUENCIA = 3; // exibida como "2"
const TAREFA_LIGACAO = 5; // exibida como "4"

// 🔴 A tarefa `num: 4` ("Enviar mensagem de estudo de caso") foi APOSENTADA
// em 10/09/2026 — as duas tarefas de mensagem viraram a sequência de 3
// (ver `src/lib/etapa1.ts`). A submétrica que a contava foi REMOVIDA junto:
// mantê-la mostraria um número congelado nos 3 ambientes que a marcaram
// antes, que nunca mais subiria — pior que não ter o número, porque parece
// medida viva.

export interface Submetrica {
  /** Rótulo curto — cabe na linha do card. */
  rotulo: string;
  valor: number;
  /** O que este número quer dizer, para quem passa o mouse. */
  ajuda: string;
}

function contar(alunos: AlunoGps[], teste: (a: AlunoGps) => boolean): number {
  return alunos.filter(teste).length;
}

const fez = (a: AlunoGps, num: number) => a.tarefasConcluidas.includes(num);

/**
 * As submétricas da fase, calculadas sobre os alunos DAQUELA fase.
 *
 * Devolve lista vazia quando não há o que dizer — card sem aluno não ganha
 * uma fileira de zeros.
 */
export function submetricasDaClasse(
  classe: ClasseAluno,
  alunos: AlunoGps[],
): Submetrica[] {
  if (alunos.length === 0) return [];

  switch (classe) {
    // A fase de quem está montando a lista. As submétricas são os passos
    // da Etapa 01, na ordem em que o aluno os cumpre.
    case "inicial":
      return [
        // 🔑 "listaram os 30" SAIU daqui em 10/09/2026: com a trava nova,
        // quem tem os 30 não está mais nesta fase — a submétrica seria zero
        // para sempre, e número congelado parece medida quebrada.
        //
        // No lugar entra o que a equipe precisa saber para agir: quem está
        // na reta final (a ligação resolve) e quem nem começou.
        {
          rotulo: "faltam 10 ou menos",
          valor: contar(
            alunos,
            (a) =>
              a.clientesComDados >= META_CLIENTES - 10 &&
              a.clientesComDados < META_CLIENTES,
          ),
          ajuda: `entre ${META_CLIENTES - 10} e ${META_CLIENTES - 1} fichas completas — perto de destravar a próxima fase`,
        },
        {
          rotulo: "começaram a lista",
          valor: contar(
            alunos,
            (a) =>
              a.clientesComDados > 0 &&
              a.clientesComDados < META_CLIENTES - 10,
          ),
          ajuda: "têm ao menos um cliente com os dados completos",
        },
        {
          rotulo: "ainda não começaram",
          valor: contar(alunos, (a) => a.clientesPreenchidos === 0),
          ajuda: "nenhum cliente cadastrado",
        },
      ];

    // Captação/Fechamento: o que separa é a mensagem enviada e a reunião.
    case "captacao":
      return [
        {
          rotulo: "enviaram a sequência",
          valor: contar(alunos, (a) => fez(a, TAREFA_SEQUENCIA)),
          ajuda: "marcaram a sequência de 3 mensagens como enviada",
        },
        {
          rotulo: "ligaram",
          valor: contar(alunos, (a) => fez(a, TAREFA_LIGACAO)),
          ajuda: "marcaram a ligação com as duas opções de agenda",
        },
        {
          rotulo: "com reunião marcada",
          valor: contar(alunos, (a) => a.agendados > 0),
          ajuda: "têm ao menos um cliente com reunião preliminar agendada",
        },
      ];

    // Execução: honorários e contrato.
    case "execucao":
      return [
        {
          rotulo: "em fechamento",
          valor: contar(alunos, (a) => a.emFechamento > 0),
          ajuda: "têm cliente na fase de fechamento",
        },
        {
          rotulo: "com contratado",
          valor: contar(alunos, (a) => a.contratados > 0),
          ajuda: "já têm cliente contratado",
        },
        {
          rotulo: "sem valor informado",
          valor: contar(alunos, (a) => a.contratadosSemValor > 0),
          ajuda: "têm cliente contratado sem honorários preenchidos",
        },
      ];

    // Orientação: quem entregou e segue acompanhado.
    case "orientacao":
      return [
        {
          rotulo: "faturando",
          valor: contar(alunos, (a) => (a.honorariosContratados ?? 0) > 0),
          ajuda: "já somam honorários de clientes contratados",
        },
        {
          rotulo: "acessaram nos últimos 30 dias",
          valor: contar(alunos, (a) => diasDesde(a.ultimoAcesso) <= 30),
          ajuda: "entraram no portal no último mês",
        },
      ];

    // Finalizados: bateram a meta.
    case "finalizado":
      return [
        {
          rotulo: "acima de R$ 150 mil",
          valor: contar(alunos, (a) => (a.honorariosContratados ?? 0) >= 150_000),
          ajuda: "somam R$ 150 mil ou mais em honorários contratados",
        },
      ];
  }
}

/** Dias desde o último acesso. `null` (nunca entrou) vira infinito. */
function diasDesde(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 86_400_000;
}
