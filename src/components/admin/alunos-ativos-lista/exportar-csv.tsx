"use client";

import { useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { montarCsv, nomeDoArquivo, type ColunaCsv } from "@/lib/csv";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { FASES_CLIENTE } from "@/lib/etapa1";
import type { AlunoGps } from "@/lib/data";

/**
 * Exporta a lista de parceiros **como ela está na tela** — com os filtros, a
 * busca e a ordenação aplicados.
 *
 * Pedido do Marcio (14/09/2026): *"a gente pode exportar como xlsx"*.
 *
 * 🔑 POR QUE CSV E NÃO XLSX: uma lib de planilha no navegador pesa 400–900 KB
 * e entraria no bundle de `/admin`, a rota mais usada do sistema, para
 * atender um clique raro. O CSV desta pasta abre no Excel com duplo clique —
 * BOM, `;` e aspas resolvidos em `src/lib/csv.ts` — e custa **zero KB**.
 *
 * 🔑 EXPORTA O QUE ESTÁ FILTRADO, não a base. Quem clicou em "Ver os parados"
 * e exporta espera os parados; baixar 150 linhas quando a tela mostra 19
 * seria surpresa ruim. O nome do arquivo carrega a contagem, então dá para
 * conferir sem abrir.
 *
 * ⚠️ O arquivo tem NOME, E-MAIL e TELEFONE de pessoas reais. É dado do
 * programa, não público: quem exporta assume a guarda. Não acrescentar
 * documento (CPF) aqui sem decisão explícita — o card não o mostra, e
 * planilha circula.
 */

const COLUNAS: ColunaCsv<AlunoGps>[] = [
  { cabecalho: "Nome", valor: (a) => a.aluno?.nome },
  { cabecalho: "E-mail", valor: (a) => a.aluno?.email },
  { cabecalho: "Telefone", valor: (a) => a.aluno?.telefone },
  {
    cabecalho: "Papel",
    // `qtdMembros > 1` = ambiente compartilhado. O nome do sócio vai na
    // coluna seguinte, então aqui basta dizer se divide ou não.
    valor: (a) => (a.qtdMembros > 1 ? "Titular (com sócio)" : "Titular"),
  },
  { cabecalho: "Sócio", valor: (a) => a.socioNome ?? "" },
  { cabecalho: "Turma", valor: (a) => a.aluno?.turma_id ?? "" },
  {
    cabecalho: "Entrou em",
    valor: (a) => (a.desde ? formatarData(a.desde) : ""),
  },
  {
    cabecalho: "Último acesso",
    // "Nunca" e não vazio: a célula em branco seria lida como dado faltando,
    // quando na verdade é a informação mais importante da linha.
    valor: (a) => (a.ultimoAcesso ? formatarDataHora(a.ultimoAcesso) : "Nunca"),
  },
  { cabecalho: "Tem login", valor: (a) => (a.temLogin ? "Sim" : "Não") },
  { cabecalho: "Clientes cadastrados", valor: (a) => a.clientesPreenchidos },
  { cabecalho: "Clientes com ficha completa", valor: (a) => a.clientesComDados },
  { cabecalho: "Em fechamento", valor: (a) => a.emFechamento },
  { cabecalho: "Contratados", valor: (a) => a.contratados },
  { cabecalho: "Progresso Etapa 01 (%)", valor: (a) => a.pct },
  { cabecalho: "Cliente acompanhado", valor: (a) => a.favorito?.nome ?? "" },
  {
    cabecalho: "Fase do acompanhado",
    valor: (a) =>
      a.favorito
        ? (FASES_CLIENTE.find((f) => f.id === a.favorito!.fase)?.rotulo ??
          a.favorito.fase)
        : "",
  },
];

export function ExportarCsv({
  alunos,
  contextoDoFiltro,
}: {
  /** A lista JÁ filtrada e ordenada — o que a tela mostra. */
  alunos: AlunoGps[];
  /** Vira parte do nome do arquivo. Ex.: "parados". */
  contextoDoFiltro?: string;
}) {
  const [baixando, setBaixando] = useState(false);

  if (alunos.length === 0) return null;

  function exportar() {
    setBaixando(true);
    try {
      const csv = montarCsv(alunos, COLUNAS);
      // `text/csv` + BOM: o Excel reconhece a codificação pelo BOM, e o
      // `charset` no MIME não adianta para arquivo baixado.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoArquivo(
        `parceiros${contextoDoFiltro ? `-${contextoDoFiltro}` : ""}-${alunos.length}`,
      );
      document.body.appendChild(a);
      a.click();
      // `revokeObjectURL` no próximo tick: revogar antes do clique processar
      // cancela o download em alguns navegadores.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={exportar}
      disabled={baixando}
      title={`Baixar ${alunos.length} ${alunos.length === 1 ? "parceiro" : "parceiros"} em planilha (abre no Excel)`}
    >
      <Download aria-hidden className="size-4" />
      Exportar {alunos.length}
    </Button>
  );
}
