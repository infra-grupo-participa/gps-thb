-- Aba Financeiro do aluno — LÊ cs.contatos_hm, NUNCA escreve (C5).
--
-- MOTIVAÇÃO (feature 7 do Marcio): o aluno não tem onde ver quanto pagou e
-- quanto falta do próprio contrato, e a equipe responde isso por WhatsApp.
--
-- MEDIÇÃO NO BANCO REAL (orquestrador, 09/09 — §3.0 do plano):
--   * cobertura: 94 de 125 ambientes têm linha em cs.contatos_hm (produto HM);
--     AURUM = 2 linhas. Os 31 sem linha veem a mensagem de "não disponível"
--     (B7) — a aba FICA visível, para a lacuna de cadastro não ficar invisível;
--   * duplicados (aluno_id, produto): ZERO. Ainda assim a função devolve UMA
--     LINHA POR REGISTRO e nunca soma por aluno (ver abaixo);
--   * saldo desconhecido (sem manual e sem aritmética possível): 4 linhas —
--     elas saem com saldo NULL e a tela diz "não informado" (B7-d);
--   * `postgres` (dono desta função) tem select em cs.contatos_hm: true.
--     RLS em cs.contatos_hm: LIGADA — o SECURITY DEFINER passa por cima dela,
--     então a guarda desta função é a ÚNICA barreira. É por isso que ela é a
--     primeira coisa do corpo e não depende de nenhuma policy;
--   * tipos conferidos um a um em information_schema.columns antes de escrever
--     o `returns table` (valor_* numeric, pagamento_parcelas integer,
--     pagamento_previsto_em date, os demais timestamptz/text). Divergência de
--     tipo aqui viraria 42804 só na primeira chamada, em produção.
--
-- SECURITY DEFINER é OBRIGATÓRIO: `authenticated` não tem (e NÃO PODE GANHAR)
-- grant em cs.contatos_hm -- a tabela é do sip e tem a base inteira, não só o
-- GPS. Dar grant resolveria a leitura e abriria a tabela toda para 125 alunos.
-- Por isso: DEFINER + guarda explícita + `stable` + zero comando de escrita.
--
-- QUEM PODE LER (B7-b):
--   * admin (public.gp_is_admin());
--   * o TITULAR do ambiente -- e SÓ ele.
--   🔴 O SÓCIO NÃO LÊ. `gps.aluno_atual()` devolve o aluno_id do AMBIENTE, então
--   uma guarda só com `gps.aluno_atual() = p_aluno_id` daria ao sócio o extrato
--   financeiro do titular. São 13 sócios em 13 ambientes -- gente real. O
--   contrato de pagamento é do titular; o sócio nunca assinou. Alargar depois é
--   apagar o `and m.papel = 'titular'`; ter mostrado a dívida de alguém não se
--   desfaz.
--   A guarda é UM predicado só -- `user_id = auth.uid() AND aluno_id =
--   p_aluno_id AND papel = 'titular'` -- e não `gps.aluno_atual() = p_aluno_id`
--   mais um exists solto. Motivo: o exists amarra as três perguntas (quem é,
--   qual ambiente, qual papel) na MESMA linha de gps.membros; um exists sem o
--   `aluno_id = p_aluno_id` autorizaria qualquer titular a ler QUALQUER
--   ambiente, e `aluno_atual()` seria uma segunda fonte de verdade para a mesma
--   pergunta. Sem JWT, `auth.uid()` é null, o exists é falso e a função levanta
--   42501: falha FECHADO.
--
-- SALDO (B7):  coalesce(saldo_a_pagar_manual, valor_total - valor_pago)
--   * `saldo_a_pagar_manual` vence sempre: alguém digitou porque a aritmética
--     estava errada;
--   * sem ele, e com valor_total OU valor_pago nulo, o saldo é NULL -- NÃO ZERO.
--     `coalesce(..., 0)` transformaria buraco em número e a tela diria "você
--     pagou R$ 0,00" para quem pagou;
--   * `credito_valor_pago` e `cancelamento_valor` NÃO ENTRAM NA CONTA (B7-c). A
--     semântica dos dois é do sip e não está provada aqui: se `credito` já está
--     dentro de `valor_pago`, somar conta duas vezes; se não está, omitir
--     subestima. A função DEVOLVE os dois em coluna própria e a tela os mostra
--     rotulados, sem calcular. Exibir sem calcular é honesto; calcular sem saber
--     produz um número plausível e errado;
--   * saldo NEGATIVO é fato medido, não defeito: há linha com valor_pago
--     15.000,06 contra valor_total 15.000,00. A função devolve -0,06 como está
--     (o admin precisa enxergar a divergência); quem transforma isso em
--     "Quitado" e R$ 0,00 é a camada TS (src/lib/financeiro.ts), num único
--     lugar, para as duas telas darem a MESMA resposta. Arredondar aqui
--     apagaria o dado para o admin também.
--
-- UMA LINHA POR REGISTRO, NUNCA UMA SOMA POR ALUNO: `cs.contatos_hm` pode ter
-- mais de uma linha para o mesmo aluno (produtos diferentes; hoje 0 duplicados,
-- mas 2 produtos distintos convivem na tabela). Agregar por aluno_id
-- misturaria o dinheiro de dois produtos -- é literalmente o defeito do
-- `where comprador_id` que quebrou 7 funções no sistema de disparos.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não concede grant nenhum em cs.contatos_hm (nem cria view no schema cs,
--     que seria o mesmo vazamento com outro nome);
--   * não escreve: nenhum insert/update/delete/truncate/copy no corpo, e
--     `stable` faz o próprio Postgres recusar escrita se alguém tentar
--     acrescentar uma depois;
--   * não usa `contrato_aurum` (o saldo do AURUM vem de planilha, fora daqui) —
--     a coluna existe e ficou DELIBERADAMENTE fora do returns table;
--   * não cria índice: a leitura é `where aluno_id = $1` numa tabela do sip que
--     já é indexada por aluno_id (conferir no relatório com explain);
--   * não impõe teto de linhas: hoje o máximo é 1 por aluno e truncar em
--     silêncio esconderia contrato. Quem avisa quando passar de 20 é o TS.
--
-- REVERSÃO: `drop function gps.financeiro_do_aluno(uuid);` -- nada foi escrito.

