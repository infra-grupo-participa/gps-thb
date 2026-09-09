# Financeiro v2 — "Meu progresso financeiro" (spec do orquestrador, 09/09/2026)

## O que o João explicou (proposta correta da aba)
A aba Financeiro é o **painel de progresso financeiro do aluno na mentoria**, não um extrato frio:
1. **Meta de faturamento: R$ 150.000 durante o programa.** É o que o aluno precisa faturar com os
   clientes dele (honorários dos clientes em `fase = contratado`). Bater 150k = **próximo nível, o
   "Áureo"**. Passar de **R$ 250.000** durante o programa = **bônus** (o João não detalhou o bônus —
   NÃO inventar; chamar de "bônus do programa").
   Ex.: fechou uma holding que gerou R$ 40 mil → "Você já faturou R$ 40.000 de R$ 150.000. Faltam
   R$ 110.000 para o Áureo."
2. **Registro do pagamento do programa:** quanto já pagou, quais parcelas faltam ou se está quitado /
   em dia / atrasado — "tudo certinho, um controlezinho dele".
3. Visual, bem desenhado, para o aluno E para a equipe.

## Dados reais (medidos em 09/09)
- Meta: `gps.etapa1_clientes.valor_honorarios` dos `fase='contratado'` do AMBIENTE (já existe
  `resumoHonorarios` em `src/lib/etapa1.ts` e `META_HONORARIOS = 150000`; `MetaHonorarios` em
  `src/components/etapa1/meta-honorarios.tsx`).
- Programa: **`cs.vw_hm_financeiro`** (join por `contato_hm_id = cs.contatos_hm.id`, e
  `contatos_hm.aluno_id`): cobertura **96 de 96 contratos (94 alunos)**. Colunas úteis:
  `pacote_regra` (valor do programa pela regra do sip), `pago`, `saldo_a_perseguir`, `credito`,
  `parcelas_pagas`, `parcelas_contratadas`, `valor_parcela`, `pago_pct`, `quitado`, `cancelado`,
  `inadimplente`, `situacao` (`quitado`=64, `mensalidade_em_curso`=27, `saldo_parado`=3,
  `cancelado`=1, `incalculavel`=1), `status_parcela` (`quitado`=64, `aguardando`=26, `em_dia`=5,
  `atrasado`=1), `proxima_cobranca_em`, `ultimo_pagamento_em`, `dias_sem_pagar`, `entrada_valor`,
  `entrada_pago_em`, `pagamento_previsto_em`.
- Extrato: **`cs.vw_hm_extrato`** (mesmo `contato_hm_id`): 232 pagamentos; `categoria`
  (`sinal`=102, `mensalidade`=67, `saldo`=55, `compra_cheia`=8), `parcela`, `valor`, `pago_em`,
  `metodo_pagamento`.
- `postgres` lê as duas views; `authenticated` não (→ SECURITY DEFINER, mesma guarda de hoje).
- Amostra: `pacote=13751.62 pago=1449.98 saldo=11622.70 parc=1/12 vp=1149.99 pct=11.1 prox=2026-08-21`.
- 31 dos 125 ambientes continuam sem registro → "não disponível" (B7 mantido). AURUM (2) → aviso.

