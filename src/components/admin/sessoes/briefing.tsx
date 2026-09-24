"use client";

import { useEffect, useId, useState } from "react";

import { abrirBriefingDaSessao } from "@/app/admin/sessoes/actions";
import { formatarData, formatarDataHora } from "@/lib/datas";
import type { LetraDisc } from "@/lib/entrevista-previa-perguntas";
import { logErro } from "@/lib/log";
import { montarParte, PARTES_SCRIPT, type ParteMontada } from "@/lib/script-reuniao";
import type { EntrevistaPreviaAoVivo, SessaoBriefing } from "@/lib/sessoes-tipos";

/**
 * O briefing de UMA sessão — carregado SÓ quando esta ficha abre (nunca na
 * listagem, PRD §6.5 / tarefa desta fatia). Cada abertura chama
 * `abrirBriefingDaSessao` → `gps.sessao_briefing_ler`, que GRAVA trilha LGPD
 * a cada leitura — por isso este componente NÃO memoiza o resultado além do
 * próprio estado local, e não pré-busca: monta vazio e só chama a action no
 * efeito, uma vez por abertura.
 *
 * `briefing_snapshot` é o retrato do dia do agendamento (§6.5): as fontes
 * originais podem ter mudado depois. Este componente não tenta "atualizar"
 * nada — mostra exatamente o congelado, com `gerado_em`.
 *
 * 🔴 `descricao_caso`/decisores/respostas da Entrevista Prévia são dado
 * pessoal de cliente de terceiro. Aparecem aqui porque esta é a FICHA de uma
 * sessão específica, aberta por quem tem RLS para ela (doutora dona ou admin)
 * — nunca em lista consolidada, CSV ou e-mail (§4.3, regra do PRD).
 *
 * ── AS 7 PARTES DO SCRIPT (24/09) ──────────────────────────────────────────
 *
 * Abaixo dos blocos fixos, o briefing monta as 7 partes do "Script de
 * Fechamento da Reunião Preliminar" a partir de `entrevista_previa_ao_vivo`
 * (irmã de `disc_ao_vivo`, lida AO VIVO — a entrevista quase sempre roda
 * DEPOIS do agendamento, então o snapshot congelado não serve). A estrutura
 * vem de `src/lib/script-reuniao.ts`; este componente só desenha.
 *
 * 🔴 `entrevista.observacoes` FOI REMOVIDO daqui em 24/09. Vinha da esteira
 * legada da Etapa 01 (0 registros em produção) e, ao lado da Entrevista
 * Prévia, criaria DUAS verdades sobre "a entrevista" na mesma tela — a
 * doutora leria "Observações da entrevista: —" logo acima das 7 partes
 * montadas por uma entrevista de verdade. O campo continua no snapshot
 * (`briefing.entrevista`), porque remover do banco não é decisão desta tela.
 *
 * 🔴 A LETRA VIGENTE é `disc_ao_vivo.letra`, a MESMA de `BlocoDisc` — nunca
 * `entrevista_previa_ao_vivo.perfil_disc`. Duas letras na mesma tela é
 * exatamente o defeito que a decisão de 22/09 fechou. Sem letra, as partes
 * não mostram linha de gatilho e NÃO se escolhe uma letra por default: o
 * bloco DISC já diz "ainda não informado" uma vez, e inventar "D" faria a
 * doutora conduzir a reunião pelo roteiro errado.
 */
