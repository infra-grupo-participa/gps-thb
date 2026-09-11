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
 *
 * ONDA 4 (09/09/2026) — este arquivo era o `index.tsx` e trazia o botão junto.
 * O botão saiu para `index.tsx` e carrega este módulo por `next/dynamic`: são
 * ~1.400 linhas somando os seis arquivos da pasta, mais `credenciais-view` e
 * `admin/senha-actions`, que a maioria das aberturas do Modo Assistência nunca
 * usa. O componente é CONTROLADO — quem manda no `open` é o botão.
 */

import { useEffect, useState, useTransition } from "react";
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
  trocarEmailLogin,
} from "@/app/admin/senha-actions";
import type { MembroAcesso, StatusAcesso } from "@/lib/acesso-tipos";
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
import { SENHA_MINIMO } from "@/lib/senha-regras";
import {
  CredenciaisView,
  sugerirSenha,
  type Credenciais,
} from "@/components/admin/credenciais-view";
import { AdicionarSocio } from "./adicionar-socio";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  DialogoOutrosPortais,
  DialogoRemoverSocio,
  DialogoTrocarEmail,
} from "./dialogos";
import { EmailDeMembro } from "./email-de-membro";
import { ExcluirAmbiente } from "./excluir-ambiente";
import { MembrosView } from "./membros-view";
import { SenhaDeMembro } from "./senha-de-membro";
import type { Tela } from "./tipos";

