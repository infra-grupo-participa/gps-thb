-- ═══════════════════════════════════════════════════════════════════════════
-- …356 — Chamado com CLIENTE DE REFERÊNCIA (opcional). João, 06/10/2026.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ENTRA ────────────────────────────────────────────────────────────
--   1. gps.chamados + cliente_id (FK gps.etapa1_clientes, ON DELETE SET NULL),
--      cliente_definido_em, cliente_definido_por (FK auth.users, SET NULL) +
--      índice PARCIAL idx_chamados_cliente (where cliente_id is not null).
--   2. gps.chamado_definir_cliente(p_chamado_id, p_cliente_id) — RPC NOVA,
--      molde de gps.chamado_fechar: `for update` no chamado; quem pode =
--      admin OU membro do ambiente dono (guardas com coalesce — guarda nula
--      falha ABERTA, lição de 22/09); fechado → 42501; categoria
--      troca_cliente/troca_socio → 22023; cliente fora do ambiente do
--      chamado → 22023; mesmo valor → no-op; null limpa. NÃO toca
--      ultima_mensagem_em, NÃO devolve e-mail, NÃO passa pelo interruptor.
--   3. gps.chamado_abrir — + p_cliente_id uuid default null (9º parâmetro).
--      Corpo de partida: o VIVO (pg_get_functiondef, md5
--      4defbc8b48665dbd1ce676271d9e0b6c), não o arquivo …250. A GUARDA aborta
--      se o vivo divergir. Drop da assinatura de 8 + create da de 9: sem o
--      drop viraria SOBRECARGA e a chamada de 8 argumentos seguiria viva.
--
-- ── LOCKS ──────────────────────────────────────────────────────────────────
--   As FKs pegam SHARE ROW EXCLUSIVE em gps.etapa1_clientes (a tabela mais
--   quente) e em auth.users (login dos 7 sistemas) até o COMMIT. Por isso o
--   ALTER TABLE é o ÚLTIMO comando que pega lock de tabela, e a transação
--   inteira é DDL de milissegundos. lock_timeout 5s: se não pegar, aborta
--   inteira (nada aplicado), sem enfileirar escrita atrás de si.
--
-- ── REVERTER ───────────────────────────────────────────────────────────────
--   1. TS: reverter o commit (a action deixa de mandar p_cliente_id).
--   2. drop function gps.chamado_abrir(text,text,text,text,text,integer,text,uuid,uuid);
--      + reaplicar o corpo de 8 parâmetros (scratchpad chamado_abrir_vivo.sql /
--      …250) com o MESMO revoke/grant de baixo.
--   3. drop function gps.chamado_definir_cliente(uuid, uuid);
--   4. drop index gps.idx_chamados_cliente;
--      alter table gps.chamados drop column cliente_definido_por,
--        drop column cliente_definido_em, drop column cliente_id;
--      (perde o vínculo gravado — arquivar antes, se já houver uso.)
--   🔴 Ordem de publicação: ESTA migração ANTES do TS (o select do TS embute
--   `etapa1_clientes!chamados_cliente_id_fkey` e quebra sem a FK).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ── GUARDAS ────────────────────────────────────────────────────────────────
do $guarda$
declare
  v_md5 text;
  v_n   int;
begin
  -- GUARDA 1: uma sobrecarga só de chamado_abrir (a de 8 parâmetros).
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'chamado_abrir';
  if v_n <> 1 then
    raise exception '…356 abortada: gps.chamado_abrir tem % sobrecargas (esperado 1)', v_n;
  end if;

  -- GUARDA 2: o corpo vivo é o que esta migração copiou.
  select md5(pg_get_functiondef(
           'gps.chamado_abrir(text,text,text,text,text,integer,text,uuid)'::regprocedure))
    into v_md5;
  if v_md5 is distinct from '4defbc8b48665dbd1ce676271d9e0b6c' then
    raise exception '…356 abortada: corpo vivo de gps.chamado_abrir mudou (md5 %). Refazer a partir do pg_get_functiondef atual.', v_md5;
  end if;

  -- GUARDA 3: colunas ainda não existem (reaplicação explícita, nunca silenciosa).
  if exists (select 1 from pg_attribute
              where attrelid = 'gps.chamados'::regclass
                and attname in ('cliente_id', 'cliente_definido_em', 'cliente_definido_por')
                and not attisdropped) then
    raise exception '…356 abortada: gps.chamados já tem coluna cliente_*';
  end if;
