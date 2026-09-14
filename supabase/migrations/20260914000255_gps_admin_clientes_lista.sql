-- Lista consolidada de clientes do programa (item 3 dos 9, 14/09/2026).
--
-- Pedido do Marcio: "quero todos os numeros que a gente pode extrair dados
-- [...] ao clicar no numero exibir a lista e poder baixar". Ver
-- docs/audits/2026-09-14-esteira/01-listas-clicaveis.md para as 4 decisões
-- e as medições que sustentam esta migração.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 DECISÃO DE LGPD DO MARCIO (decisão 1 do doc) — `registro_contato` FORA
-- ═══════════════════════════════════════════════════════════════════════
--
-- Nem `registro_contato`, nem `valor_honorarios`, nem `contrato_*`, nem
-- `problemas`. Os 1.214 clientes são TERCEIROS (pessoas que não usam o
-- sistema, não deram consentimento para uma lista consolidada); o registro
-- de contato é anotação livre do parceiro sobre a vida deles (400
-- preenchidos). Fica de fora da RPC -- não é "esconder na tela", é o dado
-- nunca sair do Postgres para o PostgREST. Quem precisa da anotação abre a
-- ficha, um a um, com a trilha de acesso que a ficha já grava.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE `aluno_id` → NOME DO PARCEIRO SEM PASSAR POR `gps.membros`
-- ═══════════════════════════════════════════════════════════════════════
--
-- `gps.etapa1_clientes.aluno_id` referencia `public.thb_alunos(id)`
-- DIRETO (é o dono do ambiente -- o titular) -- é o mesmo join usado em
-- `gps.admin_diagnostico_ambiente`, `gps.admin_definir_senha_membro` e
-- outras (`join public.thb_alunos t on t.id = <aluno_id>`), sem passar por
-- `gps.membros`. Ir por `gps.membros where papel='titular'` daria o MESMO
-- resultado com uma junção a mais e nenhum ganho -- `aluno_id` já É a
-- pessoa titular.
--
-- ═══════════════════════════════════════════════════════════════════════
-- BUSCA: SEM ÍNDICE TEXTUAL (medido, não suposto)
-- ═══════════════════════════════════════════════════════════════════════
--
-- `select indexdef from pg_indexes where tablename in
-- ('etapa1_clientes','thb_alunos')` mostra só `etapa1_clientes_aluno_idx`,
-- `etapa1_clientes_unico_equipe` e os índices de PK/e-mail de thb_alunos --
-- NENHUM índice funcional em `nome` (nem `lower()`, nem `btrim()`, nem
-- trigram) em nenhuma das duas tabelas. Não existe expressão de índice para
-- copiar. `ilike` simples contra as duas colunas de nome: Seq Scan em 1.214
-- linhas -- e é o certo (ver bloco de medição na tarefa de conferência; a
-- auditoria já mediu 2,58 ms para o join inteiro sem filtro de busca).
-- Criar índice funcional para uma tabela de 1.214 linhas seria peso morto de
-- escrita sem ganho de leitura -- mesma lição da migração ...060 (fase).
--
-- ═══════════════════════════════════════════════════════════════════════
-- `total_linhas` = O UNIVERSO DO FILTRO, NÃO DA PÁGINA
-- ═══════════════════════════════════════════════════════════════════════
--
-- `count(*) over ()` dentro da MESMA CTE filtrada -- se a paginação (limit/
-- offset) entrar antes da janela, o "total" vira o tamanho da página. A
-- tela e o CSV dependem de ver o universo real (ex.: "100 de 1.214").
--
-- O QUE NÃO FAZ: não cria índice novo (decisão medida, não suposta -- ver
-- acima); não muda `gps.etapa1_clientes` nem RLS dela (a RPC já filtra por
-- `security definer` + `gp_is_admin()`, igual a toda RPC administrativa do
-- projeto); não expõe `registro_contato`/CPF/honorários/contrato.
--
-- REVERSÃO: drop function gps.admin_clientes_lista(integer, integer, text, text, text);

