import "server-only";

/**
 * Plantão de Dúvidas — Acelera Holding. Carga de compradores ativos.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Lê `data/plantao/acelera-ativos.json` (PII real — e-mail/CPF/telefone —,
 * por isso a pasta é `.gitignore`d: o repositório é PÚBLICO). Upsert
 * idempotente por e-mail, chamado pelo admin em `carregarLoteAcelera`
 * (`src/app/admin/plantao/actions.ts`):
 * - e-mail novo → insert, `ativo = true`, `lote = '2026-08'`;
 * - e-mail já existe → atualiza nome/documento/telefone SÓ SE vierem
 *   preenchidos no CSV (nunca sobrescreve dado já preenchido com vazio) e
 *   marca `ativo = true`;
 * - sumiu do arquivo → NÃO desativa (decisão do Marcio: ausência no CSV não
 *   é cancelamento; só `Cancelou? = SIM`, fora do escopo desta carga, desativa).
 *
 * NUNCA toca `plantao_acessos` nem `plantao_inscricoes`: quem já definiu
 * senha continua entrando exatamente como antes da re-carga.
 */

import { readFile } from "fs/promises";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { normalizarEmail } from "@/lib/plantao";

const CAMINHO_JSON = path.join(process.cwd(), "data", "plantao", "acelera-ativos.json");
const LOTE_ATUAL = "2026-08";

interface RegistroAcelera {
  email: string;
  nome: string;
  documento: string;
  telefone: string;
  data: string; // dd/mm/aaaa — não usado na carga (só metadado do CSV de origem)
  transacao: string;
}

export interface ResultadoCarga {
  inseridos: number;
  atualizados: number;
  inalterados: number;
  semEmail: number;
}

/** Lê e normaliza os registros do JSON de origem. Nunca reparseia CSV. */
async function lerRegistros(): Promise<RegistroAcelera[]> {
  const bruto = await readFile(CAMINHO_JSON, "utf-8");
  const registros = JSON.parse(bruto) as RegistroAcelera[];
  return registros;
}

/**
 * Executa a carga. Idempotente: rodar de novo com o mesmo arquivo produz o
 * mesmo estado final (inseridos vira 0, atualizados só muda se algo mudou).
 *
 * Nota de sustentabilidade (PROTOCOLO-SUSTENTABILIDADE): o `for` abaixo faz
 * 1 SELECT + até 1 UPSERT por registro (até ~840 idas ao banco nesta carga).
 * Isso normalmente seria N+1; aqui é aceitável porque (1) roda por clique
 * manual do admin, não em request de usuário nem em loop automático de alta
 * frequência (mensal, no máximo); (2) o lote tem centenas de linhas, não
 * dezenas de milhar — 10x mais linha (4.210) ainda é ~4.200 idas, segundos,
 * não minutos; (3) cada query filtra por `email` (índice único) e não varre
 * a tabela. Se o lote crescer para milhares recorrentes, trocar por um
 * `upsert` em lote (`on conflict (email) do update`) com os 421 registros
 * de uma vez, mantendo a regra de nunca sobrescrever campo preenchido.
 */
export async function carregarAcelera(): Promise<ResultadoCarga> {
  const registros = await lerRegistros();
  const supabase = await createClient();

  const resultado: ResultadoCarga = {
    inseridos: 0,
    atualizados: 0,
    inalterados: 0,
    semEmail: 0,
  };

  for (const registro of registros) {
    const email = normalizarEmail(registro.email || "");
    if (!email) {
      resultado.semEmail++;
      continue;
    }

    const nome = registro.nome?.trim() || "";
    const documento = registro.documento?.trim() || null;
    const telefone = registro.telefone?.trim() || null;

    const { data: existente } = await supabase
      .schema("gps")
      .from("plantao_alunos")
      .select("id, nome, documento, telefone, ativo")
      .eq("email", email)
      .maybeSingle();

    if (!existente) {
      const { error } = await supabase.schema("gps").from("plantao_alunos").insert({
        email,
        nome,
        documento,
        telefone,
        origem: "acelera_csv",
        lote: LOTE_ATUAL,
        ativo: true,
      });
      if (!error) resultado.inseridos++;
      continue;
    }

    // Nunca sobrescreve preenchido com vazio: só troca quando o CSV traz
    // valor E o valor atual está vazio/diferente.
    const precisaAtualizar =
      !existente.ativo ||
      (nome && nome !== existente.nome) ||
      (documento && documento !== existente.documento) ||
      (telefone && telefone !== existente.telefone);

    if (!precisaAtualizar) {
      resultado.inalterados++;
      continue;
    }

    const patch: Record<string, unknown> = { ativo: true };
    if (nome) patch.nome = nome;
    if (documento) patch.documento = documento;
    if (telefone) patch.telefone = telefone;

    const { error } = await supabase
      .schema("gps")
      .from("plantao_alunos")
      .update(patch)
      .eq("id", existente.id);

    if (!error) resultado.atualizados++;
  }

  return resultado;
}
