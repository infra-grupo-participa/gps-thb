-- ═══════════════════════════════════════════════════════════════════════════
-- Briefing da Reunião Preliminar pelas 7 partes do script — FATIA 1:
-- `gps.sessao_briefing_ler` passa a devolver a última Entrevista Prévia
-- CONCLUÍDA do cliente, AO VIVO, num bloco novo `entrevista_previa_ao_vivo`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 NUMERAÇÃO: esta migration ia ser a …312. O número JÁ ESTAVA TOMADO por
-- `20260924000312_gps_plantao_teto_semanal_diz_quando_libera.sql`, que entrou
-- no repo depois da conferência do plano. Esta é a …313. Se alguém procurar a
-- "312 do briefing", é este arquivo.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ✅ CORPO = CORPO VIVO. Em 24/09/2026 ~15:55 UTC o corpo abaixo foi montado
-- sobre `pg_get_functiondef('gps.sessao_briefing_ler')` extraído do banco
-- (que já tinha `decisores_ao_vivo` e a chave `letra` em `disc_ao_vivo`,
-- aplicados por MCP em 23/09 sem .sql no repo) + o bloco novo da entrevista
-- prévia. As "duas divergências" descritas abaixo foram RECONCILIADAS aqui;
-- o texto fica como registro do porquê. Aplicada em seguida (ver rodapé).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 ESTA MIGRAÇÃO ENTRA POR CIMA DE FUNÇÃO VIVA
-- ═══════════════════════════════════════════════════════════════════════════
-- `gps.sessao_briefing_ler` existe desde a …292 e foi substituída pela …294
-- (bloco `disc_ao_vivo`) e pela …303 (bloco `decisores_ao_vivo`). Conferido
-- com `grep -l sessao_briefing_ler supabase/migrations/`: nenhuma migration
-- entre a …295 e a …312 recria a função — as ocorrências nelas são só
-- comentário. Só que "nenhuma migration recria" NÃO significa "o corpo
-- versionado é o corpo vivo": duas mudanças foram aplicadas por MCP, direto
-- em produção, e nunca voltaram para o repositório.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🛑 AS DUAS DIVERGÊNCIAS ENTRE O REPOSITÓRIO E O BANCO VIVO
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 DIVERGÊNCIA 1 — `decisores_ao_vivo` NÃO EXISTE EM NENHUM .sql.
-- A …303:13 diz, em comentário, que "`sessao_briefing_ler` ganhou
-- `decisores_ao_vivo`", e o cabeçalho dela declara que as correções foram
-- "APLICADAS EM PRODUÇÃO por MCP; este arquivo é o retrato + o racional".
-- O arquivo contém o corpo de `entrevista_previa_pode`, mas **NÃO** o de
-- `sessao_briefing_ler`. O front-end depende do bloco:
--     src/lib/sessoes-tipos.ts:238        decisores_ao_vivo?: ...
--     src/components/admin/sessoes/briefing.tsx:100
--       const decisores = Array.isArray(b.decisores_ao_vivo) ? ... : [];
-- Chaves declaradas lá: `nome`, `papel_no_negocio`, `principal`; a fonte é
-- `gps.cliente_decisores`. Aplicar o corpo abaixo como está APAGARIA o bloco
-- e a doutora voltaria a conduzir a reunião sem a lista de decisores — que é
-- literalmente o defeito que a …303 chama de "O DEFEITO MAIS SÉRIO DESTA
-- AUDITORIA".
--
-- 🔴 DIVERGÊNCIA 2 — A CHAVE DO DISC É `letra` NO VIVO, `perfil_disc` AQUI.
-- O corpo da …294 (o VERSIONADO) montava `'perfil_disc', v_disc_letra`; o corpo
-- abaixo é o VIVO e já usa `'letra'` — divergência reconciliada em 24/09.
-- O front-end lê `disc.letra`, e documenta que isso foi MEDIDO contra a RPC
-- viva — src/components/admin/sessoes/briefing.tsx:220-230:
--     "🔴 A chave é `letra`, NÃO `perfil_disc`. A RPC sessao_briefing_ler
--      devolve disc_ao_vivo = {letra, consciencia, gatilhos, relacionamento,
--      divergiu, congelado_era, atualizado_em, atualizado_por}"
-- com o registro de que ler a chave errada escondeu o DISC de 127 clientes
-- até a suíte E2E pegar em 22/09. Ou seja: o vivo foi corrigido para `letra`
-- e a correção não voltou para a …294. Aplicar `perfil_disc` reintroduz
-- EXATAMENTE o bug de 22/09 — e `tsc` não pega, porque o JSON chega como
-- `Record<string, unknown>` e chave inexistente é `undefined` em silêncio.
--
-- ── O QUE FAZER ANTES DE APLICAR (5 min, pelo MCP) ────────────────────────
--   select pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'sessao_briefing_ler';
--
-- Com o corpo vivo em mãos, UMA das duas:
--   (a) [preferido] colar o corpo vivo aqui no lugar do corpo abaixo e
--       acrescentar SÓ o bloco `entrevista_previa_ao_vivo` (as 5 declarações
--       `v_ep_*`, o `select ... limit 1` e a chave no `jsonb_build_object`) —
--       os três trechos estão marcados com `…313` e são recortáveis; ou
--   (b) conferir que o vivo bate com o corpo abaixo EXCETO por `letra` e
--       `decisores_ao_vivo`, e então corrigir as duas coisas neste arquivo.
--
-- 🔴 NÃO "consertei" as duas divergências de cabeça. Reescrever de memória o
-- bloco `decisores_ao_vivo` (que eu nunca vi) e trocar `perfil_disc` por
-- `letra` produziria um arquivo VEROSSÍMIL e possivelmente errado, e o erro
-- só apareceria na tela da doutora. Declarar o buraco vale mais que preenchê-lo
-- com texto plausível.
--
-- ⚠️ MESMA ASSINATURA `(uuid)`, de propósito. `create or replace` com
-- assinatura DIFERENTE cria SOBRECARGA em vez de substituir, e o caller antigo
-- continuaria na versão velha. Foi o que a …282 evitou dropando
-- `admin_registrar_export_clientes` de 4 args antes de recriar.
--
-- 🔴 NÃO É `drop function`. É a ÚNICA porta do briefing — `briefing_snapshot`
-- está fora do grant de coluna de `authenticated` (…291 seção 6), então select
-- direto devolve 42501 até para a doutora. Dropar derruba a tela da doutora.
-- `create or replace` PRESERVA o ACL; por isso NENHUM `grant`/`revoke` novo
-- aparece aqui (a prova P4 confere `proacl` em vez de confiar na preservação).
--
-- 🔴 VOLATILE (o padrão), NÃO `stable`: esta função ESCREVE a trilha de acesso
-- em `gps.acessos_log`. `stable` faz o Postgres recusar o INSERT em execução
-- ("INSERT is not allowed in a non-volatile function"). Herdado da …292.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE A FONTE É `gps.entrevista_previa`, E NÃO `briefing.entrevista`
-- ═══════════════════════════════════════════════════════════════════════════
-- Existem DUAS coisas chamadas "entrevista" neste sistema, e confundi-las é o
-- defeito que este cabeçalho existe para impedir:
--
--   · `briefing.entrevista` (dentro do snapshot congelado) vem de
--     `gps.entrevista_gravar` (…266/…268), a esteira de LIGAÇÕES DA EQUIPE,
--     guardada por `gps.eh_equipe()`. Medido: **0 registros**. Essa chave
--     CONTINUA saindo intacta dentro de `briefing` e NÃO é tocada aqui — ela
--     é histórico de outro público, com outra guarda.
--
--   · `gps.entrevista_previa` (…302) é a Entrevista Prévia 2.0 do PARCEIRO,
--     preenchida na ficha do cliente dele: 20-30 perguntas fechadas, DISC
--     automático, trava de decisores. É ESTA que alimenta as 7 partes do
--     script da Reunião Preliminar.
--
-- ── POR QUE AO VIVO, E NÃO DO SNAPSHOT ────────────────────────────────────
-- Não é escolha de estilo: é ordem cronológica. A Entrevista Prévia roda
-- DEPOIS do agendamento POR CONSTRUÇÃO — o parceiro marca a Reunião
-- Preliminar e só então senta com o cliente para responder o formulário. O
-- snapshot é tirado no ato do agendamento (…292:1018), quando a entrevista
-- ainda NÃO EXISTE. Congelar aqui congelaria o vazio, para sempre, sem erro e
-- sem aviso — exatamente o defeito que a …294 corrigiu no DISC.
--
-- Mesma natureza do `disc_ao_vivo`, e por isso o bloco novo é IRMÃO dele na
-- raiz do retorno, NUNCA dentro de `briefing`. `briefing` é o snapshot
-- congelado; enfiar dado ao vivo lá dentro faria a tela ler duas naturezas
-- diferentes pela mesma porta e apagaria a distinção que o snapshot preserva.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- AS 5 PERGUNTAS (PROTOCOLO-SUSTENTABILIDADE)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ESCALA — `limit 1` com `where cliente_id = ? and concluida_em is not
--    null`. Não cresce com a tabela: cresce com o número de entrevistas DE UM
--    cliente. Requisito da …302 é "entrevistas ILIMITADAS", e o pior caso
--    medido em 23/09 foi **4 linhas de um único cliente** (registrado na …306
--    como pendência de produto). A régua de projeto é ≤ 3 linhas por cliente.
--
-- 2) ÍNDICE — 🔴 NENHUM ÍNDICE NOVO, decisão fechada. O índice existente é
--    `idx_entrevista_previa_cliente (cliente_id, criado_em desc)` — conferido
--    na …302:85, não de memória. Ele cobre o `where cliente_id = ?`; o
--    `order by concluida_em desc` NÃO casa com a segunda coluna dele, então
--    o planner vai ordenar. **Esse `Sort` é desprezível e é de propósito:**
--    ordena ≤ 3 linhas (4 no pior caso medido), dentro de uma RPC que já faz
--    3 outras leituras. Um índice `(cliente_id, concluida_em desc)` só para
--    evitar um Sort de 3 linhas cobraria escrita em TODA entrevista salva —
--    e `entrevista_previa_salvar` grava a cada passo do formulário guiado.
--    Custo maior que o ganho. Se um cliente chegar a dezenas de entrevistas
--    concluídas, isto se revisa COM MEDIÇÃO, não por dedução.
--    ⚠️ `criado_em` NÃO serve como ordenação: a entrevista mais NOVA pode
--    estar em rascunho (`concluida_em is null`) enquanto a válida é a
--    anterior. A pergunta é "a última CONCLUÍDA", e a coluna que responde
--    isso é `concluida_em`.
--
-- 3) FREQUÊNCIA — 1 chamada por abertura do briefing. Não há cron, não há
--    polling. Saldo POR TELA: +1 SELECT dentro de uma RPC que o caller já
--    chamava uma vez. Query nova na TELA: ZERO.
--
-- 4) REPETIÇÃO — a tela chama `sessao_briefing_ler` uma vez e recebe tudo num
--    jsonb só. O bloco novo NÃO adiciona endpoint nem fetch no front.
--
-- 5) REVERSÃO — reaplicar o corpo desta migration SEM o bloco
--    `entrevista_previa_ao_vivo` (ou seja, o corpo da …294 + `decisores_ao_
--    vivo` da …303) com `create or replace`. 🔴 NÃO dropar. Nenhuma tabela,
--    coluna, índice, policy ou grant é criado aqui, então não há mais nada a
--    reverter.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O QUE ESTA MIGRAÇÃO **NÃO** TOCA
-- ═══════════════════════════════════════════════════════════════════════════
--   · `gps.sessao_briefing_montar` — intacta. O snapshot continua sendo
--     montado do mesmo jeito, com as mesmas 5 fontes.
--   · `briefing_snapshot` — nenhuma linha existente reescrita (§6.6).
--   · `briefing.entrevista` — a chave da esteira legada sai INTACTA.
--   · RLS de `gps.entrevista_previa` — a policy da …302 fica como está. Esta
--     função é SECURITY DEFINER com `search_path=''`: ela NÃO passa pela RLS,
--     e a guarda real continua sendo o `coalesce(v_admin or responsavel_id =
--     auth.uid(), false)` logo acima, inalterado.
--   · Grants — nenhum `grant`/`revoke`. `create or replace` preserva o ACL.
--   · `src/**` — nada. Esta migration é SQL puro.
--
-- 🔴 `entrevistado` FICA DE FORA do bloco, de propósito. É texto livre digitado
-- pelo parceiro (CHECK só valida tamanho 2-120), não alimenta nenhuma das 7
-- partes do script, e é dado pessoal de um terceiro que não precisa atravessar
-- para a tela da doutora. Menos superfície, mesma utilidade.
-- ═══════════════════════════════════════════════════════════════════════════


