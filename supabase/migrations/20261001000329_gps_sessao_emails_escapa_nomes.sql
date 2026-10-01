-- ============================================================
-- 329 — gps.html_esc / gps.html_desesc + escape em gps.sessao_disparar_emails
-- ============================================================
-- Reescrita após reprovação do pentest (01/10/2026): a versão anterior
-- escapava só & < > nos 4 nomes; ficavam abertos o "Olá" (split_part cru), o
-- link no href e as aspas. O nome do cliente é escrito pelo aluno.
-- COBRE (todos os ramos de sessao_disparar_emails):
--   E1 4 nomes por gps.html_esc após o coalesce · E2/E3 primeiro nome do Olá
--   E4/E5 link_reuniao no href e no texto do <a> · E6/E7 versão texto: tira
--   as tags e DEPOIS desfaz entidades · E8 assunto desfaz entidades.
-- NÃO COBRE: resumo da doutora e recusa de caractere no link (330); e-mails
--   do Plantão (…222: a.nome e mentora_nome crus) — pendência registrada.
--   Motivo da remarcação (327) mantém o escape próprio (& < >, nó de texto).
-- Depois da 327 (guarda remarcou_aluno). 329 ANTIGA no corpo vivo
-- ('-- 329 escape') → o bloco dela sai (casado =1). Marcador '-- 329 html_esc'
-- → pula. Reversão: corpo da 293 + remendos 323/327.
-- ============================================================

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

