-- Plantão de Dúvidas — a sala fica aberta DURANTE a live, não só até o início.
--
-- 🔑 Decisão do Marcio, 09/09/2026. Substitui a regra de 08/09, que fechava a
-- entrada no instante do início ("a confirmação de presença se encerrou no
-- horário de início"). Na prática, quem chegava 5 minutos atrasado não
-- conseguia o link — justamente quem mais precisa dele.
--
-- A janela passa a ser:
--
--     [ início − 1h ,  início + duracao_min )
--       ^ abre         ^ fecha no FIM da sessão
--
-- Dois bugs de borda que esta migration corrige junto:
--
-- 1. `plantao_minha_inscricao` não devolvia a duração, então a TELA calculava
--    `encerrado: inicio_em <= agora` e mostrava "esta sala já encerrou" no
--    segundo em que a live começava — o botão nem chegava a aparecer.
--
-- 2. O cliente fechava a janela com a constante `JANELA_DEPOIS_MIN = 60`.
--    Como os plantões reais duram 120 minutos, a sala sumia da tela na
--    METADE da live. A constante foi removida do TypeScript: o fim agora vem
--    do banco, por slot.
--
-- Por isso `fim_em` é calculado aqui e não no cliente: mudar a duração de um
-- plantão passa a mover a janela junto, sem tocar em código nem em deploy.
--
-- ⚠️ `plantao_minha_inscricao` precisa de DROP antes do CREATE: mudou o tipo
-- de retorno (duas colunas novas), e o Postgres recusa `create or replace`
-- nesse caso (42P13). O grant para `anon`/`authenticated` é reposto logo em
-- seguida, na MESMA transação — sem isso a rota pública `/p/plantao` fica
-- sem a RPC, porque `drop` leva os grants junto.

begin;

-- 1) Revelar o link: abre 1h antes, fecha no fim da sessão.
create or replace function gps.plantao_revelar_link(p_email text, p_inscricao_id uuid)
returns table(ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
  v_fim  timestamptz;
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text, null::text;
    return;
  end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then
    return query select false, 'Inscrição não encontrada.'::text, null::text;
    return;
  end if;

  select i.aluno_plantao_id into v_dono
  from gps.plantao_inscricoes i
  where i.id = p_inscricao_id and i.cancelado_em is null;

  select sl.* into v_slot
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null;

  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text, null::text;
    return;
  end if;

  -- 🔑 A sala abre 1h ANTES e fica aberta ATÉ O FIM da sessão (decisão do
  -- Marcio, 09/09/2026). Substitui a regra de 08/09 que fechava no instante
  -- do início: ela impedia quem chegasse 5 minutos atrasado de entrar —
  -- justamente na hora em que a pessoa mais precisa do link.
  --
  -- O fim vem de `duracao_min` do próprio slot (default 120), não de um
  -- número fixo aqui: mudar a duração de um plantão passa a mudar a janela
  -- junto, sem tocar nesta função.
  v_fim := v_slot.inicio_em + make_interval(mins => coalesce(v_slot.duracao_min, 120));

  if now() < v_slot.inicio_em - interval '60 minutes' then
    return query select false,
      'A sala abre 1 hora antes do início.'::text, null::text;
    return;
  end if;

  if now() >= v_fim then
    return query select false,
      'Este plantão já foi encerrado.'::text, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'O link deste plantão ainda não foi cadastrado.'::text, null::text;
    return;
  end if;

  -- Idempotente: so grava presenca_em se ainda nao tiver.
  update gps.plantao_inscricoes
  set presenca_em = now()
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_presenca', v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$function$;

-- 2) A leitura da inscrição passa a devolver a duração e o FIM da sessão,
--    para a tela parar de deduzir a janela por conta própria.
drop function if exists gps.plantao_minha_inscricao(text);

create function gps.plantao_minha_inscricao(p_email text)
returns table(inscricao_id uuid, slot_id uuid, data date, hora_inicio time without time zone,
              mentora_nome text, presenca_em timestamptz, nps_em timestamptz,
              inicio_em timestamptz, tem_sala boolean, pode_cancelar boolean,
              duracao_min integer, fim_em timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
begin
  if v_email = '' then return; end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then return; end if;

  return query
  select i.id, sl.id, sl.data, sl.hora_inicio, m.nome, i.presenca_em, i.nps_em,
         sl.inicio_em,
         (sl.zoom_url is not null and btrim(sl.zoom_url) <> ''),
         -- Espelha plantao_cancelar: 1h antes do inicio, sem depender de sala.
         (now() < sl.inicio_em - interval '60 minutes'),
         coalesce(sl.duracao_min, 120),
         -- 🔑 O FIM da sessao, calculado aqui e nao no cliente: e ele que
         -- define ate quando a sala fica aberta (decisao do Marcio,
         -- 09/09/2026 — a sala vive de -1h ate o termino da live). A tela
         -- usava `inicio_em <= agora` como "encerrado" e por isso declarava
         -- a sala encerrada no segundo em que a live comecava.
         (sl.inicio_em + make_interval(mins => coalesce(sl.duracao_min, 120)))
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
  order by i.inscrito_em desc
  limit 1;
end;
$function$;

-- O drop acima levou os grants junto — repor, senão /p/plantao perde a RPC.
grant execute on function gps.plantao_minha_inscricao(text) to anon, authenticated;

-- 3) ⚠️ NÃO existe constraint nova de `duracao_min` aqui de propósito.
--
--    Numa primeira passada foi criada uma `plantao_slots_duracao_min_sensata`,
--    achando que a coluna estava desprotegida. Estava errado: a estrutura
--    original (`20260901000001`) já traz
--    `plantao_slots_duracao_min_check CHECK (duracao_min between 15 and 480)`.
--    A segunda constraint foi DERRUBADA — duas regras iguais na mesma coluna
--    só duplicam manutenção e mascaram qual delas realmente recusou.
--    O `coalesce(…, 120)` das funções cobre apenas linha legada com NULL.

commit;
