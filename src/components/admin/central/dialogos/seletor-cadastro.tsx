"use client";

/**
 * Escolher um CADASTRO (`public.thb_alunos`) — o primeiro dos dois passos das
 * duas ações da Central que precisam de um alvo: "vincular esta pessoa a um
 * cadastro" e "mover este sócio para outro ambiente".
 *
 * 🔑 Escolher NÃO escreve. Este diálogo só devolve quem foi escolhido; a
 * confirmação nomeada (com a consequência escrita) acontece depois, no
 * `DialogoConfirmacao`. Duas etapas de propósito: a busca traz nomes parecidos
 * e o clique errado aqui não pode custar um vínculo trocado.
 *
 * A busca é a MESMA `buscarAlunos` do "Adicionar sócio" — nenhuma consulta
 * nova, nenhuma segunda regra de ranqueamento.
 */

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { buscarAlunos, type AlunoBusca } from "@/app/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SeletorCadastro({
  aberto,
  titulo,
  descricao,
  /** Quem NÃO serve como alvo e por quê (ex.: cadastro sem ambiente). */
  impedimento,
  onEscolher,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  impedimento?: (a: AlunoBusca) => string | null;
  onEscolher: (a: AlunoBusca) => void;
  onCancelar: () => void;
}) {
  const idBusca = useId();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AlunoBusca[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 2) return;
    setBuscando(true);
    setErro(null);
    try {
      setResultados(await buscarAlunos(termo));
      setBuscou(true);
    } catch {
      // A frase é nossa, nunca `error.message` — em produção ele pode carregar
      // detalhe interno. `logErro` é do servidor e `console.error` está fora do
      // repo por regra; a falha de rede aqui já vira erro anunciado na tela.
      setErro("A busca não respondeu agora. Tente de novo.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onCancelar();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>

        <form onSubmit={buscar} className="grid gap-2">
          <Label htmlFor={idBusca}>Nome, e-mail ou CPF/CNPJ</Label>
          <div className="flex gap-2">
            <Input
              id={idBusca}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Ao menos 2 caracteres"
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={buscando || termo.trim().length < 2}
            >
              <Search className="size-4" />
              {buscando ? "Buscando…" : "Buscar"}
            </Button>
          </div>
        </form>

        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {erro}
        </p>

        <div aria-live="polite" className="max-h-72 overflow-y-auto">
          {resultados.length === 0 ? (
            <p className="py-6 text-center corpo-sm text-muted-foreground">
              {buscou && !buscando
                ? "Nenhum cadastro encontrado com esse termo."
                : "Busque pelo nome, pelo e-mail ou pelo documento."}
            </p>
          ) : (
            <ul className="divide-y divide-borda-fina">
              {resultados.map((a) => {
                const bloqueio = impedimento?.(a) ?? null;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate corpo font-medium">
                        {a.nome ?? "Cadastro sem nome"}
                      </p>
                      <p className="truncate corpo-sm text-muted-foreground">
                        {a.email ?? "sem e-mail"}
                        {a.documento ? ` · ${a.documento}` : ""}
                      </p>
                      {bloqueio ? (
                        <p className="corpo-sm text-muted-foreground">
                          {bloqueio}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.jaNoGps ? (
                        <Badge variant="neutral" icone={false}>
                          já tem ambiente
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={bloqueio !== null}
                        onClick={() => onEscolher(a)}
                      >
                        Escolher
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
