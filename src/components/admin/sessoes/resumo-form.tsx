"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

const RESUMO_MINIMO = 10;
const RESUMO_MAXIMO = 4000;

/**
 * Campo de resumo com contador — usado nos dois pontos da fatia F:
 * "concluir com resumo" (opcional) e "editar resumo" (obrigatório, 10..4000).
 *
 * A validação de tamanho aqui é cortesia de tela; quem recusa de fato é a
 * RPC (`gps.sessao_concluir` / `gps.sessao_resumo_editar`, ambas com o
 * mesmo CHECK 10..4000 quando o texto existe). Este componente não decide
 * "resumo é opcional aqui, obrigatório ali" — quem chama passa `obrigatorio`
 * e a mensagem certa para o caso.
 */
export function ResumoForm({
  valorInicial = "",
  obrigatorio,
  rotuloBotao,
  rotuloBotaoEnviando,
  onEnviar,
  onCancelar,
  enviando,
  erro,
}: {
  valorInicial?: string;
  /** `true` na edição (10..4000 sempre); `false` ao concluir (vazio = sem resumo). */
  obrigatorio: boolean;
  rotuloBotao: string;
  rotuloBotaoEnviando: string;
  onEnviar: (resumo: string) => void;
  onCancelar: () => void;
  enviando: boolean;
  erro?: string | null;
}) {
  const [texto, setTexto] = useState(valorInicial);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const tamanho = texto.trim().length;
  const invalido =
    obrigatorio
      ? tamanho < RESUMO_MINIMO || tamanho > RESUMO_MAXIMO
      : tamanho > 0 && (tamanho < RESUMO_MINIMO || tamanho > RESUMO_MAXIMO);

  function enviar() {
    setErroLocal(null);
    if (obrigatorio && tamanho < RESUMO_MINIMO) {
      setErroLocal(`O resumo precisa de ao menos ${RESUMO_MINIMO} caracteres.`);
      return;
    }
    if (tamanho > RESUMO_MAXIMO) {
      setErroLocal(`O resumo passa de ${RESUMO_MAXIMO} caracteres.`);
      return;
    }
    if (!obrigatorio && tamanho > 0 && tamanho < RESUMO_MINIMO) {
      setErroLocal(`O resumo precisa de ao menos ${RESUMO_MINIMO} caracteres, ou deixe em branco.`);
      return;
    }
    onEnviar(texto.trim());
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1">
        <span className="rotulo text-muted-foreground">
          Resumo da sessão{obrigatorio ? "" : " (opcional)"} — {RESUMO_MINIMO} a{" "}
          {RESUMO_MAXIMO} caracteres. O aluno não vê este texto.
        </span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={RESUMO_MAXIMO}
          rows={5}
          aria-invalid={invalido || undefined}
          className="w-full rounded-md border border-borda-forte bg-card px-2 py-1.5 corpo-sm focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span className="corpo-sm text-muted-foreground">
          {tamanho}/{RESUMO_MAXIMO}
        </span>
      </label>

      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erroLocal ?? erro}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onCancelar} disabled={enviando}>
          Voltar
        </Button>
        <Button size="sm" onClick={enviar} disabled={enviando} aria-busy={enviando || undefined}>
          {enviando ? rotuloBotaoEnviando : rotuloBotao}
        </Button>
      </div>
    </div>
  );
}
