"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";

// PF1 — o SDK do Supabase (62 KB gzip) só é buscado no submit. A validação de
// tamanho e de confirmação da senha roda ANTES do `import()`, então quem errar
// a digitação recebe o erro sem baixar byte nenhum.
export function RedefinirForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) {
      setErro("A senha deve ter ao menos 6 caracteres.");
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
      // Rede caída entre abrir a página e enviar: o chunk do SDK não baixa.
      falhou = true;
    } finally {
      setSalvando(false);
    }
    if (falhou) {
      setErro(
        "Não foi possível redefinir. Abra o link de redefinição novamente pelo e-mail.",
      );
      return;
    }
    router.replace("/");
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="senha">Nova senha</Label>
        <InputSenha
          id="senha"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Mínimo de 6 caracteres"
          required
          minLength={6}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirma">Confirmar nova senha</Label>
        <InputSenha
          id="confirma"
          autoComplete="new-password"
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          required
          minLength={6}
        />
      </div>
      {/* Anunciado pelo leitor de tela (WCAG 3.3.1 / 4.1.3). */}
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <Button type="submit" disabled={salvando} className="mt-2">
        {salvando ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}
