/**
 * Os gráficos do portal — desenho próprio, Server Component, **0 KB de JS**.
 *
 * A alternativa medida era `recharts`: ~95–110 KB gzip na rota mais usada pela
 * equipe (`/admin`, hoje 158 KB), `"use client"` obrigatório e um formatador
 * de número a mais para divergir entre o ICU do Node e o do navegador — que é
 * exatamente o defeito que o `brlCompacto` já custou ao projeto. Desenhos
 * estáticos não pagam esse preço.
 *
 * Regras que valem para os dois abaixo (a razão de cada uma está em
 * `tipos.ts`): número em TEXTO sempre (rótulo direto ou legenda) · o que é
 * pura geometria leva `role="img"` + `aria-label` com o resumo em número ·
 * separação por vão na cor da superfície, nunca por contorno · nenhuma cor
 * fora dos tokens semânticos · altura em PIXELS, decidida pelo card · zero
 * estado.
 *
 * 🔑 23/09/2026 (2ª rodada, limpeza de órfãos): `Funil`, `Rosca`,
 * `BarraEmpilhada` e `EscadaAlcance` saíram — o redesenho da sub-aba "O
 * programa" (3 zonas) não usa nenhum dos quatro, e `rg` confirmou zero
 * importador em `src` inteiro antes da remoção.
 */
export { Barras } from "./barras";
export { Linha } from "./linha";
// ⚠️ Só o que ALGUÉM importa daqui. `LegendaValores`, `COR_DO_TOM`,
// `SerieLinha`, `FormatarValor` e `PontoGrafico` saíram do barril: os usos
// reais importam direto de `./legenda-valores` e `./tipos`, e reexport que
// ninguém consome é superfície morta que o próximo leitor confunde com API.
export { pctDe, type TomGrafico } from "./tipos";
