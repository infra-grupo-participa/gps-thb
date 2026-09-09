/**
 * Tradução de erro de banco para frase de tela — um lugar só.
 *
 * POR QUE EXISTE (CD6, 09/09/2026)
 *   As actions de cliente e de admin devolviam `{ erro: error.message }`, e a
 *   UI jogava isso num toast. O aluno lia
 *   `new row for relation "etapa1_clientes" violates check constraint
 *   "etapa1_clientes_contrato_url_check"`: frase que não ajuda quem está
 *   preenchendo a ficha e entrega nome de tabela, de coluna e de constraint a
 *   quem estiver testando o portal (SG2 do relatório do arquiteto).
 *
 *   O padrão certo já existia em `src/app/chamados/actions.ts` (`traduzirErro`
 *   + `logErro`): frase em português para a tela, detalhe cru para o log. Este
 *   módulo é esse padrão promovido a helper, para as duas actions não
 *   manterem duas tabelas de frases.
 *
 * 🔒 O detalhe NUNCA volta ao navegador. Ele vai para `logErro`, que redige
 *    e-mail e sequências longas de dígitos antes de emitir a linha JSON.
 *
 * ⚠️ NÃO é o lugar de mensagem de regra de negócio nova. Regra de negócio
 *    nasce no código que a conhece (validação da action) ou como `raise` na
 *    função do banco — e, nesse caso, entra em `FRASES_DO_BANCO` abaixo.
 */

import { logErro, type ContextoLog } from "@/lib/log";

/** Shape comum de `PostgrestError` e do erro de `rpc()`. */
export interface ErroDeBanco {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Mensagens que as próprias funções `gps.*` levantam (`raise exception ...
 * using errcode`). São texto NOSSO, escrito em português para a equipe — não
 * detalhe interno do Postgres. Passam adiante (algumas reescritas: "GPS" não
 * aparece para o usuário desde 07/2026).
 *
 * Mapa explícito, e não "deixa passar tudo que veio com errcode custom":
 * `42501` também é o código do `permission denied for table gps.membros` do
 * próprio Postgres, que não pode chegar à tela.
 */
const FRASES_DO_BANCO: Record<string, string> = {
  "Sem permissão.": "Sem permissão para esta ação.",
  "A senha precisa ter ao menos 8 caracteres.":
    "A senha precisa ter ao menos 8 caracteres.",
  "Aluno não encontrado.": "Aluno não encontrado.",
  "Este aluno não tem e-mail no cadastro.":
    "Este aluno não tem e-mail no cadastro.",
  'Não existe login com este e-mail. Use "Criar acesso".':
    'Não existe login com este e-mail. Use "Criar acesso".',
  "Esta conta é da equipe — não pode virar acesso de aluno.":
    "Esta conta é da equipe — não pode virar acesso de aluno.",
  "Este login já pertence a outro ambiente do GPS.":
    "Este login já pertence a outro ambiente do programa.",
};

/**
 * `raise exception 'Sem direito ao acesso: %', motivo` — o motivo vem de
 * `gps.admin_direito_ao_acesso` e é a única informação acionável da recusa.
 * Só aparece em tela de admin.
 */
const PREFIXO_DIREITO = "Sem direito ao acesso:";

/** Códigos SQLSTATE que a UI sabe explicar sem citar tabela nem constraint. */
const POR_CODIGO: Record<string, string> = {
  // unique_violation
  "23505": "Já existe um registro com esses dados.",
  // check_violation — algum campo não passou na regra da coluna
  "23514": "Algum campo está fora do formato aceito. Revise e tente de novo.",
  // insufficient_privilege (RLS, grant, guarda de admin)
  "42501": "Sem permissão para esta ação.",
  // invalid_parameter_value — as funções `gps.*` usam para argumento inválido
  "22023": "Algum dado enviado está fora do formato aceito.",
  // no_data_found — as funções `gps.*` usam para "não achei o registro"
  P0002: "Registro não encontrado.",
};

const GENERICA = "Não foi possível concluir agora. Tente de novo em instantes.";

/**
 * Frase em português para a tela; o erro cru vai para o log com `contexto`.
 *
 * @param escopo identificador da operação no log (ex.: `"atualizarCliente"`).
 */
export function traduzirErroBanco(
  escopo: string,
  erro: ErroDeBanco,
  contexto?: ContextoLog,
): string {
  const bruto = (erro.message ?? "").trim();
  const conhecida = FRASES_DO_BANCO[bruto];

  // Log SEMPRE: mesmo o erro previsto é sinal de fluxo travando na produção, e
  // é a única forma de descobrir que uma frase nova precisa entrar aqui.
  logErro(escopo, erro, { ...contexto, mapeado: Boolean(conhecida) });

  if (conhecida) return conhecida;
  if (bruto.startsWith(PREFIXO_DIREITO)) return bruto;
  return POR_CODIGO[erro.code ?? ""] ?? GENERICA;
}
