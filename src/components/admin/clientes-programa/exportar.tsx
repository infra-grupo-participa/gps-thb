"use client";

/**
 * Exporta a lista consolidada de clientes **do universo do FILTRO**, não da
 * página aberta (decisão do Marcio: "o CSV leva o universo do filtro, não a
 * página"). O botão diz "Exportar 1.223" (o `total` da RPC), nunca 100.
 *
 * Chama a Server Action (`exportarClientesCsv`, já pronta e testada — não
 * mexer nela) que devolve a STRING do CSV; aqui só vira `Blob` e baixa, no
 * mesmo molde de `alunos-ativos-lista/exportar-csv.tsx`.
 *
 * 🔑 A action GRAVA TRILHA em `gps.acessos_log` e falha se o log falhar
 * (LGPD) — por isso o botão mostra erro explícito, não falha silenciosa.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportarClientesCsv } from "@/app/admin/clientes/actions";
import type { EstadoClientesUrl } from "./estado-na-url";

export function ExportarClientesCsv({
  estado,
  total,
}: {
  estado: EstadoClientesUrl;
  /** Universo do filtro (`total_linhas` da RPC) — o que o botão promete. */
  total: number;
}) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (total === 0) return null;

  async function exportar() {
    setBaixando(true);
    setErro(null);
    try {
      const resultado = await exportarClientesCsv({
        fase: estado.fase,
        grau: estado.grau,
        busca: estado.busca || null,
        // 🔴 Corrigido em 17/09/2026: faltava repassar o filtro de reunião —
        // exportar com "vencida" ativo devolvia o universo inteiro (1.636),
        // não as 39 vencidas. Ver `actions.ts` (`exportarClientesCsv`).
        reuniao: estado.reuniao,
      });

      if (resultado.erro || !resultado.csv) {
        setErro(resultado.erro ?? "Não foi possível gerar o arquivo agora.");
        return;
      }

      // `text/csv` + BOM: o Excel reconhece a codificação pelo BOM.
      const blob = new Blob([resultado.csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes-programa-${resultado.linhas ?? total}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    } catch {
      // `fetch`/Server Action pode rejeitar por erro de rede — tratamento
      // visível, nunca tela que falha em silêncio.
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={exportar}
        disabled={baixando}
        title={`Baixar os ${total} clientes deste filtro em planilha (abre no Excel)`}
      >
        {baixando ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Download aria-hidden className="size-4" />
        )}
        Exportar {total}
      </Button>
      {erro ? (
        <p role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
