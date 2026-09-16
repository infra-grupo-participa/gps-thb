/**
 * Onboarding — leitura sob demanda pela Central (fatia A-3, 16/09/2026).
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *   `src/app/admin/onboarding-actions.ts` leva `"use server"`, e um módulo com
 *   essa diretiva SÓ pode exportar `async function` — `export type`/`export
 *   const`/`export interface` passam no `tsc` e no `next build`, e quebram em
 *   RUNTIME (já derrubou `/admin` e `/admin/videos` em 10 e 11/09/2026). Os
 *   tipos moram aqui, importados por `import type` dos dois lados (a action e
 *   a UI do frontend). Precedente literal: `tutoriais-tipos.ts`,
 *   `entrevista-tipos.ts`.
 */

import type { OnboardingDaPessoa } from "@/lib/types";

/**
 * O favorito (estrela) do ambiente, no formato que o diálogo de respostas
 * precisa para montar o link "Abrir a ficha de…" — `id` + `confirmadoEm`.
 *
 * 🔑 Fatia A-5 (16/09/2026): o card da lista (`AlunoGps.favorito`) só tem
 * `nome`/`fase` (vem da RPC `gps.admin_painel_alunos`, sem `id` nem
 * `confirmadoEm` — não dá pra montar o link nem a frase de confirmação a
 * partir dele). Buscar aqui, junto de `respostasDoOnboarding`, é 1 consulta
 * a mais por CLIQUE (não por card): `getClienteEquipe` já é a função que o
 * Resolver usa para o mesmo bloco.
 */
export type FavoritoDoOnboarding = {
  id: string;
  nome: string;
  confirmadoEm: string | null;
} | null;

/** Retorno de `respostasDoOnboarding` — o bloco de onboarding do diálogo da Central. */
export type ResultadoRespostasOnboarding =
  | { ok: true; pessoas: OnboardingDaPessoa[]; favorito: FavoritoDoOnboarding }
  | { ok: false; erro: string };

/** Retorno de `urlDoAnexoDoQuestionario` — mesma URL assinada de sempre, com `download=`. */
export type ResultadoUrlAnexoOnboarding =
  | { ok: true; url: string }
  | { ok: false; erro: string };
