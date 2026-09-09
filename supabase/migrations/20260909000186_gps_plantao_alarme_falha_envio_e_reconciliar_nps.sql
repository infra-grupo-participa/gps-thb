-- Plantão — alarme de falha de envio + reconciliação também para o NPS.
--
-- 🔴 POR QUÊ (Marcio saiu, cron roda sozinho amanhã 10/09 às 09:00, 10:00 e
-- 12:01, para 21 inscritos, sem ninguém olhando).
--
-- 1. ALARME. Hoje, se a Resend recusar TUDO (chave revogada, domínio
--    suspenso, saldo zerado), `gps.plantao_disparar_emails_sala()` continua
--    devolvendo `succeeded` para o `pg_cron` — o `net.http_post` sempre
--    aceita o pedido (retorna o `request_id`), só o `_http_response`
--    posterior é que carrega o status real. O incidente das 13:00 já provou
--    que "o cron disse que rodou" não prova que o e-mail saiu.
--
--    Esta migration acrescenta `gps.plantao_verificar_saude_envio()`,
--    chamada no INÍCIO de cada passada (antes até da reconciliação, para
--    pegar a falha da passada anterior o quanto antes): conta quantos
--    `email_sala_req`/`email_abertura_req`/`email_nps_req` da ÚLTIMA HORA
--    tiveram resposta sem 2xx, e se for **3 ou mais** (ver limiar abaixo),
--    dispara um alerta por e-mail para `gps.config.chamados_email_fallback`
--    (hoje `marcio@advmais.com`) via `net.http_post` — mesmo transporte dos
--    demais e-mails, sem depender de nenhuma rota HTTP do Next (que hoje
--    está fora do ar, conforme a `…176`).
--
--    LIMIAR = 3: 1 ou 2 falhas isoladas (um provedor de e-mail específico
--    rejeitando, um 429 pontual não pego pela reconciliação a tempo) não
--    justificam acordar ninguém — a própria reconciliação resolve na
--    passada seguinte. 3+ no espaço de 1h é padrão de recusa sistêmica
--    (chave/domínio/saldo), não acaso.
--
--    ⚠️ TRAVA CONTRA LAÇO: se o que está falhando é o PRÓPRIO envio, o
--    alerta pode falhar também. Por isso:
--      a) o alerta é dado por `net.http_post` direto (não depende de
--         `v_chave` ter funcionado antes — usa a MESMA chave, mas se a
--         Resend está fora do ar por completo, o e-mail de alerta também
--         não sairia; é o único cenário sem saída possível por e-mail, e
--         está fora do controle desta função);
--      b) carimbo em `gps.config.plantao_alarme_enviado_em` limita a NO
--         MÁXIMO 1 alerta por hora — sem isso, com falha persistente, cada
--         passada de 5 min mandaria um alerta novo (12/hora).
--      c) a checagem de saúde é `exception`-safe: qualquer erro dentro dela
--         é capturado e ignorado (`when others`), para NUNCA derrubar o
--         disparo normal de e-mails por causa do alarme.
--
-- 2. RECONCILIAÇÃO DO NPS. `gps.plantao_reconciliar_envios()` (`…174`)
--    cobre `email_sala_req` e `email_abertura_req`, mas o carimbo de NPS
--    (`email_nps_req`, `…176`) ficou de fora — descoberto ao revisar para
--    amanhã. Um 429 no NPS ficaria marcado como "enviado" para sempre, sem
--    reenvio. Acrescentado o terceiro bloco, mesmo padrão dos outros dois.
--
-- REVERSÃO
--   -- volta a reconciliação ao estado da …176 (sem o bloco NPS) e a função
--   -- de disparo ao estado da …176 (sem a chamada ao alarme):
--   -- reaplicar o create or replace function das duas na …176.
--   drop function if exists gps.plantao_verificar_saude_envio();
--   delete from gps.config where chave = 'plantao_alarme_enviado_em';

begin;

-- Carimbo do último alerta disparado, para o teto de 1/hora. Vive em
-- gps.config (mesma tabela das credenciais), não em coluna de tabela: não é
-- dado por inscrição, é estado global do alarme.
insert into gps.config (chave, valor)
values ('plantao_alarme_enviado_em', '')
on conflict (chave) do nothing;

commit;

begin;

-- Reconciliação: acrescenta o bloco NPS aos dois existentes (sala + abertura).
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

  -- Terceiro bloco (esta migration): NPS ficou de fora da …174/…176.
  return query
  with falhos as (
    select i.id, a.email, rsp.status_code as st
      from gps.plantao_inscricoes i
      join gps.plantao_alunos a on a.id = i.aluno_plantao_id
      join net._http_response rsp on rsp.id = i.email_nps_req
     where i.email_nps_em is not null and i.email_nps_req is not null
       and coalesce(rsp.status_code, 0) not between 200 and 299
  ), limpo as (
    update gps.plantao_inscricoes i set email_nps_em = null, email_nps_req = null
      from falhos f where f.id = i.id returning i.id
  )
  select f.id, f.email, 'nps'::text, f.st from falhos f;
end;
$recon$;

