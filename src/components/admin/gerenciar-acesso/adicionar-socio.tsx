"use client";

/**
 * Vincular um aluno JÁ CADASTRADO como sócio deste ambiente: busca, escolha,
 * e-mail e a criação do login.
 *
 * 🔑 Estado próprio (busca, resultado, selecionado, credenciais) porque só
 * esta tela o usa — e a busca é uma action separada (`buscarAlunos`), fora da
 * transição do diálogo principal. O sócio só é criado depois da escolha
 * explícita; o mesmo aluno não pode virar sócio do ambiente onde já é titular.
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { adicionarSocioAluno } from "@/app/admin/senha-actions";
import { buscarAlunos, type AlunoBusca } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CredenciaisView,
  type Credenciais,
} from "@/components/admin/credenciais-view";

export function AdicionarSocio({
  ambienteAlunoId,
  onVoltar,
  onAdicionado,
}: {
  ambienteAlunoId: string;
  onVoltar: () => void;
  onAdicionado: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AlunoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<AlunoBusca | null>(null);
  const [email, setEmail] = useState("");
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  // E1 (war-room 10/09): o e-mail já tem conta com papel em OUTRO portal do
  // grupo. A action voltou SEM mexer em nada; só depois do "sim" ela repete
  // com `confirmarOutrosSistemas` — mesmo contrato do "Definir senha".
  const [outrosPortais, setOutrosPortais] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 2) return;
    setBuscando(true);
    try {
      setResultados(await buscarAlunos(termo));
    } finally {
      setBuscando(false);
    }
  }

  function selecionar(a: AlunoBusca) {
    if (a.id === ambienteAlunoId) {
      toast.error("Este aluno já é o titular deste ambiente.");
      return;
    }
    setSel(a);
    setEmail(a.email ?? "");
  }

  function adicionar(confirmarOutros = false) {
    if (!sel) return;
    startTransition(async () => {
      const res = await adicionarSocioAluno(ambienteAlunoId, sel.id, {
        email,
        confirmarOutrosSistemas: confirmarOutros || undefined,
      });
      if (res.precisaConfirmar) {
        setOutrosPortais(res.programas ?? []);
        return;
      }
      setOutrosPortais(null);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      setCredenciais({
        email: res.email!,
        senha: res.senha!,
        emailEnviado: Boolean(res.emailEnviado),
        nome: sel.nome,
        telefone: sel.telefone,
      });
      toast.success("Sócio adicionado ao ambiente.");
    });
  }

  if (credenciais) {
    return (
      <div className="grid gap-4">
        <CredenciaisView credenciais={credenciais} onConcluir={onAdicionado} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <button
        onClick={onVoltar}
        className="text-left text-xs text-muted-foreground hover:text-foreground"
      >
        ← voltar
      </button>

      {sel ? (
        <>
          <button
            onClick={() => setSel(null)}
            className="text-left text-xs text-muted-foreground hover:text-foreground"
          >
            ← escolher outro aluno
          </button>
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{sel.nome}</div>
            <div className="text-xs text-muted-foreground">
              {sel.documento ? `CPF/CNPJ: ${sel.documento}` : "sem CPF"} ·{" "}
              {sel.jaNoGps
                ? "já tem ambiente próprio no programa"
                : "novo no programa"}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="socio-email">E-mail do sócio</Label>
            <Input
              id="socio-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <Button onClick={() => adicionar()} disabled={pending}>
            <UserPlus className="size-4" /> Adicionar como sócio
          </Button>
          <DialogoConfirmacao
            aberto={outrosPortais !== null}
            titulo="Este e-mail já tem conta em outro portal do grupo"
            descricao={
              <>
                <strong>{email}</strong> já entra em:{" "}
                <strong>{(outrosPortais ?? []).join(", ")}</strong>.
              </>
            }
            consequencia="Adicionar como sócio TROCA a senha dessa conta e derruba as sessões abertas dela em todos os portais. A pessoa precisa ser avisada da senha nova."
            rotuloConfirmar="Trocar a senha e adicionar como sócio"
            rotuloConfirmando="Adicionando..."
            destrutivo
            confirmando={pending}
            onConfirmar={() => adicionar(true)}
            onCancelar={() => setOutrosPortais(null)}
          />
        </>
      ) : (
        <>
          <form onSubmit={buscar} className="flex gap-2">
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, e-mail ou CPF/CNPJ"
              autoFocus
            />
            <Button type="submit" variant="secondary" disabled={buscando}>
              {buscando ? "..." : "Buscar"}
            </Button>
          </form>
          <div className="max-h-72 overflow-y-auto">
            {resultados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {termo.trim().length >= 2 && !buscando
                  ? "Nenhum aluno encontrado."
                  : "Digite ao menos 2 caracteres e busque."}
              </p>
            ) : (
              <ul className="divide-y">
                {resultados.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {a.nome ?? "—"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.email ?? "sem e-mail"}
                        {a.documento ? ` · ${a.documento}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.jaNoGps ? (
                        <Badge variant="outline" className="text-[10px]">
                          já no programa
                        </Badge>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => selecionar(a)}
                      >
                        Selecionar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
