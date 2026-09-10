"use client";

import { AvisoInline } from "@/components/ui/aviso-inline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascaraMoeda, mascaraTelefone } from "@/lib/masks";
import { GRAUS_RELACAO_UI } from "@/lib/etapa1";
import type {
  FaseCliente1,
  GrauRelacao,
  OnboardingAnexo,
  OrigemCliente1,
} from "@/lib/types";
import { AnexoOnboarding } from "./anexo-onboarding";
import { Escolha } from "./escolha";
import {
  OPCOES_FASE,
  OPCOES_ORIGEM,
  PERGUNTA_CLIENTE1,
  PERGUNTA_FASE,
  ROTULO_HONORARIOS,
  type OnboardingActions,
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
          <Label htmlFor="onb-tel">Telefone</Label>
          <Input
            id="onb-tel"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
          />
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
            <option value="">Não informar agora</option>
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
        ) : null}
      </div>
    </div>
  );
}

/**
 * Passo 4 — honorários e contrato.
 *
 * 🔴 A obrigatoriedade vale **só em "Execução em andamento"**. Nas outras duas
 * fases o valor é opcional e o contrato nem aparece: pedir contrato assinado a
 * quem ainda vai apresentar o croqui é pedir um documento que não existe.
 *
 * 🔴 O contrato é documento de TERCEIRO (o cliente do aluno). Ele é prova, não
 * fichário: fica no bucket privado, é lido por quem é do ambiente e pela
 * equipe, e nunca sai por e-mail nem por notificação.
 */
export function PassoHonorarios({
  honorarios,
  setHonorarios,
  execucao,
  contrato,
  actions,
  aoMudarAnexos,
  desabilitado,
}: {
  honorarios: string;
  setHonorarios: (v: string) => void;
  execucao: boolean;
  contrato: OnboardingAnexo[];
  actions: OnboardingActions;
  aoMudarAnexos: (novos: OnboardingAnexo[]) => void;
  desabilitado: boolean;
}) {
  return (
    <div className="grid gap-4">
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
          {execucao
            ? "Obrigatório: é o valor do contrato desta execução."
            : "Opcional agora — você preenche quando fechar."}
        </p>
      </div>
      {execucao ? (
        <AnexoOnboarding
          tipo="contrato_honorarios"
          anexos={contrato}
          actions={actions}
          maximo={1}
          rotulo="Anexe o contrato de honorários assinado"
          ajuda="PNG, JPG, WEBP ou PDF, até 5 MB. Ele fica visível para você e para a equipe."
          desabilitado={desabilitado}
          aoMudar={aoMudarAnexos}
        />
      ) : null}
    </div>
  );
}