create or replace function gps.admin_clientes_lista(
  p_limite integer default 100,
  p_offset integer default 0,
  p_fase   text default null,    -- null = todas
  p_grau   text default null,    -- '_nulo' = sem grau informado
  p_busca  text default null     -- nome do cliente OU do parceiro
)
returns table (
  id                       uuid,
  aluno_id                 uuid,
  parceiro_nome            text,
  cliente_nome             text,
  telefone                 text,
  fase                     text,
  grau_relacao             text,
  perfil_disc              text,
  data_reuniao_preliminar  date,
  aderiu_reuniao           boolean,
  acompanhado_equipe       boolean,
  criado_em                timestamptz,
  total_linhas             bigint
)
language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_limite integer;
  v_offset integer;
  v_busca  text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- Teto 5000: serve o CSV do universo inteiro do filtro (1.214 hoje) numa
  -- única chamada, sem paginar o export em N idas ao banco.
  v_limite := least(greatest(coalesce(p_limite, 100), 1), 5000);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  v_busca  := nullif(btrim(coalesce(p_busca, '')), '');

  return query
  with base as (
    select
      c.id,
      c.aluno_id,
      t.nome as parceiro_nome,
      c.nome as cliente_nome,
      c.telefone,
      c.fase,
      c.grau_relacao,
      c.perfil_disc,
      c.data_reuniao_preliminar,
      c.aderiu_reuniao,
      c.acompanhado_equipe,
      c.criado_em
    from gps.etapa1_clientes c
    -- 🔑 LEFT, não INNER (conferido em 14/09: 0 órfãos hoje, 1.222 clientes).
    -- Com INNER, um cliente cujo cadastro do parceiro sumisse da base
    -- compartilhada `thb_alunos` (que o sip também escreve) DESAPARECERIA da
    -- lista e da contagem, sem erro nenhum -- o contador dizendo 1.200 e o
    -- admin sem como saber que faltam 22. Com LEFT, ele aparece com o dono
    -- vazio, que é uma pendência visível em vez de um sumiço silencioso.
    left join public.thb_alunos t on t.id = c.aluno_id
    where (p_fase is null or c.fase = p_fase)
      and (
        p_grau is null
        or (p_grau = '_nulo' and c.grau_relacao is null)
        or c.grau_relacao = p_grau
      )
      and (
        v_busca is null
        or c.nome ilike '%' || v_busca || '%'
        or t.nome ilike '%' || v_busca || '%'
      )
  )
  select
    b.id, b.aluno_id, b.parceiro_nome, b.cliente_nome, b.telefone, b.fase,
    b.grau_relacao, b.perfil_disc, b.data_reuniao_preliminar, b.aderiu_reuniao,
    b.acompanhado_equipe, b.criado_em,
    (count(*) over ())::bigint as total_linhas
  from base b
  order by b.criado_em desc, b.id
  limit v_limite offset v_offset;
end;
$function$;

revoke execute on function gps.admin_clientes_lista(integer, integer, text, text, text) from public, anon;
grant  execute on function gps.admin_clientes_lista(integer, integer, text, text, text) to authenticated;

comment on function gps.admin_clientes_lista(integer, integer, text, text, text) is
  'Lista consolidada de clientes do programa (todos os ambientes), para /admin/clientes e o export CSV. gp_is_admin() ou 42501. p_limite tem teto 5000 -- serve o CSV do universo do FILTRO numa unica chamada, nao a pagina. total_linhas e count(*) over() DENTRO do filtro (o universo do filtro, nao da pagina). Join com public.thb_alunos DIRETO por t.id = c.aluno_id (aluno_id ja e o titular do ambiente, mesmo padrao de gps.admin_diagnostico_ambiente) -- nao passa por gps.membros. Busca por ilike simples (nome do cliente OU do parceiro): NENHUM indice textual existe em etapa1_clientes.nome nem thb_alunos.nome (conferido em pg_indexes antes de escrever) -- Seq Scan assumido por escrito em 1.214 linhas, decisao medida na auditoria 01-listas-clicaveis.md, nao suposta. p_grau=''_nulo'' pega clientes sem grau informado. 🔴 DECISAO DE LGPD DO MARCIO: registro_contato, valor_honorarios, contrato_* e problemas NAO entram no retorno -- os 1.214 sao terceiros e a anotacao livre do parceiro sobre a vida deles fica so na ficha individual, com trilha propria.';

