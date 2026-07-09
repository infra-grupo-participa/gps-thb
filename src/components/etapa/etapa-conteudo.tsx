import Link from "next/link";
import { Star, ArrowRight, Lock } from "lucide-react";
import {
  getAgendamentosEtapa3,
  getClienteEquipe,
  getClientesEtapa1,
  getEnfasesEtapa,
  getMembro,
  getProgressoEtapa,
  getRevisaoEtapa3,
} from "@/lib/data";
import { conteudoEtapa } from "@/lib/etapas";
import { Etapa1Guide } from "@/components/etapa1/etapa1-guide";
import { EtapaGuide } from "@/components/etapa/etapa-guide";
import { Etapa3Guide } from "@/components/etapa/etapa3-guide";
import { ClienteEquipeBanner } from "@/components/etapa/cliente-equipe-banner";
import { Card, CardContent } from "@/components/ui/card";
import type { Etapa3Agendamento, Etapa3Revisao } from "@/lib/types";

/**
 * A partir desta etapa o aluno precisa ter escolhido o cliente que a equipe vai
 * acompanhar (o favorito). Vale para Contrato (4), Execução (5) e Entrega (6).
 */
const ETAPA_MIN_FAVORITO = 4;

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

  const [progresso, enfases] = await Promise.all([
    getProgressoEtapa(alunoId, n),
    getEnfasesEtapa(alunoId, n),
  ]);

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
        enfasesIniciais={enfases}
        isAdmin={isAdmin}
      />
    );
  }

  // Etapas 2–6 giram em torno do cliente acompanhado pela equipe.
  const clienteEquipe = await getClienteEquipe(alunoId);
  const exigeFavorito = n >= ETAPA_MIN_FAVORITO;

  // Da Etapa 04 em diante, fica travada até o aluno escolher o cliente que a
  // equipe acompanhará. O admin ainda pode pré-visualizar (com aviso).
  if (exigeFavorito && !clienteEquipe && !isAdmin) {
    return <BloqueioFavorito basePath={basePath} />;
  }

  let guia;
  if (n === 3) {
    const [agendamentos, revisao] = await Promise.all([
      getAgendamentosEtapa3(alunoId),
      getRevisaoEtapa3(alunoId),
    ]);
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
      {exigeFavorito && !clienteEquipe && isAdmin ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          Para o aluno, esta etapa fica bloqueada até ele escolher o cliente
          acompanhado pela equipe.
        </div>
      ) : null}
      <ClienteEquipeBanner cliente={clienteEquipe} basePath={basePath} />
      {guia}
    </div>
  );
}

function BloqueioFavorito({ basePath }: { basePath: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="size-6" />
        </div>
        <div className="max-w-md">
          <h2 className="text-lg font-semibold">
            Escolha o cliente que a equipe vai acompanhar
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Do Contrato em diante, o programa gira em torno de um cliente. Na aba
            Clientes, marque com a{" "}
            <Star className="inline size-3.5 -translate-y-px fill-primary text-primary" />{" "}
            estrela o cliente em que você quer o apoio da equipe. Assim que
            escolher, esta etapa abre.
          </p>
        </div>
        <Link
          href={`${basePath}/clientes`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          Ir para Clientes <ArrowRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
