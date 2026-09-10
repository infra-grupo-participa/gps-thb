"use client";

/**
 * @menção no Diário — a lista de quem pode ser avisado, o teclado e os chips.
 *
 * Fica fora do `DiarioForm` porque é uma máquina de estado inteira (token sob o
 * cursor, lista filtrada, item destacado, teto) e o formulário já tinha cinco
 * campos. O formulário continua dono do texto; daqui saem só os IDS que vão
 * junto na action.
 *
 * 🔑 Três regras que valem em cada linha deste arquivo:
 *
 * 1. **O cliente ESCOLHE destinatário; nunca AUTORIZA.** A lista vem de
 *    `listarMencionaveis()` (admin, `gp_is_admin()` na RPC) e cada id é
 *    revalidado no BANCO contra `ativo` + cargo dev/admin. Mexer nesta tela não
 *    cria leitor novo para um Diário que é só-admin por LGPD.
 * 2. **Teto de 10.** O 11º não entra e a tela DIZ — uma nota não vira disparo
 *    em massa. O banco aplica o mesmo teto (`gps.registrar_mencoes`).
 * 3. **A menção é gravada, não reparseada.** O que a action manda são ids; o
 *    `@Nome` no texto é conveniência de leitura. Por isso tirar o chip não
 *    apaga o nome do texto — e a tela avisa isso em vez de mexer no que a
 *    pessoa escreveu.
 */

import { useCallback, useState } from "react";
import { AtSign, X } from "lucide-react";
import { listarMencionaveis } from "@/app/admin/diario-actions";
import { casaTodosOsTermos } from "@/lib/texto";

/** Uma nota não vira disparo em massa. O banco aplica o mesmo teto. */
export const MAX_MENCOES = 10;

/** Quantas sugestões cabem na lista sem ela virar rolagem infinita. */
const MAX_SUGESTOES = 6;

export interface Mencionavel {
  id: string;
  nome: string;
}

/**
 * O token de menção sob o cursor.
 *
 * Duas decisões que não são detalhe:
 *
 * - Só conta o `@` que ABRE palavra (início do texto, espaço, quebra de linha
 *   ou parêntese). Sem essa âncora, o `@` de um e-mail colado no meio da nota
 *   (`fulano@empresa.com` — e a nota É texto colado de e-mail) abriria a lista
 *   a cada tecla.
 * - Uma palavra só depois do `@`. Aceitar duas reabriria a lista logo depois
 *   de escolher alguém: a inserção termina em espaço, e a palavra seguinte da
 *   frase voltaria a contar como busca. Filtrar por "@kel" já acha
 *   "Kelly Silva" — `casaTodosOsTermos` casa em qualquer parte do nome.
 */
