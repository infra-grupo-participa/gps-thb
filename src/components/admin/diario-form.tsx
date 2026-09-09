"use client";

import { useId, useState, useTransition } from "react";
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

/**
 * Formulário de registro de nova nota no diário. Só o texto é obrigatório.
 *
 * `eventoId`/`contextoEvento` (Fase 2) ligam a nota a uma ação específica do
 * log (`gps.aluno_eventos`) — usado quando o formulário abre a partir de um
 * item da trilha ("Registrar observação sobre: Listou 15 clientes"). Sem
 * eles, o comportamento é o mesmo da Fase 1 (nota solta).
 *
 * `variante` (Fase 5): `"cartao"` (padrão, comportamento intacto) desenha o
 * `Card` com título próprio; `"embutido"` entrega só os campos, para quem já
 * tem moldura e título — hoje o diálogo da nota rápida (`NotaRapida`), onde um
 * `Card` dentro do `DialogContent` empilharia duas bordas e dois títulos.
 *
 * Os `id` dos campos saem de `useId()`, não de literais: dois formulários na
 * mesma página (a página do Diário e um diálogo aberto por cima) repetiriam
 * `id="diario-texto"` e o `<label for>` passaria a apontar para o campo errado.
 */
export function DiarioForm({
  alunoId,
  eventoId,
  contextoEvento,
  aoRegistrar,
  variante = "cartao",
}: {
  alunoId: string;
  eventoId?: string;
  contextoEvento?: string;
  /** Callback opcional (ex.: fechar o diálogo que envolve o formulário). */
  aoRegistrar?: () => void;
  variante?: "cartao" | "embutido";
}) {
  const uid = useId();
  const idTexto = `${uid}-texto`;
  const idContador = `${uid}-contador`;
  const idErro = `${uid}-erro`;

  const [texto, setTexto] = useState("");
  const [voz, setVoz] = useState<VozNota>("equipe");
  const [tipo, setTipo] = useState<TipoNota>("observacao");
  const [origem, setOrigem] = useState<OrigemNota>("plataforma");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const textoValido = texto.trim().length > 0 && texto.length <= TEXTO_MAXIMO;

  function registrar() {
    if (!textoValido) return;
    setErro(null);
    startTransition(async () => {
      const res = await registrarNota({
        alunoId,
        voz,
        tipo,
        origem,
        texto,
        eventoId,
      });
      if (!res.ok) {
        // Erro de envio fica NA TELA, ao lado do campo, com `role="alert"`:
        // um toast some sozinho e, no diálogo da nota rápida, sumiria junto
        // com a única pista de por que a nota não foi gravada.
        setErro(res.erro);
        return;
      }
      toast.success("Nota registrada.");
      setTexto("");
      setErro(null);
      aoRegistrar?.();
    });
  }

  const contexto = contextoEvento ? (
    <p className="text-xs text-muted-foreground">
      Registrando observação sobre:{" "}
      <span className="font-medium text-foreground">{contextoEvento}</span>
    </p>
  ) : null;

  const campos = (
    <>
      <div className="grid gap-2">
        <Label htmlFor={idTexto}>Texto</Label>
        <Textarea
          id={idTexto}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="O que aconteceu, o que foi combinado ou o que ficou pendente."
          rows={4}
          maxLength={TEXTO_MAXIMO}
          aria-describedby={erro ? `${idErro} ${idContador}` : idContador}
          aria-invalid={erro ? true : undefined}
        />
        <div
          id={idContador}
          className="text-right text-xs text-muted-foreground"
        >
          {texto.length}/{TEXTO_MAXIMO}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor={`${uid}-voz`}>Voz</Label>
          <Select value={voz} onValueChange={(v) => setVoz(v as VozNota)}>
            <SelectTrigger id={`${uid}-voz`} className="w-full">
              <SelectValue>{(v: VozNota) => ROTULO_VOZ[v]}</SelectValue>
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
          <Label htmlFor={`${uid}-tipo`}>Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNota)}>
            <SelectTrigger id={`${uid}-tipo`} className="w-full">
              <SelectValue>{(t: TipoNota) => ROTULO_TIPO[t]}</SelectValue>
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
          <Label htmlFor={`${uid}-origem`}>Origem</Label>
          <Select
            value={origem}
            onValueChange={(v) => setOrigem(v as OrigemNota)}
          >
            <SelectTrigger id={`${uid}-origem`} className="w-full">
              <SelectValue>{(o: OrigemNota) => ROTULO_ORIGEM[o]}</SelectValue>
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

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Sempre montado, mesmo vazio: uma região viva que nasce junto com o
            texto (ou volta de `display:none`) não é anunciada por parte dos
            leitores de tela. `role="alert"` já implica `aria-live`. */}
        <p id={idErro} role="alert" className="mr-auto text-sm text-destructive">
          {erro}
        </p>
        <Button onClick={registrar} disabled={pending || !textoValido}>
          {pending ? "Registrando..." : "Registrar nota"}
        </Button>
      </div>
    </>
  );

  if (variante === "embutido") {
    return (
      <div className="grid gap-4">
        {contexto}
        {campos}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Registrar nota</CardTitle>
        {contexto}
      </CardHeader>
      <CardContent className="grid gap-4">{campos}</CardContent>
    </Card>
  );
}
