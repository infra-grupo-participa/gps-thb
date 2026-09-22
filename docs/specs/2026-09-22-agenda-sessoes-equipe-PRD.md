# PRD — Agenda de Sessões com a Equipe Jurídica
### Entrevista Prévia · Reunião Preliminar · Dras. Elaine e Cristiane

| | |
|---|---|
| **Data** | 22/09/2026 |
| **Sistema** | GPS — Programa de Implementação Assistida |
| **Estado** | 🟢 **D0, D1 e D2 respondidas 22/09 — build autorizado.** D3–D7 sob premissa; D8 pendente (dado) |
| **Autor** | Claude (mapeamento) + Marcio (regra de negócio) |
| **Repo** | `C:/Users/infra/OneDrive/Documentos/GPS - Programa de Implementação Assistida` |
| **Banco** | Supabase `mbvybujpkwuorhtdzcde`, schema `gps` |

> ✅ **Build autorizado.** O Marcio revogou a decisão de 10/08 em 22/09/2026:
> *"sim, revoga a decisão de 10/08 — agora a disponibilidade parte delas"*.
> Registrado em `CLAUDE.md`. As demais pendências de §9 rodam sob premissa
> declarada (§5.4), exceto **D8** (disponibilidade da Dra. Elaine), que é dado e
> não bloqueia código.

---

## 1. O problema

Hoje, para um aluno fazer a Entrevista Prévia ou a Reunião Preliminar com a
equipe jurídica, **não existe caminho dentro do sistema**. O acerto de horário
acontece fora (WhatsApp), a doutora descobre o compromisso fora, e chega à
reunião **sem contexto do cliente** que vai ser atendido.

O aluno também não sabe quando a equipe pode. Ele propõe data no escuro.

**O que se quer:** o aluno escolhe um horário que a equipe **já declarou que
pode**, e a doutora chega na reunião com o briefing do cliente pronto.

---

## 2. Em uma frase

> Um calendário onde a equipe jurídica publica disponibilidade semanal fixa, o
> aluno escolhe um horário livre para o cliente favoritado dele, e a doutora
> recebe — no sistema e por e-mail — o briefing consolidado desse cliente antes
> da sessão.

**Analogia do Marcio:** *"pensa no sistema do parceiro"* — o aluno reúne o
máximo de informação e assiste o advogado executando a holding. A sessão é
formativa, não só consultiva.

---

## 3. 🔴 ACHADO CRÍTICO — isto já existiu e foi REMOVIDO

**Antes de qualquer linha de código, leia esta seção.**

O GPS já teve exatamente esta feature. Foi **removida em 10/08/2026 por decisão
do Marcio**, e o motivo **não era técnico**:

> *"O fluxo não estava fluindo e **a equipe não estava comparecendo**. Enquanto
> isso é um problema interno, **o sistema não pode prometer uma reunião que não
> acontece**."* — `CLAUDE.md:1916-1920`

A regra de produto que ficou valendo:

> *"Agendamento no GPS é **organização pessoal do aluno**. A UI **não deve dar a
> entender** que a equipe participa de reunião marcada pelo sistema."*
> — `CLAUDE.md:1922-1924`

**E já foi reconstruído por engano uma vez**, em 05/08, no modelo "aluno solicita
/ equipe confirma" — e removido de novo. O aviso está escrito em 3 lugares no
código para não acontecer uma terceira vez.

### As tabelas órfãs ainda estão no banco, com dados reais

| Tabela | Linhas | O que tem |
|---|---|---|
| `gps.reuniao_horarios` | **3** | `10:00`, `13:00`, `16:00` — grade fixa, criada 05/08 |
| `gps.reuniao_agendamentos` | **6** | reuniões reais de ago/2026, todas `confirmada`, com `link_live` do Google Meet e `pauta` preenchida pelo aluno |
| `gps.reuniao_eventos` | 13 | trilha |
| `gps.reuniao_bloqueios` | 0 | nunca usado |
| `gps.agenda` | 0 | nunca usado |

O modelo antigo já tinha: `data`, `horario`, `status`, `pauta` (o briefing!),
`link_live`, `cliente_id`, `aluno_id`, `motivo_recusa`, `respondido_por`.

