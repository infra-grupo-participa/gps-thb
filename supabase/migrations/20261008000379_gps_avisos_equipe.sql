-- ═══════════════════════════════════════════════════════════════════════════
-- 379 — CENTRAL DE AVISOS DA EQUIPE (sino + pop-up + push)
-- ═══════════════════════════════════════════════════════════════════════════
-- Decisões do dono (08/10/2026):
--   • push para TODOS os admins ativos do GPS (gps.admins);
--   • corpo do push SEM nome de ninguém ("Nova minuta para revisão. Abra o GPS.");
--     o nome (só o PRIMEIRO) vai no `resumo`, que só o sino mostra e só admin lê;
--   • histórico de 90 dias (expurgo diário por pg_cron);
--   • só ações de ALUNO: nunca ator da equipe (gps.admins/gps.operadores ativos),
--     nunca origem backfill.
--
-- Tipos v1 (aviso_tipos; volume medido pelo arquiteto nos últimos 30 dias):
--   tipo               fonte                                       sino pop push
--   chamado_aberto     1ª msg do aluno no chamado (chamado_mensagens)  s   s   s
--   chamado_resposta   msg do aluno em chamado existente               s   s   s
--   minuta_anexada     aluno_eventos cliente_minuta_anexada (11)       s   s   s
--   croqui_anexado     aluno_eventos cliente_croqui_anexado (~1)       s   s   s
--   sessao_marcada     sessao_eventos sessao_agendada (22)             s   s   n
--   sessao_cancelada   sessao_eventos sessao_cancelada por aluno (12)  s   s   s
--   aluno_novo         INSERT em gps.ambientes (89)                    s   s   n
--   plantao_inscricao  INSERT em gps.plantao_inscricoes (210)          s   n   n
--
-- Caminho: INSERT na fonte → gatilho AFTER (WHEN corta o que não é do aluno)
--   → gps.aviso_registrar → INSERT em gps.equipe_avisos (on conflict
--   origem_id do nothing) → gatilho trg_equipe_avisos_push (só tipo com push)
--   → gps.aviso_push_chamar → net.http_post → edge push-enviar {aviso_id}
--   → gps.push_preparar_aviso (service_role) → push → gps.push_resultado.
-- Realtime: gps.equipe_avisos na publicação supabase_realtime (RLS só admin);
--   o cliente usa o INSERT só como SINAL e relê por gps.avisos_listar.
--
-- 🔴 Falha do aviso NUNCA desfaz a ação do aluno: todo gatilho de fonte roda
--   dentro de begin … exception when others → raise warning (subtransação).
-- 🔴 trg_chamado_mensagens_push (…357) é REMOVIDO aqui: o chamado passa pelo
--   caminho novo (senão push em dobro). gps.push_chamar/push_preparar ficam
--   (inertes, sem gatilho) para o DOWN e para a edge continuar compatível.
--   ⚠️ Consequência: com avisos_equipe_ativo desligado, o chamado deixa de
--   gerar push mesmo com push_chamados_ativo = 'true'. Ligar os dois juntos.
--
-- INTERRUPTORES (gps.config):
--   avisos_equipe_ativo  — NOVO. AUSENTE = DESLIGADO. Nasce 'false'. Desligado:
--                          nenhum aviso é gravado, RPCs devolvem ativo:false.
--   push_chamados_ativo  — o de …357, agora "push ligado" para todos os tipos
--                          com push=true (exige VAPID/segredo/edge prontos).
--   Push sai só com OS DOIS em 'true'. Por tipo: gps.aviso_tipos.ativo/push.
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
-- 1 Escala: ~400 avisos/mês (soma da tabela acima) → ~1.200 linhas vivas com
--   o expurgo de 90 dias. Lidos: 1 linha por admin (11).
-- 2 Índice: listar = PK equipe_avisos_pkey backward (order by id desc limit
--   n); nao_lidos = PK range (id > lido_ate) com LIMIT 100 (teto, a tela
--   mostra "99+"); sem lido_ate = equipe_avisos_criado_em_idx (criado_em >
--   now()-7d, LIMIT 100); expurgo = equipe_avisos_criado_em_idx.
--   Gatilhos: chamados por PK; "1ª mensagem?" = idx_chamado_mensagens_thread
--   (chamado_id, …); sessao_agendamentos/sessao_tipos/plantao_slots/
--   plantao_alunos/thb_alunos por PK; membros por membros_user_id_key;
--   gps.admins e gps.operadores por PK (user_id).
-- 3 Frequência: gatilho de aluno_eventos com WHEN (ator='aluno', origem='app',
--   tipo minuta/croqui) — custo ZERO nas outras ~dezenas de eventos/dia; o
--   de chamado_mensagens com WHEN autor_papel='aluno'; sessao_eventos com
--   WHEN acao in (agendada, cancelada). Desligado: 1 leitura por PK em
--   gps.config e volta. Leitura do sino: 1 RPC por abertura + 1 por sinal de
--   Realtime (~13/dia) + 1 avisos_contar a cada 120–300 s por aba VISÍVEL
--   (poll lento sempre ligado: canal SUBSCRIBED pode não entregar nada).
-- 4 Repetição: um aviso por linha de origem (origem_id unique); um push por
--   aviso; tag aviso-<tipo>-<entidade> colapsa rajada no navegador.
-- 5 Reversão: avisos_equipe_ativo = 'false' (zero escrita, RPCs vazias); por
--   tipo: update gps.aviso_tipos set ativo/push = false. Remoção: DOWN.
--
-- DOWN (comentado — rodar à mão; arquivar, nunca dropar tabela com dado):
--   begin;
--   update gps.config set valor = 'false' where chave = 'avisos_equipe_ativo';
--   select cron.unschedule('avisos-equipe-expurgo');
--   alter publication supabase_realtime drop table gps.equipe_avisos;
--   drop trigger if exists trg_aluno_eventos_aviso       on gps.aluno_eventos;
--   drop trigger if exists trg_chamado_mensagens_aviso   on gps.chamado_mensagens;
--   drop trigger if exists trg_sessao_eventos_aviso      on gps.sessao_eventos;
--   drop trigger if exists trg_ambientes_aviso           on gps.ambientes;
--   drop trigger if exists trg_plantao_inscricoes_aviso  on gps.plantao_inscricoes;
--   drop trigger if exists trg_equipe_avisos_push        on gps.equipe_avisos;
--   -- devolve o push de chamado do …357:
--   create trigger trg_chamado_mensagens_push after insert on gps.chamado_mensagens
--     for each row when (new.autor_papel = 'aluno') execute function gps.chamado_mensagens_push_trg();
--   drop function gps.avisos_listar(integer); drop function gps.avisos_marcar_lidos(bigint);
--   drop function gps.avisos_contar(); drop function gps.push_preparar_aviso(bigint);
--   drop function gps.aviso_push_chamar(bigint);
--   -- + reaplicar a config_definir da …371 (allowlist sem avisos_equipe_ativo)
--   alter table gps.equipe_avisos       rename to equipe_avisos_arquivo_<data>;
--   alter table gps.equipe_avisos_lidos rename to equipe_avisos_lidos_arquivo_<data>;
--   alter table gps.aviso_tipos         rename to aviso_tipos_arquivo_<data>;
--   commit;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Guardas de premissa (abortam a migração inteira; nada fica pela metade)
-- ═══════════════════════════════════════════════════════════════════════════
do $premissas$
declare
  v_falta text[] := '{}';
  r record;
