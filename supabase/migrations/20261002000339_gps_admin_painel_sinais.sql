-- ═══════════════════════════════════════════════════════════════════════════
-- Onda 6.1 — dois sinais agregados para os chips "Parado na etapa" e
-- "Chamado sem resposta há 24h+" da lista de Alunos de /admin.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NÃO APLICADA. Escrita sem acesso ao banco.
--
-- ── POR QUE FUNÇÃO NOVA E NÃO COLUNA EM admin_painel_alunos ────────────────
-- Mudar `returns table` exige DROP + corpo completo (42P13), e o corpo vivo de
-- `admin_painel_alunos` só se obtém com `pg_get_functiondef` do banco (a regra
-- da …234: recopiar de migration antiga já reverteu os 5 cards de classe).
-- Esta função é ADITIVA: não toca nenhuma função existente; reversão = DROP.
-- Se preferirem as colunas dentro de `admin_painel_alunos`, rodar ANTES:
--   select pg_get_functiondef('gps.admin_painel_alunos(integer,integer)'::regprocedure);
-- e PARAR se o corpo divergir da …247 (socio_nome) + …239 (classe).
--
-- ── O QUE DEVOLVE (uma linha por ambiente; universo = gps.membros) ─────────
--   aluno_id                   uuid
--   etapa_alem_da_2_liberada   boolean  — alguma etapa com id > 2 está liberada
--                                         PARA ESTE ambiente:
--                                         coalesce(override, global), a MESMA
--                                         regra de `gps.etapa_liberada_para`.
--   chamado_aberto_desde       timestamptz — menor `ultima_mensagem_em` entre os
--                                         chamados `status='aberto'` (bola com a
--                                         equipe). null = nenhum esperando.
--                                         `ultima_mensagem_em` de um chamado
--                                         'aberto' é a ÚLTIMA mensagem do aluno
--                                         (a equipe ainda não respondeu), logo
--                                         `now() - isso` = há quanto tempo a
--                                         equipe deixa de responder.
-- A tela cruza com `clientes_com_dados >= 30` (que já vem no painel) — a regra
-- dos 30 NÃO é reimplementada aqui, para não haver segunda verdade.
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
-- 1 Escala: 181 ambientes × 6 etapas; chamados não-fechados na casa de dezenas.
--   Uma varredura de cada, sem N+1; o front recebe ~181 linhas pequenas.
-- 2 Índice: `chamados` tem índice parcial em `status <> 'fechado'` (…115);
--   `etapa_liberacao_aluno` tem PK (aluno_id, etapa); `etapas` tem 6 linhas;
--   `membros` varrida inteira (mesma varredura do painel). Nenhum índice novo.
--   O `explain (analyze)` abaixo tem de ser colado no relatório da aplicação.
-- 3 Frequência: 1 chamada por abertura de /admin, em paralelo com as outras.
-- 4 Repetição: nenhum job; função só lê.
-- 5 Reversão: `drop function if exists gps.admin_painel_sinais();`
--
-- ── SEGURANÇA ──────────────────────────────────────────────────────────────
-- SECURITY INVOKER + guarda gp_is_admin() (42501): a RLS admin-only de
-- `chamados` e `etapa_liberacao_aluno` segue sendo a fonte da verdade.
-- Função nova nasce executável por PUBLIC → revoke explícito de public e anon.
-- Revisão de GRANT/RLS é do Victor antes de aplicar.
--
-- ── PROVA DE APLICAÇÃO (anon) ──────────────────────────────────────────────
--   com anon: 42501 = aplicada · PGRST202/404 = NÃO aplicada.
--
-- ── EXPLAIN (rodar em transação; é só SELECT, mas com JWT de admin) ────────
--   begin;
--   select set_config('request.jwt.claims', '{"sub":"<uuid-admin>","role":"authenticated"}', true);
--   set local role authenticated;
--   explain (analyze, buffers) select * from gps.admin_painel_sinais();
--   rollback;
--   (função plpgsql: o explain mostra só a chamada; para o plano interno,
--    rodar o `select` do corpo dentro da mesma transação.)

create or replace function gps.admin_painel_sinais()
returns table (
  aluno_id                 uuid,
  etapa_alem_da_2_liberada boolean,
  chamado_aberto_desde     timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
  with amb as (
    select distinct m.aluno_id as aluno_id from gps.membros m
  ),
  lib as (
    -- ambientes com ao menos uma etapa > 2 liberada: coalesce(override, global)
    select a.aluno_id as aluno_id
      from amb a
     where exists (
       select 1
         from gps.etapas e
         left join gps.etapa_liberacao_aluno o
                on o.etapa = e.id and o.aluno_id = a.aluno_id
        where e.id > 2
          and coalesce(o.liberada, e.liberada)
     )
  ),
  cham as (
    select c.aluno_id as aluno_id, min(c.ultima_mensagem_em) as desde
      from gps.chamados c
     where c.status = 'aberto'
     group by c.aluno_id
  )
  select a.aluno_id,
         (l.aluno_id is not null),
         ch.desde
    from amb a
    left join lib  l  on l.aluno_id  = a.aluno_id
    left join cham ch on ch.aluno_id = a.aluno_id;
end;
$function$;

comment on function gps.admin_painel_sinais() is
  'Uma linha por ambiente: se alguma etapa >2 esta liberada para ele (coalesce(override, global)) e desde quando ha chamado status=aberto sem resposta da equipe. Alimenta os chips "Parado na etapa" e "Chamado sem resposta ha 24h+" de /admin. SECURITY INVOKER + gp_is_admin() (42501).';

revoke execute on function gps.admin_painel_sinais() from public, anon;
grant  execute on function gps.admin_painel_sinais() to authenticated;
