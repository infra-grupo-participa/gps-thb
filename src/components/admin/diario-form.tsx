"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { registrarNota } from "@/app/admin/diario-actions";
import { VOZES_NOTA, TIPOS_NOTA, ORIGENS_NOTA } from "@/lib/types";
import type { VozNota, TipoNota, OrigemNota } from "@/lib/types";
import {
  ROTULO_VOZ,
  ROTULO_TIPO,
  ROTULO_ORIGEM,
} from "@/components/admin/diario-labels";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TEXTO_MAXIMO = 8000;

/** Formulário de registro de nova nota no diário. Só o texto é obrigatório. */
export function DiarioForm({ alunoId }: { alunoId: string }) {
  const [texto, setTexto] = useState("");
  const [voz, setVoz] = useState<VozNota>("equipe");
  const [tipo, setTipo] = useState<TipoNota>("observacao");
  const [origem, setOrigem] = useState<OrigemNota>("plataforma");
  const [pending, startTransition] = useTransition();

  const textoValido = texto.trim().length > 0 && texto.length <= TEXTO_MAXIMO;

  function registrar() {
    if (!textoValido) return;
    startTransition(async () => {
      const res = await registrarNota({ alunoId, voz, tipo, origem, texto });
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success("Nota registrada.");
      setTexto("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registrar nota</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="diario-texto">Texto</Label>
          <Textarea
            id="diario-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="O que aconteceu, o que foi combinado ou o que ficou pendente."
            rows={4}
            maxLength={TEXTO_MAXIMO}
            aria-describedby="diario-texto-contador"
          />
          <div
            id="diario-texto-contador"
            className="text-right text-xs text-muted-foreground"
          >
            {texto.length}/{TEXTO_MAXIMO}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="diario-voz">Voz</Label>
            <Select value={voz} onValueChange={(v) => setVoz(v as VozNota)}>
              <SelectTrigger id="diario-voz" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOZES_NOTA.map((v) => (
                  <SelectItem key={v} value={v}>
                    {ROTULO_VOZ[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="diario-tipo">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNota)}>
              <SelectTrigger id="diario-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_NOTA.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="diario-origem">Origem</Label>
            <Select
              value={origem}
              onValueChange={(v) => setOrigem(v as OrigemNota)}
            >
              <SelectTrigger id="diario-origem" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGENS_NOTA.map((o) => (
                  <SelectItem key={o} value={o}>
                    {ROTULO_ORIGEM[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={registrar} disabled={pending || !textoValido}>
            {pending ? "Registrando..." : "Registrar nota"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