begin
  for r in
    select x.t, x.c
      from (values
        ('aluno_eventos', 'ator'), ('aluno_eventos', 'ator_user_id'), ('aluno_eventos', 'origem'),
        ('aluno_eventos', 'tipo'), ('aluno_eventos', 'entidade_id'), ('aluno_eventos', 'aluno_id'),
        ('chamado_mensagens', 'autor_papel'), ('chamado_mensagens', 'autor_id'),
        ('chamado_mensagens', 'chamado_id'), ('chamados', 'aluno_id'),
        ('sessao_eventos', 'acao'), ('sessao_eventos', 'ator_id'), ('sessao_eventos', 'detalhe'),
        ('sessao_eventos', 'agendamento_id'),
        ('sessao_agendamentos', 'aluno_id'), ('sessao_agendamentos', 'inicio_em'),
        ('sessao_agendamentos', 'tipo_id'), ('sessao_tipos', 'nome'),
        ('ambientes', 'aluno_id'), ('ambientes', 'criado_em'),
        ('plantao_inscricoes', 'slot_id'), ('plantao_inscricoes', 'aluno_plantao_id'),
        ('plantao_slots', 'inicio_em'), ('plantao_alunos', 'nome'),
        ('membros', 'user_id'), ('membros', 'pessoa_aluno_id'), ('membros', 'papel'),
        ('admins', 'ativo'), ('operadores', 'ativo'),
        ('push_inscricoes', 'revogada_em')
      ) as x(t, c)
  loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'gps' and table_name = r.t and column_name = r.c) then
      v_falta := v_falta || (r.t || '.' || r.c);
    end if;
  end loop;
  if cardinality(v_falta) > 0 then
    raise exception '379: coluna esperada não existe: %', array_to_string(v_falta, ', ');
  end if;

  if to_regprocedure('gps.eh_admin()') is null
     or to_regprocedure('gps.push_ativo()') is null
     or to_regprocedure('gps.push_segredo()') is null
     or to_regprocedure('gps.push_resultado(text,integer)') is null then
    raise exception '379: gps.eh_admin/push_ativo/push_segredo/push_resultado ausente — abortado.';
  end if;

  -- Os dois tipos de evento de anexo têm de estar no catálogo vivo, senão o
  -- gatilho nunca casaria e o sino ficaria mudo sem erro.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'gps.aluno_eventos'::regclass
                    and conname = 'aluno_eventos_tipo_check'
                    and pg_get_constraintdef(oid) like '%cliente_minuta_anexada%'
                    and pg_get_constraintdef(oid) like '%cliente_croqui_anexado%') then
    raise exception '379: aluno_eventos_tipo_check vivo não tem cliente_minuta_anexada/cliente_croqui_anexado — abortado.';
  end if;
end;
$premissas$;

-- Guarda da config_definir (molde da …357): o corpo VIVO não pode ter chave
-- que esta versão não conhece, e tem de ser o da …371 (guarda gps.eh_admin()).
do $guarda$
declare
  v_def   text;
  v_resto text[];
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'gps' and p.proname = 'config_definir') <> 1 then
    raise exception '379: gps.config_definir ausente ou com sobrecarga — abortado.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'config_definir'
     and pg_get_function_identity_arguments(p.oid) = 'p_chave text, p_valor text';

  if v_def is null then
    raise exception '379: gps.config_definir(text, text) não existe — abortado.';
  end if;
  if position('gps.eh_admin()' in v_def) = 0 then
    raise exception '379: gps.config_definir viva não é a da …371 (sem gps.eh_admin()) — abortado.';
  end if;

  select array_agg(distinct m[1]) into v_resto
    from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m
   where m[1] not in (
     'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
     'minuta_contexto_obrigatorio',
     'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
     'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
     'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao',
     'documento_inline_ativo',
     'push_chamados_ativo','gerador_minutas_ativo',
     'avisos_equipe_ativo',
     'true','false','interruptor_alterado');

  if v_resto is not null then
    raise exception '379: gps.config_definir viva tem literal desconhecido %, abortado (recrie a partir do corpo vivo).', v_resto;
  end if;
end;
$guarda$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Config — nasce DESLIGADO (linha explícita para a tela de interruptores)
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values ('avisos_equipe_ativo', 'false')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Tabelas
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.aviso_tipos (
  tipo        text    primary key
    constraint aviso_tipos_tipo_check check (tipo ~ '^[a-z][a-z_]{2,39}$'),
  rotulo      text    not null
    constraint aviso_tipos_rotulo_check check (char_length(btrim(rotulo)) between 3 and 60),
  ativo       boolean not null default true,
  toast       boolean not null default true,
  push        boolean not null default false,
  titulo_push text
    constraint aviso_tipos_titulo_push_check
    check (titulo_push is null or (char_length(btrim(titulo_push)) between 2 and 60 and titulo_push !~ '[[:cntrl:]]')),
  corpo_push  text
    constraint aviso_tipos_corpo_push_check
    check (corpo_push is null or (char_length(btrim(corpo_push)) between 2 and 140 and corpo_push !~ '[[:cntrl:]]')),
  constraint aviso_tipos_push_tem_texto check (not push or (titulo_push is not null and corpo_push is not null))
);

comment on table gps.aviso_tipos is
  'Catalogo dos avisos da equipe (379). ativo=false: o tipo deixa de gerar aviso. toast: pop-up na tela. push: aviso no computador (Web Push). titulo_push/corpo_push vao para a tela bloqueada do sistema operacional: NUNCA nome de pessoa, cliente ou assunto. Escrita so pelo dono do banco (sem grant).';

