# Funil de 8 passos no cliente — PLANO (10/09/2026)

> Documento de arquitetura. **Nenhum código de produção, nenhuma migration, nenhuma
> escrita no banco.** Todos os números abaixo saíram de `select` no projeto
> `mbvybujpkwuorhtdzcde`, schema `gps`, em 10/09/2026, e o SQL está colado junto.

## 0. A régua

O Marcio mandou o "FUNIL 1" manuscrito com 8 passos e disse:

> *"eu preciso que você inclua opções que façam sentido […] usa como referência
> para elaborar esse card para a gente entender em que fase do processo ele está
> com aquele cliente"*

e, no meio do trabalho:

> *"cuidado pelo amor de Deus pra vc n mudar a lógica completa do sistema, tem
> que ser cirúrgico, pra fazer sentido e a gente conseguir entender o caso a
> caso de cada cliente"*

Traduzido em critério de aceitação:

| Regra | Consequência no desenho |
|---|---|
| **Cirúrgico** | **UMA** coluna nova. Zero tabela, zero view, zero tipo novo além do CHECK. |
| **`fase` intacta** | `fase` continua **coluna gravada**, com os mesmos 3 valores. Não vira gerada, não some. |
| **Diagnóstico, não workflow** | O passo é um **rótulo de estado**, não um motor. Nada fica bloqueado por causa dele. |
| **Backfill conservador** | Na dúvida, o passo **menos** avançado. Inflar o funil é pior que não ter o campo. |
| **Nada que funciona muda** | Trava dos 30, `admin_painel_alunos`, `resumoHonorarios`, meta de 150 mil, favorito, filtros: **intocados**. |

---

## A. O modelo de dados

### A.1 A coluna

```sql
-- ILUSTRATIVO — não aplicar deste arquivo.
alter table gps.etapa1_clientes
  add column passo_funil smallint not null default 1
  constraint chk_etapa1_clientes_passo_funil
    check (passo_funil between 1 and 8);
```

| Item | Decisão | Por quê |
|---|---|---|
| Nome | `passo_funil` | Não colide com `fase`, `status` (congelado) nem `ordem` (posição na lista, não etapa). `rg "passo_funil" src` hoje = 0. |
| Tipo | `smallint` | O passo é **ordenado** — "está antes de" é a pergunta central do diagnóstico. Com `text` a comparação vira `case`; com número, `passo_funil >= 4` é a query. |
| CHECK | `between 1 and 8` | Os 8 passos do papel. Faixa numérica é mais simples que uma lista de 8 strings — e o rótulo em português mora no TypeScript (`PASSOS_FUNIL`), que é onde a copy já mora hoje (`FASES_CLIENTE`). |
| Default | `1` | Passo 1 = "mensagem de problema". É o começo de todo cliente. A regra conservadora já vale no default. |
| Null? | **`not null`** | Todo cliente está em algum ponto do funil. `null` obrigaria toda tela a tratar um 9º estado ("não sei") que não acrescenta nada — o passo 1 já é "ainda não fez nada". |

**Uma única coluna. Nada mais.** Sem tabela de histórico (o histórico já existe:
`gps.aluno_eventos`, ver A.5), sem view, sem enum.

### A.2 Os 8 valores e o que cada um significa

| # | Rótulo na tela | O manuscrito | O que o dado prova |
|---:|---|---|---|
| 1 | Mensagem 1 — problema | *Mensagem no WA → problema* | `mensagem_padrao_enviada` |
| 2 | Mensagem 2 — solução | *Mensagem no WA → solução* | `estudo_caso_enviado` |
| 3 | Mensagem 3 — agendamento | *urgência/escassez → agendamento da reunião preliminar* | `ligacao_realizada` (a ligação com 2 opções de agenda é o passo 4 da Etapa 01) |
| 4 | Entrevista prévia | *Entrevista(s) prévia(s)* | `data_reuniao_preliminar is not null` |
| 5 | Reunião preliminar | *Reunião preliminar* | `aderiu_reuniao` |
| 6 | Croqui estrutural | *Croqui estrutural* | — (nenhuma coluna prova; ver A.4) |
| 7 | Execução | *Execução* | `fase='contratado'` / `contrato_path` |
| 8 | Entrega + Membership | *Entrega + Membership* | — (nenhuma coluna prova) |

⚠️ Nota de vocabulário: o **passo 6 do funil** (croqui) e a **Etapa 03 do
programa** (Croqui Estrutural) são a mesma coisa vista de dois lados — a Etapa é
o que o *aluno* aprende; o passo é onde *aquele cliente* está. Não são o mesmo
campo e não devem ser sincronizados: um aluno na Etapa 03 tem clientes em passos
diferentes. É exatamente o "caso a caso" que ele pediu.

### A.3 O que acontece com `fase` — recomendação

**`fase` CONTINUA COLUNA GRAVADA, EXATAMENTE COMO ESTÁ.** Sem `generated`, sem
`drop`, sem mudança de CHECK.

