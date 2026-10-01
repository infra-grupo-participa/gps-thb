-- ============================================================
-- 330 — html_esc no resumo diário da doutora + link sem caractere de HTML
-- ============================================================
-- Achados do pentest (01/10/2026), segunda metade (a primeira é a 329):
-- A. gps.sessao_resumo_dra_enviar (…300): tipo, aluno e cliente entravam
--    crus no <li>; primeiro nome da doutora cru no "Olá". O nome do cliente
--    é escrito pelo aluno → HTML injetado no e-mail da equipe.
--    A1-A3 os 3 nomes por gps.html_esc · A4 o Olá. Assunto não leva nome e
--    não há versão texto: nada a desfazer.
-- B. gps.sessao_link_definir (…296): recusa " ' < > crase e espaço (22023,
--    frase que a action repassa). Defesa em profundidade: o escape no href
--    (329 E4/E5) é o que protege link já gravado ou gravado por SQL direto
--    (a tabela não tem grant de UPDATE para authenticated; só esta RPC grava).
--    Sem CHECK novo na coluna: link legado violando abortaria o ALTER.
-- NÃO COBRE: links já gravados que violam a regra (contar no ensaio, item
--   1); e-mails do Plantão (…222) — pendência registrada.
-- Requer a 329 (gps.html_esc). Marcadores '-- 330 html_esc' e
-- '-- 330 link chars' → cada remendo pula sozinho se já aplicado.
-- ============================================================

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  v_src  text;
  v_n    int;
  v_de   text[] := array[
    $q$coalesce(nullif(btrim(m.tipo_nome), ''), 'sessao')$q$,
    $q$coalesce(nullif(btrim(m.aluno_nome), ''), 'parceiro')$q$,
    $q$coalesce(nullif(btrim(m.cliente_nome), ''), 'cliente')$q$,
    $q$then 'Ola, ' || split_part(r.dra_nome, ' ', 1) || '!'$q$];
  v_para text[] := array[
    $q$gps.html_esc(coalesce(nullif(btrim(m.tipo_nome), ''), 'sessao'))$q$,
    $q$gps.html_esc(coalesce(nullif(btrim(m.aluno_nome), ''), 'parceiro'))$q$,
    $q$gps.html_esc(coalesce(nullif(btrim(m.cliente_nome), ''), 'cliente'))$q$,
    $q$then 'Ola, ' || gps.html_esc(split_part(r.dra_nome, ' ', 1)) || '!'  -- 330 html_esc$q$];
  v_b    text := $q$if v_link !~ '^https://' then$q$;
  v_badd text := $q$if v_link ~ '["''<>`[:space:]]' then  -- 330 link chars
    raise exception 'O link não pode ter espaço, aspas, crase nem os sinais < e >. Copie de novo o endereço da sala.'
      using errcode = '22023';
  end if;

  $q$;
begin
  if to_regprocedure('gps.html_esc(text)') is null then
    raise exception 'gps.html_esc nao existe -- aplique a 329 antes; ABORTADA';
  end if;

  -- A. resumo diário da doutora
  v_src := pg_get_functiondef('gps.sessao_resumo_dra_enviar()'::regprocedure);
  if position('-- 330 html_esc' in v_src) > 0 then
    raise notice '330 A ja aplicado -- pulado';
  else
    for i in 1 .. array_length(v_de, 1) loop
      v_n := (length(v_src) - length(replace(v_src, v_de[i], ''))) / length(v_de[i]);
      if v_n <> 1 then
        raise exception 'ancora A% casou % vezes (esperado 1) -- ABORTADA', i, v_n;
      end if;
      v_src := replace(v_src, v_de[i], v_para[i]);
    end loop;
    execute v_src;
  end if;

  -- B. link da sala
  v_src := pg_get_functiondef('gps.sessao_link_definir(uuid,text)'::regprocedure);
  if position('-- 330 link chars' in v_src) > 0 then
    raise notice '330 B ja aplicado -- pulado';
  else
    v_n := (length(v_src) - length(replace(v_src, v_b, ''))) / length(v_b);
    if v_n <> 1 then
      raise exception 'ancora B casou % vezes (esperado 1) -- ABORTADA', v_n;
    end if;
    if position(v_b || E'\r\n' in v_src) > 0 then
      v_badd := replace(v_badd, E'\n', E'\r\n');
    end if;
    execute replace(v_src, v_b, v_badd || v_b);
  end if;
end
$mig$;

commit;

