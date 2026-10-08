-- ═══════════════════════════════════════════════════════════════════════════
-- 368 — ADMIN DO GPS SEPARADO (3/5): funções, parte 1 de 6
-- ═══════════════════════════════════════════════════════════════════════════
-- GERADO POR SCRIPT a partir do corpo VIVO (pg_get_functiondef, 08/10/2026;
-- md5 de cada corpo conferido contra o banco na geração e de novo na aplicação).
-- Substituições, e só elas:
--   (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false))
--      → gps.eh_admin()            [guarda inteira; o GPS deixa de depender do acesso]
--   coalesce(public.gp_is_admin(), false) → gps.eh_admin()
--   gps.eh_equipe() = gps.eh_admin() or gps.eh_operador()
--      (perde o ramo gp_acesso_pode_editar('educacional'); medido: 1 conta só
--       passava por ele)
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
-- FUNÇÕES DESTA PARTE (16):
--   gps.eh_equipe() [tinha gp_acesso_pode_editar]
--   gps.admin_adicionar_socio(uuid,uuid,text,text,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_adotar_login_existente(uuid,text,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_ajuda_metricas() [tinha gp_acesso_pode_editar]
--   gps.admin_ajuda_salvar(uuid,text,text,text[],text[],text,text,boolean,integer) [tinha gp_acesso_pode_editar]
--   gps.admin_alvo_e_equipe(uuid)
--   gps.admin_apagar_nota(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_cadastrar_compradores_hm(boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_clientes_agenda_kpis() [tinha gp_acesso_pode_editar]
--   gps.admin_clientes_lista(integer,integer,text,text,text,text,text) [tinha gp_acesso_pode_editar]
--   gps.admin_clientes_reuniao_kpis() [tinha gp_acesso_pode_editar]
--   gps.admin_compradores_hm_aguardando() [tinha gp_acesso_pode_editar]
--   gps.admin_confirmar_acompanhamento(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_converter_titular_em_socio(uuid,uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_dashboard() [tinha gp_acesso_pode_editar]
--   gps.admin_definir_liberacao_etapa(uuid,smallint,boolean,text) [tinha gp_acesso_pode_editar]
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- gps.eh_equipe() é função guardada pela blindagem (363).
select blindagem.autorizar_guarda('20261008000368: gps.eh_equipe passa a ler gps.eh_admin() (separação do admin do GPS, aprovado pelo João 08/10)');

do $guarda$
declare
  r record;
  v_ruins text[] := '{}';
begin
  for r in
    select x.rp, x.md5_antes, p.oid, md5(pg_get_functiondef(p.oid)) as md5_agora, p.prosrc
      from (values
        ('gps.eh_equipe()', '3dcf3acae01a30610ae63906dec25cfc'),
        ('gps.admin_adicionar_socio(uuid,uuid,text,text,boolean)', '992cc5c2eebdb32bb3d9d7778e723d03'),
        ('gps.admin_adotar_login_existente(uuid,text,boolean)', 'afff0a0339d78f011c3b4472e53b9b91'),
        ('gps.admin_ajuda_metricas()', 'f35f3c8c88401d17fcc66e4a03d4e1bc'),
        ('gps.admin_ajuda_salvar(uuid,text,text,text[],text[],text,text,boolean,integer)', '721e2aef58362502a03288e0e974e842'),
        ('gps.admin_alvo_e_equipe(uuid)', 'c920195a3099ad3a2500db8af804f208'),
        ('gps.admin_apagar_nota(uuid)', 'e140280a34ce16d98becb23e35e30731'),
        ('gps.admin_cadastrar_compradores_hm(boolean)', 'afd3aece96fa05af95e57654015eb639'),
        ('gps.admin_clientes_agenda_kpis()', 'a436f169cd96b0ce96c74b305192b80d'),
        ('gps.admin_clientes_lista(integer,integer,text,text,text,text,text)', '13d191bd9c8d7b4724e396afdfd19f0a'),
        ('gps.admin_clientes_reuniao_kpis()', 'a69c151f67f9851c949d3272beef5f4e'),
        ('gps.admin_compradores_hm_aguardando()', '3a4c5fa25c77c0662219d7e192e615cb'),
        ('gps.admin_confirmar_acompanhamento(uuid,text)', '278be0e6d39196187ca771b17256aba2'),
        ('gps.admin_converter_titular_em_socio(uuid,uuid,text)', 'b8b03bc9f4925d8cf9d9b152eb488831'),
        ('gps.admin_dashboard()', '5b98a6540816a0975aa4a12db7aae662'),
        ('gps.admin_definir_liberacao_etapa(uuid,smallint,boolean,text)', '22da91afbc131274c558982dbdff1b43')
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
    raise exception '%: corpo vivo difere do retrato de 08/10 — regenerar a migração: %', '20261008000368', array_to_string(v_ruins, '; ');
  end if;
end
$guarda$;

-- gps.eh_equipe()
CREATE OR REPLACE FUNCTION gps.eh_equipe()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select gps.eh_admin() or gps.eh_operador();  -- 20261008000368: admin do GPS (gps.admins) ou operador
$function$;

-- gps.admin_adicionar_socio(uuid,uuid,text,text,boolean)
CREATE OR REPLACE FUNCTION gps.admin_adicionar_socio(p_ambiente_aluno_id uuid, p_socio_aluno_id uuid, p_email text, p_senha text, p_confirmar_login_existente boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_email text := lower(trim(p_email)); v_existente uuid; v_pessoa uuid;
        v_amb_trigger uuid;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if v_email is null or v_email = '' then
    raise exception 'Informe o e-mail do sócio.' using errcode = '22023';
  end if;
  if p_senha is null or length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.membros where aluno_id = p_ambiente_aluno_id and papel = 'titular') then
    raise exception 'Este ambiente não tem titular — crie o acesso do titular primeiro.' using errcode = 'P0002';
  end if;

  select id into v_user from auth.users where lower(email) = v_email and deleted_at is null limit 1;

  if v_user is not null then
    if gps.admin_alvo_e_equipe(v_user) then
      raise exception 'Esta conta é da equipe — não pode virar sócio de um ambiente.' using errcode = '42501';
    end if;
    select aluno_id into v_existente from gps.membros where user_id = v_user;
    if v_existente is not null and v_existente <> p_ambiente_aluno_id then
      raise exception 'Este e-mail já pertence a outro ambiente do GPS. Remova o acesso anterior antes.' using errcode = '23505';
    end if;
    -- ...220: o e-mail é do TITULAR deste mesmo ambiente. Sem esta guarda o
    -- `on conflict (user_id) do update` da ...219 rebaixava o titular a sócio
    -- (e o ambiente ficava sem titular) — risco residual apontado pelo Fable.
    if exists (select 1 from gps.membros
                where user_id = v_user and aluno_id = p_ambiente_aluno_id and papel = 'titular') then
      raise exception 'Este e-mail é do titular deste ambiente — o sócio precisa de um e-mail próprio.'
        using errcode = '22023';
    end if;

    -- ...218: a conta JÁ EXISTE em auth.users (compartilhado por 7 portais do
    -- grupo). Daqui para baixo a função troca a senha dela e derruba as
    -- sessões. Sem confirmação explícita, PARA AQUI — e nada foi escrito até
    -- esta linha.
    if not coalesce(p_confirmar_login_existente, false) then
      raise exception 'Este e-mail já tem login no grupo. Confirme para trocar a senha dessa conta e adicioná-la como sócio.'
        using errcode = 'P0003';
    end if;

    update auth.users
       set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user;
    delete from auth.refresh_tokens where user_id = v_user::text;
    delete from auth.sessions where user_id = v_user;
  else
    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('origem','gps','documento', (select documento from public.thb_alunos where id = p_socio_aluno_id)),
      '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_user::text, v_user,
            jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
            'email', now(), now(), now());
  end if;

  v_pessoa := case
                when p_socio_aluno_id is null then null
                when exists (select 1 from gps.membros x
                              where x.pessoa_aluno_id = p_socio_aluno_id
                                and x.user_id is distinct from v_user) then null
                else p_socio_aluno_id
              end;

  -- ...219: o gatilho de signup (`on_auth_user_created_gps`) roda no INSERT em
  -- auth.users feito ACIMA e, quando o CPF/e-mail do sócio casa com um
  -- cadastro, já grava um membro para este user_id (titular do PRÓPRIO
  -- cadastro do sócio). A constraint que existe é `membros_user_id_key`
  -- (user_id único): o `on conflict (aluno_id, user_id)` antigo não a cobria e
  -- a função morria em 23505 — "Adicionar sócio" com e-mail novo falhava para
  -- todo sócio que tem documento na base. Guarda-se o ambiente que o gatilho
  -- escolheu para desfazer o `gps.ambientes` órfão que ele deixou.
  select m.aluno_id into v_amb_trigger from gps.membros m where m.user_id = v_user;

  insert into gps.membros (aluno_id, user_id, papel, pessoa_aluno_id)
  values (p_ambiente_aluno_id, v_user, 'socio', v_pessoa)
  on conflict (user_id) do update
     set aluno_id = excluded.aluno_id,
         papel = 'socio',
         -- ...220: a PESSOA escolhida na tela vence a que o gatilho casou
         -- (quando são diferentes, o retorno dizia uma e o banco guardava outra).
         -- `excluded.pessoa_aluno_id` já vem NULL quando o cadastro escolhido é
         -- pessoa de outro membro (membros_pessoa_uk), e aí fica a do gatilho.
         pessoa_aluno_id = coalesce(excluded.pessoa_aluno_id, gps.membros.pessoa_aluno_id);

  -- Só o ambiente que o gatilho criou NESTA transação (`criado_em >= now()`)
  -- e que ficou sem nenhum membro. Um ambiente pré-existente ("Só criar
  -- ambiente", sem login) nunca é tocado.
  if v_amb_trigger is not null and v_amb_trigger <> p_ambiente_aluno_id then
    delete from gps.ambientes am
     where am.aluno_id = v_amb_trigger
       and am.criado_em >= now()
       and not exists (select 1 from gps.membros m where m.aluno_id = v_amb_trigger);
  end if;

  insert into gps.ambientes (aluno_id) values (p_ambiente_aluno_id) on conflict (aluno_id) do nothing;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_adicionado', p_ambiente_aluno_id, v_user, v_email,
          'sócio ' || coalesce(p_socio_aluno_id::text,'?'), auth.uid());

  return jsonb_build_object('user_id', v_user, 'email', v_email, 'pessoa_aluno_id', v_pessoa);
end $function$;

-- gps.admin_adotar_login_existente(uuid,text,boolean)
CREATE OR REPLACE FUNCTION gps.admin_adotar_login_existente(p_aluno_id uuid, p_senha text, p_forcar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_email text; v_aluno record; v_dono uuid; v_papel text; v_direito jsonb;
begin
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_senha is null or length(trim(p_senha)) < 8 then raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023'; end if;
  select id, nome, email, documento, telefone into v_aluno from public.thb_alunos where id = p_aluno_id;
  if not found then raise exception 'Aluno não encontrado.' using errcode = 'P0002'; end if;
  if coalesce(trim(v_aluno.email),'') = '' then raise exception 'Este aluno não tem e-mail no cadastro.' using errcode = '22023'; end if;
  v_direito := gps.admin_direito_ao_acesso(p_aluno_id);
  if not (v_direito->>'tem_direito')::boolean and not coalesce(p_forcar,false) then
    raise exception 'Sem direito ao acesso: %', v_direito->>'motivo' using errcode = '42501';
  end if;
  select id, email into v_user, v_email from auth.users where lower(trim(email)) = lower(trim(v_aluno.email));
  if v_user is null then raise exception 'Não existe login com este e-mail. Use "Criar acesso".' using errcode = 'P0002'; end if;
  if gps.admin_alvo_e_equipe(v_user) then raise exception 'Esta conta é da equipe — não pode virar acesso de aluno.' using errcode = '42501'; end if;
  select aluno_id into v_dono from gps.membros where user_id = v_user;
  if v_dono is not null and v_dono <> p_aluno_id then raise exception 'Este login já pertence a outro ambiente do GPS.' using errcode = '23505'; end if;
  v_papel := case when exists (select 1 from gps.membros m where m.aluno_id = p_aluno_id and m.papel = 'titular' and m.user_id <> v_user) then 'socio' else 'titular' end;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_strip_nulls(jsonb_build_object('nome', v_aluno.nome, 'origem', 'gps', 'telefone', v_aluno.telefone, 'documento', v_aluno.documento))
                              || jsonb_build_object('gps_senha_temp_em', now()),
         recovery_token = '', recovery_sent_at = null, confirmation_token = '',
         email_change = '', email_change_token_new = '', email_change_token_current = '',
         updated_at = now()
   where id = v_user;
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;
  insert into gps.membros (aluno_id, user_id, papel) values (p_aluno_id, v_user, v_papel) on conflict (user_id) do nothing;
  insert into gps.ambientes (aluno_id) values (p_aluno_id) on conflict (aluno_id) do nothing;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, feito_por, detalhe)
  values ('senha_definida', p_aluno_id, v_user, v_email, auth.uid(),
          'Login preexistente adotado como acesso do GPS (papel ' || v_papel || '). ' || (v_direito->>'motivo')
          || case when coalesce(p_forcar,false) then ' [LIBERADO MANUALMENTE pelo admin]' else '' end);
  return jsonb_build_object('user_id', v_user, 'email', v_email, 'papel', v_papel, 'adotado', true, 'direito', v_direito);
end $function$;

-- gps.admin_ajuda_metricas()
CREATE OR REPLACE FUNCTION gps.admin_ajuda_metricas()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_artigos jsonb; v_termos jsonb;
begin
  if not coalesce(gps.eh_admin(), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'artigo_id', a.id, 'titulo', a.titulo, 'ativo', a.ativo,
           'vistas', coalesce(m.vistas, 0), 'resolveu_sim', coalesce(m.sim, 0), 'resolveu_nao', coalesce(m.nao, 0),
           'ultimo_em', m.ultimo_em
         ) order by coalesce(m.nao, 0) desc, coalesce(m.vistas, 0) desc, a.ordem, a.titulo), '[]'::jsonb)
    into v_artigos
    from gps.ajuda_artigos a
    left join (
      select f.artigo_id,
             count(*) filter (where f.resolveu is null)  as vistas,
             count(*) filter (where f.resolveu is true)  as sim,
             count(*) filter (where f.resolveu is false) as nao,
             max(f.criado_em)                            as ultimo_em
        from gps.ajuda_feedback f
       where f.artigo_id is not null
       group by f.artigo_id
    ) m on m.artigo_id = a.id;
  select coalesce(jsonb_agg(jsonb_build_object('termo', t.termo, 'vezes', t.vezes, 'ultimo_em', t.ultimo_em)
         order by t.vezes desc, t.ultimo_em desc), '[]'::jsonb)
    into v_termos
    from (
      select lower(f.termo) as termo, count(*) as vezes, max(f.criado_em) as ultimo_em
        from gps.ajuda_feedback f
       where f.artigo_id is null and f.origem = 'busca'
       group by lower(f.termo)
       order by count(*) desc, max(f.criado_em) desc
       limit 50
    ) t;
  return jsonb_build_object('janela_dias', 90, 'artigos', v_artigos, 'termos_sem_resultado', v_termos);
end; $function$;

-- gps.admin_ajuda_salvar(uuid,text,text,text[],text[],text,text,boolean,integer)
CREATE OR REPLACE FUNCTION gps.admin_ajuda_salvar(p_id uuid, p_titulo text, p_corpo text, p_rotas text[], p_categorias text[], p_palavras_chave text, p_sinonimos text, p_ativo boolean, p_ordem integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_titulo text; v_corpo text; v_palavras text; v_sinonimos text; v_rotas text[]; v_categorias text[]; v_invalida text; v_id uuid;
begin
  if not coalesce(gps.eh_admin(), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_titulo := btrim(regexp_replace(coalesce(p_titulo, ''), '\s+', ' ', 'g'));
  if length(v_titulo) < 3 or length(v_titulo) > 120 then raise exception 'O título precisa ter de 3 a 120 caracteres.' using errcode = '22023'; end if;
  v_corpo := btrim(replace(coalesce(p_corpo, ''), E'\r\n', E'\n'));
  if length(v_corpo) < 10 or length(v_corpo) > 4000 then raise exception 'O texto precisa ter de 10 a 4000 caracteres.' using errcode = '22023'; end if;
  v_palavras := nullif(btrim(coalesce(p_palavras_chave, '')), '');
  v_sinonimos := nullif(btrim(coalesce(p_sinonimos, '')), '');
  if coalesce(length(v_palavras), 0) > 1000 or coalesce(length(v_sinonimos), 0) > 1000 then
    raise exception 'Palavras-chave e sinônimos aceitam até 1000 caracteres cada.' using errcode = '22023';
  end if;
  select r into v_invalida from unnest(coalesce(p_rotas, '{}')) r where gps.ajuda_normalizar_rota(r) is null limit 1;
  if found then raise exception 'Rota inválida: use o caminho da tela, como /clientes.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct gps.ajuda_normalizar_rota(r)), '{}') into v_rotas from unnest(coalesce(p_rotas, '{}')) r;
  if cardinality(v_rotas) > 20 then raise exception 'No máximo 20 rotas por artigo.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct c), '{}') into v_categorias from unnest(coalesce(p_categorias, '{}')) c;
  if not (v_categorias <@ array['sistema','troca_cliente','troca_socio','outros']::text[]) then raise exception 'Categoria inválida.' using errcode = '22023'; end if;
  if p_id is null then
    insert into gps.ajuda_artigos (titulo, corpo, rotas, categorias, palavras_chave, sinonimos, ativo, ordem)
    values (v_titulo, v_corpo, v_rotas, v_categorias, v_palavras, v_sinonimos, coalesce(p_ativo, true), coalesce(p_ordem, 0)) returning id into v_id;
  else
    update gps.ajuda_artigos a set titulo = v_titulo, corpo = v_corpo, rotas = v_rotas, categorias = v_categorias, palavras_chave = v_palavras,
      sinonimos = v_sinonimos, ativo = coalesce(p_ativo, a.ativo), ordem = coalesce(p_ordem, a.ordem) where a.id = p_id returning a.id into v_id;
    if v_id is null then raise exception 'Artigo não encontrado.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end; $function$;

-- gps.admin_alvo_e_equipe(uuid)
CREATE OR REPLACE FUNCTION gps.admin_alvo_e_equipe(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.perfis p
     where p.id = p_user_id and p.status = 'ativo' and p.cargo in ('dev', 'admin')
  )
  -- 20261008000368: admin do GPS também é conta de equipe (perfis segue: protege equipe de outros sistemas)
  or exists (select 1 from gps.admins a where a.user_id = p_user_id and a.ativo);
$function$;

-- gps.admin_apagar_nota(uuid)
CREATE OR REPLACE FUNCTION gps.admin_apagar_nota(p_nota_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text;
  v_lista text;
  v_nota gps.aluno_notas%rowtype;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = auth.uid();
  select lower(btrim(c.valor)) into v_lista from gps.config c
   where c.chave = 'notas_podem_apagar';

  -- Lista vazia = ninguem apaga. Falha FECHADA: se a chave sumir do config,
  -- a funcao para de apagar em vez de liberar para todo admin.
  if coalesce(v_email, '') = ''
     or coalesce(v_lista, '') = ''
     or not (v_email = any (string_to_array(v_lista, ','))) then
    raise exception 'Só Marcio, Elaine e Isabela podem apagar notas do diário.'
      using errcode = '42501';
  end if;

  select * into v_nota from gps.aluno_notas n where n.id = p_nota_id;
  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'P0002';
  end if;

  delete from gps.aluno_notas where id = p_nota_id;

  -- A nota some, mas o FATO de ter sido apagada fica: quem, quando, de qual
  -- aluno. Sem isso, apagar seria invisível — e o Diário é justamente a
  -- memória da equipe sobre o aluno.
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id,
                                 rotulo, detalhe, ator, ator_user_id, origem)
  values (v_nota.aluno_id, now(), 'nota_apagada', 'nota', p_nota_id,
          'Apagou uma nota do diário',
          jsonb_build_object('por', v_email, 'criada_em', v_nota.criado_em),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('ok', true, 'aluno_id', v_nota.aluno_id);
end;
$function$;

-- gps.admin_cadastrar_compradores_hm(boolean)
CREATE OR REPLACE FUNCTION gps.admin_cadastrar_compradores_hm(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_criados int := 0;
  v_existiam int := 0;
  v_cancelados int := 0;
  v_sem_email int := 0;
  v_detalhes jsonb := '[]'::jsonb;
  v_doc text;
  v_em text;
  v_situacao text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  for r in
    select distinct on (lower(trim(both from e.email)))
           lower(trim(both from e.email))                       em,
           e.payload->'data'->'buyer'->>'name'                  nome,
           e.payload->'data'->'buyer'->>'document'              doc,
           e.payload->'data'->'buyer'->>'checkout_phone'        fone,
           coalesce(c.nome_comercial, c.product_name)           oferta,
           c.valor_tabela                                       valor,
           e.transacao,
           e.recebido_em
      from cs.hotmart_eventos e
      join public.hm_product_catalog c
        on c.offer_code = e.payload->'data'->'purchase'->'offer'->>'code'
     where e.evento in ('PURCHASE_APPROVED','PURCHASE_COMPLETE')
       and e.email is not null
       and trim(both from e.email) <> ''
       and c.valor_tabela >= 4000
       and coalesce(c.nome_comercial, c.product_name) not ilike '%aurum%'
     order by lower(trim(both from e.email)), e.recebido_em desc
  loop
    v_em  := r.em;
    v_doc := nullif(lpad(regexp_replace(coalesce(r.doc,''), '\D', '', 'g'), 14, '0'),
                    lpad('', 14, '0'));

    -- Cancelamento posterior ao approved da MESMA pessoa: não cadastra.
    if exists (
      select 1 from cs.hotmart_eventos x
       where lower(trim(both from x.email)) = v_em
         and x.evento in ('PURCHASE_CANCELED','PURCHASE_REFUNDED',
                          'PURCHASE_PROTEST','PURCHASE_CHARGEBACK')
         and x.recebido_em > r.recebido_em
    ) then
      v_cancelados := v_cancelados + 1;
      v_situacao := 'pulado_cancelamento';

    -- Já existe por e-mail OU por documento: NÃO TOCA na linha.
    elsif exists (
      select 1 from public.thb_alunos a
       where lower(trim(both from a.email)) = v_em
    ) or (v_doc is not null and exists (
      select 1 from public.thb_alunos a
       where lpad(regexp_replace(coalesce(a.documento,''), '\D', '', 'g'), 14, '0') = v_doc
    )) then
      v_existiam := v_existiam + 1;
      v_situacao := 'ja_existia';

    else
      v_situacao := 'criado';
      if not p_dry_run then
        insert into public.thb_alunos (nome, email, documento, telefone, fonte)
        values (nullif(trim(both from coalesce(r.nome,'')), ''),
                v_em,
                nullif(regexp_replace(coalesce(r.doc,''), '\D', '', 'g'), ''),
                nullif(trim(both from coalesce(r.fone,'')), ''),
                'webhook_hotmart_gps');
      end if;
      v_criados := v_criados + 1;
    end if;

    if v_situacao <> 'ja_existia' then
      v_detalhes := v_detalhes || jsonb_build_array(jsonb_build_object(
        'situacao', v_situacao, 'nome', r.nome, 'email', v_em,
        'oferta', r.oferta, 'valor', r.valor, 'comprou_em', r.recebido_em));
    end if;
  end loop;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'criados', v_criados,
    'ja_existiam', v_existiam,
    'pulados_cancelamento', v_cancelados,
    'pulados_sem_email', v_sem_email,
    'detalhes', v_detalhes
  );
end
$function$;

-- gps.admin_clientes_agenda_kpis()
CREATE OR REPLACE FUNCTION gps.admin_clientes_agenda_kpis()
 RETURNS TABLE(etapa_agenda text, total integer, estrela integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 5 linhas SEMPRE (inclusive zeradas): o catálogo dirige, os clientes
  -- entram por LEFT JOIN. Cada cliente cai em 1 etapa só → soma = base.
  return query
  select e.etapa,
         count(x.cliente_id)::integer,
         (count(x.cliente_id) filter (where x.acompanhado_equipe))::integer
    from unnest(array['sem', 'entrevista', 'preliminar', 'croqui', 'execucao']::text[])
         with ordinality as e(etapa, ordem)
    left join (
      select r.cliente_id, coalesce(r.etapa_agenda, 'sem') as etapa, c.acompanhado_equipe
        from gps.cliente_agenda_resumo() r
        join gps.etapa1_clientes c on c.id = r.cliente_id
    ) x on x.etapa = e.etapa
   group by e.etapa, e.ordem
   order by e.ordem;
end;
$function$;

-- gps.admin_clientes_lista(integer,integer,text,text,text,text,text)
CREATE OR REPLACE FUNCTION gps.admin_clientes_lista(p_limite integer DEFAULT 100, p_offset integer DEFAULT 0, p_fase text DEFAULT NULL::text, p_grau text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_reuniao text DEFAULT NULL::text, p_agenda text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, aluno_id uuid, parceiro_nome text, cliente_nome text, telefone text, fase text, grau_relacao text, perfil_disc text, data_reuniao_preliminar date, aderiu_reuniao boolean, acompanhado_equipe boolean, criado_em timestamp with time zone, ep_em timestamp with time zone, ep_estado text, rp_em timestamp with time zone, rp_estado text, cq_em timestamp with time zone, cq_estado text, ex_em timestamp with time zone, ex_estado text, etapa_agenda text, total_linhas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_limite integer; v_offset integer; v_busca text;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Catalogo FECHADO do filtro de reuniao (…274, 17/09/2026). Valor fora
  -- da lista e erro, nunca "ignora e devolve tudo" -- filtro que se ignora
  -- em silencio faz a tela mentir sobre o universo.
  if p_reuniao is not null and p_reuniao not in ('com_reuniao', 'marcada', 'para_vencer', 'vencida', 'sem') then
    raise exception 'Filtro de reunião inválido.' using errcode = '22023';
  end if;

  -- (…355) Catalogo FECHADO da etapa da agenda -- mesma regra.
  if p_agenda is not null and p_agenda not in ('sem', 'entrevista', 'preliminar', 'croqui', 'execucao') then
    raise exception 'Filtro de etapa da agenda inválido.' using errcode = '22023';
  end if;

  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with r as (
    select x.cliente_id, x.ep_em, x.ep_estado, x.rp_em, x.rp_estado,
           x.cq_em, x.cq_estado, x.ex_em, x.ex_estado, x.etapa_agenda
      from gps.cliente_agenda_resumo() x
  ),
  base as (
    select c.id, c.aluno_id, t.nome as parceiro_nome, c.nome as cliente_nome,
           c.telefone, c.fase, c.grau_relacao, c.perfil_disc,
           c.data_reuniao_preliminar, c.aderiu_reuniao, c.acompanhado_equipe,
           c.criado_em,
           r.ep_em, r.ep_estado, r.rp_em, r.rp_estado,
           r.cq_em, r.cq_estado, r.ex_em, r.ex_estado,
           coalesce(r.etapa_agenda, 'sem') as etapa_agenda
    from gps.etapa1_clientes c
    -- LEFT, nao INNER (conferido 14/09: 0 orfaos em 1.222 clientes). Com
    -- INNER, cliente cujo cadastro do parceiro sumisse de thb_alunos (base
    -- compartilhada com o sip) DESAPARECERIA da lista e da contagem, sem
    -- erro. Com LEFT ele aparece com o dono vazio -- pendencia visivel em
    -- vez de sumico silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    left join r on r.cliente_id = c.id
    where (p_fase is null or c.fase = p_fase)
      -- `data_reuniao_preliminar` e `date`: comparar com `current_date` e
      -- data contra data. NUNCA `now()` -- o bug do `hojeISO` em UTC ja morde
      -- o Financeiro das 21h a meia-noite.
      and (
        p_reuniao is null
        or (p_reuniao = 'com_reuniao' and c.data_reuniao_preliminar is not null)
        or (p_reuniao = 'marcada' and c.data_reuniao_preliminar > current_date + 7)
        or (p_reuniao = 'para_vencer' and c.data_reuniao_preliminar between current_date and current_date + 7)
        or (p_reuniao = 'vencida' and c.data_reuniao_preliminar <  current_date)
        or (p_reuniao = 'sem'     and c.data_reuniao_preliminar is null)
      )
      and (p_agenda is null or coalesce(r.etapa_agenda, 'sem') = p_agenda)
      and (p_grau is null
           or (p_grau = '_nulo' and c.grau_relacao is null)
           or c.grau_relacao = p_grau)
      and (v_busca is null
           or c.nome ilike '%' || v_busca || '%'
           or t.nome ilike '%' || v_busca || '%')
  )
  select b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
         b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar,
         b.aderiu_reuniao, b.acompanhado_equipe, b.criado_em,
         b.ep_em, b.ep_estado, b.rp_em, b.rp_estado,
         b.cq_em, b.cq_estado, b.ex_em, b.ex_estado, b.etapa_agenda,
         (count(*) over ())::bigint as total_linhas
  from base b
  -- 🔑 (28/09) Estrela primeiro, SEMPRE — em qualquer filtro e em qualquer
  -- página. `desc` em boolean = true antes de false. A coluna é NOT NULL
  -- default false (conferido 28/09) — sem `coalesce`, que só esconderia a
  -- chave de ordenação do planner.
  order by b.acompanhado_equipe desc, b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

-- gps.admin_clientes_reuniao_kpis()
CREATE OR REPLACE FUNCTION gps.admin_clientes_reuniao_kpis()
 RETURNS TABLE(total_com_reuniao bigint, marcadas bigint, para_vencer bigint, vencidas bigint, fav_total_com_reuniao bigint, fav_marcadas bigint, fav_para_vencer bigint, fav_vencidas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where c.data_reuniao_preliminar is not null),
    count(*) filter (where c.data_reuniao_preliminar > current_date + 7),
    count(*) filter (where c.data_reuniao_preliminar between current_date and current_date + 7),
    count(*) filter (where c.data_reuniao_preliminar < current_date),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar is not null),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar > current_date + 7),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar between current_date and current_date + 7),
    count(*) filter (where c.acompanhado_equipe and c.data_reuniao_preliminar < current_date)
  from gps.etapa1_clientes c;
end;
$function$;

-- gps.admin_compradores_hm_aguardando()
CREATE OR REPLACE FUNCTION gps.admin_compradores_hm_aguardando()
 RETURNS TABLE(aluno_id uuid, nome text, email text, comprado_em timestamp with time zone, oferta_codigo text, valor numeric, metodo_pagamento text, tem_login boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_desde timestamptz;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select coalesce(
           (select (c.valor || ' 00:00 America/Sao_Paulo')::timestamptz from gps.config c
             where c.chave = 'fila_hm_desde' and c.valor ~ '^\d{4}-\d{2}-\d{2}$'),
           timestamptz '2026-09-26 03:00+00') into v_desde;
  return query
  with cheias as (
    select distinct on (cp.comprador_id) cp.comprador_id,
           coalesce(cp.data_aprovacao, cp.data_compra) as comprado_em,
           cp.oferta_codigo::text as oferta_codigo, cp.preco as valor, cp.metodo_pagamento::text as metodo_pagamento
      from public.compras cp
      join public.hm_product_catalog cat on cat.offer_code = cp.oferta_codigo and cat.categoria = 'compra_cheia' and cat.product_id = '5064314'
     where cp.status in ('APPROVED','COMPLETE','COMPLETED') and coalesce(cp.data_aprovacao, cp.data_compra) >= v_desde
     order by cp.comprador_id, coalesce(cp.data_aprovacao, cp.data_compra) desc
  ),
  com_aluno as (
    select distinct on (a.id) a.id as aluno_id, a.nome::text as nome, lower(trim(a.email))::text as email,
           ch.comprado_em, ch.oferta_codigo, ch.valor, ch.metodo_pagamento
      from cheias ch
      join public.thb_alunos a on a.comprador_id = ch.comprador_id
        or a.id = (select hm.aluno_id from cs.contatos_hm hm where hm.comprador_id = ch.comprador_id and coalesce(hm.produto,'HM') = 'HM' and hm.aluno_id is not null limit 1)
     order by a.id, ch.comprado_em desc
  )
  select ca.aluno_id, ca.nome, ca.email, ca.comprado_em, ca.oferta_codigo, ca.valor, ca.metodo_pagamento,
         exists (select 1 from auth.users u where lower(u.email) = ca.email and ca.email <> '') as tem_login
    from com_aluno ca
   where not exists (select 1 from gps.membros m where m.aluno_id = ca.aluno_id or m.pessoa_aluno_id = ca.aluno_id)
   order by ca.comprado_em asc;
end;
$function$;

-- gps.admin_confirmar_acompanhamento(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_confirmar_acompanhamento(p_cliente_id uuid, p_motivo text)
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
  select c.id, c.aluno_id, c.nome, c.acompanhado_equipe, c.acompanhamento_confirmado_em into v_c
    from gps.etapa1_clientes c where c.id = p_cliente_id;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if not v_c.acompanhado_equipe then
    raise exception 'Este cliente não é o cliente acompanhado deste aluno. Marque a estrela antes de confirmar.' using errcode = '22023';
  end if;
  if v_c.acompanhamento_confirmado_em is not null then
    raise exception 'A equipe já está acompanhando este cliente.' using errcode = '22023';
  end if;
  update gps.etapa1_clientes set acompanhamento_confirmado_em = now(), acompanhamento_confirmado_por = auth.uid() where id = p_cliente_id;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('favorito_confirmado', v_c.aluno_id, format('cliente %s confirmado como acompanhado pela equipe. Motivo: %s', p_cliente_id, v_motivo), auth.uid());
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'favorito_confirmado_pela_equipe', 'cliente', p_cliente_id,
          left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300), jsonb_build_object('motivo', v_motivo), 'equipe', auth.uid(), 'app');
  return jsonb_build_object('cliente_id', p_cliente_id, 'aluno_id', v_c.aluno_id, 'confirmado', true);
end $function$;

-- gps.admin_converter_titular_em_socio(uuid,uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_converter_titular_em_socio(p_membro_id uuid, p_ambiente_destino uuid, p_confirmar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m                record;
  v_n_membros      int;
  v_origem         uuid;
  v_nome_origem    text;
  v_nome_destino   text;
  v_email          text;
  v_conteudo       jsonb;
  v_resumo         jsonb;
  v_lixeira_id     uuid;
  v_c              record;
  v_novo_id        uuid;
  v_copiados       int := 0;
  v_ja_existiam    int := 0;
  v_total          int := 0;
  v_ambiente_removido boolean := false;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_membro_id is null or p_ambiente_destino is null then
    raise exception 'Membro ou ambiente de destino não informado.' using errcode = '22023';
  end if;

  select count(*) into v_n_membros
    from gps.membros mm
   where mm.pessoa_aluno_id = p_membro_id
      or (mm.pessoa_aluno_id is null and mm.aluno_id = p_membro_id);

  if v_n_membros = 0 then
    raise exception 'Nenhum acesso encontrado para este cadastro.' using errcode = 'P0002';
  end if;
  if v_n_membros > 1 then
    raise exception 'Este cadastro tem mais de um acesso no programa — resolva a duplicidade antes de converter.'
      using errcode = '21000';
  end if;

  select * into m
    from gps.membros mm
   where mm.pessoa_aluno_id = p_membro_id
      or (mm.pessoa_aluno_id is null and mm.aluno_id = p_membro_id)
   for update;

  v_origem := m.aluno_id;

  perform 1 from gps.membros t
   where t.aluno_id = p_ambiente_destino and t.papel = 'titular'
   for update;

  if m.papel <> 'titular' then
    raise exception 'Este membro já é sócio — para mudá-lo de ambiente use "Mover membro".'
      using errcode = '42501';
  end if;

  if m.pessoa_aluno_id is distinct from m.aluno_id then
    raise exception 'Este membro é titular de um ambiente que não é o cadastro dele. Use "Trocar titular" antes.'
      using errcode = '42501';
  end if;

  if v_origem = p_ambiente_destino then
    raise exception 'O ambiente de destino é o mesmo de origem.' using errcode = '22023';
  end if;

  if not exists (select 1 from gps.membros t
                  where t.aluno_id = p_ambiente_destino and t.papel = 'titular') then
    raise exception 'O ambiente de destino não tem titular.' using errcode = 'P0002';
  end if;

  if m.user_id is not null
     and exists (select 1 from gps.membros x
                  where x.aluno_id = p_ambiente_destino and x.user_id = m.user_id) then
    raise exception 'Este login já participa do ambiente de destino.' using errcode = '23505';
  end if;

  if exists (select 1 from gps.membros o
              where o.aluno_id = v_origem and o.id <> m.id) then
    raise exception 'O ambiente de origem tem outro membro. Resolva o outro membro antes de converter este.'
      using errcode = '42501';
  end if;

  select t.nome into v_nome_origem  from public.thb_alunos t where t.id = v_origem;
  select t.nome into v_nome_destino from public.thb_alunos t where t.id = p_ambiente_destino;

  if btrim(coalesce(v_nome_origem, '')) = '' then
    raise exception 'O ambiente de origem está sem nome no cadastro — não é possível confirmar a conversão. Corrija o nome antes.'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_confirmar, '')) <> btrim(v_nome_origem) then
    raise exception 'Confirmação não confere. Digite exatamente o nome do ambiente de origem: %',
      coalesce(v_nome_origem, '(sem nome)') using errcode = 'P0004';
  end if;

  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;

  v_conteudo := jsonb_build_object(
    'clientes',  coalesce((select jsonb_agg(to_jsonb(c)) from gps.etapa1_clientes c
                            where c.aluno_id = v_origem), '[]'::jsonb),
    'progresso', coalesce((select jsonb_agg(to_jsonb(p)) from gps.progresso p
                            where p.aluno_id = v_origem), '[]'::jsonb),
    'notas',     coalesce((select jsonb_agg(to_jsonb(n)) from gps.aluno_notas n
                            where n.aluno_id = v_origem), '[]'::jsonb),
    'chamados',  coalesce((select jsonb_agg(to_jsonb(ch)) from gps.chamados ch
                            where ch.aluno_id = v_origem), '[]'::jsonb),
    'membros',   coalesce((select jsonb_agg(to_jsonb(mm)) from gps.membros mm
                            where mm.aluno_id = v_origem), '[]'::jsonb),
    'onboarding',coalesce((select jsonb_agg(to_jsonb(r)) from gps.onboarding_respostas r
                            join gps.membros m2 on m2.pessoa_aluno_id = r.pessoa_aluno_id
                           where m2.aluno_id = v_origem), '[]'::jsonb));

  v_resumo := jsonb_build_object(
    'clientes',  (select count(*) from gps.etapa1_clientes c where c.aluno_id = v_origem),
    'progresso', (select count(*) from gps.progresso p      where p.aluno_id = v_origem),
    'notas',     (select count(*) from gps.aluno_notas n    where n.aluno_id = v_origem),
    'chamados',  (select count(*) from gps.chamados ch      where ch.aluno_id = v_origem),
    'eventos',   (select count(*) from gps.aluno_eventos e  where e.aluno_id = v_origem));

  insert into gps.lixeira_ambientes
    (aluno_id, email_alvo, nome_alvo, conteudo, resumo, excluido_por)
  values (v_origem, v_email, v_nome_origem, v_conteudo, v_resumo, auth.uid())
  returning id into v_lixeira_id;

  for v_c in
    select * from gps.etapa1_clientes c where c.aluno_id = v_origem order by c.criado_em
  loop
    v_total := v_total + 1;

    if exists (
      select 1 from gps.etapa1_clientes d
       where d.aluno_id = p_ambiente_destino
         and gps.cliente_chave_dedup(d.nome, d.telefone)
           = gps.cliente_chave_dedup(v_c.nome, v_c.telefone)
    ) then
      v_ja_existiam := v_ja_existiam + 1;
      continue;
    end if;

    insert into gps.etapa1_clientes (
      aluno_id, nome, telefone, nivel_relacionamento, problemas, perda_inercia,
      registro_contato, mensagem_padrao_enviada, estudo_caso_enviado,
      ligacao_realizada, status, data_reuniao_preliminar, aderiu_reuniao,
      perfil_disc, ordem, criado_em, atualizado_em, acompanhado_equipe,
      valor_honorarios, contrato_url, grau_relacao,
      contrato_path, contrato_nome, contrato_mime, contrato_tamanho,
      contrato_anexado_em, selecionado_entrevista, entrevista_resultado,
      entrevista_observacoes, entrevista_em, entrevista_por,
      entrevista_tentativas_sem_contato, entrevista_retorno_em,
      entrevista_encerrada, entrevista_remarcacoes, entrevista_motivo_encerramento
    )
    values (
      p_ambiente_destino,
      v_c.nome, v_c.telefone, v_c.nivel_relacionamento, v_c.problemas,
      v_c.perda_inercia, v_c.registro_contato, v_c.mensagem_padrao_enviada,
      v_c.estudo_caso_enviado, v_c.ligacao_realizada, v_c.status,
      v_c.data_reuniao_preliminar, v_c.aderiu_reuniao, v_c.perfil_disc,
      v_c.ordem, v_c.criado_em, now(),
      false,
      v_c.valor_honorarios, v_c.contrato_url, v_c.grau_relacao,
      v_c.contrato_path, v_c.contrato_nome, v_c.contrato_mime,
      v_c.contrato_tamanho, v_c.contrato_anexado_em,
      v_c.selecionado_entrevista, v_c.entrevista_resultado,
      v_c.entrevista_observacoes, v_c.entrevista_em, v_c.entrevista_por,
      v_c.entrevista_tentativas_sem_contato, v_c.entrevista_retorno_em,
      v_c.entrevista_encerrada, v_c.entrevista_remarcacoes,
      v_c.entrevista_motivo_encerramento
    )
    returning id into v_novo_id;

    -- …354: fase derivada (…353). Copia as marcações VIVAS (com data e autor
    -- originais); o gatilho recalcula a fase do cliente copiado.
    insert into gps.cliente_trajetoria (cliente_id, etapa_codigo, marcado_em, marcado_por)
    select v_novo_id, t.etapa_codigo, t.marcado_em, t.marcado_por
      from gps.cliente_trajetoria t
     where t.cliente_id = v_c.id and t.desmarcado_em is null;

    v_copiados := v_copiados + 1;

    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade,
      entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (p_ambiente_destino, now(), 'cliente_cadastrado', 'cliente', v_novo_id,
      left(coalesce(nullif(btrim(coalesce(v_c.nome,'')),''), 'Cliente sem nome'), 300),
      jsonb_build_object(
        'copiado_de_ambiente', v_origem,
        'cliente_id_origem',   v_c.id,
        'motivo',              'conversao_titular_em_socio',
        'lixeira_id',          v_lixeira_id),
      'equipe', auth.uid(), 'app');
  end loop;

  update gps.membros
     set aluno_id = p_ambiente_destino,
         papel    = 'socio'
   where id = m.id;

  if not exists (select 1 from gps.membros o where o.aluno_id = v_origem) then
    -- 🔴 onboarding_respostas.ambiente_aluno_id NAO se reescreve: a coluna
    -- documenta "o ambiente em que a pessoa estava ao responder" e a ...204
    -- diz textualmente que historico nao se reescreve. Mover tambem jogaria
    -- a resposta para dentro do escopo de exclusao do ambiente de DESTINO.
    -- A resposta e da PESSOA (PK por pessoa_aluno_id) e sobrevive sozinha.

    -- 🔴 gps.aluno_eventos e APPEND-ONLY por desenho (...0001: "log nao se
    -- edita, nem por quem o ve"). Nao se reescreve aluno_id de evento
    -- historico e nao se apaga trilha sem retrato. Aqui: fotografa no
    -- retrato e grava evento NOVO no destino, no mesmo padrao dos clientes.
    update gps.lixeira_ambientes
       set conteudo = jsonb_set(conteudo, '{eventos}',
             coalesce((select jsonb_agg(to_jsonb(e)) from gps.aluno_eventos e
                        where e.aluno_id = v_origem), '[]'::jsonb))
     where id = v_lixeira_id;

    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade,
      entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    select p_ambiente_destino, now(), e.tipo, e.entidade, e.entidade_id,
           left(e.rotulo, 300),
           coalesce(e.detalhe, '{}'::jsonb) || jsonb_build_object(
             'reemitido_de_ambiente', v_origem,
             'ocorrido_originalmente_em', e.ocorrido_em,
             'motivo', 'conversao_titular_em_socio',
             'lixeira_id', v_lixeira_id),
           'equipe', auth.uid(), 'app'
      from gps.aluno_eventos e
     where e.aluno_id = v_origem and e.entidade = 'onboarding';

    delete from gps.progresso        where aluno_id = v_origem;
    delete from gps.aluno_notas      where aluno_id = v_origem;
    delete from gps.chamados         where aluno_id = v_origem;
    delete from gps.etapa1_clientes  where aluno_id = v_origem;
    delete from gps.aluno_eventos    where aluno_id = v_origem;

    delete from gps.ambientes where aluno_id = v_origem;
    v_ambiente_removido := true;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values (
    'titular_convertido_em_socio', v_origem, m.user_id, v_email,
    format('SAÍDA: %s deixou de ser titular do próprio ambiente e virou sócio de %s. %s cliente(s) copiado(s), %s já existiam no destino, %s no total. Retrato na lixeira: %s.%s',
      coalesce(v_nome_origem,'(sem nome)'), coalesce(v_nome_destino,'(sem nome)'),
      v_copiados, v_ja_existiam, v_total, v_lixeira_id,
      case when v_ambiente_removido then ' Ambiente de origem removido (ficou sem membro).' else '' end),
    auth.uid()),
  (
    'titular_convertido_em_socio', p_ambiente_destino, m.user_id, v_email,
    format('ENTRADA: %s entrou como sócio, vindo do próprio ambiente. %s cliente(s) copiado(s), %s já existiam, %s no total. Retrato da origem na lixeira: %s.',
      coalesce(v_nome_origem,'(sem nome)'),
      v_copiados, v_ja_existiam, v_total, v_lixeira_id),
    auth.uid());

  return jsonb_build_object(
    'clientes_copiados',    v_copiados,
    'clientes_ja_existiam', v_ja_existiam,
    'origem_nome',          v_nome_origem,
    'destino_nome',         v_nome_destino,
    'membro_id',            m.id,
    'cadastro_id',          p_membro_id,
    'origem',               v_origem,
    'destino',              p_ambiente_destino,
    'clientes_no_total',    v_total,
    'lixeira_id',           v_lixeira_id,
    'ambiente_origem_removido', v_ambiente_removido);
end $function$;

-- gps.admin_dashboard()
CREATE OR REPLACE FUNCTION gps.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fuso text := 'America/Sao_Paulo'; v_hoje date; v_dia integer; v_ini_mes date; v_ini_ant date; v_fim_ant date;
  v_programa jsonb; v_acesso jsonb; v_onboarding jsonb; v_clientes jsonb; v_honorarios jsonb; v_atividade jsonb; v_grau jsonb; v_equipe jsonb;
  v_passos jsonb; v_caminho jsonb; v_atencao jsonb; v_parceiros jsonb;
  v_jornada jsonb; v_serie jsonb; v_semana_corrente text;
begin
  if not coalesce(gps.eh_admin(), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_hoje := (now() at time zone v_fuso)::date;
  v_dia := extract(day from v_hoje)::integer;
  v_ini_mes := date_trunc('month', v_hoje)::date;
  v_ini_ant := (v_ini_mes - interval '1 month')::date;
  v_fim_ant := least(v_ini_ant + (v_dia - 1), v_ini_mes - 1);
  with tit as (select (m.criado_em at time zone v_fuso)::date as dia from gps.membros m where m.papel = 'titular'),
  meses as (select to_char(date_trunc('month', t.dia), 'YYYY-MM') as mes, count(*)::integer as qtd from tit t where t.dia >= (v_ini_mes - interval '11 months')::date group by 1)
  select jsonb_build_object(
    'total', (select count(distinct m.aluno_id)::integer from gps.membros m),
    'no_mes', (select count(*)::integer from tit t where t.dia >= v_ini_mes),
    'no_mes_anterior_ate_o_dia', (select count(*)::integer from tit t where t.dia >= v_ini_ant and t.dia <= v_fim_ant),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'qtd', qtd) order by mes), '[]'::jsonb) from meses)
  ) into v_programa;
  with amb as (select m.aluno_id, bool_or(m.user_id is not null) as tem_login, max(u.last_sign_in_at) as ultimo_acesso from gps.membros m left join auth.users u on u.id = m.user_id group by m.aluno_id)
  select jsonb_build_object(
    'total', count(*)::integer,
    'com_login', count(*) filter (where a.tem_login)::integer,
    'sem_login', count(*) filter (where not a.tem_login)::integer,
    'nunca_entraram', count(*) filter (where a.tem_login and a.ultimo_acesso is null)::integer,
    'sem_acesso_30d', count(*) filter (where a.ultimo_acesso is not null and a.ultimo_acesso < now() - interval '30 days')::integer,
    'ativos_30d', count(*) filter (where a.ultimo_acesso >= now() - interval '30 days')::integer
  ) into v_acesso from amb a;
  -- Titulares x socios (11/09/2026). Mesma tabela do bloco acima; `papel` e o
  -- unico eixo novo. `socios_ativos_30d` e o numero que interessa: em 11/09
  -- eram 10 socios com login e so 4 acessando.
  select jsonb_build_object(
    'titulares', count(*) filter (where m.papel = 'titular')::integer,
    'socios', count(*) filter (where m.papel = 'socio')::integer,
    'socios_ativos_30d', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at >= now() - interval '30 days')::integer,
    'socios_nunca_entraram', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at is null)::integer,
    -- O bloco `acesso` conta AMBIENTES; este conta PESSOAS.
    'titulares_ja_entraram', count(*) filter (where m.papel = 'titular' and u.last_sign_in_at is not null)::integer,
    'socios_ja_entraram', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at is not null)::integer,
    'titulares_ativos_30d', count(*) filter (where m.papel = 'titular' and u.last_sign_in_at >= now() - interval '30 days')::integer,
    'nunca_entraram', count(*) filter (where m.user_id is not null and u.last_sign_in_at is null)::integer,
    'ambientes_compartilhados', (select count(*)::integer from (select 1 from gps.membros g group by g.aluno_id having count(*) > 1) x),
    'convites_pendentes', (select count(*)::integer from gps.socio_convites where status = 'pendente' and expira_em > now())
  ) into v_equipe from gps.membros m left join auth.users u on u.id = m.user_id;
  select jsonb_build_object(
    'pessoas', (select count(*)::integer from gps.membros m where m.pessoa_aluno_id is not null),
    'concluidos', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null),
    'em_andamento', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null),
    'concluidos_no_mes', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null and (r.concluido_em at time zone v_fuso)::date >= v_ini_mes),
    'parados_7d', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null and r.atualizado_em < now() - interval '7 days'),
    'com_cliente1', (select count(*)::integer from gps.onboarding_respostas r where r.origem_cliente1 = 'ja_tenho'),
    'em_execucao', (select count(*)::integer from gps.onboarding_respostas r where r.fase_cliente1 = 'execucao_andamento')
  ) into v_onboarding;
  select jsonb_build_object(
    'total', count(*)::integer,
    'prospeccao', count(*) filter (where c.fase = 'prospeccao')::integer,
    'fechamento', count(*) filter (where c.fase = 'fechamento')::integer,
    'contratado', count(*) filter (where c.fase = 'contratado')::integer,
    'concluido', count(*) filter (where c.fase = 'concluido')::integer,
    'no_mes', count(*) filter (where (c.criado_em at time zone v_fuso)::date >= v_ini_mes)::integer,
    'no_mes_anterior_ate_o_dia', count(*) filter (where (c.criado_em at time zone v_fuso)::date >= v_ini_ant and (c.criado_em at time zone v_fuso)::date <= v_fim_ant)::integer
  ) into v_clientes from gps.etapa1_clientes c;
  with por_amb as (select c.aluno_id, sum(c.valor_honorarios) as soma from gps.etapa1_clientes c where c.fase in ('contratado', 'concluido') and c.valor_honorarios is not null group by c.aluno_id)
  select jsonb_build_object(
    'clientes_contratados', (select count(*)::integer from gps.etapa1_clientes c where c.fase in ('contratado', 'concluido')),
    'contratados_sem_valor', (select count(*)::integer from gps.etapa1_clientes c where c.fase in ('contratado', 'concluido') and c.valor_honorarios is null),
    'ambientes_com_contratado', (select count(distinct c.aluno_id)::integer from gps.etapa1_clientes c where c.fase in ('contratado', 'concluido')),
    'total_reais', (select sum(p.soma) from por_amb p),
    'somas_por_ambiente', (select coalesce(jsonb_agg(p.soma order by p.soma desc), '[]'::jsonb) from por_amb p)
  ) into v_honorarios;
  with dias as (
    select (e.ocorrido_em at time zone v_fuso)::date as dia,
           count(*) filter (where e.ator = 'aluno')::integer as qtd_aluno,
           count(*) filter (where e.ator = 'equipe')::integer as qtd_equipe,
           count(*) filter (where e.ator = 'sistema')::integer as qtd_sistema
      from gps.aluno_eventos e where e.ocorrido_em >= now() - interval '30 days' group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'aluno', d.qtd_aluno, 'equipe', d.qtd_equipe, 'sistema', d.qtd_sistema) order by d.dia), '[]'::jsonb) into v_atividade from dias d;
  with g as (select c.grau_relacao as grau, count(*)::integer as qtd from gps.etapa1_clientes c where c.grau_relacao is not null group by 1)
  select jsonb_build_object(
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('grau', g.grau, 'qtd', g.qtd) order by g.qtd desc, g.grau), '[]'::jsonb) from g),
    'nao_informado', (select count(*)::integer from gps.etapa1_clientes c where c.grau_relacao is null)
  ) into v_grau;
  -- ── passos ──────────────────────────────────────────────────────────────
  -- QUATRO CONTAGENS PARALELAS. NAO SAO UM FUNIL. Nao existe taxa de
  -- conversao entre mensagem/estudo/ligacao/aderiu, e ela NAO e devolvida
  -- aqui de proposito: `cliente-ficha.tsx:186-188` sao tres `useState`
  -- independentes, sem `disabled` encadeado -- da para marcar `ligacao` sem
  -- nunca ter marcado `mensagem`. Logo `estudo` NAO e subconjunto de
  -- `mensagem`. Quem for acrescentar taxa: encadeie a ficha ANTES.
  select jsonb_build_object(
    'mensagem', count(*) filter (where c.mensagem_padrao_enviada)::integer,
    'estudo',   count(*) filter (where c.estudo_caso_enviado)::integer,
    'ligacao',  count(*) filter (where c.ligacao_realizada)::integer,
    'aderiu',   count(*) filter (where c.aderiu_reuniao)::integer,
    'total',    count(*)::integer
  ) into v_passos from gps.etapa1_clientes c;
  -- ── caminho ─────────────────────────────────────────────────────────────
  -- `entrevista` le gps.entrevista_previa -- NUNCA
  -- gps.etapa1_clientes.entrevista_em, que e LEGADO e vale 0 na base inteira.
  -- O nome da coluna velha e mais obvio que o da tabela nova; trocar zera o
  -- numero em silencio. `count(distinct cliente_id)` porque a tabela aceita
  -- duplicata (4 linhas de 1 cliente so, medido em 23/09).
  select jsonb_build_object(
    'favorito',   (select count(*)::integer from gps.etapa1_clientes c where c.acompanhado_equipe),
    'entrevista', (select count(distinct e.cliente_id)::integer from gps.entrevista_previa e),
    'reuniao',    (select count(*)::integer from gps.etapa1_clientes c where c.data_reuniao_preliminar is not null),
    'aderiu',     (select count(*)::integer from gps.etapa1_clientes c where c.aderiu_reuniao),
    'prospeccao', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'prospeccao'),
    'fechamento', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'fechamento'),
    'contratado', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
    'concluido',  (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'concluido'),
    'com_valor',  (select count(*)::integer from gps.etapa1_clientes c where c.fase in ('contratado', 'concluido') and c.valor_honorarios is not null)
  ) into v_caminho;
  -- ── atencao ─────────────────────────────────────────────────────────────
  -- CORTES DE TEMPO DIFERENTES DE PROPOSITO -- nao unificar:
  --   favorito_parado 7 dias (o CLIENTE esfriou) · dias_sem_abrir 14 dias
  --   (o PARCEIRO sumiu) · filtros DIAS_INATIVO 30 dias (nao tocar).
  select jsonb_build_object(
    'favorito_parado', (
      select count(*)::integer from gps.etapa1_clientes c
       where c.acompanhado_equipe
         and c.data_reuniao_preliminar is null
         and c.atualizado_em < now() - interval '7 days'),
    'reuniao_sem_entrevista', (
      select count(*)::integer
        from gps.etapa1_clientes c
        left join gps.entrevista_previa e on e.cliente_id = c.id
       where c.data_reuniao_preliminar is not null
         and e.id is null),
    'socio_pendente', (
      select count(*)::integer from gps.socio_convites s
       where s.status = 'pendente'
         and s.expira_em > now()
         and s.criado_em < now() - interval '7 days'),
    'ambiente_sem_cliente', (
      select count(*)::integer
        from (select distinct m.aluno_id from gps.membros m) a
       where not exists (select 1 from gps.etapa1_clientes c where c.aluno_id = a.aluno_id)),
    'parceiro_sem_mensagem', (
      select count(*)::integer
        from (select c.aluno_id,
                     count(*) filter (where c.mensagem_padrao_enviada) as com_msg
                from gps.etapa1_clientes c group by c.aluno_id) t
       where t.com_msg = 0)
  ) into v_atencao;
  -- ── parceiros ───────────────────────────────────────────────────────────
  -- PII MINIMA E DELIBERADA: leva `aluno_id` e `nome` (decisao do Marcio,
  -- 23/09/2026 -- ranking sem nome nao responde "quem sao os parados"). O
  -- nome vem de public.thb_alunos.nome, a mesma fonte de `getAlunoById`.
  -- TETO DE 200 no array; os agregados saem de TODOS os parceiros.
  -- `com_30_ou_mais` conta FICHA COMPLETA (nome+telefone) -- a mesma regra de
  -- `comDados` e do filtro `listou30`. Bruto daria 38, ficha completa da 37;
  -- usar o bruto criaria segunda verdade sobre "fechou os 30" (bug de 15/09).
  with rk as (
    select c.aluno_id,
           count(*)::integer                                              as clientes,
           count(*) filter (where c.mensagem_padrao_enviada)::integer     as mensagens,
           count(*) filter (where c.nome is not null and btrim(c.nome) <> ''
                              and c.telefone is not null
                              and btrim(c.telefone) <> '')::integer       as com_ficha_completa,
           count(*) filter (where c.acompanhado_equipe)::integer          as favoritos,
           count(*) filter (where c.data_reuniao_preliminar is not null)::integer as reunioes,
           count(*) filter (where c.fase in ('contratado', 'concluido'))::integer         as contratados,
           sum(c.valor_honorarios) filter (where c.fase in ('contratado', 'concluido'))   as honorarios,
           (extract(day from now() - max(c.atualizado_em)))::integer      as dias_sem_abrir
      from gps.etapa1_clientes c
     group by c.aluno_id)
  select jsonb_build_object(
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'aluno_id',       r.aluno_id,
               'nome',           coalesce(a.nome, ''),
               'clientes',       r.clientes,
               'mensagens',      r.mensagens,
               'favoritos',      r.favoritos,
               'reunioes',       r.reunioes,
               'contratados',    r.contratados,
               'honorarios',     r.honorarios,
               'dias_sem_abrir', r.dias_sem_abrir) order by r.clientes desc, a.nome), '[]'::jsonb)
        from (select rk.* from rk order by rk.clientes desc limit 200) r
        left join public.thb_alunos a on a.id = r.aluno_id),
    'total_parceiros', (select count(*)::integer from rk),
    'media_clientes',  (select round(avg(r.clientes), 1) from rk r),
    'max_clientes',    (select coalesce(max(r.clientes), 0)::integer from rk r),
    'com_30_ou_mais',  (select count(*)::integer from rk r where r.com_ficha_completa >= 30),
    'sem_mensagem',    (select count(*)::integer from rk r where r.mensagens = 0),
    'com_contratado',  (select count(*)::integer from rk r where r.contratados > 0),
    'sem_abrir_14d',   (select count(*)::integer from rk r where r.dias_sem_abrir >= 14)
  ) into v_parceiros;
  -- ── jornada ─────────────────────────────────────────────────────────────
  -- O caminho do PARCEIRO (148 ambientes), em NOVE CONTAGENS PARALELAS.
  --
  -- NAO E FUNIL. Nao existe taxa de passagem entre estagios, e ela nao e
  -- devolvida aqui DE PROPOSITO. Cada numero e "quantos ALCANCARAM este
  -- estagio", sempre sobre os mesmos 148 ambientes.
  --
  -- Quebras da cadeia, MEDIDAS em 23/09/2026 sobre a base corrigida:
  --   11 cadastraram cliente SEM concluir o onboarding
  --   11 mandaram mensagem   SEM ter os 30 completos
  --   26 escolheram favorito SEM ter mandado mensagem
  --    8 marcaram reuniao    SEM favorito
  --    8 fecharam contrato   SEM reuniao registrada
  -- 26 de 37 que escolheram favorito nunca mandaram mensagem: os 37 NAO sao
  -- subconjunto dos 22, e a divisao daria taxa acima de 100%.
  --
  -- AGREGUE CADA FONTE ANTES DE JUNTAR -- `bool_or` nos CTEs e o que impede a
  -- MULTIPLICACAO DE LINHAS. Ambiente com socio tem N linhas em gps.membros
  -- (148 ambientes, 165 membros); juntar com onboarding_respostas sem agregar
  -- antes conta o MESMO ambiente N vezes. Foi esse erro que produziu 151/89 na
  -- primeira medicao, em vez de 148/86 -- e o numero inflado parece plausivel.
  --
  -- `ambientes` parte de `select distinct m.aluno_id from gps.membros`, o
  -- MESMO universo de `programa.total`, que ja aparece na tela como
  -- "Parceiros · 148". Se divergirem, um numero contradiz o outro na mesma
  -- tela. Os `left join` abaixo NUNCA podem mudar a cardinalidade de `base`.
  with base as (
    select distinct m.aluno_id from gps.membros m),
  login as (
    select m.aluno_id,
           bool_or(u.last_sign_in_at is not null) as ja_entrou
      from gps.membros m
      left join auth.users u on u.id = m.user_id
     group by m.aluno_id),
  onb as (
    select m.aluno_id,
           bool_or(r.concluido_em is not null) as concluiu
      from gps.membros m
      join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
     group by m.aluno_id),
  cli as (
    select c.aluno_id,
           count(*)::integer as n,
           count(*) filter (where c.nome is not null and btrim(c.nome) <> ''
                              and c.telefone is not null
                              and btrim(c.telefone) <> '')::integer as completos,
           count(*) filter (where c.mensagem_padrao_enviada)::integer as msg,
           count(*) filter (where c.acompanhado_equipe)::integer as favorito,
           count(*) filter (where c.data_reuniao_preliminar is not null)::integer as reuniao,
           count(*) filter (where c.fase in ('contratado', 'concluido'))::integer as contratado
      from gps.etapa1_clientes c
     group by c.aluno_id)
  select jsonb_build_object(
    'ambientes',          count(*)::integer,
    'entraram',           count(*) filter (where l.ja_entrou)::integer,
    'onboarding_ok',      count(*) filter (where o.concluiu)::integer,
    'cadastrou',          count(*) filter (where coalesce(c.n, 0) >= 1)::integer,
    'fechou_30',          count(*) filter (where coalesce(c.completos, 0) >= 30)::integer,
    'mandou_msg',         count(*) filter (where coalesce(c.msg, 0) >= 1)::integer,
    'escolheu_favorito',  count(*) filter (where coalesce(c.favorito, 0) >= 1)::integer,
    'marcou_reuniao',     count(*) filter (where coalesce(c.reuniao, 0) >= 1)::integer,
    'fechou_contrato',    count(*) filter (where coalesce(c.contratado, 0) >= 1)::integer
  ) into v_jornada
    from base b
    left join login l on l.aluno_id = b.aluno_id
    left join onb   o on o.aluno_id = b.aluno_id
    left join cli   c on c.aluno_id = b.aluno_id;
  -- ── serie ───────────────────────────────────────────────────────────────
  -- Evolucao semanal: 10 semanas INTEIRAS, da mais antiga para a mais nova.
  --
  -- CORTE PELA `date_trunc`, NUNCA POR `now() - interval '10 weeks'`:
  -- `now() - 10 weeks` cai no MEIO de uma semana e produz um 11o item PARCIAL
  -- na borda antiga -- numero artificialmente baixo que alguem le como queda.
  -- Medido em 23/09: essa borda dava 13/07 com 35 ao lado de 136 na seguinte.
  --
  -- A SEMANA CORRENTE TAMBEM E PARCIAL, e isso NAO se corrige cortando -- e o
  -- presente. Por isso o bloco devolve `semana_corrente`: a tela marca aquele
  -- item como "em andamento" em vez de desenhar uma queda que nao existe.
  --
  -- `com_msg` CONTA O ESTADO ATUAL DA FLAG, nao "mandou naquela semana":
  -- `mensagem_padrao_enviada` e boolean SEM data. O numero diz "dos clientes
  -- criados naquela semana, quantos TEM a flag hoje" -- a mensagem pode ter
  -- saido semanas depois. NAO derivar a data de `atualizado_em`: ela se move
  -- em QUALQUER edicao da ficha, e daria uma serie que parece precisa e nao e.
  with sem as (
    select date_trunc('week', (c.criado_em at time zone v_fuso)) as semana,
           count(*)::integer as clientes,
           count(*) filter (where c.mensagem_padrao_enviada)::integer as com_msg,
           count(distinct c.aluno_id)::integer as parceiros_ativos
      from gps.etapa1_clientes c
     where (c.criado_em at time zone v_fuso)
             >= date_trunc('week', (now() at time zone v_fuso)) - interval '9 weeks'
     group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
           'semana',           to_char(s.semana, 'DD/MM'),
           'clientes',         s.clientes,
           'com_msg',          s.com_msg,
           'parceiros_ativos', s.parceiros_ativos) order by s.semana), '[]'::jsonb)
    into v_serie from sem s;
  -- A chave da semana corrente, no MESMO formato 'DD/MM' dos itens, para a
  -- tela casar por igualdade de texto. Sai do banco de proposito: calcular no
  -- cliente usaria o fuso do NAVEGADOR e erraria a semana fora de Sao Paulo.
  v_semana_corrente := to_char(date_trunc('week', (now() at time zone v_fuso)), 'DD/MM');
  return jsonb_build_object(
    'gerado_em', now(),
    'referencia', jsonb_build_object('fuso', v_fuso, 'hoje', v_hoje, 'dia', v_dia, 'mes', to_char(v_ini_mes, 'YYYY-MM'), 'mes_anterior', to_char(v_ini_ant, 'YYYY-MM')),
    'programa', v_programa, 'acesso', v_acesso, 'equipe', v_equipe, 'onboarding', v_onboarding, 'clientes', v_clientes,
    'honorarios', v_honorarios, 'atividade', v_atividade, 'grau_relacao', v_grau,
    'passos', v_passos, 'caminho', v_caminho, 'atencao', v_atencao, 'parceiros', v_parceiros,
    'jornada', v_jornada,
    'serie', jsonb_build_object('itens', v_serie, 'semana_corrente', v_semana_corrente));
