"use client";

import { useId, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { tamanhoLegivel } from "@/lib/chamados-tipos";
import type { OnboardingAnexo } from "@/lib/types";
import {
  BUCKET_ONBOARDING,
  MIMES_ACEITOS,
  TAMANHO_MAXIMO,
  type OnboardingActions,
} from "./tipos";

const ACCEPT =
  ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

/** Frase própria para cada falha do Storage — `error.message` cru não vai à tela. */
function fraseDoErro(erro: { message?: string } | null): string {
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
  if (status === "403" || bruto.includes("unauthorized") || bruto.includes("row-level")) {
    return "Você não tem permissão para enviar este arquivo.";
  }
  return "Não foi possível enviar o arquivo. Tente de novo.";
}

/**
 * Campo de anexo do onboarding — o mesmo caminho já auditado do chamado
 * (`src/components/chamados/anexo-campo.tsx`), com duas diferenças:
 * aceita N arquivos e recebe as actions por prop.
 *
 * Fluxo: valida aqui → o SERVIDOR monta o caminho e emite o token →
 * `uploadToSignedUrl` manda os bytes direto do navegador → o servidor registra
 * a linha. Assim a conclusão continua sendo uma transação só e nenhum
 * multipart de 5 MB passa por Server Action.
 *
 * 🔴 A validação daqui NÃO é a fronteira: o bucket tem teto e allowlist, a
 * policy exige o prefixo do próprio ambiente e a RPC confere o metadata contra
 * o que o cliente declarou. Aqui é só para a pessoa saber o que houve antes de
 * esperar um upload que vai ser recusado.
 *
 * O SDK do Supabase entra por `import()` só quando alguém escolhe um arquivo —
 * a maioria dos onboardings não anexa nada, e são 64 KB gzip.
 */
export function AnexoOnboarding({
  tipo,
  anexos,
  actions,
  maximo = 5,
  rotulo,
  ajuda,
  desabilitado = false,
  aoMudar,
}: {
  tipo: OnboardingAnexo["tipo"];
  anexos: OnboardingAnexo[];
  actions: OnboardingActions;
  maximo?: number;
  rotulo: string;
  ajuda?: React.ReactNode;
  desabilitado?: boolean;
  aoMudar: (anexos: OnboardingAnexo[]) => void;
}) {
  const uid = useId();
  const idCampo = `${uid}-arquivo`;
  const idAjuda = `${uid}-ajuda`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const cheio = anexos.length >= maximo;

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";

    if (!MIMES_ACEITOS.includes(arquivo.type)) {
      setErro("Formato não aceito. Envie PNG, JPG, WEBP ou PDF.");
      return;
    }
    if (arquivo.size < 1 || arquivo.size > TAMANHO_MAXIMO) {
      setErro("Arquivo maior que 5 MB.");
      return;
    }

    setEnviando(arquivo.name);
    const permissao = await actions.criarUploadAssinado({
      nome: arquivo.name,
      mime: arquivo.type,
      tamanho: arquivo.size,
      tipo,
    });
    if (!permissao.ok) {
      setEnviando(null);
      setErro(permissao.erro);
      return;
    }

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient()
        .storage.from(BUCKET_ONBOARDING)
        .uploadToSignedUrl(permissao.path, permissao.token, arquivo, {
          contentType: arquivo.type,
        });
      if (error) {
        setEnviando(null);
        setErro(fraseDoErro(error));
        return;
      }
    } catch {
      setEnviando(null);
      setErro("Não foi possível enviar o arquivo. Tente de novo.");
      return;
    }

    const registro = await actions.registrarAnexo({
      tipo,
      path: permissao.path,
      nome: permissao.nome,
      mime: arquivo.type,
      tamanho: arquivo.size,
    });
    setEnviando(null);
    if (registro.erro || !registro.anexo) {
      setErro(registro.erro ?? "Não foi possível registrar o arquivo.");
      return;
    }
    // `contrato_honorarios` é único por pessoa: enviar de novo SUBSTITUI.
    aoMudar(
      tipo === "contrato_honorarios"
        ? [registro.anexo]
        : [...anexos, registro.anexo],
    );
  }

  async function remover(id: string) {
    setErro(null);
    const r = await actions.removerAnexo(id);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    aoMudar(anexos.filter((a) => a.id !== id));
  }

  return (
    <div className="grid gap-2">
      <p className="corpo font-medium">{rotulo}</p>

      {/* O botão nativo do `<input type="file">` escreve "Choose File" no
          idioma da INTERFACE do navegador, não no da página. Por isso o input
          fica fora da tabulação e quem recebe o foco é o botão. */}
      <input
        ref={inputRef}
        id={idCampo}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        disabled={desabilitado || cheio || enviando !== null}
        aria-describedby={idAjuda}
        onChange={(e) => void aoEscolher(e.target.files?.[0])}
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={desabilitado || cheio || enviando !== null}
          aria-busy={enviando !== null || undefined}
          aria-describedby={idAjuda}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip aria-hidden />
          {anexos.length > 0 && tipo === "contrato_honorarios"
            ? "Trocar arquivo"
            : "Escolher arquivo"}
        </Button>
        {cheio ? (
          <span className="corpo-sm text-muted-foreground">
            Limite de {maximo} arquivos.
          </span>
        ) : null}
      </div>

      {ajuda ? (
        <p id={idAjuda} className="corpo-sm text-muted-foreground">
          {ajuda}
        </p>
      ) : (
        <p id={idAjuda} className="corpo-sm text-muted-foreground">
          PNG, JPG, WEBP ou PDF, até 5 MB.
        </p>
      )}

      {/* Região viva SEMPRE montada: uma que nasce junto com o texto não é
          anunciada por parte dos leitores de tela. */}
      <div aria-live="polite" className="grid gap-2 empty:hidden">
        {enviando ? (
          <p className="corpo-sm text-muted-foreground">Enviando {enviando}…</p>
        ) : null}
        {anexos.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5"
          >
            <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate corpo-sm">{a.nome}</span>
            <span className="numero shrink-0 corpo-sm text-muted-foreground">
              {tamanhoLegivel(a.tamanho)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={desabilitado}
              onClick={() => void remover(a.id)}
            >
              <X aria-hidden />
              <span className="sr-only">Remover </span>
              Remover
            </Button>
          </div>
        ))}
        {erro ? (
          <p role="alert" className="corpo-sm text-destructive">
            {erro}
          </p>
        ) : null}
      </div>
    </div>
  );
}
