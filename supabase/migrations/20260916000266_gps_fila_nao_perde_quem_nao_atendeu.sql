-- Fatia B da esteira: a fila de ligações PARA DE PERDER quem não atendeu.
--
-- Hoje `gps.entrevista_gravar` grava resultado como coluna ÚNICA em
-- `gps.etapa1_clientes` (`entrevista_resultado`) e `gps.fila_de_ligacoes`
-- filtra só `entrevista_resultado is null`. Efeito medido: um "não atendeu"
-- grava resultado, o cliente sai da fila para sempre — a ligação que mais
-- precisa de retentativa é a que desaparece primeiro.
--
-- Decisões do Marcio (16/09/2026), FECHADAS:
--   1. Uma LINHA POR TENTATIVA (tabela nova `gps.entrevista_tentativas`) —
--      `entrevista_resultado` em `etapa1_clientes` deixa de ser o predicado
--      da fila e passa a significar só "resultado da ÚLTIMA tentativa".
--   2. Teto de 3 `nao_atendeu` CONSECUTIVAS encerra o cliente da fila
--      ('sem_contato'). Qualquer tentativa que NÃO seja `nao_atendeu` ZERA o
--      contador — quem já atendeu não é "sem contato".
--   3. `remarcar` exige `retorno_em` (recusa 22023 sem data, e recusa data
--      no passado).
--   4. Lista "sem contato" aceita nova tentativa direto (encerrado por TETO
--      não é encerrado por DESFECHO): se a 4ª ligação der `interessado` ou
--      `remarcar`, volta para a fila normal. Já encerrado por DESFECHO
--      (`interessado`/`sem_interesse`) recusa — regravar apagaria o
--      desfecho.
--   5. Retorno VENCIDO sobe ao topo da fila (mais antigo primeiro), depois
--      o resto por ordem de criação (FIFO).
--   6. Nota de qualidade 1-5 por LIGAÇÃO (coluna da tabela de tentativas,
--      opcional).
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 COMO ESTA MIGRAÇÃO FOI APLICADA (leia antes de recriar o banco)
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ ESTE ARQUIVO É UM, MAS O BANCO REGISTRA QUATRO.
--
-- O agente que escreveu este SQL não tinha acesso ao banco. O orquestrador
-- aplicou em 16/09/2026 pelo MCP do Supabase, em 4 blocos (limite de
-- tamanho por chamada), e `supabase_migrations.schema_migrations` guardou:
--
--   20260916201249  gps_fila_nao_perde_quem_nao_atendeu_estrutura
--   20260916201321  gps_fila_nao_perde_quem_nao_atendeu_entrevista_gravar
--   20260916201346  gps_fila_nao_perde_quem_nao_atendeu_fila_3_modos
--   20260916201401  gps_aluno_eventos_cliente_entrevista_sem_contato
--
-- O CONTEÚDO é equivalente ao deste arquivo (mesmos objetos, mesmos
-- comentários, mesmos grants). O que diverge é só o HISTÓRICO: recriar a
-- base a partir deste diretório aplica 1 entrada onde produção tem 4.
-- Não quebra nada — mas não presuma que o `schema_migrations` de produção
-- espelha o nome deste arquivo. A verdade do que está no ar é
-- `pg_get_functiondef`/`pg_get_constraintdef`, não este arquivo.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ✅ PROVAS MEDIDAS NO BANCO (16/09/2026, produção) — não são pendências
-- ═══════════════════════════════════════════════════════════════════════
-- As migrações …261-…264 registraram "PROVA PENDENTE — NÃO MEDIDA". Esta
-- mediu. O que foi conferido ANTES de aplicar:
--
--   Seq Scan isolado do predicado antigo : 0,677 ms (Buffers: shared hit=56)
--     ⚠️ uma 1ª medição deu 38 ms — era CACHE FRIO, não bloat. Medir 2×.
--   n_live_tup / n_dead_tup              : 1593 / 194, autovacuum 11/09
--     → tabela SAUDÁVEL: NÃO criar índice em etapa1_clientes, NÃO vacuum.
--   resultados já gravados               : (null)=35 → ZERO desfechos
--     → migração de dados VAZIA: os 35 seguem na fila pelos defaults
--       (sem_contato=0, retorno=null, encerrada=false). Momento mais barato
--       possível: um mês depois seria preciso inventar tentativa sintética.
--   CHECK de gps.aluno_eventos.tipo      : 35 valores, lidos ao vivo com
--     pg_get_constraintdef e comparados 1 a 1 com a lista deste arquivo:
--     ZERO sumiriam, ZERO sobrando. (A lição "CHECK reescrito de memória
--     apaga valor em silêncio" já custou caro aqui — foi conferida.)
--
-- CONFERIDO DEPOIS de aplicar:
--   fila_de_ligacoes : 35 ANTES / 35 DEPOIS — ninguém perdido na virada.
--   assinaturas      : UMA de cada RPC (o `drop` antes do `create` evitou
--                      a sobrecarga que deixaria a action chamando a velha).
--   teste funcional em `begin; … rollback;` (string ÚNICA — o MCP é
--   AUTOCOMMIT e begin/rollback em chamadas separadas NÃO protege):
--     1ª nao_atendeu → fica na fila (35)          ✓
--     3ª nao_atendeu → sai (34), entra sem_contato ✓
--     histórico                                   → 3 linhas ✓
--     4ª = remarcar  → volta, vai p/ agendados     ✓
--     contador zera ao falar com a pessoa          ✓
--     remarcar sem data / após desfecho → recusa   ✓
--     qualidade 1-5                                → grava ✓
--   produção conferida após o rollback: tudo zerado.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE TABELA NOVA E NÃO SÓ AJUSTAR A COLUNA ÚNICA
-- ═══════════════════════════════════════════════════════════════════════
-- `entrevista_resultado` é 1 valor por cliente — perde toda tentativa
-- anterior. Sem histórico não dá para contar "3 nao_atendeu CONSECUTIVAS"
-- nem mostrar `ultima_tentativa_em`/`ultimo_resultado` na fila. Uma linha por
-- tentativa é o único desenho que sustenta as 6 decisões do Marcio.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE 3 COLUNAS DERIVADAS EM `etapa1_clientes` (E NÃO CALCULAR NA HORA)
-- ═══════════════════════════════════════════════════════════════════════
-- `gps.fila_de_ligacoes` roda para a fila INTEIRA da equipe (cross-ambiente,
-- sem filtro por aluno_id). Calcular "últimas 3 tentativas consecutivas" por
-- linha, para cada chamada da fila, é `left join lateral` com `order by ...
-- limit 3` POR CLIENTE — custo que cresce com o tamanho da fila a cada
-- abertura de tela. As 3 colunas são mantidas pela ÚNICA função que escreve
-- (`gps.entrevista_gravar`, security definer) — o mesmo padrão de
-- `selecionado_entrevista`/`acompanhado_equipe`: fila lê coluna, nunca agrega
-- na leitura.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE DUAS CONSTRAINTS SEM SUBQUERY (não CHECK cruzado num só)
-- ═══════════════════════════════════════════════════════════════════════
-- CHECK não aceita subquery (0A000, lição já paga neste projeto). As duas
-- constraints abaixo, em conjunto, equivalem a um XOR: `remarcar` SEMPRE tem
-- `retorno_em`; qualquer outro resultado NUNCA tem. `retorno_em` no passado é
-- recusado pela RPC (22023), não pelo CHECK — CHECK não pode comparar contra
-- `now()` (não é IMMUTABLE) sem armar outra bomba.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE A POLICY DE SELECT USA `gps.eh_equipe()` E NÃO `gp_is_admin()`
-- ═══════════════════════════════════════════════════════════════════════
-- O operador puro (`gps.operadores`, ativo=true, sem registro em
-- `public.perfis`) faz a ligação e precisa LER a fila e o histórico de
-- tentativas — é o trabalho dele. `gp_is_admin()` exclui operador puro.
-- 🔴 A policy de SELECT de `gps.entrevista_gravar`/`gps.fila_de_ligacoes` na
-- migração `…262` original usava `gp_is_admin()` antes de a `…264` corrigir
-- as RPCs para `eh_equipe()` — mas a policy de SELECT de
-- `gps.cliente_decisores` (`…262`) e o CHECK/grant que dependem só de
-- `public.gp_is_admin()` para leitura direta continuam com o defeito
-- pré-existente (nenhuma foi migrada para `eh_equipe()` na `…264`, que só
-- trocou a guarda das 3 RPCs). Reportado aqui, como pedido — NÃO corrigido
-- nesta migração (fora de escopo da Fatia B).
--
-- ═══════════════════════════════════════════════════════════════════════
-- REVERSÃO (nesta ordem):
-- ═══════════════════════════════════════════════════════════════════════
--   drop function if exists gps.fila_de_ligacoes(integer, integer, text);
--   drop function if exists gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint);
--   -- (as duas linhas acima recriam as versões da …264, se necessário: ver
--   --  o corpo integral em supabase/migrations/20260915000264_gps_operadores_e_dossie.sql)
--   alter table gps.aluno_eventos drop constraint aluno_eventos_tipo_check;
--   alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check
--     check (tipo in (<lista da …263, sem cliente_entrevista_sem_contato>));
--   comment on column gps.etapa1_clientes.entrevista_resultado is
--     '<comentário original da …262, ver aquele arquivo>';
--   alter table gps.etapa1_clientes drop column entrevista_encerrada;
--   alter table gps.etapa1_clientes drop column entrevista_retorno_em;
--   alter table gps.etapa1_clientes drop column entrevista_tentativas_sem_contato;
--   drop table if exists gps.entrevista_tentativas;