create or replace function gps.html_esc(p text) returns text
language sql immutable parallel safe strict
set search_path = ''
as $f$ select replace(replace(replace(replace(replace(p, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;') $f$;

create or replace function gps.html_desesc(p text) returns text
language sql immutable parallel safe strict
set search_path = ''
as $f$ select replace(replace(replace(replace(replace(p, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&') $f$;

-- Nasce executável por PUBLIC. Chamadoras são SECURITY DEFINER (dono
-- postgres): nenhum grant extra.
revoke all on function gps.html_esc(text)    from public, anon, authenticated;
revoke all on function gps.html_desesc(text) from public, anon, authenticated;

comment on function gps.html_esc(text) is
  'Escapa para HTML (texto e atributo entre aspas): & primeiro, depois < > " ''.';
comment on function gps.html_desesc(text) is
  'Inverso de html_esc, para versão texto e assunto: &lt; &gt; &quot; &#39; e &amp; por último.';

do $mig$
declare
  v_src  text;
  v_novo text;
  v_nl   text;
  v_n    int;
  v_e1   text := $q$v_tipo_nm  := coalesce(nullif(btrim(coalesce(r.tipo_nome,    '')), ''), 'sessão');$q$;
  v_old  text := '\r?\n    -- 329 escape:[^\r\n]*(\r?\n    v_(aluno|dra|cli|tipo)_nm +:= replace\(replace\(replace\([^\r\n]*){4}';
  v_de   text[] := array[
    $q$split_part(btrim(r.dra_nome),' ',1)$q$,
    $q$split_part(btrim(r.aluno_nome),' ',1)$q$,
    $q$<a href="' || r.link_reuniao ||$q$,
    $q$|| r.link_reuniao || '</a></p>'$q$,
    $q$v_texto := v_ola || E'\n\n'$q$,
    $q$regexp_replace(v_frase, '<[^>]+>', '', 'g')$q$,
    $q$'subject', v_assunto,$q$];
  v_para text[] := array[
    $q$gps.html_esc(split_part(btrim(r.dra_nome),' ',1))$q$,
    $q$gps.html_esc(split_part(btrim(r.aluno_nome),' ',1))$q$,
    $q$<a href="' || gps.html_esc(r.link_reuniao) ||$q$,
    $q$|| gps.html_esc(r.link_reuniao) || '</a></p>'$q$,
    $q$v_texto := gps.html_desesc(v_ola) || E'\n\n'$q$,
    $q$gps.html_desesc(regexp_replace(v_frase, '<[^>]+>', '', 'g'))$q$,
    $q$'subject', gps.html_desesc(v_assunto),$q$];
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'sessao_disparar_emails';

  if v_src is null then
    raise exception 'gps.sessao_disparar_emails nao existe -- ABORTADA';
  end if;
  if position('-- 329 html_esc' in v_src) > 0 then
    raise notice '329 ja aplicada (marcador html_esc) -- pulada';
    return;
  end if;
  if position('remarcou_aluno' in v_src) = 0 then
    raise exception 'sem remarcou_aluno -- aplique a 327 antes; ABORTADA';
  end if;

  v_n := (length(v_src) - length(replace(v_src, v_e1, ''))) / length(v_e1);
  if v_n <> 1 then
    raise exception 'ancora E1 casou % vezes (esperado 1) -- ABORTADA', v_n;
  end if;
  v_nl := case when position(v_e1 || E'\r\n' in v_src) > 0 then E'\r\n' else E'\n' end;

  if position('-- 329 escape' in v_src) > 0 then
    select count(*) into v_n from regexp_matches(v_src, v_old, 'g');
    if v_n <> 1 then
      raise exception 'bloco da 329 antiga casou % vezes (esperado 1) -- ABORTADA', v_n;
    end if;
    v_src := regexp_replace(v_src, v_old, '');
  end if;

  v_novo := replace(v_src, v_e1, v_e1 || v_nl
    || '    -- 329 html_esc: nomes vão ao HTML; o do cliente é escrito pelo aluno.' || v_nl
    || '    v_aluno_nm := gps.html_esc(v_aluno_nm);' || v_nl
    || '    v_dra_nm   := gps.html_esc(v_dra_nm);' || v_nl
    || '    v_cli_nm   := gps.html_esc(v_cli_nm);' || v_nl
    || '    v_tipo_nm  := gps.html_esc(v_tipo_nm);');

  for i in 1 .. array_length(v_de, 1) loop
    v_n := (length(v_novo) - length(replace(v_novo, v_de[i], ''))) / length(v_de[i]);
    if v_n <> 1 then
      raise exception 'ancora E% casou % vezes (esperado 1) -- ABORTADA', i + 1, v_n;
    end if;
    v_novo := replace(v_novo, v_de[i], v_para[i]);
  end loop;

  execute v_novo;
  raise notice '329: html_esc aplicado em sessao_disparar_emails';
end
$mig$;

commit;

-- ============================================================
-- A RODAR NO ENSAIO (mbvybujpkwuorhtdzcde) — nada persiste
-- ============================================================
-- Tirar o "-- " das linhas do bloco. Aplica o remendo sobre o corpo vivo,
-- planta sessão remarcada + recém-marcada com cliente de nome hostil,
-- dispara, lê o corpo na fila do pg_net e termina em raise: TUDO volta.
-- Esperado: ancoras todas 1 (um -1 a mais = 329 antiga retirada),
-- compilou=true, dono=true, anon=false, auth=false, ida_volta=true,
-- esc='&lt;img src=x&gt;Ana &amp; &quot;Cia&quot; &#39;x&#39;', href_esc=2,
-- html_com_img=0, html_com_nome_esc>=1, texto_com_nome_cru>=1.
-- O ramo 1h (único com link) não é plantável (inicio_em gerado + exclusão
-- gist): o href é provado no TEXTO do corpo novo (href_esc).
--
-- do $e$
-- declare
--   v_mal text := '<img src=x>Ana & "Cia" ''x''';
--   v_src text; v_novo text; v_nl text; v_alvo uuid; v_reqs bigint[]; v_tipos text;
--   v_t0 timestamptz; v_ms int; v_comp boolean := false; v_c int[] := '{}'; v_n int;
--   v_e1 text := $q$v_tipo_nm  := coalesce(nullif(btrim(coalesce(r.tipo_nome,    '')), ''), 'sessão');$q$;
--   v_old text := '\r?\n    -- 329 escape:[^\r\n]*(\r?\n    v_(aluno|dra|cli|tipo)_nm +:= replace\(replace\(replace\([^\r\n]*){4}';
--   v_de text[] := array[$q$split_part(btrim(r.dra_nome),' ',1)$q$, $q$split_part(btrim(r.aluno_nome),' ',1)$q$,
--     $q$<a href="' || r.link_reuniao ||$q$, $q$|| r.link_reuniao || '</a></p>'$q$, $q$v_texto := v_ola || E'\n\n'$q$,
--     $q$regexp_replace(v_frase, '<[^>]+>', '', 'g')$q$, $q$'subject', v_assunto,$q$];
--   v_para text[] := array[$q$gps.html_esc(split_part(btrim(r.dra_nome),' ',1))$q$, $q$gps.html_esc(split_part(btrim(r.aluno_nome),' ',1))$q$,
--     $q$<a href="' || gps.html_esc(r.link_reuniao) ||$q$, $q$|| gps.html_esc(r.link_reuniao) || '</a></p>'$q$,
--     $q$v_texto := gps.html_desesc(v_ola) || E'\n\n'$q$, $q$gps.html_desesc(regexp_replace(v_frase, '<[^>]+>', '', 'g'))$q$,
--     $q$'subject', gps.html_desesc(v_assunto),$q$];
-- begin
--   execute $x$create or replace function gps.html_esc(p text) returns text language sql immutable parallel safe strict set search_path = '' as $f$ select replace(replace(replace(replace(replace(p, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;') $f$$x$;
--   execute $x$create or replace function gps.html_desesc(p text) returns text language sql immutable parallel safe strict set search_path = '' as $f$ select replace(replace(replace(replace(replace(p, '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&') $f$$x$;
--   revoke all on function gps.html_esc(text) from public, anon, authenticated;
--   revoke all on function gps.html_desesc(text) from public, anon, authenticated;
--   v_src := pg_get_functiondef('gps.sessao_disparar_emails()'::regprocedure);
--   v_c := v_c || (length(v_src) - length(replace(v_src, v_e1, ''))) / length(v_e1);
--   v_nl := case when position(v_e1 || E'\r\n' in v_src) > 0 then E'\r\n' else E'\n' end;
--   if position('-- 329 escape' in v_src) > 0 then
--     select count(*) into v_n from regexp_matches(v_src, v_old, 'g');
--     v_c := v_c || -v_n;  v_src := regexp_replace(v_src, v_old, '');
--   end if;
--   v_novo := replace(v_src, v_e1, v_e1 || v_nl || '    -- 329 html_esc' || v_nl
--     || '    v_aluno_nm := gps.html_esc(v_aluno_nm);' || v_nl || '    v_dra_nm   := gps.html_esc(v_dra_nm);' || v_nl
--     || '    v_cli_nm   := gps.html_esc(v_cli_nm);' || v_nl || '    v_tipo_nm  := gps.html_esc(v_tipo_nm);');
--   for i in 1 .. 7 loop
--     v_c := v_c || (length(v_novo) - length(replace(v_novo, v_de[i], ''))) / length(v_de[i]);
--     v_novo := replace(v_novo, v_de[i], v_para[i]);
--   end loop;
--   if (select bool_and(abs(x) = 1) from unnest(v_c) x) then execute v_novo; v_comp := true; end if;
--   update gps.config set valor = 'true' where chave = 'sessoes_email_ativo';
--   select a.id into v_alvo from gps.sessao_agendamentos a
--    where a.estado = 'agendado' and a.inicio_em > now() + interval '2 hours' order by a.inicio_em limit 1;
--   update gps.etapa1_clientes set nome = v_mal
--    where id = (select cliente_id from gps.sessao_agendamentos where id = v_alvo);
--   -- (as colunas remarcado_* só existem depois da 327: o ensaio foi rodado
--   --  ANTES dela e planta só a sessão recém-marcada)
--   update gps.sessao_agendamentos
--      set criado_em = now(), email_agendou_dra_em = null, email_agendou_aluno_em = null
--    where id = v_alvo;
--   if v_comp then
--     v_t0 := clock_timestamp();
--     select array_agg(d.request_id), string_agg(d.tipo, ',') into v_reqs, v_tipos from gps.sessao_disparar_emails() d;
--     v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
--   end if;
--   raise exception '%', json_build_object(
--     'ancoras', v_c, 'nl_crlf', v_nl = E'\r\n', 'compilou', v_comp,
--     'href_esc', (length(v_novo) - length(replace(v_novo, 'gps.html_esc(r.link_reuniao)', ''))) / 28,
--     'esc', gps.html_esc(v_mal), 'ida_volta', gps.html_desesc(gps.html_esc(v_mal)) = v_mal,
--     'anon', has_function_privilege('anon', 'gps.html_esc(text)', 'execute'),
--     'auth', has_function_privilege('authenticated', 'gps.html_esc(text)', 'execute'),
--     'dono', has_function_privilege((select proowner::regrole::text from pg_proc
--               where oid = 'gps.sessao_disparar_emails()'::regprocedure), 'gps.html_esc(text)', 'execute'),
--     'alvo', v_alvo, 'tipos', v_tipos, 'ms', v_ms,
--     'html_com_img', (select count(*) from net.http_request_queue q where q.id = any(v_reqs)
--        and position('<img' in (convert_from(q.body, 'UTF8')::jsonb ->> 'html')) > 0),
--     'html_com_nome_esc', (select count(*) from net.http_request_queue q where q.id = any(v_reqs)
--        and position(gps.html_esc(v_mal) in (convert_from(q.body, 'UTF8')::jsonb ->> 'html')) > 0),
--     'texto_com_nome_cru', (select count(*) from net.http_request_queue q where q.id = any(v_reqs)
--        and position(v_mal in (convert_from(q.body, 'UTF8')::jsonb ->> 'text')) > 0));
-- end
-- $e$;
--
-- ── SAÍDA DO ENSAIO (01/10/2026, corpo vivo PRÉ-327) ─────────────────────
--   1ª rodada: âncoras [1,0,0,0,…] → o corpo vivo escreve
--   split_part(btrim(r.dra_nome),' ',1) sem espaço e o href vem depois de
--   'Sala da reunião: '. Âncoras E2/E3/E4 corrigidas; 2ª rodada:
--   ancoras=[1,1,1,1,1,1,1,1] · nl_crlf=false · compilou=true · href_esc=2
--   tipos=agendou_aluno (1 request, 243 ms a função inteira)
--   html_com_img=0 · html_com_nome_esc=1 · texto_com_nome_cru=1
--   assunto="Sessão confirmada — 02/10/2026 às 09:30"
--   html_esc anon=false auth=false dono=true; ida_volta=true
--   O ramo remarcou_aluno não foi plantado (precisa da 327 aplicada): ele
--   usa v_*_nm, que o E1 já escapa.
-- ============================================================
