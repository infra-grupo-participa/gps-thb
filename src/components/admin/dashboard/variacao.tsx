import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type { VariacaoMes } from "./tipos";

/**
 * A comparação do mês — e a frase que impede a comparação de mentir.
 *
 * 🔴 O mês corrente é comparado com **o mesmo intervalo** do mês anterior
 * (dia 1 até o mesmo dia), e a tela **escreve isso**: "até o dia 10". Sem a
 * frase, todo dia 1º o painel anuncia −95% porque compara um dia contra trinta
 * — e um número que mente uma vez por mês é um número que ninguém mais lê.
 *
 * ♿ O sinal não é só a cor nem só a seta: o texto começa por "+" ou "−" e o
 * `title` diz os dois números por extenso. Verde/vermelho aqui é reforço.
 *
 * Sem juízo de valor embutido: subir NÃO é sempre bom (o card 7 conta
 * pendências). Quem chama decide por `subirEBom`.
 */
export function VariacaoDoMes({
  variacao,
  mesAtual,
  mesAnterior,
  substantivo,
  subirEBom = true,
}: {
  variacao: VariacaoMes;
  mesAtual: string;
  mesAnterior: string;
  /** O que está sendo contado, no plural ("entradas", "conclusões"). */
  substantivo: string;
  subirEBom?: boolean;
}) {
  const delta = variacao.atual - variacao.anterior;
  const tom =
    delta === 0
      ? "text-muted-foreground"
      : (delta > 0) === subirEBom
        ? "text-sucesso-foreground"
        : "text-risco-foreground";
  const Icone = delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const sinal = delta > 0 ? "+" : delta < 0 ? "−" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 corpo-sm font-medium ${tom}`}
      title={`${variacao.atual} ${substantivo} em ${mesAtual} até o dia ${variacao.ateODia}, contra ${variacao.anterior} no mesmo intervalo de ${mesAnterior}.`}
    >
      <Icone aria-hidden className="size-3.5" />
      <span>
        {sinal}
        {Math.abs(delta)}
        <span className="ml-1 font-normal text-muted-foreground">
          vs. {mesAnterior} até o dia {variacao.ateODia}
        </span>
      </span>
    </span>
  );
}
