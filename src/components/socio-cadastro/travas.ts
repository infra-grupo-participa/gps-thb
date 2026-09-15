import { documentoValido, semDdi55, soDigitos } from "@/lib/masks";
import type { SocioCadastroPayload } from "@/lib/socio-cadastro-tipos";

/**
 * Por que o "Salvar e entrar" está travado — em texto, e em texto que a
 * pessoa lê. Molde: `src/components/onboarding/travas.ts`.
 *
 * 🔴 A regra do projeto é: **nunca deixar clicar e falhar**. O botão desabilita
 * e a razão aparece ao lado, escrita. Por isso esta função devolve a FRASE, e
 * não um booleano. `""` significa "pode seguir".
 *
 * 🔑 Sem React e sem JSX: dá para testar isolado.
 *
 * ⚠️ **Não é a fronteira.** A garantia de verdade é a RPC
 * `gps.socio_cadastro_gravar` (allowlist + validação no banco). Isto aqui é
 * conveniência para a pessoa.
 */
/**
 * ⚠️ ESTE ARQUIVO E A RPC TÊM DE CONCORDAR. As regras aqui espelham
 * `gps.socio_cadastro_gravar` (migração …256); os `maxLength` do formulário
 * espelham os mesmos tetos (nome/cidade/bairro 120, logradouro 200, número
 * 20, país 60). Quando os dois discordam, o front deixa passar e o banco
 * recusa — e a pessoa só descobre DEPOIS de enviar o formulário inteiro.
 * Foi o que acontecia com o telefone: aqui `>= 10`, lá `in (10, 11)`.
 */
export function razaoParaTravar(entrada: SocioCadastroPayload): string {
  if (entrada.nome.trim().length < 2) {
    return "Escreva o seu nome completo.";
  }
  if (!documentoValido(entrada.documento)) {
    return "Informe um CPF válido.";
  }
  // `semDdi55` antes de contar: se a pessoa colar o número já em formato
  // internacional (+55 91 99615-0394), os 13 dígitos precisam virar 11 — é
  // o mesmo que a RPC faz no banco. Sem isso, front e banco discordam: aqui
  // passava (`>= 10`) e lá recusava (`in (10, 11)`), e o erro só apareceria
  // depois de enviar, como "Telefone inválido" num número correto.
  const telefoneDigitos = semDdi55(entrada.telefone).length;
  if (telefoneDigitos !== 10 && telefoneDigitos !== 11) {
    return "Informe o seu telefone com DDD.";
  }
  if (soDigitos(entrada.cep).length !== 8) {
    return "Informe o CEP.";
  }
  if (entrada.cidade.trim().length < 2) {
    return "Informe a cidade.";
  }
  if (entrada.estado.trim().length !== 2) {
    return "Escolha o estado (UF).";
  }
  if (entrada.bairro.trim().length < 2) {
    return "Informe o bairro.";
  }
  if (entrada.logradouro.trim().length < 2) {
    return "Informe o endereço.";
  }
  if (entrada.numero.trim().length < 1) {
    return "Informe o número.";
  }
  if (entrada.pais.trim().length < 2) {
    return "Informe o país.";
  }
  return "";
}
