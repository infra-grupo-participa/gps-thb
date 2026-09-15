"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { alternarInterruptor } from "@/app/admin/config-actions";
import type { InterruptorComEstado } from "@/lib/config-tipos";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { cn } from "@/lib/utils";

/**
 * Tela de interruptores em `/admin` — uma linha por chave da allowlist
 * (`INTERRUPTORES_CONFIG`). UI densa e chapada, no padrão pedido: rótulo à
 * esquerda, estado à direita, sem card decorativo por item.
 *
 * 🔴 `router.refresh()` é obrigatório aqui, além de `revalidatePath` (que a
 * action já faz). Este componente é CLIENT e recebe `interruptores` por
 * PROP — o `revalidatePath` do servidor invalida o cache da rota, mas o
 * estado que o React já montou (o array recebido na primeira renderização)
 * continua o mesmo até o Next re-renderizar a árvore. Sem `router.refresh()`
 * o admin vê o toast de sucesso com o `Switch` voltando à posição antiga por
 * um instante — e se ele clicar de novo antes do refresh, o 2º clique
 * manda o valor ANTERIOR ao que ele acabou de definir, desfazendo a própria
 * ação. Por isso o estado local (`pendente`/`emAcao`) trava o controle
 * durante a chamada: não é só cosmético, impede o duplo clique de inverter
 * o que já foi salvo.
 */
export function InterruptoresAdmin({
  interruptores,
}: {
  interruptores: InterruptorComEstado[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  /** Chave em voo — só ELA fica desabilitada; as outras linhas continuam livres. */
  const [chaveEmAcao, setChaveEmAcao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Interruptor `perigoso` pendente de confirmação antes de alternar. */
  const [confirmando, setConfirmando] = useState<InterruptorComEstado | null>(
    null,
  );
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null);

  function aplicar(chave: string, ligar: boolean) {
    setErro(null);
    setChaveEmAcao(chave);
    startTransition(async () => {
      const r = await alternarInterruptor(chave, ligar);
      if (!r.ok) {
        setErro(r.erro);
        setErroConfirmacao(r.erro);
        setChaveEmAcao(null);
        return;
      }
      setConfirmando(null);
      setErroConfirmacao(null);
      setChaveEmAcao(null);
      toast.success(ligar ? "Interruptor ligado." : "Interruptor desligado.");
      // Ver o comentário no topo do arquivo: sem isto, o Switch pode voltar
      // ao estado antigo por um instante e o próximo clique inverteria o
      // que acabou de ser salvo.
      router.refresh();
    });
  }

  function alternar(item: InterruptorComEstado, ligar: boolean) {
    // Desligar um interruptor perigoso pede confirmação nomeada — ligar de
    // volta não precisa (o padrão vale para a AÇÃO perigosa, não o estado).
    // `entrada_codigo_ativa` é o caso crítico citado no plano: LIGAR essa é
    // que é o risco (abre o código de acesso do evento), então os dois
    // sentidos pedem confirmação para os itens `perigoso`.
    if (item.perigoso) {
      setErroConfirmacao(null);
      setConfirmando(item);
      return;
    }
    aplicar(item.chave, ligar);
  }

  return (
    <div className="rounded-lg border">
      <ul className="divide-y">
        {interruptores.map((item) => {
          const emAcao = pendente && chaveEmAcao === item.chave;
          return (
            <li
              key={item.chave}
              className="flex items-start justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="corpo font-medium text-foreground">
                    {item.rotulo}
                  </p>
                  {item.perigoso ? (
                    <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                      <AlertTriangle aria-hidden className="size-3" />
                      Perigoso
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 corpo-sm text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    Ao desligar:{" "}
                  </span>
                  {item.descricaoDesligado}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/70">
                  {item.chave}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <span
                  className={cn(
                    "corpo-sm",
                    item.ligado ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.ligado ? "Ligado" : "Desligado"}
                </span>
                <Switch
                  checked={item.ligado}
                  disabled={emAcao}
                  onCheckedChange={(marcado) => alternar(item, marcado)}
                  aria-label={`${item.rotulo} (${item.chave}). Ao desligar: ${item.descricaoDesligado}`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {erro && !confirmando ? (
        <p role="alert" className="border-t px-4 py-3 text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <DialogoConfirmacao
        aberto={confirmando !== null}
        titulo={
          confirmando
            ? `${confirmando.ligado ? "Desligar" : "Ligar"} "${confirmando.rotulo}"?`
            : ""
        }
        consequencia={
          confirmando
            ? confirmando.ligado
              ? confirmando.descricaoDesligado
              : `O interruptor "${confirmando.rotulo}" vai ficar ligado até alguém desligar de novo.`
            : ""
        }
        rotuloConfirmar={confirmando?.ligado ? "Desligar" : "Ligar"}
        rotuloConfirmando={confirmando?.ligado ? "Desligando…" : "Ligando…"}
        confirmando={pendente}
        erro={erroConfirmacao}
        destrutivo={confirmando?.ligado ?? true}
        onConfirmar={() => {
          if (confirmando) aplicar(confirmando.chave, !confirmando.ligado);
        }}
        onCancelar={() => {
          setConfirmando(null);
          setErroConfirmacao(null);
        }}
      />
    </div>
  );
}
