-- ═══════════════════════════════════════════════════════════════════════════
-- Links do Google Drive na FICHA DO CLIENTE — N por cliente, com nome.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ENTRA ────────────────────────────────────────────────────────────
--   1. gps.drive_url_normalizar(text)  IMMUTABLE — limpa e valida o link.
--   2. gps.cliente_links_drive         tabela; RLS só SELECT; escrita só RPC.
--   3. gps.cliente_link_drive_adicionar(uuid, text, text) → jsonb
--   4. gps.cliente_link_drive_remover(uuid) → void (soft delete)
--   5. aluno_eventos_tipo_check + cliente_link_drive_adicionado/_removido,
--      recriado a partir do CHECK VIVO (nunca de memória).
--   6. gps.sessao_briefing_ler ganha a chave irmã `links_drive_ao_vivo`.
--
-- ── 🔴 ANTES DE APLICAR ────────────────────────────────────────────────────
--   O corpo de gps.sessao_briefing_ler (seção 6) parte da …313. Conferir com
--     select pg_get_functiondef('gps.sessao_briefing_ler(uuid)'::regprocedure);
--   A seção 6 tem uma GUARDA automática: compara o md5 do corpo vivo (sem
--   espaço/quebra de linha) com o da …313 e ABORTA a migração inteira se
--   divergir — alguém mexeu na função por MCP depois de 24/09 e o corpo
--   abaixo apagaria essa mudança. Se abortar: remonte a seção 6 sobre o corpo
--   vivo e troque o hash.
--
-- ── REGRA DOS 3 LUGARES (URL) ──────────────────────────────────────────────
--   A regra de URL do Drive vive em: (a) CHECK ambientes_pasta_drive_url_formato
--   (…20260930180726), (b) CHECK cliente_links_drive_url_formato (cópia literal,
--   trocando só o nome da coluna) e (c) gps.drive_url_normalizar. A seção 2 tem
--   uma guarda que compara (a) e (b) por pg_get_constraintdef e aborta se
--   divergirem. (c) é plpgsql e não dá para comparar por deparse: a prova P4
--   confere a função contra o CHECK com entradas de borda.
--
-- ── REVERSÃO (reversível, nada é apagado do que já existia) ────────────────
--   -- sessao_briefing_ler: reaplicar o corpo da …313 (create or replace; NÃO dropar).
--   drop function if exists gps.cliente_link_drive_adicionar(uuid, text, text);
--   drop function if exists gps.cliente_link_drive_remover(uuid);
--   -- a tabela pode FICAR (sem RPC ninguém escreve); se for mesmo sair:
--   --   alter table gps.cliente_links_drive rename to cliente_links_drive_arquivada;
--   drop function if exists gps.drive_url_normalizar(text);  -- só depois da tabela/RPC
--   -- os 2 valores no CHECK do diário podem FICAR (valor a mais não quebra;
--   -- tirar exige apagar trilha).
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '20s';


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.drive_url_normalizar(text)
-- ═══════════════════════════════════════════════════════════════════════════
-- btrim (espaço, tab, CR, LF nas pontas) → sem esquema e começando por
-- drive.google.com/ ou docs.google.com/ ganha https:// → http:// vira https://
-- → host em minúsculas → resto preservado byte a byte (inclusive ?usp=).
-- Devolve NULL se o resultado não passar na regra dos 3 lugares.
-- Entrada > 4096 sai NULL antes de qualquer regex (o teto de 2048 é aplicado
-- ao RESULTADO, que pode ter ganho 8 caracteres de https://).
create or replace function gps.drive_url_normalizar(p_url text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $function$
declare
  v    text;
  v_r  text;
  v_h  text;
begin
  if p_url is null or length(p_url) > 4096 then
    return null;
  end if;

  v := btrim(p_url, E' \t\r\n');
  if v = '' then
    return null;
  end if;

  if v ~* '^(drive|docs)\.google\.com/' then
    v := 'https://' || v;
  end if;

  if v ~* '^https?://' then
    v_r := regexp_replace(v, '^https?://', '', 'i');
    v_h := substring(v_r from '^[^/?#]*');
    v   := 'https://' || lower(v_h) || substr(v_r, length(v_h) + 1);
  end if;

  -- 🔗 idêntico ao CHECK ambientes_pasta_drive_url_formato e ao
  --    cliente_links_drive_url_formato (seção 2). Mudou lá, muda aqui.
  if  v ~ '^https://(drive|docs)\.google\.com/'
  and v !~ '^https://(drive|docs)\.google\.com/url'
  and v !~* '(/\.{1,2}(/|\?|#|$)|%2e|\\)'
  and v !~ '\s'
  and length(v) <= 2048 then
    return v;
  end if;
  return null;
end;
$function$;

comment on function gps.drive_url_normalizar(text) is
  'Normaliza link do Google Drive: btrim (espaco/tab/CR/LF), prefixa https:// quando comeca por drive.google.com/ ou docs.google.com/, http:// -> https://, host em minusculas, resto preservado (inclusive ?usp=). Devolve NULL se o resultado nao passar na regra do CHECK ambientes_pasta_drive_url_formato (copiada aqui; mudou la, muda aqui). Teto 2048 no resultado. IMMUTABLE, sem acesso a tabela.';

revoke all     on function gps.drive_url_normalizar(text) from public, anon;
grant  execute on function gps.drive_url_normalizar(text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.cliente_links_drive
-- ═══════════════════════════════════════════════════════════════════════════
-- `aluno_id` é desnormalizado do cliente no INSERT (só a RPC escreve). A RLS
-- NÃO o usa: decide pela linha viva de etapa1_clientes, como a minuta — se o
-- cliente mudar de ambiente, a leitura acompanha o cliente, não a coluna.
create table gps.cliente_links_drive (
  id              uuid        primary key default gen_random_uuid(),
  cliente_id      uuid        not null references gps.etapa1_clientes(id) on delete cascade,
  aluno_id        uuid        not null,
  nome            text        not null
    constraint cliente_links_drive_nome_check
    check (char_length(nome) between 1 and 120 and nome !~ '[[:cntrl:]]'),
  url             text        not null
    constraint cliente_links_drive_url_formato check (
      url is null
      or (
            url ~ '^https://(drive|docs)\.google\.com/'
        and url !~ '^https://(drive|docs)\.google\.com/url'
        -- segmento de ponto (`/x/../url` vira `/url` no navegador), `%2e` e `\`
        and url !~* '(/\.{1,2}(/|\?|#|$)|%2e|\\)'
        and url !~ '\s'
        and length(url) <= 2048
      )
    ),
  origem          text        not null
    constraint cliente_links_drive_origem_check
    check (origem in ('equipe', 'parceiro')),
  criado_em       timestamptz not null default now(),
  criado_por      uuid,
  criado_por_nome text,
  removido_em     timestamptz,
  removido_por    uuid
);

comment on table gps.cliente_links_drive is
  'Links do Google Drive da ficha do cliente (N por cliente, com nome). Escrita SO por gps.cliente_link_drive_adicionar/_remover (SECURITY DEFINER); authenticated tem SELECT apenas, filtrado pela RLS (admin ou membro do ambiente do cliente). Remocao e SOFT (removido_em/removido_por): toda leitura filtra removido_em is null. Teto de 20 ativos por cliente na RPC.';
comment on column gps.cliente_links_drive.aluno_id is
  'Ambiente do cliente no momento do INSERT (copiado de etapa1_clientes.aluno_id pela RPC). NAO e usado pela RLS.';
comment on column gps.cliente_links_drive.criado_por_nome is
  'Literal ''Equipe'' quando foi a equipe; nome do cadastro da pessoa (thb_alunos) quando foi o parceiro; ''Parceiro'' se nao houver pessoa. Molde de gps.pasta_drive_definir.';
comment on column gps.cliente_links_drive.origem is
  '''equipe'' | ''parceiro''. Link de origem equipe o parceiro NAO remove (regra de gps.cliente_link_drive_remover).';

create index cliente_links_drive_ativos_idx
  on gps.cliente_links_drive (cliente_id, criado_em)
  where removido_em is null;

create unique index cliente_links_drive_url_ativa_uq
  on gps.cliente_links_drive (cliente_id, url)
  where removido_em is null;

-- Guarda da regra dos 3 lugares: o CHECK novo tem de ser a cópia literal do
-- de gps.ambientes (só o nome da coluna muda). Deparse dos dois comparado.
do $$
declare
  v_amb text;
  v_lnk text;
begin
  select pg_get_constraintdef(c.oid) into v_amb
    from pg_constraint c
   where c.conrelid = 'gps.ambientes'::regclass
     and c.conname  = 'ambientes_pasta_drive_url_formato';
  select pg_get_constraintdef(c.oid) into v_lnk
    from pg_constraint c
   where c.conrelid = 'gps.cliente_links_drive'::regclass
     and c.conname  = 'cliente_links_drive_url_formato';
  if v_amb is null then
    raise exception 'ambientes_pasta_drive_url_formato nao encontrado -- migracao abortada (a regra de URL que este CHECK copia sumiu)';
  end if;
  if replace(v_amb, 'pasta_drive_url', 'url') is distinct from v_lnk then
    raise exception 'CHECK de URL divergiu do de gps.ambientes -- migracao abortada. ambientes: % | links: %', v_amb, v_lnk;
  end if;
end $$;

alter table gps.cliente_links_drive enable row level security;

-- Mesma regra da cliente_minutas_select (…259). Sem policy de INSERT/UPDATE/
-- DELETE: toda escrita é pela RPC.
create policy cliente_links_drive_select on gps.cliente_links_drive
  for select to authenticated
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.etapa1_clientes c
       where c.id = cliente_links_drive.cliente_id
         and c.aluno_id = gps.aluno_atual()
    )
  );

-- Tabela nova nasce gravável por authenticated (ALTER DEFAULT PRIVILEGES do
-- schema gps): `grant select` sozinho NÃO tira insert/update/delete. E
-- `revoke from anon` não pega o que vem de PUBLIC — os três nomeados.
revoke all    on table gps.cliente_links_drive from public, anon, authenticated;
grant  select on table gps.cliente_links_drive to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. gps.cliente_link_drive_adicionar
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.cliente_link_drive_adicionar(
  p_cliente_id uuid,
  p_nome       text,
  p_url        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_c        record;
  v_nome     text;
  v_url      text;
  v_ativos   integer;
  v_por_nome text;
  v_origem   text;
  v_id       uuid;
  v_em       timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  -- `for no key update`: serializa adições concorrentes ao MESMO cliente
  -- (teto e duplicado contados sem corrida) sem bloquear FKs de outras
  -- tabelas que apontam para o cliente (for update bloquearia).
  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id
   for no key update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_nome := btrim(coalesce(p_nome, ''), E' \t\r\n');
  if v_nome = '' then
    raise exception 'Dê um nome ao link.' using errcode = '22023';
  end if;
  if char_length(v_nome) > 120 then
    raise exception 'O nome do link tem no máximo 120 caracteres.' using errcode = '22023';
  end if;
  if v_nome ~ '[[:cntrl:]]' then
    raise exception 'O nome do link tem caractere inválido.' using errcode = '22023';
  end if;

  v_url := gps.drive_url_normalizar(p_url);
  if v_url is null then
    raise exception 'Cole o link do Drive (Compartilhar > Copiar link). Ele começa com drive.google.com/ ou docs.google.com/.'
      using errcode = '22023';
  end if;

  -- Duplicado antes do teto: com 20 ativos, colar um repetido diz a verdade.
  if exists (
    select 1 from gps.cliente_links_drive l
     where l.cliente_id = p_cliente_id and l.url = v_url and l.removido_em is null
  ) then
    raise exception 'Este link já está na ficha.' using errcode = '23505';
  end if;

  select count(*) into v_ativos
    from gps.cliente_links_drive l
   where l.cliente_id = p_cliente_id and l.removido_em is null;
  if v_ativos >= 20 then
    raise exception 'No máximo 20 links por cliente.' using errcode = 'P0001';
  end if;

  if v_admin then
    v_por_nome := 'Equipe';
    v_origem   := 'equipe';
  else
    v_origem := 'parceiro';
    -- Molde de gps.pasta_drive_definir: nome da PESSOA; titular sem pessoa
    -- cai no próprio ambiente; sócio sem pessoa vira 'Parceiro'.
    select nullif(btrim(t.nome), '')
      into v_por_nome
      from gps.membros m
      left join public.thb_alunos t
        on t.id = coalesce(m.pessoa_aluno_id,
                           case when m.papel = 'titular' then m.aluno_id end)
     where m.user_id = v_uid
       and m.aluno_id = v_c.aluno_id
     limit 1;
    v_por_nome := coalesce(v_por_nome, 'Parceiro');
  end if;

  begin
    insert into gps.cliente_links_drive
      (cliente_id, aluno_id, nome, url, origem, criado_por, criado_por_nome)
    values
      (p_cliente_id, v_c.aluno_id, v_nome, v_url, v_origem, v_uid, v_por_nome)
    returning id, criado_em into v_id, v_em;
  exception when unique_violation then
    -- Rede de segurança: o lock acima já serializa; isto cobre o que escapar.
    raise exception 'Este link já está na ficha.' using errcode = '23505';
  end;

  -- Diário: detalhe SEM url e SEM nome do link (texto livre do parceiro,
  -- pode carregar nome de terceiro). rotulo = nome do CLIENTE (padrão …092).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_link_drive_adicionado', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('link_id', v_id, 'cliente_id', p_cliente_id),
     case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');

  return jsonb_build_object(
    'id', v_id, 'nome', v_nome, 'url', v_url, 'criado_em', v_em,
    'criado_por_nome', v_por_nome, 'origem', v_origem);
end;
$function$;

comment on function gps.cliente_link_drive_adicionar(uuid, text, text) is
  'Adiciona um link do Google Drive a ficha do cliente. Guarda: admin (coalesce(gp_is_admin(),false)) OU gps.aluno_atual() = etapa1_clientes.aluno_id; senao 42501. Lock for no key update na linha do cliente. URL por gps.drive_url_normalizar (NULL -> 22023). Duplicado ativo -> 23505 ''Este link ja esta na ficha.''. Teto 20 ativos -> P0001. origem equipe/parceiro; criado_por_nome ''Equipe'' ou nome da pessoa (molde de pasta_drive_definir). Evento cliente_link_drive_adicionado com detalhe {link_id, cliente_id} -- NUNCA url nem nome.';

revoke all     on function gps.cliente_link_drive_adicionar(uuid, text, text) from public, anon;
grant  execute on function gps.cliente_link_drive_adicionar(uuid, text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. gps.cliente_link_drive_remover — soft delete
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.cliente_link_drive_remover(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_l        record;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_link_id is null then
    raise exception 'Link não encontrado.' using errcode = 'P0002';
  end if;

  select l.id, l.cliente_id, l.origem, l.removido_em, c.aluno_id, c.nome as cliente_nome
    into v_l
    from gps.cliente_links_drive l
    join gps.etapa1_clientes c on c.id = l.cliente_id
   where l.id = p_link_id
   for update of l;
  if not found or v_l.removido_em is not null then
    raise exception 'Link não encontrado.' using errcode = 'P0002';
  end if;

  if not v_admin then
    if v_ambiente is null or v_ambiente <> v_l.aluno_id then
      raise exception 'Sem permissão.' using errcode = '42501';
    end if;
    if v_l.origem is distinct from 'parceiro' then
      raise exception 'Este link foi colocado pela equipe; peça a ela para remover.'
        using errcode = '42501';
    end if;
  end if;

  update gps.cliente_links_drive
     set removido_em = now(), removido_por = v_uid
   where id = p_link_id and removido_em is null;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_l.aluno_id, now(), 'cliente_link_drive_removido', 'cliente', v_l.cliente_id,
     left(coalesce(nullif(btrim(v_l.cliente_nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('link_id', p_link_id, 'cliente_id', v_l.cliente_id),
     case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');
end;
$function$;

comment on function gps.cliente_link_drive_remover(uuid) is
  'Remove (SOFT: removido_em/removido_por) um link do Drive da ficha. Admin remove qualquer um; membro do ambiente (gps.aluno_atual() = aluno_id do cliente) remove so origem parceiro (equipe -> 42501). Ja removido ou inexistente -> P0002 ''Link nao encontrado.''. Evento cliente_link_drive_removido com detalhe {link_id, cliente_id} -- NUNCA url nem nome.';

revoke all     on function gps.cliente_link_drive_remover(uuid) from public, anon;
grant  execute on function gps.cliente_link_drive_remover(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. aluno_eventos_tipo_check + 2 tipos, a partir do CHECK VIVO
-- ═══════════════════════════════════════════════════════════════════════════
-- Molde da guarda da …331 (linhas 58-99), com duas diferenças deliberadas:
--   · a lista nova NÃO é escrita aqui: é a viva + 2. Nada some.
--   · recria no formato `ARRAY['a'::text, …]` (string_agg + quote_literal),
--     NÃO `= any (%L::text[])`. O formato `'{a,b}'::text[]` faz o
--     pg_get_constraintdef devolver UM literal só, e a próxima extração por
--     regex leria 1 "valor" com a lista inteira dentro. A guarda abaixo
--     recusa esse formato em vez de extrair errado.
-- NOT VALID + VALIDATE: a validação roda com SHARE UPDATE EXCLUSIVE em vez de
-- segurar ACCESS EXCLUSIVE na trilha durante o scan.
do $$
declare
  v_def   text;
  v_vivos text[];
  v_novos text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
   where c.conrelid = 'gps.aluno_eventos'::regclass
     and c.conname  = 'aluno_eventos_tipo_check';
  if v_def is null then
    raise exception 'aluno_eventos_tipo_check nao encontrado -- migracao abortada. Leia: select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid=''gps.aluno_eventos''::regclass and contype=''c''';
  end if;
  if v_def !~ 'ARRAY\[' or v_def ~ '''\{' then
    raise exception 'aluno_eventos_tipo_check em formato inesperado (esperado ARRAY[...]) -- migracao abortada. Def: %', v_def;
  end if;

  select array_agg(m[1] order by ord) into v_vivos
    from regexp_matches(v_def, '''([^'']+)''', 'g') with ordinality as r(m, ord);

  -- Âncora: o último valor conhecido (…311). Sem ele, a lista viva não é a
  -- que esta migração pressupõe.
  if v_vivos is null or not ('cliente_documento_lido' = any (v_vivos)) then
    raise exception 'aluno_eventos_tipo_check sem cliente_documento_lido (ancora da ...311) -- migracao abortada. Def: %', v_def;
  end if;
  if exists (select 1 from unnest(v_vivos) x where x ~ '[,{}]') then
    raise exception 'valor extraido do CHECK com virgula/chave -- extracao errada, migracao abortada. Def: %', v_def;
  end if;

  select array_agg(distinct x order by x) into v_novos
    from unnest(v_vivos || array['cliente_link_drive_adicionado',
                                 'cliente_link_drive_removido']) x;

  -- Prova dentro da migração: nenhum valor vivo ficou de fora.
  if exists (select 1 from unnest(v_vivos) x where x <> all (v_novos)) then
    raise exception 'lista nova perdeu valor vivo -- migracao abortada';
  end if;

  alter table gps.aluno_eventos drop constraint aluno_eventos_tipo_check;
  execute format(
    'alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check check (tipo = any (array[%s])) not valid',
    (select string_agg(quote_literal(x) || '::text', ', ' order by x) from unnest(v_novos) x));
  alter table gps.aluno_eventos validate constraint aluno_eventos_tipo_check;

  execute format(
    'comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is %L',
    'Catalogo fechado de tipos de evento do diario. ' || cardinality(v_novos)
    || ' valores desde a ...332 (02/10/2026): a lista VIVA lida por pg_get_constraintdef ('
    || cardinality(v_vivos) || ') + cliente_link_drive_adicionado/cliente_link_drive_removido, '
    || 'gravados so por gps.cliente_link_drive_adicionar/_remover. Espelha TIPOS_EVENTO em src/lib/types.ts. '
    || 'Ao acrescentar valor, LEIA O CHECK VIGENTE (pg_get_constraintdef filtrando por conname -- a tabela tem 5 CHECKs).');
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. gps.sessao_briefing_ler + links_drive_ao_vivo
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 CONFERIR ANTES DE APLICAR: pg_get_functiondef('gps.sessao_briefing_ler(uuid)'::regprocedure).
-- Corpo = o da …313 + o bloco `links_drive_ao_vivo` no fim do return.
-- Mesma assinatura (uuid): create or replace SUBSTITUI, não sobrecarrega.
-- VOLATILE (padrão): a função grava acessos_log; `stable` recusaria o INSERT.
-- Guarda: o corpo vivo, sem espaço/tab/CR/LF, tem de ter o md5 do corpo da
-- …313 (calculado sobre o arquivo do repo). Já tendo `links_drive_ao_vivo`
-- (reaplicação), passa.
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
    from pg_proc p
   where p.oid = 'gps.sessao_briefing_ler(uuid)'::regprocedure;
  if v_src like '%links_drive_ao_vivo%' then
    return;
  end if;
  if md5(regexp_replace(v_src, '[ \t\r\n]+', '', 'g')) <> '0b008dbab9a67dd351266b344a5d4516' then
    raise exception 'Corpo VIVO de gps.sessao_briefing_ler divergiu da ...313 -- migracao abortada para nao apagar mudanca feita fora do repo. Remonte a secao 6 sobre pg_get_functiondef e troque o hash.';
  end if;
end $$;

create or replace function gps.sessao_briefing_ler(p_agendamento_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_a     record;
  v_disc_letra       text;
  v_disc_consciencia text;
  v_disc_gatilhos    text;
  v_disc_relac       text;
  v_disc_em          timestamptz;
  v_disc_por         uuid;
  v_congelado        text;
  -- …313: última Entrevista Prévia CONCLUÍDA do cliente. Variáveis escalares,
  -- nunca `record`: "não casou linha" é o caso COMUM (cliente sem entrevista)
  -- e `record` não atribuído levanta 55000 ao ler campo — o briefing tem de
  -- abrir de qualquer jeito.
  v_ep_concluida     timestamptz;
  v_ep_letra         text;
  v_ep_pontos        jsonb;
  v_ep_decisores     smallint;
  v_ep_respostas     jsonb;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.estado,
         a.inicio_em, a.briefing_snapshot
    into v_a from gps.sessao_agendamentos a where a.id = p_agendamento_id;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('sessao_briefing_acessado', v_a.aluno_id, auth.uid(),
          'agendamento_id=' || p_agendamento_id::text);

  select c.perfil_disc, c.disc_consciencia, c.disc_gatilhos,
         c.disc_relacionamento, c.disc_atualizado_em, c.disc_atualizado_por
    into v_disc_letra, v_disc_consciencia, v_disc_gatilhos,
         v_disc_relac, v_disc_em, v_disc_por
    from gps.etapa1_clientes c
   where c.id = v_a.cliente_id;

  v_congelado := v_a.briefing_snapshot #>> '{cliente,perfil_disc}';

  -- …313: a última CONCLUÍDA, ordenada por `concluida_em` (a mais nova pode
  -- ser rascunho). Sem índice novo: `idx_entrevista_previa_cliente
  -- (cliente_id, criado_em desc)` cobre o where e o Sort ordena ≤ 3 linhas.
  select e.concluida_em, e.perfil_disc, e.disc_pontos, e.decisores_total, e.respostas
    into v_ep_concluida, v_ep_letra, v_ep_pontos, v_ep_decisores, v_ep_respostas
    from gps.entrevista_previa e
   where e.cliente_id = v_a.cliente_id
     and e.concluida_em is not null
   order by e.concluida_em desc
   limit 1;

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado', v_a.estado,
    'inicio_em', v_a.inicio_em,
    'cliente_id', v_a.cliente_id,
    'briefing', v_a.briefing_snapshot,
    'disc_ao_vivo', jsonb_build_object(
      'letra', v_disc_letra,
      'consciencia', v_disc_consciencia,
      'gatilhos', v_disc_gatilhos,
      'relacionamento', v_disc_relac,
      'atualizado_em', v_disc_em,
      'atualizado_por', v_disc_por,
      'congelado_era', v_congelado,
      'divergiu', (v_disc_letra is distinct from v_congelado)))
    || jsonb_build_object('decisores_ao_vivo', coalesce(
         (select jsonb_agg(jsonb_build_object(
                   'nome', d.nome, 'papel_no_negocio', d.papel_no_negocio,
                   'principal', d.principal)
                 order by d.principal desc, d.criado_em)
            from gps.cliente_decisores d where d.cliente_id = v_a.cliente_id),
         '[]'::jsonb))
    -- …313: irmã de `disc_ao_vivo`, nunca dentro de `briefing` (o snapshot é
    -- tirado no agendamento; a entrevista roda depois por construção).
    -- `entrevistado` (texto livre) fica de fora: não alimenta o script.
    || jsonb_build_object('entrevista_previa_ao_vivo',
         case when v_ep_concluida is null then null::jsonb
              else jsonb_build_object(
                'concluida_em',    v_ep_concluida,
                'perfil_disc',     v_ep_letra,
                'disc_pontos',     v_ep_pontos,
                'decisores_total', v_ep_decisores,
                'respostas',       v_ep_respostas)
         end)
    -- …332: links do Drive ATIVOS da ficha, ao vivo (fora do snapshot), do
    -- mais antigo ao mais novo. Usa cliente_links_drive_ativos_idx.
    || jsonb_build_object('links_drive_ao_vivo', coalesce(
         (select jsonb_agg(jsonb_build_object(
                   'nome', l.nome, 'url', l.url,
                   'criado_por_nome', l.criado_por_nome,
                   'origem', l.origem, 'criado_em', l.criado_em)
                 order by l.criado_em)
            from gps.cliente_links_drive l
           where l.cliente_id = v_a.cliente_id
             and l.removido_em is null),
         '[]'::jsonb));
end;
$function$;

comment on function gps.sessao_briefing_ler(uuid) is
  'Briefing que a equipe abre antes da sessao. Guarda: admin OU responsavel_id = auth.uid(), com coalesce(..., false). Grava trilha LGPD sessao_briefing_acessado a cada leitura (por isso a tela NAO memoiza). Devolve o snapshot do agendamento (briefing) + quatro blocos AO VIVO, irmaos na raiz: disc_ao_vivo (letra/consciencia/gatilhos/relacionamento da ficha), decisores_ao_vivo (gps.cliente_decisores), entrevista_previa_ao_vivo (...313: ULTIMA Entrevista Previa CONCLUIDA ou null; entrevistado fica de fora) e, desde a ...332 (02/10/2026), links_drive_ao_vivo: array dos links do Drive ATIVOS da ficha (nome, url, criado_por_nome, origem, criado_em) por criado_em, [] se nenhum. A chave briefing.entrevista do snapshot e a esteira legada da Etapa 01 (0 registros) e nao deve ser lida.';

-- create or replace preserva o ACL; reemitido igual à …292 para a função
-- nunca ficar dependendo de preservação (revoke nomeia PUBLIC: revoke só de
-- anon não pega o que vem de PUBLIC).
revoke all     on function gps.sessao_briefing_ler(uuid) from public, anon;
grant  execute on function gps.sessao_briefing_ler(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- 🧪 PROVA — rodar pelo MCP DEPOIS do apply. Tudo em begin … rollback.
-- ⚠️ O executor (victor) NÃO rodou nada disto: sem acesso ao banco.
-- Nenhum resultado está pré-preenchido. <...> = trocar por valor real.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── P0. Objetos, ACL, CHECKs ─────────────────────────────────────────────
--   select relrowsecurity, relacl from pg_class where oid = 'gps.cliente_links_drive'::regclass;
--   -- esperado: true; authenticated=r SÓ (sem a/w/d), sem anon.
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='gps' and table_name='cliente_links_drive' order by 1,2;
--   select p.proname, p.proacl, p.provolatile, p.prosecdef from pg_proc p
--    where p.pronamespace='gps'::regnamespace
--      and p.proname in ('drive_url_normalizar','cliente_link_drive_adicionar',
--                        'cliente_link_drive_remover','sessao_briefing_ler');
--   -- esperado: nenhum proacl com anon=X nem =X/ (PUBLIC); provolatile:
--   --   normalizar 'i', demais 'v'; prosecdef true nas 3 RPCs.
--   select has_function_privilege('anon','gps.cliente_link_drive_adicionar(uuid,text,text)','execute'),
--          has_function_privilege('anon','gps.cliente_link_drive_remover(uuid)','execute'),
--          has_function_privilege('anon','gps.sessao_briefing_ler(uuid)','execute');
--   -- esperado: false, false, false.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='gps.aluno_eventos'::regclass and contype='c';
--   -- esperado: 5 CHECKs; tipo_check = (contagem anterior) + 2, formato ARRAY[...].
--   select tipo, count(*) from gps.aluno_eventos group by 1 order by 1;
--   -- esperado: todo tipo listado está no CHECK.
--
-- ── P1. Sem JWT → 42501 ──────────────────────────────────────────────────
--   begin;
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'x', 'drive.google.com/drive/folders/abc');
--   -- esperado: 42501 'Sessão expirada. Entre de novo.'
--   rollback;
--   begin; select gps.cliente_link_drive_remover(gen_random_uuid()); rollback;
--   -- esperado: 42501.
--   begin; set local role anon;
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'x', 'drive.google.com/x');
--   -- esperado: permission denied for function (42501).
--   rollback;
--
-- ── P2. Parceiro adiciona: sem https, com http, com ?usp, host maiúsculo ──
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UID_PARCEIRO_DONO>","role":"authenticated"}';
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'Pasta do caso', 'drive.google.com/drive/folders/AbC1');
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'Contrato', '  http://DOCS.Google.com/document/d/XyZ/edit?usp=sharing  ');
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'Planilha', 'https://drive.google.com/file/d/Q/view?usp=drive_link');
--   -- esperado: 3 jsonb; url = https://drive.google.com/drive/folders/AbC1 ·
--   --   https://docs.google.com/document/d/XyZ/edit?usp=sharing (path/case preservado) ·
--   --   ?usp=drive_link preservado; origem 'parceiro'; criado_por_nome = nome da pessoa.
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'Repetido', 'drive.google.com/drive/folders/AbC1');
--   -- esperado: 23505 'Este link já está na ficha.'
--   rollback;
--   -- Outro ambiente: mesmo bloco com <UID_PARCEIRO_DE_OUTRO_AMBIENTE> → 42501 'Sem permissão.'
--
-- ── P3. Teto de 20 ───────────────────────────────────────────────────────
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UID_PARCEIRO_DONO>","role":"authenticated"}';
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'L'||g, 'drive.google.com/x/'||g)
--     from generate_series(1, 20 - (select count(*) from gps.cliente_links_drive
--                                    where cliente_id='<CLIENTE>' and removido_em is null)) g;
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'L21', 'drive.google.com/x/21x');
--   -- esperado: P0001 'No máximo 20 links por cliente.'
--   rollback;
--
-- ── P4. Normalização × CHECK (regra dos 3 lugares) ───────────────────────
--   select u, gps.drive_url_normalizar(u) from (values
--     ('drive.google.com/drive/folders/a'), ('HTTP://Drive.Google.COM/a?usp=sharing'),
--     ('https://drive.google.com/url?q=http://evil'), ('https://drive.google.com/x/../url'),
--     ('https://drive.google.com/%2e%2e/url'), ('https://drive.google.com@evil.com/'),
--     ('https://evil.com/drive.google.com/'), ('ftp://drive.google.com/a'),
--     ('https://drive.google.com/a b'), (E'\n https://docs.google.com/a \t'),
--     (''), (null), ('https://drive.google.com/' || repeat('a', 2023)),
--     ('drive.google.com/' || repeat('a', 2025))) t(u);
--   -- esperado: só 1, 2, 10 e 13 não nulos (13 = 2048 exatos); 14 nulo (17+2025+8 = 2050).
--   -- Coerência com o CHECK: toda saída não nula tem de passar nele:
--   select u from (values ('<cada saída não nula acima>')) t(u)
--    where not (u ~ '^https://(drive|docs)\.google\.com/'
--      and u !~ '^https://(drive|docs)\.google\.com/url'
--      and u !~* '(/\.{1,2}(/|\?|#|$)|%2e|\\)' and u !~ '\s' and length(u) <= 2048);
--   -- esperado: 0 linhas.
--
-- ── P5. Parceiro NÃO remove link da equipe; soft delete; evento sem url ──
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UID_ADMIN>","role":"authenticated"}';
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'Da equipe', 'drive.google.com/eq/1') ->> 'id';  -- <LINK_EQ>
--   set local request.jwt.claims = '{"sub":"<UID_PARCEIRO_DONO>","role":"authenticated"}';
--   select gps.cliente_link_drive_remover('<LINK_EQ>');
--   -- esperado: 42501 'Este link foi colocado pela equipe; peça a ela para remover.'
--   rollback;
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UID_PARCEIRO_DONO>","role":"authenticated"}';
--   select gps.cliente_link_drive_adicionar('<CLIENTE>', 'Meu', 'drive.google.com/p/1') ->> 'id';  -- <LINK_P>
--   select gps.cliente_link_drive_remover('<LINK_P>');
--   reset role;
--   select removido_em is not null, removido_por from gps.cliente_links_drive where id='<LINK_P>';
--   -- esperado: true, <UID_PARCEIRO_DONO> (a linha FICA).
--   set local role authenticated;
--   select gps.cliente_link_drive_remover('<LINK_P>');
--   -- esperado: P0002 'Link não encontrado.'
--   reset role;
--   select tipo, detalhe, ator, entidade, entidade_id from gps.aluno_eventos
--    where tipo like 'cliente_link_drive_%' order by ocorrido_em desc limit 2;
--   -- esperado: removido + adicionado; detalhe com SÓ link_id e cliente_id
--   --   (sem 'url', sem 'nome'); ator 'aluno'; entidade 'cliente'.
--   select count(*) from gps.aluno_eventos
--    where tipo like 'cliente_link_drive_%' and (detalhe ? 'url' or detalhe::text like '%google.com%');
--   -- esperado: 0.
--   rollback;
--
-- ── P6. Briefing traz a chave ────────────────────────────────────────────
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UID_ADMIN>","role":"authenticated"}';
--   select jsonb_object_keys(gps.sessao_briefing_ler('<AGENDAMENTO_DO_CLIENTE>'));
--   -- esperado: 9 chaves = as 8 da …313 + links_drive_ao_vivo.
--   select gps.sessao_briefing_ler('<AGENDAMENTO_DO_CLIENTE>') -> 'links_drive_ao_vivo';
--   -- esperado: array (ou []) com nome/url/criado_por_nome/origem/criado_em; sem removidos.
--   rollback;   -- desfaz o acessos_log da leitura
--
-- ── P7. explain (analyze) da leitura da ficha (a query de getLinksDriveDoCliente)
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<UID_PARCEIRO_DONO>","role":"authenticated"}';
--   explain (analyze, buffers)
--   select id, nome, url, origem, criado_em, criado_por_nome
--     from gps.cliente_links_drive
--    where cliente_id = '<CLIENTE>' and removido_em is null
--    order by criado_em;
--   rollback;
--   -- esperado: colar o plano real aqui. Tabela vazia/pequena dá Seq Scan
--   -- legitimamente; repetir com `set local enable_seqscan = off` para ver
--   -- cliente_links_drive_ativos_idx elegível. Repetir o explain com claims
--   -- de admin (gp_is_admin() curto-circuita o exists).
-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO MEDIDO EM PRODUÇÃO — 02/10/2026 (aplicada; provas em bloco DO que
-- termina em RAISE = tudo desfeito). Hash do briefing: o corpo VIVO diferia da
-- …313 só por comentários (comparado linha a linha); hash trocado para o vivo.
-- ═══════════════════════════════════════════════════════════════════════════
-- sem JWT ............................. 42501
-- parceiro, ' drive.google.com/…?usp=sharing ' → https://drive.google.com/drive/folders/qa1?usp=sharing · origem parceiro · por "Lana Cristina Braz Queiroga"
-- 'http://DOCS.Google.com/document/d/abc/edit' → https://docs.google.com/document/d/abc/edit
-- duplicado ........................... 23505 "Este link já está na ficha."
-- google.com/url?q= ................... 22023
-- cliente de outro ambiente ........... 42501
-- parceiro vê pela RLS ................ 2 (só os do ambiente)
-- equipe adiciona ..................... origem equipe
-- briefing (sessão do mesmo cliente) .. links_drive_ao_vivo com 3 itens
-- parceiro remove link da equipe ...... 42501
-- soft delete ......................... ativos 2, total 3; remover de novo → P0002
-- Diário (lido como postgres) ......... 1 evento, 0 com a url no detalhe
-- proacl das 2 RPCs ................... {postgres, authenticated, service_role} (sem PUBLIC, sem anon)
-- explain (analyze, buffers) da leitura da ficha:
--   Index Scan using cliente_links_drive_ativos_idx · Index Cond: cliente_id · shared hit=3 · 0.048 ms
--
-- ═══════════════════════════════════════════════════════════════════════════
