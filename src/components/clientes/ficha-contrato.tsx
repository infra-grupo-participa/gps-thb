"use client";

/**
 * A seção "Contrato" da ficha do cliente: honorários contratados e o
 * **contrato assinado** (anexo, migração ...214).
 *
 * 🔴 O "Link do contrato" (`contrato_url`) SAIU da visão principal — é LEGADO.
 * O campo só reaparece, num bloco recolhido, para quem JÁ tem um link gravado:
 * esconder um dado que a pessoa digitou seria perdê-lo em silêncio. Ficha nova
 * nunca mostra o campo, e a prova passa a ser o arquivo.
 *
 * Saiu de `cliente-ficha.tsx` sem uma linha de lógica nova: a ficha passou de
 * 628 para 774 linhas ao ganhar grau de relação e a trava do favorito, e este
 * bloco é o maior pedaço PURAMENTE de apresentação dela — recebe valor, devolve
 * mudança, não conhece action nenhuma. Quem valida, normaliza e salva continua
 * sendo a ficha (e, de verdade, os CHECKs da migração ...090).
 *
 * 🔑 Três regras herdadas, que continuam valendo aqui:
 *
 * 1. **O valor NÃO some quando a fase volta** (B9-b): fora de "Contratado" ele
 *    vira leitura com o aviso de que saiu da meta. Esconder dado que o aluno
 *    digitou é perdê-lo em silêncio.
 * 2. **`null` nunca vira R$ 0,00.** "Não informado" é o texto.
 * 3. **O rótulo do link não AFIRMA "Drive"** (UX2): o CHECK do banco exige só
 *    `https://` — pode ser Dropbox, OneDrive ou o site do cartório. A ajuda
 *    sugere; o botão não promete.
 */

import { ExternalLink } from "lucide-react";
import { FileSignature } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Secao } from "@/components/ui/secao";
import { mascaraMoeda, numeroParaMoeda } from "@/lib/masks";
import {
  ContratoAnexo,
  type ContratoDoCliente,
} from "@/components/clientes/contrato-anexo";

function LinkDoContrato({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-accent-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Abrir contrato
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}

export function FichaContrato({
  contratado,
  honorarios,
  onHonorarios,
  honorariosValor,
  contratoUrl,
  onContratoUrl,
  contratoLimpo,
  contratoInvalido,
  faseRotulo,
  metaFormatada,
  clienteId,
  contratoAnexo,
  podeAnexar,
  anexoDesabilitado = false,
  aoMudarAnexo,
}: {
  /** `fase === "contratado"` — só aí os campos são editáveis. */
  contratado: boolean;
  /** Valor mascarado ("R$ 1.234,56") em edição. */
  honorarios: string;
  onHonorarios: (v: string) => void;
  /** O número por trás da máscara — `null` quando não informado. */
  honorariosValor: number | null;
  contratoUrl: string;
  onContratoUrl: (v: string) => void;
  /** `contratoUrl.trim()` — o que de fato vai ao banco. */
  contratoLimpo: string;
  contratoInvalido: boolean;
  /** Rótulo da fase atual, para o aviso de "fora da meta". */
  faseRotulo: string | undefined;
  /** `META_HONORARIOS` já formatada — a ficha calcula uma vez só. */
  metaFormatada: string;
  clienteId: string;
  /** O anexo já gravado, ou `null`. Ver `ContratoAnexo`. */
  contratoAnexo: ContratoDoCliente | null;
  /** Só o aluno anexa; a equipe baixa e remove. */
  podeAnexar: boolean;
  anexoDesabilitado?: boolean;
  aoMudarAnexo: () => void;
}) {
  // O anexo aparece SEMPRE, em qualquer fase: quem chega ao programa com o caso
  // já contratado precisa mandar a prova antes de ter mexido na fase, e o
  // arquivo é o que sustenta o sinal da equipe. Só os HONORÁRIOS seguem presos
  // a "Contratado" (é a regra da meta, B8).
  const anexo = (
    <ContratoAnexo
      clienteId={clienteId}
      contrato={contratoAnexo}
      podeAnexar={podeAnexar}
      desabilitado={anexoDesabilitado}
      aoMudar={aoMudarAnexo}
    />
  );

  /** O link antigo, só para quem já tem um gravado. */
  const legado =
    contratoLimpo || contratoInvalido ? (
      <details className="rounded-lg border border-borda-fina bg-superficie-afundada p-3">
        <summary className="cursor-pointer corpo-sm font-medium">
          Link do contrato (registro antigo)
        </summary>
        <div className="mt-3 grid gap-2">
          <Label htmlFor="f-contrato">Link do contrato</Label>
          <Input
            id="f-contrato"
            type="url"
            inputMode="url"
            value={contratoUrl}
            onChange={(e) => onContratoUrl(e.target.value)}
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
            Endereço do arquivo na sua pasta, guardado antes de o portal passar
            a receber o contrato assinado. Continua valendo; a prova que a
            equipe lê é o arquivo anexado acima. Apague o campo para removê-lo.
          </p>
          {contratoInvalido ? (
            <p
              id="f-contrato-erro"
              className="text-xs leading-snug font-medium text-destructive"
            >
              O link precisa começar com https:// e não pode conter espaços.
            </p>
          ) : null}
          {!contratoInvalido && contratoLimpo ? (
            <LinkDoContrato url={contratoLimpo} />
          ) : null}
        </div>
      </details>
    ) : null;

  return (
    <Secao
      icone={<FileSignature />}
      titulo="Contrato"
      nivel="h3"
      classeConteudo="grid gap-5"
    >
      {anexo}

      {contratado ? (
        <div className="grid gap-2 sm:max-w-sm">
          <Label htmlFor="f-honorarios">Honorários contratados</Label>
          <Input
            id="f-honorarios"
            inputMode="numeric"
            value={honorarios}
            onChange={(e) => onHonorarios(mascaraMoeda(e.target.value))}
            placeholder="R$ 0,00"
            aria-describedby="f-honorarios-ajuda"
          />
          <p
            id="f-honorarios-ajuda"
            className="text-xs leading-snug text-muted-foreground"
          >
            Valor contratado com este cliente — não é o que já entrou no caixa.
            Entra na meta de {metaFormatada} do seu ambiente.
          </p>
        </div>
      ) : honorariosValor != null ? (
        // Fora de "Contratado" o valor sobrevive, mas não conta na meta — e
        // isso é ATENÇÃO, não decoração: o token semântico diz o estado.
        <div className="grid gap-1.5 rounded-lg bg-atencao p-3 text-atencao-foreground">
          <p className="text-sm">
            Honorários registrados:{" "}
            <strong className="tabular-nums">
              {numeroParaMoeda(honorariosValor) || "não informado"}
            </strong>{" "}
            — não contam na meta enquanto o cliente estiver em{" "}
            {faseRotulo ?? "outra fase"}.
          </p>
          <p className="text-xs">
            Mova o cliente de volta para Contratado para editar e voltar a
            contar na meta. O valor não é apagado.
          </p>
        </div>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Os honorários aparecem aqui quando o cliente entra na fase Contratado.
        </p>
      )}

      {legado}
    </Secao>
  );
}