1. **Coluna gerada exige reescrever a tabela.** `add column … generated always as`
   faz `ALTER TABLE` com reescrita completa de `gps.etapa1_clientes` — 825 linhas
   vivas, **6 triggers** (`trg_aluno_eventos_etapa1_clientes`,
   `trg_etapa1_clientes_acompanhamento_travado`, `trg_etapa1_clientes_contrato_travado`,
   `trg_etapa1_clientes_perda_nivel_congelados`, `trg_etapa1_clientes_status_congelado`,
   `trg_etapa1_clientes_touch`), RLS por linha e 3 índices. Risco desproporcional.
2. **Coluna gerada é somente-leitura por definição.** O aluno **arrasta o card no
   quadro** hoje (`Kanban.onMover` → `mudarFaseCliente`). Com `fase` gerada, todo
   `update fase` passaria a devolver 428C9 — quebraria o quadro, a ficha, o
   diálogo de cliente novo e `criarCliente(alunoId, { fase, grau_relacao })`.
3. **`fase` é lida por coisas que não podem tremer:** `gps.admin_painel_alunos`
   (`honorarios_contratados`, `contratados`, `contratados_sem_valor`,
   `em_fechamento`, `apto_ao_saldo`, `favorito_fase`), `resumoHonorarios` (meta de
   R$ 150 mil), `gps.admin_dashboard`, `TOM_DA_FASE`, o filtro do quadro e a
   trigger que trava voltar a `prospeccao` para cliente acompanhado.
4. **A ordem de leitura é a de sempre.** `fase` permanece a coluna que o resto do
   sistema lê. `passo_funil` é **informação adicional na ficha**, não uma nova
   fonte de verdade.

**O sentido da dependência é: passo → fase, nunca o contrário.** Quando o passo
avança, uma trigger *pode* subir a fase (regra em B.3). A fase continua editável
à mão, como hoje.

### A.4 Backfill — em que passo cada cliente nasce

Distribuição atual (`select fase, count(*) from gps.etapa1_clientes group by fase`):

```
prospeccao   783
fechamento    38
contratado     2
             ---
             823   (+2 linhas criadas durante a apuração; n_live_tup = 825)
```

Cruzamento fase × evidência, medido:

```sql
select fase, count(*) total,
 count(*) filter (where data_reuniao_preliminar is not null) c_data,
 count(*) filter (where aderiu_reuniao)                      c_aderiu,
 count(*) filter (where valor_honorarios is not null)        c_honor,
 count(*) filter (where contrato_path is not null)           c_anexo,
 count(*) filter (where ligacao_realizada)                   c_ligacao,
 count(*) filter (where mensagem_padrao_enviada)             c_msg,
 count(*) filter (where estudo_caso_enviado)                 c_estudo
from gps.etapa1_clientes group by fase;
```

| fase | total | c_data | c_aderiu | c_honor | c_anexo | c_ligacao | c_msg | c_estudo |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| prospeccao | 783 | 1 | 0 | 0 | 0 | 7 | 40 | 1 |
| fechamento | 38 | 21 | 18 | 1 | 0 | 11 | 14 | 5 |
| contratado | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

🔴 **Três achados que o backfill tem de respeitar:**

1. **Os 2 `contratado` não têm NADA.** Nem honorário, nem contrato anexado, nem
   reunião, nem ligação. Criados em 10/09, um deles com `nome = ''`:
   ```sql
   select left(id::text,8), nome, valor_honorarios, contrato_path, criado_em::date
     from gps.etapa1_clientes where fase='contratado';
   -- 1c09230e | MARCOS PIMENTA | null | null | 2026-09-10
   -- 2f9a79c8 | (vazio)        | null | null | 2026-09-10
   ```
   São teste ou digitação de hoje. Ainda assim **nascem no passo 7 (Execução)**:
   `fase='contratado'` é afirmação explícita de um humano, e rebaixá-la seria
   contradizer alguém que clicou. É o único ponto em que o backfill confia na fase
   em vez da evidência, e são 2 linhas.

2. **O único honorário do sistema (R$ 44.000, "Oscar") está em `fechamento`, não
   em `contratado`** — logo **não conta na meta hoje**:
   ```sql
   select count(*) contratados, coalesce(sum(valor_honorarios),0) soma
     from gps.etapa1_clientes where fase='contratado';   -- 2 | 0
   ```
   A meta de R$ 150 mil vale **R$ 0** em todo o sistema neste momento. É
   independente do funil, mas é o que garante que nenhuma escolha aqui possa
   quebrá-la (ver E.2).

3. **`ligacao_realizada` é o melhor sinal do passo 3 que existe.** São 7 clientes
   em `prospeccao` com ligação feita e nada mais — pessoas para quem o aluno já
   ligou oferecendo 2 horários, exatamente o *"urgência/escassez → agendamento"*
   do papel. Sem essa regra, esses 7 nasceriam no passo 1 e o funil mentiria para
   baixo.

**A regra do backfill (a ordem importa — o `case` para na primeira verdadeira):**

```sql
-- ILUSTRATIVO
case
  when fase = 'contratado' or contrato_path is not null then 7  -- Execução
  when valor_honorarios is not null                     then 5  -- Reunião preliminar
  when aderiu_reuniao                                   then 5  -- Reunião preliminar
  when data_reuniao_preliminar is not null              then 4  -- Entrevista prévia
  when fase = 'fechamento'                              then 4  -- Entrevista prévia
  when ligacao_realizada                                then 3  -- Mensagem 3
  when estudo_caso_enviado                              then 2  -- Mensagem 2
  else 1                                                        -- Mensagem 1
end
```

