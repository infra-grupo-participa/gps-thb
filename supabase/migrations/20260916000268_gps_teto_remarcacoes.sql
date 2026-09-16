-- Fatia B.2 da esteira: teto de 3 também em `remarcar`, contador SEPARADO
-- do teto de 3 `nao_atendeu` que a `…266` já criou.
--
-- Decisões do Marcio (16/09/2026), FECHADAS:
--   1. Contador SEPARADO: `entrevista_tentativas_sem_contato` (nao_atendeu,
--      já existe) e `entrevista_remarcacoes` (novo). Sai da fila quando
--      QUALQUER UM dos dois chegar a 3.
--   2. Mesmo destino: a lista 'sem_contato' que já existe — sem aba nova. A
--      linha diz o MOTIVO (`entrevista_motivo_encerramento`), porque "3 sem
--      contato" e "3 remarcações" são problemas diferentes (um some, o outro
--      enrola).
--   3. `entrevista_remarcacoes` NÃO zera nunca (decisão do backend-engineer,
--      aprovada por construção: se zerasse a cada `nao_atendeu` intercalado,
--      a pessoa poderia adiar indefinidamente alternando resultados e o teto
--      não significaria nada). É acumulativo pela vida do cliente — mesmo
--      espírito de `entrevista_tentativas_sem_contato`, que TAMBÉM não é
--      "zerado pelo tempo", só por um resultado que não seja o dele.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ✅ APLICADA E MEDIDA EM PRODUÇÃO — 16/09/2026
-- ═══════════════════════════════════════════════════════════════════════
-- Quem escreveu este SQL não tinha acesso ao banco; o orquestrador leu a
-- definição VIVA das duas RPCs, aplicou em 3 blocos pelo MCP e mediu.
--
-- ⚠️ Como a `…266`, o banco registra MAIS entradas do que este diretório
-- tem arquivos (limite de tamanho por chamada do MCP):
--     gps_teto_remarcacoes_colunas
--     gps_teto_remarcacoes_entrevista_gravar
--     gps_teto_remarcacoes_fila
-- Conteúdo equivalente, histórico diferente. A verdade do que está no ar é
-- `pg_get_functiondef`, não este arquivo.
--
-- PROVADO ANTES DE APLICAR — tabela-verdade da guarda de reabertura, 10
-- casos, todos corretos. É o ponto onde um erro APAGARIA um desfecho já
-- registrado pela equipe:
--     encerrado por desfecho (contadores < 3)          → RECUSA ✓
--     desfecho com contadores parciais (2 e 2)         → RECUSA ✓
--     teto sem_contato (3) / remarcações (3) / os dois → ACEITA ✓
--     não encerrado, em qualquer combinação            → ACEITA ✓
--
-- CONFERIDO DEPOIS DE APLICAR:
--   fila: 35 ANTES / 35 DEPOIS — ninguém perdido na virada
--   uma assinatura de cada RPC (o `drop` evitou sobrecarga)
--   EXPLAIN modo fila: 7,53 ms — idêntico ao de antes das 2 colunas novas
--     ⚠️ MEDIR DUAS VEZES: a 1ª execução é cache frio e mente (na …266 deu
--        56 ms × 7,5 ms real; no predicado antigo, 38 ms × 0,677 ms)
--   teste funcional em `begin; … rollback;` (string ÚNICA — o MCP é
--   AUTOCOMMIT, begin/rollback em chamadas separadas NÃO protege), 8 casos:
--     1ª remarcação → fica na fila (35)                ✓
--     3ª remarcação → sai (34), entra em sem_contato   ✓
--     motivo gravado = 'remarcacoes'                   ✓
--     contador = 3                                     ✓
--     reabrir por teto → aceita a 4ª tentativa         ✓
--     regravar após desfecho → recusa                  ✓
--     motivo do desfecho = 'desfecho'                  ✓
--   produção conferida após o rollback: tudo zerado, 35 na fila.
--
--
-- ═══════════════════════════════════════════════════════════════════════
-- TABELA-VERDADE DA GUARDA DE REABERTURA (a parte que muda de verdade)
-- ═══════════════════════════════════════════════════════════════════════
-- Guarda ANTIGA (`…266`): recusa só quando
--   entrevista_encerrada AND entrevista_tentativas_sem_contato < 3
-- Funcionava porque só havia 1 forma de "encerrado por teto". Com dois
-- tetos, "não foi teto" deixa de ser `sem_contato < 3` sozinho.
--
--   entrevista_encerrada | motivo real do encerramento      | tetos                                    | AÇÃO
--   ----------------------|-----------------------------------|-------------------------------------------|--------
--   false                 | (não encerrado)                   | —                                         | ACEITA (guarda nem dispara)
--   true                  | teto sem_contato (>=3)            | sem_contato>=3, remarcacoes<3             | ACEITA
--   true                  | teto remarcacoes (>=3)            | sem_contato<3,  remarcacoes>=3            | ACEITA
--   true                  | os dois tetos ao mesmo tempo      | sem_contato>=3, remarcacoes>=3            | ACEITA
--   true                  | DESFECHO (interessado/sem_interesse) | sem_contato<3,  remarcacoes<3          | RECUSA
--
-- Guarda NOVA: recusa só quando
--   entrevista_encerrada
--   AND entrevista_tentativas_sem_contato < 3
--   AND entrevista_remarcacoes < 3
-- Ou seja: RECUSA exige "encerrado, e nenhum dos dois tetos explica por quê"
-- — nesse caso só pode ter sido desfecho, porque `entrevista_encerrada` só
-- vira true por desfecho OU por teto (nunca por outro motivo, ver …266 e
-- o UPDATE desta migração abaixo). ACEITA em qualquer linha com teto
-- estourado, mesmo se os dois estourarem juntos.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE `entrevista_remarcacoes` NÃO ZERA (consequência tratada)
-- ═══════════════════════════════════════════════════════════════════════
-- `entrevista_gravar` (…266) zera `entrevista_tentativas_sem_contato` para
-- QUALQUER resultado ≠ `nao_atendeu` — correto para aquele contador (quem
-- atendeu não é "sem contato"). `entrevista_remarcacoes` NÃO segue essa
-- regra: só incrementa quando o resultado É `remarcar`, e não zera em
-- NENHUM outro resultado (nem em `interessado`, que encerra por desfecho
-- de qualquer forma; nem em `nao_atendeu`, que é contador diferente).
-- Nenhum caso encontrado nesta revisão onde deveria zerar — reportado aqui
-- em vez de decidido em silêncio, conforme pedido.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE COLUNA `entrevista_motivo_encerramento` (texto), NÃO ENUM/CHECK
-- CRUZADO
-- ═══════════════════════════════════════════════════════════════════════
-- CHECK não aceita subquery (0A000, lição já paga neste projeto — ver …267).
-- Um CHECK que amarrasse `motivo='sem_contato' <-> sem_contato>=3` exigiria
-- comparar duas colunas da MESMA linha, o que um CHECK simples suporta —
-- mas o valor é 100% DERIVADO (só a RPC decide, na mesma transação que
-- decide `entrevista_encerrada`), então a trava real é a RPC ser a ÚNICA
-- escrita (mesmo padrão de todas as colunas derivadas desta tabela). Um
-- CHECK a mais aqui não pegaria nenhum bug que a RPC já não previna, e
-- somaria uma constraint para manter. Catálogo fechado por CHECK simples
-- (3 valores + null), sem comparar contra as outras colunas.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE `drop function` nas duas RPCs (não `create or replace`)
-- ═══════════════════════════════════════════════════════════════════════
-- `entrevista_gravar`: mesma assinatura de parâmetros da `…266`
-- (uuid, text, text, text, jsonb, timestamptz, smallint) — `create or
-- replace` é seguro (parâmetros não mudam, só o corpo).
-- `fila_de_ligacoes`: MESMOS parâmetros (integer, integer, text), mas o
-- `returns table` GANHA colunas novas (`entrevista_remarcacoes`,
-- `entrevista_motivo_encerramento`) — mudar o retorno de uma função
-- `returns table` exige `drop function` antes; `create or replace` com
-- retorno diferente falha (42P13) ou, se PostgreSQL aceitasse por
-- coincidência de prefixo, arriscaria overload. `drop` explícito aqui.
--
-- ═══════════════════════════════════════════════════════════════════════
-- REVERSÃO (nesta ordem):
-- ═══════════════════════════════════════════════════════════════════════
--   drop function if exists gps.fila_de_ligacoes(integer, integer, text);
--   drop function if exists gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint);
--   -- (as duas linhas acima recriam as versões da …266, se necessário: ver
--   --  o corpo integral em supabase/migrations/20260916000266_gps_fila_nao_perde_quem_nao_atendeu.sql)
--   alter table gps.etapa1_clientes drop column entrevista_motivo_encerramento;
--   alter table gps.etapa1_clientes drop column entrevista_remarcacoes;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Coluna nova: contador de remarcações, ACUMULATIVO (nunca zera).
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.etapa1_clientes
  add column if not exists entrevista_remarcacoes smallint not null default 0;

