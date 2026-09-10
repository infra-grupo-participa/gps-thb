-- 20260910000216_gps_diagnostico_chamados_respondidos.sql
--
-- A CENTRAL ACUSAVA A EQUIPE POR CHAMADO QUE ESPERA O ALUNO
--
-- `gps.admin_diagnostico_ambiente` conta os chamados NAO-FECHADOS do ambiente
-- (`status <> 'fechado'`) e escrevia, para qualquer numero maior que zero,
-- "Chamado aberto esperando resposta da equipe.".
--
-- `gps.chamados.status` tem tres valores (migracao ...110):
--   * 'aberto'     -- a ultima mensagem e do ALUNO: a bola e da equipe;
--   * 'respondido' -- a equipe ja respondeu: a bola e do ALUNO;
--   * 'fechado'.
-- Ou seja: um ambiente cujo unico chamado ja foi respondido aparecia em ambar
-- na Central com uma frase que culpa a equipe por uma resposta que ela ja deu.
-- Aviso que mente treina o time a ignorar aviso (a mesma licao de PL6).
--
-- O QUE MUDA
--   * a contagem passa a ser DOIS numeros na MESMA ida ao banco
--     (`count(*) filter (...)`), sem consulta nova;
--   * `valor` diz a separacao ("3 (1 aguardando a equipe, 2 aguardando o aluno)");
--   * `detalhe` nomeia quem esta com a bola;
--   * `ok` vira false SO quando ha chamado 'aberto'. Com apenas 'respondido' o
--     `ok` e null -- informacao sem juizo, que e o contrato do campo
--     (ver o comment da funcao e `src/components/admin/central/catalogo.ts`).
--
-- FORMA: `create or replace` a partir do CORPO VIGENTE (migracao
-- 20260909000158, unica definicao da funcao ate aqui -- a ...213 so a cita em
-- comentario). O corpo abaixo e aquele, com as tres mudancas acima e nada
-- mais: assinatura, `stable`, `security definer`, `search_path = ''`,
-- `TimeZone`, grants e revoke identicos.
--
-- SEM BACKFILL, SEM DDL: funcao de LEITURA. Nenhuma tabela e tocada.
--
-- REVERSAO: reaplicar o corpo da migracao 20260909000158.

