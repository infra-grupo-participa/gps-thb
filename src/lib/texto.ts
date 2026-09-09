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
 * Prepara um e-mail para `.ilike()` (busca sem distinção de maiúsculas, que é
 * como `thb_alunos` indexa: `lower(trim(email))`). Escapa `%`, `_` e `\` para
 * o valor virar comparação EXATA, não padrão — achado do pentest de 09/09/2026.
 */
export function emailParaIlike(email: string): string {
  return email.trim().replace(/[\\%_]/g, (m) => "\\" + m);
}
