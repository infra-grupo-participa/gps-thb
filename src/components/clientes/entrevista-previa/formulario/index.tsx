"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  CHAVE_AGENDAMENTO_MOTIVO,
  CHAVE_AGENDAMENTO_PRELIMINAR,
  MOTIVOS_NAO_AGENDOU,
  perguntaPorId,
  SEPARADOR_MULTIPLA,
  type AgendamentoPreliminar,
  type MotivoNaoAgendou,
  type LetraDisc,
  type RespostasEntrevista,
  type SinalDecisor,
} from "@/lib/entrevista-previa-perguntas";
import {
  FRASES_MAXIMO,
  frasesDoCliente,
  lerAgendamento,
  montarValidacao,
  opcoesMarcadas,
  perguntaAnterior,
  perguntaSeguinte,
  perguntasVisiveis,
  progresso,
  tempoRestante,
} from "@/lib/entrevista-previa-fluxo";
import { mapearDecisores, type ConfiancaDisc } from "@/lib/entrevista-previa-calculo";
import { formatarDataHora } from "@/lib/datas";
import {
  salvarProgressoEntrevista,
  concluirEntrevistaPrevia,
} from "@/app/clientes/entrevista-previa-actions";

import { agendamentoInicial, destinoDepois, telaInicial, type Tela } from "./navegacao";
import { TelaPergunta } from "./pergunta";
import { TelaValidacao } from "./validacao";
import { ResultadoEquipe } from "./resultado-equipe";

/**
 * A Entrevista Prévia 3.0 — UMA pergunta por vez, no ritmo da conversa.
 *
 * ── 🔑 O ESTADO É O ID DA PERGUNTA, NÃO UM ÍNDICE ──────────────────────────
 *
 * O roteiro é condicional (plano 3.0, §1): "quantos imóveis" só aparece para
 * quem tem imóvel, "sócios" só para quem tem empresa. Um índice num array fixo
 * apontaria para a pergunta errada assim que uma resposta escondesse outra. A
 * tela guarda QUAL pergunta está aberta e pede a `entrevista-previa-fluxo.ts`
 * a seguinte, a anterior e o "X de Y" — a condição mora num lugar só, o
 * mesmo que a action usa para podar na conclusão.
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────
 *
 * abertura (só em entrevista nova) → perguntas → validação → concluir →
 *   parceiro: `router.push` para `/clientes/[id]/entrevista/agendar?e=<id>`
 *   equipe:   resultado + "combine o horário com o parceiro" (item d)
 *
 * 🔴 NENHUMA LEITURA AQUI. Tudo chega por prop do Server Component; as
 * actions só escrevem (salvar rascunho, concluir).
 */

/** Destaque da escolha única antes de avançar sozinha (plano 3.0, §2). */
const AVANCO_MS = 200;

