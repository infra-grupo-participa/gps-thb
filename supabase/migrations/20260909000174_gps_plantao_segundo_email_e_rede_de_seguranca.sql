-- Plantão — o 2º e-mail (abertura) e a rede de segurança do envio.
--
-- 🔴 ESCRITA DEPOIS DO INCIDENTE DE 09/09/2026, 13:00.
--
-- O que aconteceu: o cron disparou os 20 e-mails de "falta 1 hora" de uma
-- vez. A Resend limita **10 requisições por segundo** — 11 voltaram 429.
-- Pior: `net.http_post` é ASSÍNCRONO (devolve o id do pedido, não o
-- resultado), e a função carimbava `email_sala_em` logo depois do post.
-- Resultado: 11 pessoas ficaram **sem o link E marcadas como avisadas**.
-- Falha silenciosa — a pior espécie, porque ninguém investiga o que diz
-- ter dado certo. Só apareceu porque fomos conferir destinatário a
-- destinatário na API da Resend.
--
-- Três correções, todas nesta migration:
--
-- 1. **Pausa entre envios** (`pg_sleep(0.15)` ≈ 6,7 req/s) e **teto de 8
--    por passada**. O teto também protege o `statement_timeout` de 8s do
--    `authenticator`.
--
-- 2. **`gps.plantao_reconciliar_envios()`**: o carimbo passa a guardar o
--    `request_id` do `pg_net`, e esta função — chamada no INÍCIO de cada
--    passada — procura carimbo cujo request NÃO teve 2xx e o LIMPA,
--    devolvendo a pessoa para a fila.
--
--    ⚠️ Por que não `http_collect_response(async := false)`, que resolveria
--    na hora: ele BLOQUEIA até a resposta chegar e estoura o
--    `statement_timeout` de 8s. Testado — a transação morreu.
--
-- 3. **Segundo e-mail, na ABERTURA da live** (decisão do Marcio): um 1h
--    antes ("começa em 1 hora") e outro no início ("começou agora, entre").
--    Dobra a chance de a pessoa ver E alcança quem se inscreveu nos
--    últimos 59 minutos — esses não recebiam nada. Carimbo PRÓPRIO
--    (`email_abertura_em`): reusar `email_sala_em` faria um envio cancelar
--    o outro.
--
-- 🔑 ARITMÉTICA DA JANELA — a parte que quase falhou de novo:
--    teto 8/passada × cron 10min × janela 15min = 16 pessoas alcançáveis.
--    Com 19 inscritos, 3 ficariam sem o e-mail de abertura, com a live já
--    rolando. Por isso a janela foi para **30 min** e o cron para **5 min**:
--    19 pessoas em 3 passadas = 15 min, dentro da janela com folga.
--    Medido em transação revertida antes de valer: 19 de 19.
--
-- Resultado real do dia: 23 de 23 nos DOIS e-mails (a base cresceu de 19
-- para 23 durante a própria live).

begin;

-- Carimbo do 2o e-mail e os request_id para auditoria/reconciliacao.
alter table gps.plantao_inscricoes
  add column if not exists email_abertura_em  timestamptz,
  add column if not exists email_abertura_req bigint,
  add column if not exists email_sala_req     bigint;

comment on column gps.plantao_inscricoes.email_abertura_em is
  'Carimbo do 2o e-mail (no horario de inicio da live). Separado de email_sala_em, que e o de 1h antes: sao dois envios distintos e cada um precisa do proprio carimbo para ser idempotente.';
comment on column gps.plantao_inscricoes.email_abertura_req is
  'request_id do pg_net do e-mail de abertura. Permite conferir o status HTTP em net._http_response e reenviar so quem falhou.';
comment on column gps.plantao_inscricoes.email_sala_req is
  'request_id do pg_net do e-mail de 1h antes. Mesma finalidade de email_abertura_req.';

commit;

begin;