create or replace function gps.sessao_briefing_ler(p_agendamento_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_a     record;
  v_disc_letra       text;
  v_disc_consciencia text;
  v_disc_gatilhos    text;
  v_disc_relac       text;
  v_disc_em          timestamptz;
  v_disc_por         uuid;
  v_congelado        text;
  -- …313: última Entrevista Prévia CONCLUÍDA do cliente. Variáveis escalares,
  -- nunca `record`: "não casou linha" é o caso COMUM (cliente sem entrevista)
  -- e `record` não atribuído levanta 55000 ao ler campo — o briefing tem de
  -- abrir de qualquer jeito.
  v_ep_concluida     timestamptz;
  v_ep_letra         text;
  v_ep_pontos        jsonb;
  v_ep_decisores     smallint;
  v_ep_respostas     jsonb;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.estado,
         a.inicio_em, a.briefing_snapshot
    into v_a from gps.sessao_agendamentos a where a.id = p_agendamento_id;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  insert into gps.acessos_log (acao, aluno_id, feito_por, detalhe)
  values ('sessao_briefing_acessado', v_a.aluno_id, auth.uid(),
          'agendamento_id=' || p_agendamento_id::text);

  select c.perfil_disc, c.disc_consciencia, c.disc_gatilhos,
         c.disc_relacionamento, c.disc_atualizado_em, c.disc_atualizado_por
    into v_disc_letra, v_disc_consciencia, v_disc_gatilhos,
         v_disc_relac, v_disc_em, v_disc_por
    from gps.etapa1_clientes c
   where c.id = v_a.cliente_id;

  v_congelado := v_a.briefing_snapshot #>> '{cliente,perfil_disc}';

  -- …313: a última CONCLUÍDA, ordenada por `concluida_em` (a mais nova pode
  -- ser rascunho). Sem índice novo: `idx_entrevista_previa_cliente
  -- (cliente_id, criado_em desc)` cobre o where e o Sort ordena ≤ 3 linhas.
  select e.concluida_em, e.perfil_disc, e.disc_pontos, e.decisores_total, e.respostas
    into v_ep_concluida, v_ep_letra, v_ep_pontos, v_ep_decisores, v_ep_respostas
    from gps.entrevista_previa e
   where e.cliente_id = v_a.cliente_id
     and e.concluida_em is not null
   order by e.concluida_em desc
   limit 1;

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado', v_a.estado,
    'inicio_em', v_a.inicio_em,
    'cliente_id', v_a.cliente_id,
    'briefing', v_a.briefing_snapshot,
    'disc_ao_vivo', jsonb_build_object(
      'letra', v_disc_letra,
      'consciencia', v_disc_consciencia,
      'gatilhos', v_disc_gatilhos,
      'relacionamento', v_disc_relac,
      'atualizado_em', v_disc_em,
      'atualizado_por', v_disc_por,
      'congelado_era', v_congelado,
      'divergiu', (v_disc_letra is distinct from v_congelado)))
    || jsonb_build_object('decisores_ao_vivo', coalesce(
         (select jsonb_agg(jsonb_build_object(
                   'nome', d.nome, 'papel_no_negocio', d.papel_no_negocio,
                   'principal', d.principal)
                 order by d.principal desc, d.criado_em)
            from gps.cliente_decisores d where d.cliente_id = v_a.cliente_id),
         '[]'::jsonb))
    -- …313: irmã de `disc_ao_vivo`, nunca dentro de `briefing` (o snapshot é
    -- tirado no agendamento; a entrevista roda depois por construção).
    -- `entrevistado` (texto livre) fica de fora: não alimenta o script.
    || jsonb_build_object('entrevista_previa_ao_vivo',
         case when v_ep_concluida is null then null::jsonb
              else jsonb_build_object(
                'concluida_em',    v_ep_concluida,
                'perfil_disc',     v_ep_letra,
                'disc_pontos',     v_ep_pontos,
                'decisores_total', v_ep_decisores,
                'respostas',       v_ep_respostas)
         end);
