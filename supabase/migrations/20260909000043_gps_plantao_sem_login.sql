-- Plantão de Dúvidas: REMOÇÃO DO LOGIN. A rota vira pública de verdade.
-- (Decisão do Marcio, 08/09/2026.)
--
-- Esta migração é grande de propósito: ela captura, num arquivo só, a
-- mudança de arquitetura que foi aplicada em produção via MCP. Sem ela, um
-- clone do repositório reconstruiria um banco com as RPCs por `p_token` e a
-- aplicação quebraria 100% das ações do plantão — achado do
-- `security-pentester`, e repetição literal do antipadrão que já custou duas
-- semanas com `gps.admin_adotar_login_existente` quebrada sem ninguém ver.
--
-- ── O MODELO ──────────────────────────────────────────────────────────────
-- Antes: identidade própria (e-mail + senha bcrypt, sessão por token de 32
-- bytes, cookie particionado para o iframe da Hotmart).
-- Agora: **nenhuma identidade**. Qualquer um abre `/p/plantao` e vê o
-- calendário; para se inscrever informa nome + e-mail, e o e-mail é conferido
-- contra `gps.plantao_alunos` (os 422 compradores do Acelera).
--
-- 🔴 O e-mail é uma AFIRMAÇÃO, não uma prova. Quem souber o e-mail de um
-- comprador consegue inscrever, cancelar e marcar presença por ele. Risco
-- apresentado e aceito: a senha padrão anterior era a mesma para os 422 e
-- ninguém a trocou (0 linhas em `plantao_acessos`), então o modelo antigo já
-- era isto na prática — com 4 telas, 2 tabelas e 3 modos de falha de
-- navegador em cima.
--
-- ── REGRA DE ÍNDICE (medida em produção) ─────────────────────────────────
--   `where lower(btrim(email)) = ...` -> Seq Scan, 421 linhas descartadas, 11 buffers, 0,530 ms
--   `where email = v_email`           -> Index Scan, 3 buffers, 0,098 ms
-- `plantao_alunos` só tem `unique (email)` sobre a COLUNA CRUA. Toda função
-- aqui normaliza em VARIÁVEL e filtra com coluna nua. É a mesma assinatura do
-- incidente de 19/08 (`btrim(lower())` × `lower(btrim())`).
--
-- ── ORDEM ────────────────────────────────────────────────────────────────
-- As 6 RPCs públicas são recriadas ANTES de dropar `plantao_sessao` — elas a
-- chamavam. E é `drop function` + `create`, nunca `create or replace`:
-- assinatura diferente criaria SOBRECARGA, e a versão por token ficaria viva
-- e chamável por `anon` (duas portas para o mesmo produto).
--
-- Reversão: `git revert` + reaplicar 20260901000002/004. As tabelas voltam
-- vazias — que é exatamente o estado de hoje (0 acessos, 0 sessões).

-- ── 0. Colunas novas ──────────────────────────────────────────────────────

alter table gps.plantao_inscricoes
  add column if not exists nome_informado text;

comment on column gps.plantao_inscricoes.nome_informado is
  'Nome que a pessoa digitou ao se inscrever. Nao precisa bater com plantao_alunos.nome (decisao 08/09/2026) — e so exibicao. Fica AQUI, por inscricao, e nunca sobrescreve a base de referencia com texto publico nao validado.';

-- ── 1. Interruptor de emergência ─────────────────────────────────────────
-- A única reversão sem deploy numa rota pública. Ausente = ABERTO: o default
-- tem de ser funcionar, senão o produto morre se alguém esquecer de setar.

create or replace function gps.plantao_escrita_liberada()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(current_setting('app.plantao_inscricao_aberta', true), 'true') <> 'false';
$function$;

comment on function gps.plantao_escrita_liberada() is
  'Interruptor de emergencia das escritas publicas do plantao. Ausente = aberto: o default tem de ser funcionar. Desligar sem deploy: alter role authenticator set app.plantao_inscricao_aberta = ''false''.';

