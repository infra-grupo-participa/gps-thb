"use client";

import { useActionState, useState } from "react";

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
import { Secao } from "@/components/ui/secao";
import { LogoutButton } from "@/components/logout-button";
import {
  mascaraCep,
  mascaraCpfCnpj,
  mascaraTelefone,
} from "@/lib/masks";
import type { SocioPrecisaCadastro } from "@/lib/data/socio-cadastro";
import type {
  SocioCadastroResultado,
} from "@/lib/socio-cadastro-tipos";
import { UFS_BRASIL } from "@/lib/socio-cadastro-tipos";
import { razaoParaTravar } from "./travas";

/**
 * O diálogo de cadastro obrigatório do sócio convidado.
 *
 * Molde: `src/components/onboarding/index.tsx` — mesmo padrão do Marcio de
 * diálogo sem escape (sem Esc, sem clique fora, sem "continuar depois"),
 * montado pelo gate. Aqui não há passos: é um formulário único — 10 campos
 * editáveis, não um questionário longo.
 *
 * 🔑 **CEP: só máscara, sem busca automática.** Decidido — não criar fetch ao
 * ViaCEP aqui. É a única tela pela qual o sócio entra no produto; dependência
 * externa nova que pode falhar não pode travar a entrada dele.
 *
 * 🔴 **E-mail é `readOnly`**, preenchido com o e-mail do login — evita
 * divergência entre e-mail de contato e de acesso (decisão do Marcio).
 *
 * 🔴 **Não devolver `null` quando conclui.** `gravarCadastroSocio` revalida o
 * layout; o gate re-renderiza e decidiria "não precisa mais" — mas quem
 * decide "abrir ou não" é o `portal-lazy`, uma vez na montagem (mesmo defeito
 * do Auditor F documentado em `onboarding-gate.tsx:117-122`). Este componente
 * controla só a UI local (`concluido`, calculado direto do `state` da
 * action — sem `useEffect`/setState em cascata), nunca sai do ar sozinho por
 * conta de revalidação.
 */
