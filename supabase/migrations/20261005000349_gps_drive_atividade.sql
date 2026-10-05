-- ═══════════════════════════════════════════════════════════════════════════
-- 349 — Google Drive, Fase 2: atividade nas pastas dos clientes
-- ═══════════════════════════════════════════════════════════════════════════
-- O banco NÃO fala com o Google. A edge `drive-atividade` lê o feed de
-- mudanças (changes.list) da conta joao@ e entrega cada página a
-- gps.drive_atividade_aplicar, que:
--   * acha o pai imediato do item em gps.drive_pastas (raiz_cliente /
--     sub_cliente de cliente vivo) ou em gps.drive_arquivos (pasta criada pelo
--     usuário dentro da árvore do cliente);
--   * fora da árvore conhecida → descarta (ou marca removido, se já existia);
--   * removed/trashed → removido (pasta: a subárvore junto);
--   * movido → atualiza a subpasta (pasta: a subárvore junto);
--   * grava os itens E avança o cursor na MESMA transação, só se o cursor
--     atual for p_token_lido (trava otimista; senão P0001).
-- A 1ª execução (cursor vazio) só marca o ponto de partida: o que já existia
-- antes de ligar NÃO é atividade e não é inventariado.
--
-- 🔴 NASCE DESLIGADO: gps.config.drive_atividade_ativo = 'false'. Desligado,
-- o cron retorna na 1ª linha, pegar devolve null e aplicar recusa (P0001).
-- Ligar (depois do deploy da edge drive-atividade; o segredo do Vault
-- `gps_drive_segredo` é o mesmo da 347):
--   update gps.config set valor = 'true' where chave = 'drive_atividade_ativo';
--
-- Leitura: view gps.vw_cliente_drive_atividade (security_invoker; RLS de
-- drive_arquivos = cópia da de gps.cliente_trajetoria). Mapa da sugestão de
-- etapa (decisão do João) vive na view: 03 → elaboracao_minutas,
-- 05 → junta_comercial, 06 → entrega_pasta; 01/02/04 sem sugestão.
--
-- DOWN (comentado — rodar à mão; arquivar, nunca dropar tabela com dado):
--   update gps.config set valor = 'false' where chave = 'drive_atividade_ativo';
--   select cron.unschedule('drive-atividade');
--   drop view if exists gps.vw_cliente_drive_atividade;
--   drop function if exists gps.drive_atividade_aplicar(jsonb, text, text, text);
--   drop function if exists gps.drive_atividade_pegar();
--   drop function if exists gps.drive_atividade_chamar();
--   drop function if exists gps.drive_atividade_ativo();
--   alter table gps.drive_arquivos rename to drive_arquivos_arquivo_<data>;
--   alter table gps.drive_cursor   rename to drive_cursor_arquivo_<data>;
--   alter table gps.drive_pastas drop column sub_chave;
--   drop function if exists gps.drive_sub_chave(text, text);
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Config
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values
  ('drive_atividade_ativo', 'false'),
  ('drive_atividade_url',   'https://mbvybujpkwuorhtdzcde.supabase.co/functions/v1/drive-atividade')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) drive_pastas.sub_chave — coluna GERADA a partir do nome fixo
