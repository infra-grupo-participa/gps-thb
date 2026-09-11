-- Equipe — admin troca o e-mail do LOGIN pela tela (feature "trocar e-mail
-- do login pela tela do admin", 11/09/2026).
--
-- POR QUE EXISTE
--   Em 10 e 11/09/2026 três pessoas ficaram sem entrar no portal por causa de
--   e-mail de login errado, e SÓ um dev com SQL resolveu (Eder Fagundes, login
--   @adv.oabmg.org.br mas ele usa @gmail.com; Rubens Barros, typo
--   rubens.barros1967@gmai.coml -- o "l" do gmail foi para depois do ".com",
--   por isso nenhum e-mail do sistema chegava nele; Mauricio de Oliveira,
--   login comercial, ele usa o Gmail, e por não conseguir entrar acabou se
--   auto-cadastrando de novo). Pedido literal do Marcio: "Preciso que essa
--   troca de acesso seja feito pelos admin também".
--
-- FATOS MEDIDOS NO BANCO em 11/09/2026 (rodados pelo Marcio, colados aqui
-- verbatim -- ver PROTOCOLO-SUSTENTABILIDADE, "não re-descubra, mas confirme"):
--
--   select column_name, is_generated, generation_expression from information_schema.columns
--    where table_schema='auth' and table_name='identities';
--   -- email | ALWAYS | lower((identity_data ->> 'email'::text))
--   -- ⚠️ COLUNA GERADA: `update auth.identities set email = ...` dá erro.
--   -- Atualizar identity_data já a move (a coluna é a projeção dela).
--
--   select indexdef from pg_indexes where schemaname='auth' and tablename in ('users','identities');
--   -- índice nativo do GoTrue usado na guarda de colisão desta migração:
--   --   users_email_partial_key = btree (email) where (is_sso_user = false)
--   -- ⚠️ Índice SOBRE A COLUNA CRUA `email` -- não `lower(email)`. Qualquer
--   -- lower() na cláusula WHERE da colisão derruba para Seq Scan (mesma
--   -- classe de defeito que travou produção em 19/08 com btrim(lower())
--   -- vs lower(btrim())). A guarda de colisão abaixo usa `email = v_novo`
--   -- (v_novo já normalizado em Postgres, comparado cru) para casar com o
--   -- índice -- ver o EXPLAIN (ANALYZE) na seção de prova, no fim do arquivo.
--
--   provider_id nas contas deste portal guarda o UUID do usuário (conferido
--   no Rubens: provider_id = 13e8bc1f-... = u.id::text), mas contas nascidas
--   do signUp do GoTrue gravam O E-MAIL. Por isso o UPDATE de
--   auth.identities só reescreve provider_id QUANDO ele for igual ao e-mail
--   ANTIGO -- reescrever cegamente quebraria a unicidade (provider,
--   provider_id).
--
-- DECISÕES JÁ TOMADAS (não reabrir)
--   - Permissão: public.gp_is_admin() (cargo dev OU admin) -- pedido literal.
--   - Interruptor: nasce LIGADO (gps.config.troca_email_login_ativa='true').
--     Existe como plano de fuga, mas já ativo.
--   - Cadastro junto: fica a cargo da action (checkbox marcado por padrão,
--     desmarcável) -- esta função só troca o LOGIN (+ opcionalmente a senha).
--   - Confirmação: email_confirmed_at carimbado na hora (a equipe confere por
--     WhatsApp antes de trocar).
--   - Sem e-mail automático de aviso PELO BANCO (a action manda por
--     enviarCredenciaisAcesso quando gera senha nova -- ver 🔴 abaixo).
--   - Colisão: recusa dura com P0003, SEM caminho de confirmação. Não funde
--     identidades -- diferente de admin_adotar_login_existente, que ADOTA um
--     login existente; aqui um e-mail em uso por OUTRA conta é erro, ponto.
--
-- 🔴 MUDANÇA DE ESCOPO (11/09/2026, pedido literal do Marcio DEPOIS da
-- primeira versão desta migração, ainda não aplicada quando o pedido chegou):
-- "preciso que a equipe tenha autonomia de mudar os emails deles caso
-- precisem e isso irá gerar uma nova senha, que eles vão disponibilizar e
-- tudo mais". Faz sentido pelo caso real: se o e-mail estava errado, a
-- pessoa nunca recebeu a senha original mesmo (Rubens é a única exceção --
-- ele ENTRAVA, só não recebia e-mail; por isso `p_senha` é OPCIONAL, não
-- obrigatório: `null` troca só o e-mail, mantendo a senha intacta).
--   - Novo parâmetro `p_senha text default null`.
--   - Corpo do trecho de senha COPIADO de gps.admin_definir_senha_membro
--     (pg_get_functiondef, migração ...118/...208) -- não reescrito de
--     memória: mesmo `extensions.crypt(p_senha, extensions.gen_salt('bf',10))`,
--     mesmo mínimo de 8 (`length(trim(p_senha)) < 8`), mesmo carimbo MERGE de
--     `raw_user_meta_data.gps_senha_temp_em` (o que força a troca no passo 0
--     do onboarding).
--   - Retorno ganha `senha_definida boolean`.
--
-- GUARDAS, NESTA ORDEM, TODAS ANTES DE QUALQUER ESCRITA (a última escrita é
-- sempre o insert em gps.acessos_log, o mesmo modo de falha documentado nas
-- migrações ...092/...150/...151/...200: guarda que falha DEPOIS de escrever
-- deixa a ação feita e a trilha ausente):
--   1. public.gp_is_admin()                                        -> 42501
--   2. gps.config.troca_email_login_ativa <> 'true'                -> 42501
--   3. membro existe e tem user_id                                 -> P0002
--   4. gps.admin_alvo_e_equipe(v_user) -- não mexe em conta da equipe,
--      trava de escalada de privilégio                             -> 42501
--   5. e-mail válido (formato básico) + normalizado lower(btrim()) -> 22023
--   6. e-mail novo == e-mail atual                                 -> 22023
--   7. colisão: outro auth.users com esse e-mail (id <> v_user)    -> P0003
--      (sem caminho de confirmação -- ao contrário do convite de sócio e do
--      admin_adotar_login_existente, aqui NUNCA se funde conta)
--   8. p_confirmar_outros_sistemas=false e a conta tem papel FORA do GPS
--                                                                    -> P0005
--      (cinto de segurança no banco -- a guarda PRIMÁRIA fica na action,
--      espelhando definirSenhaAluno/definirSenhaMembro/adicionarSocioAluno)
--   9. p_senha informado e length(trim(p_senha)) < 8                -> 22023
--      (mesma frase literal de admin_definir_senha_membro, para casar no
--      mapa de FRASES_DO_BANCO sem precisar de entrada nova)
--
-- 🔑 NORMALIZAÇÃO DE E-MAIL = lower(btrim()), a MESMA expressão que
-- `thb_alunos_email_uidx` e todas as RPCs irmãs usam desde 19/08 (a inversão
-- btrim(lower()) foi o que derrubou produção naquele dia).
--
-- 🔑 PARÊNTESES em toda extração `->>` dentro de `||` no detalhe do log:
-- `||` e `->>` têm a MESMA precedência e associam à esquerda -- foi essa
-- falta que deixou admin_adotar_login_existente quebrada por 15 dias
-- (42883, migração ...020/...118). Aqui a concatenação é só texto (sem
-- jsonb no meio), mas o padrão de escrever com parênteses explícitos é
-- mantido por segurança de leitura.
--
-- O QUE NÃO FAZ
--   * não toca em public.thb_alunos (o alinhamento do cadastro, quando
--     pedido, é feito pela action, por pessoa_aluno_id -- nunca aluno_id,
--     que para sócio é o ambiente do titular);
--   * não manda e-mail (a action manda, para o endereço NOVO, quando gera
--     senha -- é o endereço que funciona; o antigo é justamente o quebrado);
--   * não funde identidade nem adota login de outra conta;
--   * não cria membro nem ambiente (a pessoa já precisa ter login no GPS).
--
-- REVERSÃO
--   drop function gps.admin_trocar_email_login(uuid, text, boolean, text);
--   delete from gps.config where chave = 'troca_email_login_ativa';
--   -- o CHECK de acessos_log.acao não tem reversão limpa sem apagar as
--   -- linhas 'email_login_alterado' primeiro (mesma ordem da ...200).
--
-- ⚠️ ESTA MIGRAÇÃO AINDA NÃO FOI APLICADA quando o parâmetro `p_senha` foi
-- acrescentado (mudança de escopo do Marcio, mesma sessão) -- por isso o
-- arquivo foi EDITADO no lugar, e não substituído por uma segunda migração.
-- Se este arquivo já tiver sido aplicado no banco quando você ler isto,
-- NÃO reaplique por cima: crie uma migração nova de `create or replace`
-- (assinatura idêntica, sem overload) com o diff.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Interruptor -- nasce LIGADO
-- ═════════════════════════════════════════════════════════════════════════

insert into gps.config (chave, valor)
values ('troca_email_login_ativa', 'true')
on conflict (chave) do nothing;

comment on table gps.config is
  'Chave/valor de configuração runtime do GPS (interruptores, segredos de
   e-mail, prazos). Ver comentário de cada chave para o efeito exato.';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. CHECK de gps.acessos_log.acao -- acrescenta 'email_login_alterado'
