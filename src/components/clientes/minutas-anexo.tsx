"use client";

/**
 * **Minutas** do cliente — histórico de versões do contrato em elaboração
 * (Word exportado em PDF pelo aluno), anexadas na ficha, perto do "Contrato
 * assinado".
 *
 * Molde literal de `contrato-anexo.tsx` (auditado 3×), com duas diferenças de
 * forma: (1) contrato é **1 arquivo que se substitui**, minuta é **N arquivos
 * que se acumulam** — cada envio é uma versão nova; as anteriores continuam
 * na lista, com data; (2) minuta aceita uma **nota livre** por versão
 * (`notas`), porque o backend deu um campo dedicado a isso.
 *
 * **Só PDF.** O aluno já exportou o Word antes de chegar aqui — não é este
 * componente que converte nem compara documentos.
 *
 * 🔑 **A "instrução do vermelho"** (palavras do Marcio, 15/09): o texto de
 * apoio abaixo do título orienta a deixar em vermelho o que foi alterado da
 * minuta e a escrever notas sobre ela. É ORIENTAÇÃO — o sistema não valida,
 * não compara páginas, não destaca nada sozinho. Por isso a frase fica ANTES
 * do botão de anexar, no corpo da tela, não num tooltip que ninguém abre.
 *
 * Fluxo de 3 passos (igual ao contrato):
 *   1. `criarUploadAssinadoMinutaCliente` — o SERVIDOR monta o caminho e emite
 *      o token;
 *   2. `uploadToSignedUrl` manda os bytes direto do navegador;
 *   3. `registrarMinutaCliente` — a RPC confere MIME/tamanho reais e grava
 *      mais uma linha no histórico (nunca substitui a anterior).
 *
 * O SDK do Supabase entra por `import()` só quando alguém escolhe um arquivo
 * (64 KB gzip) — a maioria das fichas nunca anexa nada.
 *
 * ⚠️ Remover tira a LINHA da lista; o byte fica no bucket até o expurgo do
 * admin — mesma verdade que `contrato-anexo.tsx` já diz, não fingir que o
 * arquivo some.
 */

import { useId, useRef, useState, useTransition } from "react";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import type { ClienteMinuta } from "@/lib/minutas-tipos";
import {
  MINUTA_TAMANHO_MAXIMO,
  MINUTA_NOTA_MAXIMO,
  ehMinutaMime,
  minutaTamanhoLegivel,
} from "@/lib/minutas-tipos";
import {
  criarUploadAssinadoMinutaCliente,
  registrarMinutaCliente,
  removerMinutaCliente,
  urlDeDownloadDaMinutaCliente,
} from "@/app/clientes/minuta-actions";
import { formatarDataHora } from "@/lib/datas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

const ACCEPT = ".pdf,application/pdf";

/** Frase própria para cada falha do Storage — `error.message` cru não vai à tela. */
function fraseDoErroDeUpload(erro: { message?: string } | null): string {
  const bruto = (erro?.message ?? "").toLowerCase();
  const status = String(
    (erro as { statusCode?: string | number } | null)?.statusCode ?? "",
  );
  if (status === "413" || bruto.includes("exceeded the maximum allowed size")) {
    return `Arquivo maior que ${minutaTamanhoLegivel(MINUTA_TAMANHO_MAXIMO)}.`;
  }
  if (status === "415" || status === "400" || bruto.includes("mime")) {
    return "Formato não aceito. Envie um PDF.";
  }
  if (
    status === "403" ||
    bruto.includes("unauthorized") ||
    bruto.includes("row-level")
  ) {
    return "Você não tem permissão para enviar este arquivo.";
  }
  return "Não foi possível enviar o arquivo. Tente de novo.";
}

