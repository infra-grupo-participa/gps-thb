"use server";

/**
 * Lista consolidada de clientes do programa — Server Actions do ADMIN
 * (item 3 dos 9, 14/09/2026). Ver
 * docs/audits/2026-09-14-esteira/01-listas-clicaveis.md.
 *
 * 🔴 Módulo `"use server"` só exporta `async function` — SEM EXCEÇÃO (ver
 * CLAUDE.md, "`"use server"` só exporta função async — o defeito que já
 * pegou 3 vezes"). `export const`/`export type`/`export interface` passam
 * pelo `tsc` e pelo `next build` e QUEBRAM em runtime (o Turbopack emite o
 * chunk do servidor com zero exports). Os tipos moram em
 * `src/lib/data/clientes-admin.ts` e `src/lib/csv-clientes.ts`, importados
 * por `import type`.
 *
 * `ehAdmin()` aqui não é a fronteira — a fronteira é `gp_is_admin()` dentro
 * de `gps.admin_clientes_lista`/`gps.admin_registrar_export_clientes`
 * (42501 sem sessão de admin). A checagem aqui só evita uma viagem ao banco
 * à toa e devolve erro cedo.
 */

import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import { montarCsv, nomeDoArquivo } from "@/lib/csv";
import { COLUNAS_CSV_CLIENTES } from "@/lib/csv-clientes";
import { getClientesDoPrograma } from "@/lib/data/clientes-admin";
import type { FaseCliente, GrauRelacao } from "@/lib/types";
import type { FiltroReuniao } from "@/components/admin/clientes-programa/estado-na-url";

/** O TETO do universo do filtro numa única chamada — serve o CSV inteiro. */
const LIMITE_EXPORT_CSV = 5000;

/**
 * Exporta a lista consolidada de clientes **do universo do FILTRO**, não da
 * página aberta na tela (`p_limite = 5000` na RPC, não os 100 da paginação).
 *
 * 🔴 GRAVA TRILHA em `gps.acessos_log` (quem, quantas linhas, qual filtro) —
 * decisão de LGPD do Marcio. SE O LOG FALHAR, O EXPORT FALHA: é o OPOSTO do
 * padrão das triggers de captura deste repo (que engolem falha de log para
 * nunca travar o aluno) — aqui a trilha É a guarda, não um detalhe. Por
 * isso o `insert` do log acontece ANTES de devolver o CSV, e o erro dele
 * vira o erro da função inteira.
 *
 * 🔴 CORRIGIDO EM 17/09/2026: faltava repassar `reuniao` — escrita antes do
 * filtro existir (`…274`). Sem isso, exportar com "vencida" ativo devolvia
 * o universo inteiro (1.636), não as 39 vencidas: o CSV mentia sem erro.
 * Corrigido nas duas pontas: a consulta (abaixo) e a trilha (RPC `…282`,
 * `p_reuniao`), senão a auditoria registraria um filtro que não foi o
 * exportado de fato.
 */
export async function exportarClientesCsv(filtros?: {
  fase?: FaseCliente | null;
  grau?: GrauRelacao | "_nulo" | null;
  busca?: string | null;
  reuniao?: FiltroReuniao;
}): Promise<{ csv?: string; linhas?: number; erro?: string }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };

  const { linhas, erro } = await getClientesDoPrograma({
    limite: LIMITE_EXPORT_CSV,
    offset: 0,
    fase: filtros?.fase ?? null,
    grau: filtros?.grau ?? null,
    busca: filtros?.busca ?? null,
    reuniao: filtros?.reuniao ?? null,
  });

  if (erro) return { erro };

  const supabase = await createClient();
  const { error: erroLog } = await supabase
    .schema("gps")
    .rpc("admin_registrar_export_clientes", {
      p_linhas: linhas.length,
      p_fase: filtros?.fase ?? null,
      p_grau: filtros?.grau ?? null,
      p_busca: filtros?.busca ?? null,
      p_reuniao: filtros?.reuniao ?? null,
    });

  if (erroLog) {
    // 🔴 Aqui, ao contrário de toda outra escrita do portal, a falha do log
    // NÃO é engolida: a trilha é a guarda de LGPD do export, não um detalhe
    // — decisão do Marcio. O export falha junto.
    return {
      erro: traduzirErroBanco("exportarClientesCsv/log", erroLog, {
        rpc: "gps.admin_registrar_export_clientes",
        linhas: linhas.length,
      }),
    };
  }

  const csv = montarCsv(linhas, COLUNAS_CSV_CLIENTES);
  return { csv, linhas: linhas.length };
}

/**
 * Nome do arquivo, com a contagem — dá para conferir sem abrir (mesmo
 * padrão do export de parceiros).
 */
export async function nomeArquivoClientesCsv(linhas: number): Promise<string> {
  return nomeDoArquivo(`clientes-programa-${linhas}`);
}