-- ═════════════════════════════════════════════════════════════════════════
--
-- Acha a constraint PELO CONTEÚDO (o último valor que a ...250 acrescentou:
-- 'chamado_solicitacao_declinada'), não pelo nome -- mesma técnica das
-- ...092/...150/...151/...200/...250. Se o valor não bater, a migração
-- ABORTA em vez de rodar um `drop constraint if exists` com o nome errado
-- (que seria NO-OP silencioso e deixaria o CHECK antigo valendo).

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
     and pg_get_constraintdef(con.oid) like '%chamado_solicitacao_declinada%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO chamado_solicitacao_declinada, da migracao ...250) -- migracao abortada para nao deixar admin_trocar_email_login gravando uma acao que a constraint rejeita';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 20 valores vigentes (conferidos em ...250), na mesma
-- ordem, + 'email_login_alterado' no fim.
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
    -- ── Chamados: categoria + fluxo de aprovação (11/09/2026) ──
    'chamado_solicitacao_aprovada',
    'chamado_solicitacao_declinada',
    -- ── Admin troca o e-mail do login (11/09/2026) ──
    'email_login_alterado'          -- gps.admin_trocar_email_login
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 5 do baseline; 7 da Central (...150); 3 da mega feature (...200); 3 do convite de socio (...244); 2 da categoria+aprovacao de chamados (...250); 1 da troca de e-mail do login (...252): email_login_alterado (gps.admin_trocar_email_login). Nao guarda nome de cliente em `detalhe` -- dado de terceiro (mesma regra da ...203).';

