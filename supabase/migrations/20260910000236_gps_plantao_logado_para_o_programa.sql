-- Plantão de Dúvidas — aba própria para o aluno do PROGRAMA, dentro do sistema.
--
-- O PEDIDO (Marcio, 10/09/2026)
--   "O pessoal do programa de implementação assistida pode acompanhar o
--    plantão de dúvidas... inclusive a aba de plantão para eles se
--    registrarem deve existir dentro do sistema pra eles, e eles são
--    associados automático sem precisar colocar email e nome, dado que
--    estão com sessão ativa."
--
--   Decisão já tomada: **só pelo sistema, logado**. `/p/plantao` (rota
--   pública embedada na Hotmart) CONTINUA exclusiva do Acelera — as 5 portas
--   fechadas pelas migrations `...225/...226/...232` NÃO SÃO TOCADAS aqui.
--   O aluno do Programa ganha uma aba dentro do GPS (`/plantao`) e se
--   inscreve pela SESSÃO, nunca por e-mail vindo do cliente.
--
-- POR QUE 5 FUNÇÕES NOVAS, E NÃO REAPROVEITAR AS PÚBLICAS
--   As 6 RPCs públicas (`plantao_inscrever`, `plantao_revelar_link`,
--   `plantao_calendario`, `plantao_minha_inscricao`, mais as duas do admin)
--   recebem `p_email` DO CLIENTE e o tratam como identidade — é assim desde
--   08/09/2026, e é o modelo aceito PARA A ROTA PÚBLICA, que não tem sessão
--   nenhuma. Misturar os dois caminhos numa função só criaria uma RPC que
--   ora confia no e-mail informado, ora na sessão — e um dia alguém chamaria
--   a "logada" com e-mail alheio, ou a "pública" pareceria segura por engano.
--   Duas famílias de função, cada uma com UMA fonte de identidade, é o que
--   impede a exclusividade de se perder por confusão.
--
-- A IDENTIDADE: `gps.pessoa_atual()`, NUNCA e-mail do cliente
--   `gps.pessoa_atual()` resolve a PESSOA (titular ou sócio) a partir de
--   `auth.uid()` — a mesma função que guarda o onboarding (`...204/...206`).
--   Cada uma das 5 funções abaixo começa lendo-a e recusa com 42501 se vier
--   NULL (sem sessão, ou membro sem pessoa vinculada). O e-mail da pessoa
--   vem de `public.thb_alunos.email` (mesma tabela, mesma normalização
--   `lower(btrim(...))` já usada em `plantao_reconciliar_pelo_cron`) — nunca
--   de parâmetro. Não há como chamar estas funções "em nome de outra pessoa":
--   o `p_email`/`p_nome` simplesmente não existem na assinatura.
--
-- A ELEGIBILIDADE: o aluno do Programa É elegível ao Plantão AQUI
--   Esta é a mudança de posição desta feature (pedido explícito do Marcio).
--   As RPCs públicas continuam bloqueando quem tem ambiente no GPS —
--   ninguém trocou essa regra. Mas quem chega por ESTA porta já provou, pela
--   própria sessão, que está no Programa: a pergunta não é mais "esta pessoa
--   pode entrar", é "onde ela se inscreve". Por isso `plantao_inscrever_logado`
--   AUTO-CADASTRA a pessoa em `gps.plantao_alunos` (upsert por e-mail,
--   `origem = 'programa_gps'`) se ela ainda não tiver linha — não existe
--   formulário para isso, e o pedido foi literal: "associados automático
--   sem precisar colocar email e nome".
--
--   As outras 4 (calendário, minha inscrição, cancelar, revelar link) SÓ
--   LEEM/AGEM sobre o que já existe — nenhuma delas cria linha. Ver a
--   pessoa no calendário sem nunca ter se inscrito não precisa de cadastro
--   nenhum ainda.
--
-- O QUE NÃO MUDA (herdado das RPCs públicas, mesma redação)
--   • Interruptor de emergência (`gps.plantao_escrita_liberada()`).
--   • Slot precisa estar `publicado` e no futuro para inscrever.
--   • 1 inscrição ativa por vez (`for update` contra corrida).
--   • Cancelamento trava a partir de 1h antes do início.
--   • A sala abre 1h antes e fecha no FIM da sessão (`inicio_em + duracao_min`).
--   • IDOR: NÃO SE APLICA aqui — `p_inscricao_id` é sempre conferido contra
--     o `plantao_alunos.id` resolvido pela PRÓPRIA sessão, nunca por
--     parâmetro externo, então "pertence a outro e-mail" nem é um caminho
--     possível de tentar.
--
-- O QUE NÃO EXISTE AQUI (de propósito)
--   • Rate limit por IP: as públicas o têm porque um e-mail na query string
--     não prova nada. Aqui a prova é `auth.uid()` — a mesma guarda de
--     qualquer outra RPC do GPS.
--   • NPS: fora do pedido desta sessão; a rota pública mantém o formulário
--     próprio. Pode entrar depois com a mesma lógica de `pessoa_atual()`.
--
-- PROVA EM ROLLBACK (colada no commit, junto com esta migration)
--   1. Aluno do Programa, autenticado: `plantao_inscrever_logado` cria a
--      linha em `plantao_alunos` (origem programa_gps) e a inscrição.
--   2. `anon` chamando qualquer uma das 5: 42501 (sem GRANT — nem chega a
--      rodar o corpo).
--   3. `/p/plantao`: `gps.plantao_inscrever` com o e-mail de um dos 37
--      bloqueados (que NÃO é o Heber, que tem exceção) continua recusando.
--
-- REVERSÃO
--   drop function gps.plantao_revelar_link_logado(uuid);
--   drop function gps.plantao_cancelar_logado(uuid);
--   drop function gps.plantao_inscrever_logado(uuid);
--   drop function gps.plantao_minha_inscricao_logado();
--   drop function gps.plantao_calendario_logado(int, int);
--   (a aba em src/lib/nav.ts e a rota /plantao saem no mesmo commit do
--   frontend — sem elas, estas funções ficam órfãs mas inertes: exigem
--   GRANT explícito e ninguém as chama de fora.)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Calendário do mês — visão do aluno logado
-- ═══════════════════════════════════════════════════════════════════════════