end;
$function$;

comment on function gps.sessao_briefing_ler(uuid) is
  'Briefing que a equipe abre antes da sessao. Guarda: admin OU responsavel_id = auth.uid(), com coalesce(..., false). Grava trilha LGPD sessao_briefing_acessado a cada leitura (por isso a tela NAO memoiza). Devolve o snapshot do agendamento (briefing) + tres blocos AO VIVO, irmaos na raiz: disc_ao_vivo (letra/consciencia/gatilhos/relacionamento da ficha -- decisao de 22/09: o DISC e do CLIENTE e nunca do snapshot), decisores_ao_vivo (gps.cliente_decisores, aplicado por MCP em 23/09) e, desde a ...313 (24/09/2026), entrevista_previa_ao_vivo: a ULTIMA Entrevista Previa CONCLUIDA do cliente (concluida_em, perfil_disc, disc_pontos, decisores_total, respostas) ou null. Ao vivo porque a entrevista roda DEPOIS do agendamento por construcao; a chave briefing.entrevista do snapshot e a esteira legada da Etapa 01 (0 registros) e nao deve ser lida. entrevistado (texto livre) fica de fora. Sem indice novo: idx_entrevista_previa_cliente cobre o where e o Sort ordena <= 3 linhas.';

-- ⚠️ OS GRANTS NÃO SÃO RECONCEDIDOS AQUI, de propósito: `create or replace`
-- PRESERVA o ACL da função existente, e a …292 já fez
-- `revoke all ... from public, anon` + `grant execute to authenticated`.
-- Escrever os dois de novo seria inofensivo, mas daria a impressão de que a
-- função está NASCENDO agora — e ela não está, está sendo substituída em
-- produção. A prova P4 confere que o ACL continua `authenticated=X` sem
-- `anon=X`, em vez de confiar na preservação.
--
-- 🔴 Se algum dia esta função for DROPADA e recriada, os dois comandos voltam
-- a ser OBRIGATÓRIOS: neste projeto toda função nova nasce com `execute` para
-- `authenticated` (ALTER DEFAULT PRIVILEGES do schema `gps`), e `revoke from
-- anon` sozinho NÃO pega quando a permissão vem de `PUBLIC` — por isso todo
-- revoke deste pacote nomeia `public` explicitamente.


