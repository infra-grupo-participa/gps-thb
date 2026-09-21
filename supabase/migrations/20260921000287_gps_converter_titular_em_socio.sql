-- Converter um TITULAR do próprio ambiente em SÓCIO de outro ambiente,
-- levando o trabalho dele junto.
--
-- ═══════════════════════════════════════════════════════════════════════
-- ORIGEM — o chamado do Jonas (21/09/2026)
-- ═══════════════════════════════════════════════════════════════════════
-- O parceiro Jonas Alves Viana (0c7123f7-75b8-420b-aa2f-cd3a74517d75) abriu
-- chamado dizendo que o sócio dele, Carlos Alberto Magalhães
-- (62ddfb0b-a93d-4f5d-83e7-8e40bdc57849), "já preencheu tudo" e mesmo assim
-- ele via a tela vazia. Foi vendido na reunião que sócios teriam informação
-- SIMULTÂNEA — e não tinham.
--
-- Causa medida: o Carlos NUNCA foi ligado ao ambiente do Jonas. Ele entrou em
-- 21/07/2026, ANTES de a feature de sócio existir, e virou TITULAR do próprio
-- ambiente. Os 3 clientes dele estão em `62ddfb0b`, não em `0c7123f7`.
--
-- 🔑 A LÓGICA NUNCA ESTEVE ERRADA. `gps.resolver_ambiente('62ddfb0b…')`
--    devolve HOJE `0c7123f7…`, e `public.gps_handle_new_user` já decide o
--    papel por `case when v_ambiente = v_aluno then 'titular' else 'socio'`.
--    O defeito é TEMPORAL: `thb_alunos.socio_de_aluno_id` foi preenchido por
--    importação DEPOIS de ele já ter entrado, e ninguém reprocessou. Por isso
--    esta migração NÃO mexe no gatilho — não há o que corrigir lá.
--
-- Varredura da base: só o Carlos apresenta o defeito. Os outros 2 membros
-- divergentes de `resolver_ambiente` estão corretos (sócios em ambiente com
-- titular real). Cleuda/Rafael/Isabela têm `socio_de_aluno_id` NULL e ficam
-- FORA desta rodada por decisão do arquiteto.
--
-- ═══════════════════════════════════════════════════════════════════════
-- DECISÃO DE ARQUITETURA — move-se a PESSOA, não o ambiente
-- ═══════════════════════════════════════════════════════════════════════
-- 🔑 NÃO se move ambiente. `gps.membros.user_id` é UNIQUE e 25 FKs apontam
--    para `thb_alunos`; arrastar um ambiente inteiro significaria reescrever
--    todas elas. O que se move é a PESSOA (`update gps.membros`) e o que se
--    COPIA são as linhas de trabalho.
--
-- 🔑 Os DOIS cadastros em `public.thb_alunos` continuam existindo, intocados.
--    `pessoa_aluno_id` do membro NÃO muda — a pessoa é a mesma, só o ambiente
--    dela mudou. É o mesmo princípio já firmado em `gps.admin_mover_membro`
--    (migração ...156).
--
-- 🔴 NADA fora do schema `gps` é tocado aqui. Sem `auth.users`, sem
--    `thb_alunos`, sem `cs.*`. O Carlos e o Jonas têm senha própria e sessão
--    aberta: esta RPC não troca senha e não derruba sessão. (`auth.users` é
--    compartilhada pelos 7 sistemas do grupo — mexer ali derrubaria todos.)
--
-- ═══════════════════════════════════════════════════════════════════════
-- O QUE COPIA E O QUE NÃO COPIA
-- ═══════════════════════════════════════════════════════════════════════
-- COPIA: só `gps.etapa1_clientes`.
-- NÃO COPIA: progresso, notas, chamados, eventos.
--
-- Não é decisão nova — é a MESMA já tomada e documentada na migração ...286
-- (lixeira/restauração): cliente é o dado que o parceiro levou meses reunindo
-- e que não existe em outro lugar; progresso se refaz clicando; nota da equipe
-- e chamado são registro de um atendimento que já passou, e ressuscitá-los em
-- ambiente novo confunde quem for ler. Repetir aqui o mesmo critério evita
-- duas regras concorrentes para a mesma pergunta.
--
-- O ambiente de origem é fotografado INTEIRO na lixeira antes de qualquer
-- escrita — o que não for copiado continua recuperável de lá.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 A ASSINATURA RECEBE `thb_alunos.id`, NÃO `gps.membros.id`
-- ═══════════════════════════════════════════════════════════════════════
-- `p_cadastro_id` é o `public.thb_alunos.id` do cadastro escolhido na Central.
-- A tela NÃO conhece `gps.membros.id` de outro ambiente — o seletor entrega o
-- cadastro. O membro é resolvido aqui dentro.
--
-- REGRA DE CASAMENTO (a mesma na prévia ...287 e na escrita):
--
--   select id from gps.membros
--    where pessoa_aluno_id = p_cadastro_id
--       or (pessoa_aluno_id is null and aluno_id = p_cadastro_id)
--
-- Em português: casa pela PESSOA; e, só quando a pessoa ainda não foi
-- identificada (`pessoa_aluno_id is null` — a lacuna que a ...154 deixou
-- visível de propósito), aceita casar pelo AMBIENTE.
--
-- 🔑 Por que NÃO é `pessoa_aluno_id = X or aluno_id = X` puro e simples:
--    esse `or` solto casaria DUAS linhas diferentes quando um cadastro é ao
--    mesmo tempo a pessoa de um membro e o ambiente de outro — e um `limit 1`
--    escolheria em silêncio. O `is null` no segundo ramo torna os dois
--    mutuamente exclusivos POR LINHA.
--
-- 🔴 AMBIGUIDADE É RECUSA, NÃO PALPITE.
--    ⚠️ CORREÇÃO (pentest de 21/09/2026): uma versão anterior deste comentário
--    afirmava que `gps.membros.pessoa_aluno_id` NÃO tem índice único, citando
--    a ...154, que de fato o adiou. **Ele existe desde a ...160** e está no ar:
--      membros_pessoa_uk UNIQUE (pessoa_aluno_id) WHERE pessoa_aluno_id IS NOT NULL
--    Medido em 21/09: 0 pessoas em dois membros. O comentário errado induziu
--    erro no próprio briefing do pentest — por isso fica registrado aqui em
--    vez de apagado.
--
--    A recusa por 21000 CONTINUA necessária, por outro motivo: o segundo ramo
--    do `or` casa por AMBIENTE (`pessoa_aluno_id is null and aluno_id = X`), e
--    nada impede que um cadastro seja a pessoa de um membro e, ao mesmo tempo,
--    o ambiente de outro membro ainda sem pessoa. Nesse cruzamento a resolução
--    devolve 2 linhas — e aí a função levanta 21000 em vez de escolher, porque
--    converter o membro errado moveria os clientes de outra pessoa.
--
-- ═══════════════════════════════════════════════════════════════════════
-- GUARDAS (todas ANTES de qualquer escrita)
-- ═══════════════════════════════════════════════════════════════════════
--   1. public.gp_is_admin()                                      → 42501
--   2. parâmetros não nulos                                      → 22023
--   3. o cadastro resolve para 1 membro (0 → P0002, >1 → 21000)
--   4. o membro é TITULAR                                        → 42501
--   5. o membro é titular DO PRÓPRIO ambiente (aluno_id = pessoa)→ 42501
--   6. destino ≠ origem                                          → 22023
--   7. o ambiente de DESTINO existe e tem titular                → P0002
--   8. o login já participa do destino (membros_aluno_user_uk)   → 23505
--   9. a origem NÃO tem outro membro                             → 42501
--  10. o ambiente de origem TEM nome (senão a confirmação nomeada
--      seria impossível de digitar)                              → 22023
--  11. p_confirmar bate com o nome do ambiente de origem         → P0004
--
-- 🔴 A guarda 9 é o que torna a exclusão do ambiente de origem segura: se
--    houver mais alguém lá dentro, converter este membro deixaria o ambiente
--    SEM TITULAR — estado que `gps.financeiro_pode_ler` e a lista de clientes
--    não sabem ler, e que criaria linhas órfãs invisíveis. Recusa e manda o
--    admin resolver o outro membro primeiro.
--
-- 🔴 A guarda 10 é confirmação NOMEADA, o mesmo mecanismo (errcode P0004) que
--    `gps.admin_excluir_acesso` já usa em produção. Operação que copia dado e
--    apaga ambiente não pode disparar por clique errado numa lista.
--
-- 🔑 `select ... for update` no membro e no ambiente de destino ANTES das
--    guardas serializa a operação: dois admins clicando junto não criam estado
--    partido (um convertendo enquanto o outro exclui o destino).
--
-- ═══════════════════════════════════════════════════════════════════════
-- AS 5 PERGUNTAS DO PROTOCOLO DE SUSTENTABILIDADE
-- ═══════════════════════════════════════════════════════════════════════
-- ESCALA ....... Operação de admin, pontual, sobre UM ambiente. O laço percorre
--                os clientes de um único parceiro (o caso real tem 3; o maior
--                ambiente da base tem dezenas, não milhares). Não cresce com a
--                base — cresce com o tamanho de um ambiente.
-- ÍNDICE ....... O `exists` da dedup filtra por `c.aluno_id = <destino>`
--                PRIMEIRO (coluna indexada), e só então aplica as expressões
--                normalizadas sobre o resultado. É a mesma forma da ...286.
--                🔴 A expressão é `lower(btrim(...))`, copiada CARACTERE A
--                CARACTERE da ...286 — não `btrim(lower(...))`. As duas dão o
--                mesmo resultado e são índices DIFERENTES para o planner; foi
--                exatamente essa inversão que custou 1.085 ms/chamada em
--                19/08. Medir com explain (analyze), não presumir.
--
-- ═══════════════════════════════════════════════════════════════════════
-- PLANOS MEDIDOS EM PRODUÇÃO — 21/09/2026 (não previstos de cabeça)
-- ═══════════════════════════════════════════════════════════════════════
-- Colados literalmente, no precedente da ...282. Previsão de tipo de scan
-- feita de memória já errou neste projeto; o que vale é o plano medido.
--
-- (1) LEITURA DA ORIGEM — o laço da cópia:
--     explain (analyze, buffers)
--     select * from gps.etapa1_clientes c where c.aluno_id = '62ddfb0b…';
--
--     Bitmap Heap Scan on etapa1_clientes c
--       (cost=1.40..4.67 rows=3) (actual time=0.037..0.073 rows=3 loops=1)
--       Recheck Cond: (aluno_id = '62ddfb0b…'::uuid)
--       Heap Blocks: exact=4
--       Buffers: shared hit=6
--       ->  Bitmap Index Scan on etapa1_clientes_aluno_idx
--             (actual time=0.020..0.020 rows=4 loops=1)
--     Execution Time: 0.166 ms
--
-- (2) DEDUP — o `exists` que decide copiar ou pular:
--     explain (analyze, buffers)
--     select 1 from gps.etapa1_clientes c
--      where c.aluno_id = '0c7123f7…'
--        and lower(btrim(coalesce(c.nome,''))) = lower('Familia Pagotto')
--        and regexp_replace(coalesce(c.telefone,''),'\D','','g') = '11999999999';
--
--     Index Scan using etapa1_clientes_aluno_idx on etapa1_clientes c
--       (cost=0.28..2.51 rows=1) (actual time=0.020..0.020 rows=0 loops=1)
--       Index Cond: (aluno_id = '0c7123f7…'::uuid)
--       Filter: ((regexp_replace(COALESCE(telefone,''),'\D','','g') = …)
--                AND (lower(btrim(COALESCE(nome,''))) = 'familia pagotto'))
--       Buffers: shared hit=2
--     Execution Time: 0.068 ms
--
--     🔑 NÃO é Seq Scan. O índice de `aluno_id` poda PRIMEIRO e as expressões
--     normalizadas só rodam sobre o punhado que sobra. Foi a dúvida que
--     motivou extrair `gps.cliente_chave_dedup`: a função `immutable` não
--     impediu a poda. CONCLUSÃO MEDIDA: **não criar índice funcional** —
--     pagaria escrita na tabela mais quente do sistema para uma operação
--     que roda sob demanda do admin.
--
-- (3) gps.aluno_atual() — lida por toda policy de RLS do ambiente:
--     Index Scan using membros_user_id_idx on membros m
--       Index Cond: (user_id = '2f406431-…'::uuid)
--     Execution Time: 0.129 ms
-- FREQUÊNCIA ... Sob demanda do admin, esperado ~1 vez por caso relatado.
--                Não há cron, não há gatilho, não há chamada de tela de aluno.
-- REPETIÇÃO .... Uma chamada resolve o caso inteiro; não há N+1 do lado do
--                cliente. O laço é por cliente copiado, dentro da mesma
--                transação.
-- REVERSÃO ..... `drop function gps.admin_converter_titular_em_socio(uuid,uuid,text);`
--                O estado de dado se desfaz por `gps.admin_mover_membro` (põe
--                a pessoa de volta) + `gps.admin_lixeira_restaurar_clientes`
--                sobre o retrato, que é gravado aqui ANTES de qualquer escrita.
--
--                🔴 ESTA FUNÇÃO APAGA, SIM — e o cabeçalho anterior mentia ao
--                dizer que não (corrigido no veredito de 21/09/2026). Depois
--                de copiar, ela remove as linhas de trabalho do ambiente de
--                origem, que passou a não ter membro nenhum. Sem isso elas
--                ficariam órfãs e CONTADAS EM DOBRO nas telas de admin, que
--                não filtram por ambiente vivo (ver bloco 4).
--
--                O que a reversão devolve e o que ela NÃO devolve:
--                  ✔ clientes  — `admin_lixeira_restaurar_clientes` os
--                    reinsere no ambiente que o admin indicar, deduplicando.
--                  ✔ a pessoa  — `admin_mover_membro` a leva de volta.
--                  ✖ progresso, notas e chamados — ficam SÓ no `conteudo`
--                    jsonb do retrato; não há RPC que os reinsira (decisão
--                    da ...286, repetida aqui).
--                  ✖ as CÓPIAS feitas no destino — nascem com id novo e
--                    permanecem lá. Desfazer por inteiro exige apagá-las à
--                    mão, e é por isso que o diálogo da Central escreve, em
--                    texto, que a cópia não se desfaz sozinha.

