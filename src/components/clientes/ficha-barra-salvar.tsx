"use client";

/**
 * A BARRA DE SALVAR da ficha — `sticky bottom-0`, fora das abas.
 *
 * 🔑 Fica FORA da pasta de propósito: o corpo de cada folha tem borda e fundo
 * próprios, e a barra vale para a ficha inteira, não para a folha aberta.
 * Dentro de uma `TabsContent` ela sumiria ao trocar de aba — justamente quando
 * a pessoa mais precisa saber que deixou algo por salvar.
 *
 * ⚠️ Herança do desenho anterior, que continua valendo: a barra **não pode
 * morar dentro de um `Card`** — o `Card` é `overflow-hidden` e recortaria
 * qualquer coisa grudada nele.
 *
 * 🔴 **O aviso NOMEIA a folha** (`frasePendenciaDaFicha`). Com quatro folhas,
 * "você tem alterações não salvas nesta ficha" não diz ONDE: a pessoa altera o
 * DISC, vai ao Fechamento e teria de abrir as quatro para achar. E é
 * `aria-live="polite"` porque quem não vê a barra precisa OUVIR — e agora
 * ouve em qual folha.
 */

import { Button } from "@/components/ui/button";

export function FichaBarraSalvar({
  erroSalvar,
  aviso,
  pending,
  onSalvar,
}: {
  /** Por que a ficha recusou salvar — a frase EXATA da action ou da guarda. */
  erroSalvar: string | null;
  /** O aviso de estado, já montado (`frasePendenciaDaFicha`). */
  aviso: string;
  pending: boolean;
  onSalvar: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-(--shadow-raised)">
      {erroSalvar ? (
        // `role="alert"` e não `aria-live`: a recusa do salvar interrompe, o
        // estado de pendência não. E não some sozinha em 4 segundos, que é a
        // razão de não ser um toast — a frase traduzida do banco é a única
        // pista do que aconteceu.
        <p role="alert" className="mr-auto corpo-sm text-destructive">
          {erroSalvar}
        </p>
      ) : (
        <p aria-live="polite" className="mr-auto corpo-sm text-muted-foreground">
          {aviso}
        </p>
      )}
      {/* O botão NUNCA é desabilitado por "há alteração": se a comparação
          errar por um campo, o aluno fica preso sem conseguir salvar a ficha.
          🔴 E deixou de ser desabilitado por `faltaEssencial` (24/09/2026):
          com quatro folhas, um botão morto na folha 4 por causa de um campo da
          folha 1 não tem como ser entendido. Agora ele CLICA, a guarda em
          `salvar()` recusa, a barra diz o motivo **e a ficha puxa a pessoa
          para o campo**. */}
      <Button onClick={onSalvar} disabled={pending}>
        {pending ? "Salvando..." : "Salvar ficha"}
      </Button>
    </div>
  );
}
