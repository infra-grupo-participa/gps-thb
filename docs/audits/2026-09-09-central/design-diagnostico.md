# Diagnóstico visual do GPS — "está cru, sem nexo"

**Data:** 2026-09-09 · **Base:** `main` local, dev server em `:3455`
**Fotos:** `tmp/squad/shots-design/` (32 PNGs — 8 telas × 2 viewports × viewport/página inteira)
**Rota de prévia:** `src/app/p/previa-design/` — **TEMPORÁRIA. Apagar a pasta inteira
(`page.tsx` + `mocks.ts`) ao fim da implementação.** Fica no ar porque é a única forma de ver
as 8 telas sem sessão enquanto se mexe no CSS; nenhum link de produção aponta para ela.

> ⚠️ Este documento é **diagnóstico e plano**. Nenhum arquivo de produção foi editado.
> `src/components/financeiro/**`, `meta-honorarios.tsx`, `src/lib/financeiro.ts` e as
> migrations estavam sendo editados por outros agentes durante a captura e **não foram tocados**.

---

## Leitura em uma frase

O GPS **não é feio — é indiferenciado**. Tudo no portal recebeu o mesmo tratamento: o mesmo
retângulo branco com anel cinza de 1 px, o mesmo raio, a mesma sombra (nenhuma), o mesmo
espaçamento, a mesma escala de texto. Uma tela com 6 etapas bloqueadas parece a mesma coisa que
uma tela com R$ 2,9 milhões em risco. **A hierarquia existe no código (`destaque`, `dense`,
`ativo`) mas não chega ao olho**, porque a diferença entre "importante" e "secundário" hoje é
de 5% de saturação num badge cinza. Some-se a isso um cabeçalho que quebra em quatro linhas e
um fundo cinza-azulado que briga com o laranja da marca, e o resultado é exatamente a palavra
que o dono usou: **sem nexo**.

Não falta paleta e não falta componente base (`PageHeader`, `KpiCard`, `EmptyState`,
`BarraMarcos` já existem e são bons). Falta **contraste de hierarquia, densidade e personalidade**.

---

# (A) O que está cru — por tela

## A.0 Problemas transversais (aparecem em todas as fotos)

**T1 — Uma superfície só para tudo.**
`ui/card.tsx:14` — `rounded-xl bg-card ring-1 ring-foreground/10`, **sem sombra nenhuma**, para
os 48 arquivos que usam `Card`. KPI, cliente, etapa bloqueada, chamado, formulário de 1.000 px:
mesma caixa. Não há nível 1 / nível 2 / nível 3 de superfície. `shadow-sm` aparece 21× espalhado
à mão (`grep -c "shadow-"`), sempre em `hover:`, nunca no repouso — então nada "levanta" da
página. Ref: `home-desktop-full.png`, `admin-desktop-full.png`.

**T2 — Fundo frio, marca quente.**
`globals.css:76` — `--background: #f4f5f8` é cinza **azulado** (matiz ~220°); a marca é
`#ff6300` (matiz 23°). Card branco puro sobre cinza-azul dá aquela cara de "dashboard genérico
de biblioteca de componentes". Nada no fundo lembra a marca.

**T3 — Uma escala tipográfica achatada.**
`ui/page-header.tsx:32` — todo `h1` do portal é `text-2xl` (24 px), em **8 telas diferentes**,
com ou sem conteúdo pesado embaixo. Space Grotesk está carregado (500/600/700) mas só é usado
em `h1–h4` e em 7 lugares com `font-heading` — **nenhum número usa a fonte display**. Números de
KPI ficam em Inter 24 px; a "perda pela inércia" de R$ 2.955.000,00 tem o mesmo peso visual que
o rótulo "soma dos seus clientes" logo abaixo.

**T4 — Eyebrow em CAIXA ALTA como enfeite, 15 vezes.**
`grep "uppercase tracking"` → 15 ocorrências. "SEU CAMINHO", "CONTINUE DE ONDE PAROU",
"CLIENTE ACOMPANHADO PELA EQUIPE", "PROGRESSO DA ETAPA", "COMPLETOS · 30 LISTADOS". É o tell
mais conhecido de UI gerada: rótulo tracked-out acima de tudo, sem hierarquia entre eles.
No `admin-desktop-full.png` a etiqueta "COMPLETOS · 30 LISTADOS" **quebra em duas linhas** de
9 px e vira ruído ilegível.

**T5 — Dois sistemas de KPI convivendo.**
`ui/kpi-card.tsx` (número + chip de ícone laranja, usado em `/admin`) **vs.** o bloco próprio de
`etapa1-guide.tsx:282` (número sem ícone, rótulo em caixa alta). Compare
`admin-desktop-full.png` com `etapa1-desktop-full.png`: são dois desenhos de cartão de número na
mesma marca. `grep "uppercase tracking-wide text-muted-foreground"` → 16 blocos escritos à mão.

**T6 — Estado sem cor semântica.**
`ui/badge.tsx` só tem `default` (laranja), `secondary` (cinza), `destructive` (vermelho),
`outline`, `ghost`, `link`. Não existe **sucesso** nem **atenção**. Consequência visível:
"Disponível" (etapa liberada) usa `secondary` **cinza**, do mesmo tom de "sem login" e de
"2 pessoas"; "2 pendências" e "1 chamado aberto" usam ambos `destructive`, sem ladder de
severidade. Quem inventou cor semântica foi `lib/etapa1.ts:81` (`FASES_CLIENTE.cor` com
`amber-100`/verde) — **fora** do sistema de badge, direto em classes Tailwind cruas.

