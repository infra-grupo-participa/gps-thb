import {
  COR_DO_TOM,
  caminhoBarra,
  escala,
  larguraTexto,
  type FormatarValor,
  type PontoGrafico,
} from "./tipos";
import { TabelaValores } from "./tabela-valores";

const L = 320;
const ALTURA_ETAPA = 20; // ≤ 24, a espessura de marca da casa
const ESPACO = 10;

/**
 * Funil horizontal — as etapas de um mesmo conjunto, da mais larga à mais
 * estreita (841 em prospecção → 37 em fechamento → 0 contratados).
 *
 * 🔑 É um gráfico de BARRAS deitadas, não um trapézio. O trapézio clássico
 * distorce a área: uma etapa com metade dos casos parece ter um terço. Aqui a
 * largura é proporcional ao número e nada mais.
 *
 * 🔴 Etapa em zero desenha o TRILHO. Sem ele, "0 contratados" é indistinguível
 * de "esta etapa não existe" — e a ponta contratada do funil nasce zerada de
 * verdade (medição de 10/09). Vazio é resultado, e resultado se mostra.
 */
export function Funil({
  etapas,
  resumo,
  formatar = String,
  mostrarTabela = true,
  tituloTabela,
  mostrarConversao = true,
}: {
  etapas: (PontoGrafico & { tom: NonNullable<PontoGrafico["tom"]> })[];
  resumo: string;
  formatar?: FormatarValor;
  mostrarTabela?: boolean;
  tituloTabela?: string;
  /** Acrescenta "x% da etapa anterior" na tabela. Conta, não estimativa. */
  mostrarConversao?: boolean;
}) {
  if (etapas.length === 0) return null;
  const larguraDe = escala(
    etapas.map((e) => e.valor),
    L,
  );
  const altura = etapas.length * ALTURA_ETAPA + (etapas.length - 1) * ESPACO;

  const linhas: PontoGrafico[] = etapas.map((e, i) => {
    const anterior = i > 0 ? etapas[i - 1].valor : null;
    const conversao =
      mostrarConversao && anterior && anterior > 0
        ? `${((e.valor / anterior) * 100).toFixed(1).replace(".", ",")}% de ${etapas[i - 1].rotulo.toLowerCase()}`
        : undefined;
    return { ...e, hint: conversao };
  });

  return (
    <div className="grid gap-3">
      <svg
        viewBox={`0 0 ${L} ${altura}`}
        role="img"
        aria-label={resumo}
        className="h-auto w-full"
      >
        {etapas.map((e, i) => {
          const y = i * (ALTURA_ETAPA + ESPACO);
          const w = larguraDe(e.valor);
          const texto = formatar(e.valor);
          const dentro = larguraTexto(texto, 11) + 14 <= w;
          return (
            <g key={e.rotulo}>
              <title>{`${e.rotulo}: ${texto}`}</title>
              {/* Trilho de toda etapa: mostra o quanto falta e dá corpo à
                  etapa zerada. */}
              <rect
                x="0"
                y={y}
                width={L}
                height={ALTURA_ETAPA}
                rx="4"
                fill="var(--color-superficie-afundada)"
              />
              {w > 0 ? (
                <path
                  d={caminhoBarra(0, y, w, ALTURA_ETAPA, "direita")}
                  fill={COR_DO_TOM[e.tom]}
                />
              ) : null}
              <text
                x={dentro ? w - 7 : w + 7}
                y={y + ALTURA_ETAPA / 2 + 4}
                textAnchor={dentro ? "end" : "start"}
                fontSize="11"
                fontWeight="600"
                fill={dentro ? "var(--card)" : "var(--foreground)"}
              >
                {texto}
              </text>
            </g>
          );
        })}
      </svg>
      {mostrarTabela ? (
        <TabelaValores
          titulo={tituloTabela ?? resumo}
          linhas={linhas}
          formatar={formatar}
        />
      ) : null}
    </div>
  );
}