export function BriefingSessao({ agendamentoId }: { agendamentoId: string }) {
  const [estado, setEstado] = useState<
    | { tipo: "carregando" }
    | { tipo: "erro"; mensagem: string }
    | { tipo: "pronto"; briefing: SessaoBriefing | null }
  >({ tipo: "carregando" });

  useEffect(() => {
    let cancelado = false;
    abrirBriefingDaSessao(agendamentoId).then((r) => {
      if (cancelado) return;
      if (!r.ok) {
        setEstado({ tipo: "erro", mensagem: r.erro });
        return;
      }
      setEstado({ tipo: "pronto", briefing: r.briefing });
    });
    return () => {
      cancelado = true;
    };
    // Cada AGENDAMENTO diferente busca de novo; reabrir o MESMO agendamento
    // no mesmo componente montado de novo também busca de novo — é o
    // comportamento certo (a trilha regista cada leitura real, §9-ter B2/…292 §8).
  }, [agendamentoId]);

  if (estado.tipo === "carregando") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-t border-borda-fina px-3 py-2 corpo-sm text-muted-foreground"
      >
        Carregando briefing…
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <p
        role="alert"
        className="border-t border-borda-fina px-3 py-2 corpo-sm text-destructive"
      >
        {estado.mensagem}
      </p>
    );
  }

  const b = estado.briefing;
  if (!b || !b.briefing) {
    return (
      <p className="border-t border-borda-fina px-3 py-2 corpo-sm text-muted-foreground">
        Sem briefing registrado para esta sessão.
      </p>
    );
  }

  return <CorpoBriefing b={b} />;
}

/**
 * O DESENHO do briefing, separado da busca.
 *
 * Exportado de propósito: é o que permite provar a GEOMETRIA das 7 seções em
 * navegador de verdade (harness temporário com `SessaoBriefing` sintético, em
 * 1366 e 390) sem passar pela server action — que exige sessão, RLS e grava
 * trilha LGPD a cada leitura. jsdom não pinta e não prova rolagem horizontal;
 * preview isolado prova pigmento, não geometria.
 *
 * ⚠️ NÃO chame isto direto na aplicação: a única porta do briefing continua
 * sendo `BriefingSessao` → `abrirBriefingDaSessao` → `gps.sessao_briefing_ler`
 * (a trilha é a guarda de leitura de dado pessoal).
 */
export function CorpoBriefing({ b }: { b: SessaoBriefing }) {
  const dados = (b.briefing ?? {}) as Record<string, unknown>;
  const cliente = (dados.cliente ?? {}) as Record<string, unknown>;
  const onboarding = (dados.onboarding ?? {}) as Record<string, unknown>;
  // 🔴 QUEM DECIDE, lido AO VIVO (`decisores_ao_vivo`, irmão de `briefing`).
  //
  // Dois defeitos corrigidos aqui na auditoria de 23/09:
  //  1. o snapshot já trazia `decisores` e a tela NÃO mostrava — mesmo
  //     defeito do DISC: grava certo, não exibe;
  //  2. o snapshot CONGELA no ato do agendamento, e a Entrevista Prévia (que
  //     descobre os decisores) costuma rodar DEPOIS. A doutora veria a lista
  //     velha, sem o cônjuge que o parceiro acabou de mapear — e conduziria
  //     a reunião achando que está com todos na sala.
  //
  // 🔑 Mesmo raciocínio que tirou o DISC do snapshot: quem decide é atributo
  // ESTÁVEL DA PESSOA, não fato datado. O congelado continua no snapshot
  // (`briefing.decisores`) como histórico do que se sabia no dia.
  const decisores = Array.isArray(b.decisores_ao_vivo) ? b.decisores_ao_vivo : [];
  const gerado = typeof dados.gerado_em === "string" ? dados.gerado_em : null;
  // 🔴 `disc_ao_vivo` vem no TOPO da resposta, irmão de `briefing` — não
  // dentro dele. Medido em produção: as chaves de `briefing` são
  // {cliente, minutas, aluno_id, decisores, gerado_em, cliente_id,
  // entrevista, onboarding, parceiro_nome}, e `disc_ao_vivo` não está entre
  // elas. É assim de propósito: o DISC é lido AO VIVO na hora da chamada,
  // enquanto `briefing` é o snapshot congelado no ato do agendamento —
  // aninhá-lo lá dentro contradiria a própria razão de ele existir.
  const discAoVivo = (b.disc_ao_vivo ?? {}) as Record<string, unknown>;
  // 🔴 A letra que conduz as 7 partes sai DAQUI — a mesma chave que
  // `BlocoDisc` lê (`letra`, não `perfil_disc`). Ver o comentário do topo.
  const letraVigente = letraValida(discAoVivo.letra);
  // 🔴 `null`/ausente é ESTADO COM TEXTO, não lista vazia. Ausente e
  // "concluída sem respostas" são coisas diferentes na tela.
  const entrevistaPrevia = b.entrevista_previa_ao_vivo ?? null;

  return (
    <div className="grid gap-3 border-t border-borda-fina px-3 py-3">
      <p className="corpo-sm text-muted-foreground">
        Briefing congelado{gerado ? ` em ${formatarDataHora(gerado)}` : ""} — pode
        não refletir mudanças feitas depois na ficha do cliente.
      </p>

      <dl className="grid gap-2">
        <Campo rotulo="Cliente" valor={txt(cliente.nome)} />
        <Campo rotulo="Telefone" valor={txt(cliente.telefone)} />
        <Campo rotulo="Grau de relação" valor={txt(cliente.grau_relacao)} />
        <Campo rotulo="Fase" valor={txt(cliente.fase)} />
        <Campo
          rotulo="Reunião preliminar"
          valor={
            typeof cliente.data_reuniao_preliminar === "string"
              ? formatarData(cliente.data_reuniao_preliminar)
              : "—"
          }
        />
        <Campo
          rotulo="Descrição do caso"
          valor={txt(onboarding.descricao_caso)}
          bloco
        />
        <Campo
          rotulo="Ajuda que já está pronta"
          valor={txt(onboarding.ajuda_pronta)}
          bloco
        />
      </dl>

      <BlocoDecisores decisores={decisores} />
      <BlocoDisc disc={discAoVivo} />
      <PartesDoScript entrevista={entrevistaPrevia} letra={letraVigente} />
    </div>
  );
}

