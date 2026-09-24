import Link from "next/link";

import { DiscDoCliente } from "@/components/sessoes/disc-do-cliente";
// Formatação PURA, por recorte de string (nenhum `new Date` sobre `date`, que
// volta um dia em São Paulo). Módulo da fatia 3, só leitura — não editado aqui.
import { horaDeTime, rotuloDoDia } from "@/components/sessoes/grade";

/**
 * ZONA 1 de `/sessoes` — **"Seu cliente e o que falta"**.
 *
 * PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md` (§7.1) e
 * `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md` (§3 fatia E).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 POR QUE ESTA ZONA EXISTE, E POR QUE ELA VEM SEMPRE — INCLUSIVE SEM HORÁRIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Até 24/09 o aviso de DISC e a trava dos decisores viviam DENTRO do ramo
 * `horarios.length > 0` de `page.tsx`. Ou seja: eles só apareciam para quem já
 * podia marcar. E o estado vazio é o CASO COMUM desta tela (medido em 22/09,
 * §9-ter B3: **34 elegíveis para 4 blocos por semana**) — então o parceiro que
 * mais precisava saber o que fazer enquanto espera era exatamente o único que
 * **nunca lia** as duas frases. A informação ficava escondida atrás de uma
 * condição que ele não controlava.
 *
 * Aqui elas sobem para o topo e aparecem SEMPRE. Sem horário publicado, esta
 * zona é a única coisa acionável da tela: é o que ele pode adiantar hoje.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 AVISA, NÃO BLOQUEIA (decisão do Marcio, 22/09)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regra dele é *"com o DISC pronto, agenda-se a Reunião Preliminar"* — e
 * medido naquele dia: **só 7 de 35 clientes favoritados tinham a letra**.
 * Bloquear fecharia a etapa para 28 parceiros e a tela carregaria vazia, sem
 * erro nenhum.
 *
 * Por isso o texto desta zona é redigido como **lista de pendências com
 * atalho**, nunca como catraca: nenhum "você precisa antes de", nenhum "não é
 * possível marcar até". O ✗ diz o que falta e leva ao lugar de resolver; a
 * Zona 2 continua oferecendo a grade do mesmo jeito.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SERVER COMPONENT, SEM ESTADO E SEM NENHUMA CONSULTA NOVA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nenhum `"use client"`, nenhum hook, nenhuma ida ao banco. Tudo chega por
 * prop, do `Promise.all` que a página já fazia. A lição de
 * `06 Memorias/2026-09-17 - Hook com cara de local esconde query` é literal:
 * `useXxx()` com nome de leitura de estado pode ser `fetch`, e folha que
 * renderiza por estado da tela não pode carregar dado próprio.
 *
 * 🔑 A linha **Entrevista Prévia** é DERIVADA, não consultada — e derivada de
 * dois fatos SEPARADOS, nunca somados num booleano. Ver `estadoDaEntrevista`
 * abaixo: a letra do DISC prova que ela ACONTECEU; a sessão viva prova que ela
 * está MARCADA. Uma consulta a `entrevista_previa` daria a mesma resposta e
 * custaria uma ida ao banco por abertura de tela: o saldo de queries da
 * feature é ZERO (§5.4).
 *
 * Denso e chapado: linhas de uma lista com borda fina, marcador textual, sem
 * card, sem ícone e sem cor de estado. Hierarquia por POSIÇÃO — esta é uma
 * tela lida SENTADO, não a exceção de relance da `/conduzir`.
 */

/**
 * Uma pendência: o rótulo, se está resolvida, o que dizer e para onde ir.
 *
 * 🔴 `ok: null` = **não deu para conferir**, e é um terceiro estado de
 * propósito. Falha de leitura e "não preenchido" são fatos diferentes; virar
 * ✗ afirmaria sobre o banco o que a consulta não soube responder — a mesma
 * mentira que este portal já pagou caro em 16/09.
 */
