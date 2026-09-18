-- A lixeira de ambientes ganha as DUAS pontas que faltavam: devolver o que
-- foi guardado, e parar de guardar para sempre.
--
-- Origem: 18/09/2026. O Marcio relatou que o Guilherme Canal da Rocha
-- "perdeu todos os clientes". Investigado: o acesso dele foi excluído em
-- 10/09 18:20 UTC (rodada 3 da limpeza dos 141×159) e a exclusão apagou os
-- 17 clientes. A `gps.lixeira_ambientes` só passou a existir em 11/09 — um
-- dia TARDE para ele. Os 17 não estão na lixeira e não voltam por aqui.
--
-- ⚠️ ESTA MIGRAÇÃO NÃO RECUPERA O GUILHERME. Ela fecha o buraco para os
-- próximos. A via dele, se houver, é PITR — decisão do Marcio, à parte.
--
-- ═══════════════════════════════════════════════════════════════════════
-- O QUE JÁ EXISTIA (não é reescrito aqui)
-- ═══════════════════════════════════════════════════════════════════════
-- `gps.admin_excluir_acesso` já grava o retrato (clientes, progresso, notas,
-- chamados, membros, onboarding) em `gps.lixeira_ambientes` ANTES dos 13
-- deletes, e já exige `p_confirmar_perda` quando o ambiente tem conteúdo.
-- A tabela já tem RLS com policy só de SELECT para `gp_is_admin()`, e
-- `authenticated` só tem SELECT (nenhum INSERT/UPDATE/DELETE pela API).
--
-- ═══════════════════════════════════════════════════════════════════════
-- O QUE FALTAVA — as duas pontas
-- ═══════════════════════════════════════════════════════════════════════
-- 1. 🔴 NÃO HAVIA COMO RESTAURAR. O retrato era guardado e ninguém
--    conseguia devolvê-lo pelo sistema: dependia de alguém escrever SQL à
--    mão, de cabeça, sobre um JSON — exatamente o tipo de operação em que se
--    erra o `aluno_id` e se cria cliente no ambiente do vizinho.
--    🔑 Backup que ninguém sabe restaurar não é backup, é esperança.
--
-- 2. 🔴 O RETRATO FICAVA PARA SEMPRE. Ele carrega nome, telefone e anotação
--    livre de CLIENTES DO PARCEIRO — terceiros que nunca souberam que estão
--    no sistema. Guardar isso indefinidamente contraria a minimização da
--    LGPD. Agora há prazo e um expurgo que o admin dispara.
--
-- ═══════════════════════════════════════════════════════════════════════
-- DECISÕES DE DESENHO
-- ═══════════════════════════════════════════════════════════════════════
--
-- 🔑 RESTAURA SÓ CLIENTES. Não progresso, não notas, não chamados.
--    Motivo: cliente é o dado que o parceiro levou meses reunindo e que ele
--    não tem em outro lugar. Progresso se refaz clicando; nota da equipe e
--    chamado são registros de um atendimento que já passou, e devolvê-los
--    ressuscitaria conversa antiga em ambiente novo. O retrato COMPLETO
--    continua guardado — quem quiser o resto lê o JSON e decide caso a caso.
--
-- 🔴 NUNCA sobrescreve nem apaga nada. Só INSERT, e pulando o que já existe.
--    Restaurar o Guilherme hoje não pode encostar nos 20 que ele recadastrou.
--    A deduplicação é por (nome normalizado + telefone só-dígitos), não por
--    id: o id antigo pode ter sido reciclado, e o parceiro que recadastrou
--    "Fabio Bonato" à mão não quer dois Fabio Bonato na lista.
--
-- 🔑 IDEMPOTENTE POR CONSTRUÇÃO. Rodar duas vezes não duplica: a segunda
--    passada acha tudo como "já existe" e devolve restaurados=0. É o que
--    torna seguro tentar de novo depois de um erro de rede.
--
-- 🔴 O ALVO É O AMBIENTE ATUAL, informado pelo admin — não o `aluno_id` do
--    retrato. Quem foi excluído e voltou pode estar em ambiente com outro
--    id; e escrever no id do retrato criaria linha órfã, invisível para
--    todo mundo (o bug silencioso que o LEFT JOIN da lista de clientes
--    existe para evitar).
--
-- 🔑 A trilha registra a restauração em `gps.acessos_log` E um evento por
--    cliente em `gps.aluno_eventos` com ator 'equipe' — senão o parceiro
--    veria 17 clientes aparecerem do nada no diário dele.
--
-- REVERSÃO:
--   drop function gps.admin_lixeira_restaurar_clientes(uuid, uuid);
--   drop function gps.admin_lixeira_expurgar(integer);
--   alter table gps.lixeira_ambientes drop column if exists restaurado_em,
--     drop column if exists restaurado_por, drop column if exists expurgar_em;
--   (a tabela e o retrato ficam; nada de dado se perde na reversão)

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Colunas de controle
-- ═══════════════════════════════════════════════════════════════════════
-- `expurgar_em` nasce com 180 dias, o MESMO prazo já adotado para anexo de
-- chamado fechado (Fase 6, 09/09) — não inventar um segundo prazo de
-- retenção no mesmo produto.

