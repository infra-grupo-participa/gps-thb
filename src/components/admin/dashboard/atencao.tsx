import Link from "next/link";

import { Barras } from "@/components/ui/graficos";
import type { Dashboard, ResumoAtendimento, ResumoClientes30 } from "@/lib/data/dashboard";
import { LINK_CLIENTES, LINK_LISTA, TOM_DA_FASE, diaCurto } from "./tipos";
import { FASES_CLIENTE } from "@/lib/etapa1";

/**
 * **Quem precisa de atenção** (`?vis=atencao`) — a fila da equipe, em duas
 * seções: **Parceiros** e **Clientes**.
 *
 * 🔑 **23/09/2026: a sub-aba ganhou os números que o redesenho das 3 zonas
 * expulsou de "O programa".** Ela já era *"quem precisa de atenção"*; o que
 * mudou é que os sinais de risco que viviam como card no dashboard vieram
 * para cá em vez de sumir. Origem de cada um:
 *
 * | veio de | virou |
 * |---|---|
 * | KPI "ativos 30 dias" (`faixa-kpis`) | REMOVIDO em 23/09 — duplicava "Sem acessar 30+ dias" |
 * | pares do KPI "clientes cadastrados" | "sem nenhum cliente" · "no meio dos 30" |
 * | card "acesso ao portal" (`graficos`) | "sem login" |
 * | card "onboarding" (`graficos`) | "onboarding parado há 7+ dias" |
 * | card "atividade 30 dias" (`graficos`) | o desenho de atividade |
 * | KPI "em fechamento" (`faixa-kpis`) | seção Clientes |
 * | card "passos marcados" (`caminho`) | seção Clientes |
 * | card "marcos até a reunião" (`caminho`) | seção Clientes |
 * | card "fase dos clientes" (`caminho`) | seção Clientes |
 * | card "esperando a equipe" (`fila`) | régua de 4 linhas — **estava duplicado** |
 *
 * 🔴 **DOIS DENOMINADORES, e cada SEÇÃO escreve o seu UMA vez, no título.**
 * A seção Parceiros é sobre ~148 ambientes; a seção Clientes é sobre ~1.704
 * clientes. Antes cada card repetia o próprio denominador e a tela dizia "de
 * 148" nove vezes e "de 1.704" quatro. Ler o percentual de um com o
 * denominador do outro é o erro que a separação em seções existe para
 * impedir — e ela o impede melhor do que treze repetições.
 *
 * 🔴 **Sem card, sem ícone, sem parágrafo.** Rótulo ≤ 3 palavras · valor ·
 * link. As frases de metodologia que vinham nos `contexto=` dos cards antigos
 * estão nos comentários deste arquivo.
 *
 * 🔴 **Todo `href` migrou junto com o número.** Os filtros que só tinham porta
 * de entrada no dashboard continuam alcançáveis daqui: `ativos30`, `inativos`,
 * `sem_login`, `onb_nao`, `sem_cliente`, `clientes_incompleto`,
 * `tem_fechamento`, `pendencia`, `chamado`, `sem_nota`. Nenhum valor fora da
 * allowlist de `alunos-ativos-lista/estado-na-url.ts`.
 *
 * ── As 5 réguas originais, e a ORDEM delas ──
 *
 * 🔑 **A ORDEM É POR GRAVIDADE, FIXA NO CÓDIGO** (23/09/2026). Antes era a
 * ordem em que as réguas foram escritas, que não significa nada.
 *
 * 🔴 **Gravidade NÃO é o valor bruto, e por isso a ordem não é calculada.**
 * Os números contam coisas diferentes sobre denominadores diferentes; somar ou
 * ponderar isso produziria um "score" que é peso arbitrário disfarçado de
 * aritmética — pior que ordem fixa assumida, porque parece objetivo. Não há
 * prazo, meta por indicador nem capacidade no sistema que sustentasse
 * fórmula. Então: ordem fixa, escrita à mão, com a razão ao lado de cada uma.
 *
 * O critério, em uma pergunta: **há data marcada com terceiro, e o estrago se
 * desfaz?**
 *
 * 1. **Reunião marcada sem entrevista prévia** — o único com **data marcada e
 *    cliente do outro lado**. A reunião acontece com ou sem preparo, e a
 *    equipe chega despreparada na frente do cliente do parceiro. **Passada a
 *    data, não se corrige.** Tem janela, e a janela fecha sozinha.
 * 2. **Favoritos parados há 7+ dias** — o menor número, em segundo. É o
 *    cliente que o parceiro escolheu para a equipe acompanhar, esfriando:
 *    dano progressivo sobre um relacionamento específico.
 * 3. **Parceiros sem nenhum cliente** — o parceiro não começou. Grave e
 *    numeroso, mas **estável**: quem não começou hoje continua podendo começar
 *    amanhã. É o passo mais básico do programa — sem cliente, nenhuma outra
 *    régua chega a existir para essa pessoa.
 * 4. **Parceiros sem nenhuma mensagem** — o maior número, e penúltimo.
 *    Problema **difuso e já conhecido**: quase metade da base, e um número que
 *    descreve a norma não é alerta, é retrato. É em larga medida subconjunto
 *    do item 3 (quem não tem cliente não teria a quem mandar mensagem).
 * 5. **Convites de sócio em aberto** — último **porque vale zero**, não por
 *    ser menos importante em tese. Zero à vista, nunca escondido: régua que
 *    some quando está em dia não é régua.
 *
 * ⚠️ A posição 5 é a única que depende do VALOR. Se `socioPendente` deixar de
 * ser zero, ele volta para perto do item 2 — e aí a ordem deixa de ser
 * constante e passa a precisar de uma regra escrita. **Hoje não precisa**, e
 * resolver antecipadamente um caso que não existe seria a fórmula que esta
 * nota acabou de recusar.
 *
 * 🔴 **Dois números NÃO têm destino, e têm de PARECER que não têm.**
 * `favoritoParado` e `reuniaoSemEntrevista` falam de CLIENTES, e a lista
 * clicável do painel é de PARCEIROS; o alvo correto exigiria um parâmetro que
 * `/admin/clientes` ainda não aceita. Ficam como TEXTO: sem sublinhado, sem
 * `cursor: pointer`, sem cor de link. **Número que parece link e não funciona
 * destrói a confiança nos links que funcionam** — e um `href` com filtro fora
 * da allowlist é pior: ele é descartado no parse e abre a lista CHEIA, em
 * silêncio, fazendo a tela mentir sobre o recorte. `parceiroSemMensagem` fica
 * sem link pelo mesmo motivo: `sem_mensagem` ainda não está em `FILTROS`.
 *
 * ⚠️ Os cortes de tempo são diferentes de propósito: favorito parado conta 7
 * dias (o cliente esfriou), o parceiro sumido conta 14 (ver o ranking) e a
 * inatividade conta 30. São perguntas distintas, e é por isso que cada rótulo
 * carrega o próprio prazo em vez da palavra nua "parado".
 *
 * Server Component, 0 KB de JS.
 */