## Backend (`backend-engineer`, Opus)
**Migration `20260909000140_gps_financeiro_do_aluno_v2.sql`:**
- `drop function gps.financeiro_do_aluno(uuid)` + `create function gps.financeiro_do_aluno(p_aluno_id uuid)` com a MESMA guarda de hoje (admin OU titular na mesma linha de `gps.membros`; 42501; `search_path=''`; revoke antes do grant) devolvendo por contrato: `contato_hm_id, produto, plano, turma, valor_programa (=pacote_regra), pago, saldo (=saldo_a_perseguir), credito, parcelas_pagas, parcelas_contratadas, valor_parcela, pago_pct, quitado, cancelado, inadimplente, situacao, status_parcela, proxima_cobranca_em, ultimo_pagamento_em, entrada_valor, entrada_pago_em, cancelamento_em`. Fonte: `cs.contatos_hm h left join cs.vw_hm_financeiro f on f.contato_hm_id = h.id` (se a view não tiver linha, colunas nulas — a UI diz "não informado"). Ordem: cancelados por último, depois produto.
- `create function gps.financeiro_extrato_do_aluno(p_aluno_id uuid)` mesma guarda: `contato_hm_id, categoria, parcela, valor, pago_em, metodo_pagamento` de `cs.vw_hm_extrato` join `cs.contatos_hm` por `aluno_id`, ordem `pago_em`. Teto 200 linhas.
- Nada de escrita; comentários explicando que `pacote_regra`/`saldo_a_perseguir` são a regra do sip (fonte de verdade financeira) e que `credito` só é exibido.
**`src/lib/financeiro.ts`:** `ContratoFinanceiro` ganha os campos novos (nomes camelCase); `situacaoContrato` derivada: `cancelado` → "cancelado"; `quitado` → "quitado"; `inadimplente || status_parcela='atrasado'` → "atrasado"; `mensalidade_em_curso`/`em_dia`/`aguardando` → "em_dia"; `incalculavel`/nulos → "indefinido". `saldoExibido` = `saldo` (nunca 0 quando nulo). Novo `getExtratoDoAluno(alunoId)` (mesma guarda TS titular/admin, `sem_permissao` para sócio). Novo `ProgressoFaturamento` calculado no servidor a partir de `resumoHonorarios`: `faturado`, `meta = 150000`, `bonus = 250000`, `faltaParaMeta`, `faltaParaBonus`, `pctMeta` (teto 100), `nivelAtual` (`'em_andamento' | 'aureo' | 'bonus'`), `contratados`, `contratadosSemValor`, lista `{ clienteId, nome, valor }` dos contratados (só campos não sensíveis). Constantes `META_HONORARIOS = 150_000` (existe) e `BONUS_HONORARIOS = 250_000` (novo, em `etapa1.ts`).
Publicar contrato no fim deste arquivo ("CONTRATO FINANCEIRO V2 PUBLICADO"). Bloco de conferência para o orquestrador (guarda 42501 sem JWT; titular real lê; sócio 42501; contagem = 96; extrato do titular `67f5d002…` do ambiente `191699db…`).

## Frontend (`frontend-engineer`, Opus)
`src/components/financeiro/financeiro-view.tsx` vira o painel (Server Component; pode quebrar em subcomponentes na pasta `financeiro/`):
1. **Hero "Seu faturamento na mentoria"**: valor grande `brl(faturado)` + "de R$ 150.000"; barra com dois marcos desenhados (150k "Áureo · próximo nível", 250k "Bônus"); texto de estado: sem contratado → "Quando você marcar um cliente como Contratado e informar os honorários, ele entra aqui." (link Clientes); com valor → "Faltam {brl} para o Áureo" / "Você chegou ao Áureo! Faltam {brl} para o bônus" / "Você passou dos R$ 250.000 — bônus do programa." `contratadosSemValor > 0` → aviso "N contratado(s) ainda sem honorários informados" com link. Nunca "R$ 0 de R$ 150.000" como se fosse resultado: com 0 contratados, o número não aparece, aparece a instrução.
2. **Lista "Contratos fechados"**: cliente · honorários (`brl`) · link "Abrir ficha"; total.
3. **"Seu programa"** (por contrato): cabeçalho com badge de situação (Quitado / Em dia / Atrasado / Cancelado / Não informado — cor + ícone + texto), `pago` de `valor_programa` com barra `pago_pct`, "Falta pagar {saldo}" (ou nada se quitado), **parcelas**: "X de N pagas" com trilha de pontos (pagas preenchidas) quando `parcelas_contratadas` existe; "Próximo vencimento dd/mm" se `proxima_cobranca_em`; "Último pagamento dd/mm"; crédito abatido como linha própria se `credito > 0`; entrada (`entrada_valor`/`entrada_pago_em`) como linha; AURUM com aviso já existente.
4. **"Pagamentos"** (extrato, colapsável, `<details>`): data · categoria legível (sinal → "Sinal", mensalidade → "Parcela N", saldo → "Saldo", compra_cheia → "Pagamento integral") · valor · método legível (CREDIT_CARD → "Cartão", HOTMART_INSTALLMENTS → "Parcelado Hotmart", PIX, BILLET → "Boleto"…; desconhecido → texto cru em minúsculas).
5. Rodapé: "Fonte: cadastro financeiro do Grupo Participa, atualizado pela equipe. Não é editável aqui." Admin: linha técnica (`cs.vw_hm_financeiro`, `contato_hm_id`) + divergência quando houver.
6. Sem registro: estado atual ("Financeiro não disponível para este cadastro — fale com a equipe") **mas a seção 1 (meta) aparece mesmo assim** — ela depende dos clientes, não do sip.
7. Mobile 360; `moeda.ts`/`datas.ts`; `KpiCard`; a11y (barra com `role="progressbar"` e texto); cores só via tokens (`text-accent-foreground` para texto laranja).
Também: `MetaHonorarios` (home/Clientes) ganha os dois marcos e o texto "Áureo"/"Bônus" para bater com a aba (mesma função de cálculo).

