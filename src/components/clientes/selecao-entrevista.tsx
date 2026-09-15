"use client";

/**
 * O seletor dos 5 clientes da entrevista prévia (migração 20260915000261,
 * decisão do Marcio 14/09/2026).
 *
 * 🔴 CONJUNTO INTEIRO, NÃO TOGGLE. `selecionarParaEntrevista` recebe o array
 * completo de ids de uma vez — a RPC `gps.selecao_entrevista_definir` é
 * atômica de propósito (teto 5 contado sobre o array inteiro, não um a um).
 * Por isso este componente mantém a seleção em ESTADO LOCAL enquanto o
 * diálogo está aberto e só chama a action no "Salvar seleção". Chamar a cada
 * clique reabriria a corrida que a RPC atômica existe para fechar.
 *
 * Mora fora de `clientes-manager/` pelo mesmo motivo de
 * `dialogo-escolher-favorito.tsx`: é conceito de cliente, não peça interna do
 * gerenciador, e este diálogo é aberto por um botão no cabeçalho do
 * `ClientesManager` — não um "modo de seleção" dentro da lista/quadro.
 *
 * Por que diálogo dedicado, e não um modo de seleção na tabela/quadro:
 * escolher os 5 é uma decisão pontual e atômica; a lista/quadro já mistura
 * fase, estrela e exclusão, e o quadro tem arrastar-e-soltar. Um espaço
 * próprio, com busca dedicada, evita que esses dois modelos de interação
 * coexistam na mesma superfície.
 */

import { useId, useMemo, useState, useTransition } from "react";
import type { ClienteEtapa1 } from "@/lib/types";
import { selecionarParaEntrevista } from "@/app/clientes/actions";
import { casaTodosOsTermos } from "@/lib/texto";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Star, Users } from "lucide-react";

const TETO = 5;

function ContadorSelecao({ total }: { total: number }) {
  return (
    <p aria-live="polite" className="corpo-sm text-muted-foreground">
      <strong className="text-foreground">
        {total} de {TETO}
      </strong>{" "}
      escolhidos
      {total >= TETO ? " — desmarque um para trocar" : ""}
    </p>
  );
}

function LinhaCliente({
  cliente,
  marcado,
  travado,
  cheio,
  motivoTravado,
  onToggle,
}: {
  cliente: ClienteEtapa1;
  marcado: boolean;
  /** `true` quando marcar/desmarcar este cliente falharia — a caixa não aparece. */
  travado: boolean;
  /** Teto de 5 atingido e este cliente NÃO está marcado — caixa desabilitada, com motivo visível. */
  cheio: boolean;
  motivoTravado: string | null;
  onToggle: () => void;
}) {
  const id = useId();
  const idAjuda = `${id}-cheio`;
  const favorito = cliente.acompanhado_equipe;
  const rotulo = cliente.nome || "Cliente sem nome";
  const rotuloCheio = "5 de 5 escolhidos — desmarque um para trocar";

  return (
    <li className="flex items-center gap-3 border-b border-borda-fina px-1 py-2 last:border-b-0">
      {travado ? (
        // 🔴 O favorito não pode sair dos 5 selecionados (CHECK do banco) —
        // a tela NÃO oferece a caixa desmarcável: padrão da casa é não
        // oferecer o botão que falharia, e não desabilitar em silêncio.
        <span
          title={motivoTravado ?? undefined}
          className="flex size-4 shrink-0 items-center justify-center"
        >
          <Star className="size-4 fill-accent-foreground text-accent-foreground" aria-hidden />
          <span className="sr-only">{motivoTravado}</span>
        </span>
      ) : (
        <Checkbox
          id={id}
          checked={marcado}
          disabled={cheio}
          onCheckedChange={onToggle}
          aria-describedby={cheio ? idAjuda : undefined}
          aria-label={
            marcado
              ? `Remover ${rotulo} da seleção da entrevista`
              : cheio
                ? `Selecionar ${rotulo} para a entrevista — ${rotuloCheio}`
                : `Selecionar ${rotulo} para a entrevista`
          }
        />
      )}
      <label
        htmlFor={travado ? undefined : id}
        className={
          "flex min-w-0 flex-1 items-center gap-2 corpo-sm " +
          (travado || cheio ? "" : "cursor-pointer") +
          (cheio ? " text-muted-foreground" : "")
        }
      >
        <span className="min-w-0 truncate">{rotulo}</span>
        {favorito ? (
          <span className="shrink-0 rounded-full bg-superficie-afundada px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
            Favorito da equipe
          </span>
        ) : null}
        {cheio ? (
          <span id={idAjuda} className="sr-only">
            {rotuloCheio}
          </span>
        ) : null}
      </label>
    </li>
  );
}

