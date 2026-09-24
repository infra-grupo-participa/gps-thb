"use client";

/**
 * A aba **CROQUI** — histórico de folhas em PDF apresentadas ao cliente, com
 * pré-visualização inline (fatia 5, 24/09/2026).
 *
 * Molde literal de `minutas-anexo.tsx` (upload assinado → registrar → lista
 * de versões → pré-visualizar/baixar → remover com `DialogoConfirmacao`),
 * **sem** o formulário de contexto obrigatório da minuta (`caso`/
 * `oQueFoiFeito`/`pontoDeAjuda`/`oQueMudou` são da MINUTA, não do croqui) e
 * **com** dois campos próprios, os dois OPCIONAIS: `apresentadoEm` (o DIA em
 * que aquela folha foi apresentada, `<input type="date">`) e `observacoes`
 * (texto livre sobre a folha, ≤ `CROQUI_OBSERVACOES_MAXIMO`, com contador ao
 * vivo). Actions em `src/app/clientes/croqui-actions.ts`.
 *
 * **Só PDF, 5 MB** (`CROQUI_MIME`/`CROQUI_TAMANHO_MAXIMO`,
 * `src/lib/croquis-tipos.ts`). "Versão N de M" é derivado NA LEITURA pelo
 * índice — `croquis` já vem do servidor mais recente primeiro, então a mais
 * antiga é a Versão 1 (mesmo padrão de `minutas-anexo.tsx`).
 *
 * 🔴 **Pré-visualização é INLINE, abaixo da linha, não modal** — a equipe
 * compara croqui com o restante da ficha sem perder o lugar na lista. O
 * `VisorDocumento` só existe DEPOIS do clique: nunca montar um `<iframe>` por
 * item da lista (cada iframe = download de até 5 MB pela rota).
 *
 * Denso e chapado: lista de linhas com borda fina/superfície afundada, rótulo
 * pequeno em maiúsculas cinza, valor abaixo — sem card por campo, sem ícone
 * decorativo.
 */

import { useId, useRef, useState, useTransition } from "react";
import { Download, Eye, FileText, Paperclip, Trash2 } from "lucide-react";
import type { ClienteCroqui } from "@/lib/croquis-tipos";
import {
  CROQUI_OBSERVACOES_MAXIMO,
  CROQUI_TAMANHO_MAXIMO,
  croquiTamanhoLegivel,
  ehCroquiMime,
} from "@/lib/croquis-tipos";
import {
  criarUploadAssinadoCroquiCliente,
  registrarCroquiCliente,
  removerCroquiCliente,
  urlDeDownloadDoCroquiCliente,
} from "@/app/clientes/croqui-actions";
import { formatarDataHora, formatarDataSoDia } from "@/lib/datas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { VisorDocumento } from "@/components/clientes/visor-documento";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,application/pdf";

