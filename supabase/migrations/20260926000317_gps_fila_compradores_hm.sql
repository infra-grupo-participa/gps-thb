-- …317 — Fila "Compradores do HM aguardando acesso" (26/09/2026)
--
-- Pedido do João (26/09, Imersão HT): quem compra o HM CHEIO (R$ 15 mil) tem de
-- chegar ao Programa sem a equipe caçar a pessoa na base. Decisão dele, que
-- respeita a regra do Marcio de 11/09 ("a fila NUNCA cria login automático";
-- "a liberação do comprador é missão nossa"):
--
--   webhook → card + aluno na base (já existia: cs.fn_seed_contato_hm →
--   cs.fn_hm_provisionar_aluno) → ESTA fila mostra quem falta → a equipe clica
--   "Autorizar e enviar acesso" → `criarAcessoAluno` (o mesmo "Criar acesso" de
--   sempre: login com o e-mail da compra, senha temporária individual, e-mail
--   pela Resend, troca obrigatória no 1º acesso).
--
-- Esta função SÓ LÊ. Não cria login, não escreve em lugar nenhum.
--
-- Quem entra na fila (todas as condições):
--   1. compra APROVADA de oferta do catálogo com categoria 'compra_cheia' do
--      produto Holding Masters (5064314) — o HM cheio. Sinal, saldo, Acelera e
--      Aurum NÃO entram (elegibilidade de 11/09: "só o HM cheio");
--   2. aprovada a partir de `gps.config.fila_hm_desde` (default 2026-09-26).
--      🔑 O corte existe para NÃO ressuscitar os 24 ambientes removidos por
--      decisão do Marcio em 10/09 — a fila é para compra nova, não para refazer
--      a conferência dos 141;
--   3. o cadastro existe em public.thb_alunos (vínculo pelo card do HM ou pelo
--      comprador) — é ele que o "Criar acesso" usa;
--   4. ninguém em gps.membros aponta para esse cadastro (nem como titular, nem
--      como pessoa de sócio). Quem já entrou não aparece — a fila é de quem
--      falta, nunca mexe em quem está.
--
-- `tem_login` diz se o e-mail já tem conta em auth.users (compartilhado por 7
-- sistemas). Nesse caso "Autorizar" NÃO troca a senha: a action devolve
-- "precisa de decisão" e a equipe resolve em Gerenciar acesso, como no lote.

insert into gps.config (chave, valor)
values ('fila_hm_desde', '2026-09-26')
on conflict (chave) do nothing;

create or replace function gps.admin_compradores_hm_aguardando()
returns table (
  aluno_id uuid,
  nome text,
  email text,
  comprado_em timestamptz,
  oferta_codigo text,
  valor numeric,
  metodo_pagamento text,
  tem_login boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz;
begin
  -- Guarda que falha FECHADO: sem JWT, gp_is_admin() pode ser NULL.
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select coalesce(
           (select (c.valor || ' 00:00 America/Sao_Paulo')::timestamptz
              from gps.config c
             where c.chave = 'fila_hm_desde' and c.valor ~ '^\d{4}-\d{2}-\d{2}$'),
           timestamptz '2026-09-26 03:00+00')
    into v_desde;

  return query
  with cheias as (
    select distinct on (cp.comprador_id)
           cp.comprador_id,
           coalesce(cp.data_aprovacao, cp.data_compra) as comprado_em,
           cp.oferta_codigo::text as oferta_codigo,
           cp.preco as valor,
           cp.metodo_pagamento::text as metodo_pagamento
      from public.compras cp
      join public.hm_product_catalog cat
        on cat.offer_code = cp.oferta_codigo
       and cat.categoria = 'compra_cheia'
       and cat.product_id = '5064314'
     where cp.status in ('APPROVED', 'COMPLETE', 'COMPLETED')
       and coalesce(cp.data_aprovacao, cp.data_compra) >= v_desde
     order by cp.comprador_id, coalesce(cp.data_aprovacao, cp.data_compra) desc
  ),
  com_aluno as (
    select distinct on (a.id)
           a.id as aluno_id, a.nome::text as nome, lower(trim(a.email))::text as email,
           ch.comprado_em, ch.oferta_codigo, ch.valor, ch.metodo_pagamento
      from cheias ch
      join public.thb_alunos a
        on a.comprador_id = ch.comprador_id
        or a.id = (select hm.aluno_id from cs.contatos_hm hm
                    where hm.comprador_id = ch.comprador_id
                      and coalesce(hm.produto, 'HM') = 'HM'
                      and hm.aluno_id is not null
                    limit 1)
     order by a.id, ch.comprado_em desc
  )
  select ca.aluno_id, ca.nome, ca.email, ca.comprado_em, ca.oferta_codigo,
         ca.valor, ca.metodo_pagamento,
         exists (select 1 from auth.users u
                  where lower(u.email) = ca.email and ca.email <> '') as tem_login
    from com_aluno ca
   where not exists (select 1 from gps.membros m
                      where m.aluno_id = ca.aluno_id or m.pessoa_aluno_id = ca.aluno_id)
   order by ca.comprado_em asc;
end;
$$;

revoke all on function gps.admin_compradores_hm_aguardando() from public, anon;
grant execute on function gps.admin_compradores_hm_aguardando() to authenticated;

comment on function gps.admin_compradores_hm_aguardando() is
  'Fila só-leitura: compradores do HM cheio (compra_cheia, produto 5064314) aprovados desde gps.config.fila_hm_desde, com cadastro em thb_alunos e sem gps.membros. Liberar é clique da equipe (criarAcessoAluno). Migração …317, 26/09/2026.';
