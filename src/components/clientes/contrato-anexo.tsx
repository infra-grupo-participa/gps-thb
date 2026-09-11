"use client";

/**
 * **Contrato assinado** do cliente — o ANEXO que substitui o "Link do contrato"
 * na visão principal da ficha (migração ...214).
 *
 * Por que anexo e não link: o contrato é **prova** de que o caso saiu do papel
 * (é o que sustenta o sinal "apto ao saldo do programa" para a equipe). Um link
 * do Drive prova endereço, não documento — e quebra quando a pasta muda de dono.
 * O `contrato_url` continua no banco como LEGADO, fora da visão principal.
 *
 * Fluxo de 3 passos, molde literal do anexo do chamado e do onboarding:
 *   1. `criarUploadAssinadoContratoCliente` — o SERVIDOR monta o caminho
 *      (`<ambiente>/<uuid>.<ext>`, extensão derivada do MIME, nunca do nome do
 *      arquivo) e emite o token;
 *   2. `uploadToSignedUrl` manda os bytes direto do navegador, com a sessão do
 *      aluno (nada de `service_role`, nada de multipart de 5 MB por action);
 *   3. `registrarContratoCliente` — a RPC confere MIME e tamanho REAIS em
 *      `storage.objects.metadata` e só então grava a ficha.
 *
 * 🔴 **O admin não anexa** (`gps.pode_anexar_onboarding` exige que o ambiente
 * do prefixo seja o de quem chama, e o admin não tem ambiente): a equipe BAIXA
 * e REMOVE. A tela não oferece o botão que a policy recusaria — diz por quê.
 *
 * ⚠️ **O arquivo antigo continua no bucket** depois de substituir ou remover: a
 * policy de DELETE de `storage.objects` é só de admin e o GPS não usa
 * `service_role`. A tela DIZ isso. Fingir que o arquivo sumiu seria mentir — a
 * mesma lição do expurgo dos chamados.
 *
 * O SDK do Supabase entra por `import()` só quando alguém escolhe um arquivo:
 * a maioria das fichas nunca anexa nada, e são 64 KB gzip.
 */

import { useId, useRef, useState, useTransition } from "react";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import {
  criarUploadAssinadoContratoCliente,
  registrarContratoCliente,
  removerContratoCliente,
  urlDeDownloadDoContratoCliente,
} from "@/app/clientes/actions";
import {
  ANEXO_TAMANHO_MAXIMO,
  ehAnexoMime,
  tamanhoLegivel,
} from "@/lib/chamados-tipos";
import { formatarData } from "@/lib/datas";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";

const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

/** O bucket é o mesmo do questionário: `gps-onboarding` = anexos do AMBIENTE. */
const BUCKET = "gps-onboarding";

