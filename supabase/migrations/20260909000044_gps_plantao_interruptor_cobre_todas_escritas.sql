-- O interruptor de emergência passa a cobrir TODAS as escritas públicas.
--
-- Achado do `security-pentester`: `plantao_escrita_liberada()` era chamada só
-- em `inscrever` e `cancelar`. `revelar_link` (que GRAVA PRESENÇA) e
-- `registrar_nps` (que grava nota e comentário) seguiam funcionando com o
-- interruptor desligado — mas o comentário da função prometia "interruptor de
-- emergência das escritas públicas do plantão".
--
-- Ou o código cumpre a promessa, ou o comentário mente. Escolhi cumprir: num
-- incidente (presença inflada em massa, NPS poluído) o operador precisa de UM
-- botão que pare tudo — não de um que pare metade e o obrigue a descobrir
-- qual metade no meio do incidente.
--
-- Leitura continua liberada de propósito: desligar a escrita não pode apagar
-- o calendário da tela de quem já se inscreveu.
--
-- Testado como `anon` com o interruptor em 'false': revelar_link e
-- registrar_nps recusam com "Operação temporariamente indisponível";
-- plantao_calendario segue devolvendo os 3 slots.
--
-- ── SOBRE O ORÁCULO DE TIMING (achado do pentester, NÃO corrigido) ────────
-- `plantao_inscrever` retorna mais cedo quando o e-mail não é de comprador
-- (um SELECT indexado) do que quando é (SELECT + lock do slot + cutoff +
-- checagem de inscrição ativa). A diferença é mensurável e permite separar
-- estatisticamente as duas populações.
--
-- Não foi corrigido, e é decisão consciente:
--   1. o oráculo por CORPO já é aceito por design — a tela mostra a inscrição
--      confirmada, então quem quer saber se um e-mail comprou já descobre por
--      um caminho muito mais barato que medir microssegundos;
--   2. simetrizar com `pg_sleep` num endpoint público cria vetor de exaustão
--      de conexão — o remédio seria pior que a doença;
--   3. igualar o número de leituras exigiria travar o slot ANTES de saber se
--      o e-mail existe, ou seja, dar lock de linha a qualquer anônimo.
--
-- Fica registrado como limitação conhecida do modelo sem login, não como
-- defeito a consertar.

create or replace function gps.plantao_revelar_link(p_email text, p_inscricao_id uuid)
returns table (ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
begin
  -- Grava presença: é escrita, e o interruptor tem de alcançar.
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

  if now() < v_slot.inicio_em - interval '60 minutes'
     or now() > v_slot.inicio_em + interval '60 minutes' then
    return query select false,
      'O link só fica disponível de 1 hora antes até 1 hora depois do início.'::text, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'O link deste plantão ainda não foi cadastrado.'::text, null::text;
    return;
  end if;

  update gps.plantao_inscricoes
  set presenca_em = now()
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_presenca', v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$function$;

comment on function gps.plantao_revelar_link(text, uuid) is
  'Revela a sala por e-mail e GRAVA PRESENCA. Respeita o interruptor de emergencia. Janela de +-60min. Sem prova de posse do e-mail — risco aceito em 08/09/2026.';

create or replace function gps.plantao_registrar_nps(
  p_email text, p_inscricao_id uuid, p_nota smallint, p_comentario text
)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_dono uuid;
  v_presenca timestamptz;
  v_fim_em timestamptz;
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text;
    return;
  end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  if p_nota is null or p_nota < 0 or p_nota > 10 then
    return query select false, 'Nota inválida.'::text;
    return;
  end if;

  select i.aluno_plantao_id, i.presenca_em,
         sl.inicio_em + make_interval(mins => sl.duracao_min)
    into v_dono, v_presenca, v_fim_em
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id;

  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  if v_presenca is null then
    return query select false, 'Só é possível avaliar quem participou do plantão.'::text;
    return;
  end if;

  if v_fim_em > now() then
    return query select false, 'O plantão ainda não terminou.'::text;
    return;
  end if;

  update gps.plantao_inscricoes
  set nps_nota = p_nota, nps_comentario = p_comentario, nps_em = now()
  where id = p_inscricao_id;

  return query select true, null::text;
end;
$function$;

comment on function gps.plantao_registrar_nps(text, uuid, smallint, text) is
  'Registra NPS por e-mail. Respeita o interruptor de emergencia. Exige presenca registrada e plantao ja terminado. IDOR por dono.';

comment on function gps.plantao_escrita_liberada() is
  'Interruptor de emergencia de TODAS as escritas publicas do plantao: inscrever, cancelar, revelar_link (grava presenca) e registrar_nps. Leitura (calendario, minha_inscricao) continua liberada de proposito. Ausente = aberto: o default tem de ser funcionar. Desligar sem deploy: alter role authenticator set app.plantao_inscricao_aberta = ''false''.';
