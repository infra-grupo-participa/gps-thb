-- ═══════════════════════════════════════════════════════════════════════════
-- 371 — ADMIN DO GPS SEPARADO (3/5): funções, parte 4 de 6
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
--   gps.chamado_aprovar_solicitacao(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.chamado_declinar_solicitacao(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.chamado_definir_cliente(uuid,uuid) [tinha gp_acesso_pode_editar]
--   gps.chamado_fechar(uuid) [tinha gp_acesso_pode_editar]
--   gps.chamado_responder(uuid,text,text,text,text,integer) [tinha gp_acesso_pode_editar]
--   gps.chamados_anexos_para_expurgo() [tinha gp_acesso_pode_editar]
--   gps.cliente_croqui_anexar(uuid,text,text,integer,date,text) [tinha gp_acesso_pode_editar]
--   gps.cliente_croqui_remover(uuid) [tinha gp_acesso_pode_editar]
--   gps.cliente_definir_contrato(uuid,text,text,text,integer) [tinha gp_acesso_pode_editar]
--   gps.cliente_documento_registrar_leitura(uuid,text,uuid) [tinha gp_acesso_pode_editar]
--   gps.cliente_link_drive_adicionar(uuid,text,text) [tinha gp_acesso_pode_editar]
--   gps.cliente_link_drive_remover(uuid) [tinha gp_acesso_pode_editar]
--   gps.cliente_minuta_anexar(uuid,text,text,integer,text,text,text,text,text) [tinha gp_acesso_pode_editar]
--   gps.cliente_minuta_remover(uuid) [tinha gp_acesso_pode_editar]
--   gps.cliente_remover_contrato(uuid) [tinha gp_acesso_pode_editar]
--   gps.cliente_trajetoria_desmarcar(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.cliente_trajetoria_marcar(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.config_definir(text,text) [tinha gp_acesso_pode_editar]
--   gps.drive_criar_pasta_cliente(uuid) [tinha gp_acesso_pode_editar]
--   gps.drive_estado(uuid,uuid) [tinha gp_acesso_pode_editar]
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
        ('gps.chamado_aprovar_solicitacao(uuid,text)', '0beae6ec09929bb590336c66ea3607c5'),
        ('gps.chamado_declinar_solicitacao(uuid,text)', '2b8e25151593f82839031eda4d9b770c'),
        ('gps.chamado_definir_cliente(uuid,uuid)', 'ca3b222edcf0758dbe02822929f44188'),
        ('gps.chamado_fechar(uuid)', '8f0b48cee43a18a5fd797cde6192daf3'),
        ('gps.chamado_responder(uuid,text,text,text,text,integer)', '621530338471cd9ce0b6a999c5888897'),
        ('gps.chamados_anexos_para_expurgo()', '8bf091a965f531813fc847a085c4604d'),
        ('gps.cliente_croqui_anexar(uuid,text,text,integer,date,text)', '6fe726f8c9b0b9e74664ecd8cae01e58'),
        ('gps.cliente_croqui_remover(uuid)', '400ecc708edd16bd9eb2d746b4f3eba8'),
        ('gps.cliente_definir_contrato(uuid,text,text,text,integer)', 'a65d226f6144dd0fff2c2f8e7839309d'),
        ('gps.cliente_documento_registrar_leitura(uuid,text,uuid)', '6bd39287263bfe768de4e6efe742002a'),
        ('gps.cliente_link_drive_adicionar(uuid,text,text)', 'ef01e60b27b52e0623f6e18d0d06a410'),
        ('gps.cliente_link_drive_remover(uuid)', '923a12bfc05371a91c31622b92b2ea54'),
        ('gps.cliente_minuta_anexar(uuid,text,text,integer,text,text,text,text,text)', 'c5d00db9ed428e8d5e9f1fbdba91a0df'),
        ('gps.cliente_minuta_remover(uuid)', '09654b9ccfbfe255e1cb26fa08ba5ce6'),
        ('gps.cliente_remover_contrato(uuid)', '040103a5d835261ee66a26ad3e97a393'),
        ('gps.cliente_trajetoria_desmarcar(uuid,text)', '8f50ee19272e1b99df084d8e8b437be7'),
        ('gps.cliente_trajetoria_marcar(uuid,text)', '27a78eb3df58909aafae4dfe12151e3a'),
        ('gps.config_definir(text,text)', 'd8552b56285ca3298cede1103a1f2551'),
        ('gps.drive_criar_pasta_cliente(uuid)', '5dc273f84d7a077efd94bb830a2527c3'),
        ('gps.drive_estado(uuid,uuid)', 'ff4c5527af13f268ed5e403a89414f17')
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
    raise exception '%: corpo vivo difere do retrato de 08/10 — regenerar a migração: %', '20261008000371', array_to_string(v_ruins, '; ');
  end if;
end
$guarda$;

-- gps.chamado_aprovar_solicitacao(uuid,text)
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
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.chamado_declinar_solicitacao(uuid,text)
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
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.chamado_definir_cliente(uuid,uuid)
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
  if not (coalesce(gps.eh_admin(), false)
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

-- gps.chamado_fechar(uuid)
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
  if not (gps.eh_admin() or gps.aluno_atual() = v_chamado.aluno_id) then
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

-- gps.chamado_responder(uuid,text,text,text,text,integer)
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
  if gps.eh_admin() then
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

-- gps.chamados_anexos_para_expurgo()
CREATE OR REPLACE FUNCTION gps.chamados_anexos_para_expurgo()
 RETURNS TABLE(mensagem_id uuid, chamado_id uuid, aluno_id uuid, path text, motivo text, referencia timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
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

-- gps.cliente_croqui_anexar(uuid,text,text,integer,date,text)
CREATE OR REPLACE FUNCTION gps.cliente_croqui_anexar(p_cliente_id uuid, p_path text, p_nome text, p_tamanho integer, p_apresentado_em date DEFAULT NULL::date, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c           record;
  v_admin       boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_croqui_remover(uuid)
CREATE OR REPLACE FUNCTION gps.cliente_croqui_remover(p_croqui_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_k        record;
  v_admin    boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_definir_contrato(uuid,text,text,text,integer)
CREATE OR REPLACE FUNCTION gps.cliente_definir_contrato(p_cliente_id uuid, p_path text, p_nome text, p_mime text, p_tamanho integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_admin boolean := coalesce(gps.eh_admin(), false); v_ambiente uuid := gps.aluno_atual();
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

-- gps.cliente_documento_registrar_leitura(uuid,text,uuid)
CREATE OR REPLACE FUNCTION gps.cliente_documento_registrar_leitura(p_cliente_id uuid, p_tipo text, p_documento_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c record;
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.cliente_link_drive_adicionar(uuid,text,text)
CREATE OR REPLACE FUNCTION gps.cliente_link_drive_adicionar(p_cliente_id uuid, p_nome text, p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_link_drive_remover(uuid)
CREATE OR REPLACE FUNCTION gps.cliente_link_drive_remover(p_link_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_minuta_anexar(uuid,text,text,integer,text,text,text,text,text)
CREATE OR REPLACE FUNCTION gps.cliente_minuta_anexar(p_cliente_id uuid, p_path text, p_nome text, p_tamanho integer, p_notas text DEFAULT NULL::text, p_caso text DEFAULT NULL::text, p_o_que_foi_feito text DEFAULT NULL::text, p_ponto_de_ajuda text DEFAULT NULL::text, p_o_que_mudou text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c record; v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_minuta_remover(uuid)
CREATE OR REPLACE FUNCTION gps.cliente_minuta_remover(p_minuta_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_m record; v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_remover_contrato(uuid)
CREATE OR REPLACE FUNCTION gps.cliente_remover_contrato(p_cliente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c record; v_admin boolean := coalesce(gps.eh_admin(), false); v_ambiente uuid := gps.aluno_atual();
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

-- gps.cliente_trajetoria_desmarcar(uuid,text)
CREATE OR REPLACE FUNCTION gps.cliente_trajetoria_desmarcar(p_cliente_id uuid, p_etapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(gps.eh_admin(), false);
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

-- gps.cliente_trajetoria_marcar(uuid,text)
CREATE OR REPLACE FUNCTION gps.cliente_trajetoria_marcar(p_cliente_id uuid, p_etapa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(gps.eh_admin(), false);
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

-- gps.config_definir(text,text)
CREATE OR REPLACE FUNCTION gps.config_definir(p_chave text, p_valor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.drive_criar_pasta_cliente(uuid)
CREATE OR REPLACE FUNCTION gps.drive_criar_pasta_cliente(p_cliente_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid      uuid    := auth.uid();
  v_admin    boolean := coalesce(gps.eh_admin(), false);
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

-- gps.drive_estado(uuid,uuid)
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
  v_admin := coalesce(gps.eh_admin(), false);

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

commit;
