-- ═══════════════════════════════════════════════════════════════════════════
-- 392 — "Precisa de atenção" vira painel de AÇÃO: uma linha por parceiro
--       (João, 16/10/2026: "Essas capes vão ser as principais para a gente
--       tomar uma ação... em vez da gente clicar no link e procurar em
--       clientes, eu queria que exibisse essa lista")
-- ═══════════════════════════════════════════════════════════════════════════
-- Uma RPC, SÓ admin, sobre a BASE INTEIRA (não o lote de 200 do painel): os
-- percentuais dos cards têm de valer para todos os parceiros.
--
-- Por parceiro (ambiente = gps.membros.aluno_id = public.thb_alunos.id):
--   · contato (nome, e-mail, telefone), login e último acesso;
--   · clientes cadastrados (nome preenchido — o MESMO predicado do filtro
--     `sem_cliente` e do card "Sem nenhum cliente") e com dados;
--   · o favorito (acompanhado_equipe): nome, fase, grau (eu_mesmo = própria
--     holding) e a etapa da agenda (`gps.cliente_agenda_resumo`);
--   · sessões (últimas 12, qualquer estado), chamados por status,
--     solicitações pendentes e pendências abertas do Diário.
-- A UI deriva a "situação" (agendou / aguardando a equipe / equipe respondeu
-- / sem desfecho / não agendou) — regra pura e testável no TS.
--
-- Medido 16/10 (R02): 190 parceiros · 83 sem nenhum cliente · 47 com 30+ ·
-- 51 com cliente e sem favorito · 56 com favorito.
--
-- REVERSÃO: drop function gps.admin_atencao_acoes();
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.admin_atencao_acoes()
returns table(
  aluno_id            uuid,
  nome                text,
  email               text,
  telefone            text,
  tem_login           boolean,
  ultimo_acesso       timestamptz,
  clientes            integer,
  clientes_com_dados  integer,
  favorito_id         uuid,
  favorito_nome       text,
  favorito_fase       text,
  favorito_grau       text,
  favorito_etapa      text,
  sessoes             jsonb,
  chamados_abertos    integer,
  chamados_respondidos integer,
  chamado_ultima_em   timestamptz,
  solicitacoes_pendentes integer,
  pendencias_diario   integer
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- R05/R06: guarda no banco, falha FECHADA.
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
  with amb as (
    select m.aluno_id,
           bool_or(m.user_id is not null) as tem_login,
           max(u.last_sign_in_at)         as ultimo_acesso
      from gps.membros m
      left join auth.users u on u.id = m.user_id
     group by m.aluno_id
  ),
  cli as (
    select c.aluno_id,
           count(*) filter (where coalesce(btrim(c.nome), '') <> '')::integer as preenchidos,
           count(*) filter (where coalesce(btrim(c.nome), '') <> ''
                              and coalesce(btrim(c.telefone), '') <> '')::integer as com_dados
      from gps.etapa1_clientes c
     group by c.aluno_id
  ),
  fav as (
    -- Um favorito por ambiente (a regra da casa); `distinct on` por segurança.
    select distinct on (c.aluno_id)
           c.aluno_id, c.id, c.nome, c.fase, c.grau_relacao
      from gps.etapa1_clientes c
     where c.acompanhado_equipe
     order by c.aluno_id, c.acompanhamento_confirmado_em desc nulls last, c.atualizado_em desc
  ),
  ses as (
    select x.aluno_id,
           jsonb_agg(jsonb_build_object(
             'tipo_id', x.tipo_id, 'tipo', x.tipo_nome, 'estado', x.estado,
             'inicio_em', x.inicio_em, 'cliente', x.cliente_nome)
             order by x.inicio_em desc) as sessoes
      from (
        select a.aluno_id, a.tipo_id, t.nome as tipo_nome, a.estado, a.inicio_em,
               c.nome as cliente_nome,
               row_number() over (partition by a.aluno_id order by a.inicio_em desc) as rn
          from gps.sessao_agendamentos a
          join gps.sessao_tipos t on t.id = a.tipo_id
          left join gps.etapa1_clientes c on c.id = a.cliente_id
      ) x
     where x.rn <= 12
     group by x.aluno_id
  ),
  cha as (
    select h.aluno_id,
           count(*) filter (where h.status = 'aberto')::integer     as abertos,
           count(*) filter (where h.status = 'respondido')::integer as respondidos,
           max(h.ultima_mensagem_em) filter (where h.status <> 'fechado') as ultima
      from gps.chamados h
     group by h.aluno_id
  ),
  sol as (
    select s.ambiente_aluno_id as aluno_id, count(*)::integer as pendentes
      from gps.chamado_solicitacoes s
     where s.estado = 'pendente'
     group by s.ambiente_aluno_id
  ),
  dia as (
    select n.aluno_id, count(*)::integer as abertas
      from gps.aluno_notas n
     where n.tipo in ('pendencia', 'combinado') and n.resolvido_em is null
     group by n.aluno_id
  )
  select a.aluno_id,
         t.nome, t.email, t.telefone,
         a.tem_login, a.ultimo_acesso,
         coalesce(cl.preenchidos, 0), coalesce(cl.com_dados, 0),
         f.id, f.nome, f.fase, f.grau_relacao, ag.etapa_agenda,
         coalesce(se.sessoes, '[]'::jsonb),
         coalesce(ch.abertos, 0), coalesce(ch.respondidos, 0), ch.ultima,
         coalesce(so.pendentes, 0),
         coalesce(di.abertas, 0)
    from amb a
    left join public.thb_alunos t on t.id = a.aluno_id
    left join cli cl on cl.aluno_id = a.aluno_id
    left join fav f  on f.aluno_id = a.aluno_id
    left join gps.cliente_agenda_resumo() ag on ag.cliente_id = f.id
    left join ses se on se.aluno_id = a.aluno_id
    left join cha ch on ch.aluno_id = a.aluno_id
    left join sol so on so.aluno_id = a.aluno_id
    left join dia di on di.aluno_id = a.aluno_id
   order by t.nome nulls last, a.aluno_id;
end;
$function$;

comment on function gps.admin_atencao_acoes() is
  'Painel "Precisa de atenção" (…392): uma linha por parceiro, base inteira, só admin.';

revoke all on function gps.admin_atencao_acoes() from public, anon;
grant execute on function gps.admin_atencao_acoes() to authenticated, service_role;