-- ═══════════════════════════════════════════════════════════════════════════
-- Nomes fixos de ESTRUTURA_CLIENTE (supabase/functions/drive-provisionar/
-- provisionar.ts). Gerada = backfill das linhas existentes E das futuras sem
-- recriar gps.drive_pasta_registrar. Subpasta renomeada à mão antes do
-- registro → null (os arquivos dela são descartados; a verificação conta).
create or replace function gps.drive_sub_chave(p_papel text, p_nome text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
           when p_papel is distinct from 'sub_cliente' then null
           when lower(btrim(p_nome)) = 'pessoais'                 then '01p'
           when lower(btrim(p_nome)) in ('imóveis', 'imoveis')    then '01i'
           when lower(btrim(p_nome)) = 'empresas'                 then '01e'
           when btrim(p_nome) ~ '^0[1-6] '                        then left(btrim(p_nome), 2)
         end;
$function$;

revoke all on function gps.drive_sub_chave(text, text) from public, anon, authenticated, service_role;

alter table gps.drive_pastas
  add column sub_chave text generated always as (gps.drive_sub_chave(papel, nome)) stored;

comment on column gps.drive_pastas.sub_chave is
  'Gerada (…349) de papel+nome: 01, 01p, 01i, 01e, 02..06 para sub_cliente; null nos demais papeis ou nome fora do padrao.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.drive_arquivos — o que existe dentro da árvore de cada cliente
-- ═══════════════════════════════════════════════════════════════════════════
-- cliente_id/aluno_id ON DELETE CASCADE (decisão do João): a lista some com o
-- cliente. modificado_por_nome: só o nome de exibição do Google; texto com
-- '@' é descartado (nunca e-mail).
create table gps.drive_arquivos (
  file_id             text        primary key
    constraint drive_arquivos_file_id_formato check (file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  cliente_id          uuid        not null references gps.etapa1_clientes(id) on delete cascade,
  aluno_id            uuid        not null references gps.ambientes(aluno_id) on delete cascade,
  pasta_file_id       text        not null
    constraint drive_arquivos_pasta_formato check (pasta_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  subpasta            text        not null
    constraint drive_arquivos_subpasta_check check (subpasta in ('raiz', '01', '02', '03', '04', '05', '06')),
  sub_chave           text
    constraint drive_arquivos_sub_chave_check check (sub_chave is null or sub_chave in ('01', '01p', '01i', '01e', '02', '03', '04', '05', '06')),
  nome                text        not null
    constraint drive_arquivos_nome_check check (char_length(nome) between 1 and 200 and nome !~ '[[:cntrl:]]'),
  mime                text
    constraint drive_arquivos_mime_check check (mime is null or (char_length(mime) <= 200 and mime !~ '[[:cntrl:]]')),
  eh_pasta            boolean     not null default false,
  modificado_em       timestamptz not null,
  modificado_por_nome text
    constraint drive_arquivos_por_check check (modificado_por_nome is null
      or (char_length(modificado_por_nome) between 1 and 120 and modificado_por_nome !~ '[[:cntrl:]@]')),
  removido            boolean     not null default false,
  removido_em         timestamptz,
  visto_em            timestamptz not null default now(),
  criado_em           timestamptz not null default now(),
  constraint drive_arquivos_removido_coerente check (removido = (removido_em is not null)),
  constraint drive_arquivos_subpasta_coerente
    check ((subpasta = 'raiz') = (sub_chave is null) and (sub_chave is null or left(sub_chave, 2) = subpasta))
);

comment on table gps.drive_arquivos is
  'Arquivos e pastas (criadas pelo usuario) dentro da arvore do cliente no Drive (…349). Escrita SO por gps.drive_atividade_aplicar (service_role, edge drive-atividade). authenticated le pela RLS (admin ou dono do cliente) e pela view gps.vw_cliente_drive_atividade. visto_em = ultima vez que o item veio no feed de mudancas. Removido e soft (removido/removido_em).';

-- Serve a view (agrupamento por cliente+subpasta, último por modificado_em)
-- E o cascade do cliente (não parcial: o DELETE do cascade não traz o
-- predicado "not removido").
create index drive_arquivos_cliente_idx
  on gps.drive_arquivos (cliente_id, subpasta, modificado_em desc);
create index drive_arquivos_modificado_idx
  on gps.drive_arquivos (modificado_em desc);
-- Subárvore (pasta movida/removida/restaurada).
create index drive_arquivos_pasta_idx
  on gps.drive_arquivos (pasta_file_id);
-- Cascade do ambiente.
create index drive_arquivos_aluno_idx
  on gps.drive_arquivos (aluno_id);

alter table gps.drive_arquivos enable row level security;

-- Cópia da policy de gps.cliente_trajetoria (…345).
create policy drive_arquivos_select on gps.drive_arquivos
  for select to authenticated
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.etapa1_clientes c
       where c.id = drive_arquivos.cliente_id
         and c.aluno_id = gps.aluno_atual()
    )
  );

-- Tabela nova nasce gravável (default privileges): revoke nomeando PUBLIC.
revoke all    on table gps.drive_arquivos from public, anon, authenticated, service_role;
grant  select on table gps.drive_arquivos to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.drive_cursor — linha única
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.drive_cursor (
  id            boolean     primary key default true
    constraint drive_cursor_unica check (id),
  page_token    text
    constraint drive_cursor_token_formato check (page_token is null or (char_length(page_token) <= 500 and page_token ~ '^[!-~]+$')),
  rodando_desde timestamptz,
  ultimo_erro   text
    constraint drive_cursor_erro_check check (ultimo_erro is null or char_length(ultimo_erro) <= 300),
  atualizado_em timestamptz not null default now()
);

comment on table gps.drive_cursor is
  'Cursor do feed de mudancas do Drive (…349). Linha unica. page_token null = ainda nao comecou. rodando_desde = trava de 10 min (drive_atividade_pegar); aplicar solta. Escrita SO pelas RPCs drive_atividade_*. So admin le.';

insert into gps.drive_cursor (id) values (true) on conflict do nothing;

alter table gps.drive_cursor enable row level security;

create policy drive_cursor_admin_select on gps.drive_cursor
  for select to authenticated
  using (coalesce(public.gp_is_admin(), false));

revoke all    on table gps.drive_cursor from public, anon, authenticated, service_role;
grant  select on table gps.drive_cursor to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Internas: interruptor e cutucada (cron)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.drive_atividade_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select btrim(c.valor) = 'true'
                     from gps.config c
                    where c.chave = 'drive_atividade_ativo'), false);
