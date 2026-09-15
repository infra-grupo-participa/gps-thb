-- Fatia 3 da esteira: ENTREVISTA PRÉVIA + DECISORES + FILA DE LIGAÇÕES.
--
-- A equipe liga para os 5 clientes que o parceiro selecionou
-- (`selecionado_entrevista`, migração `…261`) e registra: o resultado da
-- ligação, o perfil DISC, quem são os decisores do negócio e observações.
-- Depois o advogado que fará a reunião preliminar lê isso.
--
-- Decisões do Marcio (15/09/2026), travadas:
--   1. Resultado da ligação é catálogo FECHADO de 4 valores: interessado,
--      sem_interesse, nao_atendeu, remarcar. "Não atendeu" é separado de
--      "sem interesse" de propósito — virar um no outro seria falso e sumiria
--      com quem só precisa de nova tentativa.
--   2. Esta fatia roda com o ADMIN que já existe (`gp_is_admin()`), sem papel
--      de operador. O papel novo é a fatia 5 — nada dele nasce aqui.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE NÃO REAPROVEITAR `registro_contato`
-- ═══════════════════════════════════════════════════════════════════════
--
-- São coisas diferentes: `registro_contato` é anotação do PARCEIRO sobre o
-- cliente dele (400 preenchidos, LGPD já decidida na migração `…255` — fica
-- fora da lista consolidada e do CSV). `entrevista_observacoes` é registro do
-- OPERADOR sobre uma ligação, com autor (`entrevista_por`) e data
-- (`entrevista_em`). Misturar faria o operador escrever por cima do
-- histórico do parceiro — dois autores, uma coluna, a versão antiga perdida
-- sem rastro.
--
-- 🔴 `entrevista_observacoes` HERDA a regra de LGPD do `registro_contato`
-- (mesma migração `…255`, mesma decisão do Marcio): fica FORA do
-- `returns table` de `gps.admin_clientes_lista`, FORA do CSV e FORA de
-- `gps.fila_de_ligacoes` — só na ficha individual do cliente (leitura direta
-- de `gps.etapa1_clientes`, já protegida por RLS) e no dossiê da entrevista.
--
-- ═══════════════════════════════════════════════════════════════════════
-- `gps.cliente_decisores` — o ponto mais sensível de LGPD desta fatia
-- ═══════════════════════════════════════════════════════════════════════
--
-- Decisor é PESSOA FÍSICA que nunca ouviu falar do portal, nomeada por um
-- terceiro (o cliente, numa ligação da equipe). Fica FORA da lista
-- consolidada, FORA do CSV e FORA da fila de ligações — só aparece na ficha
-- individual do cliente e no dossiê da entrevista, nunca numa RPC que devolve
-- conjunto agregado.
--
-- Sem teto de quantidade por decisão em aberto do Marcio (o desenho aguenta
-- N; nenhum índice depende de cardinalidade fixa).
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE UMA RPC SÓ (`entrevista_gravar`) E NÃO 3 UPDATEs DA ACTION
-- ═══════════════════════════════════════════════════════════════════════
--
-- Resultado + DISC + observações + decisores nascem do MESMO clique ("Salvar
-- ligação"). Três chamadas separadas do cliente deixariam o registro
-- parcialmente gravado se a rede caísse no meio (ex.: resultado gravado,
-- decisores não) — sem transação, a tela mentiria "salvo" ou o operador
-- refaria o trabalho sem saber o que já tinha ido. `security definer` +
-- transação única é o mesmo padrão de `gps.onboarding_concluir` e
-- `gps.selecao_entrevista_definir`.
--
-- `ligacao_realizada = true` é marcado pela PRÓPRIA RPC (não pela action
-- via PostgREST): a trigger de captura já existente
-- (`gps.aluno_eventos_capturar_etapa1_clientes`, vigente desde a `…092`)
-- dispara em QUALQUER UPDATE da tabela — inclusive dentro desta RPC — e já
-- grava sozinha o evento `cliente_ligacao` quando `ligacao_realizada` vira
-- `true`. Não duplicamos esse evento aqui.
--
-- ═══════════════════════════════════════════════════════════════════════
-- DECISÃO (E da exigência de prova): cliente NÃO selecionado tentando gravar
-- entrevista → RECUSA, não aceita
-- ═══════════════════════════════════════════════════════════════════════
--
-- `gps.fila_de_ligacoes` só lista quem tem `selecionado_entrevista = true`.
-- Se `entrevista_gravar` aceitasse qualquer cliente do ambiente, o operador
-- poderia registrar entrevista em alguém que nunca passou pelo funil do
-- parceiro (fora dos 5) — o dossiê deixaria de refletir a seleção. A RPC
-- recusa com frase própria (22023), antes de escrever qualquer coisa.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ÍNDICE: NENHUM NOVO (medido, não suposto)
-- ═══════════════════════════════════════════════════════════════════════
--
-- A consulta de `gps.fila_de_ligacoes` filtra por
-- `c.aluno_id = <algo>`. NÃO — a fila é da EQUIPE, cross-ambiente: filtra por
-- `c.selecionado_entrevista = true and c.entrevista_resultado is null`, SEM
-- filtro por `aluno_id`. Ver o `explain (analyze, buffers)` no fim deste
-- arquivo — não medido nesta sessão (nem MCP do Supabase nem `supabase`/
-- `psql` estavam disponíveis no ambiente de execução; mesma limitação já
-- registrada na migração `…261`). O raciocínio escrito: `etapa1_clientes`
-- tem 1.371 linhas hoje e 35 marcadas `selecionado_entrevista = true` — um
-- filtro sobre 1.371 linhas que cabem inteiras em poucas páginas de memória
-- tende a Seq Scan mais rápido que Index Scan, EXATAMENTE a medição já feita
-- neste projeto para `etapa1_clientes(fase)` (Seq 0,686 ms × Index 0,809 ms
-- em 1.222 linhas — o índice PERDEU). Criar índice parcial
-- `where selecionado_entrevista and entrevista_resultado is null` sem essa
-- medição seria repetir o erro já cometido uma vez. **Pendência explícita:
-- rodar o EXPLAIN real contra o banco antes de aplicar** (ver bloco no fim).
--
-- ═══════════════════════════════════════════════════════════════════════
-- `aluno_eventos.tipo` GANHA 1 VALOR — `cliente_entrevista_registrada`
-- ═══════════════════════════════════════════════════════════════════════
--
-- O evento de LIGAÇÃO em si já é coberto por `cliente_ligacao` (trigger
-- existente, dispara sozinha ao marcar `ligacao_realizada = true`) — não
-- duplicamos. Mas o RESULTADO (interessado/sem_interesse/nao_atendeu/
-- remarcar) é o dado que a equipe quer VER na trilha do aluno, no mesmo
-- padrão de `cliente_fase_mudou`/`cliente_honorarios_definidos` (rótulo +
-- `detalhe` com o valor). Sem isto, a trilha mostraria só "Registrou
-- ligação" sem dizer o resultado — a equipe teria de abrir a ficha para
-- saber se foi um "sim" ou um "não atendeu".
--
-- 🔴 LEITURA DO CHECK VIGENTE NO BANCO feita a partir das MIGRATIONS deste
-- diretório (não ao vivo — ver "PROVA PENDENTE" no fim do arquivo):
-- `grep -rl aluno_eventos_tipo_check supabase/migrations/` mostra que a
-- última a tocar o CHECK é a `…261` (15/09/2026, 31 valores: os 29 da `…231`
-- + 2 da própria `…261`). Nenhuma migration entre a `…261` e esta toca o
-- CHECK. A lista abaixo é a `…261` completa + 1 valor novo no fim.
-- ⚠️ Confirme contra o banco antes de aplicar (`select pg_get_constraintdef(oid)
-- from pg_constraint where conrelid='gps.aluno_eventos'::regclass and
-- contype='c'`) — se algo gravou fora deste diretório desde a `…261`, este
-- drop/create apaga um valor em silêncio.
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
     and pg_get_constraintdef(con.oid) like '%cliente_removido_entrevista%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo CONTEUDO cliente_removido_entrevista, da migracao …261) -- migracao abortada. Leia o CHECK vigente no banco antes de reescrever esta lista.';
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
    -- ── Entrevista prévia (15/09/2026, migração …262) ──
    'cliente_entrevista_registrada'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts. 31 valores vigentes na …261 + 1 desta migracao: cliente_entrevista_registrada, gravado so por gps.entrevista_gravar (detalhe leva o resultado). O evento de LIGACAO em si continua sendo cliente_ligacao (trigger existente) -- nao duplicado aqui.';

-- O QUE NÃO FAZ: não altera `gps.etapa1_clientes_unico_equipe`; não expõe
-- `registro_contato`, decisores ou observações fora da ficha individual; não
-- cria papel de operador (fatia 5); não aplica índice sem medição.
--
-- REVERSÃO (nesta ordem):
--   drop function if exists gps.fila_de_ligacoes(integer, integer);
--   drop function if exists gps.entrevista_gravar(uuid, text, text, text, jsonb);
--   drop table if exists gps.cliente_decisores;
--   alter table gps.aluno_eventos drop constraint aluno_eventos_tipo_check;
--   alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check
--     check (tipo in (<lista da …261, sem cliente_entrevista_registrada>));
--   alter table gps.etapa1_clientes drop constraint chk_etapa1_clientes_entrevista_resultado;
--   alter table gps.etapa1_clientes drop constraint chk_etapa1_clientes_entrevista_observacoes_tamanho;
--   alter table gps.etapa1_clientes drop column entrevista_por;
--   alter table gps.etapa1_clientes drop column entrevista_em;
--   alter table gps.etapa1_clientes drop column entrevista_observacoes;
--   alter table gps.etapa1_clientes drop column entrevista_resultado;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) COLUNAS NOVAS em gps.etapa1_clientes
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.etapa1_clientes
  add column if not exists entrevista_resultado   text,
  add column if not exists entrevista_observacoes  text,
  add column if not exists entrevista_em           timestamptz,
  add column if not exists entrevista_por          uuid references auth.users(id) on delete set null;

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_entrevista_resultado
  check (entrevista_resultado is null or entrevista_resultado in (
    'interessado', 'sem_interesse', 'nao_atendeu', 'remarcar'
  ));

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_entrevista_observacoes_tamanho
  check (entrevista_observacoes is null or char_length(entrevista_observacoes) <= 2000);

