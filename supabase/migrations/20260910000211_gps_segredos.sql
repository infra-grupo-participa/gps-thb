-- ⚠️⚠️ ESCRITA E **NÃO APLICADA**. Depende de decisão do João (B-K1). ⚠️⚠️
--
-- Tira `resend_api_key` e `email_from` de `gps.config` para `gps.segredos`
-- (RLS ligada, ZERO policy) e aponta para lá as funções do Plantão que as leem.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O FURO (pré-existente, MÉDIO, medido em 10/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--   `gps.config` tem policy única `gps_config_admin [ALL]` e
--   `grant select, insert, update ... to authenticated`. Logo, QUALQUER UM DOS
--   16 ADMINS lê a chave da Resend pela REST:
--     GET /rest/v1/config?chave=eq.resend_api_key   (schema gps)
--   Não é escalada de privilégio dentro do GPS — é uma credencial de terceiro
--   (a Resend, que manda e-mail em nome do domínio do grupo) legível por 16
--   pessoas e por qualquer token de admin que vaze. A chave foi para
--   `gps.config` em 09/09 por uma razão boa: `pg_get_functiondef` é legível
--   por quem tem `postgres`, e embutir a chave no corpo da função a vazaria
--   junto com o código. A tabela resolveu o problema errado.
--
--   `gps.segredos` resolve os dois: fica FORA do corpo das funções E fora do
--   alcance da REST. Molde: `public.perfis_backup_limpeza_20260731` (RLS
--   ligada, sem policy — ninguém lê pela API) e `gps.aluno_eventos` (escrita
--   só por SECURITY DEFINER).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE NÃO É APLICADA JUNTO COM O RESTO DA RODADA
-- ═══════════════════════════════════════════════════════════════════════════
--   Ela toca o caminho de e-mail do Plantão, que roda SOZINHO por `pg_cron`
--   (`plantao-emails-sala`, de 5 em 5 min) e que em 09/09 já perdeu 11 de 20
--   e-mails em silêncio. Se a leitura da chave quebrar, o sintoma é
--   exatamente o mesmo do incidente: o cron reporta sucesso e ninguém recebe
--   e-mail. É dívida PRÉ-EXISTENTE — não vale arriscar o produto que está no
--   ar no mesmo push de uma feature nova. A migração fica pronta para o João
--   decidir a janela.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE TESTAR ANTES DE APLICAR (roteiro obrigatório)
-- ═══════════════════════════════════════════════════════════════════════════
--   1. `select chave from gps.config;` — confirmar que `resend_api_key` e
--      `email_from` ESTÃO lá e com valor não vazio.
--   2. Listar quem lê as duas chaves HOJE (a migração se apoia nesta lista):
--        select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--         where n.nspname='gps' and (p.prosrc like '%resend_api_key%'
--                                 or p.prosrc like '%''email_from''%');
--      Esperado em 10/09/2026: as funções de e-mail do Plantão
--      (gps.plantao_disparar_emails_sala, gps.plantao_disparar_nps,
--      gps.plantao_alarme_falha_envio e as demais das migrações ...170 a ...186).
--   3. APLICAR fora do horário de plantão e com o cron do plantão pausado:
--        select cron.unschedule('plantao-emails-sala');
--   4. Disparo de teste com `rollback` NÃO serve (net.http_post é assíncrono e
--      não volta atrás). Testar com um slot de mentira num horário sem
--      plantão real, e conferir o destinatário na API da Resend
--      (`GET /emails/{id}` devolve `to` e `last_event`) — a lição de 09/09:
--      o cron dizia `succeeded, 20 rows` com 11 e-mails perdidos.
--   5. Reagendar o cron e conferir `cron.job`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- COMO A REESCRITA DAS FUNÇÕES É FEITA (e por que assim)
-- ═══════════════════════════════════════════════════════════════════════════
--   As funções do Plantão são grandes e foram redefinidas várias vezes
--   (...170, ...173, ...174, ...176, ...186). Copiar o texto de um ARQUIVO
--   aqui seria partir de um corpo que pode não ser o vigente — o erro que
--   deixou `admin_adotar_login_existente` quebrada por 15 dias. Esta migração
--   parte do CORPO VIGENTE NO CATÁLOGO (`pg_get_functiondef`) e troca só o
--   nome da tabela na leitura das duas chaves. Se a troca não render nenhuma
--   mudança, ou se sobrar alguma função lendo `gps.config` para essas chaves
--   depois, a migração ABORTA e nada é aplicado.
--   `create or replace` (não `drop`): preserva as ACLs de cada função.
--
-- O QUE NÃO FAZ
--   * não apaga `gps.config` nem nenhuma outra chave dela (o interruptor
--     `chamados_aberto`, `chamados_email_equipe`, `chamados_email_fallback`,
--     `plantao_inscricao_aberta` e `slack_mencoes_ativo` continuam lá — nenhum
--     deles é segredo);
--   * não toca `gps.chamados_email_fallback()`, que lê uma chave que não é
--     segredo;
--   * não muda o conteúdo de nenhum e-mail;
--   * não concede nada a `anon` nem a `authenticated`.
--
-- REVERSÃO (nesta ordem, em UMA transação):
--   insert into gps.config (chave, valor)
--     select chave, valor from gps.segredos on conflict (chave) do update set valor = excluded.valor;
--   -- e desfazer a reescrita trocando 'gps.segredos' de volta por 'gps.config'
--   -- (o mesmo DO block, com os nomes invertidos);
--   drop table gps.segredos;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists gps.segredos (
  chave          text primary key check (length(chave) between 1 and 64),
  valor          text not null check (length(valor) <= 4000 and valor !~ '[\r\n]'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

comment on table gps.segredos is
  'Credenciais que funcoes SECURITY DEFINER precisam ler e que NINGUEM pode ler pela API. RLS ligada e ZERO policy: sem policy, o RLS nega para todo mundo, inclusive admin. Revoke de anon e authenticated por cima. Quem le e o DONO da funcao (postgres), de dentro de SECURITY DEFINER -- e por isso o valor nao aparece em pg_get_functiondef, que foi a razao de as chaves terem ido para gps.config em 09/09. gps.config continua sendo a unica tabela de CONFIGURACAO; segredo nao e configuracao.';
comment on column gps.segredos.valor is
  'Proibido CR/LF (injecao de cabecalho de e-mail) e limitado a 4000 caracteres.';

alter table gps.segredos enable row level security;
-- NENHUMA policy, de propósito. Sem policy, o RLS nega tudo — inclusive para
-- `gp_is_admin()`. É a diferença inteira em relação a `gps.config`.

revoke all on gps.segredos from anon, authenticated, public;

drop trigger if exists trg_segredos_atualizado_em on gps.segredos;
create trigger trg_segredos_atualizado_em
  before update on gps.segredos
  for each row execute function gps.touch_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Move as duas chaves (aborta se não estiverem onde se espera)
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare v_qtd integer;
begin
  select count(*) into v_qtd
    from gps.config c
   where c.chave in ('resend_api_key','email_from')
     and coalesce(btrim(c.valor), '') <> '';

  if v_qtd <> 2 then
    raise exception
      'gps.config nao tem as DUAS chaves (resend_api_key, email_from) preenchidas -- achei %. Migracao abortada: mover uma chave vazia deixaria o e-mail do Plantao sem credencial e o cron reportaria sucesso mesmo assim.', v_qtd;
  end if;

  insert into gps.segredos (chave, valor)
  select c.chave, c.valor from gps.config c
   where c.chave in ('resend_api_key','email_from')
  on conflict (chave) do update set valor = excluded.valor;

  delete from gps.config c where c.chave in ('resend_api_key','email_from');
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Reescreve as leitoras A PARTIR DO CORPO VIGENTE
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  r        record;
  v_def    text;
  v_novo   text;
  v_qtd    integer := 0;
  v_sobrou integer;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'gps'
       and (p.prosrc like '%resend_api_key%' or p.prosrc like '%''email_from''%')
  loop
    v_def := pg_get_functiondef(r.oid);

    -- Troca SÓ a tabela na leitura das duas chaves. `\s+` cobre as variações
    -- de espaçamento que existem entre as migrações ...170 e ...186.
    v_novo := regexp_replace(v_def,
      'gps\.config(\s+where\s+chave\s*=\s*''(resend_api_key|email_from)'')',
      'gps.segredos\1', 'gi');

    if v_novo is distinct from v_def then
      execute v_novo;
      v_qtd := v_qtd + 1;
      raise notice 'gps.% reescrita para ler gps.segredos', r.proname;
    end if;
  end loop;

  if v_qtd = 0 then
    raise exception
      'nenhuma funcao foi reescrita -- o padrao de leitura mudou desde 10/09/2026. Migracao abortada ANTES de deixar o e-mail do Plantao sem credencial.';
  end if;

  -- Trava final: ninguém pode ter sobrado lendo gps.config para essas chaves.
  select count(*) into v_sobrou
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps'
     and p.prosrc ~ 'gps\.config\s+where\s+chave\s*=\s*''(resend_api_key|email_from)''';

  if v_sobrou > 0 then
    raise exception
      '% funcao(oes) continuam lendo gps.config para resend_api_key/email_from depois da reescrita -- migracao abortada', v_sobrou;
  end if;

  raise notice '% funcao(oes) reescritas', v_qtd;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA (depois de aplicar; nada aqui escreve)
-- ─────────────────────────────────────────────────────────────────────────
-- 1) A chave saiu do alcance da REST:
--    select chave from gps.config;                 -- SEM resend_api_key/email_from
--    select has_table_privilege('authenticated','gps.segredos','select');  -- false
--    select count(*) from pg_policy where polrelid = 'gps.segredos'::regclass;  -- 0
-- 2) E continua legível de dentro do DEFINER:
--    select length(valor) > 0 from gps.segredos where chave = 'resend_api_key';
--    -- (rodar como `postgres`; com JWT de admin isto tem de voltar VAZIO)
-- 3) O e-mail do Plantão volta a sair: passo 4 do roteiro do cabeçalho.
