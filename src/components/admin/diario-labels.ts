import type {
  VozNota,
  TipoNota,
  OrigemNota,
  TipoEvento,
  AtorEvento,
} from "@/lib/types";

/** Rótulos em português (com acentuação) dos enums do diário do aluno. */
export const ROTULO_VOZ: Record<VozNota, string> = {
  equipe: "Equipe",
  aluno: "Aluno",
};

export const ROTULO_TIPO: Record<TipoNota, string> = {
  observacao: "Observação",
  duvida: "Dúvida",
  combinado: "Combinado",
  pendencia: "Pendência",
};

export const ROTULO_ORIGEM: Record<OrigemNota, string> = {
  reuniao: "Reunião",
  email: "E-mail",
  whatsapp: "WhatsApp",
  plataforma: "Plataforma",
  planilha: "Planilha",
};

/** Variante do Badge (ver `src/components/ui/badge.tsx`) por tipo de nota. */
export function variantePorTipo(
  tipo: TipoNota,
  resolvida: boolean,
): "default" | "secondary" | "destructive" | "outline" {
  if (tipo === "pendencia") return resolvida ? "secondary" : "destructive";
  return "outline";
}

/**
 * Diário do aluno — Fase 2: rótulos do log de ações (`gps.aluno_eventos`)
 * e das ações administrativas (`gps.acessos_log`). Reusa `rotuloMacro` de
 * `src/lib/log-agregacao.ts` para o texto de macro — isto aqui é só para o
 * evento SOLTO (não agregado), que ainda precisa de um rótulo legível.
 */
export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = {
  cliente_cadastrado: "Cadastrou cliente",
  cliente_favoritado: "Favoritou cliente",
  cliente_desfavoritado: "Desfavoritou cliente",
  cliente_status_mudou: "Mudou o status do cliente",
  cliente_fase_mudou: "Mudou a fase do cliente",
  cliente_mensagem_padrao: "Enviou a mensagem padrão",
  cliente_estudo_caso: "Enviou a mensagem de estudo de caso",
  cliente_ligacao: "Registrou ligação",
  cliente_aderiu_reuniao: "Cliente aderiu à reunião",
  cliente_reuniao_agendada: "Agendou reunião",
  cliente_excluido: "Excluiu cliente",
  cliente_honorarios_definidos: "Registrou os honorários do cliente",
  tarefa_concluida: "Concluiu tarefa",
  tarefa_reaberta: "Reabriu tarefa",
  conta_criada: "Conta criada",
  email_confirmado: "E-mail confirmado",
  primeiro_acesso: "Primeiro acesso ao portal",
  entrou_no_programa: "Entrou no programa",
  etapa_liberada_pela_equipe: "Etapa liberada pela equipe",
  etapa_travada_pela_equipe: "Etapa travada pela equipe",
};

export const ROTULO_ATOR: Record<AtorEvento, string> = {
  aluno: "Aluno",
  equipe: "Equipe",
  sistema: "Sistema",
};

/**
 * As ações de `gps.acessos_log` (o CHECK `acessos_log_acao_check` é o catálogo
 * fechado — ver migrações do baseline e `...150`). `rotuloAcaoAdmin` tem
 * fallback para o código cru, então esquecer uma aqui NÃO quebra o build: só
 * mostra `financeiro_vinculado` na trilha do admin.
 */
const ROTULO_ACAO_ADMIN: Record<string, string> = {
  senha_definida: "Senha definida pela equipe",
  acesso_excluido: "Acesso excluído",
  socio_adicionado: "Sócio adicionado",
  membro_excluido: "Membro excluído",
  ambiente_ambiguo: "Ambiente ambíguo identificado",
  // Central de resolução (migrações ...150 a ...157)
  etapa_liberacao_alterada: "Liberação de etapa alterada para este aluno",
  progresso_reaberto: "Etapa reaberta pela equipe",
  membro_pessoa_vinculada: "Membro vinculado ao cadastro",
  titular_trocado: "Titular do ambiente trocado",
  membro_movido: "Membro movido de ambiente",
  financeiro_vinculado: "Contrato financeiro vinculado",
  financeiro_desvinculado: "Contrato financeiro desvinculado",
};

/** Rótulo legível de uma ação administrativa, com fallback para o código cru. */
export function rotuloAcaoAdmin(acao: string): string {
  return ROTULO_ACAO_ADMIN[acao] ?? acao;
}

/**
 * `formatarDataHora` MUDOU DE CASA (Fase 6): está em `src/lib/datas.ts`.
 * Aqui era importada por 5 componentes de `components/admin/`, e a thread de
 * chamados precisa da mesma formatação sem importar nada de `components/admin/`
 * — o Diário é dado exclusivo do admin (LGPD) e o acoplamento convidaria a
 * arrastar rótulo de nota para uma tela do aluno.
 */
