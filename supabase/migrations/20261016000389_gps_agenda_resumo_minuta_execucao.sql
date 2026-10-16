-- ═══════════════════════════════════════════════════════════════════════════
-- 389 — Apresentação da Minuta (tipo 6) conta como fase de EXECUÇÃO no resumo
--       da agenda do cliente (Aldri, Slack 16/10/2026: "Minuta fica na fase
--       de execução").
-- ═══════════════════════════════════════════════════════════════════════════
-- Única mudança sobre o corpo vivo (…355): `when 6 then 'ex'` no mapa de
-- grupos. Antes a Minuta caía em `grupo is null` e sumia do resumo.
-- `create or replace` preserva os GRANTs existentes.
--
-- REVERSÃO: reaplicar o mesmo corpo sem a linha `when 6 then 'ex'`.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.cliente_agenda_resumo()
 returns table(cliente_id uuid, ep_em timestamp with time zone, ep_estado text, rp_em timestamp with time zone, rp_estado text, cq_em timestamp with time zone, cq_estado text, ex_em timestamp with time zone, ex_estado text, etapa_agenda text)
 language sql
 stable
 set search_path to ''
as $function$
  with sess as (
    -- a NÃO cancelada mais recente de cada (cliente, grupo)
    select distinct on (a.cliente_id, g.grupo)
           a.cliente_id, g.grupo, a.inicio_em,
           case a.estado
             when 'realizado' then 'realizada'
             when 'falta'     then 'faltou'
             else case when a.inicio_em > now() then 'agendada' else 'pendente' end
           end as estado
      from gps.sessao_agendamentos a
      cross join lateral (
        select case a.tipo_id
                 when 1 then 'ep'
                 when 2 then 'rp'
                 when 3 then 'rp'   -- Viabilidade = Preliminar (João, 06/10)
                 when 4 then 'cq'
                 when 5 then 'ex'
                 when 6 then 'ex'   -- Minuta = Execução (Aldri, 16/10) — …389
               end as grupo
      ) g
     where a.estado in ('agendado', 'realizado', 'falta')
       and g.grupo is not null
     order by a.cliente_id, g.grupo, a.inicio_em desc, a.id desc
  ),
  piv as (
    select s.cliente_id,
           max(s.inicio_em) filter (where s.grupo = 'ep') as ep_em,
           max(s.estado)    filter (where s.grupo = 'ep') as ep_estado,
           max(s.inicio_em) filter (where s.grupo = 'rp') as rp_em,
           max(s.estado)    filter (where s.grupo = 'rp') as rp_estado,
           max(s.inicio_em) filter (where s.grupo = 'cq') as cq_em,
           max(s.estado)    filter (where s.grupo = 'cq') as cq_estado,
           max(s.inicio_em) filter (where s.grupo = 'ex') as ex_em,
           max(s.estado)    filter (where s.grupo = 'ex') as ex_estado
      from sess s
     group by s.cliente_id
  ),
  croqui as (
    select k.cliente_id, max(k.apresentado_em) as dia
      from gps.cliente_croquis k
     where k.apresentado_em is not null
     group by k.cliente_id
  ),
  junto as (
    select c.id as cliente_id,
           p.ep_em, p.ep_estado,
           rp.em as rp_em, rp.estado as rp_estado,
           cq.em as cq_em, cq.estado as cq_estado,
           p.ex_em, p.ex_estado
      from gps.etapa1_clientes c
      cross join (select (now() at time zone 'America/Sao_Paulo')::date as hoje) h
      left join piv p    on p.cliente_id = c.id
      left join croqui f on f.cliente_id = c.id
      -- Preliminar: sessão manda; ficha só se for de dia POSTERIOR ao da sessão.
      cross join lateral (
        select case when u.ficha then (c.data_reuniao_preliminar::timestamp at time zone 'America/Sao_Paulo')
                    else p.rp_em end as em,
               case when u.ficha then (case when c.data_reuniao_preliminar >= h.hoje then 'agendada' else 'realizada' end)
                    else p.rp_estado end as estado
          from (select c.data_reuniao_preliminar is not null
                       and (p.rp_em is null
                            or c.data_reuniao_preliminar > (p.rp_em at time zone 'America/Sao_Paulo')::date) as ficha) u
      ) rp
      -- Croqui: mesma regra, com o dia de apresentação mais recente.
      cross join lateral (
        select case when u.ficha then (f.dia::timestamp at time zone 'America/Sao_Paulo')
                    else p.cq_em end as em,
               case when u.ficha then (case when f.dia >= h.hoje then 'agendada' else 'realizada' end)
                    else p.cq_estado end as estado
          from (select f.dia is not null
                       and (p.cq_em is null
                            or f.dia > (p.cq_em at time zone 'America/Sao_Paulo')::date) as ficha) u
      ) cq
  )
  select j.cliente_id,
         j.ep_em, j.ep_estado, j.rp_em, j.rp_estado,
         j.cq_em, j.cq_estado, j.ex_em, j.ex_estado,
         case when j.ex_estado is not null then 'execucao'
              when j.cq_estado is not null then 'croqui'
              when j.rp_estado is not null then 'preliminar'
              when j.ep_estado is not null then 'entrevista'
              else 'sem'
         end as etapa_agenda
    from junto j;
$function$;
