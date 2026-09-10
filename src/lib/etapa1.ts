// Conteúdo estático da Etapa 01 (da planilha oficial do GPS).
// Não é dado de aluno — é a definição do programa.

import type {
  NivelRelacionamento,
  FaseCliente,
  FaseCliente1,
  GrauRelacao,
  PerfilDisc,
} from "@/lib/types";

/** Meta de reuniões preliminares agendadas na Etapa 01. */
export const META_REUNIOES = 15;

/** Quantidade de clientes potenciais a listar. */
export const META_CLIENTES = 30;

/**
 * Meta de faturamento por AMBIENTE, em reais (B8): soma dos honorários
 * CONTRATADOS, programa inteiro — não por ano nem por turma, porque nenhuma
 * coluna de `gps.etapa1_clientes` registra competência hoje. Valor
 * CONTRATADO, não recebido: o portal não sabe o que entrou no caixa do aluno.
 *
 * 🎯 Bater esta meta é o **AURUM** (ouro em latim) — o objetivo do programa e a
 * ÚNICA régua que o aluno vê. O segundo marco de R$ 250.000 ("bônus do
 * programa") saiu da interface em 09/09/2026 a pedido do João: ninguém sabia
 * dizer o que era o bônus, e uma segunda meta atrás da primeira só empurrava o
 * objetivo para longe.
 */
export const META_HONORARIOS = 150_000;

/** Os 7 problemas — o cliente deve ter ao menos um. */
export const PROBLEMAS_7: { id: string; rotulo: string }[] = [
  { id: "dividendos", rotulo: "Recebe dividendos relevantes" },
  {
    id: "lucro_presumido",
    rotulo: "Empresa no lucro presumido com faturamento elevado",
  },
  { id: "alugueis_pf", rotulo: "Recebe aluguéis como pessoa física" },
  {
    id: "negocio_familiar",
    rotulo: "Negócio familiar com sócios, irmãos ou investidores",
  },
  {
    id: "dependente_fundador",
    rotulo: "Patrimônio/negócio dependente do fundador",
  },
  { id: "patrimonio_risco", rotulo: "Patrimônio exposto a riscos futuros" },
  { id: "inventario_caro", rotulo: "Patrimônio que geraria inventário caro" },
];

export const NIVEIS_RELACIONAMENTO: {
  id: NivelRelacionamento;
  rotulo: string;
}[] = [
  { id: "frio", rotulo: "Frio" },
  { id: "morno", rotulo: "Morno" },
  { id: "quente", rotulo: "Quente" },
];

/**
 * As 3 fases de negócio do cliente (migração 20260909000060), no lugar dos 5
 * status. Sem catraca: o cliente pode voltar de fase a qualquer momento.
 */
export const FASES_CLIENTE: {
  id: FaseCliente;
  /** Rótulo singular — badge, ficha. */
  rotulo: string;
  /** Rótulo plural — cabeçalho de coluna do quadro. */
  coluna: string;
  /** Uma linha explicando o que a fase significa. */
  ajuda: string;
  /**
   * Par fundo/texto da fase, em TOKENS SEMÂNTICOS do portal — nunca classe
   * Tailwind crua. Antes eram `bg-amber-100 text-amber-900` e
   * `bg-emerald-600 text-white`, escritos aqui, fora do sistema de badge:
   * a regra de negócio carregava paleta, e ninguém media o contraste.
   * Medido no DOM, com o texto em 12 px (a fase aparece como chip):
   *   prospeccao  #5C5751 sobre #F1EEEA = **6,18:1**  (era 5,56:1)
   *   fechamento  #8A5300 sobre #FFF4E0 = **5,81:1**  (era 3,65:1 — reprovava)
   *   contratado  #186A3B sobre #E8F5EC = **5,91:1**  (era 3,77:1 — reprovava)
   * Mesma cor e mesmo significado de antes (cinza / âmbar / verde); o que
   * mudou é o tom, para passar AA, e a origem, que agora é o token.
   */
  cor: string;
}[] = [
  {
    id: "prospeccao",
    rotulo: "Prospecção",
    coluna: "Prospecção",
    ajuda: "Ainda em contato — mensagem, ligação, tentativa de agenda.",
    cor: "bg-neutro text-neutro-foreground",
  },
  {
    id: "fechamento",
    rotulo: "Fechamento",
    coluna: "Fechamento",
    ajuda: "Da reunião preliminar ao croqui estrutural.",
    cor: "bg-atencao text-atencao-foreground",
  },
  {
    id: "contratado",
    rotulo: "Contratado",
    coluna: "Contratados",
    ajuda: "Contrato fechado — segue para a execução.",
    cor: "bg-sucesso text-sucesso-foreground",
  },
];