export function FormularioEntrevistaPrevia({
  entrevistaId,
  clienteId,
  clienteNome,
  entrevistado,
  respostasIniciais,
  voltarHref,
  conduzidoPor,
  preliminarViva,
  dataCombinada,
}: {
  entrevistaId: string;
  clienteId: string;
  clienteNome: string;
  entrevistado: string | null;
  respostasIniciais: RespostasEntrevista;
  voltarHref: string;
  /**
   * Quem está conduzindo: o parceiro (na rota dele) ou a equipe, em modo
   * assistência. 🔴 Sem default de propósito: o fim do fluxo muda — o
   * parceiro vai marcar a Reunião Preliminar; a equipe não agenda (item d) e
   * `/clientes/.../agendar` é rota do parceiro (admin cai em 404).
   */
  conduzidoPor: "parceiro" | "admin";
  /**
   * A Reunião Preliminar VIVA do ambiente (tipo 2), lida pela página.
   * `desteCliente` = é deste cliente: a opção vira "Já está marcada para…" e
   * nasce escolhida. De outro cliente vira só aviso (uma viva por ambiente).
   */
  preliminarViva: { inicioEm: string; desteCliente: boolean } | null;
  /** `data_reuniao_preliminar` da ficha, de hoje em diante ("YYYY-MM-DD"). */
  dataCombinada: string | null;
}) {
  const router = useRouter();
  const [respostas, setRespostas] = useState<RespostasEntrevista>(respostasIniciais);
  const [tela, setTela] = useState<Tela>(() => telaInicial(respostasIniciais));
  // O foco só é movido depois da 1ª interação: no carregamento da página ele
  // fica onde o navegador pôs (skip link), não é sequestrado pelo enunciado.
  const [focar, setFocar] = useState(false);
  // Veio do "Ajustar" da validação: depois de responder, volta para ela.
  const [emAjuste, setEmAjuste] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [nomes, setNomes] = useState<Partial<Record<SinalDecisor, string>>>({});
  const [frases, setFrases] = useState<string[]>(() => {
    const salvas = frasesDoCliente(respostasIniciais);
    return Array.from({ length: FRASES_MAXIMO }, (_, i) => salvas[i] ?? "");
  });
  // 🔴 Reunião Preliminar: escolha OBRIGATÓRIA na conclusão (ajuste do
  // Marcio, 29/09) — a action recusa sem ela. Retomada traz a do rascunho;
  // "já marcada" só vale se a viva existe E é deste cliente.
  const jaMarcadaValida = preliminarViva?.desteCliente === true;
  const [agendamento, setAgendamento] = useState<AgendamentoPreliminar | null>(() =>
    agendamentoInicial(respostasIniciais, jaMarcadaValida, conduzidoPor === "parceiro"),
  );
  const [motivo, setMotivo] = useState<MotivoNaoAgendou | null>(
    () => lerAgendamento(respostasIniciais).motivo,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{
    perfilDisc: string | null;
    secundaria: LetraDisc | null;
    confianca: ConfiancaDisc;
    decisoresTotal: number;
    exigeTodos: boolean;
  } | null>(null);

  // O avanço de 200 ms é um timer: sai com a tela, e cada novo clique o
  // reinicia (senão dois cliques rápidos avançariam duas perguntas).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelarAvanco() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDestaque(null);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const decisores = useMemo(() => mapearDecisores(respostas), [respostas]);

  function irPara(t: Tela) {
    cancelarAvanco();
    setFocar(true);
    setTela(t);
  }

  function gravar(novas: RespostasEntrevista) {
    setRespostas(novas);
    setErro(null);
    // Em segundo plano. Falha aqui NÃO interrompe a conversa — a conclusão
    // reenvia tudo (ver o comentário da action).
    void salvarProgressoEntrevista({ entrevistaId, respostas: novas });
  }

  function escolher(opcaoId: string) {
    if (tela.tipo !== "pergunta") return;
    const p = perguntaPorId(tela.id);
    if (!p) return;

    if (p.multipla) {
      const atuais = opcoesMarcadas(respostas[p.id]);
      const marcadas = atuais.includes(opcaoId)
        ? atuais.filter((x) => x !== opcaoId)
        : [...atuais, opcaoId];
      // Ordem do catálogo, no formato gravado "a|b".
      const valor = p.opcoes
        .filter((o) => marcadas.includes(o.id))
        .map((o) => o.id)
        .join(SEPARADOR_MULTIPLA);
      const novas = { ...respostas };
      if (valor) novas[p.id] = valor;
      else delete novas[p.id];
      gravar(novas);
      return;
    }

    const novas = { ...respostas, [p.id]: opcaoId };
    gravar(novas);
    // `presenca_decisores` tem os campos de nome na mesma tela: não avança
    // sozinha, espera o "Continuar".
    if (p.pedeNomesDecisores) return;

    cancelarAvanco();
    setDestaque(opcaoId);
    const destino = destinoDepois(novas, p.id, emAjuste);
    timer.current = setTimeout(() => {
      timer.current = null;
      setDestaque(null);
      setFocar(true);
      setTela(destino);
    }, AVANCO_MS);
  }

  function continuar() {
    if (tela.tipo !== "pergunta") return;
    irPara(destinoDepois(respostas, tela.id, emAjuste));
  }

  function pular() {
    if (tela.tipo !== "pergunta") return;
    const seguinte = perguntaSeguinte(respostas, tela.id);
    irPara(seguinte ? { tipo: "pergunta", id: seguinte.id } : { tipo: "validacao" });
  }

  function anterior() {
    const visiveis = perguntasVisiveis(respostas);
    const antes =
      tela.tipo === "pergunta"
        ? perguntaAnterior(respostas, tela.id)
        : visiveis[visiveis.length - 1] ?? null;
    if (antes) irPara({ tipo: "pergunta", id: antes.id });
  }

  function ajustar(perguntaId: string) {
    setEmAjuste(true);
    irPara({ tipo: "pergunta", id: perguntaId });
  }

  function concluir() {
    setErro(null);
    const frasesLimpas = frases.map((f) => f.trim()).filter(Boolean);
    // Só os nomes de quem DECIDE JUNTO: são os únicos que a action grava.
    const nomesDecisores: Partial<Record<SinalDecisor, string>> = {};
    for (const d of decisores.decideJunto) {
      const n = nomes[d.sinal]?.trim();
      if (n) nomesDecisores[d.sinal] = n;
    }
    if (!agendamento) return;
    const escolha = agendamento;
    const fechamento: RespostasEntrevista = { [CHAVE_AGENDAMENTO_PRELIMINAR]: escolha };
    if (escolha === "nao_agendou" && motivo) fechamento[CHAVE_AGENDAMENTO_MOTIVO] = motivo;
    const semFechamento = { ...respostas };
    delete semFechamento[CHAVE_AGENDAMENTO_PRELIMINAR];
    delete semFechamento[CHAVE_AGENDAMENTO_MOTIVO];
    iniciar(async () => {
      const r = await concluirEntrevistaPrevia({
        entrevistaId,
        clienteId,
        respostas: { ...semFechamento, ...fechamento, frases_cliente: frasesLimpas },
        nomesDecisores,
        entrevistado,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      if (conduzidoPor === "parceiro") {
        if (escolha === "agora") {
          // A ponte para a Reunião Preliminar (plano 3.0, §3). O `e` leva a
          // presença declarada; a página confere que ele é deste cliente.
          router.push(
            `/clientes/${r.clienteId}/entrevista/agendar?e=${encodeURIComponent(r.entrevistaId)}`,
          );
          return;
        }
        // Não vai marcar agora: volta à ficha, e o aviso diz o que ficou
        // registrado (o `<Toaster>` do layout raiz sobrevive ao push).
        toast.success(
          escolha === "ja_marcada" && preliminarViva
            ? `Entrevista salva. Reunião Preliminar: já marcada para ${formatarDataHora(preliminarViva.inicioEm)}.`
            : "Entrevista salva. Reunião Preliminar: não agendada.",
        );
        router.push(voltarHref);
        return;
      }
      // 🔑 Sem `router.refresh()`: a página do admin abre a entrevista no
      // servidor, e um refresh depois de concluir criaria uma linha nova e
      // vazia. O resultado vem do retorno da action; a ficha já foi
      // revalidada por ela.
      setResultado({
        perfilDisc: r.perfilDisc,
        secundaria: r.secundaria,
        confianca: r.confianca,
        decisoresTotal: r.decisoresTotal,
        exigeTodos: r.exigeTodosNaPreliminar,
      });
    });
  }

  // ── TELA FINAL (só equipe) ───────────────────────────────────────────────
  if (resultado) {
    return (
      <ResultadoEquipe
        clienteNome={clienteNome}
        {...resultado}
        onVoltar={() => router.push(voltarHref)}
      />
    );
  }

  // ── ABERTURA ─────────────────────────────────────────────────────────────
  if (tela.tipo === "abertura") {
    const primeira = perguntasVisiveis(respostas)[0];
    return (
      <div className="grid gap-4">
        <div className="border border-borda-fina px-4 py-4">
          <p className="rotulo text-muted-foreground">Antes da primeira pergunta, diga</p>
          {/* O "uns 8 minutos" é a frase aprovada no plano 3.0 — fala para o
              cliente, não medição. O "≈ N min restantes" de cada pergunta é
              que vem da conta (`tempoRestante`). */}
          <p className="titulo-h2 mt-1">
            São perguntas rápidas, uns 8 minutos, para a doutora chegar preparada.
          </p>
        </div>
        <div>
          <Button onClick={() => primeira && irPara({ tipo: "pergunta", id: primeira.id })}>
            Começar
          </Button>
        </div>
      </div>
    );
  }

  // ── VALIDAÇÃO ────────────────────────────────────────────────────────────
  if (tela.tipo === "validacao") {
    return (
      <TelaValidacao
        validacao={montarValidacao(respostas, decisores)}
        preliminarViva={preliminarViva}
        dataCombinada={dataCombinada}
        podeMarcarAgora={conduzidoPor === "parceiro"}
        agendamento={agendamento}
        onAgendamento={(id) => {
          setAgendamento(id as AgendamentoPreliminar);
          if (id !== "nao_agendou") setMotivo(null);
          setErro(null);
        }}
        motivos={MOTIVOS_NAO_AGENDOU}
        motivo={motivo}
        onMotivo={(id) => setMotivo(id as MotivoNaoAgendou | null)}

        frases={frases}
        onFrase={(i, v) => setFrases((fs) => fs.map((f, j) => (j === i ? v : f)))}
        erro={erro}
        pendente={pendente}
        rotuloConcluir={
          conduzidoPor === "parceiro" && agendamento === "agora"
            ? "Confirmou — concluir e marcar a reunião"
            : "Confirmou — concluir"
        }
        focar={focar}
        onConcluir={concluir}
        onAjustar={ajustar}
        onAnterior={() => {
          setEmAjuste(false);
          anterior();
        }}
      />
    );
  }

  // ── PERGUNTA ─────────────────────────────────────────────────────────────
  const pergunta = perguntaPorId(tela.id);
  if (!pergunta) return null;
  const { posicao, total } = progresso(respostas, pergunta.id);
  const marcadas = destaque && !pergunta.multipla ? [destaque] : opcoesMarcadas(respostas[pergunta.id]);

  return (
    <TelaPergunta
      // Remonta por pergunta: o foco vai ao enunciado novo e nenhum estado
      // de tela vaza de uma pergunta para a outra.
      key={pergunta.id}
      pergunta={pergunta}
      marcadas={marcadas}
      posicao={posicao}
      total={total}
      minutosRestantes={tempoRestante(respostas).minutos}
      temAnterior={perguntaAnterior(respostas, pergunta.id) !== null}
      focar={focar}
      emAjuste={emAjuste}
      decideJunto={decisores.decideJunto}
      nomes={nomes}
      onNome={(sinal, nome) => setNomes((n) => ({ ...n, [sinal]: nome }))}
      onEscolher={escolher}
      onContinuar={continuar}
      onAnterior={anterior}
      onPular={pular}
      onVoltarValidacao={() => irPara({ tipo: "validacao" })}
    />
  );
}
