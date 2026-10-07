"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { provisionarPastaParceiro } from "@/app/drive/actions";
import type { AlunoSemPasta } from "@/lib/data/drive";
import { casaTodosOsTermos } from "@/lib/texto";

/**
 * "Alunos sem pasta" em /admin/pastas (decisão do João, 07/10/2026): os
 * antigos não são criados em massa — cada um ganha a pasta por clique.
 *
 * A lista chega pronta por prop (a página faz UMA chamada a
 * `gps.drive_pendencias`); a busca é em memória. "Criar pasta" chama a action
 * direto, sem diálogo: criar pasta não apaga nada, o clique é a decisão.
 *
 * Depois do sucesso a linha guarda o estado LOCAL ("Na fila…") e não pede
 * `router.refresh()` de propósito: a RPC tiraria o aluno de `sem_pasta` e a
 * confirmação sumiria junto com a linha. O placar acima só se atualiza ao
 * recarregar a página.
 */

const TETO = 300;

type EstadoLinha = { tipo: "enviando" } | { tipo: "ok" } | { tipo: "erro"; erro: string };

export function AlunosSemPasta({ alunos }: { alunos: AlunoSemPasta[] }) {
  const [busca, setBusca] = useState("");
  const [estados, setEstados] = useState<Record<string, EstadoLinha>>({});

  const visiveis = useMemo(
    () => alunos.filter((a) => casaTodosOsTermos(a.nome, busca)),
    [alunos, busca],
  );

  async function criar(alunoId: string) {
    if (estados[alunoId]?.tipo === "enviando" || estados[alunoId]?.tipo === "ok") return;
    setEstados((e) => ({ ...e, [alunoId]: { tipo: "enviando" } }));
    let proximo: EstadoLinha;
    try {
      const res = await provisionarPastaParceiro(alunoId);
      proximo = res.ok ? { tipo: "ok" } : { tipo: "erro", erro: res.erro };
    } catch {
      proximo = { tipo: "erro", erro: "Não deu para pedir a pasta agora. Tente de novo." };
    }
    setEstados((e) => ({ ...e, [alunoId]: proximo }));
  }

  if (alunos.length === 0) {
    return <p className="text-base text-muted-foreground">Todos os alunos já têm pasta.</p>;
  }

  return (
    <div className="rounded-lg border">
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo nome"
            aria-label="Buscar aluno sem pasta pelo nome"
            className="h-11 pl-8 text-base"
          />
        </div>
        <p className="text-base text-muted-foreground" aria-live="polite">
          {busca.trim()
            ? `${visiveis.length} de ${alunos.length}`
            : `${alunos.length} ${alunos.length === 1 ? "aluno" : "alunos"}`}
          {alunos.length >= TETO ? ` (mostrando os ${TETO} primeiros por nome)` : ""}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <p className="px-4 py-3 text-base text-muted-foreground">Ninguém com esse nome.</p>
      ) : (
        <ul className="divide-y">
          {visiveis.map((a) => {
            const estado = estados[a.alunoId];
            return (
              <li
                key={a.alunoId}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground">{a.nome}</p>
                  {!a.emailGoogle ? (
                    <p className="text-base text-muted-foreground">
                      E-mail não é Google — a pasta será criada sem compartilhar.
                    </p>
                  ) : null}
                  <div role="status" aria-live="polite" className="empty:hidden">
                    {estado?.tipo === "ok" ? (
                      <p className="text-base font-medium text-foreground">
                        Na fila — pronta em alguns minutos. O link vai sozinho para a ficha.
                      </p>
                    ) : null}
                    {estado?.tipo === "erro" ? (
                      <p className="text-base font-medium text-risco-foreground">{estado.erro}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <Link
                    href={`/admin/aluno/${a.alunoId}/pasta`}
                    className="text-base font-medium text-accent-foreground underline-offset-4 hover:underline"
                  >
                    Abrir ficha
                  </Link>
                  {estado?.tipo === "ok" ? null : (
                    <Button
                      type="button"
                      size="lg"
                      className="min-h-11 text-base"
                      disabled={estado?.tipo === "enviando"}
                      aria-busy={estado?.tipo === "enviando"}
                      onClick={() => criar(a.alunoId)}
                    >
                      {estado?.tipo === "enviando" ? (
                        <Loader2 aria-hidden className="animate-spin" />
                      ) : null}
                      Criar pasta
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