comment on column gps.etapa1_clientes.entrevista_resultado is
  'Catalogo FECHADO do resultado da ligacao da entrevista previa (decisao Marcio 15/09/2026): interessado | sem_interesse | nao_atendeu | remarcar. NAO confundir sem_interesse com nao_atendeu -- sao estados distintos de proposito (quem nao atendeu so precisa de nova tentativa). Escrita so por gps.entrevista_gravar. Espelha RESULTADOS_ENTREVISTA em src/lib/entrevista-tipos.ts. FORA do returns table de gps.admin_clientes_lista e do CSV -- so aparece na ficha e no dossie.';

comment on column gps.etapa1_clientes.entrevista_observacoes is
  'Anotacao do OPERADOR sobre a ligacao da entrevista previa -- NAO e registro_contato (aquele e do PARCEIRO sobre o cliente dele). Teto 2000 caracteres. HERDA a regra de LGPD de registro_contato (migracao …255): FORA do returns table de gps.admin_clientes_lista e do CSV, e FORA de gps.fila_de_ligacoes. Escrita so por gps.entrevista_gravar.';

comment on column gps.etapa1_clientes.entrevista_em is
  'Quando a ligacao da entrevista previa foi registrada. Gravado por gps.entrevista_gravar; null enquanto pendente.';

