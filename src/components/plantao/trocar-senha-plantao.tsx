"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Troca OBRIGATÓRIA da senha padrão.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Aparece no lugar do calendário sempre que a sessão ainda estiver marcada
 * como "senha provisória" (1º acesso com a senha padrão distribuída pela
 * Hotmart, decisão do Marcio em 08/09/2026 — ver migration
 * `20260909000033_gps_plantao_senha_padrao_primeiro_acesso.sql`). O aluno
 * JÁ ESTÁ LOGADO — a sessão existe — então esta tela só chama
 * `definirSenha`, sem pedir e-mail/senha de novo.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon, KeyRoundIcon } from "lucide-react";
import { definirSenha } from "@/app/p/plantao/actions";
import { SENHA_MIN } from "@/lib/plantao-tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TrocarSenhaPlantao() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setErro(null);
    const senha = String(formData.get("senha-nova") ?? "");
    const confirmacao = String(formData.get("senha-confirmacao") ?? "");

    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa ter ao menos ${SENHA_MIN} caracteres.`);
      return;
    }
    if (senha !== confirmacao) {
      setErro("As duas senhas precisam ser iguais.");
      return;
    }

    startTransition(async () => {
      const res = await definirSenha(senha);
      if (!res.ok) {
        setErro(res.erro);
        return;
      }
      toast.success("Senha criada! Você já pode usar o plantão.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRoundIcon className="size-5 text-primary" aria-hidden />
          <CardTitle className="text-lg">Crie sua senha</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Você entrou com a senha que recebeu da Hotmart. Por segurança, ela
          vale só para este primeiro acesso — crie agora a senha que vai usar
          daqui pra frente para abrir o plantão.
        </p>

        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="plantao-senha-nova">Nova senha</Label>
            <div className="relative">
              <Input
                id="plantao-senha-nova"
                name="senha-nova"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="new-password"
                minLength={SENHA_MIN}
                required
                autoFocus
                disabled={pending}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
                tabIndex={0}
              >
                {mostrarSenha ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo de {SENHA_MIN} caracteres. Não pode ser a senha padrão
              que você recebeu.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="plantao-senha-confirmacao">
              Confirme a nova senha
            </Label>
            <div className="relative">
              <Input
                id="plantao-senha-confirmacao"
                name="senha-confirmacao"
                type={mostrarConfirmacao ? "text" : "password"}
                autoComplete="new-password"
                minLength={SENHA_MIN}
                required
                disabled={pending}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setMostrarConfirmacao((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
                aria-label={mostrarConfirmacao ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarConfirmacao}
                tabIndex={0}
              >
                {mostrarConfirmacao ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "Salvando..." : "Salvar e continuar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
