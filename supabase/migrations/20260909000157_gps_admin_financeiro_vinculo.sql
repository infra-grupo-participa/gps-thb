-- Central de resolução — vincular o contrato financeiro ao ambiente (B-F1, A).
--
-- ⚠️⚠️ ESTA É A ÚNICA PEÇA DA RODADA QUE ESCREVE FORA DO SCHEMA `gps`.
--   Ela preenche `cs.contatos_hm.aluno_id` — tabela do `sip`. Autorizada pelo
--   orquestrador em 09/09/2026 (B-F1, opção A, "mínima"), com M1 e M2 medidos:
--     M1: `cs.contatos_hm.comprador_id → public.compradores(id)`, e
--         `public.compradores` tem `email` e `documento`. Existe casamento.
--         Medido: 193 contratos órfãos; 18 casam por e-mail com alunos do GPS
--         (os mesmos 18 por documento); 10 ambientes sem financeiro têm
--         candidato.
--     M2: `cs.contatos_hm` tem 10 triggers (trg_hm_a_dono_por_aba,
--         trg_hm_b_congela_comercial, trg_hm_c_trava_coluna_hotmart,
--         trg_hm_cancelamento_avisa, trg_hm_carimba_equipe_padrao,
--         trg_hm_revisar_nome_invalido, trg_hm_revogacao,
--         trg_hm_revogacao_espelho, trg_hm_sincroniza_cards_irmaos,
--         trg_hm_sync_responsavel). Elas rodam com os privilégios do dono
--         desta função. O que esse UPDATE de UMA coluna dispara é o que o
--         bloco de conferência da rodada mede EM TRANSAÇÃO COM ROLLBACK,
--         contando linhas alteradas em OUTRAS tabelas, ANTES de liberar.
--
-- POR QUE EXISTE
--   31 dos 125 ambientes não têm contrato ligado (B7). O aluno vê "Financeiro
--   não disponível para este cadastro" e o admin vê o diagnóstico e NÃO TEM O
--   QUE FAZER: hoje isso só se resolve com SQL manual no banco do sip.
--
-- AS QUATRO TRAVAS (e por que a terceira mora no UPDATE, não no `if`)
--   1. o contrato tem de estar ÓRFÃO — e o `and aluno_id is null` está DENTRO
--      do `update`, não só na conferência prévia: dois admins clicando ao mesmo
--      tempo, ou uma carga do sip entre a leitura e o clique, e o `if` já teria
--      passado. Zero linha afetada = erro, nunca sucesso silencioso;
--   2. o comprador do contrato tem de casar por E-MAIL ou por DOCUMENTO com o
--      cadastro do ambiente. O admin não escolhe um contrato qualquer da base
--      do sip;
--   3. um id EXPLÍCITO, escolhido na tela. Nada de "vincular o mais provável";
--   4. `public.gp_is_admin()` na primeira linha das três funções.
--   A regra de casamento vive em UMA função (`gps.financeiro_candidatos_do_aluno`)
--   usada pela listagem E pela verificação do vínculo — se fossem duas cópias,
--   o dia em que uma mudasse o admin veria uma lista e o banco aceitaria outra.
--
-- O QUE NÃO FAZ
--   * não cria contrato, não altera valor, parcela, produto, plano, turma,
--     status, cancelamento nem QUALQUER outra coluna de `cs.*` — só `aluno_id`;
--   * não apaga nada;
--   * não toca as views do sip (cs.vw_hm_financeiro / cs.vw_hm_extrato leem por
--     contato_hm_id, que não muda);
--   * não devolve o documento completo do comprador: só os 4 últimos dígitos,
--     o suficiente para o admin conferir e o mínimo para não virar consulta de
--     CPF alheio pela tela do portal.
--
-- REVERSÃO
--   gps.admin_financeiro_desvincular desfaz um vínculo (e registra no log).
--   Para remover o caminho:
--     drop function if exists gps.admin_financeiro_desvincular(uuid, text);
--     drop function if exists gps.admin_financeiro_vincular(uuid, text);
--     drop function if exists gps.admin_financeiro_candidatos(uuid);
--     drop function if exists gps.financeiro_candidatos_do_aluno(uuid);