end $function$;

-- gps.admin_definir_liberacao_etapa(uuid,smallint,boolean,text)
CREATE OR REPLACE FUNCTION gps.admin_definir_liberacao_etapa(p_aluno_id uuid, p_etapa smallint, p_liberada boolean, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_global boolean; v_nome text; v_antes boolean; v_motivo text;
  v_efetiva boolean; v_removido boolean := p_liberada is null;
begin
  if not gps.eh_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or p_etapa is null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — ele fica no histórico deste aluno.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;
  select e.liberada, e.nome into v_global, v_nome from gps.etapas e where e.id = p_etapa;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from gps.membros m where m.aluno_id = p_aluno_id) then
    raise exception 'Este cadastro não tem ambiente no programa.' using errcode = 'P0002';
  end if;
  select o.liberada into v_antes from gps.etapa_liberacao_aluno o
   where o.aluno_id = p_aluno_id and o.etapa = p_etapa;
  if v_removido then
    if v_antes is null then
      raise exception 'Esta etapa já segue a regra geral para este aluno.'
        using errcode = '22023';
    end if;
    delete from gps.etapa_liberacao_aluno
     where aluno_id = p_aluno_id and etapa = p_etapa;
  else
    insert into gps.etapa_liberacao_aluno (aluno_id, etapa, liberada, motivo, por, em)
    values (p_aluno_id, p_etapa, p_liberada, v_motivo, auth.uid(), now())
    on conflict (aluno_id, etapa) do update
      set liberada = excluded.liberada, motivo = excluded.motivo,
          por = excluded.por, em = excluded.em;
  end if;
  v_efetiva := coalesce(p_liberada, v_global);
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('etapa_liberacao_alterada', p_aluno_id,
          format('etapa %s (%s): %s para este aluno%s (regra geral: %s). Motivo: %s',
                 p_etapa, coalesce(v_nome, '?'),
                 case when v_efetiva then 'LIBERADA' else 'TRAVADA' end,
                 case when v_removido then ' — override REMOVIDO, volta ao geral' else '' end,
                 case when v_global then 'liberada' else 'bloqueada' end,
                 v_motivo),
          auth.uid());
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values (p_aluno_id, now(),
          case when v_efetiva then 'etapa_liberada_pela_equipe'
                              else 'etapa_travada_pela_equipe' end,
          'etapa', null,
          left(format('Etapa %s — %s', p_etapa, coalesce(v_nome, '?')), 300),
          jsonb_build_object('etapa', p_etapa, 'de', v_antes, 'para', p_liberada,
                             'global', v_global, 'removido', v_removido,
                             'motivo', v_motivo),
          'equipe', auth.uid(), 'app');
  return jsonb_build_object('etapa', p_etapa, 'nome', v_nome,
                            'liberada', v_efetiva, 'override', p_liberada,
                            'antes', v_antes, 'global', v_global,
                            'removido', v_removido);
end $function$;

commit;