create function gps.plantao_calendario_logado(p_ano int, p_mes int)
returns table (
  slot_id uuid, data date, hora_inicio time, duracao_min int,
  mentora_nome text, inscritos_qtd int, minha_inscricao boolean,
  encerrado boolean, inscricao_encerrada boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text;
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  select lower(btrim(t.email)) into v_email
    from public.thb_alunos t where t.id = v_pessoa;

  if v_email is not null then
    select id into v_aluno_id from gps.plantao_alunos
     where email = v_email and ativo;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         (sl.inicio_em <= now()),
         -- Espelha plantao_inscrever_logado: a única trava de prazo é o início.
         (sl.inicio_em <= now())
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd
    from gps.plantao_inscricoes i
    join gps.plantao_alunos a on a.id = i.aluno_plantao_id
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

comment on function gps.plantao_calendario_logado(int, int) is
  'Calendario mensal do Plantao para o aluno do PROGRAMA, autenticado. Identidade por gps.pessoa_atual() (nunca parametro) -- 42501 sem sessao. Nao afeta nem le a rota publica /p/plantao. inscritos_qtd conta todo mundo ativo (aqui nao ha bloqueado_por_programa: quem chama ja provou, pela sessao, que esta no Programa).';

revoke all on function gps.plantao_calendario_logado(int, int) from public, anon;
grant execute on function gps.plantao_calendario_logado(int, int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Minha inscrição ativa
-- ═══════════════════════════════════════════════════════════════════════════

create function gps.plantao_minha_inscricao_logado()
returns table (
  inscricao_id uuid, slot_id uuid, data date,
  hora_inicio time without time zone, mentora_nome text,
  presenca_em timestamptz, nps_em timestamptz, inicio_em timestamptz,
  tem_sala boolean, pode_cancelar boolean,
  duracao_min integer, fim_em timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text;
  v_aluno_id uuid;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  select lower(btrim(t.email)) into v_email
    from public.thb_alunos t where t.id = v_pessoa;
  if v_email is null then return; end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo;
  if v_aluno_id is null then return; end if;

  return query
  select i.id, sl.id, sl.data, sl.hora_inicio, m.nome, i.presenca_em, i.nps_em,
         sl.inicio_em,
         (sl.zoom_url is not null and btrim(sl.zoom_url) <> ''),
         (now() < sl.inicio_em - interval '60 minutes'),
         coalesce(sl.duracao_min, 120),
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

comment on function gps.plantao_minha_inscricao_logado() is
  'Inscricao ativa do aluno do PROGRAMA logado. Identidade por gps.pessoa_atual(). Espelha gps.plantao_minha_inscricao (rota publica) campo a campo -- so muda a fonte de identidade.';

revoke all on function gps.plantao_minha_inscricao_logado() from public, anon;
grant execute on function gps.plantao_minha_inscricao_logado() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Inscrever — AUTO-CADASTRA em plantao_alunos se a pessoa ainda não existe
-- ═══════════════════════════════════════════════════════════════════════════

create function gps.plantao_inscrever_logado(p_slot_id uuid)
returns table (
  ok boolean, motivo text, inscricao_id uuid,
  data date, hora_inicio time without time zone, mentora_nome text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text;
  v_nome text;
  v_aluno gps.plantao_alunos%rowtype;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_nova_id uuid;
  v_mentora_nome text;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  if not gps.plantao_escrita_liberada() then
    return query select false, 'As inscrições estão temporariamente indisponíveis.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  select lower(btrim(t.email)), btrim(t.nome) into v_email, v_nome
    from public.thb_alunos t where t.id = v_pessoa;

  if v_email is null or v_email = '' then
    return query select false, 'Seu cadastro não tem e-mail válido. Fale com a equipe.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  -- Auto-cadastro: "associados automático sem precisar colocar email e
  -- nome" (pedido literal). Upsert por e-mail -- se a pessoa já existe em
  -- plantao_alunos (ex.: também comprou o Acelera), a linha dela é reaproveitada
  -- tal como está (nome/documento não são sobrescritos por aqui).
  --
  -- 🔴 `bloqueio_excecao = true` E `bloqueado_por_programa = false` SÃO
  --    OBRIGATÓRIOS AQUI, e é o detalhe que quase custou o produto.
  --
  --    `gps.plantao_reconciliar_elegibilidade` (job de manutenção, roda de
  --    hora em hora) bloqueia todo `plantao_alunos` cujo e-mail exista em
  --    `thb_alunos join gps.membros` — ou seja, **todo aluno do Programa** —
  --    e, no mesmo passo, CANCELA as inscrições futuras dele.
  --
  --    Sem a exceção, esta função inscreveria a pessoa e o job a
  --    desinscreveria em até 60 minutos, sem erro e sem aviso. O aluno veria
  --    o plantão sumir da tela sozinho e ninguém saberia por quê.
  --
  --    A exceção é legítima: a regra "quem migrou para o Programa perde o
  --    Plantão" nasceu para o produto ACELERA; a decisão de 10/09 do Marcio
  --    ("o pessoal do programa pode acompanhar o plantão, foi acordado")
  --    abre o Plantão para o Programa pela aba LOGADA. O `/p/plantao`
  --    público continua exclusivo do Acelera — a exclusividade que se
  --    preserva é a da porta pública, não a da sala.
  --
  insert into gps.plantao_alunos (email, nome, origem, lote, ativo,
                                  bloqueado_por_programa, bloqueio_excecao)
  values (v_email, coalesce(nullif(v_nome, ''), v_email), 'programa_gps',
          to_char(now(), 'YYYY-MM'), true, false, true)
  on conflict (email) do update
     set ativo = true,
         -- Quem já estava bloqueado por ter migrado para o Programa é
         -- justamente quem esta aba veio atender: desbloqueia e marca a
         -- exceção, senão o job desfaz na próxima passada.
         bloqueado_por_programa = false,
         bloqueio_excecao = true
  returning * into v_aluno;

  select sl.* into v_slot from gps.plantao_slots sl where sl.id = p_slot_id for update;
  if not found or not v_slot.publicado then
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::date, null::time, null::text;
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
      null::uuid, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno.id, nullif(v_aluno.nome, ''))
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno.id, 'plantao_inscricao_logada', p_slot_id);

  select m.nome into v_mentora_nome
    from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

comment on function gps.plantao_inscrever_logado(uuid) is
  'Inscreve o aluno do PROGRAMA logado (gps.pessoa_atual(), nunca e-mail de parametro). AUTO-CADASTRA em gps.plantao_alunos na primeira vez (origem programa_gps) -- pedido literal do Marcio: sem formulario de nome/e-mail. Guardas: interruptor de emergencia, slot publicado e futuro, 1 inscricao ativa (for update contra corrida). NAO manda e-mail: o job de manutencao (/api/plantao/manutencao) ja varre gps.plantao_inscricoes por horario, sem distinguir origem.';

revoke all on function gps.plantao_inscrever_logado(uuid) from public, anon;
grant execute on function gps.plantao_inscrever_logado(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Cancelar
-- ═══════════════════════════════════════════════════════════════════════════

create function gps.plantao_cancelar_logado(p_inscricao_id uuid)
returns table (ok boolean, motivo text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text;
  v_aluno_id uuid;
  v_dono uuid;
  v_slot_id uuid;
  v_inicio timestamptz;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text;
    return;
  end if;

  select lower(btrim(t.email)) into v_email
    from public.thb_alunos t where t.id = v_pessoa;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo;
  if v_aluno_id is null then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  select i.aluno_plantao_id, i.slot_id, sl.inicio_em
    into v_dono, v_slot_id, v_inicio
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null
  for update of i;

  if v_dono is null or v_dono <> v_aluno_id then
    return query select false, 'Inscrição não encontrada.'::text;
    return;
  end if;

  if now() >= v_inicio - interval '60 minutes' then
    return query select false,
      'O prazo para cancelar terminou — falta menos de 1 hora para o plantão.'::text;
    return;
  end if;

  update gps.plantao_inscricoes set cancelado_em = now() where id = p_inscricao_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_cancelamento_logado', v_slot_id);

  return query select true, null::text;
end;
$function$;

comment on function gps.plantao_cancelar_logado(uuid) is
  'Cancela a inscricao do aluno do PROGRAMA logado. Identidade por gps.pessoa_atual() -- p_inscricao_id e sempre conferido contra o dono resolvido pela sessao, entao IDOR nao e um caminho possivel aqui. TRAVA a partir de 1h antes do inicio, igual a rota publica.';

revoke all on function gps.plantao_cancelar_logado(uuid) from public, anon;
grant execute on function gps.plantao_cancelar_logado(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Revelar o link da sala — grava presença
-- ═══════════════════════════════════════════════════════════════════════════

create function gps.plantao_revelar_link_logado(p_inscricao_id uuid)
returns table (ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_pessoa uuid := gps.pessoa_atual();
  v_email text;
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
  v_fim timestamptz;
begin
  if v_pessoa is null then
    raise exception 'Sem sessão do Programa.' using errcode = '42501';
  end if;

  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text, null::text;
    return;
  end if;

  select lower(btrim(t.email)) into v_email
    from public.thb_alunos t where t.id = v_pessoa;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo;
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

  v_fim := v_slot.inicio_em + make_interval(mins => coalesce(v_slot.duracao_min, 120));

  if now() < v_slot.inicio_em - interval '60 minutes' then
    return query select false, 'A sala abre 1 hora antes do início.'::text, null::text;
    return;
  end if;

  if now() >= v_fim then
    return query select false, 'Este plantão já foi encerrado.'::text, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'O link deste plantão ainda não foi cadastrado.'::text, null::text;
    return;
  end if;

  update gps.plantao_inscricoes
  set presenca_em = now(), presenca_origem = 'portal'
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
    values (v_aluno_id, 'plantao_presenca_logada', v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$function$;

comment on function gps.plantao_revelar_link_logado(uuid) is
  'Revela o link do Zoom para o aluno do PROGRAMA logado e grava presenca (presenca_origem=portal). Janela: [inicio-1h, inicio+duracao_min). Identidade por gps.pessoa_atual() -- sem rate limit por IP porque a sessao ja e a prova de identidade (diferente da rota publica, onde o e-mail e so uma afirmacao).';

revoke all on function gps.plantao_revelar_link_logado(uuid) from public, anon;
grant execute on function gps.plantao_revelar_link_logado(uuid) to authenticated;
