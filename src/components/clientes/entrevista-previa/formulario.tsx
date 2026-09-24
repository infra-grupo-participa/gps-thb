"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  PERGUNTAS_ENTREVISTA,
  BLOCOS_ENTREVISTA,
  TOTAL_PERGUNTAS,
} from "@/lib/entrevista-previa-perguntas";
import {
  calcularDisc,
  mapearDecisores,
  ROTULO_DECISOR,
  NOME_DA_LETRA,
  type RespostasEntrevista,
} from "@/lib/entrevista-previa-calculo";
import {
  salvarProgressoEntrevista,
  concluirEntrevistaPrevia,
} from "@/app/clientes/entrevista-previa-actions";

/**
 * A Entrevista Prévia 2.0 — UMA pergunta por vez, no ritmo da conversa.
 *
 * Pedido do Marcio (23/09): *"typeform ao vivo com as perguntas ao vivo"*.
 *
 * ── 🔑 POR QUE UMA POR VEZ, E NÃO UM FORMULÁRIO LONGO ──────────────────────
 *
 * O parceiro está FALANDO COM UMA PESSOA enquanto usa isto. Uma tela com 30
 * perguntas de uma vez obriga a procurar onde estava a cada resposta — e
 * procurar no meio de uma conversa é o que faz a conversa morrer. Uma
 * pergunta grande, opções grandes, e o enunciado escrito para ser lido em voz
 * alta.
 *
 * ── 🔴 NENHUMA PERGUNTA ABERTA ─────────────────────────────────────────────
 *
 * Toda resposta é uma opção. É dessa estrutura que saem o DISC (soma de
 * pesos) e a contagem de decisores. O único texto livre do fluxo é o NOME de
 * cada decisor, que não entra em cálculo nenhum.
 */