**Ou seja: a estrutura do que está sendo pedido já foi construída e desligada.**

### O que isso exige do Marcio

Esta feature **só pode ser construída com revogação explícita da decisão de
10/08**. E a revogação precisa responder: **o que mudou para a equipe comparecer
agora?**

A resposta provável — e que justifica revogar — é que **agora a disponibilidade
parte das próprias doutoras** (Cristiane declarou quartas e sextas), em vez de o
aluno propor e a equipe ter que aceitar. Isso inverte o problema de 10/08.

👉 **Decisão pendente D0 em §9.** Sem ela, nada começa.

---

## 4. O que já existe e dá para reaproveitar

### 4.1 Plantão — o modelo de referência (VIVO)

| Tabela | Linhas | Estado |
|---|---|---|
| `gps.plantao_inscricoes` | **155** | vivo, último hoje 22/09 |
| `gps.plantao_slots` | 12 | vivo |
| `gps.plantao_mentoras` | 3 | **Isabela, Elaine, Cristiane** — as mesmas pessoas |

**O que copiar do Plantão:**
- `inicio_em` como **coluna gerada** `(data + hora_inicio) at time zone 'America/Sao_Paulo'` — resolve fuso de uma vez, sem cálculo espalhado pelo código.
- **Índice único parcial** contra duplo agendamento (migrations `…278/…279`, de 17/09). A versão anterior era só checagem lógica em transação e tinha corrida entre dois cliques simultâneos. **Copiar a versão nova, nunca a antiga.**
- Envio de e-mail pelo banco: `gps.plantao_disparar_emails_sala()` + `pg_net` → Resend, disparada por `pg_cron` a cada 10 min. Chave no Vault via `gps.resend_api_key()`.

**O que NÃO copiar:**
- `plantao_slots` **não tem coluna de capacidade** — plantão é mentoria coletiva, sem limite de vagas. Aqui é **1 aluno por horário**. Copiar sem adaptar herdaria a ausência de trava.
- `gps.plantao_alunos` tem identidade própria (e-mail, sem login). Aqui o aluno **é logado** — usar `gps.membros`.

### 4.2 Reunião Preliminar — proposta de data (VIVO, mas ZERADO)

`gps.reuniao_preliminar_propostas`, criada 15/09 — **0 linhas, nunca usada**.

Modelo: equipe propõe data → aluno aceita ou contesta. Estados
`proposta | aceita | contestada | cancelada`, índice único parcial garantindo 1
proposta viva por cliente, prazo de 3 dias úteis derivado na leitura (sem cron).

⚠️ **Isto colide com o que foi pedido.** Aqui a **equipe propõe** e o aluno
responde. O pedido é o **inverso**: a equipe publica disponibilidade e o **aluno
escolhe**. São dois desenhos concorrentes para o mesmo momento do funil.

👉 **Decisão pendente D6 em §9:** a nova agenda **substitui** esse fluxo ou
convive com ele?

### 4.3 Briefing — as peças existem, mas quase todas vazias

| Fonte | Linhas | Serve para |
|---|---|---|
| `gps.etapa1_clientes` | **1.700** | o cliente; favorito = `acompanhado_equipe` (único por aluno, índice parcial) |
| `gps.onboarding_respostas` | **108** | `descricao_caso` (≤4000), `ajuda_pronta`, honorários, grau de relação |
| `gps.entrevista_tentativas` | **0** | resultado das tentativas de contato (criada 16/09, nunca usada) |
| `gps.cliente_decisores` | **0** | quem decide no negócio (criada 15/09, nunca usada) |
| `gps.cliente_minutas` | — | PDF + contexto obrigatório |

O briefing consolidado é **junção de fontes que já existem** — não precisa criar
cadastro novo. Mas 3 das 5 estão zeradas: **o briefing nasce magro**.

⚠️ **LGPD:** `descricao_caso`, `observacoes` e `cliente_decisores` são marcados
no código como **proibidos em lista consolidada, CSV, Slack e e-mail** — só ficha
e dossiê. **O e-mail para a doutora não pode conter o briefing**, só o link.

### 4.4 As doutoras

