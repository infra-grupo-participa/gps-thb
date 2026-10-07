-- ═══════════════════════════════════════════════════════════════════════════
-- 364 — Google Drive automático: pasta nasce com o ambiente + backfill aos poucos
-- ═══════════════════════════════════════════════════════════════════════════
-- Decisões do João (07/10, fechadas): a pasta do aluno nasce sozinha quando
-- nasce linha em gps.ambientes; backfill de TODOS os ambientes sem
-- pasta_drive_url, aos poucos; compartilhamento da edge fica como está (raiz
-- leitor, 1) DOCUMENTOS e 5) CLIENTES editor, convite por e-mail ligado); o
-- link "qualquer pessoa" da pasta-mãe não se mexe.
--
-- O QUE MUDA
--   a) gps.drive_tarefas.origem ('manual' | 'nascimento' | 'backfill'),
--      default 'manual' — o botão (drive_provisionar_parceiro) não muda.
--   b) gps.config: drive_auto_nascimento / drive_backfill_ativo = 'false',
--      drive_backfill_simultaneas = '1'. 🔴 NASCE DESLIGADO (as duas chaves).
--   c) gps.drive_ambiente_nasceu() + gatilho AFTER INSERT em gps.ambientes:
--      enfileira provisionar_parceiro (origem 'nascimento', proxima_em +1 min,
--      sem pg_net — o cron leva). Qualquer falha vira WARNING: o insert do
--      ambiente NUNCA falha por causa do Drive.
--   d) gps.drive_backfill_enfileirar(), chamada pelo gps.drive_varrer (cron
--      1 min): mantém no máximo N (drive_backfill_simultaneas, teto 10)
--      tarefas 'backfill' pendente/rodando. Só ambiente sem link, sem
--      NENHUMA tarefa provisionar_parceiro/compartilhar (qualquer estado: o
--      que deu erro não volta sozinho) e sem raiz_parceiro em drive_pastas.
--   e) gps.drive_tarefa_pegar: corpo da …350 com a ordenação priorizando
--      origem <> 'backfill' (o botão e o nascimento não esperam a fila do
--      backfill) e 'origem' no retorno (a edge conclui 'ja_tinha_pasta'
--      quando a tarefa automática encontra link colado depois).
--   f) gps.drive_pendencias(): placar + itens com erro/aviso para a tela
--      (só admin). Contrato do front — não renomear chaves.
--
-- FUNÇÕES RECRIADAS (com trava de md5 contra o vivo):
--   gps.drive_tarefa_pegar(int)  ← …350 seção 4
--   gps.drive_varrer()           ← …348 seção 1
-- FUNÇÕES NOVAS: gps.drive_ambiente_nasceu(), gps.drive_backfill_enfileirar(),
--   gps.drive_pendencias().
--
-- AS 5 PERGUNTAS
--   1. Escala: gps.ambientes na casa das centenas; drive_tarefas ganha 1
--      linha por ambiente no backfill. Backfill = 1 anti-join ambientes ×
--      drive_tarefas × drive_pastas por minuto, com LIMIT N.
--   2. Índice: drive_tarefas_aluno_idx (aluno_id, criado_em desc) serve o
--      NOT EXISTS por aluno e a "última tarefa" das pendências;
--      drive_pastas_parceiro_papel_uq (aluno_id, papel) serve o NOT EXISTS
--      da raiz. ambientes: seq scan (tabela pequena; medir no ensaio
--      20261007000364_ensaio.sql). Nenhum índice novo.
--   3. Frequência: backfill 1×/min SÓ com drive_ativo e a chave ligada (1
--      leitura de gps.config quando desligado); gatilho 1× por ambiente
--      criado; pendências sob demanda da tela de admin.
--   4. Repetição: o backfill nunca reenfileira o mesmo ambiente (qualquer
--      tarefa anterior o exclui); drive_tarefas_ativa_uq barra duplicata.
--   5. Reversão (sem deploy): desligar as chaves
--        update gps.config set valor = 'false'
--         where chave in ('drive_auto_nascimento', 'drive_backfill_ativo');
--      Para frear sem desligar: drive_backfill_simultaneas = '1'.
--
-- REVERSÃO (comentado — rodar à mão; arquivar, nunca apagar dado):
--   update gps.config set valor = 'false'
--    where chave in ('drive_auto_nascimento', 'drive_backfill_ativo');
--   drop trigger if exists trg_ambientes_drive_nasceu on gps.ambientes;
--   (recriar gps.drive_varrer com o corpo da …348 seção 1 e
--    gps.drive_tarefa_pegar com o corpo da …350 seção 4 — ANTES dos drops abaixo)
--   drop function if exists gps.drive_ambiente_nasceu();
--   drop function if exists gps.drive_backfill_enfileirar();
--   drop function if exists gps.drive_pendencias();
--   (coluna origem e chaves de config ficam: são trilha de quem criou cada
--    tarefa; com a pegar antiga a edge trata origem ausente como 'manual')
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Trava: corpos VIVOS = os do repo (com e sem as linhas '--')
-- ═══════════════════════════════════════════════════════════════════════════
-- drive_tarefa_pegar = …350 seção 4: 0a6af1613d499fa092b8c70906e431f2 / c1f510ccae3dc09a9fe5955f6e6ff93f
-- drive_varrer       = …348 seção 1: 8fff51c0903a0b5fe9cc8a153fac91b0 / a6e0ff658d1167c2daec12cafe90a4a7
do $$
declare
  v_peg text;
  v_var text;