-- ═══════════════════════════════════════════════════════════════════════════
-- B.1) gps.entrevista_tentativas — uma linha por tentativa de ligação
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.entrevista_tentativas (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references gps.etapa1_clientes(id) on delete cascade,
  tentativa_em   timestamptz not null default now(),
  tentativa_por  uuid references auth.users(id) on delete set null,
  resultado      text not null,
  qualidade      smallint,
  observacoes    text,
  retorno_em     timestamptz,
  constraint chk_entrevista_tentativas_resultado
    check (resultado in ('interessado', 'sem_interesse', 'nao_atendeu', 'remarcar')),
  constraint chk_entrevista_tentativas_qualidade
    check (qualidade is null or qualidade between 1 and 5),
  constraint chk_entrevista_tentativas_observacoes_tamanho
    check (observacoes is null or char_length(observacoes) <= 2000),
  -- Coerência remarcar <-> retorno_em, SEM subquery (0A000): as duas juntas
  -- equivalem a um XOR. Data no passado é validada pela RPC (CHECK não pode
  -- comparar contra now(), não é IMMUTABLE).
  constraint chk_entrevista_tentativas_remarcar_tem_retorno
    check (resultado <> 'remarcar' or retorno_em is not null),
  constraint chk_entrevista_tentativas_so_remarcar_tem_retorno
    check (resultado = 'remarcar' or retorno_em is null)
);