/**
 * Rótulos do GRAU DE RELAÇÃO (migração 20260910000202), no molde de
 * `FASES_CLIENTE`. Espelha o CHECK `chk_etapa1_clientes_grau_relacao` — os dois
 * têm de ter os mesmos 6 valores.
 *
 * ⚠️ É outro eixo, não substitui `NIVEIS_RELACIONAMENTO` (temperatura). E
 * `null` nunca vira um destes rótulos na tela: a ausência de resposta sobre um
 * terceiro se diz "não informado".
 */
export const GRAUS_RELACAO_UI: {
  id: GrauRelacao;
  rotulo: string;
  /** Uma linha explicando quando escolher — o vocabulário do programa. */
  ajuda: string;
}[] = [
  {
    id: "parente",
    rotulo: "Parente",
    ajuda: "Família — pai, mãe, irmão, tio, primo.",
  },
  {
    id: "amigo",
    rotulo: "Amigo",
    ajuda: "Relação pessoal próxima, fora da família.",
  },
  {
    id: "conhecido",
    rotulo: "Conhecido",
    ajuda: "Já se falaram, mas não é próximo.",
  },
  {
    id: "indicacao",
    rotulo: "Indicação",
    ajuda: "Chegou por alguém que confia em você.",
  },
  {
    id: "cliente_atual",
    rotulo: "Cliente atual",
    ajuda: "Já é seu cliente em outro serviço.",
  },
  {
    id: "lead",
    rotulo: "Lead",
    ajuda: "Veio da captação — ainda não te conhece.",
  },
];

/**
 * As TRÊS respostas do passo 3 do onboarding e a fase de cliente que cada uma
 * produz. **O mapa mora aqui e em `gps.onboarding_concluir()`** — um lugar por
 * camada, e os dois dizem o mesmo. Se um dia divergirem, quem manda é o banco.
 *
 * 🔑 Decisão C-1: NENHUMA 4ª fase de cliente. `contratado` já significa
 * "contrato fechado, segue para a execução" (é o texto de ajuda de
 * `FASES_CLIENTE`), e criar valor novo em cima de **0 linhas contratadas** e do
 * backfill de 08/09 seria desenhar sobre hipótese. A granularidade que se
 * perderia fica guardada em `gps.onboarding_respostas.fase_cliente1`, que é o
 * retrato do dia 0; o que a equipe precisa é o derivado `apto_ao_saldo`.
 */
export const FASES_CLIENTE1_UI: {
  id: FaseCliente1;
  /** Copy LITERAL do João — não reescrever. */
  rotulo: string;
  faseCliente: FaseCliente;
}[] = [
  {
    // Sessão/reunião marcada, ainda não realizada. Vira `prospeccao`: não
    // houve reunião, então não é fechamento.
    id: "agendado",
    rotulo:
      "Sessão de viabilidade já agendada ou Reunião preliminar já agendada, aguardando realização",
    faseCliente: "prospeccao",
  },
  {
    id: "viabilidade_feita",
    rotulo: "Sessão de viabilidade já realizada e Croqui estrutural a apresentar",
    faseCliente: "fechamento",
  },
  {
    id: "croqui_apresentado",
    rotulo: "Croqui Estrutural já apresentado e aguardando a execução",
    faseCliente: "fechamento",
  },
  {
    id: "execucao_andamento",
    rotulo: "Execução em andamento",
    faseCliente: "contratado",
  },
];

export const PERFIS_DISC: { id: PerfilDisc; rotulo: string }[] = [
  { id: "D", rotulo: "D — Dominância" },
  { id: "I", rotulo: "I — Influência" },
  { id: "S", rotulo: "S — Estabilidade" },
  { id: "C", rotulo: "C — Conformidade" },
];

