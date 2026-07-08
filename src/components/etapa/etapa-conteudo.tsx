import {
  getAgendamentosEtapa3,
  getClientesEtapa1,
  getMembro,
  getProgressoEtapa,
  getRevisaoEtapa3,
} from "@/lib/data";
import { conteudoEtapa } from "@/lib/etapas";
import { Etapa1Guide } from "@/components/etapa1/etapa1-guide";
import { EtapaGuide } from "@/components/etapa/etapa-guide";
import { Etapa3Guide } from "@/components/etapa/etapa3-guide";
import type { Etapa3Agendamento, Etapa3Revisao } from "@/lib/types";

/**
 * Renderiza o guia certo para a etapa (etapa 1 e 3 têm campos próprios;
 * as demais usam o guia genérico de checklist). basePath define os links.
 */
export async function EtapaConteudo({
  alunoId,
  n,
  basePath,
  isAdmin,
}: {
  alunoId: string;
  n: number;
  basePath: string;
  isAdmin: boolean;
}) {
  const conteudo = conteudoEtapa(n);
  if (!conteudo) return null;

  const progresso = await getProgressoEtapa(alunoId, n);

  if (n === 1) {
    const [clientes, membro] = await Promise.all([
      getClientesEtapa1(alunoId),
      getMembro(alunoId),
    ]);
    return (
      <Etapa1Guide
        alunoId={alunoId}
        clientesIniciais={clientes}
        progressoInicial={progresso}
        dataAgendamentoInicial={membro?.data_agendamento_disponivel ?? null}
        clientesHref={`${basePath}/clientes`}
      />
    );
  }

  if (n === 3) {
    const [agendamentos, revisao] = await Promise.all([
      getAgendamentosEtapa3(alunoId),
      getRevisaoEtapa3(alunoId),
    ]);
    return (
      <Etapa3Guide
        alunoId={alunoId}
        tarefas={conteudo.tarefas}
        progressoInicial={progresso}
        agendamentosIniciais={agendamentos as Etapa3Agendamento[]}
        revisaoInicial={revisao as Etapa3Revisao | null}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <EtapaGuide
      alunoId={alunoId}
      etapa={n}
      tarefas={conteudo.tarefas}
      meta={conteudo.meta}
      progressoInicial={progresso}
    />
  );
}
