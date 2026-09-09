import {
  CHAMADO_MAX_MENSAGENS,
  CHAMADO_REABRIR_DIAS,
  type Chamado,
} from "@/lib/chamados-tipos";
import { formatarData } from "@/lib/datas";

/**
 * O que a caixa de resposta pode fazer neste chamado, em frases prontas.
 *
 * As MESMAS três travas que as RPCs aplicam (teto de mensagens, prazo de
 * reabertura, interruptor) — aqui só para a tela explicar antes de a pessoa
 * escrever 400 palavras e levar um 42501 na cara. O banco continua sendo
 * quem decide: `gps.chamado_responder` recusa de qualquer jeito.
 *
 * 🔑 Ordem dos bloqueios: teto de mensagens → prazo vencido → interruptor.
 * Do mais definitivo para o mais temporário — a frase que aparece é a que a
 * pessoa não consegue contornar esperando.
 *
 * `Date.now()` fica aqui, numa função de módulo, e não no corpo do Server
 * Component: o `react-hooks/purity` reprova leitura de relógio durante o
 * render (mesmo padrão de `desdeDaJanela` na página do Diário).
 */
export interface EstadoDaResposta {
  /** Frase que IMPEDE responder. `null` = pode. */
  bloqueio: string | null;
  /** Frase de contexto que não impede (reabertura dentro do prazo). */
  aviso: string | null;
  podeFechar: boolean;
}

export function estadoDaResposta(
  chamado: Chamado,
  qtdMensagens: number,
  visao: "aluno" | "admin",
  suporteAberto: boolean,
): EstadoDaResposta {
  const podeFechar = chamado.status !== "fechado";

  if (qtdMensagens >= CHAMADO_MAX_MENSAGENS) {
    return {
      bloqueio: `Este chamado já tem ${CHAMADO_MAX_MENSAGENS} mensagens. ${
        visao === "aluno"
          ? "Abra um chamado novo para continuar o assunto."
          : "O aluno precisa abrir um chamado novo para continuar o assunto."
      }`,
      aviso: null,
      podeFechar,
    };
  }

  if (chamado.status === "fechado" && chamado.fechado_em) {
    const dias =
      (Date.now() - new Date(chamado.fechado_em).getTime()) / 86_400_000;
    if (dias > CHAMADO_REABRIR_DIAS) {
      return {
        bloqueio:
          visao === "aluno"
            ? `Este chamado foi fechado há mais de ${CHAMADO_REABRIR_DIAS} dias. Abra um chamado novo.`
            : `Este chamado foi fechado há mais de ${CHAMADO_REABRIR_DIAS} dias e não aceita mais mensagens. O aluno precisa abrir um chamado novo.`,
        aviso: null,
        podeFechar: false,
      };
    }
  }

  // 🔑 O interruptor fecha a ENTRADA, nunca a saída: a equipe continua
  // respondendo e fechando o que já existe. Desligar não pode deixar ninguém
  // no meio do caminho sem resposta.
  if (visao === "aluno" && !suporteAberto) {
    return {
      bloqueio:
        "O suporte por chamado está temporariamente fechado. Fale com a equipe pelos canais de sempre.",
      aviso: null,
      podeFechar: false,
    };
  }

  const aviso =
    chamado.status === "fechado" && chamado.fechado_em
      ? `Este chamado foi fechado em ${formatarData(chamado.fechado_em)}. Responder reabre o chamado.`
      : null;

  return { bloqueio: null, aviso, podeFechar };
}