/** Definição de uma tarefa de etapa. */
export interface TarefaDef {
  /** Identificador estável usado no banco (gps.progresso.tarefa). Não muda. */
  num: number;
  /** Rótulo de exibição (ex.: "1.1"). Cai para `num` quando ausente. */
  codigo?: string;
  titulo: string;
  descricao: string;
  /** Tarefa medida automaticamente (não é checkbox manual). */
  automatica?: boolean;
  /** Sinaliza que o registro/gestão desta tarefa acontece na aba Clientes. */
  apontaClientes?: boolean;
  /** Passo que só libera depois que o aluno escolhe o cliente da equipe (favorito). */
  exigeFavorito?: boolean;
  /** Passo que só libera quando a tarefa de `num` indicado estiver concluída. */
  exigeTarefa?: number;
  /** Link da aula/tutorial (coluna "Aula" da planilha), quando houver. */
  tutorialUrl?: string;
  /** Modelo/arquivo de apoio (coluna "Modelo" da planilha), quando houver. */
  modelo?: { nome: string; url?: string };
  /** Observação/informação extra exibida ao aluno (coluna "Informações"). */
  info?: string;
}

// Os `num` são mantidos estáveis (referenciados por gps.progresso). O passo 6
// original ("Preencher os dados dos 30") foi absorvido como contexto do passo 1.
// A exibição usa `codigo`: os dois primeiros passos são 1.1 e 1.2 (mesmo
// objetivo — montar a base de clientes), e os demais seguem 2..8.
export const TAREFAS_ETAPA1: TarefaDef[] = [
  {
    num: 1,
    // 🔑 SEM `codigo` (10/09/2026): era "1.1" porque existia uma "1.2"
    // (identificar a perda pela inércia). A 1.2 foi ABOLIDA por decisão do
    // Marcio, e um "1.1" sozinho não faz sentido — o passo volta a ser o 1.
    // `TarefaItem` cai para `num` quando `codigo` é ausente.
    titulo: "Listar 30 clientes potenciais",
    descricao:
      "Liste 30 possíveis clientes do seu círculo de relacionamento que tenham pelo menos um dos sete problemas. Preencha os dados de cada um — nome, telefone, nível de relacionamento, registro do contato e a data da reunião preliminar.",
    automatica: true,
    apontaClientes: true,
    modelo: {
      nome: "Sete Problemas x Sete Clientes.pdf",
      url: "https://drive.google.com/file/d/18rwgOgYjjPXkaxL6qOr-nAZ29sol5v7g/view?usp=drive_link",
    },
  },
  // 🔴 A TAREFA `num: 2` ("Identificar a perda pela inércia", exibida como
  // "1.2") FOI ABOLIDA em 10/09/2026, por decisão do Marcio: a perda pela
  // inércia saiu do sistema inteiro — ficha, criação de cliente e tarefa.
  //
  // ⚠️ O `num: 2` fica APOSENTADO. `num` é a identidade estável referenciada
  //    por `gps.progresso`; ela era AUTOMÁTICA (nunca gravou linha manual),
  //    então não há histórico a preservar — mas o número não se reaproveita,
  //    pela mesma regra do `num: 4` (a antiga "mensagem de estudo de caso").
  //    **Não usar o 2 para outra coisa.**
  // 🔴 AS DUAS TAREFAS DE MENSAGEM VIRARAM UMA (10/09/2026).
  //
  // "Enviar mensagem padrão" (num 3) e "Enviar mensagem de estudo de caso"
  // (num 4) foram ABOLIDAS por decisão do Marcio: elas descreviam de memória
  // um método que o documento oficial (`Método Holding Brasil.md`) define
  // como **uma sequência de 3 mensagens**, com copy pronta e instruções de
  // envio próprias. Duas tarefas soltas não davam ao aluno o texto para
  // mandar — só o mandavam escrever sozinho.
  //
  // 🔑 O `num: 3` É REUSADO, NÃO APAGADO. `num` é a identidade estável
  // referenciada por `gps.progresso`: 3 ambientes já tinham marcado a
  // tarefa 3 e 3 a tarefa 4 (medido em 10/09). Reusar o 3 faz o progresso
  // deles continuar valendo para a tarefa que substitui a antiga.
  //
  // ⚠️ O `num: 4` fica APOSENTADO — some da tela, mas as 3 linhas antigas
  //    continuam em `gps.progresso`. `TAREFAS_ETAPA1` é a fonte do que se
  //    exibe, então linha órfã não aparece; e não se apaga histórico de
  //    aluno para limpar catálogo. **Não reaproveitar o 4 para outra coisa.**
  {
    num: 3,
    codigo: "2",
    titulo: "Enviar a sequência de 3 mensagens",
    descricao:
      "Envie a sequência de 3 mensagens para marcar a reunião preliminar: o problema (dia 1), a solução (dia 3) e a urgência com os dois horários (dia 5). O texto de cada uma está pronto abaixo — abra, copie e leia as instruções de envio antes de mandar.",
    exigeTarefa: 1,
  },
  {
    num: 5,
    codigo: "4",
    titulo: "Ligar e oferecer duas opções de agenda",
    descricao:
      "No dia seguinte, ligue para cada um dos 30, retome a especialização e ofereça duas opções de agenda. Meta: agendar pelo menos 15 reuniões preliminares.",
    exigeFavorito: true,
  },
  {
    num: 7,
    codigo: "5",
    titulo: "Criar os grupos de WhatsApp",
    descricao:
      "Crie os grupos de WhatsApp com os clientes que aderiram à Reunião Preliminar.",
    exigeFavorito: true,
  },
  {
    num: 8,
    codigo: "6",
    titulo: "Realizar a entrevista prévia (perfil DISC)",
    descricao:
      "Faça a entrevista prévia com cada agendado, identifique o perfil DISC e quem são os tomadores de decisão — trazendo-os para a reunião.",
    exigeFavorito: true,
  },
  {
    num: 9,
    codigo: "7",
    titulo: "Criar conta de negócio na Hotmart",
    descricao: "Crie uma conta de negócio na Hotmart.",
    tutorialUrl: "https://1sh.co/877580e0",
    exigeFavorito: true,
  },
  {
    num: 10,
    codigo: "8",
    titulo: "Criar os produtos na Hotmart",
    descricao:
      "Crie os produtos: Sessão de Viabilidade, Croqui Estrutural e Execução Holding.",
    tutorialUrl:
      "https://membros.holdingmasters.com.br/playlist/5EoqQB6Ko0/file/6NKzBzneDz",
    exigeFavorito: true,
  },
];

