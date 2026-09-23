-- ═══════════════════════════════════════════════════════════════════════════
-- gps.admin_dashboard() — 2 blocos novos: jornada · serie
-- 23/09/2026 · o caminho do parceiro + evolução semanal
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NÃO APLICADA por este executor (sem acesso ao banco). O texto-base veio
--    do corpo VIVO em produção (13 blocos), conferido pelo Marcio contra o
--    catálogo em 23/09/2026:
--      length(pg_get_functiondef)     -> 17405
--      ~ '''parceiros'', v_parceiros'  -> true
--      ~ '''equipe'', v_equipe'        -> true
--      ~ 'com_ficha_completa'          -> true  (a correção 38->37)
--      ~ 'jornada'                     -> false (este bloco ainda não existe)
--
-- 🔴 OS 13 BLOCOS QUE JÁ EXISTEM E NÃO PODEM SUMIR
--    referencia · programa · acesso · equipe · onboarding · clientes ·
--    honorarios · atividade · grau_relacao · passos · caminho · atencao ·
--    parceiros
--
--    `equipe` NÃO está versionado em nenhuma migration antiga (entrou direto
--    no banco em 11/09; as migrations …247 e …249 são arquivos-RETRATO, sem
--    `create or replace`). Ele só existe na função viva. Perdê-lo quebra
--    faixa-kpis.tsx:29 e fila.tsx:35 em SILÊNCIO — n(undefined) devolve 0 e a
--    tela mostra "Parceiros 0" sem erro, com a suíte verde.
--
-- ⚠️ ASSINATURA: gps.admin_dashboard(), SEM PARÂMETRO. `create or replace`
--    com assinatura diferente cria SOBRECARGA, não substitui.
--
-- ⚠️ GRANT: esta é uma SUBSTITUIÇÃO (create or replace) de função existente,
--    que PRESERVA o ACL atual. Nenhum grant/revoke é emitido aqui de
--    propósito — emitir `grant` novo poderia ampliar o acesso. A função é
--    SECURITY DEFINER com guarda public.gp_is_admin() na primeira linha.
--
-- ⚠️ NENHUM ÍNDICE CRIADO. Medido em 23/09: `Seq Scan + HashAggregate` é o
--    plano certo — os blocos agregam a tabela INTEIRA (não há `where` de que
--    um índice participe; o único filtro novo, o da `serie`, corta ~10 semanas
--    de uma tabela de 1.6k linhas). A função completa custa 35,140 ms hoje; o
--    teto do `authenticator` é 8 s.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA OBRIGATÓRIA — rodar ANTES e DEPOIS
-- ═══════════════════════════════════════════════════════════════════════════
--   select pg_get_functiondef(p.oid) ~ '''equipe'', v_equipe'       as tem_equipe,
--          pg_get_functiondef(p.oid) ~ '''parceiros'', v_parceiros' as tem_parceiros,
--          pg_get_functiondef(p.oid) ~ 'com_ficha_completa'         as tem_ficha,
--          pg_get_functiondef(p.oid) ~ '''jornada'', v_jornada'     as tem_jornada,
--          pg_get_functiondef(p.oid) ~ '''serie'', jsonb_build_obj' as tem_serie
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'admin_dashboard';
--
--   ANTES  (esperado): true · true · true · false · false
--   DEPOIS (esperado): true · true · true · true  · true
--
--   E a função tem de continuar ÚNICA, sem sobrecarga:
--     select count(*), array_agg(pg_get_function_arguments(p.oid))
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'gps' and p.proname = 'admin_dashboard';
--     -- esperado: 1 | {""}   (uma função, zero argumentos)
--
--   E o ACL tem de ficar IDÊNTICO ao de antes (nenhum grant novo, `anon` sem
--   execute):
--     select proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'gps' and p.proname = 'admin_dashboard';
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SANIDADE DOS NÚMEROS — medidos em produção pelo Marcio em 23/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--   jornada.ambientes ........... 148   (= programa.total, por construção)
--   jornada.entraram ............ 147
--   jornada.onboarding_ok ....... 93
--   jornada.cadastrou ........... 86
--   jornada.fechou_30 ........... 37    (ficha completa = nome + telefone)
--   jornada.mandou_msg .......... 22
--   jornada.escolheu_favorito ... 37
--   jornada.marcou_reuniao ...... 24
--   jornada.fechou_contrato ..... 13
--
--   Se a lógica não reproduzir estes números, a LÓGICA está errada.
--
-- 🔴 A PRIMEIRA MEDIÇÃO DEU 151/150/95/89/38/26 E ESTAVA ERRADA. A causa foi
--    juntar `gps.membros` com `gps.onboarding_respostas` SEM agregar antes:
--    ambiente com sócio tem mais de uma linha em `membros` (148 ambientes,
--    165 membros), e o join contava o mesmo ambiente duas vezes. Os números
--    inflados eram plausíveis — é por isso que a conferência contra
--    `programa.total` (148) é obrigatória, e não opcional.
--
-- ⚠️ `fechou_30` = 37 tem de bater com `parceiros.com_30_ou_mais`, que já
--    existe e usa o MESMO predicado de ficha completa (nome + telefone). Os
--    dois números aparecem na MESMA tela; divergir seria uma segunda verdade
--    sobre "fechou os 30" — bug já corrigido em 15/09/2026 (cadastro bruto
--    daria 38, ficha completa dá 37).
--
--   serie (10 semanas inteiras, a última em andamento):
--     13/07  35 · 1 · 6      31/08  29 · 9 · 8
--     20/07 136 · 9 · 12     07/09 395 · 12 · 40
--     27/07 117 · 3 · 9      14/09 505 · 29 · 30
--     03/08  55 · 11 · 3     21/09  37 · 0 · 8   <- semana_corrente
--     10/08 178 · 7 · 11
--     17/08  82 · 6 · 9
--     24/08 107 · 20 · 7
--
--   ⚠️ A tabela acima foi medida com o corte por `now() - 10 weeks`, que
--      devolvia 11 itens (13/07 era a borda PARCIAL). Com o corte por
--      `date_trunc` desta migration são 10 itens, e o primeiro passa a ser
--      20/07. O 13/07 sai de propósito: semana parcial vira "queda" na tela.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- REVERSÃO
-- ═══════════════════════════════════════════════════════════════════════════
-- Para voltar ao estado de 13 blocos, reaplicar o corpo INTEIRO guardado no
-- comentário no FIM deste arquivo (seção "CORPO ORIGINAL — 13 BLOCOS").
-- Não basta apagar os dois blocos novos: `create or replace` substitui a
-- função toda, então o caminho de volta é reaplicar o texto anterior.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gps.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fuso text := 'America/Sao_Paulo'; v_hoje date; v_dia integer; v_ini_mes date; v_ini_ant date; v_fim_ant date;
  v_programa jsonb; v_acesso jsonb; v_onboarding jsonb; v_clientes jsonb; v_honorarios jsonb; v_atividade jsonb; v_grau jsonb; v_equipe jsonb;
  v_passos jsonb; v_caminho jsonb; v_atencao jsonb; v_parceiros jsonb;
  v_jornada jsonb; v_serie jsonb; v_semana_corrente text;
