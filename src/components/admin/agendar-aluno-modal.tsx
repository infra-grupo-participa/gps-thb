"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Link2, Search, User, Loader2 } from "lucide-react";
import type { AlunoBusca } from "@/app/admin/actions";
import { agendarReuniao, buscarAlunosParaAgenda } from "@/app/reuniao/actions";
import { faixaHorario, rotuloDataLongo } from "@/lib/reuniao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Modal do admin para agendar/remarcar a reunião em nome de um aluno, direto na
 * tela de Reuniões. Busca o aluno (só quem está no GPS), link opcional (o aluno
 * cola depois). Sem exigir favorito.
 */
export function AgendarAlunoModal({
  open,
  onOpenChange,
  data,
  horario,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: string;
  horario: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AlunoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aluno, setAluno] = useState<AlunoBusca | null>(null);
  const [link, setLink] = useState("");

  // Limpa o estado a cada abertura para um slot.
  useEffect(() => {
    if (open) {
      setTermo("");
      setResultados([]);
      setAluno(null);
      setLink("");
    }
  }, [open, data, horario]);

  // Busca com debounce enquanto digita (a partir de 2 caracteres).
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (aluno) return; // já escolheu; não busca mais.
    const q = termo.trim();
    if (q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    debounce.current = setTimeout(async () => {
      const res = await buscarAlunosParaAgenda(q);
      setResultados(res);
      setBuscando(false);
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [termo, aluno]);

  function confirmar() {
    if (!aluno) {
      toast.error("Escolha o aluno.");
      return;
    }
    startTransition(async () => {
      const res = await agendarReuniao({
        alunoId: aluno.id,
        data,
        horario,
        linkLive: link.trim() || undefined,
      });
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success("Reunião agendada.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            Agendar aluno
          </DialogTitle>
          <DialogDescription className="capitalize">
            {rotuloDataLongo(data)} · {faixaHorario(horario)}
          </DialogDescription>
        </DialogHeader>

        {/* Passo 1: escolher o aluno */}
        {aluno ? (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <User className="size-3.5" /> Aluno
              </div>
              <div className="mt-0.5 truncate font-semibold">
                {aluno.nome ?? aluno.email ?? "—"}
              </div>
              {aluno.email ? (
                <div className="truncate text-sm text-muted-foreground">
                  {aluno.email}
                </div>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAluno(null)}
              disabled={pending}
            >
              Trocar
            </Button>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="busca-aluno" className="flex items-center gap-1.5">
              <Search className="size-3.5" /> Aluno
            </Label>
            <Input
              id="busca-aluno"
              autoFocus
              placeholder="Nome, e-mail ou CPF…"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border">
              {buscando ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Buscando…
                </div>
              ) : resultados.length ? (
                <ul className="divide-y">
                  {resultados.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => setAluno(a)}
                        className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="font-medium">
                          {a.nome ?? a.email ?? "—"}
                        </span>
                        {a.email ? (
                          <span className="text-xs text-muted-foreground">
                            {a.email}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : termo.trim().length >= 2 ? (
                <div className="p-3 text-sm text-muted-foreground">
                  Nenhum aluno do programa encontrado.
                </div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">
                  Digite ao menos 2 caracteres para buscar.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Passo 2: link opcional */}
        <div className="grid gap-1.5">
          <Label htmlFor="link-live-admin" className="flex items-center gap-1.5">
            <Link2 className="size-3.5" /> Link da reunião{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="link-live-admin"
            type="url"
            inputMode="url"
            placeholder="https://meet.google.com/… (o aluno pode colar depois)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pending || !aluno}>
            Confirmar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