comment on table gps.entrevista_tentativas is
  'Uma linha POR TENTATIVA de ligacao da entrevista previa (decisao Marcio 16/09/2026, Fatia B). Substitui o predicado da fila que antes vivia so em etapa1_clientes.entrevista_resultado (1 valor, perdia toda tentativa anterior). Escrita SO por gps.entrevista_gravar (security definer) -- sem policy de insert/update/delete. Leitura: gps.eh_equipe() (admin OU operador ativo) -- operador puro precisa ler para trabalhar a fila.';

comment on column gps.entrevista_tentativas.observacoes is
  'Anotacao do OPERADOR sobre ESTA ligacao. HERDA a regra de LGPD de entrevista_observacoes/registro_contato (migracoes …255/…262): FORA da fila (gps.fila_de_ligacoes), FORA do CSV -- so no dossie e na ficha individual do cliente.';

comment on column gps.entrevista_tentativas.qualidade is
  'Nota de qualidade 1-5 da ligacao (opcional, decisao Marcio 16/09/2026) -- E POR LIGACAO, nao por cliente. Juizo sobre o atendimento: mesma trava de LGPD/sensibilidade de observacoes -- FORA da fila e do CSV, so dossie e ficha.';

-- Índice pelo predicado que a única leitura por cliente usa: histórico de
-- tentativas de UM cliente (ficha/dossiê), mais recente primeiro.
-- MEDIÇÃO (ver EXPLAIN colado no fim do arquivo, seção "B.1 índice"):
create index entrevista_tentativas_cliente_idx
  on gps.entrevista_tentativas (cliente_id, tentativa_em desc);

alter table gps.entrevista_tentativas enable row level security;

create policy gps_entrevista_tentativas_select on gps.entrevista_tentativas
  for select
  using (gps.eh_equipe());

