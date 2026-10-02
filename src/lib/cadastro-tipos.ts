/**
 * Contrato de `cadastrar` (src/app/cadastro/actions.ts). Mora aqui porque
 * módulo com "use server" só pode exportar `async function` — `export
 * interface` lá passa no tsc e no build e pode quebrar em runtime.
 */
export interface CadastroState {
  erro?: string;
  sucesso?: boolean;
  precisaConfirmar?: boolean;
}