-- Rede de segurança do envio: devolve para a fila quem foi carimbado sem 2xx.
create or replace function gps.plantao_reconciliar_envios()
returns table(inscricao_id uuid, email text, qual text, status integer)
language plpgsql
security definer
set search_path to ''
as $recon$
begin
  return query
  with falhos as (
    select i.id, a.email, rsp.status_code as st
      from gps.plantao_inscricoes i
      join gps.plantao_alunos a on a.id = i.aluno_plantao_id
      join net._http_response rsp on rsp.id = i.email_sala_req
     where i.email_sala_em is not null and i.email_sala_req is not null
       and coalesce(rsp.status_code, 0) not between 200 and 299
  ), limpo as (
    update gps.plantao_inscricoes i set email_sala_em = null, email_sala_req = null
      from falhos f where f.id = i.id returning i.id
  )
  select f.id, f.email, 'sala_1h'::text, f.st from falhos f;

  return query
  with falhos as (
    select i.id, a.email, rsp.status_code as st
      from gps.plantao_inscricoes i
      join gps.plantao_alunos a on a.id = i.aluno_plantao_id
      join net._http_response rsp on rsp.id = i.email_abertura_req
     where i.email_abertura_em is not null and i.email_abertura_req is not null
       and coalesce(rsp.status_code, 0) not between 200 and 299
  ), limpo as (
    update gps.plantao_inscricoes i set email_abertura_em = null, email_abertura_req = null
      from falhos f where f.id = i.id returning i.id
  )
  select f.id, f.email, 'abertura'::text, f.st from falhos f;
end;
$recon$;

revoke all on function gps.plantao_reconciliar_envios() from public, anon, authenticated;