/**
 * O MARCADOR de uma linha — quatro estados, cada um com glifo E palavra.
 *
 * 🔴 `"marcada"` ENTROU EM 24/09 e é o conserto de uma MENTIRA. A linha da
 * Entrevista Prévia usava `ok: boolean`, e o `true` saía de
 * `sessoes.some(tipo 1)` — mas `getSessoesDoAmbiente({ estados: ["agendado"] })`
 * devolve só sessões VIVAS, isto é, **futuras**. Uma entrevista MARCADA para a
 * semana que vem saía como ✓ Feito, afirmando ocorrência, sobre uma conversa que
 * ainda não tinha acontecido. Sessão marcada e sessão feita são dois fatos, e
 * fundi-los num booleano fazia a tela afirmar o que o banco não disse.
 *
 * Os quatro, e o que CADA UM prova:
 *   `"feito"`     → há prova do fato (a letra do DISC, para a Entrevista).
 *   `"marcada"`   → há compromisso no futuro, e nada além disso.
 *   `"falta"`     → foi lido, e não há.
 *   `"a-conferir"`→ a leitura falhou. Nunca vira ✗ (a mentira de 16/09).
 */
type EstadoDaLinha = "feito" | "marcada" | "falta" | "a-conferir";

/** Glifo + palavra de cada estado. Cor NUNCA é o único portador (ver o `05 Decisoes`). */
const MARCADOR: Record<EstadoDaLinha, { glifo: string; palavra: string }> = {
  feito: { glifo: "✓", palavra: "Feito" },
  // `◷` (relógio): compromisso no futuro. A palavra "Marcada" carrega o
  // significado inteiro — em preto e branco, sem CSS ou com daltonismo, a
  // linha continua legível sem o glifo.
  marcada: { glifo: "◷", palavra: "Marcada" },
  falta: { glifo: "✗", palavra: "Falta" },
  "a-conferir": { glifo: "…", palavra: "A conferir" },
};

