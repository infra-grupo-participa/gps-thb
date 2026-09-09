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

  // --- gps.admin_definir_senha (migração ...118) ---
  'Este aluno ainda não tem login. Use "Criar acesso".':
    'Este aluno ainda não tem login. Use "Criar acesso".',
  "Esta conta é da equipe — a senha não pode ser trocada por aqui.":
    "Esta conta é da equipe — a senha não pode ser trocada por aqui.",

  // --- gps.admin_definir_senha_membro (migração ...132) ---
  "Membro não encontrado.": "Membro não encontrado.",
  "Este membro ainda não tem login.": "Este membro ainda não tem login.",
  "Você não pode trocar a própria senha por aqui — use o seu perfil.":
    "Você não pode trocar a própria senha por aqui — use o seu perfil.",
  "O login deste membro não existe mais.":
    "O login deste membro não existe mais.",

  // --- gps.admin_adicionar_socio (migração ...118) ---
  "Informe o e-mail do sócio.": "Informe o e-mail do sócio.",
  "Este ambiente não tem titular — crie o acesso do titular primeiro.":
    "Este ambiente não tem titular — crie o acesso do titular primeiro.",
  "Esta conta é da equipe — não pode virar sócio de um ambiente.":
    "Esta conta é da equipe — não pode virar sócio de um ambiente.",
  "Este e-mail já pertence a outro ambiente do GPS. Remova o acesso anterior antes.":
    "Este e-mail já pertence a outro ambiente do programa. Remova o acesso anterior antes.",

  // --- gps.admin_excluir_membro (migração ...131) ---
  'Este é o titular do ambiente. Para remover, use "Excluir acesso".':
    'Este é o titular do ambiente. Para remover, use "Excluir acesso".',
  "Você não pode excluir o próprio acesso.":
    "Você não pode excluir o próprio acesso.",
  "Esta conta é da equipe — não pode ser excluída por aqui.":
    "Esta conta é da equipe — não pode ser excluída por aqui.",

  // --- gps.admin_excluir_acesso (migração ...114) ---
  // Não é recusa: o ambiente FOI limpo e só o login sobreviveu. Trocar por uma
  // frase genérica faria o admin repetir a exclusão de um ambiente já vazio.
  "O login não pôde ser apagado: esta conta tem registros em outros sistemas do grupo. O ambiente do GPS foi limpo.":
    "O login não pôde ser apagado: esta conta tem registros em outros sistemas do grupo. O ambiente do programa foi limpo.",
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
 * @param frasesExtras frases de UM domínio, consultadas ANTES do mapa comum.
 *   Existe para `src/app/chamados/actions.ts`, cujas RPCs levantam mensagem
 *   sem acento e específica do chamado ("voce ja tem 5 chamados em aberto") —
 *   copy que não faz sentido no mapa compartilhado. O que ficou aqui é o que
 *   estava duplicado: ler `error.message`, o mapa por SQLSTATE e o `logErro`.
 */
export function traduzirErroBanco(
  escopo: string,
  erro: ErroDeBanco,
  contexto?: ContextoLog,
  frasesExtras?: Record<string, string>,
): string {
  const bruto = (erro.message ?? "").trim();
  const conhecida = frasesExtras?.[bruto] ?? FRASES_DO_BANCO[bruto];

  // Log SEMPRE: mesmo o erro previsto é sinal de fluxo travando na produção, e
  // é a única forma de descobrir que uma frase nova precisa entrar aqui.
  logErro(escopo, erro, { ...contexto, mapeado: Boolean(conhecida) });

  if (conhecida) return conhecida;
  if (bruto.startsWith(PREFIXO_DIREITO)) return bruto;
  return POR_CODIGO[erro.code ?? ""] ?? GENERICA;
}