-- ── 2. Leituras ──────────────────────────────────────────────────────────

drop function if exists gps.plantao_calendario(text, int, int);

create function gps.plantao_calendario(p_ano int, p_mes int, p_email text default null)
returns table (
  slot_id uuid, data date, hora_inicio time, duracao_min int,
  mentora_nome text, inscritos_qtd int, minha_inscricao boolean, encerrado boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  -- Sem e-mail o calendario continua respondendo: a rota e publica.
  if v_email <> '' then
    select id into v_aluno_id from gps.plantao_alunos
     where email = v_email and ativo and not bloqueado_por_programa;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         (sl.inicio_em <= now())
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
  where sl.publicado
    and sl.inicio_em >= v_inicio
    and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$function$;

revoke execute on function gps.plantao_calendario(int, int, text) from public;
grant execute on function gps.plantao_calendario(int, int, text) to anon, authenticated;

comment on function gps.plantao_calendario(int, int, text) is
  'Calendario mensal PUBLICO (rota sem login). p_email opcional: sem ele responde com minha_inscricao=false. inscritos_qtd exclui bloqueado_por_programa. Busca por coluna nua (indice unico).';

drop function if exists gps.plantao_minha_inscricao(text);

create function gps.plantao_minha_inscricao(p_email text)
returns table (
  inscricao_id uuid, slot_id uuid, data date,
  hora_inicio time without time zone, mentora_nome text,
  presenca_em timestamptz, nps_em timestamptz, inicio_em timestamptz,
  tem_sala boolean, pode_cancelar boolean
)
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
         -- Espelha plantao_cancelar: a tela mostra o estado em vez de so
         -- dar erro no clique.
         not ((sl.zoom_url is not null and btrim(sl.zoom_url) <> '')
              and now() >= sl.inicio_em - interval '60 minutes')
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
  order by i.inscrito_em desc
  limit 1;
end;
$function$;

revoke execute on function gps.plantao_minha_inscricao(text) from public;
grant execute on function gps.plantao_minha_inscricao(text) to anon, authenticated;

comment on function gps.plantao_minha_inscricao(text) is
  'Inscricao ativa do aluno, resolvida por e-mail. tem_sala e BOOLEANO — a zoom_url so sai por plantao_revelar_link, porque revelar grava presenca. pode_cancelar espelha a trava de 1h.';

-- ── 3. Escritas ──────────────────────────────────────────────────────────

drop function if exists gps.plantao_inscrever(text, uuid);

create function gps.plantao_inscrever(
  p_email text, p_nome text, p_slot_id uuid, p_ip_hash text default null
)
returns table (
  ok boolean, motivo text, inscricao_id uuid, email text, nome text,
  data date, hora_inicio time without time zone, mentora_nome text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  -- 🔑 IP ausente NAO pula a trava: cai num balde comum. Antes o rate limit
  -- estava dentro de `if p_ip_hash is not null` e sumia em silencio sem
  -- proxy a frente — e sem login ele e a UNICA trava.
  v_ip text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_aluno gps.plantao_alunos%rowtype;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_nova_id uuid;
  v_mentora_nome text;
  v_cutoff timestamptz;
  v_tentativas int;
  v_generico text := 'Não foi possível concluir a inscrição. Confira o e-mail informado.';
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'As inscrições estão temporariamente indisponíveis.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select count(*) into v_tentativas
  from gps.plantao_eventos e
  where e.ip_hash = v_ip
    and e.acao in ('plantao_inscricao', 'plantao_inscricao_tentativa')
    and e.criado_em > now() - interval '15 minutes';

  if v_tentativas >= 10 then
    return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- `pa.email` qualificado: sem o alias, o campo homonimo de v_aluno
  -- (%rowtype) vence e o plpgsql estoura 42702 (ambiguous). A forma continua
  -- sendo COLUNA NUA, entao o indice unico segue valendo.
  select pa.* into v_aluno from gps.plantao_alunos pa
   where pa.email = v_email and pa.ativo and not pa.bloqueado_por_programa;

  if not found then
    -- Registra a tentativa para o rate limit contar, sem dizer o motivo.
    insert into gps.plantao_eventos (acao, ip_hash)
      values ('plantao_inscricao_tentativa', v_ip);
    return query select false, v_generico,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select sl.* into v_slot from gps.plantao_slots sl where sl.id = p_slot_id for update;
  if not found or not v_slot.publicado then
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- Cut-off: 12:00 do dia anterior, fuso de Sao Paulo (migracao ...040).
  v_cutoff := ((v_slot.inicio_em at time zone 'America/Sao_Paulo')::date
               - 1 + time '12:00') at time zone 'America/Sao_Paulo';
  if now() >= v_cutoff then
    return query select false,
      'As inscrições para este plantão se encerraram ao meio-dia do dia anterior.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select i.id into v_ativa_id
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno.id
    and i.cancelado_em is null
    and sl.inicio_em > now()
  limit 1;

  if v_ativa_id is not null then
    return query select false, 'Você já tem um plantão marcado. Cancele-o antes de escolher outro.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno.id, nullif(btrim(coalesce(p_nome, '')), ''))
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno.id, 'plantao_inscricao', v_ip, p_slot_id);

  select m.nome into v_mentora_nome
    from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id,
    v_aluno.email, v_aluno.nome, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

revoke execute on function gps.plantao_inscrever(text, text, uuid, text) from public;
grant execute on function gps.plantao_inscrever(text, text, uuid, text) to anon, authenticated;

comment on function gps.plantao_inscrever(text, text, uuid, text) is
  'Inscreve por E-MAIL (rota publica sem login). Rate limit 10/15min por IP, e IP ausente cai num balde comum ''sem-ip'' — nunca pula a trava. Guardas: interruptor de emergencia, e-mail em plantao_alunos ativo e nao bloqueado, slot publicado e futuro, cut-off de 12:00 da vespera, 1 inscricao ativa (for update contra corrida). NAO manda e-mail: o unico sai 1h antes, pelo job.';

drop function if exists gps.plantao_cancelar(text, uuid);

create function gps.plantao_cancelar(p_email text, p_inscricao_id uuid, p_ip_hash text default null)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_dono uuid;
  v_slot_id uuid;
  v_inicio timestamptz;
  v_tem_sala boolean;
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

  select i.aluno_plantao_id, i.slot_id, sl.inicio_em,
         (sl.zoom_url is not null and btrim(sl.zoom_url) <> '')
    into v_dono, v_slot_id, v_inicio, v_tem_sala
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null
  for update of i;

  -- IDOR: mesma mensagem para "nao existe" e "e de outra pessoa".
  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  -- Trava de 1h: o link ja saiu, a vaga esta consumida. So trava se HOUVER
  -- sala — sem link nao houve liberacao (migracao ...042).
  if v_tem_sala and now() >= v_inicio - interval '60 minutes' then
    return query select false,
      'O link da sala já foi liberado — não é mais possível cancelar.'::text;
    return;
  end if;

  update gps.plantao_inscricoes set cancelado_em = now() where id = p_inscricao_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno_id, 'plantao_cancelamento', p_ip_hash, v_slot_id);

  return query select true, null::text;
