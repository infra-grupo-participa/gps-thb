"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ClienteEtapa1, Documento } from "@/lib/types";
import {
  PROBLEMAS_7,
  NIVEIS_RELACIONAMENTO,
  STATUS_CLIENTE,
  PERFIS_DISC,
} from "@/lib/etapa1";
import {
  mascaraMoeda,
  mascaraTelefone,
  moedaParaNumero,
  numeroParaMoeda,
} from "@/lib/masks";
import { MessageCircle, Star } from "lucide-react";
import { atualizarCliente, definirClienteEquipe } from "@/app/etapa-1/actions";
import { linkWhatsapp } from "@/lib/whatsapp";
import { DocumentosSection } from "./documentos-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function ClienteFicha({
  cliente,
  alunoId,
  documentosIniciais,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
  documentosIniciais: Documento[];
}) {
  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(
    cliente.telefone ? mascaraTelefone(cliente.telefone) : "",
  );
  const [nivel, setNivel] = useState(cliente.nivel_relacionamento ?? "");
  const [problemas, setProblemas] = useState<string[]>(cliente.problemas ?? []);
  const [perda, setPerda] = useState(numeroParaMoeda(cliente.perda_inercia));
  const [status, setStatus] = useState(cliente.status ?? "pendente");
  const [dataReuniao, setDataReuniao] = useState(
    cliente.data_reuniao_preliminar ?? "",
  );
  const [disc, setDisc] = useState(cliente.perfil_disc ?? "");
  const [aderiu, setAderiu] = useState(cliente.aderiu_reuniao);
  const [msgPadrao, setMsgPadrao] = useState(cliente.mensagem_padrao_enviada);
  const [estudoCaso, setEstudoCaso] = useState(cliente.estudo_caso_enviado);
  const [ligacao, setLigacao] = useState(cliente.ligacao_realizada);
  const [registro, setRegistro] = useState(cliente.registro_contato ?? "");
  const [acompanhado, setAcompanhado] = useState(cliente.acompanhado_equipe);
  const [pending, startTransition] = useTransition();

  const wpp = linkWhatsapp(telefone);

  function toggleEquipe() {
    const ativar = !acompanhado;
    setAcompanhado(ativar);
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) {
        setAcompanhado(!ativar);
        toast.error("Erro ao marcar o cliente da equipe.");
      }
    });
  }

  function toggleProblema(id: string) {
    setProblemas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function salvar() {
    startTransition(async () => {
      const res = await atualizarCliente(cliente.id, alunoId, {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        nivel_relacionamento:
          (nivel as ClienteEtapa1["nivel_relacionamento"]) || null,
        problemas,
        perda_inercia: moedaParaNumero(perda),
        status: status as ClienteEtapa1["status"],
        data_reuniao_preliminar: dataReuniao || null,
        perfil_disc: (disc as ClienteEtapa1["perfil_disc"]) || null,
        aderiu_reuniao: aderiu,
        mensagem_padrao_enviada: msgPadrao,
        estudo_caso_enviado: estudoCaso,
        ligacao_realizada: ligacao,
        registro_contato: registro.trim() || null,
      });
      if (res.erro) {
        toast.error("Erro ao salvar.");
        return;
      }
      toast.success("Ficha salva.");
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={acompanhado ? "default" : "outline"}
          size="sm"
          onClick={toggleEquipe}
          disabled={pending}
        >
          <Star className={"size-4 " + (acompanhado ? "fill-current" : "")} />
          {acompanhado
            ? "Cliente acompanhado pela equipe"
            : "Marcar como cliente da equipe"}
        </Button>
        {wpp ? (
          <a
            href={wpp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-1.5 text-sm font-medium text-green-700 transition hover:bg-green-600/20 dark:text-green-400"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="f-nome">Nome</Label>
            <Input
              id="f-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-tel">Telefone</Label>
              <Input
                id="f-tel"
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
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
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
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

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="f-perda">Perda pela inércia</Label>
              <Input
                id="f-perda"
                inputMode="numeric"
                value={perda}
                onChange={(e) => setPerda(mascaraMoeda(e.target.value))}
                placeholder="R$ 0,00"
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
            <div className="grid gap-2">
              <Label htmlFor="f-data">Data da reunião preliminar</Label>
              <Input
                id="f-data"
                type="date"
                value={dataReuniao}
                onChange={(e) => setDataReuniao(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 rounded-md border p-3">
            <span className="text-sm font-medium">Andamento do contato</span>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={msgPadrao}
                  onCheckedChange={(v) => setMsgPadrao(Boolean(v))}
                />
                Mensagem padrão enviada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={estudoCaso}
                  onCheckedChange={(v) => setEstudoCaso(Boolean(v))}
                />
                Estudo de caso enviado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={ligacao}
                  onCheckedChange={(v) => setLigacao(Boolean(v))}
                />
                Ligação realizada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={aderiu}
                  onCheckedChange={(v) => setAderiu(Boolean(v))}
                />
                Aderiu à reunião (grupo de WhatsApp)
              </label>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
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

          <div className="grid gap-2">
            <Label htmlFor="f-reg">Registro do contato</Label>
            <Textarea
              id="f-reg"
              value={registro}
              onChange={(e) => setRegistro(e.target.value)}
              placeholder="Anotações sobre as conversas, ligações e combinados."
              rows={4}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando..." : "Salvar ficha"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <DocumentosSection
        alunoId={alunoId}
        clienteId={cliente.id}
        documentosIniciais={documentosIniciais}
      />
    </div>
  );
}