-- 🔴 GRANT explícito: `service_role` não dispensa RLS nem GRANT neste
-- projeto (schema `gps` exposto no PostgREST). `revoke` primeiro, sempre.
-- Nenhuma policy de insert/update/delete: a única escrita é a RPC
-- `gps.entrevista_gravar` (security definer), que revoga o resto abaixo.
-- 🔴 ACHADO DO PENTESTER (16/09/2026), corrigido no mesmo dia:
--    `grant select` NÃO revoga o que o schema já concede. A tabela nasceu com
--    INSERT/UPDATE/DELETE liberados a `authenticated` — o `revoke all` abaixo
--    só cobria `public`/`anon`. A RLS barrava na prática (medido: INSERT
--    direto como authenticated gravou 0 linhas, só há policy de SELECT), mas
--    isso deixava a RLS como DEFESA ÚNICA: uma policy de INSERT criada por
--    engano no futuro encontraria o GRANT já aberto.
--
--    REGRA PARA TODA TABELA NOVA NO SCHEMA `gps`: revogar de `authenticated`
--    explicitamente, não só de public/anon. Prova de que o padrão do schema é
--    permissivo: `gps.etapa1_clientes` dá DELETE, INSERT, SELECT, UPDATE a
--    `authenticated`. A única escrita legítima aqui é gps.entrevista_gravar
--    (security definer), que roda como owner e não depende deste grant.
revoke all on gps.entrevista_tentativas from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on gps.entrevista_tentativas from authenticated;
grant select on gps.entrevista_tentativas to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- B.2) 3 colunas derivadas em gps.etapa1_clientes
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.etapa1_clientes
  add column if not exists entrevista_tentativas_sem_contato smallint not null default 0,
  add column if not exists entrevista_retorno_em timestamptz,
  add column if not exists entrevista_encerrada boolean not null default false;

comment on column gps.etapa1_clientes.entrevista_tentativas_sem_contato is
  'Contador de nao_atendeu CONSECUTIVAS (decisao Marcio 16/09/2026, Fatia B). Qualquer tentativa que NAO seja nao_atendeu ZERA o contador. Teto 3 encerra o cliente (entrevista_encerrada=true) e ele sai da fila para a lista "sem_contato". Escrita SO por gps.entrevista_gravar. Leitura: gps.fila_de_ligacoes (modo sem_contato) e dossie.';

comment on column gps.etapa1_clientes.entrevista_retorno_em is
  'Data/hora do retorno pedido (resultado=remarcar da ULTIMA tentativa). Retorno VENCIDO (<= now()) sobe ao topo da fila normal; retorno futuro joga o cliente para a lista "agendados". Escrita SO por gps.entrevista_gravar -- fica null de novo se a tentativa seguinte nao for remarcar.';

comment on column gps.etapa1_clientes.entrevista_encerrada is
  'true quando o cliente sai da fila normal: por DESFECHO (resultado=interessado ou sem_interesse) ou por TETO (3 nao_atendeu consecutivas). Encerrado por TETO aceita nova tentativa direto (volta para a fila se o resultado novo nao for nao_atendeu); encerrado por DESFECHO RECUSA nova tentativa (gps.entrevista_gravar da 22023) -- regravar apagaria o desfecho. Escrita SO por gps.entrevista_gravar. Leitura: gps.fila_de_ligacoes (os 3 modos).';

comment on column gps.etapa1_clientes.entrevista_resultado is
  'Resultado da ULTIMA tentativa de ligacao (historico completo em gps.entrevista_tentativas, migracao …266). NAO e mais o predicado da fila desde 16/09/2026 -- ver entrevista_encerrada/entrevista_tentativas_sem_contato/entrevista_retorno_em. Catalogo FECHADO: interessado | sem_interesse | nao_atendeu | remarcar. FORA do returns table de gps.admin_clientes_lista e do CSV -- so aparece na ficha e no dossie. Escrita so por gps.entrevista_gravar.';

-- ═══════════════════════════════════════════════════════════════════════════
-- B.3) gps.entrevista_gravar — assinatura nova (drop-before-create: mudar a
--      assinatura com `create or replace` criaria SOBREGARGA, ficando duas
--      funções vivas e a action antiga continuando a chamar a velha).
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists gps.entrevista_gravar(uuid, text, text, text, jsonb);

