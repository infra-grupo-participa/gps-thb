-- Minuta da ficha do cliente ganha CONTEXTO obrigatório (17/09/2026).
--
-- ORIGEM DO PEDIDO: mensagem da equipe para o João, sobre o cliente Alfredo
--   Mattos — "Confirmar com o João se o campo para registro do caso que
--   iremos acompanhar para o devido anexo das minutas para análise (enquanto
--   o gerador não está pronto) foi colocado no sistema. Ele precisa enviar
--   uma minuta por vez. Descreva o caso, o que foi feito e qual o primeiro
--   ponto que ele precisa de ajuda."
--
-- DECISÕES DO MARCIO (17/09/2026, fechadas):
--   1. 1ª minuta do cliente: 3 campos OBRIGATÓRIOS (caso, o_que_foi_feito,
--      ponto_de_ajuda).
--   2. 2ª em diante: OBRIGATÓRIO o_que_mudou.
--   3. Nada trava envio em sequência -- "uma por vez" é orientação de TELA,
--      não bloqueio de banco.
--   4. A EQUIPE TAMBÉM ANEXA, com o MESMO formulário -- admin preenche igual
--      ao parceiro, sem exceção de regra. A RPC não distingue quem é para
--      efeito de obrigatoriedade (só distingue para gravar
--      `enviado_pela_equipe`, que já existia).
--   5. Teto de 2000 caracteres por campo -- mesmo teto de `notas`.
--   6. Um caso por cliente -- `cliente_id` é o escopo de "é a primeira?".
--
--
-- ═════════════════════════════════════════════════════════════════════════
-- ✅ APLICADA E PROVADA EM PRODUÇÃO — 17/09/2026
-- ═════════════════════════════════════════════════════════════════════════
-- ⚠️ Como as …266 e …268: o banco registra MAIS entradas do que este
--    diretório tem arquivos (limite de tamanho por chamada do MCP):
--      gps_minuta_contexto_colunas_e_check
--      (a RPC de anexar foi reescrita por replace sobre pg_get_functiondef)
--      gps_minuta_contexto_grants_da_rpc
--    Conteúdo equivalente, histórico diferente. A verdade do que está no ar
--    é `pg_get_functiondef`, nunca este arquivo.
--
-- 🔑 A RPC de anexar foi reescrita PROGRAMATICAMENTE (replace sobre a
--    definição viva, abortando se a âncora não existisse), não à mão: ela
--    valida storage, MIME, tamanho e posse do path, e reescrever isso
--    manualmente é onde se perde comportamento sem perceber.
--
-- TESTE FUNCIONAL, 7 casos, em `begin; … rollback;` (string ÚNICA — o MCP é
-- AUTOCOMMIT, begin/rollback em chamadas separadas NÃO protege):
--   1ª sem contexto                      → recusou ✓
--   1ª com os 3 campos                   → gravou ✓
--   2ª sem o_que_mudou                   → recusou ✓
--   2ª MANDANDO os 3 da 1ª (burla)       → recusou ✓
--   2ª com o_que_mudou                   → gravou ✓
--   os 3 da 1ª foram ANULADOS na 2ª      → sim ✓
--   total gravado                        → 2 ✓
--   interruptor desligado → anexa sem contexto (ramo 3 do CHECK) ✓
--   produção conferida após o rollback: 0 minutas, 0 objetos, 0 eventos.
--
-- AUDITORIA (security-pentester, 17/09/2026): APROVADO, sem achado crítico
-- nem alto. Confirmado em produção: `gps.minuta_contexto_obrigatorio()` não
-- é executável por `anon`; `authenticated` tem só SELECT em
-- `gps.cliente_minutas`; existe uma única policy, de leitura;
-- `gps.config_definir` guarda com `gp_is_admin()` (aluno não desliga o
-- interruptor); as 4 colunas novas NÃO entram em `gps.admin_clientes_lista`
-- nem em `gps.dossie_do_cliente` (ambas com allowlist explícita de colunas).
--
-- 🔴 DÍVIDA PRÉ-EXISTENTE REGISTRADA (da …259, NÃO desta migração):
--    a policy `gps_minutas_insert` aceita QUALQUER prefixo para admin — um
--    admin pode subir arquivo no prefixo de um ambiente que não abriu. O
--    objeto fica ÓRFÃO: a RPC valida `split_part(p_path,'/',1)` contra o
--    ambiente DO CLIENTE e recusa vinculá-lo. Conserto sugerido pelo
--    pentester, para quando for tratado: `exists (select 1 from
--    gps.etapa1_clientes where aluno_id = prefixo)` dentro de
--    `gps.pode_anexar_minuta`.
--
-- MEDIÇÕES ANTES DE ESCREVER (17/09/2026 -- momento mais barato, tabela
--   vazia): `select count(*) from gps.cliente_minutas` = 0. Assinaturas
--   vigentes: `gps.cliente_minuta_anexar(uuid,text,text,integer,text)` e
--   `gps.cliente_minuta_remover(uuid)`, UMA cada, sem sobrecarga. CHECKs
--   vigentes: chk_cliente_minutas_nome/_notas/_path/_tamanho. Índice
--   `cliente_minutas_cliente_idx (cliente_id, enviado_em desc)` já cobre o
--   predicado desta feature (nenhuma coluna nova entra no WHERE/ORDER BY).
--   `gps.pode_anexar_minuta` já aceita admin -- coerente com a decisão 4.
--   🔴 GRANT medido: `authenticated` tinha INSERT/SELECT/UPDATE/DELETE na
--   tabela -- mesmo achado do pentester em `gps.entrevista_tentativas`
--   (`grant select` não revoga o default do schema). Nenhuma policy de
--   INSERT/UPDATE/DELETE existe em `gps.cliente_minutas` (só a de SELECT,
--   ver migração ...259) -- não há caminho de escrita direta hoje, mas o
--   GRANT abria a porta pelo PostgREST sem passar pela RPC. Corrigido no
--   bloco 6.
--
-- POR QUE TABELA (NÃO TIPO ENUM/DOMÍNIO) E CHECK DE 3 RAMOS, SEM SUBQUERY
--   `0A000` é fato conhecido deste banco: CHECK não aceita subquery. A
--   "primeira minuta" só se sabe consultando `count(*)`, então essa decisão
--   TEM de morar na RPC (que já faz `select ... for update`), nunca no CHECK
--   -- o CHECK aqui só garante a FORMA (o lado certo preenchido, o lado
--   errado NULO), não a REGRA de negócio "é a primeira?".
--
-- REVERSÃO (nesta ordem):
--   revoke insert, update, delete on gps.cliente_minutas from authenticated; -- fica revogado, é o estado correto
--   drop function gps.cliente_minuta_anexar(uuid, text, text, integer, text, text, text, text, text);
--   -- recriar a assinatura antiga (5 args) a partir da migração ...259 se for reverter de fato
--   delete from gps.config where chave = 'minuta_contexto_obrigatorio';
--   -- e reverter o `p_chave not in (...)` de gps.config_definir para a lista da ...260 (sem minuta_contexto_obrigatorio)
--   alter table gps.cliente_minutas drop constraint chk_cliente_minutas_contexto;
--   alter table gps.cliente_minutas drop constraint chk_cliente_minutas_caso_tam;
--   alter table gps.cliente_minutas drop constraint chk_cliente_minutas_feito_tam;
--   alter table gps.cliente_minutas drop constraint chk_cliente_minutas_ponto_tam;
--   alter table gps.cliente_minutas drop constraint chk_cliente_minutas_mudou_tam;
--   alter table gps.cliente_minutas drop column caso, drop column o_que_foi_feito,
--     drop column ponto_de_ajuda, drop column o_que_mudou;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Quatro colunas novas -- nullable, CHECK de tamanho SEPARADO do de forma
-- ═════════════════════════════════════════════════════════════════════════
--
-- Tamanho em CHECK próprio (não misturado ao de forma): se os dois
-- estivessem no mesmo CHECK, a mensagem de erro do banco mentiria sobre QUAL
-- das duas regras foi violada -- `traduzirErroBanco` casa por igualdade
-- exata de texto, não por qual constraint disparou.

