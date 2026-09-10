/**
 * Regras de senha do portal — UM lugar só.
 *
 * O mínimo vale para os 5 caminhos que criam ou trocam senha (cadastro,
 * redefinir por e-mail, trocar em /perfil, passo 0 do onboarding e as RPCs
 * do admin, que validam `length(trim(p_senha)) >= 8` no banco). Antes o
 * número vivia em 5 cópias e o servidor do /cadastro ainda aceitava 6 —
 * achado do Fable no war-room de 10/09.
 *
 * Sem `crypto` aqui de propósito: o arquivo é importado por Client
 * Components; o gerador de senha temporária (só servidor) mora em
 * `src/lib/senha-temporaria.ts`.
 */
export const SENHA_MINIMO = 8;

export const MSG_SENHA_MINIMO = `A senha precisa ter ao menos ${SENHA_MINIMO} caracteres.`;
