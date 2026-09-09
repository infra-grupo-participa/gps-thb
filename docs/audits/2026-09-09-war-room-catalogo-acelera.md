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

### a) Versionar as 12 ofertas na migration certa

`hm_product_catalog` **não pertence ao GPS nem ao `sistema-grupo-participa-v2`**.
O dono é **`sistema-disparos-participa`** (`C:\Users\infra\sistema-disparos-participa`),
que cria a tabela (`db/migrations/0028_cs_hm_ativacao.sql`) e tem tela de
gestão de ofertas (`app/hm/ofertas/`).

Não escrevi a migration lá porque aquele repo está numa **branch de feature**
(`feat/reuniao-finalizada-exige-prazo`) com **5 migrations não commitadas** de
outra pessoa. Acrescentar arquivo ali, sem contexto do trabalho em curso,
criaria conflito.

**Ação:** criar a migration em `sistema-disparos-participa/db/migrations/`
quando aquela branch estabilizar. O SQL das **12** está no fim deste documento.

### b) ✅ As 6 ofertas de saldo foram catalogadas (09/09, mesma noite)

`5o3z1yur` (27 transações) · `yzih2l0a` (7) · `t2vejhvv` · `hyopam51` ·
`cnfrh6wj` · `p4t1xid7` (1 cada). **37 transações pagas.**

Entraram como `categoria='diferenca'`, `pacote_cheio` NULO, `papel` NULO —
o mesmo padrão das ofertas de saldo já catalogadas (`2mxcjw8t`, `1ayp826g`…).

**Por que era seguro, medido antes de escrever** (o receio original era
"catalogar com valor errado move dinheiro"):

1. **As 6 JÁ contavam para o HM.** `cs.fn_hm_produto_da_oferta_calc` cai no
   default `'HM'` quando a oferta não está em lugar nenhum —
   `fn_hm_pagamento_do_produto(oferta,'HM')` devolvia `true` para todas
   antes do catálogo. O catálogo **não é** o que decide se o pagamento entra
   na conta.
2. **`categoria='diferenca'` não tem `pacote_cheio`**, então não entra no
   LATERAL `ent` de `cs.vw_hm_financeiro` — que só olha `categoria='sinal'`
   com `pacote_cheio` não nulo. Nenhum `pacote_regra` mudou.
3. **`valor_tabela` de oferta `diferenca` é RÓTULO.** Nenhuma view usa esse
   campo em aritmética; a conta usa o valor REAL de `cs.hm_pagamentos`. Por
   isso os valores variados (12.003 / 13.439 / 14.982 / 15.249 na mesma
   oferta — é o saldo parcelado com juros) não são problema: gravamos o
   menor (à vista) como referência.

**Diferença para a entrada:** as 6 do Acelera (item anterior) entraram como
`sinal` com `pacote_cheio=15000` **porque elas SIM alimentam o cálculo** do
pacote. Ali o valor importa; aqui não.

Conferido depois de aplicar: as 12 ofertas do export estão catalogadas,
`cs.vw_hm_pagamentos_orfaos` tem 3 linhas (nenhuma delas destas ofertas).

### c) Os outros 89 marcados `so_sinal` — reavaliar

Corrigi os 15 que tinham pagamento reconhecido acima de R$ 1.000.

⚠️ **O diagnóstico mudou depois de investigar o catálogo:** como as ofertas
já eram reconhecidas como HM pelo cálculo por default, o catálogo **não era**
a causa de pagamento não reconhecido. A causa do caso Heber foi outra — o
pagamento simplesmente nunca virou linha em `cs.hm_pagamentos`, apesar de o
webhook `PURCHASE_APPROVED` ter chegado.

**Isso é uma pendência aberta e maior:** chegaram **211 eventos
`PURCHASE_APPROVED` de 122 pessoas** entre 15/07 e 08/09
(`cs.hotmart_eventos`). Falta descobrir **por que alguns não viram
pagamento** — o webhook chega e a escrita não acontece.

Consulta de partida:
```sql
select count(*) as aprovados, count(distinct email) as pessoas
  from cs.hotmart_eventos where evento = 'PURCHASE_APPROVED';
-- cruzar com cs.hm_pagamentos por transacao para achar os que faltam
```

Enquanto isso não for resolvido, **casos como o do Heber vão continuar
aparecendo** — e a tela vai continuar dizendo "sem direito ao acesso" para
quem pagou.

## SQL das 12 ofertas, para a migration no repo certo

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

```sql
-- As 6 de SALDO (categoria diferenca, sem pacote_cheio -- nao entram no
-- calculo do pacote; valor_tabela e so rotulo)
insert into hm_product_catalog
  (product_id, offer_code, product_name, product_type, categoria,
   concede_trilha, pacote_cheio, entrada_condicao_fechada, entrada_do_programa,
   nome_comercial, valor_tabela, explicacao, ativo, origem_do_dado, atualizado_por)
values
  ('5064314','5o3z1yur','Holding Masters','hm','diferenca', true, null, false, false,
   'HM com desconto de Acelera Holding','12003.00',
   'Saldo do HM para quem comprou o Acelera. 27 transacoes pagas sem catalogo ate 09/09.',
   true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','yzih2l0a','Holding Masters','hm','diferenca', true, null, false, false,
   'HM com desconto de Acelera Holding','11503.00','Saldo pos-Acelera (2a oferta). 7 pagas.',
   true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','t2vejhvv','Holding Masters','hm','diferenca', true, null, false, false,
   'HM com desconto de Acelera Holding','11003.00','Saldo pos-Acelera (3a oferta).',
   true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','hyopam51','Holding Masters','hm','diferenca', true, null, false, false,
   'HM com desconto de Acelera Holding','11441.88','Saldo pos-Acelera (4a oferta).',
   true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','cnfrh6wj','Holding Masters','hm','diferenca', true, null, false, false,
   'Saldo HM Programa de Implementacao','7767.12','Saldo individual, pago em 02/09.',
   true, 'manual', 'marcio via war-room 09/09'),
  ('5064314','p4t1xid7','Holding Masters','hm','diferenca', true, null, false, false,
   'Saldo HM Programa de Implementacao','15320.40','Saldo individual, pago em 08/09.',
   true, 'manual', 'marcio via war-room 09/09')
on conflict (offer_code) do nothing;
```

Conferir o que está aplicado hoje (esperado: 12):
```sql
select offer_code, nome_comercial, categoria, pacote_cheio, valor_tabela
  from hm_product_catalog where atualizado_por like '%war-room%'
 order by categoria, offer_code;
```
