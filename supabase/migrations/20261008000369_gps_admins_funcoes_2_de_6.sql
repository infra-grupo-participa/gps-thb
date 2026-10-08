-- ═══════════════════════════════════════════════════════════════════════════
-- 369 — ADMIN DO GPS SEPARADO (3/5): funções, parte 2 de 6
-- ═══════════════════════════════════════════════════════════════════════════
-- GERADO POR SCRIPT a partir do corpo VIVO (pg_get_functiondef, 08/10/2026;
-- md5 de cada corpo conferido contra o banco na geração e de novo na aplicação).
-- Substituições, e só elas:
--   (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false))
--      → gps.eh_admin()            [guarda inteira; o GPS deixa de depender do acesso]
--   coalesce(public.gp_is_admin(), false) → gps.eh_admin()
--   e, nas funções que liam public.perfis.cargo para decidir admin/equipe:
--     admin_alvo_e_equipe(uuid): perfis MANTIDO + "or exists gps.admins ativo"
--     email_e_de_equipe(text):   perfis/rede/workbook MANTIDOS + gps.admins ativo
--     admin_mencionaveis, registrar_mencoes: mencionável = gps.admins ativo
--       (join em perfis só porque nota_mencoes.perfil_id referencia perfis)
--     push_preparar: destinatários = inscrição de gps.admins ativo
--     drive_pasta_registrar, drive_tarefa_pegar: "pedido por admin" = gps.admins ativo
-- create or replace com a MESMA assinatura (sem overload); ACL e dono preservados.
--
-- GUARDA DE PREMISSA: aborta se algum corpo mudou desde 08/10 e ainda não está
-- migrado (senão este arquivo apagaria a mudança de outra pessoa). Corpo já
-- migrado (cita gps.eh_admin()/gps.admins) passa: reaplicar é idempotente.
--
-- AS 5 PERGUNTAS: 1) escala/2) índice: gps.eh_admin() é PK lookup em tabela de
-- ~11 linhas (antes: gp_is_admin → acesso.eh_admin → eu/master/excecao_admin +
-- pode_editar → vinculo/area: 5+ lookups). 3) frequência: a de cada RPC, inalterada.
-- 4) repetição: nenhuma nova. 5) reversão: abaixo.
--
-- REVERTER: reversão rápida global (sem tocar aqui) = trocar o corpo de
-- gps.eh_admin() — ver 366. Reversão completa: reaplicar os corpos anteriores,
-- guardados byte a byte em supabase/retrato-20261008-funcoes-gps-antes.sql
-- (begin; select blindagem.autorizar_guarda('<motivo>'); \i …; commit;).
--
-- FUNÇÕES DESTA PARTE (20):
--   gps.admin_definir_liberacao_etapas_lote(uuid[],jsonb,text) [tinha gp_acesso_pode_editar]
--   gps.admin_definir_senha(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_definir_senha_membro(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_destravar_onboarding(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_diagnostico_ambiente(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_direito_ao_acesso(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_excluir_acesso(uuid,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_excluir_membro(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_financeiro_candidatos(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_financeiro_desvincular(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_financeiro_vincular(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_liberar_acompanhamento(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_liberar_aluno_plantao(text,text,text,text,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_lixeira_expurgar(integer) [tinha gp_acesso_pode_editar]
--   gps.admin_lixeira_restaurar_clientes(uuid,uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_marcar_finalizado(uuid,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_mencionaveis() [tinha gp_acesso_pode_editar]
--   gps.admin_mover_membro(uuid,uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_onboarding_do_aluno(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_painel_alunos(integer,integer) [tinha gp_acesso_pode_editar]
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $guarda$
declare
  r record;
  v_ruins text[] := '{}';
begin
  for r in
    select x.rp, x.md5_antes, p.oid, md5(pg_get_functiondef(p.oid)) as md5_agora, p.prosrc
      from (values
        ('gps.admin_definir_liberacao_etapas_lote(uuid[],jsonb,text)', 'd4b955c3f1dcccb7195938f132639a9a'),
        ('gps.admin_definir_senha(uuid,text)', 'eca9eb1f86c4d4e1d2eb6b00ebbee0b8'),
        ('gps.admin_definir_senha_membro(uuid,text)', '303c3bf3c44e18d3aeeeb4cbf07d1b55'),
        ('gps.admin_destravar_onboarding(uuid)', '1b89096921afb008f634e6db0f97c18e'),
        ('gps.admin_diagnostico_ambiente(uuid)', '97fa9d694616c5d96d388d563b09d59c'),
        ('gps.admin_direito_ao_acesso(uuid)', 'd49b0f675ff8b3023d333299bec6c387'),
        ('gps.admin_excluir_acesso(uuid,boolean)', 'a45d8e9d32684d96fdf645b6b2edcc9e'),
        ('gps.admin_excluir_membro(uuid)', '934f2ec96504ae06e638d081301f21ca'),
        ('gps.admin_financeiro_candidatos(uuid)', '68675e0c0c819a6fb082c41c654b574c'),
        ('gps.admin_financeiro_desvincular(uuid,text)', '7251af827dfde4eadd05ace2f5fc8485'),
        ('gps.admin_financeiro_vincular(uuid,text)', '35fc65c2d7e6bd3542f58d6d4127d36d'),
        ('gps.admin_liberar_acompanhamento(uuid,text)', '0df0257810d079869bb0d0db8937a2c4'),
        ('gps.admin_liberar_aluno_plantao(text,text,text,text,boolean)', 'c1016a163b586250fd6171fc41703eab'),
        ('gps.admin_lixeira_expurgar(integer)', 'f2fda1e9d88fe6c908b5d73e3d41c9a6'),
        ('gps.admin_lixeira_restaurar_clientes(uuid,uuid)', '6324606f4ed23985b7453c2e95d33ae2'),
        ('gps.admin_marcar_finalizado(uuid,boolean)', '8d2d7d753ccf631f172ed9a0f4f5581d'),
        ('gps.admin_mencionaveis()', 'b6d6e59bc5bf5a8287d0647160684595'),
        ('gps.admin_mover_membro(uuid,uuid)', 'adde4a02b2636a1380b26081e32ef1f7'),
        ('gps.admin_onboarding_do_aluno(uuid)', 'abd97b6d6e6e92db4392fbb15624a96e'),
        ('gps.admin_painel_alunos(integer,integer)', '539b9503c8cb018806c04ab37f007d9a')
      ) as x(rp, md5_antes)
      left join pg_proc p on p.oid = to_regprocedure(x.rp)
  loop
    if r.oid is null then
      v_ruins := v_ruins || (r.rp || ' (não existe)');
    elsif r.md5_agora <> r.md5_antes and r.prosrc !~ 'gps\.eh_admin\(\)|gps\.admins' then
      v_ruins := v_ruins || (r.rp || ' (mudou desde 08/10)');
    end if;
  end loop;
  if cardinality(v_ruins) > 0 then
    raise exception '%: corpo vivo difere do retrato de 08/10 — regenerar a migração: %', '20261008000369', array_to_string(v_ruins, '; ');
  end if;
end
$guarda$;

-- gps.admin_definir_liberacao_etapas_lote(uuid[],jsonb,text)
CREATE OR REPLACE FUNCTION gps.admin_definir_liberacao_etapas_lote(p_alunos uuid[], p_itens jsonb, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_alunos       uuid[];
  v_n_alunos     int;
  v_sem_ambiente int;
  v_motivo       text;
  v_item         jsonb;
  v_etapa_num    numeric;
  v_etapas       smallint[] := '{}';
  v_pedidos      boolean[]  := '{}';
  v_globais      boolean[]  := '{}';
  v_global       boolean;
  v_i            int;
  v_aluno        uuid;
  v_etapa        smallint;
  v_pedido       boolean;
  v_atual        boolean;
  v_tem          boolean;
  v_alterados    int   := 0;
  v_sem_mudanca  int   := 0;
  v_saida        jsonb := '[]'::jsonb;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_alunos is null or array_position(p_alunos, null) is not null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  select array_agg(distinct a order by a) into v_alunos from unnest(p_alunos) a;
  v_n_alunos := coalesce(cardinality(v_alunos), 0);
  if v_n_alunos = 0 then
    raise exception 'Selecione ao menos um aluno.' using errcode = '22023';
  end if;
  if v_n_alunos > 50 then
    raise exception 'No máximo 50 alunos por vez.' using errcode = '22023';
  end if;

  v_motivo := regexp_replace(coalesce(p_motivo, ''), '^\s+|\s+$', '', 'g');
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — ele fica no histórico deste aluno.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha ao menos uma etapa.' using errcode = '22023';
  end if;
  for v_item in
    select e from jsonb_array_elements(p_itens) e
     order by (e ->> 'etapa') collate "C"
  loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'etapa') is distinct from 'number'
       or not (v_item ? 'liberada')
       or jsonb_typeof(v_item -> 'liberada') not in ('boolean', 'null') then
      raise exception 'Item de etapa em formato inválido.' using errcode = '22023';
    end if;
    v_etapa_num := (v_item ->> 'etapa')::numeric;
    if v_etapa_num <> trunc(v_etapa_num) or v_etapa_num not between 1 and 32767 then
      raise exception 'Etapa não encontrada.' using errcode = 'P0002';
    end if;
    v_etapa := v_etapa_num::smallint;
    if v_etapa = any (v_etapas) then
      raise exception 'Etapa repetida na lista.' using errcode = '22023';
    end if;
    select e.liberada into v_global from gps.etapas e where e.id = v_etapa;
    if not found then
      raise exception 'Etapa não encontrada.' using errcode = 'P0002';
    end if;
    v_etapas  := v_etapas  || v_etapa;
    v_pedidos := v_pedidos || (v_item -> 'liberada' #>> '{}')::boolean;
    v_globais := v_globais || v_global;
  end loop;

  select count(*) into v_sem_ambiente
    from unnest(v_alunos) a
   where not exists (select 1 from gps.membros m where m.aluno_id = a);
  if v_sem_ambiente > 0 then
    raise exception 'Sem ambiente no programa: % de % aluno(s) selecionado(s).',
      v_sem_ambiente, v_n_alunos using errcode = 'P0002';
  end if;

  foreach v_aluno in array v_alunos loop
    for v_i in 1 .. cardinality(v_etapas) loop
      v_etapa  := v_etapas[v_i];
      v_pedido := v_pedidos[v_i];
      v_global := v_globais[v_i];

      select o.liberada into v_atual
        from gps.etapa_liberacao_aluno o
       where o.aluno_id = v_aluno and o.etapa = v_etapa
         for update;
      v_tem := found;

      if (v_tem and v_atual is not distinct from v_pedido)
         or (not v_tem and (v_pedido is null or v_pedido = v_global)) then
        v_sem_mudanca := v_sem_mudanca + 1;
        continue;
      end if;

      perform gps.admin_definir_liberacao_etapa(v_aluno, v_etapa, v_pedido, v_motivo);

      v_alterados := v_alterados + 1;
      v_saida := v_saida || jsonb_build_object(
        'aluno_id', v_aluno, 'etapa', v_etapa,
        'liberada', v_pedido, 'removido', v_pedido is null);
    end loop;
  end loop;

  return jsonb_build_object('alterados', v_alterados,
                            'sem_mudanca', v_sem_mudanca,
                            'itens', v_saida);
end $function$;

-- gps.admin_definir_senha(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_definir_senha(p_aluno_id uuid, p_senha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_email text;
begin
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_senha is null or length(trim(p_senha)) < 8 then raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023'; end if;
  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is null then raise exception 'Este aluno ainda não tem login. Use "Criar acesso".' using errcode = 'P0002'; end if;
  if gps.admin_alvo_e_equipe(v_user) then raise exception 'Esta conta é da equipe — a senha não pode ser trocada por aqui.' using errcode = '42501'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('gps_senha_temp_em', now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = v_user
   returning email into v_email;
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;
  insert into gps.membros (aluno_id, user_id, papel)
  values (p_aluno_id, v_user, case when exists (select 1 from gps.membros m where m.aluno_id = p_aluno_id and m.papel='titular' and m.user_id <> v_user) then 'socio' else 'titular' end)
  on conflict (user_id) do nothing;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, feito_por) values ('senha_definida', p_aluno_id, v_user, v_email, auth.uid());
  return jsonb_build_object('user_id', v_user, 'email', v_email);
end $function$;

-- gps.admin_definir_senha_membro(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_definir_senha_membro(p_membro_id uuid, p_senha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_senha is null or length(trim(p_senha)) < 8 then raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023'; end if;
  select * into m from gps.membros where id = p_membro_id;
  if not found then raise exception 'Membro não encontrado.' using errcode = 'P0002'; end if;
  if m.user_id is null then raise exception 'Este membro ainda não tem login.' using errcode = 'P0002'; end if;
  if gps.admin_alvo_e_equipe(m.user_id) then raise exception 'Esta conta é da equipe — a senha não pode ser trocada por aqui.' using errcode = '42501'; end if;
  if m.user_id = auth.uid() then raise exception 'Você não pode trocar a própria senha por aqui — use o seu perfil.' using errcode = '42501'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('gps_senha_temp_em', now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = m.user_id
   returning email into v_email;
  if not found then raise exception 'O login deste membro não existe mais.' using errcode = 'P0002'; end if;
  delete from auth.refresh_tokens where user_id = m.user_id::text;
  delete from auth.sessions where user_id = m.user_id;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('senha_definida', m.aluno_id, m.user_id, v_email, 'membro ' || coalesce(m.papel, '?'), auth.uid());
  return jsonb_build_object('user_id', m.user_id, 'email', v_email, 'papel', m.papel);
end $function$;

-- gps.admin_destravar_onboarding(uuid)
CREATE OR REPLACE FUNCTION gps.admin_destravar_onboarding(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pessoa uuid;
  v_ja boolean;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- A pessoa do TITULAR daquele ambiente.
  select m.pessoa_aluno_id into v_pessoa
    from gps.membros m
   where m.aluno_id = p_aluno_id and m.papel = 'titular'
     and m.pessoa_aluno_id is not null
   limit 1;

  if v_pessoa is null then
    raise exception 'Este ambiente não tem uma pessoa vinculada ao titular. Resolva o vínculo antes.'
      using errcode = 'P0002';
  end if;

  select (r.concluido_em is not null) into v_ja
    from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;

  if coalesce(v_ja, false) then
    return jsonb_build_object('ok', true, 'ja_estava', true);
  end if;

  insert into gps.onboarding_respostas (pessoa_aluno_id, ambiente_aluno_id, passo_atual, concluido_em)
  values (v_pessoa, p_aluno_id, 6, now())
  on conflict (pessoa_aluno_id) do update
     set concluido_em = now(), passo_atual = 6;

  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id,
                                 rotulo, detalhe, ator, ator_user_id, origem)
  values (p_aluno_id, now(), 'onboarding_concluido', 'onboarding', null,
          'A equipe destravou o questionário inicial',
          jsonb_build_object('pessoa_aluno_id', v_pessoa, 'por_equipe', true),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('ok', true, 'ja_estava', false);
end;
$function$;

-- gps.admin_diagnostico_ambiente(uuid)
CREATE OR REPLACE FUNCTION gps.admin_diagnostico_ambiente(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_aluno record;
  v_acesso jsonb; v_direito jsonb;
  v_membros jsonb; v_qtd_membros int; v_sem_pessoa int; v_titulares int;
  v_sem_login int; v_sem_senha int;
  v_contratos int; v_candidatos jsonb; v_qtd_candidatos int;
  v_clientes int; v_com_dados int; v_favorito boolean;
  -- ...216: os chamados VIVOS separados por quem está com a bola.
  v_chamados int; v_chamados_aberto int; v_chamados_respondido int;
  v_pendencias int; v_pasta text;
  v_etapas jsonb; v_overrides int; v_progresso jsonb; v_concluidas int;
  v_solic jsonb; v_ultimo_acesso text; v_email_bate boolean; v_tem_login boolean;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  select a.id, a.nome, a.email, a.documento into v_aluno
    from public.thb_alunos a where a.id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;

  v_acesso  := gps.admin_status_acesso(p_aluno_id);
  v_direito := gps.admin_direito_ao_acesso(p_aluno_id);
  v_tem_login    := coalesce((v_acesso->>'tem_login')::boolean, false);
  v_email_bate   := coalesce((v_acesso->>'email_bate')::boolean, false);
  v_ultimo_acesso := v_acesso->>'ultimo_acesso';

  select coalesce(jsonb_agg(jsonb_build_object(
           'membro_id',        m.id,
           'papel',            m.papel,
           'user_id',          m.user_id,
           'email_login',      u.email,
           'tem_login',        m.user_id is not null,
           'tem_senha',        coalesce(u.encrypted_password, '') <> '',
           'email_confirmado', u.email_confirmed_at is not null,
           'ultimo_acesso',    u.last_sign_in_at,
           'pessoa_aluno_id',  m.pessoa_aluno_id,
           'pessoa_nome',      p.nome,
           'pessoa_email',     p.email,
           'email_bate',       case
                                 when u.email is null or p.email is null then null
                                 else lower(btrim(u.email)) = lower(btrim(p.email))
                               end
         ) order by (m.papel = 'titular') desc, m.criado_em asc), '[]'::jsonb),
         count(*),
         count(*) filter (where m.pessoa_aluno_id is null),
         count(*) filter (where m.papel = 'titular'),
         count(*) filter (where m.user_id is null),
         count(*) filter (where m.user_id is not null
                            and coalesce(u.encrypted_password, '') = '')
    into v_membros, v_qtd_membros, v_sem_pessoa, v_titulares, v_sem_login, v_sem_senha
    from gps.membros m
    left join auth.users u        on u.id = m.user_id
    left join public.thb_alunos p on p.id = m.pessoa_aluno_id
   where m.aluno_id = p_aluno_id;

  select count(*) into v_contratos from cs.contatos_hm h where h.aluno_id = p_aluno_id;

  if v_contratos = 0 then
    v_candidatos := (gps.admin_financeiro_candidatos(p_aluno_id))->'candidatos';
  else
    v_candidatos := '[]'::jsonb;
  end if;
  v_qtd_candidatos := jsonb_array_length(v_candidatos);

  select count(*),
         count(*) filter (where coalesce(btrim(c.nome), '') <> ''
                            and coalesce(btrim(c.telefone), '') <> ''
                            and c.nivel_relacionamento is not null),
         coalesce(bool_or(c.acompanhado_equipe), false)
    into v_clientes, v_com_dados, v_favorito
    from gps.etapa1_clientes c where c.aluno_id = p_aluno_id;

  select count(*) filter (where ch.status = 'aberto'),
         count(*) filter (where ch.status = 'respondido')
    into v_chamados_aberto, v_chamados_respondido
    from gps.chamados ch where ch.aluno_id = p_aluno_id and ch.status <> 'fechado';
  v_chamados := v_chamados_aberto + v_chamados_respondido;

  select count(*) into v_pendencias
    from gps.aluno_notas n
   where n.aluno_id = p_aluno_id and n.tipo = 'pendencia' and n.resolvido_em is null;

  select amb.pasta_drive_url into v_pasta
    from gps.ambientes amb where amb.aluno_id = p_aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etapa',    e.id,
           'nome',     e.nome,
           'liberada', coalesce(o.liberada, e.liberada),
           'global',   e.liberada,
           'origem',   case when o.liberada is null then 'global'
                            when o.liberada       then 'liberada_para_este_aluno'
                            else                       'travada_para_este_aluno' end,
           'motivo',   o.motivo,
           'em',       o.em) order by e.ordem), '[]'::jsonb),
         count(*) filter (where o.liberada is not null)
    into v_etapas, v_overrides
    from gps.etapas e
    left join gps.etapa_liberacao_aluno o
           on o.etapa = e.id and o.aluno_id = p_aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object('etapa', t.etapa, 'concluidas', t.n)
                            order by t.etapa), '[]'::jsonb),
         coalesce(sum(t.n), 0)
    into v_progresso, v_concluidas
    from (select p.etapa, count(*) filter (where p.concluida) as n
            from gps.progresso p where p.aluno_id = p_aluno_id
           group by p.etapa) t;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'email', s.email,
           'telefone', s.telefone, 'criado_em', s.criado_em)), '[]'::jsonb)
    into v_solic
    from gps.solicitacoes_acesso s
   where s.status = 'pendente'
     and (s.aluno_id = p_aluno_id
          or (coalesce(btrim(v_aluno.email), '') <> ''
              and lower(btrim(coalesce(s.email, ''))) = lower(btrim(v_aluno.email)))
          or s.user_id in (select m.user_id from gps.membros m
                            where m.aluno_id = p_aluno_id and m.user_id is not null));

  return jsonb_build_object(
    'aluno_id',       p_aluno_id,
    'nome',           v_aluno.nome,
    'email_cadastro', v_aluno.email,
    'gerado_em',      now(),
    'acesso',         v_acesso,
    'direito',        v_direito,
    'membros',        v_membros,
    'etapas',         v_etapas,
    'progresso',      v_progresso,
    'candidatos_financeiro',  v_candidatos,
    'solicitacoes_pendentes', v_solic,
    'verificacoes', jsonb_build_array(
      jsonb_build_object('chave', 'login', 'ok', v_tem_login,
        'valor', v_acesso->>'email_login',
        'detalhe', case when v_tem_login then null
                        else 'Ninguém neste ambiente tem login para entrar no portal.' end),
      jsonb_build_object('chave', 'senha',
        'ok', case when not v_tem_login then null
                   else coalesce((v_acesso->>'tem_senha')::boolean, false) end,
        'valor', null,
        'detalhe', case when v_sem_senha > 0
                        then v_sem_senha::text || ' membro(s) com login e sem senha definida.'
                        else null end),
      jsonb_build_object('chave', 'email_confirmado',
        'ok', case when not v_tem_login then null
                   else coalesce((v_acesso->>'email_confirmado')::boolean, false) end,
        'valor', null, 'detalhe', null),
      jsonb_build_object('chave', 'email_bate',
        'ok', case when not v_tem_login then null else v_email_bate end,
        'valor', coalesce(v_acesso->>'email_login', '(sem login)')
                 || ' / ' || coalesce(v_aluno.email, '(cadastro sem e-mail)'),
        'detalhe', case when v_tem_login and not v_email_bate
                        then 'O e-mail do cadastro não é o mesmo do login. Alinhe o CADASTRO ao LOGIN — o login é o que a pessoa digita e vale nos outros portais do grupo.'
                        else null end),
      jsonb_build_object('chave', 'vinculo_programa',
        'ok', v_qtd_membros > 0, 'valor', v_qtd_membros::text || ' membro(s)',
        'detalhe', case when v_qtd_membros = 0
                        then 'Este cadastro não tem ambiente no programa.' else null end),
      jsonb_build_object('chave', 'titular', 'ok', v_titulares > 0, 'valor', null,
        'detalhe', case when v_titulares = 0
                        then 'Ambiente sem titular: ninguém lê o Financeiro e não dá para adicionar sócio.'
                        else null end),
      jsonb_build_object('chave', 'membros_com_pessoa', 'ok', v_sem_pessoa = 0,
        'valor', (v_qtd_membros - v_sem_pessoa)::text || ' de ' || v_qtd_membros::text,
        'detalhe', case when v_sem_pessoa > 0
                        then 'Membro sem cadastro vinculado aparece sem nome e sem telefone nas telas da equipe.'
                        else null end),
      jsonb_build_object('chave', 'membros_com_login', 'ok', v_sem_login = 0,
        'valor', (v_qtd_membros - v_sem_login)::text || ' de ' || v_qtd_membros::text,
        'detalhe', null),
      jsonb_build_object('chave', 'ultimo_acesso', 'ok', null,
        'valor', v_ultimo_acesso,
        'detalhe', case when v_ultimo_acesso is null
                        then 'Nunca entrou no portal.' else null end),
      jsonb_build_object('chave', 'solicitacao_pendente',
        'ok', jsonb_array_length(v_solic) = 0,
        'valor', jsonb_array_length(v_solic)::text,
        'detalhe', case when jsonb_array_length(v_solic) > 0
                        then 'Há pedido de acesso esperando decisão na fila de /admin.'
                        else null end),
      jsonb_build_object('chave', 'direito_ao_acesso',
        'ok', coalesce((v_direito->>'tem_direito')::boolean, false),
        'valor', v_direito->>'motivo', 'detalhe', null),
      jsonb_build_object('chave', 'financeiro_contrato', 'ok', v_contratos > 0,
        'valor', v_contratos::text || ' contrato(s)',
        'detalhe', case
                     when v_contratos > 0 then null
                     when v_qtd_candidatos > 0
                       then 'Sem registro em cs.contatos_hm, mas há ' || v_qtd_candidatos::text
                            || ' contrato(s) órfão(s) que casam por e-mail ou CPF/CNPJ.'
                     else 'Sem registro em cs.contatos_hm e sem candidato que case por e-mail ou CPF/CNPJ.'
                   end),
      jsonb_build_object('chave', 'financeiro_candidatos', 'ok', null,
        'valor', v_qtd_candidatos::text, 'detalhe', null),
      jsonb_build_object('chave', 'clientes', 'ok', v_com_dados >= 30,
        'valor', v_com_dados::text || ' com dados de ' || v_clientes::text || ' listados (meta 30)',
        'detalhe', case when v_com_dados < 30
                        then 'A tarefa 1.1 cobra 30 clientes com nome, telefone e nível de relacionamento.'
                        else null end),
      jsonb_build_object('chave', 'cliente_favorito', 'ok', v_favorito, 'valor', null,
        'detalhe', case when v_favorito then null
                        else 'Sem cliente acompanhado pela equipe, os passos 4 a 8 da Etapa 01 ficam travados.'
                   end),
      jsonb_build_object('chave', 'tarefa_atual', 'ok', null,
        'valor', v_concluidas::text || ' tarefa(s) concluída(s)',
        'detalhe', 'A próxima tarefa é calculada por proximoPasso() no aplicativo — o catálogo de tarefas não está no banco.'),
      jsonb_build_object('chave', 'etapas', 'ok', null,
        'valor', v_overrides::text || ' etapa(s) com regra própria para este aluno',
        'detalhe', null),
      jsonb_build_object('chave', 'chamados_abertos',
        'ok', case when v_chamados_aberto > 0 then false
                   when v_chamados > 0        then null
                   else                            true end,
        'valor', case when v_chamados = 0 then '0'
                      else v_chamados::text
                           || ' (' || v_chamados_aberto::text || ' aguardando a equipe, '
                           || v_chamados_respondido::text || ' aguardando o aluno)' end,
        'detalhe', case
                     when v_chamados_aberto > 0 and v_chamados_respondido > 0
                       then v_chamados_aberto::text || ' chamado(s) aguardando resposta da equipe e '
                            || v_chamados_respondido::text || ' já respondido(s), aguardando o aluno.'
                     when v_chamados_aberto > 0
                       then 'Chamado aguardando resposta da equipe.'
                     when v_chamados_respondido > 0
                       then 'A equipe já respondeu — o chamado aguarda o aluno.'
                     else null end),
      jsonb_build_object('chave', 'pendencias_diario', 'ok', v_pendencias = 0,
        'valor', v_pendencias::text,
        'detalhe', case when v_pendencias > 0
                        then 'Pendência anotada pela equipe e ainda sem baixa.' else null end),
      jsonb_build_object('chave', 'pasta_drive', 'ok', v_pasta is not null,
        'valor', v_pasta,
        'detalhe', case when v_pasta is null
                        then 'Sem link da pasta do Drive: a aba Pasta abre vazia para o aluno.'
                        else null end)
    )
  );
end $function$;

-- gps.admin_direito_ao_acesso(uuid)
CREATE OR REPLACE FUNCTION gps.admin_direito_ao_acesso(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_ok boolean; v_motivo text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into v from cs.vw_gps_acessos where aluno_id = p_aluno_id;
  if not found then
    return jsonb_build_object('tem_direito', false,
      'motivo', 'Aluno não encontrado na base de acessos (sem compra vinculada).');
  end if;
  if v.cancelado_em is not null then
    v_ok := false; v_motivo := 'Matrícula cancelada em ' || to_char(v.cancelado_em,'DD/MM/YYYY') || '.';
  elsif coalesce(v.situacao_financeira,'') = 'reembolsado' then
    v_ok := false; v_motivo := 'Compra reembolsada.';
  elsif coalesce(v.status_acesso,'') = '' and coalesce(v.situacao_financeira,'') = 'so_sinal' then
    v_ok := false; v_motivo := 'Pagou só o sinal — acesso ainda não liberado.';
  else
    v_ok := true;
    v_motivo := 'Acesso ' || coalesce(v.status_acesso,'sem status')
             || ' / financeiro ' || coalesce(v.situacao_financeira,'não informado')
             || case when v.acesso_vencido then ' (prazo vencido)' else '' end || '.';
  end if;
  return jsonb_build_object(
    'tem_direito', v_ok, 'motivo', v_motivo,
    'nome', v.nome, 'email', v.email, 'turma', v.turma, 'plano', v.plano,
    'status_acesso', v.status_acesso, 'situacao_financeira', v.situacao_financeira,
    'acesso_vencido', v.acesso_vencido, 'data_expiracao', v.data_expiracao);
end $function$;

-- gps.admin_excluir_acesso(uuid,boolean)
CREATE OR REPLACE FUNCTION gps.admin_excluir_acesso(p_aluno_id uuid, p_confirmar_perda boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid; v_email text; v_login_apagado boolean := false; v_outros uuid[];
  v_motivo text := null; v_nome text;
  v_conteudo jsonb; v_resumo jsonb; v_lixeira_id uuid;
  v_clientes int; v_progresso int; v_notas int; v_chamados int; v_eventos int;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_user := gps.admin_user_do_aluno(p_aluno_id);
  if v_user is not null then
    if gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — não pode ser excluída por aqui.' using errcode = '42501';
    end if;
    if v_user = auth.uid() then
      raise exception 'Você não pode excluir o próprio acesso.' using errcode = '42501';
    end if;
    select email into v_email from auth.users where id = v_user;
  end if;

  select t.nome into v_nome from public.thb_alunos t where t.id = p_aluno_id;

  select count(*) into v_clientes  from gps.etapa1_clientes c where c.aluno_id = p_aluno_id;
  select count(*) into v_progresso from gps.progresso p       where p.aluno_id = p_aluno_id;
  select count(*) into v_notas     from gps.aluno_notas n     where n.aluno_id = p_aluno_id;
  select count(*) into v_chamados  from gps.chamados ch       where ch.aluno_id = p_aluno_id;
  select count(*) into v_eventos   from gps.aluno_eventos e   where e.aluno_id = p_aluno_id;

  if not p_confirmar_perda
     and (v_clientes > 0 or v_progresso > 0 or v_notas > 0 or v_chamados > 0) then
    raise exception 'Este ambiente tem conteúdo: % cliente(s), % tarefa(s), % nota(s), % chamado(s). Confirme a exclusão para prosseguir — o conteúdo vai para a lixeira, mas some do portal.',
      v_clientes, v_progresso, v_notas, v_chamados
      using errcode = 'P0004';
  end if;

  v_conteudo := jsonb_build_object(
    'clientes',  coalesce((select jsonb_agg(to_jsonb(c)) from gps.etapa1_clientes c
                            where c.aluno_id = p_aluno_id), '[]'::jsonb),
    'progresso', coalesce((select jsonb_agg(to_jsonb(p)) from gps.progresso p
                            where p.aluno_id = p_aluno_id), '[]'::jsonb),
    'notas',     coalesce((select jsonb_agg(to_jsonb(n)) from gps.aluno_notas n
                            where n.aluno_id = p_aluno_id), '[]'::jsonb),
    'chamados',  coalesce((select jsonb_agg(to_jsonb(ch)) from gps.chamados ch
                            where ch.aluno_id = p_aluno_id), '[]'::jsonb),
    'membros',   coalesce((select jsonb_agg(to_jsonb(mm)) from gps.membros mm
                            where mm.aluno_id = p_aluno_id), '[]'::jsonb),
    'onboarding',coalesce((select jsonb_agg(to_jsonb(r)) from gps.onboarding_respostas r
                            join gps.membros m2 on m2.pessoa_aluno_id = r.pessoa_aluno_id
                           where m2.aluno_id = p_aluno_id), '[]'::jsonb));

  v_resumo := jsonb_build_object(
    'clientes', v_clientes, 'progresso', v_progresso, 'notas', v_notas,
    'chamados', v_chamados, 'eventos', v_eventos);

  insert into gps.lixeira_ambientes
    (aluno_id, email_alvo, nome_alvo, conteudo, resumo, excluido_por)
  values (p_aluno_id, v_email, v_nome, v_conteudo, v_resumo, auth.uid())
  returning id into v_lixeira_id;

  select array_agg(m.user_id) into v_outros
    from gps.membros m
   where m.aluno_id = p_aluno_id and m.user_id is not null
     and m.user_id <> coalesce(v_user, '00000000-0000-0000-0000-000000000000'::uuid)
     and not gps.admin_alvo_e_equipe(m.user_id) and m.user_id <> auth.uid();

  delete from gps.progresso              where aluno_id = p_aluno_id;
  delete from gps.tarefa_enfase          where aluno_id = p_aluno_id;
  delete from gps.reuniao_agendamentos   where aluno_id = p_aluno_id;
  delete from gps.etapa3_agendamentos    where aluno_id = p_aluno_id;
  delete from gps.etapa3_revisao         where aluno_id = p_aluno_id;

  delete from gps.reuniao_preliminar_propostas where aluno_id = p_aluno_id;
  delete from gps.reuniao_eventos              where aluno_id = p_aluno_id;
  delete from gps.etapa_liberacao_aluno        where aluno_id = p_aluno_id;
  delete from gps.chamado_solicitacoes         where ambiente_aluno_id = p_aluno_id;
  delete from gps.socio_convites               where ambiente_aluno_id = p_aluno_id;
  delete from gps.resgate_tentativas           where aluno_id = p_aluno_id;
  delete from gps.onboarding_respostas         where ambiente_aluno_id = p_aluno_id;

  delete from gps.etapa1_clientes        where aluno_id = p_aluno_id;
  delete from gps.agenda                 where aluno_id = p_aluno_id;
  delete from gps.aluno_notas            where aluno_id = p_aluno_id;
  delete from gps.aluno_eventos          where aluno_id = p_aluno_id;
  delete from gps.chamados               where aluno_id = p_aluno_id;
  declare v_blindagem_anterior text := current_setting('app.mudanca_em_massa', true);
  begin
  perform blindagem.autorizar('exclusão de acesso de 1 ambiente (admin_excluir_acesso)');
  delete from gps.membros                where aluno_id = p_aluno_id;
  delete from gps.ambientes              where aluno_id = p_aluno_id;
  perform set_config('app.mudanca_em_massa', coalesce(v_blindagem_anterior, ''), true);
  end;
  delete from gps.solicitacoes_acesso    where aluno_id = p_aluno_id;

  if v_outros is not null then
    delete from gps.solicitacoes_acesso where user_id = any(v_outros);
    begin
      delete from auth.users where id = any(v_outros);
    exception when foreign_key_violation then null;
    end;
  end if;

  if v_user is not null then
    delete from gps.solicitacoes_acesso where user_id = v_user;
    begin
      delete from auth.users where id = v_user;
      v_login_apagado := true;
    exception when foreign_key_violation then
      v_login_apagado := false;
      v_motivo := 'A conta tem registros em outros sistemas do grupo; o login foi preservado e só os dados do programa foram apagados.';
    end;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('acesso_excluido', p_aluno_id, v_user, v_email,
          case when v_login_apagado then 'login e dados do GPS (inclui diário, log de ações e chamados)'
               else 'apenas dados do GPS (inclui diário, log de ações e chamados)'
                    || coalesce(' — ' || v_motivo, '') end,
          auth.uid());

  return jsonb_build_object('login_apagado', v_login_apagado, 'email', v_email,
                            'login_preservado_motivo', v_motivo,
                            'na_lixeira', v_lixeira_id);
end $function$;

-- gps.admin_excluir_membro(uuid)
CREATE OR REPLACE FUNCTION gps.admin_excluir_membro(p_membro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.papel = 'titular' then
    raise exception 'Este é o titular do ambiente. Para remover, use "Excluir acesso".' using errcode = '42501';
  end if;
  if m.user_id = auth.uid() then
    raise exception 'Você não pode excluir o próprio acesso.' using errcode = '42501';
  end if;
  if m.user_id is not null and gps.admin_alvo_e_equipe(m.user_id) then
    raise exception 'Esta conta é da equipe — não pode ser excluída por aqui.' using errcode = '42501';
  end if;

  if m.user_id is not null then
    select email into v_email from auth.users where id = m.user_id;
  end if;

  delete from gps.membros where id = p_membro_id;

  if m.user_id is not null then
    delete from gps.solicitacoes_acesso where user_id = m.user_id;
    begin
      delete from auth.users where id = m.user_id;
    exception when foreign_key_violation then null;
    end;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_excluido', m.aluno_id, m.user_id, v_email, 'sócio removido do ambiente', auth.uid());

  return jsonb_build_object('email', v_email);
end $function$;

-- gps.admin_financeiro_candidatos(uuid)
CREATE OR REPLACE FUNCTION gps.admin_financeiro_candidatos(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_out jsonb; v_ja_tem int;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;
  select count(*) into v_ja_tem from cs.contatos_hm h where h.aluno_id = p_aluno_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'contato_hm_id', x.contato_hm_id,
           'produto',       x.produto,
           'plano',         x.plano,
           'turma',         x.turma,
           'valor_total',   x.valor_total,
           'criado_em',     x.criado_em,
           'casou_por',     x.casou_por,
           'email',         x.email,
           'documento_final', x.documento_final)), '[]'::jsonb)
    into v_out
    from (select * from gps.financeiro_candidatos_do_aluno(p_aluno_id) limit 5) x;
  return jsonb_build_object('candidatos', v_out, 'ja_tem', v_ja_tem);
end $function$;

-- gps.admin_financeiro_desvincular(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_financeiro_desvincular(p_aluno_id uuid, p_contato_hm_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id text; v_linhas int; v_nosso boolean;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_id := btrim(coalesce(p_contato_hm_id, ''));
  if p_aluno_id is null or v_id = '' or length(v_id) > 64 then
    raise exception 'contrato nao informado' using errcode = '22023';
  end if;
  select exists (select 1 from gps.acessos_log l
                  where l.acao = 'financeiro_vinculado'
                    and l.aluno_id = p_aluno_id
                    and l.detalhe = v_id)
    into v_nosso;
  update cs.contatos_hm
     set aluno_id = null
   where id::text = v_id
     and aluno_id = p_aluno_id;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'O contrato não está vinculado a este aluno.' using errcode = 'P0002';
  end if;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('financeiro_desvinculado', p_aluno_id,
          v_id || case when v_nosso then '' else ' (vínculo de origem: sistema externo)' end,
          auth.uid());
  return jsonb_build_object('contato_hm_id', v_id,
                            'vinculado_pelo_portal', v_nosso);
end $function$;

-- gps.admin_financeiro_vincular(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_financeiro_vincular(p_aluno_id uuid, p_contato_hm_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id text; v_linhas int;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_id := btrim(coalesce(p_contato_hm_id, ''));
  if p_aluno_id is null or v_id = '' or length(v_id) > 64 then
    raise exception 'contrato nao informado' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.financeiro_candidatos_do_aluno(p_aluno_id) x
                  where x.contato_hm_id = v_id) then
    raise exception 'Este contrato não é candidato deste aluno (e-mail e CPF/CNPJ não coincidem, ou ele já pertence a outro cadastro).'
      using errcode = '42501';
  end if;
  update cs.contatos_hm
     set aluno_id = p_aluno_id
   where id::text = v_id
     and aluno_id is null;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'O contrato deixou de estar livre. Recarregue o diagnóstico.'
      using errcode = '40001';
  end if;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('financeiro_vinculado', p_aluno_id, v_id, auth.uid());
  return jsonb_build_object('contato_hm_id', v_id, 'aluno_id', p_aluno_id);
end $function$;

-- gps.admin_liberar_acompanhamento(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_liberar_acompanhamento(p_cliente_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_motivo text;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_cliente_id is null then raise exception 'cliente nao informado' using errcode = '22023'; end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.' using errcode = '22023'; end if;
  if length(v_motivo) > 300 then raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023'; end if;
  select c.id, c.aluno_id, c.nome, c.acompanhamento_confirmado_em into v_c
    from gps.etapa1_clientes c where c.id = p_cliente_id;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if v_c.acompanhamento_confirmado_em is null then
    raise exception 'A equipe não está acompanhando este cliente.' using errcode = '22023';
  end if;
  update gps.etapa1_clientes set acompanhamento_confirmado_em = null, acompanhamento_confirmado_por = null where id = p_cliente_id;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('favorito_liberado', v_c.aluno_id, format('cliente %s liberado: o aluno volta a poder trocar o cliente acompanhado. Motivo: %s', p_cliente_id, v_motivo), auth.uid());
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'favorito_liberado_pela_equipe', 'cliente', p_cliente_id,
          left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300), jsonb_build_object('motivo', v_motivo), 'equipe', auth.uid(), 'app');
  return jsonb_build_object('cliente_id', p_cliente_id, 'aluno_id', v_c.aluno_id, 'confirmado', false);
end $function$;

-- gps.admin_liberar_aluno_plantao(text,text,text,text,boolean)
CREATE OR REPLACE FUNCTION gps.admin_liberar_aluno_plantao(p_email text, p_nome text, p_documento text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_confirmar_mesmo_no_programa boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(trim(p_email));
  v_nome text := trim(p_nome);
  v_id uuid;
  v_reativado boolean;
  v_no_programa boolean;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  if v_nome is null or length(v_nome) = 0 then
    raise exception 'Informe o nome.' using errcode = '22023';
  end if;

  -- 🔑 Esta funcao grava `bloqueio_excecao = true`, que blinda a pessoa
  -- contra o cron de reconciliacao PARA SEMPRE. Liberar alguem do Programa
  -- aqui, sem perceber, criaria um furo permanente na exclusividade do
  -- Plantao. Recusa com P0003 e devolve o fato; a tela confirma.
  select exists (select 1 from gps.membros m
                  join public.thb_alunos t on t.id = m.aluno_id
                 where lower(btrim(t.email)) = v_email)
    into v_no_programa;

  if v_no_programa and not coalesce(p_confirmar_mesmo_no_programa, false) then
    raise exception 'Esta pessoa está no Programa de Implementação Assistida. O Plantão é exclusivo do Acelera Holding. Liberá-la cria uma exceção PERMANENTE (a reconciliação automática deixa de bloqueá-la).'
      using errcode = 'P0003';
  end if;

  insert into gps.plantao_alunos (email, nome, documento, telefone, origem, lote, ativo, bloqueio_excecao)
  values (v_email, v_nome, nullif(trim(p_documento), ''), nullif(trim(p_telefone), ''),
          'liberacao_manual', to_char(now(), 'YYYY-MM'), true, true)
  on conflict (email) do update
     set nome = excluded.nome,
         documento = coalesce(excluded.documento, gps.plantao_alunos.documento),
         telefone = coalesce(excluded.telefone, gps.plantao_alunos.telefone),
         ativo = true,
         bloqueio_excecao = true,
         bloqueado_por_programa = false
  returning id, (xmax <> 0) into v_id, v_reativado;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_id, case when v_no_programa
                     then 'plantao_liberado_manualmente_mesmo_no_programa'
                     else 'plantao_liberado_manualmente' end);

  return jsonb_build_object('id', v_id, 'email', v_email, 'reativado', v_reativado,
                            'estava_no_programa', v_no_programa);
end $function$;

-- gps.admin_lixeira_expurgar(integer)
CREATE OR REPLACE FUNCTION gps.admin_lixeira_expurgar(p_dias integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_alvo int; v_ids uuid[];
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_dias is not null and (p_dias < 0 or p_dias > 3650) then
    raise exception 'Prazo inválido.' using errcode = '22023';
  end if;

  select array_agg(id) into v_ids
    from gps.lixeira_ambientes
   where conteudo <> '{}'::jsonb
     and case when p_dias is null then expurgar_em <= now()
              else excluido_em <= now() - make_interval(days => p_dias) end;

  v_alvo := coalesce(array_length(v_ids, 1), 0);
  if v_alvo = 0 then
    return jsonb_build_object('expurgados', 0);
  end if;

  update gps.lixeira_ambientes
     set conteudo = '{}'::jsonb
   where id = any(v_ids);

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('lixeira_expurgada', null,
    format('%s retrato(s) tiveram o conteudo apagado (PII de clientes de terceiros). Resumo numerico preservado para auditoria.', v_alvo),
    auth.uid());

  return jsonb_build_object('expurgados', v_alvo);
end $function$;

-- gps.admin_lixeira_restaurar_clientes(uuid,uuid)
CREATE OR REPLACE FUNCTION gps.admin_lixeira_restaurar_clientes(p_lixeira_id uuid, p_para_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lix record; v_nome_alvo text;
  v_restaurados int := 0; v_ja_existiam int := 0; v_total int := 0;
  v_c jsonb; v_nome text; v_tel text; v_novo_id uuid;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select * into v_lix from gps.lixeira_ambientes where id = p_lixeira_id;
  if not found then
    raise exception 'Retrato não encontrado na lixeira.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from gps.membros m where m.aluno_id = p_para_aluno_id) then
    raise exception 'O ambiente de destino não existe ou não tem ninguém dentro. Crie o acesso antes de restaurar.'
      using errcode = '22023';
  end if;

  select t.nome into v_nome_alvo from public.thb_alunos t where t.id = p_para_aluno_id;

  for v_c in select * from jsonb_array_elements(coalesce(v_lix.conteudo->'clientes', '[]'::jsonb))
  loop
    v_total := v_total + 1;
    v_nome := btrim(coalesce(v_c->>'nome', ''));
    v_tel  := regexp_replace(coalesce(v_c->>'telefone', ''), '\D', '', 'g');

    if exists (
      select 1 from gps.etapa1_clientes c
       where c.aluno_id = p_para_aluno_id
         and lower(btrim(coalesce(c.nome,''))) = lower(v_nome)
         and regexp_replace(coalesce(c.telefone,''), '\D', '', 'g') = v_tel
    ) then
      v_ja_existiam := v_ja_existiam + 1;
      continue;
    end if;

    insert into gps.etapa1_clientes (
      aluno_id, nome, telefone, grau_relacao, perfil_disc,
      data_reuniao_preliminar, aderiu_reuniao, registro_contato,
      valor_honorarios, problemas, criado_em
    )
    values (
      p_para_aluno_id,
      v_nome,
      nullif(v_c->>'telefone', ''),
      nullif(v_c->>'grau_relacao',''),
      nullif(v_c->>'perfil_disc',''),
      (nullif(v_c->>'data_reuniao_preliminar',''))::date,
      coalesce((nullif(v_c->>'aderiu_reuniao',''))::boolean, false),
      nullif(v_c->>'registro_contato',''),
      (nullif(v_c->>'valor_honorarios',''))::numeric,
      coalesce(
        case when jsonb_typeof(v_c->'problemas') = 'array'
             then (select array_agg(x) from jsonb_array_elements_text(v_c->'problemas') x)
             else null end,
        '{}'::text[]),
      coalesce((nullif(v_c->>'criado_em',''))::timestamptz, now())
    )
    returning id into v_novo_id;

    -- …354: fase derivada (…353). O retrato guarda a fase antiga; marca as
    -- etapas pelo MESMO mapa da carga do legado e o gatilho recalcula.
    insert into gps.cliente_trajetoria (cliente_id, etapa_codigo, marcado_por)
    select v_novo_id, e.codigo, auth.uid()
      from unnest(gps.cliente_fase_etapas_legado(nullif(v_c->>'fase',''))) as e(codigo);

    v_restaurados := v_restaurados + 1;

    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id,
      rotulo, detalhe, ator, ator_user_id, origem)
    values (p_para_aluno_id, now(), 'cliente_cadastrado', 'cliente', v_novo_id,
      left(coalesce(nullif(v_nome,''), 'Cliente sem nome'), 300),
      jsonb_build_object('restaurado_da_lixeira', p_lixeira_id),
      'equipe', auth.uid(), 'app');
  end loop;

  update gps.lixeira_ambientes
     set restaurado_em = now(), restaurado_por = auth.uid()
   where id = p_lixeira_id;

  insert into gps.acessos_log (acao, aluno_id, email_alvo, detalhe, feito_por)
  values ('clientes_restaurados', p_para_aluno_id, v_lix.email_alvo,
    format('Restaurados da lixeira (retrato de %s, excluido em %s): %s cliente(s) devolvido(s), %s ja existiam, %s no retrato. Destino: %s.',
      coalesce(v_lix.nome_alvo,'(sem nome)'),
      to_char(v_lix.excluido_em, 'DD/MM/YYYY HH24:MI'),
      v_restaurados, v_ja_existiam, v_total, coalesce(v_nome_alvo,'(sem nome)')),
    auth.uid());

  return jsonb_build_object(
    'restaurados', v_restaurados,
    'ja_existiam', v_ja_existiam,
    'total_no_retrato', v_total,
    'destino', p_para_aluno_id);
end $function$;

-- gps.admin_marcar_finalizado(uuid,boolean)
CREATE OR REPLACE FUNCTION gps.admin_marcar_finalizado(p_aluno_id uuid, p_finalizado boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ator uuid; v_nome text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_ator := auth.uid();

  select a.nome into v_nome from public.thb_alunos a where a.id = p_aluno_id;
  if v_nome is null then
    raise exception 'Parceiro não encontrado.' using errcode = 'P0002';
  end if;

  update gps.membros
     set finalizado_em  = case when p_finalizado then now() else null end,
         finalizado_por = case when p_finalizado then v_ator else null end
   where aluno_id = p_aluno_id and papel = 'titular';

  insert into gps.acessos_log (aluno_id, acao, detalhe, feito_por)
  values (p_aluno_id,
    case when p_finalizado then 'etapa_liberacao_alterada' else 'etapa_liberacao_alterada' end,
    case when p_finalizado
      then 'Parceiro marcado como FINALIZADO pela equipe. A fase deixou de ser automatica em 10/09/2026: somar R$ 150 mil em honorarios nao move mais ninguem sozinho.'
      else 'Marcacao de finalizado REMOVIDA pela equipe.' end,
    v_ator);

  return jsonb_build_object('ok', true, 'finalizado', p_finalizado, 'nome', v_nome);
end;
$function$;

-- gps.admin_mencionaveis()
CREATE OR REPLACE FUNCTION gps.admin_mencionaveis()
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select p.id, coalesce(nullif(btrim(p.nome), ''), 'Sem nome') as nome
    from gps.admins a
    join public.perfis p on p.id = a.user_id  -- nota_mencoes.perfil_id referencia perfis
   where a.ativo  -- 20261008000368: mencionável = admin ativo do GPS
   order by 2, 1;
end $function$;

-- gps.admin_mover_membro(uuid,uuid)
CREATE OR REPLACE FUNCTION gps.admin_mover_membro(p_membro_id uuid, p_novo_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_membro_id is null or p_novo_aluno_id is null then
    raise exception 'membro ou ambiente de destino nao informado' using errcode = '22023';
  end if;
  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.papel = 'titular' then
    raise exception 'O titular não pode ser movido — o ambiente é dele. Troque o titular primeiro.'
      using errcode = '42501';
  end if;
  if m.aluno_id = p_novo_aluno_id then
    raise exception 'Este membro já está neste ambiente.' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.membros t
                  where t.aluno_id = p_novo_aluno_id and t.papel = 'titular') then
    raise exception 'O ambiente de destino não tem titular.' using errcode = 'P0002';
  end if;
  if m.user_id is not null
     and exists (select 1 from gps.membros x
                  where x.aluno_id = p_novo_aluno_id and x.user_id = m.user_id) then
    raise exception 'Este login já participa do ambiente de destino.' using errcode = '23505';
  end if;
  if m.user_id is null
     and exists (select 1 from gps.membros x
                  where x.aluno_id = p_novo_aluno_id and x.user_id is null) then
    raise exception 'O ambiente de destino já tem um membro sem login.' using errcode = '23505';
  end if;
  update gps.membros set aluno_id = p_novo_aluno_id where id = p_membro_id;
  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_movido', m.aluno_id, m.user_id, v_email,
          format('sócio SAIU deste ambiente para %s. O que ele registrou fica aqui (cliente, progresso, nota e chamado são do ambiente).',
                 p_novo_aluno_id::text),
          auth.uid()),
         ('membro_movido', p_novo_aluno_id, m.user_id, v_email,
          format('sócio ENTROU vindo de %s. O histórico dele continua no ambiente anterior.',
                 m.aluno_id::text),
          auth.uid());
  return jsonb_build_object('membro_id', m.id, 'de', m.aluno_id,
                            'para', p_novo_aluno_id, 'email', v_email);
end $function$;

-- gps.admin_onboarding_do_aluno(uuid)
CREATE OR REPLACE FUNCTION gps.admin_onboarding_do_aluno(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_saida jsonb;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'papel', linha->>'nome'), '[]'::jsonb)
    into v_saida
    from (
      select jsonb_build_object(
               'membro_id',       m.id,
               'pessoa_aluno_id', m.pessoa_aluno_id,
               'papel',           m.papel,
               'nome',            p.nome,
               'email',           p.email,
               'telefone',        p.telefone,
               'cidade',          p.cidade,
               'estado',          p.estado,
               'status', case when r.pessoa_aluno_id is null then 'nao_iniciado'
                              when r.concluido_em is not null then 'concluido'
                              else 'em_andamento' end,
               'versao',          r.versao,
               'passo_atual',     r.passo_atual,
               'iniciado_em',     r.iniciado_em,
               'concluido_em',    r.concluido_em,
               'origem_cliente1', r.origem_cliente1,
               'fase_cliente1',   r.fase_cliente1,
               'valor_honorarios', r.valor_honorarios,
               'cliente_id',      r.cliente_id,
               'cliente_nome',    r.cliente_nome,
               'descricao_caso',  r.descricao_caso,
               'ajuda_pronta',    r.ajuda_pronta,
               'anexos', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', a.id, 'tipo', a.tipo, 'nome', a.nome,
                          'mime', a.mime, 'tamanho', a.tamanho, 'path', a.path,
                          'criado_em', a.criado_em) order by a.criado_em)
                   from gps.onboarding_anexos a
                  where a.pessoa_aluno_id = r.pessoa_aluno_id), '[]'::jsonb)
             ) as linha
        from gps.membros m
        left join public.thb_alunos p on p.id = m.pessoa_aluno_id
        left join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
       where m.aluno_id = p_aluno_id
    ) s;

  return v_saida;
end $function$;

-- gps.admin_painel_alunos(integer,integer)
CREATE OR REPLACE FUNCTION gps.admin_painel_alunos(p_limite integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(aluno_id uuid, qtd_membros integer, tem_login boolean, desde timestamp with time zone, ultimo_acesso timestamp with time zone, clientes_preenchidos integer, clientes_com_dados integer, clientes_com_perda integer, agendados integer, tarefas_concluidas integer[], honorarios_contratados numeric, contratados integer, contratados_sem_valor integer, total_ambientes integer, onboarding_status text, em_fechamento integer, apto_ao_saldo boolean, classe text, favorito_nome text, favorito_fase text, favorito_confirmado boolean, lista_incompleta boolean, pronto_para_finalizar boolean, finalizado_em timestamp with time zone, socio_nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000); v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not gps.eh_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  return query
  with amb as (
    select m.aluno_id as aluno_id, count(*)::integer as qtd_membros, bool_or(m.user_id is not null) as tem_login,
           min(m.criado_em) as desde, max(m.criado_em) as ultimo_membro_em, max(u.last_sign_in_at) as ultimo_acesso,
           max(m.finalizado_em) as finalizado_em
      from gps.membros m left join auth.users u on u.id = m.user_id group by m.aluno_id
  ),
  soc as (
    select m.aluno_id as aluno_id,
           coalesce(nullif(btrim(ts.nome), ''), u.email) as socio_nome
      from gps.membros m
      left join auth.users u on u.id = m.user_id
      left join public.thb_alunos ts on ts.id = m.pessoa_aluno_id
     where m.papel = 'socio'
  ),
  cli as (
    select c.aluno_id as aluno_id,
           count(*) filter (where coalesce(btrim(c.nome), '') <> '')::integer as preenchidos,
           count(*) filter (where coalesce(btrim(c.nome), '') <> '' and coalesce(btrim(c.telefone), '') <> '')::integer as com_dados,
           count(*) filter (where c.perda_inercia is not null)::integer as com_perda,
           count(*) filter (where c.data_reuniao_preliminar is not null or c.aderiu_reuniao)::integer as agendados,
           sum(c.valor_honorarios) filter (where c.fase in ('contratado', 'concluido')) as honorarios_contratados,
           count(*) filter (where c.fase in ('contratado', 'concluido'))::integer as contratados,
           count(*) filter (where c.fase in ('contratado', 'concluido') and c.valor_honorarios is null)::integer as contratados_sem_valor,
           count(*) filter (where c.fase = 'fechamento')::integer as em_fechamento,
           bool_or(c.fase in ('contratado', 'concluido') and c.valor_honorarios is not null) as tem_contratado_com_valor,
           count(*) filter (where c.valor_honorarios is not null)::integer as com_honorarios,
           max(c.nome) filter (where c.acompanhado_equipe) as fav_nome,
           max(c.fase) filter (where c.acompanhado_equipe) as fav_fase,
           bool_or(c.acompanhado_equipe and c.acompanhamento_confirmado_em is not null) as fav_confirmado
      from gps.etapa1_clientes c group by c.aluno_id
  ),
  prog as (select p.aluno_id as aluno_id, array_agg(p.tarefa order by p.tarefa)::integer[] as tarefas from gps.progresso p where p.etapa = 1 and p.concluida group by p.aluno_id),
  entregues as (select p.aluno_id as aluno_id from gps.progresso p where p.etapa = 6 and p.concluida group by p.aluno_id),
  onb as (
    select m.aluno_id as aluno_id, max(case when r.pessoa_aluno_id is null then 0 when r.concluido_em is not null then 2 else 1 end) as estado
      from gps.membros m left join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
     where m.papel = 'titular' group by m.aluno_id
  ),
  anx as (
    select m.aluno_id as aluno_id, true as tem_contrato from gps.membros m join gps.onboarding_anexos a on a.pessoa_aluno_id = m.pessoa_aluno_id
     where a.tipo = 'contrato_honorarios' group by m.aluno_id
  )
  select a.aluno_id, a.qtd_membros, a.tem_login, a.desde, a.ultimo_acesso,
         coalesce(cl.preenchidos, 0), coalesce(cl.com_dados, 0), coalesce(cl.com_perda, 0), coalesce(cl.agendados, 0),
         coalesce(pr.tarefas, '{}'::integer[]), cl.honorarios_contratados, coalesce(cl.contratados, 0), coalesce(cl.contratados_sem_valor, 0),
         (count(*) over ())::integer,
         case coalesce(ob.estado, 0) when 2 then 'concluido' when 1 then 'em_andamento' else 'nao_iniciado' end,
         coalesce(cl.em_fechamento, 0),
         coalesce(cl.tem_contratado_com_valor, false) and coalesce(ax.tem_contrato, false),
         case
           -- 🔴 FINALIZADO SO POR MARCACAO DA EQUIPE (10/09/2026). Antes
           -- bastava somar R$ 150 mil e a fase virava sozinha. Decisao do
           -- Marcio: "somente a equipe considera o aluno como finalizado,
           -- depende da aprovacao previa da equipe".
           when a.finalizado_em is not null then 'finalizado'
           when coalesce(cl.com_dados, 0) < 30 then 'inicial'
           when en.aluno_id is not null then 'orientacao'
           when coalesce(cl.contratados, 0) > 0 and coalesce(cl.com_honorarios, 0) > 0 then 'execucao'
           else 'captacao'
         end,
         cl.fav_nome, cl.fav_fase, coalesce(cl.fav_confirmado, false),
         coalesce(cl.com_dados, 0) < 30,
         -- O sinal que a equipe olha para decidir: bateu a meta e ainda nao
         -- foi finalizado.
         coalesce(cl.honorarios_contratados, 0) >= 150000 and a.finalizado_em is null,
         a.finalizado_em,
         sc.socio_nome
    from amb a
    left join cli cl on cl.aluno_id = a.aluno_id
    left join soc sc on sc.aluno_id = a.aluno_id
    left join prog pr on pr.aluno_id = a.aluno_id
    left join onb ob on ob.aluno_id = a.aluno_id
    left join anx ax on ax.aluno_id = a.aluno_id
    left join entregues en on en.aluno_id = a.aluno_id
   order by a.ultimo_membro_em desc, a.aluno_id
   limit v_limite offset v_offset;
end;
$function$;

commit;