const RE_TOKEN = /(^|[\s(\n])@([\p{L}\p{M}\d.'-]{0,20})$/u;

function tokenSobOCursor(
  texto: string,
  caret: number,
): { inicio: number; consulta: string } | null {
  const ate = texto.slice(0, caret);
  const m = RE_TOKEN.exec(ate);
  if (!m) return null;
  const consulta = m[2] ?? "";
  return { inicio: caret - consulta.length - 1, consulta };
}

export interface ControleMencoes {
  mencionados: Mencionavel[];
  ids: string[];
  aberto: boolean;
  sugestoes: Mencionavel[];
  indice: number;
  aviso: string | null;
  carregando: boolean;
  idLista: string;
  idOpcao: (i: number) => string;
  idAtivo: string | undefined;
  aoMudarTexto: (valor: string) => void;
  aoTeclar: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  escolher: (p: Mencionavel) => void;
  remover: (id: string) => void;
  limpar: () => void;
  fechar: () => void;
}

/**
 * `texto`/`setTexto` continuam no formulário: o hook não é dono do que a
 * equipe escreveu — ele só sabe onde o cursor está e o que fazer com o `@`.
 *
 * ⚠️ O `ref` do campo vem de FORA e **não** volta no objeto de controle. Um
 * objeto que carrega ref dentro contamina toda leitura dele no render (regra
 * `react-hooks/refs` do compilador do React) — e o controle é lido no JSX o
 * tempo todo. O formulário é dono do ref; o hook só o usa em evento.
 */
export function useMencoes(
  texto: string,
  setTexto: (v: string) => void,
  uid: string,
  refTextarea: React.RefObject<HTMLTextAreaElement | null>,
): ControleMencoes {
  /** `null` = ainda não pedimos ao servidor. `[]` = pedimos e não veio ninguém. */
  const [pessoas, setPessoas] = useState<Mencionavel[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [consulta, setConsulta] = useState<string | null>(null);
  const [inicio, setInicio] = useState(0);
  const [indice, setIndice] = useState(0);
  const [mencionados, setMencionados] = useState<Mencionavel[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const idLista = `${uid}-mencoes`;
  const idOpcao = (i: number) => `${idLista}-op-${i}`;

  /** Uma vez por formulário. Só a partir do primeiro `@` — quem nunca menciona não paga a consulta. */
  const carregar = useCallback(() => {
    if (pessoas !== null || carregando) return;
    setCarregando(true);
    void listarMencionaveis()
      .then((lista) => setPessoas(lista))
      // A action já engole o erro e devolve `[]` com `logErro` no servidor.
      // Aqui `[]` significa "não há a quem avisar", e a tela diz isso.
      .catch(() => setPessoas([]))
      .finally(() => setCarregando(false));
  }, [pessoas, carregando]);

  const disponiveis = (pessoas ?? []).filter(
    (p) => !mencionados.some((m) => m.id === p.id),
  );
  const sugestoes =
    consulta === null
      ? []
      : disponiveis
          .filter((p) => casaTodosOsTermos(p.nome, consulta))
          .slice(0, MAX_SUGESTOES);
  const aberto = consulta !== null && sugestoes.length > 0;

  function fechar() {
    setConsulta(null);
    setIndice(0);
  }

  function aoMudarTexto(valor: string) {
    setTexto(valor);
    const caret = refTextarea.current?.selectionStart ?? valor.length;
    const token = tokenSobOCursor(valor, caret);
    if (!token) {
      fechar();
      return;
    }
    carregar();
    setInicio(token.inicio);
    setConsulta(token.consulta);
    setIndice(0);
  }

  function escolher(p: Mencionavel) {
    // O TEXTO é atualizado mesmo no teto: o `@Nome` faz a nota ser lida por
    // quem abrir depois. O que o teto barra é o AVISO — e isso é dito.
    const el = refTextarea.current;
    const caret = el?.selectionStart ?? texto.length;
    const antes = texto.slice(0, inicio);
    const depois = texto.slice(caret);
    // O espaço final só entra se já não houver um: escolher no MEIO da frase
    // não pode deixar espaço dobrado no texto que a equipe escreveu.
    const insercao = `@${p.nome}` + (/^\s/.test(depois) ? "" : " ");
    setTexto(antes + insercao + depois);

    if (mencionados.length >= MAX_MENCOES) {
      setAviso(
        `Uma nota avisa no máximo ${MAX_MENCOES} pessoas. ${p.nome} ficou de fora do aviso — o nome continua no texto.`,
      );
    } else {
      setMencionados((prev) => [...prev, p]);
      setAviso(null);
    }
    fechar();

    // O cursor volta para depois do nome inserido. Sem isto ele iria para o fim
    // do texto e a equipe perderia o ponto em que estava escrevendo.
    const posicao = antes.length + insercao.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(posicao, posicao);
    });
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!aberto) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => (i + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => (i - 1 + sugestoes.length) % sugestoes.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Enter com a lista aberta escolhe; com a lista fechada continua sendo
      // quebra de linha. Nunca envia o formulário.
      e.preventDefault();
      escolher(sugestoes[indice] ?? sugestoes[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    }
  }

  function remover(id: string) {
    setMencionados((prev) => prev.filter((m) => m.id !== id));
    setAviso(null);
  }

  function limpar() {
    setMencionados([]);
    setAviso(null);
    fechar();
  }

  return {
    mencionados,
    ids: mencionados.map((m) => m.id),
    aberto,
    sugestoes,
    indice,
    aviso,
    carregando,
    idLista,
    idOpcao,
    idAtivo: aberto ? idOpcao(indice) : undefined,
    aoMudarTexto,
    aoTeclar,
    escolher,
    remover,
    limpar,
    fechar,
  };
}

/** A lista de sugestões. Ancorada logo abaixo do campo, sem `position: fixed`. */
export function ListaMencionaveis({ ctrl }: { ctrl: ControleMencoes }) {
  return (
    <>
      {/* Status para quem não vê a lista aparecer. Sempre montado: região viva
          criada junto com o conteúdo não é anunciada por parte dos leitores. */}
      <p aria-live="polite" className="sr-only">
        {ctrl.aberto
          ? `${ctrl.sugestoes.length} ${ctrl.sugestoes.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}. Use as setas para escolher e Enter para confirmar.`
          : ""}
      </p>

      {ctrl.aberto ? (
        <ul
          id={ctrl.idLista}
          role="listbox"
          aria-label="Pessoas da equipe para mencionar"
          className="z-20 -mt-1 max-h-56 overflow-y-auto rounded-lg border border-borda-forte bg-card py-1 shadow-(--shadow-raised)"
        >
          {ctrl.sugestoes.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                id={ctrl.idOpcao(i)}
                role="option"
                aria-selected={i === ctrl.indice}
                // `mousedown` levaria o foco embora do campo antes do clique.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ctrl.escolher(p)}
                className={
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left corpo-sm transition " +
                  (i === ctrl.indice
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted")
                }
              >
                <AtSign aria-hidden className="size-3.5 shrink-0 opacity-70" />
                <span className="min-w-0 truncate">{p.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Quem vai receber o aviso — e o que o aviso NÃO promete. */
export function ChipsMencionados({ ctrl }: { ctrl: ControleMencoes }) {
  if (ctrl.mencionados.length === 0 && !ctrl.aviso) return null;

  return (
    <div className="grid gap-1.5">
      {ctrl.mencionados.length > 0 ? (
        <>
          <p className="rotulo text-muted-foreground">
            Avisar {ctrl.mencionados.length} de {MAX_MENCOES}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {ctrl.mencionados.map((m) => (
              <li key={m.id}>
                <span className="inline-flex items-center gap-1 rounded-full bg-superficie-afundada py-0.5 pr-1 pl-2.5 text-xs font-medium text-neutro-foreground">
                  {m.nome}
                  <button
                    type="button"
                    onClick={() => ctrl.remover(m.id)}
                    aria-label={`Não avisar ${m.nome}`}
                    className="foco-visivel rounded-full p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {/* Honestidade obrigatória: o canal do Slack pode estar desligado
                (`gps.config.slack_mencoes_ativo`) ou o webhook não configurado.
                A menção fica registrada de qualquer jeito — prometer entrega
                seria prometer o que esta tela não sabe. */}
            A menção fica registrada na nota. O aviso no Slack sai quando o canal
            está ligado — tirar alguém daqui não apaga o nome do texto.
          </p>
        </>
      ) : null}

      <p role="alert" className="corpo-sm text-atencao-foreground empty:hidden">
        {ctrl.aviso}
      </p>
    </div>
  );
}
