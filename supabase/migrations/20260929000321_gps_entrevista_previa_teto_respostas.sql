-- ═══════════════════════════════════════════════════════════════════════════
-- Entrevista Prévia 3.0 — TETO NO BANCO para `respostas` (achado MÉDIO do
-- kirad, pentest de 29/09/2026).
--
-- ✅ APLICADA em 29/09/2026 pelo orquestrador, depois do veredito do joao, e
-- registrada em schema_migrations pela versão do arquivo. P0 = 0 linhas fora
-- do formato; P1 provado antes e depois de aplicar (recusas 22023 em português,
-- 0,34 ms/update, zero resíduo).
--
-- ── O ACHADO ────────────────────────────────────────────────────────────────
-- `gps.entrevista_previa_salvar(uuid, jsonb)` e `gps.entrevista_previa_
-- concluir(uuid, jsonb, text, jsonb, text, text, text, jsonb)` têm EXECUTE para
-- `authenticated`. O parceiro chama direto pelo PostgREST com o próprio JWT e
-- grava em `respostas` jsonb de vários MB, chaves arbitrárias e
-- `frases_cliente` sem teto. Tudo vai inteiro para o navegador da doutora por
-- `gps.sessao_briefing_ler`. O limite de 3 frases × 150 e a allowlist de
-- chaves existiam só no TypeScript (`src/lib/entrevista-previa-fluxo.ts`).
--
-- ── 🔑 POR QUE TRIGGER, E NÃO RECRIAR AS DUAS FUNÇÕES ───────────────────────
-- O pedido foi recriar `_salvar` e `_concluir` a partir do corpo VIVO. Sem
-- acesso ao banco, o executor só tinha um RESUMO em prosa dos corpos — e
-- recriar função a partir de corpo que não é o vivo já causou regressão nesta
-- casa (`…312`: `plantao_inscrever` perdeu a checagem ao vivo). Um trigger
-- BEFORE na TABELA:
--   • cobre as DUAS funções (e qualquer escrita futura em `respostas`), sem
--     tocar em uma linha delas — guarda, `search_path`, grants, `for update`,
--     mensagens e assinatura ficam exatamente como estão;
--   • não cria sobrecarga nem muda assinatura;
--   • reverte com um `drop trigger`.
-- O erro sobe de dentro do `update` da RPC com errcode 22023 e mensagem em
-- português — o mesmo caminho das travas que já existem.
--
-- ── O QUE A TRAVA EXIGE (em toda escrita de `respostas`) ───────────────────
--   1. objeto jsonb                       'Respostas em formato inválido.'
--   2. pg_column_size ≤ 16384 bytes       'Respostas grandes demais.'
--   3. toda chave ~ '^[a-z_]{1,40}$'      'Respostas com chave inválida.'
--   4. todo valor é STRING (formato 3.0: única = id, múltipla = "a|b",
--      frases = uma por linha)           'Respostas em formato inválido.'
--   5. valor comum com até 500 caracteres 'Resposta grande demais.'
--      (a múltipla mais longa, `obs_comportamento` com os 12 itens, tem 153)
--   6. `frases_cliente`: até 3 linhas     'Anote no máximo 3 frases do cliente.'
--      e cada linha até 150 caracteres    'Cada frase do cliente pode ter até 150 caracteres.'
-- As frases 1, 6 e 7 são as MESMAS do TypeScript (`validarFrases`), para a
-- tela mostrar a mesma frase venha a recusa de onde vier.
--
-- ⚠️ Conferir ANTES de aplicar (item 4): as linhas EXISTENTES não são
-- revalidadas (trigger só roda em escrita), mas um rascunho antigo aberto de
-- novo passa pelo trigger no próximo `salvar`. Se alguma tiver valor não-string,
-- o `salvar` dela vai recusar. Query de conferência no bloco PROVAS (P0).
--
-- ── OS 3 TEXTOS DO RELATÓRIO (`p_consciencia/_gatilhos/_relacionamento`) ───
-- Já têm CHECK na ficha (`…294`: `char_length(btrim(x)) between 3 and 2000`),
-- mas o CHECK mede o texto APARADO: 2000 caracteres + megabytes de espaço
-- passam. Aqui entra um CHECK adicional sobre o texto CRU, `NOT VALID` (não
-- revarre as 1.6k linhas nem trava o apply por linha antiga; vale para toda
-- escrita nova). As telas que escrevem esses campos já aparam antes
-- (`cliente-ficha.tsx`, `gerarRelatorio` corta em 1950), então texto legítimo
-- não muda de comportamento. `P0` conta quem violaria; se der 0, dá para
-- `validate constraint` depois.
-- `papel`/`nome` dos decisores: já limitados por `chk_cliente_decisores_*`
-- (≤ 200, `…262`) e pelo `left(…, 120)` da própria RPC.
--
-- ── REVERSÃO ────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_entrevista_previa_validar_respostas on gps.entrevista_previa;
--   drop function if exists gps.entrevista_previa_validar_respostas();
--   alter table gps.etapa1_clientes
--     drop constraint if exists chk_etapa1_clientes_disc_consciencia_cru,
--     drop constraint if exists chk_etapa1_clientes_disc_gatilhos_cru,
--     drop constraint if exists chk_etapa1_clientes_disc_relacionamento_cru;
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.entrevista_previa_validar_respostas()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_chave  text;
  v_valor  jsonb;
  v_texto  text;
  v_linhas text[];
  v_linha  text;