comment on column gps.etapa1_clientes.entrevista_por is
  'Quem (auth.users) registrou a ligacao da entrevista previa. on delete set null: apagar o login da equipe nao pode quebrar o historico do cliente.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) TABELA gps.cliente_decisores
-- ═══════════════════════════════════════════════════════════════════════════
create table gps.cliente_decisores (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references gps.etapa1_clientes(id) on delete cascade,
  nome              text not null,
  papel_no_negocio  text,
  principal         boolean not null default false,
  criado_em         timestamptz not null default now(),
  criado_por        uuid references auth.users(id) on delete set null,
  constraint chk_cliente_decisores_nome_tamanho
    check (char_length(btrim(nome)) between 1 and 200),
  constraint chk_cliente_decisores_papel_tamanho
    check (papel_no_negocio is null or char_length(papel_no_negocio) <= 200)
);

comment on table gps.cliente_decisores is
  'Decisores do negocio de um cliente, coletados na entrevista previa (migracao …262, 15/09/2026). 🔴 LGPD: PESSOA FISICA que nunca ouviu falar do portal, nomeada por um terceiro. FORA da lista consolidada, FORA do CSV, FORA de gps.fila_de_ligacoes -- so na ficha individual do cliente (RLS de etapa1_clientes, via cliente_id) e no dossie da entrevista. Sem teto de quantidade por cliente (decisao em aberto do Marcio). Escrita so por gps.entrevista_gravar (substitui o conjunto inteiro, mesmo padrao de gps.selecao_entrevista_definir).';