alter table gps.cliente_minutas
  add column if not exists caso             text,
  add column if not exists o_que_foi_feito   text,
  add column if not exists ponto_de_ajuda    text,
  add column if not exists o_que_mudou       text;

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_caso_tam
  check (caso is null or char_length(caso) <= 2000);

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_feito_tam
  check (o_que_foi_feito is null or char_length(o_que_foi_feito) <= 2000);

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_ponto_tam
  check (ponto_de_ajuda is null or char_length(ponto_de_ajuda) <= 2000);

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_mudou_tam
  check (o_que_mudou is null or char_length(o_que_mudou) <= 2000);

-- CHECK de FORMA, três ramos, SEM subquery (0A000 -- este banco não aceita
-- subquery em CHECK; "é a primeira?" é decidido na RPC, não aqui):
--   ramo 1 -- minuta de contexto "1ª vez": os 3 preenchidos, o_que_mudou NULO;
--   ramo 2 -- minuta de contexto "demais vezes": só o_que_mudou preenchido,
--     os 3 da 1ª NULOS;
--   ramo 3 -- EXISTE SÓ PARA O INTERRUPTOR DESLIGADO (minuta_contexto_obrigatorio
--     = false): os 4 campos NULOS, minuta sem contexto nenhum, como era antes
--     desta migração. NÃO remover este ramo achando que é descuido -- sem
--     ele, desligar o interruptor quebraria toda gravação de minuta (a RPC
--     passaria a inserir os 4 campos NULL e o CHECK recusaria).
alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_contexto
  check (
       (caso is not null and o_que_foi_feito is not null and ponto_de_ajuda is not null and o_que_mudou is null)
    or (caso is null and o_que_foi_feito is null and ponto_de_ajuda is null and o_que_mudou is not null)
    or (caso is null and o_que_foi_feito is null and ponto_de_ajuda is null and o_que_mudou is null)
  );