end;
$guarda$;

-- ── 1. RPC nova: gps.chamado_definir_cliente ───────────────────────────────
-- (plpgsql resolve gps.chamados%rowtype em tempo de execução: as colunas novas
-- entram no ALTER TABLE do fim, na MESMA transação.)
create or replace function gps.chamado_definir_cliente(p_chamado_id uuid, p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamado gps.chamados%rowtype;
begin
  if p_chamado_id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  -- Inexistente e alheio respondem IGUAL: sem oráculo de existência.
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  -- 🔴 coalesce nas DUAS pernas: sem JWT, aluno_atual() é null e
  -- `null = uuid` é null; `not (null or null)` é null e o IF não dispara —
  -- a guarda falharia ABERTA (lição de 22/09, sessao_pode_agendar).
  if not (coalesce(public.gp_is_admin(), false)
          or coalesce(gps.aluno_atual() = v_chamado.aluno_id, false)) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if v_chamado.status = 'fechado' then
    raise exception 'Este chamado está fechado: o cliente de referência não pode mais ser alterado.'
      using errcode = '42501';
  end if;

  -- Troca de cliente/sócio já carrega o alvo em gps.chamado_solicitacoes;
  -- um segundo "cliente" no mesmo chamado seria ambíguo para a equipe.
  if v_chamado.categoria in ('troca_cliente', 'troca_socio') then
    raise exception 'Chamado de troca de cliente ou de sócio não leva cliente de referência.'
      using errcode = '22023';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from gps.etapa1_clientes e
     where e.id = p_cliente_id and e.aluno_id = v_chamado.aluno_id
  ) then
    raise exception 'O cliente escolhido não pertence a este ambiente.'
      using errcode = '22023';
  end if;

  -- Mesmo valor (inclusive null → null): nada muda, nem o carimbo.
  if v_chamado.cliente_id is not distinct from p_cliente_id then
    return;
  end if;

  -- null LIMPA o vínculo; em/por registram quem mexeu por último.
  -- ultima_mensagem_em fica INTACTO: definir cliente não é mensagem e não
  -- pode reordenar a fila nem simular "o parceiro respondeu".
  update gps.chamados c
     set cliente_id           = p_cliente_id,
         cliente_definido_em  = now(),
         cliente_definido_por = auth.uid()
   where c.id = p_chamado_id;
end;
$$;

comment on function gps.chamado_definir_cliente(uuid, uuid) is
  'Liga (ou limpa, com null) o cliente de referencia de um chamado. Admin OU membro do ambiente dono (guardas com coalesce). Fechado -> 42501; categoria troca_cliente/troca_socio -> 22023; cliente de outro ambiente -> 22023; mesmo valor -> no-op. Nao toca ultima_mensagem_em, nao avisa ninguem, nao passa pelo interruptor chamados_aberto. Tambem chamada por gps.chamado_abrir (p_cliente_id).';

revoke all     on function gps.chamado_definir_cliente(uuid, uuid) from public, anon;
grant  execute on function gps.chamado_definir_cliente(uuid, uuid) to authenticated;

-- ── 2. gps.chamado_abrir: + p_cliente_id ───────────────────────────────────
drop function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid);

