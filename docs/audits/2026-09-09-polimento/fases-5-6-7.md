# Fases 5, 6 e 7 — desenho do arquiteto (08/09/2026)

Documento de execução para `backend-engineer` e `frontend-engineer` (Opus), com trava final do
`fable-orchestrator` e pentest obrigatório nas Fases 6 e 7.

> **Escopo:** só estas três fases. Outro arquiteto cuida em paralelo do polimento geral
> (UX/perf/design system) — **não entre lá**. Aqui só se toca UX quando a feature exige.
>
> **Regras herdadas que valem em tudo abaixo:** nada de `service_role`; RLS ligada em toda tabela
> nova; migration com cabeçalho (motivação, o que NÃO faz, reversão literal); função recriada
> **parte do corpo VIGENTE extraído do banco**, nunca do que está no repo; índice só com a query
> que ele serve escrita ao lado; `npm run build` verde antes de fechar; **não aplicar migration no
> banco nem commitar** — quem aplica é o João.

---

## 0. Decisões que eu fechei no lugar do Marcio

Todas conservadoras e reversíveis. Cada uma com o custo na mesa.

| # | Decisão | Por quê (1–2 linhas) |
|---|---|---|
| **B2** | **Confirmado.** Não existe tela de notas para o aluno. A Fase 5 é *descoberta + velocidade* do Diário que já existe: nota rápida no card do painel, última nota visível no card, filtros por nota. | A migration `20260908000001` proíbe **em texto** expor `gps.aluno_notas` ao aluno (dado de terceiro no texto livre). O pedido do Marcio ("notas de status por aluno, histórico com data, nota nova no topo") já está entregue — o defeito é que ele não sabe que existe. |
| **B2-b** | O card do painel mostra **prévia de 140 caracteres gerada no banco** (`left(texto,140)`), nunca o texto inteiro. | Reduz o que trafega e o que fica em cache do navegador de uma tela de lista. O público é o mesmo (admin), o volume não precisa ser. |
| **B5** | **Autorizado, com a diferença registrada.** Anexo de chamado ≠ documento do cliente. | O anexo de chamado é **prova de um problema no portal** (print de erro, comprovante), efêmero, com retenção e expurgo. Documento do cliente (contrato, RG, matrícula) continua indo **só** para o Drive — a decisão de 07/2026 segue de pé e a UI diz isso em texto. |
| **B5-b** | Bucket **NOVO** `gps-chamados`, não o `gps-documentos` órfão. | `gps-documentos` está **sem limite de tamanho e sem allowlist de MIME**, e carrega o histórico do fichário removido. Nascer com 5 MB + 4 MIMEs é mais barato do que endurecer o velho. |
| **B5-c** | **Só o aluno anexa.** A equipe responde com texto e link. | Metade da superfície de upload e metade do crescimento de storage, por um custo quase nulo: a equipe já tem o Drive. Reverter é acrescentar `or public.gp_is_admin()` em `gps.pode_anexar_chamado`. |
| **B6** | **Retenção de 180 dias** para anexo de chamado fechado. **O expurgo é uma ação do admin na tela**, com contador que não some — **não** é `pg_cron`. | 🔴 Apagar a linha de `storage.objects` por SQL **não apaga o arquivo no object store**: um cron SQL reportaria sucesso e deixaria os bytes. O expurgo real exige a Storage API, que exige uma sessão — e o GPS não usa `service_role`. A sessão do admin no navegador é a única credencial legítima disponível. Reverter/afrouxar = trocar o `interval '180 days'` e reaplicar a função. |
| **B7** | **Opção (c) confirmada**: "Financeiro não disponível para este cadastro — fale com a equipe." E a aba **fica visível** para os 31 sem linha. | Esconder a aba deixaria a lacuna de cadastro invisível para sempre. Para o admin, a mesma tela acrescenta "Nenhum registro em `cs.contatos_hm` para este `aluno_id`" — o time descobre que é buraco de cadastro, não bug. |
| **B7-b** | 🔴 **O SÓCIO NÃO VÊ o Financeiro.** Só titular e admin. A aba nem aparece para ele. | O contrato de pagamento é do titular; o sócio nunca assinou. São **13 sócios em 13 ambientes** — gente real. Alargar depois é uma linha na guarda da RPC; ter mostrado a dívida de alguém não se desfaz. |
| **B7-c** | `credito_valor_pago` e `cancelamento_valor` **nunca entram na aritmética**. Aparecem como linha própria, rotulada. | A semântica dos dois é do `sip` e não está provada aqui. Somar/subtrair sem saber o sinal produz um número plausível e errado — foi exatamente assim que o COALESCE virou "taxa zero" por 5 semanas. Exibir sem calcular é honesto e reversível. |
| **B7-d** | Saldo desconhecido é **`null` e a tela diz "não informado"** — nunca R$ 0,00. | `coalesce(valor_total - valor_pago, 0)` transforma buraco em número. "Você pagou R$ 0,00" para quem pagou é pior do que "não informado". |
| **B8** | Meta = **R$ 150.000** somando `valor_honorarios` dos clientes em `fase='contratado'` **do ambiente**, **programa inteiro**, valor **contratado** (não recebido). | É o pedido literal ("comprovação de faturamento"). Programa inteiro, não por ano/turma: não existe hoje nenhuma coluna de competência em `etapa1_clientes` que sustentasse o recorte. |
| **B9** | Honorários e contrato são **visíveis e editáveis pelo aluno** (é dado dele, ele mesmo digita) **e visíveis ao admin** (a comprovação). **Não é família do Diário.** | O Diário é texto da **equipe sobre o aluno**, com PII de terceiro embutida. Honorário é um **número que o próprio aluno digita sobre o cliente dele**. Confundir os dois travaria a feature sem ganho de privacidade. |
| **B9-b** | **Sem CHECK ligando `valor_honorarios` a `fase='contratado'`.** O valor sobrevive a voltar de fase; a ficha o mostra em somente-leitura com o aviso de que não conta na meta. | Constraint de coerência viraria catraca: mover o cliente de volta falharia até alguém apagar o valor — e apagar dado por mudança de estado é perda silenciosa. |
| **C4/UI** | Nova chave de ícone no `NavTabs` (`suporte` → `LifeBuoy`, `financeiro` → `Wallet`). | O comentário em `nav.ts` que diz "não inventar chave de ícone" nasceu para evitar churn de ícone, não para proibir aba nova legítima. Duas abas novas com ícone errado custam mais do que duas linhas num `Record`. |

### CONFLITO encontrado no levantamento

**Não existe e-mail de suporte na UI hoje.** Medido: `rg -in "suporte|mailto|contato@|advmais\.com" src/` → **zero ocorrências**.
O ticket **não substitui** nada visível — ele preenche um vazio: hoje o aluno não tem nenhum canal
dentro do portal. Consequência prática para o `frontend-engineer`: **não escrever copy do tipo
"no lugar do e-mail"**. A copy correta é "Fale com a equipe por aqui".

### BLOQUEIO

**Nenhum.** Todas as ambiguidades foram resolvidas por caminho conservador e reversível, com a
consequência escrita acima. Ver §8 para as duas perguntas que valem levar ao Marcio **sem travar
a execução**.

---

## 1. FASE 5 — o Diário descoberto (B2)

**Conceito:** o Diário deixa de ser uma aba escondida dentro do ambiente e passa a ser uma
**coluna do painel** — a equipe vê o que já sabe sobre cada aluno e escreve sem sair da lista.

### 1.1 Banco — `supabase/migrations/20260909000080_gps_admin_painel_atendimento.sql`

Uma função só. Nenhuma tabela nova, nenhuma coluna nova, **nenhum dado muda de valor** (0 linhas).

```sql
-- Painel do admin (/admin) — o que a equipe precisa saber sobre cada aluno ANTES
-- de abrir o ambiente: pendência aberta, quando foi a última nota e um trecho dela.
--
-- MOTIVAÇÃO: o Diário existe desde 08/09 e o Marcio pediu a feature de novo (B2) —
-- ele não sabe que existe. O defeito é de DESCOBERTA, não de modelo. A tabela
-- gps.aluno_notas continua EXCLUSIVA DO ADMIN (migração 20260908000001, LGPD);
-- esta função não muda nada disso, ela só leva o resumo para a lista.
--
-- SUBSTITUI getPendenciasPorAluno (src/lib/data.ts), que lia todas as pendências
-- abertas da base e agregava num laço em JavaScript. Aqui a agregação acontece
-- onde o dado está e o painel continua com o MESMO número de idas ao banco.
--
-- NOME: `atendimento`, não `diario`. A Fase 6 (chamados) acrescenta uma coluna
-- nesta mesma função — batizar de `diario` obrigaria a renomear depois.
--
-- SECURITY INVOKER de propósito (NÃO é definer): a RLS de gps.aluno_notas já é a
-- fonte de verdade (só gp_is_admin() faz select). Um DEFINER teria de reimplementar
-- essa regra e viraria um segundo lugar para esquecer de mantê-la. A guarda
-- explícita com 42501 existe para a falha ser BARULHENTA — sem ela, um não-admin
-- receberia lista vazia, idêntica a "nenhuma nota no sistema".
--
-- `left(n.texto, 140)`: o texto integral da nota NUNCA sai do banco para uma tela
-- de LISTA. O público é o mesmo (admin), o volume não precisa ser — a maior nota
-- real tem 5.100 caracteres e são 125 ambientes.
--
-- ÍNDICES: nenhum novo. `distinct on (aluno_id) ... order by aluno_id, criado_em desc`
-- é servido por idx_aluno_notas_timeline (aluno_id, criado_em desc) e a contagem de
-- pendência por idx_aluno_notas_pendencia_aberta — os dois já existem (migração
-- 20260908000001) e os predicados batem letra por letra.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não cria policy nenhuma para o aluno em gps.aluno_notas (C3 continua valendo);
--   * não devolve `texto` integral, `autor_id` nem `evento_id`;
--   * não toca gps.admin_painel_alunos() — são duas funções com donos diferentes
--     (números da Etapa 01 x atendimento), e fundir as duas faria toda mudança de
--     uma exigir revalidar a outra.
--
-- REVERSÃO: `drop function gps.admin_painel_atendimento();` e reverter o commit de
-- src/lib/data.ts (que restaura getPendenciasPorAluno). Nenhum dado é escrito.

create or replace function gps.admin_painel_atendimento()
returns table (
  aluno_id           uuid,
  pendencias_abertas integer,
  ultima_nota_em     timestamptz,
  ultima_nota_tipo   text,
  ultima_nota_resumo text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
  with ult as (
    select distinct on (n.aluno_id)
           n.aluno_id       as aluno_id,
           n.criado_em      as criado_em,
           n.tipo           as tipo,
           left(n.texto, 140) as resumo
      from gps.aluno_notas n
     order by n.aluno_id, n.criado_em desc
  ),
  pend as (
    -- Toda pendência é uma nota, então `pend` é sempre subconjunto de `ult`:
    -- left join basta, full join seria ruído.
    select n.aluno_id as aluno_id, count(*)::integer as abertas
      from gps.aluno_notas n
     where n.tipo = 'pendencia' and n.resolvido_em is null
     group by n.aluno_id
  )
  select u.aluno_id,
         coalesce(p.abertas, 0),
         u.criado_em,
         u.tipo,
         u.resumo
    from ult u
    left join pend p on p.aluno_id = u.aluno_id;
end;
$$;

comment on function gps.admin_painel_atendimento() is
  'Uma linha por aluno COM NOTA: pendencias abertas + data/tipo/trecho da ultima nota, para os cards de /admin. Substitui getPendenciasPorAluno (agregacao em JavaScript sobre a base inteira). SECURITY INVOKER: a RLS so-admin de gps.aluno_notas continua sendo a unica fonte de verdade; a guarda gp_is_admin() existe para a falha ser barulhenta em vez de virar lista vazia. Devolve no maximo 140 caracteres do texto -- nota integral nao vai para tela de lista.';

revoke execute on function gps.admin_painel_atendimento() from public, anon;
grant  execute on function gps.admin_painel_atendimento() to authenticated;
```

### 1.2 Backend TS (`backend-engineer`)

`src/lib/data.ts` — **remove** `getPendenciasPorAluno`, **acrescenta**:

```ts
export interface AtendimentoDoAluno {
  pendenciasAbertas: number;
  ultimaNotaEm: string | null;
  ultimaNotaTipo: TipoNota | null;
  /** Trecho de até 140 caracteres, cortado no BANCO. Nunca o texto integral. */
  ultimaNotaResumo: string | null;
}

/** Resumo de atendimento por ambiente, para os cards de /admin. Só admin. */
export async function getAtendimentoPorAluno(): Promise<Map<string, AtendimentoDoAluno>>;
```

Regras: mesmo tratamento de erro de `getAlunosGps` (`console.error` com `code/message/details/hint`
e **Map vazio**, nunca engolir em silêncio). Sem `ehAdmin()` extra — a RPC já devolve 42501.

`src/app/admin/page.tsx`: troca `getPendenciasPorAluno()` por `getAtendimentoPorAluno()` no
`Promise.all` (continuam **4 consultas**) e passa `atendimentoPorAluno={Object.fromEntries(...)}`.

### 1.3 Frontend (`frontend-engineer`)

**Contrato recebido:** `AlunosAtivosLista` troca a prop
`pendenciasPorAluno: Record<string, number>` por
`atendimentoPorAluno: Record<string, AtendimentoDoAluno>` (mesmo shape do backend acima).

1. **🔴 Reestruturar o card antes de tudo.** Hoje o `<Card>` inteiro está dentro de um `<Link>`
   (`alunos-ativos-lista.tsx`). Botão dentro de link é HTML inválido, quebra teclado e o clique
   navega em vez de abrir o diálogo. Trocar por: `<Card className="relative ...">` +
   `<Link className="absolute inset-0 z-0" aria-label={"Abrir o ambiente de " + nome} />` e todo
   controle interativo com `className="relative z-10"`. Sem `stopPropagation` — o empilhamento
   resolve.
2. **Nota rápida** — `src/components/admin/nota-rapida.tsx` (client): botão discreto
   `<Button variant="ghost" size="sm">` com ícone `NotebookPen`, rótulo **"Nota rápida"**, abre
   `Dialog` com `DiarioForm` já existente (`alunoId`, `aoRegistrar={() => setOpen(false)}`).
   **Zero action nova** — `registrarNota` já faz tudo e já revalida `/admin`.
   Para não empilhar `Card` dentro de `DialogContent`: acrescentar a `DiarioForm` a prop
   `variante?: "cartao" | "embutido"` (default `"cartao"`, comportamento atual intacto);
   `"embutido"` renderiza os mesmos campos sem o wrapper `Card`/`CardHeader`.
   `DialogTitle`: **"Nota rápida — {nome do aluno}"**. `DialogDescription`:
   "Fica no Diário do aluno. O aluno não vê."
3. **Última nota no card** — abaixo do e-mail, uma linha:
   `<Badge>{ROTULO_TIPO[tipo]}</Badge> {resumo}… · {formatarDataHora(ultimaNotaEm)}`,
   `truncate`, `title` **com o mesmo trecho** (não inventar tooltip com texto que não veio).
   Sem nota: **"Sem nota no Diário"** em `text-muted-foreground` — nunca "—".
4. **Filtros** (padrão `FiltroCheckbox`, que já se esconde quando `total === 0`):
   - `Com nota nos últimos 7 dias (N)`
   - `Sem nenhuma nota (N)`
   Combinam por AND com os existentes, tudo em memória.
5. **Ordenação**: novo item no `Select` — `Ordenar: nota mais recente`. Reusa o helper `porData`
   que já está no arquivo (ausência de data vai sempre para o fim, nas duas direções).
6. Textos vazios/erro: o `CardContent` de "nenhum aluno" já monta a frase a partir de
   `filtrosAtivos` — só acrescentar os dois rótulos novos ao array.

### 1.4 Critérios de aceite — Fase 5

```bash
npx tsc --noEmit && npm run lint && npm run build         # verde
rg -n "getPendenciasPorAluno" src/                        # tem de voltar VAZIO
rg -n "<Link[^>]*>\s*<Card" src/components/admin/alunos-ativos-lista.tsx   # VAZIO
```

```sql
-- 1) não-admin recebe 42501 (rodar com JWT de aluno):
select * from gps.admin_painel_atendimento();      -- espera: 42501

-- 2) o trecho nunca passa de 140:
select max(length(ultima_nota_resumo)) from gps.admin_painel_atendimento();  -- <= 140

-- 3) a contagem casa com a fonte antiga (0 divergências):
select a.aluno_id
  from gps.admin_painel_atendimento() a
  full join (select aluno_id, count(*) c from gps.aluno_notas
              where tipo='pendencia' and resolvido_em is null group by 1) b
    on b.aluno_id = a.aluno_id
 where coalesce(a.pendencias_abertas,0) is distinct from coalesce(b.c,0);   -- 0 linhas

-- 4) plano: os dois índices existentes são usados, sem Seq Scan em aluno_notas
explain (analyze, buffers) select * from gps.admin_painel_atendimento();
```

Validação no navegador (regra "build verde não prova tela boa"): abrir `/admin` logado como admin,
conferir que (a) o card abre o ambiente ao clicar em qualquer área vazia, (b) "Nota rápida" abre o
diálogo **sem navegar**, (c) a nota registrada aparece no card **sem F5** (revalidação),
(d) os dois filtros novos somam com os três antigos.

---

## 2. FASE 7-B — meta de 150k e honorários (B8/B9)

**Conceito:** o cliente contratado passa a carregar **quanto o aluno vai receber por ele** e
**onde está o contrato**. A soma dos contratados é a comprovação de faturamento do ambiente.

**Backfill: zero linhas mudam de valor.** As duas colunas nascem `null` para as 879 linhas. Não há
promoção nem rebaixamento de ninguém. O risco desta fase é de **leitura**, não de escrita — ver
"campo novo nasce vazio" em 2.4.

