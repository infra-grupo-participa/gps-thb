"use client";

/**
 * "Colar lista" — cadastra vários clientes de uma vez (Onda 1.2, 02/10/2026).
 *
 * Reclamação literal dos parceiros no Digisac: *"só consegui cadastrar um"*.
 * Quem já tem os nomes numa planilha ou no bloco de notas cola tudo aqui.
 *
 * TRÊS PASSOS, nunca gravação direta:
 *   1 · colar   — área de texto com o formato explicado por exemplo;
 *   2 · prévia  — tabela com o que entra e o que fica de fora, com o motivo
 *                 de cada recusa. Nada foi gravado ainda, e a tela diz isso;
 *   3 · resultado — o que o SERVIDOR inseriu e o que ele ignorou (ex.:
 *                 cliente que já existia). A prévia é palpite do navegador;
 *                 o resultado é o que de fato aconteceu.
 *
 * 🔑 O parser é puro e testado (`src/lib/colar-clientes.ts`). Este arquivo só
 * desenha. A trava de verdade (teto de 50, nome válido) é a action
 * `cadastrarClientesEmLote` — Server Action é endpoint HTTP.
 *
 * O foco acompanha o passo: ao trocar de passo, o título do passo novo recebe
 * o foco (`tabIndex={-1}`) — sem isso, quem usa teclado ou leitor de tela fica
 * com o foco num botão que acabou de sumir.
 */

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { analisarListaColada, TETO_LOTE } from "@/lib/colar-clientes";
import { cadastrarClientesEmLote } from "@/app/clientes/lote-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvisoInline } from "@/components/ui/aviso-inline";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Passo = "colar" | "previa" | "resultado";

interface Resultado {
  inseridos: number;
  ignorados: { linha: number; motivo: string }[];
  /** Os nomes na ordem enviada — para dizer QUEM foi ignorado. */
  enviados: string[];
}