export function FormularioEntrevistaPrevia({
  entrevistaId,
  clienteId,
  clienteNome,
  entrevistado,
  respostasIniciais,
  voltarHref,
  conduzidoPor,
}: {
  entrevistaId: string;
  clienteId: string;
  clienteNome: string;
  entrevistado: string | null;
  respostasIniciais: RespostasEntrevista;
  voltarHref: string;
  /**
   * Quem está conduzindo: o parceiro (na rota dele) ou a equipe, em modo
   * assistência (`/admin/aluno/[alunoId]/clientes/[clienteId]/entrevista`).
   * 🔴 Sem default de propósito: a tela final muda de destino — `/sessoes` é
   * rota do PARCEIRO (`page.tsx` faz `redirect("/admin")` para admin), e o
   * admin que clicasse ali seria despejado no painel (achado do João, 24/09).
   */
  conduzidoPor: "parceiro" | "admin";
}) {
  const router = useRouter();
  const [respostas, setRespostas] = useState<RespostasEntrevista>(respostasIniciais);
  const [indice, setIndice] = useState(0);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [fase, setFase] = useState<"perguntas" | "decisores" | "pronto">("perguntas");
  const [resultado, setResultado] = useState<{
    perfilDisc: string | null;
    decisoresTotal: number;
    exigeTodos: boolean;
  } | null>(null);

  const pergunta = PERGUNTAS_ENTREVISTA[indice];
  const respondidas = Object.keys(respostas).length;
  const disc = useMemo(() => calcularDisc(respostas), [respostas]);
  const decisores = useMemo(() => mapearDecisores(respostas), [respostas]);

  function responder(opcaoId: string) {
    const novas = { ...respostas, [pergunta.id]: opcaoId };
    setRespostas(novas);
    setErro(null);

    // Salva em segundo plano. Falha aqui NÃO interrompe a conversa — a
    // conclusão reenvia tudo. Ver o comentário da action.
    void salvarProgressoEntrevista({ entrevistaId, respostas: novas });

    // Avança sozinho: marcar e ter de clicar "próxima" dobra o trabalho de
    // quem está com o telefone na orelha.
    if (indice < TOTAL_PERGUNTAS - 1) {
      setIndice(indice + 1);
    } else {
      setFase(mapearDecisores(novas).adicionais.length > 0 ? "decisores" : "pronto");
    }
  }

  function concluir() {
    setErro(null);
    iniciar(async () => {
      const r = await concluirEntrevistaPrevia({
        entrevistaId,
        clienteId,
        respostas,
        nomesDecisores: nomes,
        entrevistado,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setResultado({
        perfilDisc: r.perfilDisc,
        decisoresTotal: r.decisoresTotal,
        exigeTodos: r.exigeTodosNaPreliminar,
      });
      setFase("pronto");
      router.refresh();
    });
  }

  // ── TELA FINAL ───────────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div className="grid gap-4">
        <div className="border border-borda-fina px-4 py-4">
          <p className="rotulo text-muted-foreground">Entrevista concluída</p>
          <p className="numero-lg mt-1">
            {resultado.perfilDisc
              ? `Perfil ${resultado.perfilDisc} — ${NOME_DA_LETRA[resultado.perfilDisc as "D"]}`
              : "Perfil não definido"}
          </p>
          <p className="corpo-sm mt-2 text-muted-foreground">
            O perfil e o relatório já estão na ficha de {clienteNome}. A equipe
            jurídica vê isso no briefing da sessão.
          </p>
        </div>

        {resultado.exigeTodos ? (
          <div
            role="alert"
            className="border border-borda-forte bg-superficie-afundada px-4 py-3"
          >
            <p className="rotulo">
              {resultado.decisoresTotal} decisores identificados
            </p>
            <p className="corpo-sm mt-1">
              A Reunião Preliminar só acontece com <strong>todos presentes</strong>.
              Combine a presença de quem falta antes de marcar.
            </p>
          </div>
        ) : null}

        {/* ═════════════════════════════════════════════════════════════════
            A PONTE PARA A SESSÃO (23/09/2026)
            ═════════════════════════════════════════════════════════════════

            Pedido do Marcio: *"a gente tem que prosseguir depois da entrevista
            prévia para lá [a sessão]. Esse é o buraco na parte do sistema. A
            gente precisa ter algo que guie a pessoa para lá, com uma
            sugestão"*.

            Até aqui esta tela oferecia só "Voltar para a ficha" e "Entrevistar
            outra pessoa" — as duas ficam DENTRO do cadastro. O parceiro
            acabava de mapear os decisores e o sistema não dizia o que fazer
            com isso. Marcar a sessão vira a ação PRINCIPAL; "Voltar para a
            ficha" desce para secundária (`variant="outline"`), que é
            hierarquia por posição e peso de botão, não por enfeite.

            🔴 A PONTE NÃO PODE CONTRADIZER O `role="alert"` ACIMA. Com
            `exigeTodos`, a Preliminar exige todos os decisores presentes — e o
            texto de apoio muda para dizer isso. O botão NÃO some: quem marca
            precisa justamente combinar data com todo mundo, e esconder o
            caminho devolveria o buraco que este bloco existe para fechar. O
            que não pode é ele marcar achando que vai sozinho.

            🔑 `router.push`, como o "Voltar para a ficha" logo abaixo — é
            navegação normal dentro do app. O `window.location.assign` do
            terceiro botão é exceção dele (remontar a página para abrir OUTRA
            entrevista), não o padrão desta tela. */}
        <div className="border border-borda-fina px-4 py-4">
          <p className="rotulo text-muted-foreground">Próximo passo</p>
          {conduzidoPor === "admin" ? (
            /* 🔴 Em modo assistência NÃO há `/sessoes`: quem marca a Reunião
               Preliminar é o parceiro, na conta dele. Empurrar o admin para
               `/sessoes` o despejava em `/admin` (o mesmo beco do botão da ficha,
               corrigido no mesmo dia). O primário vira "Voltar para a ficha". */
            <>
              <p className="corpo-sm mt-1">
                {resultado.exigeTodos
                  ? `A Reunião Preliminar exige os ${resultado.decisoresTotal} decisores presentes. Quem marca é o parceiro, em Sessões — combine a data com ele.`
                  : "Quem marca a Reunião Preliminar é o parceiro, em Sessões — combine a data com ele. O perfil já está na ficha."}
              </p>
              <Button className="mt-3" onClick={() => router.push(voltarHref)}>
                Voltar para a ficha
              </Button>
            </>
          ) : (
            <>
              <p className="corpo-sm mt-1">
                {resultado.exigeTodos
                  ? `Marque a Reunião Preliminar com a equipe jurídica — com os ${resultado.decisoresTotal} decisores presentes. Escolha o horário e combine a presença de todos antes da data.`
                  : "Marque a sessão com a equipe jurídica. Você escolhe entre os horários que as Dras. Elaine e Cristiane já abriram."}
              </p>
              <Button className="mt-3" onClick={() => router.push("/sessoes")}>
                Marcar a sessão com a equipe jurídica
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {conduzidoPor === "parceiro" ? (
            <Button variant="outline" onClick={() => router.push(voltarHref)}>
              Voltar para a ficha
            </Button>
          ) : null}
          {/* 🔴 ABRE OUTRA de verdade. Antes este botão levava à ficha — o
              mesmo destino do primeiro, dois botões para a mesma coisa. As
              entrevistas são ILIMITADAS por requisito ("pode fazer a
              entrevista previa com quantas pessoas quiser"), e é aqui que o
              parceiro está quando acaba de falar com uma pessoa e já vai
              chamar a próxima.

              🔑 `window.location.assign`, NÃO `router.refresh()` + limpar o
              estado: o `entrevistaId` é PROP vinda do servidor e não muda com
              refresh. O formulário voltaria apontando para a entrevista já
              CONCLUÍDA, e cada resposta bateria em "Esta entrevista já foi
              concluída". A navegação real remonta a página, e a RPC abre uma
              linha nova (a anterior está concluída, então não é retomada). */}
          <Button
            variant="outline"
            onClick={() => window.location.assign(window.location.pathname)}
          >
            Entrevistar outra pessoa
          </Button>
        </div>
      </div>
    );
  }

  // ── NOMES DOS DECISORES ──────────────────────────────────────────────────
  if (fase === "decisores") {
    return (
      <div className="grid gap-4">
        <div>
          <p className="rotulo text-muted-foreground">Quase lá</p>
          <h2 className="titulo-h2 mt-1">Quem mais decide junto?</h2>
          <p className="corpo-sm mt-2 text-muted-foreground">
            As respostas mostraram mais gente na decisão. Anote o nome de cada
            um — é quem precisa estar na Reunião Preliminar.
          </p>
        </div>

        {decisores.adicionais.map((d) => (
          <label key={d.sinal} className="grid gap-1">
            <span className="rotulo text-muted-foreground">
              {ROTULO_DECISOR[d.sinal]}
            </span>
            <input
              type="text"
              value={nomes[d.sinal] ?? ""}
              onChange={(e) => setNomes({ ...nomes, [d.sinal]: e.target.value })}
              placeholder="Nome (opcional)"
              maxLength={120}
              className="w-full rounded-md border border-borda-forte bg-card px-3 py-2 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
        ))}

        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {erro}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={concluir} disabled={pendente} aria-busy={pendente || undefined}>
            {pendente ? "Gerando o perfil…" : "Concluir e gerar o perfil"}
          </Button>
          <Button
            variant="outline"
            // 🔑 Volta para a PRIMEIRA pergunta, não para onde parou (que é a
            // última). Quem clica aqui quer revisar o que respondeu; cair no
            // fim obrigaria a clicar "Anterior" 23 vezes para checar a de
            // número 1.
            onClick={() => {
              setIndice(0);
              setFase("perguntas");
            }}
            disabled={pendente}
          >
            Voltar às perguntas
          </Button>
        </div>
      </div>
    );
  }

  // ── PRONTO PARA CONCLUIR (sem decisores extras) ──────────────────────────
  if (fase === "pronto") {
    return (
      <div className="grid gap-4">
        <div className="border border-borda-fina px-4 py-4">
          <p className="rotulo text-muted-foreground">Tudo respondido</p>
          <p className="corpo-sm mt-1">
            {respondidas} de {TOTAL_PERGUNTAS} perguntas. O perfil será gerado
            das respostas e gravado na ficha de {clienteNome}.
          </p>
        </div>
        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {erro}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={concluir} disabled={pendente} aria-busy={pendente || undefined}>
            {pendente ? "Gerando o perfil…" : "Concluir e gerar o perfil"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setIndice(0);
              setFase("perguntas");
            }}
            disabled={pendente}
          >
            Revisar respostas
          </Button>
        </div>
      </div>
    );
  }

  // ── PERGUNTA ─────────────────────────────────────────────────────────────
  const bloco = BLOCOS_ENTREVISTA.find((b) => b.id === pergunta.bloco);
  const marcada = respostas[pergunta.id];

  return (
    <div className="grid gap-4">
      {/* Progresso: número e barra. O parceiro precisa saber quanto falta
          para administrar o tempo da conversa. */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="rotulo text-muted-foreground">{bloco?.rotulo}</p>
          <p className="corpo-sm text-muted-foreground">
            {indice + 1} de {TOTAL_PERGUNTAS}
          </p>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-superficie-afundada"
          role="progressbar"
          aria-valuenow={indice + 1}
          aria-valuemin={1}
          aria-valuemax={TOTAL_PERGUNTAS}
          aria-label={`Pergunta ${indice + 1} de ${TOTAL_PERGUNTAS}`}
        >
          <div
            className="h-full bg-marca-acao transition-all"
            style={{ width: `${((indice + 1) / TOTAL_PERGUNTAS) * 100}%` }}
          />
        </div>
      </div>

      <div>
        {/* O enunciado é grande porque é para ser LIDO EM VOZ ALTA. */}
        <h2 className="titulo-h2">{pergunta.enunciado}</h2>
        {pergunta.ajuda ? (
          <p className="corpo-sm mt-2 text-muted-foreground">{pergunta.ajuda}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {pergunta.opcoes.map((o) => {
          const ativa = marcada === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => responder(o.id)}
              aria-pressed={ativa}
              // `min-h-14` e texto à esquerda: alvo generoso para quem clica
              // sem olhar, falando ao telefone. Muito acima dos 24px do WCAG.
              className={
                "foco-visivel flex min-h-14 w-full items-center rounded-md border px-4 py-3 text-left corpo " +
                (ativa
                  ? "border-marca-acao bg-marca-acao/10 font-medium text-accent-foreground"
                  : "border-borda-forte hover:bg-superficie-afundada")
              }
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setIndice(Math.max(0, indice - 1))}
          disabled={indice === 0}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (indice < TOTAL_PERGUNTAS - 1) setIndice(indice + 1);
            else setFase(decisores.adicionais.length > 0 ? "decisores" : "pronto");
          }}
        >
          {indice < TOTAL_PERGUNTAS - 1 ? "Pular" : "Ir para o fim"}
        </Button>

        {/* Parcial ao vivo: ajuda o parceiro a perceber para onde a conversa
            está indo, sem esperar o fim. Nunca substitui o resultado final. */}
        {disc.letra ? (
          <p className="corpo-sm ml-auto text-muted-foreground">
            Parcial: <strong>{disc.letra}</strong>
            {decisores.total > 1 ? ` · ${decisores.total} decisores` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
