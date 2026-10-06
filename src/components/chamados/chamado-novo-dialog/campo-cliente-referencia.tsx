"use client";

/**
 * "É sobre algum cliente seu?" — liga o chamado a UM cliente, opcionalmente.
 * Padrão: "Nenhum cliente". A escolha reaproveita o `SeletorCliente` (busca,
 * até 110 clientes), com os favoritos primeiro e a estrela.
 *
 * Compartilhado com `cliente-do-chamado.tsx` (trocar o cliente depois).
 */

import { useId, useMemo, useState } from "react";
import {
  ordenarClientesDoChamado,
  type OpcaoClienteChamado,
} from "@/lib/chamados-tipos";
import { SeletorCliente } from "@/components/chamados/seletor-cliente";

export function CampoClienteReferencia({
  id,
  rotulo,
  clientes,
  valor,
  onChange,
  desabilitado,
}: {
  id: string;
  /** Texto do grupo. */
  rotulo: string;
  clientes: OpcaoClienteChamado[];
  valor: OpcaoClienteChamado | null;
  onChange: (c: OpcaoClienteChamado | null) => void;
  desabilitado?: boolean;
}) {
  const nome = useId();
  const [escolhendo, setEscolhendo] = useState(valor !== null);
  const ordenados = useMemo(() => ordenarClientesDoChamado(clientes), [clientes]);

  const classeRadio =
    "flex min-h-11 cursor-pointer items-center gap-2 text-base has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";

  return (
    <fieldset className="grid gap-2" disabled={desabilitado}>
      <legend className="mb-1 text-base font-medium">{rotulo}</legend>

      <label className={classeRadio}>
        <input
          type="radio"
          name={nome}
          checked={!escolhendo}
          onChange={() => {
            setEscolhendo(false);
            onChange(null);
          }}
          className="size-5 accent-[var(--color-marca-acao)]"
        />
        Nenhum cliente
      </label>

      {clientes.length > 0 ? (
        <>
          <label className={classeRadio}>
            <input
              type="radio"
              name={nome}
              checked={escolhendo}
              onChange={() => setEscolhendo(true)}
              className="size-5 accent-[var(--color-marca-acao)]"
            />
            Um dos meus clientes
          </label>
          {escolhendo ? (
            <SeletorCliente
              id={`${id}-busca`}
              clientes={ordenados}
              valor={valor}
              onEscolher={(c) =>
                onChange(ordenados.find((o) => o.id === c.id) ?? c as OpcaoClienteChamado)
              }
              desabilitado={desabilitado}
              placeholder="Digite o nome do cliente…"
            />
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