- **Cristiane** — admin · **Elaine** — dev · ambas já em `gps.plantao_mentoras`.
- `gps.operadores` (papel "equipe da esteira", criado 15/09) tem **1 linha só**.

👉 **D5:** elas entram como operadoras da esteira ou como papel novo?

---

## 5. Regras de negócio confirmadas

### 5.1 Disponibilidade

**Dra. Cristiane** — confirmado pelo Marcio:
- Quartas e sextas
- 9h30 às 17h · almoço 12h30–14h · **17h liberado**
- 10 minutos entre reuniões
- Horários **fixos por semana** ("pode deixar bem definido")

**Dra. Elaine** — ⏳ pendente.

### 5.2 Durações informadas

| Item | Duração |
|---|---|
| Entrevista Prévia | 2h |
| Reunião Preliminar | 2h |
| Resumo prévio do cliente | 30 min |

### 5.3 🔴 A aritmética não fecha

Quartas e sextas, 9h30–17h, menos almoço 12h30–14h = **6h úteis/dia**.
Com blocos de 2h + 10 min de intervalo:

```
09:30 ─ 11:30   reunião 1
11:30 ─ 12:30   sobra 1h (não cabe outra reunião)
12:30 ─ 14:00   ALMOÇO
14:00 ─ 16:00   reunião 2
16:00 ─ 17:00   sobra 1h
17:00 ─ 19:00   ← "17h liberado" estoura a janela declarada
```

**Resultado: 2 reuniões/dia × 2 dias = 4 por semana com a Cristiane.**

E o "horário das 17h, inclusive" **não comporta uma reunião de 2h** — só os 30
min de resumo prévio, ou a reunião termina 19h.

O Marcio também disse, depois: *"elas vão gerar em torno de 1 hora, 1 hora e
meia, que é a duração média de uma sessão de viabilidade"* — o que **contradiz
as 2h**. Com 1h30 cabem 3/dia (6/semana); com 1h, 4 ou 5.

👉 **D1 em §9.** Esta é a decisão mais cara: ela define quantos slots existem.

### 5.4 ✅ D1 RESPONDIDA (22/09) — bloco único de 2h30

O Marcio fechou, e a ordem é **seguir fiel**:

> *"serão 30 min antes da reunião falando sobre o cliente, depois 2h de sessão"*

**Os 30 min NÃO são um agendamento separado.** São a primeira parte do mesmo
compromisso: a doutora e o aluno entram, passam 30 min sobre o cliente, e
emendam as 2h de sessão. **Um agendamento, `duracao_min = 150`.**

Isso também resolve **D2** (os 30 min não são slot nem formulário — são fase
interna do bloco) e mata a hipótese de dois calendários.

Grade resultante da Cristiane:

```
09:30 – 12:00   sessão 1  (30min briefing + 2h sessão)
12:30 – 14:00   ALMOÇO
14:00 – 16:30   sessão 2
                 17:00–19:30 passaria muito das 17h → slot não existe
```
**2 por dia × 2 dias = 4 por semana.**

⚠️ **O 17h que o Marcio liberou fica FORA da grade** — 17h + 2h30 = 19h30.
Premissa: não criar o slot. Reversível por dado, se ele aceitar terminar 19h30.

⚠️ **A duração vive só em `gps.sessao_tipos.duracao_min` (= 150).** Nenhuma
outra tabela, função ou componente pode ter `150` escrito, e a grade é
**derivada**, nunca gravada. Ajuste futuro = UPDATE de uma linha, sem migration
e sem deploy. Executor que espalhar a duração pelo código reprova em
solidificação.

⚠️ **Consequência de capacidade:** 4 sessões/semana por doutora. Com Elaine
(D8), 8/semana. Havendo 108 alunos no onboarding, a fila é estrutural — a tela
precisa dizer a verdade quando não houver horário, nunca mostrar grade vazia.

---

## 6. Modelo de dados proposto

> Nomes em `gps.sessao_*` — deliberadamente **não** reusa `gps.reuniao_*`, que
> está queimada pela decisão de 10/08. Não ressuscitar aquelas tabelas.

