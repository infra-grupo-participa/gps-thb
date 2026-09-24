/**
 * Tela de interruptores em `/admin` — allowlist e contratos.
 *
 * POR QUE ESTA TELA EXISTE
 *   Hoje os interruptores de `gps.config` só se ligam/desligam por SQL direto
 *   no banco — botões de pânico inacessíveis no pânico, e nenhuma mudança
 *   deixa rastro de autor (um `update` por SQL não passa por
 *   `gps.acessos_log`). Esta feature dá ao admin uma tela para isso, com
 *   trilha (quem, o quê, quando).
 *
 * 🔴 `gps.config` (21 chaves medidas em 15/09/2026) NÃO é só interruptor:
 *   tem credencial (`resend_api_key`, `resgate_codigo`), e-mail/URL de texto
 *   (`chamados_email_equipe`, `whatsapp_secretaria`…) e carimbo de data
 *   interno (`plantao_alarme_enviado_em`…). A tela mostra SÓ os booleanos
 *   desta allowlist EXPLÍCITA — nunca "tudo que está em `gps.config`". Sem
 *   isso, `resend_api_key` chegaria ao cliente (mascarada ou não).
 *
 * NASCE LIMPO: nenhum "use server" aqui (mesma razão de `acessos-lote.ts`,
 * `videos-tipos.ts`) — importado por `import type`/valor tanto pelas Server
 * Actions quanto pelos client components da tela.
 *
 * 🔴 A allowlist TAMBÉM vive no banco (`gps.config_definir`, migração
 * `20260915000260`), em texto igual — defesa em profundidade: Server Action
 * é endpoint HTTP, então a fronteira real é a RPC, não este arquivo. Mudar
 * um lado sem mudar o outro faz a tela oferecer um interruptor que a RPC
 * recusa, ou a RPC aceitar uma chave que a tela nunca mostra (pior: só
 * alcançável por quem chama o PostgREST direto).
 */

/** Uma chave de `gps.config` que é, de fato, um interruptor liga/desliga. */
export interface InterruptorConfig {
  chave: string;
  rotulo: string;
  /** O que acontece quando o admin DESLIGA — a consequência, não a feature. */
  descricaoDesligado: string;
  /**
   * `true` = a confirmação da tela usa a copy "perigosa" (ex.: fecha canal
   * para todos os alunos de uma vez). Não muda a guarda no servidor — é só
   * o tom da confirmação nomeada (padrão do `DialogoConfirmacao`).
   */
  perigoso: boolean;
}

/**
 * As 15 chaves booleanas que a TELA lista, na ordem em que aparecem.
 * Medidas no banco em 15/09/2026 — ver o levantamento no plano da feature.
 *
 * ⚠️ A allowlist de `gps.config_definir` tem 16: `sessoes_exige_disc` está lá
 * e **não** aqui, de propósito (ver o comentário ao lado dela abaixo). Esta
 * lista é subconjunto da allowlist — nunca o contrário.
 *
 * 🔴 O AVISO ACIMA JÁ FOI DESCUMPRIDO UMA VEZ, e custou um botão quebrado na
 * tela: `minuta_contexto_obrigatorio` entrou aqui em 17/09 e **não** entrou na
 * allowlist de `gps.config_definir`. Medido em 22/09 com JWT de admin real:
 * `RECUSADO [22023] "Este interruptor não existe."` — a equipe via o botão,
 * clicava, e ele falhava. `tsc`, `eslint` e `build` ficam verdes: a allowlist
 * vive no CORPO da função no banco, fora do alcance do compilador.
 *
 * Corrigido na migration `…299`, junto com as 3 chaves da Agenda de Sessões.
 * **Interruptor novo toca DOIS lugares.** Confira a lista de baixo contra
 * `pg_get_functiondef('gps.config_definir')` — a função VIVA, não o arquivo
 * da migration, que pode estar defasado.
 *
 * `entrada_codigo_ativa` existe no banco com esse nome (não
 * `entrada_pelo_codigo`, que é o nome da FEATURE/RPC de leitura — ver
 * `src/app/entrar/actions.ts`). Confirmado por leitura do código-fonte:
 * é o botão de pânico literal do evento de acessos de 10/09/2026
 * ("DESLIGAR SEM DEPLOY, quando o evento acabar").
 */