comment on column gps.etapa1_clientes.entrevista_remarcacoes is
  'Contador de resultado=remarcar ACUMULATIVO pela vida do cliente (decisao Marcio 16/09/2026) -- ao contrario de entrevista_tentativas_sem_contato, NUNCA zera (nem quando a pessoa atende): se zerasse a cada nao_atendeu intercalado, dava para adiar indefinidamente alternando resultados e o teto de 3 nao significaria nada. Teto 3 encerra o cliente (entrevista_encerrada=true, entrevista_motivo_encerramento=remarcacoes) e ele vai para a lista "sem_contato" (mesmo destino do teto de nao_atendeu, motivo diferente). Escrita SO por gps.entrevista_gravar. Leitura: gps.fila_de_ligacoes (modo sem_contato) e dossie.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Coluna nova: motivo do encerramento, para a UI dizer "3 sem contato" x
--    "3 remarcações" x um desfecho (mesma lista 'sem_contato', motivo
--    diferente -- decisão do Marcio, sem aba nova).
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.etapa1_clientes
  add column if not exists entrevista_motivo_encerramento text;

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_entrevista_motivo_encerramento
  check (entrevista_motivo_encerramento is null
         or entrevista_motivo_encerramento in ('sem_contato', 'remarcacoes', 'desfecho'));