begin
  select md5(p.prosrc) into v_peg from pg_proc p
   where p.oid = 'gps.drive_tarefa_pegar(int)'::regprocedure;
  select md5(p.prosrc) into v_var from pg_proc p
   where p.oid = 'gps.drive_varrer()'::regprocedure;
  if v_peg is null or v_peg not in ('0a6af1613d499fa092b8c70906e431f2', 'c1f510ccae3dc09a9fe5955f6e6ff93f') then
    raise exception 'drive_tarefa_pegar viva diverge da 350 (md5 %) -- migracao abortada; ler pg_get_functiondef e reconciliar', v_peg;
  end if;
  if v_var is null or v_var not in ('8fff51c0903a0b5fe9cc8a153fac91b0', 'a6e0ff658d1167c2daec12cafe90a4a7') then
    raise exception 'drive_varrer viva diverge da 348 (md5 %) -- migracao abortada; ler pg_get_functiondef e reconciliar', v_var;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) drive_tarefas.origem
-- ═══════════════════════════════════════════════════════════════════════════
-- Default constante: só metadado (não reescreve a tabela). O CHECK valida as
-- linhas existentes, todas 'manual'.
alter table gps.drive_tarefas
  add column origem text not null default 'manual'
    constraint drive_tarefas_origem_check
    check (origem in ('manual', 'nascimento', 'backfill'));

comment on column gps.drive_tarefas.origem is
  '…364: quem criou a tarefa. manual = botao/RPC; nascimento = gatilho trg_ambientes_drive_nasceu; backfill = drive_backfill_enfileirar (cron). Automatica (<> manual) nunca adota pasta (solicitado_por nulo) e a edge conclui ja_tinha_pasta se o ambiente ganhou link alheio antes de rodar.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Chaves (nascem desligadas)
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values
  ('drive_auto_nascimento',      'false'),
  ('drive_backfill_ativo',       'false'),
  ('drive_backfill_simultaneas', '1')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Nascimento: gatilho AFTER INSERT em gps.ambientes
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_ambiente_nasceu()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- Falha aqui NUNCA desfaz a criação do ambiente: vira WARNING.
  -- Sem pg_net: proxima_em +1 min e o cron (drive_varrer) cutuca a edge —
  -- dá tempo do fluxo que cria o ambiente gravar o titular em gps.membros.
  begin
    if new.pasta_drive_url is null
       and gps.drive_ativo()
       and coalesce((select btrim(c.valor) = 'true'
                       from gps.config c
                      where c.chave = 'drive_auto_nascimento'), false) then
      insert into gps.drive_tarefas (tipo, aluno_id, solicitado_por, origem, proxima_em)
      values ('provisionar_parceiro', new.aluno_id, null, 'nascimento', now() + interval '1 minute')
      on conflict do nothing;
    end if;
  exception when others then
    raise warning 'drive: pasta do ambiente % nao enfileirada (%): %', new.aluno_id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

