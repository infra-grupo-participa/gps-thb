import Link from "next/link";

import type { Dashboard } from "@/lib/data/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { LINK_CLIENTES, LINK_LISTA } from "./tipos";

/**
 * **Quem precisa de atenção** — as 5 réguas da fila da equipe, uma por bloco.
 *
 * Anatomia fixa de cada bloco, e a hierarquia é por POSIÇÃO: número grande,
 * rótulo, denominador, e o destino (ou a razão de não haver destino) por
 * último. Sem card colorido, sem ícone, sem caixa de alerta — o número é o
 * assunto.
 *
 * 🔴 **Dois números NÃO têm destino nesta entrega, e têm de PARECER que não
 * têm.** `favoritoParado` e `reuniaoSemEntrevista` falam de CLIENTES, e a
 * lista clicável do painel é de PARCEIROS (`LINK_LISTA`); o alvo correto
 * exigiria um parâmetro que `/admin/clientes` ainda não aceita (a allowlist
 * de lá é `fase`/`grau`/`q`/`pag`/`reuniao` — ver `clientes-programa/
 * estado-na-url.ts`). Eles ficam como TEXTO: sem sublinhado, sem
 * `cursor: pointer`, sem cor de link, com uma linha curta encaminhando para
 * `/admin/clientes`. **Número que parece link e não funciona destrói a
 * confiança nos links que funcionam** — e um `href` com filtro fora da
 * allowlist é pior ainda: ele é descartado no parse e abre a lista CHEIA, em
 * silêncio, fazendo a tela mentir sobre o recorte.
 *
 * 🔴 **`parceiroSemMensagem` também fica sem link, pelo mesmo motivo.** O
 * filtro `sem_mensagem` está sendo criado em paralelo e **ainda não está** em
 * `FILTROS` (`alunos-ativos-lista/estado-na-url.ts`). Enquanto não estiver,
 * apontar para ele abriria a lista inteira sem aviso. Quando entrar, este
 * bloco ganha `href` numa linha — e não antes.
 *
 * ⚠️ `socioPendente` vale **0** hoje. Zero é resultado: o bloco continua na
 * tela, com o número, sem virar link e sem parecer quebrado — sumir com ele
 * faria a régua desaparecer justamente quando está em dia, e ninguém saberia
 * que ela existe.
 *
 * 🔑 **A ORDEM É POR GRAVIDADE, FIXA NO CÓDIGO** (23/09/2026). Antes era a
 * ordem em que as réguas foram escritas, que não significa nada.
 *
 * 🔴 **Gravidade NÃO é o valor bruto, e por isso a ordem não é calculada.**
 * Os cinco números contam coisas diferentes sobre denominadores diferentes
 * (dois são sobre ~1.700 CLIENTES, três sobre ~148 AMBIENTES); somar ou
 * ponderar isso produziria um "score" que é peso arbitrário disfarçado de
 * aritmética — pior que ordem fixa assumida, porque parece objetivo. Não há
 * prazo, meta por indicador nem capacidade no sistema que sustentasse
 * fórmula. Então: ordem fixa, escrita à mão, com a razão ao lado de cada uma.
 *
 * O critério, em uma pergunta: **há data marcada com terceiro, e o estrago se
 * desfaz?**
 *
 * 1. **Reunião marcada sem entrevista prévia (51)** — o mais grave, e é o que
 *    prova que o ranking não é por valor bruto: perde para dois números
 *    maiores. É o único com **data marcada e cliente do outro lado**. A
 *    reunião acontece no dia marcado com ou sem preparo, e a equipe chega
 *    despreparada na frente do cliente do parceiro. **Passada a data, não se
 *    corrige** — a primeira impressão já foi gasta. Tem janela, e a janela
 *    fecha sozinha.
 * 2. **Favoritos parados há 7+ dias (18)** — o menor número da lista, em
 *    segundo. É o cliente que o parceiro escolheu para a equipe acompanhar,
 *    esfriando: há um relacionamento específico se perdendo, e esfriamento é
 *    progressivo (quanto mais tarde, menos recuperável). É o dano que anda
 *    sozinho enquanto ninguém olha.
 * 3. **Parceiros sem nenhum cliente (62)** — o parceiro não começou. Grave e
 *    numeroso, mas **estável**: quem não começou hoje continua podendo
 *    começar amanhã, sem nada tendo piorado no intervalo. Fica acima do
 *    próximo por ser o passo mais básico do programa — sem cliente, nenhuma
 *    outra régua chega a existir para essa pessoa. E é o **único com link
 *    direto** (`f=sem_cliente`), ou seja, a única em que o clique já resolve
 *    o "e agora?".
 * 4. **Parceiros que não enviaram nenhuma mensagem (64)** — o maior número, e
 *    o penúltimo. É problema **difuso e já conhecido**: 64 de ~148 é quase
 *    metade da base, e um número que descreve a norma não é um alerta, é um
 *    retrato. Além disso é em larga medida subconjunto do item 3 (quem não
 *    tem cliente não teria a quem mandar mensagem), então subi-lo faria a
 *    mesma população ocupar as duas primeiras posições.
 * 5. **Convites de sócio em aberto (0)** — último **porque vale zero**, não
 *    por ser menos importante em tese. Zero no fim da lista, à vista, nunca
 *    escondido: a régua tem de continuar visível para alguém saber que ela
 *    existe quando deixar de ser zero.
 *
 * ⚠️ A posição 5 é a única que depende do VALOR e não só do tipo. Se
 * `socioPendente` deixar de ser zero, ele volta para perto do item 2 (convite
 * em aberto trava a entrada de uma pessoa no ambiente) — e aí a ordem deixa
 * de ser constante e passa a precisar de uma regra escrita. **Hoje não
 * precisa**, e resolver antecipadamente um caso que não existe seria a
 * fórmula que esta nota acabou de recusar.
 *
 * Server Component, 0 KB de JS.
 */
