"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmação de ação que APAGA ou que muda o estado de outra pessoa.
 *
 * O padrão veio do `DialogoCancelamento` de `plantao-calendario.tsx`, que era
 * o único lugar do repo a fazer isso direito, e vira componente porque a
 * mesma conversa acontecia (ou deixava de acontecer) em cinco telas: excluir
 * cliente, remover sócio, desfavoritar o cliente da equipe, fechar a entrada
 * do suporte e recusar uma solicitação de acesso.
 *
 * 🔑 Três regras, todas herdadas do diálogo do Plantão:
 *
 * 1. **A `consequencia` diz o que acontece, não "tem certeza?".** "Tem
 *    certeza" transfere a dúvida para quem não tem a informação; a frase aqui
 *    precisa nomear o alvo ("de {nome}") e o efeito ("não dá para desfazer",
 *    "os passos 4 a 8 voltam a ficar travados").
 * 2. **O botão é NOMEADO** ("Excluir cliente", "Remover sócio") — nunca "OK".
 *    Quem lê só o botão precisa saber o que vai acontecer.
 * 3. **O foco volta** para o controle que abriu o diálogo. O `Dialog` do Base
 *    UI já faz isso desde que o gatilho continue montado — por isso quem usa
 *    este componente guarda "o que está sendo confirmado" no estado e NÃO
 *    remove a linha da lista antes da confirmação.
 *
 * O `erro` é anunciado por `aria-live="assertive"`: a falha da action aparece
 * dentro do próprio diálogo, e não só num toast que some.
 */
export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  consequencia,
  rotuloConfirmar,
  rotuloCancelar = "Voltar",
  rotuloConfirmando,
  destrutivo = true,
  confirmando = false,
  erro,
  children,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  /** Linha de contexto no cabeçalho (quem/qual). Opcional. */
  descricao?: React.ReactNode;
  /** O que acontece se confirmar. Obrigatório — é a razão do diálogo existir. */
  consequencia: React.ReactNode;
  rotuloConfirmar: string;
  rotuloCancelar?: string;
  /** Texto do botão enquanto a action roda. Default: "Confirmando…". */
  rotuloConfirmando?: string;
  destrutivo?: boolean;
  confirmando?: boolean;
  erro?: string | null;
  /** Campos extras (ex.: "Motivo (o aluno vê)"). */
  children?: React.ReactNode;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        // Enquanto a action roda, Esc e clique fora não fecham: fechar aqui
        // deixaria o usuário sem o resultado do que ele acabou de mandar fazer.
        if (!v && !confirmando) onCancelar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? (
            <DialogDescription>{descricao}</DialogDescription>
          ) : null}
        </DialogHeader>

        <p className="text-sm">{consequencia}</p>

        {children}

        <p aria-live="assertive" className="text-xs text-destructive empty:hidden">
          {erro}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={confirmando}>
            {rotuloCancelar}
          </Button>
          <Button
            variant={destrutivo ? "destructive" : "default"}
            onClick={onConfirmar}
            disabled={confirmando}
            aria-busy={confirmando || undefined}
          >
            {confirmando
              ? (rotuloConfirmando ?? "Confirmando…")
              : rotuloConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
