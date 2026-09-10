-- Mega feature — as RPCs do questionário inicial.
--
-- CINCO DO ALUNO (guarda `gps.pessoa_atual()`) e UMA DO ADMIN:
--   gps.onboarding_meu()                → jsonb, SÓ LÊ
--   gps.onboarding_salvar_passo()       → upsert do rascunho, passo a passo
--   gps.onboarding_registrar_anexo()    → grava a linha DEPOIS de conferir o objeto
--   gps.onboarding_remover_anexo()      → tira a linha da lista
--   gps.onboarding_concluir()           → ATÔMICA: valida, cria o cliente 1, favorita
--   gps.admin_onboarding_do_aluno()     → o que a equipe vê, por ambiente
--
-- 🔴 O BANCO É A GARANTIA, A UI É CONVENIÊNCIA. O pedido do João —
--    "Execução em andamento (Obrigatório ele informar o valor do contrato dos
--    honorários e anexar o contrato de honorários assinado, sem isso ele não
--    pode avançar)" — vive dentro de `gps.onboarding_concluir()`. A tela
--    desabilita o botão com a razão escrita ao lado; a RPC recusa mesmo que
--    alguém chame o endpoint direto.
--
-- 🔑 NENHUMA delas duplica evento. `gps.aluno_eventos_capturar_etapa1_clientes`
--    (migração ...008) já grava `cliente_cadastrado` no INSERT e
--    `cliente_favoritado` quando `acompanhado_equipe` vira true num UPDATE
--    (medido, M4). Por isso `onboarding_concluir` insere o cliente e, em
--    seguida, FAVORITA POR UPDATE: assim a trilha recebe os dois eventos da
--    trigger e a RPC grava só o seu, `onboarding_concluido`.
--
-- 🔑 SEM `service_role` e sem `pg_net`: tudo acontece na transação do clique.
--
-- O QUE NÃO FAZ
--   * não cobra nada, não manda e-mail, não muda situação financeira. O
--     "apto ao saldo do programa" é DERIVADO (fase contratado + valor +
--     contrato anexado) e é sinal para a EQUIPE — nenhuma tela escreve valor
--     em reais até o João dar o texto (B-S1);
--   * não cria fase nova de cliente (C-1) nem toca o `status` congelado;
--   * não reabre o questionário de quem já concluiu, por mudança de versão.
--
-- REVERSÃO:
--   drop function gps.admin_onboarding_do_aluno(uuid);
--   drop function gps.onboarding_concluir();
--   drop function gps.onboarding_remover_anexo(uuid);
--   drop function gps.onboarding_registrar_anexo(text, text, text, text, integer);
--   drop function gps.onboarding_salvar_passo(smallint, jsonb);
--   drop function gps.onboarding_meu();

-- ═════════════════════════════════════════════════════════════════════════
-- 1. gps.onboarding_meu — SÓ LÊ
-- ═════════════════════════════════════════════════════════════════════════
--
-- NÃO cria a linha em 'iniciado'. Abrir o pop-up não é responder: se ela
-- criasse, o dashboard contaria como "em andamento" todo mundo que abriu o
-- portal uma vez e fechou, e o número que a equipe usa para saber quem
-- respondeu viraria ruído. A linha nasce em `onboarding_salvar_passo`.

