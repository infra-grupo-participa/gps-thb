"use client";

import { AvisoInline } from "@/components/ui/aviso-inline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascaraMoeda, mascaraTelefone } from "@/lib/masks";
import { GRAUS_RELACAO_UI } from "@/lib/etapa1";
import type {
  FaseCliente1,
  GrauRelacao,
  OrigemCliente1,
} from "@/lib/types";
import { Escolha } from "./escolha";
import {
  OPCOES_FASE,
  OPCOES_ORIGEM,
  PERGUNTA_CLIENTE1,
  PERGUNTA_FASE,
  PAISES,
  ROTULO_HONORARIOS,
} from "./tipos";

/** Passo 2 — de onde vem o cliente 1. É a pergunta que ramifica o resto. */
export function PassoOrigem({
  origem,
  setOrigem,
  desabilitado,
}: {
  origem: OrigemCliente1 | null;
  setOrigem: (v: OrigemCliente1) => void;
  desabilitado: boolean;
}) {
  return (
    <Escolha
      legenda={PERGUNTA_CLIENTE1}
      opcoes={OPCOES_ORIGEM}
      valor={origem}
      onEscolher={setOrigem}
      desabilitado={desabilitado}
    />
  );
}

/**
 * Passo 3 — fase da implementação + a identificação do cliente.
 *
 * 🔑 Nome, telefone e grau ficam na MESMA tela da fase de propósito: a
 * conclusão vai criar uma linha em `gps.etapa1_clientes`, e uma linha só com
 * nome nasceria contando para "clientes listados" **sem contar** para
 * "clientes com dados" — que é o número que a Etapa 01 realmente cobra. Campo
 * novo que nasce vazio é KPI que nasce mentindo.
 *
 * ⚠️ O grau de relação **não entra** na regra de `comDados` (nome + telefone +
 * nível): acrescentá-lo reabriria a tarefa 1 de quem já a concluiu.
 */
