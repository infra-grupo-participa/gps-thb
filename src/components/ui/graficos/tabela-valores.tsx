import { COR_DO_TOM, type FormatarValor, type PontoGrafico } from "./tipos";

/**
 * A tabela de valores que acompanha **todo** gráfico do portal.
 *
 * 🔴 Não é enfeite nem "fallback": é o canal principal de leitura. Os tokens
 * semânticos da casa não formam uma paleta categórica separável (a conta está
 * em `tipos.ts`), e estes gráficos são Server Components sem hidratação — logo
 * não existe tooltip para inspecionar valor. Quem responde "quanto é a fatia
 * âmbar?" é esta tabela, com o nome escrito por extenso.
 *
 * Por isso `mostrarTabela` nasce `true` nos cinco gráficos e só é desligada
 * quando os valores já aparecem em texto na mesma peça.
 *
 * `<table>` de verdade, não uma grade de `div`: leitor de tela navega por
 * linha e coluna, e o cabeçalho fica em `sr-only` porque na tela o par
 * "nome · número" se explica sozinho.
 */
export function TabelaValores({
  titulo,
  linhas,
  formatar = String,
  total,
  tomPadrao = "marca",
  colunas = 1,
}: {
  /** `<caption>` — some da tela, fica para o leitor de tela. */
  titulo: string;
  linhas: PontoGrafico[];
  formatar?: FormatarValor;
  /** Quando informado, cada linha ganha a porcentagem do todo. */
  total?: number;
  tomPadrao?: PontoGrafico["tom"];
  /**
   * Duas tabelas lado a lado (metade das linhas em cada) quando a série é
   * longa — 12 meses em coluna única empurram o card para 400 px de altura.
   * São dois `<table>` de verdade, não uma coluna de CSS: `columns: 2` quebra
   * a semântica de linha/coluna que o leitor de tela usa para navegar.
   */
  colunas?: 1 | 2;
}) {
  if (colunas === 2 && linhas.length > 3) {
    const meio = Math.ceil(linhas.length / 2);
    return (
      <div className="grid grid-cols-2 gap-x-4">
        <TabelaValores
          titulo={`${titulo} (1 de 2)`}
          linhas={linhas.slice(0, meio)}
          formatar={formatar}
          total={total}
          tomPadrao={tomPadrao}
        />
        <TabelaValores
          titulo={`${titulo} (2 de 2)`}
          linhas={linhas.slice(meio)}
          formatar={formatar}
          total={total}
          tomPadrao={tomPadrao}
        />
      </div>
    );
  }

  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">{titulo}</caption>
      <tbody>
        {linhas.map((l) => {
          const pct =
            total && total > 0 ? Math.round((l.valor / total) * 100) : null;
          return (
            <tr key={l.rotulo} className="align-baseline">
              <th
                scope="row"
                className="py-0.5 pr-2 text-left font-normal corpo-sm text-muted-foreground"
              >
                <span className="flex items-baseline gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 translate-y-px rounded-[2px]"
                    style={{
                      backgroundColor: COR_DO_TOM[l.tom ?? tomPadrao ?? "marca"],
                    }}
                  />
                  <span className="min-w-0">
                    {l.rotulo}
                    {l.hint ? (
                      <span className="block text-[11px] leading-tight text-muted-foreground/85">
                        {l.hint}
                      </span>
                    ) : null}
                  </span>
                </span>
              </th>
              <td className="numero py-0.5 text-right corpo-sm font-semibold whitespace-nowrap">
                {formatar(l.valor)}
                {pct !== null ? (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {pct}%
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