comment on function gps.drive_ambiente_nasceu() is
  '…364: gatilho AFTER INSERT em gps.ambientes. Com drive_ativo(), gps.config drive_auto_nascimento = true e ambiente sem link, enfileira provisionar_parceiro (origem nascimento, solicitado_por nulo, proxima_em +1 min). Nunca chama pg_net; qualquer erro vira WARNING e o insert do ambiente segue.';

revoke all on function gps.drive_ambiente_nasceu() from public, anon, authenticated, service_role;

drop trigger if exists trg_ambientes_drive_nasceu on gps.ambientes;
create trigger trg_ambientes_drive_nasceu
  after insert on gps.ambientes
  for each row execute function gps.drive_ambiente_nasceu();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Backfill aos poucos (chamado pelo cron via drive_varrer)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_backfill_enfileirar()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_txt    text;
  v_lim    int := 1;
  v_ativas int;
  v_n      int := 0;
begin
  -- Nunca derruba o cron: qualquer falha vira WARNING e devolve 0.
  begin
    if not coalesce((select btrim(c.valor) = 'true'
                       from gps.config c
                      where c.chave = 'drive_backfill_ativo'), false) then
      return 0;
    end if;

    -- Valor inválido/ausente = 1; teto 10 (= teto de lote do drive_tarefa_pegar).
    select btrim(c.valor) into v_txt
      from gps.config c where c.chave = 'drive_backfill_simultaneas';
    if v_txt ~ '^[0-9]{1,4}$' then
      v_lim := least(v_txt::int, 10);
    end if;
    if v_lim < 1 then
      return 0;
    end if;

    select count(*) into v_ativas
      from gps.drive_tarefas t
     where t.origem = 'backfill'
       and t.estado in ('pendente', 'rodando');
    if v_ativas >= v_lim then
      return 0;
    end if;

    -- Qualquer tarefa anterior do parceiro (inclusive erro/feito) exclui o
    -- ambiente: o backfill nunca repete; erro volta só pelo botão.
    insert into gps.drive_tarefas (tipo, aluno_id, solicitado_por, origem)
    select 'provisionar_parceiro', a.aluno_id, null, 'backfill'
      from gps.ambientes a
     where a.pasta_drive_url is null
       and not exists (select 1 from gps.drive_tarefas t
                        where t.aluno_id = a.aluno_id
                          and t.tipo in ('provisionar_parceiro', 'compartilhar'))
       and not exists (select 1 from gps.drive_pastas p
                        where p.aluno_id = a.aluno_id
                          and p.papel = 'raiz_parceiro')
     order by a.criado_em nulls last, a.aluno_id
     limit v_lim - v_ativas
    -- drive_tarefas_ativa_uq: corrida com o botão/nascimento não duplica.
    on conflict do nothing;
    get diagnostics v_n = row_count;
  exception when others then
    raise warning 'drive: backfill nao enfileirou (%): %', sqlstate, sqlerrm;
    return 0;
  end;
  return v_n;
end;
$function$;

comment on function gps.drive_backfill_enfileirar() is
  '…364: chamada por gps.drive_varrer (cron 1 min). Com gps.config drive_backfill_ativo = true, completa ate drive_backfill_simultaneas (teto 10) tarefas provisionar_parceiro origem backfill pendente/rodando, para ambientes sem pasta_drive_url, sem nenhuma tarefa provisionar_parceiro/compartilhar e sem raiz_parceiro em drive_pastas, por ambientes.criado_em. Erro vira WARNING (devolve 0).';

revoke all on function gps.drive_backfill_enfileirar() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Varredura: corpo da …348 + backfill logo após o interruptor
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_varrer()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_n      int;
  v_ultimo timestamptz;
