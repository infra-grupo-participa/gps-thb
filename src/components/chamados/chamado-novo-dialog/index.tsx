"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { abrirChamado } from "@/app/chamados/actions";
import {
  CHAMADO_ASSUNTO_MAXIMO,
  CHAMADO_ASSUNTO_MINIMO,
  CHAMADO_TEXTO_MAXIMO,
  ROTULO_CATEGORIA_CHAMADO,
  type AnexoInput,
  type CategoriaChamado,
} from "@/lib/chamados-tipos";
import { AnexoCampo } from "@/components/chamados/anexo-campo";
import type { OpcaoCliente } from "@/components/chamados/seletor-cliente";
import { CampoCategoria } from "./campo-categoria";
import { CampoTrocaCliente } from "./campo-troca-cliente";
import { CampoTrocaSocio } from "./campo-troca-socio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Abrir chamado" — o formulário de entrada do suporte.
 *
 * Categoria é o PRIMEIRO campo (decisão do briefing 11/09/2026) e decide o
 * resto do formulário:
 *   - `sistema`/`outros` → o formulário de sempre (assunto + mensagem + anexo).
 *   - `troca_cliente` → cliente atual travado + seletor do novo, COM BUSCA.
 *   - `troca_socio` → sócio atual + motivo da saída (a entrada do novo sócio
 *     segue pela aba Equipe — decisão #5 do briefing).
 *
 * `categoriasAtivo` é o interruptor `gps.chamados_categorias_ativo()`: quando
 * falso, este componente se comporta como o formulário de SEMPRE (sem o
 * campo Categoria) — a categoria enviada é sempre `undefined`, e a RPC
 * recebe `p_categoria = null`, exatamente como antes desta feature.
 *
 * `DialogTrigger` (em vez de `Button` + estado solto) é o que devolve o foco
 * ao gatilho quando o diálogo fecha; sem ele o teclado volta ao `<body>` e a
 * pessoa recomeça a navegação do topo da página.
 *
 * O anexo sobe ANTES do envio (ver `AnexoCampo`): quando `abrirChamado` roda,
 * o arquivo já está no bucket e a abertura é um INSERT atômico. Se a pessoa
 * desistir depois de subir, o arquivo vira órfão — e órfão é exatamente o que
 * a tela de retenção do admin expurga.
 */
export function ChamadoNovoDialog({
  categoriaInicial = null,
  categoriasAtivo,
  clientes,
  clienteAtualId,
  clienteAtualNome,
  socioAtualNome,
  temSocio,
}: {
  /**
   * Categoria que já vem escolhida — hoje só quando chega de
   * `hrefChamadoTroca` (`?categoria=troca_cliente`, ficha do cliente).
   */
  categoriaInicial?: CategoriaChamado | null;
  /** Interruptor do banco. `false` = formulário de sempre, sem categoria. */
  categoriasAtivo: boolean;
  /** Clientes do ambiente, para o seletor de "Troca de cliente" (com busca). */
  clientes: OpcaoCliente[];
  clienteAtualId: string | null;
  clienteAtualNome: string | null;
  /**
   * `socioAtualId` NÃO entra aqui: a RPC de troca de sócio ainda não tem um
   * "alvo novo" com ID (ver divergência documentada em
   * `campo-troca-socio.tsx`) — este diálogo só precisa do NOME para exibir.
   */
  socioAtualNome: string | null;
  temSocio: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const idCategoria = `${uid}-categoria`;
  const idAssunto = `${uid}-assunto`;
  const idTexto = `${uid}-texto`;
  const idContador = `${uid}-contador`;
  const idErro = `${uid}-erro`;

  const categoriaPadrao: CategoriaChamado = categoriaInicial ?? "sistema";

  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState<CategoriaChamado>(categoriaPadrao);
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [clienteNovo, setClienteNovo] = useState<OpcaoCliente | null>(null);
  const [motivoSocio, setMotivoSocio] = useState("");
  const [anexo, setAnexo] = useState<AnexoInput | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentou, setTentou] = useState(false);
  const [pendente, startTransition] = useTransition();

  const ehTrocaCliente = categoriasAtivo && categoria === "troca_cliente";
  const ehTrocaSocio = categoriasAtivo && categoria === "troca_socio";
  const ehTroca = ehTrocaCliente || ehTrocaSocio;

  // Nas categorias de troca, o assunto e a mensagem nascem da própria
  // categoria — a pessoa não digita "Assunto: troca de cliente" de novo.
  // `sistema`/`outros` continuam com os dois campos livres de sempre.
  function assuntoEfetivo(): string {
    if (ehTrocaCliente) return "Troca do cliente acompanhado";
    if (ehTrocaSocio) return "Troca de sócio";
    return assunto.trim();
  }
  function textoEfetivo(): string {
    if (ehTrocaCliente) {
      return clienteNovo
        ? `Pedido de troca: de "${clienteAtualNome ?? "cliente atual"}" para "${clienteNovo.nome}".`
        : "";
    }
    if (ehTrocaSocio) return motivoSocio.trim();
    return texto.trim();
  }

  const assuntoValido = ehTroca
    ? true
    : assunto.trim().length >= CHAMADO_ASSUNTO_MINIMO &&
      assunto.trim().length <= CHAMADO_ASSUNTO_MAXIMO;
  const textoValido = ehTrocaCliente
    ? Boolean(clienteNovo)
    : ehTrocaSocio
      ? motivoSocio.trim().length > 0
      : texto.trim().length > 0 && texto.length <= CHAMADO_TEXTO_MAXIMO;
  const formValido = assuntoValido && textoValido;

  function limpar() {
    setCategoria(categoriaPadrao);
    setAssunto("");
    setTexto("");
    setClienteNovo(null);
    setMotivoSocio("");
    setAnexo(null);
    setTentou(false);
  }

  function enviar() {
    if (!formValido) {
      setTentou(true);
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await abrirChamado({
        assunto: assuntoEfetivo(),
        texto: textoEfetivo(),
        categoria: categoriasAtivo ? categoria : undefined,
        alvoNovoId: ehTrocaCliente ? clienteNovo?.id : undefined,
        anexo: anexo ?? undefined,
      });
      if (!r.ok) {
        // O erro fica NA TELA, dentro do diálogo: um toast sumiria junto com
        // o que a pessoa preencheu.
        setErro(r.erro);
        return;
      }
      toast.success(
        r.equipeAvisada
          ? "Chamado aberto. A equipe foi avisada por e-mail."
          : "Chamado aberto. Ele já aparece na fila da equipe.",
      );
      setAberto(false);
      limpar();
      router.push(`/chamados/${r.chamadoId}`);
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) {
          setErro(null);
          setTentou(false);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" />}>
        <LifeBuoy aria-hidden /> Abrir chamado
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir chamado</DialogTitle>
          <DialogDescription>
            {ehTroca
              ? "A equipe analisa o pedido e decide: aprovar já executa a troca; declinar explica o motivo. A conversa continua por mensagem se precisar."
              : "Descreva o que aconteceu. Se ajudar, anexe um print ou um PDF. A equipe responde por aqui e você recebe um e-mail quando houver resposta."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {categoriasAtivo ? (
            <CampoCategoria
              id={idCategoria}
              valor={categoria}
              onChange={(v) => {
                setCategoria(v);
                setErro(null);
                setTentou(false);
              }}
              desabilitado={pendente}
            />
          ) : null}

          {ehTrocaCliente ? (
            <CampoTrocaCliente
              id={`${uid}-cliente`}
              clienteAtualId={clienteAtualId}
              clienteAtualNome={clienteAtualNome}
              clientes={clientes}
              novo={clienteNovo}
              onEscolherNovo={setClienteNovo}
              desabilitado={pendente}
              invalido={tentou && !clienteNovo}
            />
          ) : ehTrocaSocio ? (
            <CampoTrocaSocio
              id={`${uid}-socio`}
              socioAtualNome={socioAtualNome}
              temSocio={temSocio}
              motivo={motivoSocio}
              onMudarMotivo={setMotivoSocio}
              desabilitado={pendente}
            />
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor={idAssunto}>Assunto</Label>
                <Input
                  id={idAssunto}
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Ex.: não consigo cadastrar um cliente"
                  maxLength={CHAMADO_ASSUNTO_MAXIMO}
                  autoComplete="off"
                  aria-invalid={
                    (tentou && !assuntoValido) || erro ? true : undefined
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={idTexto}>Mensagem</Label>
                <Textarea
                  id={idTexto}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="O que você tentou fazer, o que aconteceu e em qual tela."
                  rows={5}
                  maxLength={CHAMADO_TEXTO_MAXIMO}
                  aria-describedby={idContador}
                  aria-invalid={
                    (tentou && !textoValido) || erro ? true : undefined
                  }
                />
                <div
                  id={idContador}
                  className="text-right text-xs text-muted-foreground tabular-nums"
                >
                  {texto.length}/{CHAMADO_TEXTO_MAXIMO}
                </div>
              </div>
            </>
          )}

          {/* Anexo só faz sentido no formulário de texto livre: print/PDF de
              um problema no sistema. Nas trocas, o "atual × novo" já é a
              prova, e a equipe conversa por mensagem se precisar de mais. */}
          {!ehTroca ? (
            <AnexoCampo aoMudar={setAnexo} desabilitado={pendente} />
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Sempre montado: região viva que nasce junto com o texto não é
                anunciada por parte dos leitores de tela. */}
            <p
              id={idErro}
              role="alert"
              className="mr-auto text-sm text-destructive"
            >
              {erro ??
                (tentou && !formValido
                  ? ehTrocaCliente
                    ? "Escolha o cliente para quem você quer trocar."
                    : ehTrocaSocio
                      ? "Conte por que quer trocar de sócio."
                      : "Preencha o assunto e a mensagem."
                  : null)}
            </p>
            <Button
              type="button"
              onClick={enviar}
              disabled={pendente}
              aria-busy={pendente || undefined}
            >
              {pendente
                ? "Enviando…"
                : ehTroca
                  ? `Enviar pedido de ${ROTULO_CATEGORIA_CHAMADO[categoria].toLowerCase()}`
                  : "Abrir chamado"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
