import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import type { LinkDrive, OrigemLinkDrive } from "@/lib/links-drive-tipos";

// ─────────────────────────────────────────────────────────────────────────
// Links do Drive da ficha do cliente (`gps.cliente_links_drive`). Leitura só;
// a escrita é `src/app/clientes/link-drive-actions.ts` (RPCs).
//
// A GUARDA É A RLS (admin ou membro do ambiente), com a sessão de quem chama
// — mesma decisão de `getCroquisDoCliente`. Nada de `service_role`.
//
// `COLUNAS_LINK` lista tudo que o mapeamento abaixo lê: `select` explícito não
// falha quando falta coluna, o campo chega `undefined` em silêncio.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS_LINK = "id, nome, url, origem, criado_em, criado_por_nome";

interface LinhaLinkDrive {
  id: string;
  nome: string;
  url: string;
  origem: OrigemLinkDrive;
  criado_em: string;
  criado_por_nome: string | null;
}

/**
 * Links ativos (`removido_em is null`) de UM cliente, do mais antigo ao mais
 * novo. `podeRemover` espelha a regra da RPC `cliente_link_drive_remover`:
 * a equipe remove qualquer um; o parceiro, só os que o parceiro colocou.
 *
 * Falha de leitura devolve `null` (com `logErro`), nunca `[]`: a seção mostra
 * "Não deu para carregar os links" em vez de "Nenhum link ainda", para o
 * parceiro não colar de novo o que já está lá (pentest 02/10).
 */
export async function getLinksDriveDoCliente(
  clienteId: string,
  souEquipe: boolean,
): Promise<LinkDrive[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("cliente_links_drive")
    .select(COLUNAS_LINK)
    .eq("cliente_id", clienteId)
    .is("removido_em", null)
    .order("criado_em", { ascending: true });

  if (error) {
    logErro("getLinksDriveDoCliente", error, { clienteId });
    // null ≠ []: falha de leitura nunca vira "nenhum link" (pentest 02/10).
    return null;
  }
  return ((data ?? []) as LinhaLinkDrive[]).map((l) => ({
    id: l.id,
    nome: l.nome,
    url: l.url,
    criadoEm: l.criado_em,
    criadoPorNome: l.criado_por_nome ?? "",
    origem: l.origem,
    podeRemover: souEquipe || l.origem === "parceiro",
  }));
}