## Regras mantidas
B7-b (sócio não vê; a página dele já explica), B7-c (crédito/cancelamento nunca somados), B7-d (null ≠ 0), B8 (150k = contratado, programa inteiro), B9 (visível ao admin), texto em português, nada de valor inventado (o bônus é "bônus do programa").

---

# CONTRATO FINANCEIRO V2 PUBLICADO (backend, 09/09/2026)

Arquivos: `supabase/migrations/20260909000140_gps_financeiro_do_aluno_v2.sql` (novo),
`src/lib/financeiro.ts` (reescrito), `src/lib/etapa1.ts` (+`BONUS_HONORARIOS`, +`ClienteHonorarios`,
+`progressoFaturamento`), `src/lib/data/clientes.ts` (+`getClientesHonorarios`), `src/lib/data.ts`
(reexport). **Nada em `src/components/**` nem em `src/app/**` foi tocado.**

## 1. RPCs (migração ...140 — o orquestrador aplica)

| Função | Guarda | Devolve |
|---|---|---|
| `gps.financeiro_pode_ler(uuid) → boolean` | — | admin OU titular do ambiente. É a guarda ÚNICA, usada pelas duas abaixo |
| `gps.financeiro_do_aluno(uuid)` | 42501 | 1 linha por contrato (`cs.contatos_hm` **left join** `cs.vw_hm_financeiro`) |
| `gps.financeiro_extrato_do_aluno(uuid)` | 42501 | ≤ 200 pagamentos (`cs.vw_hm_extrato`), `pago_em` **DESC** |

`gps.financeiro_do_aluno` foi **dropada e recriada** (returns table novo → 42P13 sem o drop).
Toda coluna sai com **cast explícito** (a migração foi escrita sem acesso ao banco: o cast converte
onde divergência de tipo explodiria com 42804 na primeira chamada, em produção). `contato_hm_id` e
`parcela` saem como **text** de propósito (id opaco; o sip pode gravar "1/12"). Datas saem como
**`date` já no fuso de São Paulo** (`set "TimeZone" = 'America/Sao_Paulo'` nas duas funções) — não
há timestamptz para o cliente reinterpretar e perder um dia.

## 2. TypeScript — `src/lib/financeiro.ts`

