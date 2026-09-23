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
 * Server Component, 0 KB de JS.
 */
export function PrecisaDeAtencao({ dados }: { dados: Dashboard }) {
  const { atencao, programa, clientes } = dados;

  const blocos: Bloco[] = [
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