create or replace function gps.onboarding_meu()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_pessoa   uuid;
  v_ambiente uuid;
  v_r        gps.onboarding_respostas%rowtype;
  v_status   text;
  v_anexos   jsonb;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();

  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;

  if not found then
    v_status := 'nao_iniciado';
  elsif v_r.concluido_em is not null then
    v_status := 'concluido';
  else
    v_status := 'em_andamento';
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', a.id, 'tipo', a.tipo, 'nome', a.nome, 'mime', a.mime,
             'tamanho', a.tamanho, 'path', a.path, 'criado_em', a.criado_em
           ) order by a.criado_em), '[]'::jsonb)
    into v_anexos
    from gps.onboarding_anexos a
   where a.pessoa_aluno_id = v_pessoa;

  return jsonb_build_object(
    'status',      v_status,
    'versao',      coalesce(v_r.versao, 1),
    'passo_atual', coalesce(v_r.passo_atual, 0),
    'respostas', jsonb_build_object(
      'origem_cliente1',      v_r.origem_cliente1,
      'fase_cliente1',        v_r.fase_cliente1,
      'valor_honorarios',     v_r.valor_honorarios,
      'cliente_nome',         v_r.cliente_nome,
      'cliente_telefone',     v_r.cliente_telefone,
      'cliente_grau_relacao', v_r.cliente_grau_relacao,
      'descricao_caso',       v_r.descricao_caso,
      'ajuda_pronta',         v_r.ajuda_pronta,
      'cliente_id',           v_r.cliente_id,
      'iniciado_em',          v_r.iniciado_em,
      'concluido_em',         v_r.concluido_em
    ),
    'anexos', v_anexos,
    -- Decide o TEXTO do passo 3 (§B.1): num ambiente que já tem favorito, o
    -- cliente entra sem roubar a estrela, e a tela precisa dizer isso ANTES.
    'ambiente_ja_tem_favorito',
      coalesce((select true from gps.etapa1_clientes c
                 where c.aluno_id = v_ambiente and c.acompanhado_equipe limit 1), false)
  );
end $function$;

comment on function gps.onboarding_meu() is
  'Estado do questionario inicial da PESSOA logada. SO LE -- nao cria a linha: abrir o pop-up nao e responder, e uma linha por abertura transformaria "em andamento" em ruido no dashboard. status = nao_iniciado | em_andamento | concluido. ambiente_ja_tem_favorito e do AMBIENTE (gps.aluno_atual()), nao da pessoa: e o que faz a tela avisar que o cliente novo NAO vai roubar a estrela de quem ja e acompanhado. 42501 quando a pessoa nao tem cadastro vinculado (a Central resolve).';

revoke execute on function gps.onboarding_meu() from public, anon;
grant  execute on function gps.onboarding_meu() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. gps.onboarding_salvar_passo — o rascunho
-- ═════════════════════════════════════════════════════════════════════════
--
-- ALLOWLIST DE CHAVES, não "grava o que vier": `p_dados` é jsonb vindo do
-- cliente, e um `update ... set` montado a partir dele deixaria qualquer
-- coluna (concluido_em, cliente_id, versao) ao alcance de uma chamada forjada.
-- Chave desconhecida ABORTA — não é ignorada em silêncio, senão um erro de
-- digitação no front viraria "salvou" sem salvar.
--
-- `passo_atual` SÓ AVANÇA (greatest): voltar uma tela para reler não pode
-- fazer a retomada regredir.

