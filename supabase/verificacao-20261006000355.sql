-- ═══════════════════════════════════════════════════════════════════════════
-- Provas da 20261006000355_gps_clientes_etapa_agenda.
--   Bloco 0 — ANTES de aplicar. Só leitura (nenhuma função nova é chamada).
--   Blocos 1–3 — DEPOIS de aplicar. Tudo em begin/rollback; nada escreve
--   (as RPCs medidas são stable e só leem; o export NÃO é chamado aqui).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0a. CHECK vivo de estado (a migração aborta se divergir) ──────────────
select pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'gps.sessao_agendamentos'::regclass and conname = 'chk_sessao_agend_estado';
select estado, tipo_id, count(*) from gps.sessao_agendamentos group by 1, 2 order by 2, 1;

-- ── 0b. CONTAGEM pela regra, sem a função (cópia do corpo de
--        gps.cliente_agenda_resumo, + diagnóstico). Só leitura. ─────────────
with sess as (
  select distinct on (a.cliente_id, g.grupo)
         a.cliente_id, g.grupo, a.inicio_em, a.estado as cru,
         case a.estado when 'realizado' then 'realizada' when 'falta' then 'faltou'
              else case when a.inicio_em > now() then 'agendada' else 'pendente' end end as estado
    from gps.sessao_agendamentos a
    cross join lateral (select case a.tipo_id when 1 then 'ep' when 2 then 'rp' when 3 then 'rp'
                                              when 4 then 'cq' when 5 then 'ex' end as grupo) g
   where a.estado in ('agendado', 'realizado', 'falta') and g.grupo is not null
   order by a.cliente_id, g.grupo, a.inicio_em desc, a.id desc
), piv as (
  select s.cliente_id,
         max(s.inicio_em) filter (where s.grupo='ep') ep_em, max(s.estado) filter (where s.grupo='ep') ep_estado,
         max(s.inicio_em) filter (where s.grupo='rp') rp_em, max(s.estado) filter (where s.grupo='rp') rp_estado,
         max(s.inicio_em) filter (where s.grupo='cq') cq_em, max(s.estado) filter (where s.grupo='cq') cq_estado,
         max(s.estado) filter (where s.grupo='ex') ex_estado
    from sess s group by s.cliente_id
), croqui as (
  select k.cliente_id, max(k.apresentado_em) dia from gps.cliente_croquis k
   where k.apresentado_em is not null group by k.cliente_id
), j as (
  select c.id, c.acompanhado_equipe, p.ep_estado, p.ex_estado,
         (c.data_reuniao_preliminar is not null and (p.rp_em is null
            or c.data_reuniao_preliminar > (p.rp_em at time zone 'America/Sao_Paulo')::date)) rp_ficha,
         (f.dia is not null and (p.cq_em is null
            or f.dia > (p.cq_em at time zone 'America/Sao_Paulo')::date)) cq_ficha,
         p.rp_em is not null and c.data_reuniao_preliminar is not null
           and c.data_reuniao_preliminar > (p.rp_em at time zone 'America/Sao_Paulo')::date as rp_ficha_venceu_sessao,
         coalesce(case when c.data_reuniao_preliminar is not null and (p.rp_em is null
            or c.data_reuniao_preliminar > (p.rp_em at time zone 'America/Sao_Paulo')::date) then 'x' end, p.rp_estado) rp_tem,
         coalesce(case when f.dia is not null and (p.cq_em is null
            or f.dia > (p.cq_em at time zone 'America/Sao_Paulo')::date) then 'x' end, p.cq_estado) cq_tem,
         p.rp_estado, p.cq_estado
    from gps.etapa1_clientes c
    left join piv p on p.cliente_id = c.id
    left join croqui f on f.cliente_id = c.id
), e as (
  select j.*, case when j.ex_estado is not null then 'execucao' when j.cq_tem is not null then 'croqui'
                   when j.rp_tem is not null then 'preliminar' when j.ep_estado is not null then 'entrevista'
                   else 'sem' end etapa
    from j
)
select etapa, count(*) total, count(*) filter (where acompanhado_equipe) estrela,
       count(*) filter (where etapa='preliminar' and rp_estado='faltou' and not rp_ficha) so_por_falta_rp,
       count(*) filter (where rp_ficha_venceu_sessao) ficha_mais_nova_que_sessao,
       count(*) filter (where etapa='preliminar' and rp_ficha) preliminar_so_pela_ficha
  from e group by rollup (etapa) order by etapa nulls last;
