-- ═══════════════════════════════════════════════════════════════════════════
-- Agenda de Sessões com a Equipe Jurídica — FATIA 2: as 4 RPCs.
-- PRD: docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md
--      (§5.4 grade derivada · §7 fluxos · §9 D3/D4/D5/D7 · §9-ter B1/B2/B3 ·
--       §10 fatia 2)
-- Consome a estrutura da `…291` (5 tabelas). NÃO redesenha nada dela.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 O QUE ESTA MIGRAÇÃO **NÃO** TOCA
-- ═══════════════════════════════════════════════════════════════════════════
-- `gps.reuniao_*` e `gps.agenda` seguem ÓRFÃS e PROIBIDAS (a revogação de
-- 22/09 autorizou `gps.sessao_*` e SÓ isso). `gps.plantao_*` INTOCADO (escopo
-- fechado pelo Marcio). `gps.operadores`, `public.perfis` e
-- `public.gp_is_admin()` são CONSUMIDOS, nunca alterados — `gp_is_admin()` é
-- lida por policies de 50 tabelas em 3 schemas.
--
-- Nenhuma tabela é criada ou alterada aqui, exceto:
--   (a) `gps.sessao_tipos.etapa_id` — coluna nova, ver seção 0;
--   (b) o CHECK de `gps.acessos_log.acao`, que ganha 1 valor (seção 1).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 NENHUM ÍNDICE NOVO — e por quê
-- ═══════════════════════════════════════════════════════════════════════════
-- §9b.1 mediu `explain (analyze, buffers)` da consulta crítica (os
-- agendamentos de uma doutora numa janela de 8 semanas) e o planner escolheu
-- **Seq Scan** nos dois cenários — inclusive o de 10 anos (4.160 linhas,
-- 0,833 ms). A fatia 1 concluiu por NÃO criar `sessao_agend_responsavel_janela`
-- e não criou índice de leitura nenhum.
--
-- `sessao_horarios_livres` lê exatamente essa janela. Ela NÃO muda o predicado
-- medido: continua `responsavel_id` + faixa de `inicio_em`, sobre a mesma
-- tabela pequena por natureza (4 sessões/semana por doutora, §5.4). Portanto o
-- plano medido na …291 continua valendo e **não se cria índice aqui**.
--
-- 🔴 Se alguém quiser criar índice nesta feature: exige `explain (analyze)`
-- MEDIDO e colado no arquivo (~/.claude/PROTOCOLO-SUSTENTABILIDADE.md). Sem
-- plano medido, reprova em otimização. Índice também pode deixar MAIS LENTO —
-- já medido neste banco em `etapa1_clientes(fase)`: Seq 0,686 ms × Index
-- 0,809 ms em 1.222 linhas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 A DURAÇÃO NÃO APARECE COMO VALOR EM LUGAR NENHUM DESTE ARQUIVO
-- ═══════════════════════════════════════════════════════════════════════════
-- `duracao_min` e `intervalo_min` vêm SEMPRE de `gps.sessao_tipos`, lidos em
-- tempo de execução. `sessao_agendar` copia a duração vigente para o
-- agendamento (cópia congelada, §6.4 da …291). Não existe `150` aqui, nem
-- default, nem fallback, nem comentário que o trate como regra.
--
-- 🔴 E NÃO SE RECALCULA O FIM DO BLOCO. `gps.sessao_agendamentos.fim_em` é
-- coluna GERADA e já é o fim. Duas razões para consumi-la:
--   1. `timestamptz + interval` é STABLE (depende do TimeZone da sessão) e
--      `timestamp + interval` é IMMUTABLE — medido em 22/09. Somar depois do
--      `at time zone` levanta 42P17 em expressão de índice. Em função normal
--      não levanta, mas refazer a soma criaria uma SEGUNDA fórmula do mesmo
--      fato, que diverge da constraint de exclusão no dia em que uma das duas
--      mudar.
--   2. A constraint `sessao_sem_sobreposicao` usa `tstzrange(inicio_em,
--      fim_em)`. Se a RPC calculasse o fim de outro jeito, a checagem legível
--      e a trava atômica discordariam — e a mensagem em português diria uma
--      coisa enquanto o banco recusaria por outra.
-- A ÚNICA soma que sobra é a da GRADE (seção 3), que trabalha em `time`/
-- `timestamp` local e nunca em `timestamptz` — e ali ela é inevitável, porque
-- os blocos candidatos ainda não existem como linha.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 OS DOIS CÓDIGOS DE ERRO DA TRAVA ATÔMICA — mensagens DISTINTAS
-- ═══════════════════════════════════════════════════════════════════════════
-- A …291 criou três travas que disparam em cenários diferentes, e o usuário
-- precisa saber QUAL aconteceu:
--
--   23505 `sessao_slot_unico`       → outra pessoa pegou ESTE horário
--   23505 `sessao_aluno_tipo_viva`  → VOCÊ já tem uma sessão viva deste tipo
--   23P01 `sessao_sem_sobreposicao` → o bloco INVADE outra sessão da doutora
--
-- 🔴 Tratar só um dos códigos deixa o outro vazar como erro cru de banco. A
-- exclusão (23P01) foi exercitada pelo Marcio em transação revertida: 6/6.
-- E os dois 23505 têm causas opostas (culpa de terceiro × estado do próprio
-- aluno) — colapsar os dois numa frase só faria o aluno tentar de novo para
-- sempre num caso em que tentar de novo nunca resolve.
--
-- A checagem LÓGICA sob `for update` continua existindo (mensagem legível no
-- caso comum); quem recusa DE FATO entre transações concorrentes são as
-- travas. Mesma lição da …279, onde a checagem lógica passava e o índice
-- único é que barrava.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 LGPD — o que NUNCA entra em `gps.sessao_eventos.detalhe`
-- ═══════════════════════════════════════════════════════════════════════════
-- `descricao_caso`, `observacoes` e `cliente_decisores` são PROIBIDOS em lista
-- consolidada, CSV, Slack e e-mail (§4.3). Eles entram no `briefing_snapshot`
-- — que fica no sistema, atrás de RPC — e **nunca** no `detalhe` da trilha nem
-- em payload de e-mail. O `detalhe` leva só identificadores e o delta
-- (de/para de estado, motivo já limitado a 300).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSÃO (nesta ordem)
-- ═══════════════════════════════════════════════════════════════════════════
--   drop function if exists gps.sessao_briefing_ler(uuid);
--   drop function if exists gps.sessao_marcar_falta(uuid, text);
--   drop function if exists gps.sessao_cancelar(uuid, text);
--   drop function if exists gps.sessao_agendar(smallint, uuid, date, time);
--   drop function if exists gps.sessao_responsaveis();
--   drop function if exists gps.sessao_horarios_livres(smallint, uuid, date, date);
--   drop function if exists gps.sessao_briefing_montar(uuid);
--   drop function if exists gps.sessao_pode_agendar(uuid, smallint);
--   alter table gps.sessao_tipos drop column if exists etapa_id;
--   -- O CHECK de acessos_log.acao NÃO se reverte sozinho: outra feature pode
--   -- ter somado valor depois. Reverter = ler pg_get_constraintdef e reescrever
--   -- sem 'sessao_briefing_acessado'.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) gps.sessao_tipos.etapa_id — qual etapa cada tipo exige
-- ═══════════════════════════════════════════════════════════════════════════
-- §9-ter B3 diz "a etapa do tipo liberada por gps.etapa_liberada_para()", mas
-- o PRD NÃO diz qual etapa é de qual tipo. Isso é regra de negócio, e eu não
-- invento critério de negócio — então ela entra como DADO editável, não como
-- `case when tipo_id = 1 then 1` escondido no corpo de uma função.
--
-- 🔴 `null` = o tipo NÃO exige etapa liberada. É o default deliberado: se o
-- Marcio não disser a etapa, a trava de etapa simplesmente não se aplica
-- àquele tipo, em vez de a feature adivinhar um número e recusar 34 alunos em
-- silêncio (a lição de B3 — "filtro de elegibilidade tem que ser contado antes
-- de escolhido", e a recomendação original daria ZERO pessoas).
--
-- O seed abaixo reflete a estrutura do programa como o CLAUDE.md a descreve:
-- a Entrevista Prévia é tarefa da Etapa 01 ("6 Entrevista prévia (formulário
-- com perfil DISC)"), a Reunião Preliminar É a Etapa 02. Ajustar = UPDATE de
-- uma linha, sem migration e sem deploy.
alter table gps.sessao_tipos
  add column if not exists etapa_id smallint references gps.etapas(id) on delete restrict;

comment on column gps.sessao_tipos.etapa_id is
  'Etapa que precisa estar LIBERADA para o aluno poder agendar este tipo (PRD §9-ter B3, conferida por gps.etapa_liberada_para). 🔴 null = o tipo NAO exige etapa liberada -- default deliberado: o PRD nao diz qual etapa e de qual tipo, e adivinhar um numero recusaria alunos em silencio (a licao de B3, onde a recomendacao original daria ZERO elegiveis). E DADO, nao codigo: ajustar e UPDATE de uma linha, sem migration e sem deploy. Nenhuma funcao desta migracao tem etapa escrita no corpo.';

-- Entrevista Prévia → Etapa 01 · Reunião Preliminar → Etapa 02.
-- `where etapa_id is null`: não sobrescreve ajuste que a equipe já tenha feito
-- à mão, e torna a migração reaplicável sem desfazer decisão de operação.
update gps.sessao_tipos set etapa_id = 1 where id = 1 and etapa_id is null;
update gps.sessao_tipos set etapa_id = 2 where id = 2 and etapa_id is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) CHECK de gps.acessos_log.acao — soma 'sessao_briefing_acessado'
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CHECK reescrito de memória APAGA VALOR EM SILÊNCIO. O array abaixo foi
-- copiado LITERALMENTE da última migração que tocou esta constraint —
-- `20260921000288_gps_excluir_acesso_lista_completa.sql`, que por sua vez o
-- copiou de `pg_get_constraintdef('acessos_log_acao_check')` medido em
-- 21/09/2026: 29 valores + 2 novos = **31**. Aqui são os 31 + 1 = **32**.
-- Nenhum valor redigitado de cabeça.
--
-- ⚠️ ANTES DE APLICAR, conferir que nada entrou entre 21/09 e hoje:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.acessos_log'::regclass and conname = 'acessos_log_acao_check';
-- Se a lista do banco tiver valor que não está aqui, ACRESCENTAR ao array
-- abaixo antes de rodar — um valor perdido derruba a gravação de trilha de
-- outra feature meses depois, e o erro aparece longe da causa.
--
-- 🔑 `sessao_briefing_acessado` é usado por `gps.sessao_briefing_ler` (seção
-- 8). Sem este valor no CHECK, aquela RPC falha no insert de trilha — e como
-- o insert é o ÚLTIMO passo, tudo antes executa e reverte junto, o que de fora
-- parece "o botão não faz nada" (foi exatamente assim que
-- `admin_adotar_login_existente` ficou 15 dias quebrada sem ninguém perceber).
alter table gps.acessos_log drop constraint if exists acessos_log_acao_check;