/** Aceita só as 4 letras; qualquer outra coisa vira `null` (nunca um default). */
function letraValida(v: unknown): LetraDisc | null {
  return v === "D" || v === "I" || v === "S" || v === "C" ? v : null;
}

/**
 * RÓTULO CURTO por pergunta — o que a doutora lê de relance na seção.
 *
 * 🔑 POR QUE NÃO USAR `enunciado`: ele é escrito para ser LIDO EM VOZ ALTA
 * ("Imagina que a gente já sai daqui com uma reunião marcada com a nossa
 * equipe jurídica, para desenhar a sua estrutura. Você consegue encaixar isso
 * na sua agenda?" — 150+ caracteres). Numa seção densa, 5 enunciados desses
 * empilhados são 10 linhas de texto conversacional onde deveria haver 5 linhas
 * de fato. O briefing não é o roteiro falado: é o que a entrevista APUROU.
 *
 * Então cada pergunta vira `rótulo curto → rótulo da opção` ("Urgência → Para
 * ontem"). O `enunciado` continua disponível em `montarParte` para quem
 * precisar; aqui ele só entra como reserva, quando um id novo aparecer em
 * `script-reuniao.ts` antes de ganhar rótulo nesta tabela — a tela degrada
 * para o texto longo em vez de mostrar o id cru.
 *
 * ⚠️ Esta tabela é de EXIBIÇÃO, não contrato: id ausente aqui não quebra nada
 * e não vai para `idsDesconhecidos` (aquilo é descompasso com o catálogo de
 * perguntas, coisa diferente).
 */
const ROTULO_CURTO: Record<string, string> = {
  motivo_busca: "Motivo da busca",
  urgencia: "Urgência",
  ja_tentou: "Já tentou antes",
  composicao: "Concentração do patrimônio",
  titularidade: "Titularidade",
  instrumento_existente: "Instrumento existente",
  conflito_herdeiros: "Divisão entre herdeiros",
  imoveis_qtd: "Imóveis",
  imoveis_heranca: "Imóvel de herança",
  imoveis_alugados: "Renda de aluguel",
  pro_labore: "Retirada da empresa",
  inventario_familia: "Inventário na família",
  risco_atividade: "Risco da atividade",
  o_que_convence: "O que convence",
  confianca_equipe: "O que gera confiança",
  mudanca: "Reação a mudança",
  decide_investimento: "Decide o investimento",
  reacao_preco: "Reação ao preço",
  objecao_principal: "Objeção principal",
  quem_bate_martelo: "Quem bate o martelo",
  disposicao_reuniao: "Disposição para a reunião",
  temperatura: "Temperatura",
};

