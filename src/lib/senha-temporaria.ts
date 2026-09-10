import "server-only";

import { randomBytes } from "crypto";

/**
 * A senha temporária que a equipe repassa ao aluno — UM gerador só.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   Havia dois: `gerarSenha()` em `src/app/admin/actions.ts` produzia
 *   `Gps-3f9a2b` e `gerarSenhaTemporaria()` em `src/app/admin/senha-actions.ts`
 *   produzia `Thb-7f3a-2b9c`. A primeira sai por E-MAIL e por WhatsApp para o
 *   aluno, e "GPS" é nome interno (schema, repo) que não aparece para o
 *   usuário desde a decisão de marca de 09/07/2026: a criação de acesso
 *   entregava a marca errada, enquanto a tela ao lado entregava a certa.
 *
 * 🔴 NÃO PODE MORAR EM `actions.ts`. Um módulo `"use server"` só exporta
 *    função async; um `export function` síncrono ali invalida o módulo inteiro
 *    para o cliente (mesma armadilha documentada em `src/lib/acessos-lote.ts`).
 *    Também não pode morar em `acessos-lote.ts`, que é importado por
 *    componente de cliente — `crypto` iria para o bundle do navegador. Por
 *    isso: módulo próprio, `server-only`.
 *
 * FORMATO `Thb-7f3a-2b9c`: 4 bytes de `randomBytes` (32 bits de entropia) em
 * hexadecimal, cortado em dois grupos para ser ditável por telefone. É senha
 * de PRIMEIRO acesso — o portal exige a troca no passo 0 do onboarding.
 * `Math.random()` está proibido aqui de propósito: não é CSPRNG.
 */
export function gerarSenhaTemporaria(): string {
  const b = randomBytes(4).toString("hex");
  return `Thb-${b.slice(0, 4)}-${b.slice(4)}`;
}