create or replace function gps.onboarding_salvar_passo(
  p_passo smallint,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pessoa   uuid;
  v_ambiente uuid;
  v_r        gps.onboarding_respostas%rowtype;
  v_novo     boolean := false;
  v_chave    text;
  v_origem   text;
  v_fase     text;
  v_valor    numeric(12,2);
  v_nome     text;
  v_tel      text;
  v_grau     text;
  v_caso     text;
  v_ajuda    text;
  v_passo    smallint;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then
    raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501';
  end if;

  v_passo := coalesce(p_passo, 0);
  if v_passo < 0 or v_passo > 9 then
    raise exception 'passo fora da faixa' using errcode = '22023';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'dados do passo em formato invalido' using errcode = '22023';
  end if;

  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;
  v_novo := not found;

  if not v_novo and v_r.concluido_em is not null then
    raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023';
  end if;

  -- (1) allowlist de chaves
  for v_chave in select jsonb_object_keys(p_dados) loop
    if v_chave not in ('origem_cliente1','fase_cliente1','valor_honorarios',
                       'cliente_nome','cliente_telefone','cliente_grau_relacao',
                       'descricao_caso','ajuda_pronta') then
      raise exception 'Campo não reconhecido no questionário: %', v_chave
        using errcode = '22023';
    end if;
  end loop;

  -- (2) valor novo quando a chave veio; valor de antes quando não veio.
  --     `nullif(..., '')` porque campo esvaziado na tela chega como string
  --     vazia, e '' não passa nos CHECKs (viraria 23514 na cara do aluno).
  v_origem := case when p_dados ? 'origem_cliente1'
                   then nullif(btrim(coalesce(p_dados->>'origem_cliente1','')), '')
                   else v_r.origem_cliente1 end;
  v_fase   := case when p_dados ? 'fase_cliente1'
                   then nullif(btrim(coalesce(p_dados->>'fase_cliente1','')), '')
                   else v_r.fase_cliente1 end;
  v_nome   := case when p_dados ? 'cliente_nome'
                   then nullif(btrim(coalesce(p_dados->>'cliente_nome','')), '')
                   else v_r.cliente_nome end;
  v_tel    := case when p_dados ? 'cliente_telefone'
                   then nullif(btrim(coalesce(p_dados->>'cliente_telefone','')), '')
                   else v_r.cliente_telefone end;
  v_grau   := case when p_dados ? 'cliente_grau_relacao'
                   then nullif(btrim(coalesce(p_dados->>'cliente_grau_relacao','')), '')
                   else v_r.cliente_grau_relacao end;
  v_caso   := case when p_dados ? 'descricao_caso'
                   then nullif(btrim(coalesce(p_dados->>'descricao_caso','')), '')
                   else v_r.descricao_caso end;
  v_ajuda  := case when p_dados ? 'ajuda_pronta'
                   then nullif(btrim(coalesce(p_dados->>'ajuda_pronta','')), '')
                   else v_r.ajuda_pronta end;

  if p_dados ? 'valor_honorarios' then
    begin
      v_valor := nullif(btrim(coalesce(p_dados->>'valor_honorarios','')), '')::numeric(12,2);
    exception when others then
      raise exception 'Informe o valor dos honorários como número.' using errcode = '22023';
    end;
  else
    v_valor := v_r.valor_honorarios;
  end if;

  -- (3) domínios fechados, com frase nossa antes de o CHECK falar
  if v_origem is not null and v_origem not in ('captacao','ja_tenho') then
    raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023';
  end if;
  if v_fase is not null and v_fase not in ('viabilidade_feita','croqui_apresentado','execucao_andamento') then
    raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023';
  end if;
  if v_grau is not null and v_grau not in ('parente','amigo','conhecido','indicacao','cliente_atual','lead') then
    raise exception 'Escolha um grau de relação da lista.' using errcode = '22023';
  end if;
  if v_valor is not null and (v_valor < 0 or v_valor > 9999999999.99) then
    raise exception 'Honorários: valor fora do limite permitido.' using errcode = '22023';
  end if;
  if v_nome is not null and char_length(v_nome) > 200 then
    raise exception 'O nome do cliente passa de 200 caracteres.' using errcode = '22023';
  end if;
  if v_tel is not null and (char_length(v_tel) < 8 or char_length(v_tel) > 40) then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;
  if v_caso is not null and char_length(v_caso) > 4000 then
    raise exception 'A descrição passa de 4.000 caracteres.' using errcode = '22023';
  end if;
  if v_ajuda is not null and char_length(v_ajuda) > 4000 then
    raise exception 'O texto passa de 4.000 caracteres.' using errcode = '22023';
  end if;

  -- (4) coerência com o CHECK `onboarding_fase_so_com_cliente`: voltar para
  -- "vem da captação" apaga a fase que a pessoa tinha escolhido. Sem isto, a
  -- constraint estouraria com 23514 e o aluno leria uma frase genérica sobre
  -- um campo que nem está na tela dele.
  if v_origem is distinct from 'ja_tenho' then
    v_fase := null;
  end if;

  insert into gps.onboarding_respostas as o (
    pessoa_aluno_id, ambiente_aluno_id, passo_atual,
    origem_cliente1, fase_cliente1, valor_honorarios,
    cliente_nome, cliente_telefone, cliente_grau_relacao,
    descricao_caso, ajuda_pronta
  ) values (
    v_pessoa, v_ambiente, v_passo,
    v_origem, v_fase, v_valor,
    v_nome, v_tel, v_grau,
    v_caso, v_ajuda
  )
  on conflict (pessoa_aluno_id) do update
     set passo_atual          = greatest(o.passo_atual, excluded.passo_atual),
         origem_cliente1      = excluded.origem_cliente1,
         fase_cliente1        = excluded.fase_cliente1,
         valor_honorarios     = excluded.valor_honorarios,
         cliente_nome         = excluded.cliente_nome,
         cliente_telefone     = excluded.cliente_telefone,
         cliente_grau_relacao = excluded.cliente_grau_relacao,
         descricao_caso       = excluded.descricao_caso,
         ajuda_pronta         = excluded.ajuda_pronta;
  -- `ambiente_aluno_id` NÃO entra no `do update`: a resposta continua contando
  -- a verdade de onde a pessoa estava quando respondeu.

  if v_novo then
    -- O único evento deste passo, e só na primeira gravação.
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (v_ambiente, now(), 'onboarding_iniciado', 'onboarding', null,
       'Começou o questionário inicial',
       jsonb_build_object('pessoa_aluno_id', v_pessoa, 'versao', 1),
       'aluno', auth.uid(), 'app');
  end if;

  return jsonb_build_object('passo_atual',
    (select r.passo_atual from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa));
end $function$;

comment on function gps.onboarding_salvar_passo(smallint, jsonb) is
  'Upsert do rascunho do questionario da PESSOA logada. ALLOWLIST de 8 chaves: chave desconhecida ABORTA com 22023 (ignorar em silencio faria um erro de digitacao no front virar "salvou" sem salvar) -- e e o que impede uma chamada forjada carimbar concluido_em/cliente_id/versao. passo_atual so avanca (greatest): voltar uma tela para reler nao regride a retomada. Escolher "vem da captacao" LIMPA fase_cliente1, para o CHECK onboarding_fase_so_com_cliente nao estourar 23514 sobre um campo que nem esta na tela. Grava o evento onboarding_iniciado UMA vez, na criacao da linha.';

revoke execute on function gps.onboarding_salvar_passo(smallint, jsonb) from public, anon;
grant  execute on function gps.onboarding_salvar_passo(smallint, jsonb) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. gps.onboarding_registrar_anexo
-- ═════════════════════════════════════════════════════════════════════════
--
-- Molde literal de `gps.chamado_gravar_mensagem` (...111): o que o objeto
-- REALMENTE é (storage.objects.metadata) vence o que o cliente declarou.
--
-- 🔴 DEPENDÊNCIA DE PRIVILÉGIO: a conferência lê `storage.objects`. O dono da
-- função (postgres) tem esse privilégio hoje (M5 confirmou). Se um dia não
-- tiver, o `exception when insufficient_privilege` recusa o anexo em vez de
-- gravá-lo sem conferir.

create or replace function gps.onboarding_registrar_anexo(
  p_tipo    text,
  p_path    text,
  p_nome    text,
  p_mime    text,
  p_tamanho integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pessoa    uuid;
  v_ambiente  uuid;
  v_r         gps.onboarding_respostas%rowtype;
  v_existe    boolean;
  v_meta_size bigint;
  v_meta_mime text;
  v_mime      text;
  v_tamanho   integer;
  v_ext       text;
  v_nome      text;
  v_qtd       integer;
  v_id        uuid;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();

  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;
  if not found then
    raise exception 'Responda o questionário antes de anexar.' using errcode = '22023';
  end if;
  if v_r.concluido_em is not null then
    raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023';
  end if;

  if p_tipo not in ('contrato_honorarios','documento') then
    raise exception 'tipo de anexo invalido' using errcode = '22023';
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then
    raise exception 'Nome de arquivo inválido.' using errcode = '22023';
  end if;

  -- (1) POSSE: o prefixo tem de ser o AMBIENTE desta pessoa.
  if coalesce(p_path,'') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'
  then
    raise exception 'anexo em caminho invalido' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> v_ambiente::text then
    raise exception 'anexo nao pertence a este ambiente' using errcode = '42501';
  end if;

  -- (2)/(3) EXISTÊNCIA e METADADOS REAIS.
  begin
    select true,
           nullif(o.metadata->>'size','')::bigint,
           nullif(o.metadata->>'mimetype','')
      into v_existe, v_meta_size, v_meta_mime
      from storage.objects o
     where o.bucket_id = 'gps-onboarding'
       and o.name = p_path;
  exception when insufficient_privilege then
    raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
  end;

  if not coalesce(v_existe, false) then
    raise exception 'anexo nao encontrado' using errcode = '42501';
  end if;

  v_mime    := coalesce(v_meta_mime, p_mime);
  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;

  if v_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then
    raise exception 'formato de anexo nao aceito' using errcode = '22023';
  end if;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
    raise exception 'anexo maior que 5 MB' using errcode = '22023';
  end if;

  -- (4) extensão x MIME
  v_ext := lower(regexp_replace(p_path, '^.*\.', ''));
  if not (
       (v_mime = 'image/png'       and v_ext = 'png')
    or (v_mime = 'image/jpeg'      and v_ext in ('jpg','jpeg'))
    or (v_mime = 'image/webp'      and v_ext = 'webp')
    or (v_mime = 'application/pdf' and v_ext = 'pdf')
  ) then
    raise exception 'extensao do anexo nao confere com o tipo do arquivo' using errcode = '22023';
  end if;

  if p_tipo = 'contrato_honorarios' then
    -- SUBSTITUI o anterior (o índice único parcial só permite um).
    -- ⚠️ A linha sai; o BYTE fica no bucket até o expurgo do admin (B-R1) —
    -- SQL não apaga arquivo no object store, e fingir que apaga é pior do que
    -- não apagar.
    delete from gps.onboarding_anexos a
     where a.pessoa_aluno_id = v_pessoa and a.tipo = 'contrato_honorarios';
  else
    select count(*) into v_qtd
      from gps.onboarding_anexos a
     where a.pessoa_aluno_id = v_pessoa and a.tipo = 'documento';
    if v_qtd >= 5 then
      raise exception 'Você já anexou 5 documentos.' using errcode = '42501';
    end if;
  end if;

  insert into gps.onboarding_anexos (pessoa_aluno_id, tipo, path, nome, mime, tamanho)
  values (v_pessoa, p_tipo, p_path, v_nome, v_mime, v_tamanho)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'tipo', p_tipo, 'nome', v_nome,
                            'mime', v_mime, 'tamanho', v_tamanho, 'path', p_path);
end $function$;

comment on function gps.onboarding_registrar_anexo(text, text, text, text, integer) is
  'Grava a linha do anexo DEPOIS de conferir o objeto: prefixo do caminho = ambiente da pessoa, objeto existe no bucket gps-onboarding, e tamanho/MIME lidos de storage.objects.metadata (o que o cliente declara e fallback, nunca a fonte) casando com a extensao. contrato_honorarios SUBSTITUI o anterior (indice unico parcial); documento tem teto de 5. So enquanto o questionario estiver em andamento. A linha some na substituicao, mas o BYTE fica no bucket ate o expurgo do admin -- SQL nao apaga arquivo no object store.';

revoke execute on function gps.onboarding_registrar_anexo(text, text, text, text, integer) from public, anon;
grant  execute on function gps.onboarding_registrar_anexo(text, text, text, text, integer) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. gps.onboarding_remover_anexo
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.onboarding_remover_anexo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_pessoa uuid; v_tipo text;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'anexo nao informado' using errcode = '22023';
  end if;

  if exists (select 1 from gps.onboarding_respostas r
              where r.pessoa_aluno_id = v_pessoa and r.concluido_em is not null) then
    raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023';
  end if;

  -- `pessoa_aluno_id = v_pessoa` DENTRO do delete: zero linha vira P0002, nunca
  -- sucesso silencioso sobre o anexo de outra pessoa.
  delete from gps.onboarding_anexos a
   where a.id = p_id and a.pessoa_aluno_id = v_pessoa
   returning a.tipo into v_tipo;

  if v_tipo is null then
    raise exception 'Anexo não encontrado.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', p_id, 'tipo', v_tipo);
