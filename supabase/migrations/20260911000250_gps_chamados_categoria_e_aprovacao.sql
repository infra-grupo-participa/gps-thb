-- Chamados ganham CATEGORIA + fluxo de APROVAÇÃO (demanda 3, 11/09/2026).
--
-- MOTIVAÇÃO: hoje `gps.chamados` é só assunto livre + thread. O Marcio quer
-- 4 categorias (Dificuldade no sistema · Troca de cliente · Troca de sócio ·
-- Outros) e, para as duas trocas, um PEDIDO estruturado (atual × novo) que a
-- equipe aprova ou declina com um clique — aprovar EXECUTA a troca na hora
-- (decisão #2 do briefing), não é só uma etiqueta.
--
-- DECISÕES DESTA MIGRAÇÃO
--
--   1) BACKFILL DOS 6 CHAMADOS EXISTENTES: NENHUM. `categoria` nasce com
--      default 'outros', que já cobre os 6 (5 com assunto EXATO 'Trocar
--      cliente acompanhado' + 1 'PLANTAO'). Os 5 de troca de cliente NÃO têm
--      alvo escolhido — não existe `chamado_solicitacoes` para eles, porque a
--      estrutura correspondente nasce hoje. Marcá-los `troca_cliente` sem uma
--      linha de solicitação criaria um pedido "categoria diz uma coisa, tela
--      não tem o que mostrar". `outros` é honesto: são chamados de texto
--      livre, tratados pelo fluxo de mensagem que já existe.
--
--   2) `gps.chamado_solicitacoes` (1:1 opcional, PK = chamado_id) GUARDA UMA
--      CÓPIA DO RÓTULO (`alvo_atual_rotulo`/`alvo_novo_rotulo`), não só o id.
--      O cliente do aluno pode ser apagado por decisão dele ou da equipe
--      ENQUANTO o pedido está pendente (a trava do favorito impede apagar o
--      CONFIRMADO, mas o alvo NOVO escolhido pode não estar confirmado ainda,
--      e o sócio-alvo de uma troca pode ser removido por outro caminho antes
--      da decisão). Sem a cópia, a ficha do pedido viraria "—" bem na hora em
--      que a equipe precisa decidir o que aprovar. `alvo_novo_id`/
--      `alvo_atual_id` continuam gravados (uuid, SEM FK — mesma razão de
--      `gps.chamados.aluno_id`: apontam para linhas de tabelas que podem
--      sumir por caminho legítimo) para a RPC de aprovação usar como chave
--      real na hora de executar.
--
--   3) TETO "uma solicitação pendente por ambiente e tipo" — decisão: COLUNA
--      DENORMALIZADA `ambiente_aluno_id` (não FK; copiada de
--      `gps.chamados.aluno_id` pela própria RPC no momento do insert) + ÍNDICE
--      ÚNICO PARCIAL `(ambiente_aluno_id, tipo) where estado = 'pendente'`.
--      JUSTIFICATIVA: `chamado_solicitacoes` não tem `aluno_id` porque quem
--      tem é `gps.chamados` (join por `chamado_id`). Um teto só em `if
--      exists (...)` dentro da RPC perde para corrida (dois cliques do mesmo
--      aluno, duas transações concorrentes, nenhuma vê a outra antes do
--      commit) — é exatamente o caso que `socio_convites_um_pendente_por_
--      ambiente` (…244) já resolveu com o mesmo desenho: índice único parcial
--      é a ÚNICA forma de o Postgres arbitrar a corrida sem `lock table`. A
--      alternativa (teto só na RPC, sem coluna) exigiria um `select ... for
--      update` travando TODOS os chamados do ambiente antes do insert — mais
--      lento e ainda dependente de nenhuma outra transação inserir por fora
--      da RPC (o que a ausência de policy de insert já impede, mas não custa
--      grátis contra bug futuro na própria função). A coluna paga com 16
--      bytes por linha e ganha uma garantia do banco, não da aplicação.
--
--   4) `estado` (`pendente`|`aprovada`|`declinada`) é DERIVADO no servidor,
--      igual ao `status` de `gps.chamados`: nenhuma RPC pública recebe
--      `p_estado`. RLS espelha `gps.pode_ver_chamado(chamado_id)` — quem vê o
--      chamado vê o pedido. ZERO policy de escrita: append-only por RPC, no
--      mesmo molde de `gps.chamados`/`gps.chamado_mensagens`.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não altera `src/`, não manda e-mail, não cria
-- bucket, não apaga chamado nem cliente, não faz UPDATE nos 6 chamados
-- existentes.
--
-- REVERSÃO (nesta ordem):
--   drop function gps.chamado_declinar_solicitacao(uuid, text);
--   drop function gps.chamado_aprovar_solicitacao(uuid, text);
--   drop function gps.chamados_categorias_ativo();
--   -- chamado_abrir volta ao corpo da migração ...111 (sem p_categoria/
--   -- p_alvo_novo_id) -- ver bloco 4 abaixo, plano B se for preciso reverter
--   -- só esta parte.
--   drop table gps.chamado_solicitacoes;
--   alter table gps.chamados drop column categoria;
--   delete from gps.config where chave = 'chamados_categorias_ativo';
--   -- o CHECK de acessos_log.acao NÃO reverte sozinho: ver bloco 3 abaixo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.chamados.categoria
-- ═══════════════════════════════════════════════════════════════════════════

alter table gps.chamados
  add column if not exists categoria text not null default 'outros'
    check (categoria in ('sistema','troca_cliente','troca_socio','outros'));

