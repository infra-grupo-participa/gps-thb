"use client";

import { useId, useState, useTransition } from "react";
import { AlertTriangle, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  definirChamadosAbertos,
  definirEmailEquipeChamados,
} from "@/app/admin/chamados/actions";
import { Badge } from "@/components/ui/badge";
import { BADGE_ATENCAO } from "@/components/chamados/badges";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Configuração do canal de suporte — editável pela equipe, sem deploy
 * (`gps.config`).
 *
 * 🔴 O aviso de lista de e-mails vazia é a peça mais importante desta tela.
 * Sem endereço configurado o canal FUNCIONA e ninguém atende: o aluno abre o
 * chamado, a action registra `console.error` e a tela do admin fica igual à de
 * um dia sem chamado nenhum. Falha silenciosa é o modo de falha proibido aqui,
 * então o vazio aparece em destaque, não em cinza.
 */
export function ChamadosConfig({
  aberto,
  emailEquipe,
}: {
  aberto: boolean;
  emailEquipe: string[];
}) {
  const uid = useId();
  const idEmails = `${uid}-emails`;
  const idAjuda = `${uid}-emails-ajuda`;

  const [lista, setLista] = useState(emailEquipe.join(", "));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const semDestinatario = emailEquipe.length === 0;

  function alternar() {
    setErro(null);
    startTransition(async () => {
      const r = await definirChamadosAbertos(!aberto);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      toast.success(
        aberto
          ? "Suporte fechado para novos chamados."
          : "Suporte aberto para novos chamados.",
      );
    });
  }

  function salvarEmails() {
    setErro(null);
    startTransition(async () => {
      const r = await definirEmailEquipeChamados(lista);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      toast.success("Lista de avisos salva.");
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entrada do suporte</CardTitle>
          <CardDescription>
            Fechar impede o aluno de abrir e de responder chamados. A equipe
            continua respondendo e fechando os que existem.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge
            variant={aberto ? "outline" : "secondary"}
            className={cn(aberto && BADGE_ATENCAO)}
          >
            {aberto ? (
              <Unlock aria-hidden />
            ) : (
              <Lock aria-hidden />
            )}
            {aberto ? "Suporte aberto" : "Suporte fechado"}
          </Badge>
          <Button
            type="button"
            variant="outline"
            onClick={alternar}
            disabled={pendente}
            aria-busy={pendente || undefined}
          >
            {aberto ? "Fechar entrada" : "Reabrir entrada"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Quem recebe aviso de chamado novo
          </CardTitle>
          <CardDescription>
            Separe por vírgula. No máximo 10 endereços — avisar o time inteiro
            treina o time a ignorar o aviso. O e-mail leva só o assunto e um
            botão para o portal, nunca o texto da mensagem.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {semDestinatario ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              Ninguém recebe e-mail quando um aluno abre chamado. Informe os
              endereços da equipe abaixo.
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={idEmails}>E-mails da equipe</Label>
            <Input
              id={idEmails}
              type="text"
              inputMode="email"
              value={lista}
              onChange={(e) => setLista(e.target.value)}
              placeholder="suporte@exemplo.com, fulano@exemplo.com"
              autoComplete="off"
              aria-describedby={idAjuda}
              aria-invalid={erro ? true : undefined}
            />
            <p id={idAjuda} className="text-xs text-muted-foreground">
              Endereço inválido não é descartado em silêncio: a gravação é
              recusada e a tela diz qual é.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p role="alert" className="mr-auto text-sm text-destructive">
              {erro}
            </p>
            <Button
              type="button"
              onClick={salvarEmails}
              disabled={pendente}
              aria-busy={pendente || undefined}
            >
              {pendente ? "Salvando…" : "Salvar lista"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