create function gps.chamado_abrir(
  p_assunto       text,
  p_texto         text,
  p_anexo_path    text    default null::text,
  p_anexo_nome    text    default null::text,
  p_anexo_mime    text    default null::text,
  p_anexo_tamanho integer default null::integer,
  p_categoria     text    default 'outros'::text,
  p_alvo_novo_id  uuid    default null::uuid,
  p_cliente_id    uuid    default null::uuid
)
 RETURNS TABLE(chamado_id uuid, avisar_equipe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_aluno_id      uuid;
  v_abertos       integer;
  v_novo          uuid;
  v_tipo          text;
  v_atual_id      uuid;
  v_atual_rotulo  text;
  v_novo_rotulo   text;
  v_alvo_existe   boolean;
  v_socio_id      uuid;
begin
  v_aluno_id := gps.aluno_atual();
  if v_aluno_id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if not gps.chamados_abertos() then
    raise exception 'o suporte por chamado esta temporariamente fechado' using errcode = '42501';
  end if;

  if p_assunto is null or length(btrim(p_assunto)) < 3 or length(btrim(p_assunto)) > 120 then
    raise exception 'o assunto precisa ter de 3 a 120 caracteres' using errcode = '22023';
  end if;

  select count(*) into v_abertos
    from gps.chamados c
   where c.aluno_id = v_aluno_id and c.status <> 'fechado';
  if v_abertos >= 5 then
    raise exception 'voce ja tem 5 chamados em aberto' using errcode = '42501';
  end if;

  if p_categoria is null or p_categoria not in ('sistema','troca_cliente','troca_socio','outros') then
    raise exception 'categoria invalida' using errcode = '22023';
  end if;

  if p_categoria = 'troca_cliente' then
    v_tipo := 'troca_cliente';

    select true, c.nome into v_alvo_existe, v_novo_rotulo
      from gps.etapa1_clientes c
     where c.id = p_alvo_novo_id and c.aluno_id = v_aluno_id;
    if not coalesce(v_alvo_existe, false) then
      raise exception 'o cliente escolhido nao pertence ao seu ambiente' using errcode = '22023';
    end if;

    select c.id, c.nome into v_atual_id, v_atual_rotulo
      from gps.etapa1_clientes c
     where c.aluno_id = v_aluno_id and c.acompanhado_equipe;
    if v_atual_id is null then
      raise exception 'seu ambiente ainda nao tem cliente acompanhado -- a primeira escolha e livre, nao precisa de chamado' using errcode = '22023';
    end if;

    if v_atual_id = p_alvo_novo_id then
      raise exception 'este ja e o cliente acompanhado pela equipe' using errcode = '22023';
    end if;

    if exists (
      select 1 from gps.chamado_solicitacoes s
       where s.ambiente_aluno_id = v_aluno_id and s.tipo = v_tipo and s.estado = 'pendente'
    ) then
      raise exception 'voce ja tem uma solicitacao de troca de cliente pendente' using errcode = '42501';
    end if;

  elsif p_categoria = 'troca_socio' then
    v_tipo := 'troca_socio';

    if not exists (
      select 1 from gps.membros m
       where m.aluno_id = v_aluno_id and m.papel = 'titular' and m.user_id = auth.uid()
    ) then
      raise exception 'so o titular do ambiente pode pedir troca de socio' using errcode = '42501';
    end if;

    select m.id into v_socio_id
      from gps.membros m
     where m.aluno_id = v_aluno_id and m.papel = 'socio'
     limit 1;
    if v_socio_id is null then
      raise exception 'seu ambiente nao tem socio para trocar' using errcode = '22023';
    end if;
    v_atual_id := v_socio_id;

    select coalesce(nullif(btrim(a.nome), ''), u.email, 'Socio sem nome')
      into v_atual_rotulo
      from gps.membros m
      left join public.thb_alunos a on a.id = m.pessoa_aluno_id
      left join auth.users       u on u.id = m.user_id
     where m.id = v_socio_id;

    v_novo_rotulo := null;

    if exists (
      select 1 from gps.chamado_solicitacoes s
       where s.ambiente_aluno_id = v_aluno_id and s.tipo = v_tipo and s.estado = 'pendente'
    ) then
      raise exception 'voce ja tem uma solicitacao de troca de socio pendente' using errcode = '42501';
    end if;
  end if;

  insert into gps.chamados (aluno_id, aberto_por, assunto, categoria)
  values (v_aluno_id, auth.uid(), btrim(p_assunto), p_categoria)
  returning id into v_novo;

  -- …356: cliente de referência opcional. As MESMAS regras da RPC de
  -- definir (ambiente, categoria de troca) — uma fonte só. Falha aqui desfaz
  -- o chamado inteiro: nada de chamado aberto "sem o cliente que o parceiro
  -- escolheu".
  if p_cliente_id is not null then
    perform gps.chamado_definir_cliente(v_novo, p_cliente_id);
  end if;

  if v_tipo is not null then
    insert into gps.chamado_solicitacoes
      (chamado_id, ambiente_aluno_id, tipo, alvo_atual_id, alvo_novo_id,
       alvo_atual_rotulo, alvo_novo_rotulo)
    values
      (v_novo, v_aluno_id, v_tipo, v_atual_id,
       case when v_tipo = 'troca_cliente' then p_alvo_novo_id else null end,
       left(nullif(btrim(coalesce(v_atual_rotulo, '')), ''), 300),
       left(nullif(btrim(coalesce(v_novo_rotulo, '')), ''), 300));
  end if;

  perform gps.chamado_gravar_mensagem(
    v_novo, 'aluno', p_texto,
    p_anexo_path, p_anexo_nome, p_anexo_mime, p_anexo_tamanho);

  return query
    select v_novo,
           nullif(btrim(coalesce(
             (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'),
             '')), '');
end;
$function$;

comment on function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid, uuid) is
  'Abre um chamado no ambiente do aluno logado (titular OU socio). Guardas: gps.aluno_atual() nao nulo, interruptor gps.chamados_abertos(), 5 chamados nao-fechados por ambiente, categoria na allowlist; troca_cliente exige alvo do PROPRIO ambiente, diferente do favorito atual e ambiente COM favorito; troca_socio exige socio existente e quem pede ser o TITULAR; 1 solicitacao pendente por ambiente+tipo. Cria gps.chamado_solicitacoes na MESMA transacao para troca_*. p_cliente_id (…356, opcional): liga o cliente de referencia via gps.chamado_definir_cliente (mesmas regras). Devolve id e e-mails da equipe para a action avisar DEPOIS do commit -- a funcao nao manda e-mail.';

-- ACL igual ao vivo: postgres (dono), authenticated, service_role; sem PUBLIC/anon.
revoke all     on function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid, uuid) from public, anon;
grant  execute on function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid, uuid) to authenticated, service_role;