alter table gps.lixeira_ambientes
  add column if not exists restaurado_em  timestamptz,
  add column if not exists restaurado_por uuid,
  add column if not exists expurgar_em    timestamptz
    not null default (now() + interval '180 days');

comment on column gps.lixeira_ambientes.restaurado_em is
  'Quando o conteudo foi devolvido a um ambiente por gps.admin_lixeira_restaurar_clientes. NAO impede restaurar de novo (a RPC e idempotente e pula o que ja existe) -- serve para a tela mostrar "ja restaurado em DD/MM" e evitar que dois admins tentem em paralelo achando que o outro nao fez.';

comment on column gps.lixeira_ambientes.expurgar_em is
  '🔴 LGPD: o retrato carrega nome/telefone/anotacao de CLIENTES DO PARCEIRO (terceiros). 180 dias, mesmo prazo do anexo de chamado fechado. Passado o prazo, gps.admin_lixeira_expurgar() apaga o conteudo e preserva so o resumo numerico (auditoria sem PII).';

-- ═══════════════════════════════════════════════════════════════════════
-- 2) Restaurar os clientes de um retrato para um ambiente VIVO
-- ═══════════════════════════════════════════════════════════════════════

create or replace function gps.admin_lixeira_restaurar_clientes(
  p_lixeira_id uuid,
  p_para_aluno_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- 🔴 O destino tem de ser ambiente VIVO. Sem isto, a restauração criaria
  -- linhas que ninguém vê: `gps.etapa1_clientes` não tem FK para membros, e
  -- a lista do portal filtra por ambiente com titular.
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

    -- Deduplicação por NOME + TELEFONE, nunca por id (ver cabeçalho).
    -- `lower(btrim())` dos dois lados: o parceiro que redigitou pode ter
    -- usado outra caixa.
    if exists (
      select 1 from gps.etapa1_clientes c
       where c.aluno_id = p_para_aluno_id
         and lower(btrim(coalesce(c.nome,''))) = lower(v_nome)
         and regexp_replace(coalesce(c.telefone,''), '\D', '', 'g') = v_tel
    ) then
      v_ja_existiam := v_ja_existiam + 1;
      continue;
    end if;

    -- 🔑 Colunas nomeadas UMA A UMA, nunca `jsonb_populate_record`: o retrato
    -- é de um schema de dias atrás e pode ter coluna que não existe mais (ou
    -- faltar coluna nova). Nomear é o que faz a restauração falhar alto em
    -- vez de gravar lixo. `id` NÃO vem do retrato -- linha nova, id novo.
    insert into gps.etapa1_clientes (
      aluno_id, nome, telefone, fase, grau_relacao, perfil_disc,
      data_reuniao_preliminar, aderiu_reuniao, registro_contato,
      valor_honorarios, problemas, criado_em
    )
    values (
      p_para_aluno_id,
      -- 🔴 `nome` e NOT NULL (default ''): `nullif` aqui quebraria o insert
      -- para cliente sem nome no retrato. Fica string vazia, como a tabela ja
      -- aceita hoje -- a ficha mostra "Cliente sem nome" e o parceiro corrige.
      v_nome,
      nullif(v_c->>'telefone', ''),
      coalesce(nullif(v_c->>'fase',''), 'prospeccao'),
      nullif(v_c->>'grau_relacao',''),
      nullif(v_c->>'perfil_disc',''),
      (nullif(v_c->>'data_reuniao_preliminar',''))::date,
      coalesce((nullif(v_c->>'aderiu_reuniao',''))::boolean, false),
      nullif(v_c->>'registro_contato',''),
      (nullif(v_c->>'valor_honorarios',''))::numeric,
      -- `problemas` e NOT NULL default '{}' -- coalesce, nunca null.
      coalesce(
        case when jsonb_typeof(v_c->'problemas') = 'array'
             then (select array_agg(x) from jsonb_array_elements_text(v_c->'problemas') x)
             else null end,
        '{}'::text[]),
      coalesce((nullif(v_c->>'criado_em',''))::timestamptz, now())
    )
    returning id into v_novo_id;

    v_restaurados := v_restaurados + 1;

    -- 🔑 Evento com ator 'equipe': sem isto, 17 clientes apareceriam no
    -- diário do parceiro sem explicação de onde vieram.
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

comment on function gps.admin_lixeira_restaurar_clientes(uuid, uuid) is
  'Devolve os CLIENTES de um retrato da lixeira para um ambiente VIVO. gp_is_admin() ou 42501. 🔑 So clientes -- progresso se refaz clicando, e nota/chamado sao atendimento passado que nao se ressuscita em ambiente novo (o retrato completo continua guardado para leitura manual). 🔴 NUNCA sobrescreve nem apaga: so INSERT, pulando quem ja existe por nome+telefone normalizados (nao por id -- o parceiro pode ter recadastrado a mao). Idempotente: a 2a passada devolve restaurados=0. O destino e o ambiente ATUAL informado pelo admin, nao o aluno_id do retrato (quem voltou pode estar em outro ambiente; escrever no id velho criaria linha orfa invisivel). Gera evento ator=equipe por cliente + 1 linha em acessos_log.';

revoke execute on function gps.admin_lixeira_restaurar_clientes(uuid, uuid) from public, anon;
grant  execute on function gps.admin_lixeira_restaurar_clientes(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) Expurgo — o retrato não pode ficar para sempre
-- ═══════════════════════════════════════════════════════════════════════
-- Apaga o CONTEÚDO (a PII) e PRESERVA a linha com o resumo numérico: a
-- auditoria de "este ambiente foi excluído e tinha 17 clientes" continua de
-- pé sem guardar o nome e o telefone de 17 terceiros.
--
-- Por CLIQUE do admin, não por cron: mesma decisão do expurgo de anexo de
-- chamado (Fase 6). Apagar dado de pessoa é ação que alguém assume.

create or replace function gps.admin_lixeira_expurgar(
  p_dias integer default null   -- null = usa o expurgar_em de cada linha
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_alvo int; v_ids uuid[];
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_dias is not null and (p_dias < 0 or p_dias > 3650) then
    raise exception 'Prazo inválido.' using errcode = '22023';
  end if;

  select array_agg(id) into v_ids
    from gps.lixeira_ambientes
   where conteudo <> '{}'::jsonb
     and case when p_dias is null then expurgar_em <= now()
              else excluido_em <= now() - make_interval(days => p_dias) end;

  v_alvo := coalesce(array_length(v_ids, 1), 0);
  if v_alvo = 0 then
    return jsonb_build_object('expurgados', 0);
  end if;

  -- 🔑 `conteudo` vira {} e o resumo FICA: a trilha continua dizendo que o
  -- ambiente foi excluido e quanto tinha, sem guardar PII de terceiro.
  update gps.lixeira_ambientes
     set conteudo = '{}'::jsonb
   where id = any(v_ids);

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('lixeira_expurgada', null,
    format('%s retrato(s) tiveram o conteudo apagado (PII de clientes de terceiros). Resumo numerico preservado para auditoria.', v_alvo),
    auth.uid());

  return jsonb_build_object('expurgados', v_alvo);
end $function$;

comment on function gps.admin_lixeira_expurgar(integer) is
  'Apaga o CONTEUDO dos retratos vencidos da lixeira (PII de clientes do parceiro -- terceiros) e PRESERVA a linha com o resumo numerico, para a auditoria continuar de pe sem guardar nome/telefone. Sem argumento usa o expurgar_em de cada linha (180 dias, mesmo prazo do anexo de chamado fechado); com p_dias, expurga o que foi excluido ha mais de N dias. gp_is_admin() ou 42501. Por CLIQUE do admin, nao por cron: apagar dado de pessoa e acao que alguem assume.';

revoke execute on function gps.admin_lixeira_expurgar(integer) from public, anon;
grant  execute on function gps.admin_lixeira_expurgar(integer) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- CATÁLOGO DE `gps.acessos_log.acao` — +2 valores (aplicado junto)
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 Pego ANTES de rodar: `clientes_restaurados` e `lixeira_expurgada` não
-- estavam no CHECK. As duas RPCs teriam falhado no INSERT da trilha — e a
-- restauração inteira abortaria no último passo, depois de já ter inserido
-- os clientes. Acrescentados por REESCRITA PROGRAMÁTICA do CHECK vivo
-- (`pg_get_constraintdef` + replace na âncora `operador_definido`), nunca
-- redigitando os 27 valores de memória: CHECK reescrito de cabeça apaga
-- valor em silêncio (lição já paga 2x neste repo).
-- Conferido depois: 29 valores, os 27 antigos preservados.

-- ═══════════════════════════════════════════════════════════════════════
-- PROVA — MEDIDO EM PRODUÇÃO EM 18/09/2026 (transação com rollback)
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1) RESTAURAÇÃO com retrato de 3 clientes, um deles JÁ existente no
--    ambiente de destino ("Fabio Bonato", que o parceiro recadastrou):
--      antes ................ 20 clientes
--      passada 1 ............ restaurados=2 · ja_existiam=1 · total=3
--      depois da 1 .......... 22 clientes
--      passada 2 ............ restaurados=0 · ja_existiam=3 · total=3
--      depois da 2 .......... 22 clientes  ← IDEMPOTENTE ✓
--    🔑 A dedup por nome+telefone protegeu o trabalho que o parceiro já
--    tinha refeito à mão. Sem ela, ele ficaria com 2 "Fabio Bonato".
--
-- 2) CAMPOS PRESERVADOS na restauração (não vira ficha em branco):
--      "Cliente Antigo Um" voltou com fase=fechamento, grau_relacao=parente,
--      valor_honorarios=15000.00 ✓
--
-- 3) GUARDAS (mensagem em português, não erro cru):
--      admin + destino inexistente → 22023 "O ambiente de destino não
--        existe ou não tem ninguém dentro. Crie o acesso antes de restaurar."
--      admin + retrato inexistente → P0002 "Retrato não encontrado na lixeira."
--      JWT de ALUNO TITULAR real   → 42501 nas DUAS RPCs
--      sem JWT                     → 42501 nas DUAS RPCs
--
-- 4) EXPURGO:
--      sem argumento (prazo de 180d, nada vencido) → expurgados=0
--        ← não apaga por engano o que ainda está no prazo
--      com p_dias=1 (forçado)                      → expurgados=4
--      depois: 0 retratos com conteúdo, e o RESUMO SOBREVIVEU:
--        {"clientes":1,"eventos":5,...} com conteudo={} ✓
--      A auditoria continua sabendo QUANTO havia, sem guardar o nome e o
--      telefone dos terceiros.
--
-- 5) ACL das 2 funções: {postgres, authenticated, service_role} — sem anon.
--
-- 6) PRODUÇÃO INTACTA depois de tudo: 4 retratos com conteúdo, 0 restaurados
--    de verdade, Guilherme segue com seus 20 clientes, 0 linha de teste em
--    `gps.acessos_log`.
--
-- ⚠️ SEM TELA AINDA. As duas RPCs existem e estão provadas, mas nenhuma
-- página as chama — hoje se usa por SQL. A tela (listar a lixeira, escolher
-- destino, restaurar com confirmação nomeada) é trabalho à parte.