create or replace function gps.admin_diagnostico_ambiente(p_aluno_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set "TimeZone" = 'America/Sao_Paulo'
as $function$
declare
  v_aluno record;
  v_acesso jsonb; v_direito jsonb;
  v_membros jsonb; v_qtd_membros int; v_sem_pessoa int; v_titulares int;
  v_sem_login int; v_sem_senha int;
  v_contratos int; v_candidatos jsonb; v_qtd_candidatos int;
  v_clientes int; v_com_dados int; v_favorito boolean;
  -- ...216: os chamados VIVOS separados por quem está com a bola.
  v_chamados int; v_chamados_aberto int; v_chamados_respondido int;
  v_pendencias int; v_pasta text;
  v_etapas jsonb; v_overrides int; v_progresso jsonb; v_concluidas int;
  v_solic jsonb; v_ultimo_acesso text; v_email_bate boolean; v_tem_login boolean;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  select a.id, a.nome, a.email, a.documento into v_aluno
    from public.thb_alunos a where a.id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;

  v_acesso  := gps.admin_status_acesso(p_aluno_id);
  v_direito := gps.admin_direito_ao_acesso(p_aluno_id);
  v_tem_login    := coalesce((v_acesso->>'tem_login')::boolean, false);
  v_email_bate   := coalesce((v_acesso->>'email_bate')::boolean, false);
  v_ultimo_acesso := v_acesso->>'ultimo_acesso';

  -- ── membros, com a PESSOA de cada um (a coluna da migração ...154) ──────
  select coalesce(jsonb_agg(jsonb_build_object(
           'membro_id',        m.id,
           'papel',            m.papel,
           'user_id',          m.user_id,
           'email_login',      u.email,
           'tem_login',        m.user_id is not null,
           'tem_senha',        coalesce(u.encrypted_password, '') <> '',
           'email_confirmado', u.email_confirmed_at is not null,
           'ultimo_acesso',    u.last_sign_in_at,
           'pessoa_aluno_id',  m.pessoa_aluno_id,
           'pessoa_nome',      p.nome,
           'pessoa_email',     p.email,
           -- O e-mail do LOGIN bate com o e-mail do CADASTRO desta pessoa?
           -- null quando falta um dos dois: "não dá para saber" não é "não bate".
           'email_bate',       case
                                 when u.email is null or p.email is null then null
                                 else lower(btrim(u.email)) = lower(btrim(p.email))
                               end
         ) order by (m.papel = 'titular') desc, m.criado_em asc), '[]'::jsonb),
         count(*),
         count(*) filter (where m.pessoa_aluno_id is null),
         count(*) filter (where m.papel = 'titular'),
         count(*) filter (where m.user_id is null),
         count(*) filter (where m.user_id is not null
                            and coalesce(u.encrypted_password, '') = '')
    into v_membros, v_qtd_membros, v_sem_pessoa, v_titulares, v_sem_login, v_sem_senha
    from gps.membros m
    left join auth.users u        on u.id = m.user_id
    left join public.thb_alunos p on p.id = m.pessoa_aluno_id
   where m.aluno_id = p_aluno_id;

  -- ── financeiro ─────────────────────────────────────────────────────────
  select count(*) into v_contratos from cs.contatos_hm h where h.aluno_id = p_aluno_id;

  -- Candidatos só quando NÃO há contrato: com contrato vinculado a pergunta
  -- não existe, e varrer os órfãos do sip à toa é custo por abertura de tela.
  if v_contratos = 0 then
    v_candidatos := (gps.admin_financeiro_candidatos(p_aluno_id))->'candidatos';
  else
    v_candidatos := '[]'::jsonb;
  end if;
  v_qtd_candidatos := jsonb_array_length(v_candidatos);

  -- ── clientes (a mesma definição de "com dados" da tarefa 1.1) ──────────
  select count(*),
         count(*) filter (where coalesce(btrim(c.nome), '') <> ''
                            and coalesce(btrim(c.telefone), '') <> ''
                            and c.nivel_relacionamento is not null),
         coalesce(bool_or(c.acompanhado_equipe), false)
    into v_clientes, v_com_dados, v_favorito
    from gps.etapa1_clientes c where c.aluno_id = p_aluno_id;

  -- 'aberto' = a última mensagem é do ALUNO (espera a equipe).
  -- 'respondido' = a equipe já respondeu (espera o aluno).
  -- Os dois são chamado VIVO; a MESMA ida ao banco devolve os dois números.
  select count(*) filter (where ch.status = 'aberto'),
         count(*) filter (where ch.status = 'respondido')
    into v_chamados_aberto, v_chamados_respondido
    from gps.chamados ch where ch.aluno_id = p_aluno_id and ch.status <> 'fechado';
  v_chamados := v_chamados_aberto + v_chamados_respondido;

  select count(*) into v_pendencias
    from gps.aluno_notas n
   where n.aluno_id = p_aluno_id and n.tipo = 'pendencia' and n.resolvido_em is null;

  select amb.pasta_drive_url into v_pasta
    from gps.ambientes amb where amb.aluno_id = p_aluno_id;

  -- ── etapas: global x override, já resolvidas ───────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object(
           'etapa',    e.id,
           'nome',     e.nome,
           'liberada', coalesce(o.liberada, e.liberada),
           'global',   e.liberada,
           'origem',   case when o.liberada is null then 'global'
                            when o.liberada       then 'liberada_para_este_aluno'
                            else                       'travada_para_este_aluno' end,
           'motivo',   o.motivo,
           'em',       o.em) order by e.ordem), '[]'::jsonb),
         count(*) filter (where o.liberada is not null)
    into v_etapas, v_overrides
    from gps.etapas e
    left join gps.etapa_liberacao_aluno o
           on o.etapa = e.id and o.aluno_id = p_aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object('etapa', t.etapa, 'concluidas', t.n)
                            order by t.etapa), '[]'::jsonb),
         coalesce(sum(t.n), 0)
    into v_progresso, v_concluidas
    from (select p.etapa, count(*) filter (where p.concluida) as n
            from gps.progresso p where p.aluno_id = p_aluno_id
           group by p.etapa) t;

  -- ── a solicitação pendente NOMEADA (admin_status_acesso só diz sim/não) ─
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'email', s.email,
           'telefone', s.telefone, 'criado_em', s.criado_em)), '[]'::jsonb)
    into v_solic
    from gps.solicitacoes_acesso s
   where s.status = 'pendente'
     and (s.aluno_id = p_aluno_id
          or (coalesce(btrim(v_aluno.email), '') <> ''
              and lower(btrim(coalesce(s.email, ''))) = lower(btrim(v_aluno.email)))
          or s.user_id in (select m.user_id from gps.membros m
                            where m.aluno_id = p_aluno_id and m.user_id is not null));

  return jsonb_build_object(
    'aluno_id',       p_aluno_id,
    'nome',           v_aluno.nome,
    'email_cadastro', v_aluno.email,
    'gerado_em',      now(),
    'acesso',         v_acesso,
    'direito',        v_direito,
    'membros',        v_membros,
    'etapas',         v_etapas,
    'progresso',      v_progresso,
    'candidatos_financeiro',  v_candidatos,
    'solicitacoes_pendentes', v_solic,
    'verificacoes', jsonb_build_array(
      jsonb_build_object('chave', 'login', 'ok', v_tem_login,
        'valor', v_acesso->>'email_login',
        'detalhe', case when v_tem_login then null
                        else 'Ninguém neste ambiente tem login para entrar no portal.' end),
      jsonb_build_object('chave', 'senha',
        'ok', case when not v_tem_login then null
                   else coalesce((v_acesso->>'tem_senha')::boolean, false) end,
        'valor', null,
        'detalhe', case when v_sem_senha > 0
                        then v_sem_senha::text || ' membro(s) com login e sem senha definida.'
                        else null end),
      jsonb_build_object('chave', 'email_confirmado',
        'ok', case when not v_tem_login then null
                   else coalesce((v_acesso->>'email_confirmado')::boolean, false) end,
        'valor', null, 'detalhe', null),
      jsonb_build_object('chave', 'email_bate',
        'ok', case when not v_tem_login then null else v_email_bate end,
        'valor', coalesce(v_acesso->>'email_login', '(sem login)')
                 || ' / ' || coalesce(v_aluno.email, '(cadastro sem e-mail)'),
        'detalhe', case when v_tem_login and not v_email_bate
                        then 'O e-mail do cadastro não é o mesmo do login. Alinhe o CADASTRO ao LOGIN — o login é o que a pessoa digita e vale nos outros portais do grupo.'
                        else null end),
      jsonb_build_object('chave', 'vinculo_programa',
        'ok', v_qtd_membros > 0, 'valor', v_qtd_membros::text || ' membro(s)',
        'detalhe', case when v_qtd_membros = 0
                        then 'Este cadastro não tem ambiente no programa.' else null end),
      jsonb_build_object('chave', 'titular', 'ok', v_titulares > 0, 'valor', null,
        'detalhe', case when v_titulares = 0
                        then 'Ambiente sem titular: ninguém lê o Financeiro e não dá para adicionar sócio.'
                        else null end),
      jsonb_build_object('chave', 'membros_com_pessoa', 'ok', v_sem_pessoa = 0,
        'valor', (v_qtd_membros - v_sem_pessoa)::text || ' de ' || v_qtd_membros::text,
        'detalhe', case when v_sem_pessoa > 0
                        then 'Membro sem cadastro vinculado aparece sem nome e sem telefone nas telas da equipe.'
                        else null end),
      jsonb_build_object('chave', 'membros_com_login', 'ok', v_sem_login = 0,
        'valor', (v_qtd_membros - v_sem_login)::text || ' de ' || v_qtd_membros::text,
        'detalhe', null),
      jsonb_build_object('chave', 'ultimo_acesso', 'ok', null,
        'valor', v_ultimo_acesso,
        'detalhe', case when v_ultimo_acesso is null
                        then 'Nunca entrou no portal.' else null end),
      jsonb_build_object('chave', 'solicitacao_pendente',
        'ok', jsonb_array_length(v_solic) = 0,
        'valor', jsonb_array_length(v_solic)::text,
        'detalhe', case when jsonb_array_length(v_solic) > 0
                        then 'Há pedido de acesso esperando decisão na fila de /admin.'
                        else null end),
      jsonb_build_object('chave', 'direito_ao_acesso',
        'ok', coalesce((v_direito->>'tem_direito')::boolean, false),
        'valor', v_direito->>'motivo', 'detalhe', null),
      jsonb_build_object('chave', 'financeiro_contrato', 'ok', v_contratos > 0,
        'valor', v_contratos::text || ' contrato(s)',
        'detalhe', case
                     when v_contratos > 0 then null
                     when v_qtd_candidatos > 0
                       then 'Sem registro em cs.contatos_hm, mas há ' || v_qtd_candidatos::text
                            || ' contrato(s) órfão(s) que casam por e-mail ou CPF/CNPJ.'
                     else 'Sem registro em cs.contatos_hm e sem candidato que case por e-mail ou CPF/CNPJ.'
                   end),
      jsonb_build_object('chave', 'financeiro_candidatos', 'ok', null,
        'valor', v_qtd_candidatos::text, 'detalhe', null),
      jsonb_build_object('chave', 'clientes', 'ok', v_com_dados >= 30,
        'valor', v_com_dados::text || ' com dados de ' || v_clientes::text || ' listados (meta 30)',
        'detalhe', case when v_com_dados < 30
                        then 'A tarefa 1.1 cobra 30 clientes com nome, telefone e nível de relacionamento.'
                        else null end),
      jsonb_build_object('chave', 'cliente_favorito', 'ok', v_favorito, 'valor', null,
        'detalhe', case when v_favorito then null
                        else 'Sem cliente acompanhado pela equipe, os passos 4 a 8 da Etapa 01 ficam travados.'
                   end),
      -- ok = null de propósito: o catálogo de tarefas vive no TypeScript e
      -- quem decide "qual é a próxima" é proximoPasso(). Aqui vai o fato
      -- (quantas caíram por etapa), não um juízo que o banco não pode ter.
      jsonb_build_object('chave', 'tarefa_atual', 'ok', null,
        'valor', v_concluidas::text || ' tarefa(s) concluída(s)',
        'detalhe', 'A próxima tarefa é calculada por proximoPasso() no aplicativo — o catálogo de tarefas não está no banco.'),
      jsonb_build_object('chave', 'etapas', 'ok', null,
        'valor', v_overrides::text || ' etapa(s) com regra própria para este aluno',
        'detalhe', null),
      -- ok: false SÓ quando a equipe está devendo resposta. Chamado
      -- 'respondido' é informação (ok = null): a bola está com o aluno e não
      -- há nada para a equipe fazer — acusá-la ali era o defeito relatado.
      jsonb_build_object('chave', 'chamados_abertos',
        'ok', case when v_chamados_aberto > 0 then false
                   when v_chamados > 0        then null
                   else                            true end,
        'valor', case when v_chamados = 0 then '0'
                      else v_chamados::text
                           || ' (' || v_chamados_aberto::text || ' aguardando a equipe, '
                           || v_chamados_respondido::text || ' aguardando o aluno)' end,
        'detalhe', case
                     when v_chamados_aberto > 0 and v_chamados_respondido > 0
                       then v_chamados_aberto::text || ' chamado(s) aguardando resposta da equipe e '
                            || v_chamados_respondido::text || ' já respondido(s), aguardando o aluno.'
                     when v_chamados_aberto > 0
                       then 'Chamado aguardando resposta da equipe.'
                     when v_chamados_respondido > 0
                       then 'A equipe já respondeu — o chamado aguarda o aluno.'
                     else null end),
      jsonb_build_object('chave', 'pendencias_diario', 'ok', v_pendencias = 0,
        'valor', v_pendencias::text,
        'detalhe', case when v_pendencias > 0
                        then 'Pendência anotada pela equipe e ainda sem baixa.' else null end),
      jsonb_build_object('chave', 'pasta_drive', 'ok', v_pasta is not null,
        'valor', v_pasta,
        'detalhe', case when v_pasta is null
                        then 'Sem link da pasta do Drive: a aba Pasta abre vazia para o aluno.'
                        else null end)
    )
  );
