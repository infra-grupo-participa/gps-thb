# Catálogo de ofertas do Acelera — pendência entre repositórios (09/09/2026)

> ⚠️ **Esta pendência NÃO é do GPS.** Está registrada aqui porque foi
> descoberta durante a war-room do Plantão, e porque o efeito dela apareceu
> numa tela do GPS ("Sem direito ao acesso").

## O que aconteceu

Um aluno (Heber dos Santos Silveira) foi barrado ao criar acesso, com
*"Sem direito ao acesso — pagou só o sinal"*. Ele tinha pago **R$ 14.300 de
R$ 15.000**; o sistema enxergava **R$ 300**.

**A tela estava certa. O dado que ela lê é que estava incompleto.**

Cadeia da falha:
1. pagou R$ 1.997 (Acelera, oferta `30gjdp9b`, 26/08) e R$ 12.003
   ("HM com desconto de Acelera", `5o3z1yur`, 02/09);
2. os webhooks **chegaram** — `PURCHASE_APPROVED` de R$ 12.003 está em
   `cs.hotmart_eventos`, recebido em 02/09;
3. **as duas ofertas não estavam em `hm_product_catalog`**;
4. `cs.fn_hm_pagamento_do_produto` não reconhece oferta fora do catálogo →
   o pagamento nunca virou linha em `cs.hm_pagamentos` →
   `cs.vw_hm_financeiro` seguiu mostrando só o sinal.

## O tamanho do buraco, medido

Sobre o export "Histórico de vendas" da Hotmart (1.643 transações):

- **12 ofertas fora do catálogo, somando 436 transações PAGAS** — o Acelera
  Holding inteiro (`30gjdp9b` sozinho: 318).
- **15 pessoas** marcadas `situacao_financeira='so_sinal'` já haviam pago
  **R$ 480 mil**. Cinco delas com o pacote de **R$ 60 mil quitado** e **sem
  acesso ao portal**.

## O que foi feito em 09/09 (aplicado no banco, autorizado pelo Marcio)

1. **6 ofertas do Acelera catalogadas** em `hm_product_catalog`, com a regra
   dele: *o Acelera é ENTRADA do HM e abate do pacote de R$ 15.000*.
   Entraram como `categoria='sinal'`, `pacote_cheio=15000`,
   `entrada_do_programa=true` — é o que faz a view calcular
   `pacote_regra`/`saldo_regra` a partir delas.
   `30gjdp9b` · `7wuffwi8` · `ds3bfcfw` · `cypx3wwi` · `x3t80qnm` · `x47vcbun`
2. **2 pagamentos do Heber** registrados em `cs.hm_pagamentos` com as
   transações reais (`HP2014051500`, `HP2349587002`).
3. **15 carimbos `situacao_financeira`** recalculados a partir do financeiro
   real (`quitado` ou `em_andamento`, nunca por suposição).

## 🔴 O QUE FALTA — e por que não fiz

### a) Versionar as 6 ofertas na migration certa

`hm_product_catalog` **não pertence ao GPS nem ao `sistema-grupo-participa-v2`**.
O dono é **`sistema-disparos-participa`** (`C:\Users\infra\sistema-disparos-participa`),
que cria a tabela (`db/migrations/0028_cs_hm_ativacao.sql`) e tem tela de
gestão de ofertas (`app/hm/ofertas/`).

Não escrevi a migration lá porque aquele repo está numa **branch de feature**
(`feat/reuniao-finalizada-exige-prazo`) com **5 migrations não commitadas** de
outra pessoa. Acrescentar arquivo ali, sem contexto do trabalho em curso,
criaria conflito.

**Ação:** criar a migration em `sistema-disparos-participa/db/migrations/`
quando aquela branch estabilizar. O SQL exato está no fim deste documento.

### b) 6 ofertas ainda NÃO catalogadas

`5o3z1yur` (27 transações) e `yzih2l0a` (7) — "HM com desconto de Acelera" —,
mais `t2vejhvv`, `hyopam51`, `cnfrh6wj`, `p4t1xid7` (1 cada). **37 transações
pagas.**

São o **saldo** (`categoria='diferenca'`), não a entrada, e o valor varia
conforme o desconto. **Catalogar com o valor errado move dinheiro na conta de
gente real** — depende de o Marcio informar a regra de cada uma.

Reencontrá-las:
```sql
select p.oferta_codigo, count(*)
  from cs.hm_pagamentos p
  left join hm_product_catalog c on c.offer_code = p.oferta_codigo
 where c.offer_code is null group by 1 order by 2 desc;
```

### c) Os outros 89 marcados `so_sinal`

Corrigi os 15 que tinham pagamento reconhecido acima de R$ 1.000. Os demais
podem ter pagamento **não reconhecido** pelo mesmo motivo (oferta fora do
catálogo) — só dá para saber depois de (b).

## SQL das 6 ofertas, para a migration no repo certo

```sql
insert into hm_product_catalog
  (product_id, offer_code, product_name, product_type, categoria,
   concede_trilha, pacote_cheio, entrada_condicao_fechada, entrada_do_programa,
   nome_comercial, valor_tabela, explicacao, papel, ativo,
   origem_do_dado, atualizado_por)
values
  ('5064314','30gjdp9b','Acelera Holding','hm','sinal', true, 15000.00, false, true,
   'Acelera Holding','1997.00',
   'Acelera e ENTRADA do HM: abate do pacote de 15.000 (decisao Marcio 09/09/2026).',
   'entrada', true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','7wuffwi8','Acelera Holding','hm','sinal', true, 15000.00, false, true,
   'Acelera Holding R$ 2497','2497.00','Acelera a 2.497 -- entrada do HM',
   'entrada', true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','ds3bfcfw','Acelera Holding','hm','sinal', true, 15000.00, false, true,
   'Acelera Holding','1997.00','Acelera (2a oferta) -- entrada do HM',
   'entrada', true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','cypx3wwi','Acelera Holding','hm','sinal', true, 15000.00, false, true,
   'Acelera Holding','1997.00','Acelera sem nome no export -- entrada do HM',
   'entrada', true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','x3t80qnm','Acelera Holding','hm','sinal', true, 15000.00, false, true,
   'Acelera Holding R$ 2497','2497.00','Acelera 2.497 (2a oferta) -- entrada do HM',
   'entrada', true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','x47vcbun','Acelera Holding','hm','sinal', true, 15000.00, false, true,
   'Acelera Holding (R$998,50 de R$1.997)','998.50','Acelera parcelado -- entrada do HM',
   'entrada', true, 'manual', 'marcio via war-room 09/09')
on conflict (offer_code) do nothing;
```

Conferir o que está aplicado hoje:
```sql
select offer_code, nome_comercial, categoria, pacote_cheio
  from hm_product_catalog where atualizado_por like '%war-room%';
```