insert into gps.aviso_tipos (tipo, rotulo, ativo, toast, push, titulo_push, corpo_push) values
  ('chamado_aberto',    'Chamado aberto',          true, true,  true,  'Chamado novo',      'Novo chamado de parceiro. Abra o GPS.'),
  ('chamado_resposta',  'Resposta em chamado',     true, true,  true,  'Chamado respondido', 'Nova mensagem em chamado. Abra o GPS.'),
  ('minuta_anexada',    'Minuta anexada',          true, true,  true,  'Minuta nova',       'Nova minuta para revisão. Abra o GPS.'),
  ('croqui_anexado',    'Croqui anexado',          true, true,  true,  'Croqui novo',       'Novo croqui para revisão. Abra o GPS.'),
  ('sessao_marcada',    'Sessão marcada',          true, true,  false, null,                null),
  ('sessao_cancelada',  'Sessão cancelada',        true, true,  true,  'Sessão cancelada',  'Um parceiro cancelou uma sessão. Abra o GPS.'),
  ('aluno_novo',        'Aluno novo',              true, true,  false, null,                null),
  ('plantao_inscricao', 'Inscrição no plantão',    true, false, false, null,                null)
on conflict (tipo) do nothing;

create table gps.equipe_avisos (
  id          bigserial   primary key,
  tipo        text        not null references gps.aviso_tipos (tipo) on update cascade on delete restrict,
  -- AMBIENTE (thb_alunos.id do titular), como em gps.etapa1_clientes. SEM FK
  -- (thb_alunos é compartilhada com o sip). Nulo no plantão (aluno do Acelera).
  aluno_id    uuid,
  -- chamado_id | cliente_id | agendamento_id | aluno_id | slot_id, conforme o tipo.
  entidade_id uuid,
  url         text        not null
    constraint equipe_avisos_url_check check (url ~ '^/admin(/[A-Za-z0-9_-]+)*$' and char_length(url) <= 300),
  resumo      text        not null
    constraint equipe_avisos_resumo_check
    check (char_length(btrim(resumo)) between 1 and 300 and resumo !~ '[[:cntrl:]]'),
  criado_em   timestamptz not null default now(),
  origem_id   text        not null
    constraint equipe_avisos_origem_id_key unique
    constraint equipe_avisos_origem_id_check check (char_length(origem_id) between 3 and 200)
);

comment on table gps.equipe_avisos is
  'Uma linha por acao de ALUNO que a equipe precisa ver (379). Escrita SO pelos gatilhos das fontes via gps.aviso_registrar (on conflict origem_id do nothing). Leitura: admin (RLS gps.eh_admin()) — RPC gps.avisos_listar e Realtime (publicacao supabase_realtime, so como sinal). resumo pode ter o PRIMEIRO nome do aluno (sino); nunca vai ao push. Expurgo de 90 dias pelo cron avisos-equipe-expurgo.';
comment on column gps.equipe_avisos.url is
  'Caminho RELATIVO dentro de /admin (CHECK: so [A-Za-z0-9_-] por segmento, sem //, sem esquema, sem query).';
comment on column gps.equipe_avisos.origem_id is
  '<tabela>:<id da linha de origem> — idempotencia: a mesma linha de origem nunca gera dois avisos.';

create index equipe_avisos_criado_em_idx on gps.equipe_avisos (criado_em);
comment on index gps.equipe_avisos_criado_em_idx is
  'Expurgo diario (criado_em < now()-90d) e contagem de nao lidos de quem nunca marcou (criado_em > now()-7d, LIMIT 100).';

create table gps.equipe_avisos_lidos (
  user_id       uuid        primary key references auth.users (id) on delete cascade,
  lido_ate      bigint      not null default 0 check (lido_ate >= 0),
  atualizado_em timestamptz not null default now()
);

comment on table gps.equipe_avisos_lidos is
  'Marca de leitura por admin (379): todo aviso com id <= lido_ate esta lido. Sem linha = so os ultimos 7 dias contam como nao lidos. Escrita so por gps.avisos_marcar_lidos; orfaos (quem deixou de ser admin) saem no expurgo diario.';

-- RLS + privilégios: tabela nova no schema gps nasce com INSERT/UPDATE/DELETE
-- para authenticated (default privileges) e `revoke from anon` não pega o que
-- vem de PUBLIC → revoke all explícito de todos, inclusive service_role.
alter table gps.aviso_tipos         enable row level security;
alter table gps.equipe_avisos       enable row level security;
alter table gps.equipe_avisos_lidos enable row level security;

revoke all on table gps.aviso_tipos         from public, anon, authenticated, service_role;
revoke all on table gps.equipe_avisos       from public, anon, authenticated, service_role;
revoke all on table gps.equipe_avisos_lidos from public, anon, authenticated, service_role;
revoke all on sequence gps.equipe_avisos_id_seq from public, anon, authenticated, service_role;

-- SELECT por admin: o Realtime confere a RLS do assinante com grant de SELECT;
-- a tela usa as RPCs. Nenhuma escrita direta (sem grant e sem policy).
grant select on table gps.equipe_avisos to authenticated;
grant select on table gps.aviso_tipos   to authenticated;

create policy equipe_avisos_select_admin on gps.equipe_avisos
  for select to authenticated
  using ((select gps.eh_admin()));

create policy aviso_tipos_select_admin on gps.aviso_tipos
  for select to authenticated
  using ((select gps.eh_admin()));
-- equipe_avisos_lidos: sem grant e sem policy (só as RPCs SECURITY DEFINER).

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Internas (nenhuma é endpoint: revoke de todos)
-- ═══════════════════════════════════════════════════════════════════════════
-- AUSENTE = DESLIGADO (molde de gps.push_ativo).
create or replace function gps.avisos_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select btrim(c.valor) = 'true'
                     from gps.config c
                    where c.chave = 'avisos_equipe_ativo'), false);
$function$;

revoke all on function gps.avisos_ativo() from public, anon, authenticated, service_role;

