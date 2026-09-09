-- Financeiro do aluno v2 — "Meu progresso financeiro" (09/09/2026).
--
-- O QUE MUDA EM RELAÇÃO À v1 (20260909000100):
--   * a fonte de verdade financeira deixa de ser a aritmética local sobre
--     `cs.contatos_hm` (valor_total - valor_pago) e passa a ser a REGRA DO SIP,
--     materializada em `cs.vw_hm_financeiro`: `pacote_regra` (quanto o programa
--     custa por regra) e `saldo_a_perseguir` (quanto falta). Motivo medido em
--     09/09: a view cobre 96 de 96 contratos (94 alunos) e já resolve parcela,
--     inadimplência e próxima cobrança — coisas que a v1 não tinha como saber e
--     que a equipe respondia por WhatsApp;
--   * entra o EXTRATO (`cs.vw_hm_extrato`, 232 pagamentos): data, categoria,
--     parcela, valor e método. Antes o aluno via só o acumulado;
--   * `returns table` muda de forma, então a função é DROPADA e recriada. Não dá
--     para `create or replace` com colunas diferentes (42P13).
--
-- O QUE **NÃO** MUDA (e não pode mudar sem decisão explícita):
--   * SECURITY DEFINER + guarda própria. `authenticated` não tem — e não pode
--     ganhar — grant em `cs.*`: são as tabelas do sip, com a base inteira. Dar
--     grant resolveria a leitura e abriria a base toda para 125 alunos. A RLS de
--     `cs` fica POR BAIXO do DEFINER: a guarda desta função é a única barreira;
--   * QUEM LÊ: admin (`public.gp_is_admin()`) OU o **titular** do ambiente. 🔴 O
--     SÓCIO NÃO LÊ (B7-b) — são 13 sócios em 13 ambientes, gente real, e o
--     contrato de pagamento é do titular. Sem JWT, `auth.uid()` é null e a
--     função falha FECHADO com 42501;
--   * UMA LINHA POR CONTRATO, nunca uma soma por aluno: `cs.contatos_hm` tem
--     produtos diferentes na mesma tabela (HM e AURUM). Agregar por `aluno_id`
--     misturaria o dinheiro de dois produtos — é literalmente o defeito do
--     `where comprador_id` que quebrou 7 funções no sistema de disparos;
--   * NADA DE ESCRITA: zero insert/update/delete no corpo e `stable`, que faz o
--     próprio Postgres recusar escrita se alguém acrescentar uma depois;
--   * B7-c: `credito` é DEVOLVIDO e nunca somado/subtraído aqui. A semântica do
--     crédito é do sip (pode já estar dentro de `pago`); exibir rotulado é
--     honesto, calcular sem saber produz número plausível e errado;
--   * B7-d: valor que o sip não sabe chega NULL e a tela escreve "não
--     informado". `coalesce(..., 0)` transformaria buraco em número — foi assim
--     que um COALESCE virou "taxa zero" plausível por 5 semanas.
--
-- 🔑 TIPOS: esta migração foi escrita SEM acesso ao banco, então **toda** coluna
-- lida das views sai com CAST EXPLÍCITO para o tipo declarado no `returns
-- table`. Divergência de tipo entre a view e o `returns table` viraria 42804 na
-- primeira chamada, em produção, e não no `apply`. O cast custa nada aqui e
-- transforma "explode em produção" em "converte".
--   * `contato_hm_id` sai como **text** de propósito: é identificador OPACO,
--     usado só na linha técnica do admin. Se `cs.contatos_hm.id` for bigint,
--     declarar uuid explodiria; `::text` funciona para qualquer tipo de origem;
--   * `parcela` do extrato também sai **text**: o sip pode gravar "3" ou "1/12",
--     e `::integer` sobre "1/12" seria 22P02 em runtime. É campo de exibição.
--
-- 🔑 FUSO: as funções fixam `TimeZone = 'America/Sao_Paulo'`. As colunas de data
-- podem ser `date` (cast no-op) ou `timestamptz` (cast dependente do fuso da
-- sessão, que no Supabase é UTC). Sem isto, um pagamento de 21/08 às 21h em SP
-- viraria 22/08 na tela — o erro de "um dia a mais" que já mordeu o
-- `formatarDataSoDia` deste repo. Devolvendo `date` já no fuso de SP, a camada
-- TS não tem como reintroduzir o deslocamento.
--
-- REVERSÃO: reaplicar 20260909000100 (a v1 volta inteira) e
-- `drop function gps.financeiro_extrato_do_aluno(uuid), gps.financeiro_pode_ler(uuid);`
-- Nada foi escrito, nenhum grant novo em `cs`, nenhuma tabela tocada.