-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 `clientes_exportados` em `gps.acessos_log.acao` -- a guarda de LGPD do
-- export (decisão 1 do doc: "export grava trilha: quem, quantas linhas,
-- qual filtro. Se o log falhar, o export falha").
--
-- POR CONTEÚDO, NÃO PELO NOME (mesma técnica de ...092/...150/...151/
-- ...200/...250/...252): acha pelo último valor vigente
-- ('email_login_alterado', da ...252) ou ABORTA. Um `drop constraint if
-- exists` com o nome errado seria NO-OP silencioso e a RPC abaixo
-- gravaria uma ação que o CHECK rejeita -- e aqui, ao contrário das
-- outras 21 ações, a REGRA é a trilha falhar, não a trilha ficar muda.
-- ═══════════════════════════════════════════════════════════════════════

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
     and pg_get_constraintdef(con.oid) like '%email_login_alterado%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO email_login_alterado, da migracao ...252) -- migracao abortada para nao deixar gps.admin_registrar_export_clientes gravando uma acao que a constraint rejeita';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 21 valores vigentes (conferidos em ...252), na mesma
-- ordem, + 'clientes_exportados' no fim.
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
    'chamado_solicitacao_aprovada',
    'chamado_solicitacao_declinada',
    -- ── Admin troca o e-mail do login (11/09/2026) ──
    'email_login_alterado',
    -- ── Lista consolidada de clientes: export CSV (14/09/2026) ──
    'clientes_exportados'            -- gps.admin_registrar_export_clientes
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 5 do baseline; 7 da Central (...150); 3 da mega feature (...200); 3 do convite de socio (...244); 2 da categoria+aprovacao de chamados (...250); 1 da troca de e-mail do login (...252); 1 do export da lista consolidada de clientes (...255): clientes_exportados (gps.admin_registrar_export_clientes). Nao guarda nome de cliente em `detalhe` -- dado de terceiro (mesma regra da ...203).';

-- ═══════════════════════════════════════════════════════════════════════
-- gps.admin_registrar_export_clientes -- a ÚNICA escritora de
-- 'clientes_exportados'
--
-- POR QUE UMA RPC E NÃO UM INSERT DA ACTION: `gps.acessos_log` tem RLS com
-- UMA policy (SELECT, baseline). Grants de insert/update/delete existem
-- sem policy correspondente -- na prática o RLS nega, e um insert direto
-- da Action voltaria SEM ERRO e sem linha (a lição de `salvarPerfilAluno`).
-- SECURITY DEFINER é o único caminho de escrita neste log, igual às outras
-- 21 ações.
--
-- `aluno_id` fica NULL de propósito -- o export não é de um ambiente, é do
-- universo do filtro (mesmo padrão de `admin_registrar_lote_de_acessos`).
-- `detalhe` leva só CONTAGEM e o FILTRO aplicado -- nunca nome de cliente
-- nem de parceiro (dado de terceiro).
--
-- O QUE NÃO FAZ: não lê nem devolve as linhas exportadas -- a Action já as
-- tem (leu via gps.admin_clientes_lista antes de montar o CSV); esta RPC é
-- só a trilha.
-- REVERSÃO: drop function gps.admin_registrar_export_clientes(integer, text, text, text);
-- ═══════════════════════════════════════════════════════════════════════

create or replace function gps.admin_registrar_export_clientes(
  p_linhas integer,
  p_fase   text default null,
  p_grau   text default null,
  p_busca  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values (
    'clientes_exportados',
    null,
    format(
      '%s linha(s) exportada(s). Filtro: fase=%s, grau=%s, busca=%s',
      greatest(coalesce(p_linhas, 0), 0),
      coalesce(p_fase, '(todas)'),
      coalesce(p_grau, '(todos)'),
      -- so registra SE houve busca -- nao o termo em si, que pode ser o
      -- nome de um cliente ou parceiro (dado de terceiro).
      case when nullif(btrim(coalesce(p_busca, '')), '') is null
           then '(nenhuma)' else '(com termo)' end
    ),
    auth.uid()
  );
end $function$;

comment on function gps.admin_registrar_export_clientes(integer, text, text, text) is
  'Grava UMA linha de auditoria por clique em "Exportar CSV" na lista consolidada de clientes (acao=clientes_exportados): quantas linhas, e o FILTRO aplicado (fase/grau/se houve busca -- nunca o termo digitado, que pode ser nome de terceiro). aluno_id fica NULL de proposito: o export nao e de um ambiente, e do universo do filtro. SECURITY DEFINER porque gps.acessos_log nao tem policy de insert (RLS nega em silencio). 🔴 Esta e a UNICA acao do catalogo em que, se o insert falhar, quem chama (exportarClientesCsv) FAZ O EXPORT FALHAR -- decisao do Marcio: aqui a trilha e a guarda de LGPD, nao um detalhe (oposto do padrao das triggers de captura, que engolem falha de log).';

revoke execute on function gps.admin_registrar_export_clientes(integer, text, text, text) from public, anon;
grant  execute on function gps.admin_registrar_export_clientes(integer, text, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- PROVA (aplicada e medida em 14/09/2026, protocolo de sustentabilidade)
-- ═══════════════════════════════════════════════════════════════════════
--
-- 🔑 ÍNDICE EM `fase`: MEDIDO E RECUSADO.
--
--   sem índice   Seq Scan    0,686 ms   47 buffers
--   com índice   Index Scan  0,809 ms   20 buffers
--
-- O índice deixa a consulta MAIS LENTA: em 1.222 linhas que cabem em
-- memória, o custo de ir ao índice e voltar à heap supera varrer a tabela.
-- É a lição literal do protocolo ("falta de índice foi a hipótese errada
-- duas vezes"). Índice NÃO entra -- e agora com número, não com palpite.
--
-- Demais provas, todas em transação com rollback:
--   · sem JWT de admin ......... 42501 ✅
--   · total_linhas (universo do FILTRO, não da página):
--       sem filtro 1223 · fechamento 38 · contratado 14 · grau nulo 695
--       página de 100 devolve 100 linhas com total_linhas=1223 ✅
--   · colunas devolvidas (13): id, aluno_id, parceiro_nome, cliente_nome,
--       telefone, fase, grau_relacao, perfil_disc, data_reuniao_preliminar,
--       aderiu_reuniao, acompanhado_equipe, criado_em, total_linhas
--     🔴 `registro_contato` NÃO está entre elas ✅ (nem honorários,
--        contrato ou CPF) -- a decisão de LGPD está na ESTRUTURA, não na tela
--   · trilha do export: grava "38 linha(s). Filtro: fase=fechamento,
--       grau=(todos), busca=(com termo)" -- o TERMO buscado ("joão silva")
--       não aparece, vira `(com termo)` ✅
--   · 0 clientes órfãos hoje (1.222), mas o join é LEFT: se o cadastro do
--       parceiro sumir de thb_alunos, o cliente aparece com dono vazio em
--       vez de desaparecer da contagem
