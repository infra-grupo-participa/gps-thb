"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { definirOperador } from "@/app/admin/operador-actions";
import { resolverLoginPorEmail } from "@/app/admin/operadores/resolver-email-actions";
import type { Operador } from "@/lib/operador-tipos";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Gestão do papel "equipe da esteira" — quem está ATIVO aqui vê a fila de
 * ligações e o dossiê de qualquer cliente.
 *
 * UI DENSA e CHAPADA: uma linha por pessoa (nome, e-mail, estado, ação),
 * sem card decorativo por operador, hierarquia por posição — mesmo padrão
 * de `FilaDeLigacoes`.
 *
 * `nome` de `Operador` já vem do banco como o E-MAIL quando ninguém informou
 * um nome (`coalesce(v_nome, v_email)` em `gps.operador_definir`) — por isso
 * não existe uma coluna de e-mail separada aqui: a RPC de leitura
 * (`gps.operadores`, RLS) não expõe `auth.users.email` por design (só
 * `user_id`/`nome`/`ativo`/`criado_em`), e o dado já visível cobre o caso.
 */
export function Operadores({ operadores }: { operadores: Operador[] }) {
  return (
    <div className="grid gap-8">
      <AdicionarOperador />

      <section aria-label="Operadores cadastrados">
        {operadores.length === 0 ? (
          <EmptyState
            titulo="Nenhum operador cadastrado ainda"
            descricao="Adicione um login existente acima para dar a ele a fila de ligações e o dossiê."
          />
        ) : (
          <Card elevacao="flat" className="[--card-spacing:--spacing(0)]">
            <CardContent className="p-0">
              <ul className="divide-y" aria-label="Lista de operadores">
                {operadores.map((op) => (
                  <LinhaOperador key={op.userId} operador={op} />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function LinhaOperador({ operador }: { operador: Operador }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar() {
    setErro(null);
    startTransition(async () => {
      const res = await definirOperador(operador.userId, !operador.ativo);
      if (!res.ok) {
        setErro(res.erro ?? "Não foi possível alterar o operador.");
        return;
      }
      toast.success(
        operador.ativo
          ? `${operador.nome} não vê mais a fila nem o dossiê.`
          : `${operador.nome} agora vê a fila e o dossiê.`,
      );
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium text-foreground">
          {operador.nome}
        </span>
        {erro ? (
          <p role="alert" className="corpo-sm text-destructive">
            {erro}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 sm:w-32">
        <span
          className={
            "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold " +
            (operador.ativo
              ? "bg-sucesso text-sucesso-foreground"
              : "bg-neutro text-neutro-foreground")
          }
        >
          {operador.ativo ? "Ativo" : "Desativado"}
        </span>
      </div>

      <div className="shrink-0">
        <Button
          type="button"
          size="sm"
          variant={operador.ativo ? "outline" : "default"}
          onClick={alternar}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? "Salvando…" : operador.ativo ? "Desativar" : "Ativar"}
        </Button>
      </div>
    </li>
  );
}

/**
 * Adiciona um operador por e-mail — em dois passos (resolver o login, depois
 * ativar), porque `gps.operador_definir` exige um `user_id` já existente em
 * `auth.users`, nunca um e-mail cru. `resolverLoginPorEmail` (nova nesta
 * fatia, ver o cabeçalho do arquivo) faz só a primeira parte.
 */
function AdicionarOperador() {
  const router = useRouter();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function adicionar() {
    setErro(null);
    startTransition(async () => {
      const resolvido = await resolverLoginPorEmail(email);
      if (!resolvido.ok || !resolvido.userId) {
        setErro(resolvido.erro ?? "Não foi possível encontrar este login.");
        return;
      }

      const res = await definirOperador(
        resolvido.userId,
        true,
        nome.trim() || null,
      );
      if (!res.ok) {
        setErro(res.erro ?? "Não foi possível adicionar o operador.");
        return;
      }

      toast.success(`${nome.trim() || resolvido.email} agora vê a fila e o dossiê.`);
      setEmail("");
      setNome("");
      router.refresh();
    });
  }

  return (
    <section aria-label="Adicionar operador">
      <Card elevacao="flat">
        <CardContent>
          <fieldset className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" disabled={pending}>
            <legend className="mb-1 corpo-sm font-medium text-foreground">
              Adicionar operador
            </legend>

            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-email`}>E-mail do login</Label>
              <Input
                id={`${uid}-email`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@exemplo.com"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${uid}-nome`}>
                Nome <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id={`${uid}-nome`}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como aparece na lista"
                maxLength={200}
              />
            </div>

            <Button
              type="button"
              onClick={adicionar}
              disabled={pending || email.trim() === ""}
              aria-busy={pending || undefined}
            >
              {pending ? "Adicionando…" : "Adicionar"}
            </Button>
          </fieldset>

          <p role="alert" className="mt-2 corpo-sm text-destructive empty:hidden">
            {erro}
          </p>
          <p className="mt-2 corpo-sm text-muted-foreground">
            A pessoa precisa já ter login em algum sistema do grupo — Adicionar
            operador não cria conta nova, só liga o papel a um login existente.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