create function gps.entrevista_gravar(
  p_cliente_id   uuid,
  p_resultado    text,
  p_disc         text default null,
  p_observacoes  text default null,
  p_decisores    jsonb default null,        -- array de {nome, papel_no_negocio?, principal?}; null = não mexe no conjunto
  p_retorno_em   timestamptz default null,   -- obrigatório quando p_resultado = 'remarcar'
  p_qualidade    smallint default null       -- 1..5, opcional, por LIGAÇÃO
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cliente       record;
  v_observacoes   text;
  v_decisor       jsonb;
  v_nome          text;
  v_papel         text;
  v_principal     boolean;
  v_qtd_gravados  integer := 0;
  v_sem_contato   smallint;
  v_encerrada     boolean;
  v_retorno       timestamptz;
  v_tentativa_num integer;
begin
  if not gps.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  if p_resultado is null or p_resultado not in ('interessado', 'sem_interesse', 'nao_atendeu', 'remarcar') then
    raise exception 'Escolha um resultado válido para a ligação.' using errcode = '22023';
  end if;

  if p_disc is not null and p_disc not in ('D', 'I', 'S', 'C') then
    raise exception 'Perfil DISC inválido.' using errcode = '22023';
  end if;

  if p_qualidade is not null and (p_qualidade < 1 or p_qualidade > 5) then
    raise exception 'A nota de qualidade vai de 1 a 5.' using errcode = '22023';
  end if;

  -- Decisão 3: `remarcar` exige data futura; qualquer outro resultado não
  -- carrega retorno_em (mesmo XOR das constraints da tabela de tentativas).
  if p_resultado = 'remarcar' then
    if p_retorno_em is null then
      raise exception 'Informe a data do retorno para remarcar.' using errcode = '22023';
    end if;
    if p_retorno_em <= now() then
      raise exception 'A data do retorno precisa ser no futuro.' using errcode = '22023';
    end if;
    v_retorno := p_retorno_em;
  else
    v_retorno := null;
  end if;

  v_observacoes := nullif(btrim(coalesce(p_observacoes, '')), '');
  if v_observacoes is not null and char_length(v_observacoes) > 2000 then
    raise exception 'As observações passam de 2000 caracteres.' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.selecionado_entrevista,
         c.entrevista_encerrada, c.entrevista_tentativas_sem_contato
    into v_cliente
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- DECISÃO (E, herdada da …262): só grava entrevista de quem está no funil
  -- dos 5 selecionados pelo parceiro.
  if not v_cliente.selecionado_entrevista then
    raise exception 'Este cliente não está entre os selecionados para a entrevista prévia.' using errcode = '22023';
  end if;

  -- Decisão 4: encerrado por DESFECHO recusa (regravar apagaria o desfecho).
  -- Encerrado por TETO aceita direto -- não precisa reabrir nada à parte, a
  -- própria tentativa nova decide se o cliente volta para a fila.
  if v_cliente.entrevista_encerrada
     and v_cliente.entrevista_tentativas_sem_contato < 3 then
    raise exception 'Este cliente já teve a entrevista encerrada com um desfecho. Para reabrir, ajuste a ficha diretamente.' using errcode = '22023';
  end if;

  -- Decisão 2: contador de nao_atendeu CONSECUTIVAS. Qualquer outro
  -- resultado zera. Teto 3 encerra (sem_contato); interessado/sem_interesse
  -- encerram por desfecho, independente do contador.
  if p_resultado = 'nao_atendeu' then
    v_sem_contato := v_cliente.entrevista_tentativas_sem_contato + 1;
  else
    v_sem_contato := 0;
  end if;

  v_encerrada := (p_resultado in ('interessado', 'sem_interesse')) or (v_sem_contato >= 3);

  -- INSERT na tabela de tentativas — o registro histórico, nunca sobrescrito.
  insert into gps.entrevista_tentativas
    (cliente_id, tentativa_em, tentativa_por, resultado, qualidade, observacoes, retorno_em)
  values
    (p_cliente_id, now(), auth.uid(), p_resultado, p_qualidade, v_observacoes, v_retorno);

  -- Número real da tentativa (total histórico deste cliente, já incluindo a
  -- que acabou de ser inserida) -- não usar o contador de sem_contato aqui,
  -- que zera a cada resultado diferente de nao_atendeu e mentiria o total.
  select count(*) into v_tentativa_num
    from gps.entrevista_tentativas
   where cliente_id = p_cliente_id;

  -- UPDATE único: resultado da ÚLTIMA tentativa + as 3 colunas derivadas +
  -- DISC (só se veio) + ligacao_realizada. A trigger de captura já existente
  -- (aluno_eventos_capturar_etapa1_clientes) grava sozinha cliente_ligacao ao
  -- ver ligacao_realizada virar true -- não repetimos aqui (idempotente:
  -- tentativas seguintes não disparam de novo, já está true).
  update gps.etapa1_clientes
     set entrevista_resultado             = p_resultado,
         entrevista_observacoes           = v_observacoes,
         entrevista_em                    = now(),
         entrevista_por                   = auth.uid(),
         perfil_disc                      = coalesce(p_disc, perfil_disc),
         ligacao_realizada                = true,
         entrevista_tentativas_sem_contato = v_sem_contato,
         entrevista_retorno_em            = v_retorno,
         entrevista_encerrada             = v_encerrada
   where id = p_cliente_id;

  -- Evento com o RESULTADO da tentativa (mesmo padrão da …262: "o que ela
  -- disse", não "que ela ligou" -- isso já é cliente_ligacao pela trigger).
  -- observacoes NUNCA entra no detalhe -- dado sensível, fora da trilha.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_cliente.aluno_id, now(), 'cliente_entrevista_registrada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_cliente.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('resultado', p_resultado, 'tentativa', v_tentativa_num),
     'equipe', auth.uid(), 'app');

  -- Evento próprio quando o teto de 3 nao_atendeu estoura nesta chamada.
  if v_sem_contato >= 3 and v_cliente.entrevista_tentativas_sem_contato < 3 then
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, ator, ator_user_id, origem)
    values
      (v_cliente.aluno_id, now(), 'cliente_entrevista_sem_contato', 'cliente', p_cliente_id,
       left(coalesce(nullif(btrim(v_cliente.nome), ''), 'Cliente sem nome'), 300),
       'equipe', auth.uid(), 'app');
  end if;

  -- Decisores: null = não mexe no conjunto; array (mesmo vazio) SUBSTITUI o
  -- conjunto inteiro -- mesmo padrão de gps.selecao_entrevista_definir.
  if p_decisores is not null then
    if jsonb_typeof(p_decisores) <> 'array' then
      raise exception 'Lista de decisores inválida.' using errcode = '22023';
    end if;

    delete from gps.cliente_decisores where cliente_id = p_cliente_id;

    for v_decisor in select * from jsonb_array_elements(p_decisores)
    loop
      v_nome := nullif(btrim(coalesce(v_decisor->>'nome', '')), '');
      if v_nome is null then
        raise exception 'Todo decisor precisa de nome.' using errcode = '22023';
      end if;
      if char_length(v_nome) > 200 then
        raise exception 'O nome do decisor passa de 200 caracteres.' using errcode = '22023';
      end if;

      v_papel := nullif(btrim(coalesce(v_decisor->>'papel_no_negocio', '')), '');
      if v_papel is not null and char_length(v_papel) > 200 then
        raise exception 'O papel do decisor no negócio passa de 200 caracteres.' using errcode = '22023';
      end if;

      v_principal := coalesce((v_decisor->>'principal')::boolean, false);

      insert into gps.cliente_decisores
        (cliente_id, nome, papel_no_negocio, principal, criado_por)
      values
        (p_cliente_id, v_nome, v_papel, v_principal, auth.uid());

      v_qtd_gravados := v_qtd_gravados + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'cliente_id', p_cliente_id,
    'resultado', p_resultado,
    'tentativas_sem_contato', v_sem_contato,
    'encerrada', v_encerrada,
    'retorno_em', v_retorno,
    'decisores_gravados', v_qtd_gravados
  );
