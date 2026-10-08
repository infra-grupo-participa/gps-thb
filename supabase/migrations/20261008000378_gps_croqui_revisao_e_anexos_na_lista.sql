-- ═══════════════════════════════════════════════════════════════════════════
-- 378 — Croqui ganha REVISÃO da equipe (igual à minuta) + indicadores de
--       anexo (minuta/croqui) na lista de /admin/clientes
-- ═══════════════════════════════════════════════════════════════════════════
-- DECISÕES DO DONO (08/10/2026):
--   * o croqui ganha o MESMO estado de revisão da minuta (…341):
--     enviada → em_analise → revisada, + parecer, + e-mail ao parceiro quando
--     revisada (o e-mail sai da action, não do banco);
--   * folha de croqui REVISADA não pode ser apagada pelo parceiro (admin pode).
--
-- O QUE ENTRA
--   1. gps.cliente_croquis + status (default 'enviada'), parecer, parecer_em,
--      parecer_por. Os 2 CHECKs são COPIADOS de gps.cliente_minutas por
--      pg_get_constraintdef em tempo de aplicação (não de memória) e conferidos
--      depois (def da croqui = def da minuta, string a string).
--   2. gps.croqui_registrar_parecer(uuid, text, text) — espelho do corpo VIVO
--      de gps.minuta_registrar_parecer (versão da …372, com gps.eh_admin()).
--   3. gps.cliente_croqui_remover — corpo vivo da …371 + recusa 42501 quando a
--      folha está 'revisada' e quem chama não é admin. Linha travada
--      (FOR UPDATE) entre a leitura do status e o DELETE.
--   4. gps.admin_clientes_lista — corpo vivo da …368 + 6 colunas no FIM do
--      retorno (mn_status, mn_em, mn_por_equipe, cq_pdf_status, cq_pdf_em,
--      cq_pdf_por_equipe; versão MAIS RECENTE por cliente) + p_anexo no FIM
--      (default null; catálogo fechado minuta_pendente|croqui_pendente|
--      minuta_revisada|croqui_revisado; fora → 22023). drop + create.
--   5. gps.admin_registrar_export_clientes — + p_anexo no FIM (o CSV exporta o
--      recorte da lista; sem isto a trilha de LGPD registraria um filtro que
--      não foi o exportado — o defeito de 17/09 com `reuniao`). drop + create.
--   6. gps.admin_clientes_anexos_kpis() — 6 linhas fixas tipo × situacao.
--   gps.admin_clientes_agenda_kpis NÃO é tocada.
--
-- REGRA DOS ANEXOS (um lugar por função, mesma expressão nas duas):
--   versão mais recente por cliente = distinct on (cliente_id) order by
--   cliente_id, enviado_em desc, id desc — o índice (cliente_id, enviado_em
--   desc) de cada tabela serve a ordem; `id desc` só desempata (determinismo).
--   pendente = status in ('enviada','em_analise'); revisada = 'revisada'.
--   Nos KPIs, `pendente` CONTÉM `em_analise` (é o mesmo `pendente` do filtro
--   p_anexo — o tile e a lista filtrada têm de bater). Cliente sem anexo não
--   entra em nenhuma linha.
--
-- GRANTS: os de lista e export são CAPTURADOS do catálogo antes do drop e
--   reaplicados idênticos (aborta se o vivo tiver PUBLIC ou anon). As funções
--   novas: revoke de public e anon, grant a authenticated (molde da irmã).
--
-- GUARDAS (abortam sem mudar nada): md5(prosrc) de cada corpo de partida
--   conferido contra o arquivo da …368/…370/…371/…372 (o corpo que esta
--   migração reescreve); CHECKs da minuta com os 3 valores e o 4000; colunas
--   novas ainda inexistentes em cliente_croquis; 1 sobrecarga de cada.
--
-- AS 5 PERGUNTAS
--   1. Escala: lista e KPIs leem cliente_minutas/cliente_croquis inteiras
--      (dezenas de linhas hoje; centenas/ano) por distinct on — custo
--      proporcional aos ANEXOS, não aos 1,7 mil clientes.
--   2. Índice: cliente_minutas_cliente_idx e cliente_croquis_cliente_idx
--      (cliente_id, enviado_em desc) — conferidos na prova P0. Nenhum novo.
--   3. Frequência: a da tela /admin/clientes (já existente) + 1 RPC de KPI.
--   4. Repetição: nenhuma nova; KPI é uma chamada só (sem N+1 por tile).
--   5. Reversão: abaixo.
--
-- REVERTER (nesta ordem; o TS publicado antes depende de 1-4):
--   drop function gps.admin_clientes_anexos_kpis();
--   drop function gps.admin_clientes_lista(integer,integer,text,text,text,text,text,text);
--     + reaplicar o bloco "gps.admin_clientes_lista(...)" da …368, o comment
--       da …355 e grant execute to authenticated, service_role;
--   drop function gps.admin_registrar_export_clientes(integer,text,text,text,text,text,text);
--     + reaplicar o bloco da …370, o comment da …355 e grant to authenticated;
--   cliente_croqui_remover: reaplicar o bloco da …371 (mesma assinatura);
--   drop function gps.croqui_registrar_parecer(uuid, text, text);
--   alter table gps.cliente_croquis
--     drop constraint chk_cliente_croquis_status,
--     drop constraint chk_cliente_croquis_parecer_tam,
--     drop column status, drop column parecer, drop column parecer_em,
--     drop column parecer_por;   -- 🔴 apaga os pareceres gravados: retratar antes.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── GUARDAS ────────────────────────────────────────────────────────────────
do $guarda$
declare
  r       record;
  v_ruins text[] := '{}';
  v_def   text;