**Resultado medido (`select passo, count(*) … group by passo`):**

| passo | clientes | de onde vêm |
|---:|---:|---|
| 1 — Mensagem 1 | **776** | 775 de `prospeccao` sem evidência + 1 residual |
| 2 — Mensagem 2 | **1** | 1 de `prospeccao` com `estudo_caso_enviado` |
| 3 — Mensagem 3 | **7** | os 7 de `prospeccao` com `ligacao_realizada` |
| 4 — Entrevista prévia | **20** | 19 de `fechamento` + 1 de `prospeccao` (Rodrigo Trindade, tem data de reunião) |
| 5 — Reunião preliminar | **19** | 18 com `aderiu_reuniao` + 1 com honorário (o "Oscar") |
| 6 — Croqui | **0** | nenhuma coluna prova croqui |
| 7 — Execução | **2** | os 2 `contratado` |
| 8 — Entrega | **0** | nenhuma coluna prova entrega |

Por ambiente (o que o admin vê ao abrir o painel):

```sql
select passo_max, count(*) ambientes from (
  select aluno_id, max(<o case acima>) passo_max
    from gps.etapa1_clientes group by aluno_id) t
 group by passo_max order by passo_max;
-- passo 1: 40 ambientes | 2: 1 | 4: 8 | 5: 9 | 7: 2
```

**Respondendo à pergunta literal do briefing** — *"um cliente em `prospeccao` que
já tem `data_reuniao_preliminar` nasce no 3 ou no 1?"*: **nasce no 4**
(Entrevista prévia), e é **exatamente 1 cliente** (Rodrigo Trindade, reunião em
01/09). Motivo: data marcada é evidência **positiva e explícita** de que os 3
passos de mensagem já cumpriram o objetivo deles — a mensagem só existe para
chegar ao agendamento. Colocá-lo no 1 seria conservador ao ponto de mentir para
baixo, o que é tão ruim quanto mentir para cima. Ele **não** vai ao 5, porque data
marcada não é reunião feita.

⚠️ **Os passos 6 e 8 nascem VAZIOS de propósito.** Croqui apresentado e entrega
feita são fatos que nenhuma coluna registra hoje. Preenchê-los por inferência
seria inventar. Só ganham gente quando alguém marcar à mão.

### A.5 Histórico do passo — **não** se cria tabela

`gps.aluno_eventos` já é a trilha append-only, com RLS só-admin e trigger de
captura no caminho de escrita do aluno
(`gps.aluno_eventos_capturar_etapa1_clientes`, com `exception when others then
null` para nunca abortar a ficha).

A mudança é **um `if` a mais dentro da trigger que já existe** e **um valor a
mais** no CHECK de `aluno_eventos.tipo`:

```sql
-- ILUSTRATIVO — dentro do corpo da trigger que já existe
if new.passo_funil is distinct from old.passo_funil then
  insert into gps.aluno_eventos (…, tipo, detalhe, …)
  values (…, 'cliente_passo_mudou',
          jsonb_build_object('de', old.passo_funil, 'para', new.passo_funil), …);
end if;
```

É o mesmo molde de `cliente_fase_mudou` e `cliente_honorarios_definidos`.
**Tabela nova de histórico seria duplicar uma trilha que já funciona.**

---

## B. As regras de avanço automático

### B.1 A trava do orquestrador — só empurra para frente

```sql
-- ILUSTRATIVO — o corpo inteiro da regra
new.passo_funil := greatest(coalesce(new.passo_funil, 1), passo_derivado);
```

`greatest` é a regra inteira. Se o cliente está no 6 e o aluno preenche uma data
de reunião, o derivado é 4, `greatest(6,4) = 6` — **ele não volta**. É literal ao
bug de hoje ("a fase subia por 1 agendado") com o sinal invertido, e é a mesma
forma do `passo_atual` do onboarding, que o CLAUDE.md já registra como *"só
avança"*.

**O aluno continua podendo escolher qualquer passo à mão, inclusive para trás.**
A trava vale só para o **automático** — o gatilho nunca puxa para trás; a pessoa
pode corrigir. Se fosse catraca também para o humano, viraria workflow, que é o
que o Marcio pediu para não fazer.

### B.2 Os gatilhos — só o que o dado sustenta

| Campo que muda | Passo mínimo | Linhas que o têm hoje | Por que aquele passo |
|---|---:|---:|---|
| `estudo_caso_enviado` para `true` | **2** | 6 | O "estudo de caso" é literalmente a mensagem de **solução** (dia 3) do `Método Holding Brasil.md`. |
| `ligacao_realizada` para `true` | **3** | 12 | A ligação da Etapa 01 é *"ligação com 2 opções de agenda"* = o *"urgência/escassez, agendamento"* do papel. |
| `data_reuniao_preliminar` não nulo | **4** | 22 | Data marcada prova que o agendamento aconteceu. Não prova a reunião. |
| `aderiu_reuniao` para `true` | **5** | 18 | Aderiu = esteve na reunião preliminar. |
| `valor_honorarios` não nulo | **5** | 1 | 🔴 **Só 5, não 7.** Ver B.4. |
| `contrato_path` não nulo | **7** | 0 | Contrato assinado anexado é a prova mais forte que o sistema tem. |
| `fase` para `contratado` | **7** | 2 | Afirmação explícita de um humano. |

