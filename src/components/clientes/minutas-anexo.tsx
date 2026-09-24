"use client";

/**
 * **Minutas** do cliente — histórico de versões do contrato em elaboração
 * (Word exportado em PDF pelo aluno), anexadas na ficha, perto do "Contrato
 * assinado".
 *
 * Molde literal de `contrato-anexo.tsx` (auditado 3×), com diferenças de
 * forma: (1) contrato é **1 arquivo que se substitui**, minuta é **N arquivos
 * que se acumulam** — cada envio é uma versão nova; as anteriores continuam
 * na lista, com data; (2) minuta pede **contexto por versão** — 3 campos na
 * 1ª (caso, o que foi feito, ponto de ajuda) e 1 campo nas seguintes (o que
 * foi alterado) — pedido da equipe (17/09), para quem lê a minuta sem ter
 * acompanhado a conversa entender o que está vendo.
 *
 * **Só PDF.** O aluno já exportou o Word antes de chegar aqui — não é este
 * componente que converte nem compara documentos.
 *
 * 🔑 **Quem preenche o contexto:** tanto o aluno quanto a EQUIPE anexam pelo
 * MESMO formulário (decisão do Marcio, 17/09) — não há um formulário
 * "reduzido" para o admin. `podeAnexar` decide só SE a pessoa pode anexar,
 * nunca QUAL formulário ela vê.
 *
 * 🔑 **"Uma minuta por vez" é ORIENTAÇÃO, não trava.** O texto de apoio
 * abaixo do título orienta a anexar, descrever, e só então partir para a
 * próxima — mas nada no sistema impede o próximo envio. Por isso a segunda
 * frase deixa isso explícito: dizer só "uma por vez" faria a tela parecer
 * mais restritiva do que é.
 *
 * 🔴 **Ramo pela CONTAGEM da lista, nunca por estado local.** `primeira =
 * minutas.length === 0` — a lista vem do servidor e `aoMudar()` já dispara
 * `router.refresh()`. Guardar "já enviei uma" em `useState` seria uma
 * segunda verdade, que trava se o `refresh()` atrasar.
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
import { Download, Eye, FileText, Paperclip, Trash2 } from "lucide-react";
import type { ClienteMinuta } from "@/lib/minutas-tipos";
import {
  MINUTA_TAMANHO_MAXIMO,
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
import { VisorDocumento } from "@/components/clientes/visor-documento";

/** Teto por campo de contexto — decisão do Marcio (17/09). Independente de
 * `MINUTA_NOTA_MAXIMO` (o campo `notas` legado, que saiu do formulário mas
 * continua sendo lido na leitura — ver o `<li>` da lista abaixo). */
const CONTEXTO_MAXIMO = 2000;