end;
$function$;

comment on function gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint) is
  'Grava UMA TENTATIVA de ligacao da entrevista previa (Fatia B, decisao Marcio 16/09/2026): insere em gps.entrevista_tentativas (historico) e recalcula as 3 colunas derivadas de gps.etapa1_clientes. Guarda gps.eh_equipe() ou 42501. remarcar exige p_retorno_em futuro (22023 sem data ou com data no passado). Teto de 3 nao_atendeu CONSECUTIVAS encerra (sem_contato); qualquer outro resultado zera o contador. Encerrado por DESFECHO (interessado/sem_interesse) recusa nova tentativa; encerrado por TETO aceita. p_decisores null = nao mexe no conjunto; array (mesmo vazio) SUBSTITUI. p_qualidade 1..5 opcional, por LIGACAO. observacoes/qualidade/decisores NUNCA saem desta RPC/da ficha para lista agregada (LGPD).';

revoke all on function gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint) from public, anon;
grant execute on function gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- B.4) gps.fila_de_ligacoes — ganha p_modo ('fila' | 'sem_contato' | 'agendados')
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists gps.fila_de_ligacoes(integer, integer);

create function gps.fila_de_ligacoes(
  p_limite integer default 100,
  p_offset integer default 0,
  p_modo   text default 'fila'
)
returns table (
  cliente_id            uuid,
  cliente_nome          text,
  telefone              text,
  parceiro_nome         text,
  grau_relacao          text,
  favorito              boolean,
  perfil_disc           text,
  tentativas_total      integer,
  tentativas_sem_contato smallint,
  ultima_tentativa_em   timestamptz,
  ultimo_resultado      text,
  retorno_em            timestamptz,
  total_linhas          bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_limite integer;
  v_offset integer;
begin
  if not gps.eh_equipe() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_modo is null or p_modo not in ('fila', 'sem_contato', 'agendados') then
    raise exception 'Modo de fila inválido.' using errcode = '22023';
  end if;

  -- Mesmo teto de admin_clientes_lista (…255): serve o universo do filtro
  -- numa única chamada, sem paginar em N idas ao banco.
  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  with base as (
    select
      c.id,
      c.nome,
      c.telefone,
      t.nome as parceiro_nome,
      c.grau_relacao,
      c.acompanhado_equipe,
      c.perfil_disc,
      c.criado_em,
      c.entrevista_tentativas_sem_contato,
      c.entrevista_retorno_em,
      c.entrevista_resultado
    from gps.etapa1_clientes c
    -- LEFT, não INNER (mesma lição paga da …255): cadastro do parceiro
    -- sumindo de thb_alunos não pode fazer o cliente sumir da fila/contagem.
    left join public.thb_alunos t on t.id = c.aluno_id
    where c.selecionado_entrevista
      and (
        (p_modo = 'fila'
          and not c.entrevista_encerrada
          and (c.entrevista_retorno_em is null or c.entrevista_retorno_em <= now()))
        or
        (p_modo = 'sem_contato'
          and c.entrevista_encerrada
          and c.entrevista_tentativas_sem_contato >= 3)
        or
        (p_modo = 'agendados'
          and not c.entrevista_encerrada
          and c.entrevista_retorno_em > now())
      )
  ),
  com_tentativas as (
    select
      b.*,
      t.tentativas_total,
      t.ultima_tentativa_em
    from base b
    left join lateral (
      select count(*)::integer as tentativas_total,
             max(et.tentativa_em) as ultima_tentativa_em
        from gps.entrevista_tentativas et
       where et.cliente_id = b.id
    ) t on true
  )
  select
    ct.id, ct.nome, ct.telefone, ct.parceiro_nome, ct.grau_relacao,
    ct.acompanhado_equipe, ct.perfil_disc,
    coalesce(ct.tentativas_total, 0), ct.entrevista_tentativas_sem_contato,
    ct.ultima_tentativa_em, ct.entrevista_resultado, ct.entrevista_retorno_em,
    (count(*) over ())::bigint as total_linhas
  from com_tentativas ct
  -- Decisão 5: no modo 'fila', retorno VENCIDO sobe ao topo (mais antigo
  -- primeiro); quem não tem retorno pendente (null) fica depois, ordenado
  -- por criado_em/id (FIFO). Nos outros modos a 1ª chave é sempre false
  -- (todo mundo empata) e a ordenação cai direto no FIFO.
  order by
    (p_modo = 'fila' and ct.entrevista_retorno_em is not null and ct.entrevista_retorno_em <= now()) desc,
    case when p_modo = 'fila' and ct.entrevista_retorno_em is not null and ct.entrevista_retorno_em <= now()
         then ct.entrevista_retorno_em end asc,
    ct.criado_em,
    ct.id
  limit v_limite offset v_offset;
end;
$function$;

comment on function gps.fila_de_ligacoes(integer, integer, text) is
  'Fila de ligacoes da entrevista previa, 3 modos (Fatia B, decisao Marcio 16/09/2026): fila (nao encerrado, sem retorno pendente futuro), sem_contato (encerrado por TETO de 3 nao_atendeu), agendados (nao encerrado, retorno futuro). Modo desconhecido -> 22023. Guarda gps.eh_equipe() ou 42501. No modo fila, retorno VENCIDO sobe ao topo (mais antigo primeiro), resto por criado_em/id (FIFO). tentativas_total por left join lateral count(*) sobre as linhas JA FILTRADAS -- ver EXPLAIN colado no fim da migracao …266; se custar, vira coluna derivada. 🔴 NAO devolve observacoes, qualidade nem decisores -- LGPD, nenhuma coluna nova pode ser PII.';

revoke all on function gps.fila_de_ligacoes(integer, integer, text) from public, anon;
grant execute on function gps.fila_de_ligacoes(integer, integer, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- B.5) `aluno_eventos.tipo` ganha 1 valor: cliente_entrevista_sem_contato.
--    Confere o NOME da constraint pelo CONTEÚDO (não pelo número da
--    migração que a criou por último) antes de reescrever -- aborta se o
--    banco tiver mudado por fora deste diretório. 35 valores vigentes na
--    …263 (32 da …262 + 3 da …263; a …264 não tocou o CHECK) + 1 novo aqui.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'aluno_eventos'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%reuniao_preliminar_contestada%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo CONTEUDO reuniao_preliminar_contestada, da migracao …263) -- migracao abortada. Leia o CHECK vigente no banco antes de reescrever esta lista.';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo in (
    'cliente_cadastrado',
    'cliente_favoritado',
    'cliente_desfavoritado',
    'cliente_status_mudou',
    'cliente_fase_mudou',
    'cliente_mensagem_padrao',
    'cliente_estudo_caso',
    'cliente_ligacao',
    'cliente_aderiu_reuniao',
    'cliente_reuniao_agendada',
    'cliente_excluido',
    'cliente_honorarios_definidos',
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa',
    'etapa_liberada_pela_equipe',
    'etapa_travada_pela_equipe',
    'onboarding_iniciado',
    'onboarding_concluido',
    'favorito_confirmado_pela_equipe',
    'favorito_liberado_pela_equipe',
    'cliente_contrato_anexado',
    'cliente_contrato_removido',
    'nota_apagada',
    'cliente_minuta_anexada',
    'cliente_minuta_removida',
    'cliente_selecionado_entrevista',
    'cliente_removido_entrevista',
    'cliente_entrevista_registrada',
    'reuniao_preliminar_proposta',
    'reuniao_preliminar_aceita',
    'reuniao_preliminar_contestada',
    -- ── Fila não perde quem não atendeu (16/09/2026, migração …266) ──
    'cliente_entrevista_sem_contato'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts. 35 valores vigentes na …263 + 1 desta migracao: cliente_entrevista_sem_contato, gravado so por gps.entrevista_gravar quando o teto de 3 nao_atendeu CONSECUTIVAS estoura. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes -- reescrever a lista de memoria apaga valores em silencio.';

