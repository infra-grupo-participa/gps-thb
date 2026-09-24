import Link from "next/link";

import type { Dashboard } from "@/lib/data/dashboard";
import type { Foco } from "@/components/admin/alunos-ativos-lista/estado-na-url";
import { Regua, type EstagioRegua } from "./regua";
import { Cruzamento, type ParDoCruzamento } from "./cruzamento";
import { RankingDeParceiros } from "./parceiros";
import { LINK_LISTA } from "./tipos";

/**
 * A sub-aba **"O programa"** (`?vis=programa`, a padrão) — **três zonas**,
 * não mais vinte cards (23/09/2026).
 *
 * 🔑 **O que foi desfeito, e por quê.** A tela tinha 20 cards de peso igual
 * espalhados em três seções (`faixa-kpis` · `graficos` · `caminho` · `fila`),
 * cada uma dona da própria grade. Queixa do Marcio: *"os cards empilhados
 * assim fica mt ruim"*. A 2ª rodada tentou consertar a GRADE; o problema era
 * a QUANTIDADE — vinte molduras para responder três perguntas.
 *
 * As três zonas, e a leitura é de cima para baixo:
 *
 *   **Zona 1 — a régua** (`regua.tsx`). Os 6 estágios da jornada do parceiro
 *   como números em linha, sobre um denominador escrito uma vez. É o índice
 *   da tela: clicar num estágio recorta as zonas 2 e 3.
 *
 *   **Zona 2 — o cruzamento** (`cruzamento.tsx`). Cadastros por semana em
 *   barra, com a segunda série em linha no mesmo eixo.
 *
 *   **Zona 3 — o ranking** (`parceiros.tsx`), recortado pelo estágio ativo.
 *
 * 🔴 **As zonas 2 e 3 são uma VARIANTE por estágio, pré-renderizada no
 * servidor.** As sete (`todos` + os 6 focos) são montadas aqui, e a régua só
 * escolhe qual entra no DOM — nenhuma fica escondida com `hidden`, porque
 * elemento invisível continua contando na área rolável do ancestral e sete
 * tabelas empilhadas dariam rolagem sobre o vazio.
 *
 * 🔴 **Zero fetch ao trocar de estágio.** `regua.tsx` escreve `?foco=` pela
 * History API nativa (`replaceState`), não por `router.replace` — este
 * componente NÃO é re-executado no clique, e a RPC não roda de novo. É o
 * motivo de as sete variantes serem montadas de uma vez: elas custam
 * renderização de HTML já em memória, não consulta.
 *
 * 🔑 **O denominador da régua vem de `jornada.ambientes`, não de
 * `programa.total`.** São o mesmo 148 hoje, e é justamente por isso que a
 * troca passaria despercebida: a régua fala da JORNADA, e numerador e
 * denominador têm de sair da mesma consulta. Dois totais de fontes diferentes
 * divergem no dia em que um dos dois ganhar um recorte.
 *
 * 🔴 **Três estágios da RPC NÃO viram item da régua**, e não sumiram:
 * `jornada.ambientes` é o denominador (escrito, não item); `fecharam os 30` e
 * a reunião preliminar migraram para `base.tsx` e `atencao.tsx`. Ver o
 * cabeçalho de `FOCOS` em `alunos-ativos-lista/estado-na-url.ts` para a
 * geometria que fechou a régua em seis.
 *
 * ⚠️ **Nenhuma taxa de passagem, em zona nenhuma.** Os 6 estágios NÃO são
 * subconjuntos encadeados: `escolheuFavorito` (37) é maior que `mandouMsg`
 * (22), então "passam de mensagem para favorito" daria 168%. A régua é
 * contagem paralela sobre um denominador comum — o mesmo motivo que fez
 * `caminho.tsx` recusar o `Funil` (medido: 5200% de entrevista para reunião).
 * Esta é a trava que os cards "não é funil" carregavam, e ela sobreviveu a
 * eles: o e2e cobra a ausência de `passam de`, `%` entre itens e `→`.
 *
 * Os 20 cards não evaporaram — cada número tem destino declarado. Os que não
 * couberam nas 3 zonas foram para `atencao.tsx` (fila da equipe: ativos 30
 * dias, sem login, onboarding parado, atividade, em fechamento, passos,
 * marcos, fases) e para `base.tsx` (composição da base: fecharam os 30,
 * entradas por mês, Etapa 01, titulares e sócios, grau de relação).
 *
 * Server Component, 0 KB de JS. Recebe TUDO pronto de UMA RPC agregada
 * (`gps.admin_dashboard()`) — zero consulta nova.
 */