comment on column gps.cliente_decisores.principal is
  'Um decisor marcado como o principal -- NAO e exclusividade imposta pelo banco (nenhum indice unico parcial): mais de um "principal" e erro de dado da equipe, nao invariante do sistema, porque nao muda nenhuma trava de fluxo.';

-- Índice pelo predicado que a única leitura desta tabela usa: a ficha do
-- cliente busca `where cliente_id = $1`. Não é o mesmo caso de
-- `etapa1_clientes(fase)` (tabela de 1.371 linhas inteiras cabendo em Seq
-- Scan) — aqui cada cliente tem só os decisores DELE, e a tabela cresce sem
-- teto com o tempo (N clientes × M decisores). Provar o predicado:
create index cliente_decisores_cliente_idx on gps.cliente_decisores (cliente_id);

-- RLS: mesma regra de leitura de `gps.etapa1_clientes` (o cliente É dela) —
-- admin vê tudo, aluno/sócio só o próprio ambiente via join. Nenhuma policy
-- de aluno para ESCRITA: só a RPC grava (security definer).
alter table gps.cliente_decisores enable row level security;

create policy gps_cliente_decisores_select on gps.cliente_decisores
  for select
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.etapa1_clientes c
       where c.id = cliente_decisores.cliente_id
         and c.aluno_id = gps.aluno_atual()
    )
  );

