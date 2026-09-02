"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Formulário de entrada PÚBLICO.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * A tela é SEMPRE a mesma — não pergunta "primeiro acesso?": o servidor
 * (RPC `gps.plantao_login`) decide e cria a senha no primeiro login. Isso
 * também evita que a tela vire um jeito de descobrir se um e-mail está
 * cadastrado (enumeração).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { entrar } from "@/app/p/plantao/actions";
import { SENHA_MIN } from "@/lib/plantao-tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PlantaoLogin() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setErro(null);
    const email = String(formData.get("email") ?? "");
    const senha = String(formData.get("senha") ?? "");
    const documento = String(formData.get("documento") ?? "");

    if (senha.length < SENHA_MIN) {
      setErro(`A senha precisa ter ao menos ${SENHA_MIN} caracteres.`);
      return;
    }

    startTransition(async () => {
      const res = await entrar(email, senha, documento);
      if (!res.ok) {
        // Mensagem ÚNICA que a action devolveu — nunca diferenciar os casos
        // aqui (e-mail não encontrado / senha errada / etc.), tanto por
        // clareza quanto para não abrir brecha de enumeração de e-mail.
        setErro(res.erro);
        return;
      }
      if (res.primeiroAcesso) {
        toast.success(
          "Pronto! Sua senha foi criada. Guarde-a — é ela que abre o plantão.",
        );
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entrar no plantão</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Este acesso é exclusivo da Acelera Holding e é separado do seu
          acesso ao Programa de Implementação Assistida.
        </p>

        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="plantao-email">E-mail</Label>
            <Input
              id="plantao-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              required
              autoFocus
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              O e-mail que você usou na compra da Acelera Holding.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plantao-documento">
              4 últimos dígitos do seu CPF ou CNPJ
            </Label>
            <Input
              id="plantao-documento"
              name="documento"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="0000"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Do documento usado na compra da Acelera Holding. Confirmamos
              apenas no seu primeiro acesso.
            </p>
          </div>


          <div className="flex flex-col gap-2">
            <Label htmlFor="plantao-senha">Senha</Label>
            <div className="relative">
              <Input
                id="plantao-senha"
                name="senha"
                type={mostrarSenha ? "text" : "password"}
                autoComplete="current-password"
                minLength={SENHA_MIN}
                required
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
              No primeiro acesso, a senha que você digitar aqui é a que fica
              valendo daqui pra frente (mínimo de {SENHA_MIN} caracteres).
            </p>
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="mt-1">
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
