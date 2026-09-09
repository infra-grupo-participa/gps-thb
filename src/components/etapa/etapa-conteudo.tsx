import {
  getAgendamentosEtapa3,
  getAmbiente,
  getClienteEquipe,
  getClientesEtapa1,
  getEnfasesEtapa,
  getProgressoEtapa,
  getRevisaoEtapa3,
} from "@/lib/data";
import { conteudoEtapa } from "@/lib/etapas";
import { Etapa1Guide } from "@/components/etapa1/etapa1-guide";
import { EtapaGuide } from "@/components/etapa/etapa-guide";
import { Etapa3Guide } from "@/components/etapa/etapa3-guide";
import { ClienteEquipeBanner } from "@/components/etapa/cliente-equipe-banner";
import type { Etapa3Agendamento, Etapa3Revisao, ModoEnfase } from "@/lib/types";

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

  // CD12: a etapa 3 tem guia próprio (`Etapa3Guide`) e ele NÃO recebe
  // `enfasesIniciais` — buscar as ênfases ali era uma ida ao banco por
  // abertura da Etapa 03 cujo resultado ia direto para o lixo. Quem consome
  // é `Etapa1Guide` (n === 1) e `EtapaGuide` (2, 4, 5, 6).
  // ⚠️ Se um dia `Etapa3Guide` passar a destacar tarefa, é aqui que a
  // condição precisa cair junto — senão o destaque some sem erro nenhum.
  const usaEnfases = n !== 3;

  // PF3 — eram DOIS `Promise.all` em série: o segundo lote (clientes/ambiente,
  // ou o cliente da equipe) só começava depois que progresso e ênfases
  // voltavam, embora não dependa nem de um nem de outro. Duas idas em série a
  // sa-east-1 custavam ~44 ms de espera pura. As promessas continuam criadas
  // aqui e são TODAS aguardadas no mesmo `Promise.all` do ramo — nenhuma fica
  // solta (rejeição não tratada).
  const pProgresso = getProgressoEtapa(alunoId, n);
  const pEnfases = usaEnfases
    ? getEnfasesEtapa(alunoId, n)
    : Promise.resolve({} as Record<number, ModoEnfase>);

  if (n === 1) {
    const [progresso, enfases, clientes, ambiente] = await Promise.all([
      pProgresso,
      pEnfases,
      getClientesEtapa1(alunoId),
      getAmbiente(alunoId),
    ]);
    // Os passos 4+ da Etapa 01 só liberam após escolher o cliente da equipe.
    const temFavorito = clientes.some((c) => c.acompanhado_equipe);
    return (
      <Etapa1Guide
        alunoId={alunoId}
        clientesIniciais={clientes}
        progressoInicial={progresso}
        dataAgendamentoInicial={ambiente?.data_agendamento_disponivel ?? null}
        clientesHref={`${basePath}/clientes`}
        enfasesIniciais={enfases}
        isAdmin={isAdmin}
        temFavorito={temFavorito}
      />
    );
  }

  // Etapas 2–6 giram em torno do cliente acompanhado pela equipe.
  //
  // PF3 — aqui eram TRÊS estágios em série (progresso/ênfases → cliente da
  // equipe → agendamentos/revisão da Etapa 03). Nenhum depende do anterior,
  // então viram um lote só. As duas consultas exclusivas da Etapa 03 continuam
  // só acontecendo na Etapa 03 — nas outras a promessa já nasce resolvida,
  // exatamente como o `usaEnfases` acima.
  const ehEtapa3 = n === 3;
  const [progresso, enfases, clienteEquipe, agendamentos, revisao] =
    await Promise.all([
      pProgresso,
      pEnfases,
      getClienteEquipe(alunoId),
      ehEtapa3 ? getAgendamentosEtapa3(alunoId) : Promise.resolve([]),
      ehEtapa3 ? getRevisaoEtapa3(alunoId) : Promise.resolve(null),
    ]);

  let guia;
  if (ehEtapa3) {
    guia = (
      <Etapa3Guide
        alunoId={alunoId}
        tarefas={conteudo.tarefas}
        progressoInicial={progresso}
        agendamentosIniciais={agendamentos as Etapa3Agendamento[]}
        revisaoInicial={revisao as Etapa3Revisao | null}
        isAdmin={isAdmin}
      />
    );
  } else {
    guia = (
      <EtapaGuide
        alunoId={alunoId}
        etapa={n}
        tarefas={conteudo.tarefas}
        meta={conteudo.meta}
        progressoInicial={progresso}
        enfasesIniciais={enfases}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <ClienteEquipeBanner cliente={clienteEquipe} basePath={basePath} />
      {guia}
    </div>
  );
}
