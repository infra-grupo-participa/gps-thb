import { formatarDataHora } from "@/lib/datas";
import type {
  Dashboard,
  FaixaDeTrilha,
  ResumoAtendimento,
} from "@/lib/data/dashboard";
import { FaixaKpis } from "./faixa-kpis";
import { GraficosDoPrograma } from "./graficos";
import { FilaEBase } from "./fila";

/**
 * A aba **"Visão geral"** do painel — macro → forma → fila.
 *
 * Quatro seções, e a ordem é a leitura:
 *
 *   A. **faixa de KPIs** (`faixa-kpis.tsx`) — seis números, sem desenho.
 *   B. **gráficos, grandes** (`graficos.tsx`) — a forma dos mesmos dados.
 *   C. **fila e base** (`fila.tsx`) — o que a equipe deve atacar.
 *   D. rodapé — a hora do dado e o escopo do lote.
 *
 * 🔑 **O redesign de 11/09.** Pedido do João: "a visualização está muito crua;
 * quero gráficos, barras, linhas e pizzas, foco em KPIs e em números". Os
 * quatro defeitos medidos e o que cada um virou:
 *
 * 1. *gráfico minúsculo dentro de card grande* — a altura era a razão de um
 *    `viewBox` × a largura de uma coluna de grade 3×3, e dava colunas de 60 px.
 *    Agora é **pixel, prop do card** (190, medido em 242/190/156 de altura
 *    útil), a grade dos gráficos é de 2 colunas a partir do `lg`, e os desenhos
 *    viraram HTML onde dava — o texto parou de encolher com a largura da
 *    coluna (a razão está em `ui/graficos/tipos.ts`).
 * 2. *estado vazio como protagonista* — três caixas âmbar grandes gritavam
 *    mais alto do que os números que existem. Vazio continua sendo resultado,
 *    mas dito em número ("0 de 172 · 0%" com o trilho vazio) e em UMA linha.
 * 3. *KPI sem "de quanto"* — todo tile da faixa A leva o percentual do próprio
 *    universo ao lado do número, e `acesso.ativos30d`/`semAcesso30d` (que a
 *    RPC já devolvia e ninguém mostrava) viraram o terceiro tile.
 * 4. *nove cards de peso igual* — a faixa é a primeira leitura, o gráfico é a
 *    segunda, a fila é a terceira.
 *
 * 🔑 As regras que **não** mudaram, e que valem para todo card daqui:
 * número, não frase · um card, um destino · todo `href` com valor da allowlist
 * de `alunos-ativos-lista/estado-na-url.ts` e com `aba=ativos` · vazio é
 * resultado com instrução curta · nenhum número inventado (nada de 159 × 150
 * mil) · comparação só onde a RPC dá o par · **nenhuma tela escreve valor de
 * saldo do programa** (BLOQUEIO B-S1) · Server Component, 0 KB de JS.
 *
 * Recebe TUDO pronto: `dados` vem de UMA RPC agregada (`gps.admin_dashboard()`)
 * e `trilha`/`atendimento` vêm de duas funções PURAS sobre o que `/admin` já
 * carregou (`getAlunosGps` e `getAtendimentoPorAluno`) — **zero consulta
 * nova**, que é o crédito de otimização desta frente.
 */
export function DashboardExecutivo({
  dados,
  trilha,
  atendimento,
  ambientesCarregados,
}: {
  dados: Dashboard;
  /** `faixasDeTrilha(alunos)`, pura, sobre o lote carregado. */
  trilha: FaixaDeTrilha[];
  /** `resumoAtendimento(alunos, atendimento)`, pura, sobre o lote. */
  atendimento: ResumoAtendimento;
  /**
   * Quantos ambientes o lote trouxe. O progresso e a fila valem **sobre o
   * lote** (mesma Leitura A da busca e dos filtros); quando ele não cobre a
   * base inteira, a linha de rodapé diz isso — número parcial apresentado como
   * total é a mesma classe de erro do "R$ 0,00" em campo que nasceu vazio.
   */
  ambientesCarregados: number;
}) {
  const parcial = ambientesCarregados < dados.programa.total;

  return (
    <section aria-labelledby="visao-do-programa" className="grid gap-3">
      {/* O título da aba já nomeia a seção na tela; o `h2` fica para a
          estrutura do documento e para quem navega por cabeçalho. */}
      <h2 id="visao-do-programa" className="sr-only">
        Visão do programa
      </h2>

      <FaixaKpis dados={dados} trilha={trilha} />
      <GraficosDoPrograma dados={dados} trilha={trilha} />
      <FilaEBase
        dados={dados}
        atendimento={atendimento}
        ambientesCarregados={ambientesCarregados}
      />

      <p className="text-xs text-muted-foreground">
        Dados de {formatarDataHora(dados.geradoEm)}.
        {parcial ? (
          <>
            {" "}
            Progresso e fila sobre {ambientesCarregados} de{" "}
            {dados.programa.total} ambientes carregados.
          </>
        ) : null}
      </p>
    </section>
  );
}