-- Equipe = admin ativo do GPS OU operador ativo da esteira, para um user_id
-- QUALQUER (gps.eh_equipe() só responde pelo auth.uid() da sessão). null =
-- sem usuário (cadastro pelo GoTrue, rota pública do Plantão) → não é equipe.
create or replace function gps.aviso_e_equipe(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user is not null
     and (exists (select 1 from gps.admins a where a.user_id = p_user and a.ativo)
          or exists (select 1 from gps.operadores o where o.user_id = p_user and o.ativo));
$function$;

revoke all on function gps.aviso_e_equipe(uuid) from public, anon, authenticated, service_role;

-- Primeiro nome de quem agiu (titular ou sócio, molde de gps.push_preparar):
-- pessoa do membro → titular do ambiente → 'Parceiro'. Só o PRIMEIRO nome.
create or replace function gps.aviso_primeiro_nome(p_user uuid, p_aluno uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_nome text;
begin
  if p_user is not null and p_aluno is not null then
    select nullif(btrim(t.nome), '') into v_nome
      from gps.membros mb
      join public.thb_alunos t
        on t.id = coalesce(mb.pessoa_aluno_id, case when mb.papel = 'titular' then mb.aluno_id end)
     where mb.user_id = p_user and mb.aluno_id = p_aluno
     limit 1;
  end if;
  if v_nome is null and p_aluno is not null then
    select nullif(btrim(t.nome), '') into v_nome from public.thb_alunos t where t.id = p_aluno;
  end if;
  return left(coalesce(nullif(split_part(btrim(regexp_replace(coalesce(v_nome, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), ' ', 1), ''),
                       'Parceiro'), 40);
end;
$function$;

revoke all on function gps.aviso_primeiro_nome(uuid, uuid) from public, anon, authenticated, service_role;

-- A ÚNICA porta de escrita em gps.equipe_avisos. null = não gravou
-- (desligado, tipo inativo ou origem repetida).
create or replace function gps.aviso_registrar(
  p_tipo        text,
  p_aluno_id    uuid,
  p_entidade_id uuid,
  p_url         text,
  p_resumo      text,
  p_origem_id   text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
begin
  if not gps.avisos_ativo() then
    return null;
  end if;
  if not exists (select 1 from gps.aviso_tipos t where t.tipo = p_tipo and t.ativo) then
    return null;
  end if;

  insert into gps.equipe_avisos (tipo, aluno_id, entidade_id, url, resumo, origem_id)
  values (p_tipo, p_aluno_id, p_entidade_id, p_url,
          left(coalesce(nullif(btrim(regexp_replace(coalesce(p_resumo, ''), '[[:cntrl:]]', ' ', 'g')), ''),
                        'Novo aviso'), 300),
          p_origem_id)
  on conflict (origem_id) do nothing
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function gps.aviso_registrar(text, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

-- Instante legível no fuso do programa: "10/10 às 14:00".
create or replace function gps.aviso_quando(p_em timestamptz)
returns text
language sql
stable
set search_path = ''
as $function$
  select to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
$function$;

revoke all on function gps.aviso_quando(timestamptz) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Gatilhos das fontes — todos AFTER, todos engolem erro (warning)
-- ═══════════════════════════════════════════════════════════════════════════

-- 4a) aluno_eventos: minuta e croqui anexados PELO ALUNO.
create or replace function gps.aviso_aluno_eventos_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_tipo text;
begin
  begin
    if not gps.avisos_ativo() then
      return null;
    end if;
    -- O WHEN já filtra; a função confere de novo (defesa em profundidade):
    -- ator equipe gravado como 'aluno' por engano não vira aviso.
    if new.ator <> 'aluno' or new.origem <> 'app' or gps.aviso_e_equipe(new.ator_user_id) then
      return null;
    end if;
    v_tipo := case new.tipo
                when 'cliente_minuta_anexada' then 'minuta_anexada'
                when 'cliente_croqui_anexado' then 'croqui_anexado'
              end;
    if v_tipo is null then
      return null;
    end if;

    perform gps.aviso_registrar(
      v_tipo,
      new.aluno_id,
      new.entidade_id,
      '/admin/aluno/' || new.aluno_id::text || '/clientes' || coalesce('/' || new.entidade_id::text, ''),
      gps.aviso_primeiro_nome(new.ator_user_id, new.aluno_id)
        || case v_tipo when 'minuta_anexada' then ' anexou uma minuta para revisão'
                       else ' anexou um croqui' end,
      'aluno_eventos:' || new.id::text);
  exception when others then
    raise warning 'avisos: aluno_eventos falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.aviso_aluno_eventos_trg() from public, anon, authenticated, service_role;

create trigger trg_aluno_eventos_aviso
  after insert on gps.aluno_eventos
  for each row
  when (new.ator = 'aluno' and new.origem = 'app'
        and new.tipo in ('cliente_minuta_anexada', 'cliente_croqui_anexado'))
  execute function gps.aviso_aluno_eventos_trg();

-- 4b) chamado_mensagens: abertura (1ª mensagem do chamado) ou resposta do aluno.
create or replace function gps.aviso_chamado_mensagens_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_aluno    uuid;
  v_primeira boolean;
  v_nome     text;
begin
  begin
    if not gps.avisos_ativo() then
      return null;
    end if;
    if new.autor_papel <> 'aluno' or gps.aviso_e_equipe(new.autor_id) then
      return null;
    end if;

    select c.aluno_id into v_aluno from gps.chamados c where c.id = new.chamado_id;
    if v_aluno is null then
      return null;
    end if;

    v_primeira := not exists (select 1 from gps.chamado_mensagens m
                               where m.chamado_id = new.chamado_id and m.id <> new.id);
    v_nome := gps.aviso_primeiro_nome(new.autor_id, v_aluno);

    -- SEM assunto (pode conter nome de cliente — mesma decisão da …357).
    perform gps.aviso_registrar(
      case when v_primeira then 'chamado_aberto' else 'chamado_resposta' end,
      v_aluno,
      new.chamado_id,
      '/admin/chamados/' || new.chamado_id::text,
      v_nome || case when v_primeira then ' abriu um chamado' else ' respondeu um chamado' end,
      'chamado_mensagens:' || new.id::text);
  exception when others then
    raise warning 'avisos: chamado_mensagens falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.aviso_chamado_mensagens_trg() from public, anon, authenticated, service_role;

-- O caminho antigo sai: o chamado passa a ir pelo aviso (senão push em dobro).
drop trigger if exists trg_chamado_mensagens_push on gps.chamado_mensagens;

create trigger trg_chamado_mensagens_aviso
  after insert on gps.chamado_mensagens
  for each row
  when (new.autor_papel = 'aluno')
  execute function gps.aviso_chamado_mensagens_trg();

-- 4c) sessao_eventos: marcada pelo aluno / cancelada pelo aluno.
-- sessao_agendar só aceita o dono do ambiente (gps.aluno_atual()); o
-- cancelamento grava detalhe.por ∈ admin | responsavel | aluno.
create or replace function gps.aviso_sessao_eventos_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_aluno  uuid;
  v_inicio timestamptz;
  v_nome_t text;
  v_tipo   text;
begin
  begin
    if not gps.avisos_ativo() then
      return null;
    end if;
    if new.ator_id is null or gps.aviso_e_equipe(new.ator_id) then
      return null;
    end if;
    if new.acao = 'sessao_agendada' then
      v_tipo := 'sessao_marcada';
    elsif new.acao = 'sessao_cancelada' and coalesce(new.detalhe ->> 'por', '') = 'aluno' then
      v_tipo := 'sessao_cancelada';
    else
      return null;
    end if;

    select a.aluno_id, a.inicio_em, t.nome
      into v_aluno, v_inicio, v_nome_t
      from gps.sessao_agendamentos a
      join gps.sessao_tipos t on t.id = a.tipo_id
     where a.id = new.agendamento_id;
    if v_aluno is null then
      return null;
    end if;

    perform gps.aviso_registrar(
      v_tipo,
      v_aluno,
      new.agendamento_id,
      '/admin/sessoes',
      gps.aviso_primeiro_nome(new.ator_id, v_aluno)
        || case v_tipo when 'sessao_marcada' then ' marcou ' else ' cancelou ' end
        || coalesce(nullif(btrim(v_nome_t), ''), 'uma sessão')
        || case v_tipo when 'sessao_marcada' then ' para ' else ' de ' end
        || coalesce(gps.aviso_quando(v_inicio), 'data a confirmar'),
      'sessao_eventos:' || new.id::text);
  exception when others then
    raise warning 'avisos: sessao_eventos falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.aviso_sessao_eventos_trg() from public, anon, authenticated, service_role;

create trigger trg_sessao_eventos_aviso
  after insert on gps.sessao_eventos
  for each row
  when (new.acao in ('sessao_agendada', 'sessao_cancelada'))
  execute function gps.aviso_sessao_eventos_trg();

-- 4d) ambientes: aluno novo no programa. Ator = auth.uid() da transação:
-- admin/operador (Criar acesso, aprovar solicitação, lote) → sem aviso;
-- null (cadastro pelo GoTrue) ou o próprio aluno → aviso.
create or replace function gps.aviso_ambientes_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  begin
    if not gps.avisos_ativo() then
      return null;
    end if;
    if gps.aviso_e_equipe((select auth.uid())) then
      return null;
    end if;

    perform gps.aviso_registrar(
      'aluno_novo',
      new.aluno_id,
      new.aluno_id,
      '/admin/aluno/' || new.aluno_id::text,
      gps.aviso_primeiro_nome(null, new.aluno_id) || ' entrou no programa',
      'ambientes:' || new.aluno_id::text || ':'
        || coalesce(floor(extract(epoch from new.criado_em))::bigint::text, '0'));
  exception when others then
    raise warning 'avisos: ambientes falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.aviso_ambientes_trg() from public, anon, authenticated, service_role;

create trigger trg_ambientes_aviso
  after insert on gps.ambientes
  for each row
  execute function gps.aviso_ambientes_trg();

-- 4e) plantao_inscricoes: inscrição do aluno do Acelera (rota pública = sem
-- auth.uid(); inscrição feita pela equipe = sem aviso). aluno_id nulo.
create or replace function gps.aviso_plantao_inscricoes_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_inicio timestamptz;
  v_nome   text;
begin
  begin
    if not gps.avisos_ativo() then
      return null;
    end if;
    if gps.aviso_e_equipe((select auth.uid())) then
      return null;
    end if;

    select s.inicio_em into v_inicio from gps.plantao_slots s where s.id = new.slot_id;
    select nullif(btrim(pa.nome), '') into v_nome from gps.plantao_alunos pa where pa.id = new.aluno_plantao_id;
    v_nome := left(coalesce(nullif(split_part(btrim(regexp_replace(coalesce(v_nome, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), ' ', 1), ''),
                            'Aluno'), 40);

    perform gps.aviso_registrar(
      'plantao_inscricao',
      null,
      new.slot_id,
      '/admin/plantao',
      v_nome || ' se inscreveu no plantão de ' || coalesce(gps.aviso_quando(v_inicio), 'data a confirmar'),
      'plantao_inscricoes:' || new.id::text);
  exception when others then
    raise warning 'avisos: plantao_inscricoes falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.aviso_plantao_inscricoes_trg() from public, anon, authenticated, service_role;

create trigger trg_plantao_inscricoes_aviso
  after insert on gps.plantao_inscricoes
  for each row
  execute function gps.aviso_plantao_inscricoes_trg();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Push genérico
-- ═══════════════════════════════════════════════════════════════════════════
-- Cutucada na edge (cópia de gps.push_chamar da …357, corpo {aviso_id}).
-- Só posta para functions do PRÓPRIO projeto: o header leva o segredo do
-- Vault, e qualquer admin tem UPDATE em gps.config pela policy da …110.
create or replace function gps.aviso_push_chamar(p_aviso_id bigint)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_url     text;
  v_segredo text;
  v_req     bigint;
begin
  if p_aviso_id is null or not gps.push_ativo() or not gps.avisos_ativo() then
    return null;
  end if;

  select nullif(btrim(valor), '') into v_url from gps.config where chave = 'push_enviar_url';
  if v_url is null
     or v_url !~ '^https://mbvybujpkwuorhtdzcde\.supabase\.co/functions/v1/[a-z0-9-]+$' then
    raise warning 'push: push_enviar_url ausente ou fora do projeto; aviso não enviado';
    return null;
  end if;

  v_segredo := gps.push_segredo();
  if v_segredo is null then
    raise warning 'push: segredo gps_push_segredo ausente no Vault; aviso não enviado';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := jsonb_build_object('aviso_id', p_aviso_id),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-segredo', v_segredo),
    timeout_milliseconds := 10000
  ) into v_req;

  return v_req;
exception when others then
  raise warning 'push: falha ao enfileirar aviso (%): %', sqlstate, sqlerrm;
  return null;
end;
$function$;

revoke all on function gps.aviso_push_chamar(bigint) from public, anon, authenticated, service_role;

create or replace function gps.equipe_avisos_push_trg()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  begin
    if exists (select 1 from gps.aviso_tipos t where t.tipo = new.tipo and t.ativo and t.push)
       and gps.push_ativo() then
      perform gps.aviso_push_chamar(new.id);
    end if;
  exception when others then
    raise warning 'push: gatilho de aviso falhou (%): %', sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function gps.equipe_avisos_push_trg() from public, anon, authenticated, service_role;

create trigger trg_equipe_avisos_push
  after insert on gps.equipe_avisos
  for each row
  execute function gps.equipe_avisos_push_trg();

-- Edge push-enviar (service_role). null = não enviar: desligado, tipo sem
-- push, aviso inexistente ou com mais de 1 hora (reenvio tardio não vira
-- rajada). Texto SÓ do catálogo — nenhum nome, nenhum resumo.
create or replace function gps.push_preparar_aviso(p_aviso_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_a    record;
  v_insc jsonb;
begin
  if p_aviso_id is null or not gps.avisos_ativo() or not gps.push_ativo() then
    return null;
  end if;

  select a.id, a.tipo, a.entidade_id, a.url, t.titulo_push, t.corpo_push
    into v_a
    from gps.equipe_avisos a
    join gps.aviso_tipos t on t.tipo = a.tipo
   where a.id = p_aviso_id
     and t.ativo and t.push
     and a.criado_em > now() - interval '1 hour';
  if v_a.id is null then
    return null;
  end if;

  -- Só inscrição viva de quem AINDA é admin ativo do GPS (gps.admins).
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', i.endpoint,
                                               'p256dh',   i.p256dh,
                                               'auth',     i.auth)
                            order by i.criado_em), '[]'::jsonb)
    into v_insc
    from gps.push_inscricoes i
    join gps.admins a on a.user_id = i.user_id and a.ativo
   where i.revogada_em is null;

  return jsonb_build_object(
    'aviso_id',    v_a.id,
    'tipo',        v_a.tipo,
    'entidade_id', v_a.entidade_id,
    'titulo',      v_a.titulo_push,
    'corpo',       v_a.corpo_push,
    'url',         v_a.url,
    'inscricoes',  v_insc
  );