create or replace function gps.financeiro_do_aluno(p_aluno_id uuid)
returns table (
  produto               text,
  plano                 text,
  turma                 text,
  valor_total           numeric,
  valor_pago            numeric,
  saldo                 numeric,
  saldo_e_manual        boolean,
  credito_valor_pago    numeric,
  cancelamento_valor    numeric,
  cancelamento_em       timestamptz,
  pagamento_forma       text,
  pagamento_parcelas    integer,
  pagamento_em          timestamptz,
  pagamento_previsto_em date,
  quitado_em            timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Sem isto, `where h.aluno_id = null` devolveria 0 linhas e a tela diria
  -- "sem registro" para um bug de chamada. 22023 = invalid_parameter_value.
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  -- GUARDA (a única barreira: o DEFINER já passou por cima da RLS de cs).
  -- Vem ANTES de qualquer leitura de cs.contatos_hm, de propósito: quem não
  -- pode ler não chega nem a tocar na tabela, e a mensagem é a MESMA para
  -- ambiente inexistente e ambiente alheio -- enumerar em laço não distingue
  -- os dois casos.
  if not (
        public.gp_is_admin()
     or exists (select 1
                  from gps.membros m
                 where m.user_id  = auth.uid()
                   and m.aluno_id = p_aluno_id
                   and m.papel    = 'titular')
  ) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  return query
  select h.produto,
         h.plano,
         h.turma,
         h.valor_total,
         h.valor_pago,
         coalesce(
           h.saldo_a_pagar_manual,
           case when h.valor_total is null or h.valor_pago is null
                then null
                else h.valor_total - h.valor_pago
           end
         ),
         (h.saldo_a_pagar_manual is not null),
         h.credito_valor_pago,
         h.cancelamento_valor,
         h.cancelamento_em,
         h.pagamento_forma,
         h.pagamento_parcelas,
         h.pagamento_em,
         h.pagamento_previsto_em,
         h.quitado_em
    from cs.contatos_hm h
   where h.aluno_id = p_aluno_id
   -- contrato cancelado por último; depois por produto e, como desempate
   -- determinístico entre duas linhas do MESMO produto, pela data de
   -- pagamento. Sem o desempate a ordem do card poderia dançar entre dois
   -- carregamentos da mesma tela.
   order by (h.cancelamento_em is not null), h.produto, h.pagamento_em nulls last;
end;
$$;

comment on function gps.financeiro_do_aluno(uuid) is
  'Extrato do contrato do aluno lido de cs.contatos_hm (schema do sip). LE, NUNCA ESCREVE. SECURITY DEFINER porque `authenticated` nao tem nem pode ganhar grant em cs.contatos_hm (a RLS de cs fica por baixo do DEFINER: a guarda desta funcao e a unica barreira). Acesso: admin OU o TITULAR do ambiente (gps.membros: user_id=auth.uid() AND aluno_id=p_aluno_id AND papel=titular) -- o SOCIO NAO LE, o contrato e do titular. Sem JWT falha fechado com 42501. Saldo = coalesce(saldo_a_pagar_manual, valor_total - valor_pago) e fica NULL quando nao da para calcular, nunca zero. Saldo negativo por centavos e devolvido como esta; virar "Quitado" e trabalho de src/lib/financeiro.ts, num lugar so. credito_valor_pago e cancelamento_valor sao DEVOLVIDOS mas NUNCA entram na aritmetica: a semantica deles e do sip e nao esta provada aqui. contrato_aurum fica de fora de proposito. Uma linha por registro -- NUNCA agregar por aluno_id, ha produtos diferentes na mesma tabela.';

revoke execute on function gps.financeiro_do_aluno(uuid) from public, anon;
grant  execute on function gps.financeiro_do_aluno(uuid) to authenticated;
