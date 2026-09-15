-- Tela de interruptores em /admin (fatia 1 da esteira, 15/09/2026).
--
-- MOTIVAÇÃO: hoje os interruptores de `gps.config` só se ligam/desligam por
-- SQL direto no banco — botões de pânico inacessíveis no pânico, e nenhuma
-- mudança deixa rastro de autor (`update` por SQL não passa por
-- `gps.acessos_log`). Esta migração cria a ÚNICA porta de ESCRITA em
-- `gps.config` para o painel: `gps.config_definir(chave, valor)`, com
-- allowlist NO BANCO (defesa em profundidade — a allowlist já existe no
-- TypeScript, em `src/lib/config-tipos.ts`, mas Server Action é endpoint
-- HTTP) e trilha em `gps.acessos_log`. 11 chaves booleanas — inclusive
-- `entrada_codigo_ativa`, o botão de pânico literal do evento de acessos de
-- 10/09/2026 ("DESLIGAR SEM DEPLOY, quando o evento acabar",
-- `src/app/entrar/actions.ts`), hoje só desligável por `update` direto.
--
-- 🔴 A allowlist aqui e a de `INTERRUPTORES_CONFIG` (TS) precisam ter as
-- MESMAS chaves. Acrescentar uma só de um lado deixa: (a) só no TS — a tela
-- oferece um interruptor que a RPC recusa; (b) só no banco — um interruptor
-- alcançável apenas por quem chama o PostgREST direto, nunca pela tela.
--
-- REVERSÃO:
--   drop function gps.config_definir(text, text);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CHECK de gps.acessos_log.acao — soma 'interruptor_alterado'
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Acha o CHECK pelo CONTEÚDO ('socio_cadastro_preenchido', o valor mais
-- recente que a …256 acrescentou), NUNCA pelo nome. Mesma técnica das
-- …092/…150/…200/…244/…256. O `insert` em acessos_log é o ÚLTIMO passo da
-- RPC da seção 2 — sem este CHECK aceitando o valor novo, a transação
-- inteira reverteria DEPOIS de já ter gravado a mudança do interruptor (o
-- mesmo modo de falha que deixou admin_adotar_login_existente quebrada por
-- 15 dias).
--
-- 🔴 LIDO DO BANCO em 15/09/2026 antes de escrever esta migração
-- (select pg_get_constraintdef(oid) from pg_constraint where
--  conrelid='gps.acessos_log'::regclass and contype='c') — 23 valores
-- vigentes, o mesmo conjunto que a …256 deixou. Nenhuma migração entre
-- …256 e esta mexeu no CHECK.

do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'acessos_log'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%socio_cadastro_preenchido%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO socio_cadastro_preenchido, da migracao ...256) -- migracao abortada para nao deixar gps.config_definir gravando uma acao que a constraint rejeita. Leia o CHECK vigente no banco (select pg_get_constraintdef(oid) from pg_constraint where conname=...) antes de reescrever esta lista.';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA vigente em 15/09/2026 (23 valores da …256) + 1 novo desta
-- migração = 24.
alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    -- ── Central de resolução (09/09/2026, migrações ...152 a ...157) ──
    'etapa_liberacao_alterada',
    'progresso_reaberto',
    'membro_pessoa_vinculada',
    'titular_trocado',
    'membro_movido',
    'financeiro_vinculado',
    'financeiro_desvinculado',
    -- ── Mega feature: onboarding e trava do favorito (10/09/2026) ──
    'favorito_confirmado',
    'favorito_liberado',
    'acessos_criados_em_lote',
    -- ── Equipe: autosserviço de convite de sócio (11/09/2026) ──
    'socio_convidado',
    'socio_convite_aceito',
    'socio_convite_revogado',
    -- ── Chamados, troca de e-mail e export (migrações posteriores à ...244) ──
    'chamado_solicitacao_aprovada',
    'chamado_solicitacao_declinada',
    'email_login_alterado',
    'clientes_exportados',
    -- ── Onboarding obrigatório do sócio convidado (15/09/2026) ──
    'socio_cadastro_preenchido',
    -- ── Tela de interruptores em /admin (15/09/2026) ──
    'interruptor_alterado'
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 5 do baseline; 7 da Central (...150); 3 da mega feature (...200); 3 da feature Equipe (...244); 4 posteriores (chamados, email_login_alterado, clientes_exportados); 1 do onboarding obrigatorio do socio (...256); 1 da tela de interruptores (...260): interruptor_alterado. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes -- reescrever a lista de memoria apaga valores em silencio.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.config_definir — a ÚNICA porta de ESCRITA em gps.config pelo painel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 Allowlist FECHADA no banco: as 11 chaves booleanas medidas em
-- gps.config em 15/09/2026 (ver INTERRUPTORES_CONFIG,
-- src/lib/config-tipos.ts). QUALQUER outra chave é recusada — inclusive
-- `resend_api_key` e `resgate_codigo`, que são credencial, não interruptor.
--
-- p_valor só aceita 'true'/'false': a tabela é `chave text, valor text`
-- (sem CHECK de forma), então sem esta trava a RPC aceitaria qualquer texto
-- na MESMA chave que os cron/RPCs leem como booleano por
-- `coalesce(valor,'true') <> 'false'` — um valor como 'talvez' seria lido
-- como "ligado" em todo lugar.

