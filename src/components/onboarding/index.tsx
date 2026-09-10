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
import { FASES_CLIENTE1_UI } from "@/lib/etapa1";
import {
  MAX_DOCUMENTOS_ONBOARDING,
  type FaseCliente1,
  type GrauRelacao,
  type MeuOnboarding,
  type OnboardingAnexo,
  type OrigemCliente1,
} from "@/lib/types";
import { AnexoOnboarding } from "./anexo-onboarding";
import { BarraDePassos } from "./barra-de-passos";
import { PassoSenha } from "./passo-senha";
import { PassoFase, PassoHonorarios, PassoOrigem } from "./passo-cliente";
import { PassoTexto } from "./passo-texto";
import { PassoTour, abasDoTour } from "./passo-tour";
import { Rodape } from "./rodape";
import { razaoParaTravar } from "./travas";
import {
  AJUDA_DOCUMENTOS,
  FRASE_ABERTURA,
  TITULO_DOCUMENTOS,
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
  abas: abasDoAluno,
  actions,
  proximoPasso,
  soTour = false,
  aoFechar,
}: {
  dados: MeuOnboarding;
  /**
   * As abas REAIS desta pessoa — `navDoAluno(ctx)`, resolvido no servidor.
   *
   * 🔑 Prop e não campo de `MeuOnboarding`: a navegação é do contexto de
   * sessão (o sócio não vê Financeiro, B7-b), não da resposta do questionário.
   * A RPC `onboarding_meu()` devolve respostas; ela não sabe — nem deve — o
   * que o menu daquela pessoa tem.
   */
  abas: { href: string; label: string }[];
  actions: OnboardingActions;
  /** O que fazer a seguir, vindo de `proximoPasso`. Texto + link. */
  proximoPasso?: { titulo: string; href: string } | null;
  /**
   * `true` reabre **só a apresentação** (o botão "Rever a apresentação", no
   * `/perfil`). Nesse modo nada é salvo e nenhuma action é chamada — é uma
   * releitura, não uma segunda resposta.
   */
  soTour?: boolean;
  /** Avisa quem montou que o diálogo fechou (para poder reabrir). */
  aoFechar?: () => void;
}) {
  const abas = useMemo(() => abasDoTour(abasDoAluno), [abasDoAluno]);
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
    !soTour && dados.status === "concluido" && dados.precisaTrocarSenha;

  const [aberto, setAberto] = useState(true);
  const [passo, setPasso] = useState(() => {
    if (soTour) return 8;
    if (dados.precisaTrocarSenha) return 0;
    // 🔴 Retomada: 8 e 9 são a APRESENTAÇÃO, e a apresentação só existe depois
    // de `concluir()`. Um `passo_atual >= 8` com o questionário em aberto é uma
    // conclusão que falhou (ou uma linha gravada pela versão que carimbava o 8
    // antes de concluir). Retomar ali levaria a pessoa direto ao tour e ao
    // "Pronto" sem nunca ter entregado as respostas — e do 8 não há "Voltar".
    // Volta ao 7, o último passo que ainda tem "Continuar".
    if (dados.status !== "concluido" && dados.passoAtual >= 8) return 7;
    return Math.max(1, dados.passoAtual);
  });
  const [indiceTour, setIndiceTour] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [origem, setOrigem] = useState<OrigemCliente1 | null>(r.origemCliente1);
  const [fase, setFase] = useState<FaseCliente1 | null>(r.faseCliente1);
  const [nome, setNome] = useState(r.clienteNome ?? "");
  const [telefone, setTelefone] = useState(r.clienteTelefone ?? "");
  const [grau, setGrau] = useState<GrauRelacao | "">(r.clienteGrauRelacao ?? "");
  const [honorarios, setHonorarios] = useState(
    r.valorHonorarios != null
      ? mascaraMoeda(String(Math.round(r.valorHonorarios * 100)))
      : "",
  );
  const [caso, setCaso] = useState(r.descricaoCaso ?? "");
  const [ajuda, setAjuda] = useState(r.ajudaPronta ?? "");
  const [anexos, setAnexos] = useState<OnboardingAnexo[]>(dados.anexos);
  const [favoritado, setFavoritado] = useState<boolean | null>(null);

  const contrato = anexos.filter((a) => a.tipo === "contrato_honorarios");
  const documentos = anexos.filter((a) => a.tipo === "documento");
  const valorHonorarios = moedaParaNumero(honorarios);
  // Quem decide se a fase exige honorários + contrato é `FASES_CLIENTE1_UI` —
  // o mesmo mapa que `gps.onboarding_concluir()` implementa no banco. Comparar
  // com a string `"execucao_andamento"` aqui abriria um segundo lugar para a
  // regra do João mudar sozinha.
  const execucao = FASES_CLIENTE1_UI.find((f) => f.id === fase)?.exigeContrato ?? false;

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
  const sequencia = useMemo(() => {
    if (soTour) return [8, 9];
    // Senha temporária sobre questionário concluído: a senha e o aviso de que
    // deu certo. Nada de reabrir perguntas que a pessoa já respondeu.
    if (soSenha) return [0, 9];
    const passos: number[] = [];
    if (teveSenhaNaAbertura) passos.push(0);
    passos.push(1, 2);
    if (origem !== "captacao") passos.push(3, 4);
    passos.push(5, 6, 7, 8, 9);
    return passos;
  }, [teveSenhaNaAbertura, origem, soTour, soSenha]);

  const posicao = Math.max(0, sequencia.indexOf(passo));
  const podeFechar = passo >= 1;

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

    // 🔴 Sair do passo 7 é ENTREGAR as respostas, e quem entrega é
    // `concluir()` — não o ponteiro da retomada. A ordem importa e já mordeu:
    // gravar `passo_atual = 8` ANTES prendia quem falhasse em `concluir()` na
    // apresentação, que não tem "Voltar" e termina em "Pronto"; o pop-up
    // reabriria no 8 para sempre, sem nunca ter entregado nada.
    //
    // 🔑 Depois de concluído o banco RECUSA `onboarding_salvar_passo` (22023),
    // então o 8 e o 9 não são gravados: a apresentação vive só aqui, como
    // estado de tela. Fechar no meio dela não perde resposta nenhuma, e
    // "Rever a apresentação" no `/perfil` a devolve inteira.
    if (passo === 7) {
      const c = await actions.concluir();
      setSalvando(false);
      if (c.erro) {
        // Fica no 7, com a frase do servidor no `role="alert"` abaixo. O
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
    if (senha.length < 8 || senha !== senha2) return;
    setSalvando(true);
    setErro(null);
    const res = await actions.trocarSenha(senha);
    setSalvando(false);
    if (res.erro) {
      setErro(res.erro);
      return;
    }
    // Quem só veio trocar a senha vai para o aviso final; quem está no
    // questionário RETOMA onde parou (mesma regra da abertura: 8/9 em aberto
    // voltam ao 7) — senha temporária nova no meio do questionário não pode
    // mandar a pessoa de volta à primeira pergunta.
    const retomada =
      dados.status !== "concluido" && dados.passoAtual >= 8
        ? 7
        : Math.max(1, dados.passoAtual);
    irPara(soSenha ? 9 : retomada);
  }

  /** A razão pela qual o "Continuar" está travado. Vazio = pode seguir. */
  const razaoTravado = razaoParaTravar({
    passo,
    senha,
    senha2,
    origem,
    fase,
    nome,
    execucao,
    valorHonorarios,
    temContrato: contrato.length > 0,
  });

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        // Esc e clique fora só fecham quando fechar é permitido: no passo 0 a
        // pessoa está com senha temporária e sair dali a deixaria sem senha
        // própria, no meio do caminho.
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
              : passo === 9
                ? "Pronto"
                : passo === 8
                  ? "Conhecendo o portal"
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
              grau={grau}
              setGrau={setGrau}
              ambienteJaTemFavorito={dados.ambienteJaTemFavorito}
              desabilitado={salvando}
            />
          ) : null}

          {passo === 4 ? (
            <PassoHonorarios
              honorarios={honorarios}
              setHonorarios={setHonorarios}
              execucao={execucao}
              contrato={contrato}
              actions={actions}
              aoMudarAnexos={(novos) => setAnexos([...documentos, ...novos])}
              desabilitado={salvando}
            />
          ) : null}

          {passo === 5 || passo === 6 ? (
            <PassoTexto
              passo={passo === 5 ? 5 : 6}
              valor={passo === 5 ? caso : ajuda}
              setValor={passo === 5 ? setCaso : setAjuda}
              origemEhJaTenho={origem === "ja_tenho"}
            />
          ) : null}

          {passo === 7 ? (
            <AnexoOnboarding
              tipo="documento"
              anexos={documentos}
              actions={actions}
              maximo={MAX_DOCUMENTOS_ONBOARDING}
              rotulo={TITULO_DOCUMENTOS}
              /* 🔒 B-D1: sem a lista do João, o passo fica genérico e opcional. */
              ajuda={`${AJUDA_DOCUMENTOS} Até ${MAX_DOCUMENTOS_ONBOARDING} arquivos, PNG, JPG, WEBP ou PDF, de até 5 MB cada.`}
              desabilitado={salvando}
              aoMudar={(novos) => setAnexos([...contrato, ...novos])}
            />
          ) : null}

          {passo === 8 && abas.length > 0 ? (
            <PassoTour
              aba={abas[Math.min(indiceTour, abas.length - 1)]}
              indice={Math.min(indiceTour, abas.length - 1)}
              total={abas.length}
            />
          ) : null}

          {passo === 9 ? (
            <div className="grid gap-3">
              <p className="flex items-start gap-2 corpo">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-sucesso-foreground" />
                <span>
                  {soTour
                    ? "É isso. Você pode rever esta apresentação quando quiser, no Perfil."
                    : soSenha
                      ? "Senha alterada. Ela vale para todos os portais do grupo."
                      : "Pronto. A equipe já recebeu as suas respostas."}
                </span>
              </p>
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
          soTour={soTour}
          soSenha={soSenha}
          podeFechar={podeFechar}
          salvando={salvando}
          razaoTravado={razaoTravado}
          abas={abas.length}
          indiceTour={indiceTour}
          proximoPassoHref={proximoPasso?.href}
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
              });
            if (passo === 4) return void avancar({ valor_honorarios: valorHonorarios });
            if (passo === 5) return void avancar({ descricao_caso: caso || null });
            if (passo === 6) return void avancar({ ajuda_pronta: ajuda || null });
            return void avancar();
          }}
          onTourAvancar={() => {
            if (indiceTour + 1 < abas.length) setIndiceTour(indiceTour + 1);
            else irPara(9);
          }}
          onPularTour={() => irPara(9)}
        />
      </DialogContent>
    </Dialog>
  );
}