export function MinutasAnexo({
  clienteId,
  minutas,
  podeAnexar,
  desabilitado = false,
  aoMudar,
}: {
  clienteId: string;
  /** Histórico completo, mais recente primeiro. `[]` = nenhuma minuta ainda. */
  minutas: ClienteMinuta[];
  /** Quem pode enviar uma versão nova — aluno ou equipe, a depender da tela
   * que monta o componente (`enviado_pela_equipe` registra quem foi). */
  podeAnexar: boolean;
  desabilitado?: boolean;
  /** Chamado depois de gravar/remover — a ficha recarrega do servidor. */
  aoMudar: () => void;
}) {
  const uid = useId();
  const idCampo = `${uid}-minuta`;
  const idAjuda = `${uid}-minuta-ajuda`;
  const idNota = `${uid}-minuta-nota`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [baixandoId, iniciarDownload] = useTransition();
  const [removendoAgora, iniciarRemocao] = useTransition();

  const ocupado = desabilitado || enviando !== null;
  const removendoMinuta = minutas.find((m) => m.id === removendoId) ?? null;
  const notaLimpa = nota.trim();
  const notaExcedida = notaLimpa.length > MINUTA_NOTA_MAXIMO;

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";

    // As duas perguntas que não precisam de rede. Não são a fronteira: o
    // bucket tem teto e allowlist, e a RPC confere o metadata do objeto.
    if (!ehMinutaMime(arquivo.type)) {
      setErro("Formato não aceito. Envie um PDF.");
      return;
    }
    if (arquivo.size < 1 || arquivo.size > MINUTA_TAMANHO_MAXIMO) {
      setErro(`Arquivo maior que ${minutaTamanhoLegivel(MINUTA_TAMANHO_MAXIMO)}.`);
      return;
    }
    if (notaExcedida) {
      setErro(`A nota pode ter até ${MINUTA_NOTA_MAXIMO} caracteres.`);
      return;
    }

    setEnviando(arquivo.name);
    const permissao = await criarUploadAssinadoMinutaCliente({
      clienteId,
      nome: arquivo.name,
      mime: arquivo.type,
      tamanho: arquivo.size,
    });
    if (!permissao.ok) {
      setEnviando(null);
      setErro(permissao.erro);
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient()
        .storage.from(permissao.bucket)
        .uploadToSignedUrl(permissao.path, permissao.token, arquivo, {
          contentType: arquivo.type,
        });
      if (error) {
        setEnviando(null);
        setErro(fraseDoErroDeUpload(error));
        return;
      }
    } catch {
      // O chunk do SDK não baixou. O token continua válido: tentar de novo
      // com a rede de volta funciona.
      setEnviando(null);
      setErro("Não foi possível enviar o arquivo. Tente de novo.");
      return;
    }

    const registro = await registrarMinutaCliente({
      clienteId,
      path: permissao.path,
      nome: permissao.nome,
      tamanho: arquivo.size,
      notas: notaLimpa || null,
    });
    setEnviando(null);
    if (registro.erro) {
      setErro(registro.erro);
      return;
    }
    setNota("");
    aoMudar();
  }

  function baixar(minuta: ClienteMinuta) {
    setErro(null);
    iniciarDownload(async () => {
      const r = await urlDeDownloadDaMinutaCliente(clienteId, minuta.id);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // Âncora programática (e não `window.open`): a URL só chega depois de um
      // `await`, quando o gesto do usuário já expirou e o bloqueador de
      // pop-up mataria a janela. `download=` no link, então o browser baixa
      // em vez de navegar — nunca servir este arquivo inline.
      const a = document.createElement("a");
      a.href = r.url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      document.body.append(a);
      a.click();
      a.remove();
    });
  }

  function remover() {
    if (!removendoId) return;
    setErro(null);
    iniciarRemocao(async () => {
      const r = await removerMinutaCliente(clienteId, removendoId);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setRemovendoId(null);
      aoMudar();
    });
  }

  return (
    <div className="grid gap-2">
      {/* A instrução do vermelho — ORIENTAÇÃO, o sistema não valida nem
          compara nada. Fica no corpo da tela, ANTES do botão de anexar. */}
      <p className="corpo-sm text-muted-foreground">
        Ao enviar uma nova versão, deixe em <strong>vermelho</strong> o que foi
        alterado em relação à minuta anterior, e inclua notas sobre a minuta
        quando fizer sentido. O sistema não compara nem destaca nada sozinho —
        é você quem sinaliza a mudança no próprio documento.
      </p>

      {/* O botão nativo do `<input type="file">` escreve "Choose File" no
          idioma da INTERFACE do navegador, não no da página. Por isso o input
          fica fora da tabulação e quem recebe o foco é o botão abaixo. */}
      {podeAnexar ? (
        <input
          ref={inputRef}
          id={idCampo}
          type="file"
          accept={ACCEPT}
          tabIndex={-1}
          disabled={ocupado}
          aria-describedby={idAjuda}
          onChange={(e) => void aoEscolher(e.target.files?.[0])}
          className="sr-only"
        />
      ) : null}

      {minutas.length > 0 ? (
        <ul className="grid gap-1.5">
          {minutas.map((minuta) => (
            <li
              key={minuta.id}
              className="grid gap-1 rounded-lg bg-superficie-afundada px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <FileText
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="order-first basis-full truncate corpo-sm font-medium sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto">
                  {minuta.nome}
                </span>
                {minuta.tamanho ? (
                  <span className="numero shrink-0 corpo-sm text-muted-foreground">
                    {minutaTamanhoLegivel(minuta.tamanho)}
                  </span>
                ) : null}
                <span className="shrink-0 corpo-sm text-muted-foreground">
                  enviada em {formatarDataHora(minuta.enviado_em)}
                  {minuta.enviado_pela_equipe ? " · pela equipe" : ""}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={baixandoId || removendoAgora}
                  aria-busy={baixandoId || undefined}
                  aria-label={`Baixar minuta de ${formatarDataHora(minuta.enviado_em)}`}
                  onClick={() => baixar(minuta)}
                >
                  <Download aria-hidden /> {baixandoId ? "Abrindo…" : "Baixar"}
                </Button>
                {podeAnexar ? (
                  <Button
                    type="button"
                    variant="ghost-danger"
                    size="xs"
                    disabled={ocupado || removendoAgora}
                    aria-label={`Remover minuta de ${formatarDataHora(minuta.enviado_em)}`}
                    onClick={() => {
                      setErro(null);
                      setRemovendoId(minuta.id);
                    }}
                  >
                    <Trash2 aria-hidden /> Remover
                  </Button>
                ) : null}
              </div>
              {minuta.notas ? (
                <p className="corpo-sm whitespace-pre-wrap text-muted-foreground">
                  {minuta.notas}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Nenhuma minuta enviada ainda.
        </p>
      )}

      {podeAnexar ? (
        <div className="grid gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={idNota}>Notas sobre esta versão (opcional)</Label>
            <Textarea
              id={idNota}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={ocupado}
              rows={2}
              placeholder="O que mudou nesta minuta em relação à anterior."
              aria-invalid={notaExcedida || undefined}
              aria-describedby={notaExcedida ? `${idNota}-erro` : undefined}
            />
            {notaExcedida ? (
              <p id={`${idNota}-erro`} className="corpo-sm text-destructive">
                A nota pode ter até {MINUTA_NOTA_MAXIMO} caracteres (
                {notaLimpa.length} digitados).
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado || notaExcedida}
              aria-busy={enviando !== null || undefined}
              aria-describedby={idAjuda}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip aria-hidden />{" "}
              {minutas.length > 0 ? "Enviar nova versão" : "Escolher arquivo"}
            </Button>
          </div>
        </div>
      ) : null}

      <p id={idAjuda} className="corpo-sm text-muted-foreground">
        Só PDF, até {minutaTamanhoLegivel(MINUTA_TAMANHO_MAXIMO)}. Cada envio
        vira uma versão nova no histórico — as anteriores continuam listadas,
        com data.
      </p>

      {/* Região viva SEMPRE montada: uma que nasce junto com o texto não é
          anunciada por parte dos leitores de tela. */}
      <div aria-live="polite" className="grid gap-1.5 empty:hidden">
        {enviando ? (
          <>
            <p className="corpo-sm text-muted-foreground">
              Enviando {enviando}…
            </p>
            {/* Barra indeterminada: o SDK não reporta progresso, e uma barra
                determinada mentiria sobre quanto falta. */}
            <div
              role="progressbar"
              aria-label="Enviando minuta"
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full w-full animate-pulse bg-primary motion-reduce:animate-none" />
            </div>
          </>
        ) : null}
      </div>

      {/* Sempre montado, mas CALADO enquanto o diálogo de remover está
          aberto: lá o mesmo erro já aparece, e anunciá-lo duas vezes é pior
          do que anunciá-lo uma. */}
      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {removendoId ? "" : erro}
      </p>

      {removendoMinuta ? (
        <DialogoConfirmacao
          aberto
          titulo="Remover esta minuta do histórico?"
          descricao={removendoMinuta.nome}
          consequencia={
            <>
              A minuta sai da lista da ficha.{" "}
              <strong>
                O arquivo continua guardado até a equipe fazer o expurgo
              </strong>{" "}
              — remover aqui não apaga o documento do armazenamento.
            </>
          }
          rotuloConfirmar="Remover minuta"
          rotuloConfirmando="Removendo…"
          confirmando={removendoAgora}
          erro={erro}
          onConfirmar={remover}
          onCancelar={() => {
            setRemovendoId(null);
            setErro(null);
          }}
        />
      ) : null}
    </div>
  );
}
