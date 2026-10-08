-- ═══════════════════════════════════════════════════════════════════════════
-- 373 — ADMIN DO GPS SEPARADO (3/5): funções, parte 6 de 6
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
--   gps.reuniao_registrar_evento() [tinha gp_acesso_pode_editar]
--   gps.selecao_entrevista_definir(uuid,uuid[]) [tinha gp_acesso_pode_editar]
--   gps.sessao_briefing_ler(uuid) [tinha gp_acesso_pode_editar]
--   gps.sessao_cancelar(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.sessao_concluir(uuid,text,text,text,text,text) [tinha gp_acesso_pode_editar]
--   gps.sessao_link_definir(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.sessao_link_remover(uuid) [tinha gp_acesso_pode_editar]
--   gps.sessao_marcar_falta(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.sessao_pode_agendar(uuid,smallint) [tinha gp_acesso_pode_editar]
--   gps.sessao_remarcar(uuid,date,time without time zone,text) [tinha gp_acesso_pode_editar]
--   gps.sessao_resumo_editar(uuid,text) [tinha gp_acesso_pode_editar]
--   gps.sessao_resumo_ler(uuid) [tinha gp_acesso_pode_editar]
--   gps.socio_convite_revogar(uuid) [tinha gp_acesso_pode_editar]
--   gps.tutorial_excluir(uuid) [tinha gp_acesso_pode_editar]
--   gps.tutorial_publicar(uuid,boolean) [tinha gp_acesso_pode_editar]
--   gps.tutorial_salvar(uuid,text,text,text,text,jsonb,integer) [tinha gp_acesso_pode_editar]
--   gps.video_excluir(uuid) [tinha gp_acesso_pode_editar]
--   gps.video_publicar(uuid,boolean) [tinha gp_acesso_pode_editar]
--   gps.video_salvar(uuid,text,text,text,smallint,integer) [tinha gp_acesso_pode_editar]
--   gps.videos_do_aluno_admin(uuid,smallint) [tinha gp_acesso_pode_editar]
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
        ('gps.reuniao_registrar_evento()', '37f31320a8d1b80007fe5544f8de01f2'),
        ('gps.selecao_entrevista_definir(uuid,uuid[])', '3660eeb82b44d2e99c8e1711d24667de'),
        ('gps.sessao_briefing_ler(uuid)', 'b3f6dd2c09efade57890ef5ca7a85a67'),
        ('gps.sessao_cancelar(uuid,text)', '1b83ce20bc944f90a3ab657396f9fa1c'),
        ('gps.sessao_concluir(uuid,text,text,text,text,text)', '128acd9b671cd57c3a68fdf0486d5d3d'),
        ('gps.sessao_link_definir(uuid,text)', '36057146be63fe3c88dd6c1a25fb211d'),
        ('gps.sessao_link_remover(uuid)', '2c6bb6c322ebaf31576bb3daf589ef0c'),
        ('gps.sessao_marcar_falta(uuid,text)', 'f3466d6ffd61a9d33c82e70ce98d1e1f'),
        ('gps.sessao_pode_agendar(uuid,smallint)', '085f7692b78504bc0c7be95c281f35ad'),
        ('gps.sessao_remarcar(uuid,date,time without time zone,text)', 'c6c979cce9af5612a534738b8df1aa4b'),
        ('gps.sessao_resumo_editar(uuid,text)', '9958e197f91adf4820cd4a43a19d597e'),
        ('gps.sessao_resumo_ler(uuid)', '0e68d4d7a23c08a752fc522b310ea477'),
        ('gps.socio_convite_revogar(uuid)', 'f8d17d6b7b2768eba9a3feadb71ae6c6'),
        ('gps.tutorial_excluir(uuid)', 'f5a641d74e0ffeb48269a92e5f1c0dff'),
        ('gps.tutorial_publicar(uuid,boolean)', '29c5217db3d265634e5ff706f4d02786'),
        ('gps.tutorial_salvar(uuid,text,text,text,text,jsonb,integer)', 'e1347e97eb53601999901323e64dfbcd'),
        ('gps.video_excluir(uuid)', '2055c3b30248160b2fbfd9fb465d4012'),
        ('gps.video_publicar(uuid,boolean)', 'fc5f5c61c090b45277578394ffebfec4'),
        ('gps.video_salvar(uuid,text,text,text,smallint,integer)', '112fc05f1cdeb7e02f4e45f58a47908f'),
        ('gps.videos_do_aluno_admin(uuid,smallint)', '0104cf59df7056edfb4b5d0584789f1f')
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
    raise exception '%: corpo vivo difere do retrato de 08/10 — regenerar a migração: %', '20261008000373', array_to_string(v_ruins, '; ');
  end if;
end
$guarda$;

-- gps.reuniao_registrar_evento()
CREATE OR REPLACE FUNCTION gps.reuniao_registrar_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'gps', 'public'
AS $function$
declare
  eh_admin boolean := gps.eh_admin();
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

-- gps.selecao_entrevista_definir(uuid,uuid[])
CREATE OR REPLACE FUNCTION gps.selecao_entrevista_definir(p_aluno_id uuid, p_cliente_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_briefing_ler(uuid)
CREATE OR REPLACE FUNCTION gps.sessao_briefing_ler(p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_cancelar(uuid,text)
CREATE OR REPLACE FUNCTION gps.sessao_cancelar(p_agendamento_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ambiente uuid := gps.aluno_atual();
  v_admin    boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_concluir(uuid,text,text,text,text,text)
CREATE OR REPLACE FUNCTION gps.sessao_concluir(p_agendamento_id uuid, p_resumo text DEFAULT NULL::text, p_perfil_disc text DEFAULT NULL::text, p_disc_consciencia text DEFAULT NULL::text, p_disc_gatilhos text DEFAULT NULL::text, p_disc_relacionamento text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin  boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_link_definir(uuid,text)
CREATE OR REPLACE FUNCTION gps.sessao_link_definir(p_agendamento_id uuid, p_link text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_link_remover(uuid)
CREATE OR REPLACE FUNCTION gps.sessao_link_remover(p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_marcar_falta(uuid,text)
CREATE OR REPLACE FUNCTION gps.sessao_marcar_falta(p_agendamento_id uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_pode_agendar(uuid,smallint)
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
       gps.eh_admin()
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

-- gps.sessao_remarcar(uuid,date,time without time zone,text)
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
  if not (coalesce(gps.eh_admin(), false)
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

-- gps.sessao_resumo_editar(uuid,text)
CREATE OR REPLACE FUNCTION gps.sessao_resumo_editar(p_agendamento_id uuid, p_resumo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin  boolean := coalesce(gps.eh_admin(), false);
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

-- gps.sessao_resumo_ler(uuid)
CREATE OR REPLACE FUNCTION gps.sessao_resumo_ler(p_agendamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := coalesce(gps.eh_admin(), false);
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

-- gps.socio_convite_revogar(uuid)
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
    gps.eh_admin()
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

-- gps.tutorial_excluir(uuid)
CREATE OR REPLACE FUNCTION gps.tutorial_excluir(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not gps.eh_admin() then
    raise exception 'Ação restrita à equipe.' using errcode = '42501';
  end if;
  delete from gps.tutoriais where id = p_id returning id into v_id;
  if v_id is null then
    raise exception 'Tutorial não encontrado.' using errcode = 'P0002';
  end if;
end;
$function$;

-- gps.tutorial_publicar(uuid,boolean)
CREATE OR REPLACE FUNCTION gps.tutorial_publicar(p_id uuid, p_publicado boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;
begin
  if not gps.eh_admin() then
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

-- gps.tutorial_salvar(uuid,text,text,text,text,jsonb,integer)
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
  if not gps.eh_admin() then
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

-- gps.video_excluir(uuid)
CREATE OR REPLACE FUNCTION gps.video_excluir(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_n integer;
begin
  if not coalesce(gps.eh_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  delete from gps.videos where id = p_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Vídeo não encontrado.' using errcode = 'P0002';
  end if;
end;
$function$;

-- gps.video_publicar(uuid,boolean)
CREATE OR REPLACE FUNCTION gps.video_publicar(p_id uuid, p_publicado boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ok uuid;
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.video_salvar(uuid,text,text,text,smallint,integer)
CREATE OR REPLACE FUNCTION gps.video_salvar(p_id uuid, p_titulo text, p_youtube_id text, p_descricao text DEFAULT NULL::text, p_etapa smallint DEFAULT NULL::smallint, p_ordem integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_titulo text; v_yt text; v_id uuid;
begin
  if not coalesce(gps.eh_admin(), false) then
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

-- gps.videos_do_aluno_admin(uuid,smallint)
CREATE OR REPLACE FUNCTION gps.videos_do_aluno_admin(p_aluno_id uuid, p_etapa smallint DEFAULT NULL::smallint)
 RETURNS TABLE(id uuid, titulo text, descricao text, youtube_id text, etapa smallint, ordem integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not gps.eh_admin() then
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

commit;