-- ═══════════════════════════════════════════════════════════════════════
-- 0) A DEDUP, em UM lugar só
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 A prévia e a escrita TÊM de contar a mesma coisa. Se divergirem, o admin
-- lê "3 clientes serão copiados", clica, e o sistema copia outro número —
-- decidir por um número e executar outro é pior que não mostrar número nenhum.
-- Por isso a expressão vive AQUI, e os dois lados chamam esta função.
--
-- 🔑 `immutable`: depende só dos argumentos. É o que permite ao planner
-- avaliá-la como constante do lado do valor comparado, e é o requisito para
-- um dia indexar a expressão, se a medição pedir.
--
-- 🔴 A forma é `lower(btrim(...))` — copiada CARACTERE A CARACTERE de
-- `gps.admin_lixeira_restaurar_clientes` (...286). NÃO é `btrim(lower(...))`.
-- As duas dão o mesmo resultado e são expressões DIFERENTES para o planner;
-- foi essa inversão que fez uma função varrer 71.728 linhas em 19/08. Este
-- banco tem três convenções conflitantes vivas — nunca escrever de memória.

create or replace function gps.cliente_chave_dedup(p_nome text, p_telefone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_nome, '')))
      || '|'
      || regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
$$;

comment on function gps.cliente_chave_dedup(text, text) is
  'Chave de deduplicacao de cliente: lower(btrim(nome)) || "|" || so-digitos do telefone. 🔴 Existe para que gps.admin_previa_converter_titular_em_socio e gps.admin_converter_titular_em_socio contem EXATAMENTE a mesma coisa -- se a previa e a escrita divergirem, o admin decide lendo um numero e o sistema faz outro. Forma copiada caractere a caractere de gps.admin_lixeira_restaurar_clientes (...286): lower(btrim()), NUNCA btrim(lower()) -- sao expressoes diferentes para o planner. IMMUTABLE de proposito (permite indexar a expressao se a medicao um dia pedir).';