begin
  if not gps.drive_ativo() then
    return 0;
  end if;

  -- Backfill aos poucos (…364). A função já engole o próprio erro; o bloco
  -- aqui cobre a função ausente/sem permissão — nunca derruba o cron.
  begin
    perform gps.drive_backfill_enfileirar();
  exception when others then
    raise warning 'drive: backfill falhou (%): %', sqlstate, sqlerrm;
  end;

  -- Rodando há mais de 10 min = a edge morreu no meio (limite de parede).
  -- Volta para a fila contando a tentativa. Teto: 1 tentativa + 3
  -- retentativas; a 4ª falha vira erro (mesmo teto de drive_tarefa_concluir).
  update gps.drive_tarefas t
     set tentativas   = t.tentativas + 1,
         estado       = case when t.tentativas + 1 >= 4 then 'erro' else 'pendente' end,
         erro         = case when t.tentativas + 1 >= 4
                             then 'O Google Drive não respondeu a tempo. Tente de novo.'
                             else t.erro end,
         erro_detalhe = 'rodando abandonada (> 10 min)',
         concluido_em = case when t.tentativas + 1 >= 4 then now() else null end,
         proxima_em   = now()
   where t.estado = 'rodando'
     and t.iniciado_em < now() - interval '10 minutes';

  -- Revogação presa (…348): há permissão marcada viva (a tarefa 'revogar'
  -- anterior virou erro, ou o enfileirar do gatilho falhou) e nenhuma
  -- 'revogar' ativa. Teto 1/h pelo criado_em da última 'revogar': com
  -- credencial morta a fila cresce no máximo 24/dia, nunca 1/min.
  -- Ordem do mais barato/raro primeiro: sem item marcado, 1 index scan vazio.
  if exists (select 1 from gps.drive_permissoes p
              where p.revogar_desde is not null and p.revogado_em is null
                and p.tentativas < 4)
     and not exists (select 1 from gps.drive_tarefas t
                      where t.tipo = 'revogar' and t.estado in ('pendente', 'rodando')) then
    select t.criado_em into v_ultimo
      from gps.drive_tarefas t
     where t.tipo = 'revogar'
     order by t.criado_em desc
     limit 1;
    if v_ultimo is null or v_ultimo < now() - interval '1 hour' then
      insert into gps.drive_tarefas (tipo, aluno_id)
      values ('revogar', null)
      on conflict (tipo) where tipo = 'revogar' and estado in ('pendente', 'rodando') do nothing;
    end if;
  end if;

  select count(*) into v_n
    from (select 1 from gps.drive_tarefas
           where estado = 'pendente' and proxima_em <= now()
           limit 1) x;

  if v_n > 0 then
    perform gps.drive_chamar(null);
  end if;
  return v_n;
end;
$function$;

revoke all on function gps.drive_varrer() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) drive_tarefa_pegar: corpo da …350 (conferido acima) + prioridade + origem
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_tarefa_pegar(p_limite int default 3)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
  v_n   int;