### 6.1 `gps.sessao_tipos` — catálogo
```
id smallint PK · nome text · duracao_min smallint CHECK(15..480)
intervalo_min smallint default 10 · exige_briefing boolean default true
ativo boolean default true
```
Seed: `(1,'Entrevista Prévia',…)`, `(2,'Reunião Preliminar',…)`.

**Por que tabela e não enum:** a duração muda (§5.3) e o Marcio já sinalizou que
vai mandar mais informação. Enum em CHECK exige migration a cada ajuste.

### 6.2 `gps.sessao_disponibilidade` — a regra semanal
```
id uuid PK · responsavel_id uuid → (ver D5)
dia_semana smallint CHECK(0..6) · hora_inicio time · hora_fim time
tipo_id smallint → sessao_tipos (null = qualquer tipo)
vigencia_inicio date · vigencia_fim date null
ativo boolean default true
CHECK (hora_fim > hora_inicio)
```
Cristiane vira 2 dias × 2 faixas (manhã e tarde — o almoço é o vão entre elas).

**Por que regra e não slot solto:** foi pedido "horários fixos por semana". O
Plantão gera slot no clique com `repetirSemanas` (0–12) — funciona, mas obriga o
admin a reabrir a tela a cada 3 meses. Regra semanal não expira.

### 6.3 `gps.sessao_bloqueios` — as exceções
```
id uuid PK · responsavel_id uuid · inicio timestamptz · fim timestamptz
motivo text CHECK(length(btrim(motivo)) between 3 and 300)
criado_por uuid · criado_em timestamptz
```
Feriado, férias, imprevisto. Sem isto, a regra semanal não tem como ser furada e
a doutora aparece disponível no Natal.

### 6.4 `gps.sessao_agendamentos` — o compromisso
```
id uuid PK
tipo_id smallint → sessao_tipos
responsavel_id uuid
aluno_id uuid → public.thb_alunos (ambiente)
cliente_id uuid → gps.etapa1_clientes
data date · hora_inicio time
inicio_em timestamptz GENERATED ((data+hora_inicio) at time zone 'America/Sao_Paulo')
duracao_min smallint            -- congelada do tipo no ato do agendamento
estado text CHECK (agendado|realizado|cancelado|falta)
link_reuniao text
briefing_snapshot jsonb         -- ver §6.5
cancelado_em · cancelado_por · cancelado_motivo
criado_em · atualizado_em
```

**Travas obrigatórias:**
```sql
-- 1 aluno por horário (o Plantão NÃO tem isto — é coletivo)
create unique index sessao_slot_unico
  on gps.sessao_agendamentos (responsavel_id, inicio_em)
  where estado in ('agendado','realizado');

-- 1 sessão viva por aluno + tipo
create unique index sessao_aluno_tipo_viva
  on gps.sessao_agendamentos (aluno_id, tipo_id)
  where estado = 'agendado';
```

⚠️ **Índice único não impede sobreposição parcial.** 14h00 e 15h00, com blocos de
2h, são `inicio_em` distintos e **ambos passam no índice** — mas a segunda invade
a primeira. A checagem de sobreposição tem que estar **dentro da RPC atômica**,
sob `for update`, comparando intervalos. Não dá para delegar ao índice.

⚠️ **Correção de 22/09 (medida no banco, fatia 1):** o texto original desta
seção dizia `aluno_id → gps.membros`. No banco o ambiente é identificado por
`public.thb_alunos.id` — é o que `gps.membros.aluno_id` guarda, o que
`gps.aluno_atual()` devolve e o que `gps.etapa1_clientes.aluno_id` referencia
(as duas colunas foram lidas no baseline). FK para `gps.membros.id` amarraria o
compromisso a **uma pessoa** e o perderia na troca de titular. A fatia 3 (TS)
deve usar `thb_alunos.id`.

🔴 **`fim_em` é coluna gerada, e a ORDEM das operações importa.** A constraint de
exclusão exige expressão IMMUTABLE. Medido em 22/09 contra o banco:
`timestamptz + interval` é **STABLE** (depende do TimeZone da sessão) e levanta
`42P17`; `timestamp + interval` é **IMMUTABLE**. Por isso `fim_em` soma no
timestamp local **antes** do `at time zone`:
`(((data + hora_inicio) + make_interval(mins => duracao_min)) at time zone 'America/Sao_Paulo')`.
A primeira versão da fatia 1 somava depois e **não aplicava**.

