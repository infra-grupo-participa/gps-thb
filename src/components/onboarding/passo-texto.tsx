"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PERGUNTA_AJUDA } from "./tipos";

/** Teto que o CHECK da coluna também aplica no banco. */
export const MAX_TEXTO = 4000;

/**
 * Passos 5 e 6 — as duas perguntas abertas do João.
 *
 * 🔑 São **opcionais**, e o texto embaixo do campo diz isso. Campo aberto
 * obrigatório num questionário de entrada é o jeito mais rápido de fazer a
 * pessoa escrever "-" para poder avançar — e "-" é pior do que vazio, porque
 * vazio a equipe sabe ler.
 *
 * 🔑 A frase de ajuda do passo 5 muda com a resposta do passo 2: quem já tem o
 * cliente é perguntado sobre a execução; quem vem da captação é perguntado
 * sobre onde está hoje. A mesma pergunta, feita para a pessoa certa.
 *
 * 🔴 Este texto pode conter dado de terceiro (o caso do cliente do aluno). Ele
 * é visível para o próprio aluno e para o admin — nunca para o sócio, nunca no
 * Slack, nunca no dashboard.
 */
export function PassoTexto({
  valor,
  setValor,
}: {
  valor: string;
  setValor: (v: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="onb-texto" className="font-heading titulo-h2">
        {PERGUNTA_AJUDA}
      </Label>
      <p className="corpo-sm text-muted-foreground">
        Vale dúvida, trava, ou o que você quer resolver primeiro.
      </p>
      <Textarea
        id="onb-texto"
        rows={6}
        maxLength={MAX_TEXTO}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
      />
      <p className="corpo-sm text-muted-foreground">
        Opcional. {valor.length} de {MAX_TEXTO} caracteres.
      </p>
    </div>
  );
}