begin
  if not coalesce(public.gp_is_admin(), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_hoje := (now() at time zone v_fuso)::date;
  v_dia := extract(day from v_hoje)::integer;
  v_ini_mes := date_trunc('month', v_hoje)::date;
  v_ini_ant := (v_ini_mes - interval '1 month')::date;
  v_fim_ant := least(v_ini_ant + (v_dia - 1), v_ini_mes - 1);
  with tit as (select (m.criado_em at time zone v_fuso)::date as dia from gps.membros m where m.papel = 'titular'),
  meses as (select to_char(date_trunc('month', t.dia), 'YYYY-MM') as mes, count(*)::integer as qtd from tit t where t.dia >= (v_ini_mes - interval '11 months')::date group by 1)
  select jsonb_build_object(
    'total', (select count(distinct m.aluno_id)::integer from gps.membros m),
    'no_mes', (select count(*)::integer from tit t where t.dia >= v_ini_mes),
    'no_mes_anterior_ate_o_dia', (select count(*)::integer from tit t where t.dia >= v_ini_ant and t.dia <= v_fim_ant),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'qtd', qtd) order by mes), '[]'::jsonb) from meses)
  ) into v_programa;
  with amb as (select m.aluno_id, bool_or(m.user_id is not null) as tem_login, max(u.last_sign_in_at) as ultimo_acesso from gps.membros m left join auth.users u on u.id = m.user_id group by m.aluno_id)
  select jsonb_build_object(
    'total', count(*)::integer,
    'com_login', count(*) filter (where a.tem_login)::integer,
    'sem_login', count(*) filter (where not a.tem_login)::integer,
    'nunca_entraram', count(*) filter (where a.tem_login and a.ultimo_acesso is null)::integer,
    'sem_acesso_30d', count(*) filter (where a.ultimo_acesso is not null and a.ultimo_acesso < now() - interval '30 days')::integer,
    'ativos_30d', count(*) filter (where a.ultimo_acesso >= now() - interval '30 days')::integer
  ) into v_acesso from amb a;
  -- Titulares x socios (11/09/2026, pedido do Marcio: "saber quem e quem no
  -- sistema em numeros"). Mesma tabela do bloco acima; o `papel` e o unico
  -- eixo novo. `socios_ativos_30d` e o numero que interessa: em 11/09 eram
  -- 10 socios com login e so 4 acessando -- cadastrar socio nao e o mesmo
  -- que ter socio participando.
  select jsonb_build_object(
    'titulares', count(*) filter (where m.papel = 'titular')::integer,
    'socios', count(*) filter (where m.papel = 'socio')::integer,
    'socios_ativos_30d', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at >= now() - interval '30 days')::integer,
    'socios_nunca_entraram', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at is null)::integer,
    -- Submetricas de ACESSO por papel: o bloco `acesso` conta AMBIENTES,
    -- este conta PESSOAS. "ja_entrou" e quem tem last_sign_in_at; "ativos"
    -- e quem entrou nos ultimos 30 dias. Medido: 1,12 ms quente na mesma
    -- varredura (os 114 ms da primeira medicao eram cache frio).
    'titulares_ja_entraram', count(*) filter (where m.papel = 'titular' and u.last_sign_in_at is not null)::integer,
    'socios_ja_entraram', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at is not null)::integer,
    'titulares_ativos_30d', count(*) filter (where m.papel = 'titular' and u.last_sign_in_at >= now() - interval '30 days')::integer,
    'nunca_entraram', count(*) filter (where m.user_id is not null and u.last_sign_in_at is null)::integer,
    'ambientes_compartilhados', (select count(*)::integer from (select 1 from gps.membros g group by g.aluno_id having count(*) > 1) x),
    'convites_pendentes', (select count(*)::integer from gps.socio_convites where status = 'pendente' and expira_em > now())
  ) into v_equipe from gps.membros m left join auth.users u on u.id = m.user_id;
  select jsonb_build_object(
    'pessoas', (select count(*)::integer from gps.membros m where m.pessoa_aluno_id is not null),
    'concluidos', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null),
    'em_andamento', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null),
    'concluidos_no_mes', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null and (r.concluido_em at time zone v_fuso)::date >= v_ini_mes),
    'parados_7d', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null and r.atualizado_em < now() - interval '7 days'),
    'com_cliente1', (select count(*)::integer from gps.onboarding_respostas r where r.origem_cliente1 = 'ja_tenho'),
    'em_execucao', (select count(*)::integer from gps.onboarding_respostas r where r.fase_cliente1 = 'execucao_andamento')
  ) into v_onboarding;
  select jsonb_build_object(
    'total', count(*)::integer,
    'prospeccao', count(*) filter (where c.fase = 'prospeccao')::integer,
    'fechamento', count(*) filter (where c.fase = 'fechamento')::integer,
    'contratado', count(*) filter (where c.fase = 'contratado')::integer,
    'no_mes', count(*) filter (where (c.criado_em at time zone v_fuso)::date >= v_ini_mes)::integer,
    'no_mes_anterior_ate_o_dia', count(*) filter (where (c.criado_em at time zone v_fuso)::date >= v_ini_ant and (c.criado_em at time zone v_fuso)::date <= v_fim_ant)::integer
  ) into v_clientes from gps.etapa1_clientes c;
  with por_amb as (select c.aluno_id, sum(c.valor_honorarios) as soma from gps.etapa1_clientes c where c.fase = 'contratado' and c.valor_honorarios is not null group by c.aluno_id)
  select jsonb_build_object(
    'clientes_contratados', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
    'contratados_sem_valor', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado' and c.valor_honorarios is null),
    'ambientes_com_contratado', (select count(distinct c.aluno_id)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
    'total_reais', (select sum(p.soma) from por_amb p),
    'somas_por_ambiente', (select coalesce(jsonb_agg(p.soma order by p.soma desc), '[]'::jsonb) from por_amb p)
  ) into v_honorarios;
  with dias as (
    select (e.ocorrido_em at time zone v_fuso)::date as dia,
           count(*) filter (where e.ator = 'aluno')::integer as qtd_aluno,
           count(*) filter (where e.ator = 'equipe')::integer as qtd_equipe,
           count(*) filter (where e.ator = 'sistema')::integer as qtd_sistema
      from gps.aluno_eventos e where e.ocorrido_em >= now() - interval '30 days' group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'aluno', d.qtd_aluno, 'equipe', d.qtd_equipe, 'sistema', d.qtd_sistema) order by d.dia), '[]'::jsonb) into v_atividade from dias d;
  with g as (select c.grau_relacao as grau, count(*)::integer as qtd from gps.etapa1_clientes c where c.grau_relacao is not null group by 1)
  select jsonb_build_object(
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('grau', g.grau, 'qtd', g.qtd) order by g.qtd desc, g.grau), '[]'::jsonb) from g),
    'nao_informado', (select count(*)::integer from gps.etapa1_clientes c where c.grau_relacao is null)
  ) into v_grau;
  -- ═══════════════════════════════════════════════════════════════════════
  -- BLOCOS NOVOS (23/09/2026) — visão de atenção e ranking de parceiros
  -- ═══════════════════════════════════════════════════════════════════════
  --
  -- UMA varredura de gps.etapa1_clientes serve os números de `passos`; as
  -- réguas e o ranking reaproveitam CTE nomeada. Não é uma varredura por
  -- número: cada bloco agrega com `count(*) filter (...)`.

  -- ── passos ──────────────────────────────────────────────────────────────
  -- 🔴 QUATRO CONTAGENS PARALELAS. NÃO SÃO UM FUNIL.
  --
  -- Não existe taxa de conversão entre `mensagem`, `estudo`, `ligacao` e
  -- `aderiu`, e ela NÃO é devolvida aqui de propósito. O que o código diz:
  --
  --   · `ficha-blocos-estado.ts:71-94` chama isso de "N de 4 passos" — uma
  --     CONTAGEM de quantos passos foram marcados, não uma etapa alcançada;
  --   · `cliente-ficha.tsx:186-188` são TRÊS `useState` independentes, sem
  --     `disabled` encadeado: dá para marcar `ligacao` sem nunca ter marcado
  --     `mensagem`.
  --
  -- Logo, "de 117 que receberam mensagem, 18 viraram estudo" seria MENTIRA:
  -- os 18 não são subconjunto dos 117. Se o número não existir no jsonb,
  -- ninguém desenha funil por engano. Quem for acrescentar taxa aqui: mude
  -- ANTES a ficha para encadear os passos, senão o número nasce falso.
  select jsonb_build_object(
    'mensagem', count(*) filter (where c.mensagem_padrao_enviada)::integer,
    'estudo',   count(*) filter (where c.estudo_caso_enviado)::integer,
    'ligacao',  count(*) filter (where c.ligacao_realizada)::integer,
    'aderiu',   count(*) filter (where c.aderiu_reuniao)::integer,
    'total',    count(*)::integer
  ) into v_passos from gps.etapa1_clientes c;

  -- ── caminho ─────────────────────────────────────────────────────────────
  -- A cadeia que TEM sequência real (ao contrário de `passos`).
  --
  -- 🔴 `entrevista` lê gps.entrevista_previa — NUNCA
  --    gps.etapa1_clientes.entrevista_em.
  --    A coluna `etapa1_clientes.entrevista_em` é LEGADO da esteira antiga e
  --    vale 0 em toda a base. O nome dela é mais óbvio que o da tabela nova,
  --    então alguém VAI trocar por engano e o número vira zero em silêncio —
  --    sem erro, sem teste vermelho. A entrevista viva mora em
  --    gps.entrevista_previa (cliente_id -> etapa1_clientes.id).
  select jsonb_build_object(
    'favorito',   (select count(*)::integer from gps.etapa1_clientes c where c.acompanhado_equipe),
    'entrevista', (select count(distinct e.cliente_id)::integer from gps.entrevista_previa e),
    'reuniao',    (select count(*)::integer from gps.etapa1_clientes c where c.data_reuniao_preliminar is not null),
    'aderiu',     (select count(*)::integer from gps.etapa1_clientes c where c.aderiu_reuniao),
    'prospeccao', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'prospeccao'),
    'fechamento', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'fechamento'),
    'contratado', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
    'com_valor',  (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado' and c.valor_honorarios is not null)
  ) into v_caminho;

  -- ── atencao ─────────────────────────────────────────────────────────────
  -- As 5 réguas da fila da equipe.
  --
  -- ⚠️ CORTES DE TEMPO DIFERENTES DE PROPÓSITO — não unificar:
  --      favorito_parado ....  7 dias  (o CLIENTE esfriou)
  --      dias_sem_abrir ..... 14 dias  (o PARCEIRO sumiu)      [bloco parceiros]
  --      filtros DIAS_INATIVO 30 dias  (não tocar)
  --    São perguntas diferentes. Unificar troca o significado das três.
  --
  -- `reuniao_sem_entrevista` usa LEFT JOIN + `is null` (anti-join): tem
  -- reunião marcada e NENHUMA linha em entrevista_previa.
  select jsonb_build_object(
    'favorito_parado', (
      select count(*)::integer from gps.etapa1_clientes c
       where c.acompanhado_equipe
         and c.data_reuniao_preliminar is null
         and c.atualizado_em < now() - interval '7 days'),
    'reuniao_sem_entrevista', (
      select count(*)::integer
        from gps.etapa1_clientes c
        left join gps.entrevista_previa e on e.cliente_id = c.id
       where c.data_reuniao_preliminar is not null
         and e.id is null),
    'socio_pendente', (
      select count(*)::integer from gps.socio_convites s
       where s.status = 'pendente'
         and s.expira_em > now()
         and s.criado_em < now() - interval '7 days'),
    'ambiente_sem_cliente', (
      select count(*)::integer
        from (select distinct m.aluno_id from gps.membros m) a
       where not exists (select 1 from gps.etapa1_clientes c where c.aluno_id = a.aluno_id)),
    'parceiro_sem_mensagem', (
      select count(*)::integer
        from (select c.aluno_id,
                     count(*) filter (where c.mensagem_padrao_enviada) as com_msg
                from gps.etapa1_clientes c group by c.aluno_id) t
       where t.com_msg = 0)
  ) into v_atencao;

  -- ── parceiros ───────────────────────────────────────────────────────────
  -- Ranking por ambiente + agregados, numa varredura só (CTE `rk`).
  --
  -- 🔴 PII MÍNIMA E DELIBERADA: este bloco leva `aluno_id` e `nome`.
  --    Decisão do Marcio (23/09/2026): o ranking sem nome é inútil — "quem
  --    são os 10 parados" precisa dizer QUEM. O cabeçalho de
  --    `src/lib/data/dashboard.ts` foi corrigido junto: não promete mais
  --    "ZERO PII". Só nome e id; nada de e-mail, telefone ou dado de cliente.
  --
  --    O nome vem de public.thb_alunos.nome — a MESMA fonte que o resto do
  --    painel já usa (`getAlunoById` em src/lib/data/alunos.ts) e o alvo da
  --    FK `etapa1_clientes.aluno_id -> public.thb_alunos(id)`.
  --    Não é join novo. gps.membros NÃO tem coluna de nome (conferido).
  --
  -- ⚠️ TETO DE 200 LINHAS no array. Hoje são 86 parceiros; o teto existe para
  --    o payload não crescer com a base (a tela mostra ranking, não censo).
  --    Os AGREGADOS abaixo são calculados sobre TODOS os parceiros, não só
  --    sobre os 200 — senão a média mentiria depois do 201º.
  with rk as (
    select c.aluno_id,
           count(*)::integer                                              as clientes,
           count(*) filter (where c.mensagem_padrao_enviada)::integer     as mensagens,
           -- Ficha completa = nome + telefone (regra oficial da trava dos 30,
           -- CLAUDE.md). Mesmo predicado de `comDados` e de `listou30`.
           count(*) filter (where c.nome is not null and btrim(c.nome) <> ''
                              and c.telefone is not null
                              and btrim(c.telefone) <> '')::integer       as com_ficha_completa,
           count(*) filter (where c.acompanhado_equipe)::integer          as favoritos,
           count(*) filter (where c.data_reuniao_preliminar is not null)::integer as reunioes,
           count(*) filter (where c.fase = 'contratado')::integer         as contratados,
           sum(c.valor_honorarios) filter (where c.fase = 'contratado')   as honorarios,
           (extract(day from now() - max(c.atualizado_em)))::integer      as dias_sem_abrir
      from gps.etapa1_clientes c
     group by c.aluno_id)
  select jsonb_build_object(
    'itens', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'aluno_id',       r.aluno_id,
               'nome',           coalesce(a.nome, ''),
               'clientes',       r.clientes,
               'mensagens',      r.mensagens,
               'favoritos',      r.favoritos,
               'reunioes',       r.reunioes,
               'contratados',    r.contratados,
               'honorarios',     r.honorarios,
               'dias_sem_abrir', r.dias_sem_abrir) order by r.clientes desc, a.nome), '[]'::jsonb)
        from (select rk.* from rk order by rk.clientes desc limit 200) r
        left join public.thb_alunos a on a.id = r.aluno_id),
    'total_parceiros', (select count(*)::integer from rk),
    'media_clientes',  (select round(avg(r.clientes), 1) from rk r),
    'max_clientes',    (select coalesce(max(r.clientes), 0)::integer from rk r),
    -- 🔴 `com_30_ou_mais` conta FICHA COMPLETA (nome + telefone), não cadastro
    --    bruto. É a MESMA regra de `comDados` (src/lib/etapa1.ts),
    --    `clientes_com_dados` (admin_painel_alunos) e do filtro `listou30`
    --    (filtros.ts:57-62) — a trava oficial da fase Inicial, descrita no
    --    CLAUDE.md ("🔴 Ficha completa, a trava dos 30").
    --
    --    Medido em 23/09/2026: cadastro bruto daria 38, ficha completa dá 37.
    --    UM parceiro de diferença — e é exatamente o tipo de divergência que
    --    faz o número do painel não bater com a lista que o clique abre.
    --    Reimplementar com `clientes` (bruto) criaria uma segunda verdade
    --    sobre "fechou os 30"; já foi bug corrigido em 15/09/2026.
    'com_30_ou_mais',  (select count(*)::integer from rk r where r.com_ficha_completa >= 30),
    'sem_mensagem',    (select count(*)::integer from rk r where r.mensagens = 0),
    'com_contratado',  (select count(*)::integer from rk r where r.contratados > 0),
    'sem_abrir_14d',   (select count(*)::integer from rk r where r.dias_sem_abrir >= 14)
  ) into v_parceiros;

  -- ═══════════════════════════════════════════════════════════════════════
  -- BLOCOS NOVOS (23/09/2026, 2ª leva) — jornada · serie
  -- ═══════════════════════════════════════════════════════════════════════

  -- ── jornada ─────────────────────────────────────────────────────────────
  -- O caminho do PARCEIRO (148 ambientes), em NOVE CONTAGENS PARALELAS.
  --
  -- 🔴 NÃO É FUNIL. NÃO EXISTE TAXA DE PASSAGEM ENTRE ESTÁGIOS, e ela não é
  --    devolvida aqui DE PROPÓSITO. Cada número é "quantos ALCANÇARAM este
  --    estágio", sempre sobre os mesmos 148 ambientes — nunca sobre o estágio
  --    anterior.
  --
  --    As quebras da cadeia foram MEDIDAS em 23/09/2026 sobre a base
  --    corrigida, e são grandes:
  --      · 11 cadastraram cliente  SEM  ter concluído o onboarding
  --      · 11 mandaram mensagem    SEM  ter os 30 completos
  --      · 26 escolheram favorito  SEM  ter mandado mensagem
  --      ·  8 marcaram reunião     SEM  favorito
  --      ·  8 fecharam contrato    SEM  reunião registrada
  --
  --    26 de 37 que escolheram favorito nunca mandaram uma mensagem. Logo
  --    "de 22 que mandaram mensagem, 37 escolheram favorito" não é só
  --    estranho — é FALSO: os 37 não são subconjunto dos 22, e a divisão daria
  --    taxa acima de 100%. Dividir estágio por estágio produz número plausível
  --    e errado. É a mesma classe do bloco `passos` acima.
  --
  --    Quem for acrescentar taxa aqui: PARE. Ou o produto passa a encadear os
  --    estágios de verdade (e aí a taxa nasce verdadeira), ou a taxa continua
  --    fora. Número que não existe no jsonb é número que ninguém desenha por
  --    engano.
  --
  -- 🔴 AGREGUE CADA FONTE **ANTES** DE JUNTAR — `bool_or` nos CTEs é o que
  --    impede a MULTIPLICAÇÃO DE LINHAS. Ambiente com sócio tem N linhas em
  --    `gps.membros` (148 ambientes, 165 membros); juntar `membros` com
  --    `onboarding_respostas` sem agregar antes conta o MESMO ambiente N
  --    vezes. Foi exatamente esse erro que produziu 151/89 na primeira
  --    medição, em vez de 148/86 — e o pior é que o número inflado parece
  --    plausível: ninguém desconfia de 151 quando o certo é 148.
  --
  -- ⚠️ `ambientes` parte de `select distinct m.aluno_id from gps.membros`, o
  --    MESMO universo que `programa.total` conta. Os dois aparecem na mesma
  --    tela — `programa.total` já está lá como "Parceiros · 148 titulares".
  --    Se divergirem, um número contradiz o outro na mesma tela. A base é a
  --    tabela e o agrupamento idênticos, sem filtro dos dois lados; os
  --    `left join` abaixo NUNCA podem mudar a cardinalidade de `base`.
  --
  -- `entraram` conta o AMBIENTE em que algum membro já entrou (bool_or sobre
  -- last_sign_in_at) — titular ou sócio. É ambiente que abriu o portal, não
  -- pessoa que abriu; o recorte por pessoa já existe no bloco `equipe`.
  with base as (
    select distinct m.aluno_id from gps.membros m),
  login as (
    select m.aluno_id,
           bool_or(u.last_sign_in_at is not null) as ja_entrou
      from gps.membros m
      left join auth.users u on u.id = m.user_id
     group by m.aluno_id),
  onb as (
    -- O onboarding é da PESSOA (pessoa_aluno_id), o ambiente é do aluno_id.
    -- Um ambiente com titular + sócio tem DUAS linhas aqui; `bool_or` +
    -- `group by` resolvem para "alguém deste ambiente concluiu" e devolvem
    -- UMA linha por ambiente. Sem isso o join lá embaixo duplica o ambiente.
    select m.aluno_id,
           bool_or(r.concluido_em is not null) as concluiu
      from gps.membros m
      join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
     group by m.aluno_id),
  cli as (
    select c.aluno_id,
           count(*)::integer as n,
           -- Ficha completa = nome + telefone. MESMO predicado de
           -- `com_ficha_completa` no bloco `parceiros` acima, de `comDados`
           -- (src/lib/etapa1.ts) e do filtro `listou30`. Não divergir:
           -- `fechou_30` tem de bater com `parceiros.com_30_ou_mais` (37).
           count(*) filter (where c.nome is not null and btrim(c.nome) <> ''
                              and c.telefone is not null
                              and btrim(c.telefone) <> '')::integer as completos,
           count(*) filter (where c.mensagem_padrao_enviada)::integer as msg,
           count(*) filter (where c.acompanhado_equipe)::integer as favorito,
           count(*) filter (where c.data_reuniao_preliminar is not null)::integer as reuniao,
           count(*) filter (where c.fase = 'contratado')::integer as contratado
      from gps.etapa1_clientes c
     group by c.aluno_id)
  select jsonb_build_object(
    'ambientes',          count(*)::integer,
    'entraram',           count(*) filter (where l.ja_entrou)::integer,
    'onboarding_ok',      count(*) filter (where o.concluiu)::integer,
    'cadastrou',          count(*) filter (where coalesce(c.n, 0) >= 1)::integer,
    'fechou_30',          count(*) filter (where coalesce(c.completos, 0) >= 30)::integer,
    'mandou_msg',         count(*) filter (where coalesce(c.msg, 0) >= 1)::integer,
    'escolheu_favorito',  count(*) filter (where coalesce(c.favorito, 0) >= 1)::integer,
    'marcou_reuniao',     count(*) filter (where coalesce(c.reuniao, 0) >= 1)::integer,
    'fechou_contrato',    count(*) filter (where coalesce(c.contratado, 0) >= 1)::integer
  ) into v_jornada
    from base b
    left join login l on l.aluno_id = b.aluno_id
    left join onb   o on o.aluno_id = b.aluno_id
    left join cli   c on c.aluno_id = b.aluno_id;

  -- ── serie ───────────────────────────────────────────────────────────────
  -- Evolução semanal: 10 semanas INTEIRAS, da mais antiga para a mais nova.
  --
  -- ⚠️ CORTE PELA `date_trunc`, NUNCA POR `now() - interval '10 weeks'`.
  --    `now() - 10 weeks` cai no MEIO de uma semana e produz um 11º item
  --    PARCIAL na borda antiga — um número artificialmente baixo que alguém
  --    lê como queda. Medido em 23/09: essa borda dava 13/07 com 35 clientes
  --    ao lado de 136 na semana seguinte. `date_trunc('week', hoje) -
  --    9 weeks` dá 10 semanas inteiras contando a atual.
  --
  -- ⚠️ A SEMANA CORRENTE TAMBÉM É PARCIAL, e isso NÃO se corrige cortando —
  --    é o presente. Por isso o bloco devolve `semana_corrente`: a tela marca
  --    aquele item como "em andamento" em vez de desenhar uma queda que não
  --    existe. Medido: 21/09 tinha 37 clientes porque a semana mal começara.
  --
  -- 🔴 `com_msg` CONTA O ESTADO ATUAL DA FLAG, não "mandou naquela semana".
  --    `mensagem_padrao_enviada` é boolean SEM data: não existe registro de
  --    QUANDO a mensagem saiu. O que este número diz é "dos clientes criados
  --    naquela semana, quantos TÊM a flag hoje" — a mensagem pode ter sido
  --    enviada semanas depois, e o número de uma semana antiga pode subir
  --    amanhã. É uma aproximação honesta, e quem lê o gráfico precisa saber.
  --
  --    Para virar "mandou naquela semana" seria preciso uma coluna de data no
  --    envio (ou um evento em gps.aluno_eventos). NÃO inventar a data a partir
  --    de `atualizado_em`: ela se move em QUALQUER edição da ficha, então
  --    daria uma série que parece precisa e não é.
  --
  -- `parceiros_ativos` = ambientes distintos que criaram ao menos um cliente
  -- naquela semana. Não é "parceiro ativo no portal" — isso é o bloco
  -- `acesso`, que mede login.
  with sem as (
    select date_trunc('week', (c.criado_em at time zone v_fuso)) as semana,
           count(*)::integer as clientes,
           count(*) filter (where c.mensagem_padrao_enviada)::integer as com_msg,
           count(distinct c.aluno_id)::integer as parceiros_ativos
      from gps.etapa1_clientes c
     where (c.criado_em at time zone v_fuso)
             >= date_trunc('week', (now() at time zone v_fuso)) - interval '9 weeks'
     group by 1)
  select coalesce(jsonb_agg(jsonb_build_object(
           'semana',           to_char(s.semana, 'DD/MM'),
           'clientes',         s.clientes,
           'com_msg',          s.com_msg,
           'parceiros_ativos', s.parceiros_ativos) order by s.semana), '[]'::jsonb)
    into v_serie from sem s;

  -- A chave da semana corrente, no MESMO formato 'DD/MM' dos itens, para a
  -- tela casar por igualdade de texto e marcar "em andamento". Sai do banco
  -- de propósito: calcular no cliente usaria o fuso do NAVEGADOR e erraria a
  -- semana para quem estiver fora de America/Sao_Paulo.
  v_semana_corrente := to_char(date_trunc('week', (now() at time zone v_fuso)), 'DD/MM');

  return jsonb_build_object(
    'gerado_em', now(),
    'referencia', jsonb_build_object('fuso', v_fuso, 'hoje', v_hoje, 'dia', v_dia, 'mes', to_char(v_ini_mes, 'YYYY-MM'), 'mes_anterior', to_char(v_ini_ant, 'YYYY-MM')),
    'programa', v_programa, 'acesso', v_acesso, 'equipe', v_equipe, 'onboarding', v_onboarding, 'clientes', v_clientes,
    'honorarios', v_honorarios, 'atividade', v_atividade, 'grau_relacao', v_grau,
    'passos', v_passos, 'caminho', v_caminho, 'atencao', v_atencao, 'parceiros', v_parceiros,
    'jornada', v_jornada,
    'serie', jsonb_build_object('itens', v_serie, 'semana_corrente', v_semana_corrente));
