/**
 * Busca, filtro por fase e ordenação da lista de clientes — sem React, sem
 * JSX, testáveis. Saíram do `useMemo` do `ClientesManager` no corte da Onda 3
 * (CD5): mesmo código, mesma ordem, mesmo desempate.
 *
 * 🔑 Tudo roda em memória sobre os ≤ 30 clientes já carregados: nenhuma ida
 * nova ao banco para contar, somar ou filtrar. E a meta de faturamento NÃO
 * passa por aqui — ela usa a lista inteira, porque filtrar por fase não pode
 * mudar o faturamento do ambiente.
 */

import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { FASES_CLIENTE } from "@/lib/etapa1";
import type { Ordenacao } from "./tipos";

/** Quantos clientes há em cada fase, na ordem oficial de `FASES_CLIENTE`. */
export function contarPorFase(clientes: ClienteEtapa1[]) {
  return FASES_CLIENTE.map((f) => ({
    ...f,
    qtd: clientes.filter((c) => c.fase === f.id).length,
  }));
}

/** Nome ou telefone contendo o termo. Busca vazia devolve o array recebido. */
export function filtrarPorBusca(
  clientes: ClienteEtapa1[],
  busca: string,
): ClienteEtapa1[] {
  const q = busca.trim().toLowerCase();
  if (!q) return clientes;
  return clientes.filter(
    (c) =>
      (c.nome ?? "").toLowerCase().includes(q) ||
      (c.telefone ?? "").toLowerCase().includes(q),
  );
}

/**
 * Filtra por fase e ordena. "recentes" é a ordem em que a lista chegou do
 * servidor — não reordena. Cópia antes do `sort`: o array de entrada é o
 * estado do componente e `sort` muta no lugar.
 */
export function ordenarClientes(
  buscaFiltrada: ClienteEtapa1[],
  filtro: "todos" | FaseCliente,
  ordenacao: Ordenacao,
): ClienteEtapa1[] {
    const arr = buscaFiltrada.filter(
      (c) => filtro === "todos" || c.fase === filtro,
    );
    const copia = [...arr];
    switch (ordenacao) {
      case "nome":
        copia.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        break;
      case "perda":
        copia.sort((a, b) => (b.perda_inercia ?? 0) - (a.perda_inercia ?? 0));
        break;
      case "reuniao":
        copia.sort((a, b) =>
          (a.data_reuniao_preliminar ?? "9999").localeCompare(
            b.data_reuniao_preliminar ?? "9999",
          ),
        );
        break;
    }
    return copia;
}