$function$;

revoke all on function gps.drive_atividade_ativo() from public, anon, authenticated, service_role;

-- Cron (5 min). Desligado = 1 leitura de config. Execução em curso (trava
-- viva) = não cutuca. Corpo vazio: a edge ignora o corpo.
create or replace function gps.drive_atividade_chamar()
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
  if not gps.drive_atividade_ativo() then
    return null;
  end if;
  if exists (select 1 from gps.drive_cursor c
              where c.id and c.rodando_desde >= now() - interval '10 minutes') then
    return null;
  end if;

  select nullif(btrim(valor), '') into v_url from gps.config where chave = 'drive_atividade_url';
  v_segredo := gps.drive_segredo();
  if v_url is null or v_segredo is null then
    raise warning 'drive-atividade: url ou segredo ausente';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-drive-segredo', v_segredo),
    timeout_milliseconds := 10000
  ) into v_req;
  return v_req;
end;
$function$;

revoke all on function gps.drive_atividade_chamar() from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) RPCs da edge — SÓ service_role
-- ═══════════════════════════════════════════════════════════════════════════

-- 6.1) Trava (10 min) e devolve o token.
--   null                          desligado, ou outra execução com a trava viva
--   {"page_token": null|text}     null = 1ª vez (a edge pega o token inicial
--                                 e aplica p_itens=[], p_token_lido=null)
create or replace function gps.drive_atividade_pegar()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_tok text;
begin
  if not gps.drive_atividade_ativo() then
    return null;
  end if;

  update gps.drive_cursor c
     set rodando_desde = now()
   where c.id
     and (c.rodando_desde is null or c.rodando_desde < now() - interval '10 minutes')
  returning c.page_token into v_tok;
  if not found then
    return null;
  end if;

  return jsonb_build_object('page_token', v_tok);
end;
$function$;

