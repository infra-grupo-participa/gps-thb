"use client";

import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AtSign } from "lucide-react";
import { registrarNota } from "@/app/admin/diario-actions";
import { VOZES_NOTA, TIPOS_NOTA, ORIGENS_NOTA } from "@/lib/types";
import type { VozNota, TipoNota, OrigemNota } from "@/lib/types";
import {
  ROTULO_VOZ,
  ROTULO_TIPO,
  ROTULO_ORIGEM,
} from "@/components/admin/diario-labels";
import {
  ChipsMencionados,
  ListaMencionaveis,
  useMencoes,
} from "@/components/admin/diario-mencoes";
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
  const idAjudaMencao = `${uid}-ajuda-mencao`;

  const [texto, setTexto] = useState("");
  const [voz, setVoz] = useState<VozNota>("equipe");
  const [tipo, setTipo] = useState<TipoNota>("observacao");
  const [origem, setOrigem] = useState<OrigemNota>("plataforma");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * @menção. O hook é dono do token sob o cursor, da lista e dos chips; o
   * texto continua sendo estado DESTE componente — quem escreve a nota é a
   * equipe, não o autocompletar.
   */
  const refTexto = useRef<HTMLTextAreaElement | null>(null);
  const mencoes = useMencoes(texto, setTexto, uid, refTexto);

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
        // Ids de `public.perfis`. O servidor revalida cada um contra ativo +
        // cargo dev/admin e descarta o que não passar (§B.7).
        mencoes: mencoes.ids,
      });
      if (!res.ok) {
        // Erro de envio fica NA TELA, ao lado do campo, com `role="alert"`:
        // um toast some sozinho e, no diálogo da nota rápida, sumiria junto
        // com a única pista de por que a nota não foi gravada.
        setErro(res.erro);
        return;
      }
      // 🔑 A action devolve `ok` mesmo com o Slack fora do ar — a nota está
      // gravada e o aviso é subproduto. Por isso a frase fala de MENÇÃO
      // REGISTRADA, nunca de aviso entregue: prometer entrega aqui seria
      // prometer o que nem o servidor confirma.
      const quantos = mencoes.ids.length;
      toast.success(
        quantos > 0
          ? `Nota registrada com ${quantos} ${quantos === 1 ? "menção" : "menções"}.`
          : "Nota registrada.",
      );
      setTexto("");
      mencoes.limpar();
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
          ref={refTexto}
          value={texto}
          onChange={(e) => mencoes.aoMudarTexto(e.target.value)}
          // Mover o cursor com o teclado ou o mouse pode tirá-lo de cima do
          // `@` — sem isto a lista ficaria aberta apontando para um token que
          // não está mais sob o cursor.
          onKeyDown={mencoes.aoTeclar}
          onBlur={mencoes.fechar}
          onClick={() => mencoes.fechar()}
          placeholder="O que aconteceu, o que foi combinado ou o que ficou pendente. Digite @ para avisar alguém da equipe."
          rows={4}
          maxLength={TEXTO_MAXIMO}
          aria-describedby={
            erro
              ? `${idErro} ${idContador} ${idAjudaMencao}`
              : `${idContador} ${idAjudaMencao}`
          }
          aria-invalid={erro ? true : undefined}
          aria-controls={mencoes.aberto ? mencoes.idLista : undefined}
          aria-activedescendant={mencoes.idAtivo}
        />
        <ListaMencionaveis ctrl={mencoes} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id={idAjudaMencao} className="text-xs text-muted-foreground">
            <AtSign aria-hidden className="mr-1 inline size-3 align-[-1px]" />
            Digite <span className="font-medium">@</span> para avisar alguém da
            equipe. Só quem já pode ler este diário aparece na lista.
            {mencoes.carregando ? " Carregando a equipe…" : null}
          </p>
          <div
            id={idContador}
            className="text-right text-xs text-muted-foreground"
          >
            {texto.length}/{TEXTO_MAXIMO}
          </div>
        </div>
        <ChipsMencionados ctrl={mencoes} />
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
