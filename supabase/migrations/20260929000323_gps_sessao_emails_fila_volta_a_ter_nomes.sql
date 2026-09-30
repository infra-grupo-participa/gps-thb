-- ═══════════════════════════════════════════════════════════════════════════
-- Os e-mails de sessão voltam a sair (cron 42 `sessao-emails` parado desde
-- 22/09/2026 21:50 UTC — zero e-mail de sessão enviado desde então).
--
-- ── CAUSA ──────────────────────────────────────────────────────────────────
-- A …300 (`gps_sessao_resumo_dra_parte1_tabela_e_fila`, aplicada 21:45:12 UTC)
-- removeu da CTE `fila` o ramo `agendou_dra`. Era o PRIMEIRO ramo do
-- `union all` e o ÚNICO com `as gatilho / as col_em / as col_req / as publico`.
-- Em `union`, os nomes das colunas vêm do primeiro ramo: o novo primeiro ramo
-- (`agendou_aluno`) não tinha alias, as colunas viraram `?column?` e
-- `f.gatilho` deixou de existir. PL/pgSQL só analisa a query ao EXECUTAR — o
-- `create function` passou, as checagens textuais da …300 passaram, e a
-- função quebrou na 1ª passada do cron. O alarme `sessao_verificar_saude_envio`
-- roda DENTRO da função quebrada, então morreu junto: 7 dias sem aviso.
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
-- Só o primeiro ramo da fila ganha os 4 aliases (com ::text). Nada mais.
-- Reescrita ancorada no corpo vivo (md5 abaixo); se o corpo mudou, ABORTA.
--
-- ── REPRESAMENTO: NÃO HÁ ───────────────────────────────────────────────────
-- A fila já é auto-limitada por janela em todos os 6 ramos:
--   agendou_aluno / cancel_aluno → só o que aconteceu nas últimas 24 h
--   24h_dra / 24h_aluno          → só sessão entre 23 h e 24 h à frente
--   1h_dra / 1h_aluno            → só sessão na próxima 1 h
-- O que se perdeu no período (8 e-mails, 4 sessões) está fora de todas as
-- janelas e NÃO sai. Teto de 8 por passada + pg_sleep(0.15) intactos
-- (< 10 req/s da Resend).
--
-- ── PROVAS (saída literal, produção, 29/09/2026) ───────────────────────────
--
-- P1. Corpo vivo e âncora:
--   select md5(pg_get_functiondef('gps.sessao_disparar_emails()'::regprocedure)) md5_vivo,
--          <ocorrências da âncora v_de no corpo> ancora,
--          <chaves de gps.config> cfg;
--   → [{"md5_vivo":"bae5b234bf970da261846e3a4654aea4","ancora":1,
--       "cfg":"chamados_email_fallback=<preenchido>; sessoes_email_ativo=true"}]
--   (tabela gps.config, colunas chave/valor/atualizado_em/atualizado_por;
--    chave 'sessoes_email_ativo' existe, 1 linha)
--
-- P2. Falhas do cron desde a quebra:
--   select status, return_message, count(*) from cron.job_run_details
--    where jobid=42 and start_time >= '2026-09-22 21:50' group by 1,2;
--   → [{"status":"failed","return_message":"ERROR:  column f.gatilho does not exist\nLINE 34:     select ","count":2052}]
--   (return_message truncado em 60 caracteres na consulta; é uma mensagem só.
--    Último sucesso: 2026-09-22 21:45:00.145782+00.)
--
-- P3. Ensaios (um `do` desfeito por raise; lock_timeout 3s, statement_timeout
--     20s; função corrigida + `update gps.config set valor='true' where
--     chave='sessoes_email_ativo'` antes de chamar):
--   E1 = fila real de hoje, sem plantar nada.
--   E2 = prova não-vácua: a sessão futura d925ed31 recebe criado_em = now()
--        (vira "recém-marcada" → gatilho agendou_aluno).
--   → ERROR: P0001: E1 enviaria=0 queue 0->0 ms=37 | E2 enviaria=1 tipos=agendou_aluno queue 0->1 ms_total=232
--   (queue = count(*) de net.http_request_queue antes -> depois)
--   Depois do rollback: md5 do corpo vivo = bae5b234bf970da261846e3a4654aea4,
--   criado_em da d925ed31 = 2026-09-25 14:19:19.403224+00, net.http_request_queue = 0.
--
-- P4. Reensaio da guarda do interruptor (mesmo bloco deste arquivo, dentro de
--     um `do` desfeito por raise; interruptor posto em 'false' ANTES, para
--     provar que a subtransação o liga, executa e devolve):
--   → ERROR: P0001: REENSAIO ok=t queue_dentro 0->1 queue_depois_subtx=0 ativo_depois_subtx=false novo_md5=2754d62c137fcb73a6bae7036cd2328c ms=197
--   O "1" vem do MESMO plantio do E2 (d925ed31 com criado_em = now() dentro
--   da subtransação → agendou_aluno); sem plantio a fila real de hoje dá 0.
--   ok=t: o P0099 foi capturado. A fila do pg_net subiu a 1 DENTRO da
--   subtransação e voltou a 0 fora dela; o interruptor voltou ao valor de
--   antes. md5 do corpo DEPOIS de aplicar: 2754d62c137fcb73a6bae7036cd2328c.
--   Depois do rollback externo: md5 vivo = bae5b234…, ativo = 'true', fila = 0.
--
-- one-shot: depois do apply o md5 vivo é 2754d62c137fcb73a6bae7036cd2328c;
-- reaplicar aborta na guarda (esperado).
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
-- Desligar: gps.config.sessoes_email_ativo = 'false'. Não há estado novo.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $mig$
declare
  v_src  text;
  v_novo text;
  v_de   text := $q$select a.id, 'agendou_aluno', 'email_agendou_aluno_em', 'email_agendou_aluno_req', 'aluno'$q$;
  v_para text := $q$select a.id, 'agendou_aluno'::text as gatilho, 'email_agendou_aluno_em'::text as col_em, 'email_agendou_aluno_req'::text as col_req, 'aluno'::text as publico$q$;
  v_n    int;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'sessao_disparar_emails';

  if v_src is null then
    raise exception 'gps.sessao_disparar_emails nao existe -- ABORTADA';
  end if;
  if md5(v_src) <> 'bae5b234bf970da261846e3a4654aea4' then
    raise exception 'corpo vivo mudou (md5 %) -- ABORTADA sem aplicar', md5(v_src);
  end if;

  v_n := (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de);
  if v_n <> 1 then
    raise exception 'ancora do 1o ramo casou % vezes (esperado 1) -- ABORTADA', v_n;
  end if;

  v_novo := replace(v_src, v_de, v_para);
  execute v_novo;

  -- 🔑 Prova que a QUERY roda (não só que a função compila — foi isso que
  -- deixou a …300 passar). Executa a função numa subtransação e desfaz:
  -- interruptor, carimbos e o INSERT na fila do pg_net voltam junto, nada é
  -- enviado. O interruptor é forçado a 'true' porque, desligado, a função
  -- retorna antes da CTE e o ensaio seria vazio.
  begin
    update gps.config set valor = 'true' where chave = 'sessoes_email_ativo';
    if not found then
      raise exception 'chave sessoes_email_ativo ausente em gps.config -- ensaio seria vazio; ABORTADA';
    end if;
    perform count(*) from gps.sessao_disparar_emails();
    raise exception using errcode = 'P0099', message = 'ensaio_ok';
  exception
    when sqlstate 'P0099' then null;  -- ensaio passou, subtransação desfeita
  end;
end $mig$;
