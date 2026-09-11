"use client";

/**
 * "Adicionar" cliente — antes um clique que criava uma linha vazia e jogava a
 * pessoa na ficha. Agora pergunta as TRÊS coisas que o aluno já sabe no momento
 * em que cadastra:
 *
 *   · **Nome** — obrigatório. 🔴 MEDIDO EM 10/09/2026: existiam **21 fichas
 *     sem nome nenhum, em 18 ambientes**, a mais antiga de 15/07 — uma delas
 *     já marcada como "contratado". Nasciam assim porque o diálogo criava a
 *     linha no banco e SÓ ENTÃO levava para a ficha: quem fechava a aba nesse
 *     instante deixava um card fantasma na lista, que ainda por cima não
 *     conta para os 30 (ficha completa = nome + telefone). Pedir o nome aqui
 *     é o que impede a ficha de existir vazia.
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
import type { FaseCliente } from "@/lib/types";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  nome,
  fase,
  grau,
  pending,
  erro,
  onNome,
  onFase,
  onGrau,
  onCriar,
  onCancelar,
}: {
  nome: string;
  fase: FaseCliente;
  /** `""` = não informado. Mesmo contrato do campo da ficha. */
  grau: string;
  pending: boolean;
  erro: string | null;
  onNome: (v: string) => void;
  onFase: (v: FaseCliente) => void;
  onGrau: (v: string) => void;
  onCriar: () => void;
  onCancelar: () => void;
}) {
  const uid = useId();
  const idNome = `${uid}-nome`;
  const idFase = `${uid}-fase`;
  const idFaseAjuda = `${uid}-fase-ajuda`;
  const idGrau = `${uid}-grau`;
  const idGrauAjuda = `${uid}-grau-ajuda`;

  const nomeOk = nome.trim().length > 0;
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
            {/* Dizia "o telefone e o resto" — tratando como acessório o campo
                que decide se a ficha CONTA para os 30 (ficha completa = nome +
                telefone). 18 fichas em 9 ambientes ficaram sem telefone; duas
                pessoas estão a uma ficha de destravar a Etapa 01. */}
            Quem é o cliente e em que ponto ele está. Na ficha que abre em
            seguida, preencha o telefone — sem ele a ficha não conta para os
            30.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* 🔑 O NOME VEM PRIMEIRO e é obrigatório. Sem ele a ficha nasce
              fantasma (21 casos medidos em 10/09) e não conta para os 30. */}
          <div className="grid gap-2">
            <Label htmlFor={idNome}>Nome</Label>
            <Input
              id={idNome}
              value={nome}
              onChange={(e) => onNome(e.target.value)}
              placeholder="Como você chama esta pessoa"
              autoFocus
              // Enter cria, como em qualquer formulário de uma linha só.
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeOk && !pending) onCriar();
              }}
            />
          </div>

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
            Cancelar
          </Button>
          {/* Desabilitado sem nome: o botão não oferece o que o servidor vai
              recusar. A razão fica no texto abaixo do campo, não num toast
              que só aparece depois do clique. */}
          <Button
            onClick={onCriar}
            disabled={pending || !nomeOk}
            aria-busy={pending || undefined}
          >
            {pending ? "Criando…" : "Criar e abrir a ficha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