import type { ClienteEtapa1 } from "@/lib/types";

export interface MetricasEtapa1 {
  preenchidos: number;
  comDados: number;
  agendados: number;
  totalTarefas: number;
  totalConcluidas: number;
  pct: number;
  tarefaConcluida: (num: number) => boolean;
}

/**
 * As três contagens de cliente de que a Etapa 01 depende. Existe para que a
 * regra de conclusão/`pct` possa ser calculada SEM as linhas de cliente — é o
 * que permite ao painel do admin agregar no banco (`gps.admin_painel_alunos()`,
 * migração 20260909000050) em vez de trazer a base inteira para o Node.
 */
export interface ContagensEtapa1 {
  preenchidos: number;
  comDados: number;
  agendados: number;
}

/**
 * Métricas derivadas SÓ das contagens — sem precisar das linhas de cliente.
 * Fonte ÚNICA da regra de conclusão de tarefa e de `pct`: quem tem os clientes
 * chama `calcularMetricasEtapa1` (que delega aqui) e quem só tem as contagens
 * (o painel) chama esta função direto. Sem isso, o catálogo de tarefas teria de
 * ser duplicado em SQL — catálogo é código, não dado.
 */
export function resumoEtapa1(
  c: ContagensEtapa1,
  manual: Record<number, boolean>,
): {
  totalTarefas: number;
  totalConcluidas: number;
  pct: number;
  tarefaConcluida: (num: number) => boolean;
} {
  const tarefaConcluida = (num: number): boolean => {
    switch (num) {
      case 1:
        // "Listar 30 clientes" inclui preencher os dados essenciais: nome e
        // telefone (o nível de relacionamento saiu em 10/09/2026).
        return c.preenchidos >= META_CLIENTES && c.comDados >= META_CLIENTES;
      // O `case 2` (perda pela inércia) saiu com a tarefa. Ver o catálogo.
      default:
        return Boolean(manual[num]);
    }
  };

  const totalConcluidas = TAREFAS_ETAPA1.filter((t) =>
    tarefaConcluida(t.num),
  ).length;

  return {
    totalTarefas: TAREFAS_ETAPA1.length,
    totalConcluidas,
    pct: Math.round((totalConcluidas / TAREFAS_ETAPA1.length) * 100),
    tarefaConcluida,
  };
}