alter table gps.acessos_log add constraint acessos_log_acao_check
  check (acao = any (array[
    'senha_definida','acesso_excluido','socio_adicionado','membro_excluido',
    'ambiente_ambiguo','etapa_liberacao_alterada','progresso_reaberto',
    'membro_pessoa_vinculada','titular_trocado','membro_movido',
    'financeiro_vinculado','financeiro_desvinculado','favorito_confirmado',
    'favorito_liberado','acessos_criados_em_lote','socio_convidado',
    'socio_convite_aceito','socio_convite_revogado',
    'chamado_solicitacao_aprovada','chamado_solicitacao_declinada',
    'email_login_alterado','clientes_exportados','socio_cadastro_preenchido',
    'interruptor_alterado','reuniao_preliminar_cancelada','dossie_acessado',
    'operador_definido','clientes_restaurados','lixeira_expurgada',
    'titular_convertido_em_socio','onboarding_concluido_pela_equipe',
    -- ── novo em 22/09/2026 (fatia 2 da agenda de sessões) ──
    'sessao_briefing_acessado'          -- usado por gps.sessao_briefing_ler
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado de acoes da trilha administrativa. 31 valores vigentes na …288 + 1 desta migracao: sessao_briefing_acessado, gravado por gps.sessao_briefing_ler a cada abertura do briefing (LGPD: a trilha E a guarda em leitura de dado pessoal, mesma decisao de dossie_do_cliente). Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO com pg_get_constraintdef antes -- reescrever a lista de memoria apaga valores em silencio.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) gps.sessao_pode_agendar — a elegibilidade, num lugar só
-- ═══════════════════════════════════════════════════════════════════════════
-- §9-ter B3, MEDIDO em 22/09: **34 elegíveis**. A regra adotada (que corrigiu
-- a recomendação original, a qual daria ZERO) é:
--
--   cliente favoritado (`acompanhado_equipe = true`)
--     E etapa do tipo liberada por `gps.etapa_liberada_para()`
--     E (só se `gps.config.sessoes_exige_confirmacao` = 'true')
--        favorito CONFIRMADO pela equipe (`acompanhamento_confirmado_em`)
--
-- 🔴 A trava extra é LIDA DA CONFIG, não embutida. Ela nasce `false` na …291
-- justamente porque `acompanhamento_confirmado_em` nunca foi preenchida: com
-- ela `true` hoje, a tela recusaria 100% dos alunos e carregaria sem erro
-- nenhum — o modo de falha mais caro que há, porque parece certo.
--
-- Devolve o cliente elegível (o favorito) ou NULL. Uma função só, consumida
-- pela leitura (`sessao_horarios_livres`) e pela escrita (`sessao_agendar`):
-- se fossem duas cópias, a tela ofereceria horário que a RPC recusaria.
create or replace function gps.sessao_pode_agendar(
  p_aluno_id uuid,
  p_tipo_id  smallint
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_etapa_id    smallint;
  v_exige_conf  boolean;
  v_cliente_id  uuid;
  v_liberada    boolean;
begin
  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 GUARDA PRÓPRIA, NA ENTRADA — antes de QUALQUER select
  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 ACHADO ALTO do pentester, EXPLORADO e CONFIRMADO em 22/09 (begin …
  -- rollback, `set local role authenticated`, sem JWT): esta função é
  -- SECURITY DEFINER, tem grant para `authenticated`, e recebe `p_aluno_id`
  -- DO CHAMADOR. Sendo DEFINER, a RLS de `gps.etapa1_clientes` NÃO se aplica
  -- aqui dentro. Sem esta guarda, qualquer um chamava com o ambiente de um
  -- terceiro e recebia o `etapa1_clientes.id` do favorito dele:
  --
  --   tipo 1 (etapa_id = 1, guarda "ligada")  → esperado 42501, obtido uuid
  --   tipo 2 (etapa_id = null, guarda pulada) → esperado 42501, obtido uuid
  --
  -- Os DOIS vazaram. A versão anterior confiava na guarda interna de
  -- `gps.etapa_liberada_para`, e ela não serve por DUAS razões independentes:
  --
  --   1. É CONDICIONAL: vive dentro de `if v_etapa_id is not null`, e
  --      `etapa_id = null` é valor LEGÍTIMO e documentado (tipo que não exige
  --      etapa, ajustável por UPDATE sem deploy). A proteção de dado pessoal
  --      não pode ficar pendurada em dado de operação — um UPDATE de rotina
  --      desligaria a defesa sem ninguém perceber.
  --   2. 🔴 FALHA ABERTA mesmo com `etapa_id` preenchido. Sem JWT,
  --      `gps.aluno_atual()` é null; `p_aluno_id = null` é NULL; dentro dela
  --      o `not coalesce(...)` protege o caso dela, mas o retorno desta
  --      função já havia sido decidido antes — e o `select` do favorito roda
  --      ANTES de a etapa ser sequer consultada.
  --
  -- 🔑 Mesmo com o briefing salvo (sessao_briefing_montar está revogada de
  -- `authenticated`), o uuid sozinho já é dano: é a chave primária de um
  -- cliente de terceiro, e a distinção uuid × null é ORÁCULO — revela se
  -- aquele ambiente tem favorito e, com `sessoes_exige_confirmacao = 'true'`,
  -- se a equipe já confirmou o acompanhamento.
  --
  -- 🔴 `coalesce(..., false)` NÃO É ENFEITE: é o que faz falhar FECHADO.
  -- `null` em guarda não bloqueia — LIBERA, porque `if null then raise` não
  -- dispara. Mesma correção que `gps.etapa_liberada_para` levou no bloco B3
  -- da conferência de 09/09, pela mesma razão.
  --
  -- Os dois chamadores passam o ambiente próprio (`sessao_horarios_livres`
  -- passa `v_ambiente`; `sessao_agendar` idem), então a guarda não muda o
  -- caminho legítimo. `gps.eh_equipe()` entra porque a tela administrativa
  -- consulta a elegibilidade de um aluno que não é ela mesma.
  if not coalesce(
       public.gp_is_admin()
       or p_aluno_id = gps.aluno_atual()
       or gps.eh_equipe(),
       false)
  then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_aluno_id is null or p_tipo_id is null then
    return null;
  end if;

  -- A etapa exigida é DADO (seção 0), não `case when` no corpo.
  select t.etapa_id into v_etapa_id
    from gps.sessao_tipos t
   where t.id = p_tipo_id and t.ativo;

  if not found then
    return null;  -- tipo inexistente ou desativado
  end if;

  -- 🔴 A trava extra vem da CONFIG, nunca embutida. Ausente = false (o mesmo
  -- default da …291), porque ligar por omissão recusaria todo mundo.
  v_exige_conf := coalesce(
    (select c.valor from gps.config c where c.chave = 'sessoes_exige_confirmacao') = 'true',
    false);

  -- O favorito do ambiente. `acompanhado_equipe` é único por aluno (índice
  -- parcial em etapa1_clientes) — o `limit 1` é cinto de segurança, não regra.
  select c.id into v_cliente_id
    from gps.etapa1_clientes c
   where c.aluno_id = p_aluno_id
     and c.acompanhado_equipe
     and (not v_exige_conf or c.acompanhamento_confirmado_em is not null)
   limit 1;

  if v_cliente_id is null then
    return null;
  end if;

  -- Etapa: só confere se o tipo declarar uma. `etapa_id is null` = tipo sem
  -- exigência de etapa (ver seção 0).
  if v_etapa_id is not null then
    -- ⚠️ CORREÇÃO DE UM COMENTÁRIO QUE ESTAVA ERRADO (22/09). A versão
    -- anterior afirmava aqui que a guarda interna de `gps.etapa_liberada_para`
    -- "segue valendo e NÃO é contornada", e por isso esta função não precisava
    -- de guarda própria. **As duas afirmações eram falsas**, e o pentester
    -- explorou: comentário errado é parte do defeito, porque convence o
    -- próximo leitor a não olhar.
    --
    -- O que é VERDADE: a guarda de `etapa_liberada_para` é **condicional** —
    -- só roda quando `v_etapa_id is not null` (este `if`), e `etapa_id` nulo é
    -- valor legítimo. E, mesmo quando roda, ela é chamada DEPOIS de o favorito
    -- já ter sido lido logo acima. Ela nunca protegeu este corpo.
    --
    -- Quem protege esta função é a guarda PRÓPRIA e INCONDICIONAL na entrada
    -- do corpo. Esta chamada aqui serve só ao seu propósito de negócio: dizer
    -- se a etapa está liberada para o aluno. Não é camada de segurança, e não
    -- deve voltar a ser tratada como tal.
    select gps.etapa_liberada_para(p_aluno_id, v_etapa_id) into v_liberada;
    if not coalesce(v_liberada, false) then
      return null;
    end if;
  end if;

  return v_cliente_id;
end;
$function$;

comment on function gps.sessao_pode_agendar(uuid, smallint) is
  'O ambiente pode agendar este tipo de sessao? Devolve o CLIENTE elegivel (o favorito) ou NULL. Regra do PRD §9-ter B3, medida em 22/09 (34 elegiveis): cliente com acompanhado_equipe = true E etapa do tipo liberada por gps.etapa_liberada_para(). 🔴 A trava extra (favorito CONFIRMADO pela equipe) e LIDA de gps.config.sessoes_exige_confirmacao, nunca embutida -- ela nasce false porque acompanhamento_confirmado_em nunca foi preenchida e liga-la hoje recusaria 100% dos alunos carregando sem erro nenhum. A etapa exigida vem de gps.sessao_tipos.etapa_id (DADO), nunca de case when no corpo. E a MESMA funcao usada pela leitura (sessao_horarios_livres) e pela escrita (sessao_agendar): duas copias fariam a tela oferecer horario que a RPC recusa.';

revoke all on function gps.sessao_pode_agendar(uuid, smallint) from public, anon;
grant execute on function gps.sessao_pode_agendar(uuid, smallint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.sessao_horarios_livres — a GRADE, derivada na leitura
-- ═══════════════════════════════════════════════════════════════════════════
-- §5.4: a grade é DERIVADA na leitura, NUNCA gravada.
-- `sessao_disponibilidade` guarda a JANELA da doutora (09:30–12:00); quantos
-- blocos cabem nela é conta de leitura, feita aqui, a partir de
-- `sessao_tipos.duracao_min` + `intervalo_min`.
--
-- disponibilidade − bloqueios − ocupados:
--   1. expande os dias do intervalo pedido (generate_series de DATE)
--   2. casa com as faixas semanais vigentes daquele dia da semana
--   3. fatia cada faixa em blocos de `duracao_min`, pulando `intervalo_min`
--   4. descarta bloco que passa do fim da faixa
--   5. descarta bloco no passado
--   6. descarta bloco que encosta em bloqueio
--   7. descarta bloco que se sobrepõe a agendamento vivo
--
-- 🔴 A ARITMÉTICA DO FIM acontece em `timestamp` LOCAL (`d.dia + f.hora_*`),
-- e só o resultado final vira `timestamptz` pelo `at time zone`. É a MESMA
-- ordem da coluna gerada `fim_em` da …291. Fazer diferente aqui produziria
-- uma grade que oferece horários que a constraint de exclusão depois recusa —
-- e o aluno veria "escolha este" seguido de "este não dá".
--
-- ESCALA (protocolo, pergunta 1): o custo é por JANELA PEDIDA, não por base.
-- `p_ate` é limitado a 120 dias (v_ate abaixo) — sem isso, um cliente pedindo
-- 10 anos faria o generate_series montar 3.650 dias × faixas × blocos no
-- servidor. O teto é a única defesa, porque o parâmetro vem do cliente.
--
-- ÍNDICE (pergunta 2): 🔴 NÃO se herda de §9b.1 — aquilo mediu igualdade/faixa
-- e AQUI o predicado é sobreposição (`&&`). Medido à parte em 22/09; o plano e
-- os três números estão no bloco da sonda, mais abaixo. Conclusão: nenhum
-- índice novo, porque o índice GiST da constraint `sessao_sem_sobreposicao` já
-- serve — desde que a consulta sonde por candidato.
--
-- FREQUÊNCIA (3) e REPETIÇÃO (4): uma chamada por abertura da tela de
-- agendamento. Devolve a grade INTEIRA da janela numa ida — a tela não pede
-- dia a dia (N telas = N queries é o que se está evitando). O nome da
-- responsável vem JUNTO (7ª coluna), pelo mesmo motivo: sem ele a tela faria
-- uma segunda ida ao banco por doutora só para escrever o rótulo.
--
-- REVERSÃO (5): a feature inteira se desliga por dado — `update
-- gps.sessao_disponibilidade set ativo = false` esvazia a grade e a tela passa
-- a dizer a verdade ("a equipe não tem horário"), sem deploy.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 DROP ANTES DO CREATE — a assinatura de RETORNO mudou (6 → 7 colunas)
-- ═══════════════════════════════════════════════════════════════════════════
-- `create or replace` NÃO consegue trocar o tipo de retorno de uma função que
-- devolve `table(...)`: o Postgres recusa com 42P13 ("cannot change return type
-- of existing function"). E, em geral, assinatura diferente **cria sobrecarga
-- em vez de substituir** — a camada TS continuaria chamando a versão antiga,
-- sem erro nenhum. Este projeto já pagou isso na …282 (o export de clientes
-- seguiu chamando a RPC de 4 argumentos depois que a de 5 nasceu, e a trilha
-- de auditoria registrou o recorte errado em silêncio).
--
-- O drop é pelos ARGUMENTOS (que não mudaram), não pelo retorno.
drop function if exists gps.sessao_horarios_livres(smallint, uuid, date, date);

create or replace function gps.sessao_horarios_livres(
  p_tipo_id        smallint,
  p_responsavel_id uuid default null,
  p_de             date default null,
  p_ate            date default null
)
returns table (
  responsavel_id   uuid,
  -- 🔴 7ª coluna (PRD §9 D5: "ao escolher o horário ele escolhe quem o
  -- publicou. A TELA MOSTRA O NOME"). Sem ela a tela do aluno não tem como
  -- dizer de quem é o horário: `auth.users` não é legível por `authenticated`,
  -- e `public.perfis` tem os nomes mas a policy `gps_block_aluno` é
  -- `using (gps.aluno_atual() is null)` — ou seja, TODO aluno com ambiente é
  -- bloqueado de lê-la. Nenhum join do lado da tela alcança; só SECURITY
  -- DEFINER resolve, e é esta função.
  responsavel_nome text,
  data             date,
  hora_inicio      time,
  inicio_em        timestamptz,
  fim_em           timestamptz,
  duracao_min      smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_ambiente   uuid := gps.aluno_atual();
  v_equipe     boolean := coalesce(gps.eh_equipe(), false);
  v_duracao    smallint;
  v_intervalo  smallint;
  v_de         date;
  v_ate        date;
  v_cliente_id uuid;
begin
  if p_tipo_id is null then
    raise exception 'tipo de sessao nao informado' using errcode = '22023';
  end if;

  -- 🔴 A duração e a folga vêm do CATÁLOGO, sempre. Nenhum valor escrito aqui.
  select t.duracao_min, t.intervalo_min
    into v_duracao, v_intervalo
    from gps.sessao_tipos t
   where t.id = p_tipo_id and t.ativo;

  if not found then
    raise exception 'Tipo de sessão não encontrado.' using errcode = 'P0002';
  end if;

  -- GUARDA. Equipe (admin ou operador) enxerga a grade de qualquer doutora —
  -- é o que a tela administrativa precisa. O ALUNO só enxerga grade se for
  -- elegível: senão a tela mostraria horários que a RPC de escrita recusaria,
  -- que é a mesma incoerência de oferecer botão que falha.
  if not v_equipe then
    if v_ambiente is null then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    v_cliente_id := gps.sessao_pode_agendar(v_ambiente, p_tipo_id);
    if v_cliente_id is null then
      -- Lista VAZIA, não erro: "não há horário para você" é um resultado, e a
      -- tela tem estado vazio honesto para ele (§7.1). Erro faria a tela
      -- mostrar falha de sistema para uma situação perfeitamente normal.
      return;
    end if;
  end if;

  -- Janela pedida, com teto. Default: de hoje a 8 semanas (a mesma janela que
  -- §9b.1 mediu). O teto de 120 dias é defesa de escala, ver cabeçalho.
  v_de  := greatest(coalesce(p_de, (now() at time zone 'America/Sao_Paulo')::date),
                    (now() at time zone 'America/Sao_Paulo')::date);
  v_ate := coalesce(p_ate, v_de + 56);
  if v_ate > v_de + 120 then
    v_ate := v_de + 120;
  end if;
  if v_ate < v_de then
    return;
  end if;

  return query
  with dias as (
    select g::date as dia
      from generate_series(v_de, v_ate, interval '1 day') g
  ),
  faixas as (
    -- A regra semanal vigente naquele dia. `vigencia_fim is null` = sem prazo,
    -- que é o que faz a regra NÃO expirar (diferente do Plantão).
    select d.dia,
           f.responsavel_id,
           f.hora_inicio,
           f.hora_fim
      from dias d
      join gps.sessao_disponibilidade f
        on f.ativo
       and f.dia_semana = extract(dow from d.dia)::smallint
       and f.vigencia_inicio <= d.dia
       and (f.vigencia_fim is null or f.vigencia_fim >= d.dia)
       -- tipo_id null na faixa = serve para qualquer tipo (…291).
       and (f.tipo_id is null or f.tipo_id = p_tipo_id)
       and (p_responsavel_id is null or f.responsavel_id = p_responsavel_id)
  ),
  blocos as (
    -- 🔴 FATIA A JANELA EM BLOCOS. O passo é duracao + intervalo; o bloco em si
    -- é só a duração. A folga fica ENTRE blocos, não dentro — por isso ela não
    -- entra na constraint de exclusão da …291 (folga é conforto de agenda,
    -- não invalidade de dado).
    select f.dia,
           f.responsavel_id,
           (f.hora_inicio + make_interval(mins => (v_duracao + v_intervalo) * s.i))::time as h_ini,
           f.hora_fim
      from faixas f
      cross join lateral (
        -- Quantos passos cabem na faixa, no pior caso. O `where` abaixo
        -- descarta o que estourar — é mais barato gerar a mais e filtrar do
        -- que calcular o teto exato em duas aritméticas diferentes.
        select generate_series(
                 0,
                 greatest(
                   (extract(epoch from (f.hora_fim - f.hora_inicio))::int
                     / nullif((v_duracao + v_intervalo) * 60, 0)),
                   0)
               ) as i
      ) s
  ),
  -- 🔴 `as materialized`: os candidatos são POUCOS (16 numa janela de 4
  -- semanas, medido) e cada um vira uma SONDA no índice GiST logo abaixo.
  -- Materializar aqui é o que dá ao planner um lado externo pequeno e conhecido
  -- para o Nested Loop — sem isso ele inline o generate_series dentro do join e
  -- volta a preferir o hash.
  candidatos as materialized (
    select b.responsavel_id,
           b.dia as data,
           b.h_ini as hora_inicio,
           -- Soma no timestamp LOCAL, converte depois — a MESMA ordem das
           -- colunas geradas inicio_em/fim_em da …291.
           ((b.dia + b.h_ini) at time zone 'America/Sao_Paulo') as inicio_em,
           (((b.dia + b.h_ini) + make_interval(mins => v_duracao))
              at time zone 'America/Sao_Paulo') as fim_em
      from blocos b
     -- o bloco INTEIRO tem de caber na faixa declarada
     where (b.h_ini + make_interval(mins => v_duracao)) <= b.hora_fim
  )
  -- ═════════════════════════════════════════════════════════════════════
  -- 🔴 SONDA POR CANDIDATO — a FORMA da consulta é que decide o plano
  -- ═════════════════════════════════════════════════════════════════════
  -- MEDIDO em 22/09 contra o banco, com 2.080 agendamentos (10 anos de
  -- 4/semana) e janela de 56 dias. Três formas medidas, não supostas:
  --
  --   (1) `not exists` sem materializar ........................ 93,480 ms
  --       Hash Anti Join · Seq Scan on sessao_agendamentos (rows=2080)
  --       Rows Removed by Join Filter: 66560
  --
  --   (2) `as materialized` + `not exists … limit 1` ........... 25,811 ms
  --       🔴 MESMO Hash Anti Join, MESMOS 66.560 descartes. Materializar
  --       encolheu o lado externo (93 → 25 ms) e SÓ. **O `limit 1` dentro
  --       do `not exists` é DESCARTADO pelo planner** — ele converte o
  --       `not exists` em anti-join e o limite não sobrevive à conversão.
  --
  --   (3) `left join lateral (… limit 1) on true` + `is null` ... 0,663 ms
  --       Nested Loop Left Join (Filter: (1) IS NULL)
  --         ->  CTE Scan on candidatos c (rows=32)
  --         ->  Limit (loops=32)
  --               ->  Index Scan using sessao_sem_sobreposicao
  --                     Index Cond: ((responsavel_id = c.responsavel_id)
  --                              AND (tstzrange(inicio_em, fim_em, '[)')
  --                                   && tstzrange(c.inicio_em, c.fim_em, '[)')))
  --
  -- **141× mais rápido (93,480 → 0,663 ms)** — e, o que importa mais, o
  -- custo deixa de crescer com o acervo: são **32 sondas indexadas, uma por
  -- candidato**, então o custo é função do número de blocos oferecidos
  -- (16/mês, §5.4), não do histórico acumulado, que só aumenta.
  --
  -- 🔴 NÃO "SIMPLIFICAR" DE VOLTA PARA `not exists`. A forma (2) parece mais
  -- limpa, dá o mesmo resultado e é 39× mais lenta — e piora sozinha com o
  -- tempo. Foi medida; não é questão de estilo.
  --
  -- 🔑 §9b.1 mediu um predicado de IGUALDADE/FAIXA e concluiu Seq Scan —
  -- conclusão correta PARA AQUELE predicado. Este aqui é SOBREPOSIÇÃO (`&&`),
  -- que B-tree não indexa. A premissa de lá NÃO cobre este caso: foi por isso
  -- que o plano surpreendeu, e é por isso que este bloco foi medido à parte.
  --
  -- 🔴 NENHUM ÍNDICE NOVO: o índice certo já existe de graça. A constraint
  -- `sessao_sem_sobreposicao` (exclude using gist) materializa um índice GiST
  -- sobre (responsavel_id, tstzrange(inicio_em, fim_em)), parcial em
  -- estado in ('agendado','realizado') — é ele que aparece no Index Cond.
  --
  -- ⚠️ Para o planner CHEGAR nele, a expressão do lado indexado tem de bater
  -- com a do índice **caractere a caractere**: `tstzrange(a.inicio_em,
  -- a.fim_em, '[)')`, nessa ordem, com o mesmo terceiro argumento. E o
  -- predicado parcial tem de ser provável — por isso
  -- `a.estado in ('agendado', 'realizado')` está escrito EXATAMENTE como na
  -- constraint: trocar por `<> 'cancelado'` daria o mesmo resultado lógico e
  -- perderia o índice parcial EM SILÊNCIO. Este banco já pagou essa lição em
  -- 19/08 com btrim/lower (1.085 ms varrendo 71.728 linhas).
  --
  -- ⚠️ A grade continua concordando com a constraint: mesmo predicado parcial
  -- (cancelado e falta LIBERAM o horário) e mesmo intervalo semiaberto '[)'.
  -- Se as duas divergirem, a tela oferece o que o banco recusa.
  -- ═════════════════════════════════════════════════════════════════════
  select c.responsavel_id,
         -- 🔴 D5: o NOME de quem publicou o horário. Vem de public.perfis
         -- casando por `p.id = <auth.users.id>` — o MESMO vínculo que
         -- public.gp_is_admin() usa (`p.id = auth.uid()`), e o mesmo que
         -- gps.admin_mencionaveis (…207) usa para devolver id+nome.
         -- 🔴 NUNCA casar por primeiro nome: há DEZENAS de alunas Elaine e
         -- Cristiane em auth.users, e casar por nome pegaria aluna. O vínculo
         -- é o uuid, sempre.
         -- 🔴 LGPD: SÓ o nome. Nada de e-mail, cargo ou qualquer outro campo
         -- de perfis — é a profissional se identificando para o aluno que ela
         -- vai atender, não um diretório da equipe exposto à tela do aluno.
         nm.nome,
         c.data,
         c.hora_inicio,
         c.inicio_em,
         c.fim_em,
         v_duracao
    from candidatos c
    -- O nome, por candidato. `left join` e não `join`: perfil ausente ou
    -- inativo NÃO pode sumir com o horário da grade — a doutora continua
    -- atendendo, e a tela decide como rotular um nome nulo (o `iromar` já tem
    -- o fallback "equipe jurídica"). Sumir com o slot seria esconder oferta
    -- real por causa de cadastro.
    left join lateral (
      select p.nome
        from public.perfis p
       where p.id = c.responsavel_id
       limit 1
    ) nm on true
    -- − OCUPADOS. Sonda indexada: Index Scan using sessao_sem_sobreposicao.
    left join lateral (
      select 1 as ocupado
        from gps.sessao_agendamentos a
       where a.responsavel_id = c.responsavel_id
         and a.estado in ('agendado', 'realizado')
         and tstzrange(a.inicio_em, a.fim_em, '[)')
             && tstzrange(c.inicio_em, c.fim_em, '[)')
       limit 1
    ) oc on true
    -- − BLOQUEIOS (férias, feriado, imprevisto). Sobreposição de intervalo,
    --   não igualdade de início: um bloqueio de 1h no meio do bloco o mata.
    --   ⚠️ `sessao_bloqueios` NÃO tem índice GiST (não há constraint de
    --   exclusão nela) e NÃO se cria um. MEDIDO na mesma passada: Seq Scan
    --   com loops=32 e custo **0,000 ms** — é a escolha certa do planner,
    --   porque a tabela é pequena por natureza (feriado/férias/imprevisto de
    --   uma equipe de 2 pessoas). Índice aqui custaria escrita em toda
    --   exceção lançada sem mudar o plano. Se um dia ela aparecer no plano,
    --   aí se mede e se decide — com EXPLAIN colado, não por intuição.
    left join lateral (
      select 1 as bloqueado
        from gps.sessao_bloqueios bl
       where bl.responsavel_id = c.responsavel_id
         and tstzrange(bl.inicio, bl.fim, '[)')
             && tstzrange(c.inicio_em, c.fim_em, '[)')
       limit 1
    ) bq on true
   -- passado não se oferece
   where c.inicio_em > now()
     and oc.ocupado   is null
     and bq.bloqueado is null
   order by c.inicio_em, c.responsavel_id;
end;
$function$;

comment on function gps.sessao_horarios_livres(smallint, uuid, date, date) is
  'A GRADE, DERIVADA NA LEITURA e nunca gravada (PRD §5.4): disponibilidade - bloqueios - ocupados. Devolve 7 colunas; a 7a e responsavel_nome, de public.perfis por uuid, porque o PRD §9 D5 manda a tela mostrar O NOME de quem publicou o horario e o aluno NAO alcanca perfis (policy gps_block_aluno bloqueia todo aluno com ambiente) nem auth.users. A duracao e a folga vem SEMPRE de gps.sessao_tipos (duracao_min/intervalo_min) -- nenhum valor de duracao escrito no corpo. A soma do fim acontece no timestamp LOCAL antes do `at time zone`, a MESMA ordem das colunas geradas inicio_em/fim_em da …291: fazer diferente ofereceria horario que a constraint de exclusao depois recusa. Aluno so recebe grade se for elegivel (gps.sessao_pode_agendar) e, quando nao e, recebe LISTA VAZIA -- nao erro, porque "nao ha horario para voce" e um resultado e a tela tem estado vazio honesto (§7.1). Equipe (eh_equipe) ve a grade de qualquer doutora. Janela default 8 semanas, TETO de 120 dias (defesa de escala: o parametro vem do cliente). '
  '🔴 PLANO MEDIDO EM 22/09 contra o banco, com 2.080 agendamentos (10 anos de 4/semana) e janela de 56 dias -- NAO herdado de §9b.1, que mediu um predicado de igualdade/faixa e por isso NAO cobre este caso: aqui o predicado e SOBREPOSICAO (&&), que B-tree nao indexa. Tres formas medidas: (1) `not exists` = Hash Anti Join + Seq Scan, 66.560 Rows Removed by Join Filter, 93,480 ms, crescendo LINEARMENTE com o acervo; (2) `as materialized` + `not exists ... limit 1` = 25,811 ms, MESMO Hash Anti Join e MESMOS 66.560 descartes -- o `limit 1` dentro do `not exists` e DESCARTADO pelo planner na conversao para anti-join; (3) `left join lateral (... limit 1) on true` + `is null` = **0,663 ms**, Nested Loop Left Join com **32 sondas** (uma por candidato) em Index Scan using sessao_sem_sobreposicao. 🔴 141x mais rapido, e o custo deixa de crescer com o historico: passa a ser funcao do numero de blocos oferecidos (16/mes), nao do acervo. NAO "simplificar" de volta para `not exists` -- parece mais limpo, da o mesmo resultado, e e 39x mais lento. '
  '🔴 NENHUM INDICE NOVO foi criado: o da constraint sessao_sem_sobreposicao (exclude using gist) ja serve, de graca. Para ele continuar sendo usado, a expressao tstzrange(a.inicio_em, a.fim_em, ''[)'') e o predicado parcial estado in (''agendado'', ''realizado'') tem de bater com os da constraint CARACTERE A CARACTERE -- trocar por `<> ''cancelado''` daria o mesmo resultado logico e perderia o indice em silencio (licao de 19/08 com btrim/lower). gps.sessao_bloqueios segue SEM indice de proposito: medido na mesma passada, Seq Scan com loops=32 e custo 0,000 ms -- tabela pequena por natureza, indice ali custaria escrita em toda excecao sem mudar o plano.';

revoke all on function gps.sessao_horarios_livres(smallint, uuid, date, date) from public, anon;
grant execute on function gps.sessao_horarios_livres(smallint, uuid, date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3-bis) gps.sessao_responsaveis — o nome das doutoras, para as LEITURAS
-- ═══════════════════════════════════════════════════════════════════════════
-- PRD §9 D5 vale também para a sessão JÁ MARCADA, não só para a grade: a tela
-- que mostra "sua sessão está marcada" precisa dizer com quem.
--
-- 🔴 POR QUE UMA FUNÇÃO DE CONSULTA, E NÃO MAIS UMA COLUNA NO RETORNO DE
-- `sessao_agendar`/`sessao_cancelar`:
--   1. Aquelas RPCs são de ESCRITA e devolvem o resultado de UMA operação. A
--      tela de "minhas sessões" lê a TABELA `gps.sessao_agendamentos` pelo
--      PostgREST (a RLS de §9-ter B2 já a autoriza) e nunca chama a RPC de
--      escrita para listar — pôr o nome só no retorno da escrita não serviria
--      à tela que realmente precisa dele.
--   2. `responsavel_nome` NÃO é coluna de `sessao_agendamentos` e não deve
--      virar uma: seria desnormalizar um dado que muda em `public.perfis` e
--      passar a ter duas verdades sobre o nome da mesma pessoa.
--   3. São 2 doutoras (§4.4). A camada TS busca o mapa UMA vez e casa por id
--      na memória — é a mesma forma do `admin_mencionaveis` (…207). Uma ida
--      ao banco para a lista inteira, não uma por linha de agendamento (é
--      exatamente o N+1 que o protocolo manda evitar).
--
-- Universo: quem TEM grade publicada em `gps.sessao_disponibilidade` (ativa ou
-- não) ou já responde por algum agendamento. Não é um diretório da equipe: é o
-- conjunto de pessoas que o aluno pode legitimamente ver como "quem atende".
--
-- 🔴 LGPD: devolve `id` e `nome`, MAIS NADA. Sem e-mail, sem cargo, sem status
-- — mesmo recorte do `admin_mencionaveis`, pela mesma razão (e-mail em lista
-- que vai ao cliente vira payload no navegador).
--
-- SECURITY DEFINER porque `public.perfis` é inalcançável pelo aluno: a policy
-- `gps_block_aluno` é `using (gps.aluno_atual() is null)`, então TODO aluno com
-- ambiente é bloqueado. Sem esta função a tela imprimiria uuid ou inventaria
-- rótulo — as duas coisas que o front corretamente se recusou a fazer.
create or replace function gps.sessao_responsaveis()
returns table (
  responsavel_id   uuid,
  responsavel_nome text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select u.responsavel_id,
         p.nome
    from (
      select d.responsavel_id from gps.sessao_disponibilidade d
      union
      -- 🔴 MEDIDO em 22/09 com 2.080 agendamentos (10 anos): este lado do
      -- `union` faz `Seq Scan` para extrair 2 uuids distintos -- 1,157 ms sem
      -- o filtro, 0,927 ms com ele (`Rows Removed by Filter: 2080`).
      -- Fica assim, e a decisão é deliberada:
      --   • a função devolve 2 LINHAS e roda 1x por carregamento de tela;
      --   • `select distinct` só da disponibilidade daria 0,142 ms (8x), mas
      --     PERDERIA a doutora que tem agendamento e não tem mais grade
      --     publicada -- a tela deixaria de saber o nome de quem atende uma
      --     sessão já marcada, que é metade do caso de uso;
      --   • índice em (estado, inicio_em) resolveria o Seq Scan, mas custaria
      --     escrita em TODO agendamento para servir uma consulta de 1 ms que
      --     roda uma vez por tela. Não passa na pergunta 2 do protocolo.
      -- O filtro abaixo existe para o custo não crescer sem teto: sem ele, o
      -- `union` varreria o acervo inteiro pela vida do sistema.
      select a.responsavel_id from gps.sessao_agendamentos a
       where a.estado in ('agendado', 'realizado')
         and a.inicio_em > now() - interval '180 days'
    ) u
    -- 🔴 `left join` e por `p.id = u.responsavel_id` (uuid), NUNCA por nome:
    -- há dezenas de alunas Elaine/Cristiane em auth.users. `left` para que uma
    -- doutora sem linha em perfis ainda apareça na lista (com nome nulo), em
    -- vez de sumir e deixar a tela sem rótulo E sem explicação.
    left join public.perfis p on p.id = u.responsavel_id
   order by p.nome nulls last;
$function$;

comment on function gps.sessao_responsaveis() is
  'id + NOME de quem atende as sessoes, para a tela poder cumprir o PRD §9 D5 ("a tela mostra o nome"). 🔴 Existe porque o aluno NAO alcanca public.perfis: a policy gps_block_aluno e `using (gps.aluno_atual() is null)`, entao todo aluno COM ambiente e bloqueado -- e auth.users nao e legivel por authenticated. Sem esta funcao a tela imprimiria uuid ou inventaria rotulo. 🔴 O vinculo e `perfis.id = responsavel_id` (uuid), o MESMO de gp_is_admin() -- NUNCA casar por primeiro nome: ha dezenas de alunas Elaine/Cristiane em auth.users. 🔴 LGPD: devolve id e nome e MAIS NADA (sem e-mail, cargo ou status), mesmo recorte de gps.admin_mencionaveis (…207). Universo = quem tem grade publicada ou ja responde por um agendamento, nao o diretorio da equipe. A camada TS busca o mapa UMA vez e casa por id em memoria (sao 2 doutoras) -- nao uma consulta por linha de agendamento.';

revoke all on function gps.sessao_responsaveis() from public, anon;
grant execute on function gps.sessao_responsaveis() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.sessao_briefing_montar — o snapshot, congelado no ato
-- ═══════════════════════════════════════════════════════════════════════════
-- §6.5: as 5 fontes continuam mudando depois do agendamento. Montar por JOIN
-- ao vivo faria a doutora abrir 10 min antes e ver algo diferente do que foi
-- agendado. Grava-se jsonb congelado, com `gerado_em`.
--
-- Molde: `gps.dossie_do_cliente` (…264) — mesmas fontes, mesmo recorte.
-- ⚠️ Diferença deliberada: o dossiê GRAVA trilha a cada leitura porque é uma
-- LEITURA de dado pessoal feita por operador. Esta função aqui não grava: ela
-- é peça interna de `sessao_agendar`, que já escreve a própria trilha. A
-- trilha de leitura do briefing fica em `sessao_briefing_ler` (seção 8).
--
-- 🔴 PESO: `descricao_caso` vai a 4.000 chars; o snapshot fica em ~6 KB. Para
-- 4 sessões/semana (§5.4) é irrelevante. §6.5 avisa: se a duração abrir para
-- 20/semana, `explain analyze` obrigatório antes.
--
-- 🔴 NÃO É `stable` por acidente — é `stable` de verdade: só lê. Se um dia
-- alguém acrescentar INSERT aqui, tem de virar volatile, senão o Postgres
-- recusa em execução ("INSERT is not allowed in a non-volatile function") —
-- exatamente o que pegou `dossie_do_cliente` antes de aplicar, em 15/09.
create or replace function gps.sessao_briefing_montar(p_cliente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_c             record;
  v_parceiro      text;
  -- escalares, nunca record — ver o comentário no select do onboarding
  v_onb_fase      text;
  v_onb_caso      text;
  v_onb_ajuda     text;
  v_onb_concluido timestamptz;
  v_decisores  jsonb;
  v_tentativas jsonb;
  v_minutas    jsonb;
begin
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.telefone, c.grau_relacao, c.fase,
         c.perfil_disc, c.problemas, c.registro_contato,
         c.valor_honorarios, c.data_reuniao_preliminar, c.aderiu_reuniao,
         c.selecionado_entrevista, c.entrevista_resultado,
         c.entrevista_observacoes, c.entrevista_em
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_c.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- LEFT via subselect (não INNER) — mesma lição da …255 repetida na …264: se
  -- o cadastro do parceiro sumir de thb_alunos, o briefing mostra dono vazio,
  -- não erro no meio de um agendamento.
  select t.nome into v_parceiro
    from public.thb_alunos t
   where t.id = v_c.aluno_id;

  -- Onboarding: é RETRATO DO DIA 0, não estado vivo — e é onde mora
  -- `descricao_caso` (até 4.000 chars) e `ajuda_pronta`.
  --
  -- 🔴 VARIÁVEIS ESCALARES, NÃO um `record` — e isto NÃO é preciosismo.
  -- Medido em 22/09 (§4.3 / §9-ter B3): `onboarding_respostas` tem **108
  -- linhas** para **148 ambientes**, ou seja ~40 ambientes NÃO TÊM linha. Esta
  -- função roda no meio de `sessao_agendar`, então qualquer surpresa aqui
  -- aborta o agendamento inteiro — justamente para quem nunca respondeu o
  -- onboarding, que é o caso mais comum dos 40.
  --
  -- Escalar sem linha vira NULL, que é exatamente o que o jsonb_build_object
  -- abaixo espera. Com `record`, o comportamento depende da FORMA do select
  -- (a …213 documenta as duas: `select *` sem linha deixa os campos NULL, mas
  -- outros caminhos deixam o record "not assigned" e ler um campo levanta
  -- **55000 record is not assigned yet**). Escalar não tem esses dois modos —
  -- tem um só. Numa função que já custa um agendamento se falhar, escolher a
  -- construção sem modo ambíguo é barato.
  select o.fase_cliente1, o.descricao_caso, o.ajuda_pronta, o.concluido_em
    into v_onb_fase, v_onb_caso, v_onb_ajuda, v_onb_concluido
    from gps.onboarding_respostas o
   where o.ambiente_aluno_id = v_c.aluno_id
   order by o.atualizado_em desc
   limit 1;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'nome', d.nome,
             'papel_no_negocio', d.papel_no_negocio,
             'principal', d.principal
           ) order by d.principal desc, d.criado_em
         ), '[]'::jsonb)
    into v_decisores
    from gps.cliente_decisores d
   where d.cliente_id = p_cliente_id;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'tentativa_em', tt.tentativa_em,
             'resultado', tt.resultado,
             'qualidade', tt.qualidade,
             'observacoes', tt.observacoes
           ) order by tt.tentativa_em desc
         ), '[]'::jsonb)
    into v_tentativas
    from gps.entrevista_tentativas tt
   where tt.cliente_id = p_cliente_id;

  -- Só o METADADO da minuta. O PDF fica no bucket; o snapshot não carrega byte.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'nome', m.nome,
             'enviado_em', m.enviado_em,
             'enviado_pela_equipe', m.enviado_pela_equipe,
             'notas', m.notas
           ) order by m.enviado_em desc
         ), '[]'::jsonb)
    into v_minutas
    from gps.cliente_minutas m
   where m.cliente_id = p_cliente_id;

  return jsonb_build_object(
    'gerado_em', now(),
    'cliente_id', v_c.id,
    'aluno_id', v_c.aluno_id,
    'parceiro_nome', v_parceiro,
    'cliente', jsonb_build_object(
      'nome', v_c.nome,
      'telefone', v_c.telefone,
      'grau_relacao', v_c.grau_relacao,
      'fase', v_c.fase,
      'perfil_disc', v_c.perfil_disc,
      'problemas', to_jsonb(v_c.problemas),
      'registro_contato', v_c.registro_contato,
      'valor_honorarios', v_c.valor_honorarios,
      'data_reuniao_preliminar', v_c.data_reuniao_preliminar,
      'aderiu_reuniao', v_c.aderiu_reuniao
    ),
    'onboarding', jsonb_build_object(
      'fase_cliente1', v_onb_fase,
      'descricao_caso', v_onb_caso,
      'ajuda_pronta', v_onb_ajuda,
      'concluido_em', v_onb_concluido
    ),
    'entrevista', jsonb_build_object(
      'selecionado', v_c.selecionado_entrevista,
      'resultado', v_c.entrevista_resultado,
      'observacoes', v_c.entrevista_observacoes,
      'em', v_c.entrevista_em,
      'tentativas', v_tentativas
    ),
    'decisores', v_decisores,
    'minutas', v_minutas
  );