/**
 * Quantas linhas do ranking a sub-aba PADRÃO desenha.
 *
 * 🔴 15 × ~37 px = ~555 px de tabela — o ranking cabe abaixo do gráfico sem
 * empurrar a página além do desenho que ele substitui. Subir este número é
 * decisão de ALTURA DE PÁGINA, não de "mostrar mais": cada linha a mais custa
 * 37 px medidos em 1920.
 */
const LINHAS_NA_SUBABA_PADRAO = 15;

export function DashboardExecutivo({ dados }: { dados: Dashboard }) {
  const { jornada } = dados;

  /**
   * Os 6 estágios, **na ordem de `FOCOS`** — a ordem da jornada, e a ordem em
   * que a régua os desenha.
   *
   * 🔴 O rótulo é de UMA palavra, minúscula. A régua tem ~192 px por item em
   * 1152 px; rótulo mais longo quebra em duas linhas e a fita deixa de ser
   * fita (ver `EstagioRegua` em `regua.tsx`).
   *
   * 🔴 A cobertura dos 6 é garantida do outro lado: `ReguaProps.variantes` é
   * um `Record<"todos" | Foco, …>` COMPLETO, então um estágio novo em `FOCOS`
   * quebra `tsc` na chamada abaixo. O que esta lista controla é a ORDEM e o
   * rótulo — um item esquecido aqui sumiria da fita sem erro, e é por isso que
   * a ordem de `FOCOS` está escrita no tipo de `estagios`.
   */
  const estagios: EstagioRegua[] = [
    { foco: "entrou", rotulo: "entrou", valor: jornada.entraram },
    { foco: "onboarding", rotulo: "onboarding", valor: jornada.onboardingOk },
    { foco: "cadastrou", rotulo: "cadastrou", valor: jornada.cadastrou },
    { foco: "mensagem", rotulo: "mensagem", valor: jornada.mandouMsg },
    { foco: "favorito", rotulo: "favorito", valor: jornada.escolheuFavorito },
    { foco: "contrato", rotulo: "contrato", valor: jornada.fechouContrato },
  ];

  return (
    <section aria-labelledby="visao-do-programa" className="grid gap-3">
      {/* O título da sub-aba já nomeia a seção na tela; o `h2` fica para a
          estrutura do documento e para quem navega por cabeçalho. */}
      <h2 id="visao-do-programa" className="sr-only">
        Visão do programa
      </h2>

      <Regua
        denominador={jornada.ambientes}
        estagios={estagios}
        variantes={{
          todos: <Variante dados={dados} par="mensagem" foco={null} />,
          entrou: <Variante dados={dados} par="mensagem" foco="entrou" />,
          onboarding: <Variante dados={dados} par="mensagem" foco="onboarding" />,
          // 🔑 O ÚNICO com o outro par. "cadastrou" pergunta *quantos
          // parceiros estão produzindo*, e a série tem exatamente essa resposta
          // (`parceirosAtivos` = ambientes distintos que cadastraram na
          // semana). Nos outros cinco a pergunta é sobre o CLIENTE, e a linha
          // é `comMsg`.
          cadastrou: <Variante dados={dados} par="parceiros" foco="cadastrou" />,
          mensagem: <Variante dados={dados} par="mensagem" foco="mensagem" />,
          favorito: <Variante dados={dados} par="mensagem" foco="favorito" />,
          contrato: <Variante dados={dados} par="mensagem" foco="contrato" />,
        }}
      />
    </section>
  );
}

