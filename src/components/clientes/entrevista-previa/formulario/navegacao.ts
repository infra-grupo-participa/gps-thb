import {
  perguntaPorId,
  type AgendamentoPreliminar,
  type RespostasEntrevista,
} from "@/lib/entrevista-previa-perguntas";
import {
  estaRespondida,
  lerAgendamento,
  perguntaSeguinte,
  perguntasVisiveis,
  primeiraSemResposta,
} from "@/lib/entrevista-previa-fluxo";

/**
 * Navegação da tela da Entrevista Prévia — funções PURAS (sem React), para
 * `index.tsx` só guardar estado. A regra de visibilidade continua em
 * `entrevista-previa-fluxo.ts`; aqui só se decide PARA ONDE a tela vai.
 */

export type Tela =
  | { tipo: "abertura" }
  | { tipo: "pergunta"; id: string }
  | { tipo: "validacao" };

/**
 * Retomada: se a conversa caiu no meio, volta à 1ª visível sem resposta.
 * Sem nada respondido, é conversa nova e começa pela abertura.
 */
export function telaInicial(r: RespostasEntrevista): Tela {
  const comecou = perguntasVisiveis(r).some((p) => estaRespondida(r, p.id));
  if (!comecou) return { tipo: "abertura" };
  const p = primeiraSemResposta(r);
  return p ? { tipo: "pergunta", id: p.id } : { tipo: "validacao" };
}

/**
 * Para onde ir depois de responder `id`. No fluxo normal, a próxima
 * visível. No AJUSTE (veio do "Ajustar" da validação), primeiro qualquer
 * pergunta que a mudança revelou sem resposta; depois, se o ajuste é de
 * "quem decide", o resto do bloco (filhos, sócios, presença); senão, direto
 * de volta à validação.
 */
export function destinoDepois(r: RespostasEntrevista, id: string, emAjuste: boolean): Tela {
  const seguinte = perguntaSeguinte(r, id);
  if (!emAjuste) return seguinte ? { tipo: "pergunta", id: seguinte.id } : { tipo: "validacao" };
  const pendente = primeiraSemResposta(r);
  if (pendente) return { tipo: "pergunta", id: pendente.id };
  const atual = perguntaPorId(id);
  if (seguinte && atual?.bloco === "decisores" && seguinte.bloco === "decisores") {
    return { tipo: "pergunta", id: seguinte.id };
  }
  return { tipo: "validacao" };
}

/**
 * A escolha da Reunião Preliminar ao abrir a validação.
 *   • Preliminar viva DESTE cliente → "ja_marcada" (e "agora" do rascunho
 *     vira "ja_marcada": a segunda seria recusada pelo índice de sessão viva);
 *   • "ja_marcada" do rascunho sem viva → nada escolhido (não se afirma o
 *     que o banco não mostra);
 *   • "agora" na equipe → nada escolhido (a equipe não agenda, item d).
 */
export function agendamentoInicial(
  r: RespostasEntrevista,
  jaMarcada: boolean,
  podeMarcarAgora: boolean,
): AgendamentoPreliminar | null {
  if (jaMarcada) {
    const salvo = lerAgendamento(r).preliminar;
    return salvo === "nao_agendou" ? salvo : "ja_marcada";
  }
  const salvo = lerAgendamento(r).preliminar;
  if (salvo === "ja_marcada") return null;
  if (salvo === "agora" && !podeMarcarAgora) return null;
  return salvo;
}