-- Esperado: a linha do rollup (etapa null) = select count(*) from gps.etapa1_clientes.

-- Quem já tem a Etapa 05 liberada (se um dia o tipo 5 ganhar etapa_id = 5):
select (select liberada from gps.etapas where id = 5) global_5,
       (select count(*) from gps.etapa_liberacao_aluno where etapa_id = 5 and liberada) override_5;

-- ═══ DEPOIS DE APLICAR ═════════════════════════════════════════════════════
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from public.perfis where status='ativo' and cargo in ('dev','admin') limit 1),
                    'role', 'authenticated')::text, true);
set local role authenticated;

-- ── 1. EXPLAIN (a porta real, 2 passadas cada; só leitura) ────────────────
explain (analyze, buffers) select * from gps.admin_clientes_lista(100, 0, null, null, null, null, null);
explain (analyze, buffers) select * from gps.admin_clientes_lista(100, 0, null, null, null, null, null);
explain (analyze, buffers) select * from gps.admin_clientes_agenda_kpis();
explain (analyze, buffers) select * from gps.admin_clientes_agenda_kpis();
explain (analyze, buffers) select * from gps.admin_clientes_lista(100, 0, null, null, null, null, 'preliminar');
reset role;
-- o corpo da regra (plano interno, como postgres — mostra Seq/Hash por tabela):
explain (analyze, buffers) select * from gps.cliente_agenda_resumo();
set local role authenticated;

-- ── 2. Invariantes ────────────────────────────────────────────────────────
select count(*) linhas, sum(total) soma, sum(estrela) soma_estrela from gps.admin_clientes_agenda_kpis(); -- 5 · = base
select count(*), count(*) filter (where acompanhado_equipe) from gps.etapa1_clientes;
select k.etapa_agenda, k.total,
       (select l.total_linhas from gps.admin_clientes_lista(1,0,null,null,null,null,k.etapa_agenda) l limit 1) lista
  from gps.admin_clientes_agenda_kpis() k;                       -- total = lista (0 → null)
select (select total_linhas from gps.admin_clientes_lista(1,0) limit 1) universo;  -- = base
rollback;

-- ── 3. Recusas (cada uma em transação própria; esperado o erro indicado) ──
-- 22023: select * from gps.admin_clientes_lista(1,0,null,null,null,null,'x');   (idem '' e 'CROQUI')
-- 42501 sem JWT: begin; set local role authenticated; select * from gps.admin_clientes_agenda_kpis(); rollback;
-- 42501 permissão: begin; set local role authenticated; select * from gps.cliente_agenda_resumo(); rollback;

-- ── 4. ACL / sobrecarga / tipo 5 ──────────────────────────────────────────
select p.proname, pg_get_function_identity_arguments(p.oid) args, p.proacl::text, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('admin_clientes_lista', 'admin_clientes_agenda_kpis', 'admin_registrar_export_clientes',
                     'cliente_agenda_resumo', 'admin_clientes_reuniao_kpis')
 order by 1;
-- Esperado: 1 linha por nome; nenhuma ACL com '=X/' (PUBLIC) nem anon;
-- cliente_agenda_resumo sem authenticated e prosecdef=false.
select id, nome, duracao_min, intervalo_min, exige_briefing, etapa_id, ativo from gps.sessao_tipos where id in (4, 5);
select count(*) faixas_tipo5 from gps.sessao_disponibilidade where tipo_id = 5;  -- 0