begin
  if not gps.drive_ativo() then
    return '[]'::jsonb;
  end if;

  perform pg_advisory_xact_lock(hashtext('gps.drive_tarefa_pegar'));

  with cand as (
    select distinct on (t.aluno_id) t.id, t.proxima_em, t.origem
      from gps.drive_tarefas t
     where t.estado = 'pendente'
       and t.proxima_em <= now()
       -- 'revogar' tem aluno_id nulo: "is not distinct from" faz duas
       -- revogar nunca rodarem juntas (o conjunto rodando é minúsculo).
       and not exists (
         select 1 from gps.drive_tarefas r
          where r.aluno_id is not distinct from t.aluno_id and r.estado = 'rodando')
     -- …364: backfill por último (botão e nascimento não esperam a fila dele).
     order by t.aluno_id, (t.origem = 'backfill'), t.proxima_em
  ), lim as (
    select c.id from cand c
     order by (c.origem = 'backfill'), c.proxima_em
     limit least(greatest(coalesce(p_limite, 3), 1), 10)
  ), upd as (
    update gps.drive_tarefas t
       set estado = 'rodando', iniciado_em = now()
      from lim
     where t.id = lim.id
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from upd;

  -- E-mail trocado FORA do painel (updateUser, outro portal do grupo): nenhum
  -- gatilho do GPS vê. Ao processar provisionar/compartilhar, toda permissão
  -- viva que o sistema deu a quem não é mais (titular, mesmo e-mail atual)
  -- vira revogação. Aqui e não em drive_revogacoes_listar: a listagem só roda
  -- quando já existe tarefa 'revogar', e a troca externa não cria nenhuma.
  update gps.drive_permissoes p
     set revogar_desde = now(), revogar_motivo = 'email_trocado',
         tentativas = 0, erro_detalhe = null
   where p.revogado_em is null
     and p.revogar_desde is null
     and p.aluno_id in (select t.aluno_id from gps.drive_tarefas t
                         where t.id = any(v_ids)
                           and t.tipo in ('provisionar_parceiro', 'compartilhar'))
     and not exists (select 1
                       from gps.membros m
                       join auth.users u on u.id = m.user_id
                      where m.aluno_id = p.aluno_id
                        and m.user_id = p.user_id
                        and m.papel = 'titular'
                        and lower(btrim(u.email)) = p.email);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform gps.drive_revogar_enfileirar();
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',              t.id,
      'tipo',            t.tipo,
      'aluno_id',        t.aluno_id,
      'cliente_id',      t.cliente_id,
      -- …350: tarefa 'arquivar' (aluno_id nulo) leva a pasta aqui.
      'file_id',         t.file_id,
      -- …364: manual | nascimento | backfill (edge: ja_tinha_pasta).
      'origem',          t.origem,
      'tentativas',      t.tentativas,
      'parceiro_nome',   (select nullif(btrim(a.nome), '') from public.thb_alunos a where a.id = t.aluno_id),
      'pasta_drive_url', amb.pasta_drive_url,
      -- Adoção de pasta existente exige origem 'equipe' E pedido de admin
      -- (mesmo predicado de public.gp_is_admin, aplicado a quem pediu).
      'pasta_drive_origem', amb.pasta_drive_origem,
      'solicitado_por_admin', coalesce((select true from public.perfis p
                                         where p.id = t.solicitado_por
                                           and p.status = 'ativo'
                                           and p.cargo in ('dev', 'admin')), false),
      'titular_email',   (select lower(btrim(u.email))
                            from gps.membros m
                            join auth.users u on u.id = m.user_id
                           where m.aluno_id = t.aluno_id and m.papel = 'titular'
                           order by m.criado_em
                           limit 1),
      'cliente_nome',    (select nullif(btrim(c.nome), '') from gps.etapa1_clientes c where c.id = t.cliente_id),
      'cliente_link_url',(select l.url from gps.cliente_links_drive l
                           where l.cliente_id = t.cliente_id and l.removido_em is null),
      'pastas',          (select coalesce(jsonb_object_agg(p.papel,
                                   jsonb_build_object('file_id', p.file_id, 'adotada', p.adotada)), '{}'::jsonb)
                            from gps.drive_pastas p
                           where p.aluno_id = t.aluno_id
                             and p.papel in ('raiz_parceiro', 'documentos', 'clientes')),
      'pasta_cliente',   (select p.file_id from gps.drive_pastas p
                           where p.cliente_id = t.cliente_id and p.papel = 'raiz_cliente')
    ))
      from gps.drive_tarefas t
      left join gps.ambientes amb on amb.aluno_id = t.aluno_id
     where t.id = any(v_ids)
  ), '[]'::jsonb);
end;
$function$;

revoke all on function gps.drive_tarefa_pegar(int) from public, anon, authenticated;
grant execute on function gps.drive_tarefa_pegar(int) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Pendências para a tela de admin
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_pendencias()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_res jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Última tarefa do parceiro (provisionar/compartilhar) por aluno — mesma
  -- regra de gps.drive_estado (criado_em desc). CTE lido 2×, materializado 1×.
  with ult as (
    select distinct on (t.aluno_id)
           t.aluno_id, t.estado, t.erro, t.aviso, t.atualizado_em
      from gps.drive_tarefas t
     where t.aluno_id is not null
       and t.tipo in ('provisionar_parceiro', 'compartilhar')
     order by t.aluno_id, t.criado_em desc
  )
  select jsonb_build_object(
           'placar', (select jsonb_build_object(
                               'feitas',   count(*) filter (where u.estado = 'feito'),
                               'na_fila',  count(*) filter (where u.estado in ('pendente', 'rodando')),
                               'com_erro', count(*) filter (where u.estado = 'erro'),
                               'faltando', (select count(*) from gps.ambientes a
                                             where a.pasta_drive_url is null))
                        from ult u),
           'itens',  (select coalesce(jsonb_agg(jsonb_build_object(
                               'aluno_id',      x.aluno_id,
                               'nome',          x.nome,
                               'estado',        x.estado,
                               'erro',          x.erro,
                               'aviso',         x.aviso,
                               'atualizado_em', x.atualizado_em)
                             order by x.atualizado_em desc), '[]'::jsonb)
                        from (select u.aluno_id, u.estado, u.erro, u.aviso, u.atualizado_em,
                                     (select nullif(btrim(al.nome), '')
                                        from public.thb_alunos al
                                       where al.id = u.aluno_id) as nome
                                from ult u
                               where u.erro is not null or u.aviso is not null
                               order by u.atualizado_em desc
                               limit 200) x))
    into v_res;

  return v_res;
