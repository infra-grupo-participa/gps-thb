"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Avaliação (NPS) pós-plantão.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Só é renderizado por quem chama (a página) quando a inscrição TEM presença
 * e o plantão JÁ TERMINOU — este componente não repete essa checagem.
 * Nota 0–10 em BOTÕES (não slider: em iframe estreito, slider é armadilha de
 * toque). Comentário opcional. Um envio só; depois de enviado, agradece e
 * some (não reabre para editar).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon } from "lucide-react";
import { registrarNps } from "@/app/p/plantao/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NOTAS = Array.from({ length: 11 }, (_, i) => i); // 0..10

export function NpsForm({ inscricaoId }: { inscricaoId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [enviado, setEnviado] = useState(false);

  if (enviado) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2.5 pt-5 text-sm">
          <CheckCircle2Icon className="size-5 shrink-0 text-primary" aria-hidden />
          Obrigado pela avaliação!
        </CardContent>
      </Card>
    );
  }

  function enviar() {
    if (nota === null) {
      toast.error("Escolha uma nota de 0 a 10.");
      return;
    }
    startTransition(async () => {
      const res = await registrarNps(inscricaoId, nota, comentario);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      setEnviado(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          De 0 a 10, o quanto você recomendaria este plantão?
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          role="radiogroup"
          aria-label="Nota de 0 a 10"
          className="grid grid-cols-6 gap-1.5 sm:grid-cols-11"
        >
          {NOTAS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nota === n}
              onClick={() => setNota(n)}
              disabled={pending}
              className={
                "flex h-9 items-center justify-center rounded-lg border text-sm font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 " +
                (nota === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent hover:bg-muted")
              }
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="nps-comentario">Comentário (opcional)</Label>
          <Textarea
            id="nps-comentario"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            disabled={pending}
            placeholder="O que podemos melhorar?"
            rows={3}
          />
        </div>

        <Button onClick={enviar} disabled={pending || nota === null} className="self-start">
          {pending ? "Enviando..." : "Enviar avaliação"}
        </Button>
      </CardContent>
    </Card>
  );
}
