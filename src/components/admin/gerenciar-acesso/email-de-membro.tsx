"use client";

/**
 * Troca o e-mail do LOGIN de um membro (titular ou sócio) — feature
 * "trocar e-mail do login pela tela do admin" (11/09/2026), molde de
 * `senha-de-membro.tsx`. Resolve sem SQL o que travou Eder Fagundes, Rubens
 * Barros e Mauricio de Oliveira em 10-11/09/2026: e-mail de login errado.
 *
 * 🔑 A escrita continua no `GerenciarAcesso` (painel.tsx): é lá que mora a
 * confirmação de "esta conta é usada em outros portais" e o diálogo de
 * consequência antes de aplicar. Aqui só há o formulário.
 */

import { Mail } from "lucide-react";
import type { MembroAcesso } from "@/lib/acesso-tipos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailValido } from "@/lib/texto";
import type { Tela } from "./tipos";

export function EmailDeMembro({
  membroEmail,
  emailNovo,
  setEmailNovo,
  gerarSenha,
  setGerarSenha,
  alinharCadastro,
  setAlinharCadastro,
  setMembroEmail,
  setTela,
  pending,
  trocarEmailDeMembro,
}: {
  membroEmail: MembroAcesso;
  emailNovo: string;
  setEmailNovo: (email: string) => void;
  gerarSenha: boolean;
  setGerarSenha: (v: boolean) => void;
  alinharCadastro: boolean;
  setAlinharCadastro: (v: boolean) => void;
  setMembroEmail: (membro: MembroAcesso | null) => void;
  setTela: (tela: Tela) => void;
  pending: boolean;
  trocarEmailDeMembro: (membro: MembroAcesso) => void;
}) {
  const emailAtual = membroEmail.email;
  const novoNormalizado = emailNovo.trim().toLowerCase();
  const desabilitado =
    pending ||
    !emailValido(novoNormalizado) ||
    (emailAtual !== null && novoNormalizado === emailAtual.trim().toLowerCase());

  return (
    <div className="grid gap-4">
      <button
        onClick={() => {
          setTela("principal");
          setMembroEmail(null);
        }}
        className="text-left text-xs text-muted-foreground hover:text-foreground"
      >
        ← voltar
      </button>

      <div className="rounded-md border p-3 text-sm">
        <div className="text-xs text-muted-foreground">E-mail atual do login</div>
        <div className="font-medium">{emailAtual ?? "sem e-mail"}</div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email-membro-novo">Novo e-mail</Label>
        <Input
          id="email-membro-novo"
          type="email"
          value={emailNovo}
          onChange={(e) => setEmailNovo(e.target.value)}
          placeholder="email@exemplo.com"
          autoComplete="off"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={gerarSenha}
          onCheckedChange={(v) => setGerarSenha(Boolean(v))}
          className="mt-0.5"
        />
        <span>
          Gerar uma senha nova
          <span className="block text-xs text-muted-foreground">
            Quem tinha o e-mail errado provavelmente nunca recebeu a senha
            original. Desmarque só se a pessoa já conseguia entrar (ex.: e-mail
            com erro de digitação, mas login funcionando).
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={alinharCadastro}
          onCheckedChange={(v) => setAlinharCadastro(Boolean(v))}
          className="mt-0.5"
        />
        <span>
          Atualizar também o e-mail do cadastro
          <span className="block text-xs text-muted-foreground">
            Grava o e-mail novo no cadastro da pessoa, além do login.
          </span>
        </span>
      </label>

      <p className="text-xs text-muted-foreground">
        O login vale para todos os portais do Grupo Participa. A pessoa vai
        precisar entrar com o e-mail novo, e as sessões abertas dela caem.
      </p>

      <Button
        onClick={() => trocarEmailDeMembro(membroEmail)}
        disabled={desabilitado}
      >
        <Mail className="size-4" /> Trocar e-mail agora
      </Button>
    </div>
  );
}
