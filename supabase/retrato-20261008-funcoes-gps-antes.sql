-- RETRATO (não é migração; não se aplica sozinho): corpos VIVOS em 08/10/2026,
-- antes de 20261008000368+, das 129 funções do schema gps que essas migrações recriam.
-- Uso na reversão completa: begin; select blindagem.autorizar_guarda('<motivo>'); <este arquivo>; commit;

-- gps.eh_equipe()  md5 3dcf3acae01a30610ae63906dec25cfc
CREATE OR REPLACE FUNCTION gps.eh_equipe()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) or gps.eh_operador();
$function$;

-- gps.admin_adicionar_socio(uuid,uuid,text,text,boolean)  md5 992cc5c2eebdb32bb3d9d7778e723d03
CREATE OR REPLACE FUNCTION gps.admin_adicionar_socio(p_ambiente_aluno_id uuid, p_socio_aluno_id uuid, p_email text, p_senha text, p_confirmar_login_existente boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_email text := lower(trim(p_email)); v_existente uuid; v_pessoa uuid;
        v_amb_trigger uuid;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_adotar_login_existente(uuid,text,boolean)  md5 afff0a0339d78f011c3b4472e53b9b91
CREATE OR REPLACE FUNCTION gps.admin_adotar_login_existente(p_aluno_id uuid, p_senha text, p_forcar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_email text; v_aluno record; v_dono uuid; v_papel text; v_direito jsonb;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- gps.admin_ajuda_metricas()  md5 f35f3c8c88401d17fcc66e4a03d4e1bc
CREATE OR REPLACE FUNCTION gps.admin_ajuda_metricas()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_artigos jsonb; v_termos jsonb;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- gps.admin_ajuda_salvar(uuid,text,text,text[],text[],text,text,boolean,integer)  md5 721e2aef58362502a03288e0e974e842
CREATE OR REPLACE FUNCTION gps.admin_ajuda_salvar(p_id uuid, p_titulo text, p_corpo text, p_rotas text[], p_categorias text[], p_palavras_chave text, p_sinonimos text, p_ativo boolean, p_ordem integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_titulo text; v_corpo text; v_palavras text; v_sinonimos text; v_rotas text[]; v_categorias text[]; v_invalida text; v_id uuid;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- gps.admin_alvo_e_equipe(uuid)  md5 c920195a3099ad3a2500db8af804f208
CREATE OR REPLACE FUNCTION gps.admin_alvo_e_equipe(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.perfis p
     where p.id = p_user_id and p.status = 'ativo' and p.cargo in ('dev', 'admin')
  );
$function$;

-- gps.admin_apagar_nota(uuid)  md5 e140280a34ce16d98becb23e35e30731
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
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_cadastrar_compradores_hm(boolean)  md5 afd3aece96fa05af95e57654015eb639
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
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_clientes_agenda_kpis()  md5 a436f169cd96b0ce96c74b305192b80d
CREATE OR REPLACE FUNCTION gps.admin_clientes_agenda_kpis()
 RETURNS TABLE(etapa_agenda text, total integer, estrela integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_clientes_lista(integer,integer,text,text,text,text,text)  md5 13d191bd9c8d7b4724e396afdfd19f0a
CREATE OR REPLACE FUNCTION gps.admin_clientes_lista(p_limite integer DEFAULT 100, p_offset integer DEFAULT 0, p_fase text DEFAULT NULL::text, p_grau text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_reuniao text DEFAULT NULL::text, p_agenda text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, aluno_id uuid, parceiro_nome text, cliente_nome text, telefone text, fase text, grau_relacao text, perfil_disc text, data_reuniao_preliminar date, aderiu_reuniao boolean, acompanhado_equipe boolean, criado_em timestamp with time zone, ep_em timestamp with time zone, ep_estado text, rp_em timestamp with time zone, rp_estado text, cq_em timestamp with time zone, cq_estado text, ex_em timestamp with time zone, ex_estado text, etapa_agenda text, total_linhas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_limite integer; v_offset integer; v_busca text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_clientes_reuniao_kpis()  md5 a69c151f67f9851c949d3272beef5f4e
CREATE OR REPLACE FUNCTION gps.admin_clientes_reuniao_kpis()
 RETURNS TABLE(total_com_reuniao bigint, marcadas bigint, para_vencer bigint, vencidas bigint, fav_total_com_reuniao bigint, fav_marcadas bigint, fav_para_vencer bigint, fav_vencidas bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_compradores_hm_aguardando()  md5 3a4c5fa25c77c0662219d7e192e615cb
CREATE OR REPLACE FUNCTION gps.admin_compradores_hm_aguardando()
 RETURNS TABLE(aluno_id uuid, nome text, email text, comprado_em timestamp with time zone, oferta_codigo text, valor numeric, metodo_pagamento text, tem_login boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_desde timestamptz;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_confirmar_acompanhamento(uuid,text)  md5 278be0e6d39196187ca771b17256aba2
CREATE OR REPLACE FUNCTION gps.admin_confirmar_acompanhamento(p_cliente_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_motivo text;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_converter_titular_em_socio(uuid,uuid,text)  md5 b8b03bc9f4925d8cf9d9b152eb488831
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
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_dashboard()  md5 5b98a6540816a0975aa4a12db7aae662
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
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- gps.admin_definir_liberacao_etapa(uuid,smallint,boolean,text)  md5 22da91afbc131274c558982dbdff1b43
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
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_definir_liberacao_etapas_lote(uuid[],jsonb,text)  md5 d4b955c3f1dcccb7195938f132639a9a
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
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_definir_senha(uuid,text)  md5 eca9eb1f86c4d4e1d2eb6b00ebbee0b8
CREATE OR REPLACE FUNCTION gps.admin_definir_senha(p_aluno_id uuid, p_senha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_email text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- gps.admin_definir_senha_membro(uuid,text)  md5 303c3bf3c44e18d3aeeeb4cbf07d1b55
CREATE OR REPLACE FUNCTION gps.admin_definir_senha_membro(p_membro_id uuid, p_senha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- gps.admin_destravar_onboarding(uuid)  md5 1b89096921afb008f634e6db0f97c18e
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
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_diagnostico_ambiente(uuid)  md5 97fa9d694616c5d96d388d563b09d59c
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
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_direito_ao_acesso(uuid)  md5 d49b0f675ff8b3023d333299bec6c387
CREATE OR REPLACE FUNCTION gps.admin_direito_ao_acesso(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_ok boolean; v_motivo text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_excluir_acesso(uuid,boolean)  md5 a45d8e9d32684d96fdf645b6b2edcc9e
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
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_excluir_membro(uuid)  md5 934f2ec96504ae06e638d081301f21ca
CREATE OR REPLACE FUNCTION gps.admin_excluir_membro(p_membro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_financeiro_candidatos(uuid)  md5 68675e0c0c819a6fb082c41c654b574c
CREATE OR REPLACE FUNCTION gps.admin_financeiro_candidatos(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_out jsonb; v_ja_tem int;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_financeiro_desvincular(uuid,text)  md5 7251af827dfde4eadd05ace2f5fc8485
CREATE OR REPLACE FUNCTION gps.admin_financeiro_desvincular(p_aluno_id uuid, p_contato_hm_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id text; v_linhas int; v_nosso boolean;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_financeiro_vincular(uuid,text)  md5 35fc65c2d7e6bd3542f58d6d4127d36d
CREATE OR REPLACE FUNCTION gps.admin_financeiro_vincular(p_aluno_id uuid, p_contato_hm_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id text; v_linhas int;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_liberar_acompanhamento(uuid,text)  md5 0df0257810d079869bb0d0db8937a2c4
CREATE OR REPLACE FUNCTION gps.admin_liberar_acompanhamento(p_cliente_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_motivo text;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_liberar_aluno_plantao(text,text,text,text,boolean)  md5 c1016a163b586250fd6171fc41703eab
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
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_lixeira_expurgar(integer)  md5 f2fda1e9d88fe6c908b5d73e3d41c9a6
CREATE OR REPLACE FUNCTION gps.admin_lixeira_expurgar(p_dias integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_alvo int; v_ids uuid[];
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_lixeira_restaurar_clientes(uuid,uuid)  md5 6324606f4ed23985b7453c2e95d33ae2
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
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_marcar_finalizado(uuid,boolean)  md5 8d2d7d753ccf631f172ed9a0f4f5581d
CREATE OR REPLACE FUNCTION gps.admin_marcar_finalizado(p_aluno_id uuid, p_finalizado boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ator uuid; v_nome text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_mencionaveis()  md5 b6d6e59bc5bf5a8287d0647160684595
CREATE OR REPLACE FUNCTION gps.admin_mencionaveis()
 RETURNS TABLE(id uuid, nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
  select p.id, coalesce(nullif(btrim(p.nome), ''), 'Sem nome') as nome
    from public.perfis p
   where p.status = 'ativo' and p.cargo in ('dev','admin')
   order by 2, 1;
end $function$;

-- gps.admin_mover_membro(uuid,uuid)  md5 adde4a02b2636a1380b26081e32ef1f7
CREATE OR REPLACE FUNCTION gps.admin_mover_membro(p_membro_id uuid, p_novo_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m record; v_email text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
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

-- gps.admin_onboarding_do_aluno(uuid)  md5 abd97b6d6e6e92db4392fbb15624a96e
CREATE OR REPLACE FUNCTION gps.admin_onboarding_do_aluno(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_saida jsonb;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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

-- gps.admin_painel_alunos(integer,integer)  md5 539b9503c8cb018806c04ab37f007d9a
CREATE OR REPLACE FUNCTION gps.admin_painel_alunos(p_limite integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(aluno_id uuid, qtd_membros integer, tem_login boolean, desde timestamp with time zone, ultimo_acesso timestamp with time zone, clientes_preenchidos integer, clientes_com_dados integer, clientes_com_perda integer, agendados integer, tarefas_concluidas integer[], honorarios_contratados numeric, contratados integer, contratados_sem_valor integer, total_ambientes integer, onboarding_status text, em_fechamento integer, apto_ao_saldo boolean, classe text, favorito_nome text, favorito_fase text, favorito_confirmado boolean, lista_incompleta boolean, pronto_para_finalizar boolean, finalizado_em timestamp with time zone, socio_nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000); v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'apenas administradores' using errcode = '42501'; end if;
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

-- gps.admin_painel_atendimento()  md5 729cb233bdba0439eca14eabfbe78396
CREATE OR REPLACE FUNCTION gps.admin_painel_atendimento()
 RETURNS TABLE(aluno_id uuid, pendencias_abertas integer, ultima_nota_em timestamp with time zone, ultima_nota_tipo text, ultima_nota_resumo text, chamados_abertos integer, reunioes_contestadas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query
  with ult as (
    select distinct on (n.aluno_id) n.aluno_id, n.criado_em, n.tipo, left(n.texto,140) as resumo
      from gps.aluno_notas n order by n.aluno_id, n.criado_em desc
  ),
  pend as (select n.aluno_id, count(*)::integer as abertas from gps.aluno_notas n
            where n.tipo='pendencia' and n.resolvido_em is null group by n.aluno_id),
  cham as (select c.aluno_id, count(*)::integer as abertos from gps.chamados c
            where c.status <> 'fechado' group by c.aluno_id),
  -- 🔑 Coluna nova: contestações sem proposta nova depois. MESMA RPC, zero
  -- consulta adicional no /admin (molde de `chamados_abertos`).
  cont as (select pp.aluno_id, count(*)::integer as contestadas
             from gps.reuniao_preliminar_propostas pp
            where pp.estado='contestada'
              and not exists (select 1 from gps.reuniao_preliminar_propostas nova
                               where nova.cliente_id = pp.cliente_id
                                 and nova.proposta_em > pp.proposta_em)
            group by pp.aluno_id),
  base as (
    select b.aluno_id from (
      select u.aluno_id from ult u
      union select ch.aluno_id from cham ch
      union select co.aluno_id from cont co
    ) b
    where exists (select 1 from gps.membros m where m.aluno_id = b.aluno_id)
  )
  select b.aluno_id, coalesce(p.abertas,0), u.criado_em, u.tipo, u.resumo,
         coalesce(ch.abertos,0), coalesce(co.contestadas,0)
    from base b
    left join ult u on u.aluno_id=b.aluno_id
    left join pend p on p.aluno_id=b.aluno_id
    left join cham ch on ch.aluno_id=b.aluno_id
    left join cont co on co.aluno_id=b.aluno_id;
end; $function$;

-- gps.admin_painel_sinais()  md5 fc33cc2de7ad7a55f14b3095896080e3
CREATE OR REPLACE FUNCTION gps.admin_painel_sinais()
 RETURNS TABLE(aluno_id uuid, etapa_alem_da_2_liberada boolean, chamado_aberto_desde timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query
  with amb as (
    select distinct m.aluno_id as aluno_id from gps.membros m
  ),
  lib as (
    select a.aluno_id as aluno_id
      from amb a
     where exists (
       select 1
         from gps.etapas e
         left join gps.etapa_liberacao_aluno o
                on o.etapa = e.id and o.aluno_id = a.aluno_id
        where e.id > 2
          and coalesce(o.liberada, e.liberada)
     )
  ),
  cham as (
    select c.aluno_id as aluno_id, min(c.ultima_mensagem_em) as desde
      from gps.chamados c
     where c.status = 'aberto'
     group by c.aluno_id
  )
  select a.aluno_id,
         (l.aluno_id is not null),
         ch.desde
    from amb a
    left join lib  l  on l.aluno_id  = a.aluno_id
    left join cham ch on ch.aluno_id = a.aluno_id;
end;
$function$;

-- gps.admin_plantao_cancelar_inscricao(uuid,text)  md5 cf58c8eb3fc5e16427fcb3d7c2b9b153
CREATE OR REPLACE FUNCTION gps.admin_plantao_cancelar_inscricao(p_inscricao_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_motivo text := nullif(btrim(coalesce(p_motivo,'')),''); v_aluno_id uuid; v_linhas int;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode='40001'; end if;
  if v_motivo is not null and length(v_motivo) > 300 then
    raise exception 'O motivo pode ter no máximo 300 caracteres.' using errcode='22023'; end if;

  update gps.plantao_inscricoes set cancelado_em = now()
   where id = p_inscricao_id and cancelado_em is null
  returning aluno_plantao_id into v_aluno_id;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Esta inscrição já estava cancelada, ou não existe.' using errcode='40001'; end if;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_aluno_id, 'plantao_inscricao_cancelada_pela_equipe');
  return jsonb_build_object('inscricao_id', p_inscricao_id, 'motivo', v_motivo);
end $function$;

-- gps.admin_plantao_editar_nome_inscricao(uuid,text)  md5 2444e7728be95b77eb83f82b26bcc16e
CREATE OR REPLACE FUNCTION gps.admin_plantao_editar_nome_inscricao(p_inscricao_id uuid, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nome text := nullif(btrim(coalesce(p_nome,'')),''); v_aluno_id uuid;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode='40001'; end if;
  if v_nome is not null and length(v_nome) > 120 then
    raise exception 'O nome pode ter no máximo 120 caracteres.' using errcode='22023'; end if;

  update gps.plantao_inscricoes set nome_informado = v_nome where id = p_inscricao_id
  returning aluno_plantao_id into v_aluno_id;
  if v_aluno_id is null then
    raise exception 'Inscrição não encontrada.' using errcode='P0002'; end if;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_aluno_id, 'plantao_nome_editado_pela_equipe');
  return jsonb_build_object('inscricao_id', p_inscricao_id, 'nome', v_nome);
end $function$;

-- gps.admin_plantao_inscrever(uuid,text,text)  md5 1406938ef6b89cc9df50b32ac096733c
CREATE OR REPLACE FUNCTION gps.admin_plantao_inscrever(p_slot_id uuid, p_email text, p_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_nome  text := nullif(btrim(coalesce(p_nome,'')),'');
  v_aluno_id uuid; v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid; v_ativa_slot_id uuid; v_inscricao_id uuid; v_reativada boolean;
  v_iv record;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode='40001'; end if;
  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    raise exception 'Informe um e-mail válido.' using errcode='22023'; end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa
     and not exists (select 1 from gps.membros m
                      join public.thb_alunos t on t.id = m.aluno_id
                     where lower(btrim(t.email)) = v_email);
  if v_aluno_id is null then
    if exists (select 1 from gps.membros m
                join public.thb_alunos t on t.id = m.aluno_id
               where lower(btrim(t.email)) = v_email) then
      raise exception 'Esta pessoa está no Programa de Implementação Assistida. O Plantão é exclusivo de quem faz parte do Acelera Holding.'
        using errcode='P0002';
    end if;
    raise exception 'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.'
      using errcode='P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('gps.plantao_aluno:' || v_aluno_id::text, 0));

  select * into v_slot from gps.plantao_slots where id = p_slot_id for update;
  if not found then raise exception 'Plantão não encontrado.' using errcode='P0002'; end if;

  select i.id, i.slot_id into v_ativa_id, v_ativa_slot_id
    from gps.plantao_inscricoes i join gps.plantao_slots sl on sl.id = i.slot_id
   where i.aluno_plantao_id = v_aluno_id and i.cancelado_em is null
     and sl.inicio_em > now() and i.slot_id <> p_slot_id
   limit 1;
  if v_ativa_id is not null then
    return jsonb_build_object('ok', false,
      'motivo','Este aluno já tem uma inscrição ativa em outro plantão.',
      'slot_conflitante_id', v_ativa_slot_id); end if;

  select * into v_iv from gps.plantao_intervalo(v_aluno_id, p_slot_id);
  if found then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id, detalhe)
    values (v_aluno_id, 'plantao_recusa_intervalo', p_slot_id,
            jsonb_build_object('origem', 'equipe', 'causa_slot_id', v_iv.causa_slot_id,
                               'causa_presente', v_iv.causa_presente,
                               'libera_slot_id', v_iv.libera_slot_id));
    return jsonb_build_object('ok', false,
      'motivo', 'Este aluno tem inscrição no plantão de ' || to_char(v_iv.causa_data,'DD/MM') ||
                ' às ' || to_char(v_iv.causa_hora,'HH24:MI') ||
                ', e este é o plantão logo depois — o intervalo o deixa de fora. ' ||
                coalesce('Libera a partir de ' || to_char(v_iv.libera_data,'DD/MM') || ' às ' ||
                         to_char(v_iv.libera_hora,'HH24:MI') || '.',
                         'Libera no próximo plantão publicado.'),
      'em_intervalo', true);
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno_id, v_nome)
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null, inscrito_em = now(),
        nome_informado = coalesce(excluded.nome_informado, gps.plantao_inscricoes.nome_informado)
  returning id, (xmax <> 0) into v_inscricao_id, v_reativada;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
  values (v_aluno_id, 'plantao_inscricao_criada_pela_equipe', p_slot_id);

  return jsonb_build_object('ok', true, 'inscricao_id', v_inscricao_id,
                            'reativada', coalesce(v_reativada,false));
end $function$;

-- gps.admin_plantao_marcar_presenca(uuid,boolean)  md5 de8150bf113e37ff0ed7339ec2d5476a
CREATE OR REPLACE FUNCTION gps.admin_plantao_marcar_presenca(p_inscricao_id uuid, p_presente boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_aluno_id uuid; v_linhas int;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode='40001'; end if;

  if p_presente then
    update gps.plantao_inscricoes
       set presenca_em = coalesce(presenca_em, now()),
           presenca_origem = coalesce(presenca_origem, 'equipe')
     where id = p_inscricao_id and cancelado_em is null
    returning aluno_plantao_id into v_aluno_id;
  else
    update gps.plantao_inscricoes set presenca_em = null, presenca_origem = null
     where id = p_inscricao_id and cancelado_em is null
    returning aluno_plantao_id into v_aluno_id;
  end if;

  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Inscrição não encontrada, ou já cancelada.' using errcode='P0002'; end if;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_aluno_id, case when p_presente then 'plantao_presenca_marcada_pela_equipe'
                           else 'plantao_presenca_desmarcada_pela_equipe' end);
  return jsonb_build_object('inscricao_id', p_inscricao_id, 'presente', p_presente);
end $function$;

-- gps.admin_previa_converter_titular_em_socio(uuid,uuid)  md5 57ac78a28c7bbf192c60368c03e4926c
CREATE OR REPLACE FUNCTION gps.admin_previa_converter_titular_em_socio(p_membro_id uuid, p_ambiente_destino uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m               record;
  v_n_membros     int;
  v_origem        uuid;
  v_nome_origem   text;
  v_nome_destino  text;
  v_destino_existe boolean;
  v_email         text;
  v_n_clientes    int := 0;
  v_a_copiar      int := 0;
  v_ja_no_destino int := 0;
  v_n_progresso   int := 0;
  v_n_notas       int := 0;
  v_n_chamados    int := 0;
  v_impedimento   text := null;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
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
      or (mm.pessoa_aluno_id is null and mm.aluno_id = p_membro_id);

  v_origem := m.aluno_id;

  select t.nome into v_nome_origem  from public.thb_alunos t where t.id = v_origem;
  select t.nome into v_nome_destino from public.thb_alunos t where t.id = p_ambiente_destino;
  v_destino_existe := exists (select 1 from public.thb_alunos t where t.id = p_ambiente_destino);

  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;

  if m.papel <> 'titular' then
    v_impedimento := 'Este membro já é sócio — para mudá-lo de ambiente use "Mover membro".';
  elsif m.pessoa_aluno_id is distinct from m.aluno_id then
    v_impedimento := 'Este membro é titular de um ambiente que não é o cadastro dele. Use "Trocar titular" antes.';
  elsif v_origem = p_ambiente_destino then
    v_impedimento := 'O ambiente de destino é o mesmo de origem.';
  elsif not v_destino_existe then
    v_impedimento := 'Ambiente de destino não encontrado.';
  elsif not exists (select 1 from gps.membros t
                     where t.aluno_id = p_ambiente_destino and t.papel = 'titular') then
    v_impedimento := 'O ambiente de destino não tem titular.';
  elsif m.user_id is not null
        and exists (select 1 from gps.membros x
                     where x.aluno_id = p_ambiente_destino and x.user_id = m.user_id) then
    v_impedimento := 'Este login já participa do ambiente de destino.';
  elsif exists (select 1 from gps.membros o
                 where o.aluno_id = v_origem and o.id <> m.id) then
    v_impedimento := 'O ambiente de origem tem outro membro. Resolva o outro membro antes de converter este.';
  elsif btrim(coalesce(v_nome_origem, '')) = '' then
    v_impedimento := 'O ambiente de origem está sem nome no cadastro — não é possível confirmar a conversão. Corrija o nome antes.';
  end if;

  select count(*) into v_n_clientes  from gps.etapa1_clientes c where c.aluno_id = v_origem;
  select count(*) into v_n_progresso from gps.progresso p       where p.aluno_id = v_origem;
  select count(*) into v_n_notas     from gps.aluno_notas n     where n.aluno_id = v_origem;
  select count(*) into v_n_chamados  from gps.chamados ch       where ch.aluno_id = v_origem;

  select
    count(*) filter (where not existe_no_destino),
    count(*) filter (where existe_no_destino)
    into v_a_copiar, v_ja_no_destino
    from (
      select exists (
               select 1 from gps.etapa1_clientes d
                where d.aluno_id = p_ambiente_destino
                  and gps.cliente_chave_dedup(d.nome, d.telefone)
                    = gps.cliente_chave_dedup(c.nome, c.telefone)
             ) as existe_no_destino
        from gps.etapa1_clientes c
       where c.aluno_id = v_origem
    ) s;

  return jsonb_build_object(
    'membro_id', m.id,
    'origem',  jsonb_build_object(
                 'aluno_id', v_origem,
                 'nome', v_nome_origem,
                 'email_login', v_email),
    'destino', jsonb_build_object(
                 'aluno_id', p_ambiente_destino,
                 'nome', v_nome_destino),
    'clientes_na_origem',     v_n_clientes,
    'clientes_a_copiar',      v_a_copiar,
    'clientes_ja_no_destino', v_ja_no_destino,
    'progresso_na_origem',    v_n_progresso,
    'notas_na_origem',        v_n_notas,
    'chamados_na_origem',     v_n_chamados,
    'pode_converter',         (v_impedimento is null),
    'impedimento',            v_impedimento);
end $function$;

-- gps.admin_programas_do_email(text)  md5 9afae54f15ff097025929ff96b86c161
CREATE OR REPLACE FUNCTION gps.admin_programas_do_email(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid; v_email text; v_progs jsonb := '[]'::jsonb; v_u record;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if coalesce(trim(p_email),'') = '' then
    return jsonb_build_object('tem_login', false, 'programas', '[]'::jsonb);
  end if;

  select id, email into v_user, v_email
    from auth.users where lower(trim(email)) = lower(trim(p_email));

  if v_user is null then
    return jsonb_build_object('tem_login', false, 'email', lower(trim(p_email)),
                              'programas', '[]'::jsonb);
  end if;

  select * into v_u from auth.users where id = v_user;

  -- GPS
  if exists (select 1 from gps.membros where user_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','GPS',
      'detalhe', (select 'papel: '||m.papel from gps.membros m where m.user_id=v_user limit 1)));
  end if;

  -- Workbook CNHF
  if exists (select 1 from workbook.perfis where user_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Workbook CNHF',
      'detalhe', (select 'role: '||p.role from workbook.perfis p where p.user_id=v_user limit 1)));
  end if;

  -- Central de Projetos
  if exists (select 1 from central.alunos where id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Central de Projetos',
      'detalhe', (select 'status: '||a.status from central.alunos a where a.id=v_user limit 1)));
  end if;

  -- Rede Nacional de Especialistas
  if exists (select 1 from rede.perfis where auth_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Rede de Especialistas',
      'detalhe', (select 'status: '||r.status::text from rede.perfis r where r.auth_id=v_user limit 1)));
  end if;

  -- SIP
  if exists (select 1 from sip.progress where user_id = v_user)
     or exists (select 1 from sip.meta where user_id::text = v_user::text) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','SIP', 'detalhe','tem progresso registrado'));
  end if;

  -- Holding Total (ht)
  if exists (select 1 from ht.lesson_progress where user_id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Holding Total', 'detalhe','tem progresso de aula'));
  end if;

  -- Equipe interna
  if exists (select 1 from public.perfis where id = v_user) then
    v_progs := v_progs || jsonb_build_array(jsonb_build_object(
      'programa','Equipe interna',
      'detalhe', (select 'cargo: '||p.cargo::text||' / '||p.status
                    from public.perfis p where p.id=v_user limit 1)));
  end if;

  return jsonb_build_object(
    'tem_login', true,
    'user_id', v_user,
    'email', v_email,
    'origem', v_u.raw_user_meta_data->>'origem',
    'ultimo_acesso', v_u.last_sign_in_at,
    'criado_em', v_u.created_at,
    'tem_senha', coalesce(v_u.encrypted_password,'') <> '',
    'e_equipe', gps.admin_alvo_e_equipe(v_user),
    'programas', v_progs,
    'qtd_programas', jsonb_array_length(v_progs)
  );
end $function$;

-- gps.admin_reabrir_etapa(uuid,smallint,text)  md5 fa3074facb1ab1054993ba93b731790c
CREATE OR REPLACE FUNCTION gps.admin_reabrir_etapa(p_aluno_id uuid, p_etapa smallint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_afetadas smallint[]; v_qtd int; v_nome text; v_motivo text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or p_etapa is null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;
  select e.nome into v_nome from gps.etapas e where e.id = p_etapa;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;
  with reabertas as (
    update gps.progresso
       set concluida = false, concluida_em = null
     where aluno_id = p_aluno_id and etapa = p_etapa and concluida
    returning tarefa
  )
  select array_agg(tarefa order by tarefa), count(*)
    into v_afetadas, v_qtd
    from reabertas;
  if coalesce(v_qtd, 0) = 0 then
    raise exception 'Não há tarefa concluída nesta etapa para reabrir.'
      using errcode = '22023';
  end if;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('progresso_reaberto', p_aluno_id,
          format('etapa %s (%s): %s tarefa(s) reaberta(s) %s. Motivo: %s',
                 p_etapa, coalesce(v_nome, '?'), v_qtd,
                 coalesce(v_afetadas::text, '{}'), v_motivo),
          auth.uid());
  return jsonb_build_object('etapa', p_etapa, 'nome', v_nome,
                            'reabertas', v_qtd, 'tarefas', v_afetadas);
end $function$;

-- gps.admin_registrar_export_clientes(integer,text,text,text,text,text)  md5 767b39b5288b6ef3b353e7d4a3e7db7a
CREATE OR REPLACE FUNCTION gps.admin_registrar_export_clientes(p_linhas integer, p_fase text DEFAULT NULL::text, p_grau text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_reuniao text DEFAULT NULL::text, p_agenda text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'clientes_exportados',
    null,
    format(
      '%s linha(s) exportada(s). Filtro: fase=%s, grau=%s, busca=%s, reuniao=%s, agenda=%s',
      greatest(coalesce(p_linhas, 0), 0),
      coalesce(p_fase, '(todas)'),
      coalesce(p_grau, '(todos)'),
      -- so registra SE houve busca -- nao o termo em si, que pode ser o
      -- nome de um cliente ou parceiro (dado de terceiro).
      case when nullif(btrim(coalesce(p_busca, '')), '') is null
           then '(nenhuma)' else '(com termo)' end,
      coalesce(p_reuniao, '(todas)'),
      coalesce(p_agenda, '(todas)')
    ),
    auth.uid()
  );
end $function$;

-- gps.admin_registrar_lote_de_acessos(integer,integer,integer,integer)  md5 fd31d091b5cae7e0fcb7004a0d5f1e65
CREATE OR REPLACE FUNCTION gps.admin_registrar_lote_de_acessos(p_total integer, p_criados integer, p_falhas integer, p_precisa_decisao integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('acessos_criados_em_lote', null,
          format('lote de %s: %s criado(s), %s falha(s), %s aguardando decisao',
                 greatest(coalesce(p_total, 0), 0), greatest(coalesce(p_criados, 0), 0),
                 greatest(coalesce(p_falhas, 0), 0), greatest(coalesce(p_precisa_decisao, 0), 0)),
          auth.uid());
end $function$;

-- gps.admin_remover_favorito_lote(uuid[],text,boolean,boolean)  md5 4d6aeaf0a5f9179a3dc1a54a18d33754
CREATE OR REPLACE FUNCTION gps.admin_remover_favorito_lote(p_alunos uuid[], p_motivo text, p_simular boolean DEFAULT false, p_forcar boolean DEFAULT false)
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
  v_simular      boolean := coalesce(p_simular, false);
  v_forcar       boolean := coalesce(p_forcar, false);
  v_aluno        uuid;
  v_c            record;
  v_motivos      text[];
  v_resultado    text;
  v_removidos    int   := 0;
  v_sem_favorito int   := 0;
  v_pulados      int   := 0;
  v_itens        jsonb := '[]'::jsonb;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_alunos is null or array_position(p_alunos, null) is not null then
    raise exception 'aluno nao informado' using errcode = '22023';
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
  select count(*) into v_sem_ambiente
    from unnest(v_alunos) a
   where not exists (select 1 from gps.membros m where m.aluno_id = a);
  if v_sem_ambiente > 0 then
    raise exception 'Sem ambiente no programa: % de % aluno(s) selecionado(s).',
      v_sem_ambiente, v_n_alunos using errcode = 'P0002';
  end if;
  foreach v_aluno in array v_alunos loop
    if v_simular then
      select c.id, c.acompanhamento_confirmado_em, c.contrato_path
        into v_c
        from gps.etapa1_clientes c
       where c.aluno_id = v_aluno and c.acompanhado_equipe;
    else
      select c.id, c.acompanhamento_confirmado_em, c.contrato_path
        into v_c
        from gps.etapa1_clientes c
       where c.aluno_id = v_aluno and c.acompanhado_equipe
         for update;
    end if;
    if not found then
      v_sem_favorito := v_sem_favorito + 1;
      v_itens := v_itens || jsonb_build_object(
        'aluno_id', v_aluno, 'cliente_id', null,
        'resultado', 'sem_favorito', 'motivos', '[]'::jsonb);
      continue;
    end if;
    v_motivos := array_remove(array[
      case when v_c.acompanhamento_confirmado_em is not null
           then 'confirmado pela equipe' end,
      case when v_c.contrato_path is not null
           then 'contrato anexado' end,
      case when exists (select 1 from gps.sessao_agendamentos s
                         where s.aluno_id = v_aluno and s.cliente_id = v_c.id
                           and s.estado <> 'cancelado')
           then 'sessão marcada' end,
      case when exists (select 1 from gps.entrevista_previa e
                         where e.aluno_id = v_aluno and e.cliente_id = v_c.id)
           then 'Entrevista Prévia registrada' end,
      case when exists (select 1 from gps.reuniao_preliminar_propostas r
                         where r.aluno_id = v_aluno and r.cliente_id = v_c.id)
           then 'proposta de Reunião Preliminar' end
    ], null);
    if cardinality(v_motivos) > 0 and not v_forcar then
      v_resultado := 'pulado';
      v_pulados := v_pulados + 1;
    else
      v_resultado := 'removido';
      v_removidos := v_removidos + 1;
      if not v_simular then
        update gps.etapa1_clientes
           set acompanhado_equipe = false
         where id = v_c.id;
        insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
        values ('favorito_removido_lote', v_aluno,
                format('cliente %s deixou de ser o favorito (lote%s). Motivo: %s',
                       v_c.id,
                       case when cardinality(v_motivos) > 0
                            then ', forçado: ' || array_to_string(v_motivos, ', ')
                            else '' end,
                       v_motivo),
                auth.uid());
      end if;
    end if;
    v_itens := v_itens || jsonb_build_object(
      'aluno_id', v_aluno, 'cliente_id', v_c.id,
      'resultado', v_resultado, 'motivos', to_jsonb(v_motivos));
  end loop;
  return jsonb_build_object('removidos', v_removidos,
                            'sem_favorito', v_sem_favorito,
                            'pulados', v_pulados,
                            'itens', v_itens);
end $function$;

-- gps.admin_status_acesso(uuid)  md5 d6914a0324cc81e033a236e0a8d37b9c
CREATE OR REPLACE FUNCTION gps.admin_status_acesso(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_aluno record; v_u record; v_membro record; v_membros jsonb;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select id, nome, email into v_aluno from public.thb_alunos where id = p_aluno_id;
  if not found then
    raise exception 'Aluno não encontrado.' using errcode = 'P0002';
  end if;
  v_user := gps.admin_user_do_aluno(p_aluno_id);
  select * into v_membro from gps.membros where aluno_id = p_aluno_id order by (papel='titular') desc, criado_em asc limit 1;
  select * into v_u from auth.users where id = v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
           'membro_id', m.id, 'papel', m.papel, 'user_id', m.user_id, 'email', u.email,
           'tem_senha', coalesce(u.encrypted_password,'') <> '',
           'email_confirmado', u.email_confirmed_at is not null,
           'ultimo_acesso', u.last_sign_in_at
         ) order by (m.papel='titular') desc, m.criado_em asc), '[]'::jsonb)
    into v_membros
    from gps.membros m left join auth.users u on u.id = m.user_id
   where m.aluno_id = p_aluno_id;
  return jsonb_build_object(
    'aluno_id', p_aluno_id,
    'email_cadastro', v_aluno.email,
    'tem_login', v_user is not null,
    'user_id', v_user,
    'email_login', v_u.email,
    'email_bate', v_user is not null and lower(trim(coalesce(v_u.email, ''))) = lower(trim(coalesce(v_aluno.email, ''))),
    'email_confirmado', v_u.email_confirmed_at is not null,
    'tem_senha', coalesce(v_u.encrypted_password, '') <> '',
    'ultimo_acesso', v_u.last_sign_in_at,
    'criado_em', v_u.created_at,
    'no_gps', v_membro.id is not null,
    'vinculo_completo', v_membro.user_id is not null,
    'qtd_membros', jsonb_array_length(v_membros),
    'membros', v_membros,
    'solicitacao_pendente', exists (
      select 1 from gps.solicitacoes_acesso s
       where s.status = 'pendente'
         and (s.user_id = v_user or lower(trim(s.email)) = lower(trim(coalesce(v_aluno.email, ''))))
    )
  );
end $function$;

-- gps.admin_trocar_email_login(uuid,text,boolean,text)  md5 20899478936efff7f11e5a307b58391e
CREATE OR REPLACE FUNCTION gps.admin_trocar_email_login(p_membro_id uuid, p_email text, p_confirmar_outros_sistemas boolean DEFAULT false, p_senha text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m record;
  v_novo text;
  v_antigo text;
  v_identity record;
  v_senha_definida boolean := false;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if coalesce((select valor from gps.config where chave = 'troca_email_login_ativa'), '') <> 'true' then
    raise exception 'A troca de e-mail do login está desligada no momento.' using errcode = '42501';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.user_id is null then
    raise exception 'Este membro ainda não tem login.' using errcode = 'P0002';
  end if;

  if gps.admin_alvo_e_equipe(m.user_id) then
    raise exception 'Esta conta é da equipe — o e-mail do login não pode ser trocado por aqui.' using errcode = '42501';
  end if;

  v_novo := lower(btrim(p_email));
  -- RFC 5321: 254 caracteres. Sem teto, um e-mail de 10 mil caracteres
  -- passaria pelo regex e iria para auth.users e para o `detalhe` do log
  -- (pentest 11/09, achado BAIXO).
  if v_novo is null or v_novo = '' or length(v_novo) > 254
     or v_novo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  select email into v_antigo from auth.users where id = m.user_id;
  if v_antigo is null then
    raise exception 'O login deste membro não existe mais.' using errcode = 'P0002';
  end if;

  if v_novo = lower(btrim(v_antigo)) then
    raise exception 'Este já é o e-mail do login.' using errcode = '22023';
  end if;

  -- is_sso_user = false NAO E DECORATIVO: e o que torna users_email_partial_key
  -- utilizavel. Medido 11/09/2026: sem ele Seq Scan 314,2 ms / 774 buffers;
  -- com ele Index Scan 2,6 ms / 2 buffers. 120x.
  if exists (
    select 1 from auth.users
     where email = v_novo and is_sso_user = false and id <> m.user_id
  ) then
    raise exception 'Este e-mail já está em uso por outra conta.' using errcode = 'P0003';
  end if;

  -- 🔴 `public.perfis` ENTROU AQUI (pentest 11/09, achado ALTO). Ela e a
  -- tabela de EQUIPE dos 7 sistemas; sem ela, conta de equipe de outro portal
  -- com perfil pendente/inativo ou cargo fora de dev/admin passava pela
  -- guarda 4 E pela 8. A mitigacao existia so na Server Action, que e cliente
  -- da RPC -- nao e fronteira.
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

  if p_senha is not null and length(trim(p_senha)) < 8 then
    raise exception 'A senha precisa ter ao menos 8 caracteres.' using errcode = '22023';
  end if;

  if p_senha is not null then
    update auth.users
       set email = v_novo,
           encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('gps_senha_temp_em', now()),
           recovery_token = '', recovery_sent_at = null, confirmation_token = '',
           email_change = '', email_change_token_new = '', email_change_token_current = '',
           email_change_confirm_status = 0, updated_at = now()
     where id = m.user_id;
    v_senha_definida := true;
  else
    update auth.users
       set email = v_novo,
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           email_change = '', email_change_token_new = '', email_change_token_current = '',
           email_change_confirm_status = 0, updated_at = now()
     where id = m.user_id;
  end if;

  -- identities.email e COLUNA GERADA: nunca se escreve nela. provider_id so
  -- muda se hoje valer o e-mail antigo (contas de signUp gravam o e-mail;
  -- contas administrativas gravam o UUID).
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

  delete from auth.refresh_tokens where user_id = m.user_id::text;
  delete from auth.sessions where user_id = m.user_id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('email_login_alterado', m.aluno_id, m.user_id, v_novo,
          ('e-mail do login alterado de ' || v_antigo || ' para ' || v_novo
           || case when v_senha_definida then ' (com senha nova)' else '' end),
          auth.uid());

  return jsonb_build_object(
    'user_id', m.user_id, 'email_antigo', v_antigo, 'email_novo', v_novo,
    'papel', m.papel, 'aluno_id', m.aluno_id, 'pessoa_aluno_id', m.pessoa_aluno_id,
    'senha_definida', v_senha_definida
  );
end $function$;

-- gps.admin_trocar_titular(uuid,uuid)  md5 10d1393e2f08e4846b5dd40508632af6
CREATE OR REPLACE FUNCTION gps.admin_trocar_titular(p_aluno_id uuid, p_novo_titular_membro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  novo record; velho record;
  v_email_novo text; v_email_velho text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or p_novo_titular_membro_id is null then
    raise exception 'ambiente ou membro nao informado' using errcode = '22023';
  end if;
  select * into novo from gps.membros
   where id = p_novo_titular_membro_id and aluno_id = p_aluno_id;
  if not found then
    raise exception 'Este membro não pertence a este ambiente.' using errcode = 'P0002';
  end if;
  if novo.papel = 'titular' then
    raise exception 'Este membro já é o titular.' using errcode = '22023';
  end if;
  if novo.user_id is null then
    raise exception 'O novo titular precisa ter login. Defina o acesso dele primeiro.'
      using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(novo.user_id) then
    raise exception 'Esta conta é da equipe — não pode ser titular de um ambiente.'
      using errcode = '42501';
  end if;
  select * into velho from gps.membros
   where aluno_id = p_aluno_id and papel = 'titular';
  if not found then
    raise exception 'Este ambiente não tem titular.' using errcode = 'P0002';
  end if;
  update gps.membros set papel = 'socio'   where id = velho.id;
  update gps.membros set papel = 'titular' where id = novo.id;
  select u.email into v_email_novo from auth.users u where u.id = novo.user_id;
  if velho.user_id is not null then
    select u.email into v_email_velho from auth.users u where u.id = velho.user_id;
  end if;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('titular_trocado', p_aluno_id, novo.user_id, v_email_novo,
          format('titular: %s → %s. O novo titular passa a ver o Financeiro do ambiente; o anterior deixa de ver.',
                 coalesce(v_email_velho, '(sem login)'), coalesce(v_email_novo, '?')),
          auth.uid());
  return jsonb_build_object(
    'titular_anterior', velho.id, 'titular_atual', novo.id,
    'email_anterior', v_email_velho, 'email_atual', v_email_novo,
    'financeiro_passa_a_ver', true);
end $function$;

-- gps.admin_tutoriais_resumo()  md5 4cd7c26f9746f45005758e4122913c40
CREATE OR REPLACE FUNCTION gps.admin_tutoriais_resumo()
 RETURNS TABLE(tutorial_id uuid, uteis bigint, nao_uteis bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Ação restrita à equipe.' using errcode = '42501';
  end if;
  return query
    select r.tutorial_id,
           count(*) filter (where r.util)     as uteis,
           count(*) filter (where not r.util) as nao_uteis
      from gps.tutorial_reacoes r
     group by r.tutorial_id;
end;
$function$;

-- gps.admin_vincular_pessoa_membro(uuid,uuid)  md5 bd5620001851949270c117a92ab064cc
CREATE OR REPLACE FUNCTION gps.admin_vincular_pessoa_membro(p_membro_id uuid, p_pessoa_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m record; v_email text; v_antes uuid;
  v_nome text; v_email_cadastro text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_membro_id is null then
    raise exception 'membro nao informado' using errcode = '22023';
  end if;
  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  v_antes := m.pessoa_aluno_id;
  if p_pessoa_aluno_id is null then
    if m.papel = 'titular' then
      raise exception 'O titular não pode ficar sem cadastro — o ambiente é dele.'
        using errcode = '42501';
    end if;
    if v_antes is null then
      raise exception 'Este membro já está sem cadastro vinculado.'
        using errcode = '22023';
    end if;
  else
    select t.nome, t.email into v_nome, v_email_cadastro
      from public.thb_alunos t where t.id = p_pessoa_aluno_id;
    if not found then
      raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
    end if;
    if m.papel = 'titular' and p_pessoa_aluno_id <> m.aluno_id then
      raise exception 'Para o titular, o cadastro é o dono do ambiente. Use "Trocar titular".'
        using errcode = '42501';
    end if;
    if exists (select 1 from gps.membros x
                where x.pessoa_aluno_id = p_pessoa_aluno_id
                  and x.id <> p_membro_id) then
      raise exception 'Este cadastro já está vinculado a outra pessoa do programa.'
        using errcode = '23505';
    end if;
    if v_antes = p_pessoa_aluno_id then
      raise exception 'Este membro já está vinculado a este cadastro.'
        using errcode = '22023';
    end if;
  end if;
  update gps.membros set pessoa_aluno_id = p_pessoa_aluno_id where id = p_membro_id;
  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_pessoa_vinculada', m.aluno_id, m.user_id, v_email,
          case
            when p_pessoa_aluno_id is null then
              format('membro %s DESVINCULADO do cadastro (antes: %s)',
                     coalesce(m.papel, '?'), v_antes::text)
            else
              format('membro %s vinculado ao cadastro %s (%s)%s',
                     coalesce(m.papel, '?'), coalesce(v_nome, 'sem nome'),
                     coalesce(v_email_cadastro, 'sem e-mail'),
                     case when v_antes is null then ''
                          else ' — antes: ' || v_antes::text end)
          end,
          auth.uid());
  return jsonb_build_object('membro_id', m.id, 'papel', m.papel,
                            'pessoa_aluno_id', p_pessoa_aluno_id,
                            'nome', v_nome, 'email', v_email_cadastro,
                            'antes', v_antes);
end $function$;

-- gps.ajuda_registrar_feedback(uuid,boolean,text,text)  md5 a6747dff6dc6ad6278aa94282ff0b31d
CREATE OR REPLACE FUNCTION gps.ajuda_registrar_feedback(p_artigo uuid, p_resolveu boolean, p_origem text, p_termo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid := auth.uid(); v_termo text; v_n integer;
begin
  if v_uid is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if not gps.ajuda_ativo() then return; end if;
  if coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then return; end if;
  if p_origem is null or p_origem not in ('tela', 'busca', 'chamado') then raise exception 'Origem da avaliação inválida.' using errcode = '22023'; end if;
  v_termo := nullif(btrim(regexp_replace(coalesce(p_termo, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), '');
  if v_termo is not null then v_termo := left(v_termo, 120); end if;
  if p_artigo is null then
    if p_origem <> 'busca' or v_termo is null then raise exception 'Artigo não encontrado.' using errcode = 'P0002'; end if;
  elsif not exists (select 1 from gps.ajuda_artigos a where a.id = p_artigo and a.ativo) then
    raise exception 'Artigo não encontrado.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gps.ajuda_feedback:' || v_uid::text, 0));
  select count(*) into v_n from gps.ajuda_feedback f where f.pessoa = v_uid and f.criado_em > now() - interval '1 hour';
  if v_n >= 30 then raise exception 'Muitas avaliações em pouco tempo. Tente de novo mais tarde.' using errcode = 'P0001'; end if;
  insert into gps.ajuda_feedback (artigo_id, pessoa, resolveu, origem, termo)
  values (p_artigo, v_uid, case when p_artigo is null then false else p_resolveu end, p_origem, v_termo);
end; $function$;

-- gps.aluno_eventos_capturar_etapa1_clientes()  md5 f9655f2b6088780fc14aa3658849f58a
CREATE OR REPLACE FUNCTION gps.aluno_eventos_capturar_etapa1_clientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ator text;
  v_aluno_id uuid;
  v_rotulo text;
begin
  begin
    v_ator := case when (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then 'equipe' else 'aluno' end;
    if tg_op = 'DELETE' then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (old.aluno_id, now(), 'cliente_excluido', 'cliente', old.id, 'Cliente removido', v_ator, auth.uid(), 'app');
      return old;
    end if;
    v_aluno_id := new.aluno_id;
    v_rotulo := left(coalesce(nullif(btrim(new.nome), ''), 'Cliente sem nome'), 300);
    if tg_op = 'INSERT' then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_cadastrado', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
      return new;
    end if;
    if new.acompanhado_equipe is distinct from old.acompanhado_equipe then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(),
         case when new.acompanhado_equipe then 'cliente_favoritado' else 'cliente_desfavoritado' end,
         'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;
    if new.fase is distinct from old.fase then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_fase_mudou', 'cliente', new.id, v_rotulo,
         jsonb_build_object('de', old.fase, 'para', new.fase), v_ator, auth.uid(), 'app');
    end if;
    if new.valor_honorarios is distinct from old.valor_honorarios then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_honorarios_definidos', 'cliente', new.id, v_rotulo,
         jsonb_build_object('de', old.valor_honorarios, 'para', new.valor_honorarios),
         v_ator, auth.uid(), 'app');
    end if;
    if new.mensagem_padrao_enviada is distinct from old.mensagem_padrao_enviada
       and new.mensagem_padrao_enviada then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_mensagem_padrao', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;
    if new.estudo_caso_enviado is distinct from old.estudo_caso_enviado
       and new.estudo_caso_enviado then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_estudo_caso', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;
    if new.ligacao_realizada is distinct from old.ligacao_realizada
       and new.ligacao_realizada then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_ligacao', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;
    if new.aderiu_reuniao is distinct from old.aderiu_reuniao
       and new.aderiu_reuniao then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_aderiu_reuniao', 'cliente', new.id, v_rotulo, v_ator, auth.uid(), 'app');
    end if;
    if new.data_reuniao_preliminar is distinct from old.data_reuniao_preliminar
       and new.data_reuniao_preliminar is not null then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_reuniao_agendada', 'cliente', new.id, v_rotulo,
         jsonb_build_object('data_reuniao_preliminar', new.data_reuniao_preliminar), v_ator, auth.uid(), 'app');
    end if;
    return new;
  exception when others then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end;
end;
$function$;

-- gps.aluno_eventos_capturar_funil_origem()  md5 25546cecf59e39f7ab912225a4a991b1
CREATE OR REPLACE FUNCTION gps.aluno_eventos_capturar_funil_origem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  begin
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (new.aluno_id, now(), 'cliente_funil_origem_definido', 'cliente', new.id,
       left(coalesce(nullif(btrim(new.nome), ''), 'Cliente sem nome'), 300),
       jsonb_build_object('de', old.funil_origem, 'para', new.funil_origem),
       case when coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then 'equipe' else 'aluno' end,
       auth.uid(), 'app');
  exception when others then
    null;
  end;
  return new;
end;
$function$;

-- gps.aluno_eventos_capturar_progresso()  md5 8e210f029a7630b3cd6bf6d0bfb331d3
CREATE OR REPLACE FUNCTION gps.aluno_eventos_capturar_progresso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ator text;
begin
  begin
    v_ator := case when (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then 'equipe' else 'aluno' end;

    if tg_op = 'DELETE' then
      return old;
    end if;

    if tg_op = 'UPDATE' and new.concluida is distinct from old.concluida then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (new.aluno_id, now(),
         case when new.concluida then 'tarefa_concluida' else 'tarefa_reaberta' end,
         'tarefa', new.id,
         format('Etapa %s, tarefa %s', new.etapa, new.tarefa),
         jsonb_build_object('etapa', new.etapa, 'tarefa', new.tarefa),
         v_ator, auth.uid(), 'app');
    elsif tg_op = 'INSERT' and new.concluida then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (new.aluno_id, now(), 'tarefa_concluida', 'tarefa', new.id,
         format('Etapa %s, tarefa %s', new.etapa, new.tarefa),
         jsonb_build_object('etapa', new.etapa, 'tarefa', new.tarefa),
         v_ator, auth.uid(), 'app');
    end if;

    return new;
  exception when others then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end;
end;
$function$;

-- gps.aluno_eventos_job_primeiro_acesso()  md5 8591e358ccb17a125e9bc3f5f2e3a24f
CREATE OR REPLACE FUNCTION gps.aluno_eventos_job_primeiro_acesso()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_inseridos integer;
begin
  if auth.uid() is not null and not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissao.' using errcode = '42501';
  end if;

  with primeiro_login as (
    select user_id, min(last_sign_in_at) as ocorrido_em
    from auth.identities where last_sign_in_at is not null group by user_id
  ),
  novos as (
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
    select m.aluno_id, pl.ocorrido_em, 'primeiro_acesso', 'conta', null,
           'Primeiro acesso', 'aluno', m.user_id, 'backfill'
    from gps.membros m
    join primeiro_login pl on pl.user_id = m.user_id
    where not exists (
      select 1 from gps.aluno_eventos e
      where e.tipo = 'primeiro_acesso' and e.aluno_id = m.aluno_id
        and (e.ator_user_id is not distinct from m.user_id))
    returning 1
  )
  select count(*) into v_inseridos from novos;
  return v_inseridos;
end; $function$;

-- gps.chamado_anexo_marcar_expurgado(uuid)  md5 4bee2da9f60417a7c18482cdfa9b52f2
CREATE OR REPLACE FUNCTION gps.chamado_anexo_marcar_expurgado(p_mensagem_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  update gps.chamado_mensagens
     set anexo_expurgado_em = now()
   where id = p_mensagem_id
     and anexo_path is not null
     and anexo_expurgado_em is null;
end;
$function$;

-- gps.chamado_aprovar_solicitacao(uuid,text)  md5 0beae6ec09929bb590336c66ea3607c5
CREATE OR REPLACE FUNCTION gps.chamado_aprovar_solicitacao(p_chamado_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sol         gps.chamado_solicitacoes%rowtype;
  v_chamado     gps.chamados%rowtype;
  v_motivo      text;
  v_atual       record;
  v_confirmado  boolean;
  v_email_aluno text;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.' using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  select * into v_sol
    from gps.chamado_solicitacoes s
   where s.chamado_id = p_chamado_id
     for update;
  if not found then
    raise exception 'Este chamado não tem uma solicitação estruturada.' using errcode = 'P0002';
  end if;
  if v_sol.estado <> 'pendente' then
    raise exception 'Esta solicitação já foi decidida.' using errcode = '22023';
  end if;

  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'Chamado não encontrado.' using errcode = 'P0002';
  end if;

  if v_sol.tipo = 'troca_cliente' then
    if v_sol.alvo_novo_id is null or not exists (
      select 1 from gps.etapa1_clientes c
       where c.id = v_sol.alvo_novo_id and c.aluno_id = v_chamado.aluno_id
    ) then
      raise exception 'O cliente escolhido não existe mais neste ambiente.' using errcode = '22023';
    end if;

    select c.id, c.acompanhamento_confirmado_em
      into v_atual
      from gps.etapa1_clientes c
     where c.aluno_id = v_chamado.aluno_id and c.acompanhado_equipe;

    if v_atual.id is null then
      raise exception 'Este ambiente não tem mais cliente acompanhado — não há o que trocar.' using errcode = '22023';
    end if;
    if v_atual.id = v_sol.alvo_novo_id then
      raise exception 'O cliente escolhido já é o cliente acompanhado.' using errcode = '22023';
    end if;

    v_confirmado := v_atual.acompanhamento_confirmado_em is not null;

    if v_confirmado then
      perform gps.admin_liberar_acompanhamento(v_atual.id, 'Troca de cliente aprovada via chamado ' || p_chamado_id::text);
    end if;

    update gps.etapa1_clientes set acompanhado_equipe = false where id = v_atual.id;
    update gps.etapa1_clientes set acompanhado_equipe = true  where id = v_sol.alvo_novo_id;

    if v_confirmado then
      perform gps.admin_confirmar_acompanhamento(v_sol.alvo_novo_id, 'Troca de cliente aprovada via chamado ' || p_chamado_id::text);
    end if;

  elsif v_sol.tipo = 'troca_socio' then
    if v_sol.alvo_atual_id is null or not exists (
      select 1 from gps.membros m
       where m.id = v_sol.alvo_atual_id and m.aluno_id = v_chamado.aluno_id and m.papel = 'socio'
    ) then
      raise exception 'O sócio indicado já não está mais neste ambiente.' using errcode = '22023';
    end if;

    perform gps.admin_excluir_membro(v_sol.alvo_atual_id);
  end if;

  update gps.chamado_solicitacoes
     set estado         = 'aprovada',
         decidida_em    = now(),
         decidido_por   = auth.uid(),
         motivo_decisao = v_motivo
   where chamado_id = p_chamado_id;

  perform gps.chamado_gravar_mensagem(
    p_chamado_id, 'equipe',
    case when v_sol.tipo = 'troca_cliente'
           then 'Solicitação de troca de cliente aprovada. ' || v_motivo
         else 'Solicitação de troca de sócio aprovada — o acesso do sócio foi encerrado. ' || v_motivo
    end);

  perform gps.chamado_fechar(p_chamado_id);

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, detalhe, feito_por)
  values ('chamado_solicitacao_aprovada', v_chamado.aluno_id, null,
          format('chamado %s, tipo %s. Motivo: %s', p_chamado_id, v_sol.tipo, v_motivo),
          auth.uid());

  v_email_aluno := coalesce(
    (select u.email from auth.users u where u.id = v_chamado.aberto_por),
    (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));

  return jsonb_build_object(
    'chamado_id', p_chamado_id,
    'tipo', v_sol.tipo,
    'avisar_email', v_email_aluno
  );
end;
$function$;

-- gps.chamado_declinar_solicitacao(uuid,text)  md5 2b8e25151593f82839031eda4d9b770c
CREATE OR REPLACE FUNCTION gps.chamado_declinar_solicitacao(p_chamado_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sol     gps.chamado_solicitacoes%rowtype;
  v_chamado gps.chamados%rowtype;
  v_motivo  text;
  v_email_aluno text;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — o aluno vai ver esta frase.' using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  select * into v_sol
    from gps.chamado_solicitacoes s
   where s.chamado_id = p_chamado_id
     for update;
  if not found then
    raise exception 'Este chamado não tem uma solicitação estruturada.' using errcode = 'P0002';
  end if;
  if v_sol.estado <> 'pendente' then
    raise exception 'Esta solicitação já foi decidida.' using errcode = '22023';
  end if;

  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'Chamado não encontrado.' using errcode = 'P0002';
  end if;

  update gps.chamado_solicitacoes
     set estado         = 'declinada',
         decidida_em    = now(),
         decidido_por   = auth.uid(),
         motivo_decisao = v_motivo
   where chamado_id = p_chamado_id;

  perform gps.chamado_gravar_mensagem(
    p_chamado_id, 'equipe', 'Solicitação recusada. ' || v_motivo);

  perform gps.chamado_fechar(p_chamado_id);

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, detalhe, feito_por)
  values ('chamado_solicitacao_declinada', v_chamado.aluno_id, null,
          format('chamado %s, tipo %s. Motivo: %s', p_chamado_id, v_sol.tipo, v_motivo),
          auth.uid());

  v_email_aluno := coalesce(
    (select u.email from auth.users u where u.id = v_chamado.aberto_por),
    (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));

  return jsonb_build_object(
    'chamado_id', p_chamado_id,
    'tipo', v_sol.tipo,
    'avisar_email', v_email_aluno
  );
end;
$function$;

-- gps.chamado_definir_cliente(uuid,uuid)  md5 ca3b222edcf0758dbe02822929f44188
CREATE OR REPLACE FUNCTION gps.chamado_definir_cliente(p_chamado_id uuid, p_cliente_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_chamado gps.chamados%rowtype;
begin
  if p_chamado_id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  -- Inexistente e alheio respondem IGUAL: sem oráculo de existência.
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  -- 🔴 coalesce nas DUAS pernas: sem JWT, aluno_atual() é null e
  -- `null = uuid` é null; `not (null or null)` é null e o IF não dispara —
  -- a guarda falharia ABERTA (lição de 22/09, sessao_pode_agendar).
  if not (coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false)
          or coalesce(gps.aluno_atual() = v_chamado.aluno_id, false)) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if v_chamado.status = 'fechado' then
    raise exception 'Este chamado está fechado: o cliente de referência não pode mais ser alterado.'
      using errcode = '42501';
  end if;

  -- Troca de cliente/sócio já carrega o alvo em gps.chamado_solicitacoes;
  -- um segundo "cliente" no mesmo chamado seria ambíguo para a equipe.
  if v_chamado.categoria in ('troca_cliente', 'troca_socio') then
    raise exception 'Chamado de troca de cliente ou de sócio não leva cliente de referência.'
      using errcode = '22023';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from gps.etapa1_clientes e
     where e.id = p_cliente_id and e.aluno_id = v_chamado.aluno_id
  ) then
    raise exception 'O cliente escolhido não pertence a este ambiente.'
      using errcode = '22023';
  end if;

  -- Mesmo valor (inclusive null → null): nada muda, nem o carimbo.
  if v_chamado.cliente_id is not distinct from p_cliente_id then
    return;
  end if;

  -- null LIMPA o vínculo; em/por registram quem mexeu por último.
  -- ultima_mensagem_em fica INTACTO: definir cliente não é mensagem e não
  -- pode reordenar a fila nem simular "o parceiro respondeu".
  update gps.chamados c
     set cliente_id           = p_cliente_id,
         cliente_definido_em  = now(),
         cliente_definido_por = auth.uid()
   where c.id = p_chamado_id;
end;
$function$;

-- gps.chamado_fechar(uuid)  md5 8f0b48cee43a18a5fd797cde6192daf3
CREATE OR REPLACE FUNCTION gps.chamado_fechar(p_chamado_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_chamado gps.chamados%rowtype;
begin
  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if not ((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) or gps.aluno_atual() = v_chamado.aluno_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_chamado.status = 'fechado' then
    return;
  end if;
  update gps.chamados c
     set status      = 'fechado',
         fechado_em  = now(),
         fechado_por = auth.uid()
   where c.id = p_chamado_id;
end;
$function$;

-- gps.chamado_responder(uuid,text,text,text,text,integer)  md5 621530338471cd9ce0b6a999c5888897
CREATE OR REPLACE FUNCTION gps.chamado_responder(p_chamado_id uuid, p_texto text, p_anexo_path text DEFAULT NULL::text, p_anexo_nome text DEFAULT NULL::text, p_anexo_mime text DEFAULT NULL::text, p_anexo_tamanho integer DEFAULT NULL::integer)
 RETURNS TABLE(status_novo text, avisar text, avisar_equipe boolean, mensagens_novas integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_chamado       gps.chamados%rowtype;
  v_papel         text;
  v_status_ant    text;
  v_novo          text;
  v_avisar        text;
  v_avisar_equipe boolean := false;
  v_novas         integer := 0;
  v_desde         timestamptz;
  v_ultimo_aviso  timestamptz;
begin
  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    v_papel := 'equipe';
  elsif gps.aluno_atual() = v_chamado.aluno_id then
    v_papel := 'aluno';
  else
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_papel = 'aluno' then
    if not gps.chamados_abertos() then
      raise exception 'o suporte por chamado esta temporariamente fechado' using errcode = '42501';
    end if;
    if v_chamado.status = 'fechado' then
      if v_chamado.fechado_em is null or v_chamado.fechado_em <= now() - interval '7 days' then
        raise exception 'este chamado foi fechado ha mais de 7 dias; abra um novo chamado'
          using errcode = '42501';
      end if;
    end if;
  end if;
  v_status_ant := v_chamado.status;
  perform gps.chamado_gravar_mensagem(
    p_chamado_id, v_papel, p_texto,
    p_anexo_path, p_anexo_nome, p_anexo_mime, p_anexo_tamanho);
  v_novo := case when v_papel = 'aluno' then 'aberto' else 'respondido' end;

  if v_papel = 'aluno' then
    -- Último aviso à equipe (nulo = a abertura, que já avisou via chamado_abrir).
    v_ultimo_aviso := coalesce(v_chamado.ultimo_aviso_equipe_em, v_chamado.criado_em);

    if v_status_ant <> 'aberto' then
      -- (…337) Transição (reabertura): respeita a MESMA janela de 30 min do
      -- chamado aberto, para fechar+reabrir em loop não virar 1 e-mail por
      -- volta. Exceção: se a equipe respondeu DEPOIS do último aviso, o parceiro
      -- está respondendo à equipe — avisa sempre. A mensagem que acabou de ser
      -- gravada é do aluno, então não entra neste `exists`.
      v_avisar_equipe :=
        v_ultimo_aviso <= now() - interval '30 minutes'
        or exists (
          select 1
            from gps.chamado_mensagens m
           where m.chamado_id = p_chamado_id
             and m.autor_papel = 'equipe'
             and m.criado_em > v_ultimo_aviso);
    elsif coalesce(
            (select c.valor from gps.config c where c.chave = 'chamados_aviso_por_mensagem'),
            'true') <> 'false' then
      -- (…335) Chamado já aberto: aviso agrupado, 1 por chamado a cada 30 min.
      v_avisar_equipe :=
        v_ultimo_aviso <= now() - interval '30 minutes';
    end if;

    if v_avisar_equipe then
      -- Quantas mensagens do parceiro a equipe ainda não "viu": desde o último
      -- aviso OU a última resposta da equipe, o que for mais recente. Inclui a
      -- desta chamada. Lê só a thread (≤ 20 linhas, idx_chamado_mensagens_thread).
      v_desde := greatest(
        v_ultimo_aviso,
        (select max(m.criado_em) from gps.chamado_mensagens m
          where m.chamado_id = p_chamado_id and m.autor_papel = 'equipe'));
      select count(*)::int into v_novas
        from gps.chamado_mensagens m
       where m.chamado_id = p_chamado_id
         and m.autor_papel = 'aluno'
         and m.criado_em > v_desde;
      v_novas := greatest(v_novas, 1);

      update gps.chamados c
         set ultimo_aviso_equipe_em = now()
       where c.id = p_chamado_id;

      v_avisar := nullif(btrim(coalesce(
        (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'), '')), '');
    end if;
  -- (…319, 28/09) Equipe: avisa SEMPRE o parceiro, não só na transição.
  elsif v_papel = 'equipe' then
    v_avisar := coalesce(
      (select u.email from auth.users u where u.id = v_chamado.aberto_por),
      (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));
  end if;

  return query select v_novo, v_avisar, v_avisar_equipe, v_novas;
end;
$function$;

-- gps.chamados_anexos_para_expurgo()  md5 8bf091a965f531813fc847a085c4604d
CREATE OR REPLACE FUNCTION gps.chamados_anexos_para_expurgo()
 RETURNS TABLE(mensagem_id uuid, chamado_id uuid, aluno_id uuid, path text, motivo text, referencia timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query
    select m.id, c.id, c.aluno_id, m.anexo_path, 'retencao'::text, c.fechado_em
      from gps.chamado_mensagens m
      join gps.chamados c on c.id = m.chamado_id
     where m.anexo_path is not null
       and m.anexo_expurgado_em is null
       and c.status = 'fechado'
       and c.fechado_em < now() - interval '180 days'
    union all
    select null::uuid, null::uuid, null::uuid, o.name, 'orfao'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'gps-chamados'
       and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from gps.chamado_mensagens m2
                        where m2.anexo_path = o.name)
     order by 6;
end;
$function$;

-- gps.cliente_croqui_anexar(uuid,text,text,integer,date,text)  md5 6fe726f8c9b0b9e74664ecd8cae01e58
CREATE OR REPLACE FUNCTION gps.cliente_croqui_anexar(p_cliente_id uuid, p_path text, p_nome text, p_tamanho integer, p_apresentado_em date DEFAULT NULL::date, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c           record;
  v_admin       boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente    uuid    := gps.aluno_atual();
  v_existe      boolean;
  v_meta_size   bigint;
  v_meta_mime   text;
  v_tamanho     integer;
  v_nome        text;
  v_observacoes text;
  v_id          uuid;
begin
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;
  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then
    raise exception 'Nome de arquivo inválido.' using errcode = '22023';
  end if;
  v_observacoes := nullif(btrim(coalesce(p_observacoes, '')), '');
  if v_observacoes is not null and char_length(v_observacoes) > 2000 then
    raise exception 'As observações do croqui estão muito longas.' using errcode = '22023';
  end if;
  if coalesce(p_path,'') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then
    raise exception 'anexo em caminho invalido' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> v_c.aluno_id::text then
    raise exception 'anexo nao pertence a este ambiente' using errcode = '42501';
  end if;
  begin
    select true,
           nullif(o.metadata->>'size','')::bigint,
           nullif(o.metadata->>'mimetype','')
      into v_existe, v_meta_size, v_meta_mime
      from storage.objects o
     where o.bucket_id = 'gps-croquis'
       and o.name = p_path;
  exception when insufficient_privilege then
    raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
  end;
  if not coalesce(v_existe, false) then
    raise exception 'anexo nao encontrado' using errcode = '42501';
  end if;
  if coalesce(v_meta_mime, 'application/pdf') <> 'application/pdf' then
    raise exception 'formato de anexo nao aceito' using errcode = '22023';
  end if;
  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
    raise exception 'anexo maior que 5 MB' using errcode = '22023';
  end if;
  perform 1 from gps.etapa1_clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  insert into gps.cliente_croquis
    (cliente_id, path, nome, tamanho, apresentado_em, observacoes,
     enviado_por, enviado_pela_equipe)
  values
    (p_cliente_id, p_path, v_nome, v_tamanho, p_apresentado_em, v_observacoes,
     auth.uid(), v_admin)
  returning id into v_id;
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_croqui_anexado', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('croqui_id', v_id, 'tamanho', v_tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('id', v_id, 'cliente_id', p_cliente_id, 'path', p_path,
                            'nome', v_nome, 'tamanho', v_tamanho);
end $function$;

-- gps.cliente_croqui_remover(uuid)  md5 400ecc708edd16bd9eb2d746b4f3eba8
CREATE OR REPLACE FUNCTION gps.cliente_croqui_remover(p_croqui_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k        record;
  v_admin    boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid    := gps.aluno_atual();
begin
  if p_croqui_id is null then
    raise exception 'croqui nao informado' using errcode = '22023';
  end if;
  select k.id, k.cliente_id, k.tamanho, c.aluno_id, c.nome as cliente_nome
    into v_k
    from gps.cliente_croquis k
    join gps.etapa1_clientes c on c.id = k.cliente_id
   where k.id = p_croqui_id;
  if not found then
    raise exception 'Croqui não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_k.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  delete from gps.cliente_croquis where id = p_croqui_id;
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_k.aluno_id, now(), 'cliente_croqui_removido', 'cliente', v_k.cliente_id,
     left(coalesce(nullif(btrim(v_k.cliente_nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('croqui_id', p_croqui_id, 'tamanho', v_k.tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('cliente_id', v_k.cliente_id, 'removido', true);
end $function$;

-- gps.cliente_definir_contrato(uuid,text,text,text,integer)  md5 a65d226f6144dd0fff2c2f8e7839309d
CREATE OR REPLACE FUNCTION gps.cliente_definir_contrato(p_cliente_id uuid, p_path text, p_nome text, p_mime text, p_tamanho integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false); v_ambiente uuid := gps.aluno_atual();
        v_existe boolean; v_meta_size bigint; v_meta_mime text; v_mime text; v_tamanho integer; v_ext text; v_nome text; v_tinha boolean;
begin
  if p_cliente_id is null then raise exception 'cliente nao informado' using errcode = '22023'; end if;
  select c.id, c.aluno_id, c.nome, c.contrato_path into v_c from gps.etapa1_clientes c where c.id = p_cliente_id;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then raise exception 'Nome de arquivo inválido.' using errcode = '22023'; end if;
  if coalesce(p_path,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$' then
    raise exception 'anexo em caminho invalido' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> v_c.aluno_id::text then raise exception 'anexo nao pertence a este ambiente' using errcode = '42501'; end if;
  begin
    select true, nullif(o.metadata->>'size','')::bigint, nullif(o.metadata->>'mimetype','') into v_existe, v_meta_size, v_meta_mime
      from storage.objects o where o.bucket_id = 'gps-onboarding' and o.name = p_path;
  exception when insufficient_privilege then raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
  end;
  if not coalesce(v_existe, false) then raise exception 'anexo nao encontrado' using errcode = '42501'; end if;
  v_mime := coalesce(v_meta_mime, p_mime);
  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;
  if v_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then raise exception 'formato de anexo nao aceito' using errcode = '22023'; end if;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then raise exception 'anexo maior que 5 MB' using errcode = '22023'; end if;
  v_ext := lower(regexp_replace(p_path, '^.*\.', ''));
  if not ((v_mime = 'image/png' and v_ext = 'png') or (v_mime = 'image/jpeg' and v_ext in ('jpg','jpeg')) or (v_mime = 'image/webp' and v_ext = 'webp') or (v_mime = 'application/pdf' and v_ext = 'pdf')) then
    raise exception 'extensao do anexo nao confere com o tipo do arquivo' using errcode = '22023';
  end if;
  v_tinha := v_c.contrato_path is not null;
  update gps.etapa1_clientes set contrato_path = p_path, contrato_nome = v_nome, contrato_mime = v_mime, contrato_tamanho = v_tamanho, contrato_anexado_em = now() where id = p_cliente_id;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'cliente_contrato_anexado', 'cliente', p_cliente_id, left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
          jsonb_build_object('mime', v_mime, 'tamanho', v_tamanho, 'substituiu', v_tinha), case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('cliente_id', p_cliente_id, 'path', p_path, 'nome', v_nome, 'mime', v_mime, 'tamanho', v_tamanho, 'substituiu', v_tinha);
end $function$;

-- gps.cliente_documento_registrar_leitura(uuid,text,uuid)  md5 6bd39287263bfe768de4e6efe742002a
CREATE OR REPLACE FUNCTION gps.cliente_documento_registrar_leitura(p_cliente_id uuid, p_tipo text, p_documento_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c record;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    return;
  end if;
  if p_tipo is null or p_tipo not in ('contrato', 'minuta', 'croqui') then
    raise exception 'Tipo de documento desconhecido.' using errcode = '22023';
  end if;
  select c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_documento_lido', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('tipo', p_tipo, 'documento_id', p_documento_id),
     'equipe', auth.uid(), 'app');
end $function$;

-- gps.cliente_link_drive_adicionar(uuid,text,text)  md5 ef01e60b27b52e0623f6e18d0d06a410
CREATE OR REPLACE FUNCTION gps.cliente_link_drive_adicionar(p_cliente_id uuid, p_nome text, p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual();
  v_c record; v_atual record; v_nome text; v_url text; v_por_nome text; v_origem text; v_id uuid; v_em timestamptz;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501'; end if;
  if p_cliente_id is null then raise exception 'cliente nao informado' using errcode = '22023'; end if;
  select c.id, c.aluno_id, c.nome into v_c from gps.etapa1_clientes c where c.id = p_cliente_id for no key update;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_nome := btrim(coalesce(p_nome, ''), E' \t\r\n');
  if v_nome = '' then raise exception 'Dê um nome ao link.' using errcode = '22023'; end if;
  if char_length(v_nome) > 120 then raise exception 'O nome do link tem no máximo 120 caracteres.' using errcode = '22023'; end if;
  if v_nome ~ '[[:cntrl:]]' then raise exception 'O nome do link tem caractere inválido.' using errcode = '22023'; end if;
  v_url := gps.drive_url_normalizar(p_url);
  if v_url is null then
    raise exception 'Cole o link do Drive (Compartilhar > Copiar link). Ele começa com drive.google.com/ ou docs.google.com/.' using errcode = '22023';
  end if;
  select l.id, l.url, l.origem into v_atual
    from gps.cliente_links_drive l
   where l.cliente_id = p_cliente_id and l.removido_em is null
   for update;
  if found then
    if v_atual.url = v_url then
      raise exception 'Este link já está na ficha.' using errcode = '23505';
    end if;
    if not v_admin and v_atual.origem is distinct from 'parceiro' then
      raise exception 'Este link foi colocado pela equipe; peça a ela para trocar.' using errcode = '42501';
    end if;
    update gps.cliente_links_drive set removido_em = now(), removido_por = v_uid where id = v_atual.id;
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (v_c.aluno_id, now(), 'cliente_link_drive_removido', 'cliente', p_cliente_id,
            left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
            jsonb_build_object('link_id', v_atual.id, 'cliente_id', p_cliente_id),
            case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');
  end if;
  if v_admin then
    v_por_nome := 'Equipe'; v_origem := 'equipe';
  else
    v_origem := 'parceiro';
    select nullif(btrim(t.nome), '') into v_por_nome
      from gps.membros m
      left join public.thb_alunos t on t.id = coalesce(m.pessoa_aluno_id, case when m.papel = 'titular' then m.aluno_id end)
     where m.user_id = v_uid and m.aluno_id = v_c.aluno_id limit 1;
    v_por_nome := coalesce(v_por_nome, 'Parceiro');
  end if;
  begin
    insert into gps.cliente_links_drive (cliente_id, aluno_id, nome, url, origem, criado_por, criado_por_nome)
    values (p_cliente_id, v_c.aluno_id, v_nome, v_url, v_origem, v_uid, v_por_nome)
    returning id, criado_em into v_id, v_em;
  exception when unique_violation then
    raise exception 'O link mudou enquanto você editava; recarregue.' using errcode = '40001';
  end;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'cliente_link_drive_adicionado', 'cliente', p_cliente_id,
          left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
          jsonb_build_object('link_id', v_id, 'cliente_id', p_cliente_id),
          case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');
  return jsonb_build_object('id', v_id, 'nome', v_nome, 'url', v_url, 'criado_em', v_em, 'criado_por_nome', v_por_nome, 'origem', v_origem);
end;
$function$;

-- gps.cliente_link_drive_remover(uuid)  md5 923a12bfc05371a91c31622b92b2ea54
CREATE OR REPLACE FUNCTION gps.cliente_link_drive_remover(p_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual();
  v_l record;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501'; end if;
  if p_link_id is null then raise exception 'Link não encontrado.' using errcode = 'P0002'; end if;
  select l.id, l.cliente_id, l.origem, l.removido_em, c.aluno_id, c.nome as cliente_nome into v_l
    from gps.cliente_links_drive l join gps.etapa1_clientes c on c.id = l.cliente_id
   where l.id = p_link_id for update of l;
  if not found or v_l.removido_em is not null then raise exception 'Link não encontrado.' using errcode = 'P0002'; end if;
  if not v_admin then
    if v_ambiente is null or v_ambiente <> v_l.aluno_id then raise exception 'Sem permissão.' using errcode = '42501'; end if;
    if v_l.origem is distinct from 'parceiro' then
      raise exception 'Este link foi colocado pela equipe; peça a ela para remover.' using errcode = '42501';
    end if;
  end if;
  update gps.cliente_links_drive set removido_em = now(), removido_por = v_uid where id = p_link_id and removido_em is null;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_l.aluno_id, now(), 'cliente_link_drive_removido', 'cliente', v_l.cliente_id,
          left(coalesce(nullif(btrim(v_l.cliente_nome), ''), 'Cliente sem nome'), 300),
          jsonb_build_object('link_id', p_link_id, 'cliente_id', v_l.cliente_id),
          case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');
end;
$function$;

-- gps.cliente_minuta_anexar(uuid,text,text,integer,text,text,text,text,text)  md5 c5d00db9ed428e8d5e9f1fbdba91a0df
CREATE OR REPLACE FUNCTION gps.cliente_minuta_anexar(p_cliente_id uuid, p_path text, p_nome text, p_tamanho integer, p_notas text DEFAULT NULL::text, p_caso text DEFAULT NULL::text, p_o_que_foi_feito text DEFAULT NULL::text, p_ponto_de_ajuda text DEFAULT NULL::text, p_o_que_mudou text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c record; v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual(); v_existe boolean;
  v_meta_size bigint; v_meta_mime text; v_tamanho integer;
  v_nome text; v_notas text; v_id uuid; v_caso text; v_o_que_foi_feito text; v_ponto_de_ajuda text; v_o_que_mudou text; v_obrigatorio boolean; v_primeira boolean; v_qtd integer;
begin
  if p_cliente_id is null then raise exception 'cliente nao informado' using errcode='22023'; end if;
  select c.id, c.aluno_id, c.nome into v_c from gps.etapa1_clientes c where c.id = p_cliente_id;
  if not found then raise exception 'Cliente não encontrado.' using errcode='P0002'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode='42501';
  end if;
  v_nome := btrim(coalesce(p_nome,''));
  if v_nome='' or char_length(v_nome)>120 or v_nome ~ '[/\\]' then
    raise exception 'Nome de arquivo inválido.' using errcode='22023'; end if;
  v_notas := nullif(btrim(coalesce(p_notas,'')),'');
  if v_notas is not null and char_length(v_notas)>2000 then
    raise exception 'Notas da minuta muito longas.' using errcode='22023'; end if;
  if coalesce(p_path,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then raise exception 'anexo em caminho invalido' using errcode='22023'; end if;
  if split_part(p_path,'/',1) <> v_c.aluno_id::text then
    raise exception 'anexo nao pertence a este ambiente' using errcode='42501'; end if;
  begin
    select true, nullif(o.metadata->>'size','')::bigint, nullif(o.metadata->>'mimetype','')
      into v_existe, v_meta_size, v_meta_mime
      from storage.objects o where o.bucket_id='gps-minutas' and o.name = p_path;
  exception when insufficient_privilege then
    raise exception 'nao foi possivel validar o anexo' using errcode='42501';
  end;
  if not coalesce(v_existe,false) then raise exception 'anexo nao encontrado' using errcode='42501'; end if;
  if coalesce(v_meta_mime,'application/pdf') <> 'application/pdf' then
    raise exception 'formato de anexo nao aceito' using errcode='22023'; end if;
  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
    raise exception 'anexo maior que 5 MB' using errcode='22023'; end if;
  v_caso            := nullif(btrim(coalesce(p_caso, '')), '');
  v_o_que_foi_feito := nullif(btrim(coalesce(p_o_que_foi_feito, '')), '');
  v_ponto_de_ajuda  := nullif(btrim(coalesce(p_ponto_de_ajuda, '')), '');
  v_o_que_mudou     := nullif(btrim(coalesce(p_o_que_mudou, '')), '');

  if v_caso is not null and char_length(v_caso) > 2000 then
    raise exception 'A descrição do caso passa de 2000 caracteres.' using errcode='22023'; end if;
  if v_o_que_foi_feito is not null and char_length(v_o_que_foi_feito) > 2000 then
    raise exception 'O texto de o que foi feito passa de 2000 caracteres.' using errcode='22023'; end if;
  if v_ponto_de_ajuda is not null and char_length(v_ponto_de_ajuda) > 2000 then
    raise exception 'O texto do ponto de ajuda passa de 2000 caracteres.' using errcode='22023'; end if;
  if v_o_que_mudou is not null and char_length(v_o_que_mudou) > 2000 then
    raise exception 'O texto do que foi alterado passa de 2000 caracteres.' using errcode='22023'; end if;

  -- `for update` serializa por cliente ANTES do count: envio em sequencia e
  -- caso de uso normal, e dois simultaneos poderiam ambos se achar "a 1a".
  perform 1 from gps.etapa1_clientes where id = p_cliente_id for update;
  if not found then
    -- O cliente foi excluido entre o SELECT inicial e este lock. Sem isto, o
    -- INSERT adiante falharia por violacao de FK com erro CRU (achado do
    -- pentester, 17/09/2026) -- `perform` nao levanta erro em zero linhas.
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  v_obrigatorio := coalesce((select valor from gps.config where chave='minuta_contexto_obrigatorio'),'true') <> 'false';
  select count(*) into v_qtd from gps.cliente_minutas where cliente_id = p_cliente_id;
  v_primeira := v_qtd = 0;

  if v_obrigatorio then
    if v_primeira then
      if v_caso is null then
        raise exception 'Descreva o caso para enviar a primeira minuta.' using errcode='22023'; end if;
      if v_o_que_foi_feito is null then
        raise exception 'Informe o que já foi feito no caso.' using errcode='22023'; end if;
      if v_ponto_de_ajuda is null then
        raise exception 'Informe o primeiro ponto em que você precisa de ajuda.' using errcode='22023'; end if;
      v_o_que_mudou := null;
    else
      if v_o_que_mudou is null then
        raise exception 'Informe o que foi alterado em relação à minuta anterior.' using errcode='22023'; end if;
      v_caso := null; v_o_que_foi_feito := null; v_ponto_de_ajuda := null;
    end if;
  else
    v_caso := null; v_o_que_foi_feito := null; v_ponto_de_ajuda := null; v_o_que_mudou := null;
  end if;

  insert into gps.cliente_minutas (cliente_id, path, nome, tamanho, notas, caso, o_que_foi_feito, ponto_de_ajuda, o_que_mudou, enviado_por, enviado_pela_equipe)
  values (p_cliente_id, p_path, v_nome, v_tamanho, v_notas, v_caso, v_o_que_foi_feito, v_ponto_de_ajuda, v_o_que_mudou, auth.uid(), v_admin) returning id into v_id;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'cliente_minuta_anexada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome),''),'Cliente sem nome'),300),
     jsonb_build_object('minuta_id', v_id, 'tamanho', v_tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('id',v_id,'cliente_id',p_cliente_id,'path',p_path,'nome',v_nome,'tamanho',v_tamanho);
end $function$;

-- gps.cliente_minuta_remover(uuid)  md5 09654b9ccfbfe255e1cb26fa08ba5ce6
CREATE OR REPLACE FUNCTION gps.cliente_minuta_remover(p_minuta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m record; v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual();
begin
  if p_minuta_id is null then raise exception 'minuta nao informada' using errcode='22023'; end if;
  select mi.id, mi.cliente_id, mi.tamanho, c.aluno_id, c.nome as cliente_nome
    into v_m from gps.cliente_minutas mi
    join gps.etapa1_clientes c on c.id = mi.cliente_id where mi.id = p_minuta_id;
  if not found then raise exception 'Minuta não encontrada.' using errcode='P0002'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_m.aluno_id) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  delete from gps.cliente_minutas where id = p_minuta_id;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_m.aluno_id, now(), 'cliente_minuta_removida', 'cliente', v_m.cliente_id,
     left(coalesce(nullif(btrim(v_m.cliente_nome),''),'Cliente sem nome'),300),
     jsonb_build_object('minuta_id', p_minuta_id, 'tamanho', v_m.tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('cliente_id', v_m.cliente_id, 'removido', true);
end $function$;

-- gps.cliente_remover_contrato(uuid)  md5 040103a5d835261ee66a26ad3e97a393
CREATE OR REPLACE FUNCTION gps.cliente_remover_contrato(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false); v_ambiente uuid := gps.aluno_atual();
begin
  if p_cliente_id is null then raise exception 'cliente nao informado' using errcode = '22023'; end if;
  select c.id, c.aluno_id, c.nome, c.contrato_path, c.contrato_mime, c.contrato_tamanho into v_c from gps.etapa1_clientes c where c.id = p_cliente_id;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if v_c.contrato_path is null then raise exception 'Este cliente não tem contrato anexado.' using errcode = '22023'; end if;
  update gps.etapa1_clientes set contrato_path = null, contrato_nome = null, contrato_mime = null, contrato_tamanho = null, contrato_anexado_em = null where id = p_cliente_id;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'cliente_contrato_removido', 'cliente', p_cliente_id, left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
          jsonb_build_object('mime', v_c.contrato_mime, 'tamanho', v_c.contrato_tamanho), case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  return jsonb_build_object('cliente_id', p_cliente_id, 'removido', true);
end $function$;

-- gps.cliente_trajetoria_desmarcar(uuid,text)  md5 8f50ee19272e1b99df084d8e8b437be7
CREATE OR REPLACE FUNCTION gps.cliente_trajetoria_desmarcar(p_cliente_id uuid, p_etapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_c        record;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id
   for no key update;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if not exists (select 1 from gps.cliente_etapa_tipos t where t.codigo = p_etapa) then
    raise exception 'Etapa inválida.' using errcode = '22023';
  end if;

  update gps.cliente_trajetoria tr
     set desmarcado_em = now(), desmarcado_por = v_uid
   where tr.cliente_id = p_cliente_id
     and tr.etapa_codigo = p_etapa
     and tr.desmarcado_em is null
  returning tr.id into v_id;

  if v_id is null then
    return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', false,
                              'marcado_em', null, 'mudou', false);
  end if;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_etapa_desmarcada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('etapa_codigo', p_etapa, 'cliente_id', p_cliente_id),
     case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');

  return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', false,
                            'marcado_em', null, 'mudou', true);
end;
$function$;

-- gps.cliente_trajetoria_marcar(uuid,text)  md5 27a78eb3df58909aafae4dfe12151e3a
CREATE OR REPLACE FUNCTION gps.cliente_trajetoria_marcar(p_cliente_id uuid, p_etapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_c        record;
  v_ativo    boolean;
  v_em       timestamptz;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id
   for no key update;

  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select t.ativo into v_ativo
    from gps.cliente_etapa_tipos t
   where t.codigo = p_etapa;
  if not found or not v_ativo then
    raise exception 'Etapa inválida.' using errcode = '22023';
  end if;

  select tr.marcado_em into v_em
    from gps.cliente_trajetoria tr
   where tr.cliente_id = p_cliente_id
     and tr.etapa_codigo = p_etapa
     and tr.desmarcado_em is null;
  if found then
    return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', true,
                              'marcado_em', v_em, 'mudou', false);
  end if;

  insert into gps.cliente_trajetoria (cliente_id, etapa_codigo, marcado_por)
  values (p_cliente_id, p_etapa, v_uid)
  returning marcado_em into v_em;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_etapa_marcada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('etapa_codigo', p_etapa, 'cliente_id', p_cliente_id),
     case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');

  return jsonb_build_object('etapa_codigo', p_etapa, 'marcado', true,
                            'marcado_em', v_em, 'mudou', true);
end;
$function$;

-- gps.config_definir(text,text)  md5 d8552b56285ca3298cede1103a1f2551
CREATE OR REPLACE FUNCTION gps.config_definir(p_chave text, p_valor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_chave is null or p_chave not in (
    'chamados_aberto','chamados_categorias_ativo','convite_socio_ativo','entrada_codigo_ativa',
    'minuta_contexto_obrigatorio',
    'plantao_inscricao_aberta','resgate_ativo','slack_mencoes_ativo','socio_cadastro_obrigatorio',
    'troca_email_login_ativa','tutoriais_ativo','videos_ativo',
    -- Agenda de Sessões (…293 e …294). Desligar `sessoes_email_ativo` é o
    -- freio de mão do disparo por cron; as outras duas relaxam exigências
    -- de fluxo sem deploy.
    'sessoes_email_ativo','sessoes_exige_disc','sessoes_exige_confirmacao',
    -- Pré-visualização INLINE de documento na ficha do cliente (…310). Lido
    -- por `gps.documento_inline_ativo()`. AUSENTE = LIGADO: desligar faz a
    -- equipe voltar a só BAIXAR o documento; a leitura continua existindo.
    'documento_inline_ativo',
    -- Avisos no computador (…357). AUSENTE = DESLIGADO.
    'push_chamados_ativo',
    -- Gerador de minutas (…357). AUSENTE = LIGADO.
    'gerador_minutas_ativo'
  ) then raise exception 'Este interruptor não existe.' using errcode='22023'; end if;
  if p_valor not in ('true','false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode='22023'; end if;
  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update set valor=excluded.valor, atualizado_por=excluded.atualizado_por;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('interruptor_alterado', null,
    format('interruptor "%s" definido para %s', p_chave, p_valor), auth.uid());
end; $function$;

-- gps.drive_criar_pasta_cliente(uuid)  md5 5dc273f84d7a077efd94bb830a2527c3
CREATE OR REPLACE FUNCTION gps.drive_criar_pasta_cliente(p_cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid    := gps.aluno_atual();
  v_aluno    uuid;
  v_link     text;
  v_pasta    text;
  v_id       uuid;
  v_n        int;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'Cliente não encontrado.' using errcode = '22023';
  end if;

  select c.aluno_id into v_aluno
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not (v_admin or coalesce(v_ambiente = v_aluno, false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if not gps.drive_ativo() then
    raise exception 'A criação automática de pastas está desligada.' using errcode = 'P0001';
  end if;

  select l.url into v_link
    from gps.cliente_links_drive l
   where l.cliente_id = p_cliente_id and l.removido_em is null;
  if v_link is not null then
    select p.file_id into v_pasta
      from gps.drive_pastas p
     where p.cliente_id = p_cliente_id and p.papel = 'raiz_cliente';
    if v_pasta is not null and position(v_pasta in v_link) > 0 then
      raise exception 'A pasta deste cliente já foi criada.' using errcode = 'P0001';
    end if;
    raise exception 'Este cliente já tem uma pasta ligada.' using errcode = 'P0001';
  end if;

  select t.id into v_id
    from gps.drive_tarefas t
   where t.cliente_id = p_cliente_id
     and t.tipo = 'criar_pasta_cliente'
     and t.estado in ('pendente', 'rodando')
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- 🔴 Só cria dentro de raiz que a EQUIPE mandou organizar (tarefa
  -- provisionar_parceiro/compartilhar, só admin). Nunca provisiona o parceiro
  -- a partir daqui: era o caminho para adotar pasta alheia colada pelo
  -- parceiro (achado ALTO do kirad). A edge confere de novo.
  if not exists (select 1 from gps.drive_pastas p
                  where p.aluno_id = v_aluno and p.papel = 'raiz_parceiro')
     or not exists (select 1 from gps.drive_pastas p
                     where p.aluno_id = v_aluno and p.papel = 'clientes') then
    raise exception 'A pasta do parceiro ainda não foi organizada pela equipe.' using errcode = 'P0001';
  end if;

  -- Teto: 20 pedidos de pasta de cliente por ambiente em 24 h (janela móvel).
  -- Lock por ambiente: dois cliques simultâneos não furam o teto.
  -- drive_tarefas_aluno_idx (aluno_id, criado_em desc) serve a contagem.
  perform pg_advisory_xact_lock(hashtext('gps.drive_criar_pasta_cliente:' || v_aluno::text));
  select count(*) into v_n
    from gps.drive_tarefas t
   where t.aluno_id = v_aluno
     and t.criado_em >= now() - interval '24 hours'
     and t.tipo = 'criar_pasta_cliente';
  if v_n >= 20 then
    raise exception 'Limite de 20 pastas de cliente por dia atingido. Tente de novo amanhã.' using errcode = 'P0001';
  end if;

  begin
    insert into gps.drive_tarefas (tipo, aluno_id, cliente_id, solicitado_por)
    values ('criar_pasta_cliente', v_aluno, p_cliente_id, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select t.id into v_id
      from gps.drive_tarefas t
     where t.cliente_id = p_cliente_id and t.tipo = 'criar_pasta_cliente'
       and t.estado in ('pendente', 'rodando')
     limit 1;
    return v_id;
  end;

  begin
    perform gps.drive_chamar(v_id);
  exception when others then
    raise warning 'drive: cutucada falhou (%); fica para o cron', sqlstate;
  end;

  return v_id;
end;
$function$;

-- gps.drive_estado(uuid,uuid)  md5 ff4c5527af13f268ed5e403a89414f17
CREATE OR REPLACE FUNCTION gps.drive_estado(p_aluno_id uuid, p_cliente_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid;
  v_admin boolean;
  v_par   jsonb;
  v_cli   jsonb   := null;
  v_url   text;
  v_org   boolean;
begin
  -- Desligado: nada mais é lido (nem sessão, nem guarda). Só revela o
  -- interruptor, que a tela já trata como "esconder"; anon não executa.
  if not gps.drive_ativo() then
    return jsonb_build_object('ativo', false);
  end if;

  v_uid   := auth.uid();
  v_admin := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);

  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;
  if not (v_admin or coalesce(gps.aluno_atual() = p_aluno_id, false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_cliente_id is not null and not exists (
    select 1 from gps.etapa1_clientes c
     where c.id = p_cliente_id and c.aluno_id = p_aluno_id
  ) then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  select a.pasta_drive_url into v_url from gps.ambientes a where a.aluno_id = p_aluno_id;

  select jsonb_build_object(
           'tarefa_id', t.id, 'tipo', t.tipo, 'estado', t.estado,
           'erro', t.erro,
           'erro_detalhe', case when v_admin then t.erro_detalhe end,
           'aviso', t.aviso, 'atualizado_em', t.atualizado_em)
    into v_par
    from gps.drive_tarefas t
   where t.aluno_id = p_aluno_id
     and t.tipo in ('provisionar_parceiro', 'compartilhar')
   order by t.criado_em desc
   limit 1;

  -- Organizada = raiz E 5) CLIENTES registradas (mesma regra de
  -- drive_criar_pasta_cliente). drive_pastas_parceiro_papel_uq: 1 por papel.
  select count(*) = 2 into v_org
    from gps.drive_pastas p
   where p.aluno_id = p_aluno_id
     and p.papel in ('raiz_parceiro', 'clientes');

  v_par := coalesce(v_par, '{}'::jsonb)
           || jsonb_build_object('url', v_url, 'organizada', coalesce(v_org, false));

  -- Só a equipe vê: permissão marcada e ainda viva (pendente ou desistida).
  if v_admin then
    v_par := v_par || jsonb_build_object('revogacao_pendente', exists (
      select 1 from gps.drive_permissoes p
       where p.aluno_id = p_aluno_id
         and p.revogado_em is null
         and p.revogar_desde is not null));
  end if;

  if p_cliente_id is not null then
    select jsonb_build_object(
             'tarefa_id', t.id, 'tipo', t.tipo, 'estado', t.estado,
             'erro', t.erro,
             'erro_detalhe', case when v_admin then t.erro_detalhe end,
             'aviso', t.aviso, 'atualizado_em', t.atualizado_em)
      into v_cli
      from gps.drive_tarefas t
     where t.cliente_id = p_cliente_id
       and t.tipo = 'criar_pasta_cliente'
     order by t.criado_em desc
     limit 1;

    v_cli := coalesce(v_cli, '{}'::jsonb) || jsonb_build_object('url', (
      select l.url from gps.cliente_links_drive l
       where l.cliente_id = p_cliente_id and l.removido_em is null));
  end if;

  return jsonb_build_object('ativo', true, 'parceiro', v_par, 'cliente', v_cli);
end;
$function$;

-- gps.drive_pasta_registrar(uuid,text,text,text,boolean)  md5 55df484279a50e4ca33bb63a38bd6b98
CREATE OR REPLACE FUNCTION gps.drive_pasta_registrar(p_tarefa_id uuid, p_file_id text, p_papel text, p_nome text, p_adotada boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_t    record;
  v_orig text;
  v_nome text := left(btrim(regexp_replace(coalesce(p_nome, ''), '[[:cntrl:]]', ' ', 'g')), 200);
begin
  select t.id, t.tipo, t.aluno_id, t.cliente_id, t.solicitado_por into v_t
    from gps.drive_tarefas t
   where t.id = p_tarefa_id and t.estado = 'rodando';
  if not found or v_t.aluno_id is null then
    raise exception 'tarefa nao esta rodando' using errcode = 'P0002';
  end if;
  if p_file_id is null or p_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'file_id invalido' using errcode = '22023';
  end if;
  if v_nome = '' then
    v_nome := 'Pasta';
  end if;

  -- 🔴 Pasta de OUTRO parceiro nunca vira deste (achado ALTO do kirad).
  -- Raiz "Pastas dos Alunos" e a matriz nunca são registradas.
  if p_file_id in ('1CRSsOfNm_PO944c3K05Nx0aI2oXehG7N', '1T-EiOQWQgu_qXK8rtbr7BzByNW_jzm3L') then
    raise exception 'Esta pasta não pode ser usada como pasta de parceiro.' using errcode = 'P0001';
  end if;
  if exists (select 1 from gps.drive_pastas p
              where p.file_id = p_file_id and p.aluno_id <> v_t.aluno_id) then
    raise exception 'Esta pasta já pertence a outro parceiro.' using errcode = 'P0001';
  end if;

  if p_papel = 'raiz_parceiro' then
    -- Link de OUTRO ambiente apontando para esta pasta (135 linhas; regex
    -- igual à de drive_parceiro_link_gravar).
    if exists (select 1 from gps.ambientes a
                where a.aluno_id <> v_t.aluno_id
                  and a.pasta_drive_url is not null
                  and (a.pasta_drive_url ~ ('/folders/' || p_file_id || '([/?#]|$)')
                       or a.pasta_drive_url ~ ('[?&]id=' || p_file_id || '(&|#|$)'))) then
      raise exception 'Esta pasta já pertence a outro parceiro.' using errcode = 'P0001';
    end if;
    -- Adotar pasta que o sistema NÃO criou: só pedido de admin, tarefa
    -- provisionar_parceiro e link gravado pela equipe.
    if coalesce(p_adotada, false) then
      select a.pasta_drive_origem into v_orig from gps.ambientes a where a.aluno_id = v_t.aluno_id;
      if v_t.tipo <> 'provisionar_parceiro'
         or v_orig is distinct from 'equipe'
         or not coalesce((select true from public.perfis p
                           where p.id = v_t.solicitado_por
                             and p.status = 'ativo'
                             and p.cargo in ('dev', 'admin')), false) then
        raise exception 'A pasta ligada a este parceiro precisa ser conferida pela equipe antes de ser organizada.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if p_papel in ('raiz_parceiro', 'documentos', 'clientes') then
    insert into gps.drive_pastas (file_id, aluno_id, papel, nome, adotada)
    values (p_file_id, v_t.aluno_id, p_papel, v_nome, coalesce(p_adotada, false))
    on conflict (aluno_id, papel) where papel in ('raiz_parceiro', 'documentos', 'clientes')
    do update set file_id = excluded.file_id, nome = excluded.nome,
                  adotada = excluded.adotada, criado_em = now()
      where gps.drive_pastas.file_id is distinct from excluded.file_id;
  elsif p_papel = 'raiz_cliente' then
    if v_t.tipo <> 'criar_pasta_cliente' or v_t.cliente_id is null then
      raise exception 'papel incompativel com a tarefa' using errcode = '22023';
    end if;
    insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
    values (p_file_id, v_t.aluno_id, v_t.cliente_id, 'raiz_cliente', v_nome)
    on conflict (cliente_id) where papel = 'raiz_cliente'
    do update set file_id = excluded.file_id, nome = excluded.nome, criado_em = now()
      where gps.drive_pastas.file_id is distinct from excluded.file_id;
  elsif p_papel = 'sub_cliente' then
    if v_t.tipo <> 'criar_pasta_cliente' or v_t.cliente_id is null then
      raise exception 'papel incompativel com a tarefa' using errcode = '22023';
    end if;
    insert into gps.drive_pastas (file_id, aluno_id, cliente_id, papel, nome)
    values (p_file_id, v_t.aluno_id, v_t.cliente_id, 'sub_cliente', v_nome)
    on conflict (file_id) do nothing;
  else
    raise exception 'papel invalido' using errcode = '22023';
  end if;
end;
$function$;

-- gps.drive_pendencias()  md5 8c2d73dd3c65a56ee7a9cd7bf673c515
CREATE OR REPLACE FUNCTION gps.drive_pendencias()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_res jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Última tarefa do parceiro (provisionar/compartilhar) por aluno — mesma
  -- regra de gps.drive_estado (criado_em desc). CTE lido 2×, materializado 1×.
  with ult as (
    select distinct on (t.aluno_id)
           t.aluno_id, t.estado, t.erro, t.aviso, t.atualizado_em
      from gps.drive_tarefas t
     where t.aluno_id is not null
       and t.tipo in ('provisionar_parceiro', 'compartilhar')
     order by t.aluno_id, t.criado_em desc
  )
  select jsonb_build_object(
           'placar', (select jsonb_build_object(
                               'feitas',   count(*) filter (where u.estado = 'feito'),
                               'na_fila',  count(*) filter (where u.estado in ('pendente', 'rodando')),
                               'com_erro', count(*) filter (where u.estado = 'erro'),
                               'faltando', (select count(*) from gps.ambientes a
                                             where a.pasta_drive_url is null))
                        from ult u),
           'itens',  (select coalesce(jsonb_agg(jsonb_build_object(
                               'aluno_id',      x.aluno_id,
                               'nome',          x.nome,
                               'estado',        x.estado,
                               'erro',          x.erro,
                               'aviso',         x.aviso,
                               'atualizado_em', x.atualizado_em)
                             order by x.atualizado_em desc), '[]'::jsonb)
                        from (select u.aluno_id, u.estado, u.erro, u.aviso, u.atualizado_em,
                                     (select nullif(btrim(al.nome), '')
                                        from public.thb_alunos al
                                       where al.id = u.aluno_id) as nome
                                from ult u
                               where u.erro is not null or u.aviso is not null
                               order by u.atualizado_em desc
                               limit 200) x),
           'sem_pasta', (select coalesce(jsonb_agg(jsonb_build_object(
                               'aluno_id',      s.aluno_id,
                               'nome',          s.nome,
                               'email_google',  s.email_google,
                               'criado_em',     s.criado_em)
                             order by s.nome nulls last, s.aluno_id), '[]'::jsonb)
                        from (select a.aluno_id, al.nome, a.criado_em,
                                     coalesce(lower(btrim(al.email)) ~ '@(gmail|googlemail)\.com$', false) as email_google
                                from gps.ambientes a
                                left join public.thb_alunos al on al.id = a.aluno_id
                               where a.pasta_drive_url is null
                                 and not exists (select 1 from gps.drive_tarefas t
                                                  where t.aluno_id = a.aluno_id
                                                    and t.tipo in ('provisionar_parceiro', 'compartilhar')
                                                    and t.estado in ('pendente', 'rodando'))
                               order by al.nome nulls last, a.aluno_id
                               limit 300) s))
    into v_res;

  return v_res;
end;
$function$;

-- gps.drive_provisionar_parceiro(uuid)  md5 39becd3d12b64396f059255dc42417f3
CREATE OR REPLACE FUNCTION gps.drive_provisionar_parceiro(p_aluno_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid    := auth.uid();
  v_admin  boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_url    text;
  v_raiz   text;
  v_tipo   text;
  v_id     uuid;
  v_origem text;
  v_estado text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if not v_admin then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;
  if not gps.drive_ativo() then
    raise exception 'A criação automática de pastas está desligada.' using errcode = 'P0001';
  end if;

  select a.pasta_drive_url into v_url
    from gps.ambientes a
   where a.aluno_id = p_aluno_id;
  if not found then
    raise exception 'Ambiente não encontrado.' using errcode = 'P0002';
  end if;

  -- Já existe uma ativa (qualquer dos dois tipos do parceiro)? Devolve ela;
  -- se for automática e ainda pendente, o pedido do admin a assume.
  select t.id, t.origem, t.estado into v_id, v_origem, v_estado
    from gps.drive_tarefas t
   where t.aluno_id = p_aluno_id
     and t.tipo in ('provisionar_parceiro', 'compartilhar')
     and t.estado in ('pendente', 'rodando')
   limit 1;
  if v_id is not null then
    if v_origem <> 'manual' and v_estado = 'pendente' then
      update gps.drive_tarefas
         set origem = 'manual', solicitado_por = v_uid, proxima_em = now()
       where id = v_id and estado = 'pendente';
    end if;
    return v_id;
  end if;

  select p.file_id into v_raiz
    from gps.drive_pastas p
   where p.aluno_id = p_aluno_id and p.papel = 'raiz_parceiro';

  v_tipo := case
              when v_raiz is not null and v_url is not null
                   and position(v_raiz in v_url) > 0
              then 'compartilhar'
              else 'provisionar_parceiro'
            end;

  begin
    insert into gps.drive_tarefas (tipo, aluno_id, solicitado_por)
    values (v_tipo, p_aluno_id, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select t.id into v_id
      from gps.drive_tarefas t
     where t.aluno_id = p_aluno_id and t.tipo = v_tipo
       and t.estado in ('pendente', 'rodando')
     limit 1;
    return v_id;
  end;

  -- Cutucada nunca derruba o pedido: a tarefa gravada é o que garante; o cron repassa.
  begin
    perform gps.drive_chamar(v_id);
  exception when others then
    raise warning 'drive: cutucada falhou (%); fica para o cron', sqlstate;
  end;

  return v_id;
end;
$function$;

-- gps.drive_tarefa_pegar(integer)  md5 abe1905165be131bedf59fb953f5ec18
CREATE OR REPLACE FUNCTION gps.drive_tarefa_pegar(p_limite integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids uuid[];
  v_n   int;
begin
  if not gps.drive_ativo() then
    return '[]'::jsonb;
  end if;

  perform pg_advisory_xact_lock(hashtext('gps.drive_tarefa_pegar'));

  with cand as (
    select distinct on (t.aluno_id) t.id, t.proxima_em, t.origem
      from gps.drive_tarefas t
     where t.estado = 'pendente'
       and t.proxima_em <= now()
       -- 'revogar' tem aluno_id nulo: "is not distinct from" faz duas
       -- revogar nunca rodarem juntas (o conjunto rodando é minúsculo).
       and not exists (
         select 1 from gps.drive_tarefas r
          where r.aluno_id is not distinct from t.aluno_id and r.estado = 'rodando')
     -- …364: backfill por último (botão e nascimento não esperam a fila dele).
     order by t.aluno_id, (t.origem = 'backfill'), t.proxima_em
  ), lim as (
    select c.id from cand c
     order by (c.origem = 'backfill'), c.proxima_em
     limit least(greatest(coalesce(p_limite, 3), 1), 10)
  ), upd as (
    update gps.drive_tarefas t
       set estado = 'rodando', iniciado_em = now()
      from lim
     where t.id = lim.id
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from upd;

  -- E-mail trocado FORA do painel (updateUser, outro portal do grupo): nenhum
  -- gatilho do GPS vê. Ao processar provisionar/compartilhar, toda permissão
  -- viva que o sistema deu a quem não é mais (titular, mesmo e-mail atual)
  -- vira revogação. Aqui e não em drive_revogacoes_listar: a listagem só roda
  -- quando já existe tarefa 'revogar', e a troca externa não cria nenhuma.
  update gps.drive_permissoes p
     set revogar_desde = now(), revogar_motivo = 'email_trocado',
         tentativas = 0, erro_detalhe = null
   where p.revogado_em is null
     and p.revogar_desde is null
     and p.aluno_id in (select t.aluno_id from gps.drive_tarefas t
                         where t.id = any(v_ids)
                           and t.tipo in ('provisionar_parceiro', 'compartilhar'))
     and not exists (select 1
                       from gps.membros m
                       join auth.users u on u.id = m.user_id
                      where m.aluno_id = p.aluno_id
                        and m.user_id = p.user_id
                        and m.papel = 'titular'
                        and lower(btrim(u.email)) = p.email);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform gps.drive_revogar_enfileirar();
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',              t.id,
      'tipo',            t.tipo,
      'aluno_id',        t.aluno_id,
      'cliente_id',      t.cliente_id,
      -- …350: tarefa 'arquivar' (aluno_id nulo) leva a pasta aqui.
      'file_id',         t.file_id,
      -- …364: manual | nascimento | backfill (edge: ja_tinha_pasta).
      'origem',          t.origem,
      'tentativas',      t.tentativas,
      'parceiro_nome',   (select nullif(btrim(a.nome), '') from public.thb_alunos a where a.id = t.aluno_id),
      'pasta_drive_url', amb.pasta_drive_url,
      -- Adoção de pasta existente exige origem 'equipe' E pedido de admin
      -- (mesmo predicado de public.gp_is_admin, aplicado a quem pediu).
      'pasta_drive_origem', amb.pasta_drive_origem,
      'solicitado_por_admin', coalesce((select true from public.perfis p
                                         where p.id = t.solicitado_por
                                           and p.status = 'ativo'
                                           and p.cargo in ('dev', 'admin')), false),
      'titular_email',   (select lower(btrim(u.email))
                            from gps.membros m
                            join auth.users u on u.id = m.user_id
                           where m.aluno_id = t.aluno_id and m.papel = 'titular'
                           order by m.criado_em
                           limit 1),
      'cliente_nome',    (select nullif(btrim(c.nome), '') from gps.etapa1_clientes c where c.id = t.cliente_id),
      'cliente_link_url',(select l.url from gps.cliente_links_drive l
                           where l.cliente_id = t.cliente_id and l.removido_em is null),
      'pastas',          (select coalesce(jsonb_object_agg(p.papel,
                                   jsonb_build_object('file_id', p.file_id, 'adotada', p.adotada)), '{}'::jsonb)
                            from gps.drive_pastas p
                           where p.aluno_id = t.aluno_id
                             and p.papel in ('raiz_parceiro', 'documentos', 'clientes')),
      'pasta_cliente',   (select p.file_id from gps.drive_pastas p
                           where p.cliente_id = t.cliente_id and p.papel = 'raiz_cliente')
    ))
      from gps.drive_tarefas t
      left join gps.ambientes amb on amb.aluno_id = t.aluno_id
     where t.id = any(v_ids)
  ), '[]'::jsonb);
end;
$function$;

-- gps.email_e_de_equipe(text)  md5 f8641f9eaffa30a2323583758d514960
CREATE OR REPLACE FUNCTION gps.email_e_de_equipe(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with e as (select lower(trim(p_email)) as email)
  select
    exists (select 1 from public.perfis p, e
             where lower(trim(p.email)) = e.email
               and p.status = 'ativo' and p.cargo in ('dev','admin'))
    or exists (select 1 from rede.perfis r, e
                where lower(trim(r.email)) = e.email and r.papel = 'admin')
    or exists (select 1 from workbook.perfis w, e
                where lower(trim(w.email)) = e.email
                  and w.role in ('admin','dev','editor'));
$function$;

-- gps.entrevista_previa_pode(uuid)  md5 742818ac86c7568123fd9cd5f3ed4529
CREATE OR REPLACE FUNCTION gps.entrevista_previa_pode(p_cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Curto-circuito: admin não paga `aluno_atual()`.
  if coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    return true;
  end if;
  return coalesce(
    exists (select 1 from gps.etapa1_clientes c
             where c.id = p_cliente_id and c.aluno_id = gps.aluno_atual()),
    false);
end $function$;

-- gps.etapa1_clientes_acompanhamento_travado()  md5 6790f80794338cfdf2b4c3b14fe16d36
CREATE OR REPLACE FUNCTION gps.etapa1_clientes_acompanhamento_travado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Admin passa por tudo: é ele quem troca a pedido de um chamado.
  -- `coalesce(..., false)`: sem sessão (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) é NULL e a guarda
  -- falharia ABERTA.
  if coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- (a) As duas colunas do vínculo são escrita da equipe, SEMPRE.
  if tg_op = 'UPDATE'
     and (new.acompanhamento_confirmado_em  is distinct from old.acompanhamento_confirmado_em
       or new.acompanhamento_confirmado_por is distinct from old.acompanhamento_confirmado_por)
  then
    raise exception 'Só a equipe confirma ou libera o acompanhamento deste cliente.'
      using errcode = '42501';
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 CORREÇÃO 1 (…305): A TRAVA É DO CLIENTE ESCOLHIDO, NÃO DE QUALQUER UM
  -- ═══════════════════════════════════════════════════════════════════════
  -- A …304 travava a volta para Prospecção de TODO cliente que andou, com ou
  -- sem estrela, e com a frase "A equipe está acompanhando este cliente" —
  -- que era falsa para quem nunca foi escolhido. Medido em produção:
  -- 40 clientes avançados SEM estrela ficaram presos por engano, e um toque
  -- errado no Select da lista era irreversível para o parceiro.
  -- A decisão registrada (Marcio, 23/09/2026) é sobre o cliente que a equipe
  -- vai acompanhar. Sem estrela, nada aqui se aplica.
  if not old.acompanhado_equipe then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Daqui para baixo: este cliente É o escolhido.

  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 CORREÇÃO 2 (…305): FECHA A FUGA PELA DATA DA REUNIÃO
  -- ═══════════════════════════════════════════════════════════════════════
  -- A …304 lia o estado ANTERIOR para decidir se travava — certo, porque com
  -- `new` o próprio ato de avançar seria recusado. Mas sobrava uma saída: o
  -- favorito em Prospecção COM reunião marcada estava travado; bastava apagar
  -- a data e salvar (a trigger não recusava), e na escrita seguinte o `old`
  -- já dizia "não andou" — desmarcar passava a ser livre.
  -- Medido: 5 favoritos estão exatamente nessa posição hoje.
  -- Apagar a data de um favorito cujo caso andou é, na prática, destravar a
  -- troca: recusa com a mesma frase, porque para o parceiro é UM problema só.
  if tg_op = 'UPDATE'
     and old.data_reuniao_preliminar is not null
     and new.data_reuniao_preliminar is null
  then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  -- O CASO AINDA NÃO ANDOU → tudo livre.
  -- ⚠️ `old`, NUNCA `new`: o UPDATE que move a fase ou marca a reunião É o ato
  -- de avançar e TEM de passar.
  if old.fase = 'prospeccao' and old.data_reuniao_preliminar is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- O caso andou E este é o cliente escolhido: as três travas valem.
  if tg_op = 'DELETE' then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and not new.acompanhado_equipe then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.fase = 'prospeccao' and old.fase is distinct from 'prospeccao'
  then
    raise exception 'A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- gps.etapa1_clientes_contrato_travado()  md5 d3102a85a84961313b793bd54569fa0d
CREATE OR REPLACE FUNCTION gps.etapa1_clientes_contrato_travado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_mudou boolean;
begin
  if tg_op = 'INSERT' then
    v_mudou := new.contrato_path is not null or new.contrato_nome is not null or new.contrato_mime is not null or new.contrato_tamanho is not null or new.contrato_anexado_em is not null;
  else
    v_mudou := new.contrato_path is distinct from old.contrato_path or new.contrato_nome is distinct from old.contrato_nome or new.contrato_mime is distinct from old.contrato_mime or new.contrato_tamanho is distinct from old.contrato_tamanho or new.contrato_anexado_em is distinct from old.contrato_anexado_em;
  end if;
  if not v_mudou then return new; end if;
  if coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) or current_user = 'postgres' then return new; end if;
  raise exception 'O contrato do cliente é anexado pelo próprio portal — este campo não pode ser escrito direto.' using errcode = '42501';
end;
$function$;

-- gps.etapa1_clientes_entrevista_travada()  md5 c55d5f9b303cc1bd2930ee30e2c388eb
CREATE OR REPLACE FUNCTION gps.etapa1_clientes_entrevista_travada()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_mudou boolean;
begin
  if tg_op = 'INSERT' then
    -- Os 3 `not null default` NUNCA sao nulos no INSERT: o default os
    -- preenche antes da BEFORE. Por isso a comparacao deles e contra o
    -- DEFAULT, nao contra null -- `is not null` recusaria TODO insert de
    -- cliente e a ficha pararia de criar cliente em producao.
    v_mudou := new.entrevista_resultado              is not null
            or new.entrevista_observacoes            is not null
            or new.entrevista_em                     is not null
            or new.entrevista_por                    is not null
            or new.entrevista_retorno_em             is not null
            or new.entrevista_motivo_encerramento    is not null
            or coalesce(new.entrevista_tentativas_sem_contato, 0) <> 0
            or coalesce(new.entrevista_remarcacoes, 0)            <> 0
            or coalesce(new.entrevista_encerrada, false)          <> false;
  else
    v_mudou := new.entrevista_resultado              is distinct from old.entrevista_resultado
            or new.entrevista_observacoes            is distinct from old.entrevista_observacoes
            or new.entrevista_em                     is distinct from old.entrevista_em
            or new.entrevista_por                    is distinct from old.entrevista_por
            or new.entrevista_retorno_em             is distinct from old.entrevista_retorno_em
            or new.entrevista_motivo_encerramento    is distinct from old.entrevista_motivo_encerramento
            or new.entrevista_tentativas_sem_contato is distinct from old.entrevista_tentativas_sem_contato
            or new.entrevista_remarcacoes            is distinct from old.entrevista_remarcacoes
            or new.entrevista_encerrada              is distinct from old.entrevista_encerrada;
  end if;

  if not v_mudou then
    return new;
  end if;

  if coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false)
     or coalesce(gps.eh_equipe(), false)
     or current_user = 'postgres' then
    return new;
  end if;

  raise exception 'A entrevista prévia é registrada pela equipe — estes campos não podem ser escritos direto.'
    using errcode = '42501';
end;
$function$;

-- gps.etapa_liberada_para(uuid,smallint)  md5 5abb6332fa1adcce628ad95ba3d2ecef
CREATE OR REPLACE FUNCTION gps.etapa_liberada_para(p_aluno_id uuid, p_etapa smallint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_liberada boolean;
begin
  if p_aluno_id is null or p_etapa is null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  if not ((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) or p_aluno_id = gps.aluno_atual()) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  select coalesce(o.liberada, e.liberada)
    into v_liberada
    from gps.etapas e
    left join gps.etapa_liberacao_aluno o
           on o.etapa = e.id and o.aluno_id = p_aluno_id
   where e.id = p_etapa;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;
  return v_liberada;
end $function$;

-- gps.financeiro_candidatos_do_aluno(uuid)  md5 fe1311e6034f94ebe72913c40e70b37c
CREATE OR REPLACE FUNCTION gps.financeiro_candidatos_do_aluno(p_aluno_id uuid)
 RETURNS TABLE(contato_hm_id text, produto text, plano text, turma text, valor_total numeric, criado_em timestamp with time zone, casou_por text, email text, documento_final text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text; v_doc text;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select lower(btrim(coalesce(a.email, ''))),
         regexp_replace(coalesce(a.documento, ''), '\D', '', 'g')
    into v_email, v_doc
    from public.thb_alunos a
   where a.id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  if v_email = '' and v_doc = '' then
    return;
  end if;
  return query
  select h.id::text,
         h.produto::text,
         h.plano::text,
         h.turma::text,
         h.valor_total::numeric,
         h.criado_em::timestamptz,
         case when v_email <> ''
               and lower(btrim(coalesce(c.email, ''))) = v_email
              then 'e-mail' else 'documento' end,
         c.email::text,
         right(regexp_replace(coalesce(c.documento, ''), '\D', '', 'g'), 4)
    from cs.contatos_hm h
    join public.compradores c on c.id = h.comprador_id
   where h.aluno_id is null
     and (
       (v_email <> '' and lower(btrim(coalesce(c.email, ''))) = v_email)
       or
       (v_doc <> ''
        and lpad(regexp_replace(coalesce(c.documento, ''), '\D', '', 'g'), 14, '0')
          = lpad(v_doc, 14, '0'))
     )
   order by (case when v_email <> ''
                   and lower(btrim(coalesce(c.email, ''))) = v_email
                  then 0 else 1 end),
            h.criado_em desc nulls last,
            h.id::text;
end $function$;

-- gps.financeiro_pode_ler(uuid)  md5 48ce77530f0365a24b047901f44ca597
CREATE OR REPLACE FUNCTION gps.financeiro_pode_ler(p_aluno_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false))
      or exists (
           select 1
             from gps.membros m
            where m.user_id = auth.uid()
              and (
                    (m.aluno_id = p_aluno_id and m.papel = 'titular')
                 or (m.pessoa_aluno_id is not null
                     and m.pessoa_aluno_id = p_aluno_id
                     -- 🔴 PROVA DE POSSE: o cadastro tem de ser do dono do
                     -- login. Sem isto, `pessoa_aluno_id` é escolhido pelo
                     -- próprio atacante via gps.socio_cadastro_gravar.
                     and exists (
                           select 1
                             from public.thb_alunos t
                             join auth.users u on u.id = m.user_id
                            where t.id = m.pessoa_aluno_id
                              and coalesce(btrim(t.email), '') <> ''
                              and lower(btrim(t.email)) = lower(btrim(u.email))
                         ))
              ));
$function$;

-- gps.membros_aluno_papel_congelados()  md5 a82ac00498d3b8378cc5af47548e4a4f
CREATE OR REPLACE FUNCTION gps.membros_aluno_papel_congelados()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Admin e o proprio Postgres (migrations, RPCs security definer) passam.
  if (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) or current_user = 'postgres' then
    return new;
  end if;
  if new.aluno_id is distinct from old.aluno_id then
    raise exception 'Não é possível mudar o ambiente do membro por aqui.' using errcode = '42501';
  end if;
  if new.papel is distinct from old.papel then
    raise exception 'Não é possível mudar o papel do membro por aqui.' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- gps.minuta_registrar_parecer(uuid,text,text)  md5 78b4989192542b3b1befe5072a0d3a29
CREATE OR REPLACE FUNCTION gps.minuta_registrar_parecer(p_minuta_id uuid, p_status text, p_parecer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status   text := btrim(coalesce(p_status, ''));
  v_parecer  text := nullif(btrim(coalesce(p_parecer, '')), '');
  v_m            record;
  v_aluno_id     uuid;
  v_cliente_nome text;
  v_email        text;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_minuta_id is null then
    raise exception 'Minuta não informada.' using errcode = '22023';
  end if;
  if v_status not in ('enviada', 'em_analise', 'revisada') then
    raise exception 'Status de minuta inválido.' using errcode = '22023';
  end if;
  if v_parecer is not null and char_length(v_parecer) > 4000 then
    raise exception 'O parecer passa de 4000 caracteres.' using errcode = '22023';
  end if;
  if v_status = 'revisada' and v_parecer is null then
    raise exception 'Escreva o parecer para marcar a minuta como revisada.' using errcode = '22023';
  end if;

  update gps.cliente_minutas m
     set status      = v_status,
         parecer     = v_parecer,
         parecer_em  = now(),
         parecer_por = auth.uid()
   where m.id = p_minuta_id
  returning m.id, m.cliente_id, m.enviado_por, m.enviado_pela_equipe
    into v_m;

  if not found then
    raise exception 'Minuta não encontrada.' using errcode = 'P0002';
  end if;

  select c.aluno_id, c.nome
    into v_aluno_id, v_cliente_nome
    from gps.etapa1_clientes c
   where c.id = v_m.cliente_id;

  v_email := coalesce(
    case when not v_m.enviado_pela_equipe
              and v_m.enviado_por is not null
              and exists (select 1 from gps.membros mb
                           where mb.user_id = v_m.enviado_por
                             and mb.aluno_id = v_aluno_id)
         then (select u.email from auth.users u where u.id = v_m.enviado_por) end,
    (select a.email from public.thb_alunos a where a.id = v_aluno_id));

  return jsonb_build_object(
    'id',           v_m.id,
    'cliente_id',   v_m.cliente_id,
    'aluno_id',     v_aluno_id,
    'cliente_nome', v_cliente_nome,
    'status',       v_status,
    'avisar',       nullif(btrim(coalesce(v_email, '')), ''));
end $function$;

-- gps.operador_definir(uuid,boolean,text)  md5 bedc0651c921295d24d987ca9d24d1c7
CREATE OR REPLACE FUNCTION gps.operador_definir(p_user_id uuid, p_ativo boolean, p_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nome text; v_email text;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_user_id is null then raise exception 'usuario nao informado' using errcode='22023'; end if;
  if p_ativo is null then raise exception 'ativo nao informado' using errcode='22023'; end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then raise exception 'Login não encontrado.' using errcode='P0002'; end if;
  v_nome := nullif(btrim(coalesce(p_nome,'')),'');
  if v_nome is not null and char_length(v_nome) > 200 then
    raise exception 'O nome passa de 200 caracteres.' using errcode='22023'; end if;
  insert into gps.operadores (user_id, nome, ativo, criado_por)
  values (p_user_id, coalesce(v_nome, v_email), p_ativo, auth.uid())
  on conflict (user_id) do update set ativo=excluded.ativo, nome=coalesce(v_nome, gps.operadores.nome);
  insert into gps.acessos_log (acao, aluno_id, email_alvo, feito_por, detalhe)
  values ('operador_definido', null, v_email, auth.uid(),
    case when p_ativo then 'operador ativado' else 'operador desativado' end);
  return jsonb_build_object('user_id', p_user_id, 'ativo', p_ativo);
end; $function$;

-- gps.pasta_drive_definir(uuid,text,text)  md5 0a3e7111e903207020337898e57780ad
CREATE OR REPLACE FUNCTION gps.pasta_drive_definir(p_aluno_id uuid, p_url text, p_url_anterior text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_url    text := nullif(btrim(p_url), '');
  v_ant    text := nullif(btrim(p_url_anterior), '');
  v_admin  boolean;
  v_atual  text;
  v_origem text;
  v_nome   text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;

  if v_url is not null and not (
        v_url ~ '^https://(drive|docs)\.google\.com/'
    and v_url !~ '^https://(drive|docs)\.google\.com/url'
    and v_url !~* '(/\.{1,2}(/|\?|#|$)|%2e|\\)'
    and v_url !~ '\s'
    and length(v_url) <= 2048
  ) then
    raise exception 'Informe um link válido do Google Drive.' using errcode = '22023';
  end if;

  v_admin := (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false));

  if not v_admin and not exists (
    select 1 from gps.membros m
     where m.user_id = v_uid and m.aluno_id = p_aluno_id
  ) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select a.pasta_drive_url, a.pasta_drive_origem
    into v_atual, v_origem
    from gps.ambientes a
   where a.aluno_id = p_aluno_id
   for update;

  if not found then
    raise exception 'Ambiente não encontrado.' using errcode = 'P0002';
  end if;

  if not v_admin then
    if v_atual is not null and v_origem is distinct from 'parceiro' then
      raise exception 'A pasta já foi definida pela equipe.' using errcode = '42501';
    end if;
    if v_url is null then
      raise exception 'Informe o link da pasta.' using errcode = '22023';
    end if;
  end if;

  if v_atual is distinct from v_ant then
    raise exception 'O link mudou enquanto você editava; recarregue.' using errcode = 'P0001';
  end if;

  if v_url is not distinct from v_atual then
    return;
  end if;

  if v_url is null then
    update gps.ambientes
       set pasta_drive_url = null, pasta_drive_por = null,
           pasta_drive_por_nome = null, pasta_drive_em = null,
           pasta_drive_origem = null
     where aluno_id = p_aluno_id;
    return;
  end if;

  if v_admin then
    v_nome := 'Equipe';
  else
    select nullif(btrim(t.nome), '')
      into v_nome
      from gps.membros m
      left join public.thb_alunos t
        on t.id = coalesce(m.pessoa_aluno_id,
                           case when m.papel = 'titular' then m.aluno_id end)
     where m.user_id = v_uid
       and m.aluno_id = p_aluno_id
     limit 1;
    v_nome := coalesce(v_nome, 'Parceiro');
  end if;

  update gps.ambientes
     set pasta_drive_url      = v_url,
         pasta_drive_por      = v_uid,
         pasta_drive_por_nome = v_nome,
         pasta_drive_em       = now(),
         pasta_drive_origem   = case when v_admin then 'equipe' else 'parceiro' end
   where aluno_id = p_aluno_id;
end;
$function$;

-- gps.pode_anexar_croqui(text)  md5 3ccbf73b16faab1dd0bfab34c33ce658
CREATE OR REPLACE FUNCTION gps.pode_anexar_croqui(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if coalesce(p_name, '') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then
    return false;
  end if;
  return coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false)
      or gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_anexar_minuta(text)  md5 61b467732d33e51d90440f6abc29cba9
CREATE OR REPLACE FUNCTION gps.pode_anexar_minuta(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if coalesce(p_name,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then return false; end if;
  return coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false)
      or gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then return false;
end; $function$;

-- gps.pode_ver_anexo_chamado(text)  md5 fa43d8a28e5de3ff717f982b8018b491
CREATE OR REPLACE FUNCTION gps.pode_ver_anexo_chamado(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_prefixo text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_ver_anexo_onboarding(text)  md5 c34a00385bf07dbca2b328f7546d096b
CREATE OR REPLACE FUNCTION gps.pode_ver_anexo_onboarding(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_prefixo text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_ver_chamado(uuid)  md5 bd33cfe86b0f31bdfabb85e7997b2cae
CREATE OR REPLACE FUNCTION gps.pode_ver_chamado(p_chamado_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from gps.chamados c
     where c.id = p_chamado_id
       and ((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) or c.aluno_id = gps.aluno_atual())
  );
$function$;

-- gps.pode_ver_croqui(text)  md5 ce14c44a0c7f2dc56471d57902d1a344
CREATE OR REPLACE FUNCTION gps.pode_ver_croqui(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_prefixo text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false)
      or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_ver_minuta(text)  md5 2455e75795557f8d2022d7554cf75478
CREATE OR REPLACE FUNCTION gps.pode_ver_minuta(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_prefixo text := split_part(coalesce(p_name,''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) or gps.aluno_atual() = v_prefixo::uuid;
exception when others then return false;
end; $function$;

-- gps.push_desinscrever(text)  md5 698b2e527ceb5f967c889224e963109a
CREATE OR REPLACE FUNCTION gps.push_desinscrever(p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null or not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  update gps.push_inscricoes i
     set revogada_em = now()
   where i.endpoint = btrim(coalesce(p_endpoint, ''))
     and i.user_id = v_uid
     and i.revogada_em is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$function$;

-- gps.push_inscrever(text,text,text,text)  md5 4c7da81eb2615f1aa5dce07726183438
CREATE OR REPLACE FUNCTION gps.push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh   text := btrim(coalesce(p_p256dh, ''));
  v_auth     text := btrim(coalesce(p_auth, ''));
  v_ua       text := nullif(left(btrim(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]]', ' ', 'g')), 500), '');
  v_ativas   int;
  v_n        int;
begin
  -- coalesce: guarda que devolve null falharia ABERTA.
  if v_uid is null or not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if char_length(v_endpoint) > 1000
     or v_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/[^[:space:][:cntrl:]]+$' then
    raise exception 'Navegador não suportado para avisos.' using errcode = '22023';
  end if;
  if v_p256dh !~ '^[A-Za-z0-9_=+/-]{40,200}$' or v_auth !~ '^[A-Za-z0-9_=+/-]{16,64}$' then
    raise exception 'Inscrição de aviso inválida.' using errcode = '22023';
  end if;

  -- Serializa as inscrições da MESMA pessoa: dois cliques simultâneos não
  -- furam o teto.
  perform pg_advisory_xact_lock(hashtextextended('gps.push_inscrever:' || v_uid::text, 0));

  select count(*) into v_ativas
    from gps.push_inscricoes i
   where i.user_id = v_uid
     and i.revogada_em is null
     and i.endpoint <> v_endpoint;
  if v_ativas >= 10 then
    raise exception 'Você já tem avisos ligados em 10 navegadores. Desligue em um deles antes.' using errcode = '22023';
  end if;

  insert into gps.push_inscricoes (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, v_endpoint, v_p256dh, v_auth, v_ua)
  on conflict (endpoint) do update
     set p256dh      = excluded.p256dh,
         auth        = excluded.auth,
         user_agent  = excluded.user_agent,
         revogada_em = null,
         falhas      = 0
   -- Nunca transfere a inscrição de OUTRA pessoa (achado BAIXO do kirad):
   -- dono diferente → o update não acontece (row_count 0) → 22023.
   where gps.push_inscricoes.user_id = excluded.user_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Este navegador já está com avisos ligados para outra pessoa da equipe.' using errcode = '22023';
  end if;
end;
$function$;

-- gps.push_preparar(uuid)  md5 d209e04ef9bfa7229b62bf7c093943f0
CREATE OR REPLACE FUNCTION gps.push_preparar(p_mensagem_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_chamado uuid;
  v_aluno   uuid;
  v_autor   uuid;
  v_nome    text;
  v_insc    jsonb;
begin
  if not gps.push_ativo() then
    return null;
  end if;

  select m.chamado_id, c.aluno_id, m.autor_id
    into v_chamado, v_aluno, v_autor
    from gps.chamado_mensagens m
    join gps.chamados c on c.id = m.chamado_id
   where m.id = p_mensagem_id
     and m.autor_papel = 'aluno';
  if v_chamado is null then
    return null;
  end if;

  -- Nome de quem escreveu (titular ou sócio, molde da …333); senão o do
  -- titular do ambiente; senão 'parceiro'.
  select nullif(btrim(t.nome), '') into v_nome
    from gps.membros mb
    join public.thb_alunos t
      on t.id = coalesce(mb.pessoa_aluno_id, case when mb.papel = 'titular' then mb.aluno_id end)
   where mb.user_id = v_autor and mb.aluno_id = v_aluno
   limit 1;
  if v_nome is null then
    select nullif(btrim(t.nome), '') into v_nome from public.thb_alunos t where t.id = v_aluno;
  end if;
  v_nome := coalesce(nullif(split_part(regexp_replace(coalesce(v_nome, ''), '[[:cntrl:]]', ' ', 'g'), ' ', 1), ''), 'parceiro');
  v_nome := left(v_nome, 60);

  -- Só inscrição viva de quem AINDA é admin ativo: mesma condição de
  -- (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) (baseline), aplicada ao user_id da inscrição.
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', i.endpoint,
                                               'p256dh',   i.p256dh,
                                               'auth',     i.auth)
                            order by i.criado_em), '[]'::jsonb)
    into v_insc
    from gps.push_inscricoes i
    join public.perfis p on p.id = i.user_id
   where i.revogada_em is null
     and p.status = 'ativo'
     and p.cargo in ('dev', 'admin');

  return jsonb_build_object(
    'chamado_id', v_chamado,
    'titulo',     'Nova mensagem no chamado',
    'corpo',      'Chamado de ' || v_nome,
    'url',        '/admin/chamados/' || v_chamado::text,
    'inscricoes', v_insc
  );
end;
$function$;

-- gps.push_vapid_publica()  md5 6a9848800bdb13680140ae583ff6e608
CREATE OR REPLACE FUNCTION gps.push_vapid_publica()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return (select nullif(btrim(c.valor), '') from gps.config c where c.chave = 'push_vapid_publica');
end;
$function$;

-- gps.registrar_mencoes(uuid,uuid[])  md5 ae32719b0034f51f5e8df89001e901dc
CREATE OR REPLACE FUNCTION gps.registrar_mencoes(p_nota_id uuid, p_perfis uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_gravadas jsonb;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_nota_id is null then raise exception 'nota nao informada' using errcode = '22023'; end if;
  if not exists (select 1 from gps.aluno_notas n where n.id = p_nota_id) then
    raise exception 'Nota não encontrada.' using errcode = 'P0002';
  end if;
  with candidatos as (
    select distinct e.perfil_id from unnest(coalesce(p_perfis, array[]::uuid[])) as e(perfil_id) where e.perfil_id is not null
  ),
  validos as (
    select c.perfil_id, p.nome from candidatos c join public.perfis p on p.id = c.perfil_id
     where p.status = 'ativo' and p.cargo in ('dev','admin') order by p.nome, c.perfil_id limit 10
  ),
  gravadas as (
    insert into gps.nota_mencoes (nota_id, perfil_id) select p_nota_id, v.perfil_id from validos v
    on conflict (nota_id, perfil_id) do nothing returning perfil_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('perfil_id', v.perfil_id, 'nome', v.nome) order by v.nome), '[]'::jsonb)
    into v_gravadas from validos v where v.perfil_id in (select perfil_id from gravadas);
  return jsonb_build_object('mencionados', v_gravadas, 'quantidade', jsonb_array_length(v_gravadas));
end $function$;

-- gps.reuniao_cancelar_proposta(uuid)  md5 636288293c3518d67cb36b9702f41f91
CREATE OR REPLACE FUNCTION gps.reuniao_cancelar_proposta(p_proposta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_proposta record;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_proposta_id is null then raise exception 'proposta nao informada' using errcode='22023'; end if;
  select pp.id, pp.cliente_id, pp.aluno_id, pp.estado into v_proposta
    from gps.reuniao_preliminar_propostas pp where pp.id = p_proposta_id;
  if v_proposta.id is null then raise exception 'Proposta não encontrada.' using errcode='P0002'; end if;
  if v_proposta.estado <> 'proposta' then
    raise exception 'Esta proposta já foi respondida ou cancelada.' using errcode='22023'; end if;
  update gps.reuniao_preliminar_propostas set estado='cancelada', resposta_em=now(), resposta_por=auth.uid()
   where id = p_proposta_id;
  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('reuniao_preliminar_cancelada', v_proposta.aluno_id, auth.uid(),
          'proposta_id=' || v_proposta.id::text);
  return jsonb_build_object('proposta_id', p_proposta_id, 'cancelada', true);
end; $function$;

-- gps.reuniao_guardar_status()  md5 9f3d64069f240532aeb215589e8d5f8c
CREATE OR REPLACE FUNCTION gps.reuniao_guardar_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'gps', 'public'
AS $function$
declare
  eh_admin boolean := (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false));
  hoje     date    := (now() at time zone 'America/Sao_Paulo')::date;
  aberto   boolean;
begin
  if tg_op = 'INSERT' then
    if not eh_admin then
      -- Aluno só SOLICITA. Quem responde é a equipe.
      new.status         := 'pendente';
      new.motivo_recusa  := null;
      new.respondido_em  := null;
      new.respondido_por := null;
    end if;
    new.solicitado_em := now();

  else -- UPDATE
    if not eh_admin then
      if new.data is distinct from old.data or new.horario is distinct from old.horario then
        -- Trocou de horário: a decisão anterior da equipe não vale mais.
        new.status         := 'pendente';
        new.motivo_recusa  := null;
        new.respondido_em  := null;
        new.respondido_por := null;
        new.solicitado_em  := now();
      else
        -- Só editou link/pauta: preserva a decisão da equipe, venha o que vier
        -- do cliente.
        new.status         := old.status;
        new.motivo_recusa  := old.motivo_recusa;
        new.respondido_em  := old.respondido_em;
        new.respondido_por := old.respondido_por;
        new.solicitado_em  := old.solicitado_em;
      end if;
    end if;
  end if;

  -- Disponibilidade: vale para o aluno. A equipe pode furar a própria grade
  -- (ela é quem fecha os horários) e encaixar alguém manualmente.
  if not eh_admin then
    if new.data < hoje then
      raise exception 'Essa data já passou. Escolha outra quarta-feira.';
    end if;

    select h.ativo into aberto from gps.reuniao_horarios h where h.horario = new.horario;
    if aberto is not true then
      raise exception 'Este horário não está disponível.';
    end if;

    if exists (
      select 1 from gps.reuniao_bloqueios b
       where b.data = new.data
         and (b.horario is null or b.horario = new.horario)
    ) then
      raise exception 'Este horário não está disponível.';
    end if;
  end if;

  return new;
end;
$function$;

-- gps.reuniao_registrar_evento()  md5 37f31320a8d1b80007fe5544f8de01f2
CREATE OR REPLACE FUNCTION gps.reuniao_registrar_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'gps', 'public'
AS $function$
declare
  eh_admin boolean := (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false));
begin
  if tg_op = 'INSERT' then
    insert into gps.reuniao_eventos (aluno_id, tipo, data, horario, autor, autor_equipe)
    values (new.aluno_id, 'solicitada', new.data, new.horario, auth.uid(), eh_admin);
    if new.status = 'confirmada' then
      insert into gps.reuniao_eventos (aluno_id, tipo, data, horario, autor, autor_equipe)
      values (new.aluno_id, 'confirmada', new.data, new.horario, auth.uid(), eh_admin);
    end if;
    return new;

  elsif tg_op = 'UPDATE' then
    if new.data is distinct from old.data or new.horario is distinct from old.horario then
      insert into gps.reuniao_eventos (aluno_id, tipo, data, horario, autor, autor_equipe)
      values (new.aluno_id, 'remarcada', new.data, new.horario, auth.uid(), eh_admin);
    end if;
    if new.status is distinct from old.status and new.status in ('confirmada', 'recusada') then
      insert into gps.reuniao_eventos (aluno_id, tipo, data, horario, motivo, autor, autor_equipe)
      values (new.aluno_id, new.status, new.data, new.horario, new.motivo_recusa, auth.uid(), eh_admin);
    end if;
    return new;

  else
    insert into gps.reuniao_eventos (aluno_id, tipo, data, horario, autor, autor_equipe)
    values (old.aluno_id, 'cancelada', old.data, old.horario, auth.uid(), eh_admin);
    return old;
  end if;
end;
$function$;

-- gps.selecao_entrevista_definir(uuid,uuid[])  md5 3660eeb82b44d2e99c8e1711d24667de
CREATE OR REPLACE FUNCTION gps.selecao_entrevista_definir(p_aluno_id uuid, p_cliente_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual();
  v_ids uuid[] := coalesce(p_cliente_ids, '{}');
  v_qtd integer; v_achados integer; v_c record;
begin
  if p_aluno_id is null then raise exception 'aluno nao informado' using errcode='22023'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> p_aluno_id) then
    raise exception 'Sem permissão.' using errcode='42501'; end if;
  v_qtd := array_length(v_ids, 1);
  if v_qtd is not null and v_qtd > 5 then
    raise exception 'Selecione no máximo 5 clientes para a entrevista.' using errcode='22023'; end if;
  if v_qtd is not null and v_qtd > 0 then
    select count(*) into v_achados from gps.etapa1_clientes c
     where c.id = any(v_ids) and c.aluno_id = p_aluno_id;
    if v_achados <> v_qtd then
      raise exception 'Um dos clientes selecionados não pertence a este ambiente.' using errcode='42501';
    end if;
  end if;
  for v_c in select c.id, c.nome from gps.etapa1_clientes c
     where c.aluno_id = p_aluno_id and c.id = any(v_ids) and not c.selecionado_entrevista
  loop
    update gps.etapa1_clientes set selecionado_entrevista = true where id = v_c.id;
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (p_aluno_id, now(), 'cliente_selecionado_entrevista', 'cliente', v_c.id,
      left(coalesce(nullif(btrim(v_c.nome),''),'Cliente sem nome'),300), null,
      case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  end loop;
  for v_c in select c.id, c.nome from gps.etapa1_clientes c
     where c.aluno_id = p_aluno_id and c.selecionado_entrevista and not (c.id = any(v_ids))
  loop
    update gps.etapa1_clientes set selecionado_entrevista = false where id = v_c.id;
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (p_aluno_id, now(), 'cliente_removido_entrevista', 'cliente', v_c.id,
      left(coalesce(nullif(btrim(v_c.nome),''),'Cliente sem nome'),300), null,
      case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');
  end loop;
  return jsonb_build_object('aluno_id', p_aluno_id, 'selecionados', v_ids, 'total', coalesce(v_qtd,0));
end $function$;

-- gps.sessao_briefing_ler(uuid)  md5 b3f6dd2c09efade57890ef5ca7a85a67
CREATE OR REPLACE FUNCTION gps.sessao_briefing_ler(p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_a     record;
  v_disc_letra       text;
  v_disc_consciencia text;
  v_disc_gatilhos    text;
  v_disc_relac       text;
  v_disc_em          timestamptz;
  v_disc_por         uuid;
  v_congelado        text;
  v_ep_concluida     timestamptz;
  v_ep_letra         text;
  v_ep_pontos        jsonb;
  v_ep_decisores     smallint;
  v_ep_respostas     jsonb;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;
  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.estado,
         a.inicio_em, a.briefing_snapshot
    into v_a from gps.sessao_agendamentos a where a.id = p_agendamento_id;
  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('sessao_briefing_acessado', v_a.aluno_id, auth.uid(),
          'agendamento_id=' || p_agendamento_id::text);
  select c.perfil_disc, c.disc_consciencia, c.disc_gatilhos,
         c.disc_relacionamento, c.disc_atualizado_em, c.disc_atualizado_por
    into v_disc_letra, v_disc_consciencia, v_disc_gatilhos,
         v_disc_relac, v_disc_em, v_disc_por
    from gps.etapa1_clientes c
   where c.id = v_a.cliente_id;
  v_congelado := v_a.briefing_snapshot #>> '{cliente,perfil_disc}';
  select e.concluida_em, e.perfil_disc, e.disc_pontos, e.decisores_total, e.respostas
    into v_ep_concluida, v_ep_letra, v_ep_pontos, v_ep_decisores, v_ep_respostas
    from gps.entrevista_previa e
   where e.cliente_id = v_a.cliente_id
     and e.concluida_em is not null
   order by e.concluida_em desc
   limit 1;
  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado', v_a.estado,
    'inicio_em', v_a.inicio_em,
    'cliente_id', v_a.cliente_id,
    'briefing', v_a.briefing_snapshot,
    'disc_ao_vivo', jsonb_build_object(
      'letra', v_disc_letra,
      'consciencia', v_disc_consciencia,
      'gatilhos', v_disc_gatilhos,
      'relacionamento', v_disc_relac,
      'atualizado_em', v_disc_em,
      'atualizado_por', v_disc_por,
      'congelado_era', v_congelado,
      'divergiu', (v_disc_letra is distinct from v_congelado)))
    || jsonb_build_object('decisores_ao_vivo', coalesce(
         (select jsonb_agg(jsonb_build_object(
                   'nome', d.nome, 'papel_no_negocio', d.papel_no_negocio,
                   'principal', d.principal)
                 order by d.principal desc, d.criado_em)
            from gps.cliente_decisores d where d.cliente_id = v_a.cliente_id),
         '[]'::jsonb))
    || jsonb_build_object('entrevista_previa_ao_vivo',
         case when v_ep_concluida is null then null::jsonb
              else jsonb_build_object(
                'concluida_em',    v_ep_concluida,
                'perfil_disc',     v_ep_letra,
                'disc_pontos',     v_ep_pontos,
                'decisores_total', v_ep_decisores,
                'respostas',       v_ep_respostas)
         end)
    || jsonb_build_object('links_drive_ao_vivo', coalesce(
         (select jsonb_agg(jsonb_build_object(
                   'nome', l.nome, 'url', l.url,
                   'criado_por_nome', l.criado_por_nome,
                   'origem', l.origem, 'criado_em', l.criado_em)
                 order by l.criado_em)
            from gps.cliente_links_drive l
           where l.cliente_id = v_a.cliente_id
             and l.removido_em is null),
         '[]'::jsonb));
end;
$function$;

-- gps.sessao_cancelar(uuid,text)  md5 1b83ce20bc944f90a3ab657396f9fa1c
CREATE OR REPLACE FUNCTION gps.sessao_cancelar(p_agendamento_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ambiente uuid := gps.aluno_atual();
  v_admin    boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_a        record;
  v_motivo   text;
  v_quem     text;
  v_horas    numeric;
  v_etapa_id smallint;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.tipo_id,
         a.estado, a.data, a.inicio_em
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — nada a cancelar.' using errcode = '22023';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  elsif coalesce(v_ambiente = v_a.aluno_id, false) then
    v_quem := 'aluno';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  if v_quem = 'aluno' then
    v_horas := extract(epoch from (v_a.inicio_em - now())) / 3600.0;
    if v_horas < 24 then
      raise exception 'O prazo para cancelar terminou (é até 24 horas antes). Abra um chamado no Suporte para falar com a equipe.'
        using errcode = '22023';
    end if;
    if v_motivo is null then v_motivo := 'Cancelado pelo aluno.'; end if;
  else
    if v_motivo is null or char_length(v_motivo) < 3 then
      raise exception 'Escreva o motivo do cancelamento (ao menos 3 caracteres).'
        using errcode = '22023';
    end if;
  end if;

  if char_length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  update gps.sessao_agendamentos
     set estado = 'cancelado', cancelado_em = now(),
         cancelado_por = auth.uid(), cancelado_motivo = v_motivo
   where id = p_agendamento_id;

  select t.etapa_id into v_etapa_id from gps.sessao_tipos t where t.id = v_a.tipo_id;

  if v_etapa_id = 2 then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = null
     where id = v_a.cliente_id and data_reuniao_preliminar = v_a.data;
  end if;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_cancelada', auth.uid(),
          jsonb_build_object('por', v_quem, 'de', 'agendado', 'para', 'cancelado',
            'motivo', v_motivo, 'inicio_em', v_a.inicio_em,
            'horas_de_antecedencia', round(extract(epoch from (v_a.inicio_em - now())) / 3600.0, 2)));

  return jsonb_build_object('agendamento_id', p_agendamento_id, 'estado', 'cancelado', 'por', v_quem);
end;
$function$;

-- gps.sessao_concluir(uuid,text,text,text,text,text)  md5 128acd9b671cd57c3a68fdf0486d5d3d
CREATE OR REPLACE FUNCTION gps.sessao_concluir(p_agendamento_id uuid, p_resumo text DEFAULT NULL::text, p_perfil_disc text DEFAULT NULL::text, p_disc_consciencia text DEFAULT NULL::text, p_disc_gatilhos text DEFAULT NULL::text, p_disc_relacionamento text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin  boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_a      record;
  v_resumo text;
  v_quem   text;
  v_letra  text;
  v_cons   text;
  v_gat    text;
  v_rel    text;
  v_disc_gravado boolean := false;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.tipo_id,
         a.estado, a.inicio_em, a.fim_em, a.resumo
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há o que concluir.'
      using errcode = '22023';
  end if;

  if v_a.inicio_em > now() then
    raise exception 'Esta sessão ainda não começou. A conclusão só pode ser registrada depois do horário.'
      using errcode = '22023';
  end if;

  v_resumo := nullif(btrim(coalesce(p_resumo, '')), '');

  if v_resumo is not null then
    if char_length(v_resumo) < 10 then
      raise exception 'O resumo precisa de ao menos 10 caracteres. Se preferir escrever depois, conclua sem resumo e registre em seguida.'
        using errcode = '22023';
    end if;
    if char_length(v_resumo) > 4000 then
      raise exception 'O resumo passa de 4000 caracteres.' using errcode = '22023';
    end if;
  end if;

  -- ── DISC ────────────────────────────────────────────────────────────────
  v_letra := nullif(btrim(upper(coalesce(p_perfil_disc, ''))), '');
  v_cons  := nullif(btrim(coalesce(p_disc_consciencia, '')), '');
  v_gat   := nullif(btrim(coalesce(p_disc_gatilhos, '')), '');
  v_rel   := nullif(btrim(coalesce(p_disc_relacionamento, '')), '');

  -- Catálogo fechado, medido em produção: D 66 · I 39 · S 15 · C 7.
  -- Frase em português na recusa, nunca erro cru de banco.
  if v_letra is not null and v_letra not in ('D', 'I', 'S', 'C') then
    raise exception 'O perfil DISC precisa ser D, I, S ou C.' using errcode = '22023';
  end if;

  -- Os CHECKs da tabela exigem 3..2000 nos três campos ricos. Conferir aqui
  -- devolve a frase certa; deixar chegar no CHECK devolveria erro cru.
  if v_cons is not null and char_length(v_cons) < 3 then
    raise exception 'A anotação de consciência precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;
  if v_gat is not null and char_length(v_gat) < 3 then
    raise exception 'A anotação de gatilhos emocionais precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;
  if v_rel is not null and char_length(v_rel) < 3 then
    raise exception 'A anotação de relacionamento precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;

  if (v_letra is not null or v_cons is not null or v_gat is not null or v_rel is not null)
     and v_a.cliente_id is not null then
    -- 🔴 `coalesce(novo, antigo)`: campo em branco PRESERVA o que existe.
    -- Concluir sem mencionar o DISC nunca apaga o que outra pessoa escreveu.
    update gps.etapa1_clientes c
       set perfil_disc         = coalesce(v_letra, c.perfil_disc),
           disc_consciencia    = coalesce(v_cons,  c.disc_consciencia),
           disc_gatilhos       = coalesce(v_gat,   c.disc_gatilhos),
           disc_relacionamento = coalesce(v_rel,   c.disc_relacionamento),
           disc_atualizado_em  = now(),
           disc_atualizado_por = auth.uid()
     where c.id = v_a.cliente_id;
    v_disc_gravado := true;
  end if;

  update gps.sessao_agendamentos
     set estado     = 'realizado',
         resumo     = v_resumo,
         resumo_em  = case when v_resumo is null then null else now() end,
         resumo_por = case when v_resumo is null then null else auth.uid() end
   where id = p_agendamento_id;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_realizada', auth.uid(),
          jsonb_build_object('por', v_quem, 'de', 'agendado', 'para', 'realizado',
            'com_resumo', (v_resumo is not null),
            'resumo_caracteres', coalesce(char_length(v_resumo), 0),
            -- 🔴 A TRILHA REGISTRA QUE O DISC MUDOU, NUNCA O CONTEÚDO:
            -- consciência/gatilhos/relacionamento são texto livre sobre um
            -- terceiro (o cliente do parceiro). Mesma fronteira LGPD da …292.
            'disc_gravado', v_disc_gravado,
            'inicio_em', v_a.inicio_em));

  return jsonb_build_object('agendamento_id', p_agendamento_id, 'estado', 'realizado',
    'por', v_quem, 'com_resumo', (v_resumo is not null),
    'resumo_caracteres', coalesce(char_length(v_resumo), 0),
    'disc_gravado', v_disc_gravado);
end;
$function$;

-- gps.sessao_link_definir(uuid,text)  md5 36057146be63fe3c88dd6c1a25fb211d
CREATE OR REPLACE FUNCTION gps.sessao_link_definir(p_agendamento_id uuid, p_link text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual();
  v_a record; v_link text; v_quem text; v_equipe boolean;
  v_dom_de text; v_dom_para text;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;
  if v_uid is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.estado,
         a.link_reuniao, a.link_definido_por, a.link_em, a.link_por_equipe
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';  v_equipe := true;
  elsif coalesce(v_a.responsavel_id = v_uid, false) then
    v_quem := 'responsavel';  v_equipe := true;
  elsif coalesce(v_ambiente = v_a.aluno_id, false) then
    v_quem := 'aluno';  v_equipe := false;
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há sala para definir.'
      using errcode = '22023';
  end if;

  -- 🔴 FALHA FECHADO: `coalesce(link_por_equipe, TRUE)`. Link que existe com
  -- papel NULO (gravado fora das RPCs) conta como DA EQUIPE. Antes era
  -- `false`, e o parceiro sobrescrevia — confirmado por exploração.
  if coalesce(v_a.link_reuniao is not null
              and coalesce(v_a.link_por_equipe, true)
              and not v_equipe, false) then
    raise exception 'A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.'
      using errcode = '22023';
  end if;

  v_link := nullif(btrim(coalesce(p_link, '')), '');
  if v_link is null then
    raise exception 'Cole o link da sala.' using errcode = '22023';
  end if;
  if v_link ~ '[[:cntrl:]]' then
    raise exception 'O link não pode conter quebra de linha. Cole a URL numa linha só.'
      using errcode = '22023';
  end if;
  if char_length(v_link) > 500 then
    raise exception 'O link passa de 500 caracteres.' using errcode = '22023';
  end if;
  if v_link ~ '["''<>`[:space:]]' then  -- 330 link chars
    raise exception 'O link não pode ter espaço, aspas, crase nem os sinais < e >. Copie de novo o endereço da sala.'
      using errcode = '22023';
  end if;

  if v_link !~ '^https://' then
    raise exception 'O link precisa começar com https://' using errcode = '22023';
  end if;

  if v_a.link_reuniao is not distinct from v_link then
    return jsonb_build_object('agendamento_id', v_a.id, 'alterado', false,
      'por', v_quem, 'por_equipe', v_equipe);
  end if;

  update gps.sessao_agendamentos
     set link_reuniao = v_link, link_definido_por = v_uid,
         link_em = now(), link_por_equipe = v_equipe
   where id = p_agendamento_id;

  v_dom_de   := gps.sessao_link_dominio(v_a.link_reuniao);
  v_dom_para := gps.sessao_link_dominio(v_link);

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_link_definido', v_uid,
          jsonb_build_object('por', v_quem, 'por_equipe', v_equipe,
            'dominio_de', v_dom_de, 'dominio_para', v_dom_para,
            'sobrescreveu', (v_a.link_reuniao is not null),
            'anterior_da_equipe', v_a.link_por_equipe,
            'tamanho', char_length(v_link)));

  return jsonb_build_object('agendamento_id', v_a.id, 'alterado', true,
    'por', v_quem, 'por_equipe', v_equipe, 'dominio', v_dom_para);
end;
$function$;

-- gps.sessao_link_remover(uuid)  md5 2c6bb6c322ebaf31576bb3daf589ef0c
CREATE OR REPLACE FUNCTION gps.sessao_link_remover(p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_ambiente uuid := gps.aluno_atual();
  v_a record; v_quem text; v_equipe boolean;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;
  if v_uid is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.estado,
         a.link_reuniao, a.link_definido_por, a.link_em, a.link_por_equipe
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';  v_equipe := true;
  elsif coalesce(v_a.responsavel_id = v_uid, false) then
    v_quem := 'responsavel';  v_equipe := true;
  elsif coalesce(v_ambiente = v_a.aluno_id, false) then
    v_quem := 'aluno';  v_equipe := false;
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.link_reuniao is null then
    raise exception 'Esta sessão não tem link para remover.' using errcode = '22023';
  end if;

  -- Mesma correção: papel nulo conta como da equipe (falha fechado).
  if coalesce(coalesce(v_a.link_por_equipe, true) and not v_equipe, false) then
    raise exception 'A equipe já definiu o link desta sessão. Se estiver errado, fale pelo Suporte.'
      using errcode = '22023';
  end if;

  update gps.sessao_agendamentos
     set link_reuniao = null, link_definido_por = null,
         link_em = null, link_por_equipe = null
   where id = p_agendamento_id;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_link_removido', v_uid,
          jsonb_build_object('por', v_quem, 'por_equipe', v_equipe,
            'dominio_removido', gps.sessao_link_dominio(v_a.link_reuniao),
            'anterior_da_equipe', v_a.link_por_equipe));

  return jsonb_build_object('agendamento_id', v_a.id, 'alterado', true, 'por', v_quem);
end;
$function$;

-- gps.sessao_marcar_falta(uuid,text)  md5 f3466d6ffd61a9d33c82e70ce98d1e1f
CREATE OR REPLACE FUNCTION gps.sessao_marcar_falta(p_agendamento_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_a record; v_obs text; v_quem text;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.responsavel_id, a.estado, a.inicio_em, a.fim_em
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há falta a registrar.' using errcode = '22023';
  end if;
  if v_a.inicio_em > now() then
    raise exception 'Esta sessão ainda não começou. A falta só pode ser registrada depois do horário.'
      using errcode = '22023';
  end if;

  v_obs := nullif(btrim(coalesce(p_observacao, '')), '');
  if v_obs is not null and char_length(v_obs) > 300 then
    raise exception 'A observação passa de 300 caracteres.' using errcode = '22023';
  end if;

  update gps.sessao_agendamentos set estado = 'falta' where id = p_agendamento_id;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_falta', auth.uid(),
          jsonb_build_object('por', v_quem, 'de', 'agendado', 'para', 'falta',
            'observacao', v_obs, 'inicio_em', v_a.inicio_em));

  return jsonb_build_object('agendamento_id', p_agendamento_id, 'estado', 'falta', 'por', v_quem);
end;
$function$;

-- gps.sessao_pode_agendar(uuid,smallint)  md5 085f7692b78504bc0c7be95c281f35ad
CREATE OR REPLACE FUNCTION gps.sessao_pode_agendar(p_aluno_id uuid, p_tipo_id smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_etapa_id    smallint;
  v_exige_conf  boolean;
  v_cliente_id  uuid;
  v_liberada    boolean;
begin
  if not coalesce(
       (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false))
       or p_aluno_id = gps.aluno_atual()
       or gps.eh_equipe(),
       false)
  then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_aluno_id is null or p_tipo_id is null then
    return null;
  end if;

  select t.etapa_id into v_etapa_id
    from gps.sessao_tipos t
   where t.id = p_tipo_id and t.ativo;

  if not found then
    return null;
  end if;

  v_exige_conf := coalesce(
    (select c.valor from gps.config c where c.chave = 'sessoes_exige_confirmacao') = 'true',
    false);

  select c.id into v_cliente_id
    from gps.etapa1_clientes c
   where c.aluno_id = p_aluno_id
     and c.acompanhado_equipe
     and (not v_exige_conf or c.acompanhamento_confirmado_em is not null)
   limit 1;

  if v_cliente_id is null then
    return null;
  end if;

  if v_etapa_id is not null then
    select gps.etapa_liberada_para(p_aluno_id, v_etapa_id) into v_liberada;
    if not coalesce(v_liberada, false) then
      return null;
    end if;
  end if;

  return v_cliente_id;
end;
$function$;

-- gps.sessao_remarcar(uuid,date,time without time zone,text)  md5 c6c979cce9af5612a534738b8df1aa4b
CREATE OR REPLACE FUNCTION gps.sessao_remarcar(p_sessao_id uuid, p_data date, p_hora time without time zone, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_a          record;
  v_motivo     text;
  v_inicio     timestamptz;
  v_fim        timestamptz;
  v_ok         boolean;
  v_constraint text;
  v_etapa_id   smallint;
  v_escreveu   boolean := false;
begin
  -- 🔴 Guarda PRÓPRIA, na entrada, coalesce = falha FECHADA (achado ALTO de
  -- 22/09: `if null then raise` não dispara).
  if auth.uid() is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_sessao_id is null or p_data is null or p_hora is null then
    raise exception 'Escolha o novo horário para continuar.' using errcode = '22023';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Escreva o motivo da remarcação (ao menos 3 caracteres).'
      using errcode = '22023';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- Quem remarca: admin ou a DONA da sessão — o mesmo recorte do cancelar
  -- (nunca gps.eh_equipe(): operador da esteira não mexe na agenda da dra).
  -- 🔴 Autoriza ANTES do lock e com o MESMO erro para "não existe" e "não é
  -- sua" (kirad 01/10): senão o P0002 × 42501 revela ids de sessões alheias e
  -- o `for update` trava a linha de outra pessoa antes da recusa.
  if not (coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false)
          or exists (select 1 from gps.sessao_agendamentos a
                      where a.id = p_sessao_id
                        and a.responsavel_id = auth.uid())) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔴 `for update`: duas remarcações (ou remarcação × cancelamento)
  -- simultâneas não podem as duas passar pela checagem de estado.
  select a.id, a.tipo_id, a.responsavel_id, a.cliente_id, a.estado,
         a.data, a.hora_inicio, a.inicio_em, a.duracao_min
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_sessao_id
   for update;

  if v_a.id is null then
    -- só admin chega aqui com id inexistente
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;
  -- 🔴 Teto contra rajada de e-mail (kirad 01/10): cada remarcação zera os
  -- carimbos e o cron avisa o aluno de novo. 3 por sessão em 24 h. Contado na
  -- trilha (sem índice em agendamento_id: só roda ao remarcar, tabela pequena;
  -- explain na saída do ensaio).
  if (select count(*) from gps.sessao_eventos e
       where e.agendamento_id = p_sessao_id
         and e.acao = 'sessao_remarcada'
         and e.criado_em >= now() - interval '24 hours') >= 3 then
    raise exception 'Esta sessão já foi remarcada 3 vezes nas últimas 24 horas. Fale com o aluno antes de mudar de novo.'
      using errcode = 'P0001';
  end if;
  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há o que remarcar.'
      using errcode = '22023';
  end if;
  -- 🔴 Contra inicio_em, nunca contra `data` (servidor em UTC).
  if v_a.inicio_em <= now() then
    raise exception 'Esta sessão já começou. Só uma sessão futura pode ser remarcada.'
      using errcode = '22023';
  end if;

  -- Instantes do bloco novo: MESMA ordem das colunas geradas (soma no
  -- timestamp local, converte depois) e a MESMA duração congelada da linha.
  v_inicio := ((p_data + p_hora) at time zone 'America/Sao_Paulo');
  v_fim    := (((p_data + p_hora) + make_interval(mins => v_a.duracao_min))
                 at time zone 'America/Sao_Paulo');

  if v_inicio <= now() then
    raise exception 'Esse horário já passou. Escolha outro.' using errcode = '22023';
  end if;
  if v_inicio = v_a.inicio_em then
    raise exception 'A sessão já está marcada nesse horário.' using errcode = '22023';
  end if;

  -- A GRADE do mesmo responsável, livre e sem bloqueio — a função da tela.
  select exists (
    select 1
      from gps.sessao_horarios_livres(v_a.tipo_id, v_a.responsavel_id, p_data, p_data) h
     where h.inicio_em = v_inicio
       and h.responsavel_id = v_a.responsavel_id
  ) into v_ok;

  if not v_ok then
    raise exception 'Esse horário não está na agenda livre desta profissional. Escolha outro na lista.'
      using errcode = '22023';
  end if;

  begin
    update gps.sessao_agendamentos
       set data                     = p_data,
           hora_inicio              = p_hora,
           remarcado_de             = v_a.inicio_em,
           remarcado_motivo         = v_motivo,
           remarcado_em             = now(),
           email_24h_dra_em         = null, email_24h_dra_req        = null,
           email_24h_aluno_em       = null, email_24h_aluno_req      = null,
           email_1h_dra_em          = null, email_1h_dra_req         = null,
           email_1h_aluno_em        = null, email_1h_aluno_req       = null,
           email_remarcou_aluno_em  = null, email_remarcou_aluno_req = null
     where id = p_sessao_id;
  exception
    when unique_violation then          -- 23505
      -- Por CONSTRAINT_NAME, não por sqlerrm (texto muda com locale/versão).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sessao_slot_unico' then
        raise exception 'Alguém acabou de pegar esse horário. Escolha outro na lista.'
          using errcode = '23505';
      else
        raise exception 'Este aluno já tem outra sessão deste tipo marcada.'
          using errcode = '23505';
      end if;
    when exclusion_violation then       -- 23P01
      raise exception 'Esse horário conflita com outra sessão da mesma profissional. Escolha outro na lista.'
        using errcode = '23P01';
  end;

  -- §9-ter B1 — a coluna-resultado acompanha, CONDICIONAL como no cancelar:
  -- só reescreve se ainda guarda a data DESTA sessão, e só para o tipo cuja
  -- etapa é a da Reunião Preliminar (2), lida do catálogo.
  select t.etapa_id into v_etapa_id from gps.sessao_tipos t where t.id = v_a.tipo_id;
  if v_etapa_id = 2 and p_data <> v_a.data then
    update gps.etapa1_clientes
       set data_reuniao_preliminar = p_data
     where id = v_a.cliente_id
       and data_reuniao_preliminar = v_a.data;
    v_escreveu := found;
  end if;

  -- TRILHA. LGPD: identificadores, os dois horários e o motivo (o mesmo
  -- critério do evento sessao_cancelada). Nada de briefing.
  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_sessao_id, 'sessao_remarcada', auth.uid(),
          jsonb_build_object(
            'por', 'equipe',
            'de_inicio_em', v_a.inicio_em,
            'para_inicio_em', v_inicio,
            'motivo', v_motivo,
            'horas_de_antecedencia', round(extract(epoch from (v_a.inicio_em - now())) / 3600.0, 2),
            'escreveu_data_reuniao_preliminar', v_escreveu));

  return jsonb_build_object(
    'agendamento_id', p_sessao_id,
    'estado', 'agendado',
    'inicio_em', v_inicio,
    'fim_em', v_fim,
    'remarcado_de', v_a.inicio_em);
end;
$function$;

-- gps.sessao_resumo_editar(uuid,text)  md5 9958e197f91adf4820cd4a43a19d597e
CREATE OR REPLACE FUNCTION gps.sessao_resumo_editar(p_agendamento_id uuid, p_resumo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin  boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_a      record;
  v_resumo text;
  v_quem   text;
  v_antes  int;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id,
         a.estado, a.inicio_em, a.resumo, a.resumo_em
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'realizado' then
    raise exception 'O resumo só existe em sessão concluída. Conclua a sessão primeiro.'
      using errcode = '22023';
  end if;

  v_resumo := nullif(btrim(coalesce(p_resumo, '')), '');

  if v_resumo is null then
    raise exception 'Escreva o resumo (ao menos 10 caracteres). Para corrigir, reescreva o texto — o resumo não pode ser apagado.'
      using errcode = '22023';
  end if;
  if char_length(v_resumo) < 10 then
    raise exception 'O resumo precisa de ao menos 10 caracteres.' using errcode = '22023';
  end if;
  if char_length(v_resumo) > 4000 then
    raise exception 'O resumo passa de 4000 caracteres.' using errcode = '22023';
  end if;

  v_antes := coalesce(char_length(btrim(coalesce(v_a.resumo, ''))), 0);

  update gps.sessao_agendamentos
     set resumo = v_resumo, resumo_em = now(), resumo_por = auth.uid()
   where id = p_agendamento_id;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_resumo_editado', auth.uid(),
          jsonb_build_object('por', v_quem, 'primeira_escrita', (v_antes = 0),
            'resumo_caracteres_antes', v_antes,
            'resumo_caracteres_depois', char_length(v_resumo),
            'inicio_em', v_a.inicio_em));

  return jsonb_build_object('agendamento_id', p_agendamento_id, 'estado', 'realizado',
    'por', v_quem, 'primeira_escrita', (v_antes = 0),
    'resumo_caracteres', char_length(v_resumo));
end;
$function$;

-- gps.sessao_resumo_ler(uuid)  md5 0e68d4d7a23c08a752fc522b310ea477
CREATE OR REPLACE FUNCTION gps.sessao_resumo_ler(p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false);
  v_a     record;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.estado,
         a.resumo, a.resumo_em, a.resumo_por
    into v_a from gps.sessao_agendamentos a where a.id = p_agendamento_id;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- MESMA guarda de sessao_concluir/sessao_resumo_editar: admin ou a doutora
  -- DONA. O aluno NÃO entra -- ele vê QUE houve resumo (resumo_em está no
  -- grant), nunca o texto.
  -- 🔴 coalesce(..., false): nulo em guarda LIBERA. Terceira vez nesta feature.
  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado', v_a.estado,
    'resumo', v_a.resumo,
    'resumo_em', v_a.resumo_em,
    'resumo_por', v_a.resumo_por);
end;
$function$;

-- gps.socio_convite_revogar(uuid)  md5 f8d17d6b7b2768eba9a3feadb71ae6c6
CREATE OR REPLACE FUNCTION gps.socio_convite_revogar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_convite record;
begin
  select * into v_convite from gps.socio_convites where id = p_id;
  if not found then
    raise exception 'Convite não encontrado.' using errcode = 'P0002';
  end if;

  if not (
    (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false))
    or exists (
      select 1 from gps.membros
       where aluno_id = v_convite.ambiente_aluno_id
         and user_id = auth.uid()
         and papel = 'titular'
    )
  ) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_convite.status <> 'pendente' then
    raise exception 'Este convite já não está mais pendente.' using errcode = '22023';
  end if;

  update gps.socio_convites set status = 'revogado' where id = p_id;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_convite_revogado', v_convite.ambiente_aluno_id, null, v_convite.email_alvo,
          'convite ' || p_id::text, auth.uid());

  return jsonb_build_object('id', p_id, 'status', 'revogado');
end;
$function$;

-- gps.tutorial_excluir(uuid)  md5 f5a641d74e0ffeb48269a92e5f1c0dff
CREATE OR REPLACE FUNCTION gps.tutorial_excluir(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Ação restrita à equipe.' using errcode = '42501';
  end if;
  delete from gps.tutoriais where id = p_id returning id into v_id;
  if v_id is null then
    raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
  end if;
end;
$function$;

-- gps.tutorial_publicar(uuid,boolean)  md5 29c5217db3d265634e5ff706f4d02786
CREATE OR REPLACE FUNCTION gps.tutorial_publicar(p_id uuid, p_publicado boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Ação restrita à equipe.' using errcode = '42501';
  end if;
  update gps.tutoriais
     set publicado = coalesce(p_publicado, false), atualizado_por = auth.uid()
   where id = p_id
  returning id into v_id;
  if v_id is null then
    raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
  end if;
end;
$function$;

-- gps.tutorial_salvar(uuid,text,text,text,text,jsonb,integer)  md5 e1347e97eb53601999901323e64dfbcd
CREATE OR REPLACE FUNCTION gps.tutorial_salvar(p_id uuid, p_titulo text, p_resumo text, p_secao text, p_youtube_id text, p_passos jsonb, p_ordem integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_resumo text := nullif(btrim(coalesce(p_resumo, '')), '');
  v_yt     text := nullif(btrim(coalesce(p_youtube_id, '')), '');
  v_id     uuid;
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Ação restrita à equipe.' using errcode = '42501';
  end if;
  if length(v_titulo) < 3 or length(v_titulo) > 200 then
    raise exception 'O título precisa ter entre 3 e 200 caracteres.' using errcode = '22023';
  end if;
  if v_resumo is not null and length(v_resumo) > 500 then
    raise exception 'O resumo passa de 500 caracteres.' using errcode = '22023';
  end if;
  if p_secao not in ('primeiros_passos', 'clientes', 'pasta', 'materiais',
                      'suporte', 'equipe', 'etapas', 'conta') then
    raise exception 'Seção não encontrada.' using errcode = '22023';
  end if;
  if v_yt is not null and v_yt !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'O link do vídeo não é um endereço válido do YouTube.' using errcode = '22023';
  end if;
  if not gps.tutorial_passos_validos(coalesce(p_passos, '[]'::jsonb)) then
    raise exception 'O passo a passo está fora do formato aceito (até 30 passos, cada um com 1 a 500 caracteres).' using errcode = '22023';
  end if;
  if v_yt is null and coalesce(jsonb_array_length(p_passos), 0) = 0 then
    raise exception 'O tutorial precisa de um vídeo ou de ao menos um passo.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into gps.tutoriais (titulo, resumo, secao, youtube_id, passos, ordem, criado_por, atualizado_por)
    values (v_titulo, v_resumo, p_secao, v_yt, coalesce(p_passos, '[]'::jsonb), coalesce(p_ordem, 0), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update gps.tutoriais
       set titulo         = v_titulo,
           resumo         = v_resumo,
           secao          = p_secao,
           youtube_id     = v_yt,
           passos         = coalesce(p_passos, '[]'::jsonb),
           ordem          = coalesce(p_ordem, 0),
           atualizado_por = auth.uid()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$function$;

-- gps.video_excluir(uuid)  md5 2055c3b30248160b2fbfd9fb465d4012
CREATE OR REPLACE FUNCTION gps.video_excluir(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n integer;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  delete from gps.videos where id = p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
  end if;
end;
$function$;

-- gps.video_publicar(uuid,boolean)  md5 fc5f5c61c090b45277578394ffebfec4
CREATE OR REPLACE FUNCTION gps.video_publicar(p_id uuid, p_publicado boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ok uuid;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  update gps.videos
     set publicado = coalesce(p_publicado, false), atualizado_por = auth.uid()
   where id = p_id
  returning id into v_ok;
  if v_ok is null then
    raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
  end if;
  return coalesce(p_publicado, false);
end;
$function$;

-- gps.video_salvar(uuid,text,text,text,smallint,integer)  md5 112fc05f1cdeb7e02f4e45f58a47908f
CREATE OR REPLACE FUNCTION gps.video_salvar(p_id uuid, p_titulo text, p_youtube_id text, p_descricao text DEFAULT NULL::text, p_etapa smallint DEFAULT NULL::smallint, p_ordem integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text; v_yt text; v_id uuid;
begin
  if not coalesce((public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_titulo := btrim(coalesce(p_titulo, ''));
  if length(v_titulo) < 3 or length(v_titulo) > 200 then
    raise exception 'O título precisa ter de 3 a 200 caracteres.' using errcode = '22023';
  end if;

  v_yt := btrim(coalesce(p_youtube_id, ''));
  if v_yt !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Informe o ID do vídeo do YouTube (11 caracteres) — cole o link que o sistema extrai o ID sozinho.' using errcode = '22023';
  end if;

  if p_descricao is not null and length(p_descricao) > 2000 then
    raise exception 'A descrição passa de 2.000 caracteres.' using errcode = '22023';
  end if;

  if p_etapa is not null and not exists (select 1 from gps.etapas e where e.id = p_etapa) then
    raise exception 'Etapa não encontrada.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into gps.videos (titulo, youtube_id, descricao, etapa, ordem, criado_por, atualizado_por)
    values (v_titulo, v_yt, nullif(btrim(coalesce(p_descricao, '')), ''), p_etapa, coalesce(p_ordem, 0), auth.uid(), auth.uid())
    returning id into v_id;
  else
    update gps.videos
       set titulo = v_titulo, youtube_id = v_yt,
           descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
           etapa = p_etapa, ordem = coalesce(p_ordem, 0),
           atualizado_por = auth.uid()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$function$;

-- gps.videos_do_aluno_admin(uuid,smallint)  md5 0104cf59df7056edfb4b5d0584789f1f
CREATE OR REPLACE FUNCTION gps.videos_do_aluno_admin(p_aluno_id uuid, p_etapa smallint DEFAULT NULL::smallint)
 RETURNS TABLE(id uuid, titulo text, descricao text, youtube_id text, etapa smallint, ordem integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not (public.gp_is_admin() or coalesce(public.gp_acesso_pode_editar('educacional', null), false)) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_aluno_id is null then
    raise exception 'Informe o ambiente do parceiro.' using errcode = '22023';
  end if;

  if not gps.videos_ativo() then
    return;
  end if;

  return query
    select v.id, v.titulo, v.descricao, v.youtube_id, v.etapa, v.ordem
      from gps.videos v
     where v.publicado = true
       and (p_etapa is null or v.etapa is null or v.etapa = p_etapa)
       and (
         v.etapa is null
         or coalesce(
              (select o.liberada from gps.etapa_liberacao_aluno o
                where o.aluno_id = p_aluno_id and o.etapa = v.etapa),
              (select e.liberada from gps.etapas e where e.id = v.etapa),
              false
            )
       )
     order by v.etapa nulls first, v.ordem, v.criado_em;
end;
$function$;