/**
 * Calcula as métricas e o estado das tarefas da Etapa 01 a partir dos clientes
 * e do mapa de tarefas manuais concluídas. Pura — usada no servidor e no cliente.
 * Deriva as contagens e delega a regra a `resumoEtapa1`.
 */
export function calcularMetricasEtapa1(
  clientes: ClienteEtapa1[],
  manual: Record<number, boolean>,
): MetricasEtapa1 {
  const preenchidos = clientes.filter((c) => c.nome.trim() !== "").length;
  // 🔴 FICHA COMPLETA = NOME + TELEFONE (decisão do Marcio, 10/09/2026).
  //
  // O `nivel_relacionamento` (quente/morno/frio) SAIU do sistema junto com a
  // perda pela inércia. Ele fazia parte desta conta, e é a conta que decide
  // a trava dos 30 — a porta de saída da fase Inicial.
  //
  // ⚠️ O `grau_relacao` (parente/amigo/indicação…) NÃO entrou no lugar dele.
  //    Medido em 10/09: 595 clientes tinham nível preenchido e só 27 tinham
  //    grau. Exigir grau ZERARIA os 5 ambientes que já bateram os 30 e
  //    obrigaria 60 ambientes a revisitar fichas para reinformar algo que
  //    já haviam informado. O grau continua obrigatório na CRIAÇÃO de
  //    cliente novo — só não retroage sobre quem cadastrou antes de ele
  //    existir.
  const comDados = clientes.filter((c) => c.nome.trim() && c.telefone).length;
  // EVIDÊNCIA, não `status` (congelado na migração 20260909000060) e não
  // `fase` (que o aluno edita arrastando o card no quadro — arrastar para
  // "Fechamento" não é uma reunião agendada). Mesmo critério do painel do
  // admin, gps.admin_painel_alunos() (migração 20260909000061): o número da
  // tela do aluno e o do painel têm de ser o mesmo número.
  const agendados = clientes.filter(
    (c) => c.data_reuniao_preliminar != null || c.aderiu_reuniao,
  ).length;
  const resumo = resumoEtapa1({ preenchidos, comDados, agendados }, manual);

  return { preenchidos, comDados, agendados, ...resumo };
}

/**
 * Resumo dos honorários de um ambiente — a comprovação de faturamento (B8).
 *
 * `total` é `number | null` de propósito: `null` significa "nenhum contratado
 * tem valor registrado" e é DIFERENTE de `R$ 0,00`. A coluna
 * `valor_honorarios` nasceu vazia nas 879 linhas; um `?? 0` aqui faria a tela
 * anunciar "faturamento zero" para quem simplesmente ainda não digitou —
 * número plausível e errado. Quem consome é obrigado a tratar os três estados.
 */
/**
 * O mínimo que se precisa saber de um cliente para contar a meta.
 *
 * `ClienteEtapa1` satisfaz este formato, então nada muda para quem já chama
 * `resumoHonorarios(clientes)`. Existir separado permite que a aba Financeiro
 * leia do banco só estes 4 campos (`getClientesHonorarios`) em vez das 20
 * colunas da ficha — o egress do Supabase tem teto DA ORGANIZAÇÃO, dividido
 * com o sip, e `registro_contato` é dado de terceiro que não tem por que
 * trafegar até uma tela de dinheiro.
 */
export interface ClienteHonorarios {
  id: string;
  nome: string;
  fase: FaseCliente;
  valor_honorarios: number | null;
}

export interface ResumoHonorarios {
  /** Soma dos contratados COM valor. `null` quando nenhum contratado tem valor. */
  total: number | null;
  /** Quantos clientes estão em `fase === "contratado"`. */
  contratados: number;
  /** Desses, quantos ainda com `valor_honorarios` nulo. */
  contratadosSemValor: number;
  /** 0–100, limitado a 100. `null` quando `total` é `null`. */
  pct: number | null;
}