-- ── 3. Colunas + índice (por último: segura lock de etapa1_clientes/auth.users) ─
alter table gps.chamados
  add column cliente_id uuid null
    constraint chamados_cliente_id_fkey
    references gps.etapa1_clientes(id) on delete set null,
  add column cliente_definido_em timestamptz null,
  add column cliente_definido_por uuid null
    constraint chamados_cliente_definido_por_fkey
    references auth.users(id) on delete set null;

comment on column gps.chamados.cliente_id is
  'Cliente de referencia do chamado (opcional, 1 no maximo), do MESMO ambiente (gps.chamado_definir_cliente confere). ON DELETE SET NULL: excluir o cliente nao apaga o chamado. O nome da FK (chamados_cliente_id_fkey) e usado pelo embed do PostgREST em src/lib/chamados-data.ts -- renomear quebra a tela.';
comment on column gps.chamados.cliente_definido_em is
  'Ultima vez que cliente_id foi definido/trocado/limpo. Fica preenchido se o cliente for excluido depois (trilha).';
comment on column gps.chamados.cliente_definido_por is
  'auth.users de quem definiu/trocou/limpou por ultimo (parceiro ou equipe). SET NULL: admin_excluir_acesso apaga auth.users.';

-- Parcial: quase todo chamado nasce sem cliente. Serve o ON DELETE SET NULL
-- (a FK procura `cliente_id = $1` a cada exclusão de cliente — sem índice,
-- Seq Scan em chamados por cliente apagado) e um futuro "chamados deste cliente".
create index idx_chamados_cliente
  on gps.chamados (cliente_id) where cliente_id is not null;

