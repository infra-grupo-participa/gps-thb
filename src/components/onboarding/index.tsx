"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mascaraMoeda, moedaParaNumero } from "@/lib/masks";
import {
  type FaseCliente1,
  type GrauRelacao,
  type MeuOnboarding,
  type OrigemCliente1,
} from "@/lib/types";
import { BarraDePassos } from "./barra-de-passos";
import { PassoSenha } from "./passo-senha";
import { PassoFase, PassoOrigem } from "./passo-cliente";
import { PassoTexto } from "./passo-texto";
import { Rodape } from "./rodape";
import { passoDeAbertura, sequenciaDePassos } from "./sequencia";
import { razaoParaTravar } from "./travas";
import { SENHA_MINIMO } from "@/lib/senha-regras";
import {
  FRASE_ABERTURA,
  type OnboardingActions,
} from "./tipos";

/**
 * O onboarding do aluno — o pop-up que abre no primeiro acesso, uma vez, com
 * retomada. Este arquivo é a MÁQUINA: qual passo existe para esta pessoa, o
 * que grava ao avançar e quando conclui. Cada tela mora no seu `passo-*.tsx`.
 *
 * 🔑 Três regras que só existem aqui:
 *
 * 1. **O caminho é do respondente.** Quem responde "vem da captação" nunca vê
 *    fase, honorários nem contrato, e a barra "passo N de M" conta o caminho
 *    DELE — encolhendo, nunca crescendo (ver `sequencia`).
 * 2. **A conclusão acontece ao sair do passo de documentos**, antes do tour: o
 *    tour é apresentação, não dado. Quem fecha no meio da apresentação já
 *    entregou as respostas e revê o tour pelo botão do `/perfil`, em vez de
 *    refazer o questionário inteiro.
 * 3. **Erro do servidor não avança.** `avancar()` só muda de passo depois de a
 *    action responder sem erro — senão a pessoa acharia que gravou.
 *
 * A copy do João é literal e vem de `tipos.ts`; a trava explicada vem de
 * `travas.ts`; o tour itera as abas REAIS (`navDoAluno`), em `passo-tour.tsx`.
 *
 * 🔴 Não abre para admin, nem em modo assistência, nem na prévia "como o aluno
 * vê": quem decide é o servidor (`getMeuOnboarding`), que só devolve dados
 * para quem tem `pessoa_atual()`. Este componente só desenha.
 */