/** Frase própria para cada falha do Storage — `error.message` cru não vai à tela. */
function fraseDoErroDeUpload(erro: { message?: string } | null): string {
  const bruto = (erro?.message ?? "").toLowerCase();
  const status = String(
    (erro as { statusCode?: string | number } | null)?.statusCode ?? "",
  );
  if (status === "413" || bruto.includes("exceeded the maximum allowed size")) {
    return "Arquivo maior que 5 MB.";
  }
  if (status === "415" || status === "400" || bruto.includes("mime")) {
    return "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.";
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

export type ContratoDoCliente = {
  nome: string | null;
  mime: string | null;
  tamanho: number | null;
  anexadoEm: string | null;
};

export function ContratoAnexo({
  clienteId,
  contrato,
  podeAnexar,
  desabilitado = false,
  aoMudar,
}: {
  clienteId: string;
  /** `null` = nenhum contrato anexado ainda. */
  contrato: ContratoDoCliente | null;
  /** Só o ALUNO anexa (a policy do bucket exige o ambiente dele). */
  podeAnexar: boolean;
  desabilitado?: boolean;
  /** Chamado depois de gravar/remover — a ficha recarrega o dado do servidor. */
  aoMudar: () => void;
}) {
  const uid = useId();
  const idCampo = `${uid}-contrato`;
  const idAjuda = `${uid}-contrato-ajuda`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState(false);
  const [baixando, iniciarDownload] = useTransition();
  const [removendoAgora, iniciarRemocao] = useTransition();

  const temContrato = contrato?.nome != null;
  const ocupado = desabilitado || enviando !== null;

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";

    // As duas perguntas que não precisam de rede. Não são a fronteira: o
    // bucket tem teto e allowlist, e a RPC confere o metadata do objeto.
    if (!ehAnexoMime(arquivo.type)) {
      setErro("Formato não aceito. Envie PNG, JPG, WEBP ou PDF.");
      return;
    }
    if (arquivo.size < 1 || arquivo.size > ANEXO_TAMANHO_MAXIMO) {
      setErro("Arquivo maior que 5 MB.");
      return;
    }

    setEnviando(arquivo.name);
    const permissao = await criarUploadAssinadoContratoCliente({
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
        .storage.from(BUCKET)
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

    const registro = await registrarContratoCliente({
      clienteId,
      path: permissao.path,
      nome: permissao.nome,
      mime: arquivo.type,
      tamanho: arquivo.size,
    });
    setEnviando(null);
    if (registro.erro) {
      setErro(registro.erro);
      return;
    }
    aoMudar();
  }

  function baixar() {
    setErro(null);
    iniciarDownload(async () => {
      const r = await urlDeDownloadDoContratoCliente(clienteId);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // Âncora programática (e não `window.open`): a URL só chega depois de um
      // `await`, quando o gesto do usuário já expirou e o bloqueador de pop-up
      // mataria a janela. A URL vem com `download=`, então o browser baixa em
      // vez de navegar — nunca servir este arquivo inline.
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
    setErro(null);
    iniciarRemocao(async () => {
      const r = await removerContratoCliente(clienteId);
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setRemovendo(false);
      aoMudar();
    });
  }

  return (
    <div className="grid gap-2">
      <p className="corpo font-medium">Contrato assinado</p>

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

      {temContrato ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-superficie-afundada px-2.5 py-2">
          <FileText
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="order-first basis-full truncate corpo-sm font-medium sm:order-none sm:min-w-0 sm:flex-1 sm:basis-auto">
            {contrato?.nome}
          </span>
          {contrato?.tamanho ? (
            <span className="numero shrink-0 corpo-sm text-muted-foreground">
              {tamanhoLegivel(contrato.tamanho)}
            </span>
          ) : null}
          {contrato?.anexadoEm ? (
            <span className="shrink-0 corpo-sm text-muted-foreground">
              enviado em {formatarData(contrato.anexadoEm)}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={baixando || removendoAgora}
            aria-busy={baixando || undefined}
            aria-label={`Baixar contrato assinado ${contrato?.nome ?? ""}`}
            onClick={baixar}
          >
            <Download aria-hidden /> {baixando ? "Abrindo…" : "Baixar"}
          </Button>
          {podeAnexar ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip aria-hidden /> Substituir
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost-danger"
            size="xs"
            disabled={ocupado || removendoAgora}
            onClick={() => {
              setErro(null);
              setRemovendo(true);
            }}
          >
            <Trash2 aria-hidden /> Remover
          </Button>
        </div>
      ) : podeAnexar ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocupado}
            aria-busy={enviando !== null || undefined}
            aria-describedby={idAjuda}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip aria-hidden /> Escolher arquivo
          </Button>
          <span className="corpo-sm text-muted-foreground">
            Nenhum contrato anexado
          </span>
        </div>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Nenhum contrato anexado. Quem envia o arquivo é o parceiro, pelo portal
          dele.
        </p>
      )}

      <p id={idAjuda} className="corpo-sm text-muted-foreground">
        O contrato assinado com este cliente. PNG, JPG, WEBP ou PDF, até{" "}
        {tamanhoLegivel(ANEXO_TAMANHO_MAXIMO)}. É a prova de que o caso foi
        fechado — os demais documentos do cliente continuam na sua pasta do
        Drive.
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
              aria-label="Enviando contrato assinado"
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full w-full animate-pulse bg-primary motion-reduce:animate-none" />
            </div>
          </>
        ) : null}
      </div>

      {/* Sempre montado (região viva que nasce com o texto não é anunciada por
          parte dos leitores de tela), mas CALADO enquanto o diálogo de remover
          está aberto: lá o mesmo erro já aparece, e anunciá-lo duas vezes é
          pior do que anunciá-lo uma. */}
      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {removendo ? "" : erro}
      </p>

      {removendo ? (
        <DialogoConfirmacao
          aberto
          titulo="Remover o contrato assinado deste cliente?"
          descricao={contrato?.nome ?? "Contrato assinado"}
          consequencia={
            <>
              O contrato sai da ficha e a equipe deixa de ver a prova de que o
              caso foi fechado.{" "}
              <strong>
                O arquivo continua guardado até a equipe fazer o expurgo
              </strong>{" "}
              — sair da ficha não apaga o documento do armazenamento.
            </>
          }
          rotuloConfirmar="Remover contrato"
          rotuloConfirmando="Removendo…"
          confirmando={removendoAgora}
          erro={erro}
          onConfirmar={remover}
          onCancelar={() => {
            setRemovendo(false);
            setErro(null);
          }}
        />
      ) : null}
    </div>
  );
}
