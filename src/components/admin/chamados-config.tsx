"use client";

import { useId, useState, useTransition } from "react";
import { AlertTriangle, Info, Lock, Unlock } from "lucide-react";
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
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
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
 *
 * 🔑 PL6 — lista vazia NÃO é sinônimo de ninguém avisado. `avisarEquipe`
 * (`src/app/chamados/actions.ts`) cai na env `EMAIL_SUPORTE`, e `fallbackEnv`
 * diz se ela existe no servidor. São **três** estados, não dois:
 *
 * | lista | `fallbackEnv` | o que a tela diz |
 * |---|---|---|
 * | vazia | `false` | vermelho: **ninguém** recebe e-mail |
 * | vazia | `true`  | neutro: o aviso sai pelo `EMAIL_SUPORTE` do servidor |
 * | cheia | qualquer | nada — a lista na tela já é a resposta |
 *
 * Cravar o vermelho com a env definida seria alarme falso, e alarme falso
 * treina o time a ignorar o alarme verdadeiro. Só o BOOLEANO chega aqui: o
 * endereço de suporte nunca vira prop nem HTML.
 */
export function ChamadosConfig({
  aberto,
  emailEquipe,
  fallbackEnv,
}: {
  aberto: boolean;
  emailEquipe: string[];
  /** `true` = a env `EMAIL_SUPORTE` está definida no servidor. */
  fallbackEnv: boolean;
}) {
  const uid = useId();
  const idEmails = `${uid}-emails`;
  const idAjuda = `${uid}-emails-ajuda`;

  const [lista, setLista] = useState(emailEquipe.join(", "));
  const [erro, setErro] = useState<string | null>(null);
  /** PL12 — confirmação pendente do "Fechar entrada". */
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);
  const [erroFechar, setErroFechar] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  /** Lista vazia E sem `EMAIL_SUPORTE`: o chamado novo não avisa ninguém. */
  const ninguemRecebe = emailEquipe.length === 0 && !fallbackEnv;
  /** Lista vazia, mas a env cobre: é lacuna de cadastro, não canal quebrado. */
  const soPeloServidor = emailEquipe.length === 0 && fallbackEnv;

  /**
   * PL12 — fechar a entrada desliga a abertura E a resposta do aluno em TODO o
   * portal, num clique. Reabrir também é um clique, mas o estrago do fechamento
   * acontece enquanto ninguém percebe: o aluno vê o canal sumir sem explicação.
   * Reabrir segue direto — voltar ao estado padrão não precisa de atrito.
   */
  function alternar() {
    if (aberto) {
      setErroFechar(null);
      setConfirmandoFechar(true);
      return;
    }
    aplicarAlternancia();
  }

  function aplicarAlternancia() {
    setErro(null);
    startTransition(async () => {
      const r = await definirChamadosAbertos(!aberto);
      if (!r.ok) {
        setErro(r.erro);
        setErroFechar(r.erro);
        return;
      }
      setConfirmandoFechar(false);
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
            Fechar impede o parceiro de abrir e de responder chamados. A equipe
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
          {ninguemRecebe ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              Ninguém recebe e-mail quando um parceiro abre chamado. Informe os
              endereços da equipe abaixo.
            </p>
          ) : null}

          {soPeloServidor ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
            >
              <Info
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span>
                Sem endereço cadastrado aqui; os avisos vão para o e-mail de
                suporte configurado no servidor (EMAIL_SUPORTE). Cadastre um
                endereço para a equipe receber por aqui.
              </span>
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

      {/* O botão "Fechar entrada" continua montado atrás do diálogo: é para lá
          que o foco volta quando o admin desiste. */}
      <DialogoConfirmacao
        aberto={confirmandoFechar}
        titulo="Fechar a entrada do suporte?"
        consequencia={
          <>
            <strong>
              Ninguém consegue abrir nem responder chamado até você reabrir
            </strong>{" "}
            — nem quem já tem um chamado em andamento esperando resposta. A
            equipe continua respondendo e fechando os chamados que existem, e o
            histórico não é apagado.
          </>
        }
        rotuloConfirmar="Fechar entrada"
        rotuloConfirmando="Fechando…"
        confirmando={pendente}
        erro={erroFechar}
        onConfirmar={aplicarAlternancia}
        onCancelar={() => {
          setConfirmandoFechar(false);
          setErroFechar(null);
        }}
      />
    </div>
  );
}