```ts
// ── Contrato do programa (sip) ─────────────────────────────────────────────
type SituacaoContrato = "cancelado" | "quitado" | "atrasado" | "em_dia" | "indefinido";

interface ContratoFinanceiro {
  contatoHmId: string | null;   // id OPACO do sip; não exibir ao aluno
  produto: string | null; plano: string | null; turma: string | null;
  valorPrograma: number | null; // = pacote_regra
  pago: number | null;
  saldo: number | null;         // = saldo_a_perseguir
  credito: number | null;       // B7-c: exibir rotulado, NUNCA somar
  parcelasPagas: number | null; parcelasContratadas: number | null;
  valorParcela: number | null;
  quitado: boolean | null; cancelado: boolean | null; inadimplente: boolean | null;
  situacaoSip: string | null;   // cru, só diagnóstico do admin
  statusParcela: string | null; // cru, só diagnóstico do admin
  proximaCobrancaEm: string | null;  // "YYYY-MM-DD" (SP)
  ultimoPagamentoEm: string | null;  // "YYYY-MM-DD" (SP)
  entradaValor: number | null; entradaPagoEm: string | null;
  cancelamentoEm: string | null;     // "YYYY-MM-DD" (SP)
  // derivados no servidor — a UI NÃO recalcula:
  situacao: SituacaoContrato;
  saldoExibido: number | null;       // cancelado→null · quitado→0 · demais→saldo (null fica null)
  pagoPct: number | null;            // 0–100 PRONTO para a barra (view, senão pago/valorPrograma)
  divergenciaQuitacao: number | null;// só admin, nos dois sentidos (FN1)
  semRegistroSip: boolean;           // contrato sem linha na view (lacuna de cadastro do sip)
}

type ResultadoFinanceiro =
  | { estado: "ok"; contratos: ContratoFinanceiro[] }
  | { estado: "sem_registro" } | { estado: "sem_permissao" } | { estado: "erro" };

// ── Extrato ────────────────────────────────────────────────────────────────
interface LinhaExtrato {
  contatoHmId: string;            // NÃO anulável (join pela PK) → serve de chave de Record
  categoria: string | null;       // sinal | mensalidade | saldo | compra_cheia (cru)
  parcela: number | null;         // já convertido; null quando o sip não gravou número
  valor: number | null;
  pagoEm: string | null;          // "YYYY-MM-DD" (SP)
  metodoPagamento: string | null; // CREDIT_CARD, PIX… (cru)
}

type ResultadoExtrato =
  | { estado: "ok"; linhas: LinhaExtrato[]; truncado: boolean }
  | { estado: "sem_registro" } | { estado: "sem_permissao" } | { estado: "erro" };

// ── Progresso de faturamento (banco do GPS, não do sip) ────────────────────
type NivelFaturamento = "em_andamento" | "aureo" | "bonus";
interface ContratadoResumo { clienteId: string; nome: string; valor: number | null }
interface ProgressoFaturamento {
  faturado: number | null;      // null = nenhum contratado com valor. NUNCA exibir como R$ 0
  meta: number;                 // 150_000
  bonus: number;                // 250_000
  faltaParaMeta: number | null; faltaParaBonus: number | null;  // 0 quando já bateu
  pctMeta: number | null;       // 0–100 sobre a META
  nivelAtual: NivelFaturamento;
  contratados: number; contratadosSemValor: number;
  clientes: ContratadoResumo[]; // maior valor primeiro; sem valor por último
}

// ── Assinaturas ────────────────────────────────────────────────────────────
getFinanceiroDoAluno(alunoId: string): Promise<ResultadoFinanceiro>
getExtratoDoAluno(alunoId: string):    Promise<ResultadoExtrato>
getProgressoFaturamento(alunoId: string): Promise<ProgressoFaturamento>  // lê só 4 colunas
progressoFaturamento(clientes: readonly ClienteHonorarios[]): ProgressoFaturamento  // pura
```

## 3. O que o frontend precisa saber

1. **`progressoFaturamento` é pura e mora em `@/lib/etapa1`**; `@/lib/financeiro` só a reexporta
   para conveniência dos Server Components. 🔴 **Client component importa de `@/lib/etapa1`** —
   importar de `@/lib/financeiro` puxa `@/lib/supabase/server` para o bundle. Vale para o
   `MetaHonorarios`, que também pega `BONUS_HONORARIOS` de `@/lib/etapa1` para desenhar o 2º marco.
