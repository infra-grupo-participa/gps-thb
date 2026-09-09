-- Chamados — as RPCs de escrita (a ÚNICA porta de escrita das duas tabelas).
--
-- MOTIVAÇÃO: `gps.chamados` e `gps.chamado_mensagens` nasceram (migração ...110)
-- com `grant select` e NENHUMA policy de insert/update/delete. Sem estas
-- funções ninguém escreve nada -- é de propósito: assunto imutável, thread não
-- editável e `status` DERIVADO no servidor, não digitado pelo cliente.
--
-- PAPEL É DERIVADO, NUNCA INFORMADO: `gp_is_admin()` -> 'equipe'; membro do
-- ambiente -> 'aluno'; ninguém mais -> 42501. Não existe parâmetro de papel nas
-- funções públicas, então não existe caminho para forjar `autor_papel='equipe'`.
--
-- E-MAIL ACOMPANHA A TRANSIÇÃO DE STATUS, NÃO A MENSAGEM: cinco mensagens
-- seguidas do aluno geram UM aviso. É a trava anti-flood embutida no modelo, e
-- não um contador que alguém teria de manter. As funções DEVOLVEM para quem
-- avisar (`avisar`/`avisar_equipe`) e NÃO mandam e-mail: envio dentro de
-- transação de banco trava a escrita quando a Resend cai (mesma decisão da
-- Fase 8 do Plantão).
--
-- ANEXO — as cinco conferências que só a função pode fazer (o CHECK da tabela
-- garante o FORMATO do caminho, nunca a POSSE nem a EXISTÊNCIA):
--   1) os 4 campos do anexo vêm juntos ou nenhum vem;
--   2) o prefixo do caminho é o `aluno_id` DO CHAMADO (não o que o cliente
--      quiser): sem isto, o aluno A gravaria na thread dele um caminho do
--      ambiente de B e a policy de leitura de storage entregaria o arquivo de B
--      a quem vê a thread de A;
--   3) o objeto EXISTE em storage.objects (bucket gps-chamados) -- sem isso a
--      thread grava anexo fantasma e a tela oferece download de nada;
--   4) tamanho e MIME são lidos de `storage.objects.metadata` quando existem e
--      VENCEM o que o cliente declarou (Content-Length e Content-Type mentirosos
--      são vetor conhecido); o declarado só vale como fallback e ainda assim
--      passa pela allowlist e pelo teto de 5 MB;
--   5) a extensão do caminho tem de casar com o MIME.
--
-- 🔴 DEPENDÊNCIA DE PRIVILÉGIO: a conferência (3)/(4) lê `storage.objects`. O
-- dono destas funções (postgres) precisa de SELECT nessa tabela -- conferir com
-- `select has_table_privilege('postgres','storage.objects','select')` ANTES de
-- aplicar. Se não tiver, a função levanta 42501 "nao foi possivel validar o
-- anexo" (falha FECHADO, barulhenta) em vez de aceitar anexo não conferido.
--
-- LIMITES (no banco, não na UI): 5 chamados não-fechados por ambiente, 20
-- mensagens por chamado, 4.000 caracteres por mensagem, 5 MB por anexo.
-- Pior caso honesto declarado no plano: 5 x 20 x 5 MB = 500 MB por ambiente;
-- 125 ambientes = 62 GB teóricos. Contenção real: interruptor + expurgo (...113).
--
-- CONCORRÊNCIA: `chamado_responder` e `chamado_fechar` travam a linha do chamado
-- com `for update` antes de contar mensagem e antes de decidir a transição. Sem
-- isso, dois cliques simultâneos passariam os dois pelo limite de 20 e os dois
-- veriam o mesmo `status` antigo (dois e-mails para a mesma transição).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não manda e-mail, não apaga nada, não mexe em
-- storage (nem cria bucket nem policy -- é a ...112), não cria índice.
--
-- REVERSÃO: drop das 5 funções (a privada por último não importa; nenhuma outra
-- coisa depende delas). As tabelas ficam legíveis e congeladas -- sem RPC,
-- ninguém escreve. É um "modo somente leitura" seguro.