-- ═════════════════════════════════════════════════════════════════════════
-- 3. gps.admin_trocar_email_login -- a função
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.admin_trocar_email_login(
  p_membro_id uuid,
  p_email text,
  p_confirmar_outros_sistemas boolean default false,
  p_senha text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  m record;
  v_novo text;
  v_antigo text;
  v_identity record;
  v_senha_definida boolean := false;
begin
  -- 1. admin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 2. interruptor
  if coalesce((select valor from gps.config where chave = 'troca_email_login_ativa'), '') <> 'true' then
    raise exception 'A troca de e-mail do login está desligada no momento.' using errcode = '42501';
  end if;

  -- 3. membro existe e tem login
  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.user_id is null then
    raise exception 'Este membro ainda não tem login.' using errcode = 'P0002';
  end if;

  -- 4. não mexe em conta da equipe (trava de escalada de privilégio)
  if gps.admin_alvo_e_equipe(m.user_id) then
    raise exception 'Esta conta é da equipe — o e-mail do login não pode ser trocado por aqui.' using errcode = '42501';
  end if;

  -- 5. formato + normalização (lower(btrim()), a MESMA expressão de
  -- thb_alunos_email_uidx e de todas as RPCs irmãs desde 19/08)
  v_novo := lower(btrim(p_email));
  -- RFC 5321: 254 caracteres. Sem teto (pentest 11/09, achado BAIXO), um
  -- e-mail de 10 mil caracteres passaria pelo regex e iria para auth.users e
  -- para o `detalhe` do log.
  if v_novo is null or v_novo = '' or length(v_novo) > 254
     or v_novo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  select email into v_antigo from auth.users where id = m.user_id;
  if v_antigo is null then
    raise exception 'O login deste membro não existe mais.' using errcode = 'P0002';
  end if;

  -- 6. igual ao atual
  if v_novo = lower(btrim(v_antigo)) then
    raise exception 'Este já é o e-mail do login.' using errcode = '22023';
  end if;

  -- 7. colisão -- SEM caminho de confirmação.
  --
  -- 🔴 `is_sso_user = false` NÃO É DECORATIVO -- é o que torna o índice
  -- parcial `users_email_partial_key` (btree (email) WHERE is_sso_user =
  -- false) utilizável. MEDIDO em 11/09/2026, com 11.043 linhas em
  -- auth.users:
  --
  --   email = v_novo                          -> Seq Scan   314,2 ms, 774 buffers
  --   email = v_novo AND is_sso_user = false  -> Index Scan    2,6 ms,   2 buffers
  --
  -- 120x. Sem o predicado do índice parcial, o planner NÃO pode usá-lo e
  -- varre a tabela inteira -- e ela é de TODOS os 7 sistemas do grupo, logo
  -- cresce com o grupo, não com o GPS. Também não usar `lower(email)`: há um
  -- índice `users_instance_id_email_idx (instance_id, lower(email))`, mas ele
  -- exige `instance_id` junto para ser usado.
  --
  -- `v_novo` já vem normalizado por `lower(btrim())` na guarda 5, e o GoTrue
  -- grava o e-mail em minúsculas -- a comparação crua é correta.
  if exists (
    select 1 from auth.users
     where email = v_novo
       and is_sso_user = false          -- ⚠️ OBRIGATÓRIO: ver o comentário
       and id <> m.user_id
  ) then
    raise exception 'Este e-mail já está em uso por outra conta.' using errcode = 'P0003';
  end if;

  -- 8. papel fora do GPS sem confirmação (cinto de segurança no banco; a
  -- guarda primária é a action, via admin_programas_do_email)
  -- 🔴 `public.perfis` ENTROU AQUI depois do PENTEST de 11/09 (achado ALTO).
  -- Ela e a tabela de EQUIPE dos 7 sistemas do grupo; sem ela, conta de
  -- equipe de outro portal com perfil pendente/inativo ou cargo fora de
  -- dev/admin passava pela guarda 4 (que so barra ATIVO dev/admin) E pela 8.
  -- A mitigacao existia so na Server Action, que e CLIENTE da RPC -- action
  -- nao e fronteira: o schema `gps` e exposto ao PostgREST.
  -- Medido antes de corrigir: ZERO membros do GPS tinham linha em
  -- public.perfis. Corrigido mesmo assim -- fronteira nao pode depender de a
  -- populacao estar favoravel (mesma licao do achado B2 de 10/09).
  if not p_confirmar_outros_sistemas then
    if exists (select 1 from public.perfis where id = m.user_id)
       or exists (select 1 from workbook.perfis where user_id = m.user_id)
       or exists (select 1 from central.alunos where id = m.user_id)
       or exists (select 1 from rede.perfis where auth_id = m.user_id)
       or exists (select 1 from sip.progress where user_id = m.user_id)
       or exists (select 1 from sip.meta where user_id::text = m.user_id::text)
       or exists (select 1 from ht.lesson_progress where user_id = m.user_id)
    then
      raise exception 'Esta conta tem papel em outro sistema do grupo. Confirme para trocar o e-mail em todos.' using errcode = 'P0005';
    end if;
  end if;

  -- 9. senha nova opcional -- MESMA frase literal de
  -- gps.admin_definir_senha_membro (migração ...118/...208), para casar no
  -- mapa de FRASES_DO_BANCO sem entrada nova.
  if p_senha is not null and length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  -- ═══ ESCRITAS ═══

  -- 🔑 Trecho de senha COPIADO de gps.admin_definir_senha_membro
  -- (pg_get_functiondef, ...118/...208): mesmo crypt/gen_salt, mesmo carimbo
  -- MERGE de gps_senha_temp_em (nunca sobrescreve raw_user_meta_data -- os
  -- outros 6 sistemas do grupo escrevem lá). `p_senha is null` preserva a
  -- senha (caso Rubens: e-mail com typo, ele já entra bem, só não recebe
  -- e-mail -- trocar a senha dele à toa seria atrito sem motivo).
  if p_senha is not null then
    update auth.users
       set email = v_novo,
           encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('gps_senha_temp_em', now()),
           recovery_token = '', recovery_sent_at = null, confirmation_token = '',
           email_change = '',
           email_change_token_new = '',
           email_change_token_current = '',
           email_change_confirm_status = 0,
           updated_at = now()
     where id = m.user_id;
    v_senha_definida := true;
  else
    update auth.users
       set email = v_novo,
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           email_change = '',
           email_change_token_new = '',
           email_change_token_current = '',
           email_change_confirm_status = 0,
           updated_at = now()
     where id = m.user_id;
  end if;

  -- `identities.email` é COLUNA GERADA (ALWAYS, lower(identity_data->>'email'))
  -- -- nunca se escreve nela; atualizar identity_data já a move.
  -- `provider_id` SÓ é reescrito se hoje for igual ao e-mail ANTIGO (contas
  -- nascidas de signUp gravam o e-mail ali; contas administrativas gravam o
  -- UUID). Reescrever cegamente quebraria a unicidade (provider, provider_id).
  select * into v_identity from auth.identities
   where user_id = m.user_id and provider = 'email';

  if found then
    update auth.identities
       set identity_data = identity_data || jsonb_build_object('email', v_novo),
           provider_id = case when v_identity.provider_id = v_antigo then v_novo
                              else v_identity.provider_id end,
           updated_at = now()
     where user_id = m.user_id and provider = 'email';
  end if;

  -- Troca de e-mail sem derrubar sessão é troca pela metade -- a pessoa
  -- continuaria logada com o e-mail antigo até expirar sozinho.
  delete from auth.refresh_tokens where user_id = m.user_id::text;
  delete from auth.sessions where user_id = m.user_id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('email_login_alterado', m.aluno_id, m.user_id, v_novo,
          ('e-mail do login alterado de ' || v_antigo || ' para ' || v_novo
           || case when v_senha_definida then ' (com senha nova)' else '' end),
          auth.uid());

  return jsonb_build_object(
    'user_id', m.user_id,
    'email_antigo', v_antigo,
    'email_novo', v_novo,
    'papel', m.papel,
    'aluno_id', m.aluno_id,
    'pessoa_aluno_id', m.pessoa_aluno_id,
    'senha_definida', v_senha_definida
  );
end $function$;

comment on function gps.admin_trocar_email_login(uuid, text, boolean, text) is
  'Admin troca o e-mail do LOGIN de um membro (titular ou socio) pela tela,
   sem SQL manual (motivo: Eder Fagundes, Rubens Barros e Mauricio de
   Oliveira ficaram sem entrar em 10-11/09/2026 por e-mail de login errado).
   O QUE FAZ: atualiza auth.users.email, atualiza auth.identities.identity_data
   (e provider_id SÓ quando ele valia o e-mail antigo -- identities.email eh
   coluna gerada, nunca escrita direto), derruba sessoes/refresh tokens, grava
   trilha em gps.acessos_log (acao=email_login_alterado). Desde 11/09/2026
   aceita p_senha OPCIONAL (default null): quando informada, troca a senha
   junto (corpo copiado de admin_definir_senha_membro -- crypt/gen_salt,
   carimbo MERGE de gps_senha_temp_em para forcar troca no passo 0 do
   onboarding) porque, na pratica, quem tinha e-mail de login errado nunca
   recebeu a senha original mesmo; null preserva a senha atual (caso Rubens:
   e-mail com typo, ele ja entra bem). O QUE NAO FAZ: nao toca
   public.thb_alunos (o alinhamento do cadastro, se pedido, eh feito pela
   action via pessoa_aluno_id, nunca aluno_id), nao manda e-mail (a action
   manda, para o endereco NOVO, quando gera senha), nao funde identidade
   (colisao = P0003 sem caminho de confirmacao, ao contrario de
   admin_adotar_login_existente). auth.users eh COMPARTILHADO pelos 7 portais
   do grupo -- a troca vale em todos, e por isso a guarda 8 (P0005) exige
   confirmacao quando a conta tem papel fora do GPS. Guarda 4 impede mexer em
   conta da equipe (public.perfis, cargo dev/admin) -- trava de escalada de
   privilegio. Interruptor: gps.config.troca_email_login_ativa (nasce ligado).';

revoke execute on function gps.admin_trocar_email_login(uuid, text, boolean, text) from public, anon;
grant  execute on function gps.admin_trocar_email_login(uuid, text, boolean, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. PROVA -- protocolo de sustentabilidade (colar a saída real após aplicar)
-- ═════════════════════════════════════════════════════════════════════════
--
-- ⚠️ Esta seção documenta EXATAMENTE o que rodar para produzir a prova
-- exigida (EXPLAIN ANALYZE da colisão + rollback completo + as 3 recusas).
-- Ambiente desta sessão não tinha acesso ao MCP do Supabase nem a psql/
-- service_role para executar e colar a saída real -- ver relatório da tarefa.
-- NENHUMA das queries abaixo escreve fora de uma transação com ROLLBACK.
--
-- 4.1 EXPLAIN (ANALYZE) da colisão -- testar as DUAS formas, usar a que
--     mostrar Index Scan sobre users_email_partial_key:
--
--   explain (analyze, buffers)
--   select 1 from auth.users where email = 'ja.existe@exemplo.com' and id <> gen_random_uuid();
--   -- esperado: Index Scan using users_email_partial_key
--
--   explain (analyze, buffers)
--   select 1 from auth.users where lower(email) = 'ja.existe@exemplo.com' and id <> gen_random_uuid();
--   -- esperado: Seq Scan (lower() derruba o índice parcial, que é sobre a
--   -- coluna crua) -- é por isto que a função usa `email = v_novo` cru.
--
-- 4.2 Prova em transação com rollback (execução completa, tabelas tocadas:
--     auth.users 1, auth.identities 1, sessões N, acessos_log 1, nenhuma outra):
--
--   begin;
--     set local role authenticated;
--     set local request.jwt.claims = '{"sub":"ec6d1905-200e-4efd-a172-8546f293a4bd","role":"authenticated"}';
--     select gps.admin_trocar_email_login('<membro_id_de_teste>', 'novo.email.teste@exemplo.com', true, 'Thb-teste-0001');
--   reset role;
--   -- a senha nova AUTENTICA -- mesma conferência usada nas funções irmãs:
--   select encrypted_password = crypt('Thb-teste-0001', encrypted_password) as senha_bate
--     from auth.users where id = '<user_id_devolvido>';
--   -- esperado: true
--   rollback;
--
-- 4.3 Recusas:
--   -- sem JWT de admin (role authenticated sem sub de admin, ou anon):
--   --   set local role anon; select gps.admin_trocar_email_login(...); -> 42501
--   -- conta de equipe (membro cujo user_id está em public.perfis cargo dev/admin):
--   --   -> 42501
--   -- e-mail em uso por outra conta ativa:
--   --   -> P0003
--
-- Como `authenticated` não lê auth.users direto (permission denied), rodar
-- `reset role;` antes de qualquer conferência posterior por SELECT direto.
