-- ═══════════════════════════════════════════════════════════════════════════
-- 327 — A equipe REMARCA uma sessão (gps.sessao_remarcar) e o aluno é avisado
--       por e-mail ("Sua sessão foi remarcada para <data hora>", com o motivo).
-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO APLICADA. Escrita sem acesso ao banco; ensaio e explain no fim.
-- Depende da 291/292/293/300/323 aplicadas. NÃO depende da 325 (gcal) nem a
-- altera — mas o trigger da 325 acorda na remarcação (ver RISCO).
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--   §1 colunas em gps.sessao_agendamentos:
--        remarcado_de      timestamptz  inicio_em ANTERIOR (a última remarcação)
--        remarcado_motivo  text         3..300, quem remarcou escreveu
--        remarcado_em      timestamptz  quando; abre a janela do e-mail
--        email_remarcou_aluno_em / _req o 9º par de carimbo (padrão …293)
--      + CHECK do motivo (sem subquery) + grant de COLUNA das 3 primeiras.
--   §2 RPC gps.sessao_remarcar(uuid, date, time, text) — só equipe.
--   §3 reconciliação e alarme passam a conhecer o 9º par (recriadas inteiras:
--      a …293 é a única definição no repo; guarda de corpo abaixo).
--   §4 gps.sessao_disparar_emails ganha o gatilho `remarcou_aluno`:
--      reescrita ANCORADA no corpo vivo (molde da …300/…323), md5 conferido,
--      e EXECUTADA numa subtransação desfeita antes do commit (lição da …323:
--      `create function` passar não prova que a query roda).
--
-- ── POR QUE O E-MAIL VAI COM O MOTIVO ──────────────────────────────────────
-- A …293 deixou o motivo do CANCELAMENTO fora do e-mail (texto livre que pode
-- conter dado do caso). Aqui o pedido é explícito: o aviso de remarcação leva
-- o motivo. Diferença que sustenta: quem escreve é a EQUIPE, para o próprio
-- aluno, sabendo que vai para ele (a action e a tela dizem isso). O texto é
-- escapado (& < >) antes de entrar no HTML.
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
--   Só o e-mail: gps.config.sessoes_email_ativo = 'false' (desliga todos).
--   A RPC: revoke execute on function gps.sessao_remarcar(uuid,date,time,text) from authenticated;
--   DOWN completo (à mão):
--     drop function if exists gps.sessao_remarcar(uuid, date, time, text);
--     -- reaplicar a …293 §4/§5 (reconciliação/alarme com 8 pares) e
--     -- reverter o §4 trocando o bloco novo por '' (mesma técnica, âncoras
--     -- invertidas) — ou simplesmente desligar pelo interruptor;
--     alter table gps.sessao_agendamentos
--       drop constraint if exists chk_sessao_agend_remarcado_motivo,
--       drop column if exists remarcado_de, drop column if exists remarcado_motivo,
--       drop column if exists remarcado_em,
--       drop column if exists email_remarcou_aluno_em, drop column if exists email_remarcou_aluno_req;
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- §1 COLUNAS
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.sessao_agendamentos
  add column if not exists remarcado_de             timestamptz,
  add column if not exists remarcado_motivo         text,
  add column if not exists remarcado_em             timestamptz,
  add column if not exists email_remarcou_aluno_em  timestamptz,
  add column if not exists email_remarcou_aluno_req bigint;

-- Sem subquery (0A000). Nulo = nunca remarcada.
alter table gps.sessao_agendamentos
  drop constraint if exists chk_sessao_agend_remarcado_motivo;
alter table gps.sessao_agendamentos
  add constraint chk_sessao_agend_remarcado_motivo
  check (remarcado_motivo is null
         or length(btrim(remarcado_motivo)) between 3 and 300);

comment on column gps.sessao_agendamentos.remarcado_de is
  'inicio_em ANTERIOR a ultima remarcacao (gps.sessao_remarcar). Remarcar de novo sobrescreve: o historico inteiro esta em gps.sessao_eventos (acao sessao_remarcada, de/para).';
comment on column gps.sessao_agendamentos.remarcado_motivo is
  'Motivo da ultima remarcacao, 3..300, escrito pela EQUIPE. VAI no e-mail ao aluno (pedido explicito, 01/10/2026), escapado para HTML. Nao escrever dado do caso aqui.';
comment on column gps.sessao_agendamentos.remarcado_em is
  'Quando a ultima remarcacao aconteceu. Abre a janela de 24 h do gatilho remarcou_aluno em gps.sessao_disparar_emails.';
comment on column gps.sessao_agendamentos.email_remarcou_aluno_em is
  'Carimbo do aviso de REMARCACAO ao aluno. Carimbo proprio (licao da …174). Zerado a cada remarcacao, para a seguinte tambem avisar. Limpo pela reconciliacao quando o request nao teve 2xx.';