-- O QUE NÃO FAZ: não cria índice em etapa1_clientes, não roda vacuum (tabela
-- saudável, medido pelo usuário), não toca no front (Fatias C/D), não toca no
-- dossiê nem em operador-tipos.ts (Fatia E), não corrige a policy de
-- gp_is_admin() pré-existente reportada acima (fora de escopo desta fatia).

-- ═══════════════════════════════════════════════════════════════════════════
-- B.6) Reload do schema no PostgREST — tabela + RPCs novas/trocadas.
-- ═══════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ EXPLAIN MEDIDO EM PRODUÇÃO — 16/09/2026, depois de aplicar
-- ═══════════════════════════════════════════════════════════════════════════
-- As migrações …261-…264 deixaram este bloco como "PROVA PENDENTE". Esta
-- mediu. Saída crua, com JWT de admin:
--
--   explain (analyze, buffers) select * from gps.fila_de_ligacoes(200,0,'fila');
--     Function Scan on fila_de_ligacoes (actual time=7.450..7.453 rows=35)
--       Buffers: shared hit=1718
--     Execution Time: 7.482 ms
--
--   modo 'sem_contato' e 'agendados' (0 linhas hoje, nada encerrado ainda):
--     Execution Time: ~1,3 ms · Buffers: shared hit=76
--
-- ⚠️ A PRIMEIRA execução do modo 'fila' deu 56,9 ms; a segunda, 7,5 ms.
--    É CACHE FRIO, não custo real — a mesma armadilha que fez o predicado
--    antigo parecer custar 38 ms quando custa 0,677 ms. MEDIR DUAS VEZES.
--
-- VEREDITO SOBRE ÍNDICE: **não criar**. 7,5 ms para 35 linhas com o
-- `left join lateral` de tentativas incluído é barato, e `etapa1_clientes`
-- está saudável (n_dead_tup 194 / 1593). O `tentativas_total` por lateral
-- roda só sobre as linhas JÁ filtradas — fica como está. Se um dia a fila
-- passar de algumas centenas, remedir ANTES de virar coluna derivada: a
-- lição registrada é que índice pode deixar MAIS LENTO
-- (etapa1_clientes(fase): Seq Scan 0,686 ms × Index Scan 0,809 ms).
--
-- Conferências já feitas e coladas no cabeçalho deste arquivo: contagem
-- 35 antes/35 depois, uma assinatura por RPC, CHECK comparado 1 a 1, e o
-- teste funcional de 9 casos em `begin; … rollback;`.
-- ═══════════════════════════════════════════════════════════════════════════
