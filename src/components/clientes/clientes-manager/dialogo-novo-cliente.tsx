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
 *
 * 🔴 "SALVAR E ADICIONAR OUTRO" (Onda 1.2, 02/10/2026). Reclamação literal do
 * Digisac: *"só consegui cadastrar um"*. O único botão criava e levava para a
 * ficha; para o segundo cliente era voltar, achar "Adicionar" e recomeçar. O
 * botão novo grava, limpa nome e telefone, devolve o foco ao nome e diz em
 * texto quem foi salvo e quantos já existem. "Criar e abrir a ficha" continua
 * fazendo o que sempre fez (e o Enter continua sendo ele).
 *
 * Por isso o TELEFONE entrou aqui (opcional): na sequência "adicionar outro" a
 * pessoa não passa pela ficha, e sem telefone a ficha não conta para os 30 —
 * cadastrar 10 sem telefone seria trabalho que não aparece no progresso. Fase
 * e grau NÃO são limpos entre um e outro: quem cadastra a família inteira
 * repete o mesmo grau.
 */

import { useEffect, useId, useRef } from "react";
import { CircleCheck } from "lucide-react";
import { mascaraTelefone } from "@/lib/masks";
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
  telefone,
  fase,
  grau,
  pending,
  erro,
  confirmacao,
  salvosNaSequencia,
  emCurso,
  onNome,
  onTelefone,
  onFase,
  onGrau,
  onCriar,
  onSalvarEOutro,
  onCancelar,
}: {
  nome: string;
  /** Mascarado, como na ficha. `""` = não informado. */
  telefone: string;
  fase: FaseCliente;
  /** `""` = não informado. Mesmo contrato do campo da ficha. */
  grau: string;
  pending: boolean;
  erro: string | null;
  /**
   * "✓ Fulano salvo — N cadastrados…", montado por quem conhece a lista.
   * `null` antes do primeiro "Salvar e adicionar outro".
   */
  confirmacao: string | null;
  /**
   * Quantos o "Salvar e adicionar outro" já gravou nesta abertura. Cada
   * incremento devolve o foco ao nome — é o sinal de "pode digitar o próximo".
   */
  salvosNaSequencia: number;
  /** Qual dos dois botões disparou a gravação — só ele diz "Salvando…". */
  emCurso: "ficha" | "outro" | null;
  onNome: (v: string) => void;
  onTelefone: (v: string) => void;
  onFase: (v: FaseCliente) => void;
  onGrau: (v: string) => void;
  onCriar: () => void;
  onSalvarEOutro: () => void;
  onCancelar: () => void;
}) {
  const uid = useId();
  const idNome = `${uid}-nome`;
  const idTelefone = `${uid}-telefone`;
  const idTelefoneAjuda = `${uid}-telefone-ajuda`;
  const refNome = useRef<HTMLInputElement>(null);

  // Salvou e limpou: o cursor volta ao nome. Só DOM, nenhum estado — o
  // contador vem de cima e é a única coisa que dispara isto.
  useEffect(() => {
    if (salvosNaSequencia > 0) refNome.current?.focus();
  }, [salvosNaSequencia]);
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
            Nome e telefone fazem a ficha contar para os 30. O resto
            você preenche depois.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* 🔑 O NOME VEM PRIMEIRO e é obrigatório. Sem ele a ficha nasce
              fantasma (21 casos medidos em 10/09) e não conta para os 30. */}
          <div className="grid gap-2">
            <Label htmlFor={idNome}>Nome</Label>
            <Input
              id={idNome}
              ref={refNome}
              value={nome}
              onChange={(e) => onNome(e.target.value)}
              placeholder="Como você chama esta pessoa"
              className="h-11 md:text-base"
              autoFocus
              // Enter cria, como em qualquer formulário de uma linha só.
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeOk && !pending)
                  // Em sequência ("adicionar outro"), Enter continua a sequência.
                  (salvosNaSequencia > 0 ? onSalvarEOutro : onCriar)();
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={idTelefone}>Telefone (com DDD)</Label>
            <Input
              id={idTelefone}
              value={telefone}
              onChange={(e) => onTelefone(mascaraTelefone(e.target.value))}
              inputMode="tel"
              autoComplete="off"
              placeholder="(11) 98888-7777"
              className="h-11 md:text-base"
              aria-describedby={idTelefoneAjuda}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nomeOk && !pending)
                  // Em sequência ("adicionar outro"), Enter continua a sequência.
                  (salvosNaSequencia > 0 ? onSalvarEOutro : onCriar)();
              }}
            />
            <p
              id={idTelefoneAjuda}
              className="corpo text-muted-foreground"
            >
              Pode ficar em branco. Sem telefone, a ficha não conta para os 30.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={idFase}>Fase</Label>
            <Select
              value={fase}
              onValueChange={(v) => onFase((v as FaseCliente) || "prospeccao")}
            >
              {/* Função de render obrigatória: sem ela o Base UI imprime o
                  VALOR do banco (`prospeccao`), minúsculo e sem acento. */}
              <SelectTrigger
                id={idFase}
                aria-describedby={idFaseAjuda}
                className="h-11 w-full text-base"
              >
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
              className="corpo text-muted-foreground"
            >
              {faseAtual?.ajuda}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={idGrau}>Grau de relação</Label>
            <Select value={grau} onValueChange={(v) => onGrau(v ?? "")}>
              <SelectTrigger
                id={idGrau}
                aria-describedby={idGrauAjuda}
                className="h-11 w-full text-base"
              >
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
              className="corpo text-muted-foreground"
            >
              {grauAtual?.ajuda ??
                "Como você conhece esta pessoa. Pode escolher depois, na ficha."}
            </p>
          </div>
        </div>

        {/* Sempre montado: região viva que nasce junto com o texto não é
            anunciada por parte dos leitores de tela. */}
        <p
          aria-live="assertive"
          className="corpo text-destructive empty:hidden"
        >
          {erro}
        </p>
        {/* A confirmação do "adicionar outro". `polite`: não interrompe quem já
            está digitando o próximo nome. Some quando há erro, para as duas
            frases não se contradizerem. */}
        {/* Ícone + texto + o próximo passo: depois de salvar, a pessoa
            precisa saber que deu certo E o que fazer agora. */}
        <div role="status" aria-live="polite" className="empty:hidden">
          {!erro && confirmacao ? (
            <div className="flex gap-2 rounded-md bg-sucesso px-3 py-2 corpo text-sucesso-foreground">
              <CircleCheck aria-hidden className="mt-1 size-4 shrink-0" />
              <p>
                <span className="font-medium">{confirmacao}</span> Digite o
                próximo nome ou toque em Fechar.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            onClick={onCancelar}
            disabled={pending}
          >
            {salvosNaSequencia > 0 ? "Fechar" : "Cancelar"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11"
            onClick={onSalvarEOutro}
            disabled={pending || !nomeOk}
            aria-busy={(pending && emCurso === "outro") || undefined}
          >
            {pending && emCurso === "outro"
              ? "Salvando…"
              : "Salvar e adicionar outro"}
          </Button>
          {/* Desabilitado sem nome: o botão não oferece o que o servidor vai
              recusar. A razão fica no texto abaixo do campo, não num toast
              que só aparece depois do clique. */}
          <Button
            size="lg"
            className="h-11"
            onClick={onCriar}
            disabled={pending || !nomeOk}
            aria-busy={(pending && emCurso === "ficha") || undefined}
          >
            {pending && emCurso === "ficha" ? "Criando…" : "Criar e abrir a ficha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
