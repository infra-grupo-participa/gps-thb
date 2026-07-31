"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Copy,
  KeyRound,
  Mail,
  MessageCircle,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  definirSenhaAluno,
  enviarRedefinicaoSenha,
  excluirAcessoAluno,
  statusAcessoAluno,
  type StatusAcesso,
} from "@/app/admin/senha-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { linkWhatsapp } from "@/lib/whatsapp";

interface Credenciais {
  email: string;
  senha: string;
  emailEnviado: boolean;
  nome: string | null;
  telefone: string | null;
}

/** Senha temporária legível, gerada no navegador (ex.: Thb-7f3a-2b9c). */
function sugerirSenha(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
  return `Thb-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

function mensagemAcesso(c: Credenciais) {
  return (
    `Olá${c.nome ? `, ${c.nome.split(" ")[0]}` : ""}! Seu acesso ao Programa de ` +
    `Implementação Assistida do Time Holding Brasil:\n\n` +
    `Portal: https://programa.timeholdingbrasil.com.br\n` +
    `Login: ${c.email}\n` +
    `Senha: ${c.senha}\n\n` +
    `Você pode trocar a senha depois, dentro do portal.`
  );
}

export function GerenciarAcesso({
  alunoId,
  nomeAluno,
}: {
  alunoId: string;
  nomeAluno?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<StatusAcesso | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [senha, setSenha] = useState("");
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [confirmaExclusao, setConfirmaExclusao] = useState("");
  const [pending, startTransition] = useTransition();

  function abrir() {
    setOpen(true);
    setCredenciais(null);
    setConfirmaExclusao("");
    setSenha(sugerirSenha());
    setCarregando(true);
    statusAcessoAluno(alunoId)
      .then((res) => {
        if (res.erro) toast.error(res.erro);
        setStatus(res.status ?? null);
      })
      .finally(() => setCarregando(false));
  }

  function definirSenha() {
    startTransition(async () => {
      const res = await definirSenhaAluno(alunoId, { senha });
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      setCredenciais({
        email: res.email!,
        senha: res.senha!,
        emailEnviado: Boolean(res.emailEnviado),
        nome: res.nome ?? nomeAluno ?? null,
        telefone: res.telefone ?? null,
      });
      toast.success("Senha definida. O aluno já pode entrar agora.");
      router.refresh();
    });
  }

  function enviarEmailRedefinicao() {
    startTransition(async () => {
      const res = await enviarRedefinicaoSenha(alunoId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(`E-mail de redefinição enviado para ${res.email}.`);
    });
  }

  function excluir() {
    startTransition(async () => {
      const res = await excluirAcessoAluno(alunoId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        res.loginApagado
          ? "Acesso e login excluídos por completo."
          : "Ambiente do GPS excluído (não havia login).",
      );
      setOpen(false);
      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <KeyRound className="size-4" /> Gerenciar acesso
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Acesso do aluno</DialogTitle>
            <DialogDescription>
              {nomeAluno ?? "Aluno"} — defina a senha na hora, sem depender de
              e-mail.
            </DialogDescription>
          </DialogHeader>

          {credenciais ? (
            <CredenciaisView
              credenciais={credenciais}
              onConcluir={() => setOpen(false)}
            />
          ) : (
            <div className="grid gap-5">
              <StatusView status={status} carregando={carregando} />

              <div className="grid gap-2">
                <Label htmlFor="senha-aluno">Nova senha</Label>
                <div className="flex gap-2">
                  <Input
                    id="senha-aluno"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    className="font-mono"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSenha(sugerirSenha())}
                  >
                    Gerar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo de 8 caracteres. As sessões abertas do aluno caem e o
                  e-mail dele fica confirmado.
                </p>
                <Button
                  onClick={definirSenha}
                  disabled={pending || senha.trim().length < 8}
                >
                  <KeyRound className="size-4" /> Definir senha agora
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={enviarEmailRedefinicao}
                  disabled={pending}
                >
                  <Mail className="size-4" /> Preferir o e-mail de redefinição
                </Button>
              </div>

              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-destructive">
                  <ShieldAlert className="size-4" /> Excluir acesso
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Apaga o login e tudo que o aluno tem no programa (clientes,
                  progresso, reuniões). O cadastro dele na base do Time Holding
                  Brasil é preservado. Não tem volta — para digitar{" "}
                  <span className="font-mono font-medium">EXCLUIR</span> e
                  confirmar.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={confirmaExclusao}
                    onChange={(e) => setConfirmaExclusao(e.target.value)}
                    placeholder="EXCLUIR"
                    className="font-mono"
                    autoComplete="off"
                  />
                  <Button
                    variant="destructive"
                    onClick={excluir}
                    disabled={pending || confirmaExclusao.trim() !== "EXCLUIR"}
                  >
                    <Trash2 className="size-4" /> Excluir
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusView({
  status,
  carregando,
}: {
  status: StatusAcesso | null;
  carregando: boolean;
}) {
  if (carregando) {
    return (
      <p className="text-sm text-muted-foreground">Conferindo o acesso…</p>
    );
  }
  if (!status) return null;

  const itens: { rotulo: string; ok: boolean; detalhe?: string }[] = [
    {
      rotulo: "Tem login",
      ok: status.temLogin,
      detalhe: status.emailLogin ?? "nenhum login encontrado",
    },
    { rotulo: "Senha cadastrada", ok: status.temSenha },
    { rotulo: "E-mail confirmado", ok: status.emailConfirmado },
    {
      rotulo: "E-mail do login = e-mail do cadastro",
      ok: status.emailBate,
      detalhe: status.emailBate ? undefined : `cadastro: ${status.emailCadastro ?? "—"}`,
    },
    { rotulo: "Vinculado ao programa", ok: status.noGps && status.vinculoCompleto },
  ];

  return (
    <div className="rounded-md border p-3">
      <ul className="grid gap-1 text-sm">
        {itens.map((i) => (
          <li key={i.rotulo} className="flex items-start gap-2">
            <span className={i.ok ? "text-green-600" : "text-destructive"}>
              {i.ok ? "✓" : "✕"}
            </span>
            <span className="min-w-0">
              {i.rotulo}
              {i.detalhe ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {i.detalhe}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {status.ultimoAcesso
          ? `Último acesso: ${new Date(status.ultimoAcesso).toLocaleString("pt-BR")}`
          : "O aluno nunca entrou no portal."}
        {status.solicitacaoPendente ? " · há solicitação pendente" : ""}
      </p>
    </div>
  );
}

function CredenciaisView({
  credenciais,
  onConcluir,
}: {
  credenciais: Credenciais;
  onConcluir: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = mensagemAcesso(credenciais);
  const whatsapp = linkWhatsapp(credenciais.telefone, texto);

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
          Senha definida — o aluno já pode entrar
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
        <p className="mt-2 text-xs text-muted-foreground">
          {credenciais.emailEnviado
            ? "As credenciais também foram enviadas por e-mail."
            : "O e-mail não saiu — repasse as credenciais por WhatsApp."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={copiar} className="flex-1">
          {copiado ? (
            <>
              <Check className="size-4" /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-4" /> Copiar mensagem
            </>
          )}
        </Button>
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" }) + " flex-1"}
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
        <Button onClick={onConcluir} className="flex-1">
          Concluir
        </Button>
      </div>
    </div>
  );
}