-- ─────────────────────────────────────────────────────────────────────────
-- 0) GATE DE COLUNA — aborta alto em vez de criar função quebrada
--
-- O agente que escreveu esta migração não tem banco (regra do projeto,
-- docs/audits/2026-09-08-9-features/9-features.md §A.5). Os nomes abaixo vêm
-- da medição M1 do orquestrador e do que `gps.financeiro_do_aluno` (…140) já
-- lê. Se algum não existir, a função nasceria com erro só na PRIMEIRA CHAMADA,
-- em produção, na tela do admin. Este bloco antecipa isso para o momento da
-- aplicação, dizendo exatamente qual coluna falta.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_faltando text[] := '{}';
  r record;
begin
  for r in
    select * from (values
      ('cs',     'contatos_hm', 'id'),
      ('cs',     'contatos_hm', 'aluno_id'),
      ('cs',     'contatos_hm', 'comprador_id'),
      ('cs',     'contatos_hm', 'produto'),
      ('cs',     'contatos_hm', 'plano'),
      ('cs',     'contatos_hm', 'turma'),
      ('cs',     'contatos_hm', 'valor_total'),
      ('cs',     'contatos_hm', 'criado_em'),
      ('public', 'compradores', 'id'),
      ('public', 'compradores', 'email'),
      ('public', 'compradores', 'documento')
    ) as t(esquema, tabela, coluna)
  loop
    if not exists (
      select 1 from information_schema.columns c
       where c.table_schema = r.esquema and c.table_name = r.tabela
         and c.column_name = r.coluna
    ) then
      v_faltando := v_faltando || (r.esquema || '.' || r.tabela || '.' || r.coluna);
    end if;
  end loop;

  if array_length(v_faltando, 1) is not null then
    raise exception
      'Colunas ausentes para o vinculo financeiro: %. Ajuste os nomes NESTA migracao (e so nela) e reaplique -- migracao abortada para nao criar funcao que so falha na tela do admin.',
      array_to_string(v_faltando, ', ');
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) A REGRA DE CASAMENTO — um lugar só
--
-- SEM grant para `authenticated`: é peça interna, chamada pelas três funções
-- abaixo (que são SECURITY DEFINER do mesmo dono). Não aparece no PostgREST,
-- então não há superfície nova para sondar.
-- SEM `limit`: o teto de exibição é da listagem. Se o limite morasse aqui, um
-- candidato legítimo fora do top 5 seria recusado no vínculo com a mensagem
-- errada ("não é candidato deste aluno").
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.financeiro_candidatos_do_aluno(p_aluno_id uuid)
returns table (
  contato_hm_id   text,
  produto         text,
  plano           text,
  turma           text,
  valor_total     numeric,
  criado_em       timestamptz,
  casou_por       text,
  email           text,
  documento_final text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_email text; v_doc text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select lower(btrim(coalesce(a.email, ''))),
         regexp_replace(coalesce(a.documento, ''), '\D', '', 'g')
    into v_email, v_doc
    from public.thb_alunos a
   where a.id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;

  -- Sem e-mail E sem documento não há casamento possível: devolve VAZIO em vez
  -- de listar contrato órfão qualquer. Listar tudo transformaria o diagnóstico
  -- num navegador da base financeira do sip.
  if v_email = '' and v_doc = '' then
    return;
  end if;

  return query
  select h.id::text,
         h.produto::text,
         h.plano::text,
         h.turma::text,
         h.valor_total::numeric,
         h.criado_em::timestamptz,
         case when v_email <> ''
               and lower(btrim(coalesce(c.email, ''))) = v_email
              then 'e-mail' else 'documento' end,
         c.email::text,
         -- Só os 4 últimos dígitos: o bastante para conferir, o mínimo para
         -- não virar consulta de CPF alheio pela tela do portal.
         right(regexp_replace(coalesce(c.documento, ''), '\D', '', 'g'), 4)
    from cs.contatos_hm h
    join public.compradores c on c.id = h.comprador_id
   where h.aluno_id is null
     and (
       (v_email <> '' and lower(btrim(coalesce(c.email, ''))) = v_email)
       or
       (v_doc <> ''
        and lpad(regexp_replace(coalesce(c.documento, ''), '\D', '', 'g'), 14, '0')
          = lpad(v_doc, 14, '0'))
     )
   -- e-mail antes de documento (casamento mais forte primeiro), depois o mais
   -- recente, e o id como desempate determinístico — sem ele, dois contratos do
   -- mesmo dia poderiam trocar de lugar entre dois carregamentos da tela.
   order by (case when v_email <> ''
                   and lower(btrim(coalesce(c.email, ''))) = v_email
                  then 0 else 1 end),
            h.criado_em desc nulls last,
            h.id::text;
end $function$;

comment on function gps.financeiro_candidatos_do_aluno(uuid) is
  'REGRA UNICA de casamento contrato-orfao x ambiente: cs.contatos_hm com aluno_id NULL cujo public.compradores (via comprador_id) tem o MESMO e-mail (lower/btrim) ou o MESMO documento (so digitos, lpad 14) do public.thb_alunos do ambiente. Aluno sem e-mail e sem documento devolve VAZIO -- nunca a base inteira. Devolve so os 4 ultimos digitos do documento. Peca INTERNA: revogada de public/anon e SEM grant para authenticated, entao nao existe no PostgREST; quem chama sao gps.admin_financeiro_candidatos/vincular e gps.admin_diagnostico_ambiente, todas SECURITY DEFINER do mesmo dono. Sem LIMIT de proposito: o teto e da exibicao -- se morasse aqui, candidato legitimo fora do top 5 seria recusado no vinculo com a mensagem errada.';

-- ⚠️ `authenticated` TAMBÉM: o ALTER DEFAULT PRIVILEGES do projeto concede execute
-- a authenticated em toda função nova — sem esta linha a peça interna aparecia
-- no PostgREST (medido em 09/09 logo após aplicar: acl trazia authenticated=X).
revoke execute on function gps.financeiro_candidatos_do_aluno(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) A LISTAGEM (teto de 5 — candidato é escolha, não catálogo)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.admin_financeiro_candidatos(p_aluno_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_out jsonb; v_ja_tem int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  select count(*) into v_ja_tem from cs.contatos_hm h where h.aluno_id = p_aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'contato_hm_id', x.contato_hm_id,
           'produto',       x.produto,
           'plano',         x.plano,
           'turma',         x.turma,
           'valor_total',   x.valor_total,
           'criado_em',     x.criado_em,
           'casou_por',     x.casou_por,
           'email',         x.email,
           'documento_final', x.documento_final)), '[]'::jsonb)
    into v_out
    from (select * from gps.financeiro_candidatos_do_aluno(p_aluno_id) limit 5) x;

  return jsonb_build_object('candidatos', v_out, 'ja_tem', v_ja_tem);