-- 🔴 GRANT explícito: `service_role` não dispensa RLS nem GRANT neste
-- projeto (schema `gps` exposto no PostgREST). `revoke` primeiro, sempre —
-- nenhuma escrita direta pela REST: só SELECT (a ficha lê), toda escrita é
-- pela RPC `gps.entrevista_gravar` (security definer, revoga o resto).
revoke all on gps.cliente_decisores from public, anon;
grant select on gps.cliente_decisores to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) gps.entrevista_gravar — grava resultado + DISC + observações + decisores
--    numa transação. Guarda: gp_is_admin(). Marca ligacao_realizada = true.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.entrevista_gravar(
  p_cliente_id   uuid,
  p_resultado    text,
  p_disc         text default null,
  p_observacoes  text default null,
  p_decisores    jsonb default null   -- array de {nome, papel_no_negocio?, principal?}; null = não mexe no conjunto
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cliente      record;
  v_observacoes  text;
  v_decisor      jsonb;
  v_nome         text;
  v_papel        text;
  v_principal    boolean;
  v_qtd_gravados integer := 0;
begin
  if not coalesce(public.gp_is_admin(), false) then
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

  v_observacoes := nullif(btrim(coalesce(p_observacoes, '')), '');
  if v_observacoes is not null and char_length(v_observacoes) > 2000 then
    raise exception 'As observações passam de 2000 caracteres.' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.selecionado_entrevista
    into v_cliente
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;

  if v_cliente.id is null then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- DECISÃO (E): só grava entrevista de quem está na fila (selecionado pelo
  -- parceiro). Ver o cabeçalho da migração — evita registrar entrevista em
  -- quem nunca passou pelo funil dos 5.
  if not v_cliente.selecionado_entrevista then
    raise exception 'Este cliente não está entre os selecionados para a entrevista prévia.' using errcode = '22023';
  end if;

  -- UPDATE único: resultado, DISC (só se veio), observações, autoria e
  -- `ligacao_realizada`. A trigger de captura já existente
  -- (aluno_eventos_capturar_etapa1_clientes) grava sozinha o evento
  -- `cliente_ligacao` ao ver `ligacao_realizada` virar `true` -- não repetimos
  -- aqui.
  update gps.etapa1_clientes
     set entrevista_resultado    = p_resultado,
         entrevista_observacoes  = v_observacoes,
         entrevista_em           = now(),
         entrevista_por          = auth.uid(),
         perfil_disc             = coalesce(p_disc, perfil_disc),
         ligacao_realizada       = true
   where id = p_cliente_id;

  -- Evento próprio com o RESULTADO (a trigger de captura já grava
  -- `cliente_ligacao` sozinha ao ver `ligacao_realizada` virar `true` — isto
  -- aqui é o "o que ela disse", não "que ela ligou"). `rotulo` truncado em
  -- 300 pelo mesmo motivo da trigger (CHECK 1..300, `nome` é `text` sem
  -- limite). `entrevista_observacoes` NUNCA entra no `detalhe` — é o mesmo
  -- dado sensível que fica fora da lista consolidada (ver cabeçalho).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_cliente.aluno_id, now(), 'cliente_entrevista_registrada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_cliente.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('resultado', p_resultado), 'equipe', auth.uid(), 'app');

  -- Decisores: `null` = não mexe no conjunto (permite gravar só o resultado
  -- numa ligação e voltar depois para os decisores). Array (mesmo vazio)
  -- SUBSTITUI o conjunto inteiro — mesmo padrão de
  -- `gps.selecao_entrevista_definir`: o operador reenvia a lista completa a
  -- cada salvamento, nunca um diff.
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
    'decisores_gravados', v_qtd_gravados
  );
end;
$function$;

comment on function gps.entrevista_gravar(uuid, text, text, text, jsonb) is
  'Grava o resultado da ligacao da entrevista previa (resultado + DISC + observacoes + decisores) numa transacao so. gp_is_admin() ou 42501. So aceita cliente com selecionado_entrevista=true (fila) -- ver decisao (E) no cabecalho da migracao …262. Marca ligacao_realizada=true (a trigger existente aluno_eventos_capturar_etapa1_clientes grava cliente_ligacao sozinha). p_decisores null = nao mexe no conjunto; array (mesmo vazio) SUBSTITUI o conjunto inteiro, mesmo padrao de gps.selecao_entrevista_definir. entrevista_observacoes herda a LGPD de registro_contato: nunca sai desta RPC/da ficha para lista agregada.';

