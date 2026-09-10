-- Mega feature — `gps.admin_dashboard()`: o painel executivo em UMA ida.
--
-- Pedido do João: "bater o olho no menu de admin e saber a performance média,
-- quantas pessoas entraram no mês — micro KPIs dentro de uma macro KPI".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- UMA IDA AO BANCO POR ABERTURA DE /admin
-- ═══════════════════════════════════════════════════════════════════════════
--   Nenhum card consulta por conta própria — é o defeito que `chamados-data.ts`
--   já documenta. E DOIS dos nove cards NÃO ESTÃO AQUI de propósito:
--     · card 6 (faixas de progresso da Etapa 01) sai do `pct` que
--       `getAlunosGps()` já calcula com `resumoEtapa1` — o catálogo de tarefas
--       vive no TypeScript e reescrevê-lo em SQL criaria um segundo lugar para
--       a MESMA regra divergir. Montado em `faixasDeTrilha()`
--       (src/lib/data/dashboard.ts), sobre dados que a página já tem;
--     · card 7 (atendimento) sai de `getAtendimentoPorAluno()`, a RPC
--       `gps.admin_painel_atendimento()` que `/admin` JÁ chama.
--   Resultado: o dashboard inteiro custa UMA consulta nova, não nove.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ZERO PII NO RETORNO
-- ═══════════════════════════════════════════════════════════════════════════
--   Só contagens, somas e datas. Nenhum nome, nenhum e-mail, nenhum
--   `aluno_id` — nem no bloco de honorários, que devolve as somas POR
--   AMBIENTE como uma lista de NÚMEROS sem identificador. Nome de gente só na
--   lista de /admin, que já é só-admin. `gp_is_admin()` ou 42501 na 1ª linha.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A META NÃO É CALCULADA AQUI (e não existe meta do programa)
-- ═══════════════════════════════════════════════════════════════════════════
--   `META_HONORARIOS` (R$ 150.000) é POR AMBIENTE e mora em src/lib/etapa1.ts.
--   Somar 158 × 150k para inventar uma "meta do programa" seria número
--   inventado — proibido. Por isso o bloco devolve `somas_por_ambiente` e quem
--   conta "quantos bateram" é o TypeScript, com a constante que já existe.
--   E NENHUM valor em reais do saldo do programa aparece em lugar nenhum
--   (B-S1, pendente do João).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VARIAÇÃO DO MÊS: "ATÉ O DIA N"
-- ═══════════════════════════════════════════════════════════════════════════
--   O mês corrente é comparado com o mesmo INTERVALO DE DIAS do mês anterior,
--   e o retorno traz `dia` para a tela ESCREVER isso. Sem esse recorte, todo
--   dia 1º o painel anunciaria −95% e alguém tomaria decisão em cima disso.
--   `least(..., inicio_do_mes - 1)` protege o caso 31/03 → fevereiro: sem ele,
--   "até o dia 31" de fevereiro invadiria março.
--   Fuso America/Sao_Paulo em TODA fronteira de dia — a lição de
--   `plantao_slots.inicio_em`: comparar `timestamptz` cru mente das 21h à
--   meia-noite.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O ÍNDICE (gate M3 da Onda 0 — MEDIDO, não suposto)
-- ═══════════════════════════════════════════════════════════════════════════
--   `explain (analyze, buffers)` do `group by` por dia em `gps.aluno_eventos`
--   (janela de 30 dias, 1.450 linhas na tabela) deu **Seq Scan**, com
--   `Rows Removed by Filter: 783` e 24,7 ms. Os 3 índices existentes não
--   servem: `timeline (aluno_id, ocorrido_em desc)` e `backfill_corte` são
--   ancorados em `aluno_id`, e este agregado NÃO filtra por aluno.
--   Hoje 24,7 ms é barato; o custo cresce com o TOTAL de eventos do sistema,
--   sem teto, e este card abre junto com /admin. Por isso o índice entra na
--   MESMA migração — é a regra da casa: índice com o plano medido ao lado.
--
-- O QUE NÃO FAZ: não escreve nenhuma linha, não lê `gps.aluno_notas` (o texto
--   do Diário não entra em agregado), não toca as RPCs existentes.
--
-- REVERSÃO:
--   drop function gps.admin_dashboard();
--   drop index gps.idx_aluno_eventos_ocorrido_em;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Índice do card 8
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists idx_aluno_eventos_ocorrido_em
  on gps.aluno_eventos (ocorrido_em desc);