export function PrecisaDeAtencao({ dados }: { dados: Dashboard }) {
  const { atencao, programa, clientes } = dados;

  /**
   * 🔴 **ORDEM = GRAVIDADE, e ela está escrita aqui de propósito.** A
   * justificativa de cada posição está no cabeçalho do arquivo; o resumo é:
   * data marcada com terceiro primeiro, dano progressivo depois, problema
   * estável em seguida, problema difuso que descreve a norma no fim, e zero
   * por último. **Não reordenar por valor bruto** — foi exatamente o que esta
   * ordem recusa (51 vem antes de 64 e de 62, e 18 vem antes dos três).
   */
  const blocos: Bloco[] = [
    // 1º — tem DATA MARCADA e cliente do outro lado. Passada a data, não se
    // corrige. É o único com janela que fecha sozinha.
    {
      chave: "reuniao_sem_entrevista",
      valor: atencao.reuniaoSemEntrevista,
      rotulo: "Reunião marcada sem entrevista prévia",
      denominador: `de ${clientes.total} clientes`,
      destino: null,
      encaminhamento: {
        texto: "Procure em Clientes",
        href: LINK_CLIENTES,
      },
    },
    // 2º — o menor número da lista, e mesmo assim em segundo: é dano
    // PROGRESSIVO sobre um cliente específico que o parceiro escolheu.
    {
      chave: "favorito_parado",
      valor: atencao.favoritoParado,
      rotulo: "Favoritos parados há 7+ dias",
      denominador: `de ${clientes.total} clientes`,
      // Sobre CLIENTES, e a lista de clientes não filtra por isso hoje.
      destino: null,
      encaminhamento: {
        texto: "Procure em Clientes",
        href: LINK_CLIENTES,
      },
    },
    // 3º — o parceiro não começou. Grave, mas ESTÁVEL (não piora sozinho).
    // É também o único bloco cujo clique já resolve o "e agora?".
    {
      chave: "ambiente_sem_cliente",
      valor: atencao.ambienteSemCliente,
      rotulo: "Parceiros sem nenhum cliente",
      denominador: `de ${programa.total} ambientes`,
      // `sem_cliente` ESTÁ na allowlist (`filtros.ts`, `disponivel: sempre`).
      destino:
        atencao.ambienteSemCliente > 0
          ? {
              href: `${LINK_LISTA}&f=sem_cliente`,
              rotulo: "Ver os parceiros",
              ariaLabel: `Ver os ${atencao.ambienteSemCliente} parceiros sem nenhum cliente cadastrado`,
            }
          : null,
      encaminhamento: null,
    },
    // 4º — o MAIOR número, e penúltimo: difuso, conhecido, quase metade da
    // base, e em boa parte a mesma gente do bloco 3.
    {
      chave: "parceiro_sem_mensagem",
      valor: atencao.parceiroSemMensagem,
      rotulo: "Parceiros que não enviaram nenhuma mensagem",
      denominador: `de ${programa.total} ambientes`,
      // 🔴 `sem_mensagem` ainda não existe na allowlist. Ver o cabeçalho.
      destino: null,
      encaminhamento: {
        texto: "Procure em Parceiros",
        href: LINK_LISTA,
      },
    },
    // 5º — último PORQUE VALE ZERO, não por ser menos importante em tese.
    // Continua na tela: régua que some quando está em dia não é régua.
    {
      chave: "socio_pendente",
      valor: atencao.socioPendente,
      rotulo: "Convites de sócio em aberto",
      denominador: `de ${programa.total} ambientes`,
      // 🔴 Sem filtro para isto. O candidato óbvio, `f=pendencia`, é OUTRA
      // coisa — "pendência aberta no Diário" (`filtros.ts:42-47`), conjunto
      // diferente. Usá-lo abriria uma lista que não é a deste número, e o
      // admin não teria como perceber. Fica sem link até existir o filtro
      // certo. (Hoje o número é 0, então não há ninguém para procurar.)
      destino: null,
      encaminhamento:
        atencao.socioPendente > 0
          ? { texto: "Procure em Parceiros", href: LINK_LISTA }
          : null,
    },
  ];

  return (
    <section aria-labelledby="precisa-de-atencao" className="grid gap-3">
      <h2 id="precisa-de-atencao" className="sr-only">
        Quem precisa de atenção
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {blocos.map((b) => (
          <BlocoAtencao key={b.chave} {...b} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Os cortes de tempo são diferentes de propósito: favorito parado conta 7
        dias (o cliente esfriou) e o parceiro sumido conta 14 (ver o ranking de
        parceiros). São perguntas distintas.
      </p>
    </section>
  );
}

interface Bloco {
  chave: string;
  valor: number;
  rotulo: string;
  /** "de 1.701 clientes" — o vazio só é legível com o denominador ao lado. */
  denominador: string;
  destino: { href: string; rotulo: string; ariaLabel: string } | null;
  /** Para quem não tem destino: onde a pessoa procura à mão. */
  encaminhamento: { texto: string; href: string } | null;
}

/**
 * Um bloco da régua.
 *
 * 🔴 O número é **sempre `<p>`**, nunca âncora — inclusive quando existe
 * `destino`. O link é uma linha própria, com nome que diz para onde vai
 * ("Ver os parceiros"), pelo mesmo motivo que `CardDashboard` não é clicável
 * por inteiro: ampliar o alvo de clique muda o contrato do link, e número
 * grande clicável sem rótulo não diz ao teclado nem ao leitor de tela o que
 * vai acontecer.
 */
function BlocoAtencao({
  valor,
  rotulo,
  denominador,
  destino,
  encaminhamento,
}: Bloco) {
  return (
    <Card elevacao="flat">
      <CardContent className="grid gap-1">
        <p className="numero-lg font-semibold tabular-nums">{valor}</p>
        <p className="corpo-sm font-medium">{rotulo}</p>
        <p className="corpo-sm text-muted-foreground">{denominador}</p>

        {destino ? (
          <Link
            href={destino.href}
            prefetch={false}
            aria-label={destino.ariaLabel}
            className="foco-visivel -mx-2 mt-1 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
          >
            {destino.rotulo}
          </Link>
        ) : encaminhamento ? (
          // Encaminhamento, não atalho: o link leva à TELA onde se procura, e
          // o texto diz isso. Não promete o recorte que o número tem.
          <p className="mt-1 corpo-sm text-muted-foreground">
            {encaminhamento.texto} —{" "}
            <Link
              href={encaminhamento.href}
              prefetch={false}
              className="foco-visivel rounded-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
            >
              abrir
            </Link>
          </p>
        ) : (
          <p className="mt-1 corpo-sm text-muted-foreground">
            Nada pendente agora.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