export function DialogoColarLista({
  comDados,
  meta,
  onFechar,
}: {
  /** Fichas com nome + telefone hoje — o progresso rumo aos 30. */
  comDados: number;
  meta: number;
  /**
   * A lista atrás do diálogo se atualiza sozinha: a action faz
   * `revalidatePath("/clientes")`, a prop `clientesIniciais` chega nova e o
   * `ClientesManager` a adota. Por isso não há `router.refresh()` aqui — seria
   * um segundo render do servidor pelo mesmo dado.
   */
  onFechar: () => void;
}) {
  const uid = useId();
  const idTexto = `${uid}-texto`;
  const idAjuda = `${uid}-ajuda`;
  const [texto, setTexto] = useState("");
  const [passo, setPasso] = useState<Passo>("colar");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pending, startTransition] = useTransition();
  const tituloPasso = useRef<HTMLHeadingElement>(null);

  // Só calcula na prévia: o parser roda sobre até centenas de linhas e não há
  // motivo para refazer a cada tecla no passo 1.
  const analise = useMemo(
    () => (passo === "colar" ? null : analisarListaColada(texto)),
    [passo, texto],
  );
  const validas = analise?.paraEnviar.length ?? 0;
  const invalidas = (analise?.linhas.length ?? 0) - validas;

  // O foco vai ao título do passo novo (o botão que o levou até aqui sumiu).
  useEffect(() => {
    if (passo !== "colar") tituloPasso.current?.focus();
  }, [passo]);

  function confirmar() {
    if (!analise || validas === 0) return;
    setErro(null);
    const enviados = analise.paraEnviar;
    startTransition(async () => {
      const res = await cadastrarClientesEmLote(enviados);
      if (!res.ok && res.inseridos === 0) {
        setErro(res.erro ?? "Não foi possível cadastrar a lista. Nada foi gravado.");
        return;
      }
      setResultado({
        inseridos: res.inseridos,
        ignorados: res.ignorados ?? [],
        enviados: enviados.map((e) => e.nome),
      });
      setPasso("resultado");
    });
  }

  /**
   * Quem foi ignorado, pelo nome. `linha` da action é 1 = primeiro ENVIADO
   * (`prepararLoteClientes`, `i + 1`) — não a linha do texto colado, que
   * pode ter vazias e recusadas antes. Sem casar, mostra só o número.
   */
  function nomeDaLinha(linha: number): string | null {
    return resultado?.enviados[linha - 1] ?? null;
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !pending) onFechar();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Colar lista de clientes</DialogTitle>
          <DialogDescription>
            Cadastre até {TETO_LOTE} pessoas de uma vez. Você tem{" "}
            <strong>
              {comDados} de {meta}
            </strong>{" "}
            com nome e telefone.
          </DialogDescription>
        </DialogHeader>

        {passo === "colar" ? (
          <div className="grid gap-2">
            <Label htmlFor={idTexto}>Uma pessoa por linha</Label>
            <Textarea
              id={idTexto}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-describedby={idAjuda}
              rows={8}
              autoFocus
              spellCheck={false}
              className="max-h-[40dvh] min-h-40 font-mono text-sm"
              placeholder={"Maria da Silva - (11) 98888-7777\nJoão Souza; 21 99999-0000\nAna Lima"}
            />
            <p id={idAjuda} className="text-xs leading-snug text-muted-foreground">
              Escreva o nome e, se tiver, o telefone com DDD, separados por
              hífen, ponto e vírgula ou vírgula. Também dá para copiar as duas
              colunas (nome e telefone) de uma planilha e colar aqui. Sem
              telefone a pessoa entra, mas só conta para os {meta} quando você
              preencher o telefone na ficha.
            </p>
          </div>
        ) : null}

        {passo === "previa" && analise ? (
          <div className="grid gap-3">
            <h3
              ref={tituloPasso}
              tabIndex={-1}
              className="font-heading text-base font-semibold outline-none"
            >
              Confira antes de cadastrar
            </h3>
            {/* Região viva: o número muda quando a pessoa volta e corrige. */}
            <p aria-live="polite" className="corpo-sm">
              <strong>{validas}</strong>{" "}
              {validas === 1 ? "pessoa vai entrar" : "pessoas vão entrar"}
              {invalidas > 0 ? (
                <>
                  {" · "}
                  <strong>{invalidas}</strong>{" "}
                  {invalidas === 1 ? "linha fica de fora" : "linhas ficam de fora"}
                </>
              ) : null}
              . Nada foi gravado ainda.
            </p>
            {analise.acimaDoTeto > 0 ? (
              <AvisoInline>
                A lista tem mais de {TETO_LOTE} pessoas. Entram as{" "}
                {TETO_LOTE} primeiras; as outras {analise.acimaDoTeto} você cola
                de novo depois de cadastrar estas.
              </AvisoInline>
            ) : null}
            {analise.linhas.length === 0 ? (
              <p className="corpo-sm text-muted-foreground">
                Nenhuma linha com conteúdo. Volte e cole a lista.
              </p>
            ) : (
              <div className="max-h-[45dvh] overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Prévia da lista colada: linha, nome, telefone e situação
                  </caption>
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-2 py-1.5 font-medium">Linha</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Nome</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Telefone</th>
                      <th scope="col" className="px-2 py-1.5 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.linhas.map((l) => (
                      <tr key={l.linha} className="border-t align-top">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                          {l.linha}
                        </td>
                        <td className="px-2 py-1.5 break-words">{l.nome || "—"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {l.telefone ?? "—"}
                        </td>
                        <td
                          className={
                            l.valida
                              ? "px-2 py-1.5"
                              : "px-2 py-1.5 text-destructive"
                          }
                        >
                          {l.valida ? "Entra" : `Fica de fora: ${l.motivo}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {passo === "resultado" && resultado ? (
          <div className="grid gap-3">
            <h3
              ref={tituloPasso}
              tabIndex={-1}
              className="font-heading text-base font-semibold outline-none"
            >
              {resultado.inseridos === 1
                ? "1 cliente cadastrado"
                : `${resultado.inseridos} clientes cadastrados`}
            </h3>
            {resultado.ignorados.length > 0 ? (
              <>
                <p className="corpo-sm">
                  {resultado.ignorados.length === 1
                    ? "1 não entrou:"
                    : `${resultado.ignorados.length} não entraram:`}
                </p>
                <ul className="grid max-h-[40dvh] gap-1 overflow-auto rounded-md border p-2 corpo-sm">
                  {resultado.ignorados.map((ig) => {
                    const nome = nomeDaLinha(ig.linha);
                    return (
                      <li key={`${ig.linha}-${ig.motivo}`}>
                        {nome ? <strong>{nome}</strong> : <>Item {ig.linha}</>}
                        {" — "}
                        {ig.motivo}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
            <p className="corpo-sm text-muted-foreground">
              Eles já estão na sua lista. Para contar para os {meta}, cada um
              precisa de nome e telefone — quem entrou sem telefone, complete
              na ficha.
            </p>
          </div>
        ) : null}

        {/* Sempre montado: região viva que nasce com o texto não é anunciada. */}
        <p role="alert" className="text-xs text-destructive empty:hidden">
          {erro}
        </p>

        <DialogFooter>
          {passo === "colar" ? (
            <>
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button
                onClick={() => setPasso("previa")}
                disabled={texto.trim() === ""}
              >
                Ver prévia
              </Button>
            </>
          ) : null}
          {passo === "previa" ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setErro(null);
                  setPasso("colar");
                }}
                disabled={pending}
              >
                Voltar e corrigir
              </Button>
              <Button
                onClick={confirmar}
                disabled={pending || validas === 0}
                aria-busy={pending || undefined}
              >
                {pending
                  ? "Cadastrando…"
                  : validas === 1
                    ? "Cadastrar 1 pessoa"
                    : `Cadastrar ${validas} pessoas`}
              </Button>
            </>
          ) : null}
          {passo === "resultado" ? (
            <Button onClick={onFechar}>Fechar</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
