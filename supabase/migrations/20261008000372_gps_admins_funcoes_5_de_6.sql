-- ═══════════════════════════════════════════════════════════════════════════
-- 372 — ADMIN DO GPS SEPARADO (3/5): funções, parte 5 de 6
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
-- FUNÇÕES DESTA PARTE (30):
--   gps.drive_pasta_registrar(uuid,text,text,text,boolean)
--   gps.drive_pendencias()
--   gps.drive_provisionar_parceiro(uuid) [tinha gp_acesso_pode_editar]
--   gps.drive_tarefa_pegar(integer)
--   gps.email_e_de_equipe(text)
--   gps.entrevista_previa_pode(uuid) [tinha gp_acesso_pode_editar]
--   gps.etapa1_clientes_acompanhamento_travado() [tinha gp_acesso_pode_editar]
--   gps.etapa1_clientes_contrato_travado() [tinha gp_acesso_pode_editar]
--   gps.etapa1_clientes_entrevista_travada() [tinha gp_acesso_pode_editar]
--   gps.etapa_liberada_para(uuid,smallint) [tinha gp_acesso_pode_editar]
--   gps.financeiro_candidatos_do_aluno(uuid) [tinha gp_acesso_pode_editar]
--   gps.financeiro_pode_ler(uuid) [tinha gp_acesso_pode_editar]
--   gps.membros_aluno_papel_congelados() [tinha gp_acesso_pode_editar]
--   gps.minuta_registrar_parecer(uuid,text,text) [tinha gp_acesso_pode_editar]
--   gps.operador_definir(uuid,boolean,text) [tinha gp_acesso_pode_editar]
--   gps.pasta_drive_definir(uuid,text,text) [tinha gp_acesso_pode_editar]
--   gps.pode_anexar_croqui(text) [tinha gp_acesso_pode_editar]
--   gps.pode_anexar_minuta(text) [tinha gp_acesso_pode_editar]
--   gps.pode_ver_anexo_chamado(text) [tinha gp_acesso_pode_editar]
--   gps.pode_ver_anexo_onboarding(text) [tinha gp_acesso_pode_editar]
--   gps.pode_ver_chamado(uuid) [tinha gp_acesso_pode_editar]
--   gps.pode_ver_croqui(text) [tinha gp_acesso_pode_editar]
--   gps.pode_ver_minuta(text) [tinha gp_acesso_pode_editar]
--   gps.push_desinscrever(text) [tinha gp_acesso_pode_editar]
--   gps.push_inscrever(text,text,text,text) [tinha gp_acesso_pode_editar]
--   gps.push_preparar(uuid) [tinha gp_acesso_pode_editar]
--   gps.push_vapid_publica() [tinha gp_acesso_pode_editar]
--   gps.registrar_mencoes(uuid,uuid[]) [tinha gp_acesso_pode_editar]
--   gps.reuniao_cancelar_proposta(uuid) [tinha gp_acesso_pode_editar]
--   gps.reuniao_guardar_status() [tinha gp_acesso_pode_editar]
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
        ('gps.drive_pasta_registrar(uuid,text,text,text,boolean)', '55df484279a50e4ca33bb63a38bd6b98'),
        ('gps.drive_pendencias()', '8c2d73dd3c65a56ee7a9cd7bf673c515'),
        ('gps.drive_provisionar_parceiro(uuid)', '39becd3d12b64396f059255dc42417f3'),
        ('gps.drive_tarefa_pegar(integer)', 'abe1905165be131bedf59fb953f5ec18'),
        ('gps.email_e_de_equipe(text)', 'f8641f9eaffa30a2323583758d514960'),
        ('gps.entrevista_previa_pode(uuid)', '742818ac86c7568123fd9cd5f3ed4529'),
        ('gps.etapa1_clientes_acompanhamento_travado()', '6790f80794338cfdf2b4c3b14fe16d36'),
        ('gps.etapa1_clientes_contrato_travado()', 'd3102a85a84961313b793bd54569fa0d'),
        ('gps.etapa1_clientes_entrevista_travada()', 'c55d5f9b303cc1bd2930ee30e2c388eb'),
        ('gps.etapa_liberada_para(uuid,smallint)', '5abb6332fa1adcce628ad95ba3d2ecef'),
        ('gps.financeiro_candidatos_do_aluno(uuid)', 'fe1311e6034f94ebe72913c40e70b37c'),
        ('gps.financeiro_pode_ler(uuid)', '48ce77530f0365a24b047901f44ca597'),
        ('gps.membros_aluno_papel_congelados()', 'a82ac00498d3b8378cc5af47548e4a4f'),
        ('gps.minuta_registrar_parecer(uuid,text,text)', '78b4989192542b3b1befe5072a0d3a29'),
        ('gps.operador_definir(uuid,boolean,text)', 'bedc0651c921295d24d987ca9d24d1c7'),
        ('gps.pasta_drive_definir(uuid,text,text)', '0a3e7111e903207020337898e57780ad'),
        ('gps.pode_anexar_croqui(text)', '3ccbf73b16faab1dd0bfab34c33ce658'),
        ('gps.pode_anexar_minuta(text)', '61b467732d33e51d90440f6abc29cba9'),
        ('gps.pode_ver_anexo_chamado(text)', 'fa43d8a28e5de3ff717f982b8018b491'),
        ('gps.pode_ver_anexo_onboarding(text)', 'c34a00385bf07dbca2b328f7546d096b'),
        ('gps.pode_ver_chamado(uuid)', 'bd33cfe86b0f31bdfabb85e7997b2cae'),
        ('gps.pode_ver_croqui(text)', 'ce14c44a0c7f2dc56471d57902d1a344'),
        ('gps.pode_ver_minuta(text)', '2455e75795557f8d2022d7554cf75478'),
        ('gps.push_desinscrever(text)', '698b2e527ceb5f967c889224e963109a'),
        ('gps.push_inscrever(text,text,text,text)', '4c7da81eb2615f1aa5dce07726183438'),
        ('gps.push_preparar(uuid)', 'd209e04ef9bfa7229b62bf7c093943f0'),
        ('gps.push_vapid_publica()', '6a9848800bdb13680140ae583ff6e608'),
        ('gps.registrar_mencoes(uuid,uuid[])', 'ae32719b0034f51f5e8df89001e901dc'),
        ('gps.reuniao_cancelar_proposta(uuid)', '636288293c3518d67cb36b9702f41f91'),
        ('gps.reuniao_guardar_status()', '9f3d64069f240532aeb215589e8d5f8c')
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
    raise exception '%: corpo vivo difere do retrato de 08/10 — regenerar a migração: %', '20261008000372', array_to_string(v_ruins, '; ');
  end if;