revoke all on function gps.plantao_reconciliar_envios() from public, anon, authenticated;

comment on function gps.plantao_reconciliar_envios() is
  'Devolve para a fila quem foi carimbado (sala, abertura ou nps) sem resposta 2xx do pg_net. Chamada no inicio de cada passada de gps.plantao_disparar_emails_sala.';

commit;

begin;

-- Alarme: falha sistemica de envio na ultima hora avisa gps.config.chamados_email_fallback.
create or replace function gps.plantao_verificar_saude_envio()
returns void
language plpgsql
security definer
set search_path to ''
as $saude$
declare
  v_falhas   int;
  v_ultimo   text;
  v_chave    text;
  v_from     text;
  v_dest     text;
  v_html     text;
  c_limiar   constant int := 3;  -- 1-2 falhas: reconciliacao resolve sozinha
begin
  -- Quantos envios (dos 3 tipos) na ultima hora tiveram resposta sem 2xx.
  select count(*) into v_falhas
    from gps.plantao_inscricoes i
    join net._http_response rsp
      on rsp.id in (i.email_sala_req, i.email_abertura_req, i.email_nps_req)
   where coalesce(i.email_sala_em, i.email_abertura_em, i.email_nps_em) >= now() - interval '1 hour'
     and coalesce(rsp.status_code, 0) not between 200 and 299;

  if v_falhas < c_limiar then
    return;
  end if;

  -- Trava de laco: no maximo 1 alerta por hora.
  select valor into v_ultimo from gps.config where chave = 'plantao_alarme_enviado_em';
  if v_ultimo is not null and btrim(v_ultimo) <> ''
     and v_ultimo::timestamptz >= now() - interval '1 hour' then
    return;
  end if;

  select valor into v_chave from gps.config where chave = 'resend_api_key';
  select valor into v_from  from gps.config where chave = 'email_from';
  select valor into v_dest  from gps.config where chave = 'chamados_email_fallback';

  if v_chave is null or btrim(v_chave) = '' or v_dest is null or btrim(v_dest) = '' then
    return;  -- sem chave ou sem destinatario nao ha como alertar por e-mail
  end if;
  v_from := coalesce(nullif(btrim(v_from), ''),
                     'Acelera Holding <acesso@programa.timeholdingbrasil.com.br>');

  v_html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;padding:20px;color:#1c1917;">'
    '<h1 style="font-size:18px;color:#b91c1c;">Plantão: falha de envio detectada</h1>'
    '<p style="font-size:14px;line-height:1.6;">' || v_falhas || ' e-mail(s) do Plantão de '
    'Dúvidas falharam (status fora de 2xx) na última hora. Isto pode indicar chave da '
    'Resend revogada, domínio suspenso ou saldo esgotado.</p>'
    '<p style="font-size:14px;line-height:1.6;">Confira em '
    '<code>gps.plantao_reconciliar_envios()</code> e no painel da Resend.</p></div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || v_chave),
    body := jsonb_build_object(
      'from', v_from, 'to', jsonb_build_array(v_dest),
      'subject', 'ALERTA: falha de envio no Plantão de Dúvidas',
      'html', v_html,
      'text', v_falhas || ' e-mail(s) do Plantao falharam na ultima hora. Confira a Resend.')
  );

  update gps.config set valor = now()::text, atualizado_em = now()
   where chave = 'plantao_alarme_enviado_em';
exception
  when others then
    -- Nunca deixar o alarme derrubar o disparo normal de e-mails.
    return;
end;
$saude$;

revoke all on function gps.plantao_verificar_saude_envio() from public, anon, authenticated;

comment on function gps.plantao_verificar_saude_envio() is
  'Se 3+ envios do Plantao falharam (sem 2xx) na ultima hora, avisa gps.config.chamados_email_fallback por e-mail. No maximo 1 alerta/hora (carimbo em gps.config.plantao_alarme_enviado_em). Exception-safe: nunca derruba o disparo normal.';

commit;

begin;

