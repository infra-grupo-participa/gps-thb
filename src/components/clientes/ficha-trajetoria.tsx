"use client";

/**
 * "Por onde o cliente passou" — a TRAJETÓRIA do cliente (migração …345).
 *
 * Desde 05/10/2026 (pedido do Marcio, prints da ficha) é um CAMINHO em 4
 * fases, da esquerda para a direita no desktop e empilhado no celular:
 * ① Captação · ② Fechamento · ③ Execução · ④ Concluído. O agrupamento é SÓ de
 * exibição (`FASE_DA_ETAPA`, espelho de `cliente_etapa_tipos.fase`); quem
 * calcula a fase do cliente é o gatilho do banco (…353).
 *
 * Dentro da fase, as etapas são uma lista vertical; subetapa fica PENDURADA na
 * mãe por uma linha-guia (`border-l` no `<ul>` das filhas), nunca por recuo
 * solto. "marcada em" e "pendente" ficam numa 2ª linha sob o nome — ao lado do
 * nome era o que desalinhava a lista.
 *
 * No topo do card, "O lead entrou por:" grava `etapa1_clientes.funil_origem`
 * na hora (`atualizarCliente`, patch `{ funil_origem }`) — saiu da aba Dados
 * por ser ambíguo lá. Quem entrou pela Sessão de Viabilidade não fica com a
 * Reunião Preliminar "pendente" (`calcularPendentes(…, funilOrigem)`).
 *
 * 🔑 Nada aqui passa pelo "Salvar ficha": cada caixa grava na hora pela action
 * (`marcarEtapaCliente`/`desmarcarEtapaCliente`), e o funil por
 * `atualizarCliente`.
 *
 * 🔴 **Zero consulta própria.** A árvore e o funil vêm da page (no MESMO
 * `Promise.all`) e descem por prop. Desde 05/10/2026 (pedido do Marcio: "a
 * ficha é o centro") este bloco é o CONTEÚDO da folha "Trajetória" — sem a
 * moldura de Card. `FichaAbas` monta as folhas com `keepMounted`, então ele
 * não desmonta ao trocar de folha: o ajuste otimista e o clique em voo
 * sobrevivem à troca. E mesmo assim não carrega nada no mount.
 *
 * 🔴 **Otimista com rollback.** O estado na tela = a prop do servidor + os
 * ajustes locais (o que a pessoa clicou). No erro, o ajuste volta ao valor de
 * antes do clique e a frase da action fica num `role="alert"`. Os `pendentes`
 * são recalculados na hora com a MESMA `calcularPendentes` do servidor.
 *
 * ⚠️ As actions chamam `revalidatePath`, e o Next devolve a página nova junto
 * com a resposta: as props trocam de identidade. Nessa hora os ajustes são
 * descartados (a prop já é a verdade), MENOS os ainda em voo — senão um 2º
 * clique rápido piscaria de volta até a resposta dele.
 *
 * 🔑 Contrato com `e2e/ficha-trajetoria.spec.ts`: cada etapa é um `<label>`
 * que envolve a caixa e começa pelo nome da etapa. Os botões do funil NÃO são
 * `<label>` (senão "Reunião Preliminar" casaria duas linhas).
 *
 * `null` = a leitura falhou: aviso, nunca "nada marcado".
 */

import { useState } from "react";
import { AlertCircle, Check } from "lucide-react";

import { atualizarCliente } from "@/app/clientes/actions";
import {
  desmarcarEtapaCliente,
  marcarEtapaCliente,
} from "@/app/clientes/trajetoria-actions";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MarcadorFase,
  estadoDaFase,
} from "@/components/clientes/caminho-fases";
import { formatarData } from "@/lib/datas";
import { rotuloFaseNoCaminho } from "@/lib/etapa1";
import { cn } from "@/lib/utils";
import {
  calcularPendentes,
  ehCodigoEtapaCliente,
  FASES_DA_TRAJETORIA,
  faseDaEtapa,
  type EtapaCatalogoBase,
  type EtapaTrajetoria,
  type FaseDaTrajetoria,
  type TrajetoriaCliente,
} from "@/lib/trajetoria-tipos";
import { FUNIS_ORIGEM, type FunilOrigem } from "@/lib/types";