### 6.5 `briefing_snapshot` — congelar, não referenciar

O briefing sai de 5 fontes (§4.3) que **continuam mudando** depois do
agendamento. Se a tela montar por JOIN ao vivo, a doutora abre 10 min antes da
sessão e vê algo diferente do que foi agendado.

Grava-se `jsonb` congelado no ato, com `gerado_em`. A tela mostra o snapshot e
sinaliza se a fonte mudou desde então.

⚠️ **Custo:** `descricao_caso` tem até 4.000 chars. Snapshot de ~6 KB × N
agendamentos. Para 4/semana é irrelevante. **Se D1 abrir para 20/semana,
`explain analyze` obrigatório antes** (`PROTOCOLO-SUSTENTABILIDADE.md`).

### 6.6 `gps.sessao_eventos` — trilha append-only
```
id bigserial · agendamento_id · acao · ator_id · detalhe jsonb · criado_em
```
Espelha `gps.aluno_eventos`. É o que permite responder "quem cancelou e quando".

---

## 7. Fluxos

### 7.1 Aluno agenda
```
1. Etapa liberada + cliente favoritado (acompanhado_equipe = true)
2. Preenche o briefing            ← D2: formulário ou slot de 30 min?
3. Vê SÓ horários livres, já filtrados por disponibilidade − bloqueios − ocupados
4. Escolhe                        ← D4: confirma na hora ou fica pendente?
5. RPC atômica: revalida tudo sob lock, congela snapshot, grava, dispara e-mail
```