export function SocioCadastro({
  dados,
  emailLogin,
  acao,
}: {
  dados: SocioPrecisaCadastro;
  /** O e-mail da sessão atual (do login), não editável. */
  emailLogin: string;
  /** `gravarCadastroSocio(_prev, formData)` — assinatura de `useActionState`. */
  acao: (
    prev: SocioCadastroResultado,
    formData: FormData,
  ) => Promise<SocioCadastroResultado>;
}) {
  const [state, formAction, pendente] = useActionState(acao, { ok: false });
  // Só existe para o botão "Continuar" do aviso de `cpfDeOutroMembro" — o
  // sucesso SEM aviso fecha direto, derivado do próprio `state` (sem
  // `useEffect`/setState em cascata: `aberto` abaixo é cálculo puro).
  const [avisoConfirmado, setAvisoConfirmado] = useState(false);

  const precisaAvisar = state.ok && Boolean(state.cpfDeOutroMembro);
  // `cpfDeOutroMembro` pede aviso lido pela pessoa antes de sumir da tela —
  // fechar direto esconderia o aviso no mesmo instante em que ele nasce.
  const concluido = state.ok && (!precisaAvisar || avisoConfirmado);

  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cep, setCep] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [bairro, setBairro] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [pais, setPais] = useState("Brasil");

  const razaoTravado = razaoParaTravar({
    nome,
    documento,
    telefone,
    cep,
    cidade,
    estado,
    bairro,
    logradouro,
    numero,
    pais,
  });

  return (
    <Dialog
      open={!concluido}
      onOpenChange={(v) => {
        // Sem Esc, sem clique fora: o cadastro é obrigatório. A única saída
        // antes de concluir é "Sair" (logout), no rodapé.
        if (!v) return;
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="font-heading titulo-h2">
            Complete o seu cadastro
          </DialogTitle>
          <DialogDescription>
            Você foi convidado por {dados.titularNome} · {dados.titularEmail}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-5">
          <Secao nivel="h3" titulo="Identificação" classeConteudo="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-nome">Nome completo *</Label>
                <Input
                  id="sc-nome"
                  name="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-doc">CPF *</Label>
                <Input
                  id="sc-doc"
                  name="documento"
                  value={documento}
                  onChange={(e) => setDocumento(mascaraCpfCnpj(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sc-email">E-mail (do seu acesso)</Label>
              <Input id="sc-email" value={emailLogin} readOnly disabled />
              <p className="corpo-sm text-muted-foreground">
                É o e-mail do seu acesso — por isso não pode ser alterado aqui.
              </p>
            </div>
          </Secao>

          <Secao nivel="h3" titulo="Contato" classeConteudo="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sc-tel">Telefone / WhatsApp *</Label>
              <Input
                id="sc-tel"
                name="telefone"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                placeholder="(11) 99999-9999"
                inputMode="tel"
              />
            </div>
          </Secao>

          <Secao nivel="h3" titulo="Endereço" classeConteudo="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-cep">CEP *</Label>
                <Input
                  id="sc-cep"
                  name="cep"
                  value={cep}
                  onChange={(e) => setCep(mascaraCep(e.target.value))}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-cidade">Cidade *</Label>
                <Input
                  id="sc-cidade"
                  name="cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>
              <div className="grid w-20 gap-1.5">
                <Label htmlFor="sc-uf">UF *</Label>
                <select
                  id="sc-uf"
                  name="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="foco-visivel h-9 rounded-md border border-input bg-card px-2 corpo-sm"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {UFS_BRASIL.map((sigla) => (
                    <option key={sigla} value={sigla}>
                      {sigla}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-logradouro">Endereço *</Label>
                <Input
                  id="sc-logradouro"
                  name="logradouro"
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  placeholder="Rua ..."
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-numero">Número *</Label>
                <Input
                  id="sc-numero"
                  name="numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-bairro">Bairro *</Label>
                <Input
                  id="sc-bairro"
                  name="bairro"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-pais">País *</Label>
                <Input
                  id="sc-pais"
                  name="pais"
                  value={pais}
                  onChange={(e) => setPais(e.target.value)}
                />
              </div>
            </div>
          </Secao>

          {state.erro ? (
            <p role="alert" aria-live="assertive" className="corpo-sm text-destructive">
              {state.erro}
            </p>
          ) : null}

          {/* `cpfDeOutroMembro`: os dados foram gravados mesmo assim (o CPF já
              pertencia a outro membro do programa) — a tela avisa sem citar
              nome nem ambiente de terceiro, conforme o contrato de
              `SocioCadastroResultado`, e só fecha quando a pessoa confirmar
              que leu (fechar sozinho esconderia o aviso no mesmo instante em
              que ele nasce). */}
          {precisaAvisar ? (
            <div className="grid gap-2 rounded-lg bg-atencao p-3 text-atencao-foreground">
              <p role="alert" aria-live="polite" className="corpo-sm">
                Seus dados foram salvos. O CPF informado já está associado a
                outro cadastro do programa — se isso não for esperado, avise
                a equipe pelo Suporte.
              </p>
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={() => setAvisoConfirmado(true)}
              >
                Continuar
              </Button>
            </div>
          ) : null}

          <div className="grid gap-2">
            {razaoTravado ? (
              <p aria-live="polite" className="corpo-sm text-atencao-foreground">
                {razaoTravado}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* O `LogoutButton` mora no `AppHeader`, que fica ATRÁS do
                  modal — sem este botão o sócio fica sem saída. Mesmo
                  mecanismo de `logout-button.tsx`; não trocar. */}
              <LogoutButton linkStyle />
              <Button
                type="submit"
                disabled={Boolean(razaoTravado) || pendente}
                aria-busy={pendente || undefined}
              >
                {pendente ? "Salvando…" : "Salvar e entrar"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