end;
$function$;

revoke all on function gps.push_preparar_aviso(bigint) from public, anon, authenticated, service_role;
grant execute on function gps.push_preparar_aviso(bigint) to service_role;

comment on function gps.push_preparar_aviso(bigint) is
  'Edge push-enviar (service_role, 379). null se avisos_equipe_ativo ou push_chamados_ativo <> true, tipo inativo/sem push, aviso inexistente ou com mais de 1 h. Senao {aviso_id, tipo, entidade_id, titulo, corpo, url, inscricoes:[{endpoint,p256dh,auth}]} — titulo/corpo do catalogo gps.aviso_tipos, SEM nome; inscricoes so de admin ativo (gps.admins).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) RPCs da tela (authenticated + guarda gps.eh_admin(); 42501 senão)
-- ═══════════════════════════════════════════════════════════════════════════
-- Não lidos de um admin, com TETO de 100 (a tela mostra "99+"): o custo nunca
-- cresce com o histórico. Sem marca de leitura: só os últimos 7 dias contam.
create or replace function gps.avisos_nao_lidos(p_user uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_lido bigint;
  v_n    integer;
begin
  select l.lido_ate into v_lido from gps.equipe_avisos_lidos l where l.user_id = p_user;
  if v_lido is null then
    select count(*) into v_n
      from (select 1 from gps.equipe_avisos a
             where a.criado_em > now() - interval '7 days' limit 100) s;
  else
    select count(*) into v_n
      from (select 1 from gps.equipe_avisos a where a.id > v_lido limit 100) s;
  end if;
  return v_n;
end;
$function$;

revoke all on function gps.avisos_nao_lidos(uuid) from public, anon, authenticated, service_role;

create or replace function gps.avisos_listar(p_limite integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid   uuid    := auth.uid();
  v_lim   integer := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_lido  bigint;
  v_corte timestamptz := now() - interval '7 days';
  v_itens jsonb;
begin
  -- coalesce: guarda que devolve null falharia ABERTA.
  if v_uid is null or not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not gps.avisos_ativo() then
    return jsonb_build_object('ativo', false, 'itens', '[]'::jsonb, 'nao_lidos', 0,
                              'lido_ate', null, 'ultimo_id', null);
  end if;

  select l.lido_ate into v_lido from gps.equipe_avisos_lidos l where l.user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id',          x.id,
           'tipo',        x.tipo,
           'rotulo',      t.rotulo,
           'toast',       t.toast,
           'aluno_id',    x.aluno_id,
           'entidade_id', x.entidade_id,
           'url',         x.url,
           'resumo',      x.resumo,
           'criado_em',   x.criado_em,
           'lido',        case when v_lido is null then x.criado_em <= v_corte else x.id <= v_lido end
         ) order by x.id desc), '[]'::jsonb)
    into v_itens
    from (select a.id, a.tipo, a.aluno_id, a.entidade_id, a.url, a.resumo, a.criado_em
            from gps.equipe_avisos a
           order by a.id desc
           limit v_lim) x
    join gps.aviso_tipos t on t.tipo = x.tipo;

  return jsonb_build_object(
    'ativo',     true,
    'itens',     v_itens,
    'nao_lidos', gps.avisos_nao_lidos(v_uid),
    'lido_ate',  v_lido,
    'ultimo_id', (select max(a.id) from gps.equipe_avisos a)
  );
