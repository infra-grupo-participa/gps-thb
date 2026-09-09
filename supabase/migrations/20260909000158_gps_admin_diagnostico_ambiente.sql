-- Central de resolução — o diagnóstico do ambiente, num JSON só.
--
-- POR QUE EXISTE
--   As cinco leituras que respondem "por que este aluno não anda" estão
--   espalhadas por três telas: gps.admin_status_acesso (acesso),
--   gps.admin_direito_ao_acesso (pagamento), gps.financeiro_do_aluno
--   (contrato), a aba Clientes e o Diário. O admin junta na cabeça. Esta função
--   junta no servidor, em UMA ida ao banco por abertura de tela.
--
-- REUSA, NÃO COPIA
--   Chama `gps.admin_status_acesso` e `gps.admin_direito_ao_acesso` em vez de
--   repetir os predicados delas. Duas cópias da mesma pergunta viram duas
--   verdades no dia em que uma mudar.
--   NÃO chama `gps.admin_painel_atendimento`: aquela varre a base inteira para
--   os cards de /admin; aqui é UM aluno.
--
-- 🔑 O FORMATO: `verificacoes` é um array de { chave, ok, valor, detalhe }.
--   `ok = true` verde, `ok = false` vermelho, `ok = null` INFORMAÇÃO (não tem
--   juízo — "último acesso" não é bom nem ruim). A tela não decide cor por
--   heurística em cima de texto; a cor vem do servidor, com a mesma regra para
--   todo mundo.
--
-- 🔴 NÃO CALCULA "TAREFA ATUAL", e isso é decisão, não lacuna.
--   O catálogo de tarefas vive em TypeScript (src/lib/etapa1.ts … etapa6.ts) e
--   `proximoPasso()` (src/lib/etapas.ts) é a regra única — inclusive as travas
--   `exigeFavorito` / `exigeTarefa`. O banco não sabe quantas tarefas uma etapa
--   tem; reimplementar aqui seria a segunda fonte de verdade do checklist, e a
--   primeira divergência apareceria como "a Central diz uma coisa e a etapa
--   diz outra". A verificação `tarefa_atual` sai com ok = null e o número de
--   tarefas concluídas por etapa; quem monta a frase é a página, que já chama
--   `proximoPasso` com o dado que carrega.
--
-- SEGURANÇA
--   SECURITY DEFINER porque lê `auth.users` e `cs.*`, onde `authenticated` não
--   tem (e não pode ganhar) grant. `public.gp_is_admin()` na PRIMEIRA linha:
--   sem JWT, `auth.uid()` é null, `gp_is_admin()` é false e a função falha
--   FECHADO com 42501 — antes de tocar em qualquer tabela.
--   A mensagem para "cadastro inexistente" é a mesma de sempre (P0002), e a
--   função não distingue "ambiente alheio" de "ambiente que não existe": quem
--   chega aqui é admin, e admin vê a base inteira por definição do papel.
--   `stable`: o próprio Postgres recusa escrita se alguém acrescentar uma.
--
-- O QUE NÃO FAZ
--   * não escreve NADA (nem log — diagnóstico não é ação);
--   * não devolve senha, hash, token nem documento completo (o financeiro traz
--     4 dígitos, via gps.financeiro_candidatos_do_aluno);
--   * não lista contrato do sip fora do casamento e-mail/documento;
--   * não chama gps.admin_painel_atendimento.
--
-- REVERSÃO: drop function if exists gps.admin_diagnostico_ambiente(uuid);

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
  v_chamados int; v_pendencias int; v_pasta text;
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

  select count(*) into v_chamados
    from gps.chamados ch where ch.aluno_id = p_aluno_id and ch.status <> 'fechado';

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
      jsonb_build_object('chave', 'chamados_abertos', 'ok', v_chamados = 0,
        'valor', v_chamados::text,
        'detalhe', case when v_chamados > 0
                        then 'Chamado aberto esperando resposta da equipe.' else null end),
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
  'Diagnostico do ambiente para a Central de resolucao, num jsonb so. `verificacoes` e um array de { chave, ok, valor, detalhe }: ok=true verde, ok=false vermelho, ok=null informacao (sem juizo). REUSA gps.admin_status_acesso e gps.admin_direito_ao_acesso em vez de copiar predicado, e gps.admin_financeiro_candidatos para o casamento de contrato (so quando o ambiente nao tem contrato -- com contrato a pergunta nao existe e varrer os orfaos do sip seria custo por abertura de tela). NAO chama gps.admin_painel_atendimento (aquela e da base inteira). NAO calcula "tarefa atual": o catalogo de tarefas vive no TypeScript e proximoPasso() e a regra unica; aqui vai o numero de concluidas com ok=null. SO LEITURA (stable), SECURITY DEFINER porque le auth.users e cs.*, com gp_is_admin() na primeira linha (sem JWT falha fechado com 42501). Uma abertura de tela = ~10 consultas, todas por indice existente e por UM aluno: nao cresce com a base.';

revoke execute on function gps.admin_diagnostico_ambiente(uuid) from public, anon;
grant  execute on function gps.admin_diagnostico_ambiente(uuid) to authenticated;