/**
 * AS 7 PARTES do Script de Fechamento, na ordem, cada uma como `<section>`.
 *
 * Denso e chapado (preferência do Marcio, 14/09): título da parte, os pares
 * `rótulo → resposta`, e a linha de condução da letra vigente. Sem card, sem
 * ícone, sem cor decorativa — hierarquia por POSIÇÃO: parte 01 no topo, parte
 * 07 no fim, exatamente a ordem em que a conversa acontece.
 *
 * 🔴 NADA de `disc_gatilhos`/`consciencia`/`relacionamento` aqui: aquilo é do
 * `BlocoDisc` e continua lá. O `gatilho` desta seção é outro dado — vem de
 * `PARTES_SCRIPT[n].gatilho[letra]`, é por PARTE, e não duplica o relatório.
 *
 * 🔴 NENHUM VALOR EM REAIS, em nenhuma parte — em especial na 05 (Virada), em
 * que o script proíbe citar preço. As `variantes` entram como TÍTULO apenas
 * ("Sessão de Viabilidade" · "Croqui Estrutural"): quem escolhe é a doutora,
 * na hora, e a tela não sugere nenhuma das duas.
 */
function PartesDoScript({
  entrevista,
  letra,
}: {
  entrevista: EntrevistaPreviaAoVivo | null;
  letra: LetraDisc | null;
}) {
  const idBase = useId();
  // `respostas: null` faz `montarParte` devolver cobertura "nenhuma" em todas
  // as 7 — o mesmo caminho da entrevista que não cobriu nada. A diferença
  // ("não houve entrevista" × "houve e não cobriu") é dita no cabeçalho, uma
  // vez, em vez de repetida 7×.
  const montadas = PARTES_SCRIPT.map((parte) =>
    montarParte(parte, entrevista?.respostas ?? null, letra),
  );

  // Descompasso entre `script-reuniao.ts` e `entrevista-previa-perguntas.ts`:
  // vai para o log UMA vez por render, sem PII (só ids de pergunta, que são
  // constantes de código), e NADA na tela — a doutora não tem o que fazer com
  // isso no meio de uma reunião.
  const desconhecidos = montadas.flatMap((m) => m.idsDesconhecidos);
  useEffect(() => {
    if (desconhecidos.length === 0) return;
    logErro("BriefingSessao.PartesDoScript", "ids de pergunta desconhecidos no script", {
      ids: desconhecidos.join(","),
    });
    // `join` na dependência, não o array: array novo a cada render reexecutaria
    // o efeito (e o log) em toda repintura, mesmo sem nada ter mudado.
  }, [desconhecidos.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-3 border-t border-borda-fina pt-3">
      <div className="grid gap-0.5">
        <p className="rotulo text-muted-foreground">Script da Reunião Preliminar</p>
        {entrevista ? (
          <p className="corpo-sm text-muted-foreground">
            Montado com a Entrevista Prévia de{" "}
            {formatarData(entrevista.concluida_em)}.
            {letra ? "" : " Sem perfil DISC, as partes não trazem a linha de condução."}
          </p>
        ) : (
          <p className="corpo-sm text-muted-foreground">
            Entrevista Prévia ainda não concluída — as 7 partes aparecem sem o
            que o cliente respondeu.
          </p>
        )}
      </div>

      {montadas.map((m) => (
        <ParteSecao key={m.parte.id} montada={m} idBase={idBase} />
      ))}
    </div>
  );
}

function ParteSecao({ montada, idBase }: { montada: ParteMontada; idBase: string }) {
  const { parte, itens, gatilho, cobertura } = montada;
  const idTitulo = `${idBase}-${parte.id}`;
  const numero = String(parte.numero).padStart(2, "0");

  return (
    <section aria-labelledby={idTitulo} className="grid gap-1">
      <h4 id={idTitulo} className="rotulo">
        {numero} · {parte.titulo}
      </h4>

      {cobertura === "nenhuma" ? (
        <p className="corpo-sm text-muted-foreground">
          A entrevista não cobriu esta parte.
        </p>
      ) : (
        <dl className="grid gap-0.5">
          {itens.map((item) => (
            <div key={item.perguntaId} className="flex flex-wrap gap-x-3 gap-y-0.5">
              <dt className="w-40 shrink-0 corpo-sm text-muted-foreground">
                {ROTULO_CURTO[item.perguntaId] ?? item.enunciado}
              </dt>
              <dd className="min-w-0 flex-1 corpo-sm">{item.rotuloDaOpcao}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Parte 05: os dois caminhos, TÍTULO apenas — a doutora escolhe um na
          hora. Aparecem mesmo sem entrevista: são estrutura do script, não
          dado do cliente. */}
      {parte.variantes ? (
        <p className="corpo-sm">
          <span className="text-muted-foreground">Caminhos: </span>
          {parte.variantes.join(" · ")}
        </p>
      ) : null}

      {gatilho ? <p className="corpo-sm">{gatilho}</p> : null}
    </section>
  );
}

/**
 * QUEM DECIDE — a lista que a Entrevista Prévia monta.
 *
 * 🔴 Existe porque a regra do Marcio (23/09) é dura: *"está proibido
 * participar da reunião sem os decisores"* · *"para realizar a reunião
 * preliminar, todos os decisores precisam"*. A doutora precisa saber, ANTES
 * de começar, se falta alguém na sala.
 *
 * O parceiro é avisado na ficha e ao marcar; a trava é de AVISO, não de
 * bloqueio (mesma decisão do DISC). Este bloco é a última rede: se o aviso
 * foi ignorado, quem conduz a reunião ainda vê que há mais gente decidindo.
 *
 * Lista vazia SOME da tela. Cliente sem entrevista ainda não tem decisores
 * mapeados, e um rótulo "Quem decide: —" leria como defeito.
 */
function BlocoDecisores({ decisores }: { decisores: Record<string, unknown>[] }) {
  const lista = decisores
    .map((d) => ({
      nome: typeof d.nome === "string" ? d.nome : null,
      papel: typeof d.papel_no_negocio === "string" ? d.papel_no_negocio : null,
      principal: d.principal === true,
    }))
    .filter((d) => d.nome);

  if (lista.length === 0) return null;

  return (
    <div className="grid gap-2 border-t border-borda-fina pt-3">
      <p className="rotulo text-muted-foreground">
        Quem decide{lista.length > 1 ? ` (${lista.length})` : ""}
      </p>
      <ul className="corpo-sm grid gap-0.5">
        {lista.map((d, i) => (
          <li key={`${d.nome}-${i}`}>
            {d.nome}
            {d.principal ? (
              <span className="text-muted-foreground"> — decisor principal</span>
            ) : d.papel && d.papel.toLowerCase() !== (d.nome ?? "").toLowerCase() ? (
              <span className="text-muted-foreground"> — {d.papel}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {lista.length > 1 ? (
        <p className="corpo-sm text-accent-foreground">
          A reunião precisa de <strong>todos presentes</strong>. Se faltar
          alguém, remarque antes de avançar no conteúdo.
        </p>
      ) : null}
    </div>
  );
}

/**
 * O bloco DISC — lido AO VIVO de `etapa1_clientes` na hora da chamada
 * (`disc_ao_vivo`, PRD §2.2), nunca o `perfil_disc` de dentro do `briefing`
 * congelado. Regra do PRD, sem exceção: NUNCA mostrar os dois lado a lado —
 * dois valores para a mesma pergunta é o defeito que esta fatia existe para
 * evitar. `divergiu` diz numa linha só que o congelado é mais velho.
 *
 * 🔴 27 de 34 favoritos não têm nem a letra — é o estado MAIS COMUM, não a
 * exceção. Sem letra, o campo é "Perfil DISC ainda não informado", nunca um
 * traço ou letra inventada. Campo rico vazio SOME da tela (não vira rótulo
 * com valor em branco): três rótulos vazios seguidos leem como defeito.
 */
function BlocoDisc({ disc }: { disc: Record<string, unknown> }) {
  // 🔴 `role="region"` + `aria-labelledby` existe por DUAS razões que se
  // somam:
  //  1. acessibilidade — o bloco vira marco navegável, como as 7 seções do
  //     script logo abaixo;
  //  2. o E2E `sessoes-equipe.spec.ts` afirma "o briefing traz o DISC"
  //     procurando /consciência|gatilho|relacionamento/ no painel. Desde
  //     24/09 as 7 partes do script também exibem uma linha de "gatilho"
  //     por parte. ⚠️ Medido: nenhuma das 28 frases de condução casa a
  //     regex hoje, então o teste ainda falha certo — mas a garantia é
  //     ACIDENTAL, presa à redação de frases que existem para mudar. O
  //     seletor foi apertado para esta região; o rótulo LITERAL "Perfil
  //     DISC" é contrato com aquele teste, não texto solto.
  const idTitulo = useId();
  // 🔴 A chave é `letra`, NÃO `perfil_disc`. A RPC `sessao_briefing_ler`
  // devolve `disc_ao_vivo = {letra, consciencia, gatilhos, relacionamento,
  // divergiu, congelado_era, atualizado_em, atualizado_por}` — o nome
  // `perfil_disc` é o da COLUNA em `etapa1_clientes`, não o do JSON.
  //
  // Enquanto lia a chave errada, este bloco mostrava "Perfil DISC ainda não
  // informado" para TODO cliente, inclusive os 127 que têm a letra — ou seja,
  // escondia da doutora exatamente o dado que ela abre o briefing para ver.
  // Achado em 22/09 pela suíte E2E; `tsc` não pega porque o JSON chega como
  // `Record<string, unknown>` e qualquer chave inexistente é `undefined`.
  const letra = typeof disc.letra === "string" ? disc.letra : null;
  const consciencia = typeof disc.consciencia === "string" ? disc.consciencia : null;
  const gatilhos = typeof disc.gatilhos === "string" ? disc.gatilhos : null;
  const relacionamento =
    typeof disc.relacionamento === "string" ? disc.relacionamento : null;
  const divergiu = disc.divergiu === true;

  return (
    <section
      role="region"
      aria-labelledby={idTitulo}
      data-slot="bloco-disc"
      className="grid gap-2 border-t border-borda-fina pt-3"
    >
      <p id={idTitulo} className="rotulo text-muted-foreground">
        Perfil DISC
      </p>

      {letra ? (
        <dl className="grid gap-2">
          <Campo rotulo="Letra" valor={letra} />
          {consciencia ? (
            <Campo rotulo="Consciência" valor={consciencia} bloco />
          ) : null}
          {gatilhos ? <Campo rotulo="Gatilhos" valor={gatilhos} bloco /> : null}
          {relacionamento ? (
            <Campo rotulo="Relacionamento" valor={relacionamento} bloco />
          ) : null}
        </dl>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Perfil DISC ainda não informado.
        </p>
      )}

      {divergiu ? (
        <p className="corpo-sm text-muted-foreground">
          Atualizado depois do agendamento.
        </p>
      ) : null}
    </section>
  );
}

function txt(v: unknown): string {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (Array.isArray(v) && v.length > 0) return v.map(String).join(", ");
  return "—";
}

function Campo({
  rotulo,
  valor,
  bloco = false,
}: {
  rotulo: string;
  valor: string;
  bloco?: boolean;
}) {
  return (
    <div className={bloco ? "grid gap-0.5" : "flex flex-wrap gap-x-3 gap-y-0.5"}>
      <dt className={bloco ? "rotulo text-muted-foreground" : "w-40 shrink-0 rotulo text-muted-foreground"}>
        {rotulo}
      </dt>
      <dd className="min-w-0 flex-1 corpo-sm whitespace-pre-wrap">{valor}</dd>
    </div>
  );
}