function Linha({
  rotulo,
  estado,
  detalhe,
  href,
  rotuloDoLink,
}: {
  rotulo: string;
  estado: EstadoDaLinha;
  detalhe: React.ReactNode;
  /** Para onde ir quando falta. `null` = não há atalho honesto a oferecer. */
  href?: string | null;
  rotuloDoLink?: string;
}) {
  const { glifo, palavra } = MARCADOR[estado];
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
      {/* 🔴 MARCADOR TEXTUAL, NUNCA SÓ COR. "✓ Feito" / "◷ Marcada" / "✗ Falta"
          carregam o significado inteiro em palavra: em preto e branco, sem CSS
          ou com daltonismo, a linha continua legível. É a mesma trava do
          `05 Decisoes/sic-hf-excecao-visual…` — cor nunca é o único portador.
          `aria-hidden` no glifo porque a palavra ao lado já é lida. */}
      <span className="w-20 shrink-0 rotulo text-muted-foreground">
        <span aria-hidden>{glifo}</span> {palavra}
      </span>
      <span className="min-w-0 flex-1 corpo">
        <span className="font-medium">{rotulo}</span>{" "}
        <span className="text-muted-foreground">— {detalhe}</span>{" "}
        {href ? (
          <Link
            href={href}
            // 🔴 O LINK É O ALVO, e só ele. Ampliar o alvo para a linha
            // inteira muda o contrato do link — já transformou 2 atalhos em
            // bug nesta casa. `inline-flex min-h-11` para o alvo tocável do
            // WCAG 2.5.8: como `inline` puro o link mede ~17 px de altura no
            // celular, e isso só aparece em navegador que pinta.
            className="foco-visivel inline-flex min-h-11 items-center rounded-xs text-accent-foreground underline underline-offset-4 hover:no-underline"
          >
            {rotuloDoLink ?? "Resolver"}
          </Link>
        ) : null}
      </span>
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ESTADO DA ENTREVISTA PRÉVIA — TRÊS FATOS SEPARADOS, NUNCA UM BOOLEANO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 O DEFEITO QUE ISTO CONSERTA (achado do joão, 24/09). A versão anterior
 * era `temEntrevista = sessoes.some(tipo 1) || letra`, e o `✓ Feito` dizia
 * que a conversa TINHA OCORRIDO. Mas `getSessoesDoAmbiente({ estados: ["agendado"] })` só
 * traz sessão **viva** — e viva, nesta tela, é FUTURA. O parceiro que marcou a
 * Entrevista para a semana que vem lia que ela já tinha acontecido, e a linha
 * sumia com o link. **✓ sem prova.**
 *
 * A separação:
 *   • **letra do DISC preenchida ⇒ `"feito"`.** É a única prova honesta que a
 *     tela tem sem consulta nova: é a Entrevista que apura o perfil (decisão
 *     do Marcio, 22/09), então a letra só existe se ela aconteceu — inclusive
 *     quando a sessão já foi realizada e saiu das vivas.
 *   • **sem letra E sessão viva de tipo 1 ⇒ `"marcada"`**, com a data e a hora
 *     do próprio agendamento. Não é ✓ (não aconteceu) e não é ✗ (não falta
 *     marcar): é um terceiro fato, e sem link, porque já está marcada.
 *   • **nada ⇒ `"falta"`**, com o link da entrevista.
 *   • **`letraDisc === undefined` (leitura falhada) ⇒ `"a-conferir"`**, a menos
 *     que haja sessão marcada — aí o compromisso é fato observado e vale mais
 *     que a leitura que caiu.
 *
 * 🔑 FUNÇÃO PURA E EXPORTADA de propósito: é o que permite provar a junção sem
 * navegador e sem banco (`e2e/sessoes-zona1.spec.ts`). Nenhuma consulta, só os
 * dados que a página já tem em mãos.
 *
 * ⚠️ O que esta derivação NÃO prova: entrevista concluída fora do sistema, sem
 * DISC preenchido e sem sessão marcada, aparece como ✗. É falso negativo
 * ACEITO — o ✗ manda para a própria entrevista, que é onde ele resolveria de
 * qualquer forma. O inverso (afirmar ✓ sem prova) mandaria a doutora para uma
 * Reunião Preliminar às cegas, e foi exatamente o que se corrigiu aqui.
 */
export function estadoDaEntrevista({
  letraDisc,
  sessaoViva,
}: {
  /** `null`/`""` = lido e vazio · `undefined` = a leitura não trouxe. */
  letraDisc: string | null | undefined;
  /** A sessão VIVA de `TIPO_ENTREVISTA_PREVIA`, se houver. */
  sessaoViva: { data: string; hora_inicio: string } | null;
}): EstadoDaLinha {
  if ((letraDisc ?? "").trim() !== "") return "feito";
  if (sessaoViva) return "marcada";
  if (letraDisc === undefined) return "a-conferir";
  return "falta";
}

export function PreRequisitos({
  clienteId,
  clienteNome,
  elegibilidadeFalhou,
  letraDisc,
  decisores,
  entrevistaViva,
  mostrarDisc,
  disc,
}: {
  /**
   * O cliente que a equipe acompanha (o favorito), de
   * `gps.sessao_pode_agendar`. `null` = não há — e essa é a primeira
   * pendência, a que destrava todas as outras.
   */
  clienteId: string | null;
  clienteNome: string | null;
  /**
   * 🔴 `gps.sessao_pode_agendar` FALHOU. Não é o mesmo que "não tem cliente":
   * dizer "você ainda não escolheu" para quem escolheu é a mentira de 16/09.
   * Com `true`, a linha do cliente vira "a conferir" e as derivadas somem.
   */
  elegibilidadeFalhou: boolean;
  /**
   * A letra do DISC do cliente elegível. `null` = não preenchida;
   * `undefined` = a leitura não trouxe (nunca vira ✗).
   */
  letraDisc: string | null | undefined;
  /**
   * `gps.cliente_decisores_pendentes`. `null` = a leitura não trouxe — NÃO é
   * "decide sozinho", por isso a linha vira "a conferir" e nunca ✗.
   */
  decisores: {
    total: number;
    decisores: { nome: string; papel: string | null; principal: boolean }[];
    exigeTodos: boolean;
    temDisc: boolean;
  } | null;
  /**
   * A sessão VIVA de Entrevista Prévia deste ambiente, ou `null`.
   *
   * 🔴 NÃO É "a entrevista aconteceu". Viva = agendada e FUTURA. Quem decide o
   * texto da linha é `estadoDaEntrevista` acima, que separa **marcada** de
   * **feita** — a fusão dos dois num booleano foi o ✓ sem prova de 24/09.
   * Vem por prop, do array `sessoes` que a página já tinha: zero consulta.
   */
  entrevistaViva: { data: string; hora_inicio: string } | null;
  /**
   * A linha do DISC só entra quando a **Reunião Preliminar** está em jogo.
   * ⚠️ Na Entrevista Prévia o DISC ainda NÃO existe por definição — é ela que
   * o gera. Cobrar a letra de quem vai fazer a entrevista seria cobrar o
   * resultado antes da causa.
   */
  mostrarDisc: boolean;
  /**
   * O DISC completo, para a folha (`DiscFicha`). `null` = a leitura falhou,
   * ou não há cliente — e aí a folha some por inteiro em vez de afirmar
   * "ainda não informado" sobre 127 clientes que TÊM a letra.
   *
   * 🔴 A folha **subiu de `MinhaSessao` para cá em 24/09**: com duas sessões
   * marcadas ela aparecia DUAS vezes na mesma tela, sobre o mesmo cliente.
   * Aqui ela existe uma vez só, ao lado das pendências que ela explica.
   */
  disc: {
    perfil_disc: string | null;
    disc_consciencia: string | null;
    disc_gatilhos: string | null;
    disc_relacionamento: string | null;
  } | null;
}) {
  const temCliente = clienteId != null;
  const rotaDaEntrevista = clienteId ? `/clientes/${clienteId}/entrevista` : null;
  const estadoEntrevista = estadoDaEntrevista({ letraDisc, sessaoViva: entrevistaViva });

  return (
    <section aria-labelledby="zona-pre-requisitos">
      <h2
        id="zona-pre-requisitos"
        className="font-heading titulo-h2 text-foreground"
      >
        Seu cliente e o que falta
      </h2>
      {/* 🔴 A LINHA DE APOIO DIZ "ADIANTA", NÃO "BLOQUEIA" (decisão de 22/09).
          Qualquer redação do tipo "antes de marcar, você precisa" transforma
          uma orientação em catraca — e 28 dos 35 parceiros leriam uma catraca
          que o sistema não aplica. */}
      <p className="mt-1.5 max-w-[62ch] corpo-sm text-muted-foreground">
        Nada aqui impede de marcar. É o que a equipe já pode adiantar sobre o
        seu cliente — e o que dá para resolver enquanto você espera um horário.
      </p>

      <div className="mt-4 divide-y divide-borda-fina border border-borda-fina">
        <Linha
          rotulo="Cliente que a equipe acompanha"
          estado={
            elegibilidadeFalhou ? "a-conferir" : temCliente ? "feito" : "falta"
          }
          detalhe={
            elegibilidadeFalhou
              ? "não deu para conferir agora; atualize a página"
              : temCliente
                ? (clienteNome ?? "não foi possível carregar o nome agora")
                : // ⚠️ `clienteId === null` NÃO prova ausência: a RPC também
                  // devolve null com `sessoes_exige_confirmacao` ligada ou
                  // Etapa 01 travada por override (achado do joao, it.2).
                  // A frase hedgeia como a Zona 2 já faz — nunca afirma
                  // "falta" sobre o que o banco não disse.
                  "marque na aba Clientes qual deles a equipe vai acompanhar — ou, se já marcou, a equipe ainda não liberou esta etapa para você"
          }
          href={elegibilidadeFalhou || temCliente ? null : "/clientes"}
          rotuloDoLink="Ir para Clientes"
        />

        {/* ⚠️ As três linhas seguintes são SOBRE o cliente elegível. Sem ele
            (ou com a elegibilidade falhada) elas não têm sujeito: mostrá-las
            como ✗ cobraria do parceiro um DISC de ninguém, e o link iria para
            `/clientes/null/entrevista`. Some inteiras. */}
        {temCliente && !elegibilidadeFalhou ? (
          <>
            {mostrarDisc ? (
              <Linha
                rotulo="Perfil DISC"
                // `undefined` = a leitura não trouxe a letra ⇒ "a conferir".
                // Só `null`/"" (lido, e vazio) vira ✗.
                estado={
                  letraDisc === undefined
                    ? "a-conferir"
                    : (letraDisc ?? "").trim() !== ""
                      ? "feito"
                      : "falta"
                }
                detalhe={
                  letraDisc === undefined
                    ? "não deu para conferir agora"
                    : (letraDisc ?? "").trim() !== ""
                      ? `perfil ${letraDisc} — a doutora conduz sabendo como ele decide`
                      : "a doutora conduziria a Reunião Preliminar sem saber como ele decide. A Entrevista Prévia gera o perfil sozinha, no fim da conversa"
                }
                href={
                  letraDisc === undefined || (letraDisc ?? "").trim() !== ""
                    ? null
                    : rotaDaEntrevista
                }
                rotuloDoLink="Fazer a Entrevista Prévia"
              />
            ) : null}

            {/* 🔴 A TRAVA DOS DECISORES (regra do Marcio, 23/09: *"está
                proibido participar da reunião sem os decisores"* · *"para
                realizar a reunião preliminar, todos os decisores precisam"*).
                A Entrevista Prévia descobre quantos são; aqui a tela lembra
                ANTES de marcar, porque marcar e descobrir depois custa o
                horário de uma doutora e a viagem de uma família.
                ⚠️ Continua AVISO: quem exige a presença é a doutora na sala,
                não um `disabled` nesta tela. */}
            <Linha
              rotulo="Quem decide junto"
              estado={
                decisores === null
                  ? "a-conferir"
                  : decisores.exigeTodos
                    ? "falta"
                    : "feito"
              }
              detalhe={
                decisores === null
                  ? "não deu para conferir agora"
                  : decisores.exigeTodos
                    ? `${decisores.total} pessoas decidem sobre este cliente (${decisores.decisores
                        .map((d) => d.nome)
                        .join(
                          ", ",
                        )}). A Reunião Preliminar só acontece com todos presentes — confirme a presença de cada um`
                    : decisores.total > 0
                      ? `${decisores.total} registrado${decisores.total > 1 ? "s" : ""}: ${decisores.decisores.map((d) => d.nome).join(", ")}`
                      : "ninguém mais precisa estar na sala"
              }
              href={decisores?.exigeTodos ? rotaDaEntrevista : null}
              rotuloDoLink="Ver na Entrevista Prévia"
            />

            {/* 🔴 TRÊS ESTADOS, NÃO DOIS (achado do joão, 24/09). O ✓ só sai
                da LETRA do DISC — a prova de que a conversa aconteceu. Sessão
                viva de tipo 1 é entrevista MARCADA, e marcada não é feita:
                afirmar ocorrência sobre um compromisso futuro é afirmar o
                que o banco não disse. Ver `estadoDaEntrevista` acima. */}
            <Linha
              rotulo="Entrevista Prévia"
              estado={estadoEntrevista}
              detalhe={
                estadoEntrevista === "feito"
                  ? "é ela que apura o perfil e os decisores"
                  : estadoEntrevista === "marcada"
                    ? // 🔑 A data sai do PRÓPRIO agendamento (`sessoes`, que a
                      // página já tinha) — nenhuma consulta nova. `rotuloDoDia`
                      // e `horaDeTime` são recorte de string, sem `new Date`
                      // sobre `date`: `new Date("2026-09-30")` é meia-noite UTC
                      // e volta um dia em São Paulo.
                      `marcada para ${rotuloDoDia(entrevistaViva!.data)}, às ${horaDeTime(entrevistaViva!.hora_inicio)} — é ela que apura o perfil e quem decide junto`
                    : estadoEntrevista === "a-conferir"
                      ? "não deu para conferir agora"
                      : "é ela que apura o perfil e quem decide junto, antes da Reunião Preliminar"
              }
              // Sem link quando já está marcada: oferecer "fazer a entrevista"
              // a quem já tem hora marcada é oferecer o que ele já resolveu.
              href={estadoEntrevista === "falta" ? rotaDaEntrevista : null}
              rotuloDoLink="Fazer a Entrevista Prévia"
            />
          </>
        ) : null}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          A FOLHA DO DISC — UMA VEZ SÓ NA TELA
          ═══════════════════════════════════════════════════════════════════

          🔴 SUBIU DE `MinhaSessao` EM 24/09. Lá ela era montada por SESSÃO
          MARCADA; com as duas sessões vivas (Entrevista Prévia + Reunião
          Preliminar) do mesmo cliente, a mesma folha aparecia duas vezes na
          mesma página. Aqui ela pertence ao CLIENTE, que é um só, e por isso
          existe uma vez.

          FORA da lista acima, e não dentro: `DiscFicha` é uma `<section>`, e
          `<section>` não é filho válido de `<dl>` nem de uma linha de
          pendência. Dentro, o navegador reparenta a marcação e o desenho
          quebra sem nenhum erro de compilação. */}
      {disc ? (
        <div className="mt-4">
          <DiscDoCliente
            perfilDisc={disc.perfil_disc}
            consciencia={disc.disc_consciencia}
            gatilhos={disc.disc_gatilhos}
            relacionamento={disc.disc_relacionamento}
            clienteId={clienteId}
          />
        </div>
      ) : null}
    </section>
  );
}