comment on column gps.etapa1_clientes.entrevista_motivo_encerramento is
  'Por que entrevista_encerrada virou true (decisao Marcio 16/09/2026): sem_contato (teto de 3 nao_atendeu consecutivas), remarcacoes (teto de 3 remarcar acumuladas) ou desfecho (interessado/sem_interesse). Os dois tetos podem estourar juntos -- nesse caso prevalece sem_contato (ordem de avaliacao na RPC, ver entrevista_gravar), mas ambos os contadores ficam visiveis na fila para a UI decidir o que mostrar. null enquanto nao encerrado. Escrita SO por gps.entrevista_gravar. Leitura: gps.fila_de_ligacoes (o motivo que falta para a UI distinguir os dois problemas na MESMA lista sem_contato).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.entrevista_gravar — MESMA assinatura da …266, `create or replace`.
--    Corpo integral copiado da …266 com as alterações mínimas: incremento
--    de v_remarcacoes, guarda de reabertura com os DOIS tetos, motivo do
--    encerramento e a nova coluna no UPDATE/retorno jsonb.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.entrevista_gravar(
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
  v_remarcacoes   smallint;
  v_encerrada     boolean;
  v_motivo        text;
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

  -- Decisão 3 (…266): `remarcar` exige data futura; qualquer outro
  -- resultado não carrega retorno_em (mesmo XOR das constraints da tabela
  -- de tentativas).
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
         c.entrevista_encerrada, c.entrevista_tentativas_sem_contato,
         c.entrevista_remarcacoes
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

  -- Guarda de reabertura NOVA (tabela-verdade no cabeçalho desta migração):
  -- RECUSA só quando encerrado E nenhum dos DOIS tetos explica o
  -- encerramento (ou seja, só pode ter sido desfecho). ACEITA se qualquer
  -- teto tiver estourado, mesmo os dois juntos.
  if v_cliente.entrevista_encerrada
     and v_cliente.entrevista_tentativas_sem_contato < 3
     and v_cliente.entrevista_remarcacoes < 3 then
    raise exception 'Este cliente já teve a entrevista encerrada com um desfecho. Para reabrir, ajuste a ficha diretamente.' using errcode = '22023';
  end if;

  -- Decisão 2 (…266): contador de nao_atendeu CONSECUTIVAS. Qualquer outro
  -- resultado zera.
  if p_resultado = 'nao_atendeu' then
    v_sem_contato := v_cliente.entrevista_tentativas_sem_contato + 1;
  else
    v_sem_contato := 0;
  end if;

  -- Contador de remarcações NOVO: só incrementa em `remarcar`. NUNCA zera
  -- (nem quando a pessoa atende) -- ver bloco de justificativa no cabeçalho.
  if p_resultado = 'remarcar' then
    v_remarcacoes := v_cliente.entrevista_remarcacoes + 1;
  else
    v_remarcacoes := v_cliente.entrevista_remarcacoes;
  end if;

  v_encerrada := (p_resultado in ('interessado', 'sem_interesse'))
                 or (v_sem_contato >= 3)
                 or (v_remarcacoes >= 3);

  -- Motivo do encerramento: desfecho tem prioridade textual sobre teto (é a
  -- razão de negócio mais forte), depois sem_contato, depois remarcacoes.
  -- Quando os dois tetos estouram na MESMA chamada, prevalece sem_contato
  -- no rótulo -- ambos os contadores continuam visíveis na fila de qualquer
  -- forma, então a UI não perde informação, só escolhe um motivo principal.
  v_motivo := case
    when p_resultado in ('interessado', 'sem_interesse') then 'desfecho'
    when v_sem_contato >= 3 then 'sem_contato'
    when v_remarcacoes >= 3 then 'remarcacoes'
    else null
  end;

  -- INSERT na tabela de tentativas — o registro histórico, nunca sobrescrito.
  insert into gps.entrevista_tentativas
    (cliente_id, tentativa_em, tentativa_por, resultado, qualidade, observacoes, retorno_em)
  values
    (p_cliente_id, now(), auth.uid(), p_resultado, p_qualidade, v_observacoes, v_retorno);

  -- Número real da tentativa (total histórico deste cliente, já incluindo a
  -- que acabou de ser inserida) -- não usar os contadores derivados aqui,
  -- que não representam o total (um zera, o outro só conta remarcar).
  select count(*) into v_tentativa_num
    from gps.entrevista_tentativas
   where cliente_id = p_cliente_id;

  -- UPDATE único: resultado da ÚLTIMA tentativa + as colunas derivadas
  -- (agora 5, com remarcacoes e motivo_encerramento) + DISC (só se veio) +
  -- ligacao_realizada. A trigger de captura já existente
  -- (aluno_eventos_capturar_etapa1_clientes) grava sozinha cliente_ligacao ao
  -- ver ligacao_realizada virar true -- não repetimos aqui (idempotente).
  update gps.etapa1_clientes
     set entrevista_resultado              = p_resultado,
         entrevista_observacoes            = v_observacoes,
         entrevista_em                     = now(),
         entrevista_por                    = auth.uid(),
         perfil_disc                       = coalesce(p_disc, perfil_disc),
         ligacao_realizada                 = true,
         entrevista_tentativas_sem_contato = v_sem_contato,
         entrevista_remarcacoes            = v_remarcacoes,
         entrevista_retorno_em             = v_retorno,
         entrevista_encerrada              = v_encerrada,
         entrevista_motivo_encerramento    = v_motivo
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

  -- Evento próprio quando QUALQUER UM dos dois tetos estoura nesta chamada
  -- (transição false->true no respectivo contador) -- reaproveita o MESMO
  -- tipo de evento da …266 (cliente_entrevista_sem_contato); o `detalhe`
  -- diz qual motivo, sem exigir valor novo no CHECK de aluno_eventos.tipo.
  if (v_sem_contato >= 3 and v_cliente.entrevista_tentativas_sem_contato < 3)
     or (v_remarcacoes >= 3 and v_cliente.entrevista_remarcacoes < 3) then
    insert into gps.aluno_eventos
      (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values
      (v_cliente.aluno_id, now(), 'cliente_entrevista_sem_contato', 'cliente', p_cliente_id,
       left(coalesce(nullif(btrim(v_cliente.nome), ''), 'Cliente sem nome'), 300),
       jsonb_build_object('motivo', v_motivo), 'equipe', auth.uid(), 'app');
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
    'remarcacoes', v_remarcacoes,
    'encerrada', v_encerrada,
    'motivo_encerramento', v_motivo,
    'retorno_em', v_retorno,
    'decisores_gravados', v_qtd_gravados
  );
end;
$function$;

comment on function gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint) is
  'Grava UMA TENTATIVA de ligacao da entrevista previa (Fatia B, decisao Marcio 16/09/2026; ganhou teto de remarcar nesta migracao …268): insere em gps.entrevista_tentativas (historico) e recalcula as colunas derivadas de gps.etapa1_clientes. Guarda gps.eh_equipe() ou 42501. remarcar exige p_retorno_em futuro (22023 sem data ou com data no passado). DOIS tetos de 3, INDEPENDENTES: nao_atendeu CONSECUTIVAS (zera em qualquer outro resultado) e remarcar ACUMULATIVO (nunca zera). Qualquer um dos dois >=3 encerra (entrevista_encerrada=true, entrevista_motivo_encerramento diz qual). Encerrado por DESFECHO (interessado/sem_interesse) recusa nova tentativa; encerrado por qualquer TETO aceita. p_decisores null = nao mexe no conjunto; array (mesmo vazio) SUBSTITUI. p_qualidade 1..5 opcional, por LIGACAO. observacoes/qualidade/decisores NUNCA saem desta RPC/da ficha para lista agregada (LGPD).';