revoke all on function gps.entrevista_gravar(uuid, text, text, text, jsonb) from public, anon;
grant execute on function gps.entrevista_gravar(uuid, text, text, text, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) gps.fila_de_ligacoes — os selecionados com entrevista pendente
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.fila_de_ligacoes(
  p_limite integer default 100,
  p_offset integer default 0
)
returns table (
  cliente_id     uuid,
  cliente_nome   text,
  telefone       text,
  parceiro_nome  text,
  grau_relacao   text,
  favorito       boolean,
  perfil_disc    text,
  total_linhas   bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_limite integer;
  v_offset integer;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Mesmo teto de `admin_clientes_lista` (…255): serve a fila inteira do
  -- universo do filtro numa única chamada, sem paginar em N idas ao banco.
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
      c.criado_em
    from gps.etapa1_clientes c
    -- LEFT, não INNER (mesma lição paga da …255): se o cadastro do parceiro
    -- sumir de thb_alunos, o cliente aparece com dono vazio em vez de
    -- desaparecer da fila e da contagem.
    left join public.thb_alunos t on t.id = c.aluno_id
    where c.selecionado_entrevista
      and c.entrevista_resultado is null
  )
  select
    b.id, b.nome, b.telefone, b.parceiro_nome, b.grau_relacao,
    b.acompanhado_equipe, b.perfil_disc,
    (count(*) over ())::bigint as total_linhas
  from base b
  order by b.criado_em, b.id
  limit v_limite offset v_offset;
end;
$function$;

comment on function gps.fila_de_ligacoes(integer, integer) is
  'Fila de ligacoes da entrevista previa: clientes selecionado_entrevista=true com entrevista_resultado ainda null. gp_is_admin() ou 42501. Devolve cliente, telefone, nome do parceiro (LEFT join thb_alunos, mesma licao da …255), grau de relacao, se e favorito e o DISC ja registrado. total_linhas e count(*) over() DENTRO do filtro (universo do filtro, nao da pagina). 🔴 NAO devolve registro_contato, entrevista_observacoes nem decisores -- LGPD, ver cabecalho da migracao. Ordenado por criado_em (fila FIFO): quem foi selecionado ha mais tempo aparece primeiro.';

revoke all on function gps.fila_de_ligacoes(integer, integer) from public, anon;
grant execute on function gps.fila_de_ligacoes(integer, integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA PENDENTE — 🔴 NÃO MEDIDA NESTA SESSÃO. Nem MCP do Supabase nem CLI
-- (`supabase`/`psql`) estavam disponíveis neste ambiente de execução para
-- rodar `explain (analyze, buffers)` de verdade nem para ler
-- `pg_get_constraintdef` ao vivo antes de escrever esta migração — mesma
-- limitação já registrada por escrito na migração `…261`.
--
-- O que precisa rodar contra o banco real ANTES de aplicar:
--
--   -- 1) o bloco `do $$` desta própria migração já confere o CHECK vigente
--   --    pelo CONTEÚDO antes de reescrevê-lo (aborta com exceção se a lista
--   --    reconstruída das migrations divergir do banco) — mas é prudente
--   --    conferir também à mão antes de rodar, e não só confiar no aborto:
--   select pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'gps.aluno_eventos'::regclass and contype = 'c';
--
--   -- 2) a query real da fila (sem filtro por aluno_id — é cross-ambiente):
--   explain (analyze, buffers)
--   select c.id, c.nome, c.telefone, t.nome, c.grau_relacao,
--          c.acompanhado_equipe, c.perfil_disc
--     from gps.etapa1_clientes c
--     left join public.thb_alunos t on t.id = c.aluno_id
--    where c.selecionado_entrevista
--      and c.entrevista_resultado is null
--    order by c.criado_em, c.id
--    limit 100;
--
-- Hipótese escrita (não medição): 1.371 linhas em etapa1_clientes, ~35
-- marcadas selecionado_entrevista — Seq Scan tende a vencer Index Scan neste
-- volume, como já medido para etapa1_clientes(fase). Índice parcial só entra
-- se o EXPLAIN acima mostrar custo real, provando ESTE predicado
-- (selecionado_entrevista and entrevista_resultado is null) — não um palpite.
-- ═══════════════════════════════════════════════════════════════════════════