export const INTERRUPTORES_CONFIG: readonly InterruptorConfig[] = [
  {
    chave: "chamados_aberto",
    rotulo: "Suporte por chamados",
    descricaoDesligado:
      "O aluno deixa de conseguir abrir chamado novo. A equipe continua respondendo e fechando os que já existem — ninguém fica preso no meio do caminho.",
    perigoso: true,
  },
  {
    chave: "chamados_categorias_ativo",
    rotulo: "Categorias de chamado",
    descricaoDesligado:
      "O chamado volta a ser aberto sem categoria (comportamento anterior à feature de categorias).",
    perigoso: false,
  },
  {
    chave: "convite_socio_ativo",
    rotulo: "Convite de sócio (autosserviço)",
    descricaoDesligado:
      "O titular deixa de conseguir convidar um sócio pela tela — o botão some da aba Equipe. Convites já enviados continuam valendo até expirar.",
    perigoso: false,
  },
  {
    chave: "documento_inline_ativo",
    rotulo: "Pré-visualização de documentos na ficha do cliente",
    descricaoDesligado:
      "Contrato, minuta e croqui param de abrir na tela: a equipe volta a só baixar o arquivo para ler. Nada é apagado e nenhum acesso é ampliado — quem podia ver o documento continua podendo, só que baixando. Religue e a pré-visualização volta na hora, sem deploy.",
    // Botão de pânico de uma feature que já está no ar: DESLIGAR é o movimento
    // seguro (volta ao comportamento anterior, que é baixar), e por isso não é
    // "perigoso". Ligado é o estado normal — inclusive quando a chave não
    // existe em `gps.config`, porque `gps.documento_inline_ativo()` (…310)
    // trata ausente como LIGADO.
    perigoso: false,
  },
  {
    chave: "entrada_codigo_ativa",
    rotulo: "Entrada pelo código do grupo (evento de acessos)",
    descricaoDesligado:
      "A rota /entrar deixa de aceitar e-mail + código. Ligue só durante um evento controlado: quem sabe o e-mail de um colega entra na conta dele enquanto está ligado.",
    perigoso: true,
  },
  {
    chave: "minuta_contexto_obrigatorio",
    rotulo: "Contexto obrigatório na minuta",
    descricaoDesligado:
      "O parceiro (e a equipe) volta a anexar minuta sem descrever o caso: some a exigência de caso/o que foi feito/ponto de ajuda na 1ª minuta e de o que mudou nas seguintes.",
    perigoso: false,
  },
  {
    chave: "sessoes_email_ativo",
    rotulo: "E-mails da Agenda de Sessões",
    descricaoDesligado:
      "Param os 5 avisos automáticos das sessões: confirmação, lembretes de 24h e de 1h, e aviso de cancelamento — para a doutora e para o parceiro. As sessões continuam sendo marcadas normalmente; ninguém é avisado por e-mail, então alguém precisa avisar por fora.",
    perigoso: true,
  },
  // 🔴 `sessoes_exige_disc` está na allowlist da RPC mas NÃO entra nesta
  // lista, e é deliberado: hoje ela não desliga nada — é o ponto de engate
  // de uma trava ainda não implementada (…294). Mostrá-la aqui criaria o pior
  // caso possível, que a própria migration nomeia: "interruptor que não
  // desliga nada é PIOR que interruptor nenhum se alguém acreditar que
  // desliga". Entra nesta lista no dia em que a trava existir.
  {
    chave: "sessoes_exige_confirmacao",
    rotulo: "Exigir favorito confirmado pela equipe para marcar sessão",
    descricaoDesligado:
      "Volta a bastar o cliente favoritado pelo parceiro para ele marcar sessão — sem precisar que a equipe tenha confirmado o acompanhamento.",
    // 🔴 LIGAR é o movimento perigoso aqui, não desligar: medido em 22/09,
    // `acompanhamento_confirmado_em` nunca foi preenchida, então ligado ele
    // recusa 100% dos parceiros — e a tela carrega sem erro nenhum, só vazia.
    perigoso: true,
  },
  {
    chave: "plantao_inscricao_aberta",
    rotulo: "Inscrição no Plantão de Dúvidas",
    descricaoDesligado:
      "Ninguém consegue se inscrever em um novo plantão. Quem já está inscrito mantém a vaga.",
    perigoso: true,
  },
  {
    chave: "resgate_ativo",
    rotulo: "Resgate de acesso (esqueci a senha por código)",
    descricaoDesligado:
      "A rota de resgate por código deixa de funcionar. Quem estiver travado precisa ser atendido pela equipe (Gerenciar acesso).",
    perigoso: true,
  },
  {
    chave: "slack_mencoes_ativo",
    rotulo: "Aviso no Slack quando alguém é @mencionado",
    descricaoDesligado:
      "A @menção continua sendo gravada no Diário; só o aviso automático no Slack para de sair.",
    perigoso: false,
  },
  {
    chave: "socio_cadastro_obrigatorio",
    rotulo: "Cadastro obrigatório do sócio convidado",
    descricaoDesligado:
      "O sócio que acabou de entrar deixa de ser obrigado a preencher o cadastro (CPF, endereço…) no primeiro acesso.",
    perigoso: false,
  },
  {
    chave: "troca_email_login_ativa",
    rotulo: "Troca de e-mail do login pelo admin",
    descricaoDesligado:
      'A ação "Trocar e-mail do login" some de Gerenciar acesso. Quem precisar trocar o e-mail do login fica sem esse caminho até religar.',
    perigoso: false,
  },
  {
    chave: "tutoriais_ativo",
    rotulo: "Aba Tutoriais",
    descricaoDesligado:
      "A aba Tutoriais some do menu do aluno. O conteúdo cadastrado pelo admin não é apagado — volta a aparecer ao religar.",
    perigoso: false,
  },
  {
    chave: "videos_ativo",
    rotulo: "Biblioteca de vídeos",
    descricaoDesligado:
      "A biblioteca de vídeos some do menu do aluno. O acervo cadastrado pelo admin não é apagado — volta a aparecer ao religar.",
    perigoso: false,
  },
] as const;

export type ChaveInterruptorConfig =
  (typeof INTERRUPTORES_CONFIG)[number]["chave"];

/** Consulta O(1) pela chave — usada tanto na leitura quanto na validação de escrita. */
export const INTERRUPTORES_POR_CHAVE: ReadonlyMap<string, InterruptorConfig> =
  new Map(INTERRUPTORES_CONFIG.map((i) => [i.chave, i]));

/** Retorno padrão da Server Action — mesmo shape de tutoriais/vídeos/chamados. */
export type ResultadoAcaoConfig = { ok: true } | { ok: false; erro: string };

/** Uma linha da tela: a definição estática + o estado lido do banco. */
export interface InterruptorComEstado extends InterruptorConfig {
  ligado: boolean;
}
