"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type {
  Etapa3Agendamento,
  Etapa3Revisao,
  ProgressoTarefa,
} from "@/lib/types";
import type { TarefaDef } from "@/lib/etapa1";
import {
  addAgendamentoEtapa3,
  atualizarAgendamentoEtapa3,
  definirEquipeParticipa,
  removerAgendamentoEtapa3,
  salvarRevisaoEtapa3,
} from "@/app/etapa/actions";
import { EtapaGuide } from "@/components/etapa/etapa-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function Etapa3Guide({
  alunoId,
  tarefas,
  progressoInicial,
  agendamentosIniciais,
  revisaoInicial,
  isAdmin,
}: {
  alunoId: string;
  tarefas: TarefaDef[];
  progressoInicial: ProgressoTarefa[];
  agendamentosIniciais: Etapa3Agendamento[];
  revisaoInicial: Etapa3Revisao | null;
  isAdmin: boolean;
}) {
  return (
    <div className="grid gap-6">
      <EtapaGuide
        alunoId={alunoId}
        etapa={3}
        tarefas={tarefas}
        progressoInicial={progressoInicial}
      />
      <AgendamentosCard alunoId={alunoId} inicial={agendamentosIniciais} />
      <RevisaoCard
        alunoId={alunoId}
        inicial={revisaoInicial}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function AgendamentosCard({
  alunoId,
  inicial,
}: {
  alunoId: string;
  inicial: Etapa3Agendamento[];
}) {
  const [ags, setAgs] = useState<Etapa3Agendamento[]>(inicial);
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const res = await addAgendamentoEtapa3(alunoId);
      if (res.erro || !res.agendamento) {
        toast.error("Erro ao adicionar agendamento.");
        return;
      }
      setAgs((prev) => [...prev, res.agendamento as Etapa3Agendamento]);
    });
  }

  function patch(
    id: string,
    campo: "descricao" | "data" | "horario",
    valor: string,
  ) {
    setAgs((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [campo]: valor } : a)),
    );
  }

  function salvarCampo(id: string, campo: "descricao" | "data" | "horario") {
    const ag = ags.find((a) => a.id === id);
    if (!ag) return;
    startTransition(async () => {
      await atualizarAgendamentoEtapa3(id, alunoId, {
        [campo]: (ag[campo] as string) || null,
      });
    });
  }

  function marcarEquipe(id: string) {
    setAgs((prev) =>
      prev.map((a) => ({ ...a, equipe_participa: a.id === id })),
    );
    startTransition(async () => {
      const res = await definirEquipeParticipa(id, alunoId);
      if (res.erro) toast.error("Erro ao marcar o evento da equipe.");
    });
  }

  function remover(id: string) {
    startTransition(async () => {
      const res = await removerAgendamentoEtapa3(id, alunoId);
      if (res.erro) {
        toast.error("Erro ao remover.");
        return;
      }
      setAgs((prev) => prev.filter((a) => a.id !== id));
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            Agendamentos da Apresentação do Croqui
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Liste as datas. A equipe acompanha{" "}
            <span className="font-medium">apenas um evento</span> — marque qual.
          </p>
        </div>
        <Button onClick={add} disabled={pending}>
          Adicionar data
        </Button>
      </CardHeader>
      <CardContent>
        {ags.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum agendamento ainda.
          </div>
        ) : (
          <ul className="grid gap-3">
            {ags.map((a) => (
              <li
                key={a.id}
                className={
                  "rounded-md border p-3 " +
                  (a.equipe_participa ? "border-primary bg-primary/5" : "")
                }
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Cliente / descrição</Label>
                    <Input
                      value={a.descricao ?? ""}
                      onChange={(e) => patch(a.id, "descricao", e.target.value)}
                      onBlur={() => salvarCampo(a.id, "descricao")}
                      placeholder="Ex.: Cliente João"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Data</Label>
                    <Input
                      type="date"
                      value={a.data ?? ""}
                      onChange={(e) => patch(a.id, "data", e.target.value)}
                      onBlur={() => salvarCampo(a.id, "data")}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Horário</Label>
                    <Input
                      type="time"
                      value={a.horario ?? ""}
                      onChange={(e) => patch(a.id, "horario", e.target.value)}
                      onBlur={() => salvarCampo(a.id, "horario")}
                      className="w-28"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => remover(a.id)}
                    disabled={pending}
                  >
                    Excluir
                  </Button>
                </div>
                <div className="mt-3">
                  {a.equipe_participa ? (
                    <Badge>Equipe participa deste</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => marcarEquipe(a.id)}
                      disabled={pending}
                    >
                      A equipe participa deste
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RevisaoCard({
  alunoId,
  inicial,
  isAdmin,
}: {
  alunoId: string;
  inicial: Etapa3Revisao | null;
  isAdmin: boolean;
}) {
  const [duvidas, setDuvidas] = useState(inicial?.duvidas ?? "");
  const [correcoes, setCorrecoes] = useState(inicial?.correcoes ?? "");
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      const res = await salvarRevisaoEtapa3(alunoId, {
        duvidas: duvidas.trim() || null,
        correcoes: correcoes.trim() || null,
      });
      if (res.erro) toast.error("Erro ao salvar.");
      else toast.success("Revisão salva.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revisão do Croqui</CardTitle>
        <p className="text-sm text-muted-foreground">
          O parceiro registra as dúvidas; a equipe aponta as correções.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="duvidas">Dúvidas do parceiro</Label>
          <Textarea
            id="duvidas"
            value={duvidas}
            onChange={(e) => setDuvidas(e.target.value)}
            readOnly={isAdmin}
            rows={4}
            placeholder="Descreva suas dúvidas sobre o croqui."
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="correcoes">Correções da equipe</Label>
          <Textarea
            id="correcoes"
            value={correcoes}
            onChange={(e) => setCorrecoes(e.target.value)}
            readOnly={!isAdmin}
            rows={4}
            placeholder={
              isAdmin
                ? "Aponte as correções necessárias."
                : "As correções da equipe aparecerão aqui."
            }
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando..." : "Salvar revisão"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