/** Um campo de contexto controlado por este formulário. */
type CampoContexto = "caso" | "oQueFoiFeito" | "pontoDeAjuda" | "oQueMudou";

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
  contextoObrigatorio,
  desabilitado = false,
  aoMudar,
}: {
  clienteId: string;
  /** Histórico completo, mais recente primeiro. `[]` = nenhuma minuta ainda. */
  minutas: ClienteMinuta[];
  /** Quem pode enviar uma versão nova — aluno OU equipe. Desde 17/09 os dois
   * preenchem o MESMO formulário; esta prop só decide se a pessoa anexa,
   * nunca qual formulário aparece. */
  podeAnexar: boolean;
  /** Interruptor `minuta_contexto_obrigatorio`, lido no servidor. Desligado:
   * os campos continuam visíveis e rotulados, só sem "(obrigatório)" e sem
   * travar o botão — é emergência, não mudança de produto. */
  contextoObrigatorio: boolean;
  desabilitado?: boolean;
  /** Chamado depois de gravar/remover — a ficha recarrega do servidor. */
  aoMudar: () => void;
}) {
  const uid = useId();
  const idCampo = `${uid}-minuta`;
  const idAjuda = `${uid}-minuta-ajuda`;
  const idCaso = `${uid}-minuta-caso`;
  const idOQueFoiFeito = `${uid}-minuta-o-que-foi-feito`;
  const idPontoDeAjuda = `${uid}-minuta-ponto-de-ajuda`;
  const idOQueMudou = `${uid}-minuta-o-que-mudou`;
  const inputRef = useRef<HTMLInputElement>(null);

  // 🔴 Ramo pela CONTAGEM da lista vinda do servidor, nunca por estado local
  // (ver o comentário de topo do arquivo).
  const primeira = minutas.length === 0;

  const [caso, setCaso] = useState("");
  const [oQueFoiFeito, setOQueFoiFeito] = useState("");
  const [pontoDeAjuda, setPontoDeAjuda] = useState("");
  const [oQueMudou, setOQueMudou] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [visualizandoId, setVisualizandoId] = useState<string | null>(null);
  const [baixandoId, iniciarDownload] = useTransition();
  const [removendoAgora, iniciarRemocao] = useTransition();

  const ocupado = desabilitado || enviando !== null;
  const removendoMinuta = minutas.find((m) => m.id === removendoId) ?? null;

  const valores: Record<CampoContexto, string> = {
    caso,
    oQueFoiFeito,
    pontoDeAjuda,
    oQueMudou,
  };
  const excedido = (campo: CampoContexto) =>
    valores[campo].trim().length > CONTEXTO_MAXIMO;

  // Os campos exigidos por versão: os 3 da 1ª minuta, ou só o delta a partir
  // da 2ª (decisões 1 e 2 do Marcio).
  const camposObrigatorios: CampoContexto[] = primeira
    ? ["caso", "oQueFoiFeito", "pontoDeAjuda"]
    : ["oQueMudou"];

  const faltaObrigatorio =
    contextoObrigatorio &&
    camposObrigatorios.some((campo) => valores[campo].trim().length === 0);
  const algumExcedido = (Object.keys(valores) as CampoContexto[]).some(excedido);
  const botaoDesabilitado = ocupado || faltaObrigatorio || algumExcedido;

  async function aoEscolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    if (inputRef.current) inputRef.current.value = "";

    // As perguntas que não precisam de rede. Não são a fronteira: o bucket
    // tem teto e allowlist, e a RPC confere o metadata do objeto e o
    // contexto obrigatório de novo (Server Action é endpoint HTTP).
    if (!ehMinutaMime(arquivo.type)) {
      setErro("Formato não aceito. Envie um PDF.");
      return;
    }
    if (arquivo.size < 1 || arquivo.size > MINUTA_TAMANHO_MAXIMO) {
      setErro(`Arquivo maior que ${minutaTamanhoLegivel(MINUTA_TAMANHO_MAXIMO)}.`);
      return;
    }
    if (algumExcedido) {
      setErro(`Cada campo pode ter até ${CONTEXTO_MAXIMO} caracteres.`);
      return;
    }
    if (faltaObrigatorio) {
      setErro("Preencha os campos acima para anexar.");
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
      caso: primeira ? caso.trim() || null : null,
      oQueFoiFeito: primeira ? oQueFoiFeito.trim() || null : null,
      pontoDeAjuda: primeira ? pontoDeAjuda.trim() || null : null,
      oQueMudou: primeira ? null : oQueMudou.trim() || null,
    });
    setEnviando(null);
    if (registro.erro) {
      setErro(registro.erro);
      return;
    }
    setCaso("");
    setOQueFoiFeito("");
    setPontoDeAjuda("");
    setOQueMudou("");
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
      {/* A instrução do vermelho + a orientação "uma por vez" — ORIENTAÇÃO,
          o sistema não valida nem compara nada e nada bloqueia o próximo
          envio. Ficam no corpo da tela, ANTES do botão de anexar. Peso
          rebaixado (2026-09-23, pedido do Marcio): é observação, não aviso. */}
      <p className="text-xs leading-snug text-muted-foreground">
        Deixe em <strong>vermelho</strong> o que mudou em relação à minuta
        anterior. Envie <strong>uma minuta por vez</strong>.
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

      {/* Campos de contexto — ACIMA do botão de anexar de propósito: o
          upload dispara no `onChange` do input, imediatamente ao escolher o
          arquivo. Se os campos ficassem abaixo, o parceiro subiria o PDF e
          só então levaria a recusa. */}
      {podeAnexar ? (
        <div className="grid gap-3">
          {primeira ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor={idCaso}>
                  Descreva o caso
                  {contextoObrigatorio ? " (obrigatório)" : ""}
                </Label>
                <Textarea
                  id={idCaso}
                  value={caso}
                  onChange={(e) => setCaso(e.target.value)}
                  disabled={ocupado}
                  rows={3}
                  aria-invalid={excedido("caso") || undefined}
                  aria-describedby={
                    excedido("caso") ? `${idCaso}-erro` : undefined
                  }
                />
                {excedido("caso") ? (
                  <p id={`${idCaso}-erro`} className="corpo-sm text-destructive">
                    Até {CONTEXTO_MAXIMO} caracteres ({caso.trim().length}{" "}
                    digitados).
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={idOQueFoiFeito}>
                  O que foi feito
                  {contextoObrigatorio ? " (obrigatório)" : ""}
                </Label>
                <Textarea
                  id={idOQueFoiFeito}
                  value={oQueFoiFeito}
                  onChange={(e) => setOQueFoiFeito(e.target.value)}
                  disabled={ocupado}
                  rows={3}
                  aria-invalid={excedido("oQueFoiFeito") || undefined}
                  aria-describedby={
                    excedido("oQueFoiFeito")
                      ? `${idOQueFoiFeito}-erro`
                      : undefined
                  }
                />
                {excedido("oQueFoiFeito") ? (
                  <p
                    id={`${idOQueFoiFeito}-erro`}
                    className="corpo-sm text-destructive"
                  >
                    Até {CONTEXTO_MAXIMO} caracteres (
                    {oQueFoiFeito.trim().length} digitados).
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={idPontoDeAjuda}>
                  Qual o primeiro ponto que você precisa de ajuda
                  {contextoObrigatorio ? " (obrigatório)" : ""}
                </Label>
                <Textarea
                  id={idPontoDeAjuda}
                  value={pontoDeAjuda}
                  onChange={(e) => setPontoDeAjuda(e.target.value)}
                  disabled={ocupado}
                  rows={2}
                  aria-invalid={excedido("pontoDeAjuda") || undefined}
                  aria-describedby={
                    excedido("pontoDeAjuda")
                      ? `${idPontoDeAjuda}-erro`
                      : undefined
                  }
                />
                {excedido("pontoDeAjuda") ? (
                  <p
                    id={`${idPontoDeAjuda}-erro`}
                    className="corpo-sm text-destructive"
                  >
                    Até {CONTEXTO_MAXIMO} caracteres (
                    {pontoDeAjuda.trim().length} digitados).
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor={idOQueMudou}>
                O que foi alterado em relação à minuta anterior
                {contextoObrigatorio ? " (obrigatório)" : ""}
              </Label>
              <Textarea
                id={idOQueMudou}
                value={oQueMudou}
                onChange={(e) => setOQueMudou(e.target.value)}
                disabled={ocupado}
                rows={3}
                aria-invalid={excedido("oQueMudou") || undefined}
                aria-describedby={
                  excedido("oQueMudou") ? `${idOQueMudou}-erro` : undefined
                }
              />
              {excedido("oQueMudou") ? (
                <p id={`${idOQueMudou}-erro`} className="corpo-sm text-destructive">
                  Até {CONTEXTO_MAXIMO} caracteres ({oQueMudou.trim().length}{" "}
                  digitados).
                </p>
              ) : null}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={botaoDesabilitado}
              aria-busy={enviando !== null || undefined}
              aria-describedby={idAjuda}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip aria-hidden />{" "}
              {minutas.length > 0 ? "Enviar nova versão" : "Escolher arquivo"}
            </Button>
            {faltaObrigatorio ? (
              <span className="corpo-sm text-muted-foreground">
                Preencha os campos acima para anexar.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <p id={idAjuda} className="corpo-sm text-muted-foreground">
        Só PDF, até {minutaTamanhoLegivel(MINUTA_TAMANHO_MAXIMO)}. Cada envio
        vira uma versão nova no histórico — as anteriores continuam listadas,
        com data.
      </p>

      {minutas.length > 0 ? (
        <ul className="grid gap-1.5">
          {minutas.map((minuta, indice) => {
            // "Versão N" — derivado do ÍNDICE na leitura, nunca coluna no
            // banco (a lista vem mais recente primeiro; a mais antiga é a
            // Versão 1). Ajuda a equipe a casar o delta com o PDF certo.
            const versao = minutas.length - indice;
            return (
              <li
                key={minuta.id}
                className="grid gap-1.5 rounded-lg bg-superficie-afundada px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <FileText
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="shrink-0 corpo-sm text-muted-foreground">
                    Versão {versao}
                  </span>
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
                    disabled={removendoAgora}
                    aria-pressed={visualizandoId === minuta.id}
                    aria-label={`Pré-visualizar minuta de ${formatarDataHora(minuta.enviado_em)}`}
                    onClick={() =>
                      setVisualizandoId(
                        visualizandoId === minuta.id ? null : minuta.id,
                      )
                    }
                  >
                    <Eye aria-hidden />{" "}
                    {visualizandoId === minuta.id ? "Fechar" : "Pré-visualizar"}
                  </Button>
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

                {/* Leitura densa e chapada: rótulo pequeno em
                    text-muted-foreground, valor abaixo — hierarquia por
                    POSIÇÃO, sem card por campo nem ícone decorativo. */}
                {minuta.caso ? (
                  <div className="grid gap-1">
                    <p className="corpo-sm text-muted-foreground">
                      Descreva o caso
                    </p>
                    <p className="corpo-sm whitespace-pre-wrap">{minuta.caso}</p>
                  </div>
                ) : null}
                {minuta.o_que_foi_feito ? (
                  <div className="grid gap-1">
                    <p className="corpo-sm text-muted-foreground">
                      O que foi feito
                    </p>
                    <p className="corpo-sm whitespace-pre-wrap">
                      {minuta.o_que_foi_feito}
                    </p>
                  </div>
                ) : null}
                {minuta.ponto_de_ajuda ? (
                  <div className="grid gap-1">
                    <p className="corpo-sm text-muted-foreground">
                      Qual o primeiro ponto que você precisa de ajuda
                    </p>
                    <p className="corpo-sm whitespace-pre-wrap">
                      {minuta.ponto_de_ajuda}
                    </p>
                  </div>
                ) : null}
                {minuta.o_que_mudou ? (
                  <div className="grid gap-1">
                    <p className="corpo-sm text-muted-foreground">
                      Alterado nesta versão
                    </p>
                    <p className="corpo-sm whitespace-pre-wrap">
                      {minuta.o_que_mudou}
                    </p>
                  </div>
                ) : null}
                {minuta.notas ? (
                  <div className="grid gap-1">
                    <p className="corpo-sm text-muted-foreground">Notas</p>
                    <p className="corpo-sm whitespace-pre-wrap">{minuta.notas}</p>
                  </div>
                ) : null}

                {visualizandoId === minuta.id ? (
                  <VisorDocumento
                    src={`/clientes/${clienteId}/documento/minuta/${minuta.id}`}
                    tipo="pdf"
                    titulo={minuta.nome}
                    onFechar={() => setVisualizandoId(null)}
                    onBaixar={() => baixar(minuta)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Nenhuma minuta enviada ainda.
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