**T7 — Cabeçalho quebrado com 7–8 abas (defeito real, não gosto).**
`app-header.tsx:33` — `flex-wrap` + `md:h-16`. Em **1366 px**, na home do aluno, o bloco de
marca colapsa para **4 linhas** ("Time / Holding Brasil / Programa de / Implementação /
Assistida") e estoura os 64 px do header (`home-desktop-full.png`, canto superior esquerdo).
No **modo assistência** (8 abas) fica pior: o nome "Kelly Nascimento" quebra em duas linhas e a
faixa laranja "Modo assistência" **passa por cima** do subtítulo da marca
(`assist-desktop-full.png`, y≈70). No `/admin` (3 abas) o mesmo header fica perfeito — ou seja,
o desenho só funciona com pouca aba.

**T8 — Indicador de aba ativa fraco.**
`nav-tabs.tsx:104` — ativo = `bg-accent text-accent-foreground` (pílula laranja bem clara).
Contraste OK (o comentário do arquivo documenta 5,9:1), mas **visualmente** a aba ativa e a
inativa têm quase o mesmo peso a 1366 px. Nada de sublinhado, barra ou peso.

**T9 — `SelectValue` mostrando o valor cru do banco (defeito real, 4 lugares).**
`clientes-tabela.tsx:117` e `cliente-ficha.tsx:240,295,475` usam `<SelectValue />` sem função de
render. O Base UI então imprime o **valor**, não o rótulo. Nas fotos aparece
`prospeccao`, `fechamento`, `contratado` (sem acento, minúsculo) na coluna Fase
(`clientes-desktop-full.png`) e `quente` / `contratado` / `D` na ficha
(`ficha-desktop-full.png`). O `CLAUDE.md` já registra esse comportamento — foi corrigido só no
select de ordenação do painel e ficou nos outros quatro.

**T10 — Sem estado de foco/hover consistente e sem profundidade de interação.**
Card clicável (`etapas-overview`, `aluno-card`, `chamados-fila`) só muda a cor da borda no hover.
Nada de elevação, nada de translação. O contrário também: o `Button` faz `translate-y-px` no
`:active`, que nenhum card faz.

---

## A.1 Home do aluno — `home-desktop-full.png` · `home-mobile-full.png`

**Hierarquia invertida.** O elemento mais alto, mais colorido e mais largo da página é o
`PerfilHero` (`perfil-hero.tsx:53`): um bloco laranja de **200 px** que informa nome, turma,
profissão e cidade — dados que o aluno já sabe. Logo abaixo, "Continue de onde parou" — a única
ação da tela — é uma **tira de 70 px** com fundo laranja a 5%. O produto grita a identidade e
sussurra a tarefa.

**O hero está vazio.** Metade direita do gradiente é área morta; o botão "Editar perfil" flutua
sozinho. Nada ali é do *programa* (etapa atual, dias no programa, próxima entrega).

**"Seu caminho" é um muro cinza.** 6 cards idênticos, 5 deles "Em breve". A etapa liberada se
distingue por um chip laranja de 36 px e um badge cinza "Disponível"; o resto do card é igual ao
das bloqueadas. A barra de progresso da etapa liberada é `h-1` (`ui/progress.tsx:38`) e some.

**A coluna de apoio está sufocada.** Em `home-desktop-full.png`, dentro de um card de 350 px:
progresso geral + meta de faturamento com `BarraMarcos` + 3 `KpiLinha`. O rótulo "Meta de
faturamento" **quebra em duas linhas** e encosta no valor; a legenda de marcos
("⚑ Áureo R$ 150.000  ⚑ Bônus R$ 250.000") fica em 11 px colada na barra; "Perda pela inércia"
quebra em duas linhas e o número (R$ 2.955.000,00 — o maior da tela) sai em `text-lg`.

**Mobile é o pior caso.** `home-mobile-full.png` tem **5.350 px** de altura. O nome da aluna é
**truncado** no hero ("Marian…") porque os chips de turma/profissão disputam a mesma linha; os
chips quebram em três linhas. E, pior: o `<aside>` com progresso, meta e KPIs é a **última**
coisa da página — o aluno rola 6 cards de etapa bloqueada (≈900 px) para chegar aos próprios
números.

**Incoerência de número visível na foto:** "Progresso geral 0%" no painel, "0%" no card da
Etapa 01, mas 2 tarefas concluídas no banco de teste. Não é bug de CSS — é a régua
(`pctPorEtapa`) contando só as automáticas. Vale conferir com o back antes de estilizar em cima.

## A.2 Etapa 01 — `etapa1-desktop-full.png` · `etapa1-mobile-viewport.png`

**A linha de KPI é a melhor coisa do portal hoje** (4 números grandes, rótulo, auxílio) — e é
justamente a que **não** usa o `KpiCard` do design system. Consolidar aqui.

**A CTA errada é a mais forte.** O banner "A lista e a gestão dos clientes ficam na aba Clientes"
tem o **único botão laranja sólido** da tela ("Ir para Clientes"), acima do passo a passo. O
passo atual, que é o que se deve fazer, tem só um chip "Foco agora".

**9 tarefas num card de 800 px, sem ritmo.** Concluída, atual, bloqueada e futura ocupam a mesma
altura, o mesmo recuo e a mesma tipografia. O único diferenciador é fundo laranja claro (atual),
borda tracejada (bloqueada) e **opacidade** (futura) — e a opacidade derruba o contraste do
texto das tarefas 4 a 8 para um cinza quase ilegível (`etapa1-desktop-full.png`, y≈940–1260).

**Sem numeração visual.** Os passos são "1.1, 1.2, 2, 3…" em texto corrido dentro do título.
Este é um dos raríssimos casos em que **numeração merece tratamento gráfico** — é uma sequência
de verdade —, e ela não existe: sem trilho, sem marcador, sem linha do tempo.

**O card "Data disponível para agendamento" é órfão** no fim da página, sem relação visual com
nada.

**Mobile:** os 4 KPIs viram 4 cards de largura total, ≈480 px de rolagem antes do primeiro passo.
Deviam ser 2×2.

## A.3 Clientes — `clientes-desktop-full.png` · `clientes-mobile-viewport.png`

**A tabela é cortada em 1366 px.** A coluna "Ações" aparece como "Açõe" e os oito "Excluir"
ficam com a última letra fora da tela. É overflow real, não recorte da foto
(`clientes-desktop-full.png`, x≈1200).

**"Excluir" repetido 8 vezes, em cor de destaque,** com o mesmo peso de "Abrir ficha". A ação
destrutiva está mais visível que a ação principal.

**Valores crus do banco na coluna Fase** (ver T9): `prospeccao`, `fechamento`, `contratado`.

**Três linguagens de cor na mesma tela:** banner verde de confirmação (`confirmacao-equipe`),
barra laranja de meta, chips de filtro laranja/cinza. Nenhuma delas vem do mesmo lugar.

**A `BarraMarcos` fica apertada:** os rótulos "Áureo" e "Bônus" colidem em 390 px
(`clientes-mobile-viewport.png`: "Áureo R$ 150.000⚑ Bô… R$ 250.000").

**A tabela não tem zebra, nem hover de linha, nem alinhamento de peso** — nome, telefone e valor
saem todos em `text-sm` regular, e o cliente da equipe (a estrela) só é marcado por um ícone de
16 px.

## A.4 Ficha do cliente — `ficha-desktop-full.png`

**Um formulário de 1.000 px dentro de um único card**, com **três caixas aninhadas** de
tratamento diferente: "Problemas" (borda cinza), "Andamento do contato" (borda cinza),
"Contrato" (fundo **verde**). Card dentro de card dentro de card, com uma terceira cor sem
explicação sistêmica.

**Larguras de campo aleatórias:** Nome 100%, Telefone 50%, Nível 90 px, Perda 33%, Fase 110 px,
Data 33%, DISC 70 px. Não há grade.

**Sem seções.** "Dados do cliente" é o único título; o resto são labels soltos. Não dá para
varrer a ficha em 2 segundos.

**Salvar só no rodapé**, depois de 1.000 px de rolagem, sem barra fixa e sem indicação de
alterações não salvas.

**Selects mostrando `quente`, `contratado`, `D`** (T9).

## A.5 Painel `/admin` — `admin-desktop-full.png` · `admin-mobile-viewport.png`

**Densidade catastrófica.** Seis alunos ocupam **900 px**. Cada card tem ~150 px para 3 linhas
de informação; sobra branco em toda a metade direita.

**Todos os cards são iguais.** O aluno com 2 pendências + 2 chamados abertos + 51 dias sem
acessar tem exatamente a mesma moldura do aluno que bateu a meta. Os badges vermelhos são a
**única** diferença, e são pequenos.

**A régua de números é ilegível.** `27/30` sobre `COMPLETOS · 30 LISTADOS` (quebra em 2 linhas,
9 px), `11/15` sobre `REUNIÕES`, `R$ 68 mil` sobre `HONORÁRIOS`. Três números do mesmo tamanho,
sem separação, sem alinhamento entre cards (o bloco muda de largura conforme o texto).

**A barra "Etapa 01 · 46%" é um fio de 1 px** que praticamente desaparece.

**A barra de filtros parece um formulário**, não um filtro: 6 caixas de seleção nuas espalhadas
em duas linhas, sem agrupamento, sem chips, ao lado de uma busca e de um select.

**As abas (Alunos ativos / Solicitações / Etapas) somem** — `TabsList` cinza claro sobre fundo
cinza claro.

**"Mostrar mais 200" é texto centralizado**, não botão.

**Mobile:** os 4 KPIs em coluna consomem **500 px** antes de qualquer conteúdo. Deviam ser 2×2.

## A.6 Modo assistência — `assist-desktop-full.png`

**Colisão de layout no cabeçalho** (T7): a faixa "Modo assistência" cobre o subtítulo da marca.
Com 8 abas o header não cabe em 1366 px.

**Três tiras idênticas em sequência:** Diário do aluno, Continue de onde parou, Cliente
acompanhado. Mesma forma (retângulo com chip de ícone à esquerda, eyebrow em caixa alta, ação à
direita), duas delas com o mesmo fundo laranja claro. O admin não consegue distinguir "aviso da
equipe" de "estado do aluno" pela forma.

**A moldura laranja de 3 px** (`assist-banner.tsx:29`) atravessa o header e encosta no conteúdo,
sem respiro — parece erro de renderização, não sinal de contexto.

**A pílula "Assistindo: …"** fixa no canto inferior direito **cobre o conteúdo** (na foto, o
card da Etapa 06).

## A.7 `/admin/chamados` — `chamados-desktop-full.png`

**Quatro chamados em 600 px** (≈120 px cada, para 3 linhas). A fila mais crítica do produto é a
tela mais vazia.

**A fila é ordenada por "mais parado primeiro" e não mostra há quanto tempo.** "Última mensagem
em 02/09/2026, 08:20" é a informação — mas o que importa é "**há 7 dias**". O sinal que define a
ordem da lista não aparece na lista.

**Sem identidade do aluno** (sem inicial, sem avatar) e sem assunto destacado — o título do
chamado está em `text-sm` medium, igual ao nome.

**Chips de status sem ícone e sem cor semântica:** "Aguardando a equipe" (laranja claro) e
"Aguardando o aluno" (cinza contorno) são dois desenhos diferentes para o mesmo tipo de coisa.

## A.8 `/admin/plantao` — `plantao-desktop-full.png` · `plantao-mobile-viewport.png`

**A tela com o maior vazio de informação do sistema.** Um calendário de 420 px de altura em que
cada dia com plantão mostra **um ponto de 6 px e o número "1"**. Nem mentora, nem horário, nem
inscritos. Para saber qualquer coisa é preciso clicar dia a dia.

**Sem legenda.** Ponto laranja = publicado, ponto cinza = despublicado, ícone riscado = cancelado
— nada disso está escrito em lugar nenhum da tela.

**Sem marcador de "hoje"** e sem distinção de dias passados.

**Células vazias em branco puro** fazem a grade parecer uma tabela não preenchida.

**Três estilos de "pílula" na mesma tela:** as `Tabs`, o chip "Inscrições abertas" (borda laranja
+ ponto) e os chips de filtro de outras telas. Nenhum é o mesmo componente.

## A.9 Consistência aluno × admin

| | Aluno | Admin |
|---|---|---|
| Hero | `PerfilHero` laranja de 200 px | nenhum |
| KPI | bloco próprio da Etapa 01, sem ícone | `KpiCard` com chip laranja |
| Lista | tabela densa (Clientes) | cards de 150 px (Alunos) |
| Progresso | `Progress` h-1 + `BarraMarcos` | `Progress` h-1 |
| Estado | badge cinza "Disponível" | badge vermelho "2 pendências" |

São **dois produtos visuais** debaixo da mesma marca. O admin é mais frio e mais vazio; o aluno é
mais quente e mais apertado.

---

# (B) Direção visual proposta

Sem trocar framework, sem trocar paleta, sem tema escuro, sem fonte nova. Tudo abaixo cabe em
`globals.css` + os componentes de `ui/`.

**Nome da direção: "Trilha".** O produto é um **roteiro de 6 etapas com um número no fim**
(R$ 150.000 em honorários). A personalidade vem de duas coisas que já são do produto e hoje não
aparecem: **a sequência** (etapa, passo, marco) e **o número**. Toda decisão abaixo serve a uma
dessas duas.

### B.1 Superfície — três níveis, não um

```
--surface-page:  #FAF8F6   /* branco levemente quente (matiz da marca, ~4% de saturação) */
--surface-card:  #FFFFFF
--surface-sunken:#F3F0EC   /* caixa dentro de card: Problemas, Andamento, calendário vazio */
--border-hair:   #E7E2DC   /* borda de repouso  */
--border-strong: #D6CFC7   /* borda de card interativo / hover */
```

- Fundo da página passa de cinza-azulado (`#f4f5f8`) para **branco quente** — a mesma família do
  laranja da marca. Muda a temperatura do produto inteiro em uma linha.
- **Elevação em 3 degraus**, aplicada por variante do `Card`, não por classe solta:
  - `flat` — borda 1 px, sem sombra: lista, item repetido, container de formulário;
  - `raised` — `0 1px 2px rgb(0 0 0/.04), 0 1px 3px rgb(0 0 0/.06)`: KPI, card clicável;
  - `hover` — `0 2px 4px/.05, 0 4px 12px/.08` + `translateY(-1px)`, 140 ms `ease-out`.
- **Raio:** `--radius: 0.75rem` (12 px) como base; card grande usa 16 px (`rounded-2xl`), chip e
  botão pequeno usam 8 px. Hoje é 14 px em tudo. Três raios, com regra: quanto maior a peça,
  maior o raio.

### B.2 Tipografia — escala com salto de verdade

Space Grotesk (display) ganha **os números e os títulos de seção**; Inter fica com o texto.

| papel | fonte / tamanho / peso | onde |
|---|---|---|
| `display-xl` | Space Grotesk 40/44 600, `tabular-nums` | número do KPI destaque, meta |
| `display-lg` | Space Grotesk 30/34 600 | número de KPI normal, `h1` de tela com hero |
| `h1` | Space Grotesk 28/32 600, `-0.02em` | `PageHeader` (hoje 24) |
| `h2` seção | Space Grotesk 18/24 600 | "Seu caminho", "Passo a passo" |
| `body` | Inter 15/24 400 | texto de card |
| `body-sm` | Inter 13/20 400 | auxílio, legenda |
| `label` | Inter 12/16 600, **sentence case**, `-0.005em` | rótulo de KPI, de campo |

**Regra dura: acaba o `uppercase tracking-wide`.** Os 15 eyebrows viram `label` em caixa normal.
A única exceção permitida é o eyebrow de seção (B.5), que é outro desenho.

**Largura de linha:** descrição de página e texto de card presos a `max-w-[62ch]`. Hoje a
descrição do `PageHeader` corre os 1.100 px inteiros.

### B.3 Espaçamento — ritmo de 4/8 por seção, não por elemento

- Escala única: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- **Uma variável por seção:** `--gap-section: 32px` (desktop) / `24px` (mobile). Entre blocos de
  uma seção: 16. Dentro de card: 12. `Card` mantém `--card-spacing` como hoje (é bom), mas
  ganha `data-size="lg"` = 24 para os cards de hero/KPI.
- **Página:** `py-8` vira `pt-8 pb-16` (hoje o conteúdo encosta no fim da viewport).
- **Densidade de lista** (o item mais impactante do documento): card de aluno e de chamado saem
  de ~150 px para **88–96 px**, com `--card-spacing: 12px` e a régua de números numa linha só.
  Seis alunos passam a caber em ~600 px em vez de 900.

### B.4 Cor — onde o laranja entra e onde ele some

O laranja hoje aparece em massa em 2 lugares (hero de perfil, gradiente do login) e em migalhas
no resto. Inverter:

- **Laranja sólido (`#ff6300`)** é reservado a **uma coisa por tela**: a ação primária. Nada
  mais. O gradiente laranja de 200 px do `PerfilHero` sai (vira B.9).
- **`accent-foreground` (`#B04300`)** continua sendo todo texto/número em laranja (é o que passa
  AA — manter a regra já documentada).
- **Laranja a 8–12%** (`--accent`) marca **o presente**: aba ativa, passo atual, etapa liberada,
  dia com plantão. Nunca decora.
- **Cor semântica de estado entra no sistema de badge**, com token próprio e ícone obrigatório:

| estado | fundo | texto | ícone |
|---|---|---|---|
| sucesso / liberado / quitado | `#E8F5EC` | `#186A3B` | `CircleCheck` |
| atenção / esperando | `#FFF4E0` | `#8A5300` | `Clock` |
| risco / pendência / atrasado | `#FDECEC` | `#A32020` | `AlertCircle` |
| neutro / bloqueado | `#F1EEEA` | `#5C5751` | `Lock` |

Contraste medido pela regra do projeto: os 4 pares passam AA em 12 px.
**"Disponível" deixa de ser cinza e vira verde.** "Aguardando a equipe" vira âmbar com relógio.
`FASES_CLIENTE.cor` (hoje `bg-amber-100` cru em `lib/etapa1.ts:81`) passa a apontar para esses
tokens — a regra de negócio deixa de carregar classe Tailwind.

### B.5 Eyebrow de seção — um desenho, uma vez

Em vez de `TEXTO EM CAIXA ALTA`, o eyebrow vira **marcador de sequência** (é o que o produto é):

```
┌ 2 ─── Seu caminho ────────────────────────────────────────
```
Um número/ícone de 20 px em `--accent`, o título em `h2` Space Grotesk, e uma **régua fina**
(`1px`, `--border-hair`) que ocupa o resto da largura. Custa nada, encoda a sequência e mata os
15 rótulos tracked-out de uma vez. Onde não há sequência (ex.: "Meus clientes"), o marcador é o
ícone da seção, não um número.

### B.6 KPI — um componente só, número grande, delta

`KpiCard` absorve o bloco da Etapa 01. Anatomia fixa:

```
┌──────────────────────────────┐
│ ⌾  Clientes com os dados     │  ← chip 32px + label (sentence case)
│                              │
│  27/30            ▲ +4 sem   │  ← display-lg tabular + delta
│  ▓▓▓▓▓▓▓▓▓▓▓░░░░░  90%       │  ← barra 6px, só quando há meta
│  8 listados · 6 completos    │  ← body-sm
└──────────────────────────────┘
```
- número em **Space Grotesk 30–40 px**, `tabular-nums`;
- **delta opcional** (`+4 na semana`, `há 51 dias`) — hoje não existe comparação em lugar nenhum;
- barra embutida quando o KPI tem meta (clientes/30, reuniões/15, honorários/150k);
- `destaque` continua pintando o número em `accent-foreground`.

### B.7 Progresso com marcos — uma peça, três usos

- `Progress` sai de `h-1` para **`h-2` (linha) / `h-2.5` (com marcos)**, com trilho
  `--surface-sunken` e `inset ring`.
- `BarraMarcos` (já é boa) ganha respiro: legenda em 12 px, **empilha abaixo em < 480 px** em vez
  de colidir, e o marco atingido usa o verde de sucesso, não o laranja.
- O card de etapa liberada mostra a barra **sempre** (hoje só quando `pct != null`), com "0 de 9
  passos" ao lado — 0% é informação, não ausência.

### B.8 Navegação e cabeçalho — marca presente, aba inequívoca

- **Duas linhas por padrão** (não só no mobile): linha 1 = marca + conta; linha 2 = abas com
  régua inferior. Resolve T7 de vez: 8 abas param de espremer a marca.
- Marca: selo **40 px** + "Time Holding Brasil" em Space Grotesk 15/600; o subtítulo "Programa de
  Implementação Assistida" some do header (já está no `<title>` e no `PageHeader`) — é o que
  causa a quebra em 4 linhas.
- **Aba ativa = régua inferior de 2 px em `--primary` + peso 600 + ícone em `accent-foreground`**,
  sobre fundo neutro. A pílula `bg-accent` some (fica só no mobile, onde não há régua).
- Faixa rolável no mobile ganha **máscara de fade** de 24 px nas bordas, para sinalizar que há
  mais abas.
- Modo assistência: a moldura de 3 px vira **borda superior de 4 px** + faixa, sem cobrir o
  header; a pílula "Assistindo" ganha `padding-bottom` no `<main>` para não cobrir conteúdo.

### B.9 Hero da home — troca de assunto

O bloco laranja de identidade vira um **hero de programa**, em três colunas, altura ~140 px:

```
┌────────────────────────────────────────────────────────────────┐
│  MA   Olá, Mariana        │  ETAPA 01 de 6      │  R$ 68.000    │
│       Turma T07 · BH/MG   │  ▓▓▓░░░░░  46%      │  de R$ 150.000│
└────────────────────────────────────────────────────────────────┘
```
- fundo: **branco quente** com um **padrão sutil de trilha** (6 marcadores em `--accent` a 20%,
  SVG inline de <1 KB, `aria-hidden`) — a única decoração do produto, e ela **diz** o que o
  produto é. Não é gradiente, não é blur-blob.
- avatar de iniciais mantém o laranja sólido (é o único laranja cheio do bloco);
- **nome nunca trunca**: chips vão para a segunda linha em < 640 px.
- Login (`auth-layout.tsx`): o painel de gradiente laranja é mantido, mas o **gradiente + 2
  blobs de blur** viram **laranja sólido + o mesmo padrão de trilha**. Consistência com o hero,
  e some o efeito "template".

### B.10 Estado vazio e lista

- `EmptyState` já existe e é bom; passa a ser **obrigatório** em vez de texto solto (a fila de
  chamados vazia e o calendário sem plantão hoje não têm um).
- **Item de lista** (aluno, chamado, cliente no mobile) ganha um desenho único: 88 px, 3
  colunas (identidade | métricas | ação), inicial em círculo de 32 px, chips de estado à direita
  do nome, régua de números **alinhada em grade fixa** (não conforme o texto).
- **Ação destrutiva sai da linha:** "Excluir" vira ícone em menu/hover, com `aria-label`. "Abrir
  ficha" fica sendo a linha inteira clicável.

### B.11 Movimento — um efeito, não cinco

- `transition: box-shadow 140ms, transform 140ms, background-color 120ms` em card interativo.
  Nada de fade-in-up de seção, nada de animação de entrada.
- Foco: `outline: 2px solid var(--ring); outline-offset: 2px` — **outline, não ring**, porque
  `Card` é `overflow-hidden` e recorta anel (o `aluno-card.tsx:78` já descobriu isso na marra;
  vira regra).
- `prefers-reduced-motion` já está tratado no `globals.css` — manter.

---

# (C) Plano de aplicação — 2 ondas para `frontend-engineer` (Opus)

Aceite geral de cada onda: **`npm run build` verde + as 32 capturas refeitas em
`/p/previa-design` e comparadas com as de hoje**, sem regressão de contraste (a regra
`text-primary` só decorativo continua valendo) e sem mudar uma palavra de copy de produto.

## Onda A — tokens e componentes base

Nenhuma tela muda de estrutura nesta onda. O que muda é o que todas elas herdam.

| # | Arquivo | O que muda | Aceite visual |
|---|---|---|---|
| A1 | `src/app/globals.css` | `--background` → branco quente `#FAF8F6`; novos `--surface-sunken`, `--border-hair`, `--border-strong`; **6 tokens semânticos** (sucesso/atenção/risco, fundo+texto); `--radius` 0.625→0.75rem; 3 tokens de sombra (`--shadow-raised`, `--shadow-hover`); escala tipográfica como `@theme` (`--text-display-xl/lg`, `--text-h1/h2`). **Não** reintroduzir `.dark`. | Página inteira muda de temperatura; nada quebra |
| A2 | `src/components/ui/card.tsx` | prop `elevacao?: "flat" \| "raised"` (default `flat`) e `data-size="lg"`; `ring-1` → `border` + sombra por token; `rounded-xl`→`rounded-2xl` só no `lg` | KPI e card clicável "levantam"; lista continua plana |
| A3 | `src/components/ui/badge.tsx` | variantes **`success`, `warning`, `danger`, `neutral`** com os 6 tokens; slot de ícone obrigatório nas 4; `destructive` passa a ser alias de `danger` | "Disponível" verde, "2 pendências" vermelho com ícone, "Aguardando a equipe" âmbar com relógio |
| A4 | `src/components/ui/button.tsx` | altura base 32→**36 px** (`h-9`) e `lg` 40; `focus-visible` por `outline` em vez de `ring`; `destructive` ganha variante `ghost-danger` para linha de lista | Botão deixa de parecer apertado; foco visível dentro de card `overflow-hidden` |
| A5 | `src/components/ui/page-header.tsx` | `h1` `text-2xl`→`text-[28px]` Space Grotesk 600 `-0.02em`; descrição com `max-w-[62ch]`; novo slot `eyebrow`; `mb-6`→`mb-8` | Título ganha presença nas 17 páginas de uma vez |
| A6 | `src/components/ui/kpi-card.tsx` | nova anatomia (B.6): número em `display-lg` Space Grotesk, `delta?`, `meta?` (desenha barra), rótulo em sentence case (**sai o `uppercase`**); `IconeChip` 36→32 px | Os 4 KPIs do `/admin` e os 4 da Etapa 01 ficam idênticos |
| A7 | **novo** `src/components/ui/secao.tsx` | eyebrow de seção (B.5): `numero?`/`icone`, título `h2`, régua; substitui os 15 `uppercase tracking-wide` | "Seu caminho", "Passo a passo", "Meus clientes" passam a ter a mesma cabeça |
| A8 | `src/components/ui/progress.tsx` · `barra-marcos.tsx` | `h-1`→`h-2`; trilho `--surface-sunken` + inset ring; `BarraMarcos` com legenda 12 px, marco atingido em verde e **empilhamento < 480 px** | Barra visível; nada colide em 390 px |
| A9 | `src/components/ui/empty-state.tsx` | `raised`, ícone 40→48 px, ação primária obrigatória quando houver caminho | Vazio vira convite |
| A10 | `src/components/app-header.tsx` + `nav-tabs.tsx` | header em **2 linhas sempre**; selo 40 px; **remover o subtítulo** da marca; aba ativa = régua 2 px + peso 600; fade de 24 px nas bordas do scroller | **Fim da quebra em 4 linhas** (T7) — validar em 1366 com 8 abas |
| A11 | `src/components/auth-layout.tsx` | gradiente + 2 blobs → laranja sólido + padrão de trilha; tipografia do claim em `display-lg` | Login deixa de parecer template |
| A12 | **novo** `src/components/ui/padrao-trilha.tsx` | SVG inline `aria-hidden` do padrão de 6 marcadores (usado no hero da home e no login) | < 1 KB, sem request |

**Fora do escopo da Onda A:** qualquer `page.tsx`, qualquer action, qualquer texto de produto.

## Onda B — as telas consumindo o sistema

| # | Arquivo | O que muda | Aceite visual |
|---|---|---|---|
| B1 | `src/components/perfil/perfil-hero.tsx` | vira **hero de programa** (B.9): 3 colunas (identidade · etapa atual + progresso · meta), fundo branco quente + `PadraoTrilha`, altura ~140 px, **nome sem truncar em 390 px** | O bloco mais alto da home passa a informar o programa |
| B2 | `src/app/page.tsx` | ordem no mobile: **`HomeResumo` sobe** para logo abaixo do "Continue de onde parou" (`order-*` no grid, sem duplicar DOM); `Secao` no lugar do `<h2 uppercase>`; `pb-16` | No celular o aluno vê os próprios números sem rolar 6 cards |
| B3 | `src/components/etapa/proximo-passo-card.tsx` | vira a **peça mais forte da home**: `elevacao="raised"`, ícone 48 px, título em `h2`, botão primário sólido à direita (hoje é só texto) | Ação > identidade |
| B4 | `src/components/etapas-overview.tsx` | badge "Disponível" **verde**; bloqueada com fundo `sunken` + `Lock` neutro; barra sempre visível com "0 de 9 passos"; hover com elevação | Dá para achar a etapa liberada em 1 segundo |
| B5 | `src/components/home-resumo.tsx` | 3 `KpiLinha` → grade 2 col em desktop; rótulo em uma linha; "Perda pela inércia" em `display-lg` | Fim das quebras de rótulo e do número grande em corpo pequeno |
| B6 | `src/components/etapa1/etapa1-guide.tsx` | KPI próprio **→ `KpiCard`** (grade 2×2 no mobile); passo a passo com **trilho vertical numerado**; futura deixa de usar `opacity` e passa a usar cor de texto `muted` (contraste AA); banner "Ir para Clientes" perde o botão sólido (vira link com ícone) | Sequência legível; a CTA forte volta a ser o passo atual |
| B7 | `src/components/clientes/clientes-manager/clientes-tabela.tsx` | **corrigir o overflow da coluna Ações** (`table-fixed` + `min-w` por coluna, container `overflow-x-auto`); `<SelectValue>` com função de render → rótulo em vez de `prospeccao` (**T9**); "Excluir" vira ícone com `aria-label`; hover de linha | Nada cortado em 1366; some o valor cru do banco |
| B8 | `src/components/clientes/clientes-manager/index.tsx` · `cliente-card-lista.tsx` | `Secao` no cabeçalho; chips de filtro com contagem em `Badge`; card do mobile no padrão de item de lista (B.10) | Uma linguagem de chip só |
| B9 | `src/components/clientes/cliente-ficha.tsx` | grade de 12 colunas com larguras padronizadas; 3 caixas aninhadas → **3 `Secao`** (a caixa verde do Contrato some, o verde vira o badge de fase); barra de salvar **fixa** no rodapé com estado "alterações não salvas"; 3× `<SelectValue>` corrigido (**T9**) | Ficha varrível; nada de card-dentro-de-card |
| B10 | `src/components/admin/alunos-ativos-lista/aluno-card.tsx` | **88–96 px** de altura; grade fixa de métricas (3 colunas de largura igual, rótulo em uma linha); badges com o novo ladder; "Nota rápida" vira botão `sm` | 6 alunos em ~600 px em vez de 900 |
| B11 | `src/components/admin/alunos-ativos-lista/index.tsx` | filtros em **chips alternáveis** (não checkbox nu), agrupados; "Mostrar mais" vira `Button outline`; `Tabs` com indicador forte | A barra de filtro deixa de parecer formulário |
| B12 | `src/app/admin/page.tsx` | KPI grid `sm:grid-cols-2` (2×2 no mobile, não 1×4); `hint` como `delta` quando fizer sentido | 4 números em uma tela de celular |
| B13 | `src/components/admin/assist-banner.tsx` | moldura 3 px → **borda superior de 4 px** + faixa; pílula "Assistindo" com `padding-bottom` compensatório no `main` | Nada cobre header nem conteúdo |
| B14 | `src/components/admin/diario-resumo-card.tsx` | deixa de repetir a forma do `ProximoPassoCard`: vira card `flat` com faixa lateral de 3 px na cor do tipo da nota | As 3 tiras do modo assistência param de parecer a mesma coisa |
| B15 | `src/components/admin/chamados-fila.tsx` | item de lista de 88 px com inicial do aluno; **"parado há N dias"** como chip de atenção/risco (o sinal que ordena a fila); assunto em `h3`; `EmptyState` no vazio | A fila mostra por que está ordenada assim |
| B16 | `src/components/admin/plantao-calendario/grade-mes.tsx` · `card-slot.tsx` | célula do dia mostra **hora + primeiro nome da mentora + nº de inscritos** (não um ponto); **legenda** de estados abaixo da grade; "hoje" com anel; dias fora do mês em `sunken`; célula ≥ 96 px no desktop | Dá para ler o mês sem clicar |
| B17 | `src/components/plantao/*` (rota `/p/plantao`) | só herda os tokens — **não mexer no layout**, é iframe da Hotmart (sem `sticky`, largura contida) | Nenhuma mudança de estrutura |

**Ordem sugerida:** A1→A12 num PR (é onde está o risco de regressão global), depois B em dois
PRs: aluno (B1–B9) e admin (B10–B17).

---

# (D) O que NÃO fazer

1. **Não mudar texto de produto.** Nenhuma copy de tarefa, etapa, aviso, e-mail, microcopy de
   estado vazio ou label de campo. As únicas strings novas permitidas são as que hoje **não
   existem**: legenda do calendário, "parado há N dias", "0 de 9 passos".
2. **Não tocar em regra, action, RPC, migration ou `src/lib/*` de domínio.** Exceção única e
   cirúrgica: `FASES_CLIENTE.cor` (`lib/etapa1.ts:81`) trocando classe Tailwind crua por token
   semântico — mesma cor, mesmo significado.
3. **Não reintroduzir tema escuro.** Nada de `.dark`, `next-themes`, `dark:` ou
   `prefers-color-scheme`. O `@custom-variant dark` do `globals.css:14` fica como está.
4. **Não quebrar contraste AA.** `text-primary` (#FF6300 = 2,98:1) continua **proibido em
   texto**; todo texto/número laranja usa `accent-foreground` (#B04300). Os 4 pares semânticos
   novos precisam ser **medidos**, não estimados, e o número vai no comentário do token.
5. **Não trocar fonte nem paleta.** Inter + Space Grotesk, `#FF6300` + neutros. Nada de serifa,
   nada de mono para "dado".
6. **Não usar `opacity` para dizer estado** (regra VIS3 já existente): bloqueado/futuro se diz por
   cor de texto, borda e ícone.
7. **Não empilhar tela nova.** Nenhuma rota, aba ou card novo. Se algo precisa aparecer, aparece
   dentro do que já existe.
8. **Não trocar o mecanismo de logout** (`logout-button.tsx`) — o comentário do arquivo registra
   que Server Action/route handler já quebrou atrás do proxy da Hostinger.
9. **Não mexer no layout de `/p/plantao`** (iframe da Hotmart: sem `sticky`, largura contida).
10. **Não usar os clichês que a marca não pediu:** gradiente-como-decoração, blob com `blur-2xl`,
    eyebrow em CAIXA ALTA tracked, `→` colado no texto do botão, meta em `A · B · C`, e sombra
    genérica `rgba(0,0,0,.1)` igual em tudo. Três desses já estão no código hoje.
11. **Não deixar a rota de prévia para trás.** `src/app/p/previa-design/` (page + mocks) **é
    temporária** e deve ser apagada no último commit da Onda B. Enquanto existir, é pública —
    tem só dado fictício, mas não deve ir para produção.

---

## Anexo — como reproduzir as fotos

```bash
npx next dev -p 3455
# /p/previa-design?t=home|etapa1|clientes|ficha|admin|assist|chamados|plantao
node <script de captura>   # 1366×900 e 390×844, viewport + fullPage
```
Sem erro de console nas 16 combinações (verificado). A prévia usa componentes de produção com
dados de `mocks.ts`; Server Actions não são chamadas.

## Adendo do orquestrador (09/09) — para a Onda B
- "Progresso geral 0%" na prévia era o mock (tarefas 1 e 2 são automáticas). Cálculo em `src/lib` está certo.
- DECISÃO de produto para a Onda B: o "Progresso geral" passa a ser a média **das etapas liberadas** (hoje divide por 6, então Etapa 01 completa mostra 17% — confunde). Rótulo: "Progresso nas etapas liberadas · 1 de 6". Onde: `src/app/page.tsx` (~:141) e `src/app/admin/aluno/[alunoId]/page.tsx` (mesmo cálculo) — `pctPorEtapa` continua igual; só a média muda para `etapas.filter(e => e.liberada)`. Manter o número por etapa no `EtapasOverview`.