create or replace function gps.config_definir(p_chave text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_chave is null or p_chave not in (
    'chamados_aberto',
    'chamados_categorias_ativo',
    'convite_socio_ativo',
    'entrada_codigo_ativa',
    'plantao_inscricao_aberta',
    'resgate_ativo',
    'slack_mencoes_ativo',
    'socio_cadastro_obrigatorio',
    'troca_email_login_ativa',
    'tutoriais_ativo',
    'videos_ativo'
  ) then
    raise exception 'Este interruptor não existe.' using errcode = '22023';
  end if;

  if p_valor not in ('true', 'false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode = '22023';
  end if;

  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update
    set valor = excluded.valor,
        atualizado_por = excluded.atualizado_por;
  -- gps.config já tem trigger trg_config_atualizado_em (migração ...110)
  -- cuidando de atualizado_em — não repetir aqui.

  -- gps.acessos_log.detalhe é TEXT (não jsonb) e aluno_id é NULLABLE — não
  -- há aluno-alvo nesta ação, é configuração do sistema. Mesma coluna
  -- (feito_por) e mesmo formato (format(...) em texto) das demais RPCs da
  -- Central (…152 a …157) e do onboarding do sócio (…256).
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'interruptor_alterado',
    null,
    format('interruptor "%s" definido para %s', p_chave, p_valor),
    auth.uid()
  );
end;
$$;

comment on function gps.config_definir(text, text) is
  'gp_is_admin() ou 42501. UNICA porta de escrita em gps.config pelo painel (/admin). Allowlist FECHADA de 11 chaves booleanas -- qualquer outra chave (inclusive resend_api_key e resgate_codigo) e recusada com 22023, antes mesmo de tocar a tabela. p_valor so aceita "true"/"false". Grava trilha em gps.acessos_log (acao=interruptor_alterado, aluno_id NULL -- nao ha aluno-alvo, coluna aceita null), com quem alterou (feito_por=auth.uid()) e o que mudou em detalhe (texto) -- e o ponto da feature: mudanca por SQL direto nao deixava rastro de autor.';

revoke execute on function gps.config_definir(text, text) from public, anon;
grant  execute on function gps.config_definir(text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA DE GRANTS (rodar depois de aplicar; deve bater 1 linha)
-- ═══════════════════════════════════════════════════════════════════════════
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('public',        p.oid, 'execute') as public
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'config_definir';
--   -- ESPERADO: anon=f authenticated=t public=f

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar). Tudo dentro
-- de um `do $$ ... $$` que termina em `raise exception`: o RAISE aborta a
-- transação e NADA sobrevive. `set_config('role', 'authenticated', ...)` +
-- JWT simulado onde há RLS/gp_is_admin() — como `postgres` não passa por
-- RLS, prova rodando só como superusuário não vale.
--
-- ⚠️ `create temp table` QUEBRA o rollback — a prova devolve tudo por
-- `raise notice`/`select`, nunca cria objeto persistente.
--
-- do $$
-- declare
--   v_admin uuid;
--   v_titular uuid;
--   v_state text;
--   v_valor text;
--   v_qtd_log int;
--   v_caso_a text := 'NAO RODOU'; v_caso_b text := 'NAO RODOU';
--   v_caso_c text := 'NAO RODOU'; v_caso_d text := 'NAO RODOU';
--   v_caso_e text := 'NAO RODOU';
-- begin
--   select id into v_admin from public.perfis where status='ativo' and cargo in ('dev','admin') limit 1;
--   if v_admin is null then raise exception 'PROVA ABORTADA: nenhum admin encontrado'; end if;
--
--   select m.user_id into v_titular
--     from gps.membros m
--    where m.papel = 'titular' and m.user_id is not null
--    limit 1;
--   if v_titular is null then raise exception 'PROVA ABORTADA: precisa de 1 titular com user_id'; end if;
--
--   -- CASO A: admin liga uma chave da allowlist -> grava + trilha.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.config_definir('tutoriais_ativo', 'false');
--   select valor into v_valor from gps.config where chave = 'tutoriais_ativo';
--   select count(*) into v_qtd_log from gps.acessos_log
--    where acao = 'interruptor_alterado' and feito_por = v_admin
--      and detalhe = 'interruptor "tutoriais_ativo" definido para false';
--   v_caso_a := case when v_valor = 'false' and v_qtd_log >= 1
--               then 'OK gravou + trilha' else 'FALHOU valor='||coalesce(v_valor,'null')||' log='||v_qtd_log end;
--
--   -- religa, para não deixar a aba desligada de verdade depois da prova
--   -- (a transação inteira reverte de qualquer forma, mas por clareza).
--   perform gps.config_definir('tutoriais_ativo', 'true');
--
--   -- CASO B: chave FORA da allowlist (credencial) -> recusa.
--   begin
--     perform gps.config_definir('resend_api_key', 'x');
--     v_caso_b := 'FALHOU: aceitou chave fora da allowlist';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_b := case when v_state='22023' then 'OK 22023 (credencial recusada)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO C: valor fora de true/false -> recusa.
--   begin
--     perform gps.config_definir('tutoriais_ativo', 'talvez');
--     v_caso_c := 'FALHOU: aceitou valor fora de true/false';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_c := case when v_state='22023' then 'OK 22023 (valor invalido recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO D: não-admin (titular) é recusado.
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular::text,'role','authenticated')::text, true);
--   begin
--     perform gps.config_definir('tutoriais_ativo', 'false');
--     v_caso_d := 'FALHOU: titular conseguiu alterar interruptor';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_d := case when v_state='42501' then 'OK 42501 (nao-admin recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO E: anon (sem JWT nenhum) é negado.
--   perform set_config('role','anon', true);
--   perform set_config('request.jwt.claims', null, true);
--   begin
--     perform gps.config_definir('tutoriais_ativo', 'false');
--     v_caso_e := 'FALHOU: anon conseguiu chamar a RPC';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_e := case when v_state in ('42501','42883') then 'OK negado a anon (sqlstate='||v_state||')' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   perform set_config('role','none', true);
--   raise exception E'PROVA ...260\n A (grava + trilha): %\n B (credencial fora da allowlist): %\n C (valor invalido): %\n D (nao-admin recusado): %\n E (anon negado): %',
--     v_caso_a, v_caso_b, v_caso_c, v_caso_d, v_caso_e;
-- end $$;
--
-- ESPERADO: A = "OK gravou + trilha" · B = "OK 22023 (credencial recusada)" ·
--   C = "OK 22023 (valor invalido recusado)" · D = "OK 42501 (nao-admin recusado)" ·
--   E = "OK negado a anon (sqlstate=...)"

