"use client";

import { useEffect, useState } from "react";

import { abrirBriefingDaSessao } from "@/app/admin/sessoes/actions";
import { formatarData, formatarDataHora } from "@/lib/datas";
import type { SessaoBriefing } from "@/lib/sessoes-tipos";

/**
 * O briefing de UMA sessão — carregado SÓ quando esta ficha abre (nunca na
 * listagem, PRD §6.5 / tarefa desta fatia). Cada abertura chama
 * `abrirBriefingDaSessao` → `gps.sessao_briefing_ler`, que GRAVA trilha LGPD
 * a cada leitura — por isso este componente NÃO memoiza o resultado além do
 * próprio estado local, e não pré-busca: monta vazio e só chama a action no
 * efeito, uma vez por abertura.
 *
 * `briefing_snapshot` é o retrato do dia do agendamento (§6.5): as fontes
 * originais podem ter mudado depois. Este componente não tenta "atualizar"
 * nada — mostra exatamente o congelado, com `gerado_em`.
 *
 * 🔴 `descricao_caso`/`observacoes`/decisores são dado pessoal de cliente de
 * terceiro. Aparecem aqui porque esta é a FICHA de uma sessão específica,
 * aberta por quem tem RLS para ela (doutora dona ou admin) — nunca em lista
 * consolidada, CSV ou e-mail (§4.3, regra do PRD).
 */
export function BriefingSessao({ agendamentoId }: { agendamentoId: string }) {
  const [estado, setEstado] = useState<
    | { tipo: "carregando" }
    | { tipo: "erro"; mensagem: string }
    | { tipo: "pronto"; briefing: SessaoBriefing | null }
  >({ tipo: "carregando" });

  useEffect(() => {
    let cancelado = false;
    abrirBriefingDaSessao(agendamentoId).then((r) => {
      if (cancelado) return;
      if (!r.ok) {
        setEstado({ tipo: "erro", mensagem: r.erro });
        return;
      }
      setEstado({ tipo: "pronto", briefing: r.briefing });
    });
    return () => {
      cancelado = true;
    };
    // Cada AGENDAMENTO diferente busca de novo; reabrir o MESMO agendamento
    // no mesmo componente montado de novo também busca de novo — é o
    // comportamento certo (a trilha regista cada leitura real, §9-ter B2/…292 §8).
  }, [agendamentoId]);

  if (estado.tipo === "carregando") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-t border-borda-fina px-3 py-2 corpo-sm text-muted-foreground"
      >
        Carregando briefing…
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <p
        role="alert"
        className="border-t border-borda-fina px-3 py-2 corpo-sm text-destructive"
      >
        {estado.mensagem}
      </p>
    );
  }

  const b = estado.briefing;
  if (!b || !b.briefing) {
    return (
      <p className="border-t border-borda-fina px-3 py-2 corpo-sm text-muted-foreground">
        Sem briefing registrado para esta sessão.
      </p>
    );
  }

  const dados = b.briefing as Record<string, unknown>;
  const cliente = (dados.cliente ?? {}) as Record<string, unknown>;
  const onboarding = (dados.onboarding ?? {}) as Record<string, unknown>;
  const entrevista = (dados.entrevista ?? {}) as Record<string, unknown>;
  // 🔴 QUEM DECIDE, lido AO VIVO (`decisores_ao_vivo`, irmão de `briefing`).
  //
  // Dois defeitos corrigidos aqui na auditoria de 23/09:
  //  1. o snapshot já trazia `decisores` e a tela NÃO mostrava — mesmo
  //     defeito do DISC: grava certo, não exibe;
  //  2. o snapshot CONGELA no ato do agendamento, e a Entrevista Prévia (que
  //     descobre os decisores) costuma rodar DEPOIS. A doutora veria a lista
  //     velha, sem o cônjuge que o parceiro acabou de mapear — e conduziria
  //     a reunião achando que está com todos na sala.
  //
  // 🔑 Mesmo raciocínio que tirou o DISC do snapshot: quem decide é atributo
  // ESTÁVEL DA PESSOA, não fato datado. O congelado continua no snapshot
  // (`briefing.decisores`) como histórico do que se sabia no dia.
  const decisores = Array.isArray(b.decisores_ao_vivo) ? b.decisores_ao_vivo : [];
  const gerado = typeof dados.gerado_em === "string" ? dados.gerado_em : null;
  // 🔴 `disc_ao_vivo` vem no TOPO da resposta, irmão de `briefing` — não
  // dentro dele. Medido em produção: as chaves de `briefing` são
  // {cliente, minutas, aluno_id, decisores, gerado_em, cliente_id,
  // entrevista, onboarding, parceiro_nome}, e `disc_ao_vivo` não está entre
  // elas. É assim de propósito: o DISC é lido AO VIVO na hora da chamada,
  // enquanto `briefing` é o snapshot congelado no ato do agendamento —
  // aninhá-lo lá dentro contradiria a própria razão de ele existir.
  const discAoVivo = (b.disc_ao_vivo ?? {}) as Record<string, unknown>;

  return (
    <div className="grid gap-3 border-t border-borda-fina px-3 py-3">
      <p className="corpo-sm text-muted-foreground">
        Briefing congelado{gerado ? ` em ${formatarDataHora(gerado)}` : ""} — pode
        não refletir mudanças feitas depois na ficha do cliente.
      </p>

      <dl className="grid gap-2">
        <Campo rotulo="Cliente" valor={txt(cliente.nome)} />
        <Campo rotulo="Telefone" valor={txt(cliente.telefone)} />
        <Campo rotulo="Grau de relação" valor={txt(cliente.grau_relacao)} />
        <Campo rotulo="Fase" valor={txt(cliente.fase)} />
        <Campo
          rotulo="Reunião preliminar"
          valor={
            typeof cliente.data_reuniao_preliminar === "string"
              ? formatarData(cliente.data_reuniao_preliminar)
              : "—"
          }
        />
        <Campo
          rotulo="Descrição do caso"
          valor={txt(onboarding.descricao_caso)}
          bloco
        />
        <Campo
          rotulo="Ajuda que já está pronta"
          valor={txt(onboarding.ajuda_pronta)}
          bloco
        />
        <Campo
          rotulo="Observações da entrevista"
          valor={txt(entrevista.observacoes)}
          bloco
        />
      </dl>

      <BlocoDecisores decisores={decisores} />
      <BlocoDisc disc={discAoVivo} />
    </div>
  );
}