-- ─────────────────────────────────────────────────────────────────────────
-- 0. PRIVADA — grava a mensagem e move o status. Sem grant para ninguém.
-- ─────────────────────────────────────────────────────────────────────────
-- Existe para a regra de anexo e a de status ficarem em UM lugar só: se
-- `chamado_abrir` e `chamado_responder` repetissem a validação, uma delas
-- ficaria para trás na primeira mudança.

create or replace function gps.chamado_gravar_mensagem(
  p_chamado_id    uuid,
  p_autor_papel   text,
  p_texto         text,
  p_anexo_path    text     default null,
  p_anexo_nome    text     default null,
  p_anexo_mime    text     default null,
  p_anexo_tamanho integer  default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id     uuid;
  v_qtd          integer;
  v_prefixo      text;
  v_ext          text;
  v_meta_size    bigint;
  v_meta_mime    text;
  v_mime         text;
  v_tamanho      integer;
  v_existe       boolean;
begin
  select c.aluno_id into v_aluno_id from gps.chamados c where c.id = p_chamado_id;
  if v_aluno_id is null then
    raise exception 'chamado nao encontrado' using errcode = '42501';
  end if;

  if p_autor_papel not in ('aluno','equipe') then
    raise exception 'papel invalido' using errcode = '22023';
  end if;

  -- Texto: o CHECK da tabela também barra; aqui a mensagem sai legível em vez
  -- de `23514 violates check constraint`.
  if p_texto is null or length(btrim(p_texto)) = 0 then
    raise exception 'escreva uma mensagem' using errcode = '22023';
  end if;
  if length(btrim(p_texto)) > 4000 then
    raise exception 'a mensagem passa de 4.000 caracteres' using errcode = '22023';
  end if;

  -- Limite de 20 mensagens por chamado (vale para os dois lados: uma thread
  -- que não fecha vira canal de armazenamento).
  select count(*) into v_qtd from gps.chamado_mensagens m where m.chamado_id = p_chamado_id;
  if v_qtd >= 20 then
    raise exception 'este chamado ja tem 20 mensagens' using errcode = '42501';
  end if;

  if p_anexo_path is not null then
    if p_anexo_nome is null or p_anexo_mime is null or p_anexo_tamanho is null then
      raise exception 'anexo incompleto' using errcode = '22023';
    end if;

    -- (2) POSSE: o prefixo tem de ser o ambiente DO CHAMADO.
    v_prefixo := split_part(p_anexo_path, '/', 1);
    if v_prefixo <> v_aluno_id::text then
      raise exception 'anexo nao pertence a este chamado' using errcode = '42501';
    end if;

    -- (3)/(4) EXISTÊNCIA e METADADOS REAIS.
    begin
      select true,
             nullif(o.metadata->>'size','')::bigint,
             nullif(o.metadata->>'mimetype','')
        into v_existe, v_meta_size, v_meta_mime
        from storage.objects o
       where o.bucket_id = 'gps-chamados'
         and o.name = p_anexo_path;
    exception when insufficient_privilege then
      raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
    end;

    if not coalesce(v_existe, false) then
      raise exception 'anexo nao encontrado' using errcode = '42501';
    end if;

    -- O que o objeto REALMENTE é vence o que o cliente declarou.
    v_mime    := coalesce(v_meta_mime, p_anexo_mime);
    v_tamanho := coalesce(v_meta_size, p_anexo_tamanho::bigint)::integer;

    if v_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then
      raise exception 'formato de anexo nao aceito' using errcode = '22023';
    end if;
    if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
      raise exception 'anexo maior que 5 MB' using errcode = '22023';
    end if;

    -- (5) extensão x MIME.
    v_ext := lower(regexp_replace(p_anexo_path, '^.*\.', ''));
    if not (
         (v_mime = 'image/png'       and v_ext = 'png')
      or (v_mime = 'image/jpeg'      and v_ext in ('jpg','jpeg'))
      or (v_mime = 'image/webp'      and v_ext = 'webp')
      or (v_mime = 'application/pdf' and v_ext = 'pdf')
    ) then
      raise exception 'extensao do anexo nao confere com o tipo do arquivo' using errcode = '22023';
    end if;
  elsif p_anexo_nome is not null or p_anexo_mime is not null or p_anexo_tamanho is not null then
    raise exception 'anexo incompleto' using errcode = '22023';
  end if;

  insert into gps.chamado_mensagens
    (chamado_id, autor_id, autor_papel, texto,
     anexo_path, anexo_nome, anexo_mime, anexo_tamanho)
  values
    (p_chamado_id, auth.uid(), p_autor_papel, btrim(p_texto),
     p_anexo_path, p_anexo_nome, v_mime, v_tamanho);

  -- STATUS DERIVADO: quem escreveu por último define de quem é a bola. Responder
  -- num chamado fechado REABRE (e limpa fechado_em/fechado_por) -- vale para os
  -- dois lados; quem decide se o aluno PODE responder é chamado_responder.
  update gps.chamados c
     set status             = case when p_autor_papel = 'aluno' then 'aberto' else 'respondido' end,
         ultima_mensagem_em = now(),
         fechado_em         = null,
         fechado_por        = null
   where c.id = p_chamado_id;
end;
$$;

comment on function gps.chamado_gravar_mensagem(uuid, text, text, text, text, text, integer) is
  'PRIVADA (sem grant): valida o anexo, grava a mensagem e move o status. Chamada por gps.chamado_abrir e gps.chamado_responder -- e so por elas. Tamanho e MIME saem de storage.objects.metadata quando existem: o que o cliente declara e fallback, nunca a fonte.';

revoke execute on function gps.chamado_gravar_mensagem(uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. chamado_abrir — só o ALUNO abre
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.chamado_abrir(
  p_assunto       text,
  p_texto         text,
  p_anexo_path    text    default null,
  p_anexo_nome    text    default null,
  p_anexo_mime    text    default null,
  p_anexo_tamanho integer default null
)
returns table (chamado_id uuid, avisar_equipe text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id uuid;
  v_abertos  integer;
  v_novo     uuid;
begin
  -- O ADMIN NÃO ABRE chamado -- ele responde. Para o admin `aluno_atual()` é
  -- null, e a função recusa aqui. Sem JWT, também é null: falha FECHADO.
  v_aluno_id := gps.aluno_atual();
  if v_aluno_id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if not gps.chamados_abertos() then
    raise exception 'o suporte por chamado esta temporariamente fechado' using errcode = '42501';
  end if;

  if p_assunto is null or length(btrim(p_assunto)) < 3 or length(btrim(p_assunto)) > 120 then
    raise exception 'o assunto precisa ter de 3 a 120 caracteres' using errcode = '22023';
  end if;

  select count(*) into v_abertos
    from gps.chamados c
   where c.aluno_id = v_aluno_id and c.status <> 'fechado';
  if v_abertos >= 5 then
    raise exception 'voce ja tem 5 chamados em aberto' using errcode = '42501';
  end if;

  insert into gps.chamados (aluno_id, aberto_por, assunto)
  values (v_aluno_id, auth.uid(), btrim(p_assunto))
  returning id into v_novo;

  perform gps.chamado_gravar_mensagem(
    v_novo, 'aluno', p_texto,
    p_anexo_path, p_anexo_nome, p_anexo_mime, p_anexo_tamanho);

  -- Devolve junto a lista de e-mails da equipe: 1 ida ao banco em vez de 2, e
  -- sem expor uma RPC "leia a config" para o aluno. Chamado NOVO sempre avisa.
  return query
    select v_novo,
           nullif(btrim(coalesce(
             (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'),
             '')), '');
end;
$$;

comment on function gps.chamado_abrir(text, text, text, text, text, integer) is
  'Abre um chamado no ambiente do aluno logado (titular OU socio). Guardas: gps.aluno_atual() nao nulo (admin nao abre), interruptor gps.chamados_abertos(), 5 chamados nao-fechados por ambiente. Devolve o id e os e-mails da equipe para a action avisar DEPOIS do commit -- a funcao nao manda e-mail.';

revoke execute on function gps.chamado_abrir(text, text, text, text, text, integer) from public, anon;
grant  execute on function gps.chamado_abrir(text, text, text, text, text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. chamado_responder — aluno OU equipe, papel derivado no servidor
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.chamado_responder(
  p_chamado_id    uuid,
  p_texto         text,
  p_anexo_path    text    default null,
  p_anexo_nome    text    default null,
  p_anexo_mime    text    default null,
  p_anexo_tamanho integer default null
)
returns table (status_novo text, avisar text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chamado    gps.chamados%rowtype;
  v_papel      text;
  v_status_ant text;
  v_novo       text;
  v_avisar     text;
begin
  -- `for update`: trava a linha antes de ler o status e de contar mensagem.
  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    -- Mesma mensagem para "não existe" e "não é seu": enumerar em laço não
    -- distingue os dois casos.
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if public.gp_is_admin() then
    v_papel := 'equipe';
  elsif gps.aluno_atual() = v_chamado.aluno_id then
    v_papel := 'aluno';
  else
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if v_papel = 'aluno' then
    -- Interruptor fecha a ENTRADA (abrir e responder), nunca a saída: a equipe
    -- continua respondendo e fechando o que já existe.
    if not gps.chamados_abertos() then
      raise exception 'o suporte por chamado esta temporariamente fechado' using errcode = '42501';
    end if;
    if v_chamado.status = 'fechado' then
      -- 7 dias, e não 180: reabrir um chamado cujo anexo já foi expurgado
      -- devolveria uma thread com arquivo morto. O prazo de reabertura tem de
      -- caber FOLGADO dentro do de retenção.
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

  -- `avisar` SÓ na transição. Sem mudança de status, ninguém é avisado.
  if v_papel = 'aluno' and v_status_ant <> 'aberto' then
    v_avisar := nullif(btrim(coalesce(
      (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'), '')), '');
  elsif v_papel = 'equipe' and v_status_ant <> 'respondido' then
    v_avisar := coalesce(
      (select u.email from auth.users u where u.id = v_chamado.aberto_por),
      (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));
  else
    v_avisar := null;
  end if;

  return query select v_novo, v_avisar;
end;
$$;

comment on function gps.chamado_responder(uuid, text, text, text, text, integer) is
  'Responde na thread. Papel DERIVADO no servidor (gp_is_admin -> equipe; membro do ambiente -> aluno; ninguem mais -> 42501): o cliente nunca informa quem e. O aluno so responde com o interruptor aberto e, se o chamado estiver fechado, dentro de 7 dias (responder REABRE). Devolve `avisar` SO quando o status mudou -- e a trava anti-flood do e-mail.';

revoke execute on function gps.chamado_responder(uuid, text, text, text, text, integer) from public, anon;
grant  execute on function gps.chamado_responder(uuid, text, text, text, text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. chamado_fechar — admin ou dono do ambiente, idempotente
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.chamado_fechar(p_chamado_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_chamado gps.chamados%rowtype;
begin
  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if not (public.gp_is_admin() or gps.aluno_atual() = v_chamado.aluno_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  -- Idempotente: fechar duas vezes não é erro nem mexe em fechado_em/por.
  if v_chamado.status = 'fechado' then
    return;
  end if;

  -- Fechar NÃO passa pelo interruptor: desligar a entrada não pode impedir
  -- ninguém de encerrar o que já está aberto.
  update gps.chamados c
     set status      = 'fechado',
         fechado_em  = now(),
         fechado_por = auth.uid()
   where c.id = p_chamado_id;
end;
$$;

comment on function gps.chamado_fechar(uuid) is
  'Fecha o chamado. Admin OU dono do ambiente. Idempotente (ja fechado = no-op). Nao passa pelo interruptor: fechar e saida, nao entrada.';

revoke execute on function gps.chamado_fechar(uuid) from public, anon;
grant  execute on function gps.chamado_fechar(uuid) to authenticated;
