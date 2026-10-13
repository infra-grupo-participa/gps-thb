-- ═══════════════════════════════════════════════════════════════════════════
-- 382 — Plantões (gps.plantao_slots) espelhados na agenda Google IMPLEMENTAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido da Aldri (13/10/2026): os plantões do mês também na agenda de
-- implementação. Reaproveita o espelho da …325 (mesma tabela gps.gcal_espelho,
-- mesma edge `calendar-espelho`, mesmo cron): só entra a origem 'plantao'.
--
--   • evento: "Plantão Acelera Holding - Implementação", link do Zoom no local,
--     SEM convidados (15+ alunos inscritos; lista não vai para o evento).
--   • slot cancelado, despublicado ou apagado → o evento sai da agenda
--     (estado 'cancelado' para a edge).
--   • o trigger só acorda com mudança em data/hora/duração/link/publicado/
--     cancelado. O cron de e-mail/aviso (aviso_mentora_em, atualizado_em)
--     NÃO acorda o espelho (WHEN compara só as colunas que viram evento).
--   • semente: só slots FUTUROS vivos (publicados, não cancelados). Os de
--     antes de hoje ficam de fora de propósito (histórico; a Aldri já lançou
--     o de 01/10 à mão). Conferido em 13/10: nenhum plantão futuro lançado à
--     mão na agenda, então não há risco de duplicata.
--
-- Ordem de aplicação: ESTA migration primeiro, DEPOIS o deploy da edge
-- (a edge antiga com origem 'plantao' montaria título de sessão).
-- A edge nova só muda `montarEvento`; sem pendência de plantão ela é igual.
--
-- DOWN (comentado — rodar à mão):
--   drop trigger if exists trg_gcal_espelho_plantao_ins on gps.plantao_slots;
--   drop trigger if exists trg_gcal_espelho_plantao_upd on gps.plantao_slots;
--   drop trigger if exists trg_gcal_espelho_plantao_del on gps.plantao_slots;
--   drop function if exists gps.gcal_espelho_plantao_pendente();
--   -- gcal_espelho_pendentes: reaplicar o corpo da …325 (seção 7.1)
--   -- (linhas origem='plantao' viram estado cancelado → apagar eventos ANTES:
--   --  update gps.gcal_espelho set pendente_em=now(), proxima_em=now() where origem='plantao'
--   --  após marcar os slots como cancelados, ou apagar os eventos pela agenda)
--   alter table gps.gcal_espelho drop constraint chk_gcal_espelho_origem;
--   alter table gps.gcal_espelho add constraint chk_gcal_espelho_origem check (origem in ('sessao'));
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';

-- 1) origem nova
alter table gps.gcal_espelho drop constraint if exists chk_gcal_espelho_origem;
alter table gps.gcal_espelho
  add constraint chk_gcal_espelho_origem check (origem in ('sessao', 'plantao'));

-- 2) trigger em gps.plantao_slots (molde de gps.gcal_espelho_sessao_pendente)
create or replace function gps.gcal_espelho_plantao_pendente()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  insert into gps.gcal_espelho as e (origem, origem_id, pendente_em, proxima_em, tentativas)
  values ('plantao', v_id, now(), now(), 0)
  on conflict (origem, origem_id) do update
     set pendente_em = now(),
         proxima_em  = now(),
         tentativas  = 0,
         erro        = null;

  -- Nunca derruba a escrita do slot: a pendência gravada é a garantia; o cron
  -- horário cobre a cutucada perdida.
  begin
    perform gps.gcal_espelho_chamar(v_id);
  exception when others then
    raise warning 'gcal_espelho: cutucada do plantao falhou (%); fica para o cron', sqlstate;
  end;

  return null;
end;
$function$;

revoke all on function gps.gcal_espelho_plantao_pendente() from public, anon, authenticated, service_role;

drop trigger if exists trg_gcal_espelho_plantao_ins on gps.plantao_slots;
create trigger trg_gcal_espelho_plantao_ins
  after insert on gps.plantao_slots
  for each row execute function gps.gcal_espelho_plantao_pendente();

drop trigger if exists trg_gcal_espelho_plantao_upd on gps.plantao_slots;
create trigger trg_gcal_espelho_plantao_upd
  after update on gps.plantao_slots
  for each row
  when ((old.inicio_em, old.duracao_min, old.zoom_url, old.publicado, old.cancelado_em)
        is distinct from
        (new.inicio_em, new.duracao_min, new.zoom_url, new.publicado, new.cancelado_em))
  execute function gps.gcal_espelho_plantao_pendente();

