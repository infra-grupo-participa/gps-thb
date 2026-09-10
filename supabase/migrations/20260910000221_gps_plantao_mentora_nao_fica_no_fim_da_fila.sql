-- Plantão — a mentora deixa de ficar no fim da fila do teto.
--
-- 🔴 O QUE FOI MEDIDO EM 10/09/2026, 08:47 (1h13 antes do plantão das 10:00)
--
--   24 alunos na fila do e-mail de "falta 1 hora". O teto é 8 por passada e
--   `v_enviados` é UM contador só, compartilhado entre alunos e mentora. O
--   loop dos alunos roda PRIMEIRO:
--
--     09:00 → 8 alunos, v_enviados = 8 → `if v_enviados < c_teto` = FALSO
--     09:05 → 8 alunos, v_enviados = 8 → FALSO
--     09:10 → 8 alunos, v_enviados = 8 → FALSO  (fila zera)
--     09:15 → 0 alunos, v_enviados = 0 → só agora a mentora recebe
--
--   24 é MÚLTIPLO EXATO DE 8: as três passadas enchem o teto e o bloco da
--   mentora nunca é alcançado enquanto houver fila. Ela recebeu a lista de
--   participantes 45 min antes da live, não 1 hora.
--
--   Não falha com erro. Falha atrasando — e, com fila maior que o total de
--   passadas da janela, falha DEIXANDO A MENTORA SEM A LISTA.
--
-- A CORREÇÃO
--   O loop dos ALUNOS passa a parar em `c_reserva_alunos` (7) em vez de
--   `c_teto` (8), deixando uma vaga garantida para o aviso da mentora na
--   MESMA passada. O aviso sai uma vez por slot (`aviso_mentora_em`), então
--   a vaga volta para os alunos assim que ela é avisada.
--
--   Custo: 1 aluno a menos por passada enquanto a mentora não foi avisada —
--   ou seja, só na primeira. 24 alunos levam 4 passadas (7+8+8+1) em vez de
--   3. Dentro da janela de 60 min com folga de 8 passadas.
--
-- ⚠️ Os loops de ABERTURA e de NPS continuam com `c_teto` cheio: nenhum
--    deles precede o bloco da mentora, então a reserva ali só desperdiçaria
--    vaga.
--
--
-- 📌 COMO FOI APLICADA (10/09/2026 08:58)
--   Aplicada por edicao do corpo VIGENTE lido de `pg_get_functiondef`, nao
--   por este arquivo -- a regra do projeto: o corpo parte sempre do que esta
--   no banco. Guardas do bloco: declaracao de `c_teto` presente e exatamente
--   3 ocorrencias de `exit when v_enviados >= c_teto;` (a 1a virou reserva,
--   as 2 outras -- abertura e NPS -- ficaram no teto cheio). Este arquivo e o
--   retrato do resultado, conferido por md5 contra o banco.
--
-- REVERSÃO
--   Trocar `c_reserva_alunos` de volta por `c_teto` no primeiro `exit when`.

begin;

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
  -- Reserva 1 vaga do teto para o aviso da mentora. Sem isso, fila multipla
  -- de 8 (24 em 10/09) enche o teto em TODA passada e o `if v_enviados <
  -- c_teto` do bloco da mentora nunca e verdadeiro -- ela so recebe a lista
  -- quando a fila zera, passadas depois. Ver o cabecalho deste arquivo.
  c_reserva_alunos constant int := 7;
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
      exit when v_enviados >= c_reserva_alunos;  -- reserva 1 vaga para o aviso da mentora
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
  'Dispara os e-mails do Plantao (1h antes, abertura e NPS) e o aviso da mentora, direto do banco por pg_net -> Resend. Chamada pelo cron plantao-emails-sala. Teto de 8 envios por passada; o loop dos alunos de 1h para em 7 para reservar vaga ao aviso da mentora -- sem isso, fila multipla de 8 empurra a mentora para passadas seguintes.';

commit;