-- ── 1. A guarda, num lugar só ────────────────────────────────────────────────
-- As duas funções desta migração fazem a MESMA pergunta de autorização. Copiar
-- o predicado nas duas é o caminho conhecido para elas divergirem (alguém
-- alarga uma e esquece a outra — e alargar guarda de dinheiro em silêncio é
-- exatamente o que não pode acontecer). O predicado é UM exists só, amarrando
-- as três perguntas (quem é / qual ambiente / qual papel) na MESMA linha de
-- `gps.membros`: um exists sem `aluno_id = p_aluno_id` autorizaria qualquer
-- titular a ler QUALQUER ambiente.
--
-- SECURITY DEFINER também aqui: a resposta não pode depender da RLS de
-- `gps.membros`, que seria uma segunda fonte de verdade para a mesma pergunta.
-- O retorno é um booleano sobre o PRÓPRIO chamador — não vaza nada que ele já
-- não saiba.
create or replace function gps.financeiro_pode_ler(p_aluno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.gp_is_admin()
      or exists (select 1
                   from gps.membros m
                  where m.user_id  = auth.uid()
                    and m.aluno_id = p_aluno_id
                    and m.papel    = 'titular');
$$;

comment on function gps.financeiro_pode_ler(uuid) is
  'Guarda unica do Financeiro (B7-b): admin OU o TITULAR do ambiente, na MESMA linha de gps.membros. O SOCIO NAO LE -- o contrato de pagamento e do titular. Sem JWT, auth.uid() e null e o resultado e false: falha FECHADO. Usada por gps.financeiro_do_aluno e gps.financeiro_extrato_do_aluno para as duas nao poderem divergir.';

revoke execute on function gps.financeiro_pode_ler(uuid) from public, anon;
grant  execute on function gps.financeiro_pode_ler(uuid) to authenticated;

-- ── 2. O contrato do programa ────────────────────────────────────────────────
-- `drop` obrigatório: mudar a forma do `returns table` num `create or replace`
-- levanta 42P13 ("cannot change return type of existing function").
drop function if exists gps.financeiro_do_aluno(uuid);

create function gps.financeiro_do_aluno(p_aluno_id uuid)
returns table (
  contato_hm_id        text,
  produto              text,
  plano                text,
  turma                text,
  -- `pacote_regra`: quanto o programa custa PELA REGRA DO SIP. É a fonte de
  -- verdade financeira, não um total digitado à mão.
  valor_programa       numeric,
  pago                 numeric,
  -- `saldo_a_perseguir`: o que a régua de cobrança do sip ainda persegue.
  saldo                numeric,
  -- B7-c: exibido, NUNCA somado.
  credito              numeric,
  parcelas_pagas       integer,
  parcelas_contratadas integer,
  valor_parcela        numeric,
  pago_pct             numeric,
  quitado              boolean,
  cancelado            boolean,
  inadimplente         boolean,
  -- situacao ∈ quitado(64) | mensalidade_em_curso(27) | saldo_parado(3) |
  --            cancelado(1) | incalculavel(1)  — medido em 09/09.
  situacao             text,
  -- status_parcela ∈ quitado(64) | aguardando(26) | em_dia(5) | atrasado(1).
  status_parcela       text,
  proxima_cobranca_em  date,
  ultimo_pagamento_em  date,
  entrada_valor        numeric,
  entrada_pago_em      date,
  cancelamento_em      date
)
language plpgsql
stable
security definer
set search_path = ''
set "TimeZone" = 'America/Sao_Paulo'
as $$
begin
  -- Sem isto, `where h.aluno_id = null` devolveria 0 linhas e a tela diria
  -- "sem registro" para um bug de chamada. 22023 = invalid_parameter_value.
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  -- A guarda vem ANTES de qualquer leitura de `cs`, de propósito: quem não pode
  -- ler não chega nem a tocar na tabela do sip, e a mensagem é a MESMA para
  -- ambiente inexistente e ambiente alheio — enumerar em laço não distingue os
  -- dois casos.
  if not gps.financeiro_pode_ler(p_aluno_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  return query
  -- `left join`: o contrato existe em `cs.contatos_hm` mesmo sem linha na view
  -- (hoje 96 de 96 têm, mas cadastro novo entra primeiro na tabela). Com
  -- `inner join` o contrato sumiria da tela e o aluno veria "sem registro" —
  -- lacuna de cadastro virando invisibilidade. Com `left join` ele aparece com
  -- as colunas nulas e a UI diz "não informado".
  select h.id::text,
         h.produto::text,
         h.plano::text,
         h.turma::text,
         f.pacote_regra::numeric,
         f.pago::numeric,
         f.saldo_a_perseguir::numeric,
         f.credito::numeric,
         f.parcelas_pagas::integer,
         f.parcelas_contratadas::integer,
         f.valor_parcela::numeric,
         f.pago_pct::numeric,
         f.quitado::boolean,
         f.cancelado::boolean,
         f.inadimplente::boolean,
         f.situacao::text,
         f.status_parcela::text,
         f.proxima_cobranca_em::date,
         f.ultimo_pagamento_em::date,
         f.entrada_valor::numeric,
         f.entrada_pago_em::date,
         h.cancelamento_em::date
    from cs.contatos_hm h
    left join cs.vw_hm_financeiro f
           on f.contato_hm_id = h.id
   where h.aluno_id = p_aluno_id
   -- Contrato cancelado por último (o aluno tem de ver primeiro o que está
   -- vivo), depois por produto e, como desempate determinístico entre duas
   -- linhas do mesmo produto, pelo id. Sem o desempate a ordem dos cards
   -- poderia dançar entre dois carregamentos da mesma tela.
   order by (coalesce(f.cancelado, false) or h.cancelamento_em is not null),
            h.produto nulls last,
            h.id::text;
end;
$$;

comment on function gps.financeiro_do_aluno(uuid) is
  'v2 (09/09/2026): contrato do programa lido de cs.contatos_hm + cs.vw_hm_financeiro (schema do sip). LE, NUNCA ESCREVE. SECURITY DEFINER porque authenticated nao tem nem pode ganhar grant em cs.* (a RLS de cs fica por baixo do DEFINER: a guarda e a unica barreira). Acesso por gps.financeiro_pode_ler(): admin OU o TITULAR -- o SOCIO NAO LE. Sem JWT falha fechado com 42501. valor_programa = pacote_regra e saldo = saldo_a_perseguir: a REGRA DO SIP e a fonte de verdade financeira, nao a aritmetica local. credito e DEVOLVIDO e NUNCA entra na conta (B7-c). Valor que o sip nao sabe chega NULL, nunca zero (B7-d). left join de proposito: contrato sem linha na view aparece com colunas nulas em vez de sumir. Uma linha por contrato -- NUNCA agregar por aluno_id, ha produtos diferentes na mesma tabela. Datas devolvidas como date ja no fuso America/Sao_Paulo.';

revoke execute on function gps.financeiro_do_aluno(uuid) from public, anon;
grant  execute on function gps.financeiro_do_aluno(uuid) to authenticated;

-- ── 3. O extrato de pagamentos ───────────────────────────────────────────────
create or replace function gps.financeiro_extrato_do_aluno(p_aluno_id uuid)
returns table (
  contato_hm_id    text,
  -- categoria ∈ sinal(102) | mensalidade(67) | saldo(55) | compra_cheia(8).
  -- Rótulo legível é trabalho da UI: categoria nova do sip cai como texto cru
  -- em vez de sumir da lista.
  categoria        text,
  parcela          text,
  valor            numeric,
  pago_em          date,
  metodo_pagamento text
)
language plpgsql
stable
security definer
set search_path = ''
set "TimeZone" = 'America/Sao_Paulo'
as $$
begin
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  if not gps.financeiro_pode_ler(p_aluno_id) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  return query
  -- `join` (não left): aqui a linha É o pagamento. Sem pagamento não há o que
  -- listar, e uma linha vazia não significaria nada para o aluno.
  select h.id::text,
         e.categoria::text,
         e.parcela::text,
         e.valor::numeric,
         e.pago_em::date,
         e.metodo_pagamento::text
    from cs.vw_hm_extrato e
    join cs.contatos_hm h on h.id = e.contato_hm_id
   where h.aluno_id = p_aluno_id
   -- 🔑 DESC de propósito. O teto de 200 tem de cortar o MAIS ANTIGO, nunca o
   -- mais recente: quem abre o extrato quer saber o que caiu por último. Com
   -- `asc limit 200` o corte apagaria justamente o pagamento de ontem.
   -- Medido em 09/09: 232 pagamentos no sistema INTEIRO, então o teto só
   -- protege contra crescimento futuro; ninguém é truncado hoje.
   order by e.pago_em desc nulls last, h.id::text, e.parcela::text desc
   limit 200;
end;
$$;

comment on function gps.financeiro_extrato_do_aluno(uuid) is
  'Extrato de pagamentos do programa, de cs.vw_hm_extrato (schema do sip). LE, NUNCA ESCREVE. Mesma guarda de gps.financeiro_do_aluno (gps.financeiro_pode_ler: admin OU titular; socio nao le; sem JWT 42501). Ordem: pago_em DESC -- o teto de 200 linhas corta o pagamento MAIS ANTIGO, nunca o mais recente. parcela sai como text porque o sip pode gravar "3" ou "1/12" e o cast para integer seria 22P02 em runtime; e campo de exibicao. pago_em sai como date ja no fuso America/Sao_Paulo.';

revoke execute on function gps.financeiro_extrato_do_aluno(uuid) from public, anon;
grant  execute on function gps.financeiro_extrato_do_aluno(uuid) to authenticated;
