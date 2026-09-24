import Link from "next/link";

import { PERFIS_DISC } from "@/lib/etapa1";
import { formatarData } from "@/lib/datas";

/**
 * O perfil DISC como **FOLHA DE PAPEL** — uma verdade só, nas duas telas.
 *
 * Pedido literal do Marcio (24/09/2026):
 *
 * > *"na ficha do perfil DISC… deixar um pouco mais com cara de ficha mesmo.
 * > O perfil DISC dele é C, conformidade: botar o C, um C grandão, e a gente
 * > consegue dividir melhor a disposição das informações, porque para mim
 * > ficou muito feio. Como se fosse um papel com os documentos ali bem
 * > definidos."*
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 A LETRA GRANDE É A ÚNICA EXCEÇÃO — E ELA FOI PEDIDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regra da casa continua sendo **denso e chapado, hierarquia por POSIÇÃO**
 * (`03 Pessoas/Marcio - preferencia de interface`). Fonte grande para criar
 * hierarquia está entre o que ele RECUSA. O que autoriza o `numero-lg` aqui é
 * o pedido explícito ("um C grandão") e o fato de ele ser **um elemento só**:
 * a letra é o cabeçalho da folha, como o número de protocolo de um documento
 * de papel. Tudo o mais desce para `rotulo`/`corpo-sm`.
 *
 * Quem for mexer nisto: **não propagar o tamanho**. Um segundo elemento grande
 * transforma a folha no card-herói que já foi recusado uma vez. E isto NÃO é a
 * exceção da `/conduzir` (`05 Decisoes/sic-hf-excecao-visual…`) — aquela é de
 * outro produto, para tela lida de relance. Esta é lida SENTADA.
 *
 * Sem sombra, sem gradiente, sem ícone, sem cor de estado. A régua superior de
 * 2 px é a única tinta decorativa, e é o que dá "cara de documento".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SERVER COMPONENT, SEM ESTADO, SEM CONSULTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Não tem `"use client"`, não tem hook, não chama nada. Tudo chega por prop —
 * inclusive `acoes`, que é o `ReactNode` de quem chama (na ficha, o botão
 * "Ver perfil"; em `/sessoes`, o link para a ficha). Nenhum hook novo, nenhuma
 * ida ao banco: a lição de `06 Memorias/2026-09-17 - Hook com cara de local
 * esconde query` é justamente que folha reaproveitada em duas telas não pode
 * carregar dado próprio.
 *
 * ⚠️ Montado DENTRO de `ficha-aba-preliminar.tsx`, que é `"use client"`. Um
 * Server Component usado como filho de um Client Component vira parte do
 * bundle do cliente — o que não muda nada aqui, porque este arquivo não tem
 * estado nem efeito: é markup puro. O que importa é que ele **não introduz**
 * consulta nem hook em nenhuma das duas casas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 "Perfil DISC" É CONTRATO COM A SUÍTE E2E — NÃO RENOMEAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `e2e/entrevista-previa.spec.ts:137` procura `/perfil disc/i` na folha 2 da
 * ficha para provar que a feature tem porta de entrada. O rótulo literal fica
 * no `aria-label` da região E visível no cabeçalho da folha.
 *
 * (`e2e/sessoes-equipe.spec.ts:195` também exige `role="region"` nomeada
 * "Perfil DISC", mas ancora em OUTRO componente — o `BlocoDisc` de
 * `src/components/admin/sessoes/briefing.tsx`, do briefing do admin. Este
 * arquivo não o substitui; o mesmo padrão de região nomeada foi mantido aqui
 * de propósito, para as duas telas lerem igual ao leitor de tela.)
 */