/** Frase própria para cada falha do Storage — `error.message` cru não vai à tela. */
function fraseDoErroDeUpload(erro: { message?: string } | null): string {
  const bruto = (erro?.message ?? "").toLowerCase();
  const status = String(
    (erro as { statusCode?: string | number } | null)?.statusCode ?? "",
  );
  if (status === "413" || bruto.includes("exceeded the maximum allowed size")) {
    return `Arquivo maior que ${croquiTamanhoLegivel(CROQUI_TAMANHO_MAXIMO)}.`;
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

export function FichaCroqui({
  clienteId,
  croquis,
  podeAnexar = true,
  desabilitado = false,
  aoMudar,
}: {
  clienteId: string;
  /** Histórico completo, mais recente primeiro. `[]` = nenhum croqui ainda. */
  croquis: readonly ClienteCroqui[];
  /** Dono do ambiente (titular/sócio) OU admin — mesma regra da minuta.
   * Default `true`: o placeholder da fatia 4 não recebia essa decisão, e o
   * `croqui-actions.ts` já confere a permissão de verdade no servidor. */
  podeAnexar?: boolean;
  desabilitado?: boolean;
  /** Chamado depois de gravar/remover — a ficha recarrega do servidor. */
  aoMudar?: () => void;
}) {
  const uid = useId();
  const idCampo = `${uid}-croqui`;
  const idAjuda = `${uid}-croqui-ajuda`;
  const idApresentadoEm = `${uid}-croqui-apresentado-em`;
  const idObservacoes = `${uid}-croqui-observacoes`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [apresentadoEm, setApresentadoEm] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [visualizandoId, setVisualizandoId] = useState<string | null>(null);
  const [baixandoId, iniciarDownload] = useTransition();
  const [removendoAgora, iniciarRemocao] = useTransition();

  const ocupado = desabilitado || enviando !== null;
  const removendoCroqui = croquis.find((c) => c.id === removendoId) ?? null;

  const observacoesExcedidas =
    observacoes.trim().length > CROQUI_OBSERVACOES_MAXIMO;

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";

    // As perguntas que não precisam de rede. Não são a fronteira: o bucket
    // tem teto e allowlist, e a RPC confere o metadata do objeto de novo.
    if (!ehCroquiMime(arquivo.type)) {
      setErro("Formato não aceito. Envie um PDF.");
      return;
    }
    if (arquivo.size < 1 || arquivo.size > CROQUI_TAMANHO_MAXIMO) {
      setErro(`Arquivo maior que ${croquiTamanhoLegivel(CROQUI_TAMANHO_MAXIMO)}.`);
      return;
    }
    if (observacoesExcedidas) {
      setErro(`As observações podem ter até ${CROQUI_OBSERVACOES_MAXIMO} caracteres.`);
      return;
    }

    setEnviando(arquivo.name);
    const permissao = await criarUploadAssinadoCroquiCliente({
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

    const registro = await registrarCroquiCliente({
      clienteId,
      path: permissao.path,
      nome: permissao.nome,
      tamanho: arquivo.size,
      apresentadoEm: apresentadoEm.trim() || null,
      observacoes: observacoes.trim() || null,
    });
    setEnviando(null);
    if (registro.erro) {
      setErro(registro.erro);
      return;
    }
    setApresentadoEm("");
    setObservacoes("");
    aoMudar?.();
  }

  function baixar(croqui: ClienteCroqui) {
    setErro(null);
    iniciarDownload(async () => {
      const r = await urlDeDownloadDoCroquiCliente(clienteId, croqui.id);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // Âncora programática (e não `window.open`): a URL só chega depois de um
      // `await`, quando o gesto do usuário já expirou e o bloqueador de
      // pop-up mataria a janela. `download=` no link, então o browser baixa
      // em vez de navegar — nunca servir este arquivo inline por aqui (a
      // pré-visualização usa a rota própria, `VisorDocumento`).
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
      const r = await removerCroquiCliente(clienteId, removendoId);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setRemovendoId(null);
      aoMudar?.();
    });
  }

  return (
    <div className="grid gap-2">
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

      {/* Campos opcionais — ACIMA do botão de anexar de propósito: o upload
          dispara no `onChange` do input, imediatamente ao escolher o
          arquivo. Se os campos ficassem abaixo, o parceiro subiria o PDF e
          só então preencheria o contexto. */}
      {podeAnexar ? (
        <div className="grid gap-3">
          <div className="grid gap-1.5 sm:max-w-56">
            <Label htmlFor={idApresentadoEm}>Apresentado em (opcional)</Label>
            <input
              id={idApresentadoEm}
              type="date"
              value={apresentadoEm}
              onChange={(e) => setApresentadoEm(e.target.value)}
              disabled={ocupado}
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={idObservacoes}>Observações (opcional)</Label>
            <Textarea
              id={idObservacoes}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              disabled={ocupado}
              rows={3}
              aria-invalid={observacoesExcedidas || undefined}
              aria-describedby={
                observacoesExcedidas ? `${idObservacoes}-erro` : undefined
              }
            />
            <p
              className={cn(
                "corpo-sm",
                observacoesExcedidas
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
              id={observacoesExcedidas ? `${idObservacoes}-erro` : undefined}
            >
              {observacoes.trim().length}/{CROQUI_OBSERVACOES_MAXIMO} caracteres
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado || observacoesExcedidas}
              aria-busy={enviando !== null || undefined}
              aria-describedby={idAjuda}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip aria-hidden />{" "}
              {croquis.length > 0 ? "Enviar nova versão" : "Escolher arquivo"}
            </Button>
          </div>
        </div>
      ) : null}

      <p id={idAjuda} className="corpo-sm text-muted-foreground">
        Só PDF, até {croquiTamanhoLegivel(CROQUI_TAMANHO_MAXIMO)}. Cada envio
        vira uma versão nova no histórico — as anteriores continuam listadas,
        com data.
      </p>

      {croquis.length > 0 ? (
        <ul className="grid gap-1.5">
          {croquis.map((croqui, indice) => {
            // "Versão N de M" — derivado do ÍNDICE na leitura, nunca coluna
            // no banco. A lista vem mais recente primeiro; a mais antiga é a
            // Versão 1.
            const versao = croquis.length - indice;
            const apresentado = formatarDataSoDia(croqui.apresentado_em);
            const emVisualizacao = visualizandoId === croqui.id;
            return (
              <li
                key={croqui.id}
                className="grid gap-1.5 rounded-lg bg-superficie-afundada px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <FileText
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="shrink-0 corpo-sm text-muted-foreground">
                    Versão {versao} de {croquis.length}
                  </span>
                  <span className="order-first basis-full truncate corpo-sm font-medium sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto">
                    {croqui.nome}
                  </span>
                  {croqui.tamanho ? (
                    <span className="numero shrink-0 corpo-sm text-muted-foreground">
                      {croquiTamanhoLegivel(croqui.tamanho)}
                    </span>
                  ) : null}
                  <span className="shrink-0 corpo-sm text-muted-foreground">
                    enviado em {formatarDataHora(croqui.enviado_em)}
                    {croqui.enviado_pela_equipe ? " · pela equipe" : " · por você"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={removendoAgora}
                    aria-pressed={emVisualizacao}
                    aria-label={`Pré-visualizar croqui de ${formatarDataHora(croqui.enviado_em)}`}
                    onClick={() =>
                      setVisualizandoId(emVisualizacao ? null : croqui.id)
                    }
                  >
                    <Eye aria-hidden /> {emVisualizacao ? "Fechar" : "Pré-visualizar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={baixandoId || removendoAgora}
                    aria-busy={baixandoId || undefined}
                    aria-label={`Baixar croqui de ${formatarDataHora(croqui.enviado_em)}`}
                    onClick={() => baixar(croqui)}
                  >
                    <Download aria-hidden /> {baixandoId ? "Abrindo…" : "Baixar"}
                  </Button>
                  {podeAnexar ? (
                    <Button
                      type="button"
                      variant="ghost-danger"
                      size="xs"
                      disabled={ocupado || removendoAgora}
                      aria-label={`Remover croqui de ${formatarDataHora(croqui.enviado_em)}`}
                      onClick={() => {
                        setErro(null);
                        setRemovendoId(croqui.id);
                      }}
                    >
                      <Trash2 aria-hidden /> Remover
                    </Button>
                  ) : null}
                </div>

                {/* Leitura densa e chapada: rótulo pequeno em
                    text-muted-foreground, valor abaixo — hierarquia por
                    POSIÇÃO, sem card por campo nem ícone decorativo. */}
                <div className="grid gap-1">
                  <p className="corpo-sm text-muted-foreground">
                    Apresentado em
                  </p>
                  <p className="corpo-sm">{apresentado ?? "não informado"}</p>
                </div>
                {croqui.observacoes ? (
                  <div className="grid gap-1">
                    <p className="corpo-sm text-muted-foreground">
                      Observações
                    </p>
                    <p className="corpo-sm whitespace-pre-wrap">
                      {croqui.observacoes}
                    </p>
                  </div>
                ) : null}

                {emVisualizacao ? (
                  <VisorDocumento
                    src={`/clientes/${clienteId}/documento/croqui/${croqui.id}`}
                    tipo="pdf"
                    titulo={croqui.nome}
                    onFechar={() => setVisualizandoId(null)}
                    onBaixar={() => baixar(croqui)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Nenhum croqui enviado ainda.
        </p>
      )}

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
              aria-label="Enviando croqui"
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

      {removendoCroqui ? (
        <DialogoConfirmacao
          aberto
          titulo="Remover esta folha do histórico do croqui?"
          descricao={removendoCroqui.nome}
          consequencia={
            <>
              O croqui sai da lista da ficha.{" "}
              <strong>
                O arquivo continua guardado até a equipe fazer o expurgo
              </strong>{" "}
              — remover aqui não apaga o documento do armazenamento.
            </>
          }
          rotuloConfirmar="Remover croqui"
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