comment on column gps.chamados.categoria is
  'Categoria do chamado, escolhida no ato de abrir (gps.chamado_abrir). Default e backfill (11/09/2026): outros -- os 6 chamados que existiam antes desta coluna (5 "Trocar cliente acompanhado" sem alvo escolhido + 1 "PLANTAO") ficam outros de proposito, sem UPDATE algum; marca-los troca_cliente exigiria uma linha em gps.chamado_solicitacoes que eles nunca tiveram. troca_cliente/troca_socio SEMPRE vem acompanhada de uma linha em gps.chamado_solicitacoes (nao ha constraint cruzando as duas tabelas -- a garantia e da RPC gps.chamado_abrir, unica porta de escrita).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.chamado_solicitacoes — 1:1 opcional com gps.chamados
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists gps.chamado_solicitacoes (
  chamado_id          uuid primary key
                        references gps.chamados(id) on delete cascade,
  -- Denormalizada de gps.chamados.aluno_id no momento do insert (só a RPC
  -- escreve). Existe SÓ para o índice de teto (ver decisão #3) -- toda leitura
  -- de tela junta por chamado_id, nunca filtra chamado_solicitacoes por esta
  -- coluna diretamente.
  ambiente_aluno_id   uuid not null,
  tipo                text not null check (tipo in ('troca_cliente','troca_socio')),
  -- SEM FK de propósito: apontam para gps.etapa1_clientes.id (troca_cliente)
  -- ou gps.membros.id (troca_socio), tabelas de naturezas diferentes conforme
  -- o tipo -- uma FK só serviria a metade dos casos. A linha apontada pode
  -- legitimamente sumir antes da decisão (cliente removido pelo aluno/equipe,
  -- sócio removido por outro caminho); os rótulos abaixo é que preservam a
  -- ficha do pedido.
  alvo_atual_id       uuid,
  alvo_novo_id        uuid,
  -- Cópia do nome NO INSTANTE DO PEDIDO. Sem isso, um alvo apagado antes da
  -- decisão vira "—" na tela da equipe bem na hora em que ela precisa decidir
  -- o que aprovar.
  alvo_atual_rotulo   text check (alvo_atual_rotulo is null or length(alvo_atual_rotulo) between 1 and 300),
  alvo_novo_rotulo    text check (alvo_novo_rotulo  is null or length(alvo_novo_rotulo)  between 1 and 300),
  estado              text not null default 'pendente'
                        check (estado in ('pendente','aprovada','declinada')),
  criado_em           timestamptz not null default now(),
  decidida_em         timestamptz,
  decidido_por        uuid references auth.users(id) on delete set null,
  motivo_decisao      text check (motivo_decisao is null or length(motivo_decisao) between 3 and 300),
  constraint chk_chamado_solicitacoes_decisao_completa
    check (estado = 'pendente' or (decidida_em is not null and motivo_decisao is not null))
);

comment on table gps.chamado_solicitacoes is
  'Pedido estruturado (troca de cliente OU de socio) associado 1:1 a um gps.chamados. Nasce junto com o chamado, na mesma transacao de gps.chamado_abrir. RLS espelha gps.pode_ver_chamado(chamado_id); ZERO policy de escrita -- append-only por RPC (gps.chamado_abrir cria, gps.chamado_aprovar_solicitacao/gps.chamado_declinar_solicitacao decidem), no mesmo molde de gps.chamados.';
comment on column gps.chamado_solicitacoes.ambiente_aluno_id is
  'Copia de gps.chamados.aluno_id no momento do insert. Existe so para o indice de teto chamado_solicitacoes_um_pendente_por_tipo (uma solicitacao pendente por ambiente e tipo) -- a tabela nao tem aluno_id proprio porque quem tem e gps.chamados (join por chamado_id), e um `if exists` na RPC sozinho perde para dois cliques simultaneos.';
comment on column gps.chamado_solicitacoes.alvo_atual_id is
  'troca_cliente: gps.etapa1_clientes.id do favorito atual (pode ser NULL se o pedido for a 1a escolha -- mas essa via continua livre e nao gera chamado, ver guarda em chamado_abrir). troca_socio: gps.membros.id do socio atual. SEM FK: a linha pode ser removida antes da decisao por caminho legitimo.';
comment on column gps.chamado_solicitacoes.alvo_novo_id is
  'troca_cliente: gps.etapa1_clientes.id do cliente escolhido pelo aluno (da lista do proprio ambiente). troca_socio: nao se aplica hoje -- a troca de socio aprova a SAIDA do atual (briefing, decisao #5); a entrada do substituto segue pela aba Equipe, fora deste fluxo. Fica NULL neste caso.';
comment on column gps.chamado_solicitacoes.alvo_atual_rotulo is
  'Copia do NOME do alvo atual no instante do pedido (nao um live lookup): o cliente/socio pode ser apagado antes da decisao e a ficha nao pode virar "-".';
comment on column gps.chamado_solicitacoes.alvo_novo_rotulo is
  'Copia do NOME do alvo novo no instante do pedido. NULL quando o tipo e troca_socio (nao ha "novo" nesta solicitacao).';
comment on column gps.chamado_solicitacoes.estado is
  'DERIVADO no servidor -- nenhuma RPC publica recebe p_estado. pendente ate a equipe decidir; aprovada/declinada sao terminais (nenhuma RPC reabre uma solicitacao decidida).';
comment on constraint chk_chamado_solicitacoes_decisao_completa on gps.chamado_solicitacoes is
  'Decisao (aprovada/declinada) sempre vem com decidida_em e motivo_decisao -- impede um estado terminal "mudo" mesmo se algum dia uma RPC nova esquecer de gravar um dos dois.';

-- Índice de leitura: a tela da equipe junta chamado × solicitação pendente.
create index if not exists idx_chamado_solicitacoes_pendente
  on gps.chamado_solicitacoes (chamado_id) where estado = 'pendente';
comment on index gps.idx_chamado_solicitacoes_pendente is
  'Serve a fila de pedidos pendentes da equipe: select ... where estado=''pendente''. PARCIAL de proposito -- a fila cresce so com o que esta pendente; decidido nao entra no indice nem no custo de escrita (mesmo raciocinio de idx_chamados_fila, migracao ...110).';

-- Índice de TETO (decisão #3 do cabeçalho): uma solicitação pendente por
-- ambiente e tipo. Garantia do BANCO contra corrida, não só da RPC.
create unique index if not exists chamado_solicitacoes_um_pendente_por_tipo
  on gps.chamado_solicitacoes (ambiente_aluno_id, tipo) where estado = 'pendente';
comment on index gps.chamado_solicitacoes_um_pendente_por_tipo is
  'Teto: no maximo 1 solicitacao PENDENTE por ambiente e por tipo (troca_cliente/troca_socio, contados separado -- o aluno pode ter uma pendente de cada tipo ao mesmo tempo, nao pode ter duas do mesmo tipo). Indice unico parcial, mesmo desenho de socio_convites_um_pendente_por_ambiente (...244): a RPC confere ANTES (mensagem legivel), o indice e a rede contra a corrida (dois cliques simultaneos do mesmo aluno abrindo 2 chamados de troca).';

alter table gps.chamado_solicitacoes enable row level security;

drop policy if exists gps_chamado_solicitacoes_select on gps.chamado_solicitacoes;
create policy gps_chamado_solicitacoes_select on gps.chamado_solicitacoes
  for select to authenticated
  using (gps.pode_ver_chamado(chamado_id));

-- ZERO policy de insert/update/delete: append-only por RPC, mesmo padrão de
-- gps.chamados/gps.chamado_mensagens (…110). `revoke all` ANTES do `grant`
-- pelo mesmo motivo daquela migração: o schema gps tem ALTER DEFAULT
-- PRIVILEGES que concede DELETE a `authenticated` em tabela nova.
revoke all on gps.chamado_solicitacoes from anon, public;
revoke all on gps.chamado_solicitacoes from authenticated;
grant select on gps.chamado_solicitacoes to authenticated;
-- ZERO grant para anon, em qualquer verbo.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CHECK de gps.acessos_log.acao — soma as 2 ações da decisão de aprovação
-- ═══════════════════════════════════════════════════════════════════════════
-- O CHECK é fechado (18 valores hoje, último 'socio_convite_revogado', da
-- migração …244). Achado pelo CONTEÚDO, nunca pelo nome -- mesma técnica das
-- …092/…150/…200/…244.

do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'acessos_log'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%socio_convite_revogado%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO socio_convite_revogado, da migracao ...244) -- migracao abortada para nao deixar as RPCs de aprovacao de chamado gravando uma acao que a constraint rejeita';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    -- ── Central de resolução (09/09/2026, migrações ...152 a ...157) ──
    'etapa_liberacao_alterada',
    'progresso_reaberto',
    'membro_pessoa_vinculada',
    'titular_trocado',
    'membro_movido',
    'financeiro_vinculado',
    'financeiro_desvinculado',
    -- ── Mega feature: onboarding e trava do favorito (10/09/2026) ──
    'favorito_confirmado',
    'favorito_liberado',
    'acessos_criados_em_lote',
    -- ── Equipe: autosserviço de convite de sócio (11/09/2026) ──
    'socio_convidado',
    'socio_convite_aceito',
    'socio_convite_revogado',
    -- ── Chamados: categoria + fluxo de aprovação (11/09/2026) ──
    'chamado_solicitacao_aprovada',  -- gps.chamado_aprovar_solicitacao
    'chamado_solicitacao_declinada'  -- gps.chamado_declinar_solicitacao
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 5 do baseline; 7 da Central (...150); 3 da mega feature (...200); 3 do convite de socio (...244); 2 da categoria+aprovacao de chamados (...250): chamado_solicitacao_aprovada e chamado_solicitacao_declinada (gps.chamado_aprovar_solicitacao / gps.chamado_declinar_solicitacao). Nao guarda nome de cliente em `detalhe` -- dado de terceiro (mesma regra da ...203).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. gps.chamado_abrir — ganha p_categoria e p_alvo_novo_id
-- ═══════════════════════════════════════════════════════════════════════════
-- CORPO VIGENTE extraído por pg_get_functiondef em 11/09/2026 (fornecido pelo
-- orquestrador). As guardas novas entram DEPOIS das guardas existentes
-- (interruptor, assunto, teto de 5 abertos) e ANTES do insert em
-- gps.chamados -- se qualquer guarda nova falhar, nada é gravado.

create or replace function gps.chamado_abrir(
  p_assunto       text,
  p_texto         text,
  p_anexo_path    text    default null,
  p_anexo_nome    text    default null,
  p_anexo_mime    text    default null,
  p_anexo_tamanho integer default null,
  p_categoria     text    default 'outros',
  p_alvo_novo_id  uuid    default null
)
returns table (chamado_id uuid, avisar_equipe text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id      uuid;
  v_abertos       integer;
  v_novo          uuid;
  v_tipo          text;
  v_atual_id      uuid;
  v_atual_rotulo  text;
  v_novo_rotulo   text;
  v_alvo_existe   boolean;
  v_socio         record;
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

  -- ─────────────────────────────────────────────────────────────────────
  -- Guardas NOVAS (categoria + solicitação estruturada)
  -- ─────────────────────────────────────────────────────────────────────
  if p_categoria is null or p_categoria not in ('sistema','troca_cliente','troca_socio','outros') then
    raise exception 'categoria invalida' using errcode = '22023';
  end if;

  if p_categoria = 'troca_cliente' then
    v_tipo := 'troca_cliente';

    -- O alvo NOVO tem de existir e ser do ambiente de quem pede -- nunca
    -- confia num id de outro ambiente vindo do cliente.
    select true, c.nome into v_alvo_existe, v_novo_rotulo
      from gps.etapa1_clientes c
     where c.id = p_alvo_novo_id and c.aluno_id = v_aluno_id;
    if not coalesce(v_alvo_existe, false) then
      raise exception 'o cliente escolhido nao pertence ao seu ambiente' using errcode = '22023';
    end if;

    -- O ambiente PRECISA ter favorito atual: sem favorito não é troca, é
    -- primeira escolha, e essa continua livre (não passa por chamado).
    select c.id, c.nome into v_atual_id, v_atual_rotulo
      from gps.etapa1_clientes c
     where c.aluno_id = v_aluno_id and c.acompanhado_equipe;
    if v_atual_id is null then
      raise exception 'seu ambiente ainda nao tem cliente acompanhado -- a primeira escolha e livre, nao precisa de chamado' using errcode = '22023';
    end if;

    -- O alvo novo não pode ser já o favorito.
    if v_atual_id = p_alvo_novo_id then
      raise exception 'este ja e o cliente acompanhado pela equipe' using errcode = '22023';
    end if;

    -- Teto: uma solicitação pendente por ambiente e tipo (a RPC confere
    -- ANTES para dar mensagem legível; o índice único parcial
    -- chamado_solicitacoes_um_pendente_por_tipo é a rede contra a corrida).
    if exists (
      select 1 from gps.chamado_solicitacoes s
       where s.ambiente_aluno_id = v_aluno_id and s.tipo = v_tipo and s.estado = 'pendente'
    ) then
      raise exception 'voce ja tem uma solicitacao de troca de cliente pendente' using errcode = '42501';
    end if;

  elsif p_categoria = 'troca_socio' then
    v_tipo := 'troca_socio';

    -- Existe sócio no ambiente, e quem pede É o titular (só o titular decide
    -- trocar o próprio sócio -- o sócio não abre chamado pedindo a própria
    -- saída por este caminho).
    if not exists (
      select 1 from gps.membros m
       where m.aluno_id = v_aluno_id and m.papel = 'titular' and m.user_id = auth.uid()
    ) then
      raise exception 'so o titular do ambiente pode pedir troca de socio' using errcode = '42501';
    end if;

    select m.id into v_socio
      from gps.membros m
     where m.aluno_id = v_aluno_id and m.papel = 'socio'
     limit 1;
    if v_socio.id is null then
      raise exception 'seu ambiente nao tem socio para trocar' using errcode = '22023';
    end if;
    v_atual_id := v_socio.id;

    -- Rótulo do sócio atual: nome do cadastro vinculado (pessoa_aluno_id),
    -- com fallback para o e-mail de login -- nem todo sócio tem
    -- pessoa_aluno_id preenchido (…244, casos sem cadastro casado por CPF).
    select coalesce(nullif(btrim(a.nome), ''), u.email, 'Sócio sem nome')
      into v_atual_rotulo
      from gps.membros m
      left join public.thb_alunos a on a.id = m.pessoa_aluno_id
      left join auth.users       u on u.id = m.user_id
     where m.id = v_socio.id;

    -- Troca de sócio aprova a SAÍDA do atual; a entrada do substituto segue
    -- pela aba Equipe (briefing, decisão #5) -- não há "alvo novo" aqui.
    v_novo_rotulo := null;

    if exists (
      select 1 from gps.chamado_solicitacoes s
       where s.ambiente_aluno_id = v_aluno_id and s.tipo = v_tipo and s.estado = 'pendente'
    ) then
      raise exception 'voce ja tem uma solicitacao de troca de socio pendente' using errcode = '42501';
    end if;
  end if;

  insert into gps.chamados (aluno_id, aberto_por, assunto, categoria)
  values (v_aluno_id, auth.uid(), btrim(p_assunto), p_categoria)
  returning id into v_novo;

  if v_tipo is not null then
    insert into gps.chamado_solicitacoes
      (chamado_id, ambiente_aluno_id, tipo, alvo_atual_id, alvo_novo_id,
       alvo_atual_rotulo, alvo_novo_rotulo)
    values
      (v_novo, v_aluno_id, v_tipo, v_atual_id,
       case when v_tipo = 'troca_cliente' then p_alvo_novo_id else null end,
       left(nullif(btrim(coalesce(v_atual_rotulo, '')), ''), 300),
       left(nullif(btrim(coalesce(v_novo_rotulo, '')), ''), 300));
  end if;

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

comment on function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid) is
  'Abre um chamado no ambiente do aluno logado (titular OU socio). Guardas de sempre: gps.aluno_atual() nao nulo, interruptor gps.chamados_abertos(), 5 chamados nao-fechados por ambiente. Guardas novas (11/09/2026, categoria+aprovacao): categoria na allowlist; troca_cliente exige alvo do PROPRIO ambiente, diferente do favorito atual, e o ambiente TER favorito atual (sem favorito e primeira escolha, livre, sem chamado); troca_socio exige socio existente no ambiente E que quem pede seja o TITULAR; teto de 1 solicitacao pendente por ambiente+tipo (indice chamado_solicitacoes_um_pendente_por_tipo e a rede contra corrida). Cria gps.chamado_solicitacoes na MESMA transacao quando a categoria e troca_cliente/troca_socio, com copia do rotulo (nome) dos alvos no instante do pedido. Devolve id e e-mails da equipe para a action avisar DEPOIS do commit -- a funcao nao manda e-mail.';

revoke execute on function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid) from public, anon;
grant  execute on function gps.chamado_abrir(text, text, text, text, text, integer, text, uuid) to authenticated;

-- ⚠️ A ASSINATURA ANTIGA (6 parâmetros, sem categoria/alvo) deixa de ser usada
-- pela aplicação, mas o Postgres permite duas funções com o mesmo nome e
-- assinaturas diferentes coexistindo -- não é "substituição" no sentido de
-- overload, e a antiga ficaria órfã com EXECUTE ainda concedido a
-- `authenticated`, uma segunda porta de abrir chamado SEM categoria. Derruba
-- explicitamente.
drop function if exists gps.chamado_abrir(text, text, text, text, text, integer);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. gps.chamado_aprovar_solicitacao — EXECUTA a troca
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONCORRÊNCIA: `for update` na solicitação E no chamado, na mesma ordem
-- sempre (solicitação primeiro, chamado depois) -- trava contra dois admins
-- clicando "Aprovar" ao mesmo tempo no mesmo pedido.
--
-- REVALIDA TUDO no momento da decisão: nunca confia no que foi gravado no
-- pedido (o favorito pode ter mudado, o sócio pode ter saído por outro
-- caminho entre a abertura do chamado e a aprovação).
--
-- TROCA DE CLIENTE — sequência obrigatória (não é UPDATE cru):
--   1. se o atual tem acompanhamento_confirmado_em -> gps.admin_liberar_
--      acompanhamento (a trigger trg_etapa1_clientes_acompanhamento_travado
--      barraria um update direto de acompanhado_equipe/fase enquanto
--      confirmado, e ninguém aqui é "admin" do ponto de vista da trigger só
--      por rodar como SECURITY DEFINER -- a função corre como o dono, mas a
--      trigger consulta public.gp_is_admin() sobre auth.uid(), que continua
--      sendo quem chamou; como só admin chama esta RPC, gp_is_admin() é
--      verdadeiro e a trigger deixaria passar mesmo sem o liberar -- mas o
--      liberar é feito de qualquer forma, INTENCIONALMENTE, porque é o
--      caminho auditado e reversível que já existe, em vez de inventar um
--      segundo jeito de zerar a confirmação por dentro desta função)
--   2. desmarcar o atual, marcar o novo
--   3. SE E SÓ SE o atual estava confirmado -> gps.admin_confirmar_
--      acompanhamento no novo
-- Sem isso a troca deixaria a equipe "acompanhando" ninguém.
--
-- TROCA DE SÓCIO — gps.admin_excluir_membro(p_membro_id) JÁ EXISTE (…131) e
-- já recusa titular/própria conta/conta de equipe, apaga auth.users com
-- `exception when foreign_key_violation then null` e grava membro_excluido.
-- Usada aqui, não reescrita. Aprovar REMOVE o sócio e apaga o login; o que
-- ele cadastrou fica (é do ambiente) -- é exatamente o que admin_excluir_
-- membro já faz. O convite do substituto segue pela aba Equipe.

create or replace function gps.chamado_aprovar_solicitacao(
  p_chamado_id uuid,
  p_motivo     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol         gps.chamado_solicitacoes%rowtype;
  v_chamado     gps.chamados%rowtype;
  v_motivo      text;
  v_atual       record;
  v_confirmado  boolean;
  v_email_aluno text;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.' using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  -- Trava: solicitação primeiro, chamado depois -- sempre nesta ordem, contra
  -- deadlock com uma eventual chamada que travasse ao contrário.
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

  -- ─────────────────────────────────────────────────────────────────────
  -- REVALIDAÇÃO no momento da decisão -- nunca confia no que foi gravado.
  -- ─────────────────────────────────────────────────────────────────────
  if v_sol.tipo = 'troca_cliente' then
    if v_sol.alvo_novo_id is null or not exists (
      select 1 from gps.etapa1_clientes c
       where c.id = v_sol.alvo_novo_id and c.aluno_id = v_chamado.aluno_id
    ) then
      raise exception 'O cliente escolhido não existe mais neste ambiente.' using errcode = '22023';
    end if;

    -- O favorito ATUAL pode ter mudado entre o pedido e a decisão -- lê de
    -- novo, não usa v_sol.alvo_atual_id.
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

    -- 1) se o atual está confirmado, libera primeiro (caminho auditado e
    --    reversível que já existe -- não um UPDATE por dentro desta função).
    if v_confirmado then
      perform gps.admin_liberar_acompanhamento(v_atual.id, 'Troca de cliente aprovada via chamado ' || p_chamado_id::text);
    end if;

    -- 2) desmarca o atual, marca o novo. Dois updates, não um só: o índice
    --    único parcial etapa1_clientes_unico_equipe não aceita as duas linhas
    --    marcadas ao mesmo tempo.
    update gps.etapa1_clientes set acompanhado_equipe = false where id = v_atual.id;
    update gps.etapa1_clientes set acompanhado_equipe = true  where id = v_sol.alvo_novo_id;

    -- 3) SE E SÓ SE o atual estava confirmado, confirma o novo -- sem isso a
    --    troca deixaria a equipe "acompanhando" ninguém.
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

    -- admin_excluir_membro JÁ recusa titular/própria conta/conta de equipe e
    -- grava membro_excluido -- não duplicado aqui. O e-mail que ela devolve
    -- não é usado (quem é avisado é o ALUNO, não o sócio removido).
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
$$;