revoke execute on function gps.cliente_chave_dedup(text, text) from public, anon;
grant  execute on function gps.cliente_chave_dedup(text, text) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 1) PRÉVIA — o que a tela mostra ANTES de o admin confirmar
-- ═══════════════════════════════════════════════════════════════════════
-- Só leitura. Não levanta exceção por impedimento: devolve
-- `pode_converter = false` + `impedimento` em português, porque a tela precisa
-- DESENHAR o botão desligado com o motivo ao lado, não tratar um erro.
--
-- 🔑 Exceção levanta apenas para falta de permissão e para o cadastro que não
--    resolve — aí não há prévia nenhuma a mostrar.

create or replace function gps.admin_previa_converter_titular_em_socio(
  p_membro_id        uuid,
  p_ambiente_destino uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  m               record;
  v_n_membros     int;
  v_origem        uuid;
  v_nome_origem   text;
  v_nome_destino  text;
  v_destino_existe boolean;
  v_email         text;
  v_n_clientes    int := 0;
  v_a_copiar      int := 0;
  v_ja_no_destino int := 0;
  v_n_progresso   int := 0;
  v_n_notas       int := 0;
  v_n_chamados    int := 0;
  v_impedimento   text := null;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_membro_id is null or p_ambiente_destino is null then
    raise exception 'Membro ou ambiente de destino não informado.' using errcode = '22023';
  end if;

  -- Resolução do cadastro → membro (regra explicada no cabeçalho).
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
      or (mm.pessoa_aluno_id is null and mm.aluno_id = p_membro_id);

  v_origem := m.aluno_id;

  select t.nome into v_nome_origem  from public.thb_alunos t where t.id = v_origem;
  select t.nome into v_nome_destino from public.thb_alunos t where t.id = p_ambiente_destino;
  v_destino_existe := exists (select 1 from public.thb_alunos t where t.id = p_ambiente_destino);

  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;

  -- ── Impedimentos, na ordem em que fazem sentido para quem lê ───────────
  -- Uma frase por vez: mostrar cinco motivos juntos não ajuda a resolver.
  if m.papel <> 'titular' then
    v_impedimento := 'Este membro já é sócio — para mudá-lo de ambiente use "Mover membro".';
  elsif m.pessoa_aluno_id is distinct from m.aluno_id then
    v_impedimento := 'Este membro é titular de um ambiente que não é o cadastro dele. Use "Trocar titular" antes.';
  elsif v_origem = p_ambiente_destino then
    v_impedimento := 'O ambiente de destino é o mesmo de origem.';
  elsif not v_destino_existe then
    -- 🔑 Frase REUTILIZADA de `admin_mover_membro` (já em FRASES_DO_BANCO).
    v_impedimento := 'Ambiente de destino não encontrado.';
  elsif not exists (select 1 from gps.membros t
                     where t.aluno_id = p_ambiente_destino and t.papel = 'titular') then
    -- 🔑 Frase REUTILIZADA de `admin_mover_membro` (já em FRASES_DO_BANCO).
    v_impedimento := 'O ambiente de destino não tem titular.';
  elsif m.user_id is not null
        and exists (select 1 from gps.membros x
                     where x.aluno_id = p_ambiente_destino and x.user_id = m.user_id) then
    v_impedimento := 'Este login já participa do ambiente de destino.';
  elsif exists (select 1 from gps.membros o
                 where o.aluno_id = v_origem and o.id <> m.id) then
    v_impedimento := 'O ambiente de origem tem outro membro. Resolva o outro membro antes de converter este.';
  elsif btrim(coalesce(v_nome_origem, '')) = '' then
    -- 🔴 Sem nome não há confirmação nomeada possível: o admin não teria o
    -- que digitar. Recusar na prévia é melhor que deixar o botão ligado e
    -- entregar um P0004 impossível de satisfazer.
    v_impedimento := 'O ambiente de origem está sem nome no cadastro — não é possível confirmar a conversão. Corrija o nome antes.';
  end if;

  -- ── Contagens ──────────────────────────────────────────────────────────
  select count(*) into v_n_clientes  from gps.etapa1_clientes c where c.aluno_id = v_origem;
  select count(*) into v_n_progresso from gps.progresso p       where p.aluno_id = v_origem;
  select count(*) into v_n_notas     from gps.aluno_notas n     where n.aluno_id = v_origem;
  select count(*) into v_n_chamados  from gps.chamados ch       where ch.aluno_id = v_origem;

  -- 🔴 A MESMA dedup da escrita, via gps.cliente_chave_dedup. Um cliente da
  -- origem "já está no destino" quando existe lá alguém com a mesma chave.
  select
    count(*) filter (where not existe_no_destino),
    count(*) filter (where existe_no_destino)
    into v_a_copiar, v_ja_no_destino
    from (
      select exists (
               select 1 from gps.etapa1_clientes d
                where d.aluno_id = p_ambiente_destino
                  and gps.cliente_chave_dedup(d.nome, d.telefone)
                    = gps.cliente_chave_dedup(c.nome, c.telefone)
             ) as existe_no_destino
        from gps.etapa1_clientes c
       where c.aluno_id = v_origem
    ) s;

  return jsonb_build_object(
    'membro_id', m.id,
    'origem',  jsonb_build_object(
                 'aluno_id', v_origem,
                 'nome', v_nome_origem,
                 'email_login', v_email),
    'destino', jsonb_build_object(
                 'aluno_id', p_ambiente_destino,
                 'nome', v_nome_destino),
    'clientes_na_origem',     v_n_clientes,
    'clientes_a_copiar',      v_a_copiar,
    'clientes_ja_no_destino', v_ja_no_destino,
    'progresso_na_origem',    v_n_progresso,
    'notas_na_origem',        v_n_notas,
    'chamados_na_origem',     v_n_chamados,
    'pode_converter',         (v_impedimento is null),
    'impedimento',            v_impedimento);
end $function$;

comment on function gps.admin_previa_converter_titular_em_socio(uuid, uuid) is
  'Previa da conversao de titular em socio -- SO LEITURA, alimenta a tela antes da confirmacao. 🔴 p_membro_id recebe public.thb_alunos.id (o cadastro escolhido na Central), NAO gps.membros.id: a tela nao conhece membros.id de outro ambiente. Resolve pessoa_aluno_id = X or (pessoa_aluno_id is null and aluno_id = X); ambiguidade (>1 membro) e RECUSA (21000), nunca palpite -- membros.pessoa_aluno_id NAO tem indice unico (adiado na ...154). Impedimento NAO levanta excecao: devolve pode_converter=false + frase em portugues, porque a tela desenha o botao desligado com o motivo. 🔴 clientes_a_copiar/clientes_ja_no_destino saem de gps.cliente_chave_dedup, a MESMA funcao que a escrita usa -- previa e execucao nao podem divergir.';

revoke execute on function gps.admin_previa_converter_titular_em_socio(uuid, uuid) from public, anon;
grant  execute on function gps.admin_previa_converter_titular_em_socio(uuid, uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 2) A ESCRITA
-- ═══════════════════════════════════════════════════════════════════════

create or replace function gps.admin_converter_titular_em_socio(
  p_membro_id        uuid,
  p_ambiente_destino uuid,
  p_confirmar        text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  -- ── Serialização ───────────────────────────────────────────────────────
  -- 🔴 `p_membro_id` é `public.thb_alunos.id` (o CADASTRO), não
  -- `gps.membros.id` — ver cabeçalho. A contagem vem ANTES do `select into`
  -- porque ambiguidade tem de virar recusa, e `select into` sem `strict`
  -- pegaria uma linha qualquer em silêncio.
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

  -- 🔑 `for update` ANTES das guardas. Se dois admins agirem ao mesmo tempo,
  -- o segundo espera e reavalia as guardas com o estado JÁ alterado pelo
  -- primeiro — em vez de decidir sobre uma leitura velha.
  select * into m
    from gps.membros mm
   where mm.pessoa_aluno_id = p_membro_id
      or (mm.pessoa_aluno_id is null and mm.aluno_id = p_membro_id)
   for update;

  v_origem := m.aluno_id;

  -- Trava o titular do destino: impede que o ambiente de destino perca o
  -- titular (ou seja excluído) entre a guarda 7 e o update.
  perform 1 from gps.membros t
   where t.aluno_id = p_ambiente_destino and t.papel = 'titular'
   for update;

  -- ── Guardas ────────────────────────────────────────────────────────────
  if m.papel <> 'titular' then
    raise exception 'Este membro já é sócio — para mudá-lo de ambiente use "Mover membro".'
      using errcode = '42501';
  end if;

  -- 🔴 Titular DO PRÓPRIO ambiente. Titular de ambiente de OUTRA pessoa é o
  -- caso de "trocar titular" (...155), não este. Converter ali deixaria o
  -- ambiente alheio sem dono.
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

  -- Guarda 8: `membros_aluno_user_uk` levantaria 23505 com nome de índice que
  -- não diz nada a quem está resolvendo o chamado. Aqui a frase é legível.
  if m.user_id is not null
     and exists (select 1 from gps.membros x
                  where x.aluno_id = p_ambiente_destino and x.user_id = m.user_id) then
    raise exception 'Este login já participa do ambiente de destino.' using errcode = '23505';
  end if;

  -- 🔴 Guarda 9 — ver cabeçalho. Sem isto o ambiente de origem ficaria sem
  -- titular e o passo de exclusão apagaria dado de terceiro.
  if exists (select 1 from gps.membros o
              where o.aluno_id = v_origem and o.id <> m.id) then
    raise exception 'O ambiente de origem tem outro membro. Resolva o outro membro antes de converter este.'
      using errcode = '42501';
  end if;

  select t.nome into v_nome_origem  from public.thb_alunos t where t.id = v_origem;
  select t.nome into v_nome_destino from public.thb_alunos t where t.id = p_ambiente_destino;

  -- 🔴 Guarda 10 — sem nome na origem a confirmação nomeada é impossível de
  -- satisfazer: o admin não teria o que digitar, e `p_confirmar = ''` casaria
  -- com `''` transformando a trava em nada. Recusar é o certo.
  if btrim(coalesce(v_nome_origem, '')) = '' then
    raise exception 'O ambiente de origem está sem nome no cadastro — não é possível confirmar a conversão. Corrija o nome antes.'
      using errcode = '22023';
  end if;

  -- Guarda 11 — confirmação nomeada. `btrim` dos dois lados: o admin copia e
  -- cola da tela e pode trazer espaço. Caixa preservada de propósito: digitar
  -- o nome é o ato de conferir QUAL ambiente está sendo desfeito.
  if btrim(coalesce(p_confirmar, '')) <> btrim(v_nome_origem) then
    raise exception 'Confirmação não confere. Digite exatamente o nome do ambiente de origem: %',
      coalesce(v_nome_origem, '(sem nome)') using errcode = 'P0004';
  end if;

  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 1) RETRATO INTEGRAL DA ORIGEM — antes de qualquer escrita
  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔑 Mesma forma de `conteudo`/`resumo` que `gps.admin_excluir_acesso` já
  -- grava em produção. Reusar a forma é o que permite a esta linha ser
  -- restaurada por `gps.admin_lixeira_restaurar_clientes` (...286) sem
  -- nenhum caso especial — retrato com formato próprio seria backup que a
  -- ferramenta de restauração não sabe ler.
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- 2) COPIAR os clientes da origem para o destino
  -- ═══════════════════════════════════════════════════════════════════════
  for v_c in
    select * from gps.etapa1_clientes c where c.aluno_id = v_origem order by c.criado_em
  loop
    v_total := v_total + 1;

    -- 🔴 Dedup por NOME + TELEFONE normalizados, nunca por id. Expressão
    -- copiada caractere a caractere de `gps.admin_lixeira_restaurar_clientes`
    -- (...286): `lower(btrim(...))` e `regexp_replace(...,'\D','','g')`.
    -- Inverter para `btrim(lower(...))` daria o MESMO resultado e um plano
    -- diferente — foi essa troca que varreu 71.728 linhas em 19/08.
    if exists (
      select 1 from gps.etapa1_clientes d
       where d.aluno_id = p_ambiente_destino
         and gps.cliente_chave_dedup(d.nome, d.telefone)
           = gps.cliente_chave_dedup(v_c.nome, v_c.telefone)
    ) then
      v_ja_existiam := v_ja_existiam + 1;
      continue;
    end if;

    -- 🔑 Colunas NOMEADAS uma a uma, nunca `jsonb_populate_record` nem
    -- `insert ... select *`: `select *` casaria por POSIÇÃO e, no dia em que
    -- alguém acrescentar coluna no meio da tabela, gravaria valor na coluna
    -- errada em silêncio. Nomear é o que faz isso falhar alto.
    --
    -- 🔴 `acompanhado_equipe = false` SEMPRE. `etapa1_clientes_unico_equipe` é
    -- índice ÚNICO PARCIAL por `aluno_id` (um acompanhado por ambiente). Se o
    -- cliente copiado trouxesse `true` e o destino já tivesse um acompanhado,
    -- o insert abortaria em 23505 no MEIO do laço — com parte dos clientes já
    -- copiada e a transação inteira perdida.
    --
    -- 🔑 `fase`, `status`, `selecionado_entrevista` e os campos de entrevista/
    -- contrato são PRESERVADOS. O cliente f65b7697 (Familia Pagotto) está em
    -- `fase='fechamento'` com `selecionado_entrevista=true`; devolvê-lo a
    -- 'prospeccao' apagaria meses de avanço e é justamente a queixa do
    -- chamado. Acompanhamento pela equipe é estado do AMBIENTE, não do
    -- cliente — por isso só ele se perde.
    insert into gps.etapa1_clientes (
      aluno_id, nome, telefone, nivel_relacionamento, problemas, perda_inercia,
      registro_contato, mensagem_padrao_enviada, estudo_caso_enviado,
      ligacao_realizada, status, data_reuniao_preliminar, aderiu_reuniao,
      perfil_disc, ordem, criado_em, atualizado_em, acompanhado_equipe, fase,
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
      false,                              -- 🔴 ver acima: índice único parcial
      v_c.fase, v_c.valor_honorarios, v_c.contrato_url, v_c.grau_relacao,
      v_c.contrato_path, v_c.contrato_nome, v_c.contrato_mime,
      v_c.contrato_tamanho, v_c.contrato_anexado_em,
      v_c.selecionado_entrevista, v_c.entrevista_resultado,
      v_c.entrevista_observacoes, v_c.entrevista_em, v_c.entrevista_por,
      v_c.entrevista_tentativas_sem_contato, v_c.entrevista_retorno_em,
      v_c.entrevista_encerrada, v_c.entrevista_remarcacoes,
      v_c.entrevista_motivo_encerramento
    )
    returning id into v_novo_id;

    v_copiados := v_copiados + 1;

    -- 🔑 Um evento POR CLIENTE, ator 'equipe'. Sem isto o Jonas veria 3
    -- clientes surgirem do nada no Diário dele. `cliente_cadastrado` já
    -- existe no catálogo de `aluno_eventos_tipo_check` (36 valores) — não
    -- invento tipo novo para não ter de reescrever o CHECK.
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

  -- ═══════════════════════════════════════════════════════════════════════
  -- 3) MOVER A PESSOA
  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔴 `pessoa_aluno_id` NÃO muda — é a identidade da pessoa e o que faz
  -- `gps.financeiro_pode_ler` (a partir da ...289) devolver o contrato DELA.
  -- Só o ambiente e o papel mudam.
  -- 🔴 `m.id` (o membro RESOLVIDO), não `p_membro_id` — que é o cadastro.
  update gps.membros
     set aluno_id = p_ambiente_destino,
         papel    = 'socio'
   where id = m.id;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 4) O ambiente de origem ficou vazio → some, E LEVA O RESÍDUO JUNTO
  -- ═══════════════════════════════════════════════════════════════════════
  -- A guarda 9 garantiu que não havia outro membro. O retrato já está na
  -- lixeira. `gps.ambientes` sem membro é ambiente fantasma: aparece em
  -- listagem de admin e não tem quem entre nele.
  --
  -- 🔴 CORRIGIDO NO VEREDITO DE 21/09/2026. A primeira versão desta função
  -- apagava só `gps.ambientes` e deixava as linhas de trabalho da origem
  -- para trás. Elas ficam invisíveis ao ALUNO (a RLS filtra por
  -- `gps.aluno_atual()`, e sem membro ninguém resolve aquele ambiente), mas
  -- NÃO ao admin: `gps.admin_clientes_lista` (...282) faz `left join
  -- thb_alunos` direto por `aluno_id` e NÃO passa por `gps.membros`, então
  -- os clientes copiados apareciam DUAS vezes — na lista, no CSV, em
  -- `admin_clientes_reuniao_kpis` e no dashboard. Medido: a base tinha 0
  -- órfãos antes desta função e ganhou 3 na primeira execução.
  --
  -- 🔑 É exatamente o defeito que a ...288, no mesmo commit, chama de quarta
  -- correção retroativa. Criar órfã por desenho enquanto se conserta a
  -- função que as caça seria deixar o sistema pior do que se achou.
  --
  -- O que sai e o que fica, pelo mesmo critério da ...288:
  --   SAEM  — `etapa1_clientes` (já copiados; o retrato guarda os originais),
  --           `progresso`, `aluno_notas`, `chamados` e `aluno_eventos` do
  --           ambiente morto: são dado DO AMBIENTE que deixou de existir.
  --   FICAM — `gps.acessos_log` (trilha de auditoria: quem auditar a origem
  --           precisa encontrar a saída registrada) e `gps.lixeira_ambientes`
  --           (é o retrato).
  --   MUDA  — `onboarding_respostas` NÃO se apaga: é PK por PESSOA, e a
  --           pessoa continua viva no ambiente novo. Reaponta-se o
  --           `ambiente_aluno_id` para o destino, junto com o `cliente_id`,
  --           que passa a referenciar a CÓPIA (a original some logo abaixo e
  --           a FK é `on delete set null` — sem isto a resposta perderia o
  --           cliente que ela cita).
  if not exists (select 1 from gps.membros o where o.aluno_id = v_origem) then

    -- 🔴 `onboarding_respostas.ambiente_aluno_id` NÃO se reescreve (achado
    -- ALTO do pentest, 21/09). A ...204 documenta a coluna: "AMBIENTE em que
    -- a pessoa estava ao responder. Não se atualiza quando a pessoa muda de
    -- ambiente — histórico não se reescreve." Mover ainda teria um segundo
    -- efeito: jogaria a resposta para dentro do escopo de exclusão do
    -- ambiente de DESTINO (a ...288 apaga por `ambiente_aluno_id`), de onde
    -- ela não pertence. A resposta é da PESSOA (PK `pessoa_aluno_id`) e
    -- sobrevive sozinha ao fim do ambiente.

    -- 🔴 `gps.aluno_eventos` é APPEND-ONLY por desenho — a ...0001 é
    -- literal: "log não se edita, nem por quem o vê", e a tabela não tem
    -- policy de insert/update/delete de propósito. A primeira versão desta
    -- função reescrevia `aluno_id` de eventos históricos (o evento passava a
    -- afirmar que ocorreu num ambiente onde não ocorreu) e apagava a trilha
    -- SEM fotografá-la: `v_conteudo` não incluía `aluno_eventos`, só a
    -- CONTAGEM ia para `v_resumo`. Resultado: perda definitiva de auditoria
    -- (12 eventos no caso Carlos→Jonas, registrados como perdidos no próprio
    -- retrato e em `acessos_log`).
    --
    -- Agora: fotografa os eventos no retrato ANTES de apagar, e grava evento
    -- NOVO no destino — o mesmo padrão já usado para os clientes copiados,
    -- com a procedência no `detalhe`.
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
    -- Por último: apagar cliente dispara gatilho que grava
    -- `cliente_excluido` em `aluno_eventos`. Limpar os eventos ANTES deixaria
    -- justamente esses para trás — medido em 21/09 (3 linhas sobreviveram a
    -- uma limpeza feita na ordem inversa).
    delete from gps.aluno_eventos    where aluno_id = v_origem;

    delete from gps.ambientes where aluno_id = v_origem;
    v_ambiente_removido := true;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 5) Trilha nos DOIS ambientes
  -- ═══════════════════════════════════════════════════════════════════════
  -- 🔑 Duas linhas, uma por ambiente — `gps.acessos_log` é lido por `aluno_id`
  -- (idx_acessos_log_aluno, e a aba Diário filtra por ambiente). Uma linha só
  -- sumiria de uma das telas: quem auditar a origem precisa ver a saída, quem
  -- auditar o destino precisa ver a entrada. Mesmo critério da ...156.
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

  -- 🔴 As quatro primeiras chaves são CONTRATO com a tela da Central
  -- (`clientes_copiados`, `clientes_ja_existiam`, `origem_nome`,
  -- `destino_nome`). Renomear qualquer uma delas quebra o diálogo em runtime
  -- sem o tsc acusar nada — jsonb não tem tipo do lado do TypeScript.
  return jsonb_build_object(
    'clientes_copiados',    v_copiados,
    'clientes_ja_existiam', v_ja_existiam,
    'origem_nome',          v_nome_origem,
    'destino_nome',         v_nome_destino,
    -- extras, para trilha e depuração
    'membro_id',            m.id,
    'cadastro_id',          p_membro_id,
    'origem',               v_origem,
    'destino',              p_ambiente_destino,
    'clientes_no_total',    v_total,
    'lixeira_id',           v_lixeira_id,
    'ambiente_origem_removido', v_ambiente_removido);