-- Acrescenta a chamada ao alarme no INICIO da passada, antes da reconciliacao,
-- para detectar a falha da passada anterior o quanto antes. Corpo da funcao
-- de disparo repetido integralmente (padrao do repo: migration reconstroi o
-- banco do zero sozinha) — unica mudanca real e a linha do alarme, logo no
-- comeco do bloco `begin`.
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
  v_form     text;
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
  -- 🔑 Alarme de saude ANTES da reconciliacao: se a passada anterior falhou
  -- em massa (chave revogada, dominio suspenso, saldo zerado), este e o
  -- primeiro ponto de deteccao. Exception-safe por dentro; nunca interrompe
  -- o restante desta funcao.
  perform gps.plantao_verificar_saude_envio();

  -- 🔑 Devolve para a fila quem foi carimbado mas cujo POST nao deu 2xx.
  -- Sem isto um 429 vira "avisado" para sempre (o que houve as 13:00).
  perform gps.plantao_reconciliar_envios();

  -- Credenciais em gps.config (RLS ligado, sem grant para anon/authenticated),
  -- NUNCA no corpo da funcao: `pg_get_functiondef` e legivel por quem tem
  -- postgres, e a chave vazaria junto com o codigo.
  select valor into v_chave from gps.config where chave = 'resend_api_key';
  select valor into v_from  from gps.config where chave = 'email_from';
  select valor into v_form  from gps.config where chave = 'plantao_nps_form_url';

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
      v_texto := v_ola || E'\n\n' ||
        'A sala do seu plantão do Acelera Holding está aberta agora, com '
        || v_slot.mentora_nome || '. É só entrar.' || E'\n\nSala: ' || v_slot.zoom_url ||
        E'\n\nProblemas para entrar? Fale com a monitoria: ' || v_monit;

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
  ------------------------------------------------------------------ (C) NPS
  --
  -- 🔑 Pesquisa de satisfação, 1 minuto depois do FIM (decisão do Marcio,
  -- 09/09/2026). A lembrança está fresca — a taxa de resposta tende a ser
  -- maior do que horas depois.
  --
  -- 🔴 Vai para TODOS os inscritos, não só para quem tem `presenca_em`: a
  -- presença só é gravada por quem entra pelo BOTÃO do portal, e quem clicou
  -- direto no link do e-mail assistiu sem deixar marca. Filtrar por presença
  -- excluiria essas pessoas (hoje seriam 12 de 23). Decisão do Marcio, com o
  -- número na mesa.
  --
  -- Janela de 2 horas a partir do fim: folga para o cron (5 em 5 min) e o
  -- teto por passada esvaziarem a fila. Carimbo `email_nps_em` é PRÓPRIO —
  -- `nps_email_em` (quase homônima) é do caminho HTTP antigo, e reusá-la
  -- faria um envio cancelar o outro.
  for v_slot in
    select sl.id, sl.data, sl.hora_inicio, m.nome as mentora_nome
      from gps.plantao_slots sl join gps.plantao_mentoras m on m.id = sl.mentora_id
     where sl.publicado and sl.cancelado_em is null
       and now() >= sl.inicio_em + make_interval(mins => coalesce(sl.duracao_min,120))
                                 + interval '1 minute'
       and now() <  sl.inicio_em + make_interval(mins => coalesce(sl.duracao_min,120))
                                 + interval '2 hours'
  loop
    for r in
      select i.id as inscricao_id, a.email, a.nome
        from gps.plantao_inscricoes i join gps.plantao_alunos a on a.id = i.aluno_plantao_id
       where i.slot_id = v_slot.id and i.cancelado_em is null
         and i.email_nps_em is null and not a.bloqueado_por_programa
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
        '<h1 style="margin:0 0 16px;font-size:20px;">Como foi o seu plantão?</h1>'
        '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">' || v_ola || '</p>'
        '<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">'
        'O plantão de dúvidas de hoje com <strong>' || v_slot.mentora_nome ||
        '</strong> acabou de terminar. Sua opinião ajuda a melhorar os próximos '
        'encontros — leva menos de um minuto.</p>'
        '<p style="margin:8px 0 20px;"><a href="' || v_form || '" '
        'style="display:inline-block;padding:12px 22px;background:' || v_laranja || ';'
        'color:#fff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">'
        'Avaliar o plantão</a></p>'
        '<p style="font-size:13px;line-height:1.6;color:#78716c;margin:0;">'
        'Se o botão não funcionar, copie e cole este endereço no navegador:<br>'
        '<span style="word-break:break-all;">' || v_form || '</span></p>'
        '</div>' || v_rod_al || '</div></div>';
      v_texto := v_ola || E'\n\n' ||
        'O plantão de dúvidas de hoje com ' || v_slot.mentora_nome ||
        ' acabou de terminar. Sua opinião ajuda a melhorar os próximos encontros '
        '— leva menos de um minuto.' ||
        E'\n\nAvaliar o plantão: ' || v_form ||
        E'\n\nFicou com alguma dúvida? Fale com a monitoria: ' || v_monit;

      select net.http_post(url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type','application/json',
                                      'Authorization','Bearer ' || v_chave),
        body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(r.email),
          'subject','Como foi o seu plantão de hoje?',
          'html', v_html, 'text', v_texto)) into v_req;

      update gps.plantao_inscricoes
         set email_nps_em = now(), email_nps_req = v_req where id = r.inscricao_id;
      v_enviados := v_enviados + 1; perform pg_sleep(c_pausa);
      destinatario := r.email; tipo := 'aluno_nps'; request_id := v_req; return next;
    end loop;
  end loop;
end;
$function$;

revoke all on function gps.plantao_disparar_emails_sala() from public, anon, authenticated;

comment on function gps.plantao_disparar_emails_sala() is
  'Envia os TRES e-mails do plantao: (A) link 1h antes + lista a mentora, (B) aviso na abertura, (C) pesquisa de NPS 1 min apos o fim. Marca Acelera. Teto de 8 por passada, pausa de 0,15s (Resend: 10 req/s). Idempotente por carimbo proprio de cada envio + reconciliacao (sala/abertura/nps) + alarme de saude (3+ falhas/hora avisa chamados_email_fallback, max 1/hora). Cron plantao-emails-sala, */5.';

commit;
