"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";

/**
 * Mínimo de caracteres da senha — o mesmo do cadastro, do onboarding e das
 * RPCs de senha do admin. Era 6 aqui: a mesma conta tinha duas regras, e o
 * texto do erro é literalmente o mesmo em todas as telas.
 */
import { SENHA_MINIMO } from "@/lib/senha-regras";

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
 *
 * PF1 — o SDK entra por `import()` no submit. O `/perfil` é uma página que
 * quase ninguém abre para trocar senha; carregar 62 KB gzip de GoTrue só para
 * exibir dois campos era o preço padrão de toda visita.
 */
export function TrocarSenha() {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    // Mesmo mínimo do `/auth/redefinir`, do cadastro e do onboarding — não
    // pode haver duas regras diferentes na mesma conta.
    if (senha.length < SENHA_MINIMO) {
      setErro(`A senha precisa ter ao menos ${SENHA_MINIMO} caracteres.`);
      return;
    }
    if (senha !== confirma) {
      setErro("As senhas não coincidem.");
      return;
    }

    setSalvando(true);
    let falhou = true;
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.updateUser({
        password: senha,
      });
      falhou = Boolean(error);
    } catch {
      falhou = true;
    } finally {
      setSalvando(false);
    }

    if (falhou) {
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
            <InputSenha
              id="senha-nova"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
              placeholder={`Mínimo de ${SENHA_MINIMO} caracteres`}
              minLength={SENHA_MINIMO}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="senha-confirma">Repita a nova senha</Label>
            <InputSenha
              id="senha-confirma"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              autoComplete="new-password"
              minLength={SENHA_MINIMO}
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
