"use server";

/**
 * Plantão de Dúvidas — Server Actions do ADMIN sobre os INSCRITOS de um
 * slot: marcar/desmarcar presença, corrigir nome, cancelar e inscrever
 * direto pelo painel (09/09/2026).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Diferente das actions de `slots-actions.ts` (que fazem a leitura/escrita
 * direta nas tabelas via RLS), estas quatro chamam RPC `security definer`
 * (migrations `…180` a `…183`): a lista de inscritos tem sua PRÓPRIA regra
 * de negócio (trava "1 inscrição ativa", reativação por `on conflict`,
 * interruptor `gps.plantao_admin_edicao_liberada()`) que já mora no banco
 * para a rota pública equivalente — reimplementar em TypeScript duplicaria
 * essa regra em dois lugares.
 *
 * Toda ação abre com `ehAdmin()` — não-admin sai antes de qualquer viagem ao
 * banco (a proteção real é `public.gp_is_admin()` dentro da RPC).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { emailValido } from "@/lib/texto";
import { traduzirErroBanco } from "@/lib/erros";
import type { ResultadoAcao } from "@/lib/plantao-tipos";

/** Frases das 4 RPCs desta rodada — consultadas antes do mapa comum. */
const FRASES_INSCRITOS: Record<string, string> = {
  "A edição do painel está temporariamente indisponível.":
    "A edição do painel está temporariamente indisponível.",
  "Inscrição não encontrada, ou já cancelada.":
    "Inscrição não encontrada, ou já cancelada.",
  "Inscrição não encontrada.": "Inscrição não encontrada.",
  "O nome pode ter no máximo 120 caracteres.":
    "O nome pode ter no máximo 120 caracteres.",
  "O motivo pode ter no máximo 300 caracteres.":
    "O motivo pode ter no máximo 300 caracteres.",
  "Esta inscrição já estava cancelada, ou não existe.":
    "Esta inscrição já estava cancelada, ou não existe.",
  "Informe um e-mail válido.": "Informe um e-mail válido.",
  'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.':
    'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.',
  "Plantão não encontrado.": "Plantão não encontrado.",
};

/**
 * Marca ou desmarca presença de UM inscrito.
 *
 * Sem trava de horário (BLOQUEIO 2c da spec): permitido antes, durante ou
 * depois do início do plantão. `presenca_origem` fica `'equipe'` quando
 * marca por aqui (a RPC não pisa numa presença já gravada pelo portal).
 */
export async function marcarPresencaInscrito(
  inscricaoId: string,
  presente: boolean,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("admin_plantao_marcar_presenca", {
    p_inscricao_id: inscricaoId,
    p_presente: presente,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "admin/marcarPresencaInscrito",
        error,
        { inscricaoId, presente },
        FRASES_INSCRITOS,
      ),
    };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Corrige o nome exibido de UMA inscrição (`nome_informado`).
 *
 * NÃO toca `plantao_alunos.nome` — o cadastro é compartilhado por todas as
 * inscrições da pessoa (ver o comentário da RPC, migration `…181`).
 */
export async function editarNomeInscricao(
  inscricaoId: string,
  nome: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("admin_plantao_editar_nome_inscricao", {
    p_inscricao_id: inscricaoId,
    p_nome: nome,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "admin/editarNomeInscricao",
        error,
        { inscricaoId },
        FRASES_INSCRITOS,
      ),
    };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Cancela a inscrição de alguém pelo painel, SEM a trava de 1h do
 * cancelamento do próprio aluno (`gps.plantao_cancelar`) — é o caminho da
 * equipe, válido mesmo depois de o aluno não poder mais cancelar sozinho
 * (BLOQUEIO 2 da spec). Não manda e-mail: `cancelarSlot` (já existente em
 * `slots-actions.ts`) é quem cancela o SLOT inteiro e avisa todo mundo.
 */
export async function cancelarInscricaoPeloAdmin(
  inscricaoId: string,
  motivo?: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("admin_plantao_cancelar_inscricao", {
    p_inscricao_id: inscricaoId,
    p_motivo: motivo?.trim() || null,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "admin/cancelarInscricaoPeloAdmin",
        error,
        { inscricaoId },
        FRASES_INSCRITOS,
      ),
    };
  }

  revalidatePath("/admin/plantao");
  return { ok: true };
}

/**
 * Inscreve alguém direto num slot pelo painel — sem rate limit, sem exigir
 * slot publicado ou futuro (BLOQUEIO 2c). O e-mail precisa estar em
 * `gps.plantao_alunos` ativo e não bloqueado; sem isso a RPC devolve um erro
 * ESPECÍFICO orientando "Liberar aluno" (`liberarAlunoPlantao`, em
 * `alunos-actions.ts`).
 *
 * `slotConflitanteId` vem preenchido quando a pessoa já tem outra inscrição
 * ativa — a RPC devolve isso no jsonb (não lança exceção) para a tela poder
 * oferecer, por exemplo, um link para o slot conflitante.
 */
export async function inscreverAlunoNoSlot(
  slotId: string,
  email: string,
  nome?: string,
): Promise<ResultadoAcao & { reativada?: boolean; slotConflitanteId?: string }> {
  if (!(await ehAdmin())) return { ok: false, erro: "Sem permissão." };

  const emailLimpo = email.trim();
  if (!emailValido(emailLimpo)) return { ok: false, erro: "Informe um e-mail válido." };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_plantao_inscrever", {
    p_slot_id: slotId,
    p_email: emailLimpo,
    p_nome: nome?.trim() || null,
  });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "admin/inscreverAlunoNoSlot",
        error,
        { slotId, email: emailLimpo },
        FRASES_INSCRITOS,
      ),
    };
  }

  // A RPC devolve `{ ok: false, motivo, slot_conflitante_id }` em jsonb
  // (não lança exceção) para o conflito de "1 inscrição ativa" — a tela
  // decide a copy, sem passar pelo mapa de tradução de erro de banco.
  const linha = data as
    | { ok: boolean; motivo?: string; slot_conflitante_id?: string; reativada?: boolean }
    | null;

  if (!linha?.ok) {
    return {
      ok: false,
      erro: linha?.motivo || "Não foi possível inscrever.",
      slotConflitanteId: linha?.slot_conflitante_id,
    };
  }

  revalidatePath("/admin/plantao");
  return { ok: true, reativada: Boolean(linha.reativada) };
}
