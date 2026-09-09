-- Plantão de Dúvidas — o e-mail da sala passa a sair PELO BANCO.
--
-- 🔴 Por que esta migration existe (war-room de 09/09/2026)
--
-- O desenho anterior era `pg_cron` → `POST /api/plantao/manutencao` → Resend
-- (via `src/lib/email-plantao.ts`). No dia em que o produto foi usado pela
-- primeira vez — 23 inscritos, 17 deles no plantão daquela mesma tarde —
-- descobriu-se que NENHUMA das pontas estava de pé:
--
--   • a rota respondia 500 (`PLANTAO_MANUTENCAO_SEGREDO` nunca setado na
--     Hostinger);
--   • o cron nunca foi agendado;
--   • `app.plantao_manutencao_segredo` não estava setado no banco — e o
--     `alter role authenticator set ...` é RECUSADO pelo Supabase mesmo com
--     role `postgres` (erro 42501), então não há como configurá-lo por
--     migration nem por MCP: só pelo painel/superusuário;
--   • a `RESEND_API_KEY` que existia localmente estava inválida.
--
-- Resultado: um caminho de entrega com 4 pontos de falha, três deles fora do
-- alcance de quem mantém o código. Esta migration corta o intermediário: o
-- banco fala direto com a Resend por `pg_net`. Some a dependência de deploy,
-- de env na Hostinger e do `alter role` que não podemos executar.
--
-- ⚠️ O segredo `app.plantao_manutencao_segredo` existia para barrar chamada
-- anônima ao PostgREST. Aqui ele não faz falta porque esta função NÃO é
-- exposta: o `revoke` no fim tira `public`/`anon`/`authenticated`, e quem a
-- chama é o `pg_cron`, de dentro do banco. Não há chamador anônimo a barrar.
--
-- 🔑 Credenciais ficam em `gps.config` (RLS ligado, sem grant para `anon`
-- nem `authenticated`), NUNCA no corpo da função: `pg_get_functiondef` é
-- legível por qualquer um com `postgres`, e a chave vazaria junto com o
-- código-fonte.
--
--     insert into gps.config (chave, valor) values
--       ('resend_api_key', '<chave>'),
--       ('email_from', 'Time Holding Brasil <acesso@...>')
--     on conflict (chave) do update set valor = excluded.valor;
--
-- 🔁 IDEMPOTENTE, e é isso que permite rodar de 10 em 10 minutos: o envio ao
-- aluno carimba `plantao_inscricoes.email_sala_em` e o aviso à mentora
-- carimba `plantao_slots.aviso_mentora_em`. Quem já recebeu sai do filtro.
-- Verificado: a segunda chamada seguida devolve 0 linhas.
--
-- ⏱️ Janela: `inicio_em <= now() + 60min AND inicio_em > now()` — a mesma da
-- RPC `plantao_email_sala_pendente`, que continua existindo para o caminho
-- HTTP. Por isso o cron é de 10 em 10 minutos e NÃO diário: com execução
-- diária, só os plantões que começassem na hora seguinte à execução seriam
-- alcançados; todos os outros ficariam sem e-mail.
--
-- 📣 O rodapé leva ao canal de monitoria (decisão do Marcio, 09/09/2026) —
-- é para onde vai quem não consegue entrar na sala.
--
-- 🔗 Duplicação assumida: `src/lib/email-plantao.ts` continua existindo e
-- monta os mesmos e-mails em TypeScript, para o caminho HTTP. Enquanto as
-- duas implementações coexistirem, mudança de conteúdo precisa ser feita nos
-- DOIS lugares. A consolidação depende de a rota `/api/plantao/manutencao`
-- voltar a responder em produção (env + `alter role`) — ver
-- `ATIVAR-PLANTAO-AGORA.md`.

create or replace function gps.plantao_disparar_emails_sala()
returns table(destinatario text, tipo text, request_id bigint)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chave    text;
  v_from     text;
  v_logo     text := 'https://programa.timeholdingbrasil.com.br/logo-thb.png';
  v_monit    text := 'https://o.aceleraholding.com.br/monitoria';
  v_laranja  text := '#EA580C';
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
begin
  -- Credenciais em gps.config (RLS ligado, sem grant para anon/authenticated),
  -- NUNCA no corpo da funcao: `pg_get_functiondef` e legivel por quem tem
  -- postgres, e a chave vazaria junto com o codigo.
  select valor into v_chave from gps.config where chave = 'resend_api_key';
  select valor into v_from  from gps.config where chave = 'email_from';

  if v_chave is null or btrim(v_chave) = '' then
    raise exception 'gps.config.resend_api_key nao configurada' using errcode = '42501';
  end if;
  v_from := coalesce(nullif(btrim(v_from), ''),
                     'Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>');

  -- Cabecalho e rodapes comuns aos dois e-mails.
  v_cab :=
    '<div style="background:' || v_laranja || ';padding:20px 28px;">'
    '<img src="' || v_logo || '" width="44" height="44" alt="" '
    'style="vertical-align:middle;border-radius:50%;margin-right:12px;">'
    '<span style="display:inline-block;vertical-align:middle;">'
    '<span style="color:#fff;font-size:18px;font-weight:bold;">Plantão de Dúvidas</span><br>'
    '<span style="color:#ffe4d1;font-size:12px;">Acelera Holding — Time Holding Brasil</span>'
    '</span></div>';

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
    'Você recebeu este e-mail porque se inscreveu no Plantão de Dúvidas do Acelera Holding.'
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
    loop
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
        'Seu plantão de dúvidas começa em <strong>1 hora</strong>: <strong>'
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

      update gps.plantao_inscricoes set email_sala_em = now() where id = r.inscricao_id;

      destinatario := r.email; tipo := 'aluno'; request_id := v_req;
      return next;
    end loop;

    --------------------------------------------------------------- MENTORA
    if v_slot.aviso_mentora_em is null
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
          'Seu plantão de dúvidas começa em <strong>1 hora</strong>: <strong>'
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

        destinatario := v_slot.mentora_email; tipo := 'mentora'; request_id := v_req;
        return next;
      end if;
    end if;
  end loop;
end;
$function$;

-- Não é endpoint: quem chama é o pg_cron, de dentro do banco.
revoke all on function gps.plantao_disparar_emails_sala() from public, anon, authenticated;

-- Agendamento — de 10 em 10 minutos, NÃO diário (ver nota da janela acima).
-- `cron.schedule` com nome existente faz UPDATE, então rodar de novo é seguro.
select cron.schedule(
  'plantao-emails-sala',
  '*/10 * * * *',
  $cron$ select gps.plantao_disparar_emails_sala(); $cron$
);
