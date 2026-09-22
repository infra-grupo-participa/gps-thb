"use server";

/**
 * Agenda de Sessões — o LINK da sala, pelo lado do ALUNO (FATIA E).
 *
 * PRD: `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md` (§3 fatia D e
 * fatia E · §4 P3).
 *
 * 🔴 ARQUIVO NOVO DE PROPÓSITO — `src/app/sessoes/actions.ts` NÃO é tocado.
 * Duas razões, ambas escritas no PRD §3 fatia E:
 *   1. as fatias E e H não podem disputar o mesmo arquivo (dívida de commit:
 *      arquivo que dois editam não acusa nada no git);
 *   2. módulo com `"use server"` só exporta `async function`, e o arquivo
 *      antigo já carrega o risco de 15 arquivos do repo com `export type` em
 *      módulo de servidor — arquivo novo nasce limpo.
 *
 * 🔴 ESTE MÓDULO SÓ EXPORTA `async function`. Nenhum `export type`,
 * `export interface` ou `export const`: os três passam no `tsc` E no
 * `next build` e quebram em RUNTIME (derrubaram `/admin` em 10/09 e
 * `/admin/videos` em 11/09). O resultado é declarado inline na assinatura.
 *
 * 🔴 A PRECEDÊNCIA É DO BANCO. `gps.sessao_link_definir` (fatia D) decide se
 * o parceiro pode escrever; quando a equipe já definiu, devolve 22023 com a
 * frase própria. A tela AVISA antes do clique (`link_definido_por`), mas a
 * fronteira é a RPC — replicar a regra aqui daria duas verdades que podem
 * divergir no dia em que a RPC mudar.
 */

import { revalidatePath } from "next/cache";

import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { MSG_SESSAO_INDETERMINADA, traduzirErroBanco } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

/**
 * Frases que a RPC do link levanta e que `traduzirErroBanco` descartaria.
 *
 * `traduzirErroBanco` casa a mensagem crua por IGUALDADE em `FRASES_DO_BANCO`
 * e, se não casar, **joga o texto fora** e devolve `POR_CODIGO[code]`. As
 * frases da RPC do link são novas e não estão naquele mapa: sem esta tabela,
 * a recusa por precedência ("A equipe já definiu o link desta sessão") viraria
 * o genérico de 22023 — e o parceiro ficaria sem saber por que não consegue,
 * nem a quem recorrer.
 *
 * ⚠️ `frasesExtras` (4º parâmetro) é o gancho que já existe para isto. Nada em
 * `src/lib/erros.ts` é editado daqui.
 *
 * Função e não `const`: módulo `"use server"` só exporta `async function`, e
 * manter o valor dentro de uma função impede que alguém o exporte por engano.
 */
function frasesDoLink(): Record<string, string> {
  // 🔴 COPIADAS BYTE A BYTE de `20260923000296_gps_sessao_link.sql`. O casamento
  // é por IGUALDADE: um acento, um travessão ou um ponto final a mais faz a
  // frase cair no genérico sem erro nenhum, e ninguém percebe até o parceiro
  // reclamar. Mudou a frase na migration? Muda aqui na mesma rodada.
  const iguais = [
    // Precedência P3 — a mesma frase nas DUAS RPCs (definir e remover).
    "A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.",
    // Forma e conteúdo do link (…296, seção da validação).
    "Cole o link da sala.",
    "O link não pode conter quebra de linha. Cole a URL numa linha só.",
    "O link passa de 500 caracteres.",
    "O link precisa começar com https://",
    // Estado do agendamento.
    "Sessão não encontrada.",
    "Esta sessão não está marcada — não há sala para definir.",
    "Esta sessão não tem link para remover.",
  ];
  return Object.fromEntries(iguais.map((f) => [f, f]));
}

/** Guarda de FORMA (a de segurança é `gps.aluno_atual()` dentro da RPC). */
async function conferirAluno(): Promise<string | null> {
  try {
    const ctx = await getContextoSessao();
    if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
      return "Sem permissão para esta ação.";
    }
    return null;
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return MSG_SESSAO_INDETERMINADA;
  }
}

/**
 * Define (ou troca) o link da sala pelo lado do parceiro.
 *
 * 🔴 `revalidatePath` NÃO repinta sozinho um Client Component que recebeu
 * estado por prop — `MinhaSessao` recebe a sessão do Server Component da
 * página. Quem chama faz `router.refresh()` no sucesso; sem isso o aluno veria
 * "salvo" com o bloco do link inalterado, e a segunda submissão bateria numa
 * precedência que ele mesmo acabou de criar.
 */
export async function definirLinkDaSessao(input: {
  agendamentoId: string;
  link: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const barrado = await conferirAluno();
  if (barrado) return { ok: false, erro: barrado };

  // `trim` só: forma e teto são do banco (a RPC recusa CR/LF e >500, e o
  // CHECK da coluna exige `^https://`). Normalizar mais aqui — forçar
  // prefixo, cortar no limite — inventaria um link que a pessoa não colou.
  const link = input.link.trim();

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("sessao_link_definir", {
      p_agendamento_id: input.agendamentoId,
      p_link: link,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "definirLinkDaSessao",
        error,
        { rpc: "gps.sessao_link_definir", agendamentoId: input.agendamentoId },
        frasesDoLink(),
      ),
    };
  }

  revalidatePath("/sessoes");
  return { ok: true };
}

/** Remove o link que o próprio parceiro colocou. Mesma precedência da RPC. */
export async function removerLinkDaSessao(input: {
  agendamentoId: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const barrado = await conferirAluno();
  if (barrado) return { ok: false, erro: barrado };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("sessao_link_remover", { p_agendamento_id: input.agendamentoId });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "removerLinkDaSessao",
        error,
        { rpc: "gps.sessao_link_remover", agendamentoId: input.agendamentoId },
        frasesDoLink(),
      ),
    };
  }

  revalidatePath("/sessoes");
  return { ok: true };
}
