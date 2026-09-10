// Tipos de domínio do GPS.

export type Papel = "admin" | "aluno" | "sem_acesso";

export interface Perfil {
  id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  status: string | null;
}

export interface Aluno {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  turma_id: number | null;
  plano: string | null;
  status_acesso: string | null;
  eh_socio: boolean | null;
  profissao?: string | null;
  cidade?: string | null;
  estado?: string | null;
  instagram_url?: string | null;
  youtube_url?: string | null;
  site_profissional?: string | null;
  link_facebook?: string | null;
}

/** Valores aceitos pelo CHECK `thb_alunos_plano_check`. */
export const PLANOS_ALUNO = [
  "aluno",
  "diamante",
  "platina",
  "super_diamante",
  "aurum",
] as const;
export type PlanoAluno = (typeof PLANOS_ALUNO)[number];

export interface Turma {
  id: number;
  codigo: string | null;
  tipo: string | null;
  atual: boolean | null;
}

/** Dados do cadastro manual de um aluno novo em `thb_alunos`. */
export interface NovoAlunoInput {
  nome: string;
  email: string;
  documento?: string;
  telefone?: string;
  profissao?: string;
  turmaId?: number | null;
  plano?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  bairro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  instagramUrl?: string;
  siteProfissional?: string;
  linkFacebook?: string;
}

export interface Etapa {
  id: number;
  nome: string;
  descricao: string | null;
  ordem: number;
  liberada: boolean;
}

export interface PerfilAluno {
  telefone?: string;
  profissao?: string;
  cidade?: string;
  estado?: string;
  bio?: string;
  instagram?: string;
  youtube?: string;
  linkedin?: string;
  facebook?: string;
  site?: string;
}

export type PapelMembro = "titular" | "socio";

export interface Membro {
  id: string;
  aluno_id: string;
  user_id: string | null;
  papel: PapelMembro;
  perfil: PerfilAluno;
}

/**
 * O ambiente do GPS (um por `aluno_id` titular). Compartilhado por todos os
 * membros (titular + sócios) daquele `aluno_id` — `pasta_drive_url` e
 * `data_agendamento_disponivel` são do AMBIENTE, não da pessoa.
 */
