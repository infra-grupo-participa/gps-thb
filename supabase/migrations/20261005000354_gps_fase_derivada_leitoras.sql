-- ═══════════════════════════════════════════════════════════════════════════
-- …354 — leitoras/escritoras de etapa1_clientes.fase depois da fase DERIVADA.
-- ═══════════════════════════════════════════════════════════════════════════
-- DEPENDE da …353 (gatilhos + gps.cliente_fase_etapas_legado). Aplicar as
-- duas JUNTAS: com a …353 sozinha, onboarding/restauração/conversão gravam
-- fase no INSERT e a guarda força 'prospeccao' em silêncio.
--
-- Corpos partem do pg_get_functiondef VIVO (05/10, md5 conferido), diff
-- mínimo. create or replace preserva ACL/SECURITY DEFINER/search_path; o DO
-- do fim prova contra o _acl.txt e aborta se divergir.
--
--   1. onboarding_concluir — não grava fase; marca etapas pela resposta.
--   2. admin_lixeira_restaurar_clientes — não grava fase; marca pelo mapa
--      do legado a partir da fase guardada no retrato.
--   3. admin_converter_titular_em_socio — não copia fase; copia as
--      marcações vivas (data e autor originais).
--   4. admin_dashboard — honorário/contratado = fase in (contratado,
--      concluido); `clientes` e `caminho` ganham a chave `concluido`
--      (o front lê caminho.concluido ?? 0); as chaves existentes ficam.
--      `contratado` dos dois blocos continua contando SÓ 'contratado'
--      (é agrupamento por fase); `com_valor` passa a incluir concluido.
--   5. admin_painel_alunos — contratados/honorários/sem_valor/
--      tem_contratado_com_valor com concluido.
--   SEM MUDANÇA (lidas): admin_clientes_lista e admin_registrar_export_clientes
--   não validam p_fase (c.fase = p_fase aceita 'concluido');
--   admin_clientes_reuniao_kpis não lê fase; dossie_do_cliente,
--   sessao_briefing_montar só devolvem o valor.
--
-- REVERSÃO: reaplicar os 5 corpos anteriores (pg_get_functiondef salvos em
-- scratchpad/vivas/*.sql de 05/10) ANTES de reverter a …353.
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- retrato de ACL/secdef/config ANTES (comparado no fim)
create temp table _antes_354 as
select p.proname, p.proacl::text as acl, p.prosecdef, p.proconfig::text as cfg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('onboarding_concluir', 'admin_lixeira_restaurar_clientes',
                     'admin_converter_titular_em_socio', 'admin_dashboard', 'admin_painel_alunos');

-- ── 1. onboarding_concluir ──
CREATE OR REPLACE FUNCTION gps.onboarding_concluir()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pessoa uuid; v_ambiente uuid; v_r gps.onboarding_respostas%rowtype; v_etapas text[]; v_ordem integer; v_cliente uuid; v_favoritado boolean := false;
begin
  -- 🔴 GUARDA DE PAPEL — OBRIGATÓRIA, não remover em reescrita futura.
  -- Esta é a RPC MAIS CRÍTICA do achado: cria o cliente 1 em
  -- gps.etapa1_clientes NO AMBIENTE, que é compartilhado com o titular.
  if not gps.membro_e_titular() then
    raise exception 'O questionário inicial é respondido pelo titular do ambiente.' using errcode = '42501';
  end if;

  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.' using errcode = '42501'; end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501'; end if;
  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa for update;
  if not found then raise exception 'Responda o questionário antes de concluir.' using errcode = '22023'; end if;
  if v_r.concluido_em is not null then raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023'; end if;
  if v_r.origem_cliente1 is null then raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023'; end if;

  if v_r.origem_cliente1 = 'ja_tenho' then
    if v_r.fase_cliente1 is null then raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023'; end if;
    if coalesce(btrim(v_r.cliente_nome), '') = '' then raise exception 'Informe o nome do seu cliente 1.' using errcode = '22023'; end if;
    -- Nome E WhatsApp obrigatórios (decisão do Marcio, 10/09/2026): sem o
    -- contato a equipe não consegue trabalhar o lead.
    if coalesce(btrim(v_r.cliente_telefone), '') = '' then raise exception 'Informe o número de WhatsApp do seu cliente 1.' using errcode = '22023'; end if;
    if coalesce(btrim(v_r.cliente_grau_relacao), '') = '' then raise exception 'Escolha o grau de relação com este cliente.' using errcode = '22023'; end if;
    -- 🔑 Honorários agora dependem da PERGUNTA, não da fase: quem pactuou
    -- informa o valor, esteja em que fase estiver. O ANEXO do contrato saiu
    -- do onboarding (decisão do Marcio, 10/09) -- ele continua existindo na
    -- ficha do cliente, onde o aluno anexa quando quiser.
    if v_r.honorarios_pactuados is true and v_r.valor_honorarios is null then
      raise exception 'Informe o valor dos honorários pactuados.' using errcode = '22023';
    end if;
    -- `agendado` (sessão/reunião marcada, aguardando realização) entra como
    -- prospecção: ainda não houve reunião, então não é fechamento.
    -- …354: a fase é DERIVADA da trajetória (…353). Em vez de gravar fase,
    -- marca as etapas de topo até a resposta; o gatilho calcula a fase
    -- (agendado→prospeccao, viabilidade/croqui→fechamento, execução→contratado).
    v_etapas := case v_r.fase_cliente1
                  when 'agendado' then array['prospeccao']
                  when 'viabilidade_feita' then array['prospeccao','reuniao_preliminar','sessao_viabilidade']
                  when 'croqui_apresentado' then array['prospeccao','reuniao_preliminar','sessao_viabilidade','croqui_estrutural']
                  when 'execucao_andamento' then array['prospeccao','reuniao_preliminar','sessao_viabilidade','croqui_estrutural','execucao'] end;
    select coalesce(max(c.ordem), 0) + 1 into v_ordem from gps.etapa1_clientes c where c.aluno_id = v_ambiente;
    insert into gps.etapa1_clientes (aluno_id, nome, telefone, grau_relacao, valor_honorarios, ordem)
    values (v_ambiente, btrim(v_r.cliente_nome), v_r.cliente_telefone, v_r.cliente_grau_relacao, v_r.valor_honorarios, v_ordem)
    returning id into v_cliente;

    insert into gps.cliente_trajetoria (cliente_id, etapa_codigo, marcado_por)
    select v_cliente, e.codigo, auth.uid() from unnest(v_etapas) as e(codigo);

    -- 🔴 AQUI FICAVA O `update ... set acompanhado_equipe = true` (removido em
    -- 14/09/2026). A estrela TRAVA (migração ...215), e marcá-la por conta do
    -- aluno prendia gente numa escolha que ela não fez. `v_favoritado` fica
    -- `false` e o aluno escolhe depois, na aba Clientes, com o aviso da tela.
    -- NÃO REINTRODUZIR sem decisão explícita do Marcio.
  end if;

  -- passo_atual = 8: o fluxo agora termina em 7 (os antigos 8 e 9 saíram).
  update gps.onboarding_respostas set concluido_em = now(), cliente_id = v_cliente, passo_atual = 6 where pessoa_aluno_id = v_pessoa;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_ambiente, now(), 'onboarding_concluido', 'onboarding', null, 'Concluiu o questionário inicial',
          jsonb_build_object('pessoa_aluno_id', v_pessoa, 'origem_cliente1', v_r.origem_cliente1, 'fase_cliente1', v_r.fase_cliente1, 'cliente_id', v_cliente, 'favoritado', v_favoritado, 'pais', v_r.cliente_pais),
          'aluno', auth.uid(), 'app');
  return jsonb_build_object('cliente_id', v_cliente, 'favoritado', v_favoritado);
end $function$;

-- ── 2. admin_lixeira_restaurar_clientes ──
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
  if not coalesce(public.gp_is_admin(), false) then
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

-- ── 3. admin_converter_titular_em_socio ──
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
  if not coalesce(public.gp_is_admin(), false) then
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

-- ── 4. admin_dashboard ──
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
  if not coalesce(public.gp_is_admin(), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
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

-- ── 5. admin_painel_alunos ──
CREATE OR REPLACE FUNCTION gps.admin_painel_alunos(p_limite integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(aluno_id uuid, qtd_membros integer, tem_login boolean, desde timestamp with time zone, ultimo_acesso timestamp with time zone, clientes_preenchidos integer, clientes_com_dados integer, clientes_com_perda integer, agendados integer, tarefas_concluidas integer[], honorarios_contratados numeric, contratados integer, contratados_sem_valor integer, total_ambientes integer, onboarding_status text, em_fechamento integer, apto_ao_saldo boolean, classe text, favorito_nome text, favorito_fase text, favorito_confirmado boolean, lista_incompleta boolean, pronto_para_finalizar boolean, finalizado_em timestamp with time zone, socio_nome text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000); v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.gp_is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
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

-- ── Prova: ACL, SECURITY DEFINER e search_path iguais aos de antes ────────
do $$
declare v_ruins text;
begin
  if (select count(*) from _antes_354) <> 5 then
    raise exception '…354: esperava 5 funcoes antes (sobrecarga?) -- abortada';
  end if;

  select string_agg(a.proname, ', ') into v_ruins
    from _antes_354 a
    left join (
      select p.proname, p.proacl::text as acl, p.prosecdef, p.proconfig::text as cfg
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'gps'
    ) d on d.proname = a.proname
   where d.proname is null
      or d.acl is distinct from a.acl
      or d.prosecdef is distinct from a.prosecdef
      or d.cfg is distinct from a.cfg
      or a.acl is distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
      or not a.prosecdef;
  if v_ruins is not null then
    raise exception '…354: ACL/secdef/search_path divergiu (ou ja divergia do _acl.txt de 05/10) -- abortada: %', v_ruins;
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'gps'
         and p.proname in ('onboarding_concluir', 'admin_lixeira_restaurar_clientes',
                           'admin_converter_titular_em_socio', 'admin_dashboard', 'admin_painel_alunos')) <> 5 then
    raise exception '…354: sobrecarga criada -- abortada';
  end if;
end $$;
drop table _antes_354;