comment on column gps.sessao_agendamentos.email_remarcou_aluno_req is
  'request_id do pg_net do aviso de remarcacao. Conferido em net._http_response por gps.sessao_reconciliar_envios.';

-- 🔴 Grant POR COLUNA (…291): coluna nova nasce fora dele. A tela (equipe e
-- aluno, cada um pela sua RLS de linha) pode mostrar "remarcada de X, motivo
-- Y". Os carimbos de e-mail ficam FORA, como os outros 16 (…293 §2).
grant select (remarcado_de, remarcado_motivo, remarcado_em)
  on gps.sessao_agendamentos to authenticated;

-- 🔴 `grant select` não revoga escrita; `public` nomeado porque `revoke from
-- anon` não pega o que vem de PUBLIC. Idempotente, repete a …293.
revoke insert, update, delete, truncate, references, trigger
  on gps.sessao_agendamentos from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2 gps.sessao_remarcar — molde: sessao_agendar (revalida oferta sob lock,
--    traduz 23505/23P01) + sessao_cancelar (for update, motivo, trilha, B1)
-- ═══════════════════════════════════════════════════════════════════════════
-- QUEM: admin (`public.gp_is_admin()`) ou a dona da sessão (`responsavel_id = auth.uid()`) — o recorte do cancelar. O aluno
-- não remarca — ele cancela (até 24 h antes) e marca outra.
--
-- O QUE VALIDA, nesta ordem:
--   1. equipe (42501) · 2. parâmetros e motivo 3..300 (22023)
--   3. sessão existe (P0002), está `agendado` e é FUTURA (22023)
--   4. novo horário no futuro e diferente do atual (22023)
--   5. novo horário está NA GRADE do mesmo responsável, livre e sem bloqueio
--      — perguntado à MESMA função que a tela usa (sessao_horarios_livres),
--      para a tela nunca oferecer o que a RPC recusa (…292 §5)
--   6. corrida entre transações: as travas atômicas (23505 sessao_slot_unico,
--      23P01 sessao_sem_sobreposicao), traduzidas em frase legível.
--
-- 🔑 A própria sessão NÃO atrapalha a checagem 5: o bloco atual dela aparece
-- como ocupado, mas os blocos de uma faixa não se sobrepõem entre si (passo =
-- duração + intervalo), então o único bloco recusado por ela é o atual — que
-- a checagem 4 já recusou com frase melhor. E no UPDATE a constraint de
-- exclusão compara a linha NOVA contra as OUTRAS: a versão antiga dela mesma
-- não conflita.
--
-- E-MAIL: zera os lembretes de 24 h e 1 h (em E req), senão o aluno e a
-- doutora não seriam lembrados do horário NOVO (o carimbo diria "já
-- lembrado"); zera o par de remarcação, para cada remarcação avisar. NÃO
-- zera `agendou_*`: a confirmação de marcação não se repete.
create or replace function gps.sessao_remarcar(
  p_sessao_id uuid,
  p_data      date,
  p_hora      time,
  p_motivo    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_a          record;
  v_motivo     text;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_ok         boolean;
  v_constraint text;
  v_etapa_id   smallint;
  v_escreveu   boolean := false;
begin
  -- 🔴 Guarda PRÓPRIA, na entrada, coalesce = falha FECHADA (achado ALTO de
  -- 22/09: `if null then raise` não dispara).
  if auth.uid() is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_sessao_id is null or p_data is null or p_hora is null then
    raise exception 'Escolha o novo horário para continuar.' using errcode = '22023';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Escreva o motivo da remarcação (ao menos 3 caracteres).'
      using errcode = '22023';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- Quem remarca: admin ou a DONA da sessão — o mesmo recorte do cancelar
  -- (nunca gps.eh_equipe(): operador da esteira não mexe na agenda da dra).
  -- 🔴 Autoriza ANTES do lock e com o MESMO erro para "não existe" e "não é
  -- sua" (kirad 01/10): senão o P0002 × 42501 revela ids de sessões alheias e
  -- o `for update` trava a linha de outra pessoa antes da recusa.
  if not (coalesce(public.gp_is_admin(), false)
          or exists (select 1 from gps.sessao_agendamentos a
                      where a.id = p_sessao_id
                        and a.responsavel_id = auth.uid())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔴 `for update`: duas remarcações (ou remarcação × cancelamento)
  -- simultâneas não podem as duas passar pela checagem de estado.
  select a.id, a.tipo_id, a.responsavel_id, a.cliente_id, a.estado,
         a.data, a.hora_inicio, a.inicio_em, a.duracao_min
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_sessao_id
   for update;

  if v_a.id is null then
    -- só admin chega aqui com id inexistente
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  -- 🔴 Teto contra rajada de e-mail (kirad 01/10): cada remarcação zera os
  -- carimbos e o cron avisa o aluno de novo. 3 por sessão em 24 h. Contado na
  -- trilha (sem índice em agendamento_id: só roda ao remarcar, tabela pequena;
  -- explain na saída do ensaio).
  if (select count(*) from gps.sessao_eventos e
       where e.agendamento_id = p_sessao_id
         and e.acao = 'sessao_remarcada'
         and e.criado_em >= now() - interval '24 hours') >= 3 then
    raise exception 'Esta sessão já foi remarcada 3 vezes nas últimas 24 horas. Fale com o aluno antes de mudar de novo.'
      using errcode = 'P0001';
  end if;
  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há o que remarcar.'
      using errcode = '22023';
  end if;
  -- 🔴 Contra inicio_em, nunca contra `data` (servidor em UTC).
  if v_a.inicio_em <= now() then
    raise exception 'Esta sessão já começou. Só uma sessão futura pode ser remarcada.'
      using errcode = '22023';
  end if;

  -- Instantes do bloco novo: MESMA ordem das colunas geradas (soma no
  -- timestamp local, converte depois) e a MESMA duração congelada da linha.
  v_inicio := ((p_data + p_hora) at time zone 'America/Sao_Paulo');
  v_fim    := (((p_data + p_hora) + make_interval(mins => v_a.duracao_min))
                 at time zone 'America/Sao_Paulo');

  if v_inicio <= now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;
  if v_inicio = v_a.inicio_em then
    raise exception 'A sessão já está marcada nesse horário.' using errcode = '22023';
  end if;

  -- A GRADE do mesmo responsável, livre e sem bloqueio — a função da tela.
  select exists (
    select 1
      from gps.sessao_horarios_livres(v_a.tipo_id, v_a.responsavel_id, p_data, p_data) h
     where h.inicio_em = v_inicio
       and h.responsavel_id = v_a.responsavel_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Esse horário não está na agenda livre desta profissional. Escolha outro na lista.'
      using errcode = '22023';
  end if;

  begin
    update gps.sessao_agendamentos
       set data                     = p_data,
           hora_inicio              = p_hora,
           remarcado_de             = v_a.inicio_em,
           remarcado_motivo         = v_motivo,
           remarcado_em             = now(),
           email_24h_dra_em         = null, email_24h_dra_req        = null,
           email_24h_aluno_em       = null, email_24h_aluno_req      = null,
           email_1h_dra_em          = null, email_1h_dra_req         = null,
           email_1h_aluno_em        = null, email_1h_aluno_req       = null,
           email_remarcou_aluno_em  = null, email_remarcou_aluno_req = null
     where id = p_sessao_id;
  exception
    when unique_violation then          -- 23505
      -- Por CONSTRAINT_NAME, não por sqlerrm (texto muda com locale/versão).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessao_slot_unico' then
        raise exception 'Alguém acabou de pegar esse horário. Escolha outro na lista.'
          using errcode = '23505';
      else
        raise exception 'Este aluno já tem outra sessão deste tipo marcada.'
          using errcode = '23505';
      end if;
    when exclusion_violation then       -- 23P01
      raise exception 'Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.'
        using errcode = '23P01';
  end;

  -- §9-ter B1 — a coluna-resultado acompanha, CONDICIONAL como no cancelar:
  -- só reescreve se ainda guarda a data DESTA sessão, e só para o tipo cuja
  -- etapa é a da Reunião Preliminar (2), lida do catálogo.
  select t.etapa_id into v_etapa_id from gps.sessao_tipos t where t.id = v_a.tipo_id;
  if v_etapa_id = 2 and p_data <> v_a.data then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = p_data
     where id = v_a.cliente_id
       and data_reuniao_preliminar = v_a.data;
    v_escreveu := found;
  end if;

  -- TRILHA. LGPD: identificadores, os dois horários e o motivo (o mesmo
  -- critério do evento sessao_cancelada). Nada de briefing.
  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_sessao_id, 'sessao_remarcada', auth.uid(),
          jsonb_build_object(
            'por', 'equipe',
            'de_inicio_em', v_a.inicio_em,
            'para_inicio_em', v_inicio,
            'motivo', v_motivo,
            'horas_de_antecedencia', round(extract(epoch from (v_a.inicio_em - now())) / 3600.0, 2),
            'escreveu_data_reuniao_preliminar', v_escreveu));

  return jsonb_build_object(
    'agendamento_id', p_sessao_id,
    'estado', 'agendado',
    'inicio_em', v_inicio,
    'fim_em', v_fim,
    'remarcado_de', v_a.inicio_em);
end;
$function$;

comment on function gps.sessao_remarcar(uuid, date, time, text) is
  'Remarca uma sessao FUTURA e agendada para outro horario LIVRE na grade do MESMO responsavel. So admin ou a dona da sessao (coalesce = falha fechada). Motivo 3..300 obrigatorio. Revalida a oferta com gps.sessao_horarios_livres (a mesma funcao da tela) sob `for update`; corrida tratada por 23505 (sessao_slot_unico) e 23P01 (sessao_sem_sobreposicao) com frase legivel. Grava remarcado_de/_motivo/_em, zera os carimbos de lembrete 24h/1h (dra e aluno) e o do aviso de remarcacao -- o cron avisa o aluno (gatilho remarcou_aluno) e relembra no horario novo. B1: data_reuniao_preliminar acompanha so se ainda guardava a data desta sessao. Evento sessao_remarcada com de/para.';

-- 🔴 Função nova nasce executável por PUBLIC. `public` nomeado.
revoke all on function gps.sessao_remarcar(uuid, date, time, text) from public, anon;
grant execute on function gps.sessao_remarcar(uuid, date, time, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3 RECONCILIAÇÃO e ALARME conhecem o 9º par
-- ═══════════════════════════════════════════════════════════════════════════
-- Guarda: as duas só foram definidas na …293. Se o corpo vivo não tiver os 8
-- pares de lá (alguém mexeu por fora), ABORTA em vez de sobrescrever.
do $guarda$
declare
  v_src text;
begin
  select pg_get_functiondef('gps.sessao_reconciliar_envios()'::regprocedure) into v_src;
  if position('''email_cancel_aluno''' in v_src) = 0
     or position('''email_agendou_dra''' in v_src) = 0 then
    raise exception 'sessao_reconciliar_envios vivo difere da …293 (pares ausentes) -- ABORTADA';
  end if;
  select pg_get_functiondef('gps.sessao_verificar_saude_envio()'::regprocedure) into v_src;
  if position('email_cancel_aluno_req' in v_src) = 0 then
    raise exception 'sessao_verificar_saude_envio vivo difere da …293 -- ABORTADA';
  end if;
end
$guarda$;

create or replace function gps.sessao_reconciliar_envios()
returns table(agendamento_id uuid, qual text, status integer)
language plpgsql
security definer
set search_path to ''
as $recon$
declare
  v_par  text;
  v_em   text;
  v_req  text;
  v_sql  text;
begin
  foreach v_par in array array[
    'email_agendou_dra',   'email_agendou_aluno',
    'email_24h_dra',       'email_24h_aluno',
    'email_1h_dra',        'email_1h_aluno',
    'email_cancel_dra',    'email_cancel_aluno',
    'email_remarcou_aluno'                       -- …327
  ]
  loop
    v_em  := quote_ident(v_par || '_em');
    v_req := quote_ident(v_par || '_req');

    -- CTE `limpo` de escrita, não referenciada de propósito (…293 §4).
    v_sql :=
      'with falhos as ('
      '  select a.id, rsp.status_code as st'
      '    from gps.sessao_agendamentos a'
      '    join net._http_response rsp on rsp.id = a.' || v_req ||
      '   where a.' || v_em  || ' is not null'
      '     and a.' || v_req || ' is not null'
      '     and coalesce(rsp.status_code, 0) not between 200 and 299'
      '), limpo as ('
      '  update gps.sessao_agendamentos a'
      '     set ' || v_em || ' = null, ' || v_req || ' = null'
      '    from falhos f'
      '   where f.id = a.id'
      '  returning a.id'
      ') select f.id, ' || quote_literal(v_par) || '::text, f.st from falhos f';

    return query execute v_sql;
  end loop;
end;
$recon$;

revoke all on function gps.sessao_reconciliar_envios() from public, anon, authenticated;

comment on function gps.sessao_reconciliar_envios() is
  'Devolve para a fila todo envio de sessao carimbado cujo request do pg_net NAO teve 2xx -- os 9 pares (carimbo, request_id): os 8 da …293 + email_remarcou_aluno (…327). Chamada no INICIO de cada passada de gps.sessao_disparar_emails. 🔴 net.http_post e ASSINCRONO: carimbar logo apos o post marca como avisado quem levou 429. Laco sobre a lista de pares: acrescentar par = acrescentar UMA linha no array.';

create or replace function gps.sessao_verificar_saude_envio()
returns void
language plpgsql
security definer
set search_path to ''
as $saude$
declare
  v_falhas  int;
  v_ultimo  text;
  v_chave   text;
  v_from    text;
  v_dest    text;
  v_html    text;
  c_limiar  constant int := 3;
begin
  select count(*) into v_falhas
    from gps.sessao_agendamentos a
    join net._http_response rsp
      on rsp.id in (a.email_agendou_dra_req, a.email_agendou_aluno_req,
                    a.email_24h_dra_req,     a.email_24h_aluno_req,
                    a.email_1h_dra_req,      a.email_1h_aluno_req,
                    a.email_cancel_dra_req,  a.email_cancel_aluno_req,
                    a.email_remarcou_aluno_req)
   where greatest(
           coalesce(a.email_agendou_dra_em,    '-infinity'::timestamptz),
           coalesce(a.email_agendou_aluno_em,  '-infinity'::timestamptz),
           coalesce(a.email_24h_dra_em,        '-infinity'::timestamptz),
           coalesce(a.email_24h_aluno_em,      '-infinity'::timestamptz),
           coalesce(a.email_1h_dra_em,         '-infinity'::timestamptz),
           coalesce(a.email_1h_aluno_em,       '-infinity'::timestamptz),
           coalesce(a.email_cancel_dra_em,     '-infinity'::timestamptz),
           coalesce(a.email_cancel_aluno_em,   '-infinity'::timestamptz),
           coalesce(a.email_remarcou_aluno_em, '-infinity'::timestamptz)
         ) >= now() - interval '1 hour'
     and coalesce(rsp.status_code, 0) not between 200 and 299;

  if v_falhas < c_limiar then
    return;
  end if;

  select valor into v_ultimo from gps.config where chave = 'sessoes_alarme_enviado_em';
  if v_ultimo is not null and btrim(v_ultimo) <> ''
     and v_ultimo::timestamptz >= now() - interval '1 hour' then
    return;
  end if;

  v_chave := gps.resend_api_key();
  select valor into v_from from gps.config where chave = 'email_sessoes_from';
  select valor into v_dest from gps.config where chave = 'chamados_email_fallback';

  if v_chave is null or btrim(v_chave) = ''
     or v_dest is null or btrim(v_dest) = '' then
    return;
  end if;
  v_from := coalesce(nullif(btrim(v_from), ''),
                     'Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>');

  v_html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#1c1917;">'
    '<h1 style="font-size:18px;color:#b91c1c;">Agenda de Sessões: falha de envio</h1>'
    '<p style="font-size:14px;line-height:1.6;">' || v_falhas || ' e-mail(s) da Agenda de '
    'Sessões falharam (status fora de 2xx) na última hora. Pode indicar chave da Resend '
    'revogada, domínio suspenso ou saldo esgotado.</p>'
    '<p style="font-size:14px;line-height:1.6;">Confira <code>gps.sessao_reconciliar_envios()</code> '
    'e o painel da Resend. Os envios voltam para a fila sozinhos; se a causa for a chave, '
    'eles ficarão girando sem sair.</p></div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || v_chave),
    body := jsonb_build_object(
      'from', v_from, 'to', jsonb_build_array(v_dest),
      'subject', 'ALERTA: falha de envio na Agenda de Sessões',
      'html', v_html,
      'text', v_falhas || ' e-mail(s) da Agenda de Sessoes falharam na ultima hora. Confira a Resend.'));

  update gps.config set valor = now()::text
   where chave = 'sessoes_alarme_enviado_em';
exception
  when others then
    return;  -- o alarme nunca derruba o disparo
end;
$saude$;

revoke all on function gps.sessao_verificar_saude_envio() from public, anon, authenticated;

comment on function gps.sessao_verificar_saude_envio() is
  'Se 3+ envios da Agenda de Sessoes falharam (sem 2xx) na ultima hora, avisa gps.config.chamados_email_fallback. Conta os 9 request_id (8 da …293 + email_remarcou_aluno_req da …327). No maximo 1 alerta/hora. Exception-safe: nunca derruba o disparo.';

-- ═══════════════════════════════════════════════════════════════════════════
-- §4 gps.sessao_disparar_emails ganha `remarcou_aluno` — reescrita ANCORADA
-- ═══════════════════════════════════════════════════════════════════════════
-- Duas inserções no corpo VIVO (pg_get_functiondef), nada removido:
--   A. um ramo novo na CTE `fila`, ANTES do 1º ramo atual. O novo vira o 1º
--      e por isso leva os 4 aliases (gatilho/col_em/col_req/publico) — a
--      lição da …323: em `union all` os nomes vêm do 1º ramo. O ramo antigo
--      mantém os aliases dele (inofensivo).
--   B. um `when 'remarcou_aluno'` no `case r.gatilho` que monta o texto,
--      ANTES do `when 'agendou_aluno'`. Sem ele cairia no `else` (cancel_aluno)
--      e o aluno receberia "Sua sessão foi cancelada" — por isso a âncora B é
--      obrigatória e contada.
-- O SELECT externo não muda: motivo e horário anterior são lidos por
-- subconsulta escalar dentro do `when` (uma linha por e-mail, PK).
--
-- ÂNCORA md5: o 323 registrou o corpo vivo DEPOIS do apply como
-- 2754d62c137fcb73a6bae7036cd2328c. Se mudou, ABORTA (reensaiar e atualizar).
-- Janela do gatilho: remarcado_em nas últimas 24 h, sessão ainda agendada e
-- futura. Mesma forma (sem índice) dos outros 6 ramos, sobre tabela de
-- dezenas de linhas, 288 passadas/dia.
do $mig$
declare
  v_src   text;
  v_novo  text;
  v_n     int;
  v_nl    text;
  v_a_de  text := $q$select a.id, 'agendou_aluno'::text as gatilho, 'email_agendou_aluno_em'::text as col_em, 'email_agendou_aluno_req'::text as col_req, 'aluno'::text as publico$q$;
  v_a_add text := $q$select a.id, 'remarcou_aluno'::text as gatilho, 'email_remarcou_aluno_em'::text as col_em, 'email_remarcou_aluno_req'::text as col_req, 'aluno'::text as publico
        from gps.sessao_agendamentos a
       where a.estado = 'agendado'
         and a.email_remarcou_aluno_em is null
         and a.remarcado_em >= now() - interval '24 hours'
         and a.inicio_em > now()
      union all
      $q$;
  v_b_de  text;
  v_b_add text := $q$when 'remarcou_aluno' then
        v_assunto := 'Sessão remarcada — ' || v_data_br || ' às ' || v_hora;
        v_titulo  := 'Sua sessão foi remarcada';
        v_frase   := 'Sua <strong>' || v_tipo_nm || '</strong> com <strong>' || v_dra_nm ||
                     '</strong> foi remarcada para <strong>' || v_data_br ||
                     '</strong>, às <strong>' || v_hora || '</strong> (' || r.duracao_min ||
                     ' minutos), sobre o cliente <strong>' || v_cli_nm || '</strong>.'
                     || coalesce((select ' O horário anterior era ' ||
                                         to_char(x.remarcado_de at time zone 'America/Sao_Paulo',
                                                 'DD/MM/YYYY "às" HH24:MI') || '.'
                                    from gps.sessao_agendamentos x where x.id = r.id), '')
                     || coalesce((select ' Motivo: ' ||
                                         replace(replace(replace(
                                           rtrim(btrim(x.remarcado_motivo), '.'),
                                           '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '.'
                                    from gps.sessao_agendamentos x where x.id = r.id), '');
      $q$;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'sessao_disparar_emails';

  if v_src is null then
    raise exception 'gps.sessao_disparar_emails nao existe -- ABORTADA';
  end if;
  if position('remarcou_aluno' in v_src) > 0 then
    raise notice 'sessao_disparar_emails ja tem remarcou_aluno -- §4 pulado (reaplicacao)';
    return;
  end if;
  if md5(v_src) <> '2754d62c137fcb73a6bae7036cd2328c' then
    raise exception 'corpo vivo de sessao_disparar_emails mudou (md5 %) -- ABORTADA sem aplicar; reensaiar as ancoras', md5(v_src);
  end if;

  -- A. ramo da fila
  v_n := (length(v_src) - length(replace(v_src, v_a_de, ''))) / length(v_a_de);
  if v_n <> 1 then
    raise exception 'ancora A (1o ramo da fila) casou % vezes (esperado 1) -- ABORTADA', v_n;
  end if;
  v_novo := replace(v_src, v_a_de, v_a_add || v_a_de);

  -- B. texto do e-mail. `when 'agendou_aluno' then` aparece TAMBÉM no
  -- `order by` (seguido de " 3"); no `case` vem seguido de quebra de linha.
  -- Aceita LF ou CRLF, conforme o corpo vivo.
  v_nl := case when position(E'when ''agendou_aluno'' then\r\n' in v_novo) > 0
               then E'\r\n' else E'\n' end;
  v_b_de := 'when ''agendou_aluno'' then' || v_nl;
  v_n := (length(v_novo) - length(replace(v_novo, v_b_de, ''))) / length(v_b_de);
  if v_n <> 1 then
    raise exception 'ancora B (when agendou_aluno do case) casou % vezes (esperado 1) -- ABORTADA', v_n;
  end if;
  v_novo := replace(v_novo, v_b_de, replace(v_b_add, E'\n', v_nl) || v_b_de);

  -- Prova textual: 2 ocorrências de 'remarcou_aluno' (fila + case).
  if (length(v_novo) - length(replace(v_novo, '''remarcou_aluno''', ''))) / length('''remarcou_aluno''') <> 2 then
    raise exception 'remarcou_aluno deveria aparecer 2x (fila + case) -- ABORTADA';
  end if;

  execute v_novo;

  -- 🔑 Prova de que a QUERY roda e o ramo NOVO executa (não só compila):
  -- subtransação desfeita por P0099. Interruptor forçado a 'true' (desligado,
  -- a função sai antes da CTE). Planta uma remarcação na próxima sessão
  -- futura para o ramo `remarcou_aluno` ser alcançado. Tudo — interruptor,
  -- plantio, carimbos e o INSERT em net.http_request_queue — volta junto.
  declare
    v_alvo  uuid;
    v_tipos text;
    v_qtd   int;
  begin
    begin
      update gps.config set valor = 'true' where chave = 'sessoes_email_ativo';
      if not found then
        raise exception 'chave sessoes_email_ativo ausente -- ensaio seria vazio; ABORTADA';
      end if;

      select a.id into v_alvo
        from gps.sessao_agendamentos a
       where a.estado = 'agendado' and a.inicio_em > now() + interval '2 hours'
       order by a.inicio_em limit 1;

      if v_alvo is not null then
        update gps.sessao_agendamentos
           set remarcado_em = now(),
               remarcado_de = inicio_em - interval '1 day',
               remarcado_motivo = 'Ensaio <da> migration & 327.',
               email_remarcou_aluno_em = null, email_remarcou_aluno_req = null
         where id = v_alvo;
      end if;

      select string_agg(d.tipo, ',' order by d.tipo), count(*) into v_tipos, v_qtd
        from gps.sessao_disparar_emails() d;

      -- Teto de 8 por passada (…293) e o ramo novo cai no `else 4` da ordem:
      -- com fila cheia ele pode legitimamente ficar para a passada seguinte.
      -- Só acusa ausência quando a passada NÃO bateu o teto.
      if v_alvo is not null and v_qtd < 8
         and position('remarcou_aluno' in coalesce(v_tipos, '')) = 0 then
        raise exception 'ensaio: sessao % plantada como remarcada e o gatilho remarcou_aluno NAO saiu (tipos=%) -- ABORTADA',
          v_alvo, coalesce(v_tipos, '<nenhum>');
      end if;

      raise exception using errcode = 'P0099',
        message = 'ensaio_ok alvo=' || coalesce(v_alvo::text, '<sem sessao futura: ramo nao exercitado>')
                  || ' tipos=' || coalesce(v_tipos, '<nenhum>');
    exception
      when sqlstate 'P0099' then
        raise notice '%', sqlerrm;  -- subtransação desfeita: nada enviado
    end;
  end;
end
$mig$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 🔬 ENSAIO e EXPLAIN — rodar em begin … rollback (sessão principal)
-- ═══════════════════════════════════════════════════════════════════════════
-- R0. Pré-condição da âncora (sem escrever nada):
--   select md5(pg_get_functiondef('gps.sessao_disparar_emails()'::regprocedure));
--   -- esperado 2754d62c137fcb73a6bae7036cd2328c (pós-…323). Diferente → ajustar
--   -- o md5 do §4 depois de conferir que as âncoras A e B continuam no corpo.
--   select pg_get_functiondef('gps.sessao_reconciliar_envios()'::regprocedure)
--     like '%email_cancel_aluno%';                                  -- true
--
-- R1. Aplicação inteira desfeita:
--   begin;
--   set local lock_timeout = '2s'; set local statement_timeout = '20s';
--   -- colar o arquivo SEM o `begin;` e o `commit;` dele
--   -- esperado: NOTICE ensaio_ok alvo=<uuid> tipos=...,remarcou_aluno,...
--   select count(*) from net.http_request_queue;      -- = antes (nada enfileirado)
--   rollback;
--
-- R2. A RPC como EQUIPE (admin) e como NÃO-equipe, dentro de begin … rollback,
--     DEPOIS de colar o arquivo (mesma transação do R1, antes do rollback):
--   set local role authenticated;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', '<uuid de um admin>', 'role', 'authenticated')::text, true);
--   -- horário livre de verdade, do mesmo responsável da sessão:
--   select h.data, h.hora_inicio from gps.sessao_horarios_livres(
--     (select tipo_id from gps.sessao_agendamentos where id = '<sessao>'),
--     (select responsavel_id from gps.sessao_agendamentos where id = '<sessao>')) h limit 1;
--   select gps.sessao_remarcar('<sessao>', '<data>', '<hora>', 'Doutora em audiência');
--   -- esperado: jsonb com inicio_em novo e remarcado_de = o antigo
--   select data, hora_inicio, remarcado_de, remarcado_motivo, email_24h_aluno_em, email_1h_aluno_em
--     from gps.sessao_agendamentos where id = '<sessao>';           -- carimbos nulos
--   select acao, detalhe from gps.sessao_eventos
--    where agendamento_id = '<sessao>' order by id desc limit 1;    -- sessao_remarcada
--   -- negativos (cada um num savepoint):
--   --   horário fora da grade            → 22023 "não está na agenda livre…"
--   --   motivo 'ok'                       → 22023 "ao menos 3 caracteres"
--   --   mesmo horário                     → 22023 "já está marcada nesse horário"
--   --   claims de um ALUNO                → 42501 "Sem permissão."
--   --   role anon: select gps.sessao_remarcar(...) → 42501 permission denied for function
--   rollback;
--
-- R3. Grants (fora de transação, só leitura):
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_schema = 'gps' and routine_name = 'sessao_remarcar';
--   -- esperado: authenticated EXECUTE (+ postgres/service_role); SEM PUBLIC/anon
--   select has_function_privilege('anon', 'gps.sessao_remarcar(uuid,date,time,text)', 'execute'); -- false
--   select column_name from information_schema.column_privileges
--    where table_schema='gps' and table_name='sessao_agendamentos'
--      and grantee='authenticated' and column_name like 'remarcado%';   -- 3 colunas, SELECT
--   select has_table_privilege('authenticated','gps.sessao_agendamentos','UPDATE'); -- false
--
-- EXPLAIN (dentro do begin … rollback do R2 — o UPDATE EXECUTA):
--   explain (analyze, buffers)
--   update gps.sessao_agendamentos set remarcado_em = now() where id = '<sessao>';
--   -- esperado: Index Scan using sessao_agendamentos_pkey (filtro por id, PK)
--   explain (analyze, buffers)
--   select 1 from gps.sessao_horarios_livres(2::smallint, '<responsavel>'::uuid, '<data>'::date, '<data>'::date);
--   -- (função opaca no plano; o plano interno é o medido na …292: Nested Loop
--   --  com sondas em sessao_sem_sobreposicao, GiST, 0,663 ms para 56 dias —
--   --  aqui a janela é 1 dia)
--   explain (analyze, buffers)
--   select a.id from gps.sessao_agendamentos a
--    where a.estado = 'agendado' and a.email_remarcou_aluno_em is null
--      and a.remarcado_em >= now() - interval '24 hours' and a.inicio_em > now();
--   -- esperado: Seq Scan (tabela de dezenas de linhas; mesma forma dos 6 ramos
--   -- existentes da fila, nenhum indexado). Índice só se a tabela passar de
--   -- alguns milhares de linhas — medir antes.
--
-- ── SAÍDA DO ENSAIO (colar aqui) ──────────────────────────────────────────
--   01/10/2026, mbvybujpkwuorhtdzcde, R0–R3 numa transação desfeita (raise final):
--   R0: md5 vivo de sessao_disparar_emails = 2754d62c… (bate) · recon_ok true
--   R1: 5 colunas criadas · md5 novo 82bfe1da… com remarcou_aluno · ensaio interno
--       "ensaio_ok … tipos=remarcou_aluno" · fila net.http_request_queue 0 → 0
--   R2 (sessão 02/10 09:30 → 09/10 09:30, horário tirado de sessao_horarios_livres):
--       sem login 42501 · estranho 42501 · motivo "ab" 22023 · 03:00 fora da grade
--       22023 · data passada 22023 · mesmo horário de novo 22023
--       como dona: ok; remarcado_de/_motivo/_em gravados, email_24h_aluno_em e
--       email_remarcou_aluno_em zerados, 1 evento sessao_remarcada
--   R3: anon exec false · authenticated exec true · authenticated select
--       remarcado_motivo true · UPDATE na tabela: anon false, authenticated false
--       (já era false antes: o revoke é no-op) · reconciliar p/ authenticated false
--   EXPLAIN 1 (UPDATE por PK): Index Scan sessao_agendamentos_pkey, 0,818 ms
--   EXPLAIN 2 (horarios_livres, janela 1 dia): Function Scan, 1,257 ms
--   EXPLAIN 3 (ramo remarcou_aluno da fila): Index Scan sessao_slot_unico, 0,031 ms
--   Reensaio após o kirad (teto 3/24h + autoriza antes do lock), mesma técnica:
--       remarcar 1, 2, 3 ok · 4ª → P0001 · estranho com id real 42501 · estranho
--       com id inexistente 42501 (não vaza mais P0002) · contagem do teto: Seq Scan
--       em sessao_eventos (97 linhas), 0,055 ms — sem índice, só roda ao remarcar
-- ═══════════════════════════════════════════════════════════════════════════
