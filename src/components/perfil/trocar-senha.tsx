"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Troca de senha do próprio usuário logado.
 *
 * Existe porque `/auth/redefinir` só era alcançável pelo link do e-mail de
 * recuperação — quem entrava com uma senha temporária definida pelo admin
 * (`admin_definir_senha` / `admin_adotar_login_existente`) ficava com ela para
 * sempre, sem caminho na interface para trocar.
 *
 * `updateUser` age sobre a sessão ativa; não depende de token de recuperação.
 * A senha nova vale para TODOS os sistemas do grupo que compartilham o mesmo
 * `auth.users` — por isso o aviso no rodapé do card.
 */
export function TrocarSenha() {
  const supabase = createClient();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ver, setVer] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    // Mesmo mínimo do `/auth/redefinir`, para não haver duas regras diferentes
    // na mesma conta.
    if (senha.length < 6) {
      setErro("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);

    if (error) {
      setErro(
        "Não foi possível trocar a senha. Entre novamente e tente de novo.",
      );
      return;
    }

    setSenha("");
    setConfirma("");
    toast.success("Senha alterada. Use a nova senha no próximo acesso.");
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-4 text-muted-foreground" />
          Trocar senha
        </h2>
        <p className="text-sm text-muted-foreground">
          Se você entrou com uma senha temporária, defina aqui a sua.
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={salvar} className="grid gap-4 sm:max-w-sm">
          <div className="grid gap-2">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <div className="relative">
              <Input
                id="senha-nova"
                type={ver ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
              >
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="senha-confirma">Repita a nova senha</Label>
            <Input
              id="senha-confirma"
              type={ver ? "text" : "password"}
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={salvando || !senha || !confirma}>
              {salvando ? "Salvando..." : "Trocar senha"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Este login é o mesmo usado nos outros portais do Grupo Participa —
            a senha nova vale para todos eles.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
