"use client";

/**
 * F.3 — a senha de UM membro (titular ou sócio). Antes disto o admin via
 * "sem senha / nunca entrou" ao lado de cada sócio e o único remédio era
 * remover e re-adicionar, o que apaga o login e o histórico da pessoa. São 13
 * sócios reais.
 *
 * 🔑 A escrita continua no `GerenciarAcesso`: é lá que mora a confirmação de
 * "esta conta é usada em outros portais", que a action devolve ANTES de mudar
 * qualquer coisa. Aqui só há o campo e o botão.
 */

import { KeyRound } from "lucide-react";
import type { MembroAcesso } from "@/lib/acesso-tipos";
import { Button } from "@/components/ui/button";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";
import { sugerirSenha } from "@/components/admin/credenciais-view";
import { SENHA_MINIMO } from "@/lib/senha-regras";
import type { Tela } from "./tipos";

export function SenhaDeMembro({
  membroSenha,
  senhaMembro,
  setSenhaMembro,
  setMembroSenha,
  setTela,
  pending,
  definirSenhaDeMembro,
}: {
  membroSenha: MembroAcesso;
  senhaMembro: string;
  setSenhaMembro: (senha: string) => void;
  setMembroSenha: (membro: MembroAcesso | null) => void;
  setTela: (tela: Tela) => void;
  pending: boolean;
  definirSenhaDeMembro: (membro: MembroAcesso) => void;
}) {
  return (
    <div className="grid gap-4">
      <button
        onClick={() => {
          setTela("principal");
          setMembroSenha(null);
        }}
        className="text-left text-xs text-muted-foreground hover:text-foreground"
      >
        ← voltar
      </button>
      <div className="grid gap-2">
        <Label htmlFor="senha-membro">Nova senha</Label>
        <div className="flex gap-2">
          <InputSenha
            id="senha-membro"
            value={senhaMembro}
            onChange={(e) => setSenhaMembro(e.target.value)}
            className="font-mono"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSenhaMembro(sugerirSenha())}
          >
            Gerar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Mínimo de {SENHA_MINIMO} caracteres. As sessões abertas desta pessoa caem
          e o e-mail dela fica confirmado. O login vale para todos os
          portais do grupo.
        </p>
      </div>
      <Button
        onClick={() => definirSenhaDeMembro(membroSenha)}
        disabled={pending || senhaMembro.trim().length < SENHA_MINIMO}
      >
        <KeyRound className="size-4" /> Definir senha agora
      </Button>
    </div>
  );
}
