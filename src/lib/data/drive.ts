import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { UUID_RE } from "@/lib/texto";
import { type EstadoDrive, estadoDoRetorno } from "@/lib/drive-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Integração Google Drive (…347) — LEITURA do estado para a tela.
// Escrita: `src/app/drive/actions.ts` (RPCs que enfileiram).
//
// Lê por `gps.drive_estado` (SECURITY DEFINER, guarda admin OU membro do
// ambiente) com a sessão de quem chama: `gps.drive_tarefas` é só-admin na RLS,
// e o parceiro precisa ver "Criando…" / "Pronta" / o erro. Nada de service_role.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Estado da pasta do parceiro e, com `clienteId`, da pasta do cliente.
 * Falha de leitura devolve `null` (com `logErro`), nunca "nenhuma": a tela
 * esconde os botões de criar em vez de oferecer criar de novo.
 */
export async function getEstadoDrive(
  alunoId: string,
  clienteId?: string | null,
): Promise<EstadoDrive | null> {
  if (!UUID_RE.test(alunoId) || (clienteId && !UUID_RE.test(clienteId))) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("drive_estado", {
    p_aluno_id: alunoId,
    p_cliente_id: clienteId ?? null,
  });
  if (error) {
    logErro("getEstadoDrive", error, { alunoId, clienteId: clienteId ?? null });
    return null;
  }

  return estadoDoRetorno(data, Boolean(clienteId));
}

// ─────────────────────────────────────────────────────────────────────────
// Andamento da criação automática (card "Pastas do Drive" em
// /admin/configuracoes). Fonte: `gps.drive_pendencias()` — só admin (42501
// para os outros). UMA chamada por carregamento; a lista já vem pronta do
// banco, nada de query por linha.
// ─────────────────────────────────────────────────────────────────────────

export interface PlacarDrive {
  feitas: number;
  naFila: number;
  comErro: number;
  faltando: number;
}

export interface PendenciaDrive {
  alunoId: string;
  nome: string;
  estado: string;
  /** Frase do banco/robô (já em português) ou `null`. */
  erro: string | null;
  /** Códigos separados por vírgula, como vêm do banco, ou `null`. */
  aviso: string | null;
  atualizadoEm: string | null;
}

export interface PendenciasDrive {
  placar: PlacarDrive;
  itens: PendenciaDrive[];
}

/** Teto da lista na tela (o contrato da RPC fala em até 200). */
const MAX_PENDENCIAS = 200;

function numero(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Falha (inclusive 42501 ou RPC ainda não aplicada) devolve `null` com
 * `logErro`: o card mostra o aviso e a página continua de pé.
 */
export async function getPendenciasDrive(): Promise<PendenciasDrive | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("drive_pendencias");
  if (error) {
    logErro("getPendenciasDrive", error);
    return null;
  }

  const r = (data ?? {}) as { placar?: Record<string, unknown> | null; itens?: unknown };
  const p = r.placar ?? {};
  const itensBrutos = Array.isArray(r.itens) ? r.itens : [];

  const itens: PendenciaDrive[] = [];
  for (const bruto of itensBrutos) {
    if (itens.length >= MAX_PENDENCIAS) break;
    const i = (bruto ?? {}) as Record<string, unknown>;
    const alunoId = typeof i.aluno_id === "string" && UUID_RE.test(i.aluno_id) ? i.aluno_id : null;
    if (!alunoId) continue;
    itens.push({
      alunoId,
      nome: textoOuNulo(i.nome) ?? "Aluno sem nome",
      estado: typeof i.estado === "string" ? i.estado : "",
      erro: textoOuNulo(i.erro),
      aviso: textoOuNulo(i.aviso),
      atualizadoEm: textoOuNulo(i.atualizado_em),
    });
  }

  return {
    placar: {
      feitas: numero(p.feitas),
      naFila: numero(p.na_fila),
      comErro: numero(p.com_erro),
      faltando: numero(p.faltando),
    },
    itens,
  };
}