-- ═══════════════════════════════════════════════════════════════════════════
-- SUSTENTABILIDADE (as 5 perguntas, protocolo) — sem EXPLAIN, de propósito
-- ═══════════════════════════════════════════════════════════════════════════
--   ESCALA: `gps.config` tem 21 linhas hoje e cresce por FEATURE nova, não
--     por uso — não existe "10x mais linhas" plausível (seria 210 chaves de
--     configuração do sistema inteiro). `config_definir` faz 1 upsert por
--     PK (`chave`) + 1 insert em `acessos_log` (append-only, já indexada
--     pela PK e sem leitura nesta RPC) — não há SELECT de lista, não há
--     JOIN, não há filtro que precise de índice: PK já cobre o upsert.
--   ÍNDICE: nenhum novo. O upsert é por PK (chave) — Index Scan garantido
--     pela própria constraint, sem precisar provar com EXPLAIN.
--   FREQUÊNCIA: clique manual do admin, esporádico (o oposto de rotina de
--     tela do aluno) — não há cron nem chamada em loop.
--   REPETIÇÃO: 1 clique = 1 chamada = 1 upsert + 1 insert. Não há N telas
--     chamando a mesma RPC nem N interruptores por chamada.
--   REVERSÃO: `drop function gps.config_definir(text, text)` remove a
--     escrita; a leitura (`getInterruptores`, select direto com `.in()`)
--     não depende dela e continua funcionando (mostraria o estado, sem
--     poder alterar). `gps.config` não é tocada pela reversão.