interface EstadoEtapa {
  marcada: boolean;
  marcadoEm: string | null;
}

const ID_TITULO = "trajetoria-titulo";
const ID_ORIGEM = "trajetoria-origem";

/** As opções do "O lead entrou por:". `null` = não informado. */
const OPCOES_ORIGEM: { valor: FunilOrigem | null; rotulo: string }[] = [
  ...FUNIS_ORIGEM.map((f) => ({ valor: f.valor, rotulo: f.rotulo })),
  { valor: null, rotulo: "Não sei" },
];

export function FichaTrajetoria({
  clienteId,
  alunoId,
  trajetoria,
  funilOrigem,
}: {
  clienteId: string;
  /** Ambiente do cliente — `atualizarCliente` revalida por ele. */
  alunoId: string;
  /** `null` = a leitura falhou no servidor (a seção avisa). */
  trajetoria: TrajetoriaCliente | null;
  /** `etapa1_clientes.funil_origem` como veio do servidor. `null` = não informado. */
  funilOrigem: FunilOrigem | null;
}) {
  const [ajustes, setAjustes] = useState<Record<string, EstadoEtapa>>({});
  const [emVoo, setEmVoo] = useState<ReadonlySet<string>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);

  // Funil: `undefined` = sem ajuste local (vale a prop).
  const [funilAjuste, setFunilAjuste] = useState<
    FunilOrigem | null | undefined
  >(undefined);
  const [funilEmVoo, setFunilEmVoo] = useState(false);

  // Prop nova do servidor (revalidate/refresh) → ela é a verdade. Padrão
  // "estado derivado de prop" do React, sem `useEffect` (que pintaria um
  // quadro com o ajuste velho por cima da prop nova).
  const [base, setBase] = useState(trajetoria);
  if (base !== trajetoria) {
    setBase(trajetoria);
    setAjustes((a) =>
      Object.fromEntries(Object.entries(a).filter(([c]) => emVoo.has(c))),
    );
  }
  const [funilBase, setFunilBase] = useState(funilOrigem);
  if (funilBase !== funilOrigem) {
    setFunilBase(funilOrigem);
    if (!funilEmVoo) setFunilAjuste(undefined);
  }
  const funil = funilAjuste === undefined ? funilOrigem : funilAjuste;

  async function escolherOrigem(alvo: FunilOrigem | null) {
    if (funilEmVoo) return;
    // Clicar de novo na opção marcada desmarca (volta a "Não sei").
    const novo = alvo === funil ? null : alvo;
    if (novo === funil) return;
    const anterior = funilAjuste;
    const desfazer = (msg: string) => {
      setFunilAjuste(anterior);
      setErro(`Não deu para gravar por onde o lead entrou. ${msg}`);
    };

    setErro(null);
    setFunilAjuste(novo);
    setFunilEmVoo(true);
    try {
      const res = await atualizarCliente(clienteId, alunoId, {
        funil_origem: novo,
      });
      if (res.erro) desfazer(res.erro);
    } catch {
      desfazer("Confira a internet e tente de novo.");
    } finally {
      setFunilEmVoo(false);
    }
  }

  if (!trajetoria) {
    return (
      <div role="region" aria-labelledby={ID_TITULO} className="grid gap-2">
        <Titulo />
        <p
          role="alert"
          className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Não deu para carregar as etapas deste cliente. Recarregue a página.
        </p>
      </div>
    );
  }

  const estadoDe = (e: EtapaTrajetoria): EstadoEtapa =>
    ajustes[e.codigo] ?? { marcada: e.marcada, marcadoEm: e.marcadoEm };

  // ── Agrupamento por fase (só exibição) ────────────────────────────────
  // Cada nó cai na fase do espelho; código fora dele herda a do pai (no
  // topo, a do topo anterior). Nó de fase DIFERENTE da do pai vira raiz da
  // fase dele — é assim que "Entrega da pasta" (filha de Execução no
  // catálogo) aparece em ④ Concluído e não pendurada na Execução.
  const faseDoNo = new Map<string, FaseDaTrajetoria>();
  const raizes: Record<FaseDaTrajetoria, EtapaTrajetoria[]> = {
    prospeccao: [],
    fechamento: [],
    contratado: [],
    concluido: [],
  };
  const catalogo: EtapaCatalogoBase[] = [];
  const marcadas: string[] = [];
  let faseAnterior: FaseDaTrajetoria = "prospeccao";
  const andar = (e: EtapaTrajetoria, fasePai: FaseDaTrajetoria | null) => {
    const f = faseDaEtapa(e.codigo) ?? fasePai ?? faseAnterior;
    faseDoNo.set(e.codigo, f);
    if (fasePai === null || f !== fasePai) raizes[f].push(e);
    catalogo.push({
      codigo: e.codigo,
      paiCodigo: e.paiCodigo,
      ordem: e.ordem,
      ativo: e.ativo,
    });
    if (estadoDe(e).marcada) marcadas.push(e.codigo);
    for (const filha of e.filhas) andar(filha, f);
  };
  for (const e of trajetoria.etapas) {
    andar(e, null);
    faseAnterior = faseDoNo.get(e.codigo) ?? faseAnterior;
  }
  const pendentes = new Set(calcularPendentes(catalogo, marcadas, funil));

  // Fase atual = a de maior posição com etapa marcada. Nada marcado =
  // Captação, como o gatilho do banco (nada → `prospeccao`).
  const posicaoAtual = Math.max(
    0,
    ...marcadas.map((c) =>
      FASES_DA_TRAJETORIA.indexOf(faseDoNo.get(c) ?? "prospeccao"),
    ),
  );

  async function alternar(e: EtapaTrajetoria, marcar: boolean) {
    const codigo = e.codigo;
    if (!ehCodigoEtapaCliente(codigo) || emVoo.has(codigo)) return;
    const anterior = estadoDe(e);
    const desfazer = () => setAjustes((a) => ({ ...a, [codigo]: anterior }));

    setErro(null);
    setAjustes((a) => ({
      ...a,
      [codigo]: {
        marcada: marcar,
        marcadoEm: marcar
          ? (anterior.marcadoEm ?? new Date().toISOString())
          : null,
      },
    }));
    setEmVoo((s) => new Set(s).add(codigo));
    try {
      const acao = marcar ? marcarEtapaCliente : desmarcarEtapaCliente;
      const res = await acao({ clienteId, etapa: codigo });
      if (res.ok) {
        setAjustes((a) => ({
          ...a,
          [codigo]: { marcada: res.marcada, marcadoEm: res.marcadoEm },
        }));
      } else {
        desfazer();
        setErro(
          `Não deu para ${marcar ? "marcar" : "desmarcar"} "${e.nome}". ${res.erro}`,
        );
      }
    } catch {
      desfazer();
      setErro(
        `Não deu para ${marcar ? "marcar" : "desmarcar"} "${e.nome}". Confira a internet e tente de novo.`,
      );
    } finally {
      setEmVoo((s) => {
        const n = new Set(s);
        n.delete(codigo);
        return n;
      });
    }
  }

  const renderItem = (e: EtapaTrajetoria, raiz: boolean) => {
    const est = estadoDe(e);
    const pendente = pendentes.has(e.codigo);
    const fase = faseDoNo.get(e.codigo);
    // Só as filhas da MESMA fase ficam penduradas aqui.
    const filhas = e.filhas.filter((f) => faseDoNo.get(f.codigo) === fase);
    return (
      <li key={e.codigo}>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm leading-snug">
          <Checkbox
            checked={est.marcada}
            disabled={emVoo.has(e.codigo)}
            onCheckedChange={(v) => alternar(e, Boolean(v))}
            className="foco-visivel mt-0.5"
          />
          <span className="grid min-w-0 gap-0.5">
            <span className={raiz ? "font-medium" : undefined}>{e.nome}</span>
            {est.marcada && est.marcadoEm ? (
              <span className="text-sm text-muted-foreground">
                marcada em{" "}
                <span className="whitespace-nowrap">
                  {formatarData(est.marcadoEm)}
                </span>
              </span>
            ) : null}
            {pendente ? (
              <Badge
                variant="warning"
                icone={false}
                className="h-auto justify-self-start text-sm"
              >
                pendente
              </Badge>
            ) : null}
          </span>
        </label>
        {filhas.length > 0 ? (
          // Linha-guia: o `border-l` sai do meio da caixa da mãe (ml-2 = metade
          // dos 16 px da caixa) e as filhas ficam penduradas nela.
          <ul className="ml-2 grid border-l border-borda-forte pl-3">
            {filhas.map((f) => renderItem(f, false))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    // Sem moldura própria: a folha (`TabsContent`) já é a borda. A região
    // fica — `e2e/ficha-trajetoria.spec.ts` acha o bloco por ela.
    <div role="region" aria-labelledby={ID_TITULO} className="grid gap-4">
      <div className="grid gap-1">
        <Titulo />
        <p className="text-sm leading-snug text-muted-foreground">
          Marque as etapas que este cliente já fez. Salva na hora: não precisa
          clicar em &quot;Salvar ficha&quot;. <strong>Pendente</strong> = etapa
          que ficou para trás.
        </p>
      </div>
      {/* ── POR ONDE O LEAD ENTROU (funil de origem, …345) ─────────────── */}
      <div className="grid gap-2">
        <p id={ID_ORIGEM} className="text-sm leading-none font-medium">
          O lead entrou por:
        </p>
        <div
          role="group"
          aria-labelledby={ID_ORIGEM}
          aria-busy={funilEmVoo || undefined}
          className="flex flex-wrap gap-2"
        >
          {OPCOES_ORIGEM.map((o) => {
            const ativo = funil === o.valor;
            return (
              <button
                key={o.valor ?? "nao_sei"}
                type="button"
                aria-pressed={ativo}
                disabled={funilEmVoo}
                onClick={() => escolherOrigem(o.valor)}
                className={cn(
                  "foco-visivel inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-4 text-sm font-medium disabled:cursor-wait disabled:opacity-70",
                  ativo
                    ? "border-marca-acao bg-marca-acao text-primary-foreground"
                    : "border-borda-forte bg-card text-foreground hover:bg-superficie-afundada",
                )}
              >
                {ativo ? <Check aria-hidden className="size-4" /> : null}
                {o.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── O CAMINHO: 4 fases ─────────────────────────────────────────
          Colunas com largura proporcional ao conteúdo: a Execução tem 2
          níveis de linha-guia e o nome mais longo ("Processamento do
          ITCMD"); com 4 colunas iguais ele quebraria em 3 linhas. 4 colunas
          só a partir de `lg` (a ficha tem `max-w-4xl`); de `sm` a `lg`, 2. */}
      <div className="grid items-start gap-x-4 gap-y-4 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        {FASES_DA_TRAJETORIA.map((f, i) => {
          const estado = estadoDaFase(i, posicaoAtual);
          const idFase = `trajetoria-fase-${f}`;
          const ultima = i === FASES_DA_TRAJETORIA.length - 1;
          return (
            <section
              key={f}
              aria-labelledby={idFase}
              className="grid content-start gap-1"
            >
              <h3
                id={idFase}
                className="flex items-center gap-2 text-sm font-medium"
              >
                <MarcadorFase numero={i + 1} estado={estado} />
                {/* "fase atual" em texto, não só na cor do número. */}
                <span className="grid leading-tight">
                  <span>
                    {rotuloFaseNoCaminho(f)}
                    <span className="sr-only">
                      {`, fase ${i + 1} de ${FASES_DA_TRAJETORIA.length}`}
                      {estado === "passou" ? ", já passou" : ""}
                      {estado === "futura" ? ", ainda não" : ""}
                    </span>
                  </span>
                  {estado === "atual" ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      fase atual
                    </span>
                  ) : null}
                </span>
                {/* Conector até a próxima fase — só com as 4 lado a lado. */}
                {!ultima ? (
                  <span
                    aria-hidden
                    className="hidden h-px min-w-4 flex-1 bg-borda-forte lg:block"
                  />
                ) : null}
              </h3>
              {raizes[f].length > 0 ? (
                <ul className="grid">
                  {raizes[f].map((e) => renderItem(e, true))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>

      {erro ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/** O título da folha — o nome da região que o e2e procura. */
function Titulo() {
  return (
    <h2 id={ID_TITULO} className="text-base font-semibold">
      Por onde o cliente passou
    </h2>
  );
}