export function PassoFase({
  fase,
  setFase,
  nome,
  setNome,
  telefone,
  setTelefone,
  pais,
  setPais,
  grau,
  setGrau,
  ambienteJaTemFavorito,
  desabilitado,
}: {
  fase: FaseCliente1 | null;
  setFase: (v: FaseCliente1) => void;
  nome: string;
  setNome: (v: string) => void;
  telefone: string;
  setTelefone: (v: string) => void;
  pais: string;
  setPais: (v: string) => void;
  grau: GrauRelacao | "";
  setGrau: (v: GrauRelacao | "") => void;
  ambienteJaTemFavorito: boolean;
  desabilitado: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Escolha
        legenda={PERGUNTA_FASE}
        opcoes={OPCOES_FASE}
        valor={fase}
        onEscolher={setFase}
        desabilitado={desabilitado}
      />
      {/* 🔴 A SAÍDA DO BECO (11/09/2026). Desde a decisão de 10/09 ("ter
          cliente = croqui apresentado"), `agendado` e `viabilidade_feita`
          saíram das opções — as duas que restam cobrem só quem já apresentou
          o croqui. Quem respondeu "já tenho esse cliente" no passo anterior e
          ainda NÃO apresentou não tem em que clicar, e a fase é obrigatória.
          Existe "Voltar", mas nada dizia que a saída era mudar a resposta
          anterior. Não mexe nas opções — só conta o caminho. */}
      <p className="corpo-sm text-muted-foreground">
        Não se encaixa em nenhuma das duas? Volte e escolha{" "}
        <strong>&ldquo;Quero que façamos desde a captação&rdquo;</strong> — é o
        caminho de quem ainda vai apresentar o croqui.
      </p>
      <div className="grid gap-3 rounded-xl bg-superficie-afundada p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="onb-nome">Qual o nome desse cliente?</Label>
          <Input
            id="onb-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-pais">País</Label>
          <select
            id="onb-pais"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 corpo shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={pais}
            onChange={(e) => setPais(e.target.value)}
          >
            {/* `disabled` no placeholder, como no campo de grau logo abaixo.
                Sem ele o "Escolha…" é uma opção selecionável e o campo PARECE
                respondido — a trava só cobra no "Continuar", e a frase de erro
                nasce no rodapé, fora da viewport do diálogo. */}
            {PAISES.map((op) => (
              <option key={op.id} value={op.id} disabled={op.id === ""}>
                {op.rotulo}
              </option>
            ))}
          </select>
          <p className="corpo-sm text-muted-foreground">
            {/* Dizia "de onde vem este lead" — para quem acabou de responder
                que JÁ TEM o cliente, chamá-lo de lead contradiz a pergunta
                anterior. E o país não é origem: é o que define o formato do
                telefone no campo seguinte. */}
            Em que país este cliente mora. É o que define o formato do número
            de WhatsApp abaixo.
          </p>
        </div>
        <div className="grid gap-1.5">
          {/* Rotulado como WhatsApp desde 10/09/2026: é por ali que a equipe
              fala com o lead, e "Telefone" deixava dúvida sobre qual número. */}
          <Label htmlFor="onb-tel">Número de WhatsApp</Label>
          <Input
            id="onb-tel"
            inputMode="tel"
            value={telefone}
            onChange={(e) =>
              setTelefone(
                pais === "BR" ? mascaraTelefone(e.target.value) : e.target.value,
              )
            }
            placeholder={pais === "BR" ? "(11) 99999-9999" : "+000 000 000 000"}
          />
          <p className="corpo-sm text-muted-foreground">
            {pais === "BR"
              ? "Com DDD."
              : "Com o código do país, como aparece no WhatsApp."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-grau">Qual o seu grau de relação com ele?</Label>
          {/* `<select>` nativo: seis opções, sem busca, num diálogo já modal —
              um combobox de biblioteca aqui seria JavaScript a mais para
              reimplementar o que o navegador faz melhor. */}
          <select
            id="onb-grau"
            value={grau}
            onChange={(e) => setGrau(e.target.value as GrauRelacao | "")}
            className="foco-visivel h-9 rounded-md border border-input bg-card px-3 corpo-sm"
          >
            {/* "Não informar agora" saiu em 10/09/2026 (decisão do Marcio):
                o grau de relação passou a ser obrigatório quando há cliente.
                O placeholder vazio existe só para o campo nascer sem escolha
                feita — a trava do "Continuar" cobra a resposta. */}
            <option value="" disabled>
              Escolha…
            </option>
            {GRAUS_RELACAO_UI.map((g) => (
              <option key={g.id} value={g.id}>
                {g.rotulo}
              </option>
            ))}
          </select>
        </div>
        {/* §B.1: o onboarding é da PESSOA, o cliente é do AMBIENTE. Se o sócio
            responder num ambiente que já tem favorito, o cliente entra sem
            roubar a estrela — e a tela avisa ANTES, em vez de o banco recusar
            depois pelo índice único. */}
        {ambienteJaTemFavorito ? (
          <AvisoInline>
            A equipe já acompanha um cliente neste ambiente. Este cliente entra
            na sua lista de clientes, sem trocar o que a equipe já acompanha.
          </AvisoInline>
        ) : (
          // 🔴 A ASSIMETRIA QUE CUSTOU 4 DOS 5 CHAMADOS DO PRIMEIRO DIA
          // (11/09/2026). A tela avisava quando NÃO ia marcar a estrela e
          // ficava calada quando IA — que é o caso da maioria.
          //
          // Medido: **14 dos 17** favoritos do sistema nasceram AQUI, sem
          // nenhum clique do parceiro; só 3 vieram da estrela na aba
          // Clientes. A Vania tem `cliente_favoritado` e
          // `onboarding_concluido` no MESMO microssegundo e escreveu no
          // chamado: "ao salvar ele já apareceu como favorito, e não será o
          // caso deste cliente".
          //
          // Não muda o comportamento — `onboarding_concluir` continua
          // marcando. Muda o que a pessoa SABE ao decidir, e diz onde se
          // troca depois, para o caminho não ser o Suporte.
          <AvisoInline>
            Este será o <strong>cliente que a equipe vai acompanhar</strong> com
            você até a sua primeira holding sair. Se depois você preferir outro,
            troca a qualquer momento na aba Clientes, enquanto a equipe ainda
            não tiver assumido.
          </AvisoInline>
        )}
      </div>
    </div>
  );
}

/**
 * Passo 4 — honorários e contrato.
 *
 * 🔑 Desde 10/09/2026 (decisão do Marcio) o valor não depende mais da FASE, e
 * sim de uma PERGUNTA: "já tem os honorários pactuados?". Quem responde que
 * sim informa o valor, esteja em que fase estiver — antes, o campo aparecia
 * sempre e só era obrigatório em "Execução em andamento".
 *
 * 🔴 O ANEXO do contrato SAIU deste passo na mesma decisão. Ele continua
 * existindo na ficha do cliente, onde o aluno anexa quando quiser: o
 * onboarding não pede mais arquivo nenhum.
 */
export function PassoHonorarios({
  honorarios,
  setHonorarios,
  pactuados,
  setPactuados,
}: {
  honorarios: string;
  setHonorarios: (v: string) => void;
  pactuados: boolean | null;
  setPactuados: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="corpo font-medium">
          Você já tem os honorários pactuados com este cliente?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { id: true, rotulo: "Sim, já estão pactuados" },
            { id: false, rotulo: "Ainda não" },
          ].map((op) => (
            <label
              key={String(op.id)}
              className={
                "flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 corpo " +
                (pactuados === op.id
                  ? "border-marca-acao bg-primary/[0.06]"
                  : "border-borda-fina hover:bg-superficie-afundada")
              }
            >
              <input
                type="radio"
                name="onb-pactuados"
                className="size-4 accent-[var(--color-marca-acao)]"
                checked={pactuados === op.id}
                onChange={() => setPactuados(op.id)}
              />
              <span>{op.rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {pactuados === true ? (
        <div className="grid gap-1.5">
          <Label htmlFor="onb-hon">{ROTULO_HONORARIOS}</Label>
          <Input
            id="onb-hon"
            inputMode="numeric"
            value={honorarios}
            onChange={(e) => setHonorarios(mascaraMoeda(e.target.value))}
            placeholder="R$ 0,00"
          />
          <p className="corpo-sm text-muted-foreground">
            É o valor combinado com este cliente. Ele entra na sua meta de
            faturamento do programa.
          </p>
        </div>
      ) : null}
    </div>
  );
}
