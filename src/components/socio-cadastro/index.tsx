"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertCircle, TriangleAlert } from "lucide-react";

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
  soDigitos,
} from "@/lib/masks";
import type { SocioPrecisaCadastro } from "@/lib/data/socio-cadastro";
import type {
  SocioCadastroResultado,
} from "@/lib/socio-cadastro-tipos";
import { UFS_BRASIL } from "@/lib/socio-cadastro-tipos";
import { buscarCep } from "@/lib/viacep";
import { razaoParaTravar } from "./travas";

// Público mais velho: rótulo e campo em 16 px, alvo de toque de 44 px.
// (`corpo` é 15 px; por isso `text-base` aqui.)
const ROTULO = "text-base leading-snug";
const CAMPO = "h-11 text-base md:text-base";
const CLASSE_ERRO =
  "flex items-start gap-1.5 text-base leading-snug font-medium text-risco-foreground";
const ICONE_ERRO = "mt-0.5 size-4 shrink-0";

/**
 * O diálogo de cadastro obrigatório do sócio convidado.
 *
 * Molde: `src/components/onboarding/index.tsx` — mesmo padrão do Marcio de
 * diálogo sem escape (sem Esc, sem clique fora, sem "continuar depois"),
 * montado pelo gate. Aqui não há passos: é um formulário único — 10 campos
 * editáveis, não um questionário longo.
 *
 * 🔑 **CEP: busca automática pelo ViaCEP (decisão do Marcio, 15/09/2026,
 * revertendo a decisão anterior registrada aqui).** A objeção original —
 * "é a única tela pela qual o sócio entra no produto; dependência externa
 * nova que pode falhar não pode travar a entrada dele" — segue válida e
 * segue respondida pelo desenho: a busca (`src/lib/viacep.ts`) **nunca
 * lança**, tem timeout de 3 s, roda em paralelo sem bloquear nenhum campo
 * (nenhum `disabled`) e falha em silêncio absoluto (sem toast, sem
 * `role="alert"`, sem vermelho) — o pior caso é a pessoa preencher
 * cidade/UF/bairro/logradouro à mão, exatamente como antes. Dispara sozinha
 * ao completar os 8 dígitos do CEP, só escreve em campo ainda VAZIO (nunca
 * sobrescreve o que a pessoa já digitou) e cancela a busca anterior com
 * `AbortController` se o CEP mudar no meio do caminho.
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

  // 338 (C40–C45): só nome e CPF são obrigatórios; o resto é opcional e,
  // em branco, a RPC mantém o que o cadastro já tem. Sem pré-preenchimento
  // vindo de thb_alunos (pentest, 02/10: convite aceito não prova posse do
  // e-mail).
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

  const [buscandoCep, setBuscandoCep] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Guarda de repetição: os dígitos do CEP da última busca BEM-SUCEDIDA (não
  // da última tentativa) — se a busca falhou, os mesmos 8 dígitos digitados
  // de novo (ex.: corrigiu um erro de digitação e voltou ao original) têm de
  // poder tentar outra vez.
  const ultimoCepBuscadoRef = useRef<string>("");

  // Disparo AUTOMÁTICO assim que os 8 dígitos do CEP são completados — não
  // no onBlur (decisão do Marcio, 15/09/2026). Roda a cada digitação; só age
  // quando `soDigitos(cep).length === 8` e os dígitos mudaram desde a última
  // busca que teve sucesso.
  useEffect(() => {
    const digitos = soDigitos(cep);
    if (digitos.length !== 8) return;
    if (digitos === ultimoCepBuscadoRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBuscandoCep(true);
    buscarCep(cep, controller.signal)
      .then((endereco) => {
        if (controller.signal.aborted) return;
        setBuscandoCep(false);
        if (!endereco) return; // falha em silêncio — nunca avisa o usuário

        ultimoCepBuscadoRef.current = digitos;
        // Só preenche campo VAZIO: nunca sobrescreve o que a pessoa digitou.
        setLogradouro((v) => (v.trim() === "" ? endereco.logradouro : v));
        setBairro((v) => (v.trim() === "" ? endereco.bairro : v));
        setCidade((v) => (v.trim() === "" ? endereco.cidade : v));
        setEstado((v) =>
          v.trim() === "" && UFS_BRASIL.includes(endereco.estado as (typeof UFS_BRASIL)[number])
            ? endereco.estado
            : v,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setBuscandoCep(false);
      });

    return () => controller.abort();
  }, [cep]);

  const payloadAtual = {
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
  };
  const razaoTravado = razaoParaTravar(payloadAtual);

  // Erro POR CAMPO, mostrado só depois do primeiro `onBlur` daquele campo
  // (nunca marcar vermelho quem a pessoa ainda não visitou).
  //
  // 🔑 Reusa `razaoParaTravar` em vez de duplicar a regra: para isolar a
  // mensagem de UM campo, chamamos ela de novo com um payload em que
  // TODOS os campos recebem um valor-âncora sabidamente válido, EXCETO
  // o campo de interesse, que recebe o valor real. Como só ele pode
  // falhar nesse payload, qualquer mensagem devolvida só pode ser dele —
  // isolado dos dois lados (nunca um campo POSTERIOR na ordem de checagem
  // rouba a mensagem, como acontecia numa versão anterior que só isolava
  // os campos ANTERIORES). Isso não reescreve nenhuma regra de
  // `travas.ts`; só troca QUAL payload é testado.
  const [visitados, setVisitados] = useState<
    Partial<Record<keyof typeof payloadAtual, true>>
  >({});
  const marcarVisitado = (campo: keyof typeof payloadAtual) =>
    setVisitados((v) => ({ ...v, [campo]: true }));

  const ANCORA_VALIDA: typeof payloadAtual = {
    nome: "Nome Âncora",
    documento: "111.444.777-35", // CPF com dígitos verificadores válidos
    telefone: "(11) 99999-9999",
    cep: "00000-000",
    cidade: "Âncora",
    estado: "SP",
    bairro: "Âncora",
    logradouro: "Âncora",
    numero: "1",
    pais: "Brasil",
  };
  const ORDEM_CAMPOS: (keyof typeof payloadAtual)[] = [
    "nome",
    "documento",
    "telefone",
    "cep",
    "cidade",
    "estado",
    "bairro",
    "logradouro",
    "numero",
    "pais",
  ];
  function razaoDoCampo(campo: keyof typeof payloadAtual): string {
    const payloadIsolado = { ...ANCORA_VALIDA, [campo]: payloadAtual[campo] };
    return razaoParaTravar(payloadIsolado);
  }
  const erroDeCampo: Partial<Record<keyof typeof payloadAtual, string>> = {};
  for (const campo of ORDEM_CAMPOS) {
    if (!visitados[campo]) continue;
    const razao = razaoDoCampo(campo);
    if (razao) erroDeCampo[campo] = razao;
  }

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
          <DialogDescription className="text-base leading-snug">
            Você foi convidado por {dados.titularNome} ({dados.titularEmail}).
            Preencha seus dados. É só uma vez.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-5">
          <p className="text-base leading-snug text-foreground">
            Só <strong>nome</strong> e <strong>CPF</strong> são obrigatórios.
            O resto é opcional.
          </p>

          <Secao nivel="h3" titulo="Identificação" classeConteudo="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-nome" className={ROTULO}>Nome completo (obrigatório)</Label>
                <Input
                  className={CAMPO}
                  id="sc-nome"
                  name="nome"
                  maxLength={120}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={() => marcarVisitado("nome")}
                  placeholder="Ex.: Maria da Silva"
                  autoComplete="name"
                  aria-invalid={erroDeCampo.nome ? true : undefined}
                  aria-describedby={erroDeCampo.nome ? "sc-nome-erro" : undefined}
                />
                {erroDeCampo.nome ? (
                  <p id="sc-nome-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.nome}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-doc" className={ROTULO}>CPF (obrigatório)</Label>
                <Input
                  className={CAMPO}
                  id="sc-doc"
                  name="documento"
                  value={documento}
                  onChange={(e) => setDocumento(mascaraCpfCnpj(e.target.value))}
                  onBlur={() => marcarVisitado("documento")}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  aria-invalid={erroDeCampo.documento ? true : undefined}
                  aria-describedby={erroDeCampo.documento ? "sc-doc-erro" : undefined}
                />
                {erroDeCampo.documento ? (
                  <p id="sc-doc-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.documento}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sc-email" className={ROTULO}>E-mail de acesso</Label>
              <Input
                className={CAMPO}
                id="sc-email"
                value={emailLogin}
                readOnly
                disabled
              />
              <p className="text-base leading-snug text-muted-foreground">
                É o e-mail do seu login. Não dá para mudar aqui.
              </p>
            </div>
          </Secao>

          <Secao nivel="h3" titulo="Contato" classeConteudo="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sc-tel" className={ROTULO}>Telefone com WhatsApp (opcional)</Label>
              <Input
                className={CAMPO}
                id="sc-tel"
                name="telefone"
                value={telefone}
                onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                onBlur={() => marcarVisitado("telefone")}
                placeholder="(11) 99999-9999"
                inputMode="tel"
                aria-invalid={erroDeCampo.telefone ? true : undefined}
                aria-describedby={erroDeCampo.telefone ? "sc-tel-erro" : undefined}
              />
              {erroDeCampo.telefone ? (
                <p id="sc-tel-erro" className={CLASSE_ERRO}>
                  <AlertCircle aria-hidden className={ICONE_ERRO} />
                  {erroDeCampo.telefone}
                </p>
              ) : null}
            </div>
          </Secao>

          <Secao nivel="h3" titulo="Endereço" classeConteudo="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-cep" className={ROTULO}>CEP (opcional)</Label>
                <Input
                  className={CAMPO}
                  id="sc-cep"
                  name="cep"
                  value={cep}
                  onChange={(e) => setCep(mascaraCep(e.target.value))}
                  onBlur={() => marcarVisitado("cep")}
                  placeholder="00000-000"
                  inputMode="numeric"
                  aria-invalid={erroDeCampo.cep ? true : undefined}
                  aria-describedby={
                    erroDeCampo.cep ? "sc-cep-erro" : undefined
                  }
                />
                {/* Discreto de propósito: falha na busca é silenciosa, então
                    o único feedback visível é "procurando" — nunca "não
                    achei" ou erro. `aria-live="polite"` não interrompe quem
                    usa leitor de tela no meio da digitação. */}
                <p
                  aria-live="polite"
                  className="text-base text-muted-foreground empty:hidden"
                >
                  {buscandoCep ? "Buscando o endereço…" : ""}
                </p>
                {erroDeCampo.cep ? (
                  <p id="sc-cep-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.cep}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-cidade" className={ROTULO}>Cidade (opcional)</Label>
                <Input
                  className={CAMPO}
                  id="sc-cidade"
                  name="cidade"
                  maxLength={120}
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  onBlur={() => marcarVisitado("cidade")}
                  placeholder="Ex.: Belém"
                  aria-invalid={erroDeCampo.cidade ? true : undefined}
                  aria-describedby={
                    erroDeCampo.cidade ? "sc-cidade-erro" : undefined
                  }
                />
                {erroDeCampo.cidade ? (
                  <p id="sc-cidade-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.cidade}
                  </p>
                ) : null}
              </div>
              <div className="grid sm:w-28 gap-1.5">
                <Label htmlFor="sc-uf" className={ROTULO}>Estado (opcional)</Label>
                <select
                  id="sc-uf"
                  name="estado"
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  onBlur={() => marcarVisitado("estado")}
                  className="foco-visivel h-11 rounded-md border border-input bg-card px-2 text-base aria-invalid:border-destructive"
                  aria-invalid={erroDeCampo.estado ? true : undefined}
                  aria-describedby={
                    erroDeCampo.estado ? "sc-uf-erro" : undefined
                  }
                >
                  {/* Selecionável: a UF é opcional desde a 338. */}
                  <option value="">Escolher</option>
                  {UFS_BRASIL.map((sigla) => (
                    <option key={sigla} value={sigla}>
                      {sigla}
                    </option>
                  ))}
                </select>
                {erroDeCampo.estado ? (
                  <p id="sc-uf-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.estado}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-logradouro" className={ROTULO}>Rua ou avenida (opcional)</Label>
                <Input
                  className={CAMPO}
                  id="sc-logradouro"
                  name="logradouro"
                  maxLength={200}
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  onBlur={() => marcarVisitado("logradouro")}
                  placeholder="Ex.: Rua das Flores"
                  aria-invalid={erroDeCampo.logradouro ? true : undefined}
                  aria-describedby={
                    erroDeCampo.logradouro ? "sc-logradouro-erro" : undefined
                  }
                />
                {erroDeCampo.logradouro ? (
                  <p id="sc-logradouro-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.logradouro}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-numero" className={ROTULO}>Número (opcional)</Label>
                <Input
                  className={CAMPO}
                  id="sc-numero"
                  name="numero"
                  maxLength={20}
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  onBlur={() => marcarVisitado("numero")}
                  placeholder="Ex.: 120"
                  aria-invalid={erroDeCampo.numero ? true : undefined}
                  aria-describedby={
                    erroDeCampo.numero ? "sc-numero-erro" : undefined
                  }
                />
                {erroDeCampo.numero ? (
                  <p id="sc-numero-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.numero}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="sc-bairro" className={ROTULO}>Bairro (opcional)</Label>
                <Input
                  className={CAMPO}
                  id="sc-bairro"
                  name="bairro"
                  maxLength={120}
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  onBlur={() => marcarVisitado("bairro")}
                  placeholder="Ex.: Centro"
                  aria-invalid={erroDeCampo.bairro ? true : undefined}
                  aria-describedby={
                    erroDeCampo.bairro ? "sc-bairro-erro" : undefined
                  }
                />
                {erroDeCampo.bairro ? (
                  <p id="sc-bairro-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.bairro}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sc-pais" className={ROTULO}>País (opcional)</Label>
                <Input
                  className={CAMPO}
                  id="sc-pais"
                  name="pais"
                  maxLength={60}
                  value={pais}
                  onChange={(e) => setPais(e.target.value)}
                  onBlur={() => marcarVisitado("pais")}
                  aria-invalid={erroDeCampo.pais ? true : undefined}
                  aria-describedby={
                    erroDeCampo.pais ? "sc-pais-erro" : undefined
                  }
                />
                {erroDeCampo.pais ? (
                  <p id="sc-pais-erro" className={CLASSE_ERRO}>
                    <AlertCircle aria-hidden className={ICONE_ERRO} />
                    {erroDeCampo.pais}
                  </p>
                ) : null}
              </div>
            </div>
          </Secao>

          {state.erro ? (
            <p role="alert" aria-live="assertive" className={CLASSE_ERRO}>
              <AlertCircle aria-hidden className={ICONE_ERRO} />
              {state.erro}
            </p>
          ) : null}

          {/* `cpfDeOutroMembro`: NADA foi gravado nem vinculado (o CPF é de
              outro cadastro — de outro membro ou com outro e-mail, …338) e a
              Central resolve. A tela avisa sem citar
              nome nem ambiente de terceiro, conforme o contrato de
              `SocioCadastroResultado`, e só fecha quando a pessoa confirmar
              que leu (fechar sozinho esconderia o aviso no mesmo instante em
              que ele nasce). */}
          {precisaAvisar ? (
            <div className="grid gap-3 rounded-lg bg-atencao p-4 text-atencao-foreground">
              <p
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 text-base leading-snug font-medium"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
                Este CPF já está em outro cadastro. Fale com a equipe pelo
                Suporte.
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 justify-self-start px-5 text-base"
                onClick={() => setAvisoConfirmado(true)}
              >
                Entendi, continuar
              </Button>
            </div>
          ) : null}

          <div className="grid gap-2">
            {/* A frase única só aparece quando NENHUM campo já mostra o
                próprio erro embaixo dele — evita repetir a mesma mensagem
                duas vezes na tela. Antes do primeiro `onBlur`, ou depois de
                corrigir todos os campos visitados mas ainda faltar algo à
                frente (não visitado), ela é o único aviso disponível. */}
            {razaoTravado && Object.keys(erroDeCampo).length === 0 ? (
              <p
                aria-live="polite"
                className="flex items-start gap-1.5 text-base leading-snug font-medium text-atencao-foreground"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
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
                className="h-11 px-6 text-base"
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