-- 6.2) Aplica uma página do feed e avança o cursor (mesma transação).
-- p_itens: array (até 1000) de
--   { file_id, removed, trashed, eh_pasta, nome, mime, parent_id,
--     modificado_em, modificado_por_nome }
-- Removido chega só com file_id + removed:true (resto nulo): nunca cria linha.
-- p_erro (opcional): grava ultimo_erro, solta a trava, NÃO mexe no token.
-- Devolve {gravados, removidos, descartados, passadas}.
create or replace function gps.drive_atividade_aplicar(
  p_itens      jsonb,
  p_token_lido text,
  p_token_novo text,
  p_erro       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_atual     text;
  v_pend      jsonb;
  v_prox      jsonb;
  v_pastas    text[];
  v_it        jsonb;
  v_passada   int     := 0;
  v_forcar    boolean := false;
  v_progresso boolean;
  v_file      text;
  v_pai       text;
  v_rem       boolean;
  v_pasta     boolean;
  v_nome      text;
  v_mime      text;
  v_mod       timestamptz;
  v_por       text;
  v_cli       uuid;
  v_alu       uuid;
  v_sub       text;
  v_chave     text;
  v_existia   boolean;
  v_old       record;
  v_grav      int := 0;
  v_remov     int := 0;
  v_desc      int := 0;
  v_erro      text;
begin
  if not gps.drive_atividade_ativo() then
    raise exception 'A leitura de atividade do Drive está desligada.' using errcode = 'P0001';
  end if;

  if p_erro is not null then
    v_erro := nullif(left(btrim(regexp_replace(p_erro, '[[:cntrl:]]', ' ', 'g')), 300), '');
    update gps.drive_cursor c
       set ultimo_erro = coalesce(v_erro, 'erro sem detalhe'), rodando_desde = null, atualizado_em = now()
     where c.id;
    return jsonb_build_object('erro_gravado', true);
  end if;

  if p_token_novo is null or char_length(p_token_novo) > 500 or p_token_novo !~ '^[!-~]+$' then
    raise exception 'token novo invalido' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens invalidos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 1000 then
    raise exception 'itens demais (max 1000)' using errcode = '22023';
  end if;

  -- Trava otimista: só avança do token que a execução leu.
  select c.page_token into v_atual from gps.drive_cursor c where c.id for update;
  if not found then
    raise exception 'cursor ausente' using errcode = 'P0002';
  end if;
  if v_atual is distinct from p_token_lido then
    raise exception 'O cursor do Drive mudou (outra execução avançou).' using errcode = 'P0001';
  end if;

  -- Pastas (não removidas) presentes no lote: filho que vem antes do pai
  -- espera a próxima passada.
  select coalesce(array_agg(e->>'file_id'), '{}') into v_pastas
    from jsonb_array_elements(p_itens) e
   where jsonb_typeof(e) = 'object'
     and (e->'eh_pasta' = 'true'::jsonb or e->>'mime' = 'application/vnd.google-apps.folder')
     and e->'removed' is distinct from 'true'::jsonb
     and e->'trashed' is distinct from 'true'::jsonb;

  v_pend := p_itens;
  loop
    v_passada   := v_passada + 1;
    v_prox      := '[]'::jsonb;
    v_progresso := false;

    for v_it in select e from jsonb_array_elements(v_pend) e loop
      if jsonb_typeof(v_it) <> 'object' then
        v_desc := v_desc + 1; continue;
      end if;
      v_file := v_it->>'file_id';
      if v_file is null or v_file !~ '^[A-Za-z0-9_-]{10,200}$' then
        v_desc := v_desc + 1; continue;
      end if;
      -- Pasta do sistema (raiz/subpasta do cliente, pastas do parceiro): não é arquivo.
      if exists (select 1 from gps.drive_pastas p where p.file_id = v_file) then
        v_desc := v_desc + 1; continue;
      end if;

      v_rem := v_it->'removed' = 'true'::jsonb or v_it->'trashed' = 'true'::jsonb;
      v_rem := coalesce(v_rem, false);
      v_pai := v_it->>'parent_id';
      if v_pai is not null and v_pai !~ '^[A-Za-z0-9_-]{10,200}$' then
        v_pai := null;
      end if;

      v_cli := null; v_alu := null; v_sub := null; v_chave := null;
      if not v_rem and v_pai is not null then
        select p.cliente_id, p.aluno_id,
               case when p.papel = 'raiz_cliente' then 'raiz' else left(p.sub_chave, 2) end,
               case when p.papel = 'raiz_cliente' then null else p.sub_chave end
          into v_cli, v_alu, v_sub, v_chave
          from gps.drive_pastas p
         where p.file_id = v_pai
           and p.cliente_id is not null
           and p.aluno_id is not null
           and (p.papel = 'raiz_cliente' or (p.papel = 'sub_cliente' and p.sub_chave is not null));
        if v_cli is null then
          select a.cliente_id, a.aluno_id, a.subpasta, a.sub_chave
            into v_cli, v_alu, v_sub, v_chave
            from gps.drive_arquivos a
           where a.file_id = v_pai and a.file_id <> v_file
             and a.eh_pasta and not a.removido;
        end if;
        if v_cli is null and not v_forcar and v_pai = any (v_pastas) then
          v_prox := v_prox || jsonb_build_array(v_it);
          continue;
        end if;
      end if;

      select a.cliente_id, a.subpasta, a.sub_chave, a.removido, a.removido_em, a.eh_pasta
        into v_old
        from gps.drive_arquivos a
       where a.file_id = v_file
       for update;
      v_existia := found;

      -- Removido, lixeira ou fora da árvore conhecida.
      if v_rem or v_cli is null then
        if v_existia and not v_old.removido then
          update gps.drive_arquivos
             set removido = true, removido_em = now(), visto_em = now()
           where file_id = v_file;
          if v_old.eh_pasta then
            with recursive d(file_id) as (
              select a.file_id from gps.drive_arquivos a where a.pasta_file_id = v_file
              union
              select a.file_id from gps.drive_arquivos a join d on a.pasta_file_id = d.file_id
            )
            update gps.drive_arquivos a
               set removido = true, removido_em = now(), visto_em = now()
              from d
             where a.file_id = d.file_id and not a.removido;
          end if;
          v_remov := v_remov + 1;
          v_progresso := true;
        else
          v_desc := v_desc + 1;
        end if;
        continue;
      end if;

      v_pasta := coalesce(v_it->'eh_pasta' = 'true'::jsonb, false)
                 or coalesce(v_it->>'mime' = 'application/vnd.google-apps.folder', false);
      v_nome  := left(btrim(regexp_replace(coalesce(v_it->>'nome', ''), '[[:cntrl:]]', ' ', 'g')), 200);
      if v_nome = '' then
        v_nome := 'Sem nome';
      end if;
      v_mime  := nullif(left(btrim(regexp_replace(coalesce(v_it->>'mime', ''), '[[:cntrl:]]', '', 'g')), 200), '');
      v_por   := nullif(left(btrim(regexp_replace(coalesce(v_it->>'modificado_por_nome', ''), '[[:cntrl:]]', ' ', 'g')), 120), '');
      if v_por ~ '@' then
        v_por := null;
      end if;
      v_mod := case
                 when v_it->>'modificado_em' ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$'
                 then (v_it->>'modificado_em')::timestamptz
                 else now()
               end;

      insert into gps.drive_arquivos
        (file_id, cliente_id, aluno_id, pasta_file_id, subpasta, sub_chave, nome, mime,
         eh_pasta, modificado_em, modificado_por_nome, removido, removido_em, visto_em)
      values
        (v_file, v_cli, v_alu, v_pai, v_sub, v_chave, v_nome, v_mime,
         v_pasta, v_mod, v_por, false, null, now())
      on conflict (file_id) do update
         set cliente_id = excluded.cliente_id, aluno_id = excluded.aluno_id,
             pasta_file_id = excluded.pasta_file_id, subpasta = excluded.subpasta,
             sub_chave = excluded.sub_chave, nome = excluded.nome, mime = excluded.mime,
             eh_pasta = excluded.eh_pasta, modificado_em = excluded.modificado_em,
             modificado_por_nome = excluded.modificado_por_nome,
             removido = false, removido_em = null, visto_em = now();
      v_grav := v_grav + 1;
      v_progresso := true;

      -- Pasta que mudou de lugar ou voltou da lixeira: a subárvore acompanha.
      -- Restaurada: volta só o que caiu junto com ela (mesmo removido_em).
      if v_pasta and v_existia
         and ((v_old.cliente_id, v_old.subpasta, v_old.sub_chave) is distinct from (v_cli, v_sub, v_chave)
              or v_old.removido) then
        with recursive d(file_id) as (
          select a.file_id from gps.drive_arquivos a where a.pasta_file_id = v_file
          union
          select a.file_id from gps.drive_arquivos a join d on a.pasta_file_id = d.file_id
        )
        update gps.drive_arquivos a
           set cliente_id = v_cli, aluno_id = v_alu, subpasta = v_sub, sub_chave = v_chave,
               removido = false, removido_em = null, visto_em = now()
          from d
         where a.file_id = d.file_id
           and (not a.removido or (v_old.removido and a.removido_em = v_old.removido_em));
      end if;
    end loop;

    exit when jsonb_array_length(v_prox) = 0;
    -- Sem progresso (pai nunca resolve) ou profundidade absurda: a próxima
    -- passada trata o que sobrou como fora da árvore.
    if not v_progresso or v_passada >= 20 then
      v_forcar := true;
    end if;
    v_pend := v_prox;
  end loop;

  update gps.drive_cursor c
     set page_token = p_token_novo, rodando_desde = null, ultimo_erro = null, atualizado_em = now()
   where c.id;

  return jsonb_build_object('gravados', v_grav, 'removidos', v_remov,
                            'descartados', v_desc, 'passadas', v_passada);
end;
$function$;

comment on function gps.drive_atividade_aplicar(jsonb, text, text, text) is
  'Edge drive-atividade (…349), so service_role. Aplica ate 1000 itens do feed de mudancas do Drive em gps.drive_arquivos e move gps.drive_cursor de p_token_lido para p_token_novo na MESMA transacao; cursor diferente de p_token_lido -> P0001. Pai em drive_pastas (raiz_cliente/sub_cliente de cliente e ambiente vivos) ou em drive_arquivos (pasta do usuario); fora da arvore -> descarta ou marca removido. removed/trashed -> removido (subarvore junto). Pasta movida/restaurada -> subarvore acompanha. Solta a trava. p_erro: so grava ultimo_erro e solta a trava. Desligado -> P0001.';

revoke all     on function gps.drive_atividade_pegar() from public, anon, authenticated;
revoke all     on function gps.drive_atividade_aplicar(jsonb, text, text, text) from public, anon, authenticated;
grant  execute on function gps.drive_atividade_pegar() to service_role;
grant  execute on function gps.drive_atividade_aplicar(jsonb, text, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) View para o front (security_invoker: vale a RLS de drive_arquivos e de
--    cliente_trajetoria do usuário)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma linha por (cliente, subpasta) com pelo menos um item vivo.
-- ultima_alteracao_03_em: por cliente (repetida em cada linha dele), conta
-- também a remoção na 03.
-- sugere_etapa: a etapa do mapa quando a subpasta tem ARQUIVO (pasta vazia
-- não conta) e a etapa não está marcada em cliente_trajetoria.
create view gps.vw_cliente_drive_atividade
with (security_invoker = true)
as
select g.cliente_id,
       g.subpasta,
       g.arquivos,
       g.pastas,
       g.ultima_modificacao_em,
       (select a.modificado_por_nome
          from gps.drive_arquivos a
         where a.cliente_id = g.cliente_id and a.subpasta = g.subpasta and not a.removido
         order by a.modificado_em desc
         limit 1)                                              as ultima_modificacao_por,
       (select max(greatest(a.modificado_em, coalesce(a.removido_em, a.modificado_em)))
          from gps.drive_arquivos a
         where a.cliente_id = g.cliente_id and a.subpasta = '03') as ultima_alteracao_03_em,
       case
         when g.arquivos > 0 and m.etapa is not null
              and not exists (select 1 from gps.cliente_trajetoria tr
                               where tr.cliente_id = g.cliente_id
                                 and tr.etapa_codigo = m.etapa
                                 and tr.desmarcado_em is null)
         then m.etapa
       end                                                      as sugere_etapa
  from (select a.cliente_id,
               a.subpasta,
               (count(*) filter (where not a.eh_pasta))::int as arquivos,
               (count(*) filter (where a.eh_pasta))::int     as pastas,
               max(a.modificado_em)                          as ultima_modificacao_em
          from gps.drive_arquivos a
         where not a.removido
         group by a.cliente_id, a.subpasta) g
  left join (values ('03', 'elaboracao_minutas'),
                    ('05', 'junta_comercial'),
                    ('06', 'entrega_pasta')) m(subpasta, etapa)
         on m.subpasta = g.subpasta;

comment on view gps.vw_cliente_drive_atividade is
  'Atividade do Drive por (cliente_id, subpasta) (…349). security_invoker: RLS de drive_arquivos (admin ou dono do cliente) e de cliente_trajetoria. Colunas: cliente_id, subpasta (raiz|01..06), arquivos, pastas, ultima_modificacao_em, ultima_modificacao_por (so nome), ultima_alteracao_03_em (por cliente), sugere_etapa (03 elaboracao_minutas, 05 junta_comercial, 06 entrega_pasta; so com arquivo e etapa nao marcada). Filtrar por cliente_id.';

revoke all    on table gps.vw_cliente_drive_atividade from public, anon, authenticated, service_role;
grant  select on table gps.vw_cliente_drive_atividade to authenticated;

commit;

-- Cron: a cada 5 min. Desligado = 1 leitura de config.
select cron.unschedule('drive-atividade')
 where exists (select 1 from cron.job where jobname = 'drive-atividade');

select cron.schedule(
  'drive-atividade',
  '*/5 * * * *',
  $cron$ select gps.drive_atividade_chamar(); $cron$
);