comment on constraint chk_cliente_minutas_contexto on gps.cliente_minutas is
  'Forma do contexto da minuta (decisao do Marcio, 17/09/2026): ramo 1 = 1a minuta do cliente (caso+o_que_foi_feito+ponto_de_ajuda preenchidos, o_que_mudou NULO); ramo 2 = 2a em diante (so o_que_mudou preenchido, os 3 da 1a NULOS); ramo 3 = os 4 NULOS, e EXISTE SO PARA O INTERRUPTOR gps.config.minuta_contexto_obrigatorio DESLIGADO -- nao remover achando descuido, sem ele desligar o interruptor quebra todo INSERT de minuta. Qual ramo vale e decidido pela RPC gps.cliente_minuta_anexar (conta as minutas do cliente e anula o lado errado), nunca por subquery no CHECK (0A000, este banco nao aceita).';

comment on column gps.cliente_minutas.caso is
  'So preenchido na 1a minuta do cliente (obrigatorio quando gps.config.minuta_contexto_obrigatorio=true). Resposta a pedido do Joao (17/09/2026): "Descreva o caso". Ate 2000 caracteres.';
comment on column gps.cliente_minutas.o_que_foi_feito is
  'So preenchido na 1a minuta do cliente (obrigatorio quando gps.config.minuta_contexto_obrigatorio=true). Resposta a pedido do Joao (17/09/2026): "o que foi feito". Ate 2000 caracteres.';
comment on column gps.cliente_minutas.ponto_de_ajuda is
  'So preenchido na 1a minuta do cliente (obrigatorio quando gps.config.minuta_contexto_obrigatorio=true). Resposta a pedido do Joao (17/09/2026): "qual o primeiro ponto que ele precisa de ajuda". Ate 2000 caracteres.';
