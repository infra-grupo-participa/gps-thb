-- Diário do aluno — Fase 2: BACKFILL único, idempotente (rodar 2× não
-- duplica — todo INSERT abaixo tem `where not exists (... origem='backfill'
-- ...)`).
--
-- Cobre o que já existia no banco ANTES de a trigger (migração ...02) nascer:
--   - etapa1_clientes.criado_em            → cliente_cadastrado      (~878)
--   - progresso.concluida_em não nulo      → tarefa_concluida        (~27)
--   - auth.users.created_at                → conta_criada            (~540)
--   - auth.users.email_confirmed_at        → email_confirmado
--   - gps.membros.criado_em                → entrou_no_programa
--   - auth.identities.last_sign_in_at      → primeiro_acesso
--
-- O favorito (etapa1_clientes.acompanhado_equipe) NÃO entra: só existe o
-- ESTADO atual, sem data de quando foi marcado. Datá-lo com now() ou
-- criado_em seria INVENTAR um evento que não aconteceu naquele instante —
-- decisão do Marcio.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) etapa1_clientes → cliente_cadastrado
-- ─────────────────────────────────────────────────────────────────────────
insert into gps.aluno_eventos
  (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
select
  c.aluno_id,
  c.criado_em,
  'cliente_cadastrado',
  'cliente',
  c.id,
  coalesce(nullif(btrim(c.nome), ''), 'Cliente sem nome'),
  'sistema',
  null,
  'backfill'
from gps.etapa1_clientes c
where not exists (
  select 1 from gps.aluno_eventos e
  where e.origem = 'backfill'
    and e.tipo = 'cliente_cadastrado'
    and e.entidade_id = c.id
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) progresso.concluida_em não nulo → tarefa_concluida
-- ─────────────────────────────────────────────────────────────────────────
insert into gps.aluno_eventos
  (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
select
  p.aluno_id,
  p.concluida_em,
  'tarefa_concluida',
  'tarefa',
  p.id,
  format('Etapa %s, tarefa %s', p.etapa, p.tarefa),
  jsonb_build_object('etapa', p.etapa, 'tarefa', p.tarefa),
  'sistema',
  null,
  'backfill'
from gps.progresso p
where p.concluida_em is not null
  and not exists (
    select 1 from gps.aluno_eventos e
    where e.origem = 'backfill'
      and e.tipo = 'tarefa_concluida'
      and e.entidade_id = p.id
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Marcos de origem: auth.users / auth.identities / gps.membros.
--
-- Função SECURITY DEFINER criada e DROPADA nesta mesma migração — não deixar
-- superfície de leitura sobre o GoTrue (auth.*) depois do backfill rodar.
-- O corpo lê auth.users/auth.identities (schemas normalmente inacessíveis a
-- authenticated) só pelo tempo desta transação/migração.
--
-- 🔑 auth.identities.last_sign_in_at guarda o PRIMEIRO login e NÃO É
-- SOBRESCRITO depois; auth.users.last_sign_in_at guarda o ÚLTIMO. Mesmo
-- nome, significado OPOSTO — não "corrigir" isso achando que está trocado.
--
-- ⚠️ Um auth.users pode ter mais de UMA identity (ex.: provedor email +
-- algum SSO). Por isso agrupamos por user_id com MIN(last_sign_in_at) ANTES
-- de fazer qualquer join — nunca um join direto identities↔users, que
-- multiplicaria linha (mesma classe de bug do CPF duplicado que virou 22
-- linhas para 21 notas). O SELECT de contagem antes/depois deste bloco vai
-- no relatório de verificação.
-- ─────────────────────────────────────────────────────────────────────────
create function gps.aluno_eventos_backfill_marcos_de_origem()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- conta_criada (auth.users.created_at)
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
  select
    m.aluno_id,
    u.created_at,
    'conta_criada',
    'conta',
    null,
    'Conta criada',
    'sistema',
    u.id,
    'backfill'
  from gps.membros m
  join auth.users u on u.id = m.user_id
  where m.user_id is not null
    and not exists (
      select 1 from gps.aluno_eventos e
      where e.origem = 'backfill'
        and e.tipo = 'conta_criada'
        and e.aluno_id = m.aluno_id
        and e.ator_user_id = u.id
    );

  -- email_confirmado (auth.users.email_confirmed_at)
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
  select
    m.aluno_id,
    u.email_confirmed_at,
    'email_confirmado',
    'conta',
    null,
    'E-mail confirmado',
    'sistema',
    u.id,
    'backfill'
  from gps.membros m
  join auth.users u on u.id = m.user_id
  where m.user_id is not null
    and u.email_confirmed_at is not null
    and not exists (
      select 1 from gps.aluno_eventos e
      where e.origem = 'backfill'
        and e.tipo = 'email_confirmado'
        and e.aluno_id = m.aluno_id
        and e.ator_user_id = u.id
    );

  -- entrou_no_programa (gps.membros.criado_em)
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
  select
    m.aluno_id,
    m.criado_em,
    'entrou_no_programa',
    'conta',
    null,
    'Entrou no programa',
    'sistema',
    m.user_id,
    'backfill'
  from gps.membros m
  where not exists (
    select 1 from gps.aluno_eventos e
    where e.origem = 'backfill'
      and e.tipo = 'entrou_no_programa'
      and e.aluno_id = m.aluno_id
      and e.entidade_id is null
      and (e.ator_user_id is not distinct from m.user_id)
  );

  -- primeiro_acesso (auth.identities.last_sign_in_at, MIN por user_id —
  -- guarda o PRIMEIRO login apesar do nome, e não sobrescreve depois).
  -- ator='aluno' aqui de propósito (decisão do Marcio): é o próprio aluno
  -- entrando, mesmo reconstruído por backfill.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
  select
    m.aluno_id,
    pi.primeiro_login,
    'primeiro_acesso',
    'conta',
    null,
    'Primeiro acesso',
    'aluno',
    m.user_id,
    'backfill'
  from gps.membros m
  join (
    select user_id, min(last_sign_in_at) as primeiro_login
    from auth.identities
    where last_sign_in_at is not null
    group by user_id
  ) pi on pi.user_id = m.user_id
  where not exists (
    select 1 from gps.aluno_eventos e
    where e.origem = 'backfill'
      and e.tipo = 'primeiro_acesso'
      and e.aluno_id = m.aluno_id
      and (e.ator_user_id is not distinct from m.user_id)
  );
end;
$$;

select gps.aluno_eventos_backfill_marcos_de_origem();

drop function gps.aluno_eventos_backfill_marcos_de_origem();