end;
$function$;

comment on function gps.sessao_briefing_montar(uuid) is
  'Monta o briefing CONGELADO do cliente no ato do agendamento (PRD §6.5), das 5 fontes: etapa1_clientes, onboarding_respostas, entrevista_tentativas, cliente_decisores, cliente_minutas (so metadado, nunca o byte do PDF). Congelar em vez de referenciar porque as fontes continuam mudando: por JOIN ao vivo a doutora abriria 10 min antes e veria algo diferente do que foi agendado. 🔴 PECA INTERNA de gps.sessao_agendar -- sem grant para authenticated/anon, e sem guarda propria justamente por isso (quem a chama ja autorizou). 🔴 LGPD: o conteudo aqui (descricao_caso, observacoes, decisores) e PROIBIDO em lista consolidada, CSV, Slack e e-mail (§4.3) -- fica no briefing_snapshot, que vive atras de RPC, e NUNCA no detalhe de sessao_eventos nem em payload de e-mail. `stable` porque so le: acrescentar INSERT aqui exige trocar para volatile, senao o Postgres recusa em execucao.';

-- 🔴 Peça INTERNA: neste projeto toda função nova nasce com execute para
-- `authenticated` (ALTER DEFAULT PRIVILEGES do schema gps). Sem este revoke, o
-- briefing de QUALQUER cliente seria legível por qualquer aluno logado pelo
-- PostgREST — a coluna está fora do grant justamente para isso não acontecer.
-- E `revoke from anon` sozinho NÃO basta quando a permissão vem de PUBLIC:
-- por isso `public` é nomeado explicitamente.
revoke all on function gps.sessao_briefing_montar(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) gps.sessao_agendar — atômica
-- ═══════════════════════════════════════════════════════════════════════════
-- §7.1 passo 5: "RPC atômica: revalida tudo sob lock, congela snapshot, grava".
-- §9 D4 (premissa IMEDIATO): se a doutora publicou o horário, ele vale. Não
-- existe "pendente de aceite" — é exatamente o modelo que falhou em 10/08 e
-- motivou a remoção.
--
-- §9-ter B1: quando o tipo é Reunião Preliminar, grava
-- `gps.etapa1_clientes.data_reuniao_preliminar` NA MESMA TRANSAÇÃO — molde do
-- aceite em `…263`. Sem isso o painel diria "não agendada" para quem tem
-- sessão marcada: duas verdades sobre o mesmo fato.
--
-- 🔴 Qual tipo é "Reunião Preliminar" NÃO é literal no corpo: é o tipo cuja
-- `etapa_id` é a etapa da Reunião Preliminar (2). Mesmo princípio da seção 0 —
-- a regra é dado, e `tipo_id = 2` escrito aqui quebraria em silêncio no dia em
-- que alguém reordenasse o catálogo.
create or replace function gps.sessao_agendar(
  p_tipo_id        smallint,
  p_responsavel_id uuid,
  p_data           date,
  p_hora_inicio    time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ambiente   uuid := gps.aluno_atual();
  v_cliente_id uuid;
  v_tipo       record;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_snapshot   jsonb;
  v_id         uuid;
  v_ok         boolean;
  v_constraint text;
begin
  if p_tipo_id is null or p_responsavel_id is null
     or p_data is null or p_hora_inicio is null then
    raise exception 'Escolha um horário para continuar.' using errcode = '22023';
  end if;

  if v_ambiente is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- ELEGIBILIDADE — a mesma função que a leitura usa. Devolve o cliente.
  v_cliente_id := gps.sessao_pode_agendar(v_ambiente, p_tipo_id);
  if v_cliente_id is null then
    raise exception 'Você ainda não pode agendar esta sessão. É preciso ter um cliente marcado como o que a equipe acompanha, e a etapa correspondente liberada.'
      using errcode = '42501';
  end if;

  -- O CATÁLOGO é a única casa da duração. Copiada congelada logo abaixo.
  select t.id, t.duracao_min, t.intervalo_min, t.etapa_id, t.nome
    into v_tipo
    from gps.sessao_tipos t
   where t.id = p_tipo_id and t.ativo;

  if not found then
    raise exception 'Tipo de sessão não encontrado.' using errcode = 'P0002';
  end if;

  -- 🔴 FOR UPDATE no CLIENTE: serializa por ambiente. Dois cliques simultâneos
  -- do mesmo aluno não podem os dois acharem "ainda não tenho sessão viva".
  -- Mesma técnica de `cliente_minuta_anexar` (…273), que serializa por cliente
  -- antes de decidir "é a primeira?".
  perform 1 from gps.etapa1_clientes where id = v_cliente_id for update;

  -- Instantes do bloco. MESMA ordem das colunas geradas: soma no timestamp
  -- local, converte depois. (Aqui o valor é só para CONFERIR e para a
  -- mensagem; quem grava inicio_em/fim_em é o banco, são colunas geradas.)
  v_inicio := ((p_data + p_hora_inicio) at time zone 'America/Sao_Paulo');
  v_fim    := (((p_data + p_hora_inicio) + make_interval(mins => v_tipo.duracao_min))
                 at time zone 'America/Sao_Paulo');

  if v_inicio <= now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;

  -- REVALIDA A OFERTA sob lock: o horário ainda está na grade derivada?
  -- Isto cobre disponibilidade + bloqueios + ocupados numa pergunta só, e é a
  -- fonte da mensagem LEGÍVEL. Quem recusa DE FATO entre transações
  -- concorrentes são as travas atômicas tratadas no bloco exception.
  select exists (
    select 1 from gps.sessao_horarios_livres(p_tipo_id, p_responsavel_id, p_data, p_data) h
     where h.inicio_em = v_inicio
       and h.responsavel_id = p_responsavel_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Esse horário não está mais disponível. Escolha outro na lista.'
      using errcode = '22023';
  end if;

  -- CONGELA O BRIEFING (§6.5) — antes do insert, para o snapshot ser do
  -- instante do agendamento.
  v_snapshot := gps.sessao_briefing_montar(v_cliente_id);

  begin
    insert into gps.sessao_agendamentos
      (tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio,
       duracao_min, estado, briefing_snapshot, criado_por)
    values
      (p_tipo_id, p_responsavel_id, v_ambiente, v_cliente_id, p_data, p_hora_inicio,
       -- 🔴 CÓPIA CONGELADA do catálogo. Mudar o tipo amanhã não reescreve o
       -- compromisso de quem já agendou.
       v_tipo.duracao_min, 'agendado', v_snapshot, auth.uid())
    returning id into v_id;
  exception
    -- 🔴 OS DOIS CÓDIGOS, com mensagens DISTINTAS. Ver o cabeçalho.
    when unique_violation then          -- 23505
      -- 🔴 Distingue os DOIS índices únicos por CONSTRAINT_NAME, não por
      -- `sqlerrm like`. Medido em 22/09/2026 contra o banco, em transação
      -- revertida: GET STACKED DIAGNOSTICS devolve o nome EXATO da constraint
      -- ('sessao_aluno_tipo_viva' / 'sessao_slot_unico'), enquanto `sqlerrm`
      -- depende do TEXTO da mensagem do Postgres -- que muda com locale e
      -- versão. Os dois casaram no teste; este não pode deixar de casar.
      -- Errar aqui não levanta erro: entrega a FRASE ERRADA ao aluno
      -- ("alguém pegou o horário" quando ele é que já tem sessão marcada).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessao_aluno_tipo_viva' then
        raise exception 'Você já tem uma % marcada. Cancele a atual antes de marcar outra.', v_tipo.nome
          using errcode = '23505';
      else
        raise exception 'Alguém acabou de pegar esse horário. Escolha outro na lista.'
          using errcode = '23505';
      end if;
    when exclusion_violation then       -- 23P01
      raise exception 'Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.'
        using errcode = '23P01';
  end;

  -- §9-ter B1 — A COLUNA-RESULTADO, NA MESMA TRANSAÇÃO.
  -- 🔴 Só para o tipo da Reunião Preliminar, identificado por `etapa_id`, não
  -- por `tipo_id = 2` literal. `data_reuniao_preliminar` alimenta `agendados`
  -- no painel, a meta de 15 reuniões da Etapa 01, `admin_clientes_lista` e os
  -- 4 KPIs da …282.
  if v_tipo.etapa_id = 2 then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = p_data
     where id = v_cliente_id;
  end if;

  -- TRILHA. 🔴 Sem briefing, sem descricao_caso, sem observacoes: só
  -- identificadores e o delta (LGPD, comentário da coluna `detalhe` na …291).
  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (v_id, 'sessao_agendada', auth.uid(),
          jsonb_build_object(
            'tipo_id', p_tipo_id,
            'responsavel_id', p_responsavel_id,
            'cliente_id', v_cliente_id,
            'inicio_em', v_inicio,
            'duracao_min', v_tipo.duracao_min,
            'escreveu_data_reuniao_preliminar', (v_tipo.etapa_id = 2)));

  return jsonb_build_object(
    'agendamento_id', v_id,
    'estado', 'agendado',
    'inicio_em', v_inicio,
    'fim_em', v_fim,
    'duracao_min', v_tipo.duracao_min,
    'tipo_nome', v_tipo.nome);
end;
$function$;

comment on function gps.sessao_agendar(smallint, uuid, date, time) is
  'Agenda UMA sessao, atomicamente (PRD §7.1 passo 5). Sob `for update` no cliente, revalida elegibilidade (gps.sessao_pode_agendar) e a oferta (gps.sessao_horarios_livres), congela o briefing (§6.5) e grava. IMEDIATO, sem aceite (§9 D4: "pendente de aceite" e o modelo que falhou em 10/08). 🔴 §9-ter B1: quando o tipo e o da Reuniao Preliminar, grava etapa1_clientes.data_reuniao_preliminar NA MESMA TRANSACAO -- o tipo e identificado por sessao_tipos.etapa_id, NUNCA por tipo_id literal. 🔴 Trata os DOIS codigos com frases distintas: 23505 de sessao_aluno_tipo_viva ("voce ja tem uma marcada") x 23505 de sessao_slot_unico ("alguem pegou o horario") x 23P01 de sessao_sem_sobreposicao ("conflita com outra sessao"). A duracao e COPIA CONGELADA de gps.sessao_tipos -- nenhum valor de duracao escrito no corpo. LGPD: o detalhe da trilha leva so identificadores, nunca o briefing.';

revoke all on function gps.sessao_agendar(smallint, uuid, date, time) from public, anon;
grant execute on function gps.sessao_agendar(smallint, uuid, date, time) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) gps.sessao_cancelar
-- ═══════════════════════════════════════════════════════════════════════════
-- §9 D7: o aluno cancela até **24h antes**; a doutora (e o admin) cancelam a
-- qualquer momento, com motivo de 3..300 chars.
--
-- 🔴 O PRAZO COMPARA CONTRA `inicio_em`, NUNCA contra `data` isolada. O
-- servidor roda em UTC: comparar `data` mentiria o prazo das 21h à meia-noite.
-- Lição já paga neste projeto (`plantao_slots.inicio_em`, `hojeISO` do
-- Financeiro). `inicio_em` é coluna gerada exatamente para isto.
--
-- 🔴 B1 ESPELHADO — LIMPA `data_reuniao_preliminar` na mesma transação. Sem
-- isso o painel conta reunião desmarcada, **em silêncio**: o bug espelhado, e
-- pior, porque ninguém investiga um número que parece certo.
--
-- ⚠️ A limpeza é CONDICIONAL: só apaga se a coluna ainda guarda a data DESTA
-- sessão. Se o aluno marcou a reunião por fora (a coluna é editável na ficha)
-- ou se outra sessão posterior já a reescreveu, cancelar esta não pode apagar
-- o dado da outra — seria perda silenciosa, que é o que B1 quer evitar.
create or replace function gps.sessao_cancelar(
  p_agendamento_id uuid,
  p_motivo         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ambiente uuid := gps.aluno_atual();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_a        record;
  v_motivo   text;
  v_quem     text;
  v_horas    numeric;
  v_etapa_id smallint;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  -- 🔴 `for update`: sem o lock, dois cancelamentos simultâneos (aluno e
  -- doutora) passariam os dois pela checagem de estado e gravariam dois
  -- eventos para um cancelamento só.
  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.tipo_id,
         a.estado, a.data, a.inicio_em
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id
   for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — nada a cancelar.' using errcode = '22023';
  end if;

  -- QUEM ESTÁ CANCELANDO. A doutora é `responsavel_id = auth.uid()`, o mesmo
  -- recorte da policy de SELECT (§9-ter B2) — não `gps.eh_equipe()`, senão
  -- qualquer operador cancelaria sessão de qualquer doutora.
  -- 🔴 Cada ramo dentro de `coalesce(..., false)`. Nesta cadeia o `else` final
  -- já capturaria o NULL (um `elsif NULL` simplesmente não entra), então hoje
  -- ela falha FECHADA por sorte da estrutura. O coalesce está aqui porque a
  -- regra desta feature é "toda comparação de guarda é coalesced" — sem ela,
  -- reordenar os ramos ou transformar a cadeia num `if not (...)` reintroduz o
  -- falha-aberta em silêncio, que é exatamente o achado ALTO de 22/09.
  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  elsif coalesce(v_ambiente = v_a.aluno_id, false) then
    v_quem := 'aluno';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  if v_quem = 'aluno' then
    -- 🔴 O PRAZO, contra inicio_em. 24h exatas: a 23h59 do início NÃO cancela.
    v_horas := extract(epoch from (v_a.inicio_em - now())) / 3600.0;
    if v_horas < 24 then
      raise exception 'O prazo para cancelar terminou (é até 24 horas antes). Abra um chamado no Suporte para falar com a equipe.'
        using errcode = '22023';
    end if;
    -- Motivo do aluno é opcional; o CHECK da …291 exige 3..300 em QUALQUER
    -- cancelamento, então quando ele não escreve, gravamos a frase padrão.
    if v_motivo is null then
      v_motivo := 'Cancelado pelo aluno.';
    end if;
  else
    -- Doutora/admin cancelam a qualquer momento, mas o motivo é OBRIGATÓRIO
    -- (§9 D7): quem cancela em cima da hora deve à outra parte a explicação.
    if v_motivo is null or char_length(v_motivo) < 3 then
      raise exception 'Escreva o motivo do cancelamento (ao menos 3 caracteres).'
        using errcode = '22023';
    end if;
  end if;

  if char_length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  update gps.sessao_agendamentos
     set estado = 'cancelado',
         cancelado_em = now(),
         cancelado_por = auth.uid(),
         cancelado_motivo = v_motivo
   where id = p_agendamento_id;

  -- 🔴 B1 ESPELHADO, CONDICIONAL. Ver o cabeçalho: só limpa se a coluna ainda
  -- guarda a data DESTA sessão, e só para o tipo da Reunião Preliminar
  -- (identificado por etapa_id, nunca por tipo_id literal).
  -- ⚠️ `into v_etapa_id` (escalar), NÃO `into` um record: em plpgsql, ler um
  -- CAMPO de record que nunca foi atribuído levanta 55000 ("record is not
  -- assigned yet"), não devolve NULL. É o mesmo defeito que derrubou
  -- `admin_status_acesso` para ambiente sem login, corrigido na …213. Aqui o
  -- tipo sempre existe (FK not null), mas o cancelamento NÃO pode quebrar por
  -- causa de um catálogo mexido — variável escalar vira NULL e o `if` abaixo
  -- simplesmente não dispara.
  select t.etapa_id into v_etapa_id
    from gps.sessao_tipos t where t.id = v_a.tipo_id;

  -- 🔴 Compara com a etapa da REUNIÃO PRELIMINAR lida do catálogo do tipo,
  -- não com `tipo_id = 2`. A etapa é dado (seção 0); o `2` aqui é o id da
  -- Etapa 02 em `gps.etapas`, que é estrutura do programa e não do catálogo
  -- de sessões — as 6 etapas são fixas e numeradas desde o baseline.
  if v_etapa_id = 2 then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = null
     where id = v_a.cliente_id
       and data_reuniao_preliminar = v_a.data;
  end if;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_cancelada', auth.uid(),
          jsonb_build_object(
            'por', v_quem,
            'de', 'agendado',
            'para', 'cancelado',
            'motivo', v_motivo,
            'inicio_em', v_a.inicio_em,
            'horas_de_antecedencia', round(extract(epoch from (v_a.inicio_em - now())) / 3600.0, 2)));

  return jsonb_build_object(
    'agendamento_id', p_agendamento_id,
    'estado', 'cancelado',
    'por', v_quem);
end;
$function$;

comment on function gps.sessao_cancelar(uuid, text) is
  'Cancela uma sessao marcada. Aluno cancela ate 24h antes (§9 D7); doutora (responsavel_id = auth.uid(), o mesmo recorte da policy de §9-ter B2, NAO eh_equipe) e admin cancelam a qualquer momento com motivo 3..300. 🔴 O prazo compara contra inicio_em, NUNCA contra `data` isolada -- o servidor roda em UTC e `data` mentiria o prazo das 21h a meia-noite (licao ja paga neste projeto). 🔴 B1 ESPELHADO: LIMPA etapa1_clientes.data_reuniao_preliminar na MESMA transacao, senao o painel conta reuniao desmarcada em silencio. A limpeza e CONDICIONAL (`and data_reuniao_preliminar = v_a.data`): se a coluna ja foi reescrita por outra sessao ou preenchida a mao na ficha, cancelar esta nao pode apagar o dado da outra. `for update` no agendamento: sem ele, dois cancelamentos simultaneos gravariam dois eventos para um cancelamento so.';

revoke all on function gps.sessao_cancelar(uuid, text) from public, anon;
grant execute on function gps.sessao_cancelar(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) gps.sessao_marcar_falta — só a doutora/admin, só depois do horário
-- ═══════════════════════════════════════════════════════════════════════════
-- §9 D7: "`falta` é marcada pela doutora DEPOIS do horário".
--
-- 🔴 "Depois do horário" compara contra `inicio_em`, pela mesma razão do
-- cancelamento. E o ALUNO nunca marca: seria ele declarando a própria
-- ausência, o que esvaziaria o sentido do registro.
--
-- ⚠️ Marcar falta LIBERA o horário: o índice único e a constraint de exclusão
-- são parciais em ('agendado','realizado'). É o comportamento certo — o bloco
-- já passou, a doutora pode receber outra pessoa naquele horário no futuro.
create or replace function gps.sessao_marcar_falta(
  p_agendamento_id uuid,
  p_observacao     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_a     record;
  v_obs   text;
  v_quem  text;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.responsavel_id, a.estado, a.inicio_em, a.fim_em
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id
   for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- GUARDA: doutora DONA da sessão, ou admin. Nunca o aluno, nunca outra
  -- doutora, nunca operador — `responsavel_id = auth.uid()` é o mesmo recorte
  -- da policy de §9-ter B2.
  -- 🔴 Mesma regra da `sessao_cancelar`: todo ramo coalesced. Ver o comentário
  -- lá — o `else` salva esta cadeia hoje, o coalesce a mantém salva depois.
  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há falta a registrar.' using errcode = '22023';
  end if;

  -- 🔴 Só DEPOIS do horário. Contra inicio_em, nunca contra `data`.
  if v_a.inicio_em > now() then
    raise exception 'Esta sessão ainda não começou. A falta só pode ser registrada depois do horário.'
      using errcode = '22023';
  end if;

  v_obs := nullif(btrim(coalesce(p_observacao, '')), '');
  if v_obs is not null and char_length(v_obs) > 300 then
    raise exception 'A observação passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- ⚠️ NÃO grava cancelado_em/cancelado_motivo: o CHECK
  -- `chk_sessao_agend_so_cancelado_tem_carimbo` da …291 exige que só o estado
  -- 'cancelado' tenha carimbo. A observação da falta vive na TRILHA.
  update gps.sessao_agendamentos
     set estado = 'falta'
   where id = p_agendamento_id;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_falta', auth.uid(),
          jsonb_build_object(
            'por', v_quem,
            'de', 'agendado',
            'para', 'falta',
            'observacao', v_obs,
            'inicio_em', v_a.inicio_em));

  return jsonb_build_object(
    'agendamento_id', p_agendamento_id,
    'estado', 'falta',
    'por', v_quem);
end;
$function$;

comment on function gps.sessao_marcar_falta(uuid, text) is
  'Registra FALTA numa sessao (§9 D7). Guarda: doutora DONA (responsavel_id = auth.uid(), mesmo recorte de §9-ter B2) ou admin -- NUNCA o aluno (seria ele declarando a propria ausencia) e nunca outra doutora. 🔴 So DEPOIS do horario, comparado contra inicio_em e nunca contra `data` isolada (servidor em UTC). Nao grava cancelado_em/_motivo: o CHECK chk_sessao_agend_so_cancelado_tem_carimbo da …291 exige que so o estado cancelado tenha carimbo -- a observacao da falta vive na trilha. Marcar falta LIBERA o horario (as travas sao parciais em agendado/realizado), que e o certo: o bloco ja passou.';

revoke all on function gps.sessao_marcar_falta(uuid, text) from public, anon;
grant execute on function gps.sessao_marcar_falta(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) gps.sessao_briefing_ler — a ÚNICA porta para o briefing
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `briefing_snapshot` está FORA do grant de coluna de `authenticated`
-- (…291, seção 6). Um `select` direto daquela coluna devolve 42501 — para a
-- doutora e para o admin também. Esta RPC é a porta, e ela é SECURITY DEFINER
-- justamente por isso.
--
-- Recorte de §9-ter B2: admin vê todas; doutora vê SÓ onde
-- `responsavel_id = auth.uid()`; o ALUNO NÃO VÊ briefing (é o consolidado que
-- a EQUIPE montou sobre o cliente dele, não tela de aluno).
--
-- 🔴 Trilha OBRIGATÓRIA a cada abertura — LGPD, a trilha É a guarda em leitura
-- de dado pessoal. Mesma decisão de `gps.dossie_do_cliente` (…264) e de
-- `clientes_exportados` (…255).
--
-- 🔴 VOLATILE (o padrão), NÃO `stable`: esta função ESCREVE. `stable` promete
-- ao planner que a função não altera o banco e o Postgres recusa o INSERT em
-- execução ("INSERT is not allowed in a non-volatile function") — pego assim
-- em `dossie_do_cliente` antes de aplicar, em 15/09.
create or replace function gps.sessao_briefing_ler(p_agendamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_a     record;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.estado,
         a.inicio_em, a.briefing_snapshot
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- §9-ter B2. O aluno NÃO entra aqui, de propósito.
  -- 🔴 `coalesce(..., false)` OBRIGATÓRIO. Sem ele, `auth.uid()` NULL (sem
  -- JWT) faz `v_a.responsavel_id = auth.uid()` virar NULL, `false or NULL` é
  -- NULL, e `if not NULL then raise` **NÃO DISPARA** — a guarda falharia
  -- ABERTA e entregaria o briefing (dado pessoal de cliente de terceiro) a
  -- quem não tem sessão. É a mesma classe do achado ALTO do pentester em
  -- `sessao_pode_agendar` (22/09), varrida em todas as guardas desta feature.
  -- `v_admin` já nasce coalesced na declaração; o que faltava era o segundo
  -- termo da disjunção.
  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔴 TRILHA, sempre — inclusive quando o snapshot está vazio. `aluno_id` é o
  -- do ambiente DONO do cliente, não o de quem abriu.
  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('sessao_briefing_acessado', v_a.aluno_id, auth.uid(),
          'agendamento_id=' || p_agendamento_id::text);

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado', v_a.estado,
    'inicio_em', v_a.inicio_em,
    'cliente_id', v_a.cliente_id,
    'briefing', v_a.briefing_snapshot);
end;
$function$;

comment on function gps.sessao_briefing_ler(uuid) is
  'A UNICA porta para o briefing_snapshot -- a coluna esta FORA do grant de coluna de authenticated (…291 secao 6), entao select direto devolve 42501 ate para a doutora e o admin. Recorte de §9-ter B2: admin ve todas, doutora ve SO onde responsavel_id = auth.uid(), o ALUNO NAO VE (o briefing e o consolidado que a EQUIPE montou, com dado pessoal de cliente de terceiro). 🔴 Cada chamada grava 1 linha em gps.acessos_log (sessao_briefing_acessado): LGPD, a trilha E a guarda em leitura de dado pessoal, mesma decisao de dossie_do_cliente (…264) e clientes_exportados (…255). VOLATILE de proposito -- `stable` faria o Postgres recusar o INSERT da trilha em execucao.';

revoke all on function gps.sessao_briefing_ler(uuid) from public, anon;
grant execute on function gps.sessao_briefing_ler(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA DE GRANT (rodar depois do apply; leitura pura)
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 Neste projeto TODA função nova nasce com `execute` para `authenticated`
-- (ALTER DEFAULT PRIVILEGES do schema `gps`) — e `revoke from anon` NÃO pega
-- quando a permissão vem de PUBLIC, por isso todo revoke acima nomeia
-- `public` explicitamente. `sessao_briefing_montar` é peça INTERNA e tem
-- revoke também de `authenticated`.
--
--   select p.proname, pg_catalog.array_to_string(p.proacl, E'\n') as acl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname like 'sessao_%'
--    order by p.proname;
--
-- Esperado: nenhuma linha com `anon=X`; `sessao_briefing_montar` SEM
-- `authenticated=X`; as outras 5 COM `authenticated=X`.

-- ═══════════════════════════════════════════════════════════════════════════
-- 🧪 ROTEIRO DE PROVA — rodar em `begin … rollback`
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 `explain analyze` em INSERT/UPDATE/DELETE **EXECUTA o comando**. Todo o
-- roteiro abaixo escreve de verdade: rodar SEMPRE dentro de transação
-- revertida. Nunca cru em produção.
--
-- ⚠️ Eu NÃO rodei nada disto: não há `psql` nem Docker nesta máquina
-- (`which psql docker` → 127) e eu não busco credencial de produção. Tudo
-- abaixo é conferência estática virada em roteiro para quem TEM o acesso.
--
-- ── P0. Pré-condições (leitura pura, ANTES de tudo) ───────────────────────
--   -- (a) o CHECK do acessos_log realmente tinha os 31 valores que copiei?
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.acessos_log'::regclass and conname = 'acessos_log_acao_check';
--   -- esperado: a lista agora com 32, incluindo sessao_briefing_acessado, e
--   -- NENHUM valor a menos do que havia antes desta migração.
--
--   -- (b) a etapa 2 existe? (a seção 0 referencia gps.etapas)
--   select id, nome, liberada from gps.etapas order by id;
--
--   -- (c) o catálogo, com a etapa recém-atribuída:
--   select id, nome, duracao_min, intervalo_min, etapa_id from gps.sessao_tipos order by id;
--   -- esperado: 1 Entrevista Prévia etapa_id=1 · 2 Reunião Preliminar etapa_id=2
--
--   -- (d) sobrecarga: nenhuma destas funções pode ter 2 assinaturas vivas.
--   select p.proname, pg_get_function_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='gps' and p.proname like 'sessao\_%' order by 1,2;
--   -- esperado: 1 linha por nome. `create or replace` com assinatura diferente
--   -- CRIA SOBRECARGA em vez de substituir, e o chamador antigo fica na velha.
--
-- ── P1. A grade sai, e a duração vem do catálogo ──────────────────────────
--   begin;
--     select * from gps.sessao_horarios_livres(1::smallint) limit 10;
--     -- esperado: 2 blocos por quarta e por sexta (09:30 e 14:00), 8 semanas.
--     -- duracao_min tem de vir 150 SEM que 150 exista neste arquivo.
--
--     -- A PROVA de que a duração não está escrita em lugar nenhum: mude o
--     -- catálogo e a grade tem de mudar sozinha.
--     update gps.sessao_tipos set duracao_min = 60 where id = 1;
--     select data, hora_inicio, duracao_min
--       from gps.sessao_horarios_livres(1::smallint) limit 10;
--     -- esperado: AGORA cabem mais blocos por faixa (09:30, 10:40, ...) e
--     -- duracao_min = 60. Se o número não mudar, há duração escrita em código.
--   rollback;
--
-- ── P1-bis. 🔴 D5 — o NOME da responsável chega à tela ────────────────────
--   begin;
--     -- (a) a 7ª coluna vem preenchida, e com o nome CERTO:
--     select distinct responsavel_id, responsavel_nome
--       from gps.sessao_horarios_livres(1::smallint);
--     -- esperado: 'Cristiane' (não uuid, não nulo, não "equipe jurídica").
--
--     -- (b) o mapa das responsáveis:
--     select * from gps.sessao_responsaveis();
--     -- esperado: 1 linha hoje (Cristiane); 2 quando a Elaine entrar (D8).
--     -- 🔴 Conferir que o nome casa com o e-mail @advmais.com CERTO — casar
--     -- por primeiro nome pegaria aluna (dezenas de Elaine/Cristiane):
--     select p.id, p.nome, u.email
--       from public.perfis p join auth.users u on u.id = p.id
--      where lower(btrim(u.email)) in ('cristiane@advmais.com','elaine@advmais.com');
--
--     -- (c) 🔴 LGPD: a saída NÃO pode ter e-mail, cargo nem status.
--     --     Conferir as colunas de gps.sessao_responsaveis: só 2.
--
--     -- (d) 🔴 COM JWT DE ALUNO: as duas funções respondem (SECURITY DEFINER),
--     --     mas o `select` direto em public.perfis continua BLOQUEADO:
--     --       select count(*) from public.perfis;  -- esperado: 0 linhas
--     --     Se o aluno passar a ler perfis direto, a policy gps_block_aluno
--     --     foi afrouxada por outra migração — investigar antes de seguir.
--
--     -- (e) perfil ausente NÃO some com o horário (é left join):
--     --     apagar/ocultar o perfil da doutora e conferir que os 16 blocos
--     --     continuam saindo, com responsavel_nome NULL.
--   rollback;
--
-- ── P2. 🔴 23505 × 23P01 — as três travas, com frases DISTINTAS ───────────
--   begin;
--     -- monte uma sessão base (como a prova 6 da …291 faz) e tente:
--     --   (a) o MESMO inicio_em, outro aluno  → 23505 sessao_slot_unico
--     --       frase: "Alguém acabou de pegar esse horário."
--     --   (b) o MESMO aluno + MESMO tipo, outro horário
--     --                                        → 23505 sessao_aluno_tipo_viva
--     --       frase: "Você já tem uma <tipo> marcada."
--     --   (c) 14:00 gravado (vai até 16:30) e 15:00 no mesmo dia
--     --                                        → 23P01 sessao_sem_sobreposicao
--     --       frase: "conflita com outra sessão da mesma profissional"
--     -- 🔴 As três frases têm de ser DIFERENTES. Se (a) e (b) saírem iguais,
--     -- o aluno tentará de novo para sempre no caso (b), onde tentar de novo
--     -- nunca resolve.
--     -- ⚠️ (a) e (b) exigem inserir a 1ª linha por SQL direto (a RPC recusaria
--     -- antes, na revalidação da oferta) — é o caminho de provar que a TRAVA
--     -- existe, não só a checagem lógica.
--   rollback;
--
-- ── P3. 🔴 Cancelamento a 23h59 do início — a borda das 24h ───────────────
--   begin;
--     -- Grave uma sessão com inicio_em = now() + 23 hours 59 minutes e chame
--     -- gps.sessao_cancelar COM JWT DE ALUNO daquele ambiente.
--     -- esperado: 22023, "O prazo para cancelar terminou (é até 24 horas antes)."
--     -- Depois, now() + 24 hours 1 minute → cancela normalmente.
--     -- 🔴 Rodar isto com o relógio do servidor em UTC e a sessão em
--     -- America/Sao_Paulo: é exatamente a janela das 21h à meia-noite em que
--     -- comparar `data` isolada mentiria. Se a borda se mover conforme o
--     -- TimeZone da sessão, alguém trocou inicio_em por data em algum lugar.
--   rollback;
--
-- ── P4. 🔴 B1 e o espelho — a coluna-resultado ────────────────────────────
--   begin;
--     -- (a) agende tipo 2 (Reunião Preliminar) e confira:
--     select data_reuniao_preliminar from gps.etapa1_clientes where id = '<cliente>';
--     -- esperado: = a data agendada, na MESMA transação.
--
--     -- (b) cancele e confira de novo:
--     -- esperado: null.
--
--     -- (c) 🔴 A GUARDA CONDICIONAL: agende, depois escreva à mão uma data
--     -- DIFERENTE na coluna, depois cancele.
--     -- esperado: a data escrita à mão CONTINUA LÁ (o cancelamento só limpa
--     -- quando a coluna ainda guarda a data daquela sessão). Se ela sumir, o
--     -- cancelamento está apagando dado de outra origem.
--
--     -- (d) agende tipo 1 (Entrevista Prévia) e confira que a coluna NÃO foi
--     -- tocada — B1 é só da Reunião Preliminar.
--   rollback;
--
-- ── P5. 🔴 Aluno de OUTRO ambiente ────────────────────────────────────────
--   begin;
--     -- Com JWT de um aluno B, tente cancelar a sessão do aluno A:
--     --   esperado: 42501 "Sem permissão."
--     -- Com JWT do aluno B, peça a grade: gps.sessao_horarios_livres(1)
--     --   esperado: lista vazia se ele não for elegível (NÃO erro).
--     -- Com JWT do aluno B, leia o briefing da sessão de A:
--     --   esperado: 42501 (aluno nunca lê briefing, nem o próprio).
--     -- Com JWT do aluno A (dono), leia o briefing da PRÓPRIA sessão:
--     --   esperado: 42501 também — §9-ter B2, o aluno não vê briefing.
--   rollback;
--
-- ── P6. 🔴 Doutora cancelando sessão que NÃO é dela ───────────────────────
--   begin;
--     -- Com JWT da Dra. Elaine, cancele uma sessão cujo responsavel_id é a
--     -- Dra. Cristiane:
--     --   esperado: 42501 "Sem permissão."
--     --   ⚠️ Se a Elaine for `dev` em public.perfis, gp_is_admin() é TRUE e ela
--     --   passa como admin — o que é correto, mas então a prova precisa de uma
--     --   doutora NÃO-admin para valer. Medir gp_is_admin() das duas ANTES:
--     select u.email, public.gp_is_admin() from auth.users u
--      where lower(btrim(u.email)) in ('cristiane@advmais.com','elaine@advmais.com');
--     -- (rodar com o JWT de cada uma; a função lê auth.uid())
--     -- Mesmo teste para gps.sessao_marcar_falta e gps.sessao_briefing_ler.
--   rollback;
--
-- ── P7. Falta ─────────────────────────────────────────────────────────────
--   begin;
--     -- (a) marcar falta ANTES do horário → 22023 "ainda não começou".
--     -- (b) depois do horário, pela doutora dona → estado 'falta'.
--     -- (c) o aluno tentando marcar falta → 42501.
--     -- (d) depois de (b), o MESMO horário volta a aparecer em
--     --     sessao_horarios_livres (as travas são parciais) — e o CHECK
--     --     chk_sessao_agend_so_cancelado_tem_carimbo não reclamou, ou seja,
--     --     nada de cancelado_* foi gravado.
--   rollback;
--
-- ── P8. O interruptor da elegibilidade (§9-ter B3) ────────────────────────
--   begin;
--     select count(*) from gps.etapa1_clientes where acompanhado_equipe;  -- 34 em 22/09
--     update gps.config set valor = 'true' where chave = 'sessoes_exige_confirmacao';
--     -- esperado: gps.sessao_pode_agendar passa a devolver NULL para todos
--     -- (acompanhamento_confirmado_em nunca foi preenchida), e a grade do
--     -- aluno fica VAZIA. É a prova de que o interruptor é real — e de por que
--     -- ele nasce false.
--     select count(*) from gps.etapa1_clientes where acompanhamento_confirmado_em is not null;  -- 0
--   rollback;
--
-- ── P9. 🔴 explain (analyze, buffers) da grade — O QUE FALTA MEDIR ────────
--   begin;
--     explain (analyze, buffers)
--       select * from gps.sessao_horarios_livres(1::smallint, null, current_date, current_date + 56);
--     -- 🔴 Esperado: `Function Scan`, e o custo do CORPO inteiro — não do
--     -- select interno isolado. Lição da …282: medir a RPC, não o corpo dela
--     -- (2,7 ms reais × 0,66 ms do select solto).
--     -- 🔴 NÃO prever o tipo de scan de cabeça: já errei isso neste banco
--     -- (previ Index Scan, era Seq Scan em tabela de 4 linhas).
--     -- Se aparecer Seq Scan, está CERTO: §9b.1 mediu Seq Scan até 4.160
--     -- linhas no mesmo predicado, e índice aqui custaria escrita em todo
--     -- agendamento sem mudar o plano.
--     -- Só criar índice se este plano provar o contrário — com o EXPLAIN
--     -- colado no arquivo.
--   rollback;
--
-- ── P10. Nenhuma escrita fora do previsto ─────────────────────────────────
--   begin;
--     -- Antes: guarde as contagens de gps.sessao_agendamentos,
--     -- gps.sessao_eventos, gps.acessos_log, gps.etapa1_clientes,
--     -- gps.aluno_eventos.
--     -- Agende 1, cancele 1, marque 1 falta, leia 1 briefing.
--     -- esperado: +1 agendamento, +3 sessao_eventos, +1 acessos_log,
--     --           0 em aluno_eventos (esta fatia NÃO grava no Diário — nenhum
--     --           tipo novo foi acrescentado ao aluno_eventos_tipo_check, de
--     --           propósito: inventar tipo obrigaria reescrever AQUELE CHECK
--     --           também, e o catálogo dele tem 36 valores).
--     --           etapa1_clientes: só data_reuniao_preliminar muda.
--   rollback;