**Gatilhos que eu NÃO proponho, e por quê:**

- `mensagem_padrao_enviada` para passo 1: seria **letra morta**. O default já é 1;
  `greatest(1,1)` não faz nada. As 48 linhas que a têm marcada já estariam no 1.
- **Passos 6 (croqui) e 8 (entrega): nenhum gatilho.** Não existe coluna que os
  prove. Um gatilho por `gps.etapa3_agendamentos` seria por **aluno**, não por
  cliente — carimbaria os 30 clientes de uma vez. **Só marcação à mão.**

### B.3 O passo pode subir a fase (e só isso)

O briefing autoriza: *"Se o passo puder ATUALIZAR a fase por trigger, ótimo — mas
a fase permanece a coluna que o resto do sistema lê"*.

```sql
-- ILUSTRATIVO, mesmo BEFORE trigger, depois do greatest
if new.passo_funil >= 4 and new.fase = 'prospeccao' then
  new.fase := 'fechamento';
end if;
```

| Faixa de passo | Fase | Justificativa no dado |
|---|---|---|
| 1 a 3 (mensagens) | `prospeccao` | *"Ainda em contato — mensagem, ligação, tentativa de agenda"* é a `ajuda` literal de `FASES_CLIENTE.prospeccao`. Os 3 passos são exatamente isso. |
| 4 a 6 (entrevista ao croqui) | `fechamento` | *"Da reunião preliminar ao croqui estrutural"* é a `ajuda` literal de `fechamento`. Encaixa sem forçar. |
| 7 a 8 (execução, entrega) | `contratado` | *"Contrato fechado — segue para a execução"*. |

🔴 **A subida para `contratado` NÃO é automática.** A trigger só faz
`prospeccao` para `fechamento`. Motivo: `fase='contratado'` alimenta a **meta de
R$ 150 mil** e o `apto_ao_saldo`; um passo marcado à mão não pode virar dinheiro
declarado. Marcar o passo 7 é diagnóstico; mudar a fase para `contratado`
continua sendo ato deliberado no quadro ou na ficha.

**Efeito medido dessa subida no backfill: 1 linha.** Nenhum cliente nasce em
`prospeccao` com passo maior ou igual a 4 exceto Rodrigo Trindade — cuja fase
passaria a `fechamento`. Isso move `em_fechamento` de 38 para 39 no painel. É o
único movimento de fase da entrega inteira.

⚠️ **Ordem obrigatória:** a trigger da fase é **BEFORE** e a de captura de eventos
é **AFTER** — então o diário grava `cliente_fase_mudou` corretamente, com
`de='prospeccao'` e `para='fechamento'`, sem nenhuma alteração no código dela.

### B.4 🔴 `valor_honorarios` dá passo 5, não 7

O briefing sugeria *"honorários informados, passo 7"*. **O dado recusa.**

O único cliente com honorário no sistema inteiro está em `fase='fechamento'`, sem
reunião registrada e sem contrato anexado:

```sql
select nome, fase, valor_honorarios, data_reuniao_preliminar, contrato_path
  from gps.etapa1_clientes where valor_honorarios is not null;
-- Oscar | fechamento | 44000.00 | null | null
```

Se honorário desse passo 7, esse cliente saltaria para **Execução** — e, pela
regra B.3, caso ela subisse a fase para `contratado`, R$ 44.000 entrariam na meta
de R$ 150 mil de um ambiente **sem contrato nenhum**. Honorário informado é
**valor proposto**, não contrato assinado. Passo 5 (reunião preliminar) é o mais
avançado que o número sozinho sustenta.

---

## C. O que muda na UI

### C.1 O quadro (kanban) — **continua com 3 colunas**

🔴 **Recomendação: NÃO transformar o quadro em 8 colunas.**

