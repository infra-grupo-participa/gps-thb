"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { expurgarAnexo } from "@/app/admin/chamados/actions";
import {
  ANEXO_RETENCAO_DIAS,
  type AnexoParaExpurgo,
} from "@/lib/chamados-tipos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Expurgo dos anexos vencidos — **um botão, não um cron** (B6).
 *
 * 🔴 Apagar a linha de `storage.objects` por SQL NÃO apaga o arquivo no object
 * store: um cron SQL reportaria sucesso e deixaria os bytes. O delete real
 * exige a Storage API, que exige uma sessão — e o GPS não usa `service_role`.
 * A sessão do admin no navegador é a única credencial legítima disponível.
 *
 * 🔑 Um `expurgarAnexo` por item, EM SÉRIE. A action apaga o arquivo e só
 * então carimba a mensagem (nessa ordem: carimbar antes e falhar o delete
 * deixaria o arquivo vivo com a tela dizendo que sumiu). Em série porque cada
 * item é uma escrita no object store e um `Promise.all` de dezenas de deletes
 * simultâneos é a receita para metade falhar por rate limit — e aqui falha
 * pela metade significa arquivo apagado sem carimbo.
 *
 * O contador do resultado NÃO some: ele é a única prova de que a rotina rodou
 * e de quantos ficaram para trás.
 */
export function ChamadosRetencao({ itens }: { itens: AnexoParaExpurgo[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<
    { expurgados: number; falhas: number } | null
  >(null);
  const [pendente, startTransition] = useTransition();

  const porRetencao = itens.filter((i) => i.motivo === "retencao").length;
  const orfaos = itens.filter((i) => i.motivo === "orfao").length;

  function expurgar() {
    setResultado(null);
    startTransition(async () => {
      let expurgados = 0;
      let falhas = 0;
      for (const item of itens) {
        const r = await expurgarAnexo({
          path: item.path,
          mensagemId: item.mensagemId,
        });
        if (r.ok) expurgados += 1;
        else falhas += 1;
      }
      setResultado({ expurgados, falhas });
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Retenção de anexos ({ANEXO_RETENCAO_DIAS} dias)
        </CardTitle>
        <CardDescription>
          {porRetencao} anexo(s) de chamados fechados há mais de{" "}
          {ANEXO_RETENCAO_DIAS} dias e {orfaos} arquivo(s) sem mensagem.
          Expurgar apaga o arquivo definitivamente; a conversa continua no
          histórico.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada a expurgar agora. Esta lista é lida do banco a cada carga da
            página — vazia aqui significa vazia lá, não que a rotina falhou.
          </p>
        ) : (
          <div>
            <Dialog open={aberto} onOpenChange={setAberto}>
              <DialogTrigger
                render={<Button type="button" variant="destructive" />}
              >
                <Trash2 aria-hidden /> Expurgar {itens.length} arquivo(s)
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Expurgar {itens.length} arquivo(s)?</DialogTitle>
                  <DialogDescription>
                    Os arquivos são apagados definitivamente do armazenamento e
                    não há como desfazer. A conversa continua no histórico, com
                    o nome do arquivo e a data da remoção.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-wrap justify-end gap-2">
                  <DialogClose render={<Button type="button" variant="ghost" />}>
                    Cancelar
                  </DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={expurgar}
                    disabled={pendente}
                    aria-busy={pendente || undefined}
                  >
                    {pendente ? "Expurgando…" : "Expurgar agora"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Região viva sempre montada — e o resultado FICA na tela. */}
        <p aria-live="polite" className="text-sm empty:hidden">
          {resultado ? (
            <span
              className={
                resultado.falhas > 0 ? "text-destructive" : "text-foreground"
              }
            >
              {resultado.expurgados} expurgado(s), {resultado.falhas} falha(s).
              {resultado.falhas > 0
                ? " Rode de novo: o que falhou continua na lista, e o log do servidor diz o motivo."
                : null}
            </span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}
