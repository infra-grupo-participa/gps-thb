-- A aba logada tem query propria e ficou sem o teto: ofereceria o slot que
-- `plantao_inscrever_logado` recusa. E exatamente o defeito que ja aconteceu
-- aqui com a trava de prazo (o comentario da funcao registra). Espelha.

drop function if exists gps.plantao_calendario_logado(integer, integer);

create function gps.plantao_calendario_logado(p_ano integer, p_mes integer)
returns table(slot_id uuid, data date, hora_inicio time without time zone, duracao_min integer, mentora_nome text, inscritos_qtd integer, minha_inscricao boolean, encerrado boolean, inscricao_encerrada boolean, bloqueio_semana boolean)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text; v_aluno_id uuid; v_inicio timestamptz; v_fim timestamptz;
  v_teto boolean := (select valor from gps.plantao_config
                      where chave = 'teto_semanal_ativo') = 'true';
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  select lower(btrim(t.email)) into v_email from public.thb_alunos t where t.id = v_pessoa;

  if v_email is not null then
    select id into v_aluno_id from gps.plantao_alunos where email = v_email and ativo;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         -- `encerrado` continua sendo so "ja comecou": e o que a tela usa
         -- para dizer que o plantao passou. Nao leva o prazo.
         (sl.inicio_em <= now()),
         -- `inscricao_encerrada` leva o prazo, como na rota publica (a regra
         -- vive em gps.plantao_prazo_inscricao(); cut-off desde 14/09), mais
         -- o teto de 1 plantao por semana ISO.
         (sl.inicio_em <= now()
          or now() > gps.plantao_prazo_inscricao(sl.id)
          or coalesce(sem.bloqueado, false)),
         coalesce(sem.bloqueado, false)
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd from gps.plantao_inscricoes i
    join gps.plantao_alunos a on a.id = i.aluno_plantao_id
    where i.slot_id = sl.id and i.cancelado_em is null
  ) cnt on true
  left join gps.plantao_inscricoes insc
    on insc.slot_id = sl.id and insc.aluno_plantao_id = v_aluno_id and insc.cancelado_em is null
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
  where sl.publicado and sl.inicio_em >= v_inicio and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$function$;

-- ACL identico ao de antes do drop (sem anon: exige sessao do Programa).
revoke all on function gps.plantao_calendario_logado(integer, integer) from public, anon;
grant execute on function gps.plantao_calendario_logado(integer, integer)
  to authenticated, service_role;