begin
  if new.respostas is null or jsonb_typeof(new.respostas) <> 'object' then
    raise exception 'Respostas em formato inválido.' using errcode = '22023';
  end if;

  -- Antes de iterar: um jsonb de MB não chega a ser percorrido.
  if pg_column_size(new.respostas) > 16384 then
    raise exception 'Respostas grandes demais.' using errcode = '22023';
  end if;

  for v_chave, v_valor in select e.key, e.value from jsonb_each(new.respostas) e
  loop
    if v_chave !~ '^[a-z_]{1,40}$' then
      raise exception 'Respostas com chave inválida.' using errcode = '22023';
    end if;
    if jsonb_typeof(v_valor) <> 'string' then
      raise exception 'Respostas em formato inválido.' using errcode = '22023';
    end if;

    v_texto := v_valor #>> '{}';

    if v_chave = 'frases_cliente' then
      v_linhas := string_to_array(v_texto, E'\n');
      if coalesce(array_length(v_linhas, 1), 0) > 3 then
        raise exception 'Anote no máximo 3 frases do cliente.' using errcode = '22023';
      end if;
      foreach v_linha in array coalesce(v_linhas, '{}'::text[])
      loop
        if char_length(v_linha) > 150 then
          raise exception 'Cada frase do cliente pode ter até 150 caracteres.' using errcode = '22023';
        end if;
      end loop;
    elsif char_length(v_texto) > 500 then
      raise exception 'Resposta grande demais.' using errcode = '22023';
    end if;
  end loop;

  -- `disc_pontos` (reauditoria do kirad, 29/09): mesma classe de `respostas`.
  -- `_concluir` grava `p_disc_pontos` sem validar, e o briefing devolve ao
  -- navegador da doutora. Formato provado nas 8 linhas existentes (P0 = 0 fora):
  -- objeto com chaves D/I/S/C e valores numéricos entre 0 e 1000.
  if new.disc_pontos is not null and (
       jsonb_typeof(new.disc_pontos) <> 'object'
       or exists (select 1 from jsonb_each(new.disc_pontos) e
                   where e.key not in ('D','I','S','C')
                      or jsonb_typeof(e.value) <> 'number'
                      or (e.value #>> '{}')::numeric not between 0 and 1000)) then
    raise exception 'Pontuação do perfil em formato inválido.' using errcode = '22023';
  end if;

  return new;
end $$;

comment on function gps.entrevista_previa_validar_respostas() is
  'Trigger BEFORE INSERT/UPDATE OF respostas, disc_pontos em gps.entrevista_previa (…321, achado do kirad 29/09): objeto, ≤16384 bytes, chaves ^[a-z_]{1,40}$, valores string (≤500; frases_cliente ≤3 linhas de ≤150); disc_pontos objeto D/I/S/C numérico 0..1000. Cobre entrevista_previa_salvar e _concluir sem recriá-las. 22023 em português.';

-- Função de trigger não é endpoint, mas nasce com EXECUTE para PUBLIC.
revoke all on function gps.entrevista_previa_validar_respostas() from public, anon, authenticated;

drop trigger if exists trg_entrevista_previa_validar_respostas on gps.entrevista_previa;
create trigger trg_entrevista_previa_validar_respostas
  before insert or update of respostas, disc_pontos on gps.entrevista_previa
  for each row execute function gps.entrevista_previa_validar_respostas();

-- Os 3 textos do relatório: teto sobre o texto CRU (o CHECK da …294 mede o
-- aparado). NOT VALID: não revarre a tabela; vale para toda escrita nova.
alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_disc_consciencia_cru;
alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_disc_consciencia_cru
  check (disc_consciencia is null or char_length(disc_consciencia) <= 2000) not valid;

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_disc_gatilhos_cru;
alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_disc_gatilhos_cru
  check (disc_gatilhos is null or char_length(disc_gatilhos) <= 2000) not valid;

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_disc_relacionamento_cru;
alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_disc_relacionamento_cru
  check (disc_relacionamento is null or char_length(disc_relacionamento) <= 2000) not valid;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS — rodar ANTES e DEPOIS de aplicar. NÃO RODADAS por quem escreveu.
-- 🔴 O MCP é AUTOCOMMIT: `begin`/`rollback` em chamadas separadas não protege.
-- Por isso tudo que escreve está num `do $$ … $$` que TERMINA EM EXCEÇÃO —
-- a exceção desfaz tudo, e a mensagem dela traz o resultado.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- P0 (antes de aplicar, só leitura) — nada existente quebraria:
--   select count(*) filter (where exists (
--            select 1 from jsonb_each(e.respostas) x
--             where x.key !~ '^[a-z_]{1,40}$' or jsonb_typeof(x.value) <> 'string')) as fora_do_formato,
--          count(*) filter (where pg_column_size(e.respostas) > 16384)           as grandes,
--          count(*) filter (where e.concluida_em is null)                         as rascunhos
--     from gps.entrevista_previa e;
--   -- ESPERADO: fora_do_formato = 0, grandes = 0.
--   select count(*) filter (where char_length(disc_consciencia)    > 2000) c,
--          count(*) filter (where char_length(disc_gatilhos)       > 2000) g,
--          count(*) filter (where char_length(disc_relacionamento) > 2000) r
--     from gps.etapa1_clientes;
--   -- ESPERADO: 0/0/0 (então dá para `validate constraint` nas três).
--
-- P1 (depois de aplicar) — válido passa, os 4 abusos são recusados, e o custo:
--   do $$
--   declare
--     v_cli uuid; v_id uuid; v_ok text := ''; v_t0 timestamptz; v_ms numeric;
--     v_valido jsonb := jsonb_build_object(
--       'motivo_busca','medo_futuro','bens','imovel_uso|empresa',
--       'obs_comportamento','interrompeu|urgencia_controle|entusiasmo|citou_pessoas|cautela|familia|muitas_perguntas|numeros|consulta_terceiro|falou_preco|desconfianca|evitou_assunto',
--       'agendamento_preliminar','nao_agendou','agendamento_motivo','cliente_ve_agenda',
--       'frases_cliente', repeat('a',150) || E'\n' || repeat('b',150) || E'\n' || repeat('c',150));
--   begin
--     select id into v_cli from gps.etapa1_clientes limit 1;
--     insert into gps.entrevista_previa (cliente_id, aluno_id, respostas)
--       select v_cli, c.aluno_id, v_valido from gps.etapa1_clientes c where c.id = v_cli
--       returning id into v_id;
--     v_ok := v_ok || 'valido=ok ';
--
--     begin update gps.entrevista_previa set respostas = jsonb_build_object('x', repeat('z', 20000)) where id = v_id;
--       v_ok := v_ok || '20KB=PASSOU(ERRO) ';
--     exception when sqlstate '22023' then v_ok := v_ok || '20KB=' || sqlerrm || ' '; end;
--
--     begin update gps.entrevista_previa set respostas = jsonb_build_object('Chave-Ruim', 'a') where id = v_id;
--       v_ok := v_ok || 'chave=PASSOU(ERRO) ';
--     exception when sqlstate '22023' then v_ok := v_ok || 'chave=' || sqlerrm || ' '; end;
--
--     begin update gps.entrevista_previa set respostas = jsonb_build_object('frases_cliente', E'a\nb\nc\nd') where id = v_id;
--       v_ok := v_ok || '4frases=PASSOU(ERRO) ';
--     exception when sqlstate '22023' then v_ok := v_ok || '4frases=' || sqlerrm || ' '; end;
--
--     begin update gps.entrevista_previa set respostas = jsonb_build_object('frases_cliente', repeat('x',151)) where id = v_id;
--       v_ok := v_ok || '151=PASSOU(ERRO) ';
--     exception when sqlstate '22023' then v_ok := v_ok || '151=' || sqlerrm || ' '; end;
--
--     begin update gps.entrevista_previa set respostas = jsonb_build_object('bens', jsonb_build_array('empresa')) where id = v_id;
--       v_ok := v_ok || 'array=PASSOU(ERRO) ';
--     exception when sqlstate '22023' then v_ok := v_ok || 'array=' || sqlerrm || ' '; end;
--
--     -- Custo: 1000 updates válidos (a guarda é em memória; o update em si domina).
--     v_t0 := clock_timestamp();
--     for i in 1..1000 loop
--       update gps.entrevista_previa set respostas = v_valido where id = v_id;
--     end loop;
--     v_ms := extract(epoch from clock_timestamp() - v_t0) * 1000 / 1000;
--     v_ok := v_ok || 'ms_por_update=' || round(v_ms, 3);
--
--     raise exception 'PROVA (desfeita): %', v_ok;
--   end $$;
--   -- ESPERADO: valido=ok e as 5 recusas com a frase em português; a
--   -- exceção final DESFAZ o insert e os updates (conferir depois:
--   -- select count(*) from gps.entrevista_previa where respostas ? 'frases_cliente'
--   --   and respostas->>'frases_cliente' like 'aaaa%';  → 0).
--
-- P2 — pela RPC, com JWT real de parceiro (mesmo formato do P1: `do` que
-- termina em exceção), chamar `gps.entrevista_previa_salvar(<id em aberto do
-- cliente de QA>, '{"x":"<20 KB>"}')` → 22023 'Respostas grandes demais.'
