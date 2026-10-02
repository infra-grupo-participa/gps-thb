"use server";

/**
 * Central de ajuda — Server Action da EQUIPE (Onda 5, 02/10/2026).
 *
 * 🔴 `ehAdmin()` aqui é UX. A fronteira é `gps.admin_ajuda_salvar`
 * (SECURITY DEFINER, `gp_is_admin()` ou 42501) — Server Action é endpoint
 * HTTP. A validação local (`problemaNoArtigo`) repete a do banco só para a
 * frase chegar boa sem ida ao banco.
 *
 * Arquivar = `ativo: false`. Não existe excluir artigo (nunca apagar).
 *
 * ⚠️ Módulo `"use server"`: só exporta `async function`.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { SEM_PERMISSAO, traduzirErroBanco } from "@/lib/erros";
import {
  problemaNoArtigo,
  rotaDeAjuda,
  type EntradaArtigoAjuda,
  type ResultadoSalvarArtigo,
} from "@/lib/ajuda-tipos";

/** Frases literais dos `raise exception` de `gps.admin_ajuda_salvar` (…342). */
const FRASES_ADMIN_AJUDA: Record<string, string> = {
  "O título precisa ter de 3 a 120 caracteres.": "O título precisa ter de 3 a 120 caracteres.",
  "O texto precisa ter de 10 a 4000 caracteres.": "O texto precisa ter de 10 a 4000 caracteres.",
  "Palavras-chave e sinônimos aceitam até 1000 caracteres cada.":
    "Palavras-chave e sinônimos aceitam até 1000 caracteres cada.",
  "Rota inválida: use o caminho da tela, como /clientes.":
    "Rota inválida: use o caminho da tela, como /clientes.",
  "No máximo 20 rotas por artigo.": "No máximo 20 rotas por artigo.",
  "Categoria inválida.": "Categoria inválida.",
  "Artigo não encontrado.": "Artigo não encontrado. Atualize a lista e tente de novo.",
};

/** Cria (`id` ausente) ou edita um artigo. Devolve o id gravado. */
export async function salvarArtigoAjuda(
  entrada: EntradaArtigoAjuda,
): Promise<ResultadoSalvarArtigo> {
  if (!(await ehAdmin())) return { ok: false, erro: SEM_PERMISSAO };
  if (!entrada || !Array.isArray(entrada.rotas) || !Array.isArray(entrada.categorias)) {
    return { ok: false, erro: "Preencha o artigo antes de salvar." };
  }

  const problema = problemaNoArtigo(entrada);
  if (problema) return { ok: false, erro: problema };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("admin_ajuda_salvar", {
    p_id: entrada.id ?? null,
    p_titulo: entrada.titulo,
    p_corpo: entrada.corpo,
    p_rotas: entrada.rotas.map((r) => rotaDeAjuda(r) as string),
    p_categorias: entrada.categorias,
    p_palavras_chave: entrada.palavrasChave ?? null,
    p_sinonimos: entrada.sinonimos ?? null,
    p_ativo: entrada.ativo === true,
    p_ordem: entrada.ordem,
  });
  if (error || typeof data !== "string") {
    return {
      ok: false,
      erro: error
        ? traduzirErroBanco("admin/salvarArtigoAjuda", error, undefined, FRASES_ADMIN_AJUDA)
        : "Não foi possível concluir agora. Tente de novo em instantes.",
    };
  }

  revalidatePath("/admin/ajuda");
  return { ok: true, id: data };
}
