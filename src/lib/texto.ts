/**
 * Comparação de texto tolerante para busca no cliente.
 *
 * Mesma tolerância de `buscarAlunos` (`src/app/admin/actions.ts`), que roda no
 * banco: quebra o termo em palavras e exige que todas apareçam, em qualquer
 * ordem, ignorando acento e caixa. Aqui é sobre um array já carregado — nenhuma
 * ida nova ao banco.
 */

/** Minúsculas sem acento: "João" → "joao". */
export function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * `true` quando TODAS as palavras de `termo` aparecem em `alvo` (ordem
 * irrelevante). Termo vazio (ou só espaço) casa com tudo.
 */
export function casaTodosOsTermos(alvo: string, termo: string): boolean {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  const base = semAcento(alvo);
  return palavras.every((p) => base.includes(p));
}

/**
 * Formato de e-mail — a ÚNICA regex de e-mail do projeto (CD14, 09/09/2026).
 *
 * Até 09/09 havia três: `plantao.ts` (`[^\s@]+@[^\s@]+\.[^\s@]+`), e mais uma
 * cópia em cada uma das duas actions de chamados. A das actions era a estrita,
 * e não por acaso: é ela que filtra DESTINATÁRIO de e-mail
 * (`chamados_email_equipe`, `EMAIL_SUPORTE`), e `<`, `>`, `"` e `'` num
 * endereço são o vetor de injeção de cabeçalho. Unificar na frouxa alargaria
 * essa superfície, então a estrita é que virou a única — o Plantão, que também
 * manda e-mail para o endereço digitado (mentora, aluno), passa a ter a mesma
 * guarda.
 *
 * Não é RFC 5322 de propósito: o objetivo é barrar erro de digitação e
 * caractere de cabeçalho, não recusar sintaxe exótica válida.
 */
const RE_EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

/** `true` quando o texto tem cara de e-mail e não carrega caractere de cabeçalho. */
export function emailValido(email: string): boolean {
  return RE_EMAIL.test((email ?? "").trim());
}

/**
 * Quebra uma lista ("a@x.com, b@y.com") em endereços válidos, com teto.
 * Vale para o valor do banco e para a env var: CR/LF e vírgula são o vetor de
 * injeção de cabeçalho, e `emailValido` não deixa passar nenhum dos dois.
 */
export function listaDeEmails(bruto: string, maximo = 10): string[] {
  return (bruto ?? "")
    .split(/[;,\s]+/)
    .map((e) => e.trim())
    .filter((e) => emailValido(e))
    .slice(0, maximo);
}

/**
 * Prepara um e-mail para `.ilike()` (busca sem distinção de maiúsculas, que é
 * como `thb_alunos` indexa: `lower(trim(email))`). Escapa `%`, `_` e `\` para
 * o valor virar comparação EXATA, não padrão — achado do pentest de 09/09/2026.
 */
export function emailParaIlike(email: string): string {
  return email.trim().replace(/[\\%_]/g, (m) => "\\" + m);
}

/**
 * O e-mail como a pessoa REALMENTE mandou — pronto para comparar.
 *
 * 🔴 POR QUE ISTO EXISTE (10/09/2026). A equipe manda login e senha por
 * WhatsApp, e o que volta colado traz sujeira invisível: espaço no fim,
 * espaço não separável (U+00A0, que o WhatsApp insere), marcas de direção de
 * texto e BOM. Some a isso o teclado do celular, que capitaliza a primeira
 * letra por padrão.
 *
 * Caso real: o Helton recebeu as credenciais, digitou tudo certo e ouviu
 * "e-mail ou senha inválidos" — a senha estava CORRETA, provada direto no
 * GoTrue. O GoTrue casa o e-mail em minúsculas; qualquer um desses ruídos
 * derruba a comparação sem dar pista nenhuma do motivo.
 *
 * 🔑 UM LUGAR SÓ. Toda porta por onde um ALUNO digita e-mail passa por aqui:
 * login, resgate, esqueci a senha, cadastro.
 */
export function normalizarEmail(bruto: string): string {
  return bruto
    .replace(/[ ​-‍⁠﻿‪-‮]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * A senha como a pessoa mandou. Tira SÓ os invisíveis de formatação.
 *
 * ⚠️ NÃO faz `trim()` nem `toLowerCase()`: espaço e maiúscula podem fazer
 * parte da senha de propósito. O que sai daqui é só o que ninguém digita por
 * vontade — os mesmos caracteres que o WhatsApp cola junto.
 */
export function normalizarSenhaColada(bruto: string): string {
  return bruto.replace(/[ ​-‍⁠﻿‪-‮]/g, "");
}