comment on function gps.chamado_aprovar_solicitacao(uuid, text) is
  'gp_is_admin() ou 42501. Trava a solicitacao e o chamado com FOR UPDATE (contra dois admins simultaneos) e REVALIDA TUDO no momento da decisao -- nunca confia no que foi gravado no pedido. troca_cliente: sequencia obrigatoria liberar (se confirmado) -> desmarcar/marcar -> confirmar (se estava confirmado), nunca UPDATE cru -- usa gps.admin_liberar_acompanhamento/admin_confirmar_acompanhamento, os mesmos caminhos auditados de sempre. troca_socio: usa gps.admin_excluir_membro (…131), que ja recusa titular/propria conta/conta de equipe e grava membro_excluido -- nao reescrita aqui. Depois de executar: estado=aprovada, decidido_por=auth.uid(), grava mensagem na thread, fecha o chamado, loga chamado_solicitacao_aprovada e devolve o e-mail do aluno para a action avisar DEPOIS do commit.';

revoke execute on function gps.chamado_aprovar_solicitacao(uuid, text) from public, anon;
grant  execute on function gps.chamado_aprovar_solicitacao(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. gps.chamado_declinar_solicitacao — motivo obrigatório, nada é executado
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.chamado_declinar_solicitacao(
  p_chamado_id uuid,
  p_motivo     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol     gps.chamado_solicitacoes%rowtype;
  v_chamado gps.chamados%rowtype;
  v_motivo  text;
  v_email_aluno text;
begin
  if not coalesce(public.gp_is_admin(), false) then
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
$$;

comment on function gps.chamado_declinar_solicitacao(uuid, text) is
  'gp_is_admin() ou 42501. Motivo obrigatorio (3..300, o aluno le na thread). NAO executa nenhuma troca -- so grava mensagem, fecha o chamado (gps.chamado_fechar), loga chamado_solicitacao_declinada e devolve o e-mail do aluno para a action avisar DEPOIS do commit. Mesma trava FOR UPDATE contra dois admins simultaneos.';

revoke execute on function gps.chamado_declinar_solicitacao(uuid, text) from public, anon;
grant  execute on function gps.chamado_declinar_solicitacao(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. gps.config.chamados_categorias_ativo — interruptor de reversão
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 gps.config é SÓ-ADMIN (policy gps_config_admin, …110): sem uma função de
-- leitura, o front do parceiro lê 0 linhas -- o mesmo erro que quase foi ao ar
-- duas vezes (nota do briefing). gps.chamados_categorias_ativo() é a função,
-- no molde exato de gps.chamados_abertos().

insert into gps.config (chave, valor) values
  ('chamados_categorias_ativo', 'true')
on conflict (chave) do nothing;

create or replace function gps.chamados_categorias_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'chamados_categorias_ativo'),
           'true'
         ) <> 'false';
$$;

comment on function gps.chamados_categorias_ativo() is
  'Interruptor de REVERSAO da feature categoria+aprovacao de chamados: AUSENTE ou "true" = ligado (default tem de ser funcionar). "false" e o botao de panico -- desliga sem deploy. gps.config e SO-ADMIN (policy gps_config_admin): sem esta funcao SECURITY DEFINER, o parceiro leria 0 linhas e a tela de categoria sumiria calada. Le por esta funcao, nunca gps.config direto, no mesmo molde de gps.chamados_abertos().';

revoke execute on function gps.chamados_categorias_ativo() from public, anon;
grant  execute on function gps.chamados_categorias_ativo() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA DE GRANTS (rodar depois de aplicar; deve bater 1 linha cada)
-- ═══════════════════════════════════════════════════════════════════════════
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('public',        p.oid, 'execute') as public
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('chamado_abrir','chamado_aprovar_solicitacao',
--                         'chamado_declinar_solicitacao','chamados_categorias_ativo')
--    order by p.proname;
--   -- ESPERADO em TODAS: anon=f authenticated=t public=f
--   -- (chamado_abrir tem 2 linhas: a antiga foi DROPADA, deve sobrar 1)
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='gps' and table_name='chamado_solicitacoes';
--   -- ESPERADO: 1 linha (authenticated, SELECT). Nenhuma para anon/public.

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar). Tudo dentro
-- de um `do $$ ... $$` que termina em `raise exception`: o RAISE aborta a
-- transação e NADA sobrevive. `set_config('role', 'authenticated', ...)` +
-- JWT simulado onde há RLS -- como `postgres` não passa por RLS, prova
-- rodando só como superusuário não vale.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_titular_a    uuid; v_ambiente_a uuid;  -- ambiente A: tem favorito, sem sócio
--   v_titular_b    uuid; v_ambiente_b uuid;  -- ambiente B: outro ambiente (alvo de fora)
--   v_cliente_fav  uuid;  -- favorito atual do ambiente A
--   v_cliente_novo uuid;  -- outro cliente do ambiente A, para trocar
--   v_cliente_b    uuid;  -- cliente do ambiente B (alvo de fora, deve ser recusado)
--   v_titular_c    uuid; v_ambiente_c uuid; v_socio_c uuid; -- ambiente C: tem sócio
--   v_admin        uuid;
--   v_r            record;
--   v_chamado1     uuid; v_chamado2 uuid; v_chamado3 uuid; v_chamado4 uuid;
--   v_state        text; v_msg text;
--   v_caso_a text := 'NAO RODOU'; v_caso_b text := 'NAO RODOU';
--   v_caso_c text := 'NAO RODOU'; v_caso_d text := 'NAO RODOU';
--   v_caso_e text := 'NAO RODOU'; v_caso_f text := 'NAO RODOU';
--   v_caso_g text := 'NAO RODOU';
-- begin
--   select id into v_admin from public.perfis where status='ativo' and cargo in ('dev','admin') limit 1;
--   if v_admin is null then raise exception 'PROVA ABORTADA: nenhum admin encontrado'; end if;
--
--   -- Ambiente A: titular com favorito e >= 2 clientes, sem sócio.
--   select m.user_id, m.aluno_id into v_titular_a, v_ambiente_a
--     from gps.membros m
--    where m.papel='titular'
--      and exists (select 1 from gps.etapa1_clientes c where c.aluno_id=m.aluno_id and c.acompanhado_equipe)
--      and (select count(*) from gps.etapa1_clientes c where c.aluno_id=m.aluno_id) >= 2
--      and not exists (select 1 from gps.membros s where s.aluno_id=m.aluno_id and s.papel='socio')
--    limit 1;
--   if v_ambiente_a is null then raise exception 'PROVA ABORTADA: nenhum ambiente A elegivel (favorito + 2 clientes + sem socio)'; end if;
--
--   select id into v_cliente_fav from gps.etapa1_clientes where aluno_id=v_ambiente_a and acompanhado_equipe;
--   select id into v_cliente_novo from gps.etapa1_clientes where aluno_id=v_ambiente_a and id<>v_cliente_fav limit 1;
--
--   -- Ambiente B: outro ambiente, para pegar um cliente "de fora".
--   select m.user_id, m.aluno_id into v_titular_b, v_ambiente_b
--     from gps.membros m where m.papel='titular' and m.aluno_id<>v_ambiente_a
--      and exists (select 1 from gps.etapa1_clientes c where c.aluno_id=m.aluno_id)
--    limit 1;
--   select id into v_cliente_b from gps.etapa1_clientes where aluno_id=v_ambiente_b limit 1;
--
--   -- Ambiente C: tem sócio (para o caso de troca de sócio).
--   select m.user_id, m.aluno_id into v_titular_c, v_ambiente_c
--     from gps.membros m where m.papel='titular'
--      and exists (select 1 from gps.membros s where s.aluno_id=m.aluno_id and s.papel='socio')
--    limit 1;
--   if v_ambiente_c is not null then
--     select user_id into v_socio_c from gps.membros where aluno_id=v_ambiente_c and papel='socio' limit 1;
--   end if;
--
--   -- CASO A: abrir com categoria 'outros' (fluxo simples continua funcionando)
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular_a::text,'role','authenticated')::text, true);
--   select * into v_r from gps.chamado_abrir('Dúvida qualquer', 'texto de teste', null,null,null,null, 'outros', null);
--   v_chamado1 := v_r.chamado_id;
--   v_caso_a := case when v_chamado1 is not null
--                     and exists (select 1 from gps.chamados where id=v_chamado1 and categoria='outros')
--                     and not exists (select 1 from gps.chamado_solicitacoes where chamado_id=v_chamado1)
--               then 'OK outros sem solicitacao' else 'FALHOU' end;
--
--   -- CASO B: guarda de alvo de outro ambiente (cliente de B, pedido por A)
--   begin
--     perform gps.chamado_abrir('Trocar cliente', 'texto', null,null,null,null, 'troca_cliente', v_cliente_b);
--     v_caso_b := 'FALHOU: aceitou alvo de outro ambiente';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_b := case when v_state='22023' then 'OK 22023 (alvo de fora recusado)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO C: abrir troca_cliente válida + teto (2º pedido do mesmo tipo recusa)
--   select * into v_r from gps.chamado_abrir('Trocar cliente', 'texto', null,null,null,null, 'troca_cliente', v_cliente_novo);
--   v_chamado2 := v_r.chamado_id;
--   v_caso_c := case when exists (
--                 select 1 from gps.chamado_solicitacoes
--                  where chamado_id=v_chamado2 and tipo='troca_cliente' and estado='pendente'
--                    and alvo_novo_id=v_cliente_novo and alvo_atual_id=v_cliente_fav
--               ) then 'OK criou solicitacao pendente' else 'FALHOU' end;
--
--   begin
--     perform gps.chamado_abrir('Trocar de novo', 'texto', null,null,null,null, 'troca_cliente', v_cliente_novo);
--     v_caso_c := v_caso_c || ' | TETO FALHOU: aceitou 2a pendente';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_c := v_caso_c || ' | TETO ' || case when v_state='42501' then 'OK 42501' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   -- CASO D: aprovar troca de cliente SEM confirmação (41 favoritos hoje, 0 confirmados)
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.chamado_aprovar_solicitacao(v_chamado2, 'Aprovado na prova ...250');
--   v_caso_d := case when exists (select 1 from gps.etapa1_clientes where id=v_cliente_novo and acompanhado_equipe)
--                     and not exists (select 1 from gps.etapa1_clientes where id=v_cliente_fav and acompanhado_equipe)
--                     and exists (select 1 from gps.chamado_solicitacoes where chamado_id=v_chamado2 and estado='aprovada')
--                     and exists (select 1 from gps.chamados where id=v_chamado2 and status='fechado')
--               then 'OK trocou favorito, fechou chamado' else 'FALHOU' end;
--
--   -- CASO E: aprovar troca de cliente COM confirmação (fabrica o estado: confirma o favorito atual do novo par)
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.admin_confirmar_acompanhamento(v_cliente_novo, 'Confirmando para a prova ...250 (caso E)');
--
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_titular_a::text,'role','authenticated')::text, true);
--   select * into v_r from gps.chamado_abrir('Trocar cliente confirmado', 'texto', null,null,null,null, 'troca_cliente', v_cliente_fav);
--   v_chamado3 := v_r.chamado_id;
--
--   perform set_config('role','authenticated', true);
--   perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--   perform gps.chamado_aprovar_solicitacao(v_chamado3, 'Aprovado (com confirmacao) na prova ...250');
--   v_caso_e := case when exists (select 1 from gps.etapa1_clientes where id=v_cliente_fav and acompanhado_equipe and acompanhamento_confirmado_em is not null)
--                     and not exists (select 1 from gps.etapa1_clientes where id=v_cliente_novo and acompanhado_equipe)
--               then 'OK reconfirmou o favorito apos a troca' else 'FALHOU' end;
--
--   -- CASO F: aprovar troca de sócio (se houver ambiente C elegível)
--   if v_ambiente_c is not null then
--     perform set_config('role','authenticated', true);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_titular_c::text,'role','authenticated')::text, true);
--     select * into v_r from gps.chamado_abrir('Trocar sócio', 'texto', null,null,null,null, 'troca_socio', null);
--     v_chamado4 := v_r.chamado_id;
--
--     perform set_config('role','authenticated', true);
--     perform set_config('request.jwt.claims', json_build_object('sub', v_admin::text,'role','authenticated')::text, true);
--     perform gps.chamado_aprovar_solicitacao(v_chamado4, 'Aprovado troca de socio na prova ...250');
--     v_caso_f := case when not exists (select 1 from gps.membros where aluno_id=v_ambiente_c and papel='socio')
--                       and not exists (select 1 from auth.users where id=v_socio_c)
--                       and exists (select 1 from gps.acessos_log where acao='membro_excluido' and aluno_id=v_ambiente_c)
--                 then 'OK removeu socio e apagou login' else 'FALHOU' end;
--   else
--     v_caso_f := 'PULADO: nenhum ambiente com socio disponivel para o teste';
--   end if;
--
--   -- CASO G: declinar + dois admins simultâneos (2º aprovar/declinar falha: já decidida)
--   begin
--     perform gps.chamado_declinar_solicitacao(v_chamado2, 'ja foi decidida, deve falhar');
--     v_caso_g := 'FALHOU: declinou solicitacao ja aprovada';
--   exception when others then
--     get stacked diagnostics v_state = returned_sqlstate;
--     v_caso_g := case when v_state='22023' then 'OK 22023 (dois admins/decisao dupla barrada)' else 'FALHOU sqlstate='||v_state end;
--   end;
--
--   perform set_config('role','none', true);
--   raise exception E'PROVA ...250\n A (outros sem solicitacao): %\n B (alvo de outro ambiente): %\n C (troca_cliente + teto): %\n D (aprovar SEM confirmacao): %\n E (aprovar COM confirmacao): %\n F (aprovar troca de socio): %\n G (decisao dupla barrada): %',
--     v_caso_a, v_caso_b, v_caso_c, v_caso_d, v_caso_e, v_caso_f, v_caso_g;
-- end $$;
--
-- ESPERADO: A = "OK outros sem solicitacao" · B = "OK 22023 (alvo de fora recusado)" ·
--   C = "OK criou solicitacao pendente | TETO OK 42501" ·
--   D = "OK trocou favorito, fechou chamado" ·
--   E = "OK reconfirmou o favorito apos a troca" ·
--   F = "OK removeu socio e apagou login" (ou PULADO, se não houver ambiente C) ·
--   G = "OK 22023 (dois admins/decisao dupla barrada)"

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPLAIN (ANALYZE) das queries novas (protocolo de sustentabilidade). Rodar
-- depois de aplicar E depois da prova em rollback.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1) Fila de pedidos pendentes da equipe — usa idx_chamado_solicitacoes_pendente
--   explain (analyze, buffers)
--   select * from gps.chamado_solicitacoes where estado = 'pendente';
--   -- ESPERADO: Index Scan (ou Seq Scan aceitável enquanto a tabela for
--   -- pequena o bastante para o planner preferir -- tabela nasce vazia hoje,
--   -- crescimento é 1 linha por chamado de troca; conferir de novo se passar
--   -- de alguns milhares de linhas).
--
-- 2) Teto por ambiente+tipo (guarda em chamado_abrir e o índice que a garante)
--   explain (analyze, buffers)
--   select 1 from gps.chamado_solicitacoes
--    where ambiente_aluno_id = '<uuid>' and tipo = 'troca_cliente' and estado = 'pendente';
--   -- ESPERADO: Index Scan usando chamado_solicitacoes_um_pendente_por_tipo,
--   -- Index Cond em (ambiente_aluno_id, tipo), sem Filter residual (o `estado
--   -- = 'pendente'` já está no WHERE do índice) -- no máximo 1 linha por
--   -- definição do próprio índice único.
--
-- 3) Join chamado × solicitação para a tela do admin (1 chamado por vez)
--   explain (analyze, buffers)
--   select c.*, s.*
--     from gps.chamados c
--     left join gps.chamado_solicitacoes s on s.chamado_id = c.id
--    where c.id = '<uuid>';
--   -- ESPERADO: Index Scan em gps.chamados (PK) + Index Scan em
--   -- gps.chamado_solicitacoes (PK, que É chamado_id) -- custo constante,
--   -- nenhuma varredura de tabela inteira.
