import { ChevronDown, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatarData, formatarDataSoDia } from "@/lib/datas";
import { brl, brlOuTraco } from "@/lib/moeda";
import type { LinhaExtrato } from "@/lib/financeiro";

/**
 * "Pagamentos" — o extrato do programa, colapsado por padrão.
 *
 * Vem depois do card do contrato de propósito: quem abre a aba quer o
 * **estado** ("estou em dia?"), não a lista. A lista é a prova, consultada
 * quando o estado surpreende. `<details>` nativo resolve isso sem uma linha
 * de JS no cliente — abre e fecha por teclado, é anunciado como grupo
 * expansível e sobrevive a página sem hidratação.
 *
 * 🔑 Rótulos traduzidos aqui e em lugar nenhum mais. `categoria` e
 * `metodo_pagamento` são vocabulário do sip/Hotmart (`compra_cheia`,
 * `HOTMART_INSTALLMENTS`) — jogar isso na tela do aluno é vazar nome de
 * coluna. Chave desconhecida cai no texto CRU em minúsculas: inventar um
 * rótulo bonito para um método novo esconderia que ele apareceu.
 *
 * ⚠️ **Três colunas, sempre.** O produto (quando o aluno tem mais de um
 * contrato) entra como sub-linha da coluna "Pagamento", não como coluna
 * própria: medido em 360 px, a quarta coluna empurrava o VALOR para fora do
 * quadro — o extrato abria com a única coluna que interessa cortada, atrás de
 * rolagem horizontal que ninguém procura.
 *
 * ⚠️ Sem soma no rodapé. O extrato pode vir truncado (teto de 200 linhas na
 * RPC) e uma soma parcial apresentada como total seria um número plausível e
 * errado — exatamente o defeito que a aba inteira evita. O total pago
 * confiável é o `pago` do card do contrato, que vem da regra do sip.
 */

const CATEGORIAS: Record<string, string> = {
  sinal: "Sinal",
  mensalidade: "Parcela",
  saldo: "Saldo",
  compra_cheia: "Pagamento integral",
};

const METODOS: Record<string, string> = {
  CREDIT_CARD: "Cartão",
  HOTMART_INSTALLMENTS: "Parcelado Hotmart",
  PIX: "Pix",
  BILLET: "Boleto",
  BILLET_HOTMART: "Boleto Hotmart",
  BOLETO: "Boleto",
  TRANSFER: "Transferência",
  CASH: "Dinheiro",
};

function categoriaLegivel(
  categoria: string | null,
  parcela: number | null,
): string {
  if (!categoria) return "Pagamento";
  const base = CATEGORIAS[categoria];
  if (!base) return categoria.toLowerCase().replace(/_/g, " ");
  // "Parcela 3" só quando o número existe: "Parcela null" e "Parcela 0" são
  // pior do que "Parcela" sozinha.
  if (categoria === "mensalidade" && parcela !== null && parcela > 0) {
    return `${base} ${parcela}`;
  }
  return base;
}

function metodoLegivel(metodo: string | null): string | null {
  if (!metodo) return null;
  return METODOS[metodo.toUpperCase()] ?? metodo.toLowerCase().replace(/_/g, " ");
}

/**
 * `pago_em` chega ora como `date` ("2026-08-21"), ora como `timestamptz`.
 * Data-only vai por recorte de string (`new Date` a leria como meia-noite UTC
 * e voltaria um dia em São Paulo); com hora, vai pelo formatador com fuso.
 */
function dataDoPagamento(iso: string | null): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return formatarDataSoDia(iso);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? formatarDataSoDia(iso) : formatarData(iso);
}

export function Extrato({
  linhas,
  truncado,
  /** `contato_hm_id` → nome do produto. Só vira coluna com 2+ contratos. */
  produtoPorContrato,
}: {
  linhas: LinhaExtrato[];
  /** Bateu o teto de 200 linhas da RPC — a lista não é o histórico inteiro. */
  truncado: boolean;
  produtoPorContrato: Record<string, string>;
}) {
  if (linhas.length === 0) return null;
  const mostrarProduto = Object.keys(produtoPorContrato).length > 1;

  return (
    <Card>
      <CardContent>
        <details className="group">
          <summary className="-m-1 flex cursor-pointer list-none items-center gap-2 rounded-md p-1 font-medium marker:content-none hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Receipt aria-hidden className="size-4 text-primary" />
            <span className="flex-1">
              Pagamentos{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                ({linhas.length})
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Pagamentos registrados no cadastro financeiro do Grupo
                Participa.
              </caption>
              <thead>
                {/* `rotulo` (12 px, sentence case, 600) no lugar de
                    `uppercase tracking-wide`: a Onda A tirou a caixa alta de
                    15 telas e esta era a última linha dela na aba.
                    🔑 No `th`, não no `tr`: o preflight tem `th{font-weight:
                    bold}`, e uma regra de elemento vence peso HERDADO — no
                    `tr` a coluna saía em 700, mais pesada que o dado. */}
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="rotulo py-2 pr-3 text-left">
                    Data
                  </th>
                  <th scope="col" className="rotulo py-2 pr-3 text-left">
                    Pagamento
                  </th>
                  <th scope="col" className="rotulo py-2 text-right">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const apoio = [
                    metodoLegivel(l.metodoPagamento),
                    mostrarProduto
                      ? (produtoPorContrato[l.contatoHmId] ?? null)
                      : null,
                  ].filter(Boolean);
                  return (
                    <tr
                      // Sem id no retorno da RPC. A lista é estática (Server
                      // Component, sem reordenação e sem estado de cliente) e a
                      // ordem vem do `order by` da função — índice como chave
                      // aqui não tem o defeito que teria numa lista editável.
                      key={`${l.contatoHmId}-${l.pagoEm}-${i}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {dataDoPagamento(l.pagoEm) ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {categoriaLegivel(l.categoria, l.parcela)}
                        {apoio.length > 0 ? (
                          <span className="block text-xs text-muted-foreground">
                            {apoio.join(" · ")}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="py-2 text-right whitespace-nowrap tabular-nums"
                        title={l.valor === null ? undefined : brl(l.valor)}
                      >
                        {brlOuTraco(l.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {truncado ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Mostrando os {linhas.length} pagamentos mais recentes. O histórico
              completo está com a equipe.
            </p>
          ) : null}
        </details>
      </CardContent>
    </Card>
  );
}
