"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Gestão de mentoras (admin).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Antes só editável por SQL direto (`gps.plantao_mentoras`). Lista nome,
 * e-mail e estado (ativa/inativa); permite editar e-mail, ativar/desativar
 * e cadastrar mentora nova. Segue o padrão de `PlantaoAcessos`
 * (Table + Dialog + useTransition + toast + router.refresh).
 *
 * ⚠️ Mentora ATIVA sem e-mail é modo de falha SILENCIOSO: a RPC
 * `gps.plantao_aviso_mentora_pendente` filtra mentora sem e-mail de
 * propósito (não manda para endereço vazio) — ela simplesmente não recebe o
 * aviso de véspera dos plantões dela. Por isso o aviso aparece em DOIS
 * lugares: badge na linha da tabela e alerta agregado no topo (para não
 * depender de o admin notar uma badge perdida no meio da lista).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MailIcon,
  MailXIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react";
import type { MentoraAdmin } from "@/lib/plantao-tipos";
import { emailValido } from "@/lib/plantao";
import {
  criarMentora,
  editarMentora,
  alternarAtivaMentora,
} from "@/app/admin/plantao/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ModoDialog = "novo" | { editando: MentoraAdmin } | null;

export function PlantaoMentoras({ mentoras }: { mentoras: MentoraAdmin[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mentoraEmAcao, setMentoraEmAcao] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoDialog>(null);

  const semEmailAtivas = useMemo(
    () => mentoras.filter((m) => m.ativa && !m.email),
    [mentoras],
  );

  function alternarAtiva(m: MentoraAdmin) {
    const proximaAtiva = !m.ativa;
    if (
      proximaAtiva === false &&
      !window.confirm(
        `Desativar ${m.nome}? Ela deixa de aparecer para novos plantões, mas os plantões já publicados dela continuam de pé.`,
      )
    ) {
      return;
    }
    setMentoraEmAcao(m.id);
    startTransition(async () => {
      const res = await alternarAtivaMentora(m.id, proximaAtiva);
      setMentoraEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      if (!proximaAtiva && res.plantoesFuturos && res.plantoesFuturos > 0) {
        toast.warning(
          `${m.nome} desativada. Atenção: ela tem ${res.plantoesFuturos} plantão(ões) publicado(s) e futuro(s) — eles continuam de pé, mas ela não recebe mais o aviso de véspera se ficar sem e-mail.`,
        );
      } else {
        toast.success(proximaAtiva ? "Mentora reativada." : "Mentora desativada.");
      }
      router.refresh();
    });
  }

  function salvar(form: { mentoraId?: string; nome: string; email: string }) {
    const emailLimpo = form.email.trim();
    if (emailLimpo && !emailValido(emailLimpo)) {
      toast.error("E-mail inválido.");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Informe o nome da mentora.");
      return;
    }

    startTransition(async () => {
      const res = form.mentoraId
        ? await editarMentora({
            mentoraId: form.mentoraId,
            nome: form.nome,
            email: emailLimpo,
          })
        : await criarMentora({ nome: form.nome, email: emailLimpo });

      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(form.mentoraId ? "Mentora atualizada." : "Mentora cadastrada.");
      router.refresh();
      setModo(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {semEmailAtivas.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-2 py-4 text-sm">
            <TriangleAlertIcon
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden
            />
            <p>
              <strong>
                {semEmailAtivas.length === 1
                  ? `${semEmailAtivas[0].nome} está ativa sem e-mail`
                  : `${semEmailAtivas.length} mentoras ativas estão sem e-mail`}
              </strong>{" "}
              (
              {semEmailAtivas.map((m) => m.nome).join(", ")}
              ): o aviso de véspera dos plantões dela(s) não é enviado enquanto
              não houver e-mail cadastrado. Cadastre o e-mail para destravar o
              aviso.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-end">
        <Button onClick={() => setModo("novo")} disabled={pending}>
          <PlusIcon className="size-4" /> Nova mentora
        </Button>
      </div>

      {mentoras.length === 0 ? (
        <EmptyState
          titulo="Nenhuma mentora cadastrada."
          descricao="Cadastre a primeira mentora para poder marcá-la nos plantões do calendário."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mentora</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mentoras.map((m) => {
              const emAcao = pending && mentoraEmAcao === m.id;
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <UserRoundIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="font-medium">{m.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.email ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <MailIcon className="size-3.5 text-muted-foreground" aria-hidden />
                        {m.email}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive">
                        <MailXIcon className="size-3.5" aria-hidden />
                        Sem e-mail
                        {m.ativa ? " — sem aviso de véspera" : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.ativa ? "secondary" : "destructive"}>
                      {m.ativa ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={emAcao}
                        onClick={() => setModo({ editando: m })}
                      >
                        <PencilIcon className="size-4" /> Editar
                      </Button>
                      {m.ativa ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={emAcao}
                          onClick={() => alternarAtiva(m)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <ShieldOffIcon className="size-4" /> Desativar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={emAcao}
                          onClick={() => alternarAtiva(m)}
                        >
                          <ShieldCheckIcon className="size-4" /> Reativar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={modo !== null}
        onOpenChange={(v) => {
          if (!v) setModo(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modo === "novo" ? "Nova mentora" : "Editar mentora"}
            </DialogTitle>
            <DialogDescription>
              Sem e-mail, a mentora não recebe o aviso de véspera dos plantões
              dela.
            </DialogDescription>
          </DialogHeader>
          {modo !== null ? (
            <FormularioMentora
              mentora={typeof modo === "object" ? modo.editando : undefined}
              pending={pending}
              onCancelar={() => setModo(null)}
              onSalvar={salvar}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormularioMentora({
  mentora,
  pending,
  onCancelar,
  onSalvar,
}: {
  mentora?: MentoraAdmin;
  pending: boolean;
  onCancelar: () => void;
  onSalvar: (form: { mentoraId?: string; nome: string; email: string }) => void;
}) {
  const [nome, setNome] = useState(mentora?.nome ?? "");
  const [email, setEmail] = useState(mentora?.email ?? "");
  const emailPreenchido = email.trim().length > 0;
  const emailInvalido = emailPreenchido && !emailValido(email);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar({ mentoraId: mentora?.id, nome, email });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="mentora-nome">Nome</Label>
        <Input
          id="mentora-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mentora-email">E-mail</Label>
        <Input
          id="mentora-email"
          type="email"
          placeholder="mentora@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          aria-invalid={emailInvalido}
          aria-describedby="mentora-email-ajuda"
        />
        <p
          id="mentora-email-ajuda"
          className={
            emailInvalido
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {emailInvalido
            ? "E-mail inválido."
            : "Sem e-mail, ela não recebe o aviso de véspera dos plantões dela."}
        </p>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || emailInvalido || !nome.trim()}>
          {mentora ? "Salvar alterações" : "Cadastrar mentora"}
        </Button>
      </DialogFooter>
    </form>
  );
}
