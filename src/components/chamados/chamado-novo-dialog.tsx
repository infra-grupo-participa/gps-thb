"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { abrirChamado } from "@/app/chamados/actions";
import {
  CHAMADO_ASSUNTO_MAXIMO,
  CHAMADO_ASSUNTO_MINIMO,
  CHAMADO_TEXTO_MAXIMO,
  type AnexoInput,
} from "@/lib/chamados-tipos";
import { AnexoCampo } from "@/components/chamados/anexo-campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Abrir chamado" — o formulário de entrada do suporte.
 *
 * `DialogTrigger` (em vez de `Button` + estado solto) é o que devolve o foco
 * ao gatilho quando o diálogo fecha; sem ele o teclado volta para o `<body>`
 * e a pessoa recomeça a navegação do topo da página.
 *
 * O anexo sobe ANTES do envio (ver `AnexoCampo`): quando `abrirChamado` roda,
 * o arquivo já está no bucket e a abertura é um INSERT atômico. Se a pessoa
 * desistir depois de subir, o arquivo vira órfão — e órfão é exatamente o que
 * a tela de retenção do admin expurga.
 */
export function ChamadoNovoDialog({
  assuntoInicial = "",
}: {
  /**
   * Texto que já vem escrito no campo Assunto — hoje vem de `?assunto=` na
   * URL, para quem chega da ficha do cliente pedindo a troca do cliente
   * acompanhado.
   *
   * 🔑 É PREFILL, não pré-aprovação: o valor entra como estado inicial de um
   * campo que a pessoa lê e edita, e quem valida continua sendo
   * `abrirChamado` (mínimo e máximo) — nada aqui confia na URL.
   */
  assuntoInicial?: string;
} = {}) {
  const router = useRouter();
  const uid = useId();
  const idAssunto = `${uid}-assunto`;
  const idTexto = `${uid}-texto`;
  const idContador = `${uid}-contador`;
  const idErro = `${uid}-erro`;

  const [aberto, setAberto] = useState(false);
  const [assunto, setAssunto] = useState(assuntoInicial);
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<AnexoInput | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const assuntoValido =
    assunto.trim().length >= CHAMADO_ASSUNTO_MINIMO &&
    assunto.trim().length <= CHAMADO_ASSUNTO_MAXIMO;
  const textoValido =
    texto.trim().length > 0 && texto.length <= CHAMADO_TEXTO_MAXIMO;

  function enviar() {
    if (!assuntoValido || !textoValido) return;
    setErro(null);
    startTransition(async () => {
      const r = await abrirChamado({
        assunto,
        texto,
        anexo: anexo ?? undefined,
      });
      if (!r.ok) {
        // O erro fica NA TELA, dentro do diálogo: um toast sumiria junto com
        // a única pista de por que o chamado não foi aberto.
        setErro(r.erro);
        return;
      }
      toast.success("Chamado aberto. A equipe foi avisada.");
      setAberto(false);
      // Volta ao prefill, não ao vazio: o diálogo continua montado na página
      // e reabri-lo depois de abrir um chamado deve oferecer o mesmo ponto de
      // partida da primeira vez.
      setAssunto(assuntoInicial);
      setTexto("");
      setAnexo(null);
      router.push(`/chamados/${r.chamadoId}`);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button type="button" />}>
        <LifeBuoy aria-hidden /> Abrir chamado
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir chamado</DialogTitle>
          <DialogDescription>
            Descreva o que aconteceu. Se ajudar, anexe um print ou um PDF. A
            equipe responde por aqui e você recebe um e-mail quando houver
            resposta.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={idAssunto}>Assunto</Label>
            <Input
              id={idAssunto}
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Ex.: não consigo cadastrar um cliente"
              maxLength={CHAMADO_ASSUNTO_MAXIMO}
              autoComplete="off"
              aria-invalid={erro ? true : undefined}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={idTexto}>Mensagem</Label>
            <Textarea
              id={idTexto}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="O que você tentou fazer, o que aconteceu e em qual tela."
              rows={5}
              maxLength={CHAMADO_TEXTO_MAXIMO}
              aria-describedby={idContador}
              aria-invalid={erro ? true : undefined}
            />
            <div
              id={idContador}
              className="text-right text-xs text-muted-foreground tabular-nums"
            >
              {texto.length}/{CHAMADO_TEXTO_MAXIMO}
            </div>
          </div>

          <AnexoCampo aoMudar={setAnexo} desabilitado={pendente} />

          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Sempre montado: região viva que nasce junto com o texto não é
                anunciada por parte dos leitores de tela. */}
            <p
              id={idErro}
              role="alert"
              className="mr-auto text-sm text-destructive"
            >
              {erro}
            </p>
            <Button
              type="button"
              onClick={enviar}
              disabled={pendente || !assuntoValido || !textoValido}
              aria-busy={pendente || undefined}
            >
              {pendente ? "Enviando…" : "Abrir chamado"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
