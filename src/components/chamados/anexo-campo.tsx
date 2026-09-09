"use client";

import { useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { criarUploadAssinadoDeAnexo } from "@/app/chamados/actions";
import {
  ANEXO_TAMANHO_MAXIMO,
  BUCKET_CHAMADOS,
  ehAnexoMime,
  tamanhoLegivel,
  type AnexoInput,
} from "@/lib/chamados-tipos";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Campo de anexo do chamado — a peça delicada da Fase 6.
 *
 * O arquivo sobe ANTES da mensagem, direto do navegador para o Storage. É o
 * que deixa a abertura do chamado ser um INSERT atômico (o `path` já existe
 * quando a RPC roda) e o que evita mandar 5 MB de multipart por uma Server
 * Action.
 *
 * Fluxo (o recomendado pelo contrato §14):
 *   1. valida aqui  → 2. `criarUploadAssinadoDeAnexo` (o SERVIDOR monta o
 *   caminho e deriva a extensão do MIME) → 3. `uploadToSignedUrl` com o token
 *   → 4. devolve `AnexoInput` ao formulário pai, que só então chama
 *   `abrirChamado`/`responderChamado`.
 *
 * 🔴 A validação daqui NÃO é a fronteira. O bucket tem teto de 5 MB e
 * allowlist de 4 MIMEs, a policy exige o prefixo do próprio ambiente e a RPC
 * confere o metadata do objeto contra o que o cliente declarou. Aqui é só para
 * a pessoa saber o que houve antes de esperar um upload que vai ser recusado.
 *
 * 🔴 O aluno anexa; a EQUIPE NÃO (B5-c). Nenhuma tela do admin monta este
 * componente — e, se montasse, `criarUploadAssinadoDeAnexo` recusaria (o
 * `alunoId` do admin é nulo) e a policy `gps.pode_anexar_chamado` recusaria
 * de novo.
 */

/** `accept` do input: extensão E mime, porque o Windows manda os dois casos. */
const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

type Estado =
  | { fase: "vazio" }
  | { fase: "enviando"; nome: string }
  | { fase: "pronto"; anexo: AnexoInput }
  | { fase: "erro"; mensagem: string };

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
  if (status === "403" || bruto.includes("unauthorized") || bruto.includes("row-level")) {
    // A policy de insert do bucket consulta `gps.chamados_abertos()`.
    return "O suporte está fechado no momento.";
  }
  return "Não foi possível enviar o arquivo. Tente de novo.";
}

export function AnexoCampo({
  aoMudar,
  desabilitado = false,
}: {
  /** Chamado com o anexo pronto, ou `null` quando ele é removido/limpo. */
  aoMudar: (anexo: AnexoInput | null) => void;
  desabilitado?: boolean;
}) {
  const uid = useId();
  const idCampo = `${uid}-anexo`;
  const idAjuda = `${uid}-anexo-ajuda`;
  const idStatus = `${uid}-anexo-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "vazio" });

  function limpar() {
    if (inputRef.current) inputRef.current.value = "";
    setEstado({ fase: "vazio" });
    aoMudar(null);
  }

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    aoMudar(null);

    // 1) as duas perguntas que não precisam de rede.
    if (!ehAnexoMime(arquivo.type)) {
      setEstado({
        fase: "erro",
        mensagem: "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",
      });
      return;
    }
    if (arquivo.size < 1 || arquivo.size > ANEXO_TAMANHO_MAXIMO) {
      setEstado({ fase: "erro", mensagem: "Arquivo maior que 5 MB." });
      return;
    }

    setEstado({ fase: "enviando", nome: arquivo.name });

    // 2) o servidor monta o caminho (`<aluno_id>/<uuid>.<ext>`, extensão
    //    derivada do MIME, nunca do nome do arquivo) e emite o token.
    const permissao = await criarUploadAssinadoDeAnexo({
      nome: arquivo.name,
      mime: arquivo.type,
      tamanho: arquivo.size,
    });
    if (!permissao.ok) {
      setEstado({ fase: "erro", mensagem: permissao.erro });
      return;
    }

    // 3) os bytes vão direto do navegador para o Storage, com a sessão do
    //    aluno. `uploadToSignedUrl` não expõe progresso byte a byte — por
    //    isso a barra abaixo é indeterminada, e não um número inventado.
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET_CHAMADOS)
      .uploadToSignedUrl(permissao.path, permissao.token, arquivo, {
        contentType: arquivo.type,
      });

    if (error) {
      setEstado({ fase: "erro", mensagem: fraseDoErroDeUpload(error) });
      return;
    }

    const anexo: AnexoInput = {
      path: permissao.path,
      nome: permissao.nome,
      mime: arquivo.type,
      tamanho: arquivo.size,
    };
    setEstado({ fase: "pronto", anexo });
    aoMudar(anexo);
  }

  const enviando = estado.fase === "enviando";

  return (
    <div className="grid gap-2">
      <Label htmlFor={idCampo}>Anexo (opcional)</Label>

      {/* 🔑 O botão NATIVO do `<input type="file">` escreve "Choose File / No
          file chosen" no idioma da INTERFACE do navegador, não no da página —
          inglês no meio de uma tela em português, e não há como traduzir. Por
          isso o input fica fora da ordem de tabulação (`sr-only` +
          `tabIndex={-1}`) e quem recebe o foco é o botão abaixo, que abre o
          mesmo seletor. O `<Label htmlFor>` continua nomeando o campo. */}
      <input
        ref={inputRef}
        id={idCampo}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        disabled={desabilitado || enviando}
        aria-describedby={idAjuda}
        onChange={(e) => void aoEscolher(e.target.files?.[0])}
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={desabilitado || enviando}
          aria-busy={enviando || undefined}
          aria-describedby={idAjuda}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip aria-hidden />
          {estado.fase === "pronto" ? "Trocar arquivo" : "Escolher arquivo"}
        </Button>
        {estado.fase === "vazio" || estado.fase === "erro" ? (
          <span className="text-xs text-muted-foreground">
            Nenhum arquivo escolhido
          </span>
        ) : null}
      </div>

      <p id={idAjuda} className="text-xs text-muted-foreground">
        Prints e comprovantes do problema. PNG, JPG, WEBP ou PDF, até{" "}
        {tamanhoLegivel(ANEXO_TAMANHO_MAXIMO)}.{" "}
        <span className="font-medium text-foreground">
          Documentos do seu cliente (contrato, RG) continuam na sua pasta do
          Drive.
        </span>
      </p>

      {/* Região viva SEMPRE montada: uma que nasce junto com o texto não é
          anunciada por parte dos leitores de tela. */}
      <div id={idStatus} aria-live="polite" className="grid gap-2 empty:hidden">
        {enviando ? (
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">
              Enviando {estado.nome}…
            </p>
            {/* Barra indeterminada: o SDK não reporta progresso, e uma barra
                determinada mentiria sobre quanto falta. */}
            <div
              role="progressbar"
              aria-label="Enviando anexo"
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full w-full animate-pulse bg-primary motion-reduce:animate-none" />
            </div>
          </div>
        ) : null}

        {estado.fase === "pronto" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
            <Paperclip aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs">
              {estado.anexo.nome}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {tamanhoLegivel(estado.anexo.tamanho)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={limpar}
              disabled={desabilitado}
            >
              <X aria-hidden /> Remover anexo
            </Button>
          </div>
        ) : null}

        {estado.fase === "erro" ? (
          <p role="alert" className="text-sm text-destructive">
            {estado.mensagem}
          </p>
        ) : null}
      </div>
    </div>
  );
}