export function DialogoSelecaoEntrevista({
  aberto,
  clientes,
  alunoId,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  clientes: ClienteEtapa1[];
  alunoId: string;
  onFechar: () => void;
  /** Chamado com o novo conjunto de ids depois de salvar com sucesso. */
  onSalvo: (idsSelecionados: string[]) => void;
}) {
  // Estado local, inicializado do banco a cada abertura — nunca chama a
  // action por clique (ver o comentário do arquivo).
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(clientes.filter((c) => c.selecionado_entrevista).map((c) => c.id)),
  );
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, executar] = useTransition();

  const favorito = clientes.find((c) => c.acompanhado_equipe) ?? null;

  function reabrirCom(lista: ClienteEtapa1[]) {
    setSelecionados(
      new Set(lista.filter((c) => c.selecionado_entrevista).map((c) => c.id)),
    );
    setBusca("");
    setErro(null);
  }

  function fechar() {
    if (pendente) return;
    onFechar();
  }

  function toggle(cliente: ClienteEtapa1) {
    setErro(null);
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(cliente.id)) {
        novo.delete(cliente.id);
      } else {
        if (novo.size >= TETO) return prev;
        novo.add(cliente.id);
      }
      return novo;
    });
  }

  function salvar() {
    setErro(null);
    const ids = Array.from(selecionados);
    executar(async () => {
      const res = await selecionarParaEntrevista(alunoId, ids);
      if (res.erro) {
        setErro(res.erro);
        return;
      }
      onSalvo(ids);
    });
  }

  const filtrados = useMemo(
    () => clientes.filter((c) => casaTodosOsTermos(c.nome || "", busca)),
    [clientes, busca],
  );

  // Favorito sempre no topo — é o único que a tela impede de desmarcar, e
  // ver antes explica a caixa ausente antes de rolar a lista inteira.
  const ordenados = useMemo(() => {
    if (!favorito) return filtrados;
    const resto = filtrados.filter((c) => c.id !== favorito.id);
    const temFavorito = filtrados.some((c) => c.id === favorito.id);
    return temFavorito ? [favorito, ...resto] : resto;
  }, [filtrados, favorito]);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) fechar();
        else reabrirCom(clientes);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Escolher os 5 da entrevista</DialogTitle>
          <DialogDescription>
            A equipe faz uma entrevista prévia por telefone com até 5
            clientes. O favorito da equipe (com a estrela) entra
            automaticamente e não pode ser removido daqui — para trocá-lo,
            abra um chamado no Suporte.
          </DialogDescription>
        </DialogHeader>

        <ContadorSelecao total={selecionados.size} />

        {clientes.length > 8 ? (
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome..."
            aria-label="Buscar cliente"
          />
        ) : null}

        {ordenados.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhum cliente encontrado com essa busca.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto rounded-lg border border-borda-fina">
            {ordenados.map((c) => {
              const ehFavorito = favorito !== null && c.id === favorito.id;
              const marcado = selecionados.has(c.id);
              const cheio = selecionados.size >= TETO && !marcado;
              return (
                <LinhaCliente
                  key={c.id}
                  cliente={c}
                  marcado={marcado || ehFavorito}
                  travado={ehFavorito}
                  cheio={cheio}
                  motivoTravado={
                    ehFavorito
                      ? "O cliente favorito da equipe precisa continuar entre os 5 selecionados. Para trocar o favorito, abra um chamado no Suporte."
                      : null
                  }
                  onToggle={() => {
                    if (cheio) return;
                    toggle(c);
                  }}
                />
              );
            })}
          </ul>
        )}

        {selecionados.size >= TETO ? (
          <p className="corpo-sm text-atencao-foreground">
            5 de 5 escolhidos — desmarque um para trocar.
          </p>
        ) : null}

        <p aria-live="assertive" className="corpo-sm text-destructive empty:hidden">
          {erro}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={fechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pendente} aria-busy={pendente || undefined}>
            <Users aria-hidden />
            {pendente ? "Salvando…" : "Salvar seleção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