-- ============================================================
-- A RODAR NO ENSAIO (mbvybujpkwuorhtdzcde) — nada persiste
-- ============================================================
-- 1. Links já gravados que a regra nova recusaria (não são apagados nem
--    alterados; o escape da 329 os neutraliza no e-mail; a equipe decide):
--    select count(*) as violam, count(link_reuniao) as com_link
--      from gps.sessao_agendamentos where link_reuniao ~ '["''<>`[:space:]]';
--    explain (analyze, buffers)
--    select count(*) from gps.sessao_agendamentos where link_reuniao ~ '["''<>`[:space:]]';
--    (SELECT puro; seq scan esperado, tabela de dezenas de linhas)
-- 2. Bloco abaixo (tirar o "-- "). Cria html_esc se a 329 ainda não está
--    aplicada, remenda os 2 corpos vivos, planta movimento de hoje com
--    cliente hostil, roda o resumo, lê a fila do pg_net, testa a RPC do
--    link como admin e termina em raise: TUDO volta.
--    Esperado: ancoras={1,1,1,1,1}, compilou=true, html_com_img=0,
--    html_com_nome_esc>=1, link_ruim='22023: O link não pode…',
--    link_bom='ok', regra_ruim=true, regra_boa=false.
--
-- do $e$
-- declare
--   v_mal text := '<img src=x>Ana & "Cia" ''x''';
--   v_src text; v_c int[] := '{}'; v_comp boolean := false; v_alvo uuid; v_dra uuid;
--   v_req bigint; v_ms int; v_t0 timestamptz; v_ruim text; v_bom text; v_adm uuid;
--   v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
--   v_de text[] := array[$q$coalesce(nullif(btrim(m.tipo_nome), ''), 'sessao')$q$, $q$coalesce(nullif(btrim(m.aluno_nome), ''), 'parceiro')$q$,
--     $q$coalesce(nullif(btrim(m.cliente_nome), ''), 'cliente')$q$, $q$then 'Ola, ' || split_part(r.dra_nome, ' ', 1) || '!'$q$];
--   v_b text := $q$if v_link !~ '^https://' then$q$;
--   v_rx text := '["''<>`[:space:]]';
-- begin
--   if to_regprocedure('gps.html_esc(text)') is null then
--     execute $x$create function gps.html_esc(p text) returns text language sql immutable parallel safe strict set search_path = '' as $f$ select replace(replace(replace(replace(replace(p, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;') $f$$x$;
--   end if;
--   v_src := pg_get_functiondef('gps.sessao_resumo_dra_enviar()'::regprocedure);
--   for i in 1 .. 4 loop
--     v_c := v_c || (length(v_src) - length(replace(v_src, v_de[i], ''))) / length(v_de[i]);
--     v_src := replace(v_src, v_de[i], 'gps.html_esc(' || v_de[i] || ')');
--   end loop;
--   v_src := replace(v_src, $q$gps.html_esc(then 'Ola, ' || split_part(r.dra_nome, ' ', 1) || '!')$q$,
--                           $q$then 'Ola, ' || gps.html_esc(split_part(r.dra_nome, ' ', 1)) || '!'  -- 330 html_esc$q$);
--   execute v_src;
--   v_src := pg_get_functiondef('gps.sessao_link_definir(uuid,text)'::regprocedure);
--   v_c := v_c || (length(v_src) - length(replace(v_src, v_b, ''))) / length(v_b);
--   execute replace(v_src, v_b, $q$if v_link ~ '["''<>`[:space:]]' then  -- 330 link chars
--     raise exception 'O link não pode ter espaço, aspas, crase nem os sinais < e >. Copie de novo o endereço da sala.'
--       using errcode = '22023';
--   end if;
--   $q$ || v_b);
--   v_comp := true;
--   update gps.config set valor = 'true' where chave = 'sessoes_email_ativo';
--   select a.id, a.responsavel_id into v_alvo, v_dra from gps.sessao_agendamentos a
--    where a.estado = 'agendado' and a.inicio_em > now() + interval '2 hours' order by a.inicio_em limit 1;
--   update gps.etapa1_clientes set nome = v_mal
--    where id = (select cliente_id from gps.sessao_agendamentos where id = v_alvo);
--   update gps.sessao_agendamentos set criado_em = now() where id = v_alvo;
--   delete from gps.sessao_resumo_diario where responsavel_id = v_dra and dia = v_hoje;
--   v_t0 := clock_timestamp();
--   perform gps.sessao_resumo_dra_enviar();
--   v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
--   select request_id into v_req from gps.sessao_resumo_diario where responsavel_id = v_dra and dia = v_hoje;
--   select id into v_adm from public.perfis where status = 'ativo' and cargo in ('dev', 'admin') limit 1;
--   perform set_config('request.jwt.claims', json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
--   begin
--     perform gps.sessao_link_definir(v_alvo, 'https://zoom.us/j/1"><img src=x>');
--     v_ruim := 'ACEITOU';
--   exception when others then v_ruim := sqlstate || ': ' || sqlerrm;
--   end;
--   begin
--     perform gps.sessao_link_definir(v_alvo, 'https://zoom.us/j/123456789?pwd=AbC.d-e_f');
--     v_bom := 'ok';
--   exception when others then v_bom := sqlstate || ': ' || sqlerrm;
--   end;
--   raise exception '%', json_build_object(
--     'ancoras', v_c, 'compilou', v_comp, 'alvo', v_alvo, 'req', v_req, 'ms', v_ms,
--     'html_com_img', (select count(*) from net.http_request_queue q where q.id = v_req
--        and position('<img' in (convert_from(q.body, 'UTF8')::jsonb ->> 'html')) > 0),
--     'html_com_nome_esc', (select count(*) from net.http_request_queue q where q.id = v_req
--        and position(gps.html_esc(v_mal) in (convert_from(q.body, 'UTF8')::jsonb ->> 'html')) > 0),
--     'link_ruim', v_ruim, 'link_bom', v_bom,
--     'regra_ruim', 'https://x.test/a b' ~ v_rx, 'regra_boa', 'https://meet.google.com/abc-defg-hij' ~ v_rx);
-- end
-- $e$;
-- ============================================================
-- SAÍDA DO ENSAIO (01/10/2026, mbvybujpkwuorhtdzcde) — VERDE
-- ============================================================
-- {"ancoras":[1,1,1,1,1],"compilou":true,"alvo":"d925ed31-548a-432e-9410-a072f8b25b03",
--  "req":40218,"ms":170,"html_com_img":0,"html_com_nome_esc":1,
--  "link_ruim":"22023: O link não pode ter espaço, aspas, crase nem os sinais < e >. Copie de novo o endereço da sala.",
--  "link_bom":"ok","regra_ruim":true,"regra_boa":false}
-- Leitura: as 5 âncoras casam 1 vez no corpo vivo; o resumo compila e roda
-- em 170 ms; o <img> do cliente hostil NÃO chega cru ao HTML (0) e chega
-- escapado (1); a RPC do link recusa o hostil com a frase da tela e aceita
-- link Zoom com ?pwd=. Tudo desfeito pelo raise final.
-- ============================================================
-- ============================================================
-- ENSAIO CONJUNTO 325→330 (01/10/2026, mbvybujpkwuorhtdzcde) — VERDE
-- Os 6 corpos rodados 2× numa transação, desfeita por raise final;
-- a 325 sem o `commit; … begin;` (cron.schedule mantido). Claim JWT
-- do Marco injetado só para a leitura de sessao_horarios_livres.
-- ============================================================
-- md5 dos corpos: 325 556bfce8 · 326 4dddd8d2 · 327 34e4f8fc ·
--                 328 752051d6 · 329 66251c67 · 330 1395106f
-- idempotente: true (snap1 = snap2: grade 29, eventos 97, fn md5 8d905f2a)
-- md5 de sessao_disparar_emails após a 327: 82bfe1da593bd90cc27fb8bf3f1306e2
-- tempo: passada 1 = 775 ms · passada 2 = 133 ms · disparo = 167 ms
-- net.http_request_queue antes/depois das migrations: 0 / 0
-- tipos: EP id 1 = 40 min ativo · RP id 2 = 150 min ativo
-- EP oferecida 06/10–01/12: 205 horários, 1 pessoa (Marco), 40 min,
--   09:00 11:00 14:00 15:00 16:00
-- RP oferecida no mesmo período: 30 horários, só Cristiane, 150 min
-- gcal_espelho_config: service_role true · anon false · authenticated false;
--   service_role em gps.config: false; devolve só gcal_espelho_ativo=false
--   e gcal_calendar_id=''
-- cliente hostil no e-mail: html_com_img 0 · html_com_nome_esc 1
-- marcadores 329/330: disparo 1 · resumo 1 · link 1
-- ============================================================
