-- 1) Fecha as funcoes auxiliares criadas nesta feature. Funcao nova no
-- Supabase nasce com EXECUTE para PUBLIC: `plantao_conflito_semana` recebe
-- um aluno_plantao_id arbitrario e devolveria data/hora do plantao de
-- terceiros para `anon`. Sao detalhe interno da trava; ninguem chama de fora.
revoke all on function gps.plantao_conflito_semana(uuid, uuid) from public, anon;
revoke all on function gps.plantao_semana(date) from public, anon;

-- 2) `inscricao_encerrada` sozinho faria a tela dizer "Inscrições encerradas"
-- num slot cujas inscricoes estao ABERTAS -- quem esta impedido e a pessoa,
-- que ja tem plantao naquela semana. Rotulo errado vira chamado.
-- Coluna nova no FIM da assinatura; exige drop (muda o row type).
drop function if exists gps.plantao_calendario(integer, integer, text);

create function gps.plantao_calendario(p_ano integer, p_mes integer, p_email text default null::text)
returns table(slot_id uuid, data date, hora_inicio time without time zone, duracao_min integer, mentora_nome text, inscritos_qtd integer, minha_inscricao boolean, encerrado boolean, inscricao_encerrada boolean, bloqueio_semana boolean)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_teto boolean := (select valor from gps.plantao_config
                      where chave = 'teto_semanal_ativo') = 'true';
begin
  if v_email <> '' then
    select id into v_aluno_id from gps.plantao_alunos
     where email = v_email and ativo and not bloqueado_por_programa
       and not exists (select 1 from gps.membros m
                        join public.thb_alunos t on t.id = m.aluno_id
                       where lower(btrim(t.email)) = v_email
                       -- A equipe pode abrir excecao nominal:
                       -- `bloqueio_excecao` blinda a liberacao manual.
                       and not exists (select 1 from gps.plantao_alunos pe
                                        where pe.email = v_email and pe.bloqueio_excecao));
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         (sl.inicio_em <= now()),
         -- Espelha plantao_inscrever: "ja comecou", o prazo de inscricao
         -- (gps.plantao_prazo_inscricao) e o teto de 1 por semana ISO.
         (sl.inicio_em <= now()
          or now() > gps.plantao_prazo_inscricao(sl.id)
          or coalesce(sem.bloqueado, false)),
         -- Separa o MOTIVO: fechado porque a pessoa ja tem plantao nesta
         -- semana, nao porque o slot fechou. A tela escolhe a frase por aqui.
         coalesce(sem.bloqueado, false)
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd
    from gps.plantao_inscricoes i
    join gps.plantao_alunos a
      on a.id = i.aluno_plantao_id and not a.bloqueado_por_programa
    where i.slot_id = sl.id and i.cancelado_em is null
  ) cnt on true
  left join gps.plantao_inscricoes insc
    on insc.slot_id = sl.id
   and insc.aluno_plantao_id = v_aluno_id
   and insc.cancelado_em is null
  left join lateral (
    select (v_teto and v_aluno_id is not null and insc.id is null
            and exists (select 1
                          from gps.plantao_inscricoes i2
                          join gps.plantao_slots s2 on s2.id = i2.slot_id
                         where i2.aluno_plantao_id = v_aluno_id
                           and i2.cancelado_em is null
                           and s2.cancelado_em is null
                           and i2.semana = gps.plantao_semana(sl.data))) as bloqueado
  ) sem on true
  where sl.publicado
    and sl.inicio_em >= v_inicio
    and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$function$;

-- Restaura exatamente o ACL que a funcao tinha antes do drop.
revoke all on function gps.plantao_calendario(integer, integer, text) from public;
grant execute on function gps.plantao_calendario(integer, integer, text)
  to anon, authenticated, service_role;