### 2.1 Banco — `20260909000090_gps_etapa1_clientes_honorarios.sql`

```sql
-- Cliente contratado passa a registrar HONORÁRIOS e o LINK do contrato.
--
-- MOTIVAÇÃO (feature 6 do Marcio): comprovação de faturamento. A meta é
-- R$ 150.000 por AMBIENTE, somando `valor_honorarios` dos clientes em
-- fase='contratado' -- programa inteiro, valor CONTRATADO, não recebido (B8).
--
-- LINK, NÃO UPLOAD: o contrato do cliente é documento do cliente e continua no
-- Drive (decisão de 07/2026, que o fichário quebrou). `contrato_url` guarda o
-- endereço; nenhum byte entra no GPS por aqui. O anexo da Fase 6 é outra coisa
-- (prova de problema no portal) e mora em bucket separado.
--
-- BACKFILL: NENHUM. As duas colunas nascem NULL nas 879 linhas; zero linha muda
-- de valor; ninguém é promovido nem rebaixado. Uma consequência disso é de
-- TELA, não de banco: um KPI sobre coluna recém-criada mostra vazio como se
-- fosse resultado. A UI é obrigada a distinguir "nenhum honorário registrado
-- ainda" de "R$ 0,00" -- ver o plano da Fase 7-B, item 2.4.
--
-- SEM CHECK LIGANDO `valor_honorarios` A `fase='contratado'` (B9-b): seria uma
-- catraca. Mover o cliente de volta para fechamento passaria a falhar até
-- alguém apagar o valor, e apagar dado por mudança de estado é perda
-- silenciosa. A regra "só contratado conta" vive na SOMA, não na constraint.
--
-- URL: o CHECK exige https e proíbe espaço em branco. É o que impede
-- `javascript:`, `data:` e `http://` de entrarem na coluna -- a sanitização no
-- front é conveniência, esta é a garantia.
--
-- SEM ÍNDICE: toda leitura de cliente é `where aluno_id = $1` e devolve <= 30
-- linhas (já servida por etapa1_clientes_aluno_idx); a agregação do painel
-- varre a tabela inteira de propósito (ver comentário de admin_painel_alunos).
-- Índice em valor_honorarios/fase seria peso morto de escrita.
--
-- REVERSÃO:
--   alter table gps.etapa1_clientes
--     drop column contrato_url,
--     drop column valor_honorarios;
--   ⚠️ perde os valores digitados desde a aplicação. Antes de reverter:
--   `create table gps.honorarios_backup as select id, aluno_id, valor_honorarios,
--    contrato_url from gps.etapa1_clientes where valor_honorarios is not null
--    or contrato_url is not null;`

alter table gps.etapa1_clientes
  add column valor_honorarios numeric(12,2)
    constraint chk_etapa1_clientes_honorarios_nao_negativo
      check (valor_honorarios is null or valor_honorarios >= 0),
  add column contrato_url text
    constraint chk_etapa1_clientes_contrato_url
      check (contrato_url is null
             or (contrato_url ~ '^https://[^[:space:]]+$'
                 and length(contrato_url) between 12 and 2000));

comment on column gps.etapa1_clientes.valor_honorarios is
  'Honorarios CONTRATADOS do aluno com este cliente, em reais. Soma dos clientes em fase=contratado e a comprovacao de faturamento do ambiente (meta de R$ 150.000, B8). Valor CONTRATADO, nao recebido -- o portal nao sabe o que ja entrou no caixa do aluno. Preenchido pelo proprio aluno; visivel ao aluno e ao admin (B9). NAO ha constraint ligando a coluna a `fase`: o valor sobrevive a volta de fase e simplesmente deixa de contar na meta.';

comment on column gps.etapa1_clientes.contrato_url is
  'Link (https) do contrato no Google Drive. LINK, nao upload: documento do cliente continua fora do GPS (decisao de 07/2026). O CHECK exige https e proibe espaco -- e o que barra javascript:/data:/http:.';
```

### 2.2 Banco — `20260909000091_gps_admin_painel_alunos_honorarios.sql`

```
🔴 backend-engineer, ANTES de escrever este arquivo:
   select pg_get_functiondef('gps.admin_painel_alunos()'::regprocedure);
   Parta DESSE corpo. O repo tem ...050 e ...061; se houver uma terceira versão
   aplicada direto no banco, copiar do repo apaga a diferença em silêncio.
```

Acrescentar à CTE `cli` (mesma varredura, zero query nova):

```sql
sum(c.valor_honorarios) filter (where c.fase = 'contratado')            as honorarios_contratados,
count(*) filter (where c.fase = 'contratado')::integer                  as contratados,
count(*) filter (where c.fase = 'contratado'
                   and c.valor_honorarios is null)::integer             as contratados_sem_valor,
