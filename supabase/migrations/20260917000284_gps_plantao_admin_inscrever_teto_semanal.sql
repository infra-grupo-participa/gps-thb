-- O indice unico vale para TODOS, equipe inclusive -- e proposital: a trava
-- de cardinalidade so e trava se nao houver caminho alternativo. Mas a
-- equipe precisa de uma saida legitima e de uma mensagem que a ensine, em
-- vez de "duplicate key value violates unique constraint".
--
-- Saida legitima hoje: cancelar a inscricao da semana e remarcar. Se o
-- Marcio decidir que a equipe pode furar o teto, a mudanca e desligar o
-- interruptor (teto_semanal_ativo) ou dar um caminho proprio -- decisao de
-- produto, nao de implementacao.

create or replace function gps.admin_plantao_inscrever(p_slot_id uuid, p_email text, p_nome text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_nome  text := nullif(btrim(coalesce(p_nome,'')),'');
  v_aluno_id uuid; v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid; v_ativa_slot_id uuid; v_inscricao_id uuid; v_reativada boolean;
  v_conflito record;
begin
  if not public.gp_is_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode='40001'; end if;
  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    raise exception 'Informe um e-mail válido.' using errcode='22023'; end if;

  -- A flag e cache do cron. A condicao de verdade -- ter ambiente no GPS
  -- -- e conferida ao vivo, senao a equipe inscreveria alguem do Programa
  -- sem saber, nas horas entre a migracao e a reconciliacao da madrugada.
  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa
     and not exists (select 1 from gps.membros m
                      join public.thb_alunos t on t.id = m.aluno_id
                     where lower(btrim(t.email)) = v_email);
  if v_aluno_id is null then
    if exists (select 1 from gps.membros m
                join public.thb_alunos t on t.id = m.aluno_id
               where lower(btrim(t.email)) = v_email) then
      raise exception 'Esta pessoa está no Programa de Implementação Assistida. O Plantão é exclusivo de quem faz parte do Acelera Holding.'
        using errcode='P0002';
    end if;
    raise exception 'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.'
      using errcode='P0002'; end if;

  select * into v_slot from gps.plantao_slots where id = p_slot_id for update;
  if not found then raise exception 'Plantão não encontrado.' using errcode='P0002'; end if;

  select i.id, i.slot_id into v_ativa_id, v_ativa_slot_id
    from gps.plantao_inscricoes i join gps.plantao_slots sl on sl.id = i.slot_id
   where i.aluno_plantao_id = v_aluno_id and i.cancelado_em is null
     and sl.inicio_em > now() and i.slot_id <> p_slot_id
   limit 1;
  if v_ativa_id is not null then
    return jsonb_build_object('ok', false,
      'motivo','Este aluno já tem uma inscrição ativa em outro plantão.',
      'slot_conflitante_id', v_ativa_slot_id); end if;

  -- Teto de 1 plantao por semana: vale para a equipe tambem. Devolve o
  -- conflito com a saida (cancelar e remarcar), em vez do erro do indice.
  select * into v_conflito from gps.plantao_conflito_semana(v_aluno_id, p_slot_id);
  if found then
    return jsonb_build_object('ok', false,
      'motivo', 'Este aluno já tem plantão em ' || to_char(v_conflito.data,'DD/MM') ||
                ' às ' || to_char(v_conflito.hora_inicio,'HH24:MI') ||
                ', na mesma semana. É um plantão por semana — cancele o outro antes de inscrever aqui.',
      'excedeu_teto_semanal', true);
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno_id, v_nome)
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null, inscrito_em = now(),
        nome_informado = coalesce(excluded.nome_informado, gps.plantao_inscricoes.nome_informado)
  returning id, (xmax <> 0) into v_inscricao_id, v_reativada;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
  values (v_aluno_id, 'plantao_inscricao_criada_pela_equipe', p_slot_id);

  return jsonb_build_object('ok', true, 'inscricao_id', v_inscricao_id,
                            'reativada', coalesce(v_reativada,false));
end $function$;
