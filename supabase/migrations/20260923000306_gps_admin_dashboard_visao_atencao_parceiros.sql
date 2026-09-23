-- ═══════════════════════════════════════════════════════════════════════════
-- gps.admin_dashboard() — 4 blocos novos: passos · caminho · atencao · parceiros
-- 23/09/2026 · redesenho da visão geral de /admin (Fatia 1)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NÃO APLICADA. Escrita a partir do pg_get_functiondef lido do BANCO
--    (produção, projeto mbvybujpkwuorhtdzcde), NUNCA do arquivo do repo.
--
-- 🔴 POR QUE ISSO IMPORTA
--    O repo versiona a função com 8 blocos e SEM `equipe`
--    (20260910000209_gps_admin_dashboard.sql — conferido: 0 ocorrências de
--    'equipe', v_equipe). A produção TEM `equipe`, aplicado direto no banco
--    em 11/09; as migrations …247 e …249 são arquivos-RETRATO, sem
--    `create or replace` (conferido: 0 ocorrências em ambas).
--    Partir do repo apagaria 'equipe', v_equipe e quebraria
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
-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA OBRIGATÓRIA — rodar ANTES e DEPOIS (tem de dar `true` nos dois)
-- ═══════════════════════════════════════════════════════════════════════════
--   select pg_get_functiondef(p.oid) ~ '''equipe'', v_equipe'
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'admin_dashboard';
--
--   ANTES  (23/09/2026, medido contra produção): true  ✅  (7.939 caracteres)
--   DEPOIS: true  ✅  APLICADA EM PRODUÇÃO em 23/09/2026.
--
--   Conferido no catálogo logo após o apply:
--     'equipe', v_equipe ......... presente  ✅ (o risco principal, sobreviveu)
--     'passos', v_passos ......... presente  ✅
--     'parceiros', v_parceiros ... presente  ✅
--     proacl ..... {postgres=X, authenticated=X, service_role=X} — IDÊNTICO ao
--                  de antes; nenhum grant emitido, `anon` segue sem execute
--     funções com este nome ...... 1 (sem sobrecarga), args: (vazio)
--
--   Executada com JWT de admin real (transação + rollback):
--     equipe.titulares = 148 → o bloco não versionado continua respondendo
--     passos 117/18/32/22 de 1699 · atenção 18/51/0/62/64
--     ranking 86 itens · 19,8 · 110 · 37 · 64 · 13 · 10
--     caminho.entrevista = 1 (distinct sobre 4 linhas duplicadas)
--
--   explain (analyze, buffers) da função COMPLETA, como admin:
--     Execution Time: 35,140 ms · shared hit=6797 · Planning 0,011 ms
--     (os 4 blocos novos isolados custavam 16,5 ms; o teto do authenticator
--      é 8 s — folga de duas ordens de grandeza)
--
--   Sem JWT a função recusa com 42501 ("Sem permissão.") — guarda testada
--   por acidente ao tentar medir como postgres sem claims.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- VALIDAÇÃO EM PRODUÇÃO — 23/09/2026, SEM tocar na função viva
-- ═══════════════════════════════════════════════════════════════════════════
-- Os 4 blocos novos foram criados como `gps.zz_dash_teste()` (nome
-- temporário), executados, medidos e a função de teste foi derrubada em
-- seguida. `gps.admin_dashboard()` permaneceu intacta o tempo todo
-- (reconferido ao final: 7.939 caracteres, `equipe` presente, sem `passos`).
--
--   · O SQL COMPILA — este é o teste que `tsc` não faz.
--   · explain (analyze, buffers) dos 4 blocos: 16,505 ms · shared hit=3204.
--     Teto de 100 ms respeitado. Nenhum índice criado.
--
-- Números conferidos contra a base (esperado → obtido):
--   passos      117·18·32·22 → 117·18·32·22          ✅ batem
--   ranking     86·19,8·110·38·64·13·10 → idênticos   ✅ batem
--   réguas      18·51·62·64 → 18·51·62·64             ✅ batem
--
-- 4 divergências, TODAS investigadas — nenhuma é defeito do SQL:
--   · total 1703 → 1701 e prospeccao 1642 → 1640: dois clientes apagados
--     entre a medição e a validação. Dado vivo, não erro.
--   · com_valor 13 → 9: o número ESPERADO estava errado (media `valor_
--     honorarios is not null` na base toda). Este bloco mede dentro de
--     `fase='contratado'`, que é o certo.
--   · socio_pendente 2 → 0: os 2 convites >7d já EXPIRARAM. A régua exige
--     `expira_em > now()` — conta só o que ainda dá para salvar. Correto.
--   · entrevista 4 → 1: 🔴 `gps.entrevista_previa` tem 4 linhas de UM único
--     cliente. `count(distinct cliente_id)` é o que este bloco quer (ele mede
--     CLIENTES, não formulários preenchidos). A tabela não tem unique em
--     `cliente_id` e aceitou 4 duplicatas no primeiro dia de uso — registrado
--     como pendência de produto, fora do escopo desta migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICE: nenhum criado, decisão fechada.
--   Não existe `where` do qual um índice participe — é agregação sobre a
--   tabela inteira (Seq Scan + HashAggregate é o plano CERTO aqui).
--   gps.etapa1_clientes é a tabela mais quente do sistema: índice novo
--   cobraria escrita em TODA ficha salva.
--   Medido: ranking 1,395 ms hoje / 9,467 ms com 10× · régua 1,770 ms.
--
-- REVERSÃO: reaplicar, na íntegra, a definição ANTERIOR guardada no bloco de
--   comentário ao final deste arquivo (`DEFINIÇÃO ANTERIOR`). Ela é o texto
--   exato devolvido por pg_get_functiondef antes desta mudança.
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

  return jsonb_build_object(
    'gerado_em', now(),
    'referencia', jsonb_build_object('fuso', v_fuso, 'hoje', v_hoje, 'dia', v_dia, 'mes', to_char(v_ini_mes, 'YYYY-MM'), 'mes_anterior', to_char(v_ini_ant, 'YYYY-MM')),
    'programa', v_programa, 'acesso', v_acesso, 'equipe', v_equipe, 'onboarding', v_onboarding, 'clientes', v_clientes,
    'honorarios', v_honorarios, 'atividade', v_atividade, 'grau_relacao', v_grau,
    'passos', v_passos, 'caminho', v_caminho, 'atencao', v_atencao, 'parceiros', v_parceiros);
end $function$;


/* ═══════════════════════════════════════════════════════════════════════
   DEFINIÇÃO ANTERIOR — PLANO DE REVERSÃO (não editar)
   pg_get_functiondef('gps.admin_dashboard'::regproc) lido da produção
   em 23/09/2026, 7.939 caracteres, com 'equipe', v_equipe presente.
   Para reverter: executar o bloco abaixo tal como está.
   ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION gps.admin_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fuso text := 'America/Sao_Paulo'; v_hoje date; v_dia integer; v_ini_mes date; v_ini_ant date; v_fim_ant date;
  v_programa jsonb; v_acesso jsonb; v_onboarding jsonb; v_clientes jsonb; v_honorarios jsonb; v_atividade jsonb; v_grau jsonb; v_equipe jsonb;
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
  return jsonb_build_object(
    'gerado_em', now(),
    'referencia', jsonb_build_object('fuso', v_fuso, 'hoje', v_hoje, 'dia', v_dia, 'mes', to_char(v_ini_mes, 'YYYY-MM'), 'mes_anterior', to_char(v_ini_ant, 'YYYY-MM')),
    'programa', v_programa, 'acesso', v_acesso, 'equipe', v_equipe, 'onboarding', v_onboarding, 'clientes', v_clientes,
    'honorarios', v_honorarios, 'atividade', v_atividade, 'grau_relacao', v_grau);
end $function$

*/
