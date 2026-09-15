"use client";

/**
 * Biblioteca de tutoriais — painel do admin (`/admin/tutoriais`, 15/09/2026).
 * Molde: `admin/videos/index.tsx` (Table + Dialog + useTransition + toast +
 * `router.refresh()`).
 *
 * Coluna de reações mostra só o PLACAR agregado (👍/👎) — decisão de LGPD do
 * Marcio: o nome de quem votou nunca aparece, em lugar nenhum desta tela. A
 * fonte (`TutorialGps`) já reflete isso: não existe campo de pessoa. Copy
 * neutra ("reações dos parceiros"), sem ranking nem semáforo de "vídeo bom/
 * mau" — é contagem, não avaliação de desempenho.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { TutorialGps } from "@/lib/types";
import { SECOES_TUTORIAL, type SalvarTutorialInput } from "@/lib/tutoriais-tipos";
import {
  salvarTutorial,
  publicarTutorial,
  excluirTutorial,
} from "@/app/admin/tutoriais/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FormularioTutorial, type FormularioTutorialValores } from "./formulario";

type ModoDialog = "novo" | { editando: TutorialGps } | null;

export function TutoriaisAdmin({ tutoriais }: { tutoriais: TutorialGps[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tutorialEmAcao, setTutorialEmAcao] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoDialog>(null);
  const [excluindo, setExcluindo] = useState<TutorialGps | null>(null);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  // Agrupado por seção, na ordem de exibição — mesma regra da tela do aluno.
  const porSecao = useMemo(() => {
    const mapa = new Map<string, TutorialGps[]>();
    for (const t of tutoriais) {
      if (!mapa.has(t.secao)) mapa.set(t.secao, []);
      mapa.get(t.secao)!.push(t);
    }
    for (const itens of mapa.values()) itens.sort((a, b) => a.ordem - b.ordem);
    return SECOES_TUTORIAL.filter((s) => mapa.has(s.id)).map((s) => ({
      ...s,
      itens: mapa.get(s.id)!,
    }));
  }, [tutoriais]);

  function alternarPublicado(t: TutorialGps, proximoPublicado: boolean) {
    setTutorialEmAcao(t.id);
    startTransition(async () => {
      const res = await publicarTutorial(t.id, proximoPublicado);
      setTutorialEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(proximoPublicado ? "Tutorial publicado." : "Tutorial voltou a rascunho.");
      router.refresh();
    });
  }

  function salvar(form: FormularioTutorialValores) {
    const input: SalvarTutorialInput = {
      id: form.id,
      titulo: form.titulo,
      resumo: form.resumo,
      secao: form.secao,
      url: form.url,
      passos: form.passos,
      ordem: form.ordem,
    };
    startTransition(async () => {
      const res = await salvarTutorial(input);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(form.id ? "Tutorial atualizado." : "Tutorial cadastrado como rascunho.");
      router.refresh();
      setModo(null);
    });
  }

  function excluir(t: TutorialGps) {
    setErroExcluir(null);
    setTutorialEmAcao(t.id);
    startTransition(async () => {
      const res = await excluirTutorial(t.id);
      setTutorialEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        setErroExcluir(res.erro);
        return;
      }
      setExcluindo(null);
      toast.success("Tutorial excluído.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setModo("novo")} disabled={pending}>
          <PlusIcon className="size-4" /> Novo tutorial
        </Button>
      </div>

      {tutoriais.length === 0 ? (
        <EmptyState
          titulo="Nenhum tutorial cadastrado."
          descricao="Crie o primeiro tutorial — com vídeo, passo a passo, ou os dois. Ele nasce como rascunho até você publicar."
        />
      ) : (
        porSecao.map((grupo) => (
          <div key={grupo.id}>
            <h2 className="mb-2 text-sm font-semibold">{grupo.rotulo}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tutorial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reações dos parceiros</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupo.itens.map((t) => {
                  const emAcao = pending && tutorialEmAcao === t.id;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <span className="font-medium">{t.titulo}</span>
                      </TableCell>
                      <TableCell>
                        {t.publicado ? (
                          <Badge variant="success">Publicado</Badge>
                        ) : (
                          <Badge variant="neutral" icone={false}>
                            Rascunho — aluno não vê
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          👍 {t.uteis} · 👎 {t.naoUteis}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={emAcao}
                            onClick={() => setModo({ editando: t })}
                          >
                            <PencilIcon className="size-4" /> Editar
                          </Button>
                          {t.publicado ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={emAcao}
                              onClick={() => alternarPublicado(t, false)}
                            >
                              <EyeOffIcon className="size-4" /> Despublicar
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={emAcao}
                              onClick={() => alternarPublicado(t, true)}
                            >
                              <EyeIcon className="size-4" /> Publicar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={emAcao}
                            onClick={() => {
                              setErroExcluir(null);
                              setExcluindo(t);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon className="size-4" /> Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))
      )}

      <Dialog
        open={modo !== null}
        onOpenChange={(v) => {
          if (!v) setModo(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{modo === "novo" ? "Novo tutorial" : "Editar tutorial"}</DialogTitle>
            <DialogDescription>
              Vídeo do YouTube (opcional), resumo e passo a passo — pelo menos um dos dois.
            </DialogDescription>
          </DialogHeader>
          {modo !== null ? (
            <FormularioTutorial
              tutorial={typeof modo === "object" ? modo.editando : undefined}
              pending={pending}
              onCancelar={() => setModo(null)}
              onSalvar={salvar}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {excluindo ? (
        <DialogoConfirmacao
          aberto
          titulo="Excluir este tutorial?"
          descricao={excluindo.titulo}
          consequencia={
            <>
              O tutorial sai da lista <strong>de vez</strong> — não dá para
              desfazer. As reações registradas para ele também se perdem.
            </>
          }
          rotuloConfirmar="Excluir tutorial"
          rotuloConfirmando="Excluindo…"
          confirmando={pending && tutorialEmAcao === excluindo.id}
          erro={erroExcluir}
          onConfirmar={() => excluir(excluindo)}
          onCancelar={() => {
            if (pending) return;
            setExcluindo(null);
            setErroExcluir(null);
          }}
        />
      ) : null}
    </div>
  );
}
