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
  Users,
  UserPlus,
  UserMinus,
} from "lucide-react";
import {
  adicionarSocioAluno,
  definirSenhaAluno,
  enviarRedefinicaoSenha,
  excluirAcessoAluno,
  excluirMembroAluno,
  statusAcessoAluno,
  type MembroAcesso,
  type StatusAcesso,
} from "@/app/admin/senha-actions";
import { buscarAlunos, type AlunoBusca } from "@/app/admin/actions";
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
import { Badge } from "@/components/ui/badge";
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

type Tela = "principal" | "adicionar-socio";

export function GerenciarAcesso({
  alunoId,
  nomeAluno,
}: {
  alunoId: string;
  nomeAluno?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tela, setTela] = useState<Tela>("principal");
  const [status, setStatus] = useState<StatusAcesso | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [senha, setSenha] = useState("");
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [confirmaExclusao, setConfirmaExclusao] = useState("");
  const [pending, startTransition] = useTransition();

  function carregarStatus() {
    setCarregando(true);
    return statusAcessoAluno(alunoId)
      .then((res) => {
        if (res.erro) toast.error(res.erro);
        setStatus(res.status ?? null);
      })
      .finally(() => setCarregando(false));
  }

  function abrir() {
    setOpen(true);
    setTela("principal");
    setCredenciais(null);
    setConfirmaExclusao("");
    setSenha(sugerirSenha());
    carregarStatus();
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

  function excluirAmbiente() {
    startTransition(async () => {
      const res = await excluirAcessoAluno(alunoId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        res.loginApagado
          ? "Ambiente e todos os logins (titular e sócios) excluídos por completo."
          : "Ambiente do GPS excluído (não havia login).",
      );
      setOpen(false);
      router.push("/admin");
      router.refresh();
    });
  }

  function excluirMembro(m: MembroAcesso) {
    startTransition(async () => {
      const res = await excluirMembroAluno(m.membroId);
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      toast.success(`${m.email ?? "Sócio"} removido do ambiente.`);
      carregarStatus();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir}>
        <KeyRound className="size-4" /> Gerenciar acesso
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tela === "adicionar-socio"
                ? "Adicionar sócio ao ambiente"
                : "Acesso do ambiente"}
            </DialogTitle>
            <DialogDescription>
              {tela === "adicionar-socio"
                ? "Vincule um aluno já cadastrado como sócio deste ambiente."
                : `${nomeAluno ?? "Aluno"} — defina a senha na hora, sem depender de e-mail.`}
            </DialogDescription>
          </DialogHeader>

          {tela === "adicionar-socio" ? (
            <AdicionarSocio
              ambienteAlunoId={alunoId}
              onVoltar={() => {
                setTela("principal");
                carregarStatus();
              }}
              onAdicionado={() => {
                setTela("principal");
                carregarStatus();
                router.refresh();
              }}
            />
          ) : credenciais ? (
            <CredenciaisView
              credenciais={credenciais}
              onConcluir={() => setOpen(false)}
            />
          ) : (
            <div className="grid gap-5">
              <MembrosView
                status={status}
                carregando={carregando}
                pending={pending}
                onAdicionarSocio={() => setTela("adicionar-socio")}
                onExcluirMembro={excluirMembro}
              />

              <div className="grid gap-2">
                <Label htmlFor="senha-aluno">Nova senha do titular</Label>
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
                  Mínimo de 8 caracteres. As sessões abertas do titular caem e
                  o e-mail dele fica confirmado.
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
                  <ShieldAlert className="size-4" /> Excluir o ambiente inteiro
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Apaga o login de <strong>todos os membros</strong> (titular
                  e sócios) e tudo que existe no programa (clientes,
                  progresso, reuniões). O cadastro de cada um na base do Time
                  Holding Brasil é preservado. Não tem volta — para digitar{" "}
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
                    onClick={excluirAmbiente}
                    disabled={pending || confirmaExclusao.trim() !== "EXCLUIR"}
                  >
                    <Trash2 className="size-4" /> Excluir ambiente
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

function MembrosView({
  status,
  carregando,
  pending,
  onAdicionarSocio,
  onExcluirMembro,
}: {
  status: StatusAcesso | null;
  carregando: boolean;
  pending: boolean;
  onAdicionarSocio: () => void;
  onExcluirMembro: (m: MembroAcesso) => void;
}) {
  if (carregando) {
    return (
      <p className="text-sm text-muted-foreground">Conferindo o acesso…</p>
    );
  }
  if (!status) return null;

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" />
          {status.qtdMembros > 1
            ? `Ambiente compartilhado — ${status.qtdMembros} pessoas`
            : "Ambiente individual"}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdicionarSocio}
        >
          <UserPlus className="size-4" /> Adicionar sócio
        </Button>
      </div>

      <ul className="grid gap-2">
        {status.membros.map((m) => (
          <li
            key={m.membroId}
            className="flex items-center justify-between gap-2 rounded border px-2.5 py-2 text-sm"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">
                  {m.email ?? "sem e-mail"}
                </span>
                <Badge
                  variant={m.papel === "titular" ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {m.papel === "titular" ? "titular" : "sócio"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {m.temSenha ? "tem senha" : "sem senha"} ·{" "}
                {m.emailConfirmado ? "e-mail confirmado" : "e-mail não confirmado"}
                {m.ultimoAcesso
                  ? ` · último acesso ${new Date(m.ultimoAcesso).toLocaleDateString("pt-BR")}`
                  : " · nunca entrou"}
              </div>
            </div>
            {m.papel === "socio" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() => onExcluirMembro(m)}
              >
                <UserMinus className="size-4" /> Remover
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        {status.ultimoAcesso
          ? `Último acesso do titular: ${new Date(status.ultimoAcesso).toLocaleString("pt-BR")}`
          : "O titular nunca entrou no portal."}
        {status.solicitacaoPendente ? " · há solicitação pendente" : ""}
      </p>
    </div>
  );
}

function AdicionarSocio({
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

  function adicionar() {
    if (!sel) return;
    startTransition(async () => {
      const res = await adicionarSocioAluno(ambienteAlunoId, sel.id, {
        email,
      });
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
          <Button onClick={adicionar} disabled={pending}>
            <UserPlus className="size-4" /> Adicionar como sócio
          </Button>
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