export function GerenciarAcessoPainel({
  alunoId,
  nomeAluno,
  open,
  onOpenChange,
}: {
  alunoId: string;
  nomeAluno?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [tela, setTela] = useState<Tela>("principal");
  const [status, setStatus] = useState<StatusAcesso | null>(null);
  /**
   * Nasce `true`: este componente só é montado no clique que abre o diálogo, e
   * a primeira coisa que ele faz é buscar o status. Começar em `false` faria a
   * tela piscar "sem dados" antes do primeiro `render` do carregamento.
   */
  const [carregando, setCarregando] = useState(true);
  const [senha, setSenha] = useState(sugerirSenha);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  /**
   * Esc / clique-fora com a senha na tela: confirma antes de descartar.
   * A senha não se recupera depois (hash bcrypt) — ver o comentário no
   * `<Dialog>` lá embaixo.
   */
  const [confirmaDescartarSenha, setConfirmaDescartarSenha] = useState(false);
  /**
   * A senha do SÓCIO recém-adicionado mora no estado de `AdicionarSocio`, não
   * aqui — mas o `Dialog` é deste arquivo. Sem este sinal, Esc e clique-fora
   * na tela do sócio fechariam tudo e a senha sumiria sem aviso.
   */
  const [senhaDeSocioNaTela, setSenhaDeSocioNaTela] = useState(false);
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
  /**
   * Troca de e-mail do login (11/09/2026, molde de F.3). `membroEmail` é o
   * membro cujo e-mail está sendo trocado (`tela === "email-membro"`);
   * `gerarSenha`/`alinharCadastro` nascem marcados (pedido literal do
   * Marcio) e são desmarcáveis. `confirmaEmailOutros` guarda a confirmação
   * pendente (outro portal, ou e-mail já em uso) ANTES de qualquer escrita —
   * mesmo contrato de `confirmaOutros` acima.
   */
  const [membroEmail, setMembroEmail] = useState<MembroAcesso | null>(null);
  const [emailNovo, setEmailNovo] = useState("");
  const [gerarSenha, setGerarSenha] = useState(true);
  const [alinharCadastro, setAlinharCadastro] = useState(true);
  const [confirmaEmailOutros, setConfirmaEmailOutros] = useState<{
    membro: MembroAcesso;
    programas: string[];
    emailJaEmUso: boolean;
    erro: string | null;
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

  /**
   * O `abrir()` antigo (que zerava as sete peças de estado e buscava o status)
   * virou DUAS coisas:
   *   - o zerar → o `index.tsx` remonta este painel a cada abertura, com uma
   *     `key` nova; o estado inicial de cada `useState` JÁ é o estado zerado;
   *   - a busca → este efeito, que roda uma vez por montagem.
   * Nenhum `setState` síncrono no corpo do efeito: os dois só acontecem nos
   * callbacks da promessa (`carregando` já nasce `true`).
   */
  useEffect(() => {
    let vivo = true;
    statusAcessoAluno(alunoId)
      .then((res) => {
        if (!vivo) return;
        if (res.erro) toast.error(res.erro);
        setStatus(res.status ?? null);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [alunoId]);

  /** Abre a tela de senha de UM membro (titular ou sócio) do ambiente. */
  function abrirSenhaDeMembro(m: MembroAcesso) {
    setMembroSenha(m);
    setSenhaMembro(sugerirSenha());
    setConfirmaOutros(null);
    setTela("senha-membro");
  }

  /** Abre a tela de troca de e-mail do login de UM membro do ambiente. */
  function abrirEmailDeMembro(m: MembroAcesso) {
    setMembroEmail(m);
    setEmailNovo("");
    setGerarSenha(true);
    setAlinharCadastro(true);
    setConfirmaEmailOutros(null);
    setTela("email-membro");
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

  /**
   * Espelha `definirSenhaDeMembro` linha a linha. `confirmarOutros` só vai
   * `true` depois que o admin leu os portais e confirmou — a action pode
   * voltar sem ter tocado em nada até lá.
   */
  function trocarEmailDeMembro(m: MembroAcesso, confirmarOutros = false) {
    startTransition(async () => {
      const res = await trocarEmailLogin(m.membroId, emailNovo, {
        alinharCadastro,
        confirmarOutrosSistemas: confirmarOutros || undefined,
        senha: gerarSenha ? undefined : null,
      });
      if (res.precisaConfirmar) {
        setConfirmaEmailOutros({
          membro: m,
          programas: res.programas ?? [],
          emailJaEmUso: false,
          erro: null,
        });
        return;
      }
      if (res.erro) {
        if (res.emailJaEmUso) {
          setConfirmaEmailOutros({
            membro: m,
            programas: [],
            emailJaEmUso: true,
            erro: res.erro,
          });
          return;
        }
        toast.error(res.erro);
        return;
      }
      setConfirmaEmailOutros(null);
      if (res.senha) {
        setCredenciais({
          email: res.emailNovo!,
          senha: res.senha,
          emailEnviado: Boolean(res.emailEnviado),
          nome: res.nome ?? null,
          telefone: res.telefone ?? null,
        });
      }
      toast.success(
        `E-mail do login trocado para ${res.emailNovo}.` +
          (res.senha ? " Senha nova gerada." : ""),
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
      toast.success("Senha definida. O parceiro já pode entrar agora.");
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

  function excluirAmbiente(confirmarPerda = false) {
    startTransition(async () => {
      const res = await excluirAcessoAluno(alunoId, confirmarPerda);
      if (res.erro) {
        // 🔴 P0004: o ambiente TEM conteúdo e ninguém confirmou a perda.
        // Não é erro — é a pergunta que faltava. Em 10/09/2026 a exclusão
        // de um ambiente levou 30 clientes sem que ninguém fosse avisado.
        if (res.precisaConfirmarPerda && res.conteudo) {
          const c = res.conteudo;
          const partes = [
            c.clientes > 0 ? `${c.clientes} cliente(s)` : null,
            c.progresso > 0 ? `${c.progresso} tarefa(s)` : null,
            c.notas > 0 ? `${c.notas} nota(s)` : null,
            c.chamados > 0 ? `${c.chamados} chamado(s)` : null,
          ].filter(Boolean);
          toast.warning("Este ambiente tem conteúdo.", {
            description: `${partes.join(" · ")}. Excluir apaga isso do portal — o conteúdo fica guardado na lixeira, mas o parceiro perde tudo na tela.`,
            duration: 30_000,
            action: {
              label: "Excluir mesmo assim",
              onClick: () => excluirAmbiente(true),
            },
          });
          return;
        }
        toast.error(res.erro);
        return;
      }
      if (res.loginApagado) {
        toast.success(
          "Ambiente e todos os logins (titular e sócios) excluídos por completo.",
        );
      } else if (res.loginPreservadoMotivo) {
        // …217: o login tem registros em outro portal do grupo e FICOU; só o
        // ambiente do programa saiu. Antes a função abortava tudo dizendo que
        // tinha limpado — a tela precisa dizer o que de fato aconteceu.
        toast.warning("Ambiente excluído; o login foi preservado.", {
          description: res.loginPreservadoMotivo,
          duration: 10_000,
        });
      } else {
        // "GPS" é nome interno (schema, repo, identificador) e não aparece
        // para o usuário desde a decisão de marca de 09/07.
        toast.success("Ambiente excluído (não havia login).");
      }
      onOpenChange(false);
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
      {/* O botão que abre isto mora no `index.tsx` — ele fica no HTML inicial;
          este módulo só chega depois do clique. */}
      {/* 🔴 ENQUANTO A SENHA ESTÁ NA TELA, O DIÁLOGO NÃO FECHA POR ACIDENTE.
          Medido em 11/09/2026: 9 pessoas REAIS tiveram a senha redefinida
          2–3 vezes, várias com 15–20 min de intervalo (Álvaro 17:25→17:39,
          Marco Túlio 15:26→15:46, Flávia 13:56→14:15). É o sintoma de
          "gerei a senha, fechei sem anotar, gerei de novo".

          A senha só existe NESTE render: `auth.users` guarda o hash bcrypt,
          que é irreversível — fechada a tela, ninguém no mundo a recupera,
          nem admin, nem eu, nem o Supabase. E o `key={abertura}` do
          `index.tsx` remonta o painel a cada abertura, então reabrir traz
          `credenciais = null`.

          Por isso Esc e clique-fora passam a pedir confirmação enquanto
          houver credencial viva. "Concluir" continua fechando direto — ali o
          admin está dizendo que já copiou. */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && (credenciais || senhaDeSocioNaTela)) {
            setConfirmaDescartarSenha(true);
            return;
          }
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tela === "adicionar-socio"
                ? "Adicionar sócio ao ambiente"
                : tela === "senha-membro"
                  ? "Definir a senha deste membro"
                  : tela === "email-membro"
                    ? "Trocar o e-mail do login"
                    : "Acesso do ambiente"}
            </DialogTitle>
            <DialogDescription>
              {tela === "adicionar-socio"
                ? "Vincule um parceiro já cadastrado como sócio deste ambiente."
                : tela === "senha-membro"
                  ? `${membroSenha?.email ?? "Membro sem e-mail"} — ${
                      membroSenha?.papel === "titular" ? "titular" : "sócio"
                    } deste ambiente.`
                  : tela === "email-membro"
                    ? `${membroEmail?.email ?? "Membro sem e-mail"} — ${
                        membroEmail?.papel === "titular" ? "titular" : "sócio"
                      } deste ambiente.`
                    : `${nomeAluno ?? "Parceiro"} — defina a senha na hora, sem depender de e-mail.`}
            </DialogDescription>
          </DialogHeader>

          {tela === "adicionar-socio" ? (
            <AdicionarSocio
              ambienteAlunoId={alunoId}
              onCredenciais={setSenhaDeSocioNaTela}
              onVoltar={() => {
                setSenhaDeSocioNaTela(false);
                setTela("principal");
                carregarStatus();
              }}
              onAdicionado={() => {
                setSenhaDeSocioNaTela(false);
                setTela("principal");
                carregarStatus();
                router.refresh();
              }}
            />
          ) : credenciais ? (
            <CredenciaisView
              credenciais={credenciais}
              onConcluir={() => onOpenChange(false)}
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
          ) : tela === "email-membro" && membroEmail ? (
            <EmailDeMembro
              membroEmail={membroEmail}
              emailNovo={emailNovo}
              setEmailNovo={setEmailNovo}
              gerarSenha={gerarSenha}
              setGerarSenha={setGerarSenha}
              alinharCadastro={alinharCadastro}
              setAlinharCadastro={setAlinharCadastro}
              setMembroEmail={setMembroEmail}
              setTela={setTela}
              pending={pending}
              trocarEmailDeMembro={trocarEmailDeMembro}
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
                onTrocarEmail={abrirEmailDeMembro}
              />

              <div className="grid gap-2">
                <Label htmlFor="senha-parceiro">Nova senha do titular</Label>
                <div className="flex gap-2">
                  <InputSenha
                    id="senha-parceiro"
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
                  Mínimo de {SENHA_MINIMO} caracteres. As sessões abertas do titular caem e
                  o e-mail dele fica confirmado.
                </p>
                <Button
                  onClick={definirSenha}
                  disabled={pending || senha.trim().length < SENHA_MINIMO}
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

      {/* Confirma a troca de e-mail do login — ou, se o e-mail já está em
          uso por outra conta, avisa sem botão de confirmar (PL10, gatilho
          montado atrás: a tela de e-mail continua aberta). */}
      {confirmaEmailOutros ? (
        <DialogoTrocarEmail
          emailAntigo={membroEmail?.email ?? null}
          emailNovo={emailNovo.trim().toLowerCase()}
          programas={confirmaEmailOutros.programas}
          gerarSenha={gerarSenha}
          alinharCadastro={alinharCadastro}
          emailJaEmUso={confirmaEmailOutros.emailJaEmUso}
          pending={pending}
          erro={confirmaEmailOutros.erro}
          onConfirmar={() =>
            trocarEmailDeMembro(confirmaEmailOutros.membro, true)
          }
          onCancelar={() => setConfirmaEmailOutros(null)}
        />
      ) : null}

      {/* Esc / clique-fora com a senha ainda na tela. Fora do `Dialog`
          principal pela mesma razão do PL10: o foco volta para dentro do
          painel ao cancelar, em vez de se perder. */}
      {confirmaDescartarSenha ? (
        <DialogoConfirmacao
          aberto
          titulo="Fechar sem copiar a senha?"
          descricao={
            <>
              A senha de <strong>{credenciais?.email}</strong> só aparece
              aqui, agora. O sistema guarda a senha cifrada, e cifra não se
              desfaz.
            </>
          }
          consequencia={
            <>
              Depois de fechar, <strong>ninguém consegue ver esta senha de
              novo</strong> — nem a equipe. Para dar acesso à pessoa será
              preciso definir outra.
            </>
          }
          rotuloConfirmar="Fechar mesmo assim"
          rotuloCancelar="Voltar e copiar"
          onConfirmar={() => {
            setConfirmaDescartarSenha(false);
            setSenhaDeSocioNaTela(false);
            onOpenChange(false);
          }}
          onCancelar={() => setConfirmaDescartarSenha(false)}
        />
      ) : null}
    </>
  );
}