end $function$;

comment on function gps.onboarding_remover_anexo(uuid) is
  'Tira a LINHA do anexo da lista da pessoa. O arquivo continua no bucket ate o expurgo do admin (B-R1): a Storage API exige sessao e o GPS nao usa service_role, e apagar a linha de storage.objects por SQL NAO apaga o byte. A tela diz isso -- fingir que o arquivo sumiu seria mentira.';

revoke execute on function gps.onboarding_remover_anexo(uuid) from public, anon;
grant  execute on function gps.onboarding_remover_anexo(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. gps.onboarding_concluir — ATÔMICA
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.onboarding_concluir()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pessoa     uuid;
  v_ambiente   uuid;
  v_r          gps.onboarding_respostas%rowtype;
  v_fase_cli   text;
  v_ordem      integer;
  v_cliente    uuid;
  v_favoritado boolean := false;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then
    raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501';
  end if;

  -- `for update`: duas conclusões simultâneas da MESMA pessoa (duplo clique,
  -- duas abas) serializam aqui em vez de criarem dois clientes.
  select * into v_r from gps.onboarding_respostas r
   where r.pessoa_aluno_id = v_pessoa for update;
  if not found then
    raise exception 'Responda o questionário antes de concluir.' using errcode = '22023';
  end if;
  if v_r.concluido_em is not null then
    raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023';
  end if;
  if v_r.origem_cliente1 is null then
    raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023';
  end if;

  if v_r.origem_cliente1 = 'ja_tenho' then
    if v_r.fase_cliente1 is null then
      raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023';
    end if;
    if coalesce(btrim(v_r.cliente_nome), '') = '' then
      raise exception 'Informe o nome do seu cliente 1.' using errcode = '22023';
    end if;

    -- 🔴 O GATE do João: "Execução em andamento (Obrigatório ele informar o
    -- valor do contrato dos honorários e anexar o contrato de honorários
    -- assinado, sem isso ele não pode avançar)".
    if v_r.fase_cliente1 = 'execucao_andamento' then
      if v_r.valor_honorarios is null then
        raise exception 'Informe o valor dos honorários pactuados para seguir.'
          using errcode = '22023';
      end if;
      if not exists (select 1 from gps.onboarding_anexos a
                      where a.pessoa_aluno_id = v_pessoa
                        and a.tipo = 'contrato_honorarios') then
        raise exception 'Anexe o contrato de honorários assinado para seguir.'
          using errcode = '22023';
      end if;
    end if;

    -- Mapa resposta → fase do cliente (C-1: NENHUMA fase nova). O mesmo mapa
    -- vive em FASES_CLIENTE1_UI (src/lib/etapa1.ts) — dois lugares, um por
    -- camada, e os dois dizem o mesmo.
    v_fase_cli := case v_r.fase_cliente1
                    when 'viabilidade_feita'   then 'fechamento'
                    when 'croqui_apresentado'  then 'fechamento'
                    when 'execucao_andamento'  then 'contratado'
                  end;

    select coalesce(max(c.ordem), 0) + 1 into v_ordem
      from gps.etapa1_clientes c where c.aluno_id = v_ambiente;

    insert into gps.etapa1_clientes
      (aluno_id, nome, telefone, grau_relacao, fase, valor_honorarios, ordem)
    values
      (v_ambiente, btrim(v_r.cliente_nome), v_r.cliente_telefone,
       v_r.cliente_grau_relacao, v_fase_cli, v_r.valor_honorarios, v_ordem)
    returning id into v_cliente;
    -- ↑ a trigger de captura grava `cliente_cadastrado` sozinha.

    -- FAVORITA se e somente se o ambiente ainda não tem favorito (§B.1): o
    -- segundo sócio a responder NÃO derruba a estrela do primeiro.
    -- Por UPDATE, e não no INSERT acima, de propósito: é o ramo de UPDATE da
    -- trigger de captura que grava `cliente_favoritado` — favoritar no INSERT
    -- deixaria a trilha sem essa linha.
    if not exists (select 1 from gps.etapa1_clientes c
                    where c.aluno_id = v_ambiente and c.acompanhado_equipe) then
      begin
        update gps.etapa1_clientes set acompanhado_equipe = true where id = v_cliente;
        v_favoritado := true;
      exception when unique_violation then
        -- CORRIDA: outra conclusão do mesmo ambiente favoritou entre o `not
        -- exists` e o `update`. O índice único parcial
        -- `etapa1_clientes_unico_equipe` é a garantia. Aqui a resposta certa
        -- NÃO é abortar (o cliente é bom e já existe): é seguir sem a estrela,
        -- que é exatamente a regra do parágrafo acima. O bloco é uma
        -- subtransação: só o `update` volta.
        v_favoritado := false;
      end;
    end if;
  end if;

  update gps.onboarding_respostas
     set concluido_em = now(),
         cliente_id   = v_cliente,
         passo_atual  = 9
   where pessoa_aluno_id = v_pessoa;

  -- O ÚNICO evento que esta função grava. `cliente_cadastrado` e
  -- `cliente_favoritado` já vieram da trigger de captura.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_ambiente, now(), 'onboarding_concluido', 'onboarding', null,
     'Concluiu o questionário inicial',
     jsonb_build_object('pessoa_aluno_id', v_pessoa,
                        'origem_cliente1', v_r.origem_cliente1,
                        'fase_cliente1',   v_r.fase_cliente1,
                        'cliente_id',      v_cliente,
                        'favoritado',      v_favoritado),
     'aluno', auth.uid(), 'app');

  return jsonb_build_object('cliente_id', v_cliente, 'favoritado', v_favoritado);
