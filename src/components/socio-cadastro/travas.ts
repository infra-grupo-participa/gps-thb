import { documentoValido, soDigitos } from "@/lib/masks";
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
export function razaoParaTravar(entrada: SocioCadastroPayload): string {
  if (entrada.nome.trim().length < 2) {
    return "Escreva o seu nome completo.";
  }
  if (!documentoValido(entrada.documento)) {
    return "Informe um CPF válido.";
  }
  if (soDigitos(entrada.telefone).length < 10) {
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