end;
$function$;

revoke execute on function gps.plantao_cancelar(text, uuid, text) from public;
grant execute on function gps.plantao_cancelar(text, uuid, text) to anon, authenticated;

comment on function gps.plantao_cancelar(text, uuid, text) is
  'Cancela por e-mail (rota publica). IDOR por dono, mensagem generica unica. TRAVA a partir de 1h antes, quando o link foi liberado — mas so quando o slot TEM zoom_url.';

drop function if exists gps.plantao_revelar_link(text, uuid);

create function gps.plantao_revelar_link(p_email text, p_inscricao_id uuid)
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

  -- Idempotente: so grava presenca_em se ainda nao tiver.
  update gps.plantao_inscricoes
  set presenca_em = now()
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_presenca', v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$function$;

revoke execute on function gps.plantao_revelar_link(text, uuid) from public;
grant execute on function gps.plantao_revelar_link(text, uuid) to anon, authenticated;

comment on function gps.plantao_revelar_link(text, uuid) is
  'Revela a sala por e-mail e GRAVA PRESENCA. Janela de +-60min. Sem prova de posse do e-mail — risco aceito em 08/09/2026, igual a inscrever/cancelar.';

drop function if exists gps.plantao_registrar_nps(text, uuid, smallint, text);

create function gps.plantao_registrar_nps(
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

revoke execute on function gps.plantao_registrar_nps(text, uuid, smallint, text) from public;
grant execute on function gps.plantao_registrar_nps(text, uuid, smallint, text) to anon, authenticated;

comment on function gps.plantao_registrar_nps(text, uuid, smallint, text) is
  'Registra NPS por e-mail. Exige presenca registrada e plantao ja terminado. IDOR por dono.';

-- ── 4. Derrubar o login ──────────────────────────────────────────────────
-- Só agora: as 6 acima já não chamam mais `plantao_sessao`.

drop function if exists gps.plantao_definir_senha(text, text);
drop function if exists gps.plantao_login(text, text, text, text);
drop function if exists gps.plantao_logout(text);
drop function if exists gps.plantao_sessao_valida(text);
drop function if exists gps.plantao_sessao(text);

-- `plantao_expurgar` referencia plantao_sessoes: recriar ANTES do drop table.
drop function if exists gps.plantao_expurgar(text);

create function gps.plantao_expurgar(p_segredo text)
returns table (eventos_expurgados int)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_esperado text;
  v_eventos int := 0;
begin
  v_esperado := current_setting('app.plantao_manutencao_segredo', true);
  if v_esperado is null or btrim(v_esperado) = ''
     or p_segredo is null or p_segredo <> v_esperado then
    raise exception 'Manutencao nao autorizada.' using errcode = '42501';
  end if;

  -- Sessoes deixaram de existir; sobra o expurgo de eventos (retencao de 90
  -- dias). Os eventos alimentam o rate limit, que so olha os ultimos 15
  -- minutos — 90 dias e folga larga.
  with apagados as (
    delete from gps.plantao_eventos
     where criado_em < now() - interval '90 days'
    returning 1
  )
  select count(*) into v_eventos from apagados;

  return query select v_eventos;
end;
$function$;

revoke execute on function gps.plantao_expurgar(text) from public;
grant execute on function gps.plantao_expurgar(text) to anon, authenticated;

comment on function gps.plantao_expurgar(text) is
  'Expurga eventos com mais de 90 dias. O expurgo de sessoes saiu com o login (08/09/2026). Exige app.plantao_manutencao_segredo — falha fechado.';

drop table if exists gps.plantao_sessoes;
drop table if exists gps.plantao_acessos;

-- Órfã desde que o 1º acesso parou de pedir documento (migração ...039), e
-- agora não há nem login para liberar.
alter table gps.plantao_alunos drop column if exists liberado_sem_documento;

-- ── 5. Corrige o Seq Scan latente ────────────────────────────────────────

create or replace function gps.plantao_pode_participar(p_email text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from gps.plantao_alunos pa
     where pa.email = lower(btrim(p_email))
       and pa.ativo
       and not pa.bloqueado_por_programa
  );
$function$;

revoke execute on function gps.plantao_pode_participar(text) from public, anon;
grant execute on function gps.plantao_pode_participar(text) to authenticated;

comment on function gps.plantao_pode_participar(text) is
  'Diagnostico para o ADMIN. Sem grant para anon: responder isso publicamente seria um enumerador perfeito de quem comprou o Acelera. Busca por coluna nua — a forma anterior, lower(btrim(email)) no WHERE, era Seq Scan.';
