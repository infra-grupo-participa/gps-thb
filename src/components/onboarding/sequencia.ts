import type { OrigemCliente1, StatusOnboarding } from "@/lib/types";

/**
 * A máquina de passos do onboarding — a sequência de cada pessoa e por onde
 * ela reabre o diálogo.
 *
 * 🔴 POR QUE ISTO SAIU DE DENTRO DO COMPONENTE (10/09/2026)
 *
 * A sequência e o passo de abertura eram calculados soltos no `index.tsx`,
 * e nunca foram conferidos um contra o outro. Simulando as 162 combinações
 * de (tem senha × origem × status × passo gravado), **15 abriam o diálogo
 * num passo FORA da sequência daquela pessoa** — corpo vazio, sem Esc e sem
 * clique-fora, porque o questionário é obrigatório. A pessoa ficava presa.
 *
 * O caso que o Marcio viu: quem escolhe "captação" não tem os passos 3, 4 e
 * 5; qualquer `passo_atual` nessa faixa (ou a retomada que mandava para o 5)
 * abria uma tela em branco.
 *
 * 🔑 A REGRA: o passo de abertura é sempre **um passo que existe na
 * sequência daquela pessoa**. `passoDeAbertura` termina com uma checagem que
 * garante isso — não é otimismo, é a última linha.
 *
 * Funções puras, sem React: dá para simular o fluxo inteiro num script.
 */

export interface EstadoDeAbertura {
  precisaTrocarSenha: boolean;
  status: StatusOnboarding;
  /** `passo_atual` gravado em `gps.onboarding_respostas`. */
  passoAtual: number;
  origem: OrigemCliente1 | null;
  /** Senha temporária sobre questionário já concluído. */
  soSenha: boolean;
}

/**
 * O caminho DESTA pessoa.
 *
 * 🔑 O padrão é o caminho completo, e ele só **encolhe** quando a pessoa
 * responde "vem da captação" — quem vai captar não tem cliente, então os
 * passos sobre o cliente não fazem sentido. Encolher é um alívio; crescer no
 * meio seria promessa quebrada, e a barra existe para ser confiável.
 */
export function sequenciaDePassos(opts: {
  teveSenhaNaAbertura: boolean;
  origem: OrigemCliente1 | null;
  soSenha: boolean;
}): number[] {
  // Senha temporária sobre questionário concluído: a senha e o aviso de que
  // deu certo. Nada de reabrir perguntas que a pessoa já respondeu.
  if (opts.soSenha) return [0, 6];

  const passos: number[] = [];
  if (opts.teveSenhaNaAbertura) passos.push(0);
  passos.push(1, 2);
  if (opts.origem !== "captacao") passos.push(3, 4, 5);
  passos.push(6);
  return passos;
}

/**
 * Por onde o diálogo reabre.
 *
 * 🔴 O retorno é SEMPRE um passo da sequência. A última linha existe para
 * isso: qualquer caminho que produzisse um passo inexistente cai no primeiro
 * passo válido, em vez de abrir uma tela vazia.
 */
export function passoDeAbertura(e: EstadoDeAbertura): number {
  const seq = sequenciaDePassos({
    teveSenhaNaAbertura: e.precisaTrocarSenha,
    origem: e.origem,
    soSenha: e.soSenha,
  });

  const bruto = (() => {
    // Senha temporária vem antes de tudo.
    if (e.precisaTrocarSenha) return 0;

    // 6 é a tela "Pronto", que só existe depois de `concluir()`. Um
    // `passo_atual >= 6` com o questionário EM ABERTO é uma conclusão que
    // falhou: volta ao último passo que ainda tem "Continuar", que depende
    // do caminho (2 para quem vai captar, 5 para quem tem cliente).
    if (e.status !== "concluido" && e.passoAtual >= 6) {
      return e.origem === "captacao" ? 2 : 5;
    }

    return Math.max(1, e.passoAtual);
  })();

  // 🔑 A GARANTIA. Se o passo calculado não existe para esta pessoa (ex.:
  // `passo_atual = 4` gravado antes de ela escolher "captação"), abre no
  // maior passo válido que não o ultrapassa — e, no limite, no primeiro.
  if (seq.includes(bruto)) return bruto;
  const anteriores = seq.filter((p) => p <= bruto);
  return anteriores.length > 0 ? anteriores[anteriores.length - 1] : seq[0];
}