end $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CORPO ORIGINAL — 13 BLOCOS (estado de produção ANTES desta migration)
-- ═══════════════════════════════════════════════════════════════════════════
-- Caminho de volta: descomentar o bloco abaixo e executá-lo. `create or
-- replace` substitui a função INTEIRA, então reverter é reaplicar este
-- texto — não adianta apagar só os blocos novos.
--
-- CREATE OR REPLACE FUNCTION gps.admin_dashboard()
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- declare
--   v_fuso text := 'America/Sao_Paulo'; v_hoje date; v_dia integer; v_ini_mes date; v_ini_ant date; v_fim_ant date;
--   v_programa jsonb; v_acesso jsonb; v_onboarding jsonb; v_clientes jsonb; v_honorarios jsonb; v_atividade jsonb; v_grau jsonb; v_equipe jsonb;
--   v_passos jsonb; v_caminho jsonb; v_atencao jsonb; v_parceiros jsonb;
-- begin
--   if not coalesce(public.gp_is_admin(), false) then raise exception 'Sem permissão.' using errcode = '42501'; end if;
--   v_hoje := (now() at time zone v_fuso)::date;
--   v_dia := extract(day from v_hoje)::integer;
--   v_ini_mes := date_trunc('month', v_hoje)::date;
--   v_ini_ant := (v_ini_mes - interval '1 month')::date;
--   v_fim_ant := least(v_ini_ant + (v_dia - 1), v_ini_mes - 1);
--   with tit as (select (m.criado_em at time zone v_fuso)::date as dia from gps.membros m where m.papel = 'titular'),
--   meses as (select to_char(date_trunc('month', t.dia), 'YYYY-MM') as mes, count(*)::integer as qtd from tit t where t.dia >= (v_ini_mes - interval '11 months')::date group by 1)
--   select jsonb_build_object(
--     'total', (select count(distinct m.aluno_id)::integer from gps.membros m),
--     'no_mes', (select count(*)::integer from tit t where t.dia >= v_ini_mes),
--     'no_mes_anterior_ate_o_dia', (select count(*)::integer from tit t where t.dia >= v_ini_ant and t.dia <= v_fim_ant),
--     'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'qtd', qtd) order by mes), '[]'::jsonb) from meses)
--   ) into v_programa;
--   with amb as (select m.aluno_id, bool_or(m.user_id is not null) as tem_login, max(u.last_sign_in_at) as ultimo_acesso from gps.membros m left join auth.users u on u.id = m.user_id group by m.aluno_id)
--   select jsonb_build_object(
--     'total', count(*)::integer,
--     'com_login', count(*) filter (where a.tem_login)::integer,
--     'sem_login', count(*) filter (where not a.tem_login)::integer,
--     'nunca_entraram', count(*) filter (where a.tem_login and a.ultimo_acesso is null)::integer,
--     'sem_acesso_30d', count(*) filter (where a.ultimo_acesso is not null and a.ultimo_acesso < now() - interval '30 days')::integer,
--     'ativos_30d', count(*) filter (where a.ultimo_acesso >= now() - interval '30 days')::integer
--   ) into v_acesso from amb a;
--   -- Titulares x socios (11/09/2026, pedido do Marcio: "saber quem e quem no
--   -- sistema em numeros"). Mesma tabela do bloco acima; o `papel` e o unico
--   -- eixo novo. `socios_ativos_30d` e o numero que interessa: em 11/09 eram
--   -- 10 socios com login e so 4 acessando -- cadastrar socio nao e o mesmo
--   -- que ter socio participando.
--   select jsonb_build_object(
--     'titulares', count(*) filter (where m.papel = 'titular')::integer,
--     'socios', count(*) filter (where m.papel = 'socio')::integer,
--     'socios_ativos_30d', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at >= now() - interval '30 days')::integer,
--     'socios_nunca_entraram', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at is null)::integer,
--     -- Submetricas de ACESSO por papel: o bloco `acesso` conta AMBIENTES,
--     -- este conta PESSOAS. "ja_entrou" e quem tem last_sign_in_at; "ativos"
--     -- e quem entrou nos ultimos 30 dias. Medido: 1,12 ms quente na mesma
--     -- varredura (os 114 ms da primeira medicao eram cache frio).
--     'titulares_ja_entraram', count(*) filter (where m.papel = 'titular' and u.last_sign_in_at is not null)::integer,
--     'socios_ja_entraram', count(*) filter (where m.papel = 'socio' and u.last_sign_in_at is not null)::integer,
--     'titulares_ativos_30d', count(*) filter (where m.papel = 'titular' and u.last_sign_in_at >= now() - interval '30 days')::integer,
--     'nunca_entraram', count(*) filter (where m.user_id is not null and u.last_sign_in_at is null)::integer,
--     'ambientes_compartilhados', (select count(*)::integer from (select 1 from gps.membros g group by g.aluno_id having count(*) > 1) x),
--     'convites_pendentes', (select count(*)::integer from gps.socio_convites where status = 'pendente' and expira_em > now())
--   ) into v_equipe from gps.membros m left join auth.users u on u.id = m.user_id;
--   select jsonb_build_object(
--     'pessoas', (select count(*)::integer from gps.membros m where m.pessoa_aluno_id is not null),
--     'concluidos', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null),
--     'em_andamento', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null),
--     'concluidos_no_mes', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is not null and (r.concluido_em at time zone v_fuso)::date >= v_ini_mes),
--     'parados_7d', (select count(*)::integer from gps.onboarding_respostas r where r.concluido_em is null and r.atualizado_em < now() - interval '7 days'),
--     'com_cliente1', (select count(*)::integer from gps.onboarding_respostas r where r.origem_cliente1 = 'ja_tenho'),
--     'em_execucao', (select count(*)::integer from gps.onboarding_respostas r where r.fase_cliente1 = 'execucao_andamento')
--   ) into v_onboarding;
--   select jsonb_build_object(
--     'total', count(*)::integer,
--     'prospeccao', count(*) filter (where c.fase = 'prospeccao')::integer,
--     'fechamento', count(*) filter (where c.fase = 'fechamento')::integer,
--     'contratado', count(*) filter (where c.fase = 'contratado')::integer,
--     'no_mes', count(*) filter (where (c.criado_em at time zone v_fuso)::date >= v_ini_mes)::integer,
--     'no_mes_anterior_ate_o_dia', count(*) filter (where (c.criado_em at time zone v_fuso)::date >= v_ini_ant and (c.criado_em at time zone v_fuso)::date <= v_fim_ant)::integer
--   ) into v_clientes from gps.etapa1_clientes c;
--   with por_amb as (select c.aluno_id, sum(c.valor_honorarios) as soma from gps.etapa1_clientes c where c.fase = 'contratado' and c.valor_honorarios is not null group by c.aluno_id)
--   select jsonb_build_object(
--     'clientes_contratados', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
--     'contratados_sem_valor', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado' and c.valor_honorarios is null),
--     'ambientes_com_contratado', (select count(distinct c.aluno_id)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
--     'total_reais', (select sum(p.soma) from por_amb p),
--     'somas_por_ambiente', (select coalesce(jsonb_agg(p.soma order by p.soma desc), '[]'::jsonb) from por_amb p)
--   ) into v_honorarios;
--   with dias as (
--     select (e.ocorrido_em at time zone v_fuso)::date as dia,
--            count(*) filter (where e.ator = 'aluno')::integer as qtd_aluno,
--            count(*) filter (where e.ator = 'equipe')::integer as qtd_equipe,
--            count(*) filter (where e.ator = 'sistema')::integer as qtd_sistema
--       from gps.aluno_eventos e where e.ocorrido_em >= now() - interval '30 days' group by 1)
--   select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'aluno', d.qtd_aluno, 'equipe', d.qtd_equipe, 'sistema', d.qtd_sistema) order by d.dia), '[]'::jsonb) into v_atividade from dias d;
--   with g as (select c.grau_relacao as grau, count(*)::integer as qtd from gps.etapa1_clientes c where c.grau_relacao is not null group by 1)
--   select jsonb_build_object(
--     'itens', (select coalesce(jsonb_agg(jsonb_build_object('grau', g.grau, 'qtd', g.qtd) order by g.qtd desc, g.grau), '[]'::jsonb) from g),
--     'nao_informado', (select count(*)::integer from gps.etapa1_clientes c where c.grau_relacao is null)
--   ) into v_grau;
--   -- ═══════════════════════════════════════════════════════════════════════
--   -- BLOCOS NOVOS (23/09/2026) — visão de atenção e ranking de parceiros
--   -- ═══════════════════════════════════════════════════════════════════════
--   --
--   -- UMA varredura de gps.etapa1_clientes serve os números de `passos`; as
--   -- réguas e o ranking reaproveitam CTE nomeada. Não é uma varredura por
--   -- número: cada bloco agrega com `count(*) filter (...)`.
-- 
--   -- ── passos ──────────────────────────────────────────────────────────────
--   -- 🔴 QUATRO CONTAGENS PARALELAS. NÃO SÃO UM FUNIL.
--   --
--   -- Não existe taxa de conversão entre `mensagem`, `estudo`, `ligacao` e
--   -- `aderiu`, e ela NÃO é devolvida aqui de propósito. O que o código diz:
--   --
--   --   · `ficha-blocos-estado.ts:71-94` chama isso de "N de 4 passos" — uma
--   --     CONTAGEM de quantos passos foram marcados, não uma etapa alcançada;
--   --   · `cliente-ficha.tsx:186-188` são TRÊS `useState` independentes, sem
--   --     `disabled` encadeado: dá para marcar `ligacao` sem nunca ter marcado
--   --     `mensagem`.
--   --
--   -- Logo, "de 117 que receberam mensagem, 18 viraram estudo" seria MENTIRA:
--   -- os 18 não são subconjunto dos 117. Se o número não existir no jsonb,
--   -- ninguém desenha funil por engano. Quem for acrescentar taxa aqui: mude
--   -- ANTES a ficha para encadear os passos, senão o número nasce falso.
--   select jsonb_build_object(
--     'mensagem', count(*) filter (where c.mensagem_padrao_enviada)::integer,
--     'estudo',   count(*) filter (where c.estudo_caso_enviado)::integer,
--     'ligacao',  count(*) filter (where c.ligacao_realizada)::integer,
--     'aderiu',   count(*) filter (where c.aderiu_reuniao)::integer,
--     'total',    count(*)::integer
--   ) into v_passos from gps.etapa1_clientes c;
-- 
--   -- ── caminho ─────────────────────────────────────────────────────────────
--   -- A cadeia que TEM sequência real (ao contrário de `passos`).
--   --
--   -- 🔴 `entrevista` lê gps.entrevista_previa — NUNCA
--   --    gps.etapa1_clientes.entrevista_em.
--   --    A coluna `etapa1_clientes.entrevista_em` é LEGADO da esteira antiga e
--   --    vale 0 em toda a base. O nome dela é mais óbvio que o da tabela nova,
--   --    então alguém VAI trocar por engano e o número vira zero em silêncio —
--   --    sem erro, sem teste vermelho. A entrevista viva mora em
--   --    gps.entrevista_previa (cliente_id -> etapa1_clientes.id).
--   select jsonb_build_object(
--     'favorito',   (select count(*)::integer from gps.etapa1_clientes c where c.acompanhado_equipe),
--     'entrevista', (select count(distinct e.cliente_id)::integer from gps.entrevista_previa e),
--     'reuniao',    (select count(*)::integer from gps.etapa1_clientes c where c.data_reuniao_preliminar is not null),
--     'aderiu',     (select count(*)::integer from gps.etapa1_clientes c where c.aderiu_reuniao),
--     'prospeccao', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'prospeccao'),
--     'fechamento', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'fechamento'),
--     'contratado', (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado'),
--     'com_valor',  (select count(*)::integer from gps.etapa1_clientes c where c.fase = 'contratado' and c.valor_honorarios is not null)
--   ) into v_caminho;
-- 
--   -- ── atencao ─────────────────────────────────────────────────────────────
--   -- As 5 réguas da fila da equipe.
--   --
--   -- ⚠️ CORTES DE TEMPO DIFERENTES DE PROPÓSITO — não unificar:
--   --      favorito_parado ....  7 dias  (o CLIENTE esfriou)
--   --      dias_sem_abrir ..... 14 dias  (o PARCEIRO sumiu)      [bloco parceiros]
--   --      filtros DIAS_INATIVO 30 dias  (não tocar)
--   --    São perguntas diferentes. Unificar troca o significado das três.
--   --
--   -- `reuniao_sem_entrevista` usa LEFT JOIN + `is null` (anti-join): tem
--   -- reunião marcada e NENHUMA linha em entrevista_previa.
--   select jsonb_build_object(
--     'favorito_parado', (
--       select count(*)::integer from gps.etapa1_clientes c
--        where c.acompanhado_equipe
--          and c.data_reuniao_preliminar is null
--          and c.atualizado_em < now() - interval '7 days'),
--     'reuniao_sem_entrevista', (
--       select count(*)::integer
--         from gps.etapa1_clientes c
--         left join gps.entrevista_previa e on e.cliente_id = c.id
--        where c.data_reuniao_preliminar is not null
--          and e.id is null),
--     'socio_pendente', (
--       select count(*)::integer from gps.socio_convites s
--        where s.status = 'pendente'
--          and s.expira_em > now()
--          and s.criado_em < now() - interval '7 days'),
--     'ambiente_sem_cliente', (
--       select count(*)::integer
--         from (select distinct m.aluno_id from gps.membros m) a
--        where not exists (select 1 from gps.etapa1_clientes c where c.aluno_id = a.aluno_id)),
--     'parceiro_sem_mensagem', (
--       select count(*)::integer
--         from (select c.aluno_id,
--                      count(*) filter (where c.mensagem_padrao_enviada) as com_msg
--                 from gps.etapa1_clientes c group by c.aluno_id) t
--        where t.com_msg = 0)
--   ) into v_atencao;
-- 
--   -- ── parceiros ───────────────────────────────────────────────────────────
--   -- Ranking por ambiente + agregados, numa varredura só (CTE `rk`).
--   --
--   -- 🔴 PII MÍNIMA E DELIBERADA: este bloco leva `aluno_id` e `nome`.
--   --    Decisão do Marcio (23/09/2026): o ranking sem nome é inútil — "quem
--   --    são os 10 parados" precisa dizer QUEM. O cabeçalho de
--   --    `src/lib/data/dashboard.ts` foi corrigido junto: não promete mais
--   --    "ZERO PII". Só nome e id; nada de e-mail, telefone ou dado de cliente.
--   --
--   --    O nome vem de public.thb_alunos.nome — a MESMA fonte que o resto do
--   --    painel já usa (`getAlunoById` em src/lib/data/alunos.ts) e o alvo da
--   --    FK `etapa1_clientes.aluno_id -> public.thb_alunos(id)`.
--   --    Não é join novo. gps.membros NÃO tem coluna de nome (conferido).
--   --
--   -- ⚠️ TETO DE 200 LINHAS no array. Hoje são 86 parceiros; o teto existe para
--   --    o payload não crescer com a base (a tela mostra ranking, não censo).
--   --    Os AGREGADOS abaixo são calculados sobre TODOS os parceiros, não só
--   --    sobre os 200 — senão a média mentiria depois do 201º.
--   with rk as (
--     select c.aluno_id,
--            count(*)::integer                                              as clientes,
--            count(*) filter (where c.mensagem_padrao_enviada)::integer     as mensagens,
--            -- Ficha completa = nome + telefone (regra oficial da trava dos 30,
--            -- CLAUDE.md). Mesmo predicado de `comDados` e de `listou30`.
--            count(*) filter (where c.nome is not null and btrim(c.nome) <> ''
--                               and c.telefone is not null
--                               and btrim(c.telefone) <> '')::integer       as com_ficha_completa,
--            count(*) filter (where c.acompanhado_equipe)::integer          as favoritos,
--            count(*) filter (where c.data_reuniao_preliminar is not null)::integer as reunioes,
--            count(*) filter (where c.fase = 'contratado')::integer         as contratados,
--            sum(c.valor_honorarios) filter (where c.fase = 'contratado')   as honorarios,
--            (extract(day from now() - max(c.atualizado_em)))::integer      as dias_sem_abrir
--       from gps.etapa1_clientes c
--      group by c.aluno_id)
--   select jsonb_build_object(
--     'itens', (
--       select coalesce(jsonb_agg(jsonb_build_object(
--                'aluno_id',       r.aluno_id,
--                'nome',           coalesce(a.nome, ''),
--                'clientes',       r.clientes,
--                'mensagens',      r.mensagens,
--                'favoritos',      r.favoritos,
--                'reunioes',       r.reunioes,
--                'contratados',    r.contratados,
--                'honorarios',     r.honorarios,
--                'dias_sem_abrir', r.dias_sem_abrir) order by r.clientes desc, a.nome), '[]'::jsonb)
--         from (select rk.* from rk order by rk.clientes desc limit 200) r
--         left join public.thb_alunos a on a.id = r.aluno_id),
--     'total_parceiros', (select count(*)::integer from rk),
--     'media_clientes',  (select round(avg(r.clientes), 1) from rk r),
--     'max_clientes',    (select coalesce(max(r.clientes), 0)::integer from rk r),
--     -- 🔴 `com_30_ou_mais` conta FICHA COMPLETA (nome + telefone), não cadastro
--     --    bruto. É a MESMA regra de `comDados` (src/lib/etapa1.ts),
--     --    `clientes_com_dados` (admin_painel_alunos) e do filtro `listou30`
--     --    (filtros.ts:57-62) — a trava oficial da fase Inicial, descrita no
--     --    CLAUDE.md ("🔴 Ficha completa, a trava dos 30").
--     --
--     --    Medido em 23/09/2026: cadastro bruto daria 38, ficha completa dá 37.
--     --    UM parceiro de diferença — e é exatamente o tipo de divergência que
--     --    faz o número do painel não bater com a lista que o clique abre.
--     --    Reimplementar com `clientes` (bruto) criaria uma segunda verdade
--     --    sobre "fechou os 30"; já foi bug corrigido em 15/09/2026.
--     'com_30_ou_mais',  (select count(*)::integer from rk r where r.com_ficha_completa >= 30),
--     'sem_mensagem',    (select count(*)::integer from rk r where r.mensagens = 0),
--     'com_contratado',  (select count(*)::integer from rk r where r.contratados > 0),
--     'sem_abrir_14d',   (select count(*)::integer from rk r where r.dias_sem_abrir >= 14)
--   ) into v_parceiros;
-- 
--   return jsonb_build_object(
--     'gerado_em', now(),
--     'referencia', jsonb_build_object('fuso', v_fuso, 'hoje', v_hoje, 'dia', v_dia, 'mes', to_char(v_ini_mes, 'YYYY-MM'), 'mes_anterior', to_char(v_ini_ant, 'YYYY-MM')),
--     'programa', v_programa, 'acesso', v_acesso, 'equipe', v_equipe, 'onboarding', v_onboarding, 'clientes', v_clientes,
--     'honorarios', v_honorarios, 'atividade', v_atividade, 'grau_relacao', v_grau,
--     'passos', v_passos, 'caminho', v_caminho, 'atencao', v_atencao, 'parceiros', v_parceiros);
-- end $function$;
-- 
