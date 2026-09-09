"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyRound,
  Mail,
  ShieldAlert,
  Trash2,
  Users,
  UserPlus,
  UserMinus,
} from "lucide-react";
import {
  adicionarSocioAluno,
  definirSenhaAluno,
  definirSenhaMembro,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  CredenciaisView,
  sugerirSenha,
  type Credenciais,
} from "@/components/admin/credenciais-view";
import { formatarData, formatarDataHora } from "@/lib/datas";

type Tela = "principal" | "adicionar-socio" | "senha-membro";

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
  /** Sócio aguardando confirmação de remoção (PL10). `null` = diálogo fechado. */
  const [removendo, setRemovendo] = useState<MembroAcesso | null>(null);
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);
  /**
   * F.3 — o membro cuja senha está sendo definida (`tela === "senha-membro"`).
   * Antes disto o admin via "sem senha / nunca entrou" ao lado de cada sócio
   * e o único remédio era **remover e re-adicionar**, o que apaga o login e o
   * histórico da pessoa. São 13 sócios reais.
   */
  const [membroSenha, setMembroSenha] = useState<MembroAcesso | null>(null);
  const [senhaMembro, setSenhaMembro] = useState("");
  /**
   * Pentest de 09/09: a conta do membro pode ser privilegiada em OUTRO portal
   * do grupo (`auth.users` é compartilhado por 7 sistemas). A action devolve
   * `precisaConfirmar` **sem ter mudado nada**; só depois do "sim" ela repete
   * com `confirmarOutrosSistemas`.
   */
  const [confirmaOutros, setConfirmaOutros] = useState<{
    membro: MembroAcesso;
    programas: string[];
  } | null>(null);
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
    setRemovendo(null);
    setErroRemocao(null);
    setMembroSenha(null);
    setConfirmaOutros(null);
    setSenha(sugerirSenha());
    carregarStatus();
  }

  /** Abre a tela de senha de UM membro (titular ou sócio) do ambiente. */
  function abrirSenhaDeMembro(m: MembroAcesso) {
    setMembroSenha(m);
    setSenhaMembro(sugerirSenha());
    setConfirmaOutros(null);
    setTela("senha-membro");
  }

  /**
   * `confirmarOutrosSistemas` só vai `true` depois que o admin leu quais são
   * os outros portais e confirmou. Enquanto for `false`, a action pode voltar
   * sem ter tocado em nada.
   */
  function definirSenhaDeMembro(m: MembroAcesso, confirmarOutros = false) {
    startTransition(async () => {
      const res = await definirSenhaMembro(m.membroId, {
        senha: senhaMembro,
        confirmarOutrosSistemas: confirmarOutros || undefined,
      });
      if (res.precisaConfirmar) {
        setConfirmaOutros({ membro: m, programas: res.programas ?? [] });
        return;
      }
      if (res.erro) {
        toast.error(res.erro);
        return;
      }
      setConfirmaOutros(null);
      setCredenciais({
        email: res.email!,
        senha: res.senha!,
        emailEnviado: Boolean(res.emailEnviado),
        nome: res.nome ?? null,
        telefone: res.telefone ?? null,
      });
      toast.success(
        res.papel === "titular"
          ? "Senha do titular definida. Ele já pode entrar agora."
          : "Senha do sócio definida. Ele já pode entrar agora.",
      );
      carregarStatus();
      router.refresh();
    });
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
          // "GPS" é nome interno (schema, repo, identificador) e não aparece
          // para o usuário desde a decisão de marca de 09/07.
          : "Ambiente excluído (não havia login).",
      );
      setOpen(false);
      router.push("/admin");
      router.refresh();
    });
  }

  // PL10 — remover sócio apaga o LOGIN da pessoa, e ficava a um clique, ao
  // lado de "Excluir ambiente", que exige digitar EXCLUIR. Duas ações
  // irreversíveis não podem ter dois níveis de atrito opostos.
  function excluirMembro(m: MembroAcesso) {
    setErroRemocao(null);
    startTransition(async () => {
      const res = await excluirMembroAluno(m.membroId);
      if (res.erro) {
        setErroRemocao(res.erro);
        toast.error(res.erro);
        return;
      }
      setRemovendo(null);
      toast.success(`${m.email ?? "Sócio"} removido do ambiente.`);
      carregarStatus();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={abrir}
        className="previa-oculta"
      >
        <KeyRound className="size-4" /> Gerenciar acesso
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tela === "adicionar-socio"
                ? "Adicionar sócio ao ambiente"
                : tela === "senha-membro"
                  ? "Definir a senha deste membro"
                  : "Acesso do ambiente"}
            </DialogTitle>
            <DialogDescription>
              {tela === "adicionar-socio"
                ? "Vincule um aluno já cadastrado como sócio deste ambiente."
                : tela === "senha-membro"
                  ? `${membroSenha?.email ?? "Membro sem e-mail"} — ${
                      membroSenha?.papel === "titular" ? "titular" : "sócio"
                    } deste ambiente.`
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
          ) : tela === "senha-membro" && membroSenha ? (
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
                  Mínimo de 8 caracteres. As sessões abertas desta pessoa caem
                  e o e-mail dela fica confirmado. O login vale para todos os
                  portais do grupo.
                </p>
              </div>
              <Button
                onClick={() => definirSenhaDeMembro(membroSenha)}
                disabled={pending || senhaMembro.trim().length < 8}
              >
                <KeyRound className="size-4" /> Definir senha agora
              </Button>
            </div>
          ) : (
            <div className="grid gap-5">
              <MembrosView
                status={status}
                carregando={carregando}
                pending={pending}
                onAdicionarSocio={() => setTela("adicionar-socio")}
                onExcluirMembro={(m) => {
                  setErroRemocao(null);
                  setRemovendo(m);
                }}
                onDefinirSenhaMembro={abrirSenhaDeMembro}
              />

              <div className="grid gap-2">
                <Label htmlFor="senha-aluno">Nova senha do titular</Label>
                <div className="flex gap-2">
                  <InputSenha
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

      {/* PL10 — o diálogo fica FORA do `Dialog` principal e o gatilho (a linha
          do sócio) continua montado atrás dele: é assim que o foco volta para
          o botão "Remover" ao cancelar. */}
      {removendo ? (
        <DialogoConfirmacao
          aberto
          titulo="Remover este sócio do ambiente?"
          descricao={`${removendo.email ?? "Sócio sem e-mail"} · sócio deste ambiente`}
          consequencia={
            <>
              Remove o acesso de{" "}
              <strong>{removendo.email ?? "este sócio"}</strong> a este ambiente
              e <strong>apaga o login dele</strong>. Os clientes, o progresso e
              o histórico do ambiente continuam com o titular. Não dá para
              desfazer: para voltar, é preciso adicionar o sócio de novo e
              definir uma senha nova.
            </>
          }
          rotuloConfirmar="Remover sócio"
          rotuloConfirmando="Removendo…"
          confirmando={pending}
          erro={erroRemocao}
          onConfirmar={() => excluirMembro(removendo)}
          onCancelar={() => {
            setRemovendo(null);
            setErroRemocao(null);
          }}
        />
      ) : null}

      {/* A conta do membro também é usada em outro portal do grupo. A action
          voltou SEM ter mudado nada; é aqui que o admin decide. */}
      {confirmaOutros ? (
        <DialogoConfirmacao
          aberto
          destrutivo={false}
          titulo="Esta conta é usada em outros portais"
          descricao={confirmaOutros.membro.email ?? "Membro sem e-mail"}
          consequencia={
            <>
              Esta conta também é usada em:{" "}
              <strong>{confirmaOutros.programas.join(", ")}</strong>. Trocar a
              senha aqui derruba as sessões dela em todos os portais e a senha
              antiga deixa de funcionar em qualquer um deles. Avise a pessoa.
            </>
          }
          rotuloConfirmar="Trocar mesmo assim"
          rotuloConfirmando="Trocando…"
          confirmando={pending}
          onConfirmar={() =>
            definirSenhaDeMembro(confirmaOutros.membro, true)
          }
          onCancelar={() => setConfirmaOutros(null)}
        />
      ) : null}
    </>
  );
}

function MembrosView({
  status,
  carregando,
  pending,
  onAdicionarSocio,
  onExcluirMembro,
  onDefinirSenhaMembro,
}: {
  status: StatusAcesso | null;
  carregando: boolean;
  pending: boolean;
  onAdicionarSocio: () => void;
  onExcluirMembro: (m: MembroAcesso) => void;
  /** F.3 — abre a tela de senha do membro (só quem já tem login). */
  onDefinirSenhaMembro: (m: MembroAcesso) => void;
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
            className="flex flex-wrap items-center justify-between gap-2 rounded border px-2.5 py-2 text-sm"
          >
            {/* `flex-wrap` + `min-w-0`: com dois botões rotulados na linha
                (Definir senha · Remover) e um e-mail longo, no diálogo do
                celular a linha quebra em vez de espremer o e-mail a 3 letras. */}
            <div className="min-w-0 flex-1">
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
                  ? ` · último acesso ${formatarData(m.ultimoAcesso)}`
                  : " · nunca entrou"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Sem `userId` não há conta em `auth.users` para receber senha:
                  o botão SOME em vez de aparecer desabilitado sem explicação —
                  o diagnóstico da linha acima já diz "sem senha/nunca entrou". */}
              {m.userId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDefinirSenhaMembro(m)}
                >
                  <KeyRound className="size-4" /> Definir senha
                </Button>
              ) : null}
              {m.papel === "socio" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={pending}
                  onClick={() => onExcluirMembro(m)}
                >
                  <UserMinus className="size-4" /> Remover
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-muted-foreground">
        {status.ultimoAcesso
          ? `Último acesso do titular: ${formatarDataHora(status.ultimoAcesso)}`
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
