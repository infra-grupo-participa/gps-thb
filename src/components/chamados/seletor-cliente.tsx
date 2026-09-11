"use client";

/**
 * Seletor de cliente COM BUSCA — para "Troca de cliente" no formulário de
 * chamado.
 *
 * 🔴 Por que não é um `<Select>` (Base UI) comum: um ambiente pode ter até
 * **110 clientes** (média 16). Rolar uma lista de 110 nomes sem filtro é o
 * defeito que esta busca existe para não repetir (briefing 11/09/2026,
 * correção #3 ao plano do arquiteto).
 *
 * Filtro no CLIENTE: a lista inteira do ambiente já veio no payload da página
 * (`getClientesEtapa1`, ≤ 110 linhas — nada perto do teto de egress que
 * preocupa em tabela larga). Uma consulta nova por tecla digitada seria pior,
 * não melhor.
 *
 * Mesmo padrão de acessibilidade de `diario-mencoes.tsx`: `role="listbox"` +
 * `role="option"`, seta para navegar, Enter para escolher, Escape fecha.
 */

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { casaTodosOsTermos } from "@/lib/texto";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface OpcaoCliente {
  id: string;
  nome: string;
}

const MAX_SUGESTOES = 8;

export function SeletorCliente({
  id,
  clientes,
  excluirId,
  valor,
  onEscolher,
  desabilitado,
  invalido,
  placeholder = "Digite para buscar um cliente…",
}: {
  id: string;
  clientes: OpcaoCliente[];
  /** O cliente ATUAL não pode virar o próprio "novo" — some da lista. */
  excluirId?: string | null;
  valor: OpcaoCliente | null;
  onEscolher: (c: OpcaoCliente) => void;
  desabilitado?: boolean;
  invalido?: boolean;
  placeholder?: string;
}) {
  const uid = useId();
  const idLista = `${id}-lista`;
  const idOpcao = (i: number) => `${uid}-op-${i}`;

  const [aberto, setAberto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);

  const disponiveis = useMemo(
    () => clientes.filter((c) => c.id !== excluirId),
    [clientes, excluirId],
  );

  const sugestoes = useMemo(
    () =>
      disponiveis
        .filter((c) => casaTodosOsTermos(c.nome, consulta))
        .slice(0, MAX_SUGESTOES),
    [disponiveis, consulta],
  );

  function escolher(c: OpcaoCliente) {
    onEscolher(c);
    setConsulta("");
    setAberto(false);
    setIndice(0);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || sugestoes.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => (i + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => (i - 1 + sugestoes.length) % sugestoes.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(sugestoes[indice] ?? sugestoes[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
    }
  }

  return (
    <div className="relative grid gap-1.5">
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={aberto ? idOpcao(indice) : undefined}
          aria-invalid={invalido || undefined}
          value={aberto ? consulta : (valor?.nome ?? "")}
          onFocus={() => {
            setConsulta("");
            setAberto(true);
            setIndice(0);
          }}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAberto(true);
            setIndice(0);
          }}
          onKeyDown={aoTeclar}
          onBlur={() => {
            // Sem escolha confirmada, o campo volta a mostrar o valor
            // atual — texto digitado e não escolhido nunca vira "novo
            // cliente" (decisão do Marcio: nada de texto livre aqui).
            window.setTimeout(() => setAberto(false), 100);
          }}
          disabled={desabilitado}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-8"
        />
        <ChevronsUpDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {aberto
          ? `${sugestoes.length} ${sugestoes.length === 1 ? "cliente encontrado" : "clientes encontrados"}.`
          : ""}
      </p>

      {aberto ? (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Clientes deste ambiente"
          className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-borda-forte bg-card py-1 shadow-(--shadow-raised)"
        >
          {sugestoes.length === 0 ? (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">
              {disponiveis.length === 0
                ? "Nenhum outro cliente neste ambiente."
                : "Nenhum cliente encontrado com este nome."}
            </li>
          ) : (
            sugestoes.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  id={idOpcao(i)}
                  role="option"
                  aria-selected={c.id === valor?.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(c)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition",
                    i === indice
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0",
                      c.id === valor?.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 truncate">{c.nome}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
