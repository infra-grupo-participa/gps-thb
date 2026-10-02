/**
 * Cadastro de clientes em lote (Onda 1.2, 02/10/2026) — contrato e validação.
 *
 * Espelha `gps.cadastrar_clientes_lote` (migração
 * `20261002000335_gps_chamado_aviso_e_clientes_lote.sql`): teto de 50 linhas,
 * nome obrigatório (aparado, até 200), telefone opcional só com dígitos (até
 * 15). O BANCO é a fronteira — esta validação existe para o motivo chegar em
 * português, por linha, e para não gastar ida ao banco com lixo. Mudou lá,
 * muda aqui.
 *
 * Sem `"use server"` (módulo de tipos/funções puras, importável dos dois
 * lados). O arquivo de actions importa daqui e nunca reexporta.
 */
import { soDigitos } from "@/lib/masks";

export const CLIENTES_LOTE_MAXIMO = 50;
export const CLIENTE_NOME_MAXIMO = 200;
/** E.164: até 15 dígitos com o DDI. Mais que isso não é telefone. */
export const TELEFONE_DIGITOS_MAXIMO = 15;

export interface LinhaLoteEntrada {
  nome: string;
  telefone?: string;
}

export interface IgnoradoLote {
  /** Posição na lista ENVIADA à action, 1 = primeira. */
  linha: number;
  motivo: string;
}

export interface ResultadoLoteClientes {
  ok: boolean;
  inseridos: number;
  ignorados: IgnoradoLote[];
  erro?: string;
}

export interface LinhaLoteValida {
  /** Posição original (1-based) na lista recebida. */
  linha: number;
  nome: string;
  /** Só dígitos; `null` = não informado. */
  telefone: string | null;
}

export type PreparoLote =
  | { ok: false; erro: string }
  | { ok: true; validas: LinhaLoteValida[]; ignorados: IgnoradoLote[] };

export const MOTIVO_LOTE = {
  linhaInvalida: "Linha em formato inválido.",
  semNome: "Falta o nome.",
  nomeLongo: `Nome longo demais (máximo ${CLIENTE_NOME_MAXIMO} caracteres).`,
  nomeInvalido: "O nome tem caractere inválido.",
  telefoneLongo: `Telefone com dígitos demais (máximo ${TELEFONE_DIGITOS_MAXIMO}).`,
} as const;

/**
 * Motivo CRU devolvido pela RPC → frase de tela. A RPC só deveria recusar o
 * que esta validação já recusou; se recusar, a frase sai certa mesmo assim.
 */
export const MOTIVO_DO_BANCO: Record<string, string> = {
  "nome vazio": MOTIVO_LOTE.semNome,
  "nome com mais de 200 caracteres": MOTIVO_LOTE.nomeLongo,
  "nome com caractere invalido": MOTIVO_LOTE.nomeInvalido,
  "telefone com mais de 15 digitos": MOTIVO_LOTE.telefoneLongo,
};

// Caractere de controle (C0 e DEL). `trim()` já tira tab/quebra das pontas;
// no meio do nome, controle é lixo colado de planilha.
const CONTROLE = /[\u0000-\u001f\u007f]/;

/**
 * Valida e normaliza o lote. Recusa a CHAMADA inteira só por forma (não é
 * lista, vazia, mais de 50); linha ruim vira `ignorados` com motivo, e o
 * resto segue.
 */
export function prepararLoteClientes(linhas: unknown): PreparoLote {
  if (!Array.isArray(linhas)) return { ok: false, erro: "Lista inválida." };
  if (linhas.length === 0) return { ok: false, erro: "A lista está vazia." };
  if (linhas.length > CLIENTES_LOTE_MAXIMO) {
    return {
      ok: false,
      erro: `No máximo ${CLIENTES_LOTE_MAXIMO} clientes por vez. Envie o restante em outra leva.`,
    };
  }

  const validas: LinhaLoteValida[] = [];
  const ignorados: IgnoradoLote[] = [];

  linhas.forEach((bruta, i) => {
    const linha = i + 1;
    if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) {
      ignorados.push({ linha, motivo: MOTIVO_LOTE.linhaInvalida });
      return;
    }
    const { nome: nomeBruto, telefone: telBruto } = bruta as Record<string, unknown>;

    const nome = typeof nomeBruto === "string" ? nomeBruto.trim() : "";
    if (!nome) {
      ignorados.push({ linha, motivo: MOTIVO_LOTE.semNome });
      return;
    }
    if (nome.length > CLIENTE_NOME_MAXIMO) {
      ignorados.push({ linha, motivo: MOTIVO_LOTE.nomeLongo });
      return;
    }
    if (CONTROLE.test(nome)) {
      ignorados.push({ linha, motivo: MOTIVO_LOTE.nomeInvalido });
      return;
    }

    const digitos =
      typeof telBruto === "string" || typeof telBruto === "number"
        ? soDigitos(String(telBruto))
        : "";
    if (digitos.length > TELEFONE_DIGITOS_MAXIMO) {
      ignorados.push({ linha, motivo: MOTIVO_LOTE.telefoneLongo });
      return;
    }

    validas.push({ linha, nome, telefone: digitos || null });
  });

  return { ok: true, validas, ignorados };
}