end $function$;

comment on function gps.admin_financeiro_candidatos(uuid) is
  'Contratos orfaos de cs.contatos_hm que casam com o cadastro deste ambiente (regra em gps.financeiro_candidatos_do_aluno), teto de 5 -- candidato e escolha, nao catalogo. Devolve tambem `ja_tem` (quantos contratos ja estao vinculados a este aluno), para a tela nao oferecer vinculo a quem ja tem financeiro. SO LEITURA (stable).';

revoke execute on function gps.admin_financeiro_candidatos(uuid) from public, anon;
grant  execute on function gps.admin_financeiro_candidatos(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) O VÍNCULO
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.admin_financeiro_vincular(
  p_aluno_id uuid, p_contato_hm_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id text; v_linhas int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_id := btrim(coalesce(p_contato_hm_id, ''));
  if p_aluno_id is null or v_id = '' or length(v_id) > 64 then
    raise exception 'contrato nao informado' using errcode = '22023';
  end if;

  -- Reusar a função de candidatos é o que garante que a regra aceita pelo
  -- banco é a MESMA que o admin viu na tela.
  if not exists (select 1 from gps.financeiro_candidatos_do_aluno(p_aluno_id) x
                  where x.contato_hm_id = v_id) then
    raise exception 'Este contrato não é candidato deste aluno (e-mail e CPF/CNPJ não coincidem, ou ele já pertence a outro cadastro).'
      using errcode = '42501';
  end if;

  update cs.contatos_hm
     set aluno_id = p_aluno_id
   where id::text = v_id
     and aluno_id is null;   -- ← a trava que sobrevive à corrida
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'O contrato deixou de estar livre. Recarregue o diagnóstico.'
      using errcode = '40001';
  end if;

  -- `detalhe` = o id do contrato, cru e sozinho: é o que
  -- gps.admin_financeiro_desvincular procura para saber se o vínculo saiu daqui.
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('financeiro_vinculado', p_aluno_id, v_id, auth.uid());

  return jsonb_build_object('contato_hm_id', v_id, 'aluno_id', p_aluno_id);
end $function$;

comment on function gps.admin_financeiro_vincular(uuid, text) is
  'Preenche cs.contatos_hm.aluno_id de UM contrato ORFAO escolhido na tela (B-F1 opcao A, autorizado pelo orquestrador em 09/09/2026). Quatro travas: admin; o contrato tem de estar entre os candidatos daquele aluno (mesma funcao que a tela listou); id explicito; e `and aluno_id is null` DENTRO do update -- o `if` nao sobrevive a corrida entre dois admins nem a uma carga do sip. Zero linha afetada levanta 40001, nunca sucesso silencioso. ESCREVE SO `aluno_id`: nenhuma outra coluna de cs.* e tocada, nada e criado nem apagado. Log em gps.acessos_log (financeiro_vinculado) com detalhe = o id do contrato.';

revoke execute on function gps.admin_financeiro_vincular(uuid, text) from public, anon;
grant  execute on function gps.admin_financeiro_vincular(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) O DESFAZER
--
-- Regra do orquestrador: desvincula quando `aluno_id = p_aluno_id`. Não é
-- exigido que o vínculo tenha saído do portal — mas o log REGISTRA a origem,
-- porque desfazer um vínculo criado pelo sip é apagar o trabalho de outro
-- sistema, e quem auditar depois precisa saber qual dos dois aconteceu.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.admin_financeiro_desvincular(
  p_aluno_id uuid, p_contato_hm_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id text; v_linhas int; v_nosso boolean;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_id := btrim(coalesce(p_contato_hm_id, ''));
  if p_aluno_id is null or v_id = '' or length(v_id) > 64 then
    raise exception 'contrato nao informado' using errcode = '22023';
  end if;

  select exists (select 1 from gps.acessos_log l
                  where l.acao = 'financeiro_vinculado'
                    and l.aluno_id = p_aluno_id
                    and l.detalhe = v_id)
    into v_nosso;

  update cs.contatos_hm
     set aluno_id = null
   where id::text = v_id
     and aluno_id = p_aluno_id;   -- ← nunca desvincula contrato de outro aluno
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'O contrato não está vinculado a este aluno.' using errcode = 'P0002';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('financeiro_desvinculado', p_aluno_id,
          v_id || case when v_nosso then '' else ' (vínculo de origem: sistema externo)' end,
          auth.uid());

  return jsonb_build_object('contato_hm_id', v_id,
                            'vinculado_pelo_portal', v_nosso);
end $function$;

comment on function gps.admin_financeiro_desvincular(uuid, text) is
  'Tira o aluno_id de UM contrato de cs.contatos_hm, e SO quando ele esta vinculado a ESTE aluno (a condicao mora no update, nao no if). Devolve `vinculado_pelo_portal`: false significa que o vinculo veio do sip, e a tela deve dizer isso antes de confirmar -- desfazer trabalho de outro sistema e decisao, nao clique. O log registra a origem no detalhe. Nenhuma outra coluna de cs.* e tocada.';

revoke execute on function gps.admin_financeiro_desvincular(uuid, text) from public, anon;
grant  execute on function gps.admin_financeiro_desvincular(uuid, text) to authenticated;
