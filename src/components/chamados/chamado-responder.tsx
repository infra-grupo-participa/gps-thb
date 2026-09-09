"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { fecharChamado, responderChamado } from "@/app/chamados/actions";
import {
  CHAMADO_TEXTO_MAXIMO,
  type AnexoInput,
} from "@/lib/chamados-tipos";
import { AnexoCampo } from "@/components/chamados/anexo-campo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Responder e fechar — a MESMA action serve aluno e equipe
 * (`src/app/chamados/actions.ts`): quem decide o papel é o banco
 * (`gp_is_admin()` → 'equipe'), e o cliente não informa quem é.
 *
 * `bloqueio` chega pronto do servidor (interruptor fechado, prazo de
 * reabertura vencido, teto de 20 mensagens). Quando ele existe, o formulário
 * não é montado: campo desabilitado sem explicação é o que faz a pessoa
 * clicar cinco vezes e abrir um chamado sobre o chamado.
 *
 * 🔴 Esconder o formulário NÃO é a fronteira — as RPCs recusam de qualquer
 * jeito, com 42501, e a action traduz a frase.
 */
export function ChamadoResponder({
  chamadoId,
  visao,
  podeAnexar,
  bloqueio,
  aviso,
  podeFechar,
}: {
  chamadoId: string;
  visao: "aluno" | "admin";
  /** Só o aluno anexa (B5-c). A equipe responde com texto e link. */
  podeAnexar: boolean;
  /** Frase pronta que impede o envio. `null` = pode responder. */
  bloqueio: string | null;
  /** Frase de contexto que NÃO impede ("fechado em dd/mm; responder reabre"). */
  aviso: string | null;
  podeFechar: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const idTexto = `${uid}-texto`;
  const idContador = `${uid}-contador`;
  const idErro = `${uid}-erro`;

  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<AnexoInput | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fecharAberto, setFecharAberto] = useState(false);
  const [pendente, startTransition] = useTransition();

  const textoValido =
    texto.trim().length > 0 && texto.length <= CHAMADO_TEXTO_MAXIMO;

  function enviar() {
    if (!textoValido) return;
    setErro(null);
    startTransition(async () => {
      const r = await responderChamado({
        chamadoId,
        texto,
        anexo: anexo ?? undefined,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      toast.success("Mensagem enviada.");
      setTexto("");
      setAnexo(null);
      // A action já revalida a rota; o refresh é o que repinta a thread com a
      // mensagem nova sem F5.
      router.refresh();
    });
  }

  function fechar() {
    setErro(null);
    startTransition(async () => {
      const r = await fecharChamado(chamadoId);
      if (!r.ok) {
        setErro(r.erro);
        setFecharAberto(false);
        return;
      }
      toast.success("Chamado fechado.");
      setFecharAberto(false);
      router.refresh();
    });
  }

  const botaoFechar = podeFechar ? (
    <Dialog open={fecharAberto} onOpenChange={setFecharAberto}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <CheckCircle2 aria-hidden /> Fechar chamado
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar este chamado?</DialogTitle>
          <DialogDescription>
            {visao === "aluno"
              ? "Você pode reabrir respondendo aqui mesmo nos próximos 7 dias. Depois disso, é preciso abrir um chamado novo."
              : "O aluno pode reabrir respondendo nos próximos 7 dias. Depois disso, ele precisa abrir um chamado novo."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-wrap justify-end gap-2">
          <DialogClose render={<Button type="button" variant="ghost" />}>
            Cancelar
          </DialogClose>
          <Button
            type="button"
            onClick={fechar}
            disabled={pendente}
            aria-busy={pendente || undefined}
          >
            {pendente ? "Fechando…" : "Fechar chamado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  if (bloqueio) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">{bloqueio}</p>
          {botaoFechar ? <div>{botaoFechar}</div> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        {aviso ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {aviso}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor={idTexto}>
            {visao === "admin" ? "Responder ao aluno" : "Responder"}
          </Label>
          <Textarea
            id={idTexto}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              visao === "admin"
                ? "A resposta da equipe. O aluno recebe um e-mail avisando (sem o texto)."
                : "Conte o que faltou ou responda o que a equipe perguntou."
            }
            rows={4}
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

        {podeAnexar ? (
          <AnexoCampo aoMudar={setAnexo} desabilitado={pendente} />
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <p
            id={idErro}
            role="alert"
            className="mr-auto text-sm text-destructive"
          >
            {erro}
          </p>
          {botaoFechar}
          <Button
            type="button"
            onClick={enviar}
            disabled={pendente || !textoValido}
            aria-busy={pendente || undefined}
          >
            <Send aria-hidden /> {pendente ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