revoke all on function gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint) from public, anon;
grant execute on function gps.entrevista_gravar(uuid, text, text, text, jsonb, timestamptz, smallint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.fila_de_ligacoes — MESMOS parâmetros, `returns table` GANHA 2
--    colunas -> exige drop antes do create (ver justificativa no cabeçalho).
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists gps.fila_de_ligacoes(integer, integer, text);

create function gps.fila_de_ligacoes(
  p_limite integer default 100,
  p_offset integer default 0,
  p_modo   text default 'fila'
)
returns table (
  cliente_id                     uuid,
  cliente_nome                   text,
  telefone                       text,
  parceiro_nome                  text,
  grau_relacao                   text,
  favorito                       boolean,
  perfil_disc                    text,
  tentativas_total                integer,
  tentativas_sem_contato          smallint,
  ultima_tentativa_em            timestamptz,
  ultimo_resultado                text,
  retorno_em                      timestamptz,
  entrevista_remarcacoes          smallint,
  entrevista_motivo_encerramento  text,
  total_linhas                    bigint
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
      c.entrevista_remarcacoes,
      c.entrevista_motivo_encerramento,
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
        -- 🔑 'sem_contato' agora inclui QUALQUER teto estourado (sem_contato
        -- OU remarcacoes) -- decisão do Marcio: mesmo destino, sem aba nova.
        -- Cliente que encerrou por DESFECHO não cai aqui (nenhum dos dois
        -- tetos necessariamente bateu 3; e mesmo se tivesse batido antes do
        -- desfecho, o motivo gravado já seria 'desfecho', não os tetos).
        (p_modo = 'sem_contato'
          and c.entrevista_encerrada
          and (c.entrevista_tentativas_sem_contato >= 3 or c.entrevista_remarcacoes >= 3))
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
    ct.entrevista_remarcacoes, ct.entrevista_motivo_encerramento,
    (count(*) over ())::bigint as total_linhas
  from com_tentativas ct
  -- Decisão 5 da …266: no modo 'fila', retorno VENCIDO sobe ao topo (mais
  -- antigo primeiro); quem não tem retorno pendente (null) fica depois,
  -- ordenado por criado_em/id (FIFO). Nos outros modos a 1ª chave é sempre
  -- false (todo mundo empata) e a ordenação cai direto no FIFO. Não mudou
  -- nesta migração.
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
  'Fila de ligacoes da entrevista previa, 3 modos (Fatia B, …266; ganhou teto de remarcar nesta migracao …268): fila (nao encerrado, sem retorno pendente futuro), sem_contato (encerrado por QUALQUER teto -- 3 nao_atendeu OU 3 remarcar, entrevista_motivo_encerramento diz qual), agendados (nao encerrado, retorno futuro). Modo desconhecido -> 22023. Guarda gps.eh_equipe() ou 42501. No modo fila, retorno VENCIDO sobe ao topo (mais antigo primeiro), resto por criado_em/id (FIFO). tentativas_total por left join lateral count(*) sobre as linhas JA FILTRADAS -- ver EXPLAIN colado no fim da …266; se custar, vira coluna derivada. 🔴 NAO devolve observacoes, qualidade nem decisores -- LGPD, nenhuma coluna nova pode ser PII.';

revoke all on function gps.fila_de_ligacoes(integer, integer, text) from public, anon;
grant execute on function gps.fila_de_ligacoes(integer, integer, text) to authenticated;

-- O QUE NÃO FAZ: não cria índice novo (o `left join lateral` de tentativas e
-- os predicados de etapa1_clientes usam o mesmo caminho medido pela …266;
-- as 2 colunas novas são igualdade sobre coluna sem índice na MESMA tabela
-- pequena e saudável já medida ali -- remedir antes de indexar, não presumir),
-- não mexe no front (`src/components/admin/fila/*`, fora de escopo desta
-- fatia), não mexe no dossiê (`gps.dossie_do_cliente`, fora de escopo -- ele
-- já expõe `entrevista.resultado`/`tentativas`; se o Marcio quiser o motivo
-- de encerramento também no dossiê, é decisão de tela separada), não corrige
-- a policy de `gp_is_admin()` pré-existente já reportada na …266 (fora de
-- escopo).

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Reload do schema no PostgREST — RPCs trocadas (fila_de_ligacoes muda de
--    returns table; entrevista_gravar muda só de corpo).
-- ═══════════════════════════════════════════════════════════════════════════
notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ Provas coladas no cabeçalho deste arquivo (contagem 35/35, assinaturas
-- únicas, EXPLAIN 7,53 ms, tabela-verdade de 10 casos e teste funcional de
-- 8 casos). Nada pendente nesta migração.
-- ═══════════════════════════════════════════════════════════════════════════