export interface Ambiente {
  aluno_id: string;
  pasta_drive_url: string | null;
  data_agendamento_disponivel: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type NivelRelacionamento = "frio" | "morno" | "quente";

/**
 * @deprecated Congelado desde a migração 20260909000060 — substituído por
 * `FaseCliente`. A coluna `status` continua no banco (é o caminho de volta:
 * `drop column fase` restaura o estado anterior sem restore de backup), mas
 * NENHUM caminho de escrita da aplicação a toca. Não escrever. O único
 * consumidor de leitura que resta é o marcador "Recusou" na UI, que some
 * sozinho quando a coluna for removida.
 */
export type StatusCliente =
  | "pendente"
  | "contatado"
  | "agendado"
  | "recusou"
  | "realizada";

/**
 * Fase de negócio do cliente (migração 20260909000060), no lugar dos 5
 * status. Sem catraca: o cliente pode voltar de fase.
 */
export type FaseCliente = "prospeccao" | "fechamento" | "contratado";

export type PerfilDisc = "D" | "I" | "S" | "C";

/**
 * TIPO DE VÍNCULO do aluno com o cliente (migração 20260910000202).
 *
 * ⚠️ Eixo ORTOGONAL a `NivelRelacionamento`, que é TEMPERATURA — existe
 * parente frio e lead quente. Não substitui nem renomeia aquele campo: os 664
 * valores de `nivel_relacionamento` respondem outra pergunta.
 *
 * `null` = não informado, o estado de nascimento das ~878 linhas. A UI **nunca**
 * pode exibir `null` como "Lead": o padrão não pode ser um palpite sobre a vida
 * de um terceiro.
 */
export const GRAUS_RELACAO = [
  "parente",
  "amigo",
  "conhecido",
  "indicacao",
  "cliente_atual",
  "lead",
] as const;
export type GrauRelacao = (typeof GRAUS_RELACAO)[number];

export interface ClienteEtapa1 {
  id: string;
  aluno_id: string;
  nome: string;
  telefone: string | null;
  nivel_relacionamento: NivelRelacionamento | null;
  problemas: string[];
  perda_inercia: number | null;
  registro_contato: string | null;
  mensagem_padrao_enviada: boolean;
  estudo_caso_enviado: boolean;
  ligacao_realizada: boolean;
  /**
   * @deprecated Congelado desde a migração 20260909000060. Não escrever —
   * `PatchCliente` (src/app/clientes/actions.ts) já não aceita este campo.
   * Continua sendo LIDO só pelo marcador "Recusou" da UI.
   */
  status: StatusCliente;
  /** Fase de negócio — substitui `status` (migração 20260909000060). */
  fase: FaseCliente;
  data_reuniao_preliminar: string | null;
  aderiu_reuniao: boolean;
  perfil_disc: PerfilDisc | null;
  acompanhado_equipe: boolean;
  ordem: number;
  /**
   * Honorários CONTRATADOS deste cliente, em reais (migração 20260909000090).
   * `null` = não informado, e isso **nunca** pode virar `R$ 0,00` na tela.
   * Só entra na meta de R$ 150.000 enquanto `fase === "contratado"` — a regra
   * vive em `resumoHonorarios` (src/lib/etapa1.ts) e em
   * `gps.admin_painel_alunos()`, nunca numa constraint da coluna: o valor
   * sobrevive a voltar de fase, apenas deixa de contar.
   */
  valor_honorarios: number | null;
  /**
   * @deprecated LEGADO desde a migração 20260910000214 (0 linhas preenchidas
   * em 10/09/2026). Link https do contrato no Drive — LINK, não upload. O
   * contrato de verdade agora é ANEXO (`contrato_path` e as 4 abaixo). A
   * coluna fica porque quem organiza a pasta no Drive continua podendo colar o
   * link, e porque é o caminho de volta da ...214. O CHECK do banco exige
   * `https://` sem espaço.
   */
  contrato_url: string | null;
  /**
   * Contrato ASSINADO anexado à ficha (migração 20260910000214): caminho no
   * bucket `gps-onboarding`, no formato `<ambiente_aluno_id>/<uuid>.<ext>`.
   *
   * 🔴 As 5 colunas de contrato são TUDO OU NADA (CHECK
   * `chk_etapa1_clientes_contrato_anexo_completo`) e **não** se escrevem pelo
   * PostgREST: `PatchCliente` não as tem e a trigger
   * `trg_etapa1_clientes_contrato_travado` recusa (42501) quem não é admin nem
   * função `SECURITY DEFINER` nossa. A escrita é só por
   * `gps.cliente_definir_contrato` / `gps.cliente_remover_contrato`.
   *
   * O PREFIXO do caminho é a credencial de leitura (policies
   * `gps_onboarding_anexo_*`): nunca montar caminho no cliente, nunca exibir
   * o arquivo inline — o download sai por URL assinada com `download=`
   * (`urlDeDownloadDoContratoCliente`).
   */
  contrato_path: string | null;
  /** Nome ORIGINAL do arquivo (1..120, sem `/` nem `\`) — só para exibir e para o `download=`. */
  contrato_nome: string | null;
  /** MIME REAL, lido de `storage.objects.metadata` pela RPC — nunca o que o navegador declarou. */
  contrato_mime: string | null;
  /** Tamanho REAL em bytes (1..5 MB), lido de `storage.objects.metadata`. */
  contrato_tamanho: number | null;
  /** Quando o arquivo passou a valer para ESTA ficha. Nulo junto com as outras 4. */
  contrato_anexado_em: string | null;
  /**
   * Tipo de vínculo com o cliente (migração 20260910000202). `null` = não
   * informado — **nunca** exibir como "Lead".
   *
   * ⚠️ NÃO entra na regra de `comDados` (`src/lib/etapa1.ts`): acrescentá-lo
   * reabriria a tarefa 1 de quem já a concluiu.
   */
  grau_relacao: GrauRelacao | null;
  /**
   * `null` = o ALUNO é dono da estrela (comportamento de sempre). PREENCHIDO =
   * a EQUIPE confirmou que está acompanhando este cliente, e o banco passa a
   * recusar (42501) desmarcar a estrela, apagar o cliente e voltar a fase para
   * `prospeccao` — trigger `trg_etapa1_clientes_acompanhamento_travado`
   * (migração 20260910000203). O resto da ficha continua livre.
   *
   * Só `gps.admin_confirmar_acompanhamento`/`gps.admin_liberar_acompanhamento`
   * escrevem aqui: `PatchCliente` não tem o campo e a trigger recusa a escrita
   * de quem não é admin, mesmo pelo PostgREST.
   */
  acompanhamento_confirmado_em: string | null;
  acompanhamento_confirmado_por: string | null;
}

export type StatusSolicitacao = "pendente" | "aprovada" | "recusada";

export interface Solicitacao {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  status: StatusSolicitacao;
  aluno_id: string | null;
  observacao: string | null;
  criado_em: string;
  decidido_em: string | null;
}

export interface Etapa3Agendamento {
  id: string;
  aluno_id: string;
  cliente_id: string | null;
  descricao: string | null;
  data: string | null;
  horario: string | null;
  equipe_participa: boolean;
  criado_em: string;
}

export interface Etapa3Revisao {
  aluno_id: string;
  duvidas: string | null;
  correcoes: string | null;
  atualizado_em: string;
}

export interface ProgressoTarefa {
  id: string;
  aluno_id: string;
  etapa: number;
  tarefa: number;
  concluida: boolean;
  concluida_em: string | null;
}

/** Override de destaque de tarefa definido pelo admin para um aluno. */
export type ModoEnfase = "realce" | "esmaecer";

/**
 * Diário do aluno — linha do tempo da EQUIPE. Visualização EXCLUSIVA do
 * admin (LGPD: dado pessoal de terceiros no texto livre). Ver
 * `gps.aluno_notas` (migração 20260908000001).
 */
export const VOZES_NOTA = ["equipe", "aluno"] as const;
export type VozNota = (typeof VOZES_NOTA)[number];

export const TIPOS_NOTA = [
  "observacao",
  "duvida",
  "combinado",
  "pendencia",
] as const;
export type TipoNota = (typeof TIPOS_NOTA)[number];

export const ORIGENS_NOTA = [
  "reuniao",
  "email",
  "whatsapp",
  "plataforma",
  "planilha",
] as const;
export type OrigemNota = (typeof ORIGENS_NOTA)[number];

export interface AlunoNota {
  id: string;
  aluno_id: string;
  autor_id: string;
  criado_em: string;
  voz: VozNota;
  tipo: TipoNota;
  origem: OrigemNota;
  texto: string;
  resolvido_em: string | null;
  resolvido_por: string | null;
  /** Liga a nota a um evento do log (gps.aluno_eventos). Null = nota solta. */
  evento_id: string | null;
}

/** Nota do diário com o nome do autor/quem deu baixa (join manual em `public.perfis`). */
export interface AlunoNotaComAutor extends AlunoNota {
  autor_nome: string | null;
  resolvido_por_nome: string | null;
  /**
   * Rótulo/tipo do evento (`gps.aluno_eventos`) referenciado por
   * `evento_id`, resolvido na LEITURA (`getDiarioDoAluno`/`montarTrilha` —
   * ver `src/lib/data.ts` e `src/lib/log-agregacao.ts`). `null` quando a
   * nota é solta (`evento_id` nulo) OU quando o evento referenciado não foi
   * encontrado (ex.: apagado). Shape mínimo de propósito — a UI só precisa
   * do texto para exibir "sobre: <rótulo>", não do evento inteiro.
   */
  eventoContexto: { rotulo: string; tipo: TipoEvento } | null;
  /**
   * Quem foi mencionado com `@` na nota (`gps.nota_mencoes`, migração
   * `...207`), resolvido na leitura com o nome de `public.perfis`. Sempre
   * array (vazio = ninguém). Só nome e id: e-mail não entra na tela.
   */
  mencoes: { id: string; nome: string | null }[];
}

/** Resumo do diário para cards/listas (última nota + pendências em aberto). */
export interface ResumoDiario {
  ultima: AlunoNotaComAutor | null;
  pendenciasAbertas: number;
}

/**
 * Diário do aluno — Fase 2: LOG DE AÇÕES DO ALUNO (`gps.aluno_eventos`,
 * migração 20260909000001). Mesma trava LGPD da Fase 1: visualização
 * EXCLUSIVA do admin. UMA tabela de micro-eventos — a MACRO ("Listou 15
 * clientes") é derivada por agregação na leitura, ver `src/lib/log-agregacao.ts`.
 *
 * O catálogo abaixo FICA exportado de propósito, embora nada em `src/` itere
 * sobre ele (quem valida o domínio é o CHECK de `gps.aluno_eventos`): é a
 * lista legível do que o log captura, e `TipoEvento` — usado em toda a trilha
 * e nos rótulos — é derivado dele.
 */
export const TIPOS_EVENTO = [
  "cliente_cadastrado",
  "cliente_favoritado",
  "cliente_desfavoritado",
  // Histórico: a captura ao vivo parou de gravar este tipo na migração
  // 20260909000060, quando `status` congelou. As linhas antigas continuam na
  // trilha e precisam de rótulo — por isso o tipo não sai daqui.
  "cliente_status_mudou",
  "cliente_fase_mudou",
  "cliente_mensagem_padrao",
  "cliente_estudo_caso",
  "cliente_ligacao",
  "cliente_aderiu_reuniao",
  "cliente_reuniao_agendada",
  "cliente_excluido",
  // Auditoria de `valor_honorarios` (migração 20260909000092). `contrato_url`
  // não é auditado de propósito — link muda por manutenção de pasta.
  "cliente_honorarios_definidos",
  "tarefa_concluida",
  "tarefa_reaberta",
  "conta_criada",
  "email_confirmado",
  "primeiro_acesso",
  "entrou_no_programa",
  // Central de resolução (migração ...151): a equipe abriu ou fechou UMA etapa
  // para ESTE aluno. Dois tipos e não um com {de,para} porque o que a trilha
  // precisa contar é a DIREÇÃO — é ela que muda o produto para a pessoa.
  "etapa_liberada_pela_equipe",
  "etapa_travada_pela_equipe",
  // Mega feature (migração ...201). `onboarding_iniciado`/`onboarding_concluido`
  // vêm de `gps.onboarding_salvar_passo`/`gps.onboarding_concluir`.
  // ⚠️ `favorito_confirmado_pela_equipe` NÃO é `cliente_favoritado`: aquele é o
  // aluno mexendo na estrela, este é a equipe ACEITANDO acompanhar (o segundo
  // conceito que o boolean misturava).
  "onboarding_iniciado",
  "onboarding_concluido",
  "favorito_confirmado_pela_equipe",
  "favorito_liberado_pela_equipe",
  // Contrato do cliente como ANEXO (migração ...214). Gravados só por
  // `gps.cliente_definir_contrato`/`gps.cliente_remover_contrato`.
  // ⚠️ NÃO é `cliente_honorarios_definidos` (aquele é o VALOR) e não tem nada
  // a ver com `contrato_url`, o link do Drive, que segue sem auditoria.
  // O contrato anexado é a PROVA que sustenta o sinal "apto ao saldo": tirar a
  // prova sem rastro seria o único jeito de esse sinal apagar sozinho.
  "cliente_contrato_anexado",
  "cliente_contrato_removido",
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

// Os três domínios abaixo eram tuplas `as const` só para derivar o tipo:
// nada em `src/` iterava sobre elas e quem valida o domínio é o CHECK de
// `gps.aluno_eventos`. Viraram união de literais — o mesmo tipo, sem a
// constante em runtime. Só `AtorEvento` é usado fora daqui
// (`diario-labels.ts`); os outros dois ficam locais.
// `onboarding` entrou na migração ...201 e vem SEMPRE com `entidade_id` null:
// a PK de `gps.onboarding_respostas` é a PESSOA e `aluno_eventos.aluno_id` é o
// AMBIENTE — a pessoa vai no `detalhe`.
type EntidadeEvento = "cliente" | "tarefa" | "conta" | "etapa" | "onboarding";
export type AtorEvento = "aluno" | "equipe" | "sistema";
type OrigemEvento = "app" | "backfill";

export interface AlunoEvento {
  id: string;
  aluno_id: string;
  ocorrido_em: string;
  tipo: TipoEvento;
  entidade: EntidadeEvento;
  entidade_id: string | null;
  rotulo: string;
  detalhe: Record<string, unknown> | null;
  ator: AtorEvento;
  ator_user_id: string | null;
  origem: OrigemEvento;
}

/** Evento com o nome de quem agiu resolvido (join manual — ver `resolverAutores` em `data.ts`). */
export interface AlunoEventoComAutor extends AlunoEvento {
  ator_nome: string | null;
}

/**
 * Ação administrativa lida de `gps.acessos_log` (definir senha, excluir
 * acesso etc.) — mostrada na mesma trilha, mas nunca agregada em macro (é
 * sempre um evento único e sensível o bastante para não somar com outros).
 */
export interface AcaoAdministrativa {
  id: string;
  acao: string;
  aluno_id: string | null;
  user_id_alvo: string | null;
  email_alvo: string | null;
  detalhe: string | null;
  feito_por: string | null;
  criado_em: string;
}

/**
 * Uma "rajada" do mesmo `tipo` de evento no mesmo dia local
 * (America/Sao_Paulo), agregada na LEITURA por `src/lib/log-agregacao.ts`.
 * Um grupo com um único item não vira `MacroAcao` — vira `ItemTrilha` do
 * tipo "evento" solto (dropdown de 1 item é ruído).
 */
export interface MacroAcao {
  tipo: TipoEvento;
  diaLocal: string; // "YYYY-MM-DD" em America/Sao_Paulo
  quantidade: number;
  primeiroEm: string;
  ultimoEm: string;
  ator: AtorEvento;
  atorUserId: string | null;
  atorNome: string | null;
  itens: AlunoEventoComAutor[];
}

/**
 * Item unificado da trilha (log de eventos + notas da equipe + ações
 * administrativas), já ordenado por `log-agregacao.ts`. `ocorrido_em` é a
 * chave de ordenação comum às três variantes.
 */
export type ItemTrilha =
  | { variante: "macro"; ocorrido_em: string; macro: MacroAcao }
  | { variante: "evento"; ocorrido_em: string; evento: AlunoEventoComAutor }
  | { variante: "nota"; ocorrido_em: string; nota: AlunoNotaComAutor }
  | {
      variante: "acao_administrativa";
      ocorrido_em: string;
      acao: AcaoAdministrativa;
    };

// ─────────────────────────────────────────────────────────────────────────
// Onboarding — o questionário inicial (migrações 20260910000204 a ...206).
//
// 🔑 É DA PESSOA, não do ambiente. A chave é `pessoa_aluno_id`
// (`gps.membros.pessoa_aluno_id` = `public.thb_alunos.id`), a mesma identidade
// que a Central estabeleceu: são 13 sócios em 13 ambientes, e com a chave no
// ambiente o sócio nunca seria perguntado nem veria o tour.
//
// ⚠️ O EFEITO COLATERAL (o cliente 1) É DO AMBIENTE: num ambiente que já tem
// favorito, o cliente é criado **sem** favoritar — `ambienteJaTemFavorito`
// existe para a tela dizer isso ANTES, e não depois.
// ─────────────────────────────────────────────────────────────────────────

/** "1. Quero que façamos desde a captação" | "2. Eu já tenho esse cliente". */
export const ORIGENS_CLIENTE1 = ["captacao", "ja_tenho"] as const;
export type OrigemCliente1 = (typeof ORIGENS_CLIENTE1)[number];

/**
 * As três respostas literais do João sobre a fase da implementação.
 *
 * ⚠️ NÃO são fases de cliente (decisão C-1: nenhuma fase nova). Elas mapeiam
 * para `FaseCliente` em `FASES_CLIENTE1_UI` (`src/lib/etapa1.ts`) e no
 * `gps.onboarding_concluir()`; a granularidade original fica guardada em
 * `gps.onboarding_respostas.fase_cliente1`, que é o retrato do dia 0.
 */
export const FASES_CLIENTE1 = [
  // "agendado" entrou em 10/09/2026 (pedido do Marcio): quem marcou a sessão
  // mas ainda não realizou não tinha onde se encaixar — ficava obrigado a
  // dizer que a viabilidade já aconteceu.
  "agendado",
  "viabilidade_feita",
  "croqui_apresentado",
  "execucao_andamento",
] as const;
export type FaseCliente1 = (typeof FASES_CLIENTE1)[number];

export type StatusOnboarding = "nao_iniciado" | "em_andamento" | "concluido";

export type TipoAnexoOnboarding = "contrato_honorarios" | "documento";

export interface OnboardingAnexo {
  id: string;
  tipo: TipoAnexoOnboarding;
  nome: string;
  mime: string;
  tamanho: number;
  /**
   * `<ambiente_aluno_id>/<uuid>.<ext>` no bucket privado `gps-onboarding`.
   * 🔴 Todo link montado a partir disto sai com `download=`, NUNCA inline: o
   * MIME vem do que o cliente declarou no PUT, e servir inline é o vetor.
   */
  path: string;
  criadoEm: string;
}

/** As respostas em si — o que a pessoa já preencheu, para a tela retomar. */
export interface RespostasOnboarding {
  origemCliente1: OrigemCliente1 | null;
  faseCliente1: FaseCliente1 | null;
  valorHonorarios: number | null;
  clienteNome: string | null;
  clienteTelefone: string | null;
  clienteGrauRelacao: GrauRelacao | null;
  /** País de origem do lead (ISO-3166 alpha-2). Pedido do Marcio, 10/09/2026. */
  clientePais: string | null;
  /** Respondeu "sim" à pergunta de honorários pactuados? */
  honorariosPactuados: boolean | null;
  descricaoCaso: string | null;
  ajudaPronta: string | null;
  /** O cliente que a conclusão criou. `null` enquanto não concluiu. */
  clienteId: string | null;
  iniciadoEm: string | null;
  concluidoEm: string | null;
}

export interface MeuOnboarding {
  status: StatusOnboarding;
  versao: number;
  passoAtual: number;
  /**
   * Vem de `ctx.user.user_metadata.gps_senha_temp_em` — **zero consulta**: o
   * metadata já chega no `getUser()` que a sessão memoizada faz uma vez por
   * requisição.
   *
   * ⚠️ É UX, não fronteira de segurança: o próprio usuário pode limpar o
   * metadata pelo GoTrue e pular o passo. Está escrito de propósito, em vez de
   * fingir que é trava — e a marca não concede nada.
   */
  precisaTrocarSenha: boolean;
  respostas: RespostasOnboarding;
  anexos: OnboardingAnexo[];
  /** O ambiente já tem favorito? Decide o texto do passo 3 (o cliente entra sem a estrela). */
  ambienteJaTemFavorito: boolean;
}

/** O que a EQUIPE vê, por pessoa do ambiente (`gps.admin_onboarding_do_aluno`). */
export interface OnboardingDaPessoa {
  membroId: string;
  pessoaAlunoId: string | null;
  papel: PapelMembro;
  nome: string | null;
  status: StatusOnboarding;
  versao: number | null;
  passoAtual: number | null;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  origemCliente1: OrigemCliente1 | null;
  faseCliente1: FaseCliente1 | null;
  valorHonorarios: number | null;
  clienteId: string | null;
  clienteNome: string | null;
  descricaoCaso: string | null;
  ajudaPronta: string | null;
  anexos: OnboardingAnexo[];
}

/**
 * Teto de anexos do passo 7 ("Anexo de documentos necessários"). O contrato de
 * honorários NÃO conta aqui — ele é único por pessoa, por índice parcial.
 * Imposto no banco (`gps.onboarding_registrar_anexo`); esta constante existe
 * para a tela dizer o número sem repeti-lo.
 *
 * ⚠️ B-D1 (pendente do João): enquanto a lista de "documentos necessários" não
 * vier, o passo 7 é GENÉRICO e OPCIONAL — "se já tiver algum documento do caso,
 * anexe aqui". Sem a lista, não dá para torná-lo obrigatório.
 */
export const MAX_DOCUMENTOS_ONBOARDING = 5;

/**
 * As 5 fases do aluno no programa — os cards da aba Alunos (desenho do
 * Marcio, 10/09/2026). A ordem é a da JORNADA, e é a ordem dos cards na
 * tela; ordenar por tamanho faria os blocos trocarem de lugar conforme os
 * alunos avançam, e a tela deixaria de ser um mapa.
 *
 * A REGRA vive em `gps.admin_painel_alunos` — aqui é só o contrato.
 */
export const CLASSES = [
  // 🔑 Ordem INVERTIDA (execução -> inicial) por decisão do Marcio,
  // 10/09/2026. O topo da tela passa a ser quem está mais adiantado: a
  // equipe abre o painel para ver quem está fechando holding, não quem
  // acabou de entrar. A jornada continua legível — só é lida de trás
  // para frente, como um funil de baixo para cima.
  "finalizado",
  "orientacao",
  "execucao",
  "captacao",
  "inicial",
] as const;
export type ClasseAluno = (typeof CLASSES)[number];