/** Identidade de cada letra — UMA frase, de condução, não de personalidade. */
const IDENTIDADE: Record<string, { nome: string; frase: string }> = {
  D: {
    nome: "Dominância",
    frase: "Decide rápido, quer o resultado antes do método e corta rodeio.",
  },
  I: {
    nome: "Influência",
    frase: "Decide pela relação e pelo exemplo de outras famílias; esquece o combinado.",
  },
  S: {
    nome: "Estabilidade",
    frase: "Decide sem pressa, precisa saber o que NÃO muda na vida dela.",
  },
  C: {
    nome: "Conformidade",
    frase: "Decide por número, documento e método; desconfia de promessa sem base.",
  },
};

/** Texto que só conta como preenchido depois do `trim`. */
function preenchido(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Um bloco titulado do corpo da folha.
 *
 * 🔑 O texto de `gerarRelatorio` vem em FRASES CORRIDAS juntadas por espaço
 * (`partes.join(" ")` em `entrevista-previa-calculo.ts`) — não é bullet e não
 * tem separador. Mas os mesmos campos são editáveis à mão no `DiscDialogo`
 * (Textarea de 2000 caracteres), e aí a doutora escreve com quebras de linha.
 * Por isso: quebrou em 2+ linhas → vira `<ul>`; linha única → parágrafo.
 * Nunca inventar bullet onde o autor escreveu um parágrafo.
 */
function BlocoDaFolha({
  titulo,
  texto,
}: {
  titulo: string;
  texto: string | null;
}) {
  const linhas = texto
    ? texto
        .split("\n")
        .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
        .filter((l) => l !== "")
    : [];

  return (
    <div className="grid content-start gap-1.5 px-3 py-3">
      <h3 className="rotulo text-muted-foreground">{titulo}</h3>
      {linhas.length === 0 ? (
        // 🔴 Campo vazio NÃO some aqui, ao contrário de `DiscDoCliente`: numa
        // folha de 3 colunas, sumir deixaria buraco e a folha perderia a
        // simetria de documento. Some o VALOR, fica o rótulo com a frase de
        // ausência — que é informação ("ninguém preencheu"), não defeito.
        <p className="corpo-sm text-muted-foreground">Não preenchido.</p>
      ) : linhas.length === 1 ? (
        <p className="corpo-sm">{linhas[0]}</p>
      ) : (
        <ul className="grid gap-1">
          {linhas.map((l, i) => (
            <li key={i} className="corpo-sm">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiscFicha({
  perfilDisc,
  consciencia,
  gatilhos,
  relacionamento,
  atualizadoEm = null,
  porEntrevista = false,
  qtdDecisores = null,
  nomesDecisores = [],
  exigeTodos = false,
  acoes = null,
  href = null,
}: {
  /** `gps.etapa1_clientes.perfil_disc` — a letra. `null`/"" = não apurado. */
  perfilDisc: string | null;
  consciencia: string | null;
  gatilhos: string | null;
  relacionamento: string | null;
  /**
   * `disc_atualizado_em` (ISO). `null` = a tela que chama NÃO LÊ essa coluna
   * (é o caso de `/sessoes`, cujo `select` não a pede) — e aí a linha some.
   * Ausência de dado nunca vira data inventada.
   */
  atualizadoEm?: string | null;
  /**
   * A origem: `true` quando se sabe que a letra veio da Entrevista Prévia.
   * 🔴 `false` NÃO significa "veio à mão" — significa "não dá para afirmar".
   * Por isso o `false` omite a frase inteira em vez de escrever outra origem.
   */
  porEntrevista?: boolean;
  /** Decisores registrados. `null` = não sabemos (a RPC não foi chamada). */
  qtdDecisores?: number | null;
  /** Nomes, quando a tela os tem. Lista vazia = só o número entra. */
  nomesDecisores?: string[];
  /** A trava da Reunião Preliminar (`exige_todos` da RPC). */
  exigeTodos?: boolean;
  /**
   * A ação que a tela que chama já oferecia — o botão "Ver perfil" na ficha.
   * 🔴 NÃO criar ação nova aqui: ampliar ou inventar alvo de clique muda o
   * contrato do link (lição registrada). A folha só realoja o que já existia.
   */
  acoes?: React.ReactNode;
  /** Para onde mandar quem precisa preencher. `null` = não oferecer link. */
  href?: string | null;
}) {
  const letra = preenchido(perfilDisc);
  const identidade = letra ? IDENTIDADE[letra.toUpperCase()] : undefined;
  // Letra fora do catálogo volta CRUA — nunca inventar rótulo para código
  // desconhecido (a mesma regra que o `SelectValue` do diálogo já cumpre).
  const nomePorExtenso =
    identidade?.nome ??
    (letra
      ? (PERFIS_DISC.find((p) => p.id === letra)?.rotulo.split("—")[1]?.trim() ??
        null)
      : null);

  const decisores =
    qtdDecisores != null && qtdDecisores > 0
      ? `${qtdDecisores} ${qtdDecisores === 1 ? "pessoa" : "pessoas"}` +
        (nomesDecisores.length > 0 ? ` · ${nomesDecisores.join(", ")}` : "")
      : null;

  /* 🔴 FOLHA TOTALMENTE VAZIA NÃO MOSTRA O CORPO — medido em Chromium, 24/09.
     Sem letra E sem nenhum dos 3 textos, o corpo renderizava três colunas
     dizendo "Não preenchido.", e a folha do estado MAIS COMUM (27 de 34
     favoritos em 23/09) lia como defeito do sistema: três campos em branco
     enfileirados parecem carregamento que falhou, não "ninguém preencheu".
     O cabeçalho já diz "ainda não apurado" e já oferece o caminho.

     ⚠️ A regra é "vazio TOTAL", não "campo a campo": com a letra apurada, o
     campo em branco CONTINUA aparecendo como "Não preenchido." (ver
     `BlocoDaFolha`). Numa folha de 3 colunas, sumir um campo isolado deixaria
     buraco e quebraria a simetria de documento — e ali a ausência é
     informação real, porque o resto do perfil existe. */
  const temAlgumTexto =
    preenchido(consciencia) !== null ||
    preenchido(gatilhos) !== null ||
    preenchido(relacionamento) !== null;
  const mostrarCorpo = letra !== null || temAlgumTexto;

  return (
    /* 🔴 `role="region"` + `aria-label` LITERAL "Perfil DISC": é marco
       navegável para leitor de tela e é o contrato com a suíte E2E. O rótulo
       também aparece VISÍVEL no cabeçalho — nome acessível que só existe em
       atributo esconde da vista o que o teste enxerga. */
    <section
      role="region"
      aria-label="Perfil DISC"
      data-slot="disc-ficha"
      /* A "folha": fundo de card, borda fina, canto de 8 px. Sem sombra e sem
         gradiente — papel não brilha. `overflow-hidden` para a régua de 2 px
         não vazar do canto arredondado. */
      className="overflow-hidden rounded-md border border-borda-fina bg-card"
    >
      {/* A RÉGUA DA FOLHA — 2 px, cor de marca DECORATIVA (`--primary`, o
          laranja claro do logo, que o próprio globals.css reserva para régua e
          chip). Não é cor de estado: não muda com a letra, não alerta nada.
          `aria-hidden` porque não carrega significado. */}
      <div aria-hidden className="h-0.5 bg-primary" />

      {/* ═══ CABEÇALHO DA FOLHA ═══════════════════════════════════════════
          Hierarquia por POSIÇÃO: a letra à esquerda, a identidade ao lado, a
          procedência abaixo, a ação no canto direito. Uma linha só em desktop.
          `items-start` e não `items-baseline`: com 72 px ao lado de 12 px, a
          linha de base alinhada joga o rótulo para o meio da letra. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-borda-fina px-3 py-3">
        <div className="flex min-w-0 items-start gap-3">
          {letra ? (
            /* O "C grandão". `numero-lg` é a utility da casa (30 px) e aqui ele
               é escalado por `text-[…]` — proibido? Não: a regra é ZERO
               `text-*` CUSTOM de COR/família. O tamanho vem em `rem` para
               acompanhar a escala de texto que o usuário escolhe (14/16/18),
               que é a trava de acessibilidade da Fase 8. 3,5rem = 56 px em
               390; 4,5rem = 72 px a partir de `sm`. */
            <span
              aria-hidden
              className="numero-lg shrink-0 text-[3.5rem] leading-none sm:text-[4.5rem]"
            >
              {letra.toUpperCase()}
            </span>
          ) : null}

          <div className="grid min-w-0 gap-0.5">
            <h2 className="rotulo text-muted-foreground">Perfil DISC</h2>
            {letra ? (
              <>
                <p className="titulo-h2">
                  {/* A letra grande é `aria-hidden`; aqui o leitor de tela
                      recebe o par completo, uma vez só. */}
                  {letra.toUpperCase()}
                  {nomePorExtenso ? ` — ${nomePorExtenso}` : null}
                </p>
                {identidade ? (
                  <p className="corpo-sm text-muted-foreground">
                    {identidade.frase}
                  </p>
                ) : null}
                {atualizadoEm ? (
                  <p className="corpo-sm text-muted-foreground">
                    Apurado em {formatarData(atualizadoEm)}
                    {porEntrevista ? " pela Entrevista Prévia" : null}
                  </p>
                ) : null}
              </>
            ) : (
              /* 🔴 27 de 34 favoritos caem AQUI (medido em 23/09): é o estado
                 MAIS COMUM, não a exceção. Nunca um traço sozinho, nunca uma
                 letra padrão. */
              <>
                <p className="titulo-h2 text-muted-foreground">
                  Perfil DISC ainda não apurado
                </p>
                {href ? (
                  <p className="corpo-sm">
                    <Link
                      href={href}
                      className="foco-visivel rounded-xs font-medium text-accent-foreground underline underline-offset-2 hover:no-underline"
                    >
                      Preencher na ficha do cliente
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* A ação que já existia na tela que chama — realojada, não criada. */}
        {acoes ? <div className="shrink-0">{acoes}</div> : null}
      </div>

      {/* ═══ CORPO — 3 BLOCOS NA MESMA FOLHA ══════════════════════════════
          `md:grid-cols-3` lado a lado; empilhado em 390. A divisória troca de
          eixo com o layout (`divide-y` empilhado → `divide-x` em linha), que é
          o que dá o desenho de documento com os campos "bem definidos". O
          `divide-*` mora no PAI: borda por filho erraria a primeira célula de
          cada eixo, e é justamente o tipo de detalhe que só aparece pintado. */}
      {mostrarCorpo ? (
        <div className="grid divide-y divide-borda-fina md:grid-cols-3 md:divide-x md:divide-y-0">
          <BlocoDaFolha
            titulo="Como ele decide"
            texto={preenchido(consciencia)}
          />
          <BlocoDaFolha titulo="O que o move" texto={preenchido(gatilhos)} />
          <BlocoDaFolha
            titulo="Como se relacionar"
            texto={preenchido(relacionamento)}
          />
        </div>
      ) : null}

      {/* ═══ RODAPÉ — DECISORES E A TRAVA ═════════════════════════════════
          🔴 `qtdDecisores == null` (modo assistência, sem a RPC) não mostra
          NADA. Ausência de dado não vira afirmação de que não há decisor.
          🔴 O aviso da trava é TEXTO, não badge e não ícone — e sai da
          `exigeTodos` da RPC, não de `qtd > 1` calculado aqui. */}
      {decisores || exigeTodos ? (
        <div className="grid gap-0.5 border-t border-borda-fina px-3 py-2">
          {decisores ? (
            <p className="corpo-sm flex flex-wrap items-baseline gap-x-2">
              <span className="rotulo text-muted-foreground">Quem decide</span>
              <span className="min-w-0">{decisores}</span>
            </p>
          ) : null}
          {exigeTodos ? (
            <p className="corpo-sm text-accent-foreground">
              A Reunião Preliminar exige todos os decisores presentes.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
