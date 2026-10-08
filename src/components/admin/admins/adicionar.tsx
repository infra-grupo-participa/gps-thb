"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { definirAdminDoPrograma } from "@/app/admin/admins-actions";
import { DOMINIO_ADMIN } from "@/lib/admins-tipos";
import { formatarData, formatarDataHora } from "@/lib/datas";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoMotivo, motivoValido } from "./campo-motivo";

/** O que a simulação devolveu — a conta que vai ganhar o acesso. */
interface Conferencia {
  email: string;
  motivo: string;
  criadoEm: string | null;
  ultimoLogin: string | null;
}

/**
 * "Adicionar admin" em DOIS passos: o 1º clique chama a action com
 * `simular: true` (o banco valida tudo e não grava) e mostra quando a conta
 * foi criada e o último acesso — `auth.users` é de 7 sistemas, e um e-mail
 * digitado errado pode ser de outra pessoa. Só a confirmação grava.
 * Também reativa quem foi removido.
 */
export function AdicionarAdmin() {
  const router = useRouter();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [erroConf, setErroConf] = useState<string | null>(null);

  const pronto = email.trim() !== "" && motivoValido(motivo);

  function conferir() {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const res = await definirAdminDoPrograma({ email, ativo: true, motivo, simular: true });
      if (!res.ok) {
        setErro(res.erro ?? "Não foi possível conferir a conta.");
        return;
      }
      const alvo = email.trim().toLowerCase();
      if (res.mudou === false) {
        setAviso(`${alvo} já é admin do programa.`);
        return;
      }
      setErroConf(null);
      setConf({
        email: alvo,
        motivo,
        criadoEm: res.criadoEm ?? null,
        ultimoLogin: res.ultimoLogin ?? null,
      });
    });
  }

  function confirmar() {
    if (!conf) return;
    setErroConf(null);
    const c = conf;
    startTransition(async () => {
      const res = await definirAdminDoPrograma({ email: c.email, ativo: true, motivo: c.motivo });
      if (!res.ok) {
        setErroConf(res.erro ?? "Não foi possível adicionar o admin.");
        return;
      }
      toast.success(
        res.mudou === false
          ? `${c.email} já era admin do programa.`
          : `${c.email} agora é admin do programa.`,
      );
      setConf(null);
      setEmail("");
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <form
      aria-label="Adicionar admin"
      onSubmit={(e) => {
        e.preventDefault();
        if (pronto && !pending) conferir();
      }}
      className="grid gap-2 rounded-lg border border-borda-fina p-3"
    >
      <fieldset
        disabled={pending}
        className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-start"
      >
        <legend className="mb-1 corpo-sm font-medium text-foreground">
          Adicionar admin
        </legend>

        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-email`}>E-mail do login</Label>
          <Input
            id={`${uid}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`pessoa${DOMINIO_ADMIN}`}
            autoComplete="off"
          />
        </div>

        <CampoMotivo
          id={`${uid}-motivo`}
          valor={motivo}
          onChange={setMotivo}
          placeholder="Ex.: entrou na equipe de implementação"
        />

        <Button
          type="submit"
          className="sm:mt-6"
          disabled={pending || !pronto}
          aria-busy={(pending && !conf) || undefined}
        >
          {pending && !conf ? "Conferindo…" : "Adicionar"}
        </Button>
      </fieldset>

      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erro}
      </p>
      <p role="status" className="corpo-sm text-foreground empty:hidden">
        {aviso}
      </p>
      <p className="corpo-sm text-muted-foreground">
        Só contas {DOMINIO_ADMIN} que já têm login em algum sistema do grupo.
      </p>

      <DialogoConfirmacao
        aberto={conf !== null}
        titulo="Dar acesso de admin do programa"
        descricao={
          conf
            ? `${conf.email} · Conta criada em ${conf.criadoEm ? formatarData(conf.criadoEm) : "data desconhecida"} · último acesso ${conf.ultimoLogin ? formatarDataHora(conf.ultimoLogin) : "nunca entrou"}`
            : undefined
        }
        consequencia="Confira se esta é mesmo a conta da pessoa antes de dar acesso de admin. Admin vê e edita todos os alunos do programa."
        rotuloConfirmar="Dar acesso de admin"
        rotuloConfirmando="Adicionando…"
        destrutivo={false}
        confirmando={pending}
        erro={erroConf}
        onConfirmar={confirmar}
        onCancelar={() => {
          if (!pending) setConf(null);
        }}
      />
    </form>
  );
}