export function OnboardingPortal({
  dados,
  actions,
  proximoPasso,
  aoFechar,
}: {
  dados: MeuOnboarding;
  actions: OnboardingActions;
  /** O que fazer a seguir, vindo de `proximoPasso`. Texto + link. */
  proximoPasso?: { titulo: string; href: string } | null;
  /**
   * `true` reabre **só a apresentação** (o botão "Rever a apresentação", no
   * `/perfil`). Nesse modo nada é salvo e nenhuma action é chamada — é uma
   * releitura, não uma segunda resposta.
   */
  /** Avisa quem montou que o diálogo fechou (para poder reabrir). */
  aoFechar?: () => void;
}) {
  // Retomada: tudo que a pessoa já respondeu volta preenchido. As três
  // colunas do cliente 1 (`cliente_nome/_telefone/_grau_relacao`) existem
  // justamente para isso — fechar o navegador no passo 4 não pode apagar o que
  // foi digitado no 3.
  const r = dados.respostas;

  /**
   * Questionário JÁ concluído + senha temporária nova (o "Reenviar acesso" da
   * equipe). A pessoa não tem nada a responder de novo — o que falta é ela
   * criar a própria senha. O caminho é **só o passo 0**, e nenhuma pergunta
   * reabre.
   */
  const soSenha =
    dados.status === "concluido" && dados.precisaTrocarSenha;

  const [aberto, setAberto] = useState(true);
  const [passo, setPasso] = useState(() =>
    passoDeAbertura({
      precisaTrocarSenha: dados.precisaTrocarSenha,
      status: dados.status,
      passoAtual: dados.passoAtual,
      origem: r.origemCliente1,
      soSenha,
    }),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [origem, setOrigem] = useState<OrigemCliente1 | null>(r.origemCliente1);
  const [fase, setFase] = useState<FaseCliente1 | null>(r.faseCliente1);
  const [nome, setNome] = useState(r.clienteNome ?? "");
  const [telefone, setTelefone] = useState(r.clienteTelefone ?? "");
  const [grau, setGrau] = useState<GrauRelacao | "">(r.clienteGrauRelacao ?? "");
  const [pais, setPais] = useState(r.clientePais ?? "");
  // 🔑 SÓ LEITURA desde 10/09/2026: o passo 4 saiu e ninguém mais escreve
  // nestes campos pela tela. Eles continuam sendo ENVIADOS em `concluir()`
  // porque quem já respondeu antes da mudança (8 pessoas, medido) tem o
  // valor gravado — mandar `null` apagaria o que elas informaram.
  const pactuados = r.honorariosPactuados ?? null;
  const honorarios =
    r.valorHonorarios != null
      ? mascaraMoeda(String(Math.round(r.valorHonorarios * 100)))
      : "";
  const [ajuda, setAjuda] = useState(r.ajudaPronta ?? "");
  const [favoritado, setFavoritado] = useState<boolean | null>(null);

  const valorHonorarios = moedaParaNumero(honorarios);

  /**
   * O caminho DESTA pessoa. É ele que a barra de progresso conta.
   *
   * 🔑 O padrão é o caminho COMPLETO, e ele só **encolhe** quando a pessoa
   * responde "vem da captação". Encolher é um alívio ("faltam menos passos do
   * que eu pensava"); crescer no meio do caminho seria uma promessa quebrada —
   * e a barra existe justamente para ser confiável.
   */
  // Congelado na abertura: depois de trocar a senha, `precisaTrocarSenha` vira
  // false na próxima leitura e o passo 0 sumiria da conta — "Passo 1 de 10"
  // virava "Passo 1 de 9" (achado do Fable). A barra só pode ENCOLHER por
  // escolha da pessoa (captação), nunca por um passo que ela acabou de cumprir.
  const [teveSenhaNaAbertura] = useState(() => dados.precisaTrocarSenha);
  const sequencia = useMemo(
    () =>
      sequenciaDePassos({ teveSenhaNaAbertura, origem, soSenha }),
    [teveSenhaNaAbertura, origem, soSenha],
  );

  const posicao = Math.max(0, sequencia.indexOf(passo));
  // 🔴 O onboarding é OBRIGATÓRIO desde 10/09/2026 (decisão do Marcio: "a
  // parte do onboarding passa a ser obrigatória, ele não pode continuar
  // depois"). Não há "Continuar depois", Esc nem clique fora em passo nenhum
  // — só a tela final "Pronto" (7) fecha, e ali as respostas já foram
  // entregues.
  //
  // ⚠️ Consequência aceita: quem travar no meio fica sem acesso ao portal até
  // a equipe destravar pela Central de resolução.
  const podeFechar = passo === 6;

  function fechar() {
    if (!podeFechar) return;
    setAberto(false);
    aoFechar?.();
  }

  function irPara(destino: number) {
    setErro(null);
    setPasso(destino);
  }

  function proximo(): number {
    const i = sequencia.indexOf(passo);
    return sequencia[Math.min(i + 1, sequencia.length - 1)];
  }

  /** Grava o passo atual e avança. Erro de servidor NÃO avança. */
  async function avancar(dadosDoPasso: Parameters<OnboardingActions["salvarPasso"]>[1] = {}) {
    setSalvando(true);
    setErro(null);
    const destino = proximo();

    // 🔴 Sair do passo 6 é ENTREGAR as respostas, e quem entrega é
    // `concluir()` — não o ponteiro da retomada. A ordem importa e já mordeu:
    // gravar o ponteiro ANTES prendia quem falhasse em `concluir()` na tela
    // final, que não tem "Voltar"; o pop-up reabriria ali para sempre, sem
    // nunca ter entregado nada.
    if (passo === 5 || (passo === 2 && origem === "captacao")) {
      // 🔴 GRAVA ANTES DE CONCLUIR. Quem escolhe "captação" salta do passo 2
      // direto para o fim, e `concluir()` era chamada SEM a escolha ter ido
      // ao banco — a RPC recusava com "Responda o questionário antes de
      // concluir" e o aluno ficava preso no passo 2, sem saída.
      //
      // `dadosDoPasso` traz `{ origem_cliente1 }` quando vem do passo 2 e
      // `{ ajuda_pronta }` quando vem do 5; nos dois casos é o que ainda
      // não foi persistido. Erro aqui NÃO conclui.
      if (Object.keys(dadosDoPasso).length > 0) {
        const salvo = await actions.salvarPasso(passo, dadosDoPasso);
        if (salvo.erro) {
          setSalvando(false);
          setErro(salvo.erro);
          return;
        }
      }

      const c = await actions.concluir();
      setSalvando(false);
      if (c.erro) {
        // Fica onde está, com a frase do servidor no `role="alert"` abaixo. O
        // "Continuar" volta a ficar clicável para tentar de novo.
        setErro(c.erro);
        return;
      }
      setFavoritado(c.favoritado ?? null);
      irPara(destino);
      return;
    }

    const res = await actions.salvarPasso(destino, dadosDoPasso);
    setSalvando(false);
    if (res.erro) {
      setErro(res.erro);
      return;
    }
    irPara(destino);
  }

  async function trocarSenha() {
    if (senha.length < SENHA_MINIMO || senha !== senha2) return;
    setSalvando(true);
    setErro(null);
    const res = await actions.trocarSenha(senha);
    setSalvando(false);
    if (res.erro) {
      setErro(res.erro);
      return;
    }
    // Quem só veio trocar a senha vai para o aviso final; quem está no
    // questionário RETOMA onde parou — senha temporária nova no meio do
    // questionário não pode mandar a pessoa de volta à primeira pergunta.
    //
    // 🔴 Era uma cópia da regra com a faixa ERRADA (`>= 8 ? 7 : …`): 8 e 9
    // eram os passos do tour, que saíram; o banco trava `passo_atual` em
    // 0..6. Pior que o número velho, faltava a GARANTIA de `passoDeAbertura`
    // — o passo calculado podia não existir na sequência desta pessoa (quem
    // escolheu "captação" não tem 3 nem 5), e o portal abriria num passo que
    // a barra não conhece. Hoje ninguém está nesse estado (máx. `passo_atual`
    // = 3); a correção é para não voltar a ficar.
    irPara(
      soSenha
        ? 6
        : passoDeAbertura({
            precisaTrocarSenha: false, // acabou de trocar
            status: dados.status,
            passoAtual: dados.passoAtual,
            origem,
            soSenha: false,
          }),
    );
  }

  /** A razão pela qual o "Continuar" está travado. Vazio = pode seguir. */
  const razaoTravado = razaoParaTravar({
    passo,
    senha,
    senha2,
    origem,
    fase,
    nome,
    telefone,
    grau,
    pais,
    pactuados,
    valorHonorarios,
  });

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        // Esc e clique fora só fecham na tela final: o questionário é
        // obrigatório e sair no meio deixaria a pessoa sem cliente 1 e sem
        // as respostas que a equipe precisa para acompanhar.
        if (!v) fechar();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle className="font-heading titulo-h2">
            {passo === 0
              ? "Crie a sua senha"
              : passo === 6
                ? "Pronto"
                : "Programa de Implementação Assistida"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Perguntas iniciais do Programa de Implementação Assistida.
          </DialogDescription>
        </DialogHeader>

        <BarraDePassos posicao={posicao} total={sequencia.length} />

        <div className="grid gap-4">
          {passo === 0 ? (
            <PassoSenha
              senha={senha}
              senha2={senha2}
              setSenha={setSenha}
              setSenha2={setSenha2}
            />
          ) : null}

          {passo === 1 ? (
            <div className="grid gap-3">
              <p className="font-heading titulo-h2 text-balance">
                {FRASE_ABERTURA}
              </p>
              <p className="corpo text-muted-foreground">
                São poucas perguntas para a equipe saber de onde você parte. No
                fim, uma apresentação rápida de cada parte do portal.
              </p>
            </div>
          ) : null}

          {passo === 2 ? (
            <PassoOrigem
              origem={origem}
              setOrigem={setOrigem}
              desabilitado={salvando}
            />
          ) : null}

          {passo === 3 ? (
            <PassoFase
              fase={fase}
              setFase={setFase}
              nome={nome}
              setNome={setNome}
              telefone={telefone}
              setTelefone={setTelefone}
              pais={pais}
              setPais={setPais}
              grau={grau}
              setGrau={setGrau}
              ambienteJaTemFavorito={dados.ambienteJaTemFavorito}
              desabilitado={salvando}
            />
          ) : null}

          {/* 🔴 O PASSO 4 (honorários + anexos) foi REMOVIDO da sequência em
              10/09/2026 (`sequencia.ts`): valor e contrato vivem só na ficha
              do cliente, que já tem os dois campos e só os libera quando a
              fase é "contratado". O bloco que renderizava `PassoHonorarios`
              saiu junto — deixá-lo seria código que nunca roda. */}

          {passo === 5 ? (
            <PassoTexto
              valor={ajuda}
              setValor={setAjuda}
            />
          ) : null}

          {passo === 6 ? (
            <div className="grid gap-3">
              <p className="flex items-start gap-2 corpo">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-sucesso-foreground" />
                <span>
                  {soSenha
                    ? "Senha alterada. Ela vale para todos os portais do grupo."
                    : "Pronto. A equipe já recebeu as suas respostas."}
                </span>
              </p>
              {/* 🔴 QUEM VEM DA CAPTAÇÃO PRECISA SABER O QUE FAZER AGORA.
                  MEDIDO em 10/09/2026: das 22 pessoas que concluíram o
                  onboarding escolhendo "captação", **21 saíram do portal e não
                  voltaram** — concluíram há 2 horas em média e cadastraram
                  ZERO clientes.

                  A tela dizia só "Pronto. A equipe já recebeu as suas
                  respostas." — que soa como fim de tarefa, não como começo.
                  Quem não tem cliente 1 sai daqui sem nada para fazer, e a
                  lista dos 30 é justamente o trabalho que começa agora. */}
              {origem === "captacao" ? (
                <div className="grid gap-1.5 rounded-xl border border-marca-acao/40 bg-primary/[0.04] p-3">
                  <p className="corpo font-medium">
                    Seu próximo passo: montar a lista dos 30
                  </p>
                  <p className="corpo-sm text-muted-foreground">
                    É de lá que sai o seu cliente 1. Basta{" "}
                    <strong>nome e telefone</strong> de cada pessoa — o resto
                    você preenche depois, quando souber.
                  </p>
                </div>
              ) : null}
              {favoritado === true ? (
                <p className="corpo text-muted-foreground">
                  O seu cliente 1 já está cadastrado e marcado como o cliente
                  que a equipe vai acompanhar.
                </p>
              ) : favoritado === false ? (
                <p className="corpo text-muted-foreground">
                  O seu cliente entrou na sua lista de clientes. A equipe já
                  acompanha outro cliente neste ambiente.
                </p>
              ) : null}
              {proximoPasso ? (
                <div className="rounded-xl bg-superficie-afundada p-3">
                  <p className="rotulo text-muted-foreground">
                    O seu próximo passo
                  </p>
                  <p className="mt-1 corpo font-medium">{proximoPasso.titulo}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {erro ? (
          <p role="alert" aria-live="assertive" className="corpo-sm text-destructive">
            {erro}
          </p>
        ) : null}

        <Rodape
          passo={passo}
          soSenha={soSenha}
          podeFechar={podeFechar}
          salvando={salvando}
          razaoTravado={razaoTravado}
          // 🔑 Para quem vem da CAPTAÇÃO o destino é sempre `/clientes`, e
          // isso não custa consulta nenhuma: é a lista dos 30, que só pode
          // ser montada lá. O `onboarding-gate` passa `proximoPasso={null}`
          // de propósito (calcular exigiria 3 consultas em toda página do
          // parceiro) — mas este caso não precisa de cálculo.
          proximoPassoHref={
            proximoPasso?.href ??
            (origem === "captacao" ? "/clientes" : undefined)
          }
          onFechar={fechar}
          onVoltar={() => {
            const i = sequencia.indexOf(passo);
            irPara(sequencia[Math.max(0, i - 1)]);
          }}
          onSenha={() => void trocarSenha()}
          onAvancar={() => {
            // ⚠️ As chaves são as de `gps.onboarding_salvar_passo` (snake_case,
            // allowlist fechada): chave desconhecida ABORTA a RPC. Uma tradução
            // camelCase → snake_case no meio seria só mais um lugar para uma
            // resposta se perder em silêncio.
            if (passo === 2) return void avancar({ origem_cliente1: origem });
            if (passo === 3)
              return void avancar({
                fase_cliente1: fase,
                cliente_nome: nome.trim(),
                cliente_telefone: telefone || null,
                cliente_grau_relacao: grau === "" ? null : grau,
                cliente_pais: pais || null,
              });
            if (passo === 4)
              return void avancar({
                honorarios_pactuados: pactuados,
                // Só vai valor quando pactuado — o banco zera de qualquer
                // forma, mas mandar `null` aqui deixa a intenção explícita.
                valor_honorarios: pactuados ? valorHonorarios : null,
              });
            if (passo === 5) return void avancar({ ajuda_pronta: ajuda || null });
            return void avancar();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