2. **`getProgressoFaturamento(alunoId)` existe e é mais barato** que `getClientesEtapa1` +
   `progressoFaturamento`: lê 4 colunas (`id, nome, fase, valor_honorarios`) em vez das 20 da
   ficha — o egress do Supabase tem teto DA ORGANIZAÇÃO, dividido com o sip, e
   `registro_contato`/`perda_inercia` são anotação sobre TERCEIROS que não tem por que trafegar
   até uma tela de dinheiro. As páginas hoje usam `getClientesEtapa1`; trocar é 1 linha e o número
   é o MESMO (a conta é a mesma função).
3. **Extrato: `estado === "ok"` traz `linhas` e `truncado`.** `truncado` só é `true` ao bater o
   teto de 200 (hoje impossível: 232 pagamentos no sistema inteiro). Com `truncado`, **não somar**
   o extrato na tela — a soma confiável é o `pago` do card, que vem da regra do sip.
4. **Ordem do extrato é do mais recente para o mais antigo** (imposta no SQL, para o teto cortar o
   pagamento velho e nunca o de ontem). Se a tela quiser cronológico, inverta na UI.
5. **`pagoPct` já vem pronto para a barra** (0–100, com fallback calculado). `null` = mostrar
   frase, não barra de 0% — barra zerada afirma "você não pagou nada".
6. **`semRegistroSip`** distingue "contrato sem cadastro financeiro no sip" de "aluno sem
   contrato" (`estado: "sem_registro"`). O primeiro é card com badge "Não informado"; o segundo é
   a tela inteira de "Financeiro não disponível". A seção 1 (meta) aparece nos dois casos.
7. **`situacao === "indefinido"` nunca vira "Em dia" na tela** — inclui `incalculavel`,
   `saldo_parado` sem status de parcela e contrato sem linha na view.

## 4. Bloco de conferência (o orquestrador aplica e prova)

Aplicar a migração e rodar. Nenhuma escrita existe; o `rollback` é higiene.

```sql
-- 0) Se a RPC responder PGRST202 pelo PostgREST depois do apply:
--    notify pgrst, 'reload schema';

-- 1) SEM JWT: as duas funções falham FECHADO (42501). Se devolver linha, PARE.
begin;
  set local role authenticated;
  select gps.financeiro_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');           -- espera 42501
rollback;
begin;
  set local role authenticated;
  select gps.financeiro_extrato_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');   -- espera 42501
rollback;

-- 2) TITULAR real lê o próprio ambiente (>=1 contrato, extrato com linhas).
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"67f5d002-bf52-4764-b5cb-7f0c6df31eca","role":"authenticated"}', true);
  select contato_hm_id, produto, valor_programa, pago, saldo, credito,
         parcelas_pagas, parcelas_contratadas, valor_parcela, pago_pct,
         quitado, cancelado, inadimplente, situacao, status_parcela,
         proxima_cobranca_em, ultimo_pagamento_em,
         entrada_valor, entrada_pago_em, cancelamento_em
    from gps.financeiro_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');
  select * from gps.financeiro_extrato_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');
  -- 🔑 Se QUALQUER uma levantar 42804, um cast do returns table divergiu do tipo da view:
  --    é AQUI que isso aparece, e não em produção.
rollback;

-- 3) SÓCIO do MESMO ambiente: 42501 nas duas (B7-b). É o teste que não pode falhar.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"f508c710-...","role":"authenticated"}', true);
  select gps.financeiro_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');           -- espera 42501
rollback;
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"f508c710-...","role":"authenticated"}', true);
  select gps.financeiro_extrato_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');   -- espera 42501
rollback;

-- 4) ADMIN lê qualquer ambiente.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    '{"sub":"81d2eaee-...","role":"authenticated"}', true);
  select count(*) from gps.financeiro_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');
  select count(*) from gps.financeiro_extrato_do_aluno('191699db-b7b1-4e62-9793-24b280356e76');
rollback;

-- 5) A cobertura de 96 continua de pé (a v2 depende do join da view).
select count(*) filter (where f.contato_hm_id is not null) as com_view,
       count(*)                                            as contratos
  from cs.contatos_hm h
  left join cs.vw_hm_financeiro f on f.contato_hm_id = h.id;   -- espera 96 / 96

-- 6) Grants: anon sem nada, authenticated com execute nas três; stable + definer.
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       p.provolatile as volatilidade,   -- 's' = stable = o Postgres recusa escrita
       p.prosecdef  as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname in ('financeiro_do_aluno','financeiro_extrato_do_aluno','financeiro_pode_ler');
-- espera: anon = false nas 3 · authenticated = true nas 3 · 's' · true

-- 7) Nenhum grant novo em cs (a v2 não pode ter aberto a base do sip).
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'cs' and grantee in ('anon','authenticated');   -- espera 0 linhas

-- 8) Teto do extrato: hoje ninguém é truncado.
select max(qtd) from (
  select h.aluno_id, count(*) qtd
    from cs.vw_hm_extrato e join cs.contatos_hm h on h.id = e.contato_hm_id
   where h.aluno_id is not null group by 1) t;                        -- espera << 200
```