```

e três colunas no `returns table` (`honorarios_contratados numeric`, `contratados integer`,
`contratados_sem_valor integer`), com `coalesce(cl.honorarios_contratados, 0)` só para as
**contagens** — `honorarios_contratados` fica `null` quando não há contratado, para a UI conseguir
distinguir "nenhum" de "zero".

⚠️ **`create or replace` não muda a lista de colunas de retorno** (42P13). Este arquivo tem de ser
`drop function gps.admin_painel_alunos(); create function ...` **no mesmo arquivo/transação** —
sem argumentos não há risco de sobrecarga ambígua, e a janela em que a função não existe é a da
transação. Escrever isso no cabeçalho.

Cabeçalho tem de dizer também: **não muda nenhum número existente** (`preenchidos`, `com_dados`,
`com_perda`, `agendados`, `tarefas_concluidas`, `ultimo_acesso` e a ordem final ficam idênticos);
reversão = reaplicar o corpo da ...061 (colado literal no cabeçalho).

### 2.3 Banco — `20260909000092_gps_aluno_eventos_honorarios.sql`

Auditar **`valor_honorarios`** no Diário. `contrato_url` **não** é auditado (link muda por
manutenção; a disputa é sempre sobre o valor).

Passos, nesta ordem, espelhando a `...060`:
1. Bloco `do $$` que **descobre o nome real** do CHECK de `gps.aluno_eventos.tipo` procurando
   `pg_get_constraintdef(...) like '%cliente_fase_mudou%'`, e **aborta a migração** se não achar.
   (Se errar o nome, o `drop ... if exists` vira no-op, o INSERT do tipo novo falha **dentro** da
   trigger, que engole exceção por design — o evento sumiria sem barulho.)
2. Recriar o CHECK com a lista atual **+ `'cliente_honorarios_definidos'`**.
3. `create or replace function gps.aluno_eventos_capturar_etapa1_clientes()`
   🔴 **partindo do corpo VIGENTE extraído do banco** (`pg_get_functiondef`), acrescentando um
   único bloco, dentro do `begin ... exception when others` que já existe:

```sql
    if new.valor_honorarios is distinct from old.valor_honorarios then
      insert into gps.aluno_eventos
        (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
      values
        (v_aluno_id, now(), 'cliente_honorarios_definidos', 'cliente', new.id, v_rotulo,
         jsonb_build_object('de', old.valor_honorarios, 'para', new.valor_honorarios),
         v_ator, auth.uid(), 'app');
    end if;
```

4. `comment on constraint` atualizado, repetindo a regra: **acrescentar tipo aqui sem acrescentar
   em `TIPOS_EVENTO` (`src/lib/types.ts`) deixa o rótulo da trilha sem tradução.**

Reversão: recriar o CHECK sem o tipo novo (só possível se nenhuma linha desse tipo existir; manter
o tipo permitido é inofensivo e é o caminho recomendado) + reaplicar o corpo da `...060`.

### 2.4 Frontend + backend TS

**Contrato back↔front (o backend fecha primeiro, o front lê o arquivo antes de começar):**

`src/lib/types.ts`
```ts
export interface ClienteEtapa1 {
  /* … campos atuais … */
  /** Honorários CONTRATADOS deste cliente, em reais. `null` = não informado (≠ zero). */
  valor_honorarios: number | null;
  /** Link https do contrato no Drive. */
  contrato_url: string | null;
}
export const TIPOS_EVENTO = [ /* … */ , "cliente_honorarios_definidos"] as const;
```

`src/lib/etapa1.ts`
```ts
/** Meta de faturamento por ambiente, em reais (B8: programa inteiro, valor contratado). */
export const META_HONORARIOS = 150_000;

export interface ResumoHonorarios {
  /** Soma dos contratados COM valor. `null` quando nenhum contratado tem valor. */
  total: number | null;
  contratados: number;
  contratadosSemValor: number;
  /** 0–100, limitado a 100. `null` quando `total` é `null`. */
  pct: number | null;
}
export function resumoHonorarios(clientes: ClienteEtapa1[]): ResumoHonorarios;
```
Função **pura**, no mesmo arquivo do catálogo, pelo mesmo motivo de `resumoEtapa1`: a tela do aluno
e o painel do admin têm de mostrar **o mesmo número**, e a regra não pode ser duplicada em SQL e em
JS com liberdade de divergir.

`src/lib/data.ts` — `AlunoGps` ganha:
```ts
  /** Soma de `valor_honorarios` dos clientes em `fase='contratado'`. `null` = nenhum valor. */
  honorariosContratados: number | null;
  contratados: number;
  contratadosSemValor: number;
```

`src/app/etapa-1/actions.ts` — 🔴 **acrescentar `"valor_honorarios"` e `"contrato_url"` NOS DOIS
lugares**: no `Pick` de `PatchCliente` **e** no `Set` `CHAVES_PATCH_CLIENTE`. Só no `Pick`, o campo
é silenciosamente descartado em runtime (o filtro é allowlist) e a feature nasce morta sem erro.
Validar no servidor antes de mandar ao banco: `valor_honorarios` finito e `>= 0` ou `null`;
`contrato_url` começando com `https://`, sem espaço, `<= 2000` — mesma regra do CHECK, para o erro
chegar em português e não como `23514`.

**UI — `frontend-engineer`:**

1. **`cliente-ficha.tsx`** — bloco novo "Contrato", **abaixo** de "Andamento do contato":
   - `fase === "contratado"` → campos editáveis **Honorários** (`mascaraMoeda`/`moedaParaNumero`,
     igual a "Perda pela inércia") e **Link do contrato** (`type="url"`, `placeholder="https://drive.google.com/…"`,
     ajuda: *"Cole o link do contrato na sua pasta do Drive. O arquivo não é enviado para o portal."*).
   - `fase !== "contratado"` **e** já existe valor → mostrar **somente leitura**:
     *"Honorários registrados: R$ X — não contam na meta enquanto o cliente estiver em {fase}."*
     🔑 Nunca apagar o valor ao mudar de fase e nunca escondê-lo: dado invisível é dado perdido.
   - `fase !== "contratado"` e sem valor → não renderizar nada.
   - Link salvo é exibido como `<a target="_blank" rel="noopener noreferrer">`.
2. **Barra de meta** — `src/components/etapa1/meta-honorarios.tsx` (Server Component, sem estado):
   recebe `ResumoHonorarios` e renderiza **valor + comparação + barra** (nessa ordem):
   `R$ 42.000 <span>de R$ 150.000</span>` + `<Progress value={pct} />` + linha de apoio.
   **Três estados, obrigatórios:**
   | estado | o que aparece |
   |---|---|
   | `contratados === 0` | *"Nenhum cliente contratado ainda. A meta de R$ 150.000 começa a contar quando você mover um cliente para Contratado."* — **sem barra, sem 0%** |
   | `contratados > 0 && total === null` | *"{N} cliente(s) contratado(s), nenhum com honorários registrados. Registre o valor na ficha para acompanhar a meta."* — **sem barra** |
   | `total !== null` | barra + *"{N} de {M} contratados ainda sem valor registrado."* quando `contratadosSemValor > 0` |
3. **Onde entra** — **zero query nova** nos três lugares (os clientes já estão carregados):
   - `src/app/page.tsx` (home do aluno) → dentro de `HomeResumo`, como linha + barra abaixo de
     "Progresso geral". `HomeResumo` ganha a prop `honorarios: ResumoHonorarios`.
   - `src/app/admin/aluno/[alunoId]/page.tsx` (home da assistência) → mesmo componente, acima de
     `EtapasOverview`.
   - `clientes-manager.tsx` → acima da lista, ao lado de "{preenchidos} de 30 preenchidos".
4. **`alunos-ativos-lista.tsx`** — no bloco de números do card, entre "reuniões" e a barra da
   Etapa 01: `R$ 42k` + rótulo `honorários`; `contratados === 0` mostra `—` com
   `title="Nenhum cliente contratado"`. Novo item de ordenação `Ordenar: honorários`
   (desc, `null` sempre no fim, desempate por nome).
   ⚠️ **Este arquivo é o mesmo da Fase 5** — ver §5 (ordem de execução).

### 2.5 Critérios de aceite — Fase 7-B

```bash
npx tsc --noEmit && npm run lint && npm run build
rg -n "valor_honorarios" src/app/etapa-1/actions.ts   # tem de aparecer 2x (Pick e Set)
```

```sql
-- 1) nenhuma linha mudou de valor:
select count(*) from gps.etapa1_clientes
 where valor_honorarios is not null or contrato_url is not null;   -- 0 logo após aplicar

-- 2) o CHECK da URL barra o que tem de barrar (rodar em transação com rollback):
begin;
  update gps.etapa1_clientes set contrato_url = 'javascript:alert(1)' where id = (select id from gps.etapa1_clientes limit 1);  -- espera 23514
rollback;
begin;
  update gps.etapa1_clientes set contrato_url = 'http://x.com/a' where id = (select id from gps.etapa1_clientes limit 1);       -- espera 23514
rollback;

-- 3) valor negativo é recusado:
begin;
  update gps.etapa1_clientes set valor_honorarios = -1 where id = (select id from gps.etapa1_clientes limit 1);                 -- espera 23514
rollback;

-- 4) o evento nasce, e SÓ para valor (teste de venda com rollback):
begin;
  update gps.etapa1_clientes set valor_honorarios = 1000 where id = (select id from gps.etapa1_clientes limit 1);
  select tipo, detalhe from gps.aluno_eventos order by ocorrido_em desc limit 1;  -- cliente_honorarios_definidos {de:null,para:1000}
  update gps.etapa1_clientes set contrato_url = 'https://drive.google.com/x' where id = (select id from gps.etapa1_clientes limit 1);
  select count(*) from gps.aluno_eventos where ocorrido_em > now() - interval '1 minute';  -- continua 1
rollback;

-- 5) o painel não mudou nenhum número antigo (rodar ANTES e DEPOIS, comparar):
select aluno_id, clientes_preenchidos, clientes_com_dados, clientes_com_perda, agendados
  from gps.admin_painel_alunos() order by aluno_id;
```

Navegador: mover um cliente para Contratado, digitar honorários, ver a barra mudar na home **e** na
aba Clientes; mover de volta para Fechamento e conferir que o valor **continua visível em somente
leitura** e **saiu da meta**.

---

## 3. FASE 7-A — aba Financeiro (B7)

**Conceito:** o aluno vê **o próprio contrato do programa** — quanto é, quanto pagou, quanto falta —
lido de `cs.contatos_hm`, **sem nunca escrever lá**, e com a tela dizendo de onde o número vem.

### 3.0 🔴 Medição obrigatória antes de escrever a migration

O `backend-engineer` roda e **cola o resultado no relatório**:

```sql
-- (a) tipo real de cada coluna (o SQL abaixo é escrito às cegas até isto rodar)
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='cs' and table_name='contatos_hm'
   and column_name in ('aluno_id','valor_total','valor_pago','saldo_a_pagar_manual',
       'cancelamento_valor','credito_valor_pago','pagamento_forma','pagamento_parcelas',
       'pagamento_em','pagamento_previsto_em','quitado_em','produto','plano','turma',
       'cancelamento_em','contrato_aurum')
 order by column_name;

-- (b) quais PRODUTOS aparecem para quem está no GPS (o AURUM tem saldo que vem de
--     planilha, não da compra -- se aparecer, a tela precisa de um aviso)
select h.produto, count(*)
  from cs.contatos_hm h
 where h.aluno_id in (select distinct m.aluno_id from gps.membros m)
 group by 1 order by 2 desc;

-- (c) existe MAIS DE UMA linha para o mesmo (aluno, produto)?
select h.aluno_id, h.produto, count(*)
  from cs.contatos_hm h
 where h.aluno_id in (select distinct m.aluno_id from gps.membros m)
 group by 1,2 having count(*) > 1;

-- (d) quantos ficam com saldo DESCONHECIDO (nem manual, nem aritmética possível)
select count(*) from cs.contatos_hm h
 where h.aluno_id in (select distinct m.aluno_id from gps.membros m)
   and h.saldo_a_pagar_manual is null
   and (h.valor_total is null or h.valor_pago is null);

-- (e) o dono da função (postgres) enxerga a tabela?
select has_table_privilege('postgres','cs.contatos_hm','select');
```

Se **(c)** devolver linhas, nada muda no desenho (a tela já lista uma linha por registro) — mas
tem de constar no relatório. Se **(b)** trouxer AURUM, acrescentar o aviso na UI (§3.3, item 5).

### 3.1 Banco — `20260909000100_gps_financeiro_do_aluno.sql`

```sql
-- Aba Financeiro do aluno — LÊ cs.contatos_hm, NUNCA escreve (C5).
--
-- MOTIVAÇÃO (feature 7 do Marcio): o aluno não tem onde ver quanto pagou e
-- quanto falta do próprio contrato, e a equipe responde isso por WhatsApp.
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
--   apagar o `exists (... papel='titular')`; ter mostrado a dívida de alguém não
--   se desfaz.
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
--     produz um número plausível e errado.
--
-- UMA LINHA POR REGISTRO, NUNCA UMA SOMA POR ALUNO: `cs.contatos_hm` tem 2
-- linhas para alguns alunos (produtos diferentes). Agregar por aluno_id
-- misturaria o dinheiro de dois produtos -- é literalmente o defeito do
-- `where comprador_id` que quebrou 7 funções no sistema de disparos.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ:
--   * não concede grant nenhum em cs.contatos_hm;
--   * não escreve, não cria trigger, não cria view no schema cs;
--   * não usa `contrato_aurum` (o saldo do AURUM vem de planilha, fora daqui);
--   * não cria índice: a leitura é `where aluno_id = $1` numa tabela do sip que
--     já é indexada por aluno_id (conferir no relatório com explain).
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
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  if not (
        public.gp_is_admin()
     or (gps.aluno_atual() = p_aluno_id
         and exists (select 1
                       from gps.membros m
                      where m.user_id = auth.uid()
                        and m.papel   = 'titular'))
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
   -- contrato cancelado por último; depois por produto, para a ordem não dançar
   order by (h.cancelamento_em is not null), h.produto nulls last;
end;
$$;

comment on function gps.financeiro_do_aluno(uuid) is
  'Extrato do contrato do aluno lido de cs.contatos_hm (schema do sip). LE, NUNCA ESCREVE. SECURITY DEFINER porque `authenticated` nao tem nem pode ganhar grant em cs.contatos_hm. Acesso: admin OU o TITULAR do ambiente -- o SOCIO NAO LE (o contrato e do titular). Saldo = coalesce(saldo_a_pagar_manual, valor_total - valor_pago) e fica NULL quando nao da para calcular, nunca zero. credito_valor_pago e cancelamento_valor sao DEVOLVIDOS mas NUNCA entram na aritmetica: a semantica deles e do sip e nao esta provada aqui. Uma linha por registro -- NUNCA agregar por aluno_id, ha alunos com 2 produtos.';

revoke execute on function gps.financeiro_do_aluno(uuid) from public, anon;
grant  execute on function gps.financeiro_do_aluno(uuid) to authenticated;
```

⚠️ Se a medição (a) mostrar tipos diferentes (`pagamento_previsto_em` como `timestamptz`,
`pagamento_parcelas` como `smallint` etc.), **ajustar o `returns table` ao tipo real** — divergência
vira `42804` só na primeira chamada, em produção.

### 3.2 Backend TS

`src/lib/financeiro.ts` (novo):
```ts
export interface ContratoFinanceiro {
  produto: string | null;
  plano: string | null;
  turma: string | null;
  valorTotal: number | null;
  valorPago: number | null;
  /** `null` = não dá para calcular. NUNCA tratar como zero. */
  saldo: number | null;
  /** `true` = veio de `saldo_a_pagar_manual` (a equipe digitou). */
  saldoEManual: boolean;
  creditoValorPago: number | null;
  cancelamentoValor: number | null;
  cancelamentoEm: string | null;
  pagamentoForma: string | null;
  pagamentoParcelas: number | null;
  pagamentoEm: string | null;
  pagamentoPrevistoEm: string | null;
  quitadoEm: string | null;
}

export type ResultadoFinanceiro =
  | { estado: "ok"; contratos: ContratoFinanceiro[] }
  | { estado: "sem_registro" }          // 0 linhas — os 31 ambientes
  | { estado: "sem_permissao" }         // 42501
  | { estado: "erro" };                 // qualquer outra falha — NUNCA vira "sem_registro"

export async function getFinanceiroDoAluno(alunoId: string): Promise<ResultadoFinanceiro>;
```
🔑 `sem_registro` e `erro` são estados **diferentes**. Colapsar os dois faria uma falha de banco
aparecer como "este aluno não tem financeiro" — a tela mentiria com cara de normalidade.

### 3.3 Frontend

**Rotas novas:** `src/app/financeiro/page.tsx` (aluno) e
`src/app/admin/aluno/[alunoId]/financeiro/page.tsx` (assistência).
Componente compartilhado `src/components/financeiro/financeiro-view.tsx`
(`{ resultado, ehAdmin }: { resultado: ResultadoFinanceiro; ehAdmin: boolean }`).

**Navegação — mudança de assinatura obrigatória** (`src/lib/nav.ts`):
```ts
export function alunoNavItems(
  basePath: string,
  opts: { financeiro: boolean },   // ← SEM default, de propósito
): NavItem[]
```
Sem valor padrão pelo mesmo motivo de `assistenciaNavItems(alunoId)`: a assinatura obriga cada
página a **decidir** se aquele usuário vê a aba. `assistenciaNavItems` chama com
`{ financeiro: true }` (admin sempre vê). O TypeScript aponta os call sites — atualizar **todos**
(`page.tsx`, `clientes`, `pasta`, `materiais`, `perfil`, `etapa/[etapa]`).
Cada página de aluno passa `financeiro: ctx.papelMembro === "titular"`.
Ícone novo: `financeiro` → `Wallet` em `nav-tabs.tsx`.
Defesa em profundidade: `src/app/financeiro/page.tsx` faz
`if (ctx.papelMembro !== "titular") redirect("/")` — esconder a aba não é fronteira.

**A tela** (um `Card` por contrato):
1. Cabeçalho do card: `produto` (fallback "Programa") + `plano`/`turma` como `Badge`s.
2. Três números, nessa hierarquia: **Total** · **Pago** · **Saldo** (o saldo em destaque).
   `null` → **"não informado"** em `text-muted-foreground`, nunca `R$ 0,00`.
   `saldoEManual` → nota curta: *"Saldo ajustado manualmente pela equipe."*
3. `quitado_em` preenchido → selo **"Quitado em dd/mm/aaaa"**; o saldo aparece como
   **R$ 0,00**. Se a aritmética discordar, **só o admin** vê a linha extra
   *"Cálculo diverge: total − pago = R$ X."* (o aluno não é o público de uma divergência interna).
4. `cancelamento_em` preenchido → o card inteiro fica em tom neutro-alerta com
   **"Contrato cancelado em dd/mm/aaaa"**, mostra `cancelamento_valor` como linha própria
   ("Valor do cancelamento") e **não apresenta saldo a pagar**. Texto: *"Fale com a equipe."*
5. `credito_valor_pago > 0` → linha "Crédito aplicado: R$ X" com
   `title="Informado pelo Grupo Participa; não entra no cálculo do saldo."`
   Se a medição (b) trouxer AURUM, o card do produto AURUM leva a linha
   *"Os valores do AURUM são consolidados fora deste portal."*
6. Parcelamento: `"{parcelas}x em {forma}"` quando os dois existirem; nada quando faltar um.
7. Vencimento: `pagamento_previsto_em` no futuro → "Próximo vencimento: dd/mm/aaaa";
   no passado e sem `quitado_em` → "Vencido em dd/mm/aaaa" (tom de alerta, sem drama).
8. **Rodapé fixo do card, obrigatório (C5):**
   *"Dados do seu contrato com o Grupo Participa. Atualizados pela equipe financeira — este portal
   apenas exibe. Encontrou divergência? Fale com a equipe."*
   (Depois da Fase 6, esse "fale com a equipe" vira link para `/chamados`.)
9. **Estados:**
   | estado | aluno vê | admin vê a mais |
   |---|---|---|
   | `sem_registro` | *"Financeiro não disponível para este cadastro — fale com a equipe."* | *"Nenhum registro em `cs.contatos_hm` para este ambiente. Provável lacuna de cadastro, não erro do portal."* |
   | `erro` | *"Não foi possível carregar o financeiro agora. Tente de novo em alguns minutos."* | idem |
   | `sem_permissao` | não acontece (a rota já redirecionou) | — |

### 3.4 Critérios de aceite — Fase 7-A

```sql
-- 1) com JWT de SÓCIO -> 42501; com JWT do TITULAR do mesmo ambiente -> linhas
select * from gps.financeiro_do_aluno('<aluno_id do ambiente>');

-- 2) aluno A pedindo o ambiente de B -> 42501
select * from gps.financeiro_do_aluno('<aluno_id de outro ambiente>');

-- 3) anon não executa
--    (PostgREST, sem Authorization): POST /rest/v1/rpc/financeiro_do_aluno -> 42501/404

-- 4) a função é somente-leitura de fato:
select prosecdef, provolatile, prosrc ~* '\m(insert|update|delete|truncate|copy)\M' as escreve
  from pg_proc where oid = 'gps.financeiro_do_aluno(uuid)'::regprocedure;
--    espera: prosecdef=t, provolatile='s', escreve=f

-- 5) cobertura bate com a medida do orquestrador (94 de 125):
select count(*) filter (where existe), count(*) from (
  select m.aluno_id, exists(select 1 from cs.contatos_hm h where h.aluno_id = m.aluno_id) as existe
    from (select distinct aluno_id from gps.membros) m) t;

-- 6) ninguém ganhou grant na tabela do sip:
select has_table_privilege('authenticated','cs.contatos_hm','select');  -- espera false
```
Navegador: entrar como **titular com linha** (números), como **titular sem linha** (mensagem (c)),
como **sócio** (a aba não existe e `/financeiro` redireciona), como **admin** na assistência.

---

## 4. FASE 6 — chamados com anexo (B5/B6)

**Conceito:** o aluno abre um **chamado** (assunto + mensagem + anexo opcional), a equipe responde
na mesma thread e fecha. É **canal de suporte do portal**, não repositório de documento do cliente.

### 4.0 Desenho — as cinco escolhas que definem esta fase

1. **Tudo append-only, escrita só por RPC.** As tabelas recebem **`grant select` e mais nada**;
   `gps.chamados` e `gps.chamado_mensagens` não têm policy de insert/update/delete. Toda escrita
   passa por funções `SECURITY DEFINER`. Consequência: `assunto` é imutável, a thread não é
   editável e `status` é **derivado**, não digitado. O banco garante — não a UI.
2. **Caminho do anexo é `<aluno_id>/<uuid>.<ext>`**, não `<chamado_id>/…` como sugerido.
   🔑 Com `chamado_id` no caminho, o anexo da **primeira** mensagem exigiria criar o chamado antes
   de subir o arquivo e depois **fazer UPDATE na mensagem** para gravar o path — o que destruiria o
   append-only. Com `aluno_id`, o aluno sobe primeiro e a abertura inteira vira **um INSERT
   atômico**. A audiência do arquivo é idêntica nas duas versões (membros do ambiente + admin).
3. **E-mail acompanha a MUDANÇA DE STATUS, não a mensagem.** Cinco mensagens seguidas do aluno
   geram **um** e-mail para a equipe. É a trava anti-flood embutida no modelo, não um contador.
4. **Interruptor fecha a ENTRADA, nunca a saída.** `chamados_aberto=false` impede o aluno de abrir
   e de responder; a equipe continua respondendo e fechando. Desligar não deixa ninguém no meio do
   caminho sem resposta.
5. **Limites no banco:** 5 chamados abertos por ambiente, 20 mensagens por chamado, 4.000
   caracteres por mensagem, 5 MB por anexo, 4 MIMEs.
   Pior caso honesto: `5 × 20 × 5 MB = 500 MB` por ambiente, `125 × 500 MB = 62 GB` teóricos. Na
   prática o expurgo de 180 dias e o interruptor contêm; **o número tem de estar no relatório** para
   ninguém descobrir isso depois.

### 4.1 `20260909000110_gps_chamados_estrutura.sql`

```sql
-- Chamados (suporte) do portal — tabela + thread + interruptor.
--
-- MOTIVAÇÃO (feature 10 do Marcio): hoje o aluno NÃO TEM canal dentro do portal.
-- Medido em 08/09: `rg -in "suporte|mailto" src/` devolve ZERO. Não estamos
-- substituindo um e-mail de suporte -- não existe nenhum na UI.
--
-- POR QUE TABELA NOVA (e não central.chamados / sip.ticket_messages): os dois
-- sistemas existem no mesmo banco e usam `aluno_id = auth.uid()` +
-- `central.is_admin()`. No GPS `aluno_id` é o AMBIENTE, não o usuário. Reusar
-- exigiria alterar a RLS de um sistema em produção que este repo nem versiona.
--
-- ANEXO ≠ DOCUMENTO DO CLIENTE (C4). A decisão de 07/2026 tirou documento do
-- cliente do GPS e mandou para o Drive, e ela CONTINUA VALENDO. O anexo de
-- chamado é prova de um problema no portal (print de erro, comprovante),
-- efêmero, com retenção de 180 dias e expurgo. Bucket próprio, limite de 5 MB e
-- allowlist de 4 MIMEs -- ver migração ...112.
--
-- APPEND-ONLY POR CONSTRUÇÃO: `grant select` e nada mais; nenhuma policy de
-- insert/update/delete. Toda escrita passa pelas RPCs SECURITY DEFINER da
-- migração ...111. Assunto imutável, thread não editável, `status` derivado.
--
-- FKs para auth.users são `on delete set null`, NÃO `restrict`:
--   🔴 gps.admin_excluir_acesso() APAGA a linha de auth.users do aluno. Com
--   `restrict`, excluir o acesso de qualquer aluno que já tenha aberto chamado
--   passaria a falhar com 23503 -- e essa função é o caminho oficial de
--   destravar gente. A migração ...114 acrescenta a limpeza dos chamados lá.
--   `aluno_id` continua SEM FK para thb_alunos (mesma razão de gps.aluno_notas:
--   a tabela é compartilhada com o sip ao vivo).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não cria bucket (é a ...112), não cria RPC (é a
-- ...111), não manda e-mail (é a aplicação), não toca central.* nem sip.*.
--
-- REVERSÃO (nesta ordem):
--   drop table gps.chamado_mensagens;
--   drop table gps.chamados;
--   drop function gps.pode_ver_chamado(uuid);
--   drop function gps.chamados_abertos();
--   delete from gps.config where chave like 'chamados_%';
--   -- gps.config só sai se nenhuma outra feature já estiver usando.

create table gps.chamados (
  id                 uuid primary key default gen_random_uuid(),
  aluno_id           uuid not null,
  aberto_por         uuid references auth.users(id) on delete set null,
  assunto            text not null check (length(btrim(assunto)) between 3 and 120),
  status             text not null default 'aberto'
                       check (status in ('aberto','respondido','fechado')),
  criado_em          timestamptz not null default now(),
  ultima_mensagem_em timestamptz not null default now(),
  fechado_em         timestamptz,
  fechado_por        uuid references auth.users(id) on delete set null,
  constraint chk_chamado_fechado_tem_data
    check (status <> 'fechado' or fechado_em is not null)
);

comment on table gps.chamados is
  'Chamado de suporte do portal. aluno_id e o AMBIENTE (titular), como em gps.etapa1_clientes. status e DERIVADO de quem escreveu por ultimo (aberto = a bola esta com a equipe; respondido = com o aluno) e so muda por RPC. Append-only: nenhuma policy de insert/update/delete, so `grant select`.';
comment on column gps.chamados.aberto_por is
  'Quem abriu (titular OU socio). `on delete set null` porque gps.admin_excluir_acesso apaga a linha de auth.users -- com restrict, excluir acesso de quem ja abriu chamado falharia com 23503.';
comment on column gps.chamados.status is
  'aberto = esperando a equipe | respondido = esperando o aluno | fechado. A transicao e o que dispara e-mail: mensagem que NAO muda o status nao avisa ninguem (trava anti-flood embutida no modelo).';

create table gps.chamado_mensagens (
  id                 uuid primary key default gen_random_uuid(),
  chamado_id         uuid not null references gps.chamados(id) on delete cascade,
  autor_id           uuid references auth.users(id) on delete set null,
  autor_papel        text not null check (autor_papel in ('aluno','equipe')),
  criado_em          timestamptz not null default now(),
  texto              text not null check (length(btrim(texto)) between 1 and 4000),
  anexo_path         text
    check (anexo_path is null or anexo_path ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'),
  anexo_nome         text
    check (anexo_nome is null or (length(anexo_nome) between 1 and 120 and anexo_nome !~ '[/\\]')),
  anexo_mime         text
    check (anexo_mime is null or anexo_mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  anexo_tamanho      integer check (anexo_tamanho is null or anexo_tamanho between 1 and 5242880),
  anexo_expurgado_em timestamptz,
  constraint chk_anexo_completo check (
    (anexo_path is null and anexo_nome is null and anexo_mime is null and anexo_tamanho is null)
    or
    (anexo_path is not null and anexo_nome is not null and anexo_mime is not null and anexo_tamanho is not null)
  ),
  constraint chk_expurgo_so_com_anexo
    check (anexo_expurgado_em is null or anexo_path is not null)
);

comment on column gps.chamado_mensagens.anexo_path is
  'Caminho no bucket gps-chamados, no formato <aluno_id>/<uuid>.<ext>. O aluno_id no caminho e o que as policies de storage.objects usam para decidir quem le -- por isso o CHECK exige o formato exato (sem isso, `../` e nome arbitrario chegariam ate a policy). O prefixo ser MESMO o aluno_id do chamado e conferido na RPC, que a constraint nao tem como saber.';
comment on column gps.chamado_mensagens.anexo_nome is
  'Nome ORIGINAL do arquivo, so para exibir e para o `download=` da URL assinada. Proibido conter / ou \\ -- e texto vindo do usuario.';
comment on column gps.chamado_mensagens.anexo_expurgado_em is
  'Carimbo do expurgo de retencao (180 dias apos o fechamento). O caminho e o nome FICAM: a tela mostra "arquivo removido por retencao em dd/mm" em vez de fingir que nunca houve anexo.';

-- ── Índices ──────────────────────────────────────────────────────────────
create index idx_chamados_ambiente on gps.chamados (aluno_id, ultima_mensagem_em desc);
comment on index gps.idx_chamados_ambiente is
  'Serve a lista do aluno e a do admin dentro do ambiente: select ... where aluno_id = $1 order by ultima_mensagem_em desc (getChamadosDoAmbiente).';

create index idx_chamados_fila on gps.chamados (ultima_mensagem_em) where status <> 'fechado';
comment on index gps.idx_chamados_fila is
  'Serve a fila de /admin/chamados: select ... where status <> ''fechado'' order by ultima_mensagem_em (getFilaChamados) e a contagem do badge. PARCIAL de proposito: a fila cresce so com o que esta aberto; o historico de fechados nao entra no indice nem no custo.';

create index idx_chamado_mensagens_thread on gps.chamado_mensagens (chamado_id, criado_em);
comment on index gps.idx_chamado_mensagens_thread is
  'Serve a thread: select ... where chamado_id = $1 order by criado_em (getChamado) e as contagens de limite nas RPCs.';

-- NÃO existe índice para o expurgo (`where status='fechado' and fechado_em < ...`):
-- a consulta roda sob demanda, ao abrir a tela de retenção, sobre uma tabela da
-- ordem de centenas de linhas. Índice ali seria peso morto de escrita sem plano
-- que o justifique. Se a tabela passar de ~50 mil linhas, medir e então criar.

-- ── RLS: SELECT e mais nada ──────────────────────────────────────────────
alter table gps.chamados          enable row level security;
alter table gps.chamado_mensagens enable row level security;

create function gps.pode_ver_chamado(p_chamado_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from gps.chamados c
     where c.id = p_chamado_id
       and (public.gp_is_admin() or c.aluno_id = gps.aluno_atual())
  );
$$;

comment on function gps.pode_ver_chamado(uuid) is
  'Quem enxerga um chamado: admin ou qualquer membro do ambiente dono. SECURITY INVOKER de proposito -- a RLS de gps.chamados ja e a fonte de verdade, e um DEFINER teria de reimplementar a mesma regra (segundo lugar para esquecer de manter). Usada pela policy de gps.chamado_mensagens.';

revoke execute on function gps.pode_ver_chamado(uuid) from public, anon;
grant  execute on function gps.pode_ver_chamado(uuid) to authenticated;

create policy gps_chamados_select on gps.chamados
  for select to authenticated
  using (public.gp_is_admin() or aluno_id = gps.aluno_atual());

create policy gps_chamado_mensagens_select on gps.chamado_mensagens
  for select to authenticated
  using (gps.pode_ver_chamado(chamado_id));

-- NENHUMA policy de insert/update/delete nas duas tabelas.
grant select on gps.chamados          to authenticated;
grant select on gps.chamado_mensagens to authenticated;
-- ZERO grant para anon.

-- ── Interruptor + configuração da equipe ─────────────────────────────────
create table gps.config (
  chave          text primary key,
  valor          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
comment on table gps.config is
  'Configuracao do GPS editavel pela equipe SEM DEPLOY, no mesmo padrao de gps.plantao_config. So-admin; anon nao tem grant nenhum. Quem precisa ler sem ser admin le por funcao SECURITY DEFINER.';

alter table gps.config enable row level security;
create policy gps_config_admin on gps.config
  for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());
grant select, insert, update on gps.config to authenticated;
-- ZERO grant para anon; nenhum grant de delete (chave de config não se apaga pela UI).

insert into gps.config (chave, valor) values
  ('chamados_aberto',       'true'),
  ('chamados_email_equipe', '')
on conflict (chave) do nothing;

create function gps.chamados_abertos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'chamados_aberto'),
           current_setting('app.gps_chamados_aberto', true),
           'true'
         ) <> 'false';
$$;

comment on function gps.chamados_abertos() is
  'Interruptor de ENTRADA do suporte. A tabela manda; o setting app.gps_chamados_aberto e o segundo degrau (emergencia sem deploy) e AUSENTE = ABERTO -- o default tem de ser funcionar, senao o canal morre no dia em que alguem esquecer de popular a linha. Fecha so a entrada do ALUNO: a equipe continua respondendo e fechando (desligar nao pode deixar ninguem no meio do caminho). SECURITY DEFINER porque o aluno nao le gps.config.';

revoke execute on function gps.chamados_abertos() from public, anon;
grant  execute on function gps.chamados_abertos() to authenticated;
```

### 4.2 `20260909000111_gps_chamados_rpcs.sql`

Quatro funções públicas + uma privada. Todas `security definer`, `set search_path = ''`,
`revoke execute from public, anon`, `grant execute to authenticated`
(a privada: `revoke ... from public, anon, authenticated`).

```sql
-- gps.chamado_gravar_mensagem(...)  -- PRIVADA, sem grant para authenticated.
--   Valida o anexo e faz o par INSERT mensagem + UPDATE chamado. Existe para a
--   regra de anexo e a de status ficarem em UM lugar só: `chamado_abrir` e
--   `chamado_responder` chamariam a mesma validação e uma delas ficaria para trás.
--   Validações, nesta ordem:
--     * texto entre 1 e 4000 (o CHECK também barra; aqui a mensagem sai legível);
--     * se há anexo: os 4 campos presentes; split_part(path,'/',1) = aluno_id do
--       chamado (o CHECK garante o FORMATO, não a POSSE);
--     * o objeto EXISTE em storage.objects (bucket gps-chamados, name = path) --
--       sem isso a thread grava anexo fantasma e a tela oferece download de nada;
--     * extensão do path coerente com anexo_mime.
--
-- gps.chamado_abrir(p_assunto, p_texto, p_anexo_path, p_anexo_nome,
--                   p_anexo_mime, p_anexo_tamanho)
--   returns table (chamado_id uuid, avisar_equipe text)
--   Guardas: gps.aluno_atual() não nulo (o ADMIN NÃO ABRE chamado -- ele
--   responde; para o admin aluno_atual() é null e a função recusa);
--   gps.chamados_abertos(); menos de 5 chamados não-fechados no ambiente.
--   Devolve, junto, a lista de e-mails da equipe (gps.config.chamados_email_equipe)
--   para a action mandar o aviso -- 1 ida ao banco em vez de 2, e sem expor uma
--   RPC "leia a config" para o aluno.
--
-- gps.chamado_responder(p_chamado_id, p_texto, p_anexo_*)
--   returns table (status_novo text, avisar text)
--   Papel derivado NO SERVIDOR: gp_is_admin() -> 'equipe'; senão, se
--   gps.aluno_atual() = chamado.aluno_id -> 'aluno'; senão 42501. O cliente
--   NUNCA informa quem ele é.
--   Chamado fechado: a equipe responde sempre; o aluno responde (e REABRE) se
--   fechado_em > now() - interval '7 days' -- passado o prazo, 42501 com
--   "abra um novo chamado". Reabrir zera fechado_em/fechado_por.
--   🔑 7 dias e não 180: reabrir um chamado cujo anexo já foi expurgado
--   devolveria uma thread com arquivo morto. O prazo de reabertura tem de caber
--   FOLGADO dentro do prazo de retenção.
--   Limite de 20 mensagens por chamado.
--   `avisar` só é preenchido quando o status MUDOU:
--     aluno escreveu e status era <> 'aberto'      -> avisar = e-mails da equipe
--     equipe escreveu e status era <> 'respondido' -> avisar = e-mail do aluno,
--       resolvido por coalesce(auth.users.email do aberto_por,
--                              public.thb_alunos.email do aluno_id)
--   Sem transição, `avisar` é null e a action não manda nada.
--
-- gps.chamado_fechar(p_chamado_id)  returns void
--   admin OU dono do ambiente. Idempotente (já fechado = no-op).
--   status='fechado', fechado_em=now(), fechado_por=auth.uid().
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não manda e-mail (envio dentro de transação de
-- banco trava escrita quando a Resend cai -- mesma decisão da Fase 8 do
-- Plantão); não apaga nada; não mexe em storage.
--
-- REVERSÃO: drop das 5 funções. As tabelas ficam legíveis e congeladas
-- (sem RPC, ninguém escreve) -- é um "modo somente leitura" seguro.
```

### 4.3 `20260909000112_gps_chamados_storage.sql`

```sql
-- Bucket e policies do anexo de chamado.
--
-- BUCKET NOVO, não o `gps-documentos` órfão (B5-b): aquele está SEM
-- file_size_limit e SEM allowed_mime_types, e carrega o histórico do fichário
-- removido em 07/2026. Nascer com limite é mais barato do que endurecer o velho.
-- Esta migração NÃO apaga o gps-documentos (o Postgres do Supabase bloqueia
-- delete direto em storage.buckets; sai pelo dashboard) -- ele continua inerte,
-- sem policy nenhuma, e a remoção é tarefa à parte.
--
-- REVERSÃO: drop das 3 policies + das 2 funções. O bucket fica, sem policy,
-- inacessível a todo mundo -- que é exatamente o estado seguro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gps-chamados','gps-chamados', false, 5242880,
        array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
   set public            = false,
       file_size_limit   = 5242880,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf'];
```

Duas funções de guarda, ambas **falhando fechado** (`exception when others then return false`):

```sql
create function gps.pode_ver_anexo_chamado(p_name text) returns boolean
language plpgsql stable set search_path = '' as $$
declare v_prefixo text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;                       -- nome fora do formato: nem tenta
  end if;
  return public.gp_is_admin() or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;                          -- qualquer imprevisto NEGA
end;
$$;

create function gps.pode_anexar_chamado(p_name text) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  if coalesce(p_name, '') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'
  then
    return false;
  end if;
  -- SÓ O ALUNO ANEXA (B5-c). Para liberar a equipe: `or public.gp_is_admin()`
  -- aqui e nada mais -- é a reversão inteira da decisão.
  return gps.chamados_abertos()
     and gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;
end;
$$;
```

Policies em `storage.objects` (as três, e só estas):

```sql
create policy gps_chamados_anexo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gps-chamados' and gps.pode_ver_anexo_chamado(name));

create policy gps_chamados_anexo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gps-chamados' and gps.pode_anexar_chamado(name));

-- DELETE só para o admin: é o que torna o expurgo de retenção possível pela
-- Storage API com a sessão do admin (ver ...113). Sem update policy: ninguém
-- sobrescreve um anexo depois de enviado.
create policy gps_chamados_anexo_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'gps-chamados' and public.gp_is_admin());
```

⚠️ **Não tocar** nas policies `documentos_public_*` nem no bucket `documentos` (são do `sip`).

### 4.4 `20260909000113_gps_chamados_expurgo.sql`

```sql
-- Retenção do anexo de chamado: 180 dias após o FECHAMENTO (B6).
--
-- 🔴 POR QUE NÃO É pg_cron: apagar a linha de storage.objects por SQL NÃO apaga
-- o arquivo no object store. Um job SQL reportaria sucesso e deixaria os bytes
-- lá -- o pior modo de falha possível para uma rotina de retenção (a planilha
-- diz que apagou, o arquivo continua). O expurgo REAL exige a Storage API, que
-- exige uma sessão autenticada; o GPS não usa service_role e a única sessão
-- legítima disponível é a do admin no navegador. Por isso o expurgo é um BOTÃO
-- em /admin/chamados, com contador que não some enquanto houver o que expurgar.
-- Se um dia service_role for autorizado, o job chama estas MESMAS duas funções.
--
-- 180 dias é decisão reversível: trocar o interval e reaplicar a função. O
-- Plantão expurga evento em 90 -- não herdado de propósito: evento de plantão é
-- telemetria, anexo de chamado é a prova de um problema que pode voltar.
--
-- ÓRFÃO: o aluno sobe o arquivo ANTES de enviar a mensagem (é o que torna a
-- abertura um INSERT atômico). Se ele desistir, o objeto fica sem linha. E
-- gps.admin_excluir_acesso apaga os chamados, deixando os anexos órfãos também.
-- Os dois casos caem no mesmo lugar, com motivo='orfao' e corte de 24h.
--
-- REVERSÃO: drop das 2 funções. Nada é apagado por elas sozinhas.

create function gps.chamados_anexos_para_expurgo()
returns table (
  mensagem_id uuid,   -- null quando motivo='orfao'
  chamado_id  uuid,
  aluno_id    uuid,
  path        text,
  motivo      text,   -- 'retencao' | 'orfao'
  referencia  timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query
    select m.id, c.id, c.aluno_id, m.anexo_path, 'retencao', c.fechado_em
      from gps.chamado_mensagens m
      join gps.chamados c on c.id = m.chamado_id
     where m.anexo_path is not null
       and m.anexo_expurgado_em is null
       and c.status = 'fechado'
       and c.fechado_em < now() - interval '180 days'
    union all
    select null::uuid, null::uuid, null::uuid, o.name, 'orfao', o.created_at
      from storage.objects o
     where o.bucket_id = 'gps-chamados'
       and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from gps.chamado_mensagens m
                        where m.anexo_path = o.name)
     order by 6;
end;
$$;

create function gps.chamado_anexo_marcar_expurgado(p_mensagem_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  update gps.chamado_mensagens
     set anexo_expurgado_em = now()
   where id = p_mensagem_id
     and anexo_path is not null
     and anexo_expurgado_em is null;
end;
$$;
```

### 4.5 `20260909000114_gps_admin_excluir_acesso_inclui_chamados.sql`

```
🔴 backend-engineer: extraia o corpo VIGENTE com
   select pg_get_functiondef('gps.admin_excluir_acesso(uuid)'::regprocedure);
   e parta DELE. O repo tem ...20260908000002 e ...20260909000005 mexendo nesta
   função; assumir que a última do repo é a que está no banco já custou 5 semanas
   neste ecossistema.
```
Acrescentar, junto dos deletes que já existem (clientes, progresso, ênfases, solicitações, notas,
eventos): `delete from gps.chamados where aluno_id = p_aluno_id;` (as mensagens saem por cascade).
Cabeçalho tem de registrar: **os anexos no bucket viram órfãos e são recolhidos por
`gps.chamados_anexos_para_expurgo()` com motivo `'orfao'`** — a função de banco não tem como falar
com a Storage API.

### 4.6 Contrato back↔front — Fase 6

`src/lib/chamados-tipos.ts`
```ts
export const STATUS_CHAMADO = ["aberto", "respondido", "fechado"] as const;
export type StatusChamado = (typeof STATUS_CHAMADO)[number];

export interface Chamado {
  id: string; aluno_id: string; aberto_por: string | null; assunto: string;
  status: StatusChamado; criado_em: string; ultima_mensagem_em: string;
  fechado_em: string | null; fechado_por: string | null;
}
export interface ChamadoNaFila extends Chamado { aluno_nome: string | null; aluno_email: string | null; }

export interface ChamadoMensagem {
  id: string; chamado_id: string; autor_id: string | null;
  autor_papel: "aluno" | "equipe"; criado_em: string; texto: string;
  anexo_path: string | null; anexo_nome: string | null;
  anexo_mime: string | null; anexo_tamanho: number | null;
  anexo_expurgado_em: string | null;
}
export interface ChamadoMensagemComAutor extends ChamadoMensagem { autor_nome: string | null; }

export interface AnexoParaExpurgo {
  mensagemId: string | null; chamadoId: string | null; alunoId: string | null;
  path: string; motivo: "retencao" | "orfao"; referencia: string;
}

export const ANEXO_MIMES = ["image/png","image/jpeg","image/webp","application/pdf"] as const;
export const ANEXO_EXTENSOES = ["png","jpg","jpeg","webp","pdf"] as const;
export const ANEXO_TAMANHO_MAXIMO = 5 * 1024 * 1024;
export const CHAMADOS_MAX_ABERTOS = 5;
export const CHAMADO_MAX_MENSAGENS = 20;
export const CHAMADO_TEXTO_MAXIMO = 4000;
export const CHAMADO_REABRIR_DIAS = 7;
export const ANEXO_RETENCAO_DIAS = 180;
export const BUCKET_CHAMADOS = "gps-chamados";
```

`src/lib/chamados-data.ts` (leituras, todas Server)
```ts
export async function getChamadosDoAmbiente(alunoId: string): Promise<Chamado[]>;
export async function getChamado(chamadoId: string):
  Promise<{ chamado: Chamado; mensagens: ChamadoMensagemComAutor[] } | null>;
export async function getFilaChamados(): Promise<ChamadoNaFila[]>;                 // admin
export async function contarChamadosAbertosPorAluno(): Promise<Map<string, number>>; // admin
export async function getChamadosConfig():
  Promise<{ aberto: boolean; emailEquipe: string[] }>;                             // admin
export async function getAnexosParaExpurgo(): Promise<AnexoParaExpurgo[]>;         // admin
export async function urlAssinadaDoAnexo(path: string, nome: string):
  Promise<string | null>;   // createSignedUrl(path, 60, { download: nome })
```

`src/app/chamados/actions.ts`
```ts
export interface AnexoInput { path: string; nome: string; mime: string; tamanho: number }
export type ResultadoAbrir = { ok: true; chamadoId: string } | { ok: false; erro: string };
export type ResultadoAcao  = { ok: true } | { ok: false; erro: string };

export async function abrirChamado(input: {
  assunto: string; texto: string; anexo?: AnexoInput;
}): Promise<ResultadoAbrir>;
export async function responderChamado(input: {
  chamadoId: string; texto: string; anexo?: AnexoInput;
}): Promise<ResultadoAcao>;
export async function fecharChamado(chamadoId: string): Promise<ResultadoAcao>;
```

`src/app/admin/chamados/actions.ts`
```ts
export async function definirChamadosAbertos(aberta: boolean): Promise<ResultadoAcao>;
export async function definirEmailEquipeChamados(lista: string): Promise<ResultadoAcao>;
/** Apaga o objeto pela Storage API com a sessão do admin e carimba a mensagem. */
export async function expurgarAnexo(item: {
  path: string; mensagemId: string | null;
}): Promise<ResultadoAcao>;
```

**Regras das actions:**
- Toda action traduz `42501`/`23514` do banco para **frase em português** (`erro`), nunca repassa
  `error.message` cru para a tela.
- E-mail **depois** do commit da RPC, com o `avisar` que a RPC devolveu; `{ ok: false }` do e-mail
  **não desfaz** o chamado — `console.error` com contexto e segue.
- `revalidatePath("/chamados", "layout")`, `/chamados/${id}`, `/admin/chamados` e
  `/admin/aluno/${alunoId}` (layout).
- `expurgarAnexo`: **primeiro** `storage.remove([path])`, **depois**
  `chamado_anexo_marcar_expurgado`. Nessa ordem — carimbar antes e falhar o delete deixaria o
  arquivo vivo com a tela dizendo que sumiu.

`src/lib/email-chamados.ts` — reusa `enviar`/`esc`/`layout`/`botao` de `email.ts`:
```ts
export async function enviarChamadoAbertoParaEquipe(p: {
  para: string[]; alunoNome: string; assunto: string; chamadoId: string;
}): Promise<ResultadoEmail>;
export async function enviarChamadoRespondidoParaAluno(p: {
  para: string; assunto: string; chamadoId: string;
}): Promise<ResultadoEmail>;
```
🔑 **Nenhum dos dois leva o texto da mensagem.** Só assunto + botão para o portal. E-mail é canal
menos controlado que o portal, e a mensagem pode conter dado pessoal.

### 4.7 UI — Fase 6

**Rotas:** `/chamados`, `/chamados/[chamadoId]` (aluno); `/admin/chamados`,
`/admin/chamados/[chamadoId]` (equipe); `/admin/aluno/[alunoId]/chamados` (assistência, mesma lista
do aluno). Aba **"Suporte"** em `alunoNavItems` (ícone novo `suporte` → `LifeBuoy`) e em
`adminNavItems`.
⚠️ `alunoNavItems` já terá ganhado o parâmetro `opts` na Fase 7-A — **reler o arquivo antes de
editar** (§5).

**Componentes** (`src/components/chamados/`): `chamados-lista.tsx`, `chamado-thread.tsx`,
`chamado-novo-dialog.tsx`, `anexo-campo.tsx`, `anexo-link.tsx`.
`src/components/admin/chamados-fila.tsx`, `chamados-config.tsx`, `chamados-retencao.tsx`.

**Reuso — o que existe e o que não existe:**
- **Não há componente de thread reutilizável.** `DiarioTimeline`/`TrilhaItem` são acoplados a
  notas/eventos. Reusar o **padrão visual** (`Card` + `Badge` + timestamp à direita +
  `whitespace-pre-wrap break-words`), não o componente.
- **Dedupe obrigatório:** mover `formatarDataHora` de `src/components/admin/diario-labels.ts` para
  **`src/lib/datas.ts`** e atualizar os importadores (`diario-timeline`, `diario-resumo-card`,
  `trilha-cabecalho`, `trilha-item`). Componente de chamado não pode importar de
  `components/admin/`. Isto é a parcela de **otimização** da Fase 6.
- Reusar `Dialog`, `Card`, `Badge`, `Button`, `Textarea`, `Input`, `Select`, `toast` (sonner).
  **Nenhuma biblioteca nova.**

**`anexo-campo.tsx`** (client) — a única peça delicada:
1. `<input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf">`.
2. Valida **antes** de subir: tamanho ≤ 5 MB, `file.type` na allowlist, extensão derivada do
   `file.type` (**não** do nome do arquivo — o nome é do usuário).
3. `path = \`${alunoId}/${crypto.randomUUID()}.${ext}\``.
4. `createClient()` (browser) → `supabase.storage.from("gps-chamados").upload(path, file, { contentType: file.type, upsert: false })`.
5. Devolve `AnexoInput` ao formulário pai — que só então chama a action.
6. Erros com frase própria: **413** → *"Arquivo maior que 5 MB."*; **415/400 de MIME** →
   *"Formato não aceito. Envie PNG, JPG, WEBP ou PDF."*; **403** → *"O suporte está fechado no
   momento."* (é o interruptor barrando pela policy).
7. Barra de progresso simples e botão "Remover anexo" antes de enviar.

**`anexo-link.tsx`** — `anexo_expurgado_em` preenchido → texto
*"{nome} — removido por retenção em dd/mm/aaaa"*, **sem link**. Senão, botão que chama
`urlAssinadaDoAnexo` (60 s) e abre. **Sempre com `download=`**, mesmo para imagem: PDF renderizado
inline vem do domínio do Supabase, não do portal, mas download é a opção que não depende disso.
Miniatura só para `image/*`, com a mesma URL assinada.

**Textos (português, definitivos):**
- Vazio do aluno: *"Você ainda não abriu nenhum chamado. Precisa de ajuda com o portal? Abra um
  chamado e a equipe responde por aqui."*
- Ajuda do formulário: *"Descreva o que aconteceu. Se ajudar, anexe um print (PNG, JPG, WEBP) ou um
  PDF de até 5 MB. **Documentos do seu cliente não vão aqui — eles ficam na sua pasta do Drive.**"*
- Interruptor desligado (aluno): *"O suporte por chamado está temporariamente fechado. Fale com a
  equipe pelos canais de sempre."*
- Limite de abertos: *"Você já tem 5 chamados em aberto. Acompanhe os que existem antes de abrir
  outro."*
- Fechado, dentro dos 7 dias: *"Este chamado foi fechado em dd/mm. Responder reabre o chamado."*
- Fechado, fora do prazo: *"Este chamado foi fechado há mais de 7 dias. Abra um chamado novo."*
- Rótulos de status: `aberto` → **"Aguardando a equipe"**; `respondido` → **"Aguardando você"**
  (na visão do aluno) / **"Aguardando o aluno"** (na visão do admin); `fechado` → **"Fechado"**.
  🔑 O rótulo descreve **de quem é a bola**, não o estado interno — é o que faz a fila ser lida
  sem treinamento.
- Card de configuração (admin): pílula **"Suporte aberto / fechado"** + alternar, com confirmação
  em texto: *"Fechar impede o aluno de abrir e de responder chamados. A equipe continua respondendo
  e fechando os que existem."*
- 🔴 Card de configuração, quando `emailEquipe` está vazio: aviso **destacado**
  *"Ninguém recebe e-mail quando um aluno abre chamado. Informe os endereços da equipe abaixo."*
  Sem isso, o canal funciona e ninguém atende — falha silenciosa é o modo de falha proibido aqui.
- Card de retenção: *"{N} anexo(s) de chamados fechados há mais de 180 dias e {M} arquivo(s) sem
  mensagem. Expurgar apaga o arquivo definitivamente; a conversa continua no histórico."*
  Botão "Expurgar" pede confirmação e mostra o resultado (`expurgados / falhas`).

**a11y:** `Label` real em todo campo, `aria-live="polite"` no resultado de cada ação, foco de volta
ao gatilho ao fechar diálogo, `aria-label` descritivo no link de download
(`"Baixar anexo contrato.pdf"`).

### 4.8 Critérios de aceite — Fase 6

```bash
npx tsc --noEmit && npm run lint && npm run build
rg -n "service_role|SERVICE_ROLE" src/ supabase/          # VAZIO
rg -n "from \"@/components/admin/diario-labels\"" src/components/chamados/  # VAZIO
```

```sql
-- 1) tabelas sem grant de escrita e sem policy de escrita:
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='gps' and table_name in ('chamados','chamado_mensagens');
--    espera: só SELECT, só para authenticated. Nada para anon.
select tablename, cmd, policyname from pg_policies
 where schemaname='gps' and tablename in ('chamados','chamado_mensagens');
--    espera: 2 linhas, ambas cmd=SELECT.

-- 2) anon não enxerga nada (PostgREST sem Authorization):
--    GET /rest/v1/chamados  -> 401/permission denied

-- 3) aluno A não lê o chamado de B (JWT de A):
select count(*) from gps.chamados where aluno_id = '<ambiente de B>';   -- 0

-- 4) o interruptor fecha a entrada e NÃO fecha a saída (transação com rollback):
begin;
  update gps.config set valor='false' where chave='chamados_aberto';
  select gps.chamados_abertos();                    -- false
  -- com JWT de aluno: select gps.chamado_abrir('teste','x') -> 42501
  -- com JWT de admin: select gps.chamado_responder('<id>','ok') -> funciona
rollback;

-- 5) limite de 5 abertos e de 20 mensagens: criar 5 e tentar a 6ª -> 42501.

-- 6) anexo fantasma é recusado (path válido, objeto inexistente):
--    select gps.chamado_abrir('t','x','<aluno_id>/<uuid>.pdf','a.pdf','application/pdf',10)
--    -> 42501 "anexo nao encontrado"

-- 7) anexo com prefixo de OUTRO ambiente é recusado:
--    mesmo teste com '<aluno_id de outro ambiente>/<uuid>.pdf' -> 42501

-- 8) as guardas de storage falham fechado:
select gps.pode_ver_anexo_chamado('../../etc/passwd'),
       gps.pode_ver_anexo_chamado(null),
       gps.pode_anexar_chamado('x/y.exe'),
       gps.pode_anexar_chamado('<aluno_id>/a.pdf');     -- os 4 devem ser false

-- 9) policies do bucket, e só as 3:
select policyname, cmd from pg_policies
 where schemaname='storage' and tablename='objects' and policyname like 'gps_chamados_%';

-- 10) e-mail só na TRANSIÇÃO: duas mensagens seguidas do aluno ->
--     a 1ª devolve `avisar` preenchido, a 2ª devolve null.

-- 11) excluir acesso de quem tem chamado não quebra:
begin;
  select gps.admin_excluir_acesso('<aluno_id de teste>');   -- sem 23503
rollback;
```

**Navegador (obrigatório, build verde não prova tela):** abrir chamado com anexo como aluno;
conferir a fila em `/admin/chamados`; responder como equipe; ver o e-mail sair (ou o
`console.error` explicando por quê); baixar o anexo pelo link assinado; **abrir a URL assinada em
janela anônima depois de 60 s** (tem de falhar); fechar; responder no 3º dia (reabre); simular o 8º
dia mexendo em `fechado_em` numa transação com rollback.

---

## 5. Ordem de execução e paralelismo

```
FASE 5  ──►  FASE 7-B  ──►  FASE 7-A  ──►  FASE 6
(diário)     (meta 150k)     (financeiro)    (chamados)
```

**Por que esta ordem** (esforço × risco, e não importância):
- **5** é uma função só, zero linha de dado muda, reverte com `drop function`.
- **7-B** é aditiva pura, **zero backfill**, e entrega a comprovação de faturamento — o pedido mais
  direto do Marcio.
- **7-A** depende da **medição em `cs.contatos_hm`** (§3.0) e é a primeira que lê schema de outro
  sistema.
- **6** é a única com storage, bucket, policies em `storage.objects` e e-mail — a mais cara de
  reverter e a que o pentest precisa examinar com calma.

**🔴 Colisões previstas — não rodar em paralelo:**

| arquivo | quem toca | regra |
|---|---|---|
| `src/components/admin/alunos-ativos-lista.tsx` | Fase 5 (nota rápida, filtros) **e** 7-B (coluna honorários, ordenação) | **Sequenciar.** A 7-B só começa depois do commit da 5. O agente da 7-B relê o arquivo antes de editar. |
| `gps.admin_painel_alunos()` | 7-B | ninguém mais |
| `gps.admin_painel_atendimento()` | 5 (cria) e 6 (acrescenta `chamados_abertos`) | a 6 faz `drop`+`create` partindo do corpo vigente |
| `src/lib/nav.ts` / `nav-tabs.tsx` | 7-A (aba Financeiro) **e** 6 (aba Suporte) | **Sequenciar.** A 6 relê `nav.ts` antes de editar — a assinatura de `alunoNavItems` já terá mudado. |
| `src/app/admin/page.tsx` | 5 (troca a query) | ninguém mais |
| `src/lib/types.ts` | 7-B (`TIPOS_EVENTO`, `ClienteEtapa1`) | ninguém mais |

**Paralelismo DENTRO de cada fase:** `backend-engineer` e `frontend-engineer` na mesma mensagem,
com uma regra — **o backend fecha o contrato de tipos primeiro** (`types.ts` / `*-tipos.ts`) e avisa
no scratchpad; o frontend lê o arquivo antes de começar **e de novo antes do build final**. É o
mesmo protocolo que funcionou na Fase 8 do Plantão.

**Pentest:**
- Obrigatório e bloqueante nas Fases **6** e **7-A** (upload, dado pessoal, endpoint novo,
  leitura de schema de outro sistema).
- **Curto e obrigatório também na Fase 5** — a RPC nova expõe trecho de nota (PII de terceiro) numa
  tela de lista.
- Fase 7-B: sem pentest dedicado; entra junto com o da 7-A (mesma família de arquivos).

---

## 6. Mensagens de commit

```
Fase 5
  feat(diario): resumo de atendimento no painel e nota rápida no card

  Uma RPC agregada (gps.admin_painel_atendimento) no lugar da varredura de
  pendências agregada em JavaScript; card do painel mostra a última nota
  (trecho de 140 caracteres cortado no banco) e ganha "Nota rápida" sem sair
  da lista; filtros "com nota nos últimos 7 dias" e "sem nenhuma nota".
  O Diário continua EXCLUSIVO do admin — nenhuma policy nova para o aluno.
  O card deixou de ser um <Link> envolvendo tudo (botão dentro de link).

Fase 7-B
  feat(clientes): honorários do cliente contratado e meta de R$ 150.000
  feat(admin): painel soma os honorários contratados por ambiente
  feat(diario): audita mudança de valor de honorários

  Colunas nascem NULL nas 879 linhas — nenhum backfill, ninguém muda de
  valor. Sem constraint ligando o valor à fase: o valor sobrevive a voltar
  de fase e para de contar na meta. Link do contrato, nunca upload.

Fase 7-A
  feat(financeiro): aba com o contrato do aluno lida de cs.contatos_hm

  RPC SECURITY DEFINER somente leitura. Sócio NÃO vê (o contrato é do
  titular). Saldo = coalesce(saldo_a_pagar_manual, total - pago) e fica
  "não informado" quando não dá para calcular — nunca R$ 0,00.
  credito_valor_pago e cancelamento_valor são exibidos, nunca calculados.
  Os 31 ambientes sem registro veem a mensagem honesta, não a aba escondida.

Fase 6
  feat(suporte): chamados com thread e anexo (bucket gps-chamados)
  feat(admin): fila de chamados, interruptor e expurgo de retenção
  refactor(datas): formatarDataHora sai de components/admin para lib/datas

  Tabelas append-only: grant select e nada mais; toda escrita por RPC
  SECURITY DEFINER. Anexo é prova de problema no portal, NÃO documento do
  cliente (esse continua no Drive). E-mail acompanha a mudança de status,
  não a mensagem. Retenção de 180 dias com expurgo pela tela do admin — um
  cron SQL apagaria a linha e deixaria o arquivo no object store.
```

---

## 7. Vetores para o `security-pentester`

**Fase 5**
1. Chamar `gps.admin_painel_atendimento()` com JWT de aluno e com `anon` — tem de dar 42501/negado,
   nunca lista vazia.
2. Confirmar que **nenhuma** policy nova apareceu em `gps.aluno_notas` (`pg_policies`).
3. Confirmar que `texto` integral não sai em nenhuma resposta de `/admin` (payload do RSC).
4. `registrarNota` chamada direto (Server Action é endpoint HTTP) com `alunoId` de outro ambiente,
   com `autor_id` forjado no corpo, com `eventoId` de outro aluno.

**Fase 6 (a mais densa)**
5. **Path traversal e nome:** subir com `name` = `../outro/x.pdf`, `x/../../y.pdf`, `%2e%2e/`,
   nome com `\0`, nome de 4 KB, nome com `/` e `\`.
6. **Prefixo de outro ambiente:** aluno A subindo em `<aluno_id de B>/uuid.pdf` (policy) e gravando
   mensagem com esse path (RPC).
7. **MIME x extensão:** `.pdf` com bytes de HTML/SVG; `Content-Type: image/png` num `.exe`;
   `image/svg+xml` (tem de ser recusado pelo bucket); duplo `.pdf.html`.
8. **Tamanho:** 5 MB + 1 byte; `Content-Length` mentiroso; upload chunked.
9. **Leitura cruzada:** aluno A pedindo `createSignedUrl` do anexo de B; reusar URL assinada depois
   de 60 s; URL assinada compartilhada com `anon`.
10. **`anon` no bucket:** `GET /storage/v1/object/gps-chamados/...` sem `Authorization`; listar o
    bucket; `POST` sem sessão.
11. **Sobrescrita:** `upsert: true` no mesmo path (não há policy de UPDATE — confirmar que falha).
12. **Delete:** aluno tentando apagar o próprio anexo e o de outro (só admin pode).
13. **Escalada de papel:** aluno chamando `chamado_responder` num chamado de outro; forjar
    `autor_papel='equipe'` (o cliente não informa papel — confirmar que não há caminho).
14. **Escrita direta pelas tabelas:** `POST /rest/v1/chamados` e `/chamado_mensagens` com JWT de
    aluno e de admin — tem de falhar por falta de grant/policy, nos dois.
15. **Interruptor:** com `chamados_aberto=false`, tentar abrir/responder/anexar por RPC **e** por
    policy de storage; confirmar que a equipe continua respondendo.
16. **Limites:** estourar 5 abertos, 20 mensagens, 4.000 caracteres; medir o custo de 100 uploads
    de 5 MB seguidos (o teto teórico de 62 GB está declarado em 4.0-5).
17. **Órfão como canal de armazenamento:** subir 50 arquivos sem nunca abrir chamado; confirmar que
    aparecem na lista de expurgo com motivo `orfao` e que o interruptor barra.
18. **`gps.config`:** aluno lendo/gravando a tabela (não tem grant); `chamados_abertos()` chamada
    por `anon`; injeção pelo campo de e-mails da equipe (`chamados_email_equipe`) — cabeçalho de
    e-mail, CRLF, endereço externo arbitrário.
19. **E-mail:** confirmar que **nenhum** e-mail carrega o texto da mensagem; que falha de Resend não
    desfaz o chamado; que o `avisar` não devolve o e-mail da equipe quando quem responde é a equipe.
20. **Expurgo:** aluno chamando `chamados_anexos_para_expurgo()` e `chamado_anexo_marcar_expurgado()`;
    `expurgarAnexo` com `path` arbitrário (fora do bucket, de outro bucket, `../`).
21. **`gps.admin_excluir_acesso`** com um aluno que tem chamado e anexo — sem 23503, e os anexos
    aparecendo como órfãos depois.

**Fase 7-A**
22. `gps.financeiro_do_aluno` com: JWT de **sócio** do próprio ambiente (tem de dar 42501), aluno de
    outro ambiente, `anon`, `p_aluno_id` nulo, UUID inexistente, e enumeração em laço.
23. Confirmar `prosecdef=true`, `provolatile='s'` e **zero** verbo de escrita no corpo.
24. Confirmar que `authenticated` **não** ganhou grant em `cs.contatos_hm`
    (`has_table_privilege` = false) e que nenhuma view nova foi criada no schema `cs`.
25. Rota `/financeiro` acessada por sócio e por `sem_acesso` (o redirect é defesa em profundidade,
    não a fronteira).
26. Payload do RSC de `/financeiro`: conferir que não vaza coluna que a tela não usa
    (`contrato_aurum`, documento, etc.).

**Fase 7-B**
27. `atualizarCliente` chamada direto com `{ status: ... }` (a allowlist tem de continuar barrando),
    com `valor_honorarios` negativo/`NaN`/string, `contrato_url` = `javascript:`, `data:`,
    `https://` + CRLF, URL de 10 KB.
28. Aluno A gravando honorários num cliente de B (RLS de `gps.etapa1_clientes`).

---

## 8. Os 5 critérios do Fable

| Critério | O que o plano garante |
|---|---|
| **Segurança** | Nenhuma tabela nova ganha grant para `anon`. Chamados são `select`-only com escrita por RPC `SECURITY DEFINER` — papel derivado no servidor, cliente nunca informa quem é. Storage com 3 policies e duas guardas que **falham fechado**, path com formato imposto por CHECK **e** por regex de policy. `gps.financeiro_do_aluno` é DEFINER porque `authenticated` não pode ganhar grant em `cs.contatos_hm` — e **o sócio não lê o financeiro do titular** (13 pessoas reais). O Diário continua sem nenhuma policy para o aluno (C3 intacto). Superfície nova auditada em 28 vetores. |
| **Escalabilidade** | Fase 5 **troca** uma varredura de `aluno_notas` agregada em JS por `distinct on` servido por índice existente. Fase 7-B soma no `filter` de uma CTE que já varre a tabela: **zero query nova** no painel, na home e na aba Clientes. Fase 7-A é `where aluno_id = $1` (≤ 2 linhas). Fase 6 tem índice parcial na fila (cresce só com o que está aberto, não com o histórico) e limites duros no banco; o teto teórico de storage (62 GB) está calculado e declarado, com interruptor e expurgo como contenção. Nenhum índice sem a query escrita ao lado; um índice **recusado** de propósito, com a justificativa. |
| **Solidificação** | Invariantes que o banco passa a garantir sozinho: chamado e thread **append-only por ausência de grant** (assunto imutável, mensagem não editável, status só por RPC); `chk_anexo_completo` impede anexo pela metade; `chk_chamado_fechado_tem_data`; formato do path do anexo por CHECK; `contrato_url` só `https` sem espaço (barra `javascript:`/`data:` na origem); `valor_honorarios >= 0`; existência real do objeto conferida antes de gravar anexo (nada de anexo fantasma); FKs `on delete set null` que impedem `admin_excluir_acesso` de quebrar com 23503. |
| **UX** | Três abas com estados **vazio, erro e sem-permissão escritos um a um**, em português, sem "—" mudo: "Sem nota no Diário", "Financeiro não disponível para este cadastro", "Nenhum cliente contratado ainda" (sem barra de 0%). Rótulo de status diz **de quem é a bola** ("Aguardando a equipe"), não o estado interno. O card do painel para de ser um `<Link>` engolindo botão (teclado e HTML válidos). Aviso destacado quando ninguém recebe e-mail de chamado — o modo de falha silencioso é o único proibido. Prazos ditos **antes** do clique (reabertura em 7 dias, retenção de 180). |
| **Otimização** | Fase 5 **remove** `getPendenciasPorAluno` e a agregação em JavaScript. Fase 7-B não acrescenta **nenhuma** consulta: reusa os clientes já carregados e um `filter` na CTE existente; a regra da meta é uma função pura em `etapa1.ts`, ao lado de `resumoEtapa1`, e **não** é duplicada em SQL. Fase 6 tira `formatarDataHora` de `components/admin/` para `lib/datas.ts`, matando o import de componente para componente. `DiarioForm` ganha uma variante em vez de um segundo formulário. Nenhuma biblioteca nova em nenhuma das três fases. |

**Onde eu não atendo e por quê (argumento explícito):**
- **Otimização, Fase 7-A:** a aba Financeiro **só acrescenta** — uma RPC, uma rota, um componente.
  Não há dívida adjacente para pagar: `cs.contatos_hm` nunca foi lido pelo GPS. A compensação da
  fase está na 7-B (zero query nova) e na 5 (uma query a menos).
- **Escalabilidade, Fase 6:** o crescimento do bucket é contido por limites e por um expurgo que
  **depende de alguém clicar**. É consequência direta de não usar `service_role`, está declarado, e
  o contador na tela é o que impede o esquecimento virar silêncio.

---

## 9. Para levar ao Marcio (não travam a execução)

1. **`credito_valor_pago` e `cancelamento_valor`:** qual é a semântica no `sip`? Enquanto não
   houver resposta, os dois **aparecem rotulados e não entram em nenhuma conta** — a tela funciona.
2. **Os 31 ambientes sem linha em `cs.contatos_hm`:** é lacuna de cadastro no `sip`? Se for, a
   correção é lá; o portal já mostra a mensagem honesta e o admin já vê o diagnóstico.
3. **B7-b (sócio não vê o financeiro):** decisão minha, conservadora. Se o Marcio quiser abrir para
   o sócio, é apagar o `exists (... papel='titular')` da guarda.
4. **B10 (herdado):** a copy sequencial fechou a Etapa 01 para 58 de 63 ambientes. Continua pendente.

---

## 10. Medição §3.0 já feita pelo orquestrador (09/09, banco real) — o backend NÃO precisa repetir
- (a) tipos: `aluno_id uuid?`, `valor_total numeric?`, `valor_pago numeric?`, `saldo_a_pagar_manual numeric?`, `cancelamento_valor numeric?`, `credito_valor_pago numeric?`, `pagamento_forma text?`, `pagamento_parcelas integer?`, `pagamento_em timestamptz?`, `pagamento_previsto_em date?`, `quitado_em timestamptz?`, `produto text NOT NULL`, `plano text?`, `turma text?`, `cancelamento_em timestamptz?`, `contrato_aurum numeric?`.
- (b) produtos entre quem está no GPS: **HM = 94, AURUM = 2** → o aviso do AURUM na UI (§3.3 item 5) É necessário.
- (c) duplicados (aluno, produto): **0**.
- (d) saldo desconhecido (sem manual e sem aritmética): **4** linhas → a tela vai mostrar "não informado" para elas (B7-d).
- (e) `postgres` lê `cs.contatos_hm`: **true**. RLS em `cs.contatos_hm`: **ligada** (a RPC SECURITY DEFINER passa por cima; por isso a guarda titular/admin é a única barreira).
- Amostra (4 linhas HM): total 13.072,68 / pago 1.449,98 / crédito 3.997 (sem quitação) · total 15.000 / pago 15.000,06 / quitado 11/08 · total 15.000 / pago 300 · total 15.000 / pago 15.000 / quitado 05/08. Observação: `valor_pago` pode exceder `valor_total` por centavos (15.000,06) — saldo negativo pequeno deve virar "quitado", não "-R$ 0,06".
- Par de teste para a guarda do financeiro (orquestrador roda com set_config de JWT, em transação com rollback): ambiente `191699db-b7b1-4e62-9793-24b280356e76` (tem linha em contatos_hm) — titular user `67f5d002-bf52-4764-b5cb-7f0c6df31eca`, sócio user `f508c710-d0b2-4c08-8be2-da041fb57613`.

---

CONTRATO FASE 5 PUBLICADO: `AtendimentoDoAluno` em `src/lib/data.ts:607` (leitura: `getAtendimentoPorAluno(): Promise<Map<string, AtendimentoDoAluno>>` em `src/lib/data.ts:642`).

```ts
export interface AtendimentoDoAluno {
  pendenciasAbertas: number;
  /** ISO da nota mais recente do ambiente. `null` = nenhuma nota no Diário. */
  ultimaNotaEm: string | null;
  ultimaNotaTipo: TipoNota | null;   // import type { TipoNota } from "@/lib/types"
  /** Trecho de até 140 caracteres, cortado no BANCO. Nunca o texto integral. */
  ultimaNotaResumo: string | null;
}
```

Notas para o `frontend-engineer`:
- O tipo mora em `src/lib/data.ts` (NÃO em `types.ts` — §5 reserva `types.ts` para a Fase 7-B).
  Importar com `import type { AtendimentoDoAluno } from "@/lib/data"`.
- `src/app/admin/page.tsx` já passa `atendimentoPorAluno={Record<string, AtendimentoDoAluno>}`
  para `<AlunosAtivosLista>`; a prop `pendenciasPorAluno` NÃO existe mais.
- Ambiente **sem nenhuma nota não aparece no Record** — o lookup devolve `undefined`.
  É esse o caso de "Sem nota no Diário"; contagem de pendência = `atendimento?.pendenciasAbertas ?? 0`.
- `ultimaNotaEm` só é `null` se a linha existir sem nota, o que a RPC não produz: na prática,
  linha presente ⇒ os três campos de nota preenchidos. Trate como nullable mesmo assim.
- `ultimaNotaResumo` JÁ vem cortado em 140 no banco; não há reticências — a UI é que acrescenta.

### Bloco SQL de conferência — Fase 5 (para o orquestrador, via MCP)

> ⚠️ Dois ajustes sobre os checks escritos em §1.4, com o motivo:
> 1. `explain (analyze) select * from gps.admin_painel_atendimento()` **não mostra o plano
>    interno** — função plpgsql aparece como `Function Scan` e nada mais. Para ver os índices é
>    preciso rodar o CORPO da query direto (check 5 abaixo).
> 2. `gps.aluno_notas` é tabela pequena; **`Seq Scan` no plano NÃO é regressão** se o custo bater.
>    O que importa é não haver `Sort` externo caro nem `Rows Removed by Filter` alto no `pend`.

```sql
-- 0) ANTES de aplicar: a migração não escreve nada. Guardar para comparar.
select count(*) as notas_antes from gps.aluno_notas;

-- 1) DEPOIS: nenhuma linha escrita.
select count(*) as notas_depois from gps.aluno_notas;   -- == notas_antes

-- 2) A função nasceu com os atributos certos (INVOKER, stable, search_path='',
--    sem execute para public/anon).
select p.proname,
       p.prosecdef            as security_definer,   -- espera: false
       p.provolatile          as volatilidade,       -- espera: s
       p.proconfig            as config,             -- espera: {search_path=}
       pg_catalog.array_to_string(p.proacl, ' | ') as acl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps' and p.proname = 'admin_painel_atendimento';
-- acl: só authenticated=X. Se aparecer =X/ (public) ou anon=X, o revoke não pegou.

-- 3) O trecho nunca passa de 140 (rodar como ADMIN):
select count(*)                        as ambientes_com_nota,
       max(length(ultima_nota_resumo)) as maior_trecho    -- <= 140
  from gps.admin_painel_atendimento();

-- 4) A contagem casa com a fonte antiga — 0 divergências:
select a.aluno_id
  from gps.admin_painel_atendimento() a
  full join (select aluno_id, count(*) c
               from gps.aluno_notas
              where tipo = 'pendencia' and resolvido_em is null
              group by 1) b
    on b.aluno_id = a.aluno_id
 where coalesce(a.pendencias_abertas, 0) is distinct from coalesce(b.c, 0);   -- 0 linhas

-- 5) Plano REAL (corpo da função, não a chamada):
explain (analyze, buffers)
with ult as (
  select distinct on (n.aluno_id)
         n.aluno_id, n.criado_em, n.tipo, left(n.texto, 140) as resumo
    from gps.aluno_notas n
   order by n.aluno_id, n.criado_em desc
), pend as (
  select n.aluno_id, count(*)::integer as abertas
    from gps.aluno_notas n
   where n.tipo = 'pendencia' and n.resolvido_em is null
   group by n.aluno_id
)
select u.aluno_id, coalesce(p.abertas, 0), u.criado_em, u.tipo, u.resumo
  from ult u left join pend p on p.aluno_id = u.aluno_id;

-- 6) Não-admin recebe 42501 (rodar com JWT de aluno, nunca com a role de serviço):
select * from gps.admin_painel_atendimento();   -- espera: 42501 'apenas administradores'
```

---

## 11. CONTRATO FASE 7-A PUBLICADO: `ContratoFinanceiro`, `ResultadoFinanceiro`, `SituacaoContrato`, `TOLERANCIA_CENTAVOS`, `getFinanceiroDoAluno(alunoId)` em `src/lib/financeiro.ts`

(backend-engineer, 09/09 — o arquivo está fechado; pode importar.)

```ts
import { getFinanceiroDoAluno } from "@/lib/financeiro";
import type { ContratoFinanceiro, ResultadoFinanceiro, SituacaoContrato } from "@/lib/financeiro";

type ResultadoFinanceiro =
  | { estado: "ok"; contratos: ContratoFinanceiro[] }
  | { estado: "sem_registro" }   // 0 linhas — os 31 ambientes sem cadastro
  | { estado: "sem_permissao" }  // sócio / outro ambiente / sem sessão
  | { estado: "erro" };          // falha de banco — NUNCA vira "sem_registro"

interface ContratoFinanceiro {
  produto, plano, turma: string | null;
  valorTotal, valorPago, saldo: number | null;   // saldo null = não dá para calcular
  saldoEManual: boolean;                          // a equipe digitou o saldo
  creditoValorPago, cancelamentoValor: number | null;  // EXIBIR, NUNCA SOMAR (B7-c)
  cancelamentoEm, pagamentoEm, quitadoEm: string | null;      // ISO timestamptz
  pagamentoPrevistoEm: string | null;                         // ISO date
  pagamentoForma: string | null;
  pagamentoParcelas: number | null;
  // ── derivados: calculados no servidor, a UI NÃO recalcula ──
  situacao: "cancelado" | "quitado" | "em_aberto" | "indefinido";
  saldoExibido: number | null;      // quitado→0 · cancelado→null · indefinido→null · em_aberto→valor
  divergenciaQuitacao: number | null; // SÓ ADMIN: quitado com aritmética discordante
}
```

**Como a UI usa (não refazer conta):**
- `situacao === "indefinido"` **ou** `saldoExibido === null` fora de `"cancelado"` → **"não informado"**, nunca `R$ 0,00`.
- `situacao === "quitado"` → selo *"Quitado em dd/mm/aaaa"* (`quitadoEm`, que pode ser `null` quando a quitação veio do saldo zerado) + saldo `R$ 0,00`. Já cobre o caso medido de `valor_pago` 15.000,06 contra 15.000,00 (**não** mostrar "−R$ 0,06"): `TOLERANCIA_CENTAVOS = 0,50`.
- `situacao === "cancelado"` → card em tom neutro-alerta, "Contrato cancelado em dd/mm/aaaa", linha "Valor do cancelamento" e **sem saldo a pagar**.
- `divergenciaQuitacao !== null` → linha *"Cálculo diverge: total − pago = R$ X."* **só quando `ehAdmin`**.
- `produto === "AURUM"` → linha *"Os valores do AURUM são consolidados fora deste portal."* (medido: 2 linhas AURUM).
- `getFinanceiroDoAluno` já barra sócio antes de ir ao banco (defesa em profundidade); o `redirect` da rota continua obrigatório.
- Nada de formatação de moeda aqui: `financeiro.ts` importa `@/lib/supabase/server`, então **só `import type`** em componente `"use client"`. O `financeiro-view` pode ser Server Component.

### 11.1 Bloco de conferência da Fase 7-A (o orquestrador roda; o backend não tem banco)

> Aplicar `supabase/migrations/20260909000100_gps_financeiro_do_aluno.sql` e, em seguida,
> `notify pgrst, 'reload schema';` — sem isso o PostgREST devolve 404 na RPC recém-criada.

```sql
-- (0) a função existe, é DEFINER, é stable e NÃO escreve
select prosecdef, provolatile,
       prosrc ~* '\m(insert|update|delete|truncate|copy|merge)\M' as escreve,
       proacl
  from pg_proc where oid = 'gps.financeiro_do_aluno(uuid)'::regprocedure;
-- espera: prosecdef=t · provolatile='s' · escreve=f · proacl SEM public/anon,
--         com {postgres=X/postgres,authenticated=X/postgres}

-- (1) GUARDA SEM JWT -> 42501 (o revoke barra antes mesmo do corpo)
begin;
  set local role anon;
  select * from gps.financeiro_do_aluno('00000000-0000-4000-8000-000000000000');
rollback;
-- espera: ERROR 42501 permission denied for function financeiro_do_aluno

-- (1b) role authenticated SEM claims (auth.uid() null) -> 42501 'sem permissao'
begin;
  set local role authenticated;
  select * from gps.financeiro_do_aluno('00000000-0000-4000-8000-000000000000');
rollback;
-- espera: ERROR 42501 sem permissao   (falha FECHADO)

-- (2) achar um titular real E um sócio real do MESMO ambiente, com contrato
select t.aluno_id, t.user_id as titular_user_id, s.user_id as socio_user_id
  from gps.membros t
  join gps.membros s
    on s.aluno_id = t.aluno_id and s.papel = 'socio' and s.user_id is not null
 where t.papel = 'titular' and t.user_id is not null
   and exists (select 1 from cs.contatos_hm h where h.aluno_id = t.aluno_id)
 limit 1;

-- (3) TITULAR vê (troque os dois placeholders pelo resultado de (2))
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<TITULAR_USER_ID>","role":"authenticated"}';
  select * from gps.financeiro_do_aluno('<ALUNO_ID>');
rollback;
-- espera: 1+ linhas, com saldo preenchido ou NULL (nunca 0 fabricado)

-- (4) 🔴 SÓCIO NÃO VÊ (mesmo ambiente, mesma linha, papel diferente)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<SOCIO_USER_ID>","role":"authenticated"}';
  select * from gps.financeiro_do_aluno('<ALUNO_ID>');
rollback;
-- espera: ERROR 42501 sem permissao

-- (5) titular pedindo OUTRO ambiente -> 42501 (mesma mensagem de ambiente
--     inexistente: enumerar em laço não distingue os dois casos)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<TITULAR_USER_ID>","role":"authenticated"}';
  select * from gps.financeiro_do_aluno(
    (select m.aluno_id from gps.membros m where m.aluno_id <> '<ALUNO_ID>' limit 1));
rollback;
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<TITULAR_USER_ID>","role":"authenticated"}';
  select * from gps.financeiro_do_aluno('11111111-1111-4111-8111-111111111111');
rollback;
-- espera nos dois: ERROR 42501 sem permissao

-- (6) argumento nulo -> 22023 (e não "sem registro")
select * from gps.financeiro_do_aluno(null);
-- espera: ERROR 22023 aluno nao informado

-- (7) ninguém ganhou grant na tabela do sip, e não nasceu view no schema cs
select has_table_privilege('authenticated','cs.contatos_hm','select') as auth_le,
       has_table_privilege('anon','cs.contatos_hm','select')          as anon_le;
-- espera: false, false
select table_name from information_schema.views where table_schema = 'cs';
-- espera: nenhuma view nova em relação ao inventário anterior

-- (8) cobertura bate com a medida do orquestrador (94 de 125)
select count(*) filter (where existe) as com_contrato, count(*) as ambientes from (
  select m.aluno_id, exists(select 1 from cs.contatos_hm h where h.aluno_id = m.aluno_id) as existe
    from (select distinct aluno_id from gps.membros) m) t;

-- (9) o índice por aluno_id da tabela do sip é usado (nenhum índice novo foi criado)
explain (analyze, buffers)
select h.produto from cs.contatos_hm h where h.aluno_id = '<ALUNO_ID>';
-- espera: Index Scan / Bitmap por aluno_id, não Seq Scan
```

```bash
# (10) PostgREST sem Authorization -> não executa (401/404, nunca 200 com dados)
curl -si -X POST "$SUPABASE_URL/rest/v1/rpc/financeiro_do_aluno" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -H "Content-Profile: gps" -H "Accept-Profile: gps" \
  -d '{"p_aluno_id":"<ALUNO_ID>"}' | head -20
```

**Navegador:** titular com linha (números) · titular sem linha (mensagem (c)) · sócio (a aba não
aparece e `/financeiro` redireciona) · admin em `/admin/aluno/<id>/financeiro`.

## 12. Aplicado e conferido pelo orquestrador (09/09)
- `gps.financeiro_do_aluno` (migração ...100) aplicada. Guarda provada: sem JWT → 42501; titular real → 1 linha (HM, total 15.000, pago 15.000,04, saldo -0,04 → a UI mostra "Quitado"); sócio do MESMO ambiente → 42501.
- `gps.admin_painel_atendimento` (migração ...080) aplicada. Admin real: 22 alunos com nota (= 22 notas), max(resumo) = 140, 0 pendências abertas; `aluno_notas` continua com 22 linhas (zero escrita).

---

## 13. CONTRATO FASE 7-B PUBLICADO: `ClienteEtapa1.valor_honorarios`/`contrato_url`, `META_HONORARIOS`, `ResumoHonorarios`, `resumoHonorarios(clientes)`, `AlunoGps.honorariosContratados`/`contratados`/`contratadosSemValor`

Backend (09/09). `types.ts`, `etapa1.ts`, `data.ts` e `actions.ts` estão **fechados** — o
frontend pode ler os arquivos e começar. Nenhum outro campo vai mudar nesta fase.

### `src/lib/types.ts`
```ts
export interface ClienteEtapa1 {
  /* … campos atuais, nada mudou … */
  /** Honorários CONTRATADOS, em reais. `null` = não informado (≠ R$ 0,00). */
  valor_honorarios: number | null;
  /** Link https do contrato no Drive. `null` quando não informado. */
  contrato_url: string | null;
}
// TIPOS_EVENTO ganhou "cliente_honorarios_definidos" (18 tipos).
```

### `src/lib/etapa1.ts`
```ts
export const META_HONORARIOS = 150_000;

export interface ResumoHonorarios {
  total: number | null;          // soma dos contratados COM valor; null = nenhum
  contratados: number;
  contratadosSemValor: number;
  pct: number | null;            // 0–100, teto 100; null quando total é null
}
export function resumoHonorarios(clientes: ClienteEtapa1[]): ResumoHonorarios;
```
Pura, sem I/O. É a MESMA regra da CTE `cli` de `gps.admin_painel_alunos()` (migração ...091):
só `fase === "contratado"` conta; cliente que voltou de fase mantém o valor no banco e some da
meta. Os três estados da barra (§2.4) saem daqui direto:
`contratados === 0` · `contratados > 0 && total === null` · `total !== null`.

### `src/lib/data.ts` — `AlunoGps` (para `alunos-ativos-lista.tsx`)
```ts
  honorariosContratados: number | null;  // null = nenhum contratado com valor → mostrar "—"
  contratados: number;
  contratadosSemValor: number;
```
⚠️ **Não chamar `resumoHonorarios` no painel**: lá não há linhas de cliente, os números já vêm
agregados do banco. Para a ordenação "honorários", `null` vai sempre para o fim (desc), desempate
por nome — `null` é "não informado", não é o menor valor.

### `src/app/etapa-1/actions.ts`
`PatchCliente` **e** `CHAVES_PATCH_CLIENTE` já têm os dois campos. O servidor normaliza e valida
antes do banco (`validarPatch`), então o front pode mandar:
- `valor_honorarios`: `number` finito `>= 0`, ou `null`. String vazia também vira `null`.
  Erros em português: "Honorários não podem ser negativos." / "Honorários: informe um valor
  numérico." / "Honorários: valor acima do limite permitido."
- `contrato_url`: string `https://…` sem espaço, 12–2000 chars, ou `null`. **String vazia/só
  espaço vira `null` automaticamente** — o front não precisa tratar o campo limpo, e o CHECK do
  banco não é acionado por campo em branco.
  Erros: "O link do contrato precisa começar com https:// (o endereço do Drive)." / "O link do
  contrato não pode conter espaços." / "Link do contrato inválido (tamanho fora do permitido)."

### Catálogo do diário (feito, é do backend)
`ROTULO_TIPO_EVENTO.cliente_honorarios_definidos = "Registrou os honorários do cliente"`
(`src/components/admin/diario-labels.ts`) e a macro em `src/lib/log-agregacao.ts`
(`Registrou honorários de N clientes`). `detalhe` do evento é `{de, para}`.

### Migrations entregues (NÃO aplicadas — o João aplica)
`supabase/migrations/20260909000090_gps_etapa1_clientes_honorarios.sql` ·
`...091_gps_admin_painel_alunos_honorarios.sql` (drop+create, 3 colunas novas no fim) ·
`...092_gps_aluno_eventos_honorarios.sql` (CHECK com 18 tipos + trigger).
⚠️ Enquanto as migrations não forem aplicadas, `getAlunosGps` recebe `undefined` nas 3 colunas
novas (a coluna não existe na RPC antiga) → `honorariosContratados` cai em `null` e a UI mostra
"—". Nenhuma tela quebra, mas o número só aparece depois de aplicar.

### 13.1 Bloco de conferência da Fase 7-B (o orquestrador roda; o backend não tem banco)

Ordem: **(0) antes de aplicar → aplicar 090, 091, 092 nessa ordem → (1)…(10)**.

```sql
-- (0) LINHA DE BASE, ANTES de aplicar. Guardar os três números.
select count(*)                                    as clientes_total,   -- espera 879
       count(*) filter (where fase = 'contratado') as contratados,      -- espera 0
       (select count(*) from gps.aluno_eventos)    as eventos_antes     -- guardar
  from gps.etapa1_clientes;
-- e, LOGADO COMO ADMIN, guardar o retorno inteiro para comparar depois:
select aluno_id, qtd_membros, tem_login, desde, ultimo_acesso,
       clientes_preenchidos, clientes_com_dados, clientes_com_perda,
       agendados, tarefas_concluidas
  from gps.admin_painel_alunos() order by aluno_id;
```

```sql
-- (1) A COLUNA NOVA NASCEU VAZIA NAS 879 -- e nenhuma virou 0.
select count(*)                                         as total,      -- 879
       count(valor_honorarios)                          as com_valor,  -- 0
       count(*) filter (where valor_honorarios = 0)     as zerados,    -- 0  <-- o que importa
       count(contrato_url)                              as com_link,   -- 0
       count(*) filter (where valor_honorarios is null) as nulos       -- 879
  from gps.etapa1_clientes;
-- `zerados` = 0 e o teste que importa: DEFAULT esquecido ou backfill acidental
-- apareceria aqui como "faturamento zero" plausivel, nao como erro.

-- (2) A TRILHA NAO GANHOU NEM PERDEU LINHA com a migracao.
select count(*) from gps.aluno_eventos;                  -- = eventos_antes de (0)
select count(*) from gps.aluno_eventos
 where tipo = 'cliente_honorarios_definidos';            -- 0 (o tipo so existe a partir de agora)

-- (3) O CATALOGO DE TIPOS TEM OS 18, e o nome do CHECK e o esperado.
select con.conname,
       pg_get_constraintdef(con.oid) like '%cliente_honorarios_definidos%' as tem_tipo_novo,
       pg_get_constraintdef(con.oid) like '%cliente_status_mudou%'         as manteve_historico,
       pg_get_constraintdef(con.oid) like '%cliente_fase_mudou%'           as manteve_fase
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c';
-- espera 1 linha: aluno_eventos_tipo_check | t | t | t
```

```sql
-- (4) O CHECK RECUSA NEGATIVO -- 23514, nao "salvou 0".
begin;
  update gps.etapa1_clientes set valor_honorarios = -1
   where id = (select id from gps.etapa1_clientes limit 1);   -- espera ERROR 23514
rollback;

-- (5) O CHECK DA URL BARRA O QUE TEM DE BARRAR.
begin;
  update gps.etapa1_clientes set contrato_url = 'javascript:alert(1)'
   where id = (select id from gps.etapa1_clientes limit 1);   -- espera ERROR 23514
rollback;
begin;
  update gps.etapa1_clientes set contrato_url = 'http://x.com/a'
   where id = (select id from gps.etapa1_clientes limit 1);   -- espera ERROR 23514
rollback;
begin;
  update gps.etapa1_clientes set contrato_url = 'https://drive.google.com/a b'
   where id = (select id from gps.etapa1_clientes limit 1);   -- espera ERROR 23514 (espaco)
rollback;
begin;
  update gps.etapa1_clientes set contrato_url = 'https://drive.google.com/x'
   where id = (select id from gps.etapa1_clientes limit 1);   -- espera UPDATE 1
rollback;
```

```sql
-- (6) VENDA COM ROLLBACK: o evento NASCE, e SO para o valor.
-- (update real + rollback: build verde nao ve regra que mora no trigger.)
begin;
  select count(*) as eventos_no_minuto_0 from gps.aluno_eventos
   where ocorrido_em > now() - interval '1 minute';

  update gps.etapa1_clientes set valor_honorarios = 1000
   where id = (select id from gps.etapa1_clientes limit 1);

  select tipo, detalhe, ator, origem from gps.aluno_eventos
   order by ocorrido_em desc limit 1;
  -- espera: cliente_honorarios_definidos | {"de": null, "para": 1000.00} | equipe | app

  update gps.etapa1_clientes set contrato_url = 'https://drive.google.com/x'
   where id = (select id from gps.etapa1_clientes limit 1);

  select count(*) as eventos_no_minuto_1 from gps.aluno_eventos
   where ocorrido_em > now() - interval '1 minute';
  -- espera: eventos_no_minuto_0 + 1 (o link NAO gera evento, de proposito)

  -- e a correcao de valor tambem audita, com o valor ANTERIOR:
  update gps.etapa1_clientes set valor_honorarios = 800
   where id = (select id from gps.etapa1_clientes limit 1);
  select detalhe from gps.aluno_eventos order by ocorrido_em desc limit 1;
  -- espera: {"de": 1000.00, "para": 800.00}
rollback;
-- Depois do rollback, RECONFERIR (2): o total de gps.aluno_eventos tem de
-- estar de volta em eventos_antes. Se subiu, algo gravou fora da transacao.
```

```sql
-- (7) A META HOJE E ZERO PORQUE NAO HA CONTRATADO -- e o painel diz
-- "nao informado", nunca "R$ 0,00". (Rodar LOGADO COMO ADMIN.)
select count(*) filter (where fase = 'contratado')              as contratados_no_sistema,  -- 0
       sum(valor_honorarios) filter (where fase = 'contratado') as meta_somada              -- NULL, nao 0
  from gps.etapa1_clientes;

select count(*)                                           as ambientes,
       count(honorarios_contratados)                      as com_soma,      -- 0  (NULL em todos)
       count(*) filter (where honorarios_contratados = 0) as somaram_zero,  -- 0
       sum(contratados)                                   as contratados,   -- 0
       sum(contratados_sem_valor)                         as sem_valor      -- 0
  from gps.admin_painel_alunos();
-- `com_soma = 0` e `somaram_zero = 0` juntos sao a prova de que a coluna nova
-- devolve NULL (= "nenhum contratado com valor") e nao um zero fabricado.

-- (8) O PAINEL NAO MUDOU NENHUM NUMERO ANTIGO. Rodar e comparar com (0),
-- coluna a coluna, incluindo a ORDEM das linhas.
select aluno_id, qtd_membros, tem_login, desde, ultimo_acesso,
       clientes_preenchidos, clientes_com_dados, clientes_com_perda,
       agendados, tarefas_concluidas
  from gps.admin_painel_alunos() order by aluno_id;
-- e a ordem final (que a UI usa) tem de continuar por ultimo membro:
select aluno_id from gps.admin_painel_alunos() limit 5;   -- mesma sequencia de antes

-- (9) A GUARDA DA RPC CONTINUA DE PE (o drop+create descarta a ACL).
--     Sem JWT de admin:
select * from gps.admin_painel_alunos();   -- espera 42501 'apenas administradores'
--     E o EXECUTE nao voltou para public/anon:
select p.proname, r.rolname, a.privilege_type
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
 where n.nspname = 'gps' and p.proname = 'admin_painel_alunos';
-- espera: authenticated com EXECUTE. NAO pode aparecer anon nem grantee 0 (public).

-- (10) GRANT POR COLUNA NAO EXISTE (se existisse, o aluno salvaria a ficha e o
--      campo novo seria recusado com 42501 -- feature morta sem erro visivel).
select grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'gps' and table_name = 'etapa1_clientes'
   and column_name in ('valor_honorarios', 'contrato_url');
-- espera: nenhuma linha restringindo os dois campos para authenticated.
```

**Navegador (depois de aplicar):** mover um cliente para Contratado -> digitar honorários -> a barra
muda na home **e** na aba Clientes -> mover de volta para Fechamento -> o valor **continua visível em
somente leitura** e **saiu da meta** -> aba Diário do admin mostra "Registrou os honorários do
cliente" com {de, para}.

---

## 14. CONTRATO FASE 6 PUBLICADO: `chamados-tipos.ts`, `chamados-data.ts`, actions do aluno e do admin

Backend da Fase 6 fechado em 09/09. **O frontend pode começar.** Migrations entregues e **NÃO
aplicadas** (o João/orquestrador aplica). Nada foi commitado.

### Desvios do §4 (com motivo)

| § | Plano | Entregue | Motivo |
|---|---|---|---|
| 4.6 | `src/lib/chamados-data.ts` | idem + `getSuporteAberto()` | a tela do aluno precisa saber se o interruptor está fechado ANTES de mostrar o formulário; o aluno não lê `gps.config`, então a leitura é pela RPC `gps.chamados_abertos()`. |
| 4.6 | tipos em `chamados-tipos.ts` | idem + `AnexoInput`, `ResultadoAcao`, `ResultadoAbrir`, `EXTENSAO_POR_MIME`, `ANEXO_PATH_REGEX`, `rotuloStatus()`, `tamanhoLegivel()`, `ehAnexoMime()` | `"use server"` só exporta função async: tipo declarado na action não pode ser importado pelo componente. Os helpers evitam a UI reimplementar rótulo/extensão/validação. |
| 4.6 | `abrirChamado`/`responderChamado`/`fecharChamado` | idem + `criarUploadAssinadoDeAnexo()` | o caminho do arquivo passa a ser montado **no servidor** e o MIME/tamanho passam pela allowlist antes de qualquer byte subir. O upload direto do §4.7 continua válido (a policy cobre), mas **prefira este**. |
| 4.5 | 5 migrations | **6**: `...115_gps_admin_painel_atendimento_chamados.sql` | §5 manda a Fase 6 acrescentar `chamados_abertos` ao painel, e mudar `returns table` exige `drop`+`create` — não cabia dentro das outras 5. |
| 4.1 | `gps.config` | idem, com `check (length(valor) <= 2000 and valor sem CR/LF)` | CRLF na lista de e-mails da equipe é injeção de cabeçalho (vetor 18). Barrado na origem, além do saneamento no TS. |
| — | e-mail da equipe | `gps.config.chamados_email_equipe` **e** fallback `EMAIL_SUPORTE` (`.env.example`) | a config vence sempre (editável sem deploy); a env é rede de segurança. As duas vazias = ninguém avisado + `console.error` explícito. |

### `src/lib/chamados-tipos.ts` (sem `server-only` — client pode importar)

```ts
export const STATUS_CHAMADO = ["aberto","respondido","fechado"] as const;
export type StatusChamado = (typeof STATUS_CHAMADO)[number];

export interface Chamado { id; aluno_id; aberto_por: string|null; assunto;
  status: StatusChamado; criado_em; ultima_mensagem_em;
  fechado_em: string|null; fechado_por: string|null }
export interface ChamadoNaFila extends Chamado { aluno_nome: string|null; aluno_email: string|null }
export interface ChamadoMensagem { id; chamado_id; autor_id: string|null;
  autor_papel: "aluno"|"equipe"; criado_em; texto;
  anexo_path: string|null; anexo_nome: string|null; anexo_mime: string|null;
  anexo_tamanho: number|null; anexo_expurgado_em: string|null }
export interface ChamadoMensagemComAutor extends ChamadoMensagem { autor_nome: string|null }
export interface AnexoParaExpurgo { mensagemId: string|null; chamadoId: string|null;
  alunoId: string|null; path: string; motivo: "retencao"|"orfao"; referencia: string }

export interface AnexoInput { path: string; nome: string; mime: string; tamanho: number }
export type ResultadoAcao  = { ok: true } | { ok: false; erro: string };
export type ResultadoAbrir = { ok: true; chamadoId: string } | { ok: false; erro: string };

export const ANEXO_MIMES        = ["image/png","image/jpeg","image/webp","application/pdf"] as const;
export const ANEXO_EXTENSOES    = ["png","jpg","jpeg","webp","pdf"] as const;
export const EXTENSAO_POR_MIME: Record<AnexoMime, string>;   // image/jpeg -> "jpg"
export const ANEXO_PATH_REGEX;                               // <uuid>/<uuid>.<ext>
export const ANEXO_TAMANHO_MAXIMO = 5*1024*1024;
export const CHAMADOS_MAX_ABERTOS = 5;    export const CHAMADO_MAX_MENSAGENS = 20;
export const CHAMADO_TEXTO_MAXIMO = 4000; export const CHAMADO_ASSUNTO_MINIMO = 3;
export const CHAMADO_ASSUNTO_MAXIMO = 120;
export const CHAMADO_REABRIR_DIAS = 7;    export const ANEXO_RETENCAO_DIAS = 180;
export const BUCKET_CHAMADOS = "gps-chamados";

export function ehAnexoMime(v: string): v is AnexoMime;
export function rotuloStatus(s: StatusChamado, visao: "aluno"|"admin"): string;
export function tamanhoLegivel(bytes: number|null): string;  // "3,7 MB"
```

`rotuloStatus` já devolve os textos definitivos do §4.7 ("Aguardando a equipe" / "Aguardando você" /
"Aguardando o aluno" / "Fechado") — **não reimplementar na UI**.

### `src/lib/chamados-data.ts` (server-only)

```ts
getChamadosDoAmbiente(alunoId: string): Promise<Chamado[]>            // aluno e admin-assistência
getChamado(chamadoId: string): Promise<{chamado; mensagens: ChamadoMensagemComAutor[]} | null>
getFilaChamados(): Promise<ChamadoNaFila[]>                           // admin, mais parado primeiro
contarChamadosAbertosPorAluno(): Promise<Map<string, number>>         // admin (ver nota)
getChamadosConfig(): Promise<{aberto: boolean; emailEquipe: string[]}> // admin
getSuporteAberto(): Promise<boolean>                                  // qualquer sessão
getAnexosParaExpurgo(): Promise<AnexoParaExpurgo[]>                    // admin
urlAssinadaDoAnexo(path, nome): Promise<string|null>                   // 60 s, download=
```

🔑 `contarChamadosAbertosPorAluno()` é para telas que **não** carregam `getAtendimentoPorAluno()`.
Em `/admin`, a contagem já vem do resumo: **`gps.admin_painel_atendimento()` passou a devolver
`chamados_abertos`** (migração ...115). Quem mexer em `src/lib/data.ts` (outro agente) deve
acrescentar `chamadosAbertos: number` a `AtendimentoDoAluno` e mapear `l.chamados_abertos` —
chamar as duas na mesma página é uma consulta a mais pelo mesmo dado.

🔑 `autor_nome` da mensagem da equipe é **sempre "Equipe"** (nome de quem respondeu não vai para o
aluno, e é uma query a menos). Para o autor aluno vem de `gps.membros` → `thb_alunos`, ou `null`.

### `src/app/chamados/actions.ts` (aluno **e** equipe — o papel é derivado no banco)

```ts
criarUploadAssinadoDeAnexo({nome, mime, tamanho}):
  Promise<{ok:true; path:string; token:string; nome:string} | {ok:false; erro:string}>
abrirChamado({assunto, texto, anexo?: AnexoInput}): Promise<ResultadoAbrir>
responderChamado({chamadoId, texto, anexo?: AnexoInput}): Promise<ResultadoAcao>
fecharChamado(chamadoId: string): Promise<ResultadoAcao>
```

**Fluxo do anexo em `anexo-campo.tsx` (client) — o caminho recomendado:**
1. valida no cliente (≤ 5 MB, `file.type` na allowlist);
2. `const r = await criarUploadAssinadoDeAnexo({nome: file.name, mime: file.type, tamanho: file.size})`;
3. `await supabase.storage.from("gps-chamados").uploadToSignedUrl(r.path, r.token, file, { contentType: file.type })`;
4. devolve ao formulário pai `{ path: r.path, nome: r.nome, mime: file.type, tamanho: file.size }`;
5. o pai chama `abrirChamado`/`responderChamado` com esse `anexo`.

O upload direto (`.upload(path, file)`) do §4.7 continua funcionando — a policy exige o formato
`<aluno_id>/<uuid>.<ext>` com o prefixo do PRÓPRIO ambiente e o interruptor aberto. Mas quem monta o
caminho, nesse caso, é a UI; no caminho recomendado é o servidor.
**Erro 403 no upload = interruptor fechado** (a policy consulta `gps.chamados_abertos()`).

Todo `erro` devolvido já é **frase pronta em português** — a UI mostra como veio, não traduz nada.

### `src/app/admin/chamados/actions.ts`

```ts
definirChamadosAbertos(aberto: boolean): Promise<ResultadoAcao>
definirEmailEquipeChamados(lista: string): Promise<ResultadoAcao>   // vírgula/;/espaço, máx. 10
expurgarAnexo({path, mensagemId}): Promise<ResultadoAcao>           // remove() e SÓ ENTÃO carimba
```

Responder e fechar **não** têm versão de admin: use as de `src/app/chamados/actions.ts`.

### `src/lib/email-chamados.ts`

```ts
enviarChamadoAbertoParaEquipe({para: string[], alunoNome, assunto, chamadoId})
enviarChamadoRespondidoParaAluno({para: string, assunto, chamadoId})
```
Nenhum dos dois leva o texto da mensagem. Quem chama são as actions — a UI não envia e-mail.

### Migrations entregues (ordem de aplicação; NÃO aplicadas)

1. `20260909000110_gps_chamados_estrutura.sql` — tabelas append-only, 3 índices, RLS só-SELECT,
   `gps.pode_ver_chamado`, `gps.config`, `gps.chamados_abertos()`.
2. `20260909000111_gps_chamados_rpcs.sql` — `chamado_gravar_mensagem` (privada), `chamado_abrir`,
   `chamado_responder`, `chamado_fechar`.
3. `20260909000112_gps_chamados_storage.sql` — bucket `gps-chamados`, 2 guardas que falham fechado,
   3 policies em `storage.objects`.
4. `20260909000113_gps_chamados_expurgo.sql` — `chamados_anexos_para_expurgo`,
   `chamado_anexo_marcar_expurgado`.
5. `20260909000114_gps_admin_excluir_acesso_inclui_chamados.sql` — parte do corpo da ...005
   (conferir `pg_get_functiondef` antes).
6. `20260909000115_gps_admin_painel_atendimento_chamados.sql` — `drop`+`create` do painel com
   `chamados_abertos`.

### 14.1 Bloco de conferência da Fase 6 (o orquestrador roda; o backend não tem banco)

```sql
-- (0) PRÉ-REQUISITO — sem isto a RPC recusa TODO anexo com 42501
--     "nao foi possivel validar o anexo", e a lista de órfãos falha:
select has_table_privilege('postgres','storage.objects','select') as postgres_le_storage;
-- espera: true.

-- (1) tabelas: só SELECT, só para authenticated, nada para anon
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='gps' and table_name in ('chamados','chamado_mensagens')
 order by 1,2;
-- espera: authenticated/SELECT (2 linhas) e mais nada. Nenhum INSERT/UPDATE/DELETE, zero anon.

select tablename, cmd, policyname from pg_policies
 where schemaname='gps' and tablename in ('chamados','chamado_mensagens');
-- espera: 2 linhas, ambas cmd=SELECT.

select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='gps' and table_name='config' order by 1,2;
-- espera: authenticated com SELECT/INSERT/UPDATE. SEM DELETE. Nada para anon.

-- (2) anon não enxerga nada (PostgREST sem Authorization):
--     GET /rest/v1/chamados             -> 401/permission denied (nunca 200 com dados)
--     GET /rest/v1/rpc/chamados_abertos -> 401
--     GET /storage/v1/object/gps-chamados/<qualquer> -> 400/403, nunca o arquivo

-- (3) bucket com limite e allowlist:
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='gps-chamados';
-- espera: public=false, 5242880, {image/png,image/jpeg,image/webp,application/pdf}.

-- (4) policies do bucket, e só as 3:
select policyname, cmd from pg_policies
 where schemaname='storage' and tablename='objects' and policyname like 'gps_chamados_%'
 order by 1;
-- espera: delete_admin/DELETE, insert/INSERT, select/SELECT. NENHUMA de UPDATE.
--     conferir também que as policies documentos_public_* (do sip) seguem intactas.

-- (5) as guardas falham fechado (rodar como ADMIN e como ALUNO):
select gps.pode_ver_anexo_chamado('../../etc/passwd') as a,
       gps.pode_ver_anexo_chamado(null)               as b,
       gps.pode_anexar_chamado('x/y.exe')             as c,
       gps.pode_anexar_chamado('<aluno_id>/a.pdf')    as d;
-- espera: a,b,c,d todos false (o `d` porque o nome não é <uuid>.<ext>).

-- (6) aluno A não lê chamado de B — COM O JWT DE A:
select count(*) from gps.chamados where aluno_id = '<ambiente de B>';   -- 0
select count(*) from gps.chamado_mensagens;                             -- só as do próprio ambiente
-- e com o JWT de B, o inverso. (Os dois JWTs reais que o orquestrador tem.)

-- (7) escrita direta pela tabela falha nos DOIS papéis (JWT de aluno E de admin):
--     POST  /rest/v1/chamados            -> 42501 / permission denied
--     POST  /rest/v1/chamado_mensagens   -> 42501 / permission denied
--     PATCH /rest/v1/chamados?id=eq.<x>  -> idem (assunto é imutável)

-- (8) INTERRUPTOR fecha a entrada e NÃO a saída (transação com rollback):
begin;
  update gps.config set valor='false' where chave='chamados_aberto';
  select gps.chamados_abertos();                       -- false
  -- JWT de ALUNO:  select * from gps.chamado_abrir('teste','x')     -> 42501
  --                select * from gps.chamado_responder('<id>','x')  -> 42501
  --                upload no bucket                                 -> 403 (policy)
  -- JWT de ADMIN:  select * from gps.chamado_responder('<id>','ok') -> FUNCIONA
  --                select gps.chamado_fechar('<id>')                -> FUNCIONA
rollback;

-- (9) limites (JWT de aluno, em transação com rollback):
--     6º chamado não-fechado        -> 42501 "voce ja tem 5 chamados em aberto"
--     21ª mensagem no mesmo chamado -> 42501 "este chamado ja tem 20 mensagens"
--     texto com 4.001 caracteres    -> 22023
--     assunto com 2 caracteres      -> 22023

-- (10) ANEXO FANTASMA (path válido, objeto inexistente) — JWT de aluno:
--     select * from gps.chamado_abrir('t','x','<aluno_id>/<uuid>.pdf','a.pdf','application/pdf',10)
--     -> 42501 "anexo nao encontrado"
-- (11) ANEXO DE OUTRO AMBIENTE: mesmo teste com '<aluno_id de B>/<uuid>.pdf'
--     -> 42501 "anexo nao pertence a este chamado"
-- (12) EXTENSÃO x MIME: subir um PNG de verdade e gravar com p_anexo_mime='application/pdf'
--     -> 22023 (o metadata do objeto vence o que o cliente declarou)

-- (13) ADMIN NÃO ABRE e ADMIN NÃO ANEXA (B5-c) — JWT de admin:
select * from gps.chamado_abrir('t','x');                  -- 42501 (aluno_atual() é null)
select gps.pode_anexar_chamado('<aluno_id>/<uuid>.pdf');   -- false

-- (14) e-mail só na TRANSIÇÃO (JWT de aluno, 2 respostas seguidas num chamado 'respondido'):
--      a 1ª devolve `avisar` preenchido; a 2ª devolve NULL.
--      Com JWT de admin respondendo 2x: a 1ª devolve o e-mail do ALUNO, a 2ª NULL.
--      E `avisar` NUNCA devolve a lista da equipe quando quem responde é a equipe.

-- (15) reabertura: fechar, responder como aluno no mesmo dia -> reabre (status 'aberto',
--      fechado_em nulo). Em transação, `update gps.chamados set fechado_em = now() - interval
--      '8 days'` e responder de novo -> 42501 "fechado ha mais de 7 dias". rollback.

-- (16) expurgo só-admin:
--      JWT de aluno: select * from gps.chamados_anexos_para_expurgo()    -> 42501
--                    select gps.chamado_anexo_marcar_expurgado('<uuid>') -> 42501
--                    delete no bucket (Storage API)                      -> 403
--      JWT de admin: a lista responde (pode vir vazia — é o esperado hoje).

-- (17) excluir acesso de quem TEM chamado não quebra (transação com rollback):
begin;
  select gps.admin_excluir_acesso('<aluno_id de teste>');   -- sem 23503
  select count(*) from gps.chamados where aluno_id = '<aluno_id de teste>';  -- 0
rollback;

-- (18) painel: a coluna nova existe e o ambiente SÓ com chamado aparece:
select * from gps.admin_painel_atendimento() limit 5;   -- 6 colunas, com chamados_abertos
--      com JWT de aluno e com anon -> 42501 / negado (nunca lista vazia).

-- (19) funções: prosecdef e grants
select p.proname, p.prosecdef, p.provolatile
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='gps' and p.proname like any (array['chamado%','pode_%chamado%'])
 order by 1;
-- espera: chamado_abrir/responder/fechar/gravar_mensagem/chamados_anexos_para_expurgo/
--         chamado_anexo_marcar_expurgado/chamados_abertos com prosecdef = true;
--         pode_ver_chamado/pode_ver_anexo_chamado/pode_anexar_chamado = false (invoker).

select p.proname, r.rolname, a.privilege_type
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
 where n.nspname='gps' and p.proname like any (array['chamado%','pode_%chamado%'])
 order by 1,2;
-- espera: authenticated com EXECUTE. NUNCA anon nem grantee 0 (public).
--         `chamado_gravar_mensagem` NÃO pode ter EXECUTE para authenticated.
```

**Navegador (obrigatório — build verde não prova tela):** abrir chamado com anexo como aluno;
conferir a fila em `/admin/chamados`; responder como equipe; ver o e-mail sair (ou o
`console.error` explicando por quê); baixar o anexo pelo link assinado; abrir a URL assinada em
janela anônima **depois de 60 s** (tem de falhar); fechar; responder no 3º dia (reabre); tentar
`upsert: true` no mesmo caminho (tem de falhar — não há policy de UPDATE).

**Verificado no repo (09/09):** `npx tsc --noEmit` limpo · `npm run lint` sem nenhum achado nos
arquivos da Fase 6 (só os 3 erros pré-existentes de `require()` em `server.js`) · `npm run build`
verde. `rg -n "service_role|SERVICE_ROLE" src/ supabase/` continua **vazio**.

## 15. Fase 6 — aplicado e conferido pelo orquestrador (09/09)
- Migrations ...110–115 aplicadas (a ...111 tinha um `text` a mais na assinatura de `chamado_responder` nas linhas de comment/revoke/grant — corrigido no arquivo e reaplicado).
- Fluxo provado com JWTs reais + `set role authenticated`, em transação com rollback: titular abriu (aluno_id do ambiente), sócio do mesmo ambiente LÊ (1), titular de outro ambiente NÃO lê (0), admin respondeu → `respondido` + e-mail do aluno, admin fechou → `fechado`, 2 mensagens, `admin_painel_atendimento()` conta chamado vivo. Após rollback: 0 chamados.
- Grants: anon sem nada em `chamados`/`config`; authenticated sem insert/delete (só RPC); `chamado_gravar_mensagem` sem execute para authenticated; bucket privado; 3 policies em `storage.objects`; interruptor aberto; `chamados_email_equipe` vazio (equipe precisa preencher em /admin/chamados ou definir `EMAIL_SUPORTE` na Hostinger).
