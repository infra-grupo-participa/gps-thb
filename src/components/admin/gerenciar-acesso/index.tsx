"use client";

/**
 * "Gerenciar acesso" — o diálogo de admin que resolve o acesso de um ambiente:
 * quem entra, com que senha, quem sai e como se apaga o ambiente inteiro.
 *
 * ONDA 3 (09/09/2026) — o arquivo tinha 739 linhas e quatro assuntos juntos
 * (CD5). Foi cortado POR RESPONSABILIDADE, sem uma linha de lógica nova:
 *
 *   membros-view.tsx      quem tem acesso, com o diagnóstico de cada um
 *   adicionar-socio.tsx   vincular um aluno já cadastrado como sócio
 *   senha-de-membro.tsx   a senha de UM membro (F.3)
 *   excluir-ambiente.tsx  a caixa vermelha do "digite EXCLUIR"
 *   dialogos.tsx          remover sócio e "esta conta é usada em outros portais"
 *   tipos.ts              o tipo `Tela`
 *
 * `CredenciaisView` já é compartilhado (CD11) e continua vindo de
 * `components/admin/credenciais-view.tsx` — não há cópia aqui.
 *
 * 🔑 Aqui ficou o que É compartilhado: as CINCO escritas (senha do titular,
 * senha de membro, e-mail de redefinição, remover sócio, excluir ambiente),
 * numa `useTransition` só, e os dois diálogos de confirmação. Eles ficam FORA
 * do `Dialog` principal, com o gatilho montado atrás, para o foco voltar ao
 * botão que os abriu.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Mail } from "lucide-react";
import {
  definirSenhaAluno,
  definirSenhaMembro,
  enviarRedefinicaoSenha,
  excluirAcessoAluno,
  excluirMembroAluno,
  statusAcessoAluno,
  type MembroAcesso,
  type StatusAcesso,
} from "@/app/admin/senha-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputSenha } from "@/components/ui/input-senha";
import { Label } from "@/components/ui/label";
import {
  CredenciaisView,
  sugerirSenha,
  type Credenciais,
} from "@/components/admin/credenciais-view";
import { AdicionarSocio } from "./adicionar-socio";
import { DialogoOutrosPortais, DialogoRemoverSocio } from "./dialogos";
import { ExcluirAmbiente } from "./excluir-ambiente";
import { MembrosView } from "./membros-view";
import { SenhaDeMembro } from "./senha-de-membro";
import type { Tela } from "./tipos";

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
            <SenhaDeMembro
              membroSenha={membroSenha}
              senhaMembro={senhaMembro}
              setSenhaMembro={setSenhaMembro}
              setMembroSenha={setMembroSenha}
              setTela={setTela}
              pending={pending}
              definirSenhaDeMembro={definirSenhaDeMembro}
            />
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

              <ExcluirAmbiente
                pending={pending}
                confirmaExclusao={confirmaExclusao}
                setConfirmaExclusao={setConfirmaExclusao}
                excluirAmbiente={excluirAmbiente}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PL10 — o diálogo fica FORA do `Dialog` principal e o gatilho (a linha
          do sócio) continua montado atrás dele: é assim que o foco volta para
          o botão "Remover" ao cancelar. */}
      {removendo ? (
        <DialogoRemoverSocio
          removendo={removendo}
          pending={pending}
          erroRemocao={erroRemocao}
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
        <DialogoOutrosPortais
          confirmaOutros={confirmaOutros}
          pending={pending}
          onConfirmar={() =>
            definirSenhaDeMembro(confirmaOutros.membro, true)
          }
          onCancelar={() => setConfirmaOutros(null)}
        />
      ) : null}
    </>
  );
}