## 5. Desvios e riscos declarados

- **Não tenho banco.** Os tipos das colunas de `cs.vw_hm_financeiro`/`cs.vw_hm_extrato` não foram
  conferidos em `information_schema`; a defesa é o cast explícito coluna a coluna. O passo 2 do
  bloco acima é o que prova. Se algum cast falhar (ex.: `pago_pct` como text "11,1" com vírgula),
  o conserto é local a uma linha do `select`.
- **`gps.financeiro_pode_ler` é função nova, executável por `authenticated`.** Devolve booleano
  sobre o PRÓPRIO chamador — não vaza nada que ele já não saiba. Existe para as duas RPCs não
  poderem divergir na guarda.
- **`saldo_parado` (3 linhas) cai em `em_dia` quando `status_parcela` é `aguardando`/`em_dia`, e em
  `indefinido` caso contrário.** Não inventei rótulo para ele.
- **Bônus:** só a constante `BONUS_HONORARIOS = 250_000` e o texto "bônus do programa". O que é o
  bônus **não está escrito em lugar nenhum do código** — o Marcio não detalhou.
- **`npx tsc --noEmit` / `npm run build` / `npm run lint`:** meus arquivos passam. Falham 3 pontos
  em arquivos do **frontend em andamento**, registrados e não tocados por mim:
  1. `src/components/ui/barra-marcos.tsx:68` — `react-hooks/immutability` (reatribuir `anterior`
     dentro do `map`); resolve com `reduce` ou índice.
  2. `src/app/p/previa-fin2/page.tsx` (7 erros) — `FinanceiroView` passou a exigir a prop
     `extratoTruncado` e as 7 chamadas da prévia não a passam.
  3. ⚠️ **`src/app/p/previa-fin2/` é rota PÚBLICA** (`/p/*` é prefixo público em `src/proxy.ts` e
     tem `frame-ancestors` com allowlist da Hotmart, não `DENY`). Mesmo com dados de amostra, é
     uma prévia da aba Financeiro acessível sem login e embedável. **Não deve ir para a `main`.**

## Aplicado e conferido pelo orquestrador (09/09)
- Migration ...140 aplicada. Titular real (`set role authenticated` + JWT): 1 contrato — `prog=15000 pago=15000.04 saldo=0 parc=0/ pct=100 sit=quitado st=quitado ult=2026-08-18`; extrato 2 linhas (`2026-08-18 saldo 14700.04`, `2026-07-26 sinal 300.00`). Sócio do mesmo ambiente → 42501 nas duas RPCs. Casts das views OK (nenhum 42804).