-- ═══════════════════════════════════════════════════════════════════════════
-- 🧪 ROTEIRO DE PROVA — para o Marcio rodar pelo MCP DEPOIS do apply
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ O EXECUTOR (victor) NÃO RODOU NADA DISTO — sem `psql`, sem credencial.
-- O orquestrador RODOU P1–P6 pelo MCP em 24/09 depois do apply; os resultados
-- estão no bloco "APLICADA" no fim do arquivo. O roteiro fica como está para
-- quem precisar repetir.
--
-- 🔴 NENHUM NÚMERO DE PLANO ESTÁ PRÉ-PREENCHIDO. Plano de `explain` previsto
-- de cabeça erra o TIPO de scan (18/09: previu `Index Scan`, era `Seq Scan`
-- numa tabela de 4 linhas), e colar plano fabricado como "expectativa"
-- contamina a leitura seguinte.
--
-- 🔴 `explain (analyze)` EXECUTA o comando. Esta RPC ESCREVE (o INSERT da
-- trilha). P1 e P2 abaixo GRAVAM em `gps.acessos_log`: rodar SEMPRE dentro de
-- `begin … rollback`. Nunca cru em produção.
--
-- ── 🛑 P-ZERO — A PROVA QUE VEM ANTES DE TODAS (as duas divergências) ─────
-- Rodar ANTES do apply. Se esta prova não for feita, as outras não valem.
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'sessao_briefing_ler';
--
--   -- atalho para as duas divergências, sem ler o corpo inteiro:
--   select
--     pg_get_functiondef(p.oid) like '%decisores_ao_vivo%' as tem_decisores,
--     pg_get_functiondef(p.oid) like '%''letra''%'         as usa_chave_letra,
--     pg_get_functiondef(p.oid) like '%''perfil_disc'', v_disc_letra%'
--                                                        as usa_chave_perfil_disc
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'sessao_briefing_ler';
--
--   -- ESPERADO pelo que o front-end afirma ter MEDIDO em 22-23/09:
--   --   tem_decisores = true · usa_chave_letra = true ·
--   --   usa_chave_perfil_disc = false
--   -- Se for isso, o corpo deste arquivo está DESATUALIZADO em 2 pontos e
--   -- precisa ser reconciliado (cabeçalho) ANTES do apply.
--   -- Se vier o contrário (sem decisores, com perfil_disc), então o front-end
--   -- é que está lendo chave inexistente hoje — achado próprio, avisar antes
--   -- de mexer.
--
-- ── P0 — ACHAR OS DOIS AGENDAMENTOS DE TESTE ──────────────────────────────
-- Precisa de DOIS: um cujo cliente TEM entrevista concluída e um que NÃO tem.
--
--   -- (a) com entrevista concluída:
--   select a.id as agendamento_id, a.cliente_id, e.concluida_em
--     from gps.sessao_agendamentos a
--     join gps.entrevista_previa e on e.cliente_id = a.cliente_id
--    where e.concluida_em is not null
--    order by e.concluida_em desc
--    limit 3;
--
--   -- (b) sem entrevista concluída:
--   select a.id as agendamento_id, a.cliente_id
--     from gps.sessao_agendamentos a
--    where not exists (
--            select 1 from gps.entrevista_previa e
--             where e.cliente_id = a.cliente_id
--               and e.concluida_em is not null)
--    limit 3;
--
-- ⚠️ Se (a) não devolver nada: medido em 23/09 a tabela tinha 4 linhas de UM
-- cliente só, e pode não haver agendamento desse cliente. Nesse caso, criar o
-- par em transação com `rollback` (entrevista + agendamento) e medir ali —
-- NÃO pular a prova, e NÃO inventar o resultado.
--
-- ── P1 — O PLANO, COM A RPC INTEIRA, EM ROLLBACK ──────────────────────────
-- 🔴 A RPC INTEIRA, não o select isolado. Medir só o `select ... from
-- entrevista_previa` mede um SELECT que ninguém chama — o que importa é o
-- custo do briefing como a doutora o paga, com os 4 acessos e o INSERT da
-- trilha dentro.
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid-do-admin>","role":"authenticated"}';
--
--   explain (analyze, buffers)
--     select gps.sessao_briefing_ler('<agendamento_id de P0-a>');
--
--   rollback;
--
-- O QUE CONFERIR no plano:
--   · o INSERT da trilha aparece (a função é VOLATILE e escreve);
--   · `Execution Time` total — comparar com o mesmo `explain` de um
--     agendamento de P0-b (sem entrevista): a diferença é o custo do bloco
--     novo, e é o único número que interessa;
--   · 🔴 NÃO exigir `Index Scan` em `entrevista_previa`. A tabela tem
--     unidades de linhas; `Seq Scan` + `Sort` ali é o plano CERTO do planner
--     e NÃO é regressão. O que seria regressão: `Rows Removed by Filter` na
--     casa dos milhares, ou `Execution Time` saltando de ms para centenas.
--
-- ── P2 — A TRILHA: +1 POR LEITURA, E A PRÓPRIA PROVA EM ROLLBACK ──────────
-- A trilha É a guarda de LGPD desta função. Se o bloco novo a tivesse
-- deslocado ou quebrado, uma leitura de dado pessoal passaria sem registro.
--
--   -- antes (fora de transação, só leitura):
--   select count(*) from gps.acessos_log where acao = 'sessao_briefing_acessado';
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid-do-admin>","role":"authenticated"}';
--
--   select gps.sessao_briefing_ler('<agendamento_id de P0-a>');
--   select count(*) from gps.acessos_log where acao = 'sessao_briefing_acessado';
--   -- ESPERADO: exatamente antes + 1.
--
--   rollback;
--
--   -- depois do rollback (fora da transação):
--   select count(*) from gps.acessos_log where acao = 'sessao_briefing_acessado';
--   -- ESPERADO: de volta ao valor "antes" — a leitura de prova NÃO persiste.
--
-- ⚠️ Se o valor depois do rollback for "antes + 1", algo fora da transação
-- gravou (outra aba, outro usuário). Repetir com o sistema ocioso.
--
-- ── P3 — O JSON: O CASO COM E O CASO SEM ──────────────────────────────────
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid-do-admin>","role":"authenticated"}';
--
--   -- (a) COM entrevista concluída:
--   select jsonb_pretty(
--            gps.sessao_briefing_ler('<agendamento_id de P0-a>')
--              -> 'entrevista_previa_ao_vivo');
--   -- ESPERADO: objeto com EXATAMENTE 5 chaves — concluida_em, perfil_disc,
--   -- disc_pontos, decisores_total, respostas.
--   -- 🔴 `entrevistado` NÃO PODE APARECER. Se aparecer, o corpo aplicado não
--   -- é este.
--
--   -- quantas perguntas vieram:
--   select count(*)
--     from jsonb_object_keys(
--            gps.sessao_briefing_ler('<agendamento_id de P0-a>')
--              -> 'entrevista_previa_ao_vivo' -> 'respostas');
--   -- ESPERADO: ~24 a 30 (o roteiro da …302 é de 20-30 perguntas fechadas).
--   -- ⚠️ Número MUITO menor indica entrevista concluída com o formulário
--   -- parcialmente respondido — é dado, não bug desta migration. Registrar
--   -- o número real, não arredondar para o esperado.
--
--   -- (b) SEM entrevista concluída:
--   select gps.sessao_briefing_ler('<agendamento_id de P0-b>')
--            -> 'entrevista_previa_ao_vivo';
--   -- ESPERADO: null (JSON null), e a chamada NÃO levanta erro.
--
--   -- (c) A ESTEIRA LEGADA CONTINUA INTACTA:
--   select gps.sessao_briefing_ler('<agendamento_id de P0-a>')
--            -> 'briefing' -> 'entrevista';
--   -- ESPERADO: exatamente o que era ANTES do apply (a esteira da equipe tem
--   -- 0 registros, então tipicamente null ou objeto vazio). Se este valor
--   -- mudou, a migration tocou o que não devia.
--
--   -- (d) as chaves da raiz, todas:
--   select jsonb_object_keys(
--            gps.sessao_briefing_ler('<agendamento_id de P0-a>'));
--   -- ESPERADO: agendamento_id, estado, inicio_em, cliente_id, briefing,
--   -- disc_ao_vivo, decisores_ao_vivo, entrevista_previa_ao_vivo — 8 chaves.
--   -- 🛑 ESTA É A PROVA DA DIVERGÊNCIA 1. `decisores_ao_vivo` tem de estar
--   -- AQUI DEPOIS do apply. Se sumiu, o apply usou o corpo deste arquivo sem
--   -- reconciliar com o vivo: REVERTER na hora (reaplicar o corpo salvo no
--   -- P-ZERO) — a doutora está sem a lista de decisores.
--   -- 🛑 E a DIVERGÊNCIA 2, no mesmo fôlego:
--   select gps.sessao_briefing_ler('<agendamento_id de P0-a>')
--            -> 'disc_ao_vivo' ? 'letra';
--   -- ESPERADO: true. Se vier false (e `? 'perfil_disc'` vier true), o bug
--   -- de 22/09 voltou: a tela mostra "Perfil DISC ainda não informado" para
--   -- os 127 clientes que TÊM a letra. REVERTER.
--
--   rollback;
--
-- ── P4 — ACL INALTERADO (o `create or replace` preservou?) ────────────────
--   select p.proname, pg_get_userbyid(p.proowner) as dono, p.proacl
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'sessao_briefing_ler';
--   -- ESPERADO: `authenticated=X` presente, `anon=X` AUSENTE, `=X` (PUBLIC)
--   -- AUSENTE. Comparar caractere a caractere com o valor de antes do apply
--   -- — tirar o print ANTES de aplicar.
--
-- ── P5 — UMA ASSINATURA SÓ (sem sobrecarga acidental) ─────────────────────
--   select p.oid::regprocedure as assinatura,
--          pg_get_function_arguments(p.oid) as args
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'sessao_briefing_ler';
--   -- ESPERADO: **1 linha**, `gps.sessao_briefing_ler(uuid)`.
--   -- 🔴 2 linhas = `create or replace` criou SOBRECARGA em vez de
--   -- substituir, e a tela pode continuar chamando a versão velha. Nesse
--   -- caso dropar a assinatura ERRADA (nunca a de 1 uuid) e reaplicar.
--
-- ── P6 — A GUARDA NÃO AFROUXOU ────────────────────────────────────────────
-- O bloco novo lê `gps.entrevista_previa`, que é dado pessoal do cliente do
-- parceiro, dentro de SECURITY DEFINER (não passa por RLS). A única coisa que
-- protege é a guarda inalterada lá em cima.
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid-de-um-parceiro-QUE-NAO-E-responsavel>","role":"authenticated"}';
--   select gps.sessao_briefing_ler('<agendamento_id de P0-a>');
--   -- ESPERADO: 42501 "Sem permissão." — e NENHUMA linha de entrevista
--   -- atravessou.
--   rollback;
--
--   begin;
--   set local role anon;
--   select gps.sessao_briefing_ler('<agendamento_id de P0-a>');
--   -- ESPERADO: erro de permissão de EXECUTE (a função não é executável por
--   -- anon). Se executar e levantar 42501 de dentro, também está correto —
--   -- o que NÃO pode é devolver JSON.
--   rollback;
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- APLICADA em 24/09/2026 ~15:58 UTC (apply_migration, sucesso), corpo montado
-- sobre o pg_get_functiondef VIVO (P-ZERO cumprido: `decisores_ao_vivo` e a
-- chave `letra` preservados). Provas em begin … rollback com claims de admin:
--   P1 explain (analyze, buffers) da RPC INTEIRA (Function Scan):
--      agendamento com entrevista concluída → Execution 10,906 ms, shared hit=549
--      agendamento sem entrevista           → Execution  4,104 ms, shared hit=18
--   P2 acessos_log 'sessao_briefing_acessado': 50 antes → 54 durante (4 chamadas
--      de prova) → 50 depois do rollback.
--   P3-a JSON com entrevista: chaves raiz = estado, briefing, inicio_em, cliente_id,
--      disc_ao_vivo, agendamento_id, decisores_ao_vivo, entrevista_previa_ao_vivo;
--      entrevista_previa_ao_vivo = {respostas, disc_pontos, perfil_disc,
--      concluida_em, decisores_total}; respostas com 24 chaves (entrevista de
--      23/09, anterior às 30); disc_ao_vivo.letra presente; decisores_ao_vivo array.
--   P3-b JSON sem entrevista: chave presente com valor null; decisores array.
--   P4 proacl {postgres,authenticated,service_role} inalterado.
--   P5 1 assinatura (sem sobrecarga).
-- ---------------------------------------------------------------------------
--   P6 guarda (em rollback, com claims reais): titular de OUTRO ambiente, não
--      responsável → 42501 "Sem permissão."; o responsável → ok (8 chaves na
--      raiz); sem JWT → 42501; has_function_privilege('anon', …, 'execute') =
--      false. Sobre os tempos de P1: 549 × 18 buffers são DOIS agendamentos
--      diferentes e a 1ª execução do plpgsql — o absoluto (≤ 11 ms) é o que
--      vale; a diferença NÃO mede o custo do bloco novo.
-- ---------------------------------------------------------------------------
