"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, KeyRound, Copy, Check } from "lucide-react";
import {
  buscarAlunos,
  criarAcessoAluno,
  adicionarAlunoGps,
  type AlunoBusca,
} from "@/app/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Credenciais {
  email: string;
  senha: string;
  precisaConfirmar?: boolean;
}

export function CriarAcesso() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AlunoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<AlunoBusca | null>(null);
  const [email, setEmail] = useState("");
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTermo("");
    setResultados([]);
    setSel(null);
    setEmail("");
    setCredenciais(null);
  }

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
    setSel(a);
    setEmail(a.email ?? "");
    setCredenciais(null);
  }

  function criarLogin() {
    if (!sel) return;
    startTransition(async () => {
      const res = await criarAcessoAluno(sel.id, { email });
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      setCredenciais({
        email: res.email!,
        senha: res.senha!,
        precisaConfirmar: res.precisaConfirmar,
      });
      toast.success("Acesso criado.");
      router.refresh();
    });
  }

  function criarAmbiente() {
    if (!sel) return;
    startTransition(async () => {
      const res = await adicionarAlunoGps(sel.id);
      if (res.erro) {
        toast.error("Erro ao criar o ambiente.");
        return;
      }
      toast.success("Ambiente criado. O aluno pode se cadastrar com o CPF.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UserPlus className="size-4" /> Criar acesso
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar acesso do aluno</DialogTitle>
            <DialogDescription>
              Busque o aluno pelo nome, e-mail ou CPF/CNPJ (cadastro do Time
              Holding Brasil).
            </DialogDescription>
          </DialogHeader>

          {credenciais ? (
            <CredenciaisView
              credenciais={credenciais}
              onConcluir={() => {
                setOpen(false);
                reset();
              }}
            />
          ) : sel ? (
            <div className="grid gap-4">
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
                  {sel.jaNoGps ? "já tem ambiente no GPS" : "novo no GPS"}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ca-email">E-mail do aluno</Label>
                <Input
                  id="ca-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
                <p className="text-xs text-muted-foreground">
                  Se o e-mail estiver antigo, corrija aqui — o cadastro será
                  atualizado.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={criarLogin}
                  disabled={pending}
                  className="flex-1"
                >
                  <KeyRound className="size-4" /> Criar login agora
                </Button>
                <Button
                  variant="outline"
                  onClick={criarAmbiente}
                  disabled={pending}
                  className="flex-1"
                >
                  Só criar ambiente
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <strong>Criar login agora</strong>: gera e-mail e senha para o
                aluno entrar. <strong>Só criar ambiente</strong>: o aluno se
                cadastra depois com o próprio CPF.
              </p>
            </div>
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
                              no GPS
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
        </DialogContent>
      </Dialog>
    </>
  );
}

function CredenciaisView({
  credenciais,
  onConcluir,
}: {
  credenciais: Credenciais;
  onConcluir: () => void;
}) {
  const texto = `Acesse o GPS:\nLogin: ${credenciais.email}\nSenha: ${credenciais.senha}`;
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-green-600/30 bg-green-600/10 p-4">
        <div className="mb-2 text-sm font-medium text-green-700 dark:text-green-400">
          Acesso criado com sucesso
        </div>
        <div className="grid gap-1 text-sm">
          <div>
            <span className="text-muted-foreground">Login:</span>{" "}
            <span className="font-medium">{credenciais.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Senha:</span>{" "}
            <span className="font-mono font-medium">{credenciais.senha}</span>
          </div>
        </div>
        {credenciais.precisaConfirmar ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Obs.: a confirmação de e-mail está ativa — o aluno precisa confirmar
            o e-mail antes de entrar.
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={copiar} className="flex-1">
          {copiado ? (
            <>
              <Check className="size-4" /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-4" /> Copiar credenciais
            </>
          )}
        </Button>
        <Button onClick={onConcluir} className="flex-1">
          Concluir
        </Button>
      </div>
    </div>
  );
}
