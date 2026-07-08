"use client";

import { useState } from "react";
import type { ClienteEtapa1 } from "@/lib/types";
import {
  PROBLEMAS_7,
  NIVEIS_RELACIONAMENTO,
  STATUS_CLIENTE,
  PERFIS_DISC,
} from "@/lib/etapa1";
import type { PatchCliente } from "@/app/etapa-1/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ClienteDialog({
  cliente,
  open,
  onOpenChange,
  onSalvar,
  salvando,
}: {
  cliente: ClienteEtapa1;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvar: (patch: PatchCliente) => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(cliente.telefone ?? "");
  const [nivel, setNivel] = useState(cliente.nivel_relacionamento ?? "");
  const [problemas, setProblemas] = useState<string[]>(cliente.problemas ?? []);
  const [perda, setPerda] = useState(
    cliente.perda_inercia != null ? String(cliente.perda_inercia) : "",
  );
  const [registro, setRegistro] = useState(cliente.registro_contato ?? "");
  const [status, setStatus] = useState(cliente.status ?? "pendente");
  const [dataReuniao, setDataReuniao] = useState(
    cliente.data_reuniao_preliminar ?? "",
  );
  const [aderiu, setAderiu] = useState(cliente.aderiu_reuniao);
  const [disc, setDisc] = useState(cliente.perfil_disc ?? "");

  function toggleProblema(id: string) {
    setProblemas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function salvar() {
    onSalvar({
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      nivel_relacionamento:
        (nivel as ClienteEtapa1["nivel_relacionamento"]) || null,
      problemas,
      perda_inercia: perda ? Number(perda.replace(",", ".")) : null,
      registro_contato: registro.trim() || null,
      status: status as ClienteEtapa1["status"],
      data_reuniao_preliminar: dataReuniao || null,
      aderiu_reuniao: aderiu,
      perfil_disc: (disc as ClienteEtapa1["perfil_disc"]) || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cliente potencial</DialogTitle>
          <DialogDescription>
            Preencha os dados do contato e o andamento da abordagem.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="c-nome">Nome</Label>
            <Input
              id="c-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="c-tel">Telefone</Label>
              <Input
                id="c-tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="grid gap-2">
              <Label>Nível de relacionamento</Label>
              <Select value={nivel} onValueChange={(v) => setNivel(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {NIVEIS_RELACIONAMENTO.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Problemas (marque ao menos um)</Label>
            <div className="grid gap-2 rounded-md border p-3">
              {PROBLEMAS_7.map((p) => (
                <label
                  key={p.id}
                  className="flex items-start gap-2 text-sm leading-tight"
                >
                  <Checkbox
                    checked={problemas.includes(p.id)}
                    onCheckedChange={() => toggleProblema(p.id)}
                    className="mt-0.5"
                  />
                  <span>{p.rotulo}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="c-perda">Perda pela inércia (R$)</Label>
              <Input
                id="c-perda"
                inputMode="decimal"
                value={perda}
                onChange={(e) => setPerda(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v ?? "pendente")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_CLIENTE.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="c-data">Data da reunião preliminar</Label>
              <Input
                id="c-data"
                type="date"
                value={dataReuniao}
                onChange={(e) => setDataReuniao(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Perfil DISC</Label>
              <Select value={disc} onValueChange={(v) => setDisc(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {PERFIS_DISC.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={aderiu}
              onCheckedChange={(v) => setAderiu(Boolean(v))}
            />
            Aderiu à reunião (entra no grupo de WhatsApp)
          </label>

          <div className="grid gap-2">
            <Label htmlFor="c-reg">Registro do contato</Label>
            <Textarea
              id="c-reg"
              value={registro}
              onChange={(e) => setRegistro(e.target.value)}
              placeholder="Anotações sobre as conversas, ligações e combinados."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