create or replace function gps.plantao_disparar_emails_sala()
returns table(destinatario text, tipo text, request_id bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chave    text;
  v_from     text;
  v_logo     text := 'https://programa.timeholdingbrasil.com.br/logo-acelera-email.png';
  v_monit    text := 'https://o.aceleraholding.com.br/monitoria';
  v_laranja  text := '#ED6D05';  -- laranja da marca Acelera
  v_escuro   text := '#180B00';  -- marrom escuro da marca Acelera
  r          record;
  v_slot     record;
  v_req      bigint;
  v_html     text;
  v_texto    text;
  v_ola      text;
  v_data_br  text;
  v_hora     text;
  v_lista    text;
  v_qtd      int;
  v_cab      text;
  v_rod_al   text;
  v_rod_me   text;
  v_enviados int := 0;
  c_teto     constant int := 8;         -- envios por passada do cron
  c_pausa    constant numeric := 0.15;  -- ~6,7 req/s (a Resend permite 10)
begin
  -- 🔑 Devolve para a fila quem foi carimbado mas cujo POST nao deu 2xx.
  -- Sem isto um 429 vira "avisado" para sempre (o que houve as 13:00).
  perform gps.plantao_reconciliar_envios();

  -- Credenciais em gps.config (RLS ligado, sem grant para anon/authenticated),
  -- NUNCA no corpo da funcao: `pg_get_functiondef` e legivel por quem tem
  -- postgres, e a chave vazaria junto com o codigo.
  select valor into v_chave from gps.config where chave = 'resend_api_key';
  select valor into v_from  from gps.config where chave = 'email_from';

  if v_chave is null or btrim(v_chave) = '' then
    raise exception 'gps.config.resend_api_key nao configurada' using errcode = '42501';
  end if;
  v_from := coalesce(nullif(btrim(v_from), ''),
                     'Acelera Holding <acesso@programa.timeholdingbrasil.com.br>');

  -- Cabecalho e rodapes comuns aos dois e-mails.
  -- 🔑 Cabecalho ESCURO, nao laranja: a logo do Acelera traz o texto em
  -- degrade branco->prata e SOME sobre fundo claro ou laranja. Medido.
  v_cab :=
    '<div style="background:' || v_escuro || ';padding:22px 28px;text-align:center;">'
    '<img src="' || v_logo || '" width="240" alt="Acelera Holding" '
    'style="display:block;margin:0 auto;border:0;max-width:100%;height:auto;">'
    '<div style="color:#b3b2b2;font-size:12px;margin-top:10px;letter-spacing:.06em;'
    'text-transform:uppercase;">Plantão de Dúvidas</div>'
    '</div>';

  -- "Problema no acesso -> monitoria" (decisao do Marcio, 09/09/2026): o
  -- destino e o WhatsApp do suporte. Vai no e-mail porque e onde a pessoa
  -- esta quando a sala nao abre.
  v_rod_al :=
    '<div style="padding:16px 28px;border-top:1px solid #e7e5e4;background:#fff7ed;'
    'font-size:13px;color:#7c2d12;line-height:1.6;">'
    'Problemas para entrar na sala? <a href="' || v_monit || '" '
    'style="color:#9a3412;font-weight:bold;">Fale com a monitoria</a>.</div>'
    '<div style="padding:18px 28px;border-top:1px solid #e7e5e4;background:#fafaf9;'
    'font-size:12px;color:#78716c;line-height:1.5;">'
    'Você recebeu este e-mail porque se inscreveu no Plantão de Dúvidas, '
    'exclusivo de quem faz parte do <strong>Acelera Holding</strong>.'
    '</div>';

  v_rod_me :=
    '<div style="padding:16px 28px;border-top:1px solid #e7e5e4;background:#fff7ed;'
    'font-size:13px;color:#7c2d12;line-height:1.6;">'
    'Algum problema com a sala? <a href="' || v_monit || '" '
    'style="color:#9a3412;font-weight:bold;">Fale com a monitoria</a>.</div>'
    '<div style="padding:18px 28px;border-top:1px solid #e7e5e4;background:#fafaf9;'
    'font-size:12px;color:#78716c;line-height:1.5;">'
    'Você recebeu este e-mail porque é mentora do Plantão de Dúvidas do Acelera Holding.'
    '</div>';

  for v_slot in
    select sl.id, sl.data, sl.hora_inicio, sl.zoom_url, sl.aviso_mentora_em,
           m.nome as mentora_nome, m.email as mentora_email
      from gps.plantao_slots sl
      join gps.plantao_mentoras m on m.id = sl.mentora_id
     where sl.publicado
       and sl.cancelado_em is null
       and sl.zoom_url is not null and btrim(sl.zoom_url) <> ''
       and sl.inicio_em <= now() + interval '60 minutes'
       and sl.inicio_em > now()
  loop
    v_data_br := to_char(v_slot.data, 'DD/MM/YYYY');
    v_hora    := to_char(v_slot.hora_inicio, 'HH24:MI');

    ---------------------------------------------------------------- ALUNOS
    for r in
      select i.id as inscricao_id, a.email, a.nome
        from gps.plantao_inscricoes i
        join gps.plantao_alunos a on a.id = i.aluno_plantao_id
       where i.slot_id = v_slot.id
         and i.cancelado_em is null
         and i.email_sala_em is null
         and not a.bloqueado_por_programa
       order by i.inscrito_em
    loop
      exit when v_enviados >= c_teto;
      v_ola := case when btrim(coalesce(r.nome,'')) <> ''
                    then 'Olá, ' || split_part(btrim(r.nome), ' ', 1) || '!'
                    else 'Olá!' end;

      v_html :=
        '<div style="background:#f5f5f4;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
        '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;'
        'overflow:hidden;border:1px solid #e7e5e4;">' || v_cab ||
        '<div style="padding:28px;color:#1c1917;">'
        '<h1 style="margin:0 0 16px;font-size:20px;">Seu plantão é daqui a pouco</h1>'
        '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">' || v_ola || '</p>'
        '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">'
        'Seu plantão de dúvidas do <strong>Acelera Holding</strong> começa em '
        '<strong>1 hora</strong>: <strong>'
        || v_data_br || '</strong>, às <strong>' || v_hora || '</strong>, com <strong>'
        || v_slot.mentora_nome || '</strong>.</p>'
        '<p style="margin:8px 0 20px;"><a href="' || v_slot.zoom_url || '" '
        'style="display:inline-block;padding:12px 22px;background:' || v_laranja || ';'
        'color:#fff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">'
        'Entrar na sala</a></p>'
        '<p style="font-size:13px;line-height:1.6;color:#78716c;margin:0;">'
        'Se o botão não funcionar, copie e cole este endereço no navegador:<br>'
        '<span style="word-break:break-all;">' || v_slot.zoom_url || '</span></p>'
        '</div>' || v_rod_al || '</div></div>';

      v_texto := v_ola || E'\n\n' ||
        'Seu plantão de dúvidas começa em 1 hora: ' || v_data_br || ', às ' || v_hora ||
        ', com ' || v_slot.mentora_nome || '.' || E'\n\nSala: ' || v_slot.zoom_url ||
        E'\n\nProblemas para entrar? Fale com a monitoria: ' || v_monit;

      select net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type','application/json',
                                      'Authorization','Bearer ' || v_chave),
        body := jsonb_build_object(
          'from', v_from, 'to', jsonb_build_array(r.email),
          'subject', 'Seu plantão começa em 1 hora — ' || v_hora || ' com ' || v_slot.mentora_nome,
          'html', v_html, 'text', v_texto)
      ) into v_req;

      update gps.plantao_inscricoes
         set email_sala_em = now(), email_sala_req = v_req where id = r.inscricao_id;
      v_enviados := v_enviados + 1; perform pg_sleep(c_pausa);

      destinatario := r.email; tipo := 'aluno_1h'; request_id := v_req;
      return next;
    end loop;

    --------------------------------------------------------------- MENTORA
    if v_slot.aviso_mentora_em is null and v_enviados < c_teto
       and v_slot.mentora_email is not null and btrim(v_slot.mentora_email) <> '' then

      select count(*), string_agg(
               '<tr><td style="padding:9px 16px;font-size:14px;border-top:1px solid #f0efee;">'
               || coalesce(nullif(btrim(a.nome),''),'(sem nome)')
               || '</td><td style="padding:9px 16px;font-size:13px;color:#78716c;'
               'border-top:1px solid #f0efee;">' || a.email || '</td></tr>',
               '' order by a.nome)
        into v_qtd, v_lista
        from gps.plantao_inscricoes i
        join gps.plantao_alunos a on a.id = i.aluno_plantao_id
       where i.slot_id = v_slot.id and i.cancelado_em is null
         and not a.bloqueado_por_programa;

      if coalesce(v_qtd,0) > 0 then
        v_html :=
          '<div style="background:#f5f5f4;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
          '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;'
          'overflow:hidden;border:1px solid #e7e5e4;">' || v_cab ||
          '<div style="padding:28px;color:#1c1917;">'
          '<h1 style="margin:0 0 16px;font-size:20px;">Seu plantão começa em 1 hora</h1>'
          '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Olá, '
          || split_part(btrim(v_slot.mentora_nome),' ',1) || '!</p>'
          '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">'
          'Seu plantão de dúvidas do <strong>Acelera Holding</strong> começa em '
          '<strong>1 hora</strong>: <strong>'
          || v_data_br || '</strong>, às <strong>' || v_hora || '</strong>. Há <strong>'
          || v_qtd || ' pessoas</strong> inscritas.</p>'
          '<p style="margin:8px 0 20px;"><a href="' || v_slot.zoom_url || '" '
          'style="display:inline-block;padding:12px 22px;background:' || v_laranja || ';'
          'color:#fff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">'
          'Abrir a sala</a></p>'
          '<h2 style="margin:0 0 12px;font-size:16px;">Quem vai participar (' || v_qtd || ')</h2>'
          '<table width="100%" cellpadding="0" cellspacing="0" '
          'style="border-collapse:collapse;border:1px solid #e7e5e4;border-radius:8px;">'
          '<tr style="background:#fafaf9;">'
          '<th align="left" style="padding:9px 16px;font-size:11px;text-transform:uppercase;'
          'color:#78716c;">Nome</th>'
          '<th align="left" style="padding:9px 16px;font-size:11px;text-transform:uppercase;'
          'color:#78716c;">E-mail</th></tr>' || v_lista || '</table>'
          '</div>' || v_rod_me || '</div></div>';

        v_texto := 'Olá, ' || split_part(btrim(v_slot.mentora_nome),' ',1) || '!' || E'\n\n'
          || 'Seu plantão começa em 1 hora: ' || v_data_br || ', às ' || v_hora || '.' || E'\n'
          || 'Há ' || v_qtd || ' pessoas inscritas.' || E'\n\nSala: ' || v_slot.zoom_url
          || E'\n\nProblemas com a sala? Fale com a monitoria: ' || v_monit;

        select net.http_post(
          url := 'https://api.resend.com/emails',
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_chave),
          body := jsonb_build_object(
            'from', v_from, 'to', jsonb_build_array(v_slot.mentora_email),
            'subject', 'Hoje, ' || v_hora || ': seu plantão com ' || v_qtd || ' inscritos',
            'html', v_html, 'text', v_texto)
        ) into v_req;

        update gps.plantao_slots set aviso_mentora_em = now() where id = v_slot.id;
        v_enviados := v_enviados + 1; perform pg_sleep(c_pausa);

        destinatario := v_slot.mentora_email; tipo := 'mentora'; request_id := v_req;
        return next;
      end if;
    end if;
  end loop;
  ------------------------------------------------------------------ (B) abertura
  --
  -- 🔑 Segundo e-mail, no INÍCIO da live (decisão do Marcio, 09/09/2026):
  -- dobra a chance de a pessoa ver E alcança quem se inscreveu nos últimos
  -- 59 minutos, depois do envio (A) — esses não recebiam aviso nenhum.
  --
  -- Janela de 30 minutos: "entre agora" continua verdadeiro nesse intervalo
  -- (a sessão dura 120). Com teto de 8 e cron de 5 em 5 min, 19 pessoas
  -- levam 3 passadas = 15 min, dentro da janela com folga. Era 15 min com
  -- cron de 10, o que alcançava no máximo 16 pessoas — 3 ficariam sem nada.
  for v_slot in
    select sl.id, sl.data, sl.hora_inicio, sl.zoom_url, m.nome as mentora_nome
      from gps.plantao_slots sl join gps.plantao_mentoras m on m.id = sl.mentora_id
     where sl.publicado and sl.cancelado_em is null
       and sl.zoom_url is not null and btrim(sl.zoom_url) <> ''
       and now() >= sl.inicio_em and now() < sl.inicio_em + interval '30 minutes'
  loop
    for r in
      select i.id as inscricao_id, a.email, a.nome
        from gps.plantao_inscricoes i join gps.plantao_alunos a on a.id = i.aluno_plantao_id
       where i.slot_id = v_slot.id and i.cancelado_em is null
         and i.email_abertura_em is null and not a.bloqueado_por_programa
       order by i.inscrito_em
    loop
      exit when v_enviados >= c_teto;
      v_ola := case when btrim(coalesce(r.nome,'')) <> ''
               then 'Olá, ' || split_part(btrim(r.nome),' ',1) || '!' else 'Olá!' end;
      v_html :=
        '<div style="background:#f5f5f4;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
        '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;'
        'overflow:hidden;border:1px solid #e7e5e4;">' || v_cab ||
        '<div style="padding:28px;color:#1c1917;">'
        '<h1 style="margin:0 0 16px;font-size:20px;">O plantão começou agora</h1>'
        '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">' || v_ola || '</p>'
        '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">'
        'A sala do seu plantão de dúvidas do <strong>Acelera Holding</strong> está '
        '<strong>aberta agora</strong>, com <strong>' || v_slot.mentora_nome
        || '</strong>. É só entrar.</p>'
        '<p style="margin:8px 0 20px;"><a href="' || v_slot.zoom_url || '" '
        'style="display:inline-block;padding:12px 22px;background:' || v_laranja || ';'
        'color:#fff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">'
        'Entrar na sala agora</a></p>'
        '<p style="font-size:13px;line-height:1.6;color:#78716c;margin:0;">'
        'Se o botão não funcionar, copie e cole este endereço no navegador:<br>'
        '<span style="word-break:break-all;">' || v_slot.zoom_url || '</span></p>'
        '</div>' || v_rod_al || '</div></div>';
      v_texto := v_ola || E'