end
$guarda$;

-- gps.drive_pasta_registrar(uuid,text,text,text,boolean)
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
         or not exists (select 1 from gps.admins a  -- 20261008000368: pedido de admin do GPS
                         where a.user_id = v_t.solicitado_por and a.ativo) then
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

-- gps.drive_pendencias()
CREATE OR REPLACE FUNCTION gps.drive_pendencias()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_res jsonb;
begin
  if not gps.eh_admin() then
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

-- gps.drive_provisionar_parceiro(uuid)
CREATE OR REPLACE FUNCTION gps.drive_provisionar_parceiro(p_aluno_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid    := auth.uid();
  v_admin  boolean := coalesce(gps.eh_admin(), false);
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

-- gps.drive_tarefa_pegar(integer)
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
      -- (admin ativo do GPS em gps.admins, 20261008000368, aplicado a quem pediu).
      'pasta_drive_origem', amb.pasta_drive_origem,
      'solicitado_por_admin', exists (select 1 from gps.admins a
                                       where a.user_id = t.solicitado_por and a.ativo),
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

-- gps.email_e_de_equipe(text)
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
                  and w.role in ('admin','dev','editor'))
    -- 20261008000368: admin do GPS também é equipe (coluna crua = valor normalizado, índice parcial)
    or exists (select 1 from gps.admins a join auth.users u on u.id = a.user_id, e
                where a.ativo and u.email = e.email and u.is_sso_user = false);
$function$;

