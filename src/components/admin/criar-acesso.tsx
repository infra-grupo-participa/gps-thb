"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, KeyRound, TriangleAlert, UserRoundPlus } from "lucide-react";
import {
  buscarAlunos,
  criarAcessoAluno,
  adicionarAlunoGps,
  diagnosticarLoginAluno,
} from "@/app/admin/actions";
import type {
  AlunoBusca,
  AlunoDuplicado,
  DiagnosticoLogin,
} from "@/lib/admin-acesso-tipos";
import { CadastrarAlunoForm } from "@/components/admin/cadastrar-aluno-form";
import {
  CredenciaisView,
  type Credenciais,
} from "@/components/admin/credenciais-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * O CORPO do diálogo "Criar acesso" — busca do aluno, cadastro na base,
 * diagnóstico de login e as credenciais geradas.
 *
 * O botão que abre isto mora em `criar-acesso-botao.tsx` e carrega este
 * módulo por `next/dynamic`: são ~840 linhas (com `CadastrarAlunoForm`) que a
 * maioria das visitas ao `/admin` nunca abre. Por isso o componente é
 * CONTROLADO — quem manda no `open` é o botão.
 */
export function CriarAcessoPainel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AlunoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<AlunoBusca | null>(null);
  const [email, setEmail] = useState("");
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [cadastrando, setCadastrando] = useState(false);
  const [diag, setDiag] = useState<DiagnosticoLogin | null>(null);
  /**
   * O diagnóstico NÃO respondeu (RPC fora do ar, e-mail vazio, sem permissão).
   * Sem isto a tela ficava idêntica à de um e-mail limpo e o admin criava o
   * login sem saber que a conta já existe em outro portal do grupo.
   */
  const [erroDiag, setErroDiag] = useState<string | null>(null);
  /** A frase que a action devolveu, JÁ traduzida. Nunca "Erro ao …". */
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  /**
   * A adoção do login preexistente esperando decisão: os outros programas em
   * que esse mesmo login já é usado. `null` = nada a confirmar.
   */
  const [adocao, setAdocao] = useState<string[] | null>(null);
  /**
   * Esc / clique-fora com a senha ainda na tela: confirma antes de
   * descartar. A senha nao se recupera depois (hash bcrypt).
   */
  const [confirmaDescartarSenha, setConfirmaDescartarSenha] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTermo("");
    setResultados([]);
    setSel(null);
    setEmail("");
    setCredenciais(null);
    setCadastrando(false);
    setDiag(null);
    setErroDiag(null);
    setErroAcao(null);
    setAdocao(null);
    setConfirmaDescartarSenha(false);
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
    setDiag(null);
    setErroDiag(null);
    setErroAcao(null);
    setAdocao(null);
    startTransition(async () => {
      const res = await diagnosticarLoginAluno(a.id, a.email ?? undefined);
      if (res.diagnostico) {
        setDiag(res.diagnostico);
        return;
      }
      // 🔴 Falhou: a tela DIZ que não conferiu. Silêncio aqui é
      // indistinguível de "e-mail limpo, pode criar".
      setErroDiag(res.erro ?? "A conferência não respondeu.");
    });
  }

  /** O cadastro esbarrou num aluno que já existe: volta à busca já apontando nele. */
  async function usarExistente(d: AlunoDuplicado) {
    const termoBusca = d.email ?? d.documento ?? d.nome ?? "";
    setCadastrando(false);
    setTermo(termoBusca);
    setBuscando(true);
    try {
      setResultados(await buscarAlunos(termoBusca));
    } finally {
      setBuscando(false);
    }
  }

  /**
   * "Criar login agora" — em DOIS tempos quando o e-mail já tem conta.
   *
   * 🔴 A primeira chamada vai sempre com `permitirAdocao: false`. Se o e-mail
   * já existir em `auth.users` (compartilhado por 7 portais do grupo), a action
   * volta em `precisaDecisao` **sem ter alterado nada**, com a lista de
   * programas — e só então perguntamos. Adotar o login TROCA A SENHA da pessoa
   * nesses sistemas e derruba as sessões dela: é a mesma decisão que o lote se
   * recusa a tomar 19 vezes num clique, e ela precisa ser nomeada.
   *
   * A segunda chamada (`permitirAdocao: true`) só sai do botão do diálogo.
   */
  function criarLogin(permitirAdocao: boolean) {
    if (!sel) return;
    setErroAcao(null);
    startTransition(async () => {
      const res = await criarAcessoAluno(sel.id, { email, permitirAdocao });
      if (res.erro) {
        const decisao = res as { precisaDecisao?: boolean; programas?: string[] };
        if (!permitirAdocao && decisao.precisaDecisao) {
          // "GPS" é o nome INTERNO deste portal e não aparece para o usuário:
          // a lista nomeia só os outros sistemas afetados.
          setAdocao((decisao.programas ?? []).filter((p) => p !== "GPS"));
          return;
        }
        setAdocao(null);
        setErroAcao(res.erro);
        toast.error(res.erro);
        return;
      }
      setAdocao(null);
      setCredenciais({
        email: res.email!,
        senha: res.senha!,
        precisaConfirmar: res.precisaConfirmar,
        emailEnviado: Boolean(res.emailEnviado),
        // `sel` é o aluno escolhido na busca: é dele o nome e o telefone que
        // alimentam a mensagem e o link de WhatsApp do `CredenciaisView`.
        nome: sel.nome,
        telefone: sel.telefone,
      });
      const outros = (res.programas ?? []).filter((p) => p !== "GPS");
      const base = res.loginAdotado
        ? outros.length > 0
          ? `Login aproveitado — a senha mudou também em: ${outros.join(", ")}.`
          : "Login que já existia foi aproveitado — a senha antiga dele mudou."
        : "Acesso criado.";
      toast.success(
        res.emailEnviado ? base + " Credenciais enviadas por e-mail." : base,
      );
      router.refresh();
    });
  }

  function criarAmbiente() {
    if (!sel) return;
    setErroAcao(null);
    startTransition(async () => {
      const res = await adicionarAlunoGps(sel.id);
      if (res.erro) {
        // A frase já vem traduzida da action; a genérica escondia a instrução.
        setErroAcao(res.erro);
        toast.error(res.erro);
        return;
      }
      toast.success("Ambiente criado. O parceiro pode se cadastrar com o CPF.");
      onOpenChange(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      {/* Reabrir começa do zero pela `key` do botão (o painel remonta), não por
          um `reset()` no fechamento — que faria o conteúdo piscar durante a
          animação de saída. */}
      {/* 🔴 MESMA GUARDA DO `gerenciar-acesso/painel.tsx`: enquanto a senha
          está na tela, Esc e clique-fora pedem confirmação. `auth.users`
          guarda o hash bcrypt — fechada esta tela, a senha não existe mais em
          lugar nenhum. Medido em 11/09/2026: 9 pessoas reais tiveram a senha
          redefinida 2–3 vezes, várias em 15–20 min. */}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v && credenciais) {
            setConfirmaDescartarSenha(true);
            return;
          }
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cadastrando ? "Cadastrar parceiro na base" : "Criar acesso do parceiro"}
            </DialogTitle>
            <DialogDescription>
              {cadastrando
                ? "Preencha os dados do parceiro. Ele será criado no cadastro do Time Holding Brasil."
                : "Busque o parceiro pelo nome, e-mail ou CPF/CNPJ (cadastro do Time Holding Brasil)."}
            </DialogDescription>
          </DialogHeader>

          {cadastrando ? (
            <CadastrarAlunoForm
              termoInicial={termo}
              onVoltar={() => setCadastrando(false)}
              onCadastrado={(a) => {
                setCadastrando(false);
                selecionar(a);
                router.refresh();
              }}
              onUsarExistente={usarExistente}
            />
          ) : credenciais ? (
            <CredenciaisView
              credenciais={credenciais}
              titulo="Acesso criado com sucesso"
              onConcluir={() => {
                onOpenChange(false);
                reset();
              }}
            />
          ) : sel ? (
            <div className="grid gap-4">
              <button
                onClick={() => setSel(null)}
                className="text-left text-xs text-muted-foreground hover:text-foreground"
              >
                ← escolher outro parceiro
              </button>
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">{sel.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {sel.documento ? `CPF/CNPJ: ${sel.documento}` : "sem CPF"} ·{" "}
                  {sel.socioDe
                    ? `sócio(a) de ${sel.socioDe.nome ?? "outro parceiro"}`
                    : sel.jaNoGps
                      ? "já tem ambiente no programa"
                      : "novo no programa"}
                </div>
              </div>

              {/* Sócio: o login já existe e pertence ao ambiente do titular.
                  "Criar login" aqui falharia sempre ("Já existe um registro" /
                  "Este login já pertence a outro ambiente") — caso Marisa
                  Tiedt, 02/10/2026. O caminho certo é Gerenciar acesso, lá. */}
              {sel.socioDe ? (
                <div className="grid gap-3 rounded-lg bg-neutro p-3 text-neutro-foreground">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Info aria-hidden className="size-4 shrink-0" />
                    Esta pessoa é sócia de {sel.socioDe.nome ?? "outro parceiro"}
                  </p>
                  <p className="text-xs">
                    O acesso de sócio se gerencia no ambiente do titular: abra o
                    ambiente, clique em <strong>Gerenciar acesso</strong> e use{" "}
                    <strong>Definir senha</strong> na linha dela.
                  </p>
                  <div>
                    <Link
                      href={`/admin/aluno/${sel.socioDe.alunoId}`}
                      className={buttonVariants({ size: "sm" })}
                      onClick={() => onOpenChange(false)}
                    >
                      Abrir o ambiente de {sel.socioDe.nome ?? "titular"}
                    </Link>
                  </div>
                </div>
              ) : null}

              {/* 🔴 O diagnóstico não respondeu: dizer isso é o mínimo. Criar
                  o login assim mesmo continua possível — o que não pode é o
                  admin achar que a conferência foi feita e deu limpo. */}
              {sel.socioDe ? null : erroDiag ? (
                <AvisoInline>
                  Não foi possível conferir este e-mail nos outros portais do
                  grupo ({erroDiag}) — confira antes de criar, ou tente de novo
                  selecionando o parceiro outra vez.
                </AvisoInline>
              ) : null}

              {!sel.socioDe && diag && !diag.temDireito && (
                <div className="rounded-lg bg-atencao p-3 text-atencao-foreground">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <TriangleAlert aria-hidden className="size-4 shrink-0" />
                    Sem direito ao acesso
                  </p>
                  <p className="mt-1 text-xs">
                    {diag.motivoDireito} O acesso segue o pagamento — libere
                    pelo financeiro antes de criar o login.
                  </p>
                </div>
              )}

              {!sel.socioDe && diag?.temLogin && (
                <div className="rounded-lg bg-neutro p-3 text-neutro-foreground">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Info aria-hidden className="size-4 shrink-0" />
                    Este e-mail já tem login
                  </p>
                  <p className="mt-1 text-xs">
                    {diag.programas.length > 0 ? (
                      <>
                        Já usado em:{" "}
                        {diag.programas.map((p) => p.programa).join(", ")}. O
                        login é o mesmo nos programas — criar o acesso aqui{" "}
                        <strong>troca a senha nos outros também</strong>.
                      </>
                    ) : (
                      <>
                        A conta já existe e será aproveitada.
                      </>
                    )}
                  </p>
                  {diag.programas.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {diag.programas.map((p) => (
                        <Badge key={p.programa} variant="secondary">
                          {p.programa}
                          {p.detalhe ? ` — ${p.detalhe}` : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sel.socioDe ? null : (
              <>
              <div className="grid gap-2">
                <Label htmlFor="ca-email">E-mail do parceiro</Label>
                <Input
                  id="ca-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
                <p className="text-xs text-muted-foreground">
                  Corrija o e-mail aqui se estiver antigo.
                </p>
              </div>

              {/* Sempre montado: região viva que nasce junto com o texto não é
                  anunciada por parte dos leitores de tela. */}
              <p
                role="alert"
                className="text-sm text-destructive empty:hidden"
              >
                {erroAcao}
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => criarLogin(false)}
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
                parceiro entrar. <strong>Só criar ambiente</strong>: o parceiro se
                cadastra depois com o próprio CPF.
              </p>
              </>
              )}
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
                  termo.trim().length >= 2 && !buscando ? (
                    <div className="grid gap-3 py-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        Nenhum parceiro encontrado para{" "}
                        <strong className="text-foreground">
                          {termo.trim()}
                        </strong>
                        .
                      </p>
                      <div>
                        <Button
                          variant="outline"
                          onClick={() => setCadastrando(true)}
                        >
                          <UserRoundPlus className="size-4" /> Cadastrar novo
                          parceiro
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use quando a pessoa ainda não está na base do Time
                        Holding Brasil.
                      </p>
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Digite ao menos 2 caracteres e busque.
                    </p>
                  )
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
                          {a.socioDe ? (
                            <Badge variant="outline" className="text-[10px]">
                              sócio(a) de {a.socioDe.nome ?? "outro parceiro"}
                            </Badge>
                          ) : a.jaNoGps ? (
                            <Badge variant="outline" className="text-[10px]">
                              no programa
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
              {resultados.length > 0 ? (
                <button
                  onClick={() => setCadastrando(true)}
                  className="text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Nenhum destes? Cadastrar novo parceiro
                </button>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 🔴 A adoção do login preexistente, nomeando os sistemas. Só chega aqui
          depois de a action ter voltado em `precisaDecisao` — ou seja, nada
          foi alterado ainda. O botão diz o que vai acontecer, não "OK". */}
      {adocao ? (
        <DialogoConfirmacao
          aberto
          titulo="Aproveitar o login que já existe?"
          descricao={`${sel?.nome ?? "Este parceiro"} · ${email}`}
          consequencia={
            adocao.length > 0 ? (
              <>
                Aproveitar esse login <strong>troca a senha da pessoa em: </strong>
                <strong>{adocao.join(", ")}</strong> e derruba as sessões dela nesses sistemas.
                <br />
                <br />
                Avise a pessoa: o sistema não avisa por conta própria.
              </>
            ) : (
              <>
                A conta existe, mas ainda não está em nenhum outro programa.
                Aproveitá-la <strong>troca a senha atual</strong> dela e derruba
                as sessões abertas — avise a pessoa.
              </>
            )
          }
          rotuloConfirmar="Aproveitar e trocar a senha"
          rotuloConfirmando="Aproveitando…"
          confirmando={pending}
          onConfirmar={() => criarLogin(true)}
          onCancelar={() => {
            if (pending) return;
            setAdocao(null);
          }}
        />
      ) : null}

      {/* Esc / clique-fora com a senha ainda na tela. */}
      {confirmaDescartarSenha ? (
        <DialogoConfirmacao
          aberto
          titulo="Fechar sem copiar a senha?"
          descricao={
            <>
              A senha de <strong>{credenciais?.email}</strong> só aparece aqui, agora.
            </>
          }
          consequencia={
            <>
              Depois de fechar, <strong>ninguém consegue ver esta senha de
              novo</strong> — nem a equipe.
            </>
          }
          rotuloConfirmar="Fechar mesmo assim"
          rotuloCancelar="Voltar e copiar"
          onConfirmar={() => {
            setConfirmaDescartarSenha(false);
            onOpenChange(false);
          }}
          onCancelar={() => setConfirmaDescartarSenha(false)}
        />
      ) : null}
    </>
  );
}
