import type {
  Dashboard,
  FaixaDeTrilha,
  ResumoAtendimento,
  ResumoClientes30,
} from "@/lib/data/dashboard";
import { FaixaKpis } from "./faixa-kpis";
import { GraficosDoPrograma } from "./graficos";
import { FilaEBase } from "./fila";
import { CaminhoDoCliente } from "./caminho";
import { JornadaDoParceiro } from "./jornada";
import { EvolucaoSemanal } from "./evolucao";

/**
 * A sub-aba **"O programa"** (`?vis=programa`, a padrão) da Visão geral —
 * macro → forma → caminho → fila.
 *
 * 🔑 **23/09/2026: a Visão geral virou três sub-abas** (`abas-painel.tsx`),
 * e este componente é a primeira delas. As outras duas ("Precisa de atenção",
 * `atencao.tsx`; "Parceiros", o ranking) são irmãs, não filhas: o que está
 * aqui continua sendo o dashboard de sempre, com o caminho do cliente somado.
 *
 * Cinco seções, e a ordem é a leitura:
 *
 *   A. **faixa de KPIs** (`faixa-kpis.tsx`) — seis números, sem desenho.
 *   B. **gráficos, grandes** (`graficos.tsx`) — a forma dos mesmos dados.
 *   E. **caminho do cliente** (`caminho.tsx`) — um nível abaixo: os clientes
 *      dos parceiros. 🔴 Os 4 passos da ficha são barras PARALELAS, nunca
 *      funil — a razão está no cabeçalho daquele arquivo.
 *   C. **fila e base** (`fila.tsx`) — o que a equipe deve atacar.
 *   D. rodapé — só o escopo do lote. A hora da apuração subiu para
 *      `abas-painel.tsx` em 23/09/2026: ela vale para as três sub-abas, e
 *      aqui alcançava apenas esta.
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
 *    mas dito em número ("0 de 136 · 0%" com o trilho vazio) e em UMA linha.
 * 3. *KPI sem "de quanto"* — todo tile da faixa A leva o percentual do próprio
 *    universo ao lado do número, e `acesso.ativos30d`/`semAcesso30d` (que a
 *    RPC já devolvia e ninguém mostrava) viraram o terceiro tile.
 * 4. *nove cards de peso igual* — a faixa é a primeira leitura, o gráfico é a
 *    segunda, a fila é a terceira.
 *
 * 🔑 As regras que **não** mudaram, e que valem para todo card daqui:
 * número, não frase · um card, um destino · todo `href` com valor da allowlist
 * de `alunos-ativos-lista/estado-na-url.ts` e com `aba=ativos` · vazio é
 * resultado com instrução curta · nenhum número inventado (nada de 136 × 150
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
  clientes30,
  ambientesCarregados,
}: {
  dados: Dashboard;
  /** `faixasDeTrilha(alunos)`, pura, sobre o lote carregado. */
  trilha: FaixaDeTrilha[];
  /** `resumoAtendimento(alunos, atendimento)`, pura, sobre o lote. */
  atendimento: ResumoAtendimento;
  /**
   * `resumoClientes30(alunos)`, pura, sobre o lote (15/09/2026) — os 3
   * números que só existiam no painel removido ("sem nenhum cliente" · "no
   * meio dos 30" · "fecharam os 30"), agora submétricas do card "Clientes
   * cadastrados". Mesma Leitura A do resto da Visão geral.
   */
  clientes30: ResumoClientes30;
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

      <FaixaKpis dados={dados} clientes30={clientes30} />

      {/* 🔑 23/09/2026 (2ª rodada) — A GRADE, não o card, era o problema.
          Queixa do Marcio: *"os cards empilhados assim fica mt ruim"*.
          Medido em 1920 px: **nove faixas horizontais**, nunca mais de 2
          colunas, e DUAS delas com um card só, esticado sobre metade da tela
          ("Onboarding" e "Fase dos clientes"). Card sozinho numa faixa é meia
          tela de vazio.

          A causa: cada seção (`graficos`, `caminho`, `fila`) era dona da
          PRÓPRIA `grid-cols-2`, então toda seção fechava uma faixa e o número
          ímpar de cards dela sobrava. As três viraram FRAGMENTO de cards, e a
          grade passou a ser desta página — assim os 13 cards fluem em duas
          bandas contínuas, sem sobra por seção.

          🔴 **3 colunas é o teto, e o `2xl:grid-cols-4` foi REMOVIDO** —
          medido no Chromium em 23/09/2026. O `<main>` de `/admin` é
          `max-w-6xl` (1152px fixos), mas os breakpoints do Tailwind leem a
          VIEWPORT, não o container: em 1920px o `2xl:` disparava e repartia
          1120px em 4 → **271px por coluna**, abaixo do piso de ~300px descrito
          abaixo. Resultado medido: **17 rótulos quebrando em duas linhas em
          1920px contra 4 em 1366px** — mais quebra na tela MAIOR, e 7 dos 9
          degraus da Jornada entre eles. Com 3 colunas dá 365px, e a quebra
          some. Breakpoint de viewport dentro de container fixo mente sobre a
          largura disponível; o teto tem de vir do container.

          Por que 3 e não mais: cada card carrega texto
          corrido (denominador escrito, ressalva de leitura) e barras com
          rótulo nominal de 16–22 caracteres ("Com login, nunca entraram",
          "Fechou os 30 (ficha completa)"). Abaixo de ~300 px de coluna esses
          rótulos passam a quebrar em duas linhas e o card volta a crescer em
          altura — mais colunas devolveria a rolagem que elas vieram cortar.
          Medido: 3 colunas dentro de `max-w-6xl` dão **365 px** cada, em
          qualquer viewport a partir de `xl`. (A previsão anterior de "4
          colunas dão ~440 px" só valeria com container fluido — era leitura de
          caixa, não medição, e a medição a desmentiu.)

          `items-start` + `auto-rows-min`: sem eles a grade estica todo card ao
          tamanho do mais alto da FILEIRA, e "Onboarding" (3 números) ficaria
          da altura de "Jornada do parceiro" (9 degraus) só por serem vizinhos.
          É exatamente o buraco que o diagnóstico mediu.

          ⚠️ A ORDEM DE LEITURA É A MESMA de antes, e ela é a hierarquia:
          macro do PROGRAMA (entradas, atividade, etapa, acesso, onboarding) →
          o PARCEIRO (jornada, evolução) → o CLIENTE dele (passos, marcos,
          fases). Nenhum card mudou de banda; o que mudou foi quantos cabem
          lado a lado. */}
      <div className="grid auto-rows-min items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <GraficosDoPrograma dados={dados} trilha={trilha} />

        {/* A jornada é ONDE cada parceiro está (retrato de hoje); a evolução é
            PARA ONDE isso anda (movimento no tempo). Todo o resto da Visão
            geral é retrato — sem a evolução, ninguém vê que o cadastro
            disparou na semana de 14/09 enquanto a mensagem ficou rente ao
            chão.

            🔴 Nenhuma das duas vira funil, e pela mesma razão do caminho do
            cliente: contagem paralela sobre um denominador escrito. A jornada
            usa `EscadaAlcance`; nenhuma calcula taxa de passagem.

            ⚠️ Os denominadores são DIFERENTES e cada card escreve o seu: a
            jornada é sobre os 148 PARCEIROS no programa (o mesmo universo de
            `programa.total`), o caminho é sobre os ~1.700 CLIENTES. Ler o
            percentual de um com o denominador do outro é o erro que os
            rodapés existem para impedir. */}
        <JornadaDoParceiro dados={dados} />
        <EvolucaoSemanal dados={dados} />

        <CaminhoDoCliente dados={dados} />
      </div>

      {/* A fila fica em BANDA PRÓPRIA de propósito — é a única seção que pede
          AÇÃO ("Esperando a equipe" abre lista filtrada), e misturá-la aos
          cards de leitura tiraria dela a posição de fim-de-tela, que é a
          hierarquia que o Marcio aprovou. São 3 ou 4 cards: cabem numa
          fileira só, sem sobra. */}
      <div className="grid auto-rows-min items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FilaEBase
          dados={dados}
          atendimento={atendimento}
          ambientesCarregados={ambientesCarregados}
        />
      </div>

      {/* O "Apurado …" subiu para `AbasPainel`, ao lado do seletor de
          sub-abas: o carimbo vale para as TRÊS e aqui só alcançava esta.
          Fica aqui apenas o aviso de lote parcial, que é específico desta
          sub-aba — `faixasDeTrilha` e `resumoAtendimento` são puras sobre os
          ambientes JÁ carregados, não sobre o programa inteiro. */}
      {parcial ? (
        <p className="text-xs text-muted-foreground">
          Progresso e fila sobre {ambientesCarregados} de{" "}
          {dados.programa.total} ambientes carregados.
        </p>
      ) : null}
    </section>
  );
}