notify pgrst, 'reload schema';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS (rodar DEPOIS de aplicar). Nada persiste: o bloco termina em RAISE.
-- ═══════════════════════════════════════════════════════════════════════════
-- do $prova$
-- declare
--   r       jsonb := '{}'::jsonb;
--   v_u1    uuid;  v_a1 uuid;   -- titular do ambiente 1
--   v_u2    uuid;  v_a2 uuid;   -- titular do ambiente 2
--   v_c1    uuid;  v_c2 uuid;   -- cliente de a1 / cliente de a2
--   v_ch    uuid;  v_chf uuid;  v_cht uuid;
--   v_ult   timestamptz;
--   v_ab    uuid;
-- begin
--   set local lock_timeout = '2s';
--   set local statement_timeout = '30s';
--   select m.user_id, m.aluno_id into v_u1, v_a1 from gps.membros m
--    where m.papel = 'titular' and m.user_id is not null
--      and not exists (select 1 from public.perfis p where p.id = m.user_id)
--    order by m.aluno_id limit 1;
--   select m.user_id, m.aluno_id into v_u2, v_a2 from gps.membros m
--    where m.papel = 'titular' and m.user_id is not null and m.aluno_id <> v_a1
--      and not exists (select 1 from public.perfis p where p.id = m.user_id)
--    order by m.aluno_id limit 1;
--   insert into gps.etapa1_clientes (aluno_id, nome) values (v_a1, 'T356 C1') returning id into v_c1;
--   insert into gps.etapa1_clientes (aluno_id, nome) values (v_a2, 'T356 C2') returning id into v_c2;
--   insert into gps.chamados (aluno_id, aberto_por, assunto, categoria, ultima_mensagem_em)
--     values (v_a1, v_u1, 'T356 aberto', 'sistema', now() - interval '1 day') returning id into v_ch;
--   insert into gps.chamados (aluno_id, aberto_por, assunto, categoria, status, fechado_em)
--     values (v_a1, v_u1, 'T356 fechado', 'outros', 'fechado', now()) returning id into v_chf;
--   insert into gps.chamados (aluno_id, aberto_por, assunto, categoria)
--     values (v_a1, v_u1, 'T356 troca', 'troca_socio') returning id into v_cht;
--   select ultima_mensagem_em into v_ult from gps.chamados where id = v_ch;
--
--   -- T0 superfície
--   r := r || jsonb_build_object('T0', jsonb_build_object(
--     'ids', v_a1 is not null and v_a2 is not null,
--     'anon_definir',  has_function_privilege('anon', 'gps.chamado_definir_cliente(uuid,uuid)', 'execute'),       -- false
--     'anon_abrir',    has_function_privilege('anon', 'gps.chamado_abrir(text,text,text,text,text,integer,text,uuid,uuid)', 'execute'), -- false
--     'auth_definir',  has_function_privilege('authenticated', 'gps.chamado_definir_cliente(uuid,uuid)', 'execute'), -- true
--     'acl_definir',   (select proacl::text from pg_proc where oid = 'gps.chamado_definir_cliente(uuid,uuid)'::regprocedure),
--     'acl_abrir',     (select proacl::text from pg_proc where oid = 'gps.chamado_abrir(text,text,text,text,text,integer,text,uuid,uuid)'::regprocedure),
--     'sobrecargas',   (select count(*) from pg_proc where proname = 'chamado_abrir' and pronamespace = 'gps'::regnamespace), -- 1
--     'auth_update',   has_table_privilege('authenticated', 'gps.chamados', 'update')));                           -- false
--
--   -- Como titular de a1
--   execute 'set local role authenticated';
--   perform set_config('request.jwt.claims', json_build_object('sub', v_u1, 'role', 'authenticated')::text, true);
--   begin perform gps.chamado_definir_cliente(v_ch, v_c2);  r := r || '{"T1_cliente_outro_ambiente":"PASSOU (ERRADO)"}';
--   exception when others then r := r || jsonb_build_object('T1_cliente_outro_ambiente', sqlstate); end;  -- 22023
--   begin perform gps.chamado_definir_cliente(v_chf, v_c1); r := r || '{"T3_fechado":"PASSOU (ERRADO)"}';
--   exception when others then r := r || jsonb_build_object('T3_fechado', sqlstate); end;                 -- 42501
--   begin perform gps.chamado_definir_cliente(v_cht, v_c1); r := r || '{"T4_troca":"PASSOU (ERRADO)"}';
--   exception when others then r := r || jsonb_build_object('T4_troca', sqlstate); end;                   -- 22023
--   perform gps.chamado_definir_cliente(v_ch, v_c1);                                                      -- OK
--   r := r || jsonb_build_object('T5_definiu', (select jsonb_build_object('cli', cliente_id = v_c1,
--          'por', cliente_definido_por = v_u1, 'ult_intacto', ultima_mensagem_em = v_ult)
--          from gps.chamados where id = v_ch));                                                          -- true/true/true
--   perform gps.chamado_definir_cliente(v_ch, null);
--   r := r || jsonb_build_object('T6_limpou', (select cliente_id is null from gps.chamados where id = v_ch)); -- true
--   -- abrir com cliente (exige interruptor aberto e < 5 abertos em a1)
--   begin
--     select c.chamado_id into v_ab from gps.chamado_abrir('T356 abrir', 'texto', null, null, null, null, 'sistema', null, v_c1) c;
--     r := r || jsonb_build_object('T7_abrir_com_cliente', (select cliente_id = v_c1 from gps.chamados where id = v_ab));
--   exception when others then r := r || jsonb_build_object('T7_abrir_com_cliente', sqlstate || ' ' || sqlerrm); end;
--   begin
--     perform gps.chamado_abrir('T356 abrir 2', 'texto', null, null, null, null, 'sistema', null, v_c2);
--     r := r || '{"T8_abrir_cliente_alheio":"PASSOU (ERRADO)"}';
--   exception when others then r := r || jsonb_build_object('T8_abrir_cliente_alheio', sqlstate); end;  -- 22023
--
--   -- Como titular de a2 (outro ambiente) sobre o chamado de a1
--   perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
--   begin perform gps.chamado_definir_cliente(v_ch, v_c2);  r := r || '{"T2_titular_outro_ambiente":"PASSOU (ERRADO)"}';
--   exception when others then r := r || jsonb_build_object('T2_titular_outro_ambiente', sqlstate); end;  -- 42501
--
--   -- Sem JWT (guarda não pode falhar aberta)
--   perform set_config('request.jwt.claims', '', true);
--   begin perform gps.chamado_definir_cliente(v_ch, v_c1);  r := r || '{"T9_sem_jwt":"PASSOU (ERRADO)"}';
--   exception when others then r := r || jsonb_build_object('T9_sem_jwt', sqlstate); end;                 -- 42501
--   execute 'reset role';
--
--   -- ON DELETE SET NULL (a trigger do Drive arquiva; o raise final desfaz)
--   update gps.chamados set cliente_id = v_c1 where id = v_ch;
--   delete from gps.etapa1_clientes where id = v_c1;
--   r := r || jsonb_build_object('T10_set_null', (select cliente_id is null from gps.chamados where id = v_ch));
--
--   raise exception 'PROVAS …356 (desfeito): %', r;
-- end;
-- $prova$;
--
-- EXPLAIN da fila com o embed (forma que o PostgREST gera para
-- `cliente:etapa1_clientes!chamados_cliente_id_fkey(nome)`). SELECT puro:
--
-- explain (analyze, buffers)
-- select c.id, c.aluno_id, c.status, c.ultima_mensagem_em, c.categoria,
--        c.cliente_id, c.cliente_definido_em, cl.nome as cliente_nome
--   from gps.chamados c
--   left join lateral (select e.nome from gps.etapa1_clientes e
--                       where e.id = c.cliente_id) cl on true
--  where c.status <> 'fechado'
--  order by c.ultima_mensagem_em
--  limit 500;
-- Esperado: Index Scan em idx_chamados_fila (ou Seq Scan + Sort, com a tabela
-- na ordem de centenas de linhas) + Index Scan em etapa1_clientes_pkey por
-- linha COM cliente (as sem cliente não tocam etapa1_clientes).