/**
 * Uma variante: **zona 2 em cima, zona 3 embaixo**.
 *
 * 🔑 Só existem DOIS desenhos distintos de gráfico entre as sete variantes, e
 * está certo assim: a série da RPC tem duas segundas colunas (`comMsg` e
 * `parceirosAtivos`), e inventar um terceiro desenho exigiria dado que não
 * existe. O que muda de variante para variante é sobretudo o RECORTE DA
 * TABELA — que é onde a pergunta do estágio se responde.
 *
 * 🔴 `entrou` e `onboarding` chegam com `foco` mesmo sem o ranking saber
 * filtrar por eles: a tabela mostra tudo e escreve `sem recorte por este
 * estágio` no cabeçalho (`parceiros.tsx`). Passar `null` aqui esconderia o
 * token e a tela fingiria um recorte que não fez.
 *
 * 🔴 **23/09/2026 (achado do João): `entrou` e `onboarding` eram clique
 * morto.** O princípio 3 do Marcio — "submétricas que podem ser consultadas
 * clicando na métrica maior" — valia para `cadastrou`/`mensagem`/`favorito`/
 * `contrato` (o ranking recorta), mas não para estes dois: o dado para
 * responder já estava em `dados`, zero query, e a tela não mostrava nada.
 * Uma linha de submétricas entre o gráfico e a Zona 3 fecha o buraco:
 *   · `entrou` → "Sem login" (`acesso.semLogin`, `f=sem_login`). Só ESTA:
 *     `acesso.semAcesso30d` (a régua "Parados há 30+ dias") foi REMOVIDA de
 *     `atencao.tsx` no mesmo achado — divergia do filtro `inativos` que o
 *     link abre (exclui quem nunca entrou; o filtro inclui). Repeti-la aqui
 *     seria reintroduzir o mesmo erro num segundo lugar. A 2ª submétrica
 *     natural (`atendimento.semAcesso30d`, a que SOBREVIVEU em `atencao.tsx`)
 *     não está em `dados` — é `ResumoAtendimento`, prop separada que só
 *     `atencao.tsx` recebe (`page.tsx` não passa `atendimento` para
 *     `DashboardExecutivo`). Acrescentá-la aqui obrigaria mexer em
 *     `page.tsx`, fora do escopo desta correção — decisão registrada no
 *     relatório: 1 submétrica em vez de 2, sem tocar arquivo alheio.
 *   · `onboarding` → "Parados 7d" (`onboarding.parados7d`, SEM link: não há
 *     `?f=` na allowlist de `estado-na-url.ts` cuja definição case — os três
 *     filtros de onboarding são estado (`onb_nao`/`onb_andamento`/`onb_ok`),
 *     nenhum é "em andamento há 7+ dias sem tocar") e "Não responderam"
 *     (`onboarding.naoIniciados`, `f=onb_nao` — aproximado: a RPC conta
 *     PESSOAS e o filtro é sobre AMBIENTES/titulares, mas é o único filtro
 *     cuja definição de estado bate: "não iniciou").
 *
 * 🔴 **`limite={15}` no ranking, e é aqui que ele vive — não em `parceiros.tsx`
 * nem em `base.tsx`.** Medido em Chromium (23/09/2026): a tabela custa 37 px
 * por linha, e os 86 parceiros de produção dariam ~4.399 px de página em 1920
 * — MAIS que os 3.326 px dos 20 cards que este redesenho substitui. Esta é a
 * sub-aba PADRÃO: o ranking aqui é evidência do estágio marcado na régua, e
 * quinze linhas respondem isso. Quem quer os 86 segue o link para
 * `?vis=parceiros`, onde a tabela é a razão da tela e vai inteira.
 */
/** Uma submétrica da régua: `rótulo · valor · link` — nunca parágrafo. */
interface Submetrica {
  rotulo: string;
  valor: number;
  /**
   * 🔴 A unidade, **só quando ela NÃO é a da régua** (que conta ambientes, e
   * escreve "de 148 parceiros" uma vez no rodapé da fita). As submétricas de
   * `onboarding` contam PESSOAS e por isso a declaram. Um token — "pessoas",
   * não "52 de 161 pessoas convidadas ainda não responderam".
   */
  unidade?: string;
  href: string | null;
}