/**
 * QUEM DECIDE — a lista que a Entrevista Prévia monta.
 *
 * 🔴 Existe porque a regra do Marcio (23/09) é dura: *"está proibido
 * participar da reunião sem os decisores"* · *"para realizar a reunião
 * preliminar, todos os decisores precisam"*. A doutora precisa saber, ANTES
 * de começar, se falta alguém na sala.
 *
 * O parceiro é avisado na ficha e ao marcar; a trava é de AVISO, não de
 * bloqueio (mesma decisão do DISC). Este bloco é a última rede: se o aviso
 * foi ignorado, quem conduz a reunião ainda vê que há mais gente decidindo.
 *
 * Lista vazia SOME da tela. Cliente sem entrevista ainda não tem decisores
 * mapeados, e um rótulo "Quem decide: —" leria como defeito.
 */
function BlocoDecisores({ decisores }: { decisores: Record<string, unknown>[] }) {
  const lista = decisores
    .map((d) => ({
      nome: typeof d.nome === "string" ? d.nome : null,
      papel: typeof d.papel_no_negocio === "string" ? d.papel_no_negocio : null,
      principal: d.principal === true,
    }))
    .filter((d) => d.nome);

  if (lista.length === 0) return null;

  return (
    <div className="grid gap-2 border-t border-borda-fina pt-3">
      <p className="rotulo text-muted-foreground">
        Quem decide{lista.length > 1 ? ` (${lista.length})` : ""}
      </p>
      <ul className="corpo-sm grid gap-0.5">
        {lista.map((d, i) => (
          <li key={`${d.nome}-${i}`}>
            {d.nome}
            {d.principal ? (
              <span className="text-muted-foreground"> — decisor principal</span>
            ) : d.papel && d.papel.toLowerCase() !== (d.nome ?? "").toLowerCase() ? (
              <span className="text-muted-foreground"> — {d.papel}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {lista.length > 1 ? (
        <p className="corpo-sm text-accent-foreground">
          A reunião precisa de <strong>todos presentes</strong>. Se faltar
          alguém, remarque antes de avançar no conteúdo.
        </p>
      ) : null}
    </div>
  );
}

/**
 * O bloco DISC — lido AO VIVO de `etapa1_clientes` na hora da chamada
 * (`disc_ao_vivo`, PRD §2.2), nunca o `perfil_disc` de dentro do `briefing`
 * congelado. Regra do PRD, sem exceção: NUNCA mostrar os dois lado a lado —
 * dois valores para a mesma pergunta é o defeito que esta fatia existe para
 * evitar. `divergiu` diz numa linha só que o congelado é mais velho.
 *
 * 🔴 27 de 34 favoritos não têm nem a letra — é o estado MAIS COMUM, não a
 * exceção. Sem letra, o campo é "Perfil DISC ainda não informado", nunca um
 * traço ou letra inventada. Campo rico vazio SOME da tela (não vira rótulo
 * com valor em branco): três rótulos vazios seguidos leem como defeito.
 */
function BlocoDisc({ disc }: { disc: Record<string, unknown> }) {
  // 🔴 A chave é `letra`, NÃO `perfil_disc`. A RPC `sessao_briefing_ler`
  // devolve `disc_ao_vivo = {letra, consciencia, gatilhos, relacionamento,
  // divergiu, congelado_era, atualizado_em, atualizado_por}` — o nome
  // `perfil_disc` é o da COLUNA em `etapa1_clientes`, não o do JSON.
  //
  // Enquanto lia a chave errada, este bloco mostrava "Perfil DISC ainda não
  // informado" para TODO cliente, inclusive os 127 que têm a letra — ou seja,
  // escondia da doutora exatamente o dado que ela abre o briefing para ver.
  // Achado em 22/09 pela suíte E2E; `tsc` não pega porque o JSON chega como
  // `Record<string, unknown>` e qualquer chave inexistente é `undefined`.
  const letra = typeof disc.letra === "string" ? disc.letra : null;
  const consciencia = typeof disc.consciencia === "string" ? disc.consciencia : null;
  const gatilhos = typeof disc.gatilhos === "string" ? disc.gatilhos : null;
  const relacionamento =
    typeof disc.relacionamento === "string" ? disc.relacionamento : null;
  const divergiu = disc.divergiu === true;

  return (
    <div className="grid gap-2 border-t border-borda-fina pt-3">
      <p className="rotulo text-muted-foreground">Perfil DISC</p>

      {letra ? (
        <dl className="grid gap-2">
          <Campo rotulo="Letra" valor={letra} />
          {consciencia ? (
            <Campo rotulo="Consciência" valor={consciencia} bloco />
          ) : null}
          {gatilhos ? <Campo rotulo="Gatilhos" valor={gatilhos} bloco /> : null}
          {relacionamento ? (
            <Campo rotulo="Relacionamento" valor={relacionamento} bloco />
          ) : null}
        </dl>
      ) : (
        <p className="corpo-sm text-muted-foreground">
          Perfil DISC ainda não informado.
        </p>
      )}

      {divergiu ? (
        <p className="corpo-sm text-muted-foreground">
          Atualizado depois do agendamento.
        </p>
      ) : null}
    </div>
  );
}

function txt(v: unknown): string {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (Array.isArray(v) && v.length > 0) return v.map(String).join(", ");
  return "—";
}

function Campo({
  rotulo,
  valor,
  bloco = false,
}: {
  rotulo: string;
  valor: string;
  bloco?: boolean;
}) {
  return (
    <div className={bloco ? "grid gap-0.5" : "flex flex-wrap gap-x-3 gap-y-0.5"}>
      <dt className={bloco ? "rotulo text-muted-foreground" : "w-40 shrink-0 rotulo text-muted-foreground"}>
        {rotulo}
      </dt>
      <dd className="min-w-0 flex-1 corpo-sm whitespace-pre-wrap">{valor}</dd>
    </div>
  );
}