-- gps.entrevista_previa_pode(uuid)
CREATE OR REPLACE FUNCTION gps.entrevista_previa_pode(p_cliente_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Curto-circuito: admin não paga `aluno_atual()`.
  if coalesce(gps.eh_admin(), false) then
    return true;
  end if;
  return coalesce(
    exists (select 1 from gps.etapa1_clientes c
             where c.id = p_cliente_id and c.aluno_id = gps.aluno_atual()),
    false);
end $function$;

-- gps.etapa1_clientes_acompanhamento_travado()
CREATE OR REPLACE FUNCTION gps.etapa1_clientes_acompanhamento_travado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Admin passa por tudo: é ele quem troca a pedido de um chamado.
  -- `coalesce(..., false)`: sem sessão gps.eh_admin() é NULL e a guarda
  -- falharia ABERTA.
  if coalesce(gps.eh_admin(), false) then
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

-- gps.etapa1_clientes_contrato_travado()
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
  if coalesce(gps.eh_admin(), false) or current_user = 'postgres' then return new; end if;
  raise exception 'O contrato do cliente é anexado pelo próprio portal — este campo não pode ser escrito direto.' using errcode = '42501';
end;
$function$;

-- gps.etapa1_clientes_entrevista_travada()
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

  if coalesce(gps.eh_admin(), false)
     or coalesce(gps.eh_equipe(), false)
     or current_user = 'postgres' then
    return new;
  end if;

  raise exception 'A entrevista prévia é registrada pela equipe — estes campos não podem ser escritos direto.'
    using errcode = '42501';
end;
$function$;

-- gps.etapa_liberada_para(uuid,smallint)
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
  if not (gps.eh_admin() or p_aluno_id = gps.aluno_atual()) then
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

-- gps.financeiro_candidatos_do_aluno(uuid)
CREATE OR REPLACE FUNCTION gps.financeiro_candidatos_do_aluno(p_aluno_id uuid)
 RETURNS TABLE(contato_hm_id text, produto text, plano text, turma text, valor_total numeric, criado_em timestamp with time zone, casou_por text, email text, documento_final text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_email text; v_doc text;
begin
  if not gps.eh_admin() then
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

-- gps.financeiro_pode_ler(uuid)
CREATE OR REPLACE FUNCTION gps.financeiro_pode_ler(p_aluno_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select gps.eh_admin()
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

-- gps.membros_aluno_papel_congelados()
CREATE OR REPLACE FUNCTION gps.membros_aluno_papel_congelados()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- Admin e o proprio Postgres (migrations, RPCs security definer) passam.
  if gps.eh_admin() or current_user = 'postgres' then
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

-- gps.minuta_registrar_parecer(uuid,text,text)
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
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.operador_definir(uuid,boolean,text)
CREATE OR REPLACE FUNCTION gps.operador_definir(p_user_id uuid, p_ativo boolean, p_nome text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nome text; v_email text;
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.pasta_drive_definir(uuid,text,text)
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

  v_admin := gps.eh_admin();

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

-- gps.pode_anexar_croqui(text)
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
  return coalesce(gps.eh_admin(), false)
      or gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_anexar_minuta(text)
CREATE OR REPLACE FUNCTION gps.pode_anexar_minuta(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if coalesce(p_name,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then return false; end if;
  return coalesce(gps.eh_admin(), false)
      or gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then return false;
end; $function$;

-- gps.pode_ver_anexo_chamado(text)
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
  return gps.eh_admin() or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_ver_anexo_onboarding(text)
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
  return coalesce(gps.eh_admin(), false) or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_ver_chamado(uuid)
CREATE OR REPLACE FUNCTION gps.pode_ver_chamado(p_chamado_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from gps.chamados c
     where c.id = p_chamado_id
       and (gps.eh_admin() or c.aluno_id = gps.aluno_atual())
  );
$function$;

-- gps.pode_ver_croqui(text)
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
  return coalesce(gps.eh_admin(), false)
      or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$function$;

-- gps.pode_ver_minuta(text)
CREATE OR REPLACE FUNCTION gps.pode_ver_minuta(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_prefixo text := split_part(coalesce(p_name,''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return coalesce(gps.eh_admin(), false) or gps.aluno_atual() = v_prefixo::uuid;
exception when others then return false;
end; $function$;

-- gps.push_desinscrever(text)
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
  if v_uid is null or not coalesce(gps.eh_admin(), false) then
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

-- gps.push_inscrever(text,text,text,text)
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
  if v_uid is null or not coalesce(gps.eh_admin(), false) then
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

-- gps.push_preparar(uuid)
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

  -- Só inscrição viva de quem AINDA é admin ativo do GPS (gps.admins,
  -- 20261008000368), aplicada ao user_id da inscrição.
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', i.endpoint,
                                               'p256dh',   i.p256dh,
                                               'auth',     i.auth)
                            order by i.criado_em), '[]'::jsonb)
    into v_insc
    from gps.push_inscricoes i
    join gps.admins a on a.user_id = i.user_id and a.ativo
   where i.revogada_em is null;

  return jsonb_build_object(
    'chamado_id', v_chamado,
    'titulo',     'Nova mensagem no chamado',
    'corpo',      'Chamado de ' || v_nome,
    'url',        '/admin/chamados/' || v_chamado::text,
    'inscricoes', v_insc
  );
end;
$function$;

-- gps.push_vapid_publica()
CREATE OR REPLACE FUNCTION gps.push_vapid_publica()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return (select nullif(btrim(c.valor), '') from gps.config c where c.chave = 'push_vapid_publica');
end;
$function$;

-- gps.registrar_mencoes(uuid,uuid[])
CREATE OR REPLACE FUNCTION gps.registrar_mencoes(p_nota_id uuid, p_perfis uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_gravadas jsonb;
begin
  if not coalesce(gps.eh_admin(), false) then
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
     where exists (select 1 from gps.admins a where a.user_id = c.perfil_id and a.ativo) order by p.nome, c.perfil_id limit 10
  ),
  gravadas as (
    insert into gps.nota_mencoes (nota_id, perfil_id) select p_nota_id, v.perfil_id from validos v
    on conflict (nota_id, perfil_id) do nothing returning perfil_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('perfil_id', v.perfil_id, 'nome', v.nome) order by v.nome), '[]'::jsonb)
    into v_gravadas from validos v where v.perfil_id in (select perfil_id from gravadas);
  return jsonb_build_object('mencionados', v_gravadas, 'quantidade', jsonb_array_length(v_gravadas));
end $function$;

-- gps.reuniao_cancelar_proposta(uuid)
CREATE OR REPLACE FUNCTION gps.reuniao_cancelar_proposta(p_proposta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_proposta record;
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.reuniao_guardar_status()
CREATE OR REPLACE FUNCTION gps.reuniao_guardar_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'gps', 'public'
AS $function$
declare
  eh_admin boolean := gps.eh_admin();
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

commit;