end;
$function$;

revoke all on function gps.avisos_listar(integer) from public, anon, authenticated, service_role;
grant execute on function gps.avisos_listar(integer) to authenticated;

comment on function gps.avisos_listar(integer) is
  'Sino da equipe (379). So admin (42501). {ativo, itens:[{id,tipo,rotulo,toast,aluno_id,entidade_id,url,resumo,criado_em,lido}] (mais novo primeiro, p_limite 1..100, default 30), nao_lidos (0..100; 100 = "99+"), lido_ate, ultimo_id}. Desligado: ativo=false e itens vazio.';

create or replace function gps.avisos_contar()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not gps.avisos_ativo() then
    return jsonb_build_object('ativo', false, 'nao_lidos', 0, 'ultimo_id', null);
  end if;
  return jsonb_build_object(
    'ativo',     true,
    'nao_lidos', gps.avisos_nao_lidos(v_uid),
    'ultimo_id', (select max(a.id) from gps.equipe_avisos a)
  );
end;
$function$;

revoke all on function gps.avisos_contar() from public, anon, authenticated, service_role;
grant execute on function gps.avisos_contar() to authenticated;

comment on function gps.avisos_contar() is
  'Badge do sino (379). So admin (42501). {ativo, nao_lidos (0..100; 100 = "99+"), ultimo_id}.';