end $function$;

comment on function gps.admin_converter_titular_em_socio(uuid, uuid, text) is
  'Converte um TITULAR do proprio ambiente em SOCIO de outro ambiente, copiando os clientes. gp_is_admin() ou 42501. Origem: chamado do Jonas 21/09/2026 -- o socio Carlos entrou em 21/07, ANTES da feature de socio, e virou titular do proprio ambiente; socio_de_aluno_id chegou por importacao depois e ninguem reprocessou. 🔑 NAO move ambiente: move a PESSOA (update gps.membros) e COPIA gps.etapa1_clientes. pessoa_aluno_id NAO muda. Os dois cadastros thb_alunos continuam existindo. NADA fora do schema gps e tocado -- sem auth.users, sem troca de senha, sem derrubar sessao. Copia SO clientes (progresso/nota/chamado/evento ficam apenas no retrato) -- mesmo criterio da ...286. Dedup por lower(btrim(nome)) + regexp_replace(telefone) identica a ...286. 🔴 acompanhado_equipe=false SEMPRE na copia (etapa1_clientes_unico_equipe e unico parcial por aluno_id; senao aborta 23505 no meio do laco). fase/status/selecionado_entrevista PRESERVADOS. Guardas: admin, membro existe, e titular, e titular do PROPRIO ambiente, destino<>origem, destino tem titular, login nao participa do destino, origem SEM outro membro, e p_confirmar = nome do ambiente de origem (P0004). Retrato integral na lixeira ANTES de escrever, no mesmo formato de admin_excluir_acesso (para admin_lixeira_restaurar_clientes saber ler). Ambiente de origem e removido se ficar sem membro. Trilha: 1 evento por cliente (ator=equipe) + 2 linhas em acessos_log, uma em cada ambiente. REVERSAO: admin_mover_membro de volta + restaurar o retrato da lixeira.';

-- 🔴 Função nova em schema exposto NASCE PÚBLICA (executável por PUBLIC/anon).
-- O `revoke from public` é o que importa: revogar só de `anon` NÃO pega quando
-- a permissão vem de PUBLIC — toda role herda de PUBLIC e o revoke "funciona"
-- sem efeito nenhum. Revogar dos dois, e conferir o ACL depois.
revoke execute on function gps.admin_converter_titular_em_socio(uuid, uuid, text) from public, anon;
grant  execute on function gps.admin_converter_titular_em_socio(uuid, uuid, text) to authenticated;