' ||
        'A sala do seu plantão do Acelera Holding está aberta agora, com '
        || v_slot.mentora_nome || '. É só entrar.' || E'

Sala: ' || v_slot.zoom_url ||
        E'

Problemas para entrar? Fale com a monitoria: ' || v_monit;

      select net.http_post(url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type','application/json',
                                      'Authorization','Bearer ' || v_chave),
        body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(r.email),
          'subject','Começou agora: seu plantão com ' || v_slot.mentora_nome,
          'html', v_html, 'text', v_texto)) into v_req;

      update gps.plantao_inscricoes
         set email_abertura_em = now(), email_abertura_req = v_req where id = r.inscricao_id;
      v_enviados := v_enviados + 1; perform pg_sleep(c_pausa);
      destinatario := r.email; tipo := 'aluno_abertura'; request_id := v_req; return next;
    end loop;
  end loop;
end;
$function$;

revoke all on function gps.plantao_disparar_emails_sala() from public, anon, authenticated;

comment on function gps.plantao_disparar_emails_sala() is
  'Envia (A) o link 1h antes e (B) o aviso de abertura, aluno e mentora. Marca Acelera. Teto de 8 por passada, pausa de 0,15s (Resend: 10 req/s). Idempotente por carimbo + reconciliacao. Cron plantao-emails-sala.';

-- Cron de 10 -> 5 minutos. Ver a aritmética no cabeçalho: com teto de 8 por
-- passada, 19 pessoas levam 3 passadas = 15 min; a 10 em 10 seriam 30 min e
-- a janela de abertura já teria fechado.
select cron.schedule('plantao-emails-sala','*/5 * * * *',
  $cron$ select gps.plantao_disparar_emails_sala(); $cron$);

commit;