**Regra de UI do Marcio, literal:** *"não tem que exibir uma data para ele
escolher, tem que exibir as opções de horário"*. Nada de date-picker livre — só
os blocos que a equipe pode. Se não houver nenhum: estado vazio honesto ("a
equipe não tem horário nas próximas N semanas"), **nunca um calendário vazio**.

### 7.2 Doutora acompanha
```
/admin/sessoes → próximas sessões · briefing completo · histórico · cancelar
```

### 7.3 Notificações — **os dois canais são obrigatórios**

Pedido explícito: *"elas têm que estar 100% sendo avisadas"*, sistema **e**
e-mail.

| Quando | Para | Canal |
|---|---|---|
| Agendou | doutora | e-mail + sistema |
| Agendou | aluno | e-mail (confirmação + link) |
| **24h antes** | ambos | e-mail |
| **1h antes** | ambos | e-mail |
| Cancelou | ambos | e-mail + sistema |

**Implementação:** pelo banco (`pg_net` → Resend), no padrão de
`gps.plantao_disparar_emails_sala()`, com `pg_cron`. Não depende de deploy.

⚠️ **Três armadilhas já pagas caro neste sistema:**
1. **Resend tem limite de 10 req/s** — lote sem pausa devolve 429 (11 de 20 caíram assim em 09/09).
2. **`net.http_post` é assíncrono** — carimbar "enviado" logo após o post marca como avisado quem levou 429. Guardar o `request_id` e reconciliar contra `net._http_response`.
3. **LGPD:** o e-mail leva **data, hora, nome do aluno e link**. O briefing fica no sistema (§4.3).

---

## 8. Fora de escopo (v1)

- Integração com Google Calendar / geração automática de link do Meet
- Remarcação pelo aluno (v1: cancela e agenda de novo)
- Fila de espera para horário lotado
- Pagamento/cobrança por sessão
- Gravação da sessão

---

## 9. 🔴 DECISÕES PENDENTES — bloqueiam o build

| # | Pergunta | Estado |
|---|---|---|
| **D0** | Revoga a decisão de 10/08/2026? | ✅ **SIM** (22/09) — *"agora a disponibilidade parte delas"*. Registrado no `CLAUDE.md`. |
| **D1** | Duração real | ✅ **2h30 em bloco único** — 30 min de briefing falado + 2h de sessão. `duracao_min = 150`. Ver §5.4. |
| **D2** | Os 30 min: slot ou formulário? | ✅ **Nenhum dos dois** — é fase interna do bloco de 2h30. |
| **D3** | Entrevista e Preliminar: sequência ou alternativas? | 🟡 **Premissa: alternativas independentes.** São tipos distintos, cada um com 1 sessão viva por aluno. Não trava a 2ª antes da 1ª — o índice `sessao_aluno_tipo_viva` já é por tipo. Reversível por dado. |
| **D4** | Imediato ou pendente de aceite? | 🟡 **Premissa: IMEDIATO.** "Pendente de aceite" é exatamente o modelo que falhou em 10/08 e motivou a remoção. Se a doutora publicou o horário, ele vale. |
| **D5** | Aluno escolhe a doutora? | 🟡 **Premissa: sim, implicitamente** — ao escolher o horário ele escolhe quem o publicou. A tela mostra o nome. Sem distribuição automática na v1. |
| **D6** | Substitui `reuniao_preliminar_propostas`? | 🟡 **Premissa: convivem, sem integrar.** Aquela tabela tem 0 linhas e nunca foi usada; não será tocada nem migrada. Se o Marcio quiser aposentá-la, é decisão separada. |
| **D7** | Cancelamento | 🟡 **Premissa:** aluno cancela até **24h antes**; doutora cancela a qualquer momento com motivo (3–300 chars); dentro de 24h o aluno fala com a equipe. `falta` é marcada pela doutora depois do horário. |
| **D8** | Disponibilidade da Dra. Elaine | 🔴 **PENDENTE — reconfirmado em 22/09: *"a dra elaine ainda nao definiu"*. É dado, não código.** A feature entrega funcionando com a Cristiane; Elaine entra depois com 1 INSERT em `sessao_disponibilidade`, sem deploy. |

> As premissas 🟡 estão declaradas para serem **corrigidas por dado**, não por
> reescrita. Nenhuma delas está embutida em código.

---

## 9-bis. Medições e respostas obtidas no banco (22/09/2026)

Bloqueios técnicos que o arquiteto levantou, resolvidos por medição direta.

### 9b.1 ✅ `explain (analyze, buffers)` da consulta crítica — MEDIDO

Protótipo em transação revertida (`begin … rollback`), sem tocar em produção.
Consulta: horários de uma doutora nas próximas 8 semanas.

**Cenário real (8 linhas vivas):**
```
Seq Scan on t_agend  (cost=0.00..1.22 rows=8) (actual time=0.010..0.013 rows=8)
  Buffers: local hit=1
Execution Time: 0.033 ms
```

**Cenário 10 anos (4.160 linhas):**
```
Seq Scan on t10  (cost=0.00..157.40 rows=1) (actual time=0.812..0.812 rows=0)
  Rows Removed by Filter: 4160 · Buffers: local hit=43
Execution Time: 0.833 ms
```

🔴 **DECISÃO: NÃO criar o índice `sessao_agend_responsavel_janela`.**

O planner escolhe `Seq Scan` nos dois cenários, e está certo — a tabela é
pequena demais para o índice compensar. Criá-lo custaria escrita em todo
agendamento **sem mudar o plano**. Mesma conclusão já medida em
`etapa1_clientes(fase)` (Seq 0,686 ms × Index 0,809 ms) e em `cs.estagios`.

A hipótese do arquiteto — *"provavelmente Seq Scan, e estará certo"* — foi
**confirmada pela medição**, não aceita de cabeça.

### 9b.2 ✅ `btree_gist` — disponível, não instalada

`pg_available_extensions` → versão **1.7 disponível**, `installed_version = null`.
`create extension btree_gist` entra na fatia 1. **A constraint de exclusão é
viável** — a trava de sobreposição mora no banco, não só na RPC.

### 9b.3 ✅ As doutoras — identificadas

| Pessoa | Login | Cargo |
|---|---|---|
| Dra. Cristiane | `cristiane@advmais.com` | **admin** |
| Dra. Elaine | `elaine@advmais.com` | **dev** |

⚠️ Há **dezenas de alunas** chamadas Elaine/Cristiane em `auth.users`. O vínculo
é pelo domínio `@advmais.com`, **nunca pelo primeiro nome**. Casar por nome
pegaria aluna.

`gps.operadores` tem **1 linha: Ana Camila** (`anacamila@advmais.com`). As
doutoras **não estão lá** — confirma a decisão do arquiteto de `responsavel_id`
apontar para `auth.users`, com elegibilidade por `gps.eh_equipe()`.

### 9b.4 🔴 ACHADO DE SEGURANÇA — `gps.config.resend_api_key` ainda tem valor

A migration `…272` (16/09) moveu a chave da Resend para o Vault, mas **a linha
antiga em `gps.config` não foi limpa** — o valor continua lá, legível pelos
admins via REST. Já constava como pendência conhecida.

**Não é bloqueio desta feature** (a fatia 6 lê de `gps.resend_api_key()`), mas
entra no pacote da rotação de credenciais já pendente. Registrado para não sumir.

---

## 9-ter. Decisões finais do Marcio (22/09) — B1, B2, B3

> *"pode ser, com base nas suas recomendações, vamos polindo o plano, com base no
> sistema atual"* — aprovou as 3 recomendações. Os números abaixo foram medidos
> **depois** da aprovação, e um deles **corrigiu a recomendação**.

### B1 ✅ A sessão de Reunião Preliminar ESCREVE `data_reuniao_preliminar`

`sessao_agendar`, quando `tipo = Reunião Preliminar`, grava
`gps.etapa1_clientes.data_reuniao_preliminar` **na mesma transação** — como faz o
aceite em `…263`.

**Por quê:** essa coluna alimenta `agendados` no painel, a meta de 15 reuniões da
Etapa 01, `admin_clientes_lista` e os 4 KPIs da `…282`. Sem escrever, o painel
diria *"não agendada"* para quem tem sessão marcada — duas verdades sobre o
mesmo fato.

⚠️ **Cancelar tem que LIMPAR a coluna** na mesma transação. Senão o painel conta
reunião desmarcada — o bug espelhado, e pior, porque silencioso.

### B2 🔴 REVOGADO em 22/09 — as doutoras VEEM as sessões uma da outra

> **Marcio, 22/09/2026:** *"as dras podem ver os atendimento uma das outras"*

**Por que a decisão original não estava em vigor de qualquer forma:** medido no
banco — `cristiane@advmais.com` é **admin** e `elaine@advmais.com` é **dev** em
`public.perfis`. As duas dão `gp_is_admin() = true` e entram pela policy de
admin, que devolve todas as sessões e todos os briefings. A policy da doutora
(`responsavel_id = auth.uid()`) era **letra morta**.

O Marcio, informado disso, decidiu **aceitar o estado de fato**: custo zero,
nenhuma linha de código muda, e é coerente com o fato de que como admins elas
já leem `gps.dossie_do_cliente` de qualquer cliente há meses.

⚠️ A policy da doutora **fica no banco e não é decorativa**: no dia em que
entrar uma responsável que não seja admin/dev, ela cai nessa policy e vê só as
próprias sessões — sem migration e sem deploy.

**A tabela abaixo é o desenho ORIGINAL, mantido como registro do que foi
revogado:**

### B2 (histórico) — RLS: a doutora vê SÓ as próprias sessões

| Quem | Vê | Briefing |
|---|---|---|
| Aluno (titular/sócio) | sessões do próprio ambiente | ❌ não |
| **Doutora** | **só onde `responsavel_id = auth.uid()`** | ✅ sim |
| Admin (`gp_is_admin()`) | todas | ✅ sim |
| `anon` | nada | — |

Briefing carrega dado pessoal de cliente de terceiro. Doutora sem sessão marcada
não tem por que ler o caso do cliente de outra.

### B3 🔴 Fila — a recomendação original daria ZERO pessoas

**Recomendei "só quem tem favorito confirmado pela equipe". Medido, daria 0
alunos.** A coluna `acompanhamento_confirmado_em` **nunca foi preenchida** — o
ritual existe no schema e não acontece na operação.

| Métrica (22/09) | Valor |
|---|---|
| Ambientes no programa | **148** |
| Alunos com cliente favoritado | **34** |
| Alunos com favorito **confirmado pela equipe** | **0** ← mataria a feature |
| Alunos com cliente selecionado p/ entrevista | 35 |
| Entrevistas registradas (`entrevista_em`) | 0 |
| Onboardings concluídos | 96 |

**Regra adotada (corrigida):** pode agendar quem tem **cliente favoritado**
(`acompanhado_equipe = true`) **e** a etapa do tipo liberada por
`gps.etapa_liberada_para()`.

→ **34 elegíveis** para 4 slots/semana. Continua fila, mas com gente que pode
entrar — não uma tela que recusa todo mundo.

⚠️ **É dado, não código:** vive em `gps.config.sessoes_exige_confirmacao` (nasce
`false`). Quando a equipe começar a confirmar favoritos, vira `true` por UPDATE.

🔴 **Lição:** filtro de elegibilidade tem que ser **contado antes de escolhido**.
Coluna que existe no schema não prova que a operação a preenche.

---

## 10. Plano de execução

| # | Fatia | Executor | Arquivos |
|---|---|---|---|
| **1** | Migration: 5 tabelas + `btree_gist` + constraint de exclusão + RLS + GRANT + seed | `victor` (Sr.) | `…291_gps_sessao_estrutura.sql` |
| **2** | RPCs: `sessao_horarios_livres`, `sessao_agendar`, `sessao_cancelar`, `sessao_marcar_falta` | `victor` (Sr.) | `…292_gps_sessao_rpcs.sql` |
| **3** ‖ | Camada de leitura TS + tipos | `juan` (Jr.) | `src/lib/data/sessoes.ts`, `src/lib/sessoes-tipos.ts` |
| **4** ‖ | Tela do aluno (grade + confirmação) **+ `nav.ts`** | `iromar` (Sr.) | `src/app/sessoes/**`, `src/components/sessoes/**`, `src/lib/nav.ts` |
| **5** ‖ | Tela admin das doutoras | `luis` (Jr.) | `src/app/admin/sessoes/**`, `src/components/admin/sessoes/**` |
| **6** ‖ | E-mails pelo banco + cron + reconciliação de 429 | `victor` (Sr.) | `…293_gps_sessao_emails.sql` |
| **7** | Pentest | `kirad` | diff |
| **8** | Veredito nos 5 critérios | `joao` | — |

**Ordem:** 1 sozinha → 2 → (3 ‖ 4) → (5 ‖ 6) → 7 → 8.

🔴 **`src/lib/nav.ts` é EXCLUSIVO da fatia 4.** É o único arquivo que duas
fatias disputariam; `luis` recebe a rota já roteada. Dois agentes no mesmo
arquivo ficam ambos verdes e o build quebra — e commitar o arquivo inteiro
publica o trabalho não revisado do outro.

⚠️ **Se B2 mudasse para "doutora vê todas", a fatia 5 viraria Sr.** — passaria a
exibir briefing de aluno que não é dela.

**Trava de sustentabilidade:** `explain analyze` já medido (§9b.1) — **não criar
índice**. Qualquer índice novo exige plano medido colado na migration.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| 🔴 **Reconstruir o que foi removido 2×** | D0 explícito antes de tudo |
| 🔴 **Equipe não comparecer de novo** | Disponibilidade parte delas, não do aluno |
| 🟠 Sobreposição parcial de horário | Checagem de intervalo **dentro** da RPC, não só índice |
| 🟠 Briefing muda depois de agendado | Snapshot congelado (§6.5) |
| 🟠 429 da Resend em lote | Reconciliar `net._http_response` |
| 🟠 Vazamento LGPD por e-mail | E-mail leva link, nunca o briefing |
| 🟡 Snapshot pesado em escala | `explain analyze` se D1 abrir volume |
| 🟡 Fuso horário | `inicio_em` gerado, como no Plantão |

---

## 12. Fontes

- `CLAUDE.md:1916-1938` — decisão de remoção de 10/08
- `supabase/migrations/20260901000001_gps_plantao_estrutura.sql` — Plantão
- `supabase/migrations/20260917000278/279` — trava anti-corrida
- `supabase/migrations/20260915000263_gps_reuniao_preliminar.sql` — propostas
- `supabase/migrations/20260909000170_…email_sala_pelo_banco.sql` — e-mail pelo banco
- `src/lib/etapa3.ts` · `src/app/admin/plantao/slots-actions.ts`
- Contagens medidas no banco em 22/09/2026 (§3, §4)
