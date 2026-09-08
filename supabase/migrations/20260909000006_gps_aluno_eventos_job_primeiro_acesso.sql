-- Diário do aluno — Fase 2: job diário de `primeiro_acesso` para alunos que
-- entrarem DEPOIS do backfill (migração ...04, que só cobre quem já tinha
-- login na data do backfill).
--
-- Por que função SQL + pg_cron, e não uma rota HTTP nova (nem encaixado em
-- `/api/plantao/manutencao`):
--   1. Domínio errado: `/api/plantao/manutencao` é do Plantão de Dúvidas da
--      Acelera Holding — outro produto, outro schema de regras (segredo
--      HTTP, NPS por e-mail, expurgo de sessão). Diário do GPS não tem
--      relação nenhuma com aquele fluxo; encaixar ali criaria acoplamento
--      entre dois domínios só porque "os dois rodam 1×/dia", e a doc do
--      plantão (ATIVAR-PLANTAO.md) passaria a mentir sobre o que a rota faz.
--   2. Este job não faz I/O externo nenhum (sem e-mail, sem chamada de
--      terceiro) — é uma comparação e um insert dentro do próprio Postgres.
--      Não precisa de Node, de rota Next, de segredo em header nem de env
--      novo: `pg_cron` chama a função SQL direto, sem round-trip HTTP.
--      Menos superfície, menos peça que pode ficar sem configurar (o
--      Plantão já mostrou o custo de depender de 2 segredos batendo).
--
-- SECURITY DEFINER pelo mesmo motivo do backfill: precisa ler auth.identities,
-- que authenticated não acessa. Ao contrário da função de backfill (...04),
-- esta FICA no banco — é chamada todo dia — então search_path fechado e
-- `execute` revogado de public/anon é permanente, não uma janela de uma
-- migração só.
--
-- Comparação "já emitido": olha `gps.aluno_eventos` (tipo='primeiro_acesso'),
-- não `origem='backfill'` — cobre tanto quem já foi coberto pelo backfill
-- quanto quem este próprio job já processou num dia anterior (idempotente).
--
-- Aceita até 24h de atraso: rodando 1×/dia, o pior caso é ~24h entre o
-- primeiro login real e o evento aparecer na trilha — dentro do combinado
-- com o Marcio ("verificação 1×/dia").
create function gps.aluno_eventos_job_primeiro_acesso()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inseridos integer;
begin
  -- 🔴 NÃO usar `current_user` aqui. Dentro de SECURITY DEFINER ele é SEMPRE
  -- o dono da função (postgres), nunca quem chamou — a versão anterior deste
  -- guard (`gp_is_admin() or current_user = 'postgres'`) era portanto
  -- equivalente a "sempre verdadeiro", e QUALQUER aluno autenticado
  -- executava esta RPC pelo PostgREST. Confirmado por teste com JWT real.
  --
  -- O sinal correto para "chamada do cron" é `auth.uid() is null`: o pg_cron
  -- roda sem JWT, então não há usuário na sessão. Havendo sessão, exige
  -- gp_is_admin().
  if auth.uid() is not null and not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  with primeiro_login as (
    select user_id, min(last_sign_in_at) as ocorrido_em
    from auth.identities
    where last_sign_in_at is not null
    group by user_id
  ),
  novos as (
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
    select
      m.aluno_id,
      pl.ocorrido_em,
      'primeiro_acesso',
      'conta',
      null,
      'Primeiro acesso',
      'aluno',
      m.user_id,
      'backfill'
    from gps.membros m
    join primeiro_login pl on pl.user_id = m.user_id
    where not exists (
      select 1 from gps.aluno_eventos e
      where e.tipo = 'primeiro_acesso'
        and e.aluno_id = m.aluno_id
        and (e.ator_user_id is not distinct from m.user_id)
    )
    returning 1
  )
  select count(*) into v_inseridos from novos;

  return v_inseridos;
end;
$$;

comment on function gps.aluno_eventos_job_primeiro_acesso() is
  'Job diário (pg_cron): insere primeiro_acesso para alunos que fizeram o 1º login depois do backfill (migração ...04). Idempotente (NOT EXISTS por aluno_id/ator_user_id). GUARD: auth.uid() is null (chamada do cron, sem JWT) OU gp_is_admin(). NAO usar current_user aqui - dentro de SECURITY DEFINER ele e sempre o dono da funcao, nunca o chamador, o que liberaria a RPC para qualquer aluno autenticado. Ver ATIVAR-DIARIO-EVENTOS.md para o agendamento.';

revoke execute on function gps.aluno_eventos_job_primeiro_acesso() from public;
grant execute on function gps.aluno_eventos_job_primeiro_acesso() to authenticated;
