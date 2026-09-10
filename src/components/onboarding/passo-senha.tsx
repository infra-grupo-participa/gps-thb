"use client";

import { AvisoInline } from "@/components/ui/aviso-inline";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";

/**
 * Passo 0 — a troca da senha temporária.
 *
 * 🔴 É o único passo que **não dá para pular**: quem chega aqui entrou com uma
 * senha que a equipe gerou, e sair sem trocar deixaria a conta com uma senha
 * que alguém de fora conhece.
 *
 * ⚠️ E o aviso é literal, porque a consequência é real: `auth.users` é
 * **compartilhado por 7 sistemas do grupo**. A senha criada aqui vale no
 * Workbook, na Rede, na Central — e não dizer isso faria a pessoa descobrir
 * sozinha, quando fosse entrar em outro portal.
 *
 * ⚠️ Esta tela é UX, não fronteira de segurança: a marca de "senha temporária"
 * vive no `user_metadata`, e o próprio usuário poderia limpá-la. Está escrito
 * aqui de propósito, em vez de fingirmos que é trava.
 */
export function PassoSenha({
  senha,
  senha2,
  setSenha,
  setSenha2,
}: {
  senha: string;
  senha2: string;
  setSenha: (v: string) => void;
  setSenha2: (v: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="corpo text-muted-foreground">
        Você entrou com uma senha temporária. Crie a sua agora.
      </p>
      <AvisoInline>
        Esta senha vale para todos os portais do Time Holding Brasil.
      </AvisoInline>
      <div className="grid gap-1.5">
        <Label htmlFor="onb-senha">Nova senha</Label>
        <InputSenha
          id="onb-senha"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="onb-senha2">Repita a nova senha</Label>
        <InputSenha
          id="onb-senha2"
          autoComplete="new-password"
          value={senha2}
          onChange={(e) => setSenha2(e.target.value)}
        />
      </div>
    </div>
  );
}