-- Marca como lido tudo até p_ate (nunca além do maior id existente; nunca
-- volta atrás — marcar de novo um id menor não "desmarca").
create or replace function gps.avisos_marcar_lidos(p_ate bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid  uuid := auth.uid();
  v_max  bigint;
  v_ate  bigint;
begin
  if v_uid is null or not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_ate is null or p_ate < 0 then
    raise exception 'Informe até qual aviso marcar como lido.' using errcode = '22023';
  end if;

  select coalesce(max(a.id), 0) into v_max from gps.equipe_avisos a;
  v_ate := least(p_ate, v_max);

  insert into gps.equipe_avisos_lidos as l (user_id, lido_ate, atualizado_em)
  values (v_uid, v_ate, now())
  on conflict (user_id) do update
     set lido_ate      = greatest(l.lido_ate, excluded.lido_ate),
         atualizado_em = now()
  returning l.lido_ate into v_ate;

  return jsonb_build_object('lido_ate', v_ate, 'nao_lidos', gps.avisos_nao_lidos(v_uid));
end;
$function$;

revoke all on function gps.avisos_marcar_lidos(bigint) from public, anon, authenticated, service_role;
grant execute on function gps.avisos_marcar_lidos(bigint) to authenticated;

comment on function gps.avisos_marcar_lidos(bigint) is
  'Marca como lidos os avisos com id <= p_ate para o admin logado (379). Monotonica (greatest), limitada ao maior id existente. So admin (42501); p_ate null/negativo = 22023. Devolve {lido_ate, nao_lidos}.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) gps.config_definir — allowlist 18 → 19 (corpo VIVO da …371 + 1 chave)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mesma assinatura (text, text): substitui e preserva ACL; revoke/grant
-- reaplicados iguais aos da …357. A guarda da seção 0 conferiu o corpo vivo.
create or replace function gps.config_definir(p_chave text, p_valor text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_chave is null or p_chave not in (
    'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
    'minuta_contexto_obrigatorio',
    'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
    'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
    -- Agenda de Sessões (…293 e …294). Desligar `sessoes_email_ativo` é o
    -- freio de mão do disparo por cron; as outras duas relaxam exigências
    -- de fluxo sem deploy.
    'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao',
    -- Pré-visualização INLINE de documento na ficha do cliente (…310). Lido
    -- por `gps.documento_inline_ativo()`. AUSENTE = LIGADO: desligar faz a
    -- equipe voltar a só BAIXAR o documento; a leitura continua existindo.
    'documento_inline_ativo',
    -- Avisos no computador (…357; desde a …379 vale para todo aviso com
    -- push). AUSENTE = DESLIGADO.
    'push_chamados_ativo',
    -- Gerador de minutas (…357). AUSENTE = LIGADO.
    'gerador_minutas_ativo',
    -- Central de avisos da equipe — sino, pop-up e push (…379). AUSENTE = DESLIGADO.
    'avisos_equipe_ativo'
  ) then raise exception 'Este interruptor não existe.' using errcode='22023'; end if;
  if p_valor not in ('true','false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode='22023'; end if;
  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('interruptor_alterado', null,
    format('interruptor "%s" definido para %s', p_chave, p_valor), auth.uid());
end; $function$;

revoke all on function gps.config_definir(text, text) from public, anon;
grant execute on function gps.config_definir(text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) Realtime — a tabela entra na publicação (o cliente usa como sinal)
-- ═══════════════════════════════════════════════════════════════════════════
do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise warning '379: publicação supabase_realtime não existe — o sino funciona por consulta, sem sinal em tempo real.';
  elsif (select p.puballtables from pg_publication p where p.pubname = 'supabase_realtime') then
    null;  -- FOR ALL TABLES já cobre
  elsif not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime'
                       and schemaname = 'gps' and tablename = 'equipe_avisos') then
    alter publication supabase_realtime add table gps.equipe_avisos;
  end if;
end;
$realtime$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) Expurgo de 90 dias + lidos órfãos — pg_cron diário 07:41 UTC (04:41 BRT)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.avisos_expurgar()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_n integer;
begin
  delete from gps.equipe_avisos a
   where a.criado_em < now() - interval '90 days';
  get diagnostics v_n = row_count;

  -- Marca de leitura de quem deixou de ser admin ativo.
  delete from gps.equipe_avisos_lidos l
   where not exists (select 1 from gps.admins ad where ad.user_id = l.user_id and ad.ativo);

  return v_n;
end;
$function$;

revoke all on function gps.avisos_expurgar() from public, anon, authenticated, service_role;

comment on function gps.avisos_expurgar() is
  'Apaga avisos da equipe com mais de 90 dias e marcas de leitura de quem nao e mais admin ativo (379). Interna: so o pg_cron (postgres). Devolve quantos avisos sairam.';

select cron.unschedule('avisos-equipe-expurgo')
 where exists (select 1 from cron.job where jobname = 'avisos-equipe-expurgo');

select cron.schedule(
  'avisos-equipe-expurgo',
  '41 7 * * *',
  $cron$ select gps.avisos_expurgar(); $cron$
);

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA (rodar DEPOIS de aplicar, numa STRING ÚNICA — o MCP é autocommit).
-- Tudo dentro de begin … rollback: liga o interruptor só na transação,
-- semeia linhas e desfaz. ⚠️ `explain analyze` em DML EXECUTA o DML: aqui só
-- há explain de SELECT/RPC estável, e mesmo assim dentro do rollback.
-- Resultados: NÃO executados por quem escreveu (executor sem acesso ao banco).
-- ═══════════════════════════════════════════════════════════════════════════
-- begin;
-- -- push fora do caminho (pg_net só sai no commit, e aqui é rollback — mesmo assim):
-- insert into gps.config (chave, valor) values ('avisos_equipe_ativo', 'true')
--   on conflict (chave) do update set valor = 'true';
-- create temp table _p (k text primary key, v text) on commit drop;
-- -- membro NÃO-equipe com ambiente (o "aluno") e um admin ativo:
-- insert into _p select 'aluno_user', m.user_id::text from gps.membros m
--   where m.user_id is not null and not gps.aviso_e_equipe(m.user_id) limit 1;
-- insert into _p select 'aluno_amb', m.aluno_id::text from gps.membros m
--   where m.user_id = (select v::uuid from _p where k = 'aluno_user');
-- insert into _p select 'admin_user', a.user_id::text from gps.admins a where a.ativo limit 1;
-- insert into _p select 'cliente', c.id::text from gps.etapa1_clientes c
--   where c.aluno_id = (select v::uuid from _p where k = 'aluno_amb') limit 1;
-- select * from _p;                                   -- esperado: 4 linhas
--
-- -- P1. evento de ALUNO → 1 aviso (o select vem em comando SEPARADO do insert)
-- with e as (
--   insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
--   values ((select v::uuid from _p where k='aluno_amb'), now(), 'cliente_minuta_anexada', 'cliente',
--           (select v::uuid from _p where k='cliente'), 'PROVA 379', '{}'::jsonb, 'aluno',
--           (select v::uuid from _p where k='aluno_user'), 'app')
--   returning id)
-- insert into _p select 'evento', id::text from e;
-- select count(*) as p1_avisos, min(tipo), min(url), min(resumo)
--   from gps.equipe_avisos where origem_id = 'aluno_eventos:' || (select v from _p where k='evento');
-- -- esperado: 1 · minuta_anexada · /admin/aluno/<amb>/clientes/<cliente> · "<Primeiro> anexou uma minuta para revisão"
--
-- -- P2. mesma origem de novo → 0 (idempotente)
-- select gps.aviso_registrar('minuta_anexada', null, null, '/admin', 'x',
--        'aluno_eventos:' || (select v from _p where k='evento')) as p2_id;   -- esperado: NULL
-- select count(*) as p2_total from gps.equipe_avisos
--  where origem_id = 'aluno_eventos:' || (select v from _p where k='evento'); -- esperado: 1
--
-- -- P3. ator EQUIPE → 0 (gravado como 'equipe' e, defesa, como 'aluno' com user admin)
-- with e as (
--   insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
--   values ((select v::uuid from _p where k='aluno_amb'), now(), 'cliente_minuta_anexada', 'cliente', null, 'PROVA 379', null, 'equipe',
--           (select v::uuid from _p where k='admin_user'), 'app'),
--          ((select v::uuid from _p where k='aluno_amb'), now(), 'cliente_minuta_anexada', 'cliente', null, 'PROVA 379', null, 'aluno',
--           (select v::uuid from _p where k='admin_user'), 'app'),
--          ((select v::uuid from _p where k='aluno_amb'), now(), 'cliente_minuta_anexada', 'cliente', null, 'PROVA 379', null, 'aluno',
--           (select v::uuid from _p where k='aluno_user'), 'backfill')
--   returning id)
-- insert into _p select 'p3_' || row_number() over (), id::text from e;
-- -- (contar em OUTRO comando: o gatilho AFTER roda no fim do comando que insere)
-- select count(*) as p3_avisos from gps.equipe_avisos a
--   join _p on _p.k like 'p3\_%' and a.origem_id = 'aluno_eventos:' || _p.v;          -- esperado: 0
-- -- P3b. sessão cancelada pela EQUIPE/responsável não vira aviso (só por='aluno'):
-- --      conferido por leitura do corpo (sessao_cancelar grava detalhe.por).
--
-- -- P4. interruptor desligado → 0
-- update gps.config set valor = 'false' where chave = 'avisos_equipe_ativo';
-- select gps.aviso_registrar('aluno_novo', null, null, '/admin', 'x', 'prova:379:desligado') as p4_id; -- esperado: NULL
-- update gps.config set valor = 'true' where chave = 'avisos_equipe_ativo';
--
-- -- P5. NÃO-admin lendo → 0 linhas na tabela e 42501 nas RPCs
-- select set_config('request.jwt.claims',
--   json_build_object('sub', (select v from _p where k='aluno_user'), 'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select count(*) as p5_linhas from gps.equipe_avisos;          -- esperado: 0
-- select count(*) as p5_tipos  from gps.aviso_tipos;            -- esperado: 0
-- savepoint s; select gps.avisos_listar(30);  rollback to savepoint s;   -- esperado: ERRO 42501
-- savepoint s; select gps.avisos_contar();    rollback to savepoint s;   -- esperado: ERRO 42501
-- savepoint s; select gps.avisos_marcar_lidos(1); rollback to savepoint s; -- esperado: ERRO 42501
-- savepoint s; insert into gps.equipe_avisos (tipo, url, resumo, origem_id)
--   values ('aluno_novo', '/admin', 'x', 'prova:direto'); rollback to savepoint s; -- esperado: ERRO 42501 (permission denied)
-- reset role;
--
-- -- P6. ADMIN lendo + explain da RPC (2 passadas, colar a 2ª)
-- select set_config('request.jwt.claims',
--   json_build_object('sub', (select v from _p where k='admin_user'), 'role', 'authenticated')::text, true);
-- set local role authenticated;
-- select gps.avisos_listar(30) -> 'nao_lidos' as p6_nao_lidos, jsonb_array_length(gps.avisos_listar(30) -> 'itens') as p6_itens;
-- explain (analyze, buffers) select gps.avisos_listar(30);
-- explain (analyze, buffers) select gps.avisos_listar(30);
-- select gps.avisos_marcar_lidos(9223372036854775807);           -- esperado: {lido_ate = max(id), nao_lidos 0}
-- select gps.avisos_contar();                                    -- esperado: nao_lidos 0
-- reset role;
-- -- corpo da RPC, como postgres (plano das consultas internas):
-- explain (analyze, buffers) select a.id from gps.equipe_avisos a order by a.id desc limit 30;
-- explain (analyze, buffers) select count(*) from (select 1 from gps.equipe_avisos a where a.id > 0 limit 100) s;
-- explain (analyze, buffers) select count(*) from (select 1 from gps.equipe_avisos a where a.criado_em > now() - interval '7 days' limit 100) s;
-- rollback;
--
-- -- Fora da transação (só leitura):
-- -- P7. gatilho antigo saiu e os novos existem
-- select tgrelid::regclass, tgname from pg_trigger
--  where tgname in ('trg_chamado_mensagens_push','trg_chamado_mensagens_aviso','trg_aluno_eventos_aviso',
--                   'trg_sessao_eventos_aviso','trg_ambientes_aviso','trg_plantao_inscricoes_aviso','trg_equipe_avisos_push')
--  order by 2;                                -- esperado: 6 linhas, SEM trg_chamado_mensagens_push
-- -- P8. grants das 3 tabelas (esperado: authenticated só SELECT em equipe_avisos e aviso_tipos; nada mais)
-- select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--  where table_schema = 'gps' and table_name in ('aviso_tipos','equipe_avisos','equipe_avisos_lidos')
--    and grantee in ('PUBLIC','anon','authenticated','service_role')
--  group by 1, 2 order by 1, 2;
-- -- P9. ACL das funções novas: nenhuma entrada de PUBLIC (começa com '=') nem anon
-- select p.proname, p.proacl::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'gps' and (p.proname like 'aviso%' or p.proname like 'avisos%'
--        or p.proname in ('push_preparar_aviso','equipe_avisos_push_trg'))
--    and (exists (select 1 from unnest(p.proacl) a where a::text like '=%' or a::text like 'anon=%')
--         or p.proacl is null);                -- esperado: 0 linhas
-- -- P10. Realtime e cron
-- select * from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'equipe_avisos'; -- 1 linha
-- select jobname, schedule, active from cron.job where jobname = 'avisos-equipe-expurgo';                   -- 1 linha
-- -- P11. interruptores vivos (antes de ligar)
-- select chave, valor from gps.config where chave in ('avisos_equipe_ativo','push_chamados_ativo');
-- -- ⚠️ se push_chamados_ativo = 'true', o push de chamado PAROU na aplicação desta
-- --    migração; volta ao ligar avisos_equipe_ativo (o caminho novo).

-- ═══ Medido em produção (08/10/2026), semente de 12.000 avisos (10× o vivo
--     previsto em 90 dias) dentro de begin…rollback, como admin ═══
-- avisos_listar(30)                         → 0,913 ms (shared hit=22)
-- avisos_contar + marcar_lidos + contar      → 4,791 ms (shared hit=87);
--   máximo por Index Only Scan Backward em equipe_avisos_pkey.
-- Semente desfeita: 0 linhas 'semente:%' depois.
-- ═══ Prova do Realtime de ponta a ponta (08/10/2026, produção) ═══
-- Script Node com supabase-js: sessão de ADMIN (joao@) e de NÃO-admin
-- (qa.sessoes@) assinando postgres_changes INSERT em gps.equipe_avisos;
-- 1 aviso COMMITADO (tipo plantao_inscricao, sem push) e apagado em seguida.
--   1ª tentativa: os dois SUBSCRIBED, 0 recebidos — o insert veio antes de o
--   Realtime religar o streaming ("Stopping Postgres Changes streaming … no
--   active subscriptions" no log): aquecimento de alguns segundos no 1º assinante.
--   2ª (insert 12 s após SUBSCRIBED): admin recebeu 1, não-admin recebeu 0.
-- Consequência: aviso no aquecimento não vira pop-up; o contador é salvo pelo
-- poll lento (300 s) — por isso o poll fica sempre ligado.
