import { MSG_SENHA_MINIMO, SENHA_MINIMO } from "@/lib/senha-regras";

/**
 * Por que o "Continuar" está travado — em texto, e em texto que a pessoa lê.
 *
 * 🔴 A regra do projeto é: **nunca deixar clicar e falhar**. O botão desabilita
 * e a razão aparece ao lado, escrita. Por isso esta função devolve a FRASE, e
 * não um booleano: quem chama não tem como esquecer de explicar, porque a
 * explicação é o próprio valor de retorno. `""` significa "pode seguir".
 *
 * 🔑 Sem React e sem JSX: a regra de quando o onboarding trava é a coisa mais
 * fácil de quebrar sem ninguém perceber, e aqui ela dá para testar.
 *
 * ⚠️ **Não é a fronteira.** A obrigatoriedade de honorários + contrato em
 * "execução em andamento" é garantida por `gps.onboarding_concluir()`, que é
 * atômica. Isto aqui é conveniência para a pessoa; a garantia é do banco.
 */
export function razaoParaTravar(entrada: {
  passo: number;
  senha: string;
  senha2: string;
  /** A resposta do passo 2 — `null` enquanto ninguém escolheu. */
  origem: string | null;
  /** A resposta do passo 3 — `null` enquanto ninguém escolheu. */
  fase: string | null;
  nome: string;
  telefone: string;
  grau: string;
  pais: string;
  /** A resposta da pergunta do passo 4 — `null` enquanto ninguém escolheu. */
  pactuados: boolean | null;
  valorHonorarios: number | null;
}): string {
  const { passo } = entrada;
  if (passo === 0) {
    if (entrada.senha.length < SENHA_MINIMO) {
      return MSG_SENHA_MINIMO;
    }
    if (entrada.senha !== entrada.senha2) {
      return "As duas senhas precisam ser iguais.";
    }
    return "";
  }
  // 🔴 Passos 2 e 3: a escolha é OBRIGATÓRIA e o servidor recusa sem ela
  // (`origem_cliente1`/`fase_cliente1` na allowlist da RPC, mais o CHECK da
  // coluna). Sem estas duas linhas o "Continuar" ficava clicável e devolvia o
  // erro do banco — exatamente o "clicar e falhar" que este arquivo existe
  // para não ter. As frases são as mesmas que o servidor devolveria.
  if (passo === 2 && !entrada.origem) {
    return "Escolha de onde virá o seu cliente 1.";
  }
  if (passo === 3 && !entrada.fase) {
    return "Informe em que fase você está com este cliente.";
  }
  if (passo === 3 && entrada.nome.trim().length < 2) {
    return "Escreva o nome do cliente para continuar.";
  }
  // 🔴 Nome, WhatsApp, país e grau viraram OBRIGATÓRIOS em 10/09/2026
  // (decisão do Marcio: "o cadastro do cliente tem que aceitar nome e
  // telefone", e "Não informar agora" saiu do dropdown de relação). As
  // frases são as mesmas que `gps.onboarding_concluir()` devolveria.
  if (passo === 3 && entrada.telefone.trim().length < 8) {
    return "Informe o número de WhatsApp deste cliente.";
  }
  if (passo === 3 && !entrada.pais) {
    return "Escolha o país deste cliente.";
  }
  if (passo === 3 && !entrada.grau) {
    return "Escolha o seu grau de relação com este cliente.";
  }
  // Passo 4: a pergunta é obrigatória; o valor só quando a resposta é "sim".
  if (passo === 4) {
    if (entrada.pactuados == null) {
      return "Responda se os honorários já estão pactuados.";
    }
    if (entrada.pactuados && entrada.valorHonorarios == null) {
      return "Informe o valor dos honorários pactuados.";
    }
  }
  return "";
}
