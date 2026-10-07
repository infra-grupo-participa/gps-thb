-- ═══════════════════════════════════════════════════════════════════════════
-- 365 — gps.drive_pendencias(): acrescenta "sem_pasta" (quem ainda não tem pasta)
-- ═══════════════════════════════════════════════════════════════════════════
-- Decisão do João (07/10): a criação em massa dos alunos antigos está
-- desligada; eles ganham a pasta por clique. A tela precisa listar quem está
-- sem pasta.
--
-- O QUE MUDA
--   gps.drive_pendencias() devolve a chave nova "sem_pasta":
--   [{aluno_id, nome, email_google, criado_em}] = ambientes com
--   pasta_drive_url nulo e SEM tarefa provisionar_parceiro/compartilhar em
--   pendente/rodando; ordem por nome (nulls last), limit 300.
--   email_google = e-mail do aluno termina em @gmail.com/@googlemail.com
--   (dica para a tela; o e-mail NÃO é exposto).
--   Chaves existentes (placar, itens), guarda 42501, security definer,
--   search_path '' e grants: idênticos à …364 seção 7.
--
-- AS 5 PERGUNTAS
--   1. Escala: ambientes na casa das centenas; resultado limitado a 300.
--   2. Índice: NOT EXISTS por aluno usa drive_tarefas_aluno_idx
--      (aluno_id, criado_em desc); nenhum índice novo. Medir em
--      supabase/ensaio-20261007000365.sql.
--   3. Frequência: sob demanda, tela de admin.
--   4. Repetição: leitura pura (stable), sem efeito colateral.
--   5. Reversão: recriar gps.drive_pendencias() com o corpo da …364 seção 7.
--
-- REVERSÃO (comentado — rodar à mão):
--   recriar gps.drive_pendencias() exatamente como em
--   20261007000364_gps_drive_automatico.sql, seção 7 (sem a chave sem_pasta),
--   com o mesmo revoke all (public, anon, authenticated, service_role) e
--   grant execute a authenticated. Nenhum dado é alterado por esta migration.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function gps.drive_pendencias()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_res jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Última tarefa do parceiro (provisionar/compartilhar) por aluno — mesma
  -- regra de gps.drive_estado (criado_em desc). CTE lido 2×, materializado 1×.
  with ult as (
    select distinct on (t.aluno_id)
           t.aluno_id, t.estado, t.erro, t.aviso, t.atualizado_em
      from gps.drive_tarefas t
     where t.aluno_id is not null
       and t.tipo in ('provisionar_parceiro', 'compartilhar')
     order by t.aluno_id, t.criado_em desc
  )
  select jsonb_build_object(
           'placar', (select jsonb_build_object(
                               'feitas',   count(*) filter (where u.estado = 'feito'),
                               'na_fila',  count(*) filter (where u.estado in ('pendente', 'rodando')),
                               'com_erro', count(*) filter (where u.estado = 'erro'),
                               'faltando', (select count(*) from gps.ambientes a
                                             where a.pasta_drive_url is null))
                        from ult u),
           'itens',  (select coalesce(jsonb_agg(jsonb_build_object(
                               'aluno_id',      x.aluno_id,
                               'nome',          x.nome,
                               'estado',        x.estado,
                               'erro',          x.erro,
                               'aviso',         x.aviso,
                               'atualizado_em', x.atualizado_em)
                             order by x.atualizado_em desc), '[]'::jsonb)
                        from (select u.aluno_id, u.estado, u.erro, u.aviso, u.atualizado_em,
                                     (select nullif(btrim(al.nome), '')
                                        from public.thb_alunos al
                                       where al.id = u.aluno_id) as nome
                                from ult u
                               where u.erro is not null or u.aviso is not null
                               order by u.atualizado_em desc
                               limit 200) x),
           'sem_pasta', (select coalesce(jsonb_agg(jsonb_build_object(
                               'aluno_id',      s.aluno_id,
                               'nome',          s.nome,
                               'email_google',  s.email_google,
                               'criado_em',     s.criado_em)
                             order by s.nome nulls last, s.aluno_id), '[]'::jsonb)
                        from (select a.aluno_id, al.nome, a.criado_em,
                                     coalesce(lower(btrim(al.email)) ~ '@(gmail|googlemail)\.com$', false) as email_google
                                from gps.ambientes a
                                left join public.thb_alunos al on al.id = a.aluno_id
                               where a.pasta_drive_url is null
                                 and not exists (select 1 from gps.drive_tarefas t
                                                  where t.aluno_id = a.aluno_id
                                                    and t.tipo in ('provisionar_parceiro', 'compartilhar')
                                                    and t.estado in ('pendente', 'rodando'))
                               order by al.nome nulls last, a.aluno_id
                               limit 300) s))
    into v_res;

  return v_res;
end;
$function$;

comment on function gps.drive_pendencias() is
  '…365: so admin (coalesce(gp_is_admin(),false), senao 42501). {placar:{feitas,na_fila,com_erro,faltando}, itens:[{aluno_id,nome,estado,erro,aviso,atualizado_em}], sem_pasta:[{aluno_id,nome,email_google,criado_em}]}. feitas/na_fila/com_erro contam alunos pela ULTIMA tarefa provisionar_parceiro/compartilhar (feito / pendente+rodando / erro); faltando = ambientes com pasta_drive_url nulo. itens = ultima tarefa com erro ou aviso, 200 mais recentes por atualizado_em. sem_pasta = ambientes sem pasta_drive_url e sem tarefa provisionar_parceiro/compartilhar pendente/rodando, por nome, max 300; email_google = e-mail @gmail.com/@googlemail.com (dica, e-mail nao exposto). Contrato do front: nao renomear chaves.';

revoke all     on function gps.drive_pendencias() from public, anon, authenticated, service_role;
grant  execute on function gps.drive_pendencias() to authenticated;

commit;