/**
 * Contagem pura dos honorários a partir das linhas de cliente.
 *
 * Mesma razão de existir de `resumoEtapa1`: a tela do aluno e o painel do
 * admin têm de mostrar O MESMO número, e a regra ("só `fase = 'contratado'`
 * conta") não pode existir solta em SQL e em JS com liberdade de divergir.
 * O espelho em SQL é a CTE `cli` de `gps.admin_painel_alunos()` (migração
 * 20260909000091) — mudar um lado obriga a mudar o outro.
 *
 * Cliente que voltou de fase mantém o valor no banco (B9-b, sem constraint) e
 * simplesmente não é contado aqui.
 */
export function resumoHonorarios(
  clientes: readonly ClienteHonorarios[],
): ResumoHonorarios {
  const contratados = clientes.filter((c) => c.fase === "contratado");
  const comValor = contratados.filter((c) => c.valor_honorarios != null);

  const total = comValor.length
    ? comValor.reduce((soma, c) => soma + (c.valor_honorarios ?? 0), 0)
    : null;

  return {
    total,
    contratados: contratados.length,
    contratadosSemValor: contratados.length - comValor.length,
    pct:
      total === null
        ? null
        : Math.min(100, Math.round((total / META_HONORARIOS) * 100)),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Progresso de faturamento na mentoria (aba Financeiro v2, 09/09/2026)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Onde o ambiente está na meta do programa.
 *
 * `em_andamento` cobre TAMBÉM o caso "nenhum contratado com valor" — a UI
 * distingue pelo `faturado === null`, que é o estado "ainda não há o que
 * mostrar", diferente de "faturou pouco".
 *
 * 🔑 `"aureo"` é IDENTIFICADOR INTERNO, nunca texto de tela: o que o aluno lê
 * é **AURUM**. Renomear o literal obrigaria a mexer em quem já compara com
 * ele, sem trocar uma letra do produto.
 */
export type NivelFaturamento = "em_andamento" | "aureo";

/** Um contratado na lista da aba — só o que a tela de dinheiro precisa. */
export interface ContratadoResumo {
  clienteId: string;
  nome: string;
  /** `null` = contratado sem honorários informados. NUNCA exibir como R$ 0,00. */
  valor: number | null;
}

/**
 * O painel de progresso financeiro do aluno na mentoria.
 *
 * 🔑 `faturado` é `number | null`: `null` significa "nenhum contratado tem
 * valor registrado" e é DIFERENTE de R$ 0,00. A coluna `valor_honorarios`
 * nasceu vazia nas 879 linhas; escrever "R$ 0 de R$ 150.000" seria uma
 * afirmação sobre o faturamento do aluno que o portal não tem como fazer.
 * Todos os derivados (`faltaParaMeta`, `pctMeta`) seguem o mesmo caminho e são
 * `null` junto.
 */
export interface ProgressoFaturamento {
  /** Soma dos honorários dos clientes em `fase='contratado'`. */
  faturado: number | null;
  /** R$ 150.000 — bater é o objetivo do programa, o **AURUM**. */
  meta: number;
  /** Quanto falta para o AURUM. `0` quando já bateu. */
  faltaParaMeta: number | null;
  /** 0–100 sobre a meta. Teto 100. */
  pctMeta: number | null;
  nivelAtual: NivelFaturamento;
  /** Quantos clientes estão em `fase='contratado'`. */
  contratados: number;
  /** Desses, quantos ainda sem `valor_honorarios` — vira aviso na tela. */
  contratadosSemValor: number;
  /** Os contratados, do maior valor para o menor; sem valor por último. */
  clientes: ContratadoResumo[];
}

/**
 * Progresso de faturamento a partir das linhas de cliente do ambiente.
 *
 * 🔑 REGRA NUM LUGAR SÓ: a soma continua saindo de `resumoHonorarios` — esta
 * função só acrescenta a meta (o AURUM) e a lista. Se a regra de "o que
 * conta para a meta" fosse reescrita aqui, a home, a aba Clientes e a aba
 * Financeiro ganhariam liberdade de divergir, e o aluno veria dois números
 * para a mesma pergunta. O espelho em SQL é a CTE `cli` de
 * `gps.admin_painel_alunos()` (migração 20260909000091).
 *
 * Pura de propósito (sem React, sem banco): a aba Financeiro a usa pelo
 * servidor (`getProgressoFaturamento`) e o `MetaHonorarios` a usa no client
 * com a lista que já tem em memória. Mesma conta, zero consulta nova.
 */
export function progressoFaturamento(
  clientes: readonly ClienteHonorarios[],
): ProgressoFaturamento {
  const resumo = resumoHonorarios(clientes);
  const faturado = resumo.total;

  const contratados = clientes
    .filter((c) => c.fase === "contratado")
    .map<ContratadoResumo>((c) => ({
      clienteId: c.id,
      nome: c.nome,
      valor: c.valor_honorarios ?? null,
    }))
    // Maior valor primeiro; quem ainda não tem valor fica no fim, onde a UI
    // pede o preenchimento. `localeCompare` desempata para a ordem não dançar
    // entre dois carregamentos da mesma tela.
    .sort((a, b) => {
      if (a.valor === b.valor) return a.nome.localeCompare(b.nome, "pt-BR");
      if (a.valor === null) return 1;
      if (b.valor === null) return -1;
      return b.valor - a.valor;
    });

  const nivelAtual: NivelFaturamento =
    faturado !== null && faturado >= META_HONORARIOS ? "aureo" : "em_andamento";

  return {
    faturado,
    meta: META_HONORARIOS,
    faltaParaMeta:
      faturado === null ? null : Math.max(0, META_HONORARIOS - faturado),
    pctMeta: resumo.pct,
    nivelAtual,
    contratados: resumo.contratados,
    contratadosSemValor: resumo.contratadosSemValor,
    clientes: contratados,
  };
}

/**
 * O que falta para os clientes já listados contarem na tarefa 1.
 *
 * 🔑 Existe porque o contador sozinho MENTE por omissão. O caso que motivou
 * (Carlos Ferreira, medido em 10/09/2026): 51 clientes cadastrados, nome e
 * telefone em todos os 51, nível de relacionamento em NENHUM — a tela dizia
 * "0 de 30" enquanto ele via 51 nomes na lista, e os passos 2 e 3 ficavam
 * travados sem explicação acionável.
 *
 * O critério NÃO muda (decisão do Marcio: "ele precisa preencher todos os
 * requisitos básicos para considerarmos que ele tem um cliente completo de
 * fato"). O que muda é a tela dizer QUAL campo falta, em vez de só o número.
 *
 * Medido na base: 11 ambientes e 153 clientes travados SÓ pelo nível — é de
 * longe o padrão dominante, e é o mais fácil de resolver.
 */
export function faltaParaContar(clientes: ClienteEtapa1[]): {
  /** Quantos clientes existem mas não contam. */
  incompletos: number;
  /** A frase pronta, ou `null` quando não há nada a dizer. */
  frase: string | null;
} {
  // Espelha `comDados` acima: nome + telefone. Se as duas contas divergirem,
  // a tela diz "faltam N" e não sabe dizer o que falta.
  const incompletos = clientes.filter((c) => !(c.nome.trim() && c.telefone));
  if (incompletos.length === 0) return { incompletos: 0, frase: null };

  const semNome = incompletos.filter((c) => !c.nome.trim()).length;
  const semTel = incompletos.filter((c) => !c.telefone).length;

  const n = incompletos.length;
  const plural = n === 1 ? "cliente" : "clientes";

  // Um campo só faltando em todos: a frase pode ser específica, e é a que
  // resolve o caso real. Mais de um campo: a frase genérica, senão ela
  // viraria uma lista que ninguém lê.
  const soTel = semTel === n && semNome === 0;
  const soNome = semNome === n && semTel === 0;

  if (soTel) {
    return {
      incompletos: n,
      frase: `${n} ${plural} sem telefone. Preencha para eles contarem aqui.`,
    };
  }
  if (soNome) {
    return {
      incompletos: n,
      frase: `${n} ${plural} sem nome. Preencha para eles contarem aqui.`,
    };
  }
  return {
    incompletos: n,
    frase: `${n} ${plural} ainda sem nome ou telefone.`,
  };
}
