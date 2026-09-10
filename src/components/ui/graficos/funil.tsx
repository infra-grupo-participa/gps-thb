import { CornerDownRight } from "lucide-react";

import {
  COR_DO_TOM,
  fracaoDoTeto,
  pctDe,
  tetoDaSerie,
  type FormatarValor,
  type PontoGrafico,
} from "./tipos";

/**
 * Funil — as etapas de um mesmo conjunto, da mais larga à mais estreita
 * (842 em prospecção → 37 em fechamento → 0 contratados). **HTML, sem SVG.**
 *
 * 🔑 É um gráfico de BARRAS deitadas, não um trapézio. O trapézio clássico
 * distorce a área: uma etapa com metade dos casos parece ter um terço. Aqui a
 * largura é proporcional ao número e nada mais.
 *
 * 🔑 Cada etapa carrega DOIS percentuais, que respondem perguntas diferentes:
 * o **do total** ("37 são 4% dos 879") fica ao lado do número, e a **taxa de
 * passagem** ("4% passam para Fechamento") aparece na linha entre as duas
 * barras, que é onde a conversão de fato acontece. A segunda era só uma
 * coluna de `%` na legenda e ninguém sabia de que ela era percentual.
 *
 * 🔴 Etapa em zero desenha o TRILHO. Sem ele, "0 contratados" é indistinguível
 * de "esta etapa não existe" — e a ponta contratada do funil nasce zerada de
 * verdade (medição de 10/09). Vazio é resultado, e resultado se mostra.
 *
 * ♿ Sem `role="img"`: cada etapa já é nome + número + percentual em texto, e
 * a barra é decoração (`aria-hidden`). Mesma razão do modo horizontal de
 * `Barras` — texto de verdade ganha de `aria-label` que descreve desenho.
 */
export function Funil({
  etapas,
  formatar = String,
  mostrarPassagem = true,
}: {
  etapas: (PontoGrafico & { tom: NonNullable<PontoGrafico["tom"]> })[];
  formatar?: FormatarValor;
  /** A linha "N% passam para X" entre duas etapas. */
  mostrarPassagem?: boolean;
}) {
  if (etapas.length === 0) return null;
  const teto = tetoDaSerie(etapas.map((e) => e.valor));
  const total = etapas.reduce((s, e) => s + Math.max(0, e.valor), 0);

  return (
    <ol className="grid gap-1">
      {etapas.map((e, i) => {
        const texto = formatar(e.valor);
        const doTotal = pctDe(e.valor, total);
        const anterior = i > 0 ? etapas[i - 1] : null;
        const passagem = anterior ? pctDe(e.valor, anterior.valor) : null;
        return (
          <li key={e.rotulo} className="grid gap-1">
            {mostrarPassagem && anterior ? (
              <p className="flex items-center gap-1.5 pl-1 corpo-sm text-muted-foreground">
                <CornerDownRight aria-hidden className="size-3.5 shrink-0" />
                <span>
                  {passagem === null ? (
                    "sem base para calcular a passagem"
                  ) : (
                    <>
                      <span className="numero font-semibold text-foreground">
                        {passagem}%
                      </span>{" "}
                      passam de {anterior.rotulo.toLowerCase()} para{" "}
                      {e.rotulo.toLowerCase()}
                    </>
                  )}
                </span>
              </p>
            ) : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 corpo-sm text-muted-foreground">
                {e.rotulo}
              </span>
              <span className="numero shrink-0 font-semibold whitespace-nowrap">
                {texto}
                <span className="ml-1.5 corpo-sm font-normal text-muted-foreground">
                  {doTotal === null ? "—" : `${doTotal}%`}
                </span>
              </span>
            </div>
            <div
              aria-hidden
              className="h-6 w-full overflow-hidden rounded-md bg-superficie-afundada inset-ring inset-ring-black/5"
              title={`${e.rotulo}: ${texto}`}
            >
              <div
                className="h-full rounded-md"
                style={{
                  width: `${fracaoDoTeto(e.valor, teto)}%`,
                  backgroundColor: COR_DO_TOM[e.tom],
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
