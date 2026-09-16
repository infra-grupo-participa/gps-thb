"use server";

/**
 * Onboarding na Central — leitura sob demanda (fatia A-3, 16/09/2026).
 *
 * Por que sob demanda (decisão do arquiteto): o painel lista 142 parceiros;
 * carregar o onboarding de todos para alimentar um diálogo que abre em UM
 * seria N+1. `respostasDoOnboarding` busca no CLIQUE — custo por clique: 1
 * RPC, ~0,5 ms medido; custo por abertura do painel: zero.
 *
 * `urlDoAnexoDoQuestionario` foi MOVIDA para cá de
 * `src/app/admin/aluno/[alunoId]/resolver/anexo-actions.ts` (corpo
 * inalterado) — fechava um import cruzado de `components/admin/central`
 * para dentro de `app/admin/aluno/[alunoId]/resolver`. Único consumidor
 * hoje: `src/components/admin/onboarding-respostas/index.tsx` (fatia A-5,
 * 16/09/2026 — o card da lista trocou o link `#onboarding` pelo diálogo).
 *
 * `respostasDoOnboarding` também devolve o FAVORITO do ambiente (fatia A-5):
 * o card só tem `nome`/`fase` do favorito (RPC do painel, sem `id` nem
 * `confirmadoEm`), então o diálogo não tinha como montar o link "Abrir a
 * ficha de…". `getClienteEquipe` é a mesma função que o Resolver já usa para
 * este bloco — 1 consulta extra por CLIQUE, não por card.
 */

import { ehAdmin } from "@/lib/auth";
import { getClienteEquipe, getOnboardingDoAluno, urlDoAnexoOnboarding } from "@/lib/data";
import type {
  ResultadoRespostasOnboarding,
  ResultadoUrlAnexoOnboarding,
} from "@/lib/onboarding-tipos";

export async function respostasDoOnboarding(
  alunoId: string,
): Promise<ResultadoRespostasOnboarding> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const [{ pessoas, erro }, cliente] = await Promise.all([
    getOnboardingDoAluno(alunoId),
    getClienteEquipe(alunoId),
  ]);
  // Falha no banco não pode virar "ninguém identificado" na tela: o diálogo é
  // a única superfície desta informação (fatia A-5, 16/09/2026) e o
  // componente cacheia o resultado — reabrir nem tenta de novo.
  if (erro) return { ok: false, erro };

  const favorito = cliente
    ? {
        id: cliente.id,
        nome: cliente.nome,
        confirmadoEm: cliente.acompanhamento_confirmado_em,
      }
    : null;
  return { ok: true, pessoas, favorito };
}

/**
 * A porta de DOWNLOAD dos anexos do questionário inicial na Central — a única
 * leitura desta rota que precisa acontecer no CLIQUE.
 *
 * Por que existe: `urlDoAnexoOnboarding` mora em `src/lib/data/onboarding.ts`,
 * que roda só no servidor e não é Server Action — a Central é um Client
 * Component e não consegue chamá-la. E a URL **não pode** ser assinada durante
 * o render: ela vive 60 segundos, então nasceria morta em qualquer tela aberta
 * por mais tempo do que isso, e ainda imprimiria um portador (quem tem a URL,
 * baixa) no HTML de cada anexo — inclusive os que ninguém vai abrir.
 * Precedente literal: `src/app/chamados/anexo-actions.ts`.
 *
 * 🔴 Isto NÃO é a fronteira. Quem decide é a policy
 * `gps_onboarding_anexo_select` em `storage.objects`, avaliada com a SESSÃO de
 * quem chama — nunca `service_role`. O `ehAdmin()` daqui só estreita: esta
 * porta é da Central, que é tela de admin.
 *
 * 🔴 A URL sai SEMPRE com `download=` (quem monta é `urlDoAnexoOnboarding`). O
 * MIME de um objeto de storage é o que o cliente declarou no PUT: servir inline
 * é o que transforma um "PNG" em HTML executando no domínio do portal.
 */
export async function urlDoAnexoDoQuestionario(
  path: string,
  nome: string,
): Promise<ResultadoUrlAnexoOnboarding> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const url = await urlDoAnexoOnboarding(path, nome);
  if (!url) {
    // Uma frase só para todos os casos (não existe, foi removido, a policy
    // recusou): distinguir aqui transformaria a tela num oráculo sobre arquivo
    // alheio. O motivo real fica no `logErro` do servidor.
    return {
      ok: false,
      erro: "Não foi possível abrir este anexo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url };
}
