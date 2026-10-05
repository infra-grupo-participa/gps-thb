"use client";

/**
 * Os 3 links da sequência de mensagens — cada um abre a copy pronta.
 *
 * Pedido do Marcio (10/09/2026): *"a gente vai colocar esses botões como
 * links. Cada link vai abrir um pop-up com o conteúdo da mensagem, com um
 * botão, uma funcionalidade para copiar aquilo e as instruções de envio"*.
 *
 * 🔑 O QUE SE VÊ É O QUE SE COLA. A tela mostra o texto do mesmo jeito que
 * ele vai para a área de transferência — parágrafos e tudo. Os `*asteriscos*`
 * ficam à mostra de propósito: são o negrito do WhatsApp, e as instruções
 * mandam negritar trechos específicos ("mais que isso vira panfleto").
 * Renderizar bonito aqui e copiar sem eles entregaria ao cliente uma
 * mensagem sem a ênfase que a equipe desenhou.
 *
 * 🔴 NÃO EXISTE BOTÃO DE COPIAR IMAGEM. O Marcio falou em "copiar a imagem",
 * mas o documento (`Método Holding Brasil.md`) não traz imagem nenhuma — as
 * 3 mensagens são só texto. Um botão que copiasse nada seria pior do que não
 * ter botão. Quando a arte existir, ela entra em `MensagemDaSequencia`.
 */

import { useState } from "react";
import { Check, Copy, MessageSquareText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SEQUENCIA_MENSAGENS,
  type MensagemDaSequencia,
} from "@/lib/mensagens-etapa1";

export function SequenciaMensagens({ bloqueada }: { bloqueada: boolean }) {
  const [aberta, setAberta] = useState<MensagemDaSequencia | null>(null);

  return (
    <>
      {/* Os modelos ficam SEMPRE abertos para leitura e cópia (pedido 02/10/2026:
          o parceiro achava que "não existe modelo"). `bloqueada` só muda o
          aviso — a conclusão do passo segue travada pelos 30 em `etapas.ts`. */}
      {bloqueada ? (
        <p className="mb-2 corpo text-muted-foreground">
          Você envia estes modelos depois da lista de 30. Já pode ler e copiar.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {SEQUENCIA_MENSAGENS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setAberta(m)}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda-forte bg-card px-3 py-2 text-left corpo transition hover:border-marca-acao hover:bg-primary/[0.04] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <MessageSquareText aria-hidden className="size-5 shrink-0 text-accent-foreground" />
            <span>
              <span className="font-medium">Mensagem {m.ordem}</span>
              <span className="text-muted-foreground"> — {m.titulo}</span>
            </span>
          </button>
        ))}
      </div>

      <Dialog
        open={aberta !== null}
        onOpenChange={(v) => {
          if (!v) setAberta(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {aberta ? <CorpoDaMensagem mensagem={aberta} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CorpoDaMensagem({ mensagem }: { mensagem: MensagemDaSequencia }) {
  const [copiado, setCopiado] = useState(false);
  // O BOTÃO volta a "Copiar mensagem" em 2,5 s; a FRASE de próximo passo
  // fica — quem lê devagar não perde o "cole no WhatsApp".
  const [resultadoCopia, setResultadoCopia] = useState<"ok" | "falhou" | null>(null);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem.texto);
      setCopiado(true);
      setResultadoCopia("ok");
      // Volta ao estado normal: um "Copiado" permanente faz a pessoa achar
      // que o botão parou de funcionar quando ela quiser copiar de novo.
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // `clipboard` exige contexto seguro e pode ser negado pelo navegador.
      // O texto está na tela e é selecionável — o caminho manual continua,
      // e agora a tela DIZ isso em vez de não fazer nada.
      setCopiado(false);
      setResultadoCopia("falhou");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Mensagem {mensagem.ordem} — {mensagem.titulo}
        </DialogTitle>
        <DialogDescription>{mensagem.quando}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="rotulo text-muted-foreground">
              A mensagem
              <span className="ml-2 font-normal normal-case tabular-nums">
                {mensagem.texto.length.toLocaleString("pt-BR")} caracteres
              </span>
            </span>
            <Button type="button" size="lg" className="h-11" onClick={copiar}>
              {copiado ? (
                <>
                  <Check aria-hidden className="size-4" /> Copiado
                </>
              ) : (
                <>
                  <Copy aria-hidden className="size-4" /> Copiar mensagem
                </>
              )}
            </Button>
          </div>

          {/* 🔑 UM PARÁGRAFO POR BLOCO, não um paredão.

              A mensagem vai numa ÚNICA mensagem do WhatsApp — a instrução é
              explícita: "não em quatro balões" — mas com respiro DENTRO.
              É carta pessoal, e carta pessoal tem parágrafo; o texto
              corrido de 4 mil caracteres é justamente o que faz a pessoa
              não ler.

              A quebra dupla vive no próprio texto, então ela vai junto no
              que se copia. Aqui ela vira espaçamento de verdade, para o
              aluno conferir na tela o que vai mandar.

              `select-all` para quem preferir copiar à mão. */}
          <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-borda-fina bg-superficie-afundada p-4 corpo leading-relaxed select-all">
            {mensagem.texto.split(/\n{2,}/).map((paragrafo, i) => (
              <p key={i}>{paragrafo}</p>
            ))}
          </div>

          <p
            aria-live="polite"
            className={
              resultadoCopia === "ok"
                ? "flex items-start gap-1.5 corpo font-medium text-sucesso-foreground"
                : resultadoCopia === "falhou"
                  ? "corpo font-medium text-risco-foreground"
                  : "corpo text-muted-foreground"
            }
          >
            {resultadoCopia === "ok" ? (
              <>
                <Check aria-hidden className="mt-1 size-4 shrink-0" />
                <span>Copiada. Cole no WhatsApp e troque o [Nome] antes de enviar.</span>
              </>
            ) : resultadoCopia === "falhou" ? (
              "Não deu para copiar. Toque no texto acima e copie à mão."
            ) : (
              "Os *asteriscos* viram negrito no WhatsApp. Cole do jeito que está."
            )}
          </p>
        </div>

        <div className="grid gap-2">
          <span className="rotulo text-muted-foreground">Instruções de envio</span>
          <ul className="grid gap-2">
            {mensagem.instrucoes.map((i, idx) => (
              <li key={idx} className="flex gap-2 corpo">
                <span aria-hidden className="shrink-0 text-primary">
                  →
                </span>
                <span>{i}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