Isso contraria a letra do briefing original ("o quadro passa a ter as colunas do
funil"), e a justificativa é medida:

- O `Kanban` já é `overflow-x-auto` + `min-w-max` com colunas de `w-64` (256 px).
  8 colunas = **2.048 px de conteúdo + 21 px de gaps**. Em 1366 px o aluno veria
  **5 colunas** e rolaria para as outras 3 — arrastar um card do passo 1 ao 7 vira
  arraste com auto-scroll horizontal, a interação mais frágil que existe em touch
  e trackpad.
- **776 de 825 clientes (94%) estão no passo 1.** Um quadro de 8 colunas seria uma
  coluna com 776 cards e sete vazias. Isso não é diagnóstico, é ruído.
- Arrastar entre 8 colunas transformaria a marcação num **ato de processo** (mover
  o card = cumprir etapa) — exatamente o motor de workflow que o Marcio pediu para
  não construir.

**O que entra no quadro, então:** a **linha do passo dentro do card**, um trilho
de 8 marcas com o atual preenchido (ver C.3). O aluno vê a fase pela coluna e o
passo pelo trilho, sem trocar de tela. A coluna continua sendo `FASES_CLIENTE`, o
`onMover` continua sendo `mudarFaseCliente`, `fasesDisponiveis` continua travando
a volta a `prospeccao`. **Zero linha alterada na mecânica do arraste.**

**Alternativa, se o Marcio insistir nas 8 colunas** (é decisão dele, está em
BLOQUEIO): colunas de `w-52` (208 px) dão 1.664 px + gaps; ainda não cabe em 1366.
Cabe com 6 colunas de 208 px. **Nenhum arranjo põe 8 colunas legíveis em 1366 sem
rolagem.** A saída honesta seria agrupar visualmente em 3 grupos (Mensagens 1 a 3,
Reunião 4 a 6, Fechamento 7 a 8) com o passo exato dentro do card — que é, na
prática, o quadro de 3 colunas que já existe.

### C.2 A ficha do cliente — onde entra o seletor

`src/components/clientes/cliente-ficha.tsx` já tem um `Select` de `fase`
(linha ~477). O seletor de passo entra **imediatamente abaixo dele**, no mesmo
bloco, com:

- um `Select` de 8 itens, cada um com rótulo + linha de ajuda (o mesmo padrão de
  `GRAUS_RELACAO_UI.ajuda`, que o aluno já conhece);
- uma **linha de texto** sob o campo dizendo a fase que aquele passo implica
  (*"Passos 4 a 6 colocam o cliente em Fechamento"*) — é assim que o aluno aprende
  a relação sem precisar de tutorial;
- **nenhuma obrigatoriedade**: o campo já vem preenchido (default 1 / backfill) e
  salvar a ficha sem tocá-lo continua funcionando.

`passo_funil` entra em `PatchCliente`, no `Pick` **e** na allowlist de runtime
`CHAVES_PATCH_CLIENTE` — as duas, senão o campo nasce morto sem erro (a armadilha
que o próprio arquivo documenta em `grau_relacao` e `valor_honorarios`). Validação
em português antes do CHECK: inteiro, 1 a 8.

### C.3 O card do cliente — como mostrar o passo

**Um trilho de 8 marcas, não um chip colorido.**

```
Reunião preliminar   [][][][][]...   5 de 8
```

- 8 quadradinhos de ~6 px; os 1 a n preenchidos com `bg-marca-solida`, os
  restantes com `bg-borda-fina`;
- o **rótulo em texto** ao lado, sempre — a cor nunca é a única portadora;
- `aria-label="Passo 5 de 8 — Reunião preliminar"`.

Vale para o card do quadro, o card da lista (`cliente-card-lista.tsx`), a linha da
tabela (`clientes-tabela.tsx`, coluna nova) e o `FavoritoDestaque`.

### C.4 🔴 As 8 cores — o problema resolvido por não usar 8 cores

O projeto tem **4 tokens semânticos**, medidos e aprovados no `globals.css`:

```
sucesso  #186A3B sobre #E8F5EC = 5,91:1
atencao  #8A5300 sobre #FFF4E0 = 5,81:1
neutro   #5C5751 sobre #F1EEEA = 6,18:1
risco    #A32020 sobre #FDECEC
```

O CLAUDE.md registra duas vezes a medição de que **6+ tons quentes não se separam
(ΔE 2,7 em deuteranopia)** — foi por isso que a rosca do dashboard ficou limitada
a 4 fatias e o grau de relação virou barras. **Oito tons quentes seriam uma
regressão contra uma decisão já medida e tomada.**

**A solução é não haver 8 cores.** O passo se diz por **posição e número** (quantas
marcas de 8 estão preenchidas + o texto do rótulo); a **cor vem da fase**, que já
tem 3 tokens aprovados:

| Passos | Cor do trilho | Token |
|---|---|---|
| 1 a 3 | cinza | `neutro` |
| 4 a 6 | âmbar | `atencao` |
| 7 a 8 | verde | `sucesso` |

Assim o funil ganha 8 níveis de granularidade **sem uma cor nova**, e o esquema
visual do passo fica **automaticamente coerente** com o da fase — que é a
propriedade que faz o aluno entender a relação entre os dois sem ninguém
explicar. `FASES_CLIENTE.cor` fica **intocado**.

---

## D. O que NÃO fazer

1. **Não apagar nem alterar `fase`.** É lida pela meta de R$ 150 mil, por
   `admin_painel_alunos` (5 campos), pelo dashboard, pelo quadro e pela trigger de
   acompanhamento. `drop column fase` também é o caminho de volta da migração
   `...060` — enquanto `status` estiver congelado, ele precisa existir.
2. **Não transformar `fase` em coluna gerada.** Reescreve a tabela mais quente do
   sistema e quebra o arraste do quadro (`update fase` passaria a dar 428C9).
3. **Não criar tabela de histórico de passo.** `gps.aluno_eventos` já é
   append-only, com RLS só-admin e trigger a prova de falha. É um `if` a mais.
4. **Não criar 8 colunas no quadro.** 2.048 px não cabem em 1366; 94% dos clientes
   estão no passo 1; e transforma diagnóstico em workflow.
5. **Não inventar 8 cores.** ΔE 2,7 em deuteranopia já foi medido neste projeto.
6. **Não exigir que o aluno preencha nada.** O campo nasce preenchido e salvar a
   ficha sem tocá-lo funciona. Obrigatoriedade nova reabriria fichas já
   concluídas — exatamente o erro que `grau_relacao` evitou (595 contra 27).
7. **Não mexer na trava dos 30.** `comDados` é nome + telefone. `passo_funil`
   **não entra** nessa conta — se entrasse, 11 ambientes que já bateram os 30
   poderiam perder a passagem.
8. **Não deixar o passo subir a fase até `contratado`.** Vira dinheiro na meta sem
   contrato.
9. **Não fazer o automático puxar para trás.** `greatest`, sempre.
10. **Não criar índice em `passo_funil`.** Mesmo argumento da `...060` para `fase`:
    toda leitura é `where aluno_id = $1` (Index Scan, no máximo 110 linhas) e a
    agregação do painel varre a tabela de propósito. Índice seria peso morto de
    escrita, com seletividade péssima (94% num valor só). Provado em E.4.
11. **Não sincronizar o passo com `gps.etapas` nem com a Etapa 03.** A etapa é do
    aluno, o passo é do cliente. Sincronizar carimbaria 30 clientes de uma vez.
12. **Não escrever `passo_funil` por `PatchCliente` sem pôr na allowlist de
    runtime.** Só no `Pick` = campo morto, sem erro.

---

## E. Impacto medido

Todos os `select` abaixo rodaram em `mbvybujpkwuorhtdzcde` em 10/09/2026.

### E.1 Quantos clientes em cada passo

Já na tabela de A.4. Resumo: **776 · 1 · 7 · 20 · 19 · 0 · 2 · 0** = 825.
94% no passo 1, que é a verdade do sistema hoje — a maioria dos clientes é lista
de nome e telefone que ainda não recebeu mensagem nenhuma.

### E.2 A meta de R$ 150 mil — nenhum ambiente é afetado

```sql
select count(*) contratados, coalesce(sum(valor_honorarios),0) soma
  from gps.etapa1_clientes where fase='contratado';
-- 2 | 0
```

**A meta vale R$ 0 em todo o sistema hoje.** Os 2 `contratado` não têm valor, e o
único valor existente (R$ 44.000) está em `fechamento`. Como o desenho:

- não muda `fase` de ninguém para `contratado` (B.3);
- não muda `valor_honorarios` de ninguém;
- não toca `resumoHonorarios` nem `admin_painel_alunos`;

**nenhum ambiente ganha ou perde um centavo de meta.** O único movimento de fase é
1 cliente de `prospeccao` para `fechamento` (Rodrigo Trindade), que altera
`em_fechamento` de 38 para 39 — número informativo do painel, fora de toda meta.

### E.3 A trava dos 30 — não é afetada

```sql
select count(*) filter (where com_dados>=30) bateu_30, count(*) ambientes
  from (select aluno_id,
        count(*) filter (where coalesce(btrim(nome),'')<>''
                          and coalesce(btrim(telefone),'')<>'') com_dados
          from gps.etapa1_clientes group by aluno_id) t;
-- bateu_30 = 11 | ambientes com cliente = 60
```

`passo_funil` não entra em `com_dados` e não entra no `case` de classe de
`gps.admin_painel_alunos`. Os 11 que bateram continuam 11.

⚠️ **Achado colateral, fora do escopo, mas registrado:** a RPC
`gps.admin_painel_alunos` ainda calcula `com_dados` exigindo
`c.nivel_relacionamento is not null`, enquanto `comDados` em `src/lib/etapa1.ts`
já é só nome + telefone (decisão de 10/09). **A tela do aluno e o painel do admin
estão contando a trava dos 30 de formas diferentes.** Não é problema do funil e
não deve ser corrigido nesta entrega — vai para BLOQUEIO.

### E.4 Custo — as 5 perguntas do protocolo de sustentabilidade

**1. Escala.** `ALTER TABLE ADD COLUMN ... DEFAULT` com default **constante** é
metadata-only desde o PG 11: não reescreve a tabela, não bloqueia leitura além do
`ACCESS EXCLUSIVE` instantâneo. O backfill é **um UPDATE de passada única**. Custo
por **item novo** dali em diante: uma comparação `greatest` na trigger que já
roda. Com 10x mais linha (8.250) o UPDATE inicial ainda é um Seq Scan de poucos
milissegundos, e a escrita por ficha não muda, porque é por linha.

```
explain (analyze, buffers) select id, <o case> from gps.etapa1_clientes;

Seq Scan on etapa1_clientes  (cost=0.00..43.86 rows=791)
  (actual time=0.026..0.460 rows=825 loops=1)
  Buffers: shared hit=32
Planning Time: 0.395 ms
Execution Time: 0.572 ms
```

**2. Índice.** **Nenhum índice novo, e isso é provado.** A query da tela do aluno
já usa índice e a coluna nova viaja junto no heap:

```
explain (analyze, buffers)
select id, nome, telefone, fase, data_reuniao_preliminar, aderiu_reuniao,
       valor_honorarios
  from gps.etapa1_clientes where aluno_id = $1 order by ordem;

Index Scan using etapa1_clientes_aluno_idx
  (actual time=0.635..0.686 rows=110 loops=1)
  Index Cond: (aluno_id = ...)
  Buffers: shared hit=270
Execution Time: 0.892 ms
```

Maior ambiente = 110 clientes; média 13,8; 60 ambientes. Filtrar por passo é
filtro **em memória sobre no máximo 110 linhas** — a mesma regra já documentada
para busca e filtro do painel. Um índice em `passo_funil` teria seletividade
péssima (94% no valor 1) e o planner o ignoraria.

⚠️ **Exigência de entrega:** o `backend-engineer` cola `explain (analyze)` do
UPDATE do backfill **e** da query da ficha depois de aplicar. Regra do
`PROTOCOLO-SUSTENTABILIDADE.md`.

**3. Frequência.** A trigger roda no `UPDATE` da ficha — o mesmo caminho onde já
rodam 6 triggers. Medido: 825 clientes em 60 ambientes desde julho; a ordem de
grandeza é de dezenas de escritas por dia. O backfill roda **uma vez**.

**4. Repetição.** Zero query nova. O passo vem na **mesma linha** que `data.ts` já
busca — `COLUNAS_CLIENTE` ganha um nome na lista, não uma ida ao banco. As 4 telas
que mostram o passo (quadro, lista, tabela, favorito) leem o mesmo array que já
recebem. Sem N+1, sem necessidade de coalescência.

**5. Reversão.** Três níveis, do mais barato ao mais caro:
- **Sem deploy e sem migration:** ignorar. A coluna é inofensiva se ninguém a lê.
- **Sem deploy:** `drop trigger` do avanço automático. O campo vira 100% manual.
- **Completa:** `alter table gps.etapa1_clientes drop column passo_funil;`
  Nada mais depende dela (`fase` intacta, meta intacta, trava dos 30 intacta), e o
  CHECK de `aluno_eventos.tipo` com um valor a mais é inofensivo — mesmo
  raciocínio da reversão da `...060`.

### E.5 O que a feature LIMPA

Critério de otimização do `fable-orchestrator`: feature que só empilha reprova.

1. **Fecha C7 — "onde recusou mora".** Pendência aberta desde 08/09, listada duas
   vezes no CLAUDE.md, que **impede remover `status`**. As 3 fases não têm lugar
   para recusa; **8 passos também não** — mas o funil torna a pergunta
   respondível: recusa não é passo, é **saída** do funil, em qualquer passo. Isso
   destrava a decisão (que continua sendo do Marcio, agora com a opção concreta na
   mesa, não mais em aberto).
2. **Mata a ambiguidade da fase `fechamento`.** Ela cobre hoje *"da reunião
   preliminar ao croqui"* — 4 passos do papel num rótulo só. São **38 clientes**
   sobre os quais o admin, olhando o quadro, não consegue dizer se houve reunião.
   Medido: dos 38, 21 têm data, 18 aderiram e **4 não têm nem uma coisa nem
   outra**. Esses 4 são invisíveis hoje.
3. **Substitui inferência espalhada por um campo.** Hoje "onde este cliente está"
   se deduz lendo 5 colunas (`data_reuniao_preliminar`, `aderiu_reuniao`,
   `ligacao_realizada`, `valor_honorarios`, `contrato_path`) — regra repetida em
   `calcularMetricasEtapa1`, em `admin_painel_alunos` (o `agendados`) e no backfill
   da `...060`. O passo passa a ser **lido**, não recalculado.
4. **Zero dependência nova, zero KB de JS novo** (o trilho é CSS puro, Server
   Component).

**Saldo:** +1 coluna, +1 `if` na trigger existente, +1 valor no CHECK de tipo, +1
constante em `etapa1.ts`, +1 componente de trilho. Nenhuma tabela, nenhuma view,
nenhuma RPC, nenhuma query nova.

---

## F. Ordem de execução

O deploy do Next é **automático no push**; as migrations são aplicadas **à mão,
antes**. A ordem existe para que nunca haja um instante em que o código peça uma
coluna que não existe, nem em que a coluna exista com valor errado.

| # | Passo | Agente | Arquivos / objetos |
|---:|---|---|---|
| **1** | **Migration A — a coluna + backfill + CHECK**, numa transação só. `add column ... default 1 not null` (metadata-only), depois o `update` com o `case` de A.4, depois a conferência `select passo_funil, count(*)`. **Sem trigger ainda.** Nesta hora a produção não conhece a coluna: o PostgREST devolve um campo a mais que o TS ignora. | `backend-engineer` | `supabase/migrations/2026..._gps_etapa1_clientes_passo_funil.sql` |
| **2** | **Conferir o backfill contra E.1** antes de seguir. Se os números divergirem de 776/1/7/20/19/0/2/0, **parar** — alguém mexeu no dado entre a medição e a aplicação. | `backend-engineer` | — |
| **3** | **Migration B — as triggers.** (a) o `greatest` + a subida de `prospeccao` para `fechamento` num BEFORE INSERT/UPDATE; (b) `cliente_passo_mudou` no CHECK de `gps.aluno_eventos.tipo`; (c) o `if` dentro de `gps.aluno_eventos_capturar_etapa1_clientes`, preservando o `exception when others then null`. Ainda sem UI: as triggers só reagem a escrita, e nada escreve o passo ainda. | `backend-engineer` | mesma pasta |
| **4** | **Backend do app**: `passo_funil` em `ClienteEtapa1` (`types.ts`), em `COLUNAS_CLIENTE` (`data.ts`), no `Pick` **e** em `CHAVES_PATCH_CLIENTE` (`clientes/actions.ts`), com validação 1 a 8 em `validarPatch`. `PASSOS_FUNIL` (id, rótulo, ajuda, faixa de fase) em `src/lib/etapa1.ts`, ao lado de `FASES_CLIENTE`. | `backend-engineer` | `src/lib/types.ts`, `src/lib/data.ts`, `src/lib/etapa1.ts`, `src/app/clientes/actions.ts` |
| **5** | **Frontend**, em paralelo ao 4 a partir da assinatura de `PASSOS_FUNIL`: trilho (`trilho-passo.tsx` ou dentro de `clientes-chips.tsx`), seletor na ficha, trilho no card do quadro/lista/tabela e no `FavoritoDestaque`. | `frontend-engineer` | `cliente-ficha.tsx`, `cliente-card-lista.tsx`, `clientes-quadro.tsx`, `clientes-tabela.tsx`, `favorito-destaque.tsx` |
| **6** | **`npm run build` + `npm run lint` DEPOIS do último dos dois** (regra do projeto: dois agentes no mesmo arquivo = ambos verdes e build quebrado). | quem terminar por último | — |
| **7** | **Push na `main`**, com deploy automático. Só aqui a coluna vira visível. | após veredito do `fable-orchestrator` | — |
| **8** | **Atualizar o CLAUDE.md** com a seção do funil, o backfill medido e a reversão em 3 níveis. | `backend-engineer` | `CLAUDE.md` |

**Por que o banco vem inteiro antes do código:** a coluna com `not null default 1`
é invisível para o app atual (ele nem a pede), então os passos 1 a 3 são seguros
com o sistema no ar. O inverso — código pedindo `passo_funil` antes da migration —
derrubaria a aba Clientes de todos os 135 ambientes com `42703 column does not
exist`, porque `COLUNAS_CLIENTE` é uma lista explícita de colunas.

**Ponto de não-retorno:** nenhum. Até o passo 7, `drop column passo_funil` devolve
o sistema ao estado exato de hoje.

---

## BLOQUEIO — decisões que não são minhas

1. 🔴 **O quadro fica com 3 colunas ou vira 8?** Eu recomendo **3 + trilho no
   card**, com a medição de C.1 (2.048 px não cabem em 1366; 94% dos clientes numa
   coluna só; arraste entre 8 colunas vira workflow). Mas o briefing dizia "o
   quadro passa a ter as colunas do funil" — é decisão de produto do Marcio.

2. 🔴 **Passos 6 (croqui) e 8 (entrega) nascem vazios.** Nenhuma coluna prova
   croqui apresentado nem entrega feita. Opções: (a) deixar vazio, só marcação à
   mão — minha recomendação; (b) criar um campo por passo (contraria "uma coluna
   só" e "não exigir preenchimento novo"); (c) tirar os dois do CHECK e ter um
   funil de 6 passos. **Não escolho por ele.**

3. 🔴 **"Recusou" continua sem lugar** — a pendência C7, aberta desde 08/09,
   bloqueia remover `status`. Com o funil na mesa, a pergunta fica concreta: recusa
   é **saída** do funil, em qualquer passo, e por isso não é um 9º passo. Se ele
   quiser resolver junto, a forma barata é um `boolean recusado` — mas isso é uma
   **segunda coluna**, que a restrição desta entrega proíbe. Fica para depois.

4. 🔴 **`valor_honorarios` dá passo 5, não 7** (B.4). Contraria a sugestão do
   briefing. Fundamento: o único honorário do sistema (R$ 44.000, "Oscar") está em
   `fechamento`, sem reunião e sem contrato — passo 7 o promoveria a Execução com
   base num valor proposto. Se o Marcio entender que "honorário informado" já é
   fechamento de negócio no vocabulário dele, é trocar um número na regra.

5. 🔴 **Os 2 clientes em `fase='contratado'` são reais ou teste?** Ambos criados em
   10/09, sem honorário, sem contrato, sem reunião; **um deles com o nome vazio**
   (`2f9a79c8`). O backfill os coloca no passo 7 (Execução) por respeitar a fase
   declarada. Se forem teste, o funil nasce com 2 linhas mentindo no topo.
   Pergunta de 30 segundos para quem os criou.

6. ⚠️ **Divergência pré-existente, fora do escopo:** `gps.admin_painel_alunos`
   calcula `com_dados` exigindo `nivel_relacionamento is not null`, mas `comDados`
   em `src/lib/etapa1.ts` já é só nome + telefone desde 10/09. **A tela do aluno e
   o painel do admin contam a trava dos 30 de formas diferentes.** Não toquei —
   mudar isso mexe na classificação dos ambientes e é uma entrega própria, com o
   número na mesa antes.