begin
  -- G1: corpo vivo = o corpo de partida desta migração (md5 do prosrc, que é o
  -- texto entre os $function$ do arquivo de origem, byte a byte).
  for r in
    select x.rp, x.md5_esperado, p.oid, md5(p.prosrc) as md5_vivo
      from (values
        ('gps.admin_clientes_lista(integer,integer,text,text,text,text,text)', '3e478461861c2de4bb4e57e5554fe579'),
        ('gps.admin_registrar_export_clientes(integer,text,text,text,text,text)', 'd6aa2f045cfbbec5526788220e116bcf'),
        ('gps.cliente_croqui_remover(uuid)', 'b2527ebf98269a1d59b925bd16d95980'),
        ('gps.minuta_registrar_parecer(uuid,text,text)', '9c75b808489ec04dceee77499cf90255')
      ) as x(rp, md5_esperado)
      left join pg_proc p on p.oid = to_regprocedure(x.rp)
  loop
    if r.oid is null then
      v_ruins := v_ruins || (r.rp || ' (não existe)');
    elsif r.md5_vivo <> r.md5_esperado then
      v_ruins := v_ruins || (r.rp || ' (corpo vivo difere: ' || r.md5_vivo || ')');
    end if;
  end loop;
  if cardinality(v_ruins) > 0 then
    raise exception '378: corpo vivo difere do de partida — reler pg_get_functiondef e regenerar: %',
      array_to_string(v_ruins, '; ');
  end if;

  -- G2: uma sobrecarga só de cada função recriada.
  for r in
    select p.proname, count(*) as n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'gps'
       and p.proname in ('admin_clientes_lista', 'admin_registrar_export_clientes',
                         'cliente_croqui_remover', 'croqui_registrar_parecer',
                         'admin_clientes_anexos_kpis')
     group by p.proname
  loop
    if r.proname in ('croqui_registrar_parecer', 'admin_clientes_anexos_kpis') then
      raise exception '378: gps.% já existe — ABORTADA', r.proname;
    end if;
    if r.n <> 1 then
      raise exception '378: gps.% tem % sobrecargas, esperado 1 — ABORTADA', r.proname, r.n;
    end if;
  end loop;

  -- G3: os CHECKs da minuta são os da …341 (3 valores, teto 4000).
  select pg_get_constraintdef(k.oid) into v_def
    from pg_constraint k
   where k.conrelid = 'gps.cliente_minutas'::regclass and k.conname = 'chk_cliente_minutas_status';
  if v_def is null
     or position('''enviada''' in v_def) = 0
     or position('''em_analise''' in v_def) = 0
     or position('''revisada''' in v_def) = 0
     or (char_length(v_def) - char_length(replace(v_def, '::text', ''))) / char_length('::text') <> 3 then
    raise exception '378: chk_cliente_minutas_status inesperado: % — ABORTADA', v_def;
  end if;
  select pg_get_constraintdef(k.oid) into v_def
    from pg_constraint k
   where k.conrelid = 'gps.cliente_minutas'::regclass and k.conname = 'chk_cliente_minutas_parecer_tam';
  if v_def is null or position('4000' in v_def) = 0 or position('parecer' in v_def) = 0 then
    raise exception '378: chk_cliente_minutas_parecer_tam inesperado: % — ABORTADA', v_def;
  end if;

  -- G4: nada disso existe ainda em cliente_croquis (add column if not exists
  -- com coluna pré-existente de outro tipo passaria calado).
  if exists (select 1 from pg_attribute a
              where a.attrelid = 'gps.cliente_croquis'::regclass and not a.attisdropped
                and a.attname in ('status', 'parecer', 'parecer_em', 'parecer_por'))
     or exists (select 1 from pg_constraint k
                 where k.conrelid = 'gps.cliente_croquis'::regclass
                   and k.conname in ('chk_cliente_croquis_status', 'chk_cliente_croquis_parecer_tam')) then
    raise exception '378: cliente_croquis já tem coluna/CHECK de revisão — ABORTADA';
  end if;

  -- G5: o ACL vivo de lista e export não tem PUBLIC nem anon (senão "reaplicar
  -- como estava" reabriria a porta).
  if exists (
    select 1
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid in (to_regprocedure('gps.admin_clientes_lista(integer,integer,text,text,text,text,text)'),
                     to_regprocedure('gps.admin_registrar_export_clientes(integer,text,text,text,text,text)'))
       and a.privilege_type = 'EXECUTE'
       and (a.grantee = 0 or a.grantee = 'anon'::regrole)
  ) then
    raise exception '378: lista/export vivos executáveis por PUBLIC ou anon — ABORTADA (corrigir o ACL antes)';
  end if;
end
$guarda$;

-- ACL vivo de lista e export, capturado ANTES do drop (reaplicado no fim).
create temp table _acl_378 on commit drop as
select case when p.proname = 'admin_clientes_lista' then 'lista' else 'export' end as fn,
       a.grantee::regrole::text as papel
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
 where p.oid in (to_regprocedure('gps.admin_clientes_lista(integer,integer,text,text,text,text,text)'),
                 to_regprocedure('gps.admin_registrar_export_clientes(integer,text,text,text,text,text)'))
   and a.privilege_type = 'EXECUTE'
   and a.grantee <> p.proowner;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.cliente_croquis — colunas de revisão (molde …341, bloco 1)
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.cliente_croquis
  add column status      text not null default 'enviada',
  add column parecer     text,
  add column parecer_em  timestamptz,
  add column parecer_por uuid references auth.users(id) on delete set null;

do $$
declare v_def text;
begin
  if exists (select 1 from gps.cliente_croquis where status is distinct from 'enviada') then
    raise exception '378: backfill de status falhou: ha croqui com status <> enviada';
  end if;

  -- CHECKs copiados da minuta pelo catálogo (as expressões citam só `status`
  -- e `parecer`, que existem com o mesmo nome e tipo aqui).
  select pg_get_constraintdef(k.oid) into v_def
    from pg_constraint k
   where k.conrelid = 'gps.cliente_minutas'::regclass and k.conname = 'chk_cliente_minutas_status';
  execute format('alter table gps.cliente_croquis add constraint chk_cliente_croquis_status %s', v_def);

  select pg_get_constraintdef(k.oid) into v_def
    from pg_constraint k
   where k.conrelid = 'gps.cliente_minutas'::regclass and k.conname = 'chk_cliente_minutas_parecer_tam';
  execute format('alter table gps.cliente_croquis add constraint chk_cliente_croquis_parecer_tam %s', v_def);

  -- Pós-condição: a def da croqui é IGUAL à da minuta.
  if exists (
    select 1
      from (values ('chk_cliente_minutas_status', 'chk_cliente_croquis_status'),
                   ('chk_cliente_minutas_parecer_tam', 'chk_cliente_croquis_parecer_tam')) x(mn, cq)
     where (select pg_get_constraintdef(k.oid) from pg_constraint k
             where k.conrelid = 'gps.cliente_minutas'::regclass and k.conname = x.mn)
           is distinct from
           (select pg_get_constraintdef(k.oid) from pg_constraint k
             where k.conrelid = 'gps.cliente_croquis'::regclass and k.conname = x.cq)
  ) then
    raise exception '378: CHECK copiado diverge do da minuta — ABORTADA';
  end if;
end $$;

comment on column gps.cliente_croquis.status is
  'Andamento da revisao desta FOLHA pela EQUIPE (…378, 08/10/2026, molde da minuta …341): enviada (default) | em_analise | revisada. Escrita SO por gps.croqui_registrar_parecer (so admin). Folha revisada: o parceiro nao remove (gps.cliente_croqui_remover, 42501); admin remove.';
comment on column gps.cliente_croquis.parecer is
  'Parecer da equipe sobre ESTA folha, texto puro (a tela renderiza como texto, nunca HTML). Ate 4000 (CHECK copiado da minuta). Obrigatorio para revisada (regra da RPC). NAO vai no e-mail ao parceiro.';
comment on column gps.cliente_croquis.parecer_em is
  'Quando a equipe mudou status/parecer pela ultima vez (gps.croqui_registrar_parecer).';
comment on column gps.cliente_croquis.parecer_por is
  'Admin que mudou status/parecer pela ultima vez (auth.uid() na RPC).';

-- ACL de tabela — reafirma a …309 (idempotente). Escrita SÓ por RPC.
revoke insert, update, delete, truncate on gps.cliente_croquis from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.croqui_registrar_parecer — espelho do corpo vivo da minuta (…372)
-- ═══════════════════════════════════════════════════════════════════════════
create function gps.croqui_registrar_parecer(
  p_croqui_id uuid,
  p_status    text,
  p_parecer   text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_status   text := btrim(coalesce(p_status, ''));
  v_parecer  text := nullif(btrim(coalesce(p_parecer, '')), '');
  v_k            record;
  v_aluno_id     uuid;
  v_cliente_nome text;
  v_email        text;
begin
  -- AUTORIZAÇÃO primeiro: o parceiro não descobre nem se o croqui existe.
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_croqui_id is null then
    raise exception 'Croqui não informado.' using errcode = '22023';
  end if;
  if v_status not in ('enviada', 'em_analise', 'revisada') then
    raise exception 'Status de croqui inválido.' using errcode = '22023';
  end if;
  if v_parecer is not null and char_length(v_parecer) > 4000 then
    raise exception 'O parecer passa de 4000 caracteres.' using errcode = '22023';
  end if;
  if v_status = 'revisada' and v_parecer is null then
    raise exception 'Escreva o parecer para marcar o croqui como revisado.' using errcode = '22023';
  end if;

  update gps.cliente_croquis k
     set status      = v_status,
         parecer     = v_parecer,
         parecer_em  = now(),
         parecer_por = auth.uid()
   where k.id = p_croqui_id
  returning k.id, k.cliente_id, k.enviado_por, k.enviado_pela_equipe
    into v_k;

  if not found then
    raise exception 'Croqui não encontrado.' using errcode = 'P0002';
  end if;

  select c.aluno_id, c.nome
    into v_aluno_id, v_cliente_nome
    from gps.etapa1_clientes c
   where c.id = v_k.cliente_id;

  -- Destinatário: o MESMO da minuta — quem enviou a folha, se foi o PARCEIRO
  -- e ainda é membro do ambiente; senão o titular (thb_alunos.email).
  v_email := coalesce(
    case when not v_k.enviado_pela_equipe
              and v_k.enviado_por is not null
              and exists (select 1 from gps.membros mb
                           where mb.user_id = v_k.enviado_por
                             and mb.aluno_id = v_aluno_id)
         then (select u.email from auth.users u where u.id = v_k.enviado_por) end,
    (select a.email from public.thb_alunos a where a.id = v_aluno_id));

  return jsonb_build_object(
    'id',           v_k.id,
    'cliente_id',   v_k.cliente_id,
    'aluno_id',     v_aluno_id,
    'cliente_nome', v_cliente_nome,
    'status',       v_status,
    'avisar',       nullif(btrim(coalesce(v_email, '')), ''));
end $function$;

comment on function gps.croqui_registrar_parecer(uuid, text, text) is
  'Equipe registra status (enviada|em_analise|revisada) e parecer de UMA folha de croqui (…378, 08/10/2026; espelho de gps.minuta_registrar_parecer). SO ADMIN (gps.eh_admin, senao 42501 -- antes de qualquer leitura). Parecer obrigatorio para revisada, ate 4000. Sobrescreve status/parecer e carimba parecer_em/parecer_por. Devolve jsonb {id, cliente_id, aluno_id, cliente_nome, status, avisar}: avisar = e-mail de quem enviou a folha (se foi o parceiro e ainda e membro do ambiente) senao o do titular -- a action manda o aviso quando status = revisada; falha de e-mail nao desfaz o parecer.';

revoke all     on function gps.croqui_registrar_parecer(uuid, text, text) from public, anon;
grant  execute on function gps.croqui_registrar_parecer(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. gps.cliente_croqui_remover — corpo vivo (…371) + trava da folha revisada
--    Mesma assinatura: create or replace preserva ACL e comment.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gps.cliente_croqui_remover(p_croqui_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k        record;
  v_admin    boolean := coalesce(gps.eh_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
begin
  if p_croqui_id is null then
    raise exception 'croqui nao informado' using errcode = '22023';
  end if;
  -- (…378) FOR UPDATE: o status lido é o status apagado — a equipe não marca
  -- "revisada" entre esta leitura e o DELETE.
  select k.id, k.cliente_id, k.tamanho, k.status, c.aluno_id, c.nome as cliente_nome
    into v_k
    from gps.cliente_croquis k
    join gps.etapa1_clientes c on c.id = k.cliente_id
   where k.id = p_croqui_id
     for update of k;
  if not found then
    raise exception 'Croqui não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_k.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  -- (…378, decisão do dono 08/10) folha revisada pela equipe: só admin tira.
  if not v_admin and v_k.status = 'revisada' then
    raise exception 'Este croqui já foi revisado pela equipe e não pode ser removido.' using errcode = '42501';
  end if;
  delete from gps.cliente_croquis where id = p_croqui_id;
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_k.aluno_id, now(), 'cliente_croqui_removido', 'cliente', v_k.cliente_id,
     left(coalesce(nullif(btrim(v_k.cliente_nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('croqui_id', p_croqui_id, 'tamanho', v_k.tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('cliente_id', v_k.cliente_id, 'removido', true);
end $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. gps.admin_clientes_lista — corpo vivo (…368) + anexos + p_anexo
-- ═══════════════════════════════════════════════════════════════════════════
drop function gps.admin_clientes_lista(integer, integer, text, text, text, text, text);

CREATE FUNCTION gps.admin_clientes_lista(p_limite integer DEFAULT 100, p_offset integer DEFAULT 0, p_fase text DEFAULT NULL::text, p_grau text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_reuniao text DEFAULT NULL::text, p_agenda text DEFAULT NULL::text, p_anexo text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, aluno_id uuid, parceiro_nome text, cliente_nome text, telefone text, fase text, grau_relacao text, perfil_disc text, data_reuniao_preliminar date, aderiu_reuniao boolean, acompanhado_equipe boolean, criado_em timestamp with time zone, ep_em timestamp with time zone, ep_estado text, rp_em timestamp with time zone, rp_estado text, cq_em timestamp with time zone, cq_estado text, ex_em timestamp with time zone, ex_estado text, etapa_agenda text, total_linhas bigint, mn_status text, mn_em timestamp with time zone, mn_por_equipe boolean, cq_pdf_status text, cq_pdf_em timestamp with time zone, cq_pdf_por_equipe boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_limite integer; v_offset integer; v_busca text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Catalogo FECHADO do filtro de reuniao (…274, 17/09/2026). Valor fora
  -- da lista e erro, nunca "ignora e devolve tudo" -- filtro que se ignora
  -- em silencio faz a tela mentir sobre o universo.
  if p_reuniao is not null and p_reuniao not in ('com_reuniao', 'marcada', 'para_vencer', 'vencida', 'sem') then
    raise exception 'Filtro de reunião inválido.' using errcode = '22023';
  end if;

  -- (…355) Catalogo FECHADO da etapa da agenda -- mesma regra.
  if p_agenda is not null and p_agenda not in ('sem', 'entrevista', 'preliminar', 'croqui', 'execucao') then
    raise exception 'Filtro de etapa da agenda inválido.' using errcode = '22023';
  end if;

  -- (…378) Catalogo FECHADO do filtro de anexo -- mesma regra.
  if p_anexo is not null and p_anexo not in ('minuta_pendente', 'croqui_pendente', 'minuta_revisada', 'croqui_revisado') then
    raise exception 'Filtro de anexo inválido.' using errcode = '22023';
  end if;

  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with r as (
    select x.cliente_id, x.ep_em, x.ep_estado, x.rp_em, x.rp_estado,
           x.cq_em, x.cq_estado, x.ex_em, x.ex_estado, x.etapa_agenda
      from gps.cliente_agenda_resumo() x
  ),
  -- (…378) versão MAIS RECENTE de cada anexo por cliente. A ordem é a do
  -- índice (cliente_id, enviado_em desc); `id desc` só desempata.
  mn as (
    select distinct on (m.cliente_id)
           m.cliente_id, m.status, m.enviado_em, m.enviado_pela_equipe
      from gps.cliente_minutas m
     order by m.cliente_id, m.enviado_em desc, m.id desc
  ),
  cq as (
    select distinct on (k.cliente_id)
           k.cliente_id, k.status, k.enviado_em, k.enviado_pela_equipe
      from gps.cliente_croquis k
     order by k.cliente_id, k.enviado_em desc, k.id desc
  ),
  base as (
    select c.id, c.aluno_id, t.nome as parceiro_nome, c.nome as cliente_nome,
           c.telefone, c.fase, c.grau_relacao, c.perfil_disc,
           c.data_reuniao_preliminar, c.aderiu_reuniao, c.acompanhado_equipe,
           c.criado_em,
           r.ep_em, r.ep_estado, r.rp_em, r.rp_estado,
           r.cq_em, r.cq_estado, r.ex_em, r.ex_estado,
           coalesce(r.etapa_agenda, 'sem') as etapa_agenda,
           mn.status as mn_status, mn.enviado_em as mn_em,
           mn.enviado_pela_equipe as mn_por_equipe,
           cq.status as cq_pdf_status, cq.enviado_em as cq_pdf_em,
           cq.enviado_pela_equipe as cq_pdf_por_equipe
    from gps.etapa1_clientes c
    -- LEFT, nao INNER (conferido 14/09: 0 orfaos em 1.222 clientes). Com
    -- INNER, cliente cujo cadastro do parceiro sumisse de thb_alunos (base
    -- compartilhada com o sip) DESAPARECERIA da lista e da contagem, sem
    -- erro. Com LEFT ele aparece com o dono vazio -- pendencia visivel em
    -- vez de sumico silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    left join r on r.cliente_id = c.id
    left join mn on mn.cliente_id = c.id
    left join cq on cq.cliente_id = c.id
    where (p_fase is null or c.fase = p_fase)
      -- `data_reuniao_preliminar` e `date`: comparar com `current_date` e
      -- data contra data. NUNCA `now()` -- o bug do `hojeISO` em UTC ja morde
      -- o Financeiro das 21h a meia-noite.
      and (
        p_reuniao is null
        or (p_reuniao = 'com_reuniao' and c.data_reuniao_preliminar is not null)
        or (p_reuniao = 'marcada' and c.data_reuniao_preliminar > current_date + 7)
        or (p_reuniao = 'para_vencer' and c.data_reuniao_preliminar between current_date and current_date + 7)
        or (p_reuniao = 'vencida' and c.data_reuniao_preliminar <  current_date)
        or (p_reuniao = 'sem'     and c.data_reuniao_preliminar is null)
      )
      and (p_agenda is null or coalesce(r.etapa_agenda, 'sem') = p_agenda)
      -- (…378) pendente = enviada ou em_analise; a MESMA regra dos KPIs.
      and (
        p_anexo is null
        or (p_anexo = 'minuta_pendente' and mn.status in ('enviada', 'em_analise'))
        or (p_anexo = 'croqui_pendente' and cq.status in ('enviada', 'em_analise'))
        or (p_anexo = 'minuta_revisada' and mn.status = 'revisada')
        or (p_anexo = 'croqui_revisado' and cq.status = 'revisada')
      )
      and (p_grau is null
           or (p_grau = '_nulo' and c.grau_relacao is null)
           or c.grau_relacao = p_grau)
      and (v_busca is null
           or c.nome ilike '%' || v_busca || '%'
           or t.nome ilike '%' || v_busca || '%')
  )
  select b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
         b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar,
         b.aderiu_reuniao, b.acompanhado_equipe, b.criado_em,
         b.ep_em, b.ep_estado, b.rp_em, b.rp_estado,
         b.cq_em, b.cq_estado, b.ex_em, b.ex_estado, b.etapa_agenda,
         (count(*) over ())::bigint as total_linhas,
         b.mn_status, b.mn_em, b.mn_por_equipe,
         b.cq_pdf_status, b.cq_pdf_em, b.cq_pdf_por_equipe
  from base b
  -- 🔑 (28/09) Estrela primeiro, SEMPRE — em qualquer filtro e em qualquer
  -- página. `desc` em boolean = true antes de false. A coluna é NOT NULL
  -- default false (conferido 28/09) — sem `coalesce`, que só esconderia a
  -- chave de ordenação do planner.
  order by b.acompanhado_equipe desc, b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

comment on function gps.admin_clientes_lista(integer, integer, text, text, text, text, text, text) is
  'Lista consolidada de clientes do programa (todos os ambientes), para /admin/clientes e o export CSV. gps.eh_admin() ou 42501. p_limite tem teto 5000. total_linhas e count(*) over() DENTRO do filtro. LEFT JOIN com public.thb_alunos (nao INNER: cliente cujo parceiro sumisse da base compartilhada desapareceria da lista E da contagem, sem erro). p_reuniao (…285): com_reuniao|marcada|para_vencer|vencida|sem|null sobre data_reuniao_preliminar contra current_date. (…355, 06/10/2026) + ep/rp/cq/ex _em/_estado e etapa_agenda de gps.cliente_agenda_resumo() (a regra mora la), e p_agenda: sem|entrevista|preliminar|croqui|execucao|null. (…378, 08/10/2026) + mn_status/mn_em/mn_por_equipe e cq_pdf_status/cq_pdf_em/cq_pdf_por_equipe da versao MAIS RECENTE (enviado_em desc, id desc) de cliente_minutas/cliente_croquis (NULL = sem anexo), e p_anexo: minuta_pendente|croqui_pendente|minuta_revisada|croqui_revisado|null (pendente = enviada ou em_analise; mesma regra de admin_clientes_anexos_kpis). Valor fora de qualquer catalogo -> 22023. Estrela (acompanhado_equipe) primeiro na ordem. 🔴 DECISAO DE LGPD DO MARCIO: registro_contato, valor_honorarios, contrato_* e problemas NAO entram no retorno -- os terceiros da lista nao deram consentimento para consolidacao.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. gps.admin_registrar_export_clientes — corpo vivo (…370) + p_anexo
-- ═══════════════════════════════════════════════════════════════════════════
drop function gps.admin_registrar_export_clientes(integer, text, text, text, text, text);

CREATE FUNCTION gps.admin_registrar_export_clientes(p_linhas integer, p_fase text DEFAULT NULL::text, p_grau text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_reuniao text DEFAULT NULL::text, p_agenda text DEFAULT NULL::text, p_anexo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'clientes_exportados',
    null,
    format(
      '%s linha(s) exportada(s). Filtro: fase=%s, grau=%s, busca=%s, reuniao=%s, agenda=%s, anexo=%s',
      greatest(coalesce(p_linhas, 0), 0),
      coalesce(p_fase, '(todas)'),
      coalesce(p_grau, '(todos)'),
      -- so registra SE houve busca -- nao o termo em si, que pode ser o
      -- nome de um cliente ou parceiro (dado de terceiro).
      case when nullif(btrim(coalesce(p_busca, '')), '') is null
           then '(nenhuma)' else '(com termo)' end,
      coalesce(p_reuniao, '(todas)'),
      coalesce(p_agenda, '(todas)'),
      coalesce(p_anexo, '(todos)')
    ),
    auth.uid()
  );
end $function$;

comment on function gps.admin_registrar_export_clientes(integer, text, text, text, text, text, text) is
  'Grava UMA linha de auditoria por clique em "Exportar CSV" na lista consolidada de clientes (acao=clientes_exportados): quantas linhas, e o FILTRO aplicado (fase/grau/se houve busca/reuniao/agenda/anexo -- nunca o termo digitado, que pode ser nome de terceiro). p_reuniao em …282; p_agenda em …355; p_anexo em …378 (08/10/2026): sem ele a trilha registraria um recorte diferente do exportado com ?anexo= ativo. aluno_id fica NULL de proposito: o export nao e de um ambiente, e do universo do filtro. SECURITY DEFINER porque gps.acessos_log nao tem policy de insert (RLS nega em silencio). 🔴 Esta e a UNICA acao do catalogo em que, se o insert falhar, quem chama (exportarClientesCsv) FAZ O EXPORT FALHAR -- decisao do Marcio: aqui a trilha e a guarda de LGPD, nao um detalhe.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. gps.admin_clientes_anexos_kpis() — 6 linhas fixas
-- ═══════════════════════════════════════════════════════════════════════════
create function gps.admin_clientes_anexos_kpis()
returns table(tipo text, situacao text, total integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 6 linhas SEMPRE (inclusive zeradas): o catálogo dirige, os clientes entram
  -- por LEFT JOIN. Conta CLIENTES pela versão mais recente (distinct on, a
  -- MESMA expressão de admin_clientes_lista). `pendente` CONTÉM `em_analise`
  -- (é o p_anexo=*_pendente da lista): pendente + revisada = clientes com anexo.
  return query
  with mn as (
    select distinct on (m.cliente_id) m.cliente_id, m.status
      from gps.cliente_minutas m
     order by m.cliente_id, m.enviado_em desc, m.id desc
  ),
  cq as (
    select distinct on (k.cliente_id) k.cliente_id, k.status
      from gps.cliente_croquis k
     order by k.cliente_id, k.enviado_em desc, k.id desc
  ),
  x as (
    select 'minuta'::text as t, mn.status as s from mn
    union all
    select 'croqui'::text, cq.status from cq
  )
  select g.t, g.s, count(x.t)::integer
    from (values ('minuta', 'pendente', 1), ('minuta', 'em_analise', 2), ('minuta', 'revisada', 3),
                 ('croqui', 'pendente', 4), ('croqui', 'em_analise', 5), ('croqui', 'revisada', 6))
         as g(t, s, ordem)
    left join x
      on x.t = g.t
     and (x.s = g.s or (g.s = 'pendente' and x.s in ('enviada', 'em_analise')))
   group by g.t, g.s, g.ordem
   order by g.ordem;
end;
$function$;

comment on function gps.admin_clientes_anexos_kpis() is
  'KPIs de anexos de /admin/clientes (…378, 08/10/2026): 6 linhas fixas, nesta ordem: minuta×(pendente, em_analise, revisada), croqui×(pendente, em_analise, revisada). total = CLIENTES cuja versao MAIS RECENTE (enviado_em desc, id desc) esta naquela situacao. pendente = enviada OU em_analise (contem em_analise; e o mesmo recorte de admin_clientes_lista(p_anexo=*_pendente) -- tile e lista tem de bater). Cliente sem anexo nao conta. gps.eh_admin() ou 42501.';

revoke all     on function gps.admin_clientes_anexos_kpis() from public, anon;
grant  execute on function gps.admin_clientes_anexos_kpis() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. ACL de lista e export — reaplicado IDÊNTICO ao capturado + conferido
-- ═══════════════════════════════════════════════════════════════════════════
do $acl$
declare
  r     record;
  v_vivo text;
  v_cap  text;
begin
  -- Zera o que o create deu (PUBLIC + ALTER DEFAULT PRIVILEGES do schema:
  -- neste projeto função nova nasce executável por authenticated e outros)…
  for r in
    select p.oid, case when a.grantee = 0 then 'public' else a.grantee::regrole::text end as papel
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid in (to_regprocedure('gps.admin_clientes_lista(integer,integer,text,text,text,text,text,text)'),
                     to_regprocedure('gps.admin_registrar_export_clientes(integer,text,text,text,text,text,text)'))
       and a.privilege_type = 'EXECUTE'
       and a.grantee <> p.proowner
  loop
    execute format('revoke execute on function %s from %s', r.oid::regprocedure, r.papel);
  end loop;

  -- …e devolve exatamente o capturado antes do drop.
  for r in select a.fn, a.papel from _acl_378 a loop
    if r.fn = 'lista' then
      execute format('grant execute on function gps.admin_clientes_lista(integer, integer, text, text, text, text, text, text) to %s', r.papel);
    else
      execute format('grant execute on function gps.admin_registrar_export_clientes(integer, text, text, text, text, text, text) to %s', r.papel);
    end if;
  end loop;

  -- Default do schema pode ter dado EXECUTE a quem não tinha: o conjunto vivo
  -- tem de ser IGUAL ao capturado.
  for r in
    select 'lista' as fn, to_regprocedure('gps.admin_clientes_lista(integer,integer,text,text,text,text,text,text)') as oid
    union all
    select 'export', to_regprocedure('gps.admin_registrar_export_clientes(integer,text,text,text,text,text,text)')
  loop
    select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) into v_vivo
      from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = r.oid and a.privilege_type = 'EXECUTE' and a.grantee <> p.proowner;
    select string_agg(c.papel, ',' order by c.papel) into v_cap
      from _acl_378 c where c.fn = r.fn;
    if v_vivo is distinct from v_cap then
      raise exception '378: ACL de % divergiu (vivo=%, antes=%) — ABORTADA', r.fn, v_vivo, v_cap;
    end if;
  end loop;
end
$acl$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS — ROTEIRO A RODAR DEPOIS DE APLICAR (não são resultados ainda)
-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉ-VOO (ANTES de aplicar, só leitura) — antecipa as guardas G1..G5:
--   select p.oid::regprocedure, md5(p.prosrc) from pg_proc p
--    where p.oid in (to_regprocedure('gps.admin_clientes_lista(integer,integer,text,text,text,text,text)'),
--                    to_regprocedure('gps.admin_registrar_export_clientes(integer,text,text,text,text,text)'),
--                    to_regprocedure('gps.cliente_croqui_remover(uuid)'),
--                    to_regprocedure('gps.minuta_registrar_parecer(uuid,text,text)'));
--   -- esperado: 3e478461861c2de4bb4e57e5554fe579 · d6aa2f045cfbbec5526788220e116bcf ·
--   --           b2527ebf98269a1d59b925bd16d95980 · 9c75b808489ec04dceee77499cf90255
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'gps.cliente_minutas'::regclass
--      and conname in ('chk_cliente_minutas_status', 'chk_cliente_minutas_parecer_tam');
--   select p.oid::regprocedure, p.proacl::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname in ('admin_clientes_lista', 'admin_registrar_export_clientes');
--   select objeto from blindagem.auditoria_funcoes
--    where objeto_oid in (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--                          where n.nspname = 'gps' and p.proname in ('admin_clientes_lista',
--                            'admin_registrar_export_clientes', 'cliente_croqui_remover'));
--   -- esperado: 0 linhas (senão a blindagem trava o DDL e pede autorizar_guarda)
--
-- P0 índices (como postgres):
--   select indexdef from pg_indexes
--    where schemaname = 'gps' and tablename in ('cliente_minutas', 'cliente_croquis');
--   -- esperado: ... (cliente_id, enviado_em DESC) nas duas.
--
-- P1..P5 em transação revertida. <admin> = user_id de gps.admins ativo;
-- <parceiro> = user_id de membro titular do ambiente dono de <croqui>.
--   begin;
--   -- folha de teste: a mais recente de algum cliente
--   select k.id as croqui, c.aluno_id from gps.cliente_croquis k
--     join gps.etapa1_clientes c on c.id = k.cliente_id order by k.enviado_em desc limit 1;
--
--   -- P1 parceiro → parecer recusado (42501)
--   select set_config('request.jwt.claims', '{"sub":"<parceiro>","role":"authenticated"}', true);
--   set local role authenticated;
--   select gps.croqui_registrar_parecer('<croqui>', 'revisada', 'x');   -- ERRO 42501 Sem permissão.
--   rollback; begin;
--   -- P2 parceiro sem UPDATE direto na tabela
--   (mesmo set_config/role) update gps.cliente_croquis set status = 'revisada' where id = '<croqui>';  -- 42501
--   rollback; begin;
--   -- P3 admin grava; revisada sem parecer → 22023; status fora → 22023
--   select set_config('request.jwt.claims', '{"sub":"<admin>","role":"authenticated"}', true);
--   set local role authenticated;
--   select gps.croqui_registrar_parecer('<croqui>', 'revisada', null);    -- 22023
--   select gps.croqui_registrar_parecer('<croqui>', 'xx', 'p');           -- 22023
--   select gps.croqui_registrar_parecer('<croqui>', 'revisada', 'Parecer de teste');
--   -- esperado: jsonb com status=revisada e avisar preenchido
--   -- P4 parceiro tenta remover a revisada → 42501 "Este croqui já foi revisado…"
--   select set_config('request.jwt.claims', '{"sub":"<parceiro>","role":"authenticated"}', true);
--   select gps.cliente_croqui_remover('<croqui>');                         -- 42501
--   -- P5 admin remove a revisada → ok
--   select set_config('request.jwt.claims', '{"sub":"<admin>","role":"authenticated"}', true);
--   select gps.cliente_croqui_remover('<croqui>');                         -- {"removido": true}
--   rollback;
--
-- P6 lista × KPIs (admin, begin…rollback):
--   select * from gps.admin_clientes_anexos_kpis();                         -- 6 linhas
--   select (gps.admin_clientes_lista(1,0,null,null,null,null,null,'minuta_pendente')).total_linhas;
--   -- = total de (minuta, pendente); idem croqui_pendente, minuta_revisada, croqui_revisado
--   select gps.admin_clientes_lista(1,0,null,null,null,null,null,'x');     -- 22023
--   -- universo intacto: total_linhas sem filtro = count(*) from gps.etapa1_clientes
--   -- parceiro: lista e kpis → 42501
--
-- P7 ACL (como postgres, fora de transação):
--   select p.proname, pg_get_function_identity_arguments(p.oid), p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname in ('admin_clientes_lista', 'admin_registrar_export_clientes',
--          'croqui_registrar_parecer', 'admin_clientes_anexos_kpis', 'cliente_croqui_remover');
--   -- 1 linha por nome; nenhuma entrada '=X/' (PUBLIC) nem anon.
--
-- explain (analyze, buffers) — 2 passadas, colar a 2ª (admin, begin…rollback):
--   explain (analyze, buffers) select * from gps.admin_clientes_lista(100, 0);
--     → [preencher]
--   explain (analyze, buffers) select * from gps.admin_clientes_lista(100, 0, null, null, null, null, null, 'minuta_pendente');
--     → [preencher]
--   explain (analyze, buffers) select * from gps.admin_clientes_anexos_kpis();
--     → [preencher]
--   -- o plano INTERNO (a RPC é plpgsql): load 'auto_explain';
--   --   set local auto_explain.log_min_duration = 0; set local auto_explain.log_analyze = on;
--   --   set local auto_explain.log_nested_statements = on;  → ler no log do Postgres.
--   -- UPDATE da RPC de parecer (EXECUTA — só dentro de begin…rollback):
--   explain (analyze, buffers) update gps.cliente_croquis set status = status where id = '<croqui>';
--     → [preencher; esperado Index Scan using cliente_croquis_pkey]
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ Provas medidas em produção (08/10/2026, após aplicar; transação desfeita) ═══
-- parceiro → croqui_registrar_parecer            → 42501 "Sem permissão."
-- admin    → croqui_registrar_parecer 'revisada' → ok
-- parceiro → cliente_croqui_remover (revisada)   → 42501 "Este croqui já foi revisado pela equipe e não pode ser removido."
-- admin_clientes_anexos_kpis: minuta pendente 10 / croqui pendente 1;
--   admin_clientes_lista(p_anexo=>'minuta_pendente') = 10, 'croqui_pendente' = 1 (tile = lista).
-- funções gps com acento quebrado (prosrc ~ 'Ã[¡-ÿ]') = 0.
-- explain (analyze, buffers), como admin:
--   admin_clientes_lista()       → 63,167 ms frio (shared hit=2365) / 12,370 ms quente (hit=485), 100 linhas
--   admin_clientes_anexos_kpis() → 10,494 ms (shared hit=777), 6 linhas
