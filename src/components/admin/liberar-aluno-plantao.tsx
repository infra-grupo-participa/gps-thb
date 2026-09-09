"use client";

/**
 * Diálogo "Liberar aluno" — aba Alunos de `/admin/plantao`.
 *
 * `gps.plantao_alunos` é um CSV CONGELADO (carga de 01/09): nada nele se
 * atualiza sozinho, o job noturno só REMOVE quem migrou para o Programa,
 * nunca ADICIONA quem comprou o Acelera depois. Este diálogo é o remédio
 * pelo painel, no lugar de liberar por SQL direto (caso real: Bianca
 * Estacio, compradora desde 17/08, recusada na inscrição em 09/09).
 *
 * Chama `liberarAlunoPlantao` (`src/app/admin/plantao/alunos-actions.ts`),
 * que já existe e já está aplicada no banco — este arquivo é só a UI.
 */

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emailValido } from "@/lib/texto";
import { mascaraCpfCnpj, mascaraTelefone } from "@/lib/masks";
import { liberarAlunoPlantao } from "@/app/admin/plantao/alunos-actions";

export function LiberarAlunoPlantao() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");

  const idNome = useId();
  const idEmail = useId();
  const idDocumento = useId();
  const idTelefone = useId();

  function limpar() {
    setNome("");
    setEmail("");
    setDocumento("");
    setTelefone("");
    setErro(null);
  }

  function validarLocal(): string | null {
    if (!nome.trim()) return "Informe o nome.";
    if (!emailValido(email)) return "Informe um e-mail válido.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const erroLocal = validarLocal();
    if (erroLocal) {
      setErro(erroLocal);
      return;
    }

    setErro(null);
    setEnviando(true);
    const res = await liberarAlunoPlantao({
      nome: nome.trim(),
      email: email.trim(),
      documento: documento.trim() || undefined,
      telefone: telefone.trim() || undefined,
    });
    setEnviando(false);

    if (!res.ok) {
      setErro(res.erro);
      return;
    }

    toast.success(
      res.reativado
        ? `${nome.trim()} já existia na base e foi reativado.`
        : `${nome.trim()} foi liberado para o Plantão.`,
    );
    setAberto(false);
    limpar();
    router.refresh();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        // Não fecha durante o envio: a pessoa ficaria sem saber o resultado.
        if (!v && enviando) return;
        setAberto(v);
        if (!v) limpar();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline">
            <UserPlusIcon className="size-4" />
            Liberar aluno
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liberar aluno no Plantão</DialogTitle>
          <DialogDescription>
            Use isto quando a pessoa comprou o Acelera Holding mas não está na
            lista abaixo — a lista é uma carga fixa de 01/09 e não se atualiza
            sozinha com novas compras. Não é um atalho para liberar quem não
            comprou.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idNome}>Nome *</Label>
            <Input
              id={idNome}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={enviando}
              autoFocus
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idEmail}>E-mail *</Label>
            <Input
              id={idEmail}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idDocumento}>CPF/CNPJ (opcional)</Label>
            <Input
              id={idDocumento}
              value={documento}
              onChange={(e) => setDocumento(mascaraCpfCnpj(e.target.value))}
              disabled={enviando}
              inputMode="numeric"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idTelefone}>Telefone (opcional)</Label>
            <Input
              id={idTelefone}
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              disabled={enviando}
              inputMode="numeric"
            />
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAberto(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
              {enviando ? "Liberando..." : "Liberar aluno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