end;
$function$;

comment on function gps.drive_pendencias() is
  '…364: so admin (coalesce(gp_is_admin(),false), senao 42501). {placar:{feitas,na_fila,com_erro,faltando}, itens:[{aluno_id,nome,estado,erro,aviso,atualizado_em}]}. feitas/na_fila/com_erro contam alunos pela ULTIMA tarefa provisionar_parceiro/compartilhar (feito / pendente+rodando / erro); faltando = ambientes com pasta_drive_url nulo. itens = ultima tarefa com erro ou aviso, 200 mais recentes por atualizado_em. Contrato do front: nao renomear chaves.';

revoke all     on function gps.drive_pendencias() from public, anon, authenticated, service_role;
grant  execute on function gps.drive_pendencias() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- g) drive_provisionar_parceiro: o pedido do admin ASSUME a tarefa automática
--    pendente (achado BAIXO do kirad, 07/10). Antes, com uma tarefa de
--    nascimento/backfill na fila, o clique devolvia ela como estava: rodava
--    como automática e terminava em ja_tinha_pasta, sem adotar nem compartilhar.
--    Agora a pendente vira manual com o admin como solicitante (a edge passa a
--    tratar como pedido da equipe). Rodando: devolve como antes. Partiu da
--    definição VIVA (pg_get_functiondef, 07/10); só o bloco "já existe" mudou.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_provisionar_parceiro(p_aluno_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid    uuid    := auth.uid();
  v_admin  boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_url    text;
  v_raiz   text;
  v_tipo   text;
  v_id     uuid;
  v_origem text;
  v_estado text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if not v_admin then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;
  if not gps.drive_ativo() then
    raise exception 'A criação automática de pastas está desligada.' using errcode = 'P0001';
  end if;

  select a.pasta_drive_url into v_url
    from gps.ambientes a
   where a.aluno_id = p_aluno_id;
  if not found then
    raise exception 'Ambiente não encontrado.' using errcode = 'P0002';
  end if;

  -- Já existe uma ativa (qualquer dos dois tipos do parceiro)? Devolve ela;
  -- se for automática e ainda pendente, o pedido do admin a assume.
  select t.id, t.origem, t.estado into v_id, v_origem, v_estado
    from gps.drive_tarefas t
   where t.aluno_id = p_aluno_id
     and t.tipo in ('provisionar_parceiro', 'compartilhar')
     and t.estado in ('pendente', 'rodando')
   limit 1;
  if v_id is not null then
    if v_origem <> 'manual' and v_estado = 'pendente' then
      update gps.drive_tarefas
         set origem = 'manual', solicitado_por = v_uid, proxima_em = now()
       where id = v_id and estado = 'pendente';
    end if;
    return v_id;
  end if;

  select p.file_id into v_raiz
    from gps.drive_pastas p
   where p.aluno_id = p_aluno_id and p.papel = 'raiz_parceiro';

  v_tipo := case
              when v_raiz is not null and v_url is not null
                   and position(v_raiz in v_url) > 0
              then 'compartilhar'
              else 'provisionar_parceiro'
            end;

  begin
    insert into gps.drive_tarefas (tipo, aluno_id, solicitado_por)
    values (v_tipo, p_aluno_id, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select t.id into v_id
      from gps.drive_tarefas t
     where t.aluno_id = p_aluno_id and t.tipo = v_tipo
       and t.estado in ('pendente', 'rodando')
     limit 1;
    return v_id;
  end;

  -- Cutucada nunca derruba o pedido: a tarefa gravada é o que garante; o cron repassa.
  begin
    perform gps.drive_chamar(v_id);
  exception when others then
    raise warning 'drive: cutucada falhou (%); fica para o cron', sqlstate;
  end;

  return v_id;
end;
$function$;

revoke all     on function gps.drive_provisionar_parceiro(uuid) from public, anon;
grant  execute on function gps.drive_provisionar_parceiro(uuid) to authenticated;

commit;