/**
 * As submétricas de `entrou` e `onboarding` — ver o comentário de `Variante`
 * para a origem de cada uma e por que `onboarding` tem uma sem link.
 */
function submetricasDoFoco(dados: Dashboard, foco: Foco | null): Submetrica[] {
  if (foco === "entrou") {
    return [
      {
        rotulo: "Sem login",
        valor: dados.acesso.semLogin,
        href: `${LINK_LISTA}&f=sem_login`,
      },
    ];
  }
  if (foco === "onboarding") {
    // 🔴 **Estas duas contam PESSOAS, e a fita acima diz "de 148 parceiros"**
    // (24/09/2026, achado do João). `naoIniciados` é
    // `pessoas − concluídos − em andamento` — o universo é de MEMBROS (161),
    // não de ambientes, então o número pode passar do denominador da régua e
    // parecer erro de conta. O sufixo é UM TOKEN, não frase: "Não responderam
    // 52 pessoas". Trocar a unidade da fonte seria outra feature (a RPC não
    // devolve onboarding por ambiente); dizer a unidade certa custa 7 letras.
    return [
      {
        rotulo: "Parados 7d",
        valor: dados.onboarding.parados7d,
        unidade: "pessoas",
        href: null,
      },
      {
        rotulo: "Não responderam",
        valor: dados.onboarding.naoIniciados,
        unidade: "pessoas",
        href: `${LINK_LISTA}&f=onb_nao`,
      },
    ];
  }
  return [];
}

function Variante({
  dados,
  par,
  foco,
}: {
  dados: Dashboard;
  par: ParDoCruzamento;
  foco: Foco | null;
}) {
  const submetricas = submetricasDoFoco(dados, foco);

  return (
    <div className="grid gap-3">
      {/* `Cruzamento` devolve `null` com a série vazia — o estado vazio é
          desta camada. Uma linha, sem caixa de alerta: sem semana no período é
          RESULTADO (a RPC olhou e não achou), não erro. */}
      {dados.serie.itens.length === 0 ? (
        <p className="corpo-sm text-muted-foreground">sem semanas no período</p>
      ) : (
        <Cruzamento serie={dados.serie} par={par} altura={220} />
      )}

      {/* Submétricas de `entrou`/`onboarding` — entre o gráfico e o ranking.
          Sem parágrafo, sem card: `rótulo · valor · link`, mesmo padrão denso
          de `BlocoAtencao`. Número sem `href` fica SEM `<a>`, sem sublinhado,
          sem cor de link — não pode parecer clicável e não ser. */}
      {submetricas.length > 0 ? (
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          {submetricas.map((s) => (
            <li key={s.rotulo} className="flex items-baseline gap-2">
              <span className="corpo-sm text-muted-foreground">{s.rotulo}</span>
              <span className="numero font-semibold tabular-nums">{s.valor}</span>
              {/* A unidade quando ela não é a da régua — token cinza colado
                  no número, não frase. Ver `Submetrica.unidade`. */}
              {s.unidade ? (
                <span className="corpo-sm text-muted-foreground">
                  {s.unidade}
                </span>
              ) : null}
              {s.href ? (
                <Link
                  href={s.href}
                  prefetch={false}
                  aria-label={`Ver ${s.rotulo.toLowerCase()}: ${s.valor}${s.unidade ? ` ${s.unidade}` : ""}`}
                  className="foco-visivel rounded-md px-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
                >
                  Ver
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* As SETE variantes passam por aqui — o limite é um só, e é por isso
          que ele mora na constante acima em vez de repetido sete vezes na
          chamada da régua. `base.tsx` NÃO passa `limite`: lá o default do
          `RankingDeParceiros` ("tudo") é o comportamento certo. */}
      <RankingDeParceiros
        parceiros={dados.parceiros}
        foco={foco}
        limite={LINHAS_NA_SUBABA_PADRAO}
      />
    </div>
  );
}
