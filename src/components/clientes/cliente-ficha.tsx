"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import {
  PROBLEMAS_7,
  NIVEIS_RELACIONAMENTO,
  FASES_CLIENTE,
  PERFIS_DISC,
  META_HONORARIOS,
} from "@/lib/etapa1";
import {
  mascaraMoeda,
  mascaraTelefone,
  moedaParaNumero,
  numeroParaMoeda,
} from "@/lib/masks";
import {
  MessageCircle,
  Star,
  Phone,
  Calendar,
  User,
  ExternalLink,
} from "lucide-react";
import { atualizarCliente, definirClienteEquipe } from "@/app/clientes/actions";
import { brlInteiro } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogoDesfavoritar } from "@/components/clientes/dialogo-desfavoritar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Só para a copy do campo de honorários — sem centavos, que aqui só ocupam espaço. */
const brlMeta = brlInteiro(META_HONORARIOS);

export function ClienteFicha({
  cliente,
  alunoId,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
}) {
  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(
    cliente.telefone ? mascaraTelefone(cliente.telefone) : "",
  );
  const [nivel, setNivel] = useState(cliente.nivel_relacionamento ?? "");
  const [problemas, setProblemas] = useState<string[]>(cliente.problemas ?? []);
  const [perda, setPerda] = useState(numeroParaMoeda(cliente.perda_inercia));
  const [fase, setFase] = useState<FaseCliente>(
    cliente.fase ?? "prospeccao",
  );
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
  /**
   * PL11 — desmarcar a estrela aqui trava os passos 4 a 8 da Etapa 01, igual
   * a desmarcá-la na lista. A lista já confirmava; a ficha desligava num
   * clique. `true` = diálogo aberto. Só o DESLIGAR pergunta: ligar é
   * reversível e não tranca nada.
   */
  const [desfavoritando, setDesfavoritando] = useState(false);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  // Honorários e link do contrato (Fase 7-B). Ficam no estado mesmo quando a
  // fase não é "contratado": o valor SOBREVIVE à volta de fase (B9-b) e é
  // reenviado como está — mudar de fase nunca apaga o que o aluno digitou.
  const [honorarios, setHonorarios] = useState(
    numeroParaMoeda(cliente.valor_honorarios),
  );
  const [contratoUrl, setContratoUrl] = useState(cliente.contrato_url ?? "");
  const [pending, startTransition] = useTransition();

  const wpp = linkWhatsapp(telefone);
  const faseAtual = FASES_CLIENTE.find((f) => f.id === fase);

  const contratado = fase === "contratado";
  const honorariosValor = moedaParaNumero(honorarios);
  const contratoLimpo = contratoUrl.trim();
  // Mesma regra do CHECK no banco (migração ...090): https, sem espaço, de 12 a
  // 2000 caracteres. Aqui é conveniência — a garantia é a do banco.
  const contratoInvalido =
    contratoLimpo !== "" &&
    (!/^https:\/\/[^\s]+$/.test(contratoLimpo) ||
      contratoLimpo.length < 12 ||
      contratoLimpo.length > 2000);

  function toggleEquipe() {
    if (acompanhado) {
      setErroDialogo(null);
      setDesfavoritando(true);
      return;
    }
    aplicarEquipe(true);
  }

  function aplicarEquipe(ativar: boolean) {
    setAcompanhado(ativar);
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) {
        // Desfaz o otimismo: sem isto a estrela ficaria mentindo na tela.
        setAcompanhado(!ativar);
        setErroDialogo("Erro ao mudar o cliente da equipe.");
        toast.error("Erro ao marcar o cliente da equipe.");
        return;
      }
      setDesfavoritando(false);
    });
  }

  function toggleProblema(id: string) {
    setProblemas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function salvar() {
    if (contratoInvalido) {
      toast.error(
        "O link do contrato precisa começar com https:// e não pode ter espaços.",
      );
      return;
    }
    startTransition(async () => {
      const res = await atualizarCliente(cliente.id, alunoId, {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        nivel_relacionamento:
          (nivel as ClienteEtapa1["nivel_relacionamento"]) || null,
        problemas,
        perda_inercia: moedaParaNumero(perda),
        // `status` congelou na migração 20260909000060 (é o caminho de volta):
        // nenhum caminho de escrita da aplicação pode tocar nele.
        fase,
        data_reuniao_preliminar: dataReuniao || null,
        perfil_disc: (disc as ClienteEtapa1["perfil_disc"]) || null,
        aderiu_reuniao: aderiu,
        mensagem_padrao_enviada: msgPadrao,
        estudo_caso_enviado: estudoCaso,
        ligacao_realizada: ligacao,
        registro_contato: registro.trim() || null,
        // Enviados sempre, inclusive fora de "contratado": o valor não some
        // ao mover o cliente de volta (B9-b). `null` continua `null` — nunca
        // vira R$ 0,00.
        valor_honorarios: honorariosValor,
        contrato_url: contratoLimpo || null,
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
            className="foco-visivel inline-flex items-center gap-1.5 rounded-md border border-sucesso-foreground/25 bg-sucesso px-3 py-1.5 text-sm font-medium text-sucesso-foreground transition hover:brightness-97"
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
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="f-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-tel">Telefone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-tel"
                  inputMode="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-nivel">Nível de relacionamento</Label>
              <Select value={nivel} onValueChange={(v) => setNivel(v ?? "")}>
                <SelectTrigger id="f-nivel">
                  <SelectValue placeholder="Selecione">
                    {(v: string) =>
                      NIVEIS_RELACIONAMENTO.find((n) => n.id === v)?.rotulo ?? v
                    }
                  </SelectValue>
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

          {/* UX5 — grupo de checkboxes não tem um controle único para
              apontar: o rótulo vira legenda de um `fieldset`, que é a forma
              correta de nomear o conjunto (WCAG 1.3.1). */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">
              Problemas (marque ao menos um)
            </legend>
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
          </fieldset>

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
              <Label htmlFor="f-fase">Fase</Label>
              <Select
                value={fase}
                onValueChange={(v) => setFase((v as FaseCliente) || "prospeccao")}
              >
                <SelectTrigger id="f-fase" aria-describedby="f-fase-ajuda">
                  {/* Sem função de render o Base UI imprime o VALOR do
                      banco: a ficha mostrava `quente`, `contratado` e `D`. */}
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
                id="f-fase-ajuda"
                className="text-xs leading-snug text-muted-foreground"
              >
                {faseAtual?.ajuda}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-data">Data da reunião preliminar</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-data"
                  type="date"
                  value={dataReuniao}
                  onChange={(e) => setDataReuniao(e.target.value)}
                  className="pl-9"
                />
              </div>
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

          {/* ---- Contrato (Fase 7-B) ----
              Só aparece em "Contratado", porque só contratado conta na meta.
              Mas o valor NÃO some quando a fase volta: aí ele vira leitura com
              o aviso de que saiu da meta. Esconder dado que o aluno digitou é
              perdê-lo em silêncio (B9-b). */}
          {contratado ? (
            <div className="grid gap-3 rounded-md border border-emerald-600/40 bg-emerald-600/5 p-3">
              <span className="text-sm font-medium">Contrato</span>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="f-honorarios">Honorários contratados</Label>
                  <Input
                    id="f-honorarios"
                    inputMode="numeric"
                    value={honorarios}
                    onChange={(e) => setHonorarios(mascaraMoeda(e.target.value))}
                    placeholder="R$ 0,00"
                    aria-describedby="f-honorarios-ajuda"
                  />
                  <p
                    id="f-honorarios-ajuda"
                    className="text-xs leading-snug text-muted-foreground"
                  >
                    Valor contratado com este cliente — não é o que já entrou no
                    caixa. Entra na meta de {brlMeta} do seu ambiente.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="f-contrato">Link do contrato</Label>
                  <Input
                    id="f-contrato"
                    type="url"
                    inputMode="url"
                    value={contratoUrl}
                    onChange={(e) => setContratoUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    aria-invalid={contratoInvalido || undefined}
                    aria-describedby={
                      contratoInvalido
                        ? "f-contrato-ajuda f-contrato-erro"
                        : "f-contrato-ajuda"
                    }
                  />
                  <p
                    id="f-contrato-ajuda"
                    className="text-xs leading-snug text-muted-foreground"
                  >
                    Cole o link do contrato na sua pasta do Drive. O arquivo não
                    é enviado para o portal.
                  </p>
                  {contratoInvalido ? (
                    <p
                      id="f-contrato-erro"
                      className="text-xs leading-snug font-medium text-destructive"
                    >
                      O link precisa começar com https:// e não pode conter
                      espaços.
                    </p>
                  ) : null}
                  {!contratoInvalido && contratoLimpo ? (
                    <a
                      href={contratoLimpo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-accent-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {/* UX2 — o CHECK do banco exige só `https://`: o link
                          pode ser Dropbox, OneDrive ou o site do cartório. A
                          ajuda e o `placeholder` acima seguem SUGERINDO o
                          Drive; o rótulo do botão não pode AFIRMAR. */}
                      Abrir contrato
                      <ExternalLink className="size-3.5" aria-hidden />
                      <span className="sr-only">(abre em nova aba)</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : honorariosValor != null || contratoLimpo ? (
            <div className="grid gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <span className="text-sm font-medium">Contrato</span>
              <p className="text-sm">
                Honorários registrados:{" "}
                <strong className="tabular-nums">
                  {numeroParaMoeda(honorariosValor) || "não informado"}
                </strong>{" "}
                — não contam na meta enquanto o cliente estiver em{" "}
                {faseAtual?.rotulo ?? "outra fase"}.
              </p>
              {contratoLimpo && !contratoInvalido ? (
                <a
                  href={contratoLimpo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-accent-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Abrir contrato
                  <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Mova o cliente de volta para Contratado para editar e voltar a
                contar na meta. O valor não é apagado.
              </p>
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-disc">Perfil DISC</Label>
              <Select value={disc} onValueChange={(v) => setDisc(v ?? "")}>
                <SelectTrigger id="f-disc">
                  <SelectValue placeholder="—">
                    {(v: string) =>
                      PERFIS_DISC.find((d) => d.id === v)?.rotulo ?? v
                    }
                  </SelectValue>
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

      {/* PL11 — o botão da estrela continua montado acima: é para lá que o
          foco volta quando o aluno desiste. O nome vem do campo em edição,
          que é o que ele está lendo na tela. */}
      {desfavoritando ? (
        <DialogoDesfavoritar
          desfavoritando={{ ...cliente, nome: nome.trim() || cliente.nome }}
          pending={pending}
          erroDialogo={erroDialogo}
          onConfirmar={() => aplicarEquipe(false)}
          onCancelar={() => {
            setDesfavoritando(false);
            setErroDialogo(null);
          }}
        />
      ) : null}
    </div>
  );
}