end $function$;

comment on function gps.admin_diagnostico_ambiente(uuid) is
  'Diagnostico do ambiente para a Central de resolucao, num jsonb so. `verificacoes` e um array de { chave, ok, valor, detalhe }: ok=true verde, ok=false vermelho, ok=null informacao (sem juizo). REUSA gps.admin_status_acesso e gps.admin_direito_ao_acesso em vez de copiar predicado, e gps.admin_financeiro_candidatos para o casamento de contrato (so quando o ambiente nao tem contrato -- com contrato a pergunta nao existe e varrer os orfaos do sip seria custo por abertura de tela). NAO chama gps.admin_painel_atendimento (aquela e da base inteira). NAO calcula "tarefa atual": o catalogo de tarefas vive no TypeScript e proximoPasso() e a regra unica; aqui vai o numero de concluidas com ok=null. A verificacao chamados_abertos separa aberto (aguardando a equipe) de respondido (aguardando o aluno) no valor/detalhe e so marca ok=false quando a equipe esta devendo resposta. SO LEITURA (stable), SECURITY DEFINER porque le auth.users e cs.*, com gp_is_admin() na primeira linha (sem JWT falha fechado com 42501). Uma abertura de tela = ~10 consultas, todas por indice existente e por UM aluno: nao cresce com a base.';

revoke execute on function gps.admin_diagnostico_ambiente(uuid) from public, anon;
grant  execute on function gps.admin_diagnostico_ambiente(uuid) to authenticated;