comment on index gps.idx_aluno_eventos_ocorrido_em is
  'Serve o card "Atividade" de gps.admin_dashboard(): group by dia sobre os ultimos 30 dias, SEM filtro por aluno_id -- por isso os indices timeline (aluno_id, ocorrido_em desc) e backfill_corte nao entram no plano. Medido em 10/09/2026 antes de criar: Seq Scan, Rows Removed by Filter 783, 24,7 ms com 1.450 linhas. Barato hoje, cresce com o TOTAL de eventos do sistema e abre junto com /admin.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. A RPC
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_fuso        text := 'America/Sao_Paulo';
  v_hoje        date;
  v_dia         integer;
  v_ini_mes     date;
  v_ini_ant     date;
  v_fim_ant     date;
  v_programa    jsonb;
  v_acesso      jsonb;
  v_onboarding  jsonb;
  v_clientes    jsonb;
  v_honorarios  jsonb;
  v_atividade   jsonb;
  v_grau        jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_hoje    := (now() at time zone v_fuso)::date;
  v_dia     := extract(day from v_hoje)::integer;
  v_ini_mes := date_trunc('month', v_hoje)::date;
  v_ini_ant := (v_ini_mes - interval '1 month')::date;
  -- "mesmo dia do mês anterior", sem invadir o mês corrente quando o mês
  -- anterior é mais curto (31/03 → fevereiro).
  v_fim_ant := least(v_ini_ant + (v_dia - 1), v_ini_mes - 1);

  -- ── 1. No programa (entradas por mês, pelo TITULAR) ────────────────────
  with tit as (
    select (m.criado_em at time zone v_fuso)::date as dia
      from gps.membros m
     where m.papel = 'titular'
  ),
  meses as (
    select to_char(date_trunc('month', t.dia), 'YYYY-MM') as mes,
           count(*)::integer as qtd
      from tit t
     where t.dia >= (v_ini_mes - interval '11 months')::date
     group by 1
  )
  select jsonb_build_object(
    'total',        (select count(distinct m.aluno_id)::integer from gps.membros m),
    'no_mes',       (select count(*)::integer from tit t where t.dia >= v_ini_mes),
    'no_mes_anterior_ate_o_dia',
                    (select count(*)::integer from tit t
                      where t.dia >= v_ini_ant and t.dia <= v_fim_ant),
    'por_mes',      (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'qtd', qtd)
                                               order by mes), '[]'::jsonb) from meses)
  ) into v_programa;

  -- ── 2. Acesso ─────────────────────────────────────────────────────────
  with amb as (
    select m.aluno_id,
           bool_or(m.user_id is not null) as tem_login,
           max(u.last_sign_in_at)         as ultimo_acesso
      from gps.membros m
      left join auth.users u on u.id = m.user_id
     group by m.aluno_id
  )
  select jsonb_build_object(
    'total',          count(*)::integer,
    'com_login',      count(*) filter (where a.tem_login)::integer,
    'sem_login',      count(*) filter (where not a.tem_login)::integer,
    'nunca_entraram', count(*) filter (where a.tem_login and a.ultimo_acesso is null)::integer,
    'sem_acesso_30d', count(*) filter (
                        where a.ultimo_acesso is not null
                          and a.ultimo_acesso < now() - interval '30 days')::integer,
    'ativos_30d',     count(*) filter (
                        where a.ultimo_acesso >= now() - interval '30 days')::integer
  ) into v_acesso
  from amb a;

  -- ── 3. Onboarding ─────────────────────────────────────────────────────
  -- Denominador é PESSOA (o questionário é da pessoa, não do ambiente): todo
  -- membro com cadastro vinculado. Zero aqui é RESULTADO, não tela quebrada —
  -- a copy do card diz "ninguém respondeu ainda, o questionário abre no
  -- próximo acesso de cada aluno".
  select jsonb_build_object(
    'pessoas',       (select count(*)::integer from gps.membros m where m.pessoa_aluno_id is not null),
    'concluidos',    (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null),
    'em_andamento',  (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null),
    'concluidos_no_mes',
                     (select count(*)::integer from gps.onboarding_respostas r
                       where r.concluido_em is not null
                         and (r.concluido_em at time zone v_fuso)::date >= v_ini_mes),
    'parados_7d',    (select count(*)::integer from gps.onboarding_respostas r
                       where r.concluido_em is null
                         and r.atualizado_em < now() - interval '7 days'),
    'com_cliente1',  (select count(*)::integer from gps.onboarding_respostas r
                       where r.origem_cliente1 = 'ja_tenho'),
    'em_execucao',   (select count(*)::integer from gps.onboarding_respostas r
                       where r.fase_cliente1 = 'execucao_andamento')
  ) into v_onboarding;

  -- ── 4. Clientes ───────────────────────────────────────────────────────
  select jsonb_build_object(
    'total',       count(*)::integer,
    'prospeccao',  count(*) filter (where c.fase = 'prospeccao')::integer,
    'fechamento',  count(*) filter (where c.fase = 'fechamento')::integer,
    'contratado',  count(*) filter (where c.fase = 'contratado')::integer,
    'no_mes',      count(*) filter (
                     where (c.criado_em at time zone v_fuso)::date >= v_ini_mes)::integer,
    'no_mes_anterior_ate_o_dia', count(*) filter (
                     where (c.criado_em at time zone v_fuso)::date >= v_ini_ant
                       and (c.criado_em at time zone v_fuso)::date <= v_fim_ant)::integer
  ) into v_clientes
  from gps.etapa1_clientes c;

  -- ── 5. Honorários ─────────────────────────────────────────────────────
  -- `somas_por_ambiente` é uma lista de NÚMEROS, sem identificador: é o que
  -- deixa o TypeScript contar quantos bateram META_HONORARIOS sem trazer a
  -- constante para o SQL (um lugar só para a regra) e sem devolver PII.
  -- `total_reais` sem coalesce: NULL = nenhum contratado com valor
  -- registrado, e isso NÃO é R$ 0,00.
  with por_amb as (
    select c.aluno_id, sum(c.valor_honorarios) as soma
      from gps.etapa1_clientes c
     where c.fase = 'contratado' and c.valor_honorarios is not null
     group by c.aluno_id
  )
  select jsonb_build_object(
    'clientes_contratados',   (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
    'contratados_sem_valor',  (select count(*)::integer from gps.etapa1_clientes c
                                where c.fase = 'contratado' and c.valor_honorarios is null),
    'ambientes_com_contratado',
                              (select count(distinct c.aluno_id)::integer from gps.etapa1_clientes c
                                where c.fase = 'contratado'),
    'total_reais',            (select sum(p.soma) from por_amb p),
    'somas_por_ambiente',     (select coalesce(jsonb_agg(p.soma order by p.soma desc), '[]'::jsonb) from por_amb p)
  ) into v_honorarios;

  -- ── 8. Atividade (30 dias, aluno × equipe) ────────────────────────────
  with dias as (
    select (e.ocorrido_em at time zone v_fuso)::date         as dia,
           count(*) filter (where e.ator = 'aluno')::integer as qtd_aluno,
           count(*) filter (where e.ator = 'equipe')::integer as qtd_equipe,
           count(*) filter (where e.ator = 'sistema')::integer as qtd_sistema
      from gps.aluno_eventos e
     where e.ocorrido_em >= now() - interval '30 days'
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia', d.dia, 'aluno', d.qtd_aluno, 'equipe', d.qtd_equipe, 'sistema', d.qtd_sistema
         ) order by d.dia), '[]'::jsonb)
    into v_atividade
    from dias d;

  -- ── 9. Grau de relação ────────────────────────────────────────────────
  -- `nao_informado` sai SEPARADO e nunca vira uma fatia chamada "Lead": NULL
  -- é ausência de resposta sobre a vida de um terceiro, não um palpite.
  with g as (
    select c.grau_relacao as grau, count(*)::integer as qtd
      from gps.etapa1_clientes c
     where c.grau_relacao is not null
     group by 1
  )
  select jsonb_build_object(
    'itens',         (select coalesce(jsonb_agg(jsonb_build_object('grau', g.grau, 'qtd', g.qtd)
                                                order by g.qtd desc, g.grau), '[]'::jsonb) from g),
    'nao_informado', (select count(*)::integer from gps.etapa1_clientes c where c.grau_relacao is null)
  ) into v_grau;

  return jsonb_build_object(
    'gerado_em',   now(),
    'referencia',  jsonb_build_object(
                     'fuso', v_fuso, 'hoje', v_hoje, 'dia', v_dia,
                     'mes', to_char(v_ini_mes, 'YYYY-MM'),
                     'mes_anterior', to_char(v_ini_ant, 'YYYY-MM')),
    'programa',    v_programa,
    'acesso',      v_acesso,
    'onboarding',  v_onboarding,
    'clientes',    v_clientes,
    'honorarios',  v_honorarios,
    'atividade',   v_atividade,
    'grau_relacao', v_grau
  );
end $function$;

comment on function gps.admin_dashboard() is
  'Dashboard executivo de /admin em UMA ida ao banco: 7 blocos agregados (programa, acesso, onboarding, clientes, honorarios, atividade, grau_relacao). Os outros 2 cards -- faixas de progresso e atendimento -- sao montados no TypeScript a partir do que /admin JA carrega (getAlunosGps e getAtendimentoPorAluno), para nao reescrever em SQL o catalogo de tarefas nem repetir uma RPC que ja roda. ZERO PII: so contagens, somas e datas; nem aluno_id aparece (as somas de honorarios voltam como lista de numeros sem identificador, para o TypeScript aplicar META_HONORARIOS -- a meta e POR AMBIENTE e nao existe meta do programa). Variacao do mes comparada com o MESMO intervalo de dias do mes anterior (o retorno traz `dia` para a tela escrever "ate o dia N"); sem isso todo dia 1o o painel anunciaria -95%. Fuso America/Sao_Paulo em toda fronteira de dia. gp_is_admin() ou 42501.';

revoke execute on function gps.admin_dashboard() from public, anon;
grant  execute on function gps.admin_dashboard() to authenticated;