export function PrecisaDeAtencao({
  dados,
  atendimento,
  clientes30,
  ambientesCarregados,
}: {
  dados: Dashboard;
  /** `resumoAtendimento(...)`, pura, sobre o lote carregado. */
  atendimento: ResumoAtendimento;
  /** `resumoClientes30(alunos)`, pura, sobre o lote carregado. */
  clientes30: ResumoClientes30;
  /** O escopo das duas réguas puras (`atendimento` e `clientes30`). */
  ambientesCarregados: number;
}) {
  const {
    atencao,
    programa,
    clientes,
    acesso,
    onboarding,
    honorarios,
    passos,
    caminho,
  } = dados;

  /**
   * 🔴 **ORDEM = GRAVIDADE.** A justificativa de cada posição está no
   * cabeçalho. **Não reordenar por valor bruto** — foi exatamente o que esta
   * ordem recusa.
   *
   * As 4 primeiras são as réguas originais; da 6ª em diante são os sinais que
   * migraram do dashboard, e eles entram DEPOIS porque nenhum tem janela que
   * feche sozinha: são estados estáveis (não entrou, não respondeu, parou),
   * não dano em curso.
   */
  const blocosParceiros: Bloco[] = [
    // 1º — tem DATA MARCADA e cliente do outro lado. Passada a data, não se
    // corrige. (Denominador é de CLIENTES: a exceção da seção, e por isso é o
    // único da lista que escreve o próprio.)
    {
      chave: "reuniao_sem_entrevista",
      valor: atencao.reuniaoSemEntrevista,
      rotulo: "Reunião sem entrevista",
      excecaoDenominador: `de ${clientes.total} clientes`,
      destino: null,
      encaminhamento: { texto: "Procure em Clientes", href: LINK_CLIENTES },
    },
    // 2º — o menor número, e mesmo assim em segundo: dano PROGRESSIVO sobre
    // um cliente específico que o parceiro escolheu.
    {
      chave: "favorito_parado",
      valor: atencao.favoritoParado,
      rotulo: "Favoritos parados 7d",
      excecaoDenominador: `de ${clientes.total} clientes`,
      destino: null,
      encaminhamento: { texto: "Procure em Clientes", href: LINK_CLIENTES },
    },
    // 3º — o parceiro não começou. Grave, mas ESTÁVEL. Único com link direto.
    // 🔑 Veio TAMBÉM do par "Sem nenhum cliente" do KPI "Clientes
    // cadastrados": o mesmo conjunto, que estava em dois lugares.
    {
      chave: "ambiente_sem_cliente",
      valor: atencao.ambienteSemCliente,
      rotulo: "Sem nenhum cliente",
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
    // 4º — o MAIOR número, e penúltimo entre as originais: difuso, conhecido,
    // e em boa parte a mesma gente do bloco 3.
    // 🔴 `sem_mensagem` ainda não existe na allowlist. Ver o cabeçalho.
    {
      chave: "parceiro_sem_mensagem",
      valor: atencao.parceiroSemMensagem,
      rotulo: "Sem nenhuma mensagem",
      destino: null,
      encaminhamento: { texto: "Procure em Parceiros", href: LINK_LISTA },
    },
    // ── Migrados do dashboard (23/09/2026) ──
    // 🔑 "No meio dos 30" era par do KPI "Clientes cadastrados". É fila: o
    // parceiro começou a ficha e parou no meio.
    {
      chave: "clientes_incompleto",
      valor: clientes30.noMeioDos30,
      rotulo: "No meio dos 30",
      destino:
        clientes30.noMeioDos30 > 0
          ? {
              href: `${LINK_LISTA}&f=clientes_incompleto`,
              rotulo: "Ver os parceiros",
              ariaLabel: `Ver os ${clientes30.noMeioDos30} parceiros no meio dos 30 clientes`,
            }
          : null,
      encaminhamento: null,
    },
    // 🔴 REMOVIDO em 23/09/2026 (achado do João, 2ª rodada): este bloco
    // ("Parados há 30+ dias", `acesso.semAcesso30d`, vindo da RPC) duplicava
    // a pergunta de "Sem acessar 30+ dias" (`esperandoAEquipe`,
    // `atendimento.semAcesso30d`) com o MESMO link (`&f=inativos`) e um
    // NÚMERO DIFERENTE — porque as duas fontes usam definições diferentes de
    // "sem acesso": `acesso.semAcesso30d` (RPC) é `ultimo_acesso is not null
    // and < now() - 30d`, que EXCLUI quem nunca entrou; o filtro `inativos`
    // (`filtros.ts`, o que o link de fato abre) é `!ultimoAcesso || < corte`,
    // que INCLUI quem nunca entrou (`diasSemAcesso` devolve `Infinity` para
    // `null`). Duas réguas, dois números, um clique — e o que sobrevive é o
    // que bate com o próprio link. O encaminhamento "Ativos N → f=ativos30"
    // que vivia aqui foi para a linha "Sem acessar 30+ dias" abaixo.
    // 🔑 Era o card "Acesso ao portal" (rosca, depois barra). A régua da Zona
    // 1 absorveu "já entraram"; o que sobra e pede ação é quem NÃO consegue
    // usar o produto.
    {
      chave: "sem_login",
      valor: acesso.semLogin,
      rotulo: "Sem login",
      destino:
        acesso.semLogin > 0
          ? {
              href: `${LINK_LISTA}&f=sem_login`,
              rotulo: "Ver sem login",
              ariaLabel: `Ver os ${acesso.semLogin} parceiros sem login`,
            }
          : null,
      encaminhamento: null,
    },
    // 🔑 Era o card "Onboarding". A régua da Zona 1 absorveu "onboarding ok";
    // aqui fica a fila — quem começou e travou, e quem nunca respondeu.
    {
      chave: "onb_parado",
      valor: onboarding.parados7d,
      rotulo: "Onboarding parado 7d",
      destino: null,
      encaminhamento: {
        texto: `Não responderam ${onboarding.naoIniciados}`,
        href: `${LINK_LISTA}&f=onb_nao`,
      },
    },
    // 5º das originais — último PORQUE VALE ZERO, não por ser menos
    // importante em tese. Continua na tela: régua que some quando está em dia
    // não é régua.
    // 🔴 Sem filtro para isto. O candidato óbvio, `f=pendencia`, é OUTRA coisa
    // ("pendência aberta no Diário", conjunto diferente) — usá-lo abriria uma
    // lista que não é a deste número, e o admin não teria como perceber.
    {
      chave: "socio_pendente",
      valor: atencao.socioPendente,
      rotulo: "Convites em aberto",
      destino: null,
      encaminhamento:
        atencao.socioPendente > 0
          ? { texto: "Procure em Parceiros", href: LINK_LISTA }
          : null,
    },
  ];

  /**
   * "Esperando a equipe" — as 4 linhas que eram card próprio em `fila.tsx`.
   *
   * 🔴 **Quatro números, nunca a soma.** Pendência do Diário é um combinado
   * que a equipe anotou; chamado é uma mensagem do parceiro esperando
   * resposta; "sem nota" e "sem acessar" são ausências. Unidades diferentes
   * somadas viram um total que não existe em lugar nenhum.
   *
   * 🔑 O número é a contagem de AMBIENTES (o que a lista filtrada vai
   * mostrar), não a de itens: um ambiente com 3 pendências abertas mostrava
   * "3" e a lista trazia 1 card (consertado em 15/09/2026).
   *
   * ⚠️ Estes 4 valem sobre o LOTE carregado, não sobre a base inteira — o
   * rodapé da seção diz isso quando o lote é parcial.
   */
  const esperandoAEquipe = [
    {
      rotulo: "Pendências do Diário",
      valor: atendimento.ambientesComPendencia,
      href: `${LINK_LISTA}&f=pendencia`,
    },
    {
      rotulo: "Chamados abertos",
      valor: atendimento.ambientesComChamado,
      href: `${LINK_LISTA}&f=chamado`,
    },
    {
      rotulo: "Sem nota no Diário",
      valor: atendimento.semNenhumaNota,
      href: `${LINK_LISTA}&f=sem_nota`,
    },
    {
      rotulo: "Sem acessar 30+ dias",
      valor: atendimento.semAcesso30d,
      href: `${LINK_LISTA}&f=inativos`,
      // 🔑 Herdado do bloco "Parados há 30+ dias" (RPC) removido acima: é o
      // conjunto OPOSTO (`ativos30`), para continuar alcançável a partir
      // daqui — mesma regra da RPC, sem o número duplicado.
      encaminhamento: { texto: `Ativos ${acesso.ativos30d}`, href: `${LINK_LISTA}&f=ativos30` },
    },
  ];

  /** Atividade no portal — era o card "Atividade nos últimos 30 dias". */
  const atividade = dados.atividade.map((d) => ({
    dia: diaCurto(d.dia),
    aluno: d.aluno,
    equipe: d.equipe,
  }));
  const totalAtividade = atividade.reduce((s, d) => s + d.aluno + d.equipe, 0);

  /** O denominador da seção Clientes, da mesma consulta dos numeradores. */
  const totalClientes = passos.total;

  /** As três fases — escada de estado real, uma fase por cliente. */
  const porFase = [
    { fase: "prospeccao" as const, valor: caminho.prospeccao },
    { fase: "fechamento" as const, valor: caminho.fechamento },
    { fase: "contratado" as const, valor: caminho.contratado },
  ].map((f) => ({
    fase: f.fase,
    rotulo: FASES_CLIENTE.find((x) => x.id === f.fase)?.rotulo ?? f.fase,
    valor: f.valor,
    tom: TOM_DA_FASE[f.fase],
  }));
  const totalNasFases =
    caminho.prospeccao + caminho.fechamento + caminho.contratado;

  const parcial = ambientesCarregados < programa.total;

  return (
    <section aria-labelledby="precisa-de-atencao" className="grid gap-8">
      <h2 id="precisa-de-atencao" className="sr-only">
        Quem precisa de atenção
      </h2>

      {/* ═══════════ SEÇÃO 1 · PARCEIROS ═══════════
          🔴 O denominador da seção está NO TÍTULO, uma vez. Os blocos não o
          repetem — exceto os dois que são sobre clientes e por isso escrevem a
          exceção (ver `excecaoDenominador`). */}
      <section aria-labelledby="atencao-parceiros" className="grid gap-3">
        <div className="flex items-baseline gap-3 border-b border-borda-fina pb-1">
          <h3 id="atencao-parceiros" className="rotulo text-foreground">
            Parceiros
          </h3>
          <p className="corpo-sm text-muted-foreground">
            de {programa.total} parceiros
          </p>
        </div>

        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {blocosParceiros.map((b) => (
            <BlocoAtencao key={b.chave} {...b} />
          ))}
        </div>

        {/* Esperando a equipe — 4 linhas, cada uma o próprio link. Era card
            próprio e ESTAVA DUPLICADO: é literalmente a definição desta
            sub-aba. */}
        <div className="grid gap-1 pt-2">
          <h4 className="rotulo text-muted-foreground">Esperando a equipe</h4>
          <ul className="grid gap-0.5 sm:grid-cols-2 xl:grid-cols-4">
            {esperandoAEquipe.map((l) => (
              <li key={l.href} className="grid">
                <Link
                  href={l.href}
                  prefetch={false}
                  aria-label={`${l.rotulo}: ${l.valor}`}
                  className="foco-visivel -mx-2 flex min-h-11 items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-superficie-afundada"
                >
                  <span className="corpo text-muted-foreground">
                    {l.rotulo}
                  </span>
                  {/* 🔑 O ZERO É UMA BOA NOTÍCIA: as quatro linhas são
                      TRABALHO PENDENTE, então 0 significa "nada esperando".
                      Verde apagado (é ausência de trabalho, não conquista); o
                      resto em cor de texto cheia. */}
                  <span
                    className={
                      l.valor === 0
                        ? "numero shrink-0 font-semibold tabular-nums text-sucesso-foreground/55"
                        : "numero shrink-0 font-semibold tabular-nums text-foreground"
                    }
                  >
                    {l.valor}
                  </span>
                </Link>
                {/* Encaminhamento ao conjunto OPOSTO — só a linha herdada da
                    RPC removida tem um. Mesmo padrão de `BlocoAtencao`: link
                    nomeado, não número clicável. */}
                {l.encaminhamento ? (
                  <Link
                    href={l.encaminhamento.href}
                    prefetch={false}
                    className="foco-visivel -mx-2 justify-self-start rounded-md px-2 py-0.5 corpo-sm text-muted-foreground underline-offset-4 hover:bg-superficie-afundada hover:underline"
                  >
                    {l.encaminhamento.texto}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {/* Atividade no portal — ritmo, não fila: sem link, de propósito. Não
            há "eventos suficientes" definido em lugar nenhum, então o número
            não é bom nem ruim por si. */}
        <div className="grid gap-1 pt-2">
          <div className="flex items-baseline gap-3">
            <h4 className="rotulo text-muted-foreground">Atividade 30 dias</h4>
            <p className="numero font-semibold tabular-nums">
              {totalAtividade}
            </p>
            <p className="corpo-sm text-muted-foreground">eventos no portal</p>
          </div>
          {atividade.length === 0 ? (
            <p className="corpo-sm text-muted-foreground">
              sem eventos no período
            </p>
          ) : (
            <Barras
              dados={atividade.map((d) => ({
                rotulo: d.dia,
                valor: d.aluno + d.equipe,
              }))}
              tom="marca"
              altura={120}
              mostrarLegenda={false}
              resumo={`Eventos por dia nos últimos 30 dias: ${atividade
                .map((d) => `${d.dia} ${d.aluno + d.equipe}`)
                .join(", ")}.`}
            />
          )}
        </div>

        {parcial ? (
          <p className="corpo-sm text-muted-foreground">
            Fila e atividade sobre {ambientesCarregados} de {programa.total}{" "}
            ambientes carregados.
          </p>
        ) : null}
      </section>

      {/* ═══════════ SEÇÃO 2 · CLIENTES ═══════════
          🔴 OUTRO DENOMINADOR (~1.704 clientes), escrito UMA vez no título.
          Nenhuma barra abaixo repete o "de 1.704": todas saem de
          `total={totalClientes}` ou `total={totalNasFases}`, e o `%` de cada
          linha responde a este denominador. */}
      <section aria-labelledby="atencao-clientes" className="grid gap-3">
        <div className="flex items-baseline gap-3 border-b border-borda-fina pb-1">
          <h3 id="atencao-clientes" className="rotulo text-foreground">
            Clientes
          </h3>
          <p className="corpo-sm text-muted-foreground">
            de {totalClientes} clientes
          </p>
        </div>

        {/* Em fechamento — era KPI de `faixa-kpis.tsx`.
            🔴 "Contratados" NÃO é submétrica de "em fechamento": é a fase
            SEGUINTE, um conjunto à parte. Por isso são duas linhas irmãs, não
            um número dentro do outro. */}
        <div className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-3">
              <h4 className="rotulo text-muted-foreground">Em fechamento</h4>
              <p className="numero numero-lg font-semibold tabular-nums">
                {clientes.fechamento}
              </p>
              <p className="corpo-sm text-muted-foreground">
                contratados {honorarios.clientesContratados}
              </p>
            </div>
            <div className="flex items-baseline gap-4">
              <Link
                href={`${LINK_CLIENTES}?fase=fechamento`}
                prefetch={false}
                aria-label={`Ver os ${clientes.fechamento} clientes em fechamento`}
                className="foco-visivel -mx-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
              >
                Ver em fechamento
              </Link>
              {/* O filtro de PARCEIROS com fechamento em aberto só tinha porta
                  de entrada neste KPI — migra junto, senão `tem_fechamento`
                  fica órfão. */}
              <Link
                href={`${LINK_LISTA}&f=tem_fechamento`}
                prefetch={false}
                aria-label="Ver os parceiros com cliente em fechamento"
                className="foco-visivel -mx-2 rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
              >
                Ver os parceiros
              </Link>
            </div>
          </div>
        </div>

        {/* Fases — escada de estado REAL: cada cliente está em uma fase só, e
            as três somam o total. Não é funil mesmo assim: quem está em
            fechamento SAIU da prospecção, não é subconjunto dela, e nenhuma
            taxa de passagem é calculada. O `%` é sobre `totalNasFases`. */}
        <SubBloco titulo="Fases">
          <Barras
            orientacao="horizontal"
            total={totalNasFases}
            dados={porFase.map((f) => ({
              rotulo: f.rotulo,
              valor: f.valor,
              tom: f.tom,
              href: `${LINK_CLIENTES}?fase=${f.fase}`,
              ariaLabel: `Ver os ${f.valor} clientes na fase ${f.rotulo.toLowerCase()}`,
            }))}
            resumo={`Clientes por fase, cada um em uma fase só, de ${totalNasFases}: ${porFase.map((f) => `${f.rotulo} ${f.valor}`).join(", ")}.`}
          />
        </SubBloco>

        {/* Passos da ficha.
            🔴 **NÃO É FUNIL, e por isso não desenha funil.** Os quatro passos
            (mensagem · estudo · ligação · aderiu) são marcados de forma
            INDEPENDENTE — `cliente-ficha.tsx` são três `useState` sem
            `disabled` encadeado, dá para marcar "ligação" sem nunca ter
            marcado "mensagem". Logo `estudo` não é subconjunto de `mensagem`,
            e escrever "de 117 que receberam mensagem, 18 viraram estudo" seria
            mentira: os 18 não saíram dos 117. Barras PARALELAS, com o mesmo
            denominador em todas. Se um dia a ficha encadear os passos, aí sim
            vira funil — antes, não. */}
        <SubBloco titulo="Passos da ficha">
          <Barras
            orientacao="horizontal"
            total={totalClientes}
            dados={[
              { rotulo: "Mensagem enviada", valor: passos.mensagem, tom: "marca" },
              { rotulo: "Estudo de caso", valor: passos.estudo, tom: "marca" },
              { rotulo: "Ligação feita", valor: passos.ligacao, tom: "marca" },
              { rotulo: "Aderiu à reunião", valor: passos.aderiu, tom: "sucesso" },
            ]}
            resumo={`Passos marcados, cada um sobre os mesmos ${totalClientes} clientes e sem ordem entre eles: mensagem ${passos.mensagem}, estudo de caso ${passos.estudo}, ligação ${passos.ligacao}, aderiu à reunião ${passos.aderiu}.`}
          />
        </SubBloco>

        {/* Marcos até a reunião.
            🔴 TAMBÉM NÃO É FUNIL, e a razão só aparece contra o dado real. Os
            quatro números são `count(*)` INDEPENDENTES, cada um sobre uma
            coluna/tabela diferente: `favorito` = `acompanhado_equipe`;
            `entrevista` = linhas em `gps.entrevista_previa`; `reuniao` =
            `data_reuniao_preliminar is not null`; `aderiu` = `aderiu_reuniao`.
            Nenhum é recorte do anterior — dá para ter reunião marcada sem
            nunca ter sido favoritado. Medido com o dado de produção
            (37 · 1 · 52 · 22), o `Funil` anunciava **"5200% passam de
            entrevista prévia para reunião marcada"**: a conta de passagem só é
            honesta em cadeia de subconjunto. Mesma família dos passos, com
            rótulo mais convincente — e por isso mais perigoso.
            🔴 Sem link por linha: a lista de clientes filtra por FASE, não por
            marco (a allowlist de `clientes-programa/estado-na-url.ts` não tem
            o parâmetro). `href` fora da allowlist abriria a lista cheia em
            silêncio. */}
        <SubBloco titulo="Marcos até a reunião">
          <Barras
            orientacao="horizontal"
            total={totalClientes}
            dados={[
              { rotulo: "Favoritado pela equipe", valor: caminho.favorito, tom: "neutro" },
              { rotulo: "Entrevista prévia feita", valor: caminho.entrevista, tom: "marca" },
              { rotulo: "Reunião marcada", valor: caminho.reuniao, tom: "atencao" },
              { rotulo: "Aderiu à reunião", valor: caminho.aderiu, tom: "sucesso" },
            ]}
            resumo={`Marcos do caminho, cada um contado à parte sobre os mesmos ${totalClientes} clientes: favoritado ${caminho.favorito}, entrevista prévia ${caminho.entrevista}, reunião marcada ${caminho.reuniao}, aderiu ${caminho.aderiu}.`}
          />
        </SubBloco>
      </section>
    </section>
  );
}

/** Título de até 3 palavras + desenho. Sem moldura: a separação é o espaço. */
function SubBloco({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <h4 className="rotulo text-muted-foreground">{titulo}</h4>
      {children}
    </div>
  );
}

interface Bloco {
  chave: string;
  valor: number;
  /** 🔴 Até 3 palavras. */
  rotulo: string;
  /**
   * O denominador só quando ele NÃO é o da seção — hoje, os dois blocos que
   * falam de clientes dentro da seção Parceiros. Os demais herdam o "de 148"
   * escrito no título, e não o repetem.
   */
  excecaoDenominador?: string;
  destino: { href: string; rotulo: string; ariaLabel: string } | null;
  /** Para quem não tem destino próprio: onde a pessoa procura, ou o oposto. */
  encaminhamento: { texto: string; href: string } | null;
}

/**
 * Um bloco da régua: número · rótulo · link.
 *
 * 🔴 O número é **sempre `<p>`**, nunca âncora — inclusive quando existe
 * `destino`. O link é uma linha própria, com nome que diz para onde vai
 * ("Ver os parceiros"). Ampliar o alvo de clique muda o contrato do link, e
 * número grande clicável sem rótulo não diz ao teclado nem ao leitor de tela
 * o que vai acontecer.
 *
 * 🔴 **Sem `Card`.** Era `Card elevacao="flat"` com `CardContent`; a moldura
 * era o enfeite, e com 9 blocos ela virava 9 caixas. A separação agora é o
 * `gap` da grade.
 */
function BlocoAtencao({
  valor,
  rotulo,
  excecaoDenominador,
  destino,
  encaminhamento,
}: Bloco) {
  return (
    <div className="grid content-start gap-0.5">
      <p className="numero numero-lg font-semibold tabular-nums">{valor}</p>
      <p className="corpo-sm font-medium">{rotulo}</p>
      {excecaoDenominador ? (
        <p className="corpo-sm text-muted-foreground">{excecaoDenominador}</p>
      ) : null}

      {destino ? (
        <Link
          href={destino.href}
          prefetch={false}
          aria-label={destino.ariaLabel}
          className="foco-visivel -mx-2 justify-self-start rounded-md px-2 py-1 corpo-sm font-medium text-accent-foreground hover:bg-superficie-afundada hover:underline"
        >
          {destino.rotulo}
        </Link>
      ) : encaminhamento ? (
        // Encaminhamento, não atalho: o link leva à TELA onde se procura (ou
        // ao conjunto oposto), e o texto diz qual é. Não promete o recorte que
        // o número acima tem.
        <Link
          href={encaminhamento.href}
          prefetch={false}
          className="foco-visivel -mx-2 justify-self-start rounded-md px-2 py-1 corpo-sm text-muted-foreground underline-offset-4 hover:bg-superficie-afundada hover:underline"
        >
          {encaminhamento.texto}
        </Link>
      ) : null}
    </div>
  );
}