end $function$;

comment on function gps.onboarding_concluir() is
  'Fecha o questionario da PESSOA logada, TUDO OU NADA. Valida a obrigatoriedade que o Joao chamou de fundamental (execucao em andamento => valor_honorarios E anexo contrato_honorarios) -- o banco e a garantia, a UI e conveniencia. Quando a origem e ja_tenho, cria o cliente 1 em gps.etapa1_clientes com nome/telefone/grau_relacao/fase (mapa de C-1: viabilidade_feita e croqui_apresentado -> fechamento; execucao_andamento -> contratado)/valor_honorarios/ordem=max+1, e FAVORITA so se o ambiente ainda nao tiver favorito. Nao duplica evento: cliente_cadastrado e cliente_favoritado vem da trigger de captura (...008); aqui so nasce onboarding_concluido. NAO cobra nada, nao manda e-mail e nao muda situacao financeira -- o "apto ao saldo" e derivado e e sinal para a equipe.';

revoke execute on function gps.onboarding_concluir() from public, anon;
grant  execute on function gps.onboarding_concluir() to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. gps.admin_onboarding_do_aluno — o que a EQUIPE vê
-- ═════════════════════════════════════════════════════════════════════════
--
-- Uma linha por PESSOA do ambiente (titular + sócios), respondida ou não —
-- "ninguém respondeu ainda" é um resultado, e some da tela se a função só
-- devolvesse quem respondeu. O `path` do anexo vai junto para a tela montar a
-- URL assinada com `download=` (nunca inline).

create or replace function gps.admin_onboarding_do_aluno(p_aluno_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_saida jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
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

comment on function gps.admin_onboarding_do_aluno(uuid) is
  'O questionario inicial de TODAS as pessoas de um ambiente (titular + socios), respondido ou nao -- "ninguem respondeu ainda" e um resultado e some da tela se a funcao so devolvesse quem respondeu. Traz o `path` de cada anexo para a tela montar a URL assinada com download= (NUNCA inline; a lecao e que o MIME vem do que o cliente declarou no PUT). gp_is_admin() ou 42501. So leitura, zero linha de log.';

revoke execute on function gps.admin_onboarding_do_aluno(uuid) from public, anon;
grant  execute on function gps.admin_onboarding_do_aluno(uuid) to authenticated;
