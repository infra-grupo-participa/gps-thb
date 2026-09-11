"use client";

/**
 * Inscrever alguém direto no slot, pelo painel — rodapé do diálogo de
 * inscritos. Trata as três respostas distintas de `inscreverAlunoNoSlot`
 * (ver o comentário da action em `inscritos-actions.ts`):
 *
 * 1. sucesso, com `reativada: true` quando a pessoa já tinha inscrição
 *    cancelada neste slot e voltou para a lista;
 * 2. erro "não está na base do Acelera" — mensagem vem pronta do banco
 *    (`FRASES_INSCRITOS`); aqui só se acrescenta o atalho para a aba Parceiros;
 * 3. `slotConflitanteId` — a pessoa já tem outra inscrição ativa; mostra o
 *    aviso com um link para o outro slot no calendário (`?m=` do mês dele
 *    não é conhecido aqui, então o link vai para a aba Parceiros/Calendário do
 *    mês atual — não inventamos uma data que a resposta não trouxe).
 */

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlusIcon } from "lucide-react";
import { inscreverAlunoNoSlot } from "@/app/admin/plantao/inscritos-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InscreverForm({ slotId }: { slotId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [semBaseAcelera, setSemBaseAcelera] = useState(false);
  const [slotConflitanteId, setSlotConflitanteId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");

  const idEmail = useId();
  const idNome = useId();

  function limpar() {
    setEmail("");
    setNome("");
    setErro(null);
    setSemBaseAcelera(false);
    setSlotConflitanteId(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSemBaseAcelera(false);
    setSlotConflitanteId(null);
    setEnviando(true);

    const res = await inscreverAlunoNoSlot(slotId, email.trim(), nome.trim() || undefined);
    setEnviando(false);

    if (!res.ok) {
      setErro(res.erro);
      setSlotConflitanteId(res.slotConflitanteId ?? null);
      setSemBaseAcelera(/base de compradores do Acelera/i.test(res.erro));
      return;
    }

    toast.success(
      res.reativada
        ? `${nome.trim() || email.trim()} voltou para a lista.`
        : `${nome.trim() || email.trim()} foi inscrito(a).`,
    );
    setAberto(false);
    limpar();
    router.refresh();
  }

  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)} className="self-start">
        <UserPlusIcon className="size-4" />
        Inscrever alguém
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border p-3"
      aria-label="Inscrever alguém neste plantão"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idEmail}>E-mail *</Label>
        <Input
          id={idEmail}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={enviando}
          autoFocus
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={idNome}>Nome (opcional)</Label>
        <Input
          id={idNome}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={enviando}
        />
      </div>

      {erro ? (
        <div role="alert" className="flex flex-col gap-1.5 text-sm text-destructive">
          <p>{erro}</p>
          {semBaseAcelera ? (
            <p className="text-xs text-muted-foreground">
              Use a aba <strong>Parceiros</strong> → <strong>Liberar parceiro</strong>{" "}
              antes de tentar inscrever de novo.
            </p>
          ) : null}
          {slotConflitanteId ? (
            <p className="text-xs text-muted-foreground">
              Esta pessoa já tem um plantão marcado em outra data. Cancele a
              inscrição anterior antes de inscrever aqui, se for o caso.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAberto(false);
            limpar();
          }}
          disabled={enviando}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
          {enviando ? "Inscrevendo..." : "Inscrever"}
        </Button>
      </div>
    </form>
  );
}
