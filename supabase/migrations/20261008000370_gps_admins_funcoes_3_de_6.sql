-- ═══════════════════════════════════════════════════════════════════════════
-- 370 — ADMIN DO GPS SEPARADO (3/5): funções, parte 3 de 6
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
-- FUNÇÕES DESTA PARTE (23):
--   gps.admin_painel_atendimento() [tinha gp_acesso_pode_editar]
--   gps.admin_painel_sinais() [tinha gp_acesso_pode_editar]
--   gps.admin_plantao_cancelar_inscricao(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_plantao_editar_nome_inscricao(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.admin_plantao_inscrever(uuid,text,text) [tinha gp_acesso_pode_editar]
--   gps.admin_plantao_marcar_presenca(uuid,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_previa_converter_titular_em_socio(uuid,uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_programas_do_email(text) [tinha gp_acesso_pode_editar]
--   gps.admin_reabrir_etapa(uuid,smallint,text) [tinha gp_acesso_pode_editar]
--   gps.admin_registrar_export_clientes(integer,text,text,text,text,text) [tinha gp_acesso_pode_editar]
--   gps.admin_registrar_lote_de_acessos(integer,integer,integer,integer) [tinha gp_acesso_pode_editar]
--   gps.admin_remover_favorito_lote(uuid[],text,boolean,boolean) [tinha gp_acesso_pode_editar]
--   gps.admin_status_acesso(uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_trocar_email_login(uuid,text,boolean,text) [tinha gp_acesso_pode_editar]
--   gps.admin_trocar_titular(uuid,uuid) [tinha gp_acesso_pode_editar]
--   gps.admin_tutoriais_resumo() [tinha gp_acesso_pode_editar]
--   gps.admin_vincular_pessoa_membro(uuid,uuid) [tinha gp_acesso_pode_editar]
--   gps.ajuda_registrar_feedback(uuid,boolean,text,text) [tinha gp_acesso_pode_editar]
--   gps.aluno_eventos_capturar_etapa1_clientes() [tinha gp_acesso_pode_editar]
--   gps.aluno_eventos_capturar_funil_origem() [tinha gp_acesso_pode_editar]
--   gps.aluno_eventos_capturar_progresso() [tinha gp_acesso_pode_editar]
--   gps.aluno_eventos_job_primeiro_acesso() [tinha gp_acesso_pode_editar]
--   gps.chamado_anexo_marcar_expurgado(uuid) [tinha gp_acesso_pode_editar]
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
        ('gps.admin_painel_atendimento()', '729cb233bdba0439eca14eabfbe78396'),
        ('gps.admin_painel_sinais()', 'fc33cc2de7ad7a55f14b3095896080e3'),
        ('gps.admin_plantao_cancelar_inscricao(uuid,text)', 'cf58c8eb3fc5e16427fcb3d7c2b9b153'),
        ('gps.admin_plantao_editar_nome_inscricao(uuid,text)', '2444e7728be95b77eb83f82b26bcc16e'),
        ('gps.admin_plantao_inscrever(uuid,text,text)', '1406938ef6b89cc9df50b32ac096733c'),
        ('gps.admin_plantao_marcar_presenca(uuid,boolean)', 'de8150bf113e37ff0ed7339ec2d5476a'),
        ('gps.admin_previa_converter_titular_em_socio(uuid,uuid)', '57ac78a28c7bbf192c60368c03e4926c'),
        ('gps.admin_programas_do_email(text)', '9afae54f15ff097025929ff96b86c161'),
        ('gps.admin_reabrir_etapa(uuid,smallint,text)', 'fa3074facb1ab1054993ba93b731790c'),
        ('gps.admin_registrar_export_clientes(integer,text,text,text,text,text)', '767b39b5288b6ef3b353e7d4a3e7db7a'),
        ('gps.admin_registrar_lote_de_acessos(integer,integer,integer,integer)', 'fd31d091b5cae7e0fcb7004a0d5f1e65'),
        ('gps.admin_remover_favorito_lote(uuid[],text,boolean,boolean)', '4d6aeaf0a5f9179a3dc1a54a18d33754'),
        ('gps.admin_status_acesso(uuid)', 'd6914a0324cc81e033a236e0a8d37b9c'),
        ('gps.admin_trocar_email_login(uuid,text,boolean,text)', '20899478936efff7f11e5a307b58391e'),
        ('gps.admin_trocar_titular(uuid,uuid)', '10d1393e2f08e4846b5dd40508632af6'),
        ('gps.admin_tutoriais_resumo()', '4cd7c26f9746f45005758e4122913c40'),
        ('gps.admin_vincular_pessoa_membro(uuid,uuid)', 'bd5620001851949270c117a92ab064cc'),
        ('gps.ajuda_registrar_feedback(uuid,boolean,text,text)', 'a6747dff6dc6ad6278aa94282ff0b31d'),
        ('gps.aluno_eventos_capturar_etapa1_clientes()', 'f9655f2b6088780fc14aa3658849f58a'),
        ('gps.aluno_eventos_capturar_funil_origem()', '25546cecf59e39f7ab912225a4a991b1'),
        ('gps.aluno_eventos_capturar_progresso()', '8e210f029a7630b3cd6bf6d0bfb331d3'),
        ('gps.aluno_eventos_job_primeiro_acesso()', '8591e358ccb17a125e9bc3f5f2e3a24f'),
        ('gps.chamado_anexo_marcar_expurgado(uuid)', '4bee2da9f60417a7c18482cdfa9b52f2')
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
    raise exception '%: corpo vivo difere do retrato de 08/10 — regenerar a migração: %', '20261008000370', array_to_string(v_ruins, '; ');
  end if;
end
$guarda$;

-- gps.admin_painel_atendimento()
CREATE OR REPLACE FUNCTION gps.admin_painel_atendimento()
 RETURNS TABLE(aluno_id uuid, pendencias_abertas integer, ultima_nota_em timestamp with time zone, ultima_nota_tipo text, ultima_nota_resumo text, chamados_abertos integer, reunioes_contestadas integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
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

-- gps.admin_painel_sinais()
CREATE OR REPLACE FUNCTION gps.admin_painel_sinais()
 RETURNS TABLE(aluno_id uuid, etapa_alem_da_2_liberada boolean, chamado_aberto_desde timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.admin_plantao_cancelar_inscricao(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_plantao_cancelar_inscricao(p_inscricao_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_motivo text := nullif(btrim(coalesce(p_motivo,'')),''); v_aluno_id uuid; v_linhas int;
begin
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
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

-- gps.admin_plantao_editar_nome_inscricao(uuid,text)
CREATE OR REPLACE FUNCTION gps.admin_plantao_editar_nome_inscricao(p_inscricao_id uuid, p_nome text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_nome text := nullif(btrim(coalesce(p_nome,'')),''); v_aluno_id uuid;
begin
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
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

-- gps.admin_plantao_inscrever(uuid,text,text)
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
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
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

-- gps.admin_plantao_marcar_presenca(uuid,boolean)
CREATE OR REPLACE FUNCTION gps.admin_plantao_marcar_presenca(p_inscricao_id uuid, p_presente boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_aluno_id uuid; v_linhas int;
begin
  if not gps.eh_admin() then raise exception 'Sem permissão.' using errcode='42501'; end if;
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

-- gps.admin_previa_converter_titular_em_socio(uuid,uuid)
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

-- gps.admin_programas_do_email(text)
CREATE OR REPLACE FUNCTION gps.admin_programas_do_email(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid; v_email text; v_progs jsonb := '[]'::jsonb; v_u record;
begin
  if not gps.eh_admin() then
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

-- gps.admin_reabrir_etapa(uuid,smallint,text)
CREATE OR REPLACE FUNCTION gps.admin_reabrir_etapa(p_aluno_id uuid, p_etapa smallint, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_afetadas smallint[]; v_qtd int; v_nome text; v_motivo text;
begin
  if not gps.eh_admin() then
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

-- gps.admin_registrar_export_clientes(integer,text,text,text,text,text)
CREATE OR REPLACE FUNCTION gps.admin_registrar_export_clientes(p_linhas integer, p_fase text DEFAULT NULL::text, p_grau text DEFAULT NULL::text, p_busca text DEFAULT NULL::text, p_reuniao text DEFAULT NULL::text, p_agenda text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.admin_registrar_lote_de_acessos(integer,integer,integer,integer)
CREATE OR REPLACE FUNCTION gps.admin_registrar_lote_de_acessos(p_total integer, p_criados integer, p_falhas integer, p_precisa_decisao integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('acessos_criados_em_lote', null,
          format('lote de %s: %s criado(s), %s falha(s), %s aguardando decisao',
                 greatest(coalesce(p_total, 0), 0), greatest(coalesce(p_criados, 0), 0),
                 greatest(coalesce(p_falhas, 0), 0), greatest(coalesce(p_precisa_decisao, 0), 0)),
          auth.uid());
end $function$;

-- gps.admin_remover_favorito_lote(uuid[],text,boolean,boolean)
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
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.admin_status_acesso(uuid)
CREATE OR REPLACE FUNCTION gps.admin_status_acesso(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; v_aluno record; v_u record; v_membro record; v_membros jsonb;
begin
  if not gps.eh_admin() then
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

-- gps.admin_trocar_email_login(uuid,text,boolean,text)
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
  if not gps.eh_admin() then
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

-- gps.admin_trocar_titular(uuid,uuid)
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
  if not gps.eh_admin() then
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

-- gps.admin_tutoriais_resumo()
CREATE OR REPLACE FUNCTION gps.admin_tutoriais_resumo()
 RETURNS TABLE(tutorial_id uuid, uteis bigint, nao_uteis bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
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

-- gps.admin_vincular_pessoa_membro(uuid,uuid)
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
  if not gps.eh_admin() then
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

-- gps.ajuda_registrar_feedback(uuid,boolean,text,text)
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
  if coalesce(gps.eh_admin(), false) then return; end if;
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

-- gps.aluno_eventos_capturar_etapa1_clientes()
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
    v_ator := case when gps.eh_admin() then 'equipe' else 'aluno' end;
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

-- gps.aluno_eventos_capturar_funil_origem()
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
       case when coalesce(gps.eh_admin(), false) then 'equipe' else 'aluno' end,
       auth.uid(), 'app');
  exception when others then
    null;
  end;
  return new;
end;
$function$;

-- gps.aluno_eventos_capturar_progresso()
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
    v_ator := case when gps.eh_admin() then 'equipe' else 'aluno' end;

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

-- gps.aluno_eventos_job_primeiro_acesso()
CREATE OR REPLACE FUNCTION gps.aluno_eventos_job_primeiro_acesso()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_inseridos integer;
begin
  if auth.uid() is not null and not gps.eh_admin() then
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

-- gps.chamado_anexo_marcar_expurgado(uuid)
CREATE OR REPLACE FUNCTION gps.chamado_anexo_marcar_expurgado(p_mensagem_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  update gps.chamado_mensagens
     set anexo_expurgado_em = now()
   where id = p_mensagem_id
     and anexo_path is not null
     and anexo_expurgado_em is null;
end;
$function$;

commit;
