"use client";

/**
 * "Adicionar" cliente — antes um clique que criava uma linha vazia e jogava a
 * pessoa na ficha. Agora pergunta as DUAS coisas que o aluno já sabe no momento
 * em que cadastra e que mudam onde o cliente aparece no portal:
 *
 *   · **Fase** — em que ponto do negócio ele está (`FASES_CLIENTE`). Quem chega
 *     ao programa com caso em andamento cadastrava tudo em Prospecção e depois
 *     arrastava um por um no quadro.
 *   · **Grau de relação** — o tipo de vínculo (`GRAUS_RELACAO_UI`). `null` é
 *     "Não informado" e **nunca** vira "Lead" (§B.6).
 *
 * O resto da ficha continua sendo preenchido na ficha: este diálogo não é um
 * segundo formulário do cliente, é a porta de entrada dele.
 *
 * 🔑 A ajuda de cada opção fica ABAIXO do campo e muda com a escolha — as duas
 * listas já carregam `ajuda` (é o mesmo texto do cabeçalho do quadro e do
 * `title` dos chips), e sem ela "Fechamento" e "Conhecido" são só palavras.
 */

import { useId } from "react";
import Link from "next/link";
import type { FaseCliente } from "@/lib/types";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DialogoNovoCliente({
  fase,
  grau,
  pending,
  erro,
  abrirFichaHref,
  onFase,
  onGrau,
  onCriar,
  onCancelar,
}: {
  fase: FaseCliente;
  /** `""` = não informado. Mesmo contrato do campo da ficha. */
  grau: string;
  pending: boolean;
  erro: string | null;
  /**
   * O cliente foi criado mas a fase/vínculo não gravaram: o diálogo para de
   * oferecer "Criar" (criaria um segundo cliente) e passa a oferecer a ficha,
   * que é onde o ajuste acontece. `null` = fluxo normal.
   */
  abrirFichaHref: string | null;
  onFase: (v: FaseCliente) => void;
  onGrau: (v: string) => void;
  onCriar: () => void;
  onCancelar: () => void;
}) {
  const uid = useId();
  const idFase = `${uid}-fase`;
  const idFaseAjuda = `${uid}-fase-ajuda`;
  const idGrau = `${uid}-grau`;
  const idGrauAjuda = `${uid}-grau-ajuda`;

  const faseAtual = FASES_CLIENTE.find((f) => f.id === fase);
  const grauAtual = GRAUS_RELACAO_UI.find((g) => g.id === grau);

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !pending) onCancelar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>
            Em que ponto este cliente está e como você o conhece. O nome, o
            telefone e o resto você preenche na ficha, que abre em seguida.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={idFase}>Fase</Label>
            <Select
              value={fase}
              onValueChange={(v) => onFase((v as FaseCliente) || "prospeccao")}
            >
              {/* Função de render obrigatória: sem ela o Base UI imprime o
                  VALOR do banco (`prospeccao`), minúsculo e sem acento. */}
              <SelectTrigger id={idFase} aria-describedby={idFaseAjuda}>
                <SelectValue>
                  {(v: FaseCliente) =>
                    FASES_CLIENTE.find((f) => f.id === v)?.rotulo ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FASES_CLIENTE.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              id={idFaseAjuda}
              className="text-xs leading-snug text-muted-foreground"
            >
              {faseAtual?.ajuda}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={idGrau}>Grau de relação</Label>
            <Select value={grau} onValueChange={(v) => onGrau(v ?? "")}>
              <SelectTrigger id={idGrau} aria-describedby={idGrauAjuda}>
                {/* `""` mostra o placeholder, que diz "Não informado" — NUNCA
                    "Lead": a ausência de resposta sobre um terceiro não vira
                    palpite sobre a vida dele. */}
                <SelectValue placeholder="Não informado">
                  {(v: string) =>
                    GRAUS_RELACAO_UI.find((g) => g.id === v)?.rotulo ??
                    "Não informado"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GRAUS_RELACAO_UI.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              id={idGrauAjuda}
              className="text-xs leading-snug text-muted-foreground"
            >
              {grauAtual?.ajuda ??
                "Como você conhece esta pessoa. Fica “Não informado” enquanto você não escolher — dá para preencher depois, na ficha."}
            </p>
          </div>
        </div>

        {/* Sempre montado: região viva que nasce junto com o texto não é
            anunciada por parte dos leitores de tela. */}
        <p
          aria-live="assertive"
          className="text-xs text-destructive empty:hidden"
        >
          {erro}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={pending}>
            {abrirFichaHref ? "Fechar" : "Cancelar"}
          </Button>
          {abrirFichaHref ? (
            <Link
              href={abrirFichaHref}
              className={buttonVariants({ variant: "default" })}
            >
              Abrir ficha
            </Link>
          ) : (
            <Button
              onClick={onCriar}
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {pending ? "Criando…" : "Criar e abrir a ficha"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