drop trigger if exists trg_gcal_espelho_plantao_del on gps.plantao_slots;
create trigger trg_gcal_espelho_plantao_del
  after delete on gps.plantao_slots
  for each row execute function gps.gcal_espelho_plantao_pendente();

-- 3) lote pendente: sessões (igual à …325) + plantões. Mesma assinatura e
-- mesmas colunas; `create or replace` mantém grants. Plantão: sem aluno,
-- sem cliente, sem responsável (nenhum convidado).
create or replace function gps.gcal_espelho_pendentes(
  p_origem_id uuid default null,
  p_limite    int  default 25
)
returns table (
  origem            text,
  origem_id         uuid,
  pendente_em       timestamptz,
  tentativas        int,
  google_event_id   text,
  assinatura        text,
  modo              text,
  existe            boolean,
  tipo_id           smallint,
  tipo_etapa        smallint,
  tipo_nome         text,
  estado            text,
  inicio_em         timestamptz,
  fim_em            timestamptz,
  link_reuniao      text,
  aluno_nome        text,
  cliente_nome      text,
  responsavel_email text,
  responsavel_nome  text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with lote as (
    select e.origem, e.origem_id, e.pendente_em, e.tentativas, e.google_event_id,
           e.assinatura, e.modo,
           (a.id is not null) as existe,
           a.tipo_id, t.etapa_id as tipo_etapa, t.nome as tipo_nome, a.estado,
           a.inicio_em, a.fim_em, a.link_reuniao,
           al.nome as aluno_nome, c.nome as cliente_nome,
           nullif(btrim(coalesce(p.email, u.email, '')), '') as responsavel_email,
           p.nome as responsavel_nome,
           e.proxima_em
      from gps.gcal_espelho e
      left join gps.sessao_agendamentos a on a.id = e.origem_id
      left join gps.sessao_tipos      t  on t.id  = a.tipo_id
      left join gps.etapa1_clientes   c  on c.id  = a.cliente_id
      left join public.thb_alunos     al on al.id = a.aluno_id
      left join public.perfis         p  on p.id  = a.responsavel_id
      left join auth.users            u  on u.id  = a.responsavel_id
     where e.origem = 'sessao'
       and e.pendente_em is not null
       and (p_origem_id is null or e.origem_id = p_origem_id)
       and (p_origem_id is not null or e.proxima_em <= now())
    union all
    select e.origem, e.origem_id, e.pendente_em, e.tentativas, e.google_event_id,
           e.assinatura, e.modo,
           (s.id is not null),
           null::smallint, null::smallint,
           'Plantão Acelera Holding'::text,
           case when s.id is null or s.cancelado_em is not null or not s.publicado
                then 'cancelado' else 'agendado' end,
           s.inicio_em,
           s.inicio_em + make_interval(mins => s.duracao_min),
           nullif(btrim(s.zoom_url), ''),
           null::text, null::text, null::text, null::text,
           e.proxima_em
      from gps.gcal_espelho e
      left join gps.plantao_slots s on s.id = e.origem_id
     where e.origem = 'plantao'
       and e.pendente_em is not null
       and (p_origem_id is null or e.origem_id = p_origem_id)
       and (p_origem_id is not null or e.proxima_em <= now())
  )
  select l.origem, l.origem_id, l.pendente_em, l.tentativas, l.google_event_id,
         l.assinatura, l.modo, l.existe, l.tipo_id, l.tipo_etapa, l.tipo_nome,
         l.estado, l.inicio_em, l.fim_em, l.link_reuniao, l.aluno_nome,
         l.cliente_nome, l.responsavel_email, l.responsavel_nome
    from lote l
   order by l.proxima_em
   limit least(greatest(coalesce(p_limite, 25), 1), 100);
$function$;

-- 4) semente: plantões futuros vivos entram pendentes. Com o espelho ligado,
-- a cutucada horária (ou a do próprio trigger, nos próximos) cria os eventos.
insert into gps.gcal_espelho (origem, origem_id, pendente_em, proxima_em)
select 'plantao', s.id, now(), now()
  from gps.plantao_slots s
 where s.publicado
   and s.cancelado_em is null
   and s.inicio_em + make_interval(mins => s.duracao_min) > now()
on conflict (origem, origem_id) do nothing;

commit;