comment on column gps.cliente_minutas.o_que_mudou is
  'So preenchido a partir da 2a minuta do cliente (obrigatorio quando gps.config.minuta_contexto_obrigatorio=true). Ate 2000 caracteres.';
comment on column gps.cliente_minutas.notas is
  'Complemento OPCIONAL de quem enviou sobre ESTA versao -- NAO e mais o campo de "o que mudou" (isso agora e a coluna o_que_mudou, obrigatoria a partir da 2a minuta). NAO validado nem comparado pelo sistema. Ate 2000 caracteres (CHECK).';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. gps.cliente_minuta_anexar -- assinatura NOVA, a antiga é DROPADA antes
-- ═════════════════════════════════════════════════════════════════════════
--
-- 🔴 `create or replace` com assinatura diferente CRIA SOBRECARGA -- a
-- action antiga continuaria chamando a de 5 args e a obrigatoriedade seria
-- contornável pelo PostgREST. DROP explícito da assinatura de 5 args ANTES
-- do CREATE da de 9.

drop function if exists gps.cliente_minuta_anexar(uuid, text, text, integer, text);

create or replace function gps.cliente_minuta_anexar(
  p_cliente_id       uuid,
  p_path             text,
  p_nome             text,
  p_tamanho          integer,
  p_notas            text default null,
  p_caso             text default null,
  p_o_que_foi_feito  text default null,
  p_ponto_de_ajuda   text default null,
  p_o_que_mudou      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_c              record;
  v_admin          boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente       uuid    := gps.aluno_atual();
  v_existe         boolean;
  v_meta_size      bigint;
  v_meta_mime      text;
  v_tamanho        integer;
  v_nome           text;
  v_notas          text;
  v_caso           text;
  v_o_que_foi_feito text;
  v_ponto_de_ajuda text;
  v_o_que_mudou    text;
  v_obrigatorio    boolean;
  v_primeira       boolean;
  v_qtd            integer;
  v_id             uuid;
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

  -- AUTORIZAÇÃO: dono do ambiente OU admin. Nada vindo do cliente escolhe de
  -- quem é a ficha -- `v_ambiente` sai do JWT, dentro do banco.
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then
    raise exception 'Nome de arquivo inválido.' using errcode = '22023';
  end if;

  v_notas := nullif(btrim(coalesce(p_notas, '')), '');
  if v_notas is not null and char_length(v_notas) > 2000 then
    raise exception 'Notas da minuta muito longas.' using errcode = '22023';
  end if;

  v_caso            := nullif(btrim(coalesce(p_caso, '')), '');
  v_o_que_foi_feito := nullif(btrim(coalesce(p_o_que_foi_feito, '')), '');
  v_ponto_de_ajuda  := nullif(btrim(coalesce(p_ponto_de_ajuda, '')), '');
  v_o_que_mudou     := nullif(btrim(coalesce(p_o_que_mudou, '')), '');

  if v_caso is not null and char_length(v_caso) > 2000 then
    raise exception 'A descrição do caso passa de 2000 caracteres.' using errcode = '22023';
  end if;
  if v_o_que_foi_feito is not null and char_length(v_o_que_foi_feito) > 2000 then
    raise exception 'O texto de "o que foi feito" passa de 2000 caracteres.' using errcode = '22023';
  end if;
  if v_ponto_de_ajuda is not null and char_length(v_ponto_de_ajuda) > 2000 then
    raise exception 'O texto do ponto de ajuda passa de 2000 caracteres.' using errcode = '22023';
  end if;
  if v_o_que_mudou is not null and char_length(v_o_que_mudou) > 2000 then
    raise exception 'O texto do que foi alterado passa de 2000 caracteres.' using errcode = '22023';
  end if;

  -- (1) POSSE: o prefixo tem de ser o AMBIENTE DESTE CLIENTE -- não o de
  -- quem chama. Para o aluno é o mesmo valor; para o ADMIN, é o que impede
  -- vincular na ficha de um aluno um arquivo que vive no prefixo de outro.
  if coalesce(p_path,'') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then
    raise exception 'anexo em caminho invalido' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> v_c.aluno_id::text then
    raise exception 'anexo nao pertence a este ambiente' using errcode = '42501';
  end if;

  -- (2)/(3) EXISTÊNCIA e METADADOS REAIS.
  begin
    select true,
           nullif(o.metadata->>'size','')::bigint,
           nullif(o.metadata->>'mimetype','')
      into v_existe, v_meta_size, v_meta_mime
      from storage.objects o
     where o.bucket_id = 'gps-minutas'
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

  -- ═══ A TRAVA DO CONTEXTO OBRIGATÓRIO (decisão do Marcio, 17/09/2026) ═══
  --
  -- `for update` SERIALIZA por cliente ANTES do count: envio em sequência é
  -- caso de uso normal (decisão 3) e dois envios simultâneos do mesmo
  -- cliente poderiam ambos se achar "a primeira" sem este lock -- a corrida
  -- importa aqui porque o `count(*)` sozinho não é atômico com o INSERT
  -- seguinte.
  perform 1 from gps.etapa1_clientes where id = p_cliente_id for update;
  if not found then
    -- 🔴 Achado do security-pentester (17/09/2026): `perform` NÃO levanta erro
    -- em zero linhas. Se o cliente for excluído entre o SELECT inicial e este
    -- lock, a função seguiria sem lock real e o INSERT adiante falharia por
    -- violação de FK -- erro CRU, sem frase traduzida por `traduzirErroBanco`.
    -- Janela estreita, sem impacto de segurança, mas uma linha fecha.
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  v_obrigatorio := coalesce(
    (select valor from gps.config where chave = 'minuta_contexto_obrigatorio'),
    'true'
  ) <> 'false';

  select count(*) into v_qtd from gps.cliente_minutas where cliente_id = p_cliente_id;
  v_primeira := v_qtd = 0;

  if v_obrigatorio then
    if v_primeira then
      if v_caso is null then
        raise exception 'Descreva o caso para enviar a primeira minuta.' using errcode = '22023';
      end if;
      if v_o_que_foi_feito is null then
        raise exception 'Informe o que já foi feito no caso.' using errcode = '22023';
      end if;
      if v_ponto_de_ajuda is null then
        raise exception 'Informe o primeiro ponto em que você precisa de ajuda.' using errcode = '22023';
      end if;
      -- Anula o lado errado -- é isto que fecha a porta do PostgREST: sem
      -- isso, mandar os 4 campos na 1ª minuta cairia no CHECK com erro
      -- genérico de banco em vez desta mensagem em português.
      v_o_que_mudou := null;
    else
      if v_o_que_mudou is null then
        raise exception 'Informe o que foi alterado em relação à minuta anterior.' using errcode = '22023';
      end if;
      v_caso            := null;
      v_o_que_foi_feito := null;
      v_ponto_de_ajuda  := null;
    end if;
  else
    -- Interruptor desligado: minuta sem contexto -- ramo 3 do CHECK.
    v_caso            := null;
    v_o_que_foi_feito := null;
    v_ponto_de_ajuda  := null;
    v_o_que_mudou     := null;
  end if;

  insert into gps.cliente_minutas
    (cliente_id, path, nome, tamanho, notas, enviado_por, enviado_pela_equipe,
     caso, o_que_foi_feito, ponto_de_ajuda, o_que_mudou)
  values
    (p_cliente_id, p_path, v_nome, v_tamanho, v_notas, auth.uid(), v_admin,
     v_caso, v_o_que_foi_feito, v_ponto_de_ajuda, v_o_que_mudou)
  returning id into v_id;

  -- Evento na trilha. `rotulo` é o nome do CLIENTE (padrão da trigger de
  -- captura, ...092); `detalhe` NÃO leva o nome do arquivo nem as notas/
  -- contexto (podem conter texto sensível sobre o cliente do aluno).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_minuta_anexada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('minuta_id', v_id, 'tamanho', v_tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('id', v_id, 'cliente_id', p_cliente_id, 'path', p_path,
                            'nome', v_nome, 'tamanho', v_tamanho);
end $function$;

comment on function gps.cliente_minuta_anexar(uuid, text, text, integer, text, text, text, text, text) is
  'Grava uma NOVA VERSAO de minuta na ficha do cliente DEPOIS de conferir o objeto (prefixo=aluno_id do ambiente, existe no bucket gps-minutas, tamanho/MIME reais de storage.objects.metadata). Autorizacao: dono do ambiente OU admin -- a EQUIPE TAMBEM ANEXA com o MESMO formulario (decisao do Marcio, 17/09/2026), a RPC nao distingue quem para efeito de obrigatoriedade de contexto. Contexto obrigatorio (gps.config.minuta_contexto_obrigatorio, default true): 1a minuta do cliente exige caso+o_que_foi_feito+ponto_de_ajuda (o_que_mudou fica NULO); da 2a em diante exige o_que_mudou (os 3 da 1a ficam NULOS) -- "e a primeira?" e count(*) sob `select ... for update` em etapa1_clientes, serializado por cliente para envio simultaneo nao colidir. NAO substitui -- cada chamada INSERE uma linha nova (historico); para tirar uma versao existe gps.cliente_minuta_remover. Grava o evento cliente_minuta_anexada. A trava do favorito (...203/...215) NAO bloqueia aqui: minuta e FICHA, nao VINCULO.';

revoke execute on function gps.cliente_minuta_anexar(uuid, text, text, integer, text, text, text, text, text) from public, anon;
grant  execute on function gps.cliente_minuta_anexar(uuid, text, text, integer, text, text, text, text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Interruptor minuta_contexto_obrigatorio em gps.config (default true)
-- ═════════════════════════════════════════════════════════════════════════

insert into gps.config (chave, valor)
values ('minuta_contexto_obrigatorio', 'true')
on conflict (chave) do nothing;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Allowlist de gps.config_definir ganha a chave nova (12ª)
-- ═════════════════════════════════════════════════════════════════════════
--
-- Lista COMPLETA vigente em 17/09/2026 (as 11 da migração ...260, sem
-- alteração desde então -- conferido: nenhuma migração entre ...260 e esta
-- toca gps.config_definir) + 1 nova = 12.

create or replace function gps.config_definir(p_chave text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_chave is null or p_chave not in (
    'chamados_aberto',
    'chamados_categorias_ativo',
    'convite_socio_ativo',
    'entrada_codigo_ativa',
    'plantao_inscricao_aberta',
    'resgate_ativo',
    'slack_mencoes_ativo',
    'socio_cadastro_obrigatorio',
    'troca_email_login_ativa',
    'tutoriais_ativo',
    'videos_ativo',
    -- ── Contexto obrigatório na minuta (17/09/2026) ──
    'minuta_contexto_obrigatorio'
  ) then
    raise exception 'Este interruptor não existe.' using errcode = '22023';
  end if;

  if p_valor not in ('true', 'false') then
    raise exception 'Este interruptor só aceita ligado ou desligado.' using errcode = '22023';
  end if;

  insert into gps.config (chave, valor, atualizado_por)
  values (p_chave, p_valor, auth.uid())
  on conflict (chave) do update
    set valor = excluded.valor,
        atualizado_por = excluded.atualizado_por;
  -- gps.config já tem trigger trg_config_atualizado_em (migração ...110)
  -- cuidando de atualizado_em — não repetir aqui.

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'interruptor_alterado',
    null,
    format('interruptor "%s" definido para %s', p_chave, p_valor),
    auth.uid()
  );
end;
$$;

comment on function gps.config_definir(text, text) is
  'gp_is_admin() ou 42501. UNICA porta de escrita em gps.config pelo painel (/admin). Allowlist FECHADA de 12 chaves booleanas (11 da migracao ...260 + minuta_contexto_obrigatorio da ...273) -- qualquer outra chave (inclusive resend_api_key e resgate_codigo) e recusada com 22023, antes mesmo de tocar a tabela. p_valor so aceita "true"/"false". Grava trilha em gps.acessos_log (acao=interruptor_alterado, aluno_id NULL -- nao ha aluno-alvo, coluna aceita null), com quem alterou (feito_por=auth.uid()) e o que mudou em detalhe (texto).';

revoke execute on function gps.config_definir(text, text) from public, anon;
grant  execute on function gps.config_definir(text, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. Trilha do Diário (Etapa 05 / aluno_eventos) -- NÃO TOCADA
-- ═════════════════════════════════════════════════════════════════════════
-- Os tipos 'cliente_minuta_anexada'/'cliente_minuta_removida' já existem no
-- CHECK de gps.aluno_eventos.tipo desde a migração ...259 -- nada novo aqui.

-- ═════════════════════════════════════════════════════════════════════════
-- 6. Grants -- fecha a escrita direta em gps.cliente_minutas (achado do
--    Marcio, mesma classe do pentester em gps.entrevista_tentativas)
-- ═════════════════════════════════════════════════════════════════════════
--
-- 🔴 `grant select` (migração ...259) NÃO revoga o default do schema: o
-- GRANT vigente media authenticated com INSERT/SELECT/UPDATE/DELETE.
-- Nenhuma policy de INSERT/UPDATE/DELETE existe na tabela (só
-- cliente_minutas_select, ver migração ...259) -- não havia caminho de
-- escrita direta hoje porque a RLS nega por padrão sem policy permissiva,
-- mas o GRANT abria a porta assim que uma policy de escrita aparecesse (ou
-- para quem tem outro papel que passe pela RLS). Escrita legítima é só pela
-- RPC SECURITY DEFINER (gps.cliente_minuta_anexar/_remover, que roda como
-- dono e não passa pelo GRANT do chamador).

revoke insert, update, delete on gps.cliente_minutas from authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- SUSTENTABILIDADE (as 5 perguntas, protocolo)
-- ═════════════════════════════════════════════════════════════════════════
--   ESCALA: nenhuma query nova por N. A trava conta `gps.cliente_minutas`
--     filtrado por `cliente_id` (índice `cliente_minutas_cliente_idx` já
--     cobre) -- custo é POR CLIENTE (poucas minutas por cliente, não a base
--     inteira), não cresce com o total de clientes do sistema.
--   ÍNDICE: nenhum índice novo. `cliente_minutas_cliente_idx (cliente_id,
--     enviado_em desc)` já existia (migração ...259) e já cobre exatamente o
--     predicado do `count(*) where cliente_id = $1` desta trava -- ver o
--     `explain (analyze, buffers)` colado no relato do backend.
--   FREQUÊNCIA: 1 envio de minuta = 1 chamada da RPC = 1 SELECT FOR UPDATE +
--     1 COUNT + 1 INSERT + 1 INSERT (trilha). Não há cron nem chamada em
--     loop.
--   REPETIÇÃO: não há N telas chamando esta RPC pela mesma minuta -- é um
--     clique de upload por vez (mesmo sem catraca de "uma por vez", decisão
--     3, não é o tipo de tela que dispara N chamadas simultâneas da MESMA
--     ação).
--   REVERSÃO: ver o bloco de reversão no topo do arquivo -- o interruptor
--     desliga sem deploy (`update gps.config set valor='false' where
--     chave='minuta_contexto_obrigatorio'`, ou pela tela de /admin depois
--     que o front ganhar a entrada), e a função tem `drop` documentado.
