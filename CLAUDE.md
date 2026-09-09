# GPS — Programa de Implementação Assistida

> Fonte de verdade do projeto. **Mantenha este arquivo atualizado ao fim de cada sessão** (decisões, o que foi feito, o que falta). O usuário pediu explicitamente para não precisar lembrar disso.

## O que é

O **GPS** é o portal de **implementação assistida** do **Time Holding Brasil** (Grupo Participa).
O programa acompanha o aluno/parceiro na implementação da **1ª holding**, do primeiro contato
com clientes até a entrega. "Assistida" = a equipe (admin) entra no ambiente do aluno para
enxergar onde ele travou e destravá-lo em reuniões.

O negócio tem **duas frentes**:
1. **Captação** — atração de clientes no digital (tráfego pago, disparos). Hoje vive no sistema
   legado `sip`. No GPS, o **portal de captação fica bloqueado por ora**.
2. **Implementação da holding** — agendamento, organização de documentos e o fluxo de fechamento
   (Sessão de Viabilidade → Croqui Estrutural → Execução da Holding). **É o foco do GPS.**

## Etapas do programa (6)

1. **Estrutura e contato com a base de clientes** ← única no ar agora
2. Reunião Preliminar
3. Croqui Estrutural
4. Contrato
5. Execução
6. Entrega

**Regra de liberação:** liberação controlada por `gps.etapas.liberada`. Só a Etapa 01 está
liberada; as demais ficam bloqueadas e são liberadas uma por dia. Para liberar:
`update gps.etapas set liberada = true where id = <n>`. Admin pode pré-visualizar etapas
bloqueadas em `/admin/aluno/<id>/etapa/<n>`.

**Sistema de etapas (genérico):** conteúdo em `src/lib/etapaN.ts` + registro em `src/lib/etapas.ts`
(`conteudoEtapa(n)`). Rota única `/etapa/[etapa]` (e admin `.../etapa/[etapa]`): etapa 1 usa o guia
rico (`Etapa1Guide`, com métricas/clientes/tarefas automáticas); etapas ≥ 2 usam `EtapaGuide`
(checklist manual + tutoriais/modelos/info). Tarefa: `TarefaItem` (compartilhado).
`TarefaDef.num` é a **identidade estável** (referenciada por `gps.progresso`); `TarefaDef.codigo`
é só o rótulo exibido (ex.: `1.1`). **Ênfase das tarefas** (`src/lib/enfase.ts`): a tarefa atual
(1ª não concluída) fica em destaque, futuras esmaecidas, concluídas normais; o admin sobrepõe
via `TarefaItem` (grava em `gps.tarefa_enfase`; action `definirEnfaseTarefa`).
**Trava do favorito (dentro da Etapa 01):** os **passos 4 em diante** da Etapa 01 (`TarefaDef.exigeFavorito`
nos nums 5,7,8,9,10 = códigos 4–8) ficam **bloqueados** até o aluno escolher o cliente que a equipe vai
acompanhar (`acompanhado_equipe`). Sem favorito, o `Etapa1Guide` mostra os passos travados (`TarefaItem`
`bloqueada`) + aviso com CTA para Clientes; ao favoritar, um banner verde `ConfirmacaoEquipe` confirma e
leva de volta à Etapa 01 + toast. **As demais etapas (2–6) ficam bloqueadas por padrão** (só
`gps.etapas.liberada`), sem gate por favorito — o favorito não bloqueia mais o acesso a essas etapas.
**Etapa 02 (Reunião Preliminar)** em `src/lib/etapa2.ts` — bloqueada até liberar.
**Etapa 03 (Croqui Estrutural)** em `src/lib/etapa3.ts` (13 tarefas) + guia especial
`Etapa3Guide`: **agendamentos** da apresentação com "a equipe participa de apenas UM"
(`gps.etapa3_agendamentos`, flag `equipe_participa`) e **revisão** dúvidas do parceiro/correções
da equipe (`gps.etapa3_revisao`). Etapa 1 e 3 têm guias próprios; demais usam `EtapaGuide`.
O fetch/branch por etapa fica em `EtapaConteudo` (server). Actions de etapa em `src/app/etapa/actions.ts`.
**Etapa 04 (Contrato)** em `src/lib/etapa4.ts` (3 tarefas). **Etapa 05 (Execução)** em
`src/lib/etapa5.ts` (26 tarefas). **Etapa 06 (Fechamento)** em `src/lib/etapa6.ts` (2 tarefas).
**As 6 etapas estão estruturadas.** Só a 1 está liberada; 2–6 bloqueadas até
`update gps.etapas set liberada=true where id=<n>`.

### Etapa 01 — checklist do aluno (da planilha oficial)
Os dois primeiros passos são o **mesmo objetivo** (montar a base de clientes) — exibidos como
**1.1** e **1.2** — e ambos apontam com um indicador visual para a **aba Clientes**, onde o registro
acontece. O antigo passo 6 ("preencher os dados dos 30") foi **absorvido como contexto do 1.1**.
- **1.1** Listar **30 clientes potenciais** com ≥1 dos **7 problemas** (dividendos, lucro presumido,
  aluguéis PF, negócio familiar, patrimônio dependente do fundador, patrimônio em risco, inventário
  caro) — já preenchendo nome, telefone, nível de relacionamento, registro do contato e a data da
  reunião preliminar (automática: conclui com 30 preenchidos + dados essenciais).
- **1.2** Identificar a **perda pela inércia** de cada um dos 30 (automática).
- **2** Mensagem padrão (formação técnica + perda pela inércia).
- **3** Mensagem "estudo de caso" (dor específica; estimular conversa; não oferecer nada).
- **4** Ligação com **2 opções de agenda**. **Meta: 15 reuniões preliminares.**
- **5** Criar grupos de WhatsApp com quem aderiu à Reunião Preliminar.
- **6** Entrevista prévia (formulário com **perfil DISC**); identificar tomadores de decisão.
- **7** Criar conta de negócio na Hotmart.
- **8** Criar produtos na Hotmart: Sessão de Viabilidade, Croqui Estrutural, Execução Holding.

(No banco os `num` das tarefas manuais ficam estáveis: 3, 4, 5, 7, 8, 9, 10 → exibidos 2..8; a
tarefa `num=6` foi removida.)

## Papéis / acesso

- **Admin** = registro em `public.perfis` (equipe interna; já têm `auth.users`). Pode ver e
  **editar** o ambiente de qualquer aluno.
- **Aluno/parceiro** = registro em `public.thb_alunos` (2.459). O GPS é o **primeiro** portal com
  login próprio do aluno (antes, 0 alunos tinham `auth.users`). Provisionar login e vincular.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui**.
- **Deploy: Hostinger (app Node)** via `server.js` (Passenger, escuta `PORT`). Ver `DEPLOY.md`.
- **Repo**: `github.com/infra-grupo-participa/gps-thb` (branch `main`).
- **Supabase** (`@supabase/ssr`) — **mesmo projeto do sip**: ref `mbvybujpkwuorhtdzcde`
  ("Sistema Grupo Participa", sa-east-1). Tabelas do GPS com prefixo **`gps_`**.
- Marca **laranja** (`#F97316` / `#EA580C`).
- **Fontes padrão dos sistemas do Grupo Participa**: **Inter** (corpo) + **Space Grotesk**
  (títulos `h1–h4`), via `next/font/google` (variáveis `--font-sans` / `--font-display`).

### Marca na UI (2026-07-09)

**"GPS" não aparece mais para o usuário.** O portal se apresenta como
**Time Holding Brasil — Programa de Implementação Assistida**. Isso vale para header, tela de
login, títulos de página, remetente e corpo dos e-mails.

- **Logo**: `public/logo-thb.svg` (o selo circular, mesmo asset do sip: `public/assets/logo-thb-mark.svg`),
  renderizado por `ThbLogo` (`src/components/thb-logo.tsx`). Usa `unoptimized` porque o otimizador
  de imagens do Next recusa SVG por padrão. No painel laranja da tela de login o selo leva um anel
  branco (`ring-white/80`) — senão ele some no gradiente, que é da mesma cor.
- **Ícone da aba**: `icons: { icon: "/logo-thb.svg" }` no root layout. O `src/app/favicon.ico`
  padrão do Next foi **removido** — enquanto existia, o navegador o preferia ao SVG.
- **Títulos**: root layout define `title.template = "%s | Programa de Implementação Assistida"`;
  as páginas informam só o próprio nome (ex.: `title: "Clientes"`).
- **E-mails** seguem sem logo em imagem: Gmail e outros clientes não renderizam SVG.
- **"GPS" continua como nome interno**: schema `gps`, prefixo `gps_`, repo `gps-thb`,
  identificadores (`jaNoGps`) e comentários. Renomear isso exigiria migrar o schema num banco
  compartilhado com o sip — decidido **não** fazer.

## Convenções e regras

- **Sem dados fake.** Só dados reais; nunca seed/demonstração inventado (regra herdada do sip).
- Prefixo `gps_` para tudo que for específico do GPS. Reaproveitar `thb_alunos`, `thb_turmas`,
  `perfis` — não duplicar.
- Português correto (com acentuação) em UI e textos.
- RLS habilitado em toda tabela `gps_`.

## Estrutura do código

- `src/app` — rotas (App Router).
- `src/lib/supabase` — clientes server/browser + helpers de sessão/papel.
- `src/components/ui` — shadcn.

## Banco de dados (schema `gps`)

Schema dedicado **`gps`** no Supabase `mbvybujpkwuorhtdzcde`. Exposto ao PostgREST via
`ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, gps'`. No supabase-js
usa-se `supabase.schema("gps").from("...")`.

Tabelas: `gps.etapas` (config de liberação das 6 etapas), `gps.membros` (vínculo
`auth.users` ⇄ `thb_alunos` + data de agendamento), `gps.etapa1_clientes` (os 30 clientes;
`acompanhado_equipe` = o favorito/cliente da equipe, único por aluno), `gps.progresso` (conclusão
de tarefas manuais por aluno/etapa/tarefa), `gps.tarefa_enfase` (override de destaque/esmaecimento
de tarefa pelo admin — `modo` ∈ {realce, esmaecer}, PK aluno/etapa/tarefa).

⚠️ **As tabelas de reunião continuam no banco, mas NENHUM código as usa** (ver "Agendamento"
abaixo): `gps.reuniao_agendamentos`, `gps.reuniao_horarios`, `gps.reuniao_eventos`,
`gps.reuniao_bloqueios` e a trigger `gps.reuniao_guardar_status`. Foram deixadas de pé de
propósito, para não perder dado e permitir voltar atrás. **Não voltar a lê-las sem decisão
explícita do Marcio.**
Funções: `gps.aluno_atual()` (aluno_id do usuário logado), `gps.touch_atualizado_em()`.
RLS: admin (`public.gp_is_admin()`, cargo dev/admin) faz tudo; aluno só nos próprios registros
(via `gps.aluno_atual()`).

## Dados alterados a mão em 09/09/2026 (war-room) — NÃO viram migration

O dia 09/09 teve correções aplicadas direto no banco sob pressão. As de
**schema** já têm migration (`…185` para `situacao_compra/detalhe/em`). As
de **dado** abaixo são deliberadamente deixadas de fora de migration — inserir
dado de pessoa numa migration é bomba-relógio (reaplicar o histórico do banco
do zero reinsere transação/carimbo que já pode ter mudado de novo). O registro
aqui serve para auditoria amanhã, com o SQL de conferência de cada uma.

**No schema `gps` (este repo):**

- **33 ambientes criados em `gps.membros`** (provisionamento de acesso do dia).
  Conferência (contagem por dia, sem full scan — `criado_em` é o predicado e a
  tabela é de tamanho controlado por natureza: 1 linha por aluno provisionado):
  ```sql
  select count(*) from gps.membros
   where criado_em::date = '2026-09-09';
  ```
- **4 liberações + 11 revogações em `gps.plantao_alunos`** (campo `ativo`).
  As **liberações** (`gps.admin_liberar_aluno_plantao`, migration `…175`) têm
  trilha própria em `gps.plantao_eventos` (`acao='plantao_liberado_manualmente'`):
  ```sql
  select pe.criado_em, pa.email, pa.nome
    from gps.plantao_eventos pe
    join gps.plantao_alunos pa on pa.id = pe.aluno_plantao_id
   where pe.acao = 'plantao_liberado_manualmente'
     and pe.criado_em::date = '2026-09-09';
  ```
  ⚠️ As **revogações** (`revogarAcessoPlantao` em `alunos-actions.ts`) são só
  `update ativo=false` **sem log** — a única pista é `atualizado_em`, que a
  trigger `trg_plantao_alunos_atualizado_em` também move em QUALQUER outro
  update do dia (ex.: a própria carga de `situacao_compra`). Portanto o
  filtro abaixo é aproximado, não uma trilha de auditoria:
  ```sql
  select email, nome, atualizado_em from gps.plantao_alunos
   where ativo = false and atualizado_em::date = '2026-09-09';
  ```
- **500 linhas de situação comercial importadas** em
  `gps.plantao_alunos.situacao_compra/detalhe/em` (colunas da migration
  `…185`, população inicial via CSV da Hotmart):
  ```sql
  select situacao_compra, count(*) from gps.plantao_alunos
   where situacao_em::date = '2026-09-09'
   group by situacao_compra;
  ```

**Fora deste repo — pertencem ao `sistema-grupo-participa-v2` (Financeiro/HM),
mesmo projeto Supabase físico, schemas `cs`/`public` fora de `gps`:**

- 2 pagamentos manuais do Heber em `cs.hm_pagamentos` (`HP2014051500`,
  `HP2349587002`).
- 15 carimbos `situacao_financeira` corrigidos em `public.thb_alunos` — tabela
  compartilhada (o GPS só LÊ `thb_alunos`; nenhuma migration deste repo cria
  ou altera essa coluna), mexida por código do Financeiro.
- 12 ofertas do catálogo `public.hm_product_catalog` cadastradas via
  war-room (`origem_do_dado='manual'`, `atualizado_por like '%war-room%'`) —
  ainda faltam 6 ofertas não catalogadas (`5o3z1yur`, `yzih2l0a`, `t2vejhvv`,
  `hyopam51`, `cnfrh6wj`, `p4t1xid7`; 37 transações pagas): regra de negócio
  pendente, **não catalogar sem decisão**.

⚠️ Essas quatro últimas escritas ficam de fora deste `CLAUDE.md` de propósito
— não são schema nem dado deste repo. Ver/registrar no `CLAUDE.md` (ou
`docs/`) de `sistema-grupo-participa-v2`.

## Arquitetura de informação (decisão do usuário)

- **Início (home) do aluno**: hierarquia **ação → jornada + apoio**. Topo: hero + **"Continue de
  onde parou"** (`ProximoPassoCard` + `proximoPasso()` — 1ª tarefa pendente na etapa liberada mais
  avançada). Abaixo, **grid de 2 colunas**: coluna principal (2/3) com o **cliente favoritado**
  (`FavoritoDestaque`) + **"Seu caminho"** (`EtapasOverview dense`, 2 col); coluna de apoio (1/3,
  sticky) com o painel **`HomeResumo`** (progresso geral + clientes/reuniões/perda num único card).
  Os atalhos Clientes/Pasta/Materiais foram removidos da home (já estão no `NavTabs` do header).
- **Cliente favoritado** (`FavoritoDestaque`, compartilhado aluno/admin): card **só informativo**
  do cliente que a equipe acompanha — nome, fase, telefone/WhatsApp, perda pela inércia e
  "Abrir ficha". É Server Component (sem `"use client"`, sem estado, sem action).

### 📓 Diário do aluno (2026-09-08)

Linha do tempo da EQUIPE sobre cada aluno (observação, dúvida, combinado,
pendência) — registrada em reunião, e-mail, WhatsApp, plataforma ou planilha.
**Visualização e escrita EXCLUSIVAS do admin.** O aluno **nunca** vê, o sócio
**nunca** vê. Motivo: o texto livre pode conter **dado pessoal de terceiros**
(cliente do aluno, situação familiar, valor de patrimônio) — é LGPD, não
preferência de produto.

Backend (não mexer sem necessidade — já pronto): `gps.aluno_notas`
(append-only; só `resolvido_em`/`resolvido_por` são editáveis, via trigger),
`src/lib/types.ts` (`VOZES_NOTA`/`TIPOS_NOTA`/`ORIGENS_NOTA`, `AlunoNota`,
`AlunoNotaComAutor`, `ResumoDiario`), `src/lib/data.ts`
(`getDiarioDoAluno` — timeline com teto de 50; `getPendenciasAbertasDoAluno`
— **sem teto**, para a pendência antiga nunca ficar sem botão de baixa;
`getResumoDiario` — última nota + contagem exata via `count/head`;
`gps.admin_painel_atendimento()` — pendências abertas + última nota (140 caracteres) por
aluno, para os cards do painel; **substituiu `getPendenciasPorAluno`** em 09/09; todas com
`ehAdmin()` de guarda), `src/app/admin/diario-actions.ts`
(`registrarNota`/`darBaixaPendencia`, autoria sempre do `ctx.user.id` do
servidor, nunca do cliente).

Frontend: card de resumo no topo do Modo Assistência
(`DiarioResumoCard`, acima do `ProximoPassoCard` em
`admin/aluno/[alunoId]/page.tsx`) + aba própria
`admin/aluno/[alunoId]/diario` (`DiarioForm` + `DiarioTimeline` +
`DiarioBaixaButton`) — a timeline recebe DUAS listas: as notas (teto de 50) e
as pendências abertas (sem teto), exibidas numa seção fixa no topo com botão
de baixa, sem repetir no histórico + badge/filtro de pendência na lista "Alunos ativos"
do painel (`AlunosAtivosLista`, alimentada por `gps.admin_painel_atendimento()`
— uma RPC só, filtro em memória; ver a seção "Polimento geral + Fases 5, 6 e 7").

> ⚠️ **NÃO adicionar "Diário" em `alunoNavItems`** (`src/lib/nav.ts`) — essa
> função também é chamada pelo **aluno** com `basePath=""`, e qualquer item
> nela vaza para o menu do aluno. O Diário entra só em
> **`assistenciaNavItems(alunoId)`**, que recebe `alunoId` (não `basePath`)
> de propósito — a assinatura torna impossível chamá-la com `""`. Use
> `assistenciaNavItems` em toda página nova sob `admin/aluno/[alunoId]/**`.

#### Fase 2 — log de ações do aluno (2026-09-08)

Segunda voz da mesma tela: a Fase 1 é a **equipe** escrevendo; a Fase 2 é o
**sistema** registrando o que o aluno faz no portal (cadastrar cliente, mudar
status, concluir tarefa, primeiro acesso). As duas se fundem numa **trilha
única**, agrupada por dia local, com a mesma trava LGPD (só admin).

**Banco** — `gps.aluno_eventos` (migrations `20260909000001..09`, todas
aplicadas): append-only de verdade (RLS com **uma** policy de SELECT para
`gp_is_admin()`, **nenhuma** de insert/update/delete — a única escrita é por
trigger `SECURITY DEFINER`), `grant select` só para `authenticated`, zero para
`anon`.

> 🔑 **UMA tabela de MICRO-evento. A MACRO ("Listou 15 clientes") nasce por
> AGREGAÇÃO NA LEITURA**, em `src/lib/log-agregacao.ts` (`montarTrilha`) —
> não é linha no banco nem `evento_pai_id`. Gravar a macro exigiria decidir o
> corte (fim do dia? da sessão?) **na hora da escrita**, quando ainda não se
> sabe se o aluno vai listar mais 5 depois. A leitura é o único momento em que
> o corte é conhecido.

> 🔑 **Último acesso é ESTADO** (vem de `gps.admin_status_acesso`) e mora só no
> `TrilhaCabecalho`, nunca como linha na trilha. **Primeiro acesso é EVENTO**
> e aparece nos dois lugares — não é duplicação, são duas visões do mesmo fato.

**Honestidade da tela** (o que o orquestrador reprovou até ser corrigido):
- O rodapé mostra a data do evento mais antigo com `origem='backfill'` e diz que
  antes disso só a data de cadastro foi preservada. Não fingir log que não existe.
- `getEventosDoAluno` tem teto de 300 e devolve `{ eventos, truncado }` — quando
  corta, a UI avisa. Sem isso o rodapé afirmaria uma cobertura que a lista não tem.
- A janela (30/90/tudo) vale para as **três** fontes (eventos, notas, ações
  administrativas). Só as **pendências abertas** ficam de fora, sem janela e sem
  teto — regra herdada da Fase 1: pendência antiga nunca pode ficar sem botão de
  baixa. A UI diz que aquela seção ignora o filtro.
- `getMarcosDeTrilha` é query separada de propósito: se o primeiro acesso e o
  corte de backfill saíssem da lista já filtrada por `desde`, escolher "30 dias"
  apagaria o marco da tela e mentiria.

**Índices (planos medidos, protocolo de sustentabilidade):**
- `idx_aluno_eventos_timeline (aluno_id, ocorrido_em desc)` — a query da trilha
  vira Index Cond nas **duas** condições, zero filtro residual.
- `idx_aluno_eventos_backfill_corte (aluno_id, ocorrido_em) where origem='backfill'`
  — ⚠️ sem ele, o aluno que entrou **depois** do backfill não tem nenhuma linha
  que satisfaça, e o planner varria **todo** o histórico dele só para concluir
  "vazio" (medido: `Rows Removed by Filter: 114`), crescendo sem teto pela vida
  do aluno.
- `idx_acessos_log_aluno (aluno_id, criado_em desc)` — `gps.acessos_log` só tinha
  a PK; era `Seq Scan` + `Sort` na tabela inteira de auditoria a cada abertura da
  aba. Tabela append-only lida por um aluno: sem índice, o custo por leitura
  cresceria com o total do sistema, não com o histórico lido.

**Triggers de captura** (`gps.etapa1_clientes`, `gps.progresso`): rodam no
caminho de escrita do **aluno**. Corpo inteiro envolto em `begin/exception when
others then null` (migration `...008`) — falha imprevista no log jamais aborta o
salvamento da ficha. Pior caso é lacuna na trilha, nunca aluno impedido de usar
o produto. `left(rotulo, 300)` pelo mesmo motivo: o CHECK é 1..300 e
`etapa1_clientes.nome` é `text` sem limite.

✅ **`primeiro_acesso` — job diário agendado e ativo** (09/09/2026):
`gps-diario-primeiro-acesso`, `cron.job`, roda `0 9 * * *` (09:00 UTC =
06:00 em São Paulo). Ver `ATIVAR-DIARIO-EVENTOS.md` para conferir/desligar.

### 🔑 Senha do aluno — trocar pelo próprio portal (2026-09-08)

`/auth/redefinir` existe desde sempre, mas **só era alcançável pelo link do
e-mail de recuperação** — quem entrava com senha temporária definida pelo admin
(`admin_definir_senha` / `admin_adotar_login_existente`) ficava com ela para
sempre, sem caminho na interface. Card **"Trocar senha"**
(`src/components/perfil/trocar-senha.tsx`) em `/perfil`, usando
`supabase.auth.updateUser` sobre a sessão ativa (não depende de token).

⚠️ A senha vale para **todos os portais do grupo** — `auth.users` é compartilhado.
O card avisa isso em texto.

### ⚠️ `gps.admin_adotar_login_existente` — o caminho do login preexistente

O GPS provisiona login por `signUp`, que **falha se o e-mail já existe** em
`auth.users`. Como o `auth.users` é compartilhado por 7 sistemas do grupo, o
aluno que já tem conta (Workbook, Rede, Central…) **não conseguia entrar**: o
gatilho `on_auth_user_created_gps` só roda em INSERT, então o login preexistente
nunca virava `gps.membros` sozinho. `gps.admin_adotar_login_existente` é a saída
oficial — adota a conta, cria membro/ambiente e marca `origem='gps'`.

> 🔴 Ela esteve **QUEBRADA de 25/08 a 08/09** e ninguém percebeu: `42883 operator
> does not exist: text ->> unknown`. Causa: **precedência de operadores** — `||`
> e `->>` têm a mesma precedência e associam à esquerda, então
> `'txt ' || v_direito->>'motivo'` virava `('txt ' || v_direito) ->> 'motivo'`.
> Faltavam parênteses. Passou despercebido porque o `insert` no log é o **último
> passo**: tudo antes executava e revertia junto, e de fora parecia que o botão
> simplesmente não fazia nada. Corrigida na migration `20260909000020`, que
> também traz a função para o controle de versão (ela tinha sido criada direto
> no banco, sem migration).

⚠️ **Adotar o login troca a senha do outro sistema** e derruba as sessões dele.
Avisar a pessoa sempre.

### 🎧 Plantão de Dúvidas — Acelera Holding (2026-09-01)

> ⚠️ **NÃO é o agendamento de reunião com a equipe**, que continua REMOVIDO (ver a seção
> logo abaixo). As tabelas `gps.reuniao_*` seguem órfãs e **proibidas**. Plantão é outra
> coisa: **mentoria coletiva** de outro produto (Acelera Holding), com mentora nomeada,
> sala de Zoom e aluno **sem login no GPS**.

**Rota pública `/p/plantao`**, embedada em iframe na área de membros da Hotmart
(**`https://hm.nivelouro.com.br/acelera-holding`** — domínio próprio do Club, não
`*.hotmart.com`). Calendário **mensal**; 3 mentoras (Isabela, Elaine, Cristiane);
**1 inscrição ativa por vez**, que encerra sozinha quando `inicio_em` passa; **sem limite
de vagas**; botão revela o link do Zoom **de 1h antes a 1h depois** e isso **registra
presença**; NPS depois da sessão.

**Regras de prazo (do calendário oficial do Acelera):**
- **Inscrição até as 12:00 do dia ANTERIOR** (cut-off, fuso America/Sao_Paulo).
  Antes dava para entrar até o minuto do início — e o aviso de véspera da
  mentora sai de manhã, então a lista dela podia crescer depois de enviada.
- **O e-mail ao aluno sai 1 HORA ANTES**, já com o link da sala — e é o
  ÚNICO e-mail. Inscrever-se não dispara nada. O e-mail no ato não podia
  levar o link (revelar grava presença), então era aviso sem ação.
- **A partir daí o cancelamento TRAVA**: link liberado = vaga consumida.
  🔑 Só trava se o slot TIVER `zoom_url` — sem sala não houve liberação, e o
  aluno não perde o direito de cancelar por pendência da equipe. As duas
  regras dependem da MESMA condição de propósito.
- **Sessões de 120 min** (o sistema usava 60 até 08/09).

### ⚠️ `/p/plantao` virou rota PÚBLICA sem login (2026-09-08)

**Mudança de arquitetura.** O modelo anterior (identidade própria com senha,
cookie de sessão, sonda de cookie de terceiro para CHIPS/Safari) foi
**substituído**: qualquer um abre `/p/plantao` e vê o calendário; para se
inscrever, só informa **nome + e-mail** (`?e=<email>&n=<nome>` na URL, nunca
cookie/token/senha) — o servidor confere o e-mail contra a base de
compradores do Acelera **dentro de `inscrever()`**, na hora do clique. Sem
essa confirmação no e-mail informado, a inscrição não vai adiante.

**Removidos por completo (537 linhas):** `src/app/p/plantao/sonda/route.ts`
(sonda de cookie de terceiro), `src/components/plantao/acesso-bloqueado.tsx`
(guarda de CHIPS/Safari), `plantao-login.tsx`, `trocar-senha-plantao.tsx`.
Não há mais `SessaoPlantao`, cookie `gps_plantao_sessao` nem
`plantao_sessoes` no caminho da UI.

**Novo componente:** `src/components/plantao/identificacao-form.tsx` (client,
nome + e-mail, navega para `?e=&n=`). `page.tsx` continua Server Component,
lendo `searchParams` (`m`, `e`, `n`); sem e-mail mostra o formulário; com
e-mail mas sem nome (link salvo antes de identificar) pede o nome de novo
sem esconder a inscrição já existente; com os dois mostra "Inscrevendo como
{nome}". `InscricaoPainel`/`MinhaInscricaoCard`/`NpsForm` recebem `email`
por prop em vez de ler sessão.

**Cancelamento tem prazo, avisado ANTES de inscrever:** a partir de 1h antes
do início (mesmo instante em que a sala libera e `janelaAberta` vira true),
`cancelar()` deixa de funcionar. `InscricaoPainel` mostra o aviso do prazo
acima da lista de slots; `MinhaInscricaoCard` troca o botão "Cancelar
inscrição" por um texto ("o prazo para cancelar terminou") quando
`janelaAberta` é true — não deixa a pessoa descobrir só no clique.

**Aba do admin renomeada "Acessos" → "Alunos"**
(`src/components/admin/plantao-acessos.tsx`): saíram as colunas "tem
senha"/"último acesso" e o botão "Limpar senha" (não existe mais senha).
Entrou a coluna **bloqueio por programa**, mostrando
`bloqueadoPorPrograma`/`bloqueioExcecao` — hoje 20 pessoas perderam o
Plantão por terem migrado para o Programa de Implementação e isso não
aparecia em NENHUMA tela, só por SQL direto no banco.
✅ **Contrato resolvido:** `AlunoPlantaoAdmin` (`src/lib/plantao-tipos.ts`) já
declara `bloqueadoPorPrograma`/`bloqueioExcecao` no tipo oficial e
`getAlunosPlantao()` (`src/lib/plantao-data.ts`) já popula os dois campos —
não existe mais tipo local `AlunoPlantaoAdminComBloqueio` nem cast em
`admin/plantao/page.tsx`.

⚠️ **Identidade PRÓPRIA superada:** a ideia original (`gps.plantao_alunos` +
`plantao_acessos` com bcrypt) tinha como efeito colateral bloquear qualquer
outra rota via `proxy.ts` por falta de sessão Supabase — isso **não existe
mais**: a rota é pública de verdade agora, sem sessão nenhuma envolvida.

**Acesso ao banco:** `anon` **não tem GRANT em nenhuma** das tabelas
`plantao_*`. Tudo passa por RPC `security definer` (`revoke from public`
**antes** do `grant to anon`) — antídoto explícito ao incidente CNHF, onde o
GRANT passou antes do RLS. Continua valendo com o novo modelo público.

**Headers de frame (limpeza que a feature trouxe):** o portal **não tinha**
`X-Frame-Options` nem CSP — qualquer site podia embedar o `/login`. Agora
`/p/*` tem `frame-ancestors` com allowlist e **todo o resto** tem `DENY` +
`frame-ancestors 'none'`.

**Arquivos:** `src/lib/plantao{,-tipos,-data,-carga}.ts`,
`src/lib/email-plantao.ts`; `src/app/p/**`, `src/app/admin/plantao/**`,
`src/app/api/plantao/manutencao/route.ts`; `src/components/plantao/**`,
`src/components/admin/plantao-*`.

**Job DE HORA EM HORA** (`/api/plantao/manutencao`, `pg_cron` com `'0 * * * *'`):
envia NPS pendente, **avisa a mentora na véspera**, **manda o e-mail com o link da
sala 1h antes**, **reconcilia a elegibilidade** (quem entrou no Programa perde o
Plantão) e expurga eventos com mais de 90 dias.
🔴 **De hora em hora, não 1×/dia:** a janela do e-mail da sala é de 1 HORA. Com cron
diário, só os plantões que começam na hora seguinte à execução receberiam e-mail.
⚠️ **Exige `PLANTAO_MANUTENCAO_SEGREDO` (mín. 16 chars) na Hostinger E o mesmo valor no
banco** (`alter role authenticator set app.plantao_manutencao_segredo = '...'`). A guarda
**falha fechado**: sem o segredo, as RPCs de manutenção recusam tudo com 42501. Isso é proposital —
a versão anterior comparava com `current_setting(...,true)`, que devolve NULL quando não
configurado, fazendo o `if` não disparar e o **DELETE em massa executar para qualquer
chamada anônima**.

### 🔑 Elegibilidade: o Plantão é do Acelera (2026-09-08)

O Plantão pertence ao **Acelera Holding**, produto separado do **Programa de
Implementação Assistida** (o GPS). Quem migrou para o Programa **não
participa**. São **20 de 422** — as pessoas que estão nas duas bases.

⚠️ **Inclusive quem pagou o Programa cheio.** A regra literal distinguia quem
teve o desconto de ~R$ 1 mil (o valor do Acelera) de quem não teve — mas esse
dado **não existe de forma utilizável**: não está em `cs.vw_gps_acessos`, e
`cs.contatos_hm` (que tem `valor_pago`) não liga por e-mail. Decisão tomada
com o custo na mesa, entre 3 opções.

`plantao_alunos.bloqueado_por_programa` + `bloqueio_excecao`:
- o admin **vê** quem perdeu, na aba **Alunos** de `/admin/plantao`;
- reverter uma pessoa é um `update`, **sem deploy**;
- `bloqueio_excecao = true` impede o job noturno de rebloquear — sem ela, o
  desbloqueio manual duraria até a madrugada seguinte.

🔴 **Casar por E-MAIL, nunca por documento.** Além do CPF que multiplica (caso
Eder Fagundes), o documento pode ser **CNPJ de empresa com DUAS PESSOAS
diferentes**: Marisa Tiedt (Acelera) e Gilton Silva (Programa) dividem o CNPJ
da GPS Contadores. Por documento a Marisa seria bloqueada indevidamente.

⚠️ **O sistema NÃO explica ao bloqueado por que ele não entra** — a recusa usa
a mesma mensagem de qualquer outra falha, senão qualquer um descobriria quem
comprou o quê testando e-mails. **Alguém tem que avisar por fora.**

**Lição de fuso incorporada:** `plantao_slots.inicio_em` é coluna **gerada**
(`(data + hora_inicio) at time zone 'America/Sao_Paulo'`). Toda comparação com `now()` usa
ela, nunca `data` isolada — que mentiria o prazo das 21h à meia-noite.

### 📋 As 9 features do Marcio — o que entrou em 2026-09-08 (Fases 1–4 e 8)

Plano em `PLANO-9-FEATURES.md` (raiz). Ordem por esforço × risco. Entregue nesta sessão:

- **Senha com olho em todo o portal** — `src/components/ui/input-senha.tsx` é o ÚNICO campo
  de senha (login, redefinir, perfil, "Nova senha do titular" em Gerenciar acesso, que era
  texto puro). `rg 'type="password"' src` tem de continuar vazio.
- **Busca/ordenação/filtros no painel** (`alunos-ativos-lista.tsx`, tudo em memória): busca
  sem acento (`src/lib/texto.ts`), ordenar por nome/progresso/clientes/tempo de casa/último
  acesso, filtros "Já listou os 30" e "Sem acessar há 30+ dias". `null` = "nunca entrou".
- **`gps.admin_painel_alunos()`** (migrações ...050/...061): o painel virou UMA RPC agregada
  (SECURITY DEFINER, `gp_is_admin()` ou 42501) + o select de `thb_alunos`. Antes trazia as
  879 linhas inteiras de `etapa1_clientes` para contar no Node. Medido: 125 linhas, 7,7 ms.
  `ultimo_acesso` vem de `auth.users.last_sign_in_at` — **nunca** de `gps.acessos_log`,
  que é log de ação administrativa. `agendados` conta por EVIDÊNCIA
  (`data_reuniao_preliminar`/`aderiu_reuniao`), não por status nem por fase.
- **Copy sequencial** (Etapa 01): passos 2 e 3 (mensagem padrão e estudo de caso) só abrem
  com a tarefa 1 concluída (`exigeTarefa: 1` em `src/lib/etapa1.ts`). **Trava de UI**:
  `marcarTarefa` continua aceitando qualquer tarefa. Medido em 08/09: só 5 de 63 ambientes
  com cliente cumprem 30 com dados — a trava fecha a copy para quase todos, e é literal ao
  pedido do Marcio (levar o número a ele). Escape: apagar `exigeTarefa` nas duas tarefas.
- **Pré-visualizar como o aluno vê** (`src/components/admin/previa-aluno.tsx`): botão no
  Modo Assistência que só ESCONDE elementos só-admin via `html[data-previa="aluno"]
  .previa-oculta` (CSS). `ehAdmin()` intocado; a pílula diz que o admin continua admin e que
  editar salva na conta do aluno. Aba Diário some (`adminOnly` em `assistenciaNavItems`).
- **Cliente tem FASE, não status** (migrações ...060/...061/...062): `fase` ∈
  prospeccao | fechamento | contratado (CHECK). Backfill por evidência, não de-para por
  status (22 "pendente" já tinham reunião): prospeccao 842 · fechamento 37 · contratado 0.
  `status` **continua na tabela, CONGELADO** (trigger `trg_etapa1_clientes_status_congelado`
  recusa com 42501; `PatchCliente` filtra por allowlist em runtime) — é o caminho de volta:
  `drop column fase` restaura sem restore. A trigger do diário audita `fase`
  (`cliente_fase_mudou`, detalhe {de,para}); `cliente_status_mudou` fica para o histórico.
  UI: `FASES_CLIENTE` (`STATUS_CLIENTE` não existe mais), quadro de 3 colunas, marcador
  "Recusou" só enquanto `status='recusou'` existir (1 linha). **Não remover `status` sem
  decidir onde "recusou" mora** — as 3 fases não têm lugar para recusa (C7 do plano).
- **Plantão com autonomia da equipe** (migração ...070): `cancelarSlot` (despublica, cancela
  inscrições, e-mail aos inscritos com o motivo), interruptor de inscrições na tela
  (`gps.plantao_config.inscricao_aberta` é a fonte de `plantao_escrita_liberada()`; o
  setting `app.plantao_inscricao_aberta` virou fallback), `trocarMentoraSlot`/`editarSlot`
  zeram `aviso_mentora_em` quando a mentora muda, publicar recusa mentora sem e-mail,
  criar com "repetir semanalmente por N semanas" (0–12).

**Fora deste ciclo (dependiam do Marcio):** notas por aluno (B2), ticket com anexo (B5/B6),
financeiro (B7–B9), feature 1 (sócio — já existe). **B2 e B5–B9 foram decididos em 09/09**
por caminho conservador e reversível, e as Fases 5, 6 e 7 entraram — ver a seção abaixo e
`PLANO-9-FEATURES.md`.

### 🧽 Polimento geral + Fases 5, 6 e 7 (2026-09-09)

Madrugada de 09/09, commits `f9a763a..cb8fbdd` (13). Duas frentes intercaladas: o **polimento
do sistema inteiro** (plano em `tmp/squad/polimento.md`) e as **Fases 5, 6 e 7** das 9 features
(plano em `tmp/squad/fases-5-6-7.md`, com B2 e B5–B9 decididos por caminho conservador e
reversível). Nenhuma dependência nova; nas partes de polimento o saldo de código é negativo.

#### (a) Design system mínimo — `src/components/ui/`

**O quê:** `PageHeader`, `EmptyState`, `KpiCard`/`KpiLinha`/`IconeChip`, `ListaSkeleton`,
`ErroPainel`. **Por quê:** o cabeçalho de página estava escrito à mão **17 vezes** (com `mt-2`
em 5 e não nas outras 12), o "chip de ícone" existia em **4 cópias e 2 tamanhos**, e o
`pt-5`/`pt-6` colado no `CardContent` **somava** ao `py-(--card-spacing)` que o `Card` já paga —
cards com topo de 16, 36 e 40 px na mesma tela. `ui/skeleton.tsx` existia com **0 usos**.
Commits `4631b59` (componentes + `loading.tsx` + `role="alert"` + skip link), `fff250f`
(`PageHeader` nas 17 páginas), `44a0495` (contraste), `c49ded9` (telas de erro).

**Regras que valem daqui para frente:**
- Toda página nova usa `PageHeader` e envolve o conteúdo em **`<main id="conteudo">`** — é o
  alvo do skip link "Pular para o conteúdo" do root layout. Sem ele o skip link não leva a
  lugar nenhum.
- **Contraste:** `text-primary` (#FF6300) dá **2,98:1** sobre fundo claro e reprova o WCAG 1.4.3
  como texto. Texto, número, rótulo e link usam **`text-accent-foreground`** (#B04300, 5,76:1) —
  34 ocorrências trocadas. `text-primary` fica **só decorativo** (ícone, chip só-ícone). Link
  inline leva `underline-offset-4 hover:underline`, para não depender só de cor.
- **Não existe tema escuro.** O bloco `.dark` (30 tokens que nada ativava) saiu do `globals.css`
  e o `next-themes` saiu do `package.json`. Escrever `dark:` hoje é escrever CSS morto.
- Erro de formulário leva `role="alert"` (os 4 formulários de entrada não anunciavam a falha).
- `NavTabs` é renderizado **uma vez**, rolando na horizontal no celular — não dois DOMs.
- Estado "bloqueado" se diz por **forma** (borda tracejada, chip neutro), nunca por `opacity`
  no card inteiro, e a microcopy não promete data que `gps.etapas` não tem.

**Carregamento e erro:** `loading.tsx` nas rotas pesadas (`/`, `/clientes`, `/etapa/[etapa]`,
`/admin`, `/admin/aluno/[alunoId]`, `.../diario`, `/financeiro`, `/chamados`, `/chamados/[id]`,
`/admin/chamados`) — título estático + esqueleto com a altura real do card, **nunca spinner
centralizado**. `global-error.tsx` faltava: falha no root layout caía na tela crua do Next; ele
emite o próprio `<html>/<body>` com CSS embutido e fonte do sistema, porque o layout que carrega
Tailwind e `next/font` é justamente o que quebrou. A tela de erro mostra **`error.digest`**
("Código: …") — o único fio entre a queixa do aluno e a linha do log; **`error.message` continua
fora**. Boundaries de segmento em `/clientes` e no diário, sobre o `ErroPainel`.

#### (b) Sessão memoizada, redirect fechado e headers (`f9a763a`)

- `getContextoSessao()`/`ehAdmin()` viraram **memoizados por requisição** com `cache()` do
  `react`. A página do Diário fazia **7 `auth.getUser()` + 7 `select perfis` por render**
  (~57 ms por ida ao GoTrue em sa-east-1); medido depois: 13 chamadas às duas funções num render
  RSC disparam **1** `getUser`. ⚠️ **Nunca trocar por `getSession()`** — ele não valida o JWT no
  servidor; seria trocar latência por buraco de auth. `rg "getSession\(" src` tem de continuar 0.
- **`destinoInterno()` (`src/lib/nav.ts`) é o único validador de `?redirect=`**, usado na página
  e na action. Era open redirect explorável: `destino.startsWith("/")` aceitava `//evil.com` e
  `/\evil.com`. Agora `//evil.com`, `/\evil.com`, `/%2f`, `/%5c` e esquemas viram `"/"` (29 casos
  testados). Toda leitura nova de destino passa por ela.
- `next.config.ts`: `X-Content-Type-Options: nosniff`, `Strict-Transport-Security` e
  `Permissions-Policy` em todas as rotas, e **`poweredByHeader: false`**. Os `frame-ancestors`
  do `/p/*` ficaram **intactos**.
- Saíram: `src/app/agenda/` inteira (128 linhas órfãs — pasta só com `actions.ts`, sem
  `page.tsx`, mas com **Server Actions compiladas e expostas**), `getAgenda`,
  `getAgendaDeTodos`, `contarSolicitacoesPendentes`, `AgendaItem`/`AgendaItemComAluno`, e a rota
  `/admin/solicitacoes` (virou entrada em `redirects()`). O N+1 do painel virou uma query
  `.in()`. A tabela `agenda` continua de pé no banco, órfã — mesma regra das `gps.reuniao_*`:
  remove-se o caminho de código, não o histórico.

#### (c) Colunas explícitas e painel paginado (`6c1d446`)

- **`src/lib/data.ts` não tem mais `select("*")`.** Os 10 viraram constantes `COLUNAS_*` por
  tabela (`COLUNAS_CLIENTE` cobre os 20 campos de `ClienteEtapa1`, incluindo `fase`,
  `valor_honorarios`, `contrato_url` e o `status` congelado do marcador "Recusou"). Motivo: o
  egress do Supabase é teto **da organização**, dividido com o `sip`. **Query nova em `data.ts`
  declara colunas.**
- `gps.admin_painel_alunos` ganhou **`p_limite`** (default 200, faixa [1,1000]) e **`p_offset`**,
  com **`total_ambientes`** em toda linha; a versão sem parâmetros foi **dropada** (sobrecarga =
  1, conferido — sobrecarga ambígua já quebrou em runtime nos sistemas do João). Ordem com
  desempate por `aluno_id`. Provado no banco: 3 lotes de 50 somam 125 = 125 distintos = 125 do
  universo.
- **Leitura A** do bloqueio de paginação: "Mostrar mais N" via `?mais=` (o lote mora na URL) e
  rodapé honesto — *"Mostrando X de Y carregados · Z no programa; busca e filtros valem só sobre
  os carregados"*. **Regra: busca e filtro do painel são em memória sobre o lote.** Se a base
  crescer a ponto de o admin não achar quem procura, a saída é a Leitura B (busca no servidor),
  que é feature, não ajuste.

#### (d) Baseline do schema, log sem PII e segredo em tempo constante (`edae452`)

- **`supabase/migrations/00000000000000_gps_baseline.sql` é um RETRATO do schema e NÃO se
  aplica.** O núcleo do `gps` (15 tabelas, 48 policies, 3 funções, grants — inclusive o grant
  **por coluna** de `gps.membros`) nasceu direto no banco; foi assim que
  `admin_adotar_login_existente` viveu 15 dias quebrada. O arquivo foi extraído do banco real em
  09/09 (`pg_attribute`/`pg_constraint`/`pg_policy`/grants), é idempotente e deixa **de fora** o
  que migrations posteriores criam (`fase`, honorários, triggers do diário), para uma
  reconstrução do zero não abortar. **Nenhum índice novo:** os que o plano cogitava já existiam.
- **`src/lib/log.ts` (`logErro`) substitui `console.error`**: uma linha JSON com
  `code`/`message`/`details`/`hint` e **redação de e-mail e dígitos**. Erro de servidor novo vai
  por ele.
- Segredo do `/api/plantao/manutencao` comparado com **`timingSafeEqual` sobre SHA-256** (tamanho
  fixo), no lugar de `!==`.
- O `eslint` passa a ignorar `server.js` (CommonJS do Passenger), `.agents` e `tmp` — `npm run
  lint` voltou a ficar verde na `main`.

#### (e) Fase 5 — o Diário descoberto (B2) (`1c0b253`)

**B2 decidido: não existe tela de notas para o aluno.** A migração `20260908000001` proíbe **em
texto** expor `gps.aluno_notas` ao aluno (PII de terceiro no texto livre). O pedido do Marcio
("notas de status por aluno, histórico com data, nota nova no topo") já estava entregue — o
defeito era ele não saber que existe. A Fase 5 é **descoberta e velocidade**, não tela nova.

- **`gps.admin_painel_atendimento()`** (SECURITY INVOKER — a RLS só-admin continua a fonte de
  verdade) devolve por aluno as pendências abertas e a **última nota cortada em 140 caracteres
  no banco** (B2-b: a lista nunca carrega o texto inteiro). **Substitui
  `getPendenciasPorAluno`**, que agregava em JavaScript.
- No painel: linha da última nota em cada card, botão **"Nota rápida"** que abre o `DiarioForm`
  embutido sem sair da lista (o foco volta ao botão), filtros "com nota nos últimos 7 dias" /
  "sem nenhuma nota" e ordenação por nota recente. **O aluno nunca vê nada disso** (rota
  `/admin`).
- Conferido no banco: 22 alunos com nota, `max(resumo) = 140`, **zero escrita** em
  `gps.aluno_notas`.
- Junto: `SelectValue` mostrava o valor cru em vez do rótulo (Base UI) e o foco do link do card
  era invisível sob `overflow-hidden`.

#### (f) Fase 7-A — aba Financeiro (B7) (`184487f`)

Rotas `/financeiro` (aluno) e `/admin/aluno/[id]/financeiro`.

- **`gps.financeiro_do_aluno(uuid)`** (SECURITY DEFINER, `search_path` vazio, `revoke` antes do
  `grant`) lê **`cs.contatos_hm`** — dado do `sip`, **só leitura**, e a tela diz de onde vem e
  que não é editável ali. Devolve uma linha por contrato: total, pago, saldo.
- **Guarda: admin OU titular do ambiente** na mesma linha de `gps.membros`. Provado no banco:
  sem JWT 42501, titular lê, **sócio do mesmo ambiente 42501**.
- 🔴 **B7-b: o SÓCIO NÃO VÊ o financeiro.** `alunoNavItems(basePath, { financeiro })` passou a
  exigir a flag — a aba não aparece para ele e a página redireciona se ele digitar a URL. São
  **13 sócios em 13 ambientes**: o contrato é do titular, o sócio nunca assinou. Abrir depois é
  apagar o `exists (… papel='titular')` da guarda; ter mostrado a dívida de alguém não se desfaz.
- **B7: 31 de 125 ambientes não têm registro** e veem *"Financeiro não disponível para este
  cadastro"* — a aba **fica visível** de propósito, senão a lacuna de cadastro no `sip` ficaria
  invisível para sempre; o admin vê o diagnóstico ("nenhum registro em `cs.contatos_hm`"). Os 2
  alunos de produto **AURUM** levam aviso.
- 🔴 **B7-c: `credito_valor_pago` e `cancelamento_valor` nunca entram na aritmética** — aparecem
  como linha própria, rotulada. A semântica dos dois é do `sip` e não está provada aqui; somar
  sem saber o sinal produz número plausível e errado.
- 🔴 **B7-d: saldo desconhecido é `null` e a tela diz "não informado" — nunca R$ 0,00.**
  `coalesce(total - pago, 0)` transformaria buraco em número.
- `src/lib/financeiro.ts` concentra os derivados num lugar só: pago 15.000,04 de 15.000 vira
  **"Quitado, R$ 0,00"** (tolerância de centavos), não "-R$ 0,04".

#### (g) Fase 7-B — honorários e meta de R$ 150.000 (B8/B9) (`845f79d`)

- `gps.etapa1_clientes` ganhou **`valor_honorarios`** (numeric ≥ 0) e **`contrato_url`** (https —
  **LINK do Drive, não upload**; documento do cliente segue fora do GPS). **Zero backfill:** as
  879 linhas nascem `NULL` e a UI **nunca** mostra `NULL` como R$ 0,00.
- **B8: meta = R$ 150.000**, somando `valor_honorarios` dos clientes em `fase='contratado'` **do
  ambiente**, **programa inteiro**, valor **contratado** (não recebido) — não existe coluna de
  competência em `etapa1_clientes` que sustentasse recorte por ano ou turma. A regra vive em **um
  lugar só**: `resumoHonorarios` (`src/lib/etapa1.ts`) e a RPC do painel
  (`honorarios_contratados`/`contratados`/`contratados_sem_valor`, migração `…091`). Aparece na
  home, na aba Clientes e no painel do admin.
- 🔴 **B9-b: sem CHECK ligando o valor à fase.** Voltar de fase **não apaga** o valor, só o tira
  da meta (a ficha o mostra em somente-leitura, com aviso). Constraint de coerência viraria
  catraca: mover o cliente de volta falharia até alguém apagar o valor — e apagar dado por
  mudança de estado é perda silenciosa.
- **B9:** honorário é um **número que o próprio aluno digita sobre o cliente dele** — não é
  família do Diário (que é texto da equipe **sobre o aluno**, com PII de terceiro). É visível e
  editável pelo aluno, e visível ao admin.
- O diário audita `valor_honorarios` (**evento `cliente_honorarios_definidos`**, detalhe
  `{de,para}`, migração `…092`); **`contrato_url` não é auditado**. `PatchCliente` e a allowlist
  em runtime ganharam os dois campos, com validação em português antes do CHECK.
- Provado em transação com rollback: evento gravado, painel soma 1234.56 / 1 / 0, `aluno_eventos`
  volta a 1.443.

#### (h) Fase 6 — Suporte por chamados (B5/B6) (`cb8fbdd`)

Rotas `/chamados` e `/chamados/[id]` (aluno), `/admin/chamados` e `/admin/chamados/[id]`
(equipe), `/admin/aluno/[id]/chamados` (modo assistência).

- **Não substitui e-mail nenhum:** medido `rg -in "suporte|mailto|contato@" src/` → **zero**
  ocorrências. Não havia canal de suporte na UI. A copy correta é **"Fale com a equipe por
  aqui"** — nunca "no lugar do e-mail".
- **`gps.chamados` + `gps.chamado_mensagens`, append-only:** só RPC escreve, `authenticated` só
  lê, `anon` não tem nada. O **papel do autor é derivado no servidor**. Tetos: 5 abertos por
  ambiente, 20 mensagens por chamado, reabrir em até 7 dias, e-mail só quando o **status muda**.
- **Anexo:** bucket **NOVO `gps-chamados`** (privado, 5 MB, `png/jpeg/webp/pdf`), path
  `<aluno_id>/<uuid>.<ext>`, policies por prefixo; tamanho e MIME conferidos em
  `storage.objects.metadata` pela RPC. Bucket novo em vez do `gps-documentos` órfão, que está
  sem limite de tamanho e sem allowlist de MIME. 🔴 **B5-c: só o ALUNO anexa** — a equipe
  responde com **texto e link** (ela já tem o Drive). Reverter é acrescentar
  `or public.gp_is_admin()` em `gps.pode_anexar_chamado`.
- 🔑 **Regra: anexo de chamado ≠ documento do cliente.** O anexo é **prova de um problema do
  portal** (print de erro, comprovante), efêmero e com expurgo. Contrato, RG e matrícula
  continuam **só no Drive** — a decisão de 07/2026 segue de pé e a UI diz isso em texto.
- **B6 — retenção de 180 dias** após o fechamento, com **expurgo por clique do admin**, não
  `pg_cron`. Motivo: apagar a linha de `storage.objects` por SQL **não apaga o byte** no object
  store — um cron SQL reportaria sucesso e deixaria o arquivo. O expurgo real exige a Storage
  API, que exige sessão, e o GPS **não usa `service_role`**: a sessão do admin no navegador é a
  única credencial legítima disponível.
- **`gps.config`** (`chamados_aberto` = interruptor que desliga a abertura **sem deploy**, no
  padrão do Plantão; `chamados_email_equipe` = destinatários do aviso) é editável pela equipe em
  `/admin/chamados`. O valor tem `check` de tamanho e **sem CR/LF** (injeção de cabeçalho de
  e-mail). ⚠️ **`chamados_email_equipe` está VAZIO hoje** — o fallback é a env `EMAIL_SUPORTE`;
  com as duas vazias o chamado é registrado e **ninguém é avisado** (`console.error` explícito +
  aviso em destaque na tela do admin).
- `admin_excluir_acesso` passou a apagar os chamados do ambiente; o painel de atendimento ganhou
  `chamados_abertos`.
- Provado com JWTs reais + `set role authenticated`, em transação com rollback: titular abre,
  sócio do ambiente lê, outro ambiente **não** lê, admin responde (`respondido` + e-mail ao
  aluno) e fecha; **0 chamados após o rollback**. Grants: `anon` sem nada; `authenticated` sem
  `insert`/`delete` (só RPC); bucket privado com 3 policies em `storage.objects`.

#### (i) Pendências para o João / Marcio

1. ✅ **`gps.senhas_bkp_20260810` — RESOLVIDA em 09/09.** Era a cópia de **hashes bcrypt de
   `auth.users`** feita em 10/08/2026, parada há um mês sem finalidade (RLS desligada, sem grant
   à API). O João autorizou e a migração `…119` **apagou a tabela**: 83 linhas, 71 delas ainda
   idênticas às senhas atuais. **Não é mais pendência** — ver "Rodada final de qualidade".
2. **B10** — a copy sequencial fecha a Etapa 01 para **58 de 63 ambientes**. É o pedido literal
   do Marcio; falta levar o número a ele.
3. **Ilan sem conta** — não existe em `auth.users`, logo não dá para promover a admin (Isabela e
   Cristiane já são admin, Elaine é dev).
4. **C7 — onde "recusou" mora.** As 3 fases não têm lugar para recusa; hoje é um marcador sobre o
   `status` congelado. **Não remover `status` sem decidir isso.**
5. **`frame-ancestors https://*.hotmart.com`** no `/p/plantao` libera **todo produtor da
   Hotmart** a embedar a página. Fechar às cegas tira 421 pessoas do ar — depende do ensaio do
   passo 5 do `ATIVAR-PLANTAO-AGORA.md` (abrir o Plantão dentro do iframe e ler o
   `document.referrer`).
6. **`chamados_email_equipe` vazio** — a equipe precisa preencher em `/admin/chamados`, ou o João
   define `EMAIL_SUPORTE` no painel da Hostinger. Enquanto isso, chamado novo não avisa ninguém.
7. **Validar as telas logado** (5 minutos; checklist completo na seção E de
   `tmp/squad/polimento.md`): (1) `/admin` → aluno → Diário tem de abrir visivelmente mais
   rápido; (2) navegar `/` → Clientes → Materiais em "Slow 3G" e ver **esqueleto**, não a tela
   anterior congelada; (3) trocar de aba 4 vezes — o espaço acima do título tem de ser o mesmo;
   (4) card de etapa bloqueada legível e com texto verdadeiro; (5) celular retrato: o header
   rola na horizontal com as 7 abas; (6) teclado no `/login`: o primeiro Tab oferece "Pular para
   o conteúdo" e o erro de senha é falado pelo leitor de tela; (7) painel cheio: rodapé
   "Mostrando X de Y" e "Mostrar mais" trazendo o resto.

**Pentest desta madrugada:** dois relatórios, ambos **APROVADOS** (0 crítico, 0 alto). Fases 5–7: 1 MÉDIO documentado (MIME de anexo vem do que o cliente declarou no PUT, não de inspeção de bytes — a trava real é `download=` em todo link; nunca servir anexo inline) e 1 BAIXO corrigido (equipe não anexa, agora imposto em `gps.chamado_gravar_mensagem`, migração ...116). Polimento: 1 MÉDIO corrigido (`gps.agenda`/`gps.reuniao_agendamentos` aceitavam escrita do dono pela REST — policies derrubadas e grants revogados, ...117, histórico preservado) e 1 BAIXO corrigido (`emailParaIlike` escapa `%`/`_`; `acharAlunoPorEmail` morta removida). Correções em `cd87aa5`.

### 🧭 Rodada final de qualidade (2026-09-09)

Depois das Fases 5–7 o arquiteto **caminhou pelo produto na ordem do usuário** (aluno → sócio →
admin) sobre `75b7138`, lendo página, componente e action de cada fluxo, e o orquestrador mediu o
repo (tamanho de arquivo, `knip`, duplicação, bundle). Saiu um plano em 4 ondas, executado em
`2c03325..f257f24` (8 commits). Material: `tmp/squad/rodada-final.md` (veredito, achados, o que
NÃO mudar, roteiro de validação) e `tmp/squad/inventario-qualidade.md` (as medições).

Diagnóstico em uma frase: o sistema já era honesto com o dado (`null` não vira zero, prévia não
vira sandbox), e o que restava eram **três famílias** — *a tela sabe mais do que mostra*, *ação
que apaga sem atrito* e *repetição que já cobrava preço*.

#### (a) Veredito por feature — e o que mudou nesta rodada

| # | Feature / fluxo | O que mudou nesta rodada |
|---|---|---|
| 1 | Login / cadastro / esqueci / redefinir | Nenhuma mudança de lógica. O "Esqueci minha senha" continua saindo pelo **SMTP embutido do Supabase** (pendência do João, F.5). Bundle: ver Onda 4 |
| 2 | Home do aluno | `proximoPasso` **não pode mais devolver tarefa travada**: recebe `temFavorito` (obrigatório), pula `exigeFavorito`/`exigeTarefa` não satisfeitos e, quando tudo está travado, devolve `bloqueio` legível — o card vira CTA de destravamento. O KPI passou a mostrar `comDados` (`2c03325`, `9aa9f06`) |
| 3 | Etapa 01 | Tarefa travada passa a dizer o estado **por forma**, não por opacidade. **B10 continua aberto** (a copy sequencial fecha a etapa para 58 de 63 ambientes) |
| 4 | Clientes | Excluir cliente e desfavoritar passam a pedir **confirmação nomeada com a consequência escrita**; "Abrir contrato no Drive" virou "Abrir contrato"; `error.message` cru saiu das actions (`9aa9f06`, `2c03325`) |
| 5 | Financeiro | `divergenciaQuitacao` passa a sair **nos dois sentidos** (FN1): saldo negativo acima da tolerância sem `quitado_em` deixou de virar "Quitado, R$ 0,00" invisível para o admin. O aluno continua vendo "Quitado" (`2c03325`) |
| 6 | Suporte por chamados | Chamado aberto vira **badge no card + filtro em `/admin` + contador na aba**, a partir do Map já carregado (**zero consulta nova**). `getChamadosConfig` devolve `fallbackEnv` (só o booleano de `EMAIL_SUPORTE`, nunca o endereço), então o aviso vermelho parou de mentir (`2c03325`, `9aa9f06`) |
| 7 | Materiais | Decisão F.1: material de etapa **não liberada vai para o cliente SEM `url`** — o corte é no servidor (`listarMateriais({ etapasLiberadas })`), não só no link. Admin e prévia passam `incluirBloqueados` (`2b250b0`) |
| 8 | Pasta (Drive) | Sem mudança de fluxo. `ESTRUTURA_PASTA` (código morto) foi removida |
| 9 | Perfil / trocar senha | Sem mudança de lógica |
| 10 | Etapas 2–6 bloqueadas | O vazamento pelo acervo foi fechado (item 7) |
| 11 | Sócio | Cada membro do ambiente ganhou **"Definir senha"** (`gps.admin_definir_senha_membro` + action `definirSenhaMembro`). Antes a única saída era remover e re-adicionar, o que **apagava o login do sócio** (`2d313a3`, `b9e55f2`) |
| 12 | Painel `/admin` | Badge/filtro de chamado aberto; "Recusar" solicitação ganhou o campo **"Motivo (o aluno vê)"**, que a action já aceitava e a tela do aluno já renderizava (`9aa9f06`) |
| 13 | Modo assistência | `assistenciaNavItems(alunoId, { ambienteCompartilhado })` esconde o Financeiro na prévia quando o ambiente tem sócio; o texto "GPS" saiu do toast (`2d313a3`, `9aa9f06`) |
| 14 | Diário (Fases 1+2) | **Nada.** É o fluxo mais bem construído do repo; está na lista do que não se mexe |
| 15 | `/admin/chamados` | "Fechar entrada do suporte" — o interruptor que fecha o canal para todos — passou a pedir confirmação (`9aa9f06`) |
| 16 | `/admin/plantao` | Duração padrão do slot **120** (formulário + `default` da coluna, migração `…121`); `gps.config` absorveu `plantao_config`; as actions foram cortadas por responsabilidade (`2d313a3`, `4228944`) |
| 17 | E-mails | Nenhuma mudança. O aviso de chamado novo continua **sem destinatário** enquanto `chamados_email_equipe` e `EMAIL_SUPORTE` estiverem vazios |

#### (b) Regras que passaram a valer (para todo código novo)

- 🔴 **Toda ação que apaga ou tranca pede confirmação nomeada, com a consequência escrita e botão
  com nome próprio.** O padrão do `DialogoCancelamento` do Plantão virou
  `src/components/ui/dialogo-confirmacao.tsx` — um lugar só para excluir cliente, remover sócio,
  desfavoritar, excluir ambiente e fechar a entrada do suporte.
- **`src/lib/moeda.ts` é o único formatador de dinheiro**: `brl`, `brlInteiro`, `brlCompacto`,
  `brlOuTraco`. Nove cópias de `Intl.NumberFormat` BRL foram substituídas, conferidas valor a
  valor. Não escrever `Intl.NumberFormat` novo.
- **`src/lib/datas.ts` é o único formatador de data**: `formatarData`, `formatarDataHora`,
  `formatarDataSoDia` e a constante `FUSO` (exportada; 17 literais `America/Sao_Paulo` saíram do
  código). `formatarDataSoDia` trata `date` sem fuso — `new Date` lia como meia-noite UTC e
  devolvia **um dia a menos**.
- **`src/lib/texto.ts` tem a única regex de e-mail do repo**: `emailValido` (a estrita, que barra
  injeção de cabeçalho) e `listaDeEmails`; `emailParaIlike` (que escapa `%`/`_`) mora ali também.
  Não criar `EMAIL_REGEX` local.
- **`src/lib/masks.ts:soDigitos`** é o único `.replace(/\D/g, "")`.
- **Erro de banco passa por `traduzirErroBanco` (`src/lib/erros.ts`)** — frase em português na
  tela, detalhe no `logErro`. **Nunca devolver `error.message` cru ao navegador.**
- **`gps.config` é a única tabela de configuração.** Absorveu a chave `plantao_inscricao_aberta`
  (valor vigente copiado); `plantao_escrita_liberada()` lê `config` → `plantao_config` (compat) →
  setting → ABERTO. **`gps.plantao_config` fica uma semana e sai numa migration futura.**
- **`src/lib/data.ts` é fachada fina.** As consultas vivem em
  `src/lib/data/{alunos,clientes,progresso,diario,solicitacoes}.ts` — **consulta nova nasce em
  `src/lib/data/<assunto>.ts`**, não no `data.ts`.
- **Actions do Plantão** estão em `slots-actions.ts`, `mentoras-actions.ts`, `alunos-actions.ts` e
  `config-actions.ts`. ⚠️ O `actions.ts` que sobrou é **barril, e NÃO leva `"use server"`**: com a
  diretiva o módulo sai do build com zero exports (`The export trocarMentoraSlot was not found`).
  Sem ela o import segue até o arquivo de origem, que é `"use server"`. O motivo está escrito no
  arquivo — não "consertar".
- **Componente grande vive em pasta com `index.tsx`**, e os importadores não mudam:
  `plantao-calendario/`, `clientes-manager/`, `alunos-ativos-lista/`, `gerenciar-acesso/`.
  **Componente cortado fica com `index.tsx` de até 400 linhas** (`gerenciar-acesso/painel.tsx` é
  o maior, com 410). ⚠️ Não vale para tudo: **`slots-actions.ts` (731 linhas) ficou inteiro de
  propósito** — são 7 actions da MESMA entidade (o slot do Plantão), e cortar por verbo
  espalharia `validarZoomUrl`/`somarDias`, que as sete usam, em dois arquivos ou num terceiro só
  para elas. Coesão ganha da métrica de linhas; o corte por linha é meio, não meta.
  As **funções puras saem do JSX** para `ordenacao.ts`
  (ordem e filtro de clientes e de alunos) e para `datas-da-serie.ts` — sem React, testáveis.
- **`navDoAluno(ctx)` (`src/lib/nav.ts`) é o único lugar da regra do sócio** (B7-b). Estava copiada
  em 9 `page.tsx`; hoje `rg 'papelMembro === "titular"' src/app` dá **0**.
- **`assistenciaNavItems(alunoId, { ambienteCompartilhado })`** — a prévia "como o aluno vê" tem de
  esconder o Financeiro quando o ambiente tem sócio.
- **`proximoPasso` nunca devolve tarefa travada** — devolve `bloqueio` para a UI virar CTA.
- **O KPI de clientes mostra `comDados`** (nome + telefone + nível), que é o que a tarefa 1 cobra;
  `preenchidos` vai como detalhe. Um número, uma verdade.
- **Material de etapa bloqueada vai para o cliente SEM `url`** — `MateriaisView` é client component
  e tudo que ela recebe está no payload inicial; o corte é no servidor.
- **`gps.admin_definir_senha_membro(membro_id, senha)` + `definirSenhaMembro`** é o caminho de senha
  por membro. Se a conta também tiver papel em **outro portal do grupo**, a action devolve
  `precisaConfirmar` + a lista de programas **sem alterar nada**, e a UI repete com
  `confirmarOutrosSistemas`.
- **Default de duração do slot do Plantão: 120 minutos** (formulário, fallback e `default` da coluna).
- ✅ **`gps.senhas_bkp_20260810` foi APAGADA** (migração `…119`, autorizada pelo João): 83 linhas de
  hash bcrypt, 71 ainda idênticas às senhas atuais. **Deixou de ser pendência.**
- As 4 RPCs que só existiam no banco entraram no repo em retrato (`admin_direito_ao_acesso`,
  `admin_excluir_membro`, `admin_programas_do_email`, `aluno_por_documento`);
  `aluno_por_documento` perdeu o `execute` de `PUBLIC`.

#### (c) Decisões do orquestrador sobre os bloqueios (F.1–F.6; o João autorizou seguir)

1. **F.1 — acervo × etapa bloqueada: leitura (a), o programa é sequencial.** O material de etapa
   bloqueada continua **listado**, com o badge "bloqueada" e **sem link ativo** ("libera com a
   etapa"). Reversível em uma linha.
2. **F.2 — UX7 (canal para quem não tem acesso): fica ABERTO.** Não existe e-mail nem WhatsApp no
   código (`rg "mailto|suporte@"` → 0) e não se inventa endereço. A copy segue "fale com a equipe";
   virou pendência do João.
3. **F.3 — senha do sócio: ENTROU.** `gps.admin_definir_senha_membro` espelhando
   `admin_definir_senha` (guardas `gp_is_admin()` + `admin_alvo_e_equipe`, o membro precisa ter
   `user_id`, log em `acessos_log`). Pentest obrigatório — feito.
4. **F.4 — excluir cliente: confirmação nomeada agora.** **Arquivar em vez de apagar**
   (`arquivado_em`) fica registrado como **evolução futura** — mexe em `etapa1_clientes`, a tabela
   mais quente do sistema.
5. **F.5 — SMTP do Supabase Auth: copy honesta agora; a configuração é do João.**
6. **F.6 — B10 segue com o Marcio** (a copy sequencial fecha a Etapa 01 para 58 de 63 ambientes).

#### (d) Pentest da rodada — **APROVADO**

0 crítico, 0 alto. Tudo corrigido em `f96c3cb` e `2b250b0`:

- 🟡 **MÉDIO — guarda cross-sistema.** `gps.admin_alvo_e_equipe` só enxerga `public.perfis`, mas
  `auth.users` é **compartilhado por 7 sistemas**: um sócio do GPS pode ser admin do Workbook.
  `definirSenhaMembro` passou a consultar `admin_programas_do_email` antes de trocar a senha e, se a
  conta tiver papel fora do GPS, devolve `precisaConfirmar` + programas **sem alterar nada**; a UI
  confirma com o nome dos sistemas na tela.
- 🔵 **BAIXO — teto do motivo.** O motivo da recusa de solicitação passou a ser cortado em 500
  caracteres **no servidor**.
- 🔵 **BAIXO — URL de material no payload.** A URL da aula de etapa trancada ia no HTML inicial
  mesmo sem virar link (dava para ler no view-source). Corte movido para o servidor.
- ⚪ **INFO — regex.** `adicionarSocioAluno` passou a usar `emailValido`, a regex única.

#### (e) Onda 4 — bundle (fechada em `ea39d6b`)

**Depois** (mesmo método): `/login` **236 KB**, `/cadastro` **236**, `/esqueci-senha` **235** (−69,
aceite ≤ 245 cumprido), `/p/plantao` 284 (+4, custo do `ToasterLazy`). Rotas autenticadas, pelo
`page_client-reference-manifest.js`: `/` 143→74, `/admin` 223→158, `/admin/aluno/[id]` 181→75,
`/perfil` 157→97, `/pasta` 152→72, `/chamados` 174→114, `/clientes` 209→149, `/etapa/[n]` 162→102.
O chunk do SDK do Supabase (64 KB gzip) estava em 27 manifests; hoje em 0 — `await import()`
dentro do handler em `logout-button`, `auto-logout`, `esqueci-form`, `redefinir-form`,
`trocar-senha`, `anexo-campo` (mecanismo de logout intocado). `next/dynamic` só nos diálogos de
admin (`CriarAcesso`, `GerenciarAcesso`); `pasta-view` virou Server Component com o form de admin
em `pasta-config-form.tsx`; `<Toaster>` lazy. Revertidos com número: `optimizePackageImports`
(0 KB) e `dynamic` no `AnexoCampo` (≤ 1 KB e piscava). **`/login` não chega a 190**: 38,6 KB são
polyfill `noModule` que browser moderno não baixa (197 KB reais); o resto é `react-dom` (71 KB),
runtime do Next (~59 KB) e Base UI (~34 KB) — piso de framework, não sobra de código.

Medido **antes** (commit `75b7138`, gzip somando os `<script>` que o HTML pede): `/login`
**248 KB**, `/cadastro` **249 KB**, `/esqueci-senha` **312 KB**, `/p/plantao` **288 KB**. O
`/esqueci-senha` pesa ~64 KB gzip a mais porque `esqueci-form.tsx` importa o SDK do Supabase no
browser para **uma** chamada (`resetPasswordForEmail`), enquanto o `login-form.tsx` usa Server
Action. A Onda 4 tira o SDK do carregamento inicial e move `src/app/etapa-1/actions.ts` para
`src/app/clientes/actions.ts`. **Meta: `/login` ≤ 190 KB gzip, ou justificativa escrita.** Números
**depois** e o caminho novo das actions: preencher quando a onda fechar. O mecanismo do logout
**não** muda (o comentário de `logout-button.tsx` registra que route handler / Server Action
quebrava atrás do proxy LiteSpeed da Hostinger).

#### (f) Pendências que sobraram para o João / Marcio

1. **`chamados_email_equipe` vazio** — preencher em `/admin/chamados` ou definir `EMAIL_SUPORTE` no
   painel da Hostinger (é **fallback**, aceita vários e-mails separados por vírgula). Com as duas
   vazias, chamado novo não avisa ninguém.
2. **SMTP customizado no Supabase Auth** (Resend) — sem isso, "Esqueci minha senha" sai pelo SMTP
   embutido, de baixa entrega e com limite por hora. Acesso e decisão do João (F.5).
3. **UX7 — qual canal a pessoa sem acesso usa?** Um e-mail ou WhatsApp para colocar na tela de
   solicitação recusada (pode ser o mesmo de `chamados_email_equipe`).
4. **B10** — a copy sequencial fecha a Etapa 01 para **58 de 63 ambientes**. É o pedido literal do
   Marcio; falta levar o número a ele.
5. **Ilan sem conta** — não existe em `auth.users`, logo não dá para promover a admin.
6. **`frame-ancestors https://*.hotmart.com`** — depende do ensaio do iframe (abrir o Plantão dentro
   da Hotmart e ler o `document.referrer`). Fechar às cegas tira 421 pessoas do ar.
7. ~~`pg_cron` do `primeiro_acesso`~~ — ✅ agendado e ativo (09/09/2026), ver acima.
8. **C7 — onde "recusou" mora** antes de remover `status` de `etapa1_clientes`.
9. **Dropar `gps.plantao_config`** numa migration futura, depois de **1 semana** de `gps.config` no
   ar (o caminho de leitura já é o novo; some o código, não o histórico).
10. **Arquivar cliente em vez de apagar** (`arquivado_em`) — evolução registrada em F.4.

#### (g) Roteiro de validação logado (resumo; completo na seção E do `tmp/squad/rodada-final.md`)

**Antes:** `npm run build && npx next start -p 3991`, e guardar o número do bundle.

*Como aluno titular* — (1) "Continue de onde parou" leva a uma tarefa que **dá para marcar**, ou diz
o que destravar; nunca a um passo cinza. (2) "Clientes X/30" bate com o que a Etapa 01 cobra: com o
passo 2 travado, o número **não** pode ser 30/30. (3) "Excluir" cliente pede confirmação com o nome
dele — cancele. (4) Desmarcar a estrela avisa que isso volta a travar os passos 4–8 — cancele.
(5) Na fase Contratado o botão diz **"Abrir contrato"**. (6) Material de etapa "bloqueada" fica
listado **sem link ativo**. (7) Nenhum "R$ 0,00" onde deveria estar "não informado". (8) Abrir um
chamado de teste e conferir se alguém recebeu e-mail.

*Como sócio* (um dos 13 ambientes compartilhados) — (9) o header não mostra Financeiro, e digitar
`/financeiro` dá **aviso**, não redirect mudo. (10) `/chamados` abre e o chamado do titular aparece
(é do ambiente, não da pessoa). (11) `/perfil` mostra **o seu** nome.

*Como admin* — (12) a aba "Chamados" tem contador e o card do aluno com chamado aberto mostra o
badge. (13) "Recusar" pede motivo, e o motivo aparece na tela do aluno recusado. (14) "Gerenciar
acesso" → "Remover" sócio pede confirmação nomeada (**cancele**) e nenhum texto diz "GPS";
"Definir senha" num membro com conta em outro portal do grupo **lista os sistemas antes de trocar**.
(15) Criar slot no Plantão já vem com **120**; e em `/admin/chamados`, "Fechar entrada" pede
confirmação e — com a lista vazia mas `EMAIL_SUPORTE` definido — o aviso vermelho **não** afirma que
ninguém recebe.

### 💰 Financeiro v2 — painel de progresso da mentoria (2026-09-09, `fab0c9f`)

A aba deixou de ser extrato frio e virou **o progresso financeiro do aluno na mentoria**, como
o João explicou: (1) **meta de faturamento de R$ 150.000 durante o programa** (honorários dos
clientes em `fase='contratado'` do ambiente) — bater a meta é o **próximo nível, o "Áureo"**;
passar de **R$ 250.000** é o **"bônus do programa"** (o que é o bônus **não está escrito em
lugar nenhum**: o Marcio não detalhou, não inventar); (2) **registro do pagamento do programa**
(quanto pagou, parcelas, em dia/atrasado/quitado); (3) visual para o aluno e para a equipe.

- **RPCs** (migração `…140`): `gps.financeiro_pode_ler(uuid)` é a **guarda única** (admin OU
  titular na mesma linha de `gps.membros`; o sócio continua fora — B7-b); `gps.financeiro_do_aluno`
  v2 (dropada e recriada — sem sobrecarga) lê **`cs.vw_hm_financeiro`** (regra financeira do sip:
  `pacote_regra`, `pago`, `saldo_a_perseguir`, parcelas, `situacao`, `status_parcela`, próxima
  cobrança…; cobertura 96 de 96 contratos, 94 alunos); `gps.financeiro_extrato_do_aluno` lê
  **`cs.vw_hm_extrato`** (teto 200 linhas). Só leitura; `postgres` lê as views, `authenticated`
  não → SECURITY DEFINER com `search_path=''`, `revoke` antes do `grant`.
- **TS**: `src/lib/financeiro.ts` (`situacaoContrato` derivada: cancelado · quitado · atrasado ·
  em_dia · indefinido — `saldo_parado` não ganhou rótulo inventado; `getExtratoDoAluno`);
  `progressoFaturamento` + `BONUS_HONORARIOS = 250_000` em `src/lib/etapa1.ts`
  (`META_HONORARIOS = 150_000` já existia); `getProgressoFaturamento` em `src/lib/data/clientes.ts`.
- **UI** (`src/components/financeiro/`): `hero-faturamento.tsx` (valor grande + `BarraMarcos`
  com os marcos 150k/250k + frase de estado: "Faltam R$ X para o Áureo" / "Você chegou ao Áureo"
  / "passou dos R$ 250.000"), `contratos-fechados.tsx`, `programa-card.tsx` (badge de situação,
  pago de total, trilha de parcelas, próximo vencimento, crédito e entrada como linhas próprias),
  `extrato.tsx` (`<details>`, categoria e método legíveis), `ui/barra-marcos.tsx`. **Sem
  contratado, o hero não mostra "R$ 0 de R$ 150.000" como resultado: mostra a instrução** (marcar
  cliente como Contratado + informar honorários). `MetaHonorarios` (home/Clientes) usa a mesma
  função de cálculo e os mesmos marcos.
- **Regras mantidas**: B7-b (sócio não vê), B7-c (crédito/cancelamento nunca somados), B7-d
  (`null` ≠ 0), B8 (150k = contratado, programa inteiro), B9. 31 de 125 ambientes seguem sem
  registro no sip → "não disponível" **mas a seção da meta aparece mesmo assim** (depende dos
  clientes, não do sip).
- Provado no banco (JWT real, `set role authenticated`): titular lê (1 contrato, quitado, extrato
  2 linhas), sócio do mesmo ambiente 42501 nas duas RPCs, casts das views OK.

### 🩺 Central de resolução — o admin resolve dentro do sistema (2026-09-09)

Pedido do João: acesso, sócio, financeiro e trilha se resolvem **pelo painel, sem SQL e sem
dev**, sem causar confusão (diagnóstico → ação guardada → log → reversível). Spec do arquiteto e
decisões em `docs/audits/2026-09-09-central/central-resolucao.md`.

**Backend (`340d27a`, migrações `…150` a `…159`, todas aplicadas e conferidas em transação com
rollback — bloco B0–B9 da spec):**
- `gps.admin_diagnostico_ambiente(uuid)` → jsonb com **20 verificações** `{chave, ok, valor,
  detalhe}` (`ok=true` verde, `false` vermelho/âmbar, **`null` = informação sem juízo** — a tela
  NÃO deduz cor por texto), `acesso` (= `admin_status_acesso`, reusada, não copiada), `direito`
  (= `admin_direito_ao_acesso`), `membros` com a **pessoa** de cada um, `etapas` (global ×
  override já resolvidos, com `origem/motivo/em`), `progresso`, `candidatos_financeiro`,
  `solicitacoes_pendentes`. **Só leitura, 0 linhas de log.** `tarefa_atual` sai com `ok=null` e só
  o número de concluídas: o catálogo de tarefas vive no TS e `proximoPasso()` é a regra única.
- **Trilha**: `gps.etapa_liberacao_aluno` (override POR AMBIENTE, `coalesce(override, global)` —
  libera quem está adiantado E trava quem precisa refazer), `gps.etapa_liberada_para(uuid,
  smallint)` (SECURITY INVOKER; guarda com **`coalesce(…, false)`** — sem isso, sem JWT a guarda
  virava NULL e a função respondia), `gps.admin_definir_liberacao_etapa` (`p_liberada = null`
  REMOVE o override; motivo 3..300 obrigatório; log + evento `etapa_liberada/travada_pela_equipe`),
  `gps.admin_reabrir_etapa` (**UPDATE `concluida=false`**, nunca DELETE; N eventos
  `tarefa_reaberta` com ator `equipe` pela trigger; provado: 7 upd, 0 del).
  **No TS a mesma regra é `etapaLiberadaPara`/`etapasComLiberacaoDoAluno` (`src/lib/etapas.ts`)**
  — cada página do aluno troca `getEtapas()` por
  `etapasComLiberacaoDoAluno(await getEtapas(), await getEtapasLiberadasPara(alunoId))` e nada
  abaixo (`proximoPasso`, `EtapasOverview`, `listarMateriais`) precisa saber que existe override.
  `getEtapas()` continua existindo (interruptor global do `/admin`).
- **Pessoas**: `gps.membros.pessoa_aluno_id` (quem a pessoa É no cadastro; backfill 126 titulares =
  identidade, 13 sócios pelo e-mail do login, **0 sem pessoa**, 0 duplicatas — `membros_pessoa_uk`
  **não** criado, a RPC recusa duplicata), `gps.admin_vincular_pessoa_membro` (só sócio; `null`
  desvincula), `gps.admin_trocar_titular` (sempre 1 titular; **decisão B-T1 opção A: o novo titular
  PASSA a ver o Financeiro e o antigo deixa** — `gps.financeiro_pode_ler` não mudou; a confirmação
  da tela escreve isso), `gps.admin_mover_membro` (só sócio; destino precisa de titular; o que ele
  registrou **fica** no ambiente de origem; 2 linhas de log).
- **Financeiro (decisão B-F1 opção A, a única peça que escreve fora do `gps`)**:
  `gps.financeiro_candidatos_do_aluno` é a **regra única** de casamento (contrato órfão de
  `cs.contatos_hm` cujo `public.compradores` tem o mesmo e-mail ou documento do `thb_alunos`;
  sem e-mail e sem documento → vazio, nunca a base do sip; devolve só 4 dígitos do documento) e é
  **peça interna** — ⚠️ neste projeto **toda função nova nasce com `execute` para
  `authenticated`** (ALTER DEFAULT PRIVILEGES): função interna leva `revoke … from public, anon,
  authenticated`, conferido em `pg_proc.proacl`. `admin_financeiro_candidatos` (teto 5 + `ja_tem`),
  `admin_financeiro_vincular` (id explícito; candidato daquele aluno; **`and aluno_id is null`
  DENTRO do update** — zero linha = 40001, nunca sucesso silencioso; escreve SÓ `aluno_id`),
  `admin_financeiro_desvincular` (só do próprio aluno; devolve `vinculado_pelo_portal` — `false` =
  veio do sip, a tela avisa antes). **Medido em rollback contra as 10 triggers de
  `cs.contatos_hm`: 1 upd em `contatos_hm` + 1 ins em `acessos_log`, nenhuma outra tabela, 0
  delete, `atualizado_em` intacto.** Injeção no id (`4' or 1=1 --`) → 42501.
- **`gps.admin_direito_ao_acesso` ganhou `gp_is_admin()`** (`…159`): era SECURITY DEFINER sobre
  `cs.vw_gps_acessos` SEM guarda e com execute para `authenticated` — **qualquer aluno logado lia
  nome, e-mail, turma, plano e situação financeira de terceiros pela RPC**. Pré-existente
  (retrato `…131`), corrigido aqui.
- Catálogos: `acessos_log.acao` com 12 valores, `aluno_eventos.tipo` 20, `entidade` 4 (+`etapa`).
  Rótulos em `diario-labels.ts`/`log-agregacao.ts`; 26 frases novas em `erros.ts`.
  `mapearStatusAcesso` (`src/lib/data/central.ts`) é o **único mapeador** da RPC de acesso —
  `senha-actions.ts` passou a usá-lo (módulo `"use server"` só exporta função async).
- **Actions** (`src/app/admin/central-actions.ts`, todas com `ehAdmin()` e `{ erro }` traduzido):
  `definirLiberacaoEtapa`, `reabrirEtapa`, `vincularPessoaMembro`, `trocarTitular`, `moverMembro`,
  `vincularFinanceiro`, `desvincularFinanceiro`.

**Frontend (`e5176d4`)**: aba **"Resolver"** (`adminOnly` — some na prévia "como o aluno vê")
em `assistenciaNavItems`, rota `/admin/aluno/[alunoId]/resolver` (+ `loading.tsx` com o esqueleto
do checklist e `error.tsx` sobre `ErroPainel`). Componentes em `src/components/admin/central/`
(`index.tsx` ≤ 400 linhas; `catalogo.ts` agrupa as 20 chaves em ACESSO · PESSOAS · FINANCEIRO ·
TRILHA · ATENDIMENTO preservando a ordem do servidor; `estadoDaLinha` só lê `ok`; `dialogos/
confirmacoes.tsx` tem as 10 confirmações com a copy de C.4; `executar-acao.ts` monta a frase de
sucesso a partir do RETORNO da action, nunca de suposição).
- Cabeçalho "N problemas · N avisos · N informações · N ok · às HH:MM" (as quatro somam 20) e
  **Reconferir** (`useTransition` + `router.refresh()`, `aria-busy`/`aria-live`); toda ação
  bem-sucedida reconfere sozinha.
- **Botão de escrita só em linha vermelha/âmbar.** As escritas raras sobre linha verde (tornar
  titular, mover sócio, voltar à regra geral, desvincular contrato) ficam num `<details>` que
  **nasce fechado** (`bloco-de-correcao.tsx`). Senha, adotar login, e-mail, sócio e remover
  membro são **links para Gerenciar acesso** — nenhuma segunda porta para escrita que já existia.
- Motivo (3..300) validado no cliente (contador, `aria-invalid`) e no servidor e no banco.
- Desvincular contrato precisa do `contatoHmId`, que o diagnóstico não traz: a página chama
  `getFinanceiroDoAluno` **só quando `financeiro_contrato.ok === true`** (a única RPC a mais, e
  só no caso em que a ação existe).
- **Override de etapa vale nas 6 páginas do aluno** (home, `/etapa/[n]`, materiais e os 3
  espelhos do admin): `etapasComLiberacaoDoAluno(await getEtapas(), await
  getEtapasLiberadasPara(ctx.alunoId))` — na tela da etapa, aviso "Liberada/Travada para você
  pela equipe" + motivo. **`alunoId` vem do contexto de sessão, nunca de parâmetro.**
- ⚠️ **Não validada logada** (não há credencial de admin de teste na máquina): tsc, eslint e
  build limpos; falta o passe do roteiro abaixo.

### 🎨 Redesign "Trilha" — Ondas A e B (2026-09-09, `cfe4938` e `17c3a88`)

Pedido do João: "o visual está cru, sem nexo". Diagnóstico com fotos e direção em
`docs/audits/2026-09-09-central/design-diagnostico.md` (A.0–A.9 os defeitos por tela, B.1–B.11 a
linguagem, "(D) O que NÃO fazer" as proibições). **Nenhum texto de produto mudou** (as 3 strings
novas permitidas: legenda do calendário, "parado há N dias", "N de N passos").

**Onda A — tokens e componentes base** (`src/app/globals.css` + `src/components/ui/*`):
- Fundo **branco quente `#FAF8F6`**, neutros na família da marca, 3 superfícies
  (`superficie-afundada`, `borda-fina/forte`), 2 sombras quentes, `--radius` 0,75rem, **4 pares
  semânticos** (sucesso/atenção/risco/neutro, contraste medido no comentário do token),
  `--color-marca-solida` (#B04300, superfície de marca: login/hero) e `--color-marca-acao`
  (#C74600, **preenchimento do botão primário: 4,88:1**; era #FF6300 = 2,98:1 — reprovava AA no
  controle principal do produto. `#FF6300` segue **decorativo**: ícone, chip, régua da aba).
- 🔑 **Escala tipográfica como `@utility`** (`numero`, `numero-lg`, `titulo-xl/h1/h2`, `corpo`,
  `corpo-sm`, `rotulo`) — **não `text-*`**: `tailwind-merge` trata `text-<nome>` desconhecido
  como COR e descarta a classe (`cn("text-display-lg","text-accent-foreground")` devolvia só a
  cor). Não criar `text-*` custom.
- 🔑 **`focus-visible:outline-solid` no `Button` é obrigatório**: o `outline-none` da base do
  shadcn zera `--tw-outline-style` e `outline-2` só define largura — sem o `-solid` o foco de
  TODO botão fica invisível. Comentário no arquivo; não remover.
- `Card` (`elevacao="flat|raised"`, `interativo`, `size="lg"`), `Badge` (`success|warning|danger|
  neutral` com ícone; `default` passou de 2,98 para 5,75:1), `Secao` (eyebrow + título + régua —
  substituiu os 15 `uppercase tracking-wide`), `KpiCard` (absorveu o `MetricCard` da Etapa 01;
  `KpiLinha empilhado`), `PageHeader` (28 px Space Grotesk + `eyebrow`), `Progress` h-2,
  `BarraMarcos`, `EmptyState` `raised`, `PadraoTrilha` (SVG inline ~700 B, `currentColor`).
- Header em **2 linhas sempre** (medido 99 px em 1366 com 8 abas; era 4 linhas), aba ativa com
  régua de 2 px, fade no scroller; `AuthLayout` laranja sólido + padrão de trilha (saíram o
  gradiente e os 2 blobs).

**Onda B — as 17 telas** (tabela completa no diagnóstico): hero de programa no perfil
(identidade · etapa · meta, sem gradiente), `HomeResumo` sobe no celular com `order-*` (home
mobile **5.350 → 2.897 px**, um DOM só), `ProximoPassoCard` como peça mais forte (botão sólido;
é `<span>` com `buttonVariants` — botão dentro de `<a>` é HTML inválido), etapas com
"Disponível" verde / bloqueada afundada + cadeado / barra sempre com "N de N passos", trilho
vertical numerado na Etapa 01 (código da tarefa continua no nome acessível), ficha com 4
`Secao` e barra de salvar `sticky` com "alterações não salvas", card de aluno em ~590 px por 6,
filtros em chips `aria-pressed`, fila de chamados com **"parado há N dias"** (âmbar ≥ 1, risco
≥ 3), calendário do Plantão com hora + mentora + inscritos e legenda, `AssistBanner` como faixa
com `body:has([data-assistindo]) main{padding-bottom}`. `/p/plantao` só herdou tokens.
- **Progresso geral = média das etapas LIBERADAS** ("Progresso nas etapas liberadas · 1 de 6
  etapas"): dividir por 6 mostrava 17% para a Etapa 01 completa. `pctPorEtapa` intocado.
- `FASES_CLIENTE.cor` em tokens semânticos (fechamento 3,65 → 5,81:1; contratado 3,77 → 5,91:1).
- **Contraste medido no DOM** (`tmp/squad/contraste-B.mjs`, fundo composto): **0 falhas em 1.081
  nós de texto**, 8 telas × 2 viewports (eram 16 na Onda A). 36 capturas em
  `tmp/squad/shots-design-B/`; 0 erro de console e 0 overflow horizontal em 16 combinações.
- **`brlCompacto` sem `notation:"compact"`** (`src/lib/moeda.ts`): o ICU do Node renderizava
  "R$ 68 mil" e o do navegador "R$ 68,0 mil" — erro de hidratação em todo `/admin`. A conta é
  feita à mão; só a parte numérica passa pelo Intl.
- A rota pública de prévia `src/app/p/previa-design/` **foi apagada** no fim da Onda B.
- **Ficou para decisão do Marcio**: anel de foco `--ring` (#FF6300) dá 2,82:1 contra a página
  (abaixo dos 3:1 de 1.4.11 para indicador de foco, não é texto); checkbox marcado `bg-primary`
  com ✓ branco (mesmo caso); e a escolha #C74600 × #B04300 para o botão primário.


### 🎧 Plantão — war-room de 09/09/2026 (o dia em que o produto foi usado)

O Plantão saiu do papel: **23 inscritos**, 17 no plantão daquela tarde. E a
entrega de e-mail **não existia** — quatro pontos de falha ao mesmo tempo:

| Ponto | Estado medido |
|---|---|
| `/api/plantao/manutencao` em produção | **500** — `PLANTAO_MANUTENCAO_SEGREDO` nunca setado na Hostinger |
| Cron do plantão | **não existia** (23 crons no banco, nenhum do plantão) |
| `app.plantao_manutencao_segredo` | não setado — e **impossível de setar** por aqui |
| `RESEND_API_KEY` local | **inválida** (`API key is invalid`) |

🔴 **`alter role authenticator set app.*` é RECUSADO pelo Supabase mesmo com
role `postgres`** (42501). Guarda por `current_setting` não se configura por
MCP nem por migration — só pelo painel/superusuário. Isso invalida o passo 2
do `ATIVAR-PLANTAO-AGORA.md` como tarefa executável daqui.

#### O disparo passou a sair DO BANCO (migration `…170`)

`pg_net` + `pg_cron` já estavam instalados, e `net.http_post` para
`api.resend.com` responde **200**. `gps.plantao_disparar_emails_sala()`
(SECURITY DEFINER, `revoke` de `public/anon/authenticated` — **não é
endpoint**, quem chama é o cron) monta e envia os dois e-mails; cron
**`plantao-emails-sala`, `*/10 * * * *`**.

- **De 10 em 10 minutos, não diário**: a janela de envio é de 1 hora; diário
  só alcançaria os plantões da hora seguinte à execução.
- **Idempotente** pelos carimbos que já existiam (`email_sala_em`,
  `aviso_mentora_em`): a segunda passada devolve 0 linhas — verificado.
- **A mentora recebe no mesmo disparo** a lista nominal, o total, o horário e
  o link da sala.
- 🔑 **Credenciais em `gps.config`** (`resend_api_key`, `email_from`), nunca
  no corpo da função: `pg_get_functiondef` é legível por quem tem `postgres`,
  e a chave vazaria junto com o código.

⚠️ **Duplicação assumida:** `src/lib/email-plantao.ts` monta os MESMOS
e-mails em TypeScript para o caminho HTTP. Enquanto as duas implementações
coexistirem, **mudança de conteúdo tem de ser feita nos dois lugares**. A
consolidação depende de a rota voltar a responder em produção.

#### A sala vive DURANTE a live (migrations `…171` e `…172`)

Decisão do Marcio: a janela passou de `[início−1h, início)` para
**`[início−1h, início + duracao_min)`**. Quem chega atrasado ainda entra.

Dois bugs de borda saíram junto:
- a tela calculava `encerrado: inicio_em <= agora` e dizia *"esta sala já
  encerrou"* **no segundo em que a live começava**;
- **`JANELA_DEPOIS_MIN = 60` num plantão de 120** fazia a sala sumir da tela
  **na metade da live**. A constante foi REMOVIDA — o fim vem do banco
  (`fim_em`), por slot, então mudar `duracao_min` move a janela junto.

🔴 **`plantao_revelar_link` ganhou `p_ip_hash` e rate limit** (10/15min, molde
de `plantao_inscrever`). Era a **única das três RPCs da rota pública sem
atrito nenhum** — e é a que entrega o link do Zoom e grava presença em nome de
alguém. A recusa por identidade virou **genérica** (as mensagens distintas
deixavam enumerar inscrições de terceiros); a recusa por **janela** continua
específica, porque ali o dono já foi confirmado. A versão de 2 argumentos foi
**dropada**: se ficasse, a chamada sem ip cairia na função sem rate limit,
ainda exposta a `anon`.

#### "Problema no acesso" → monitoria

`https://o.aceleraholding.com.br/monitoria` (encurtador → WhatsApp do suporte).
Aparece no rodapé de `/p/*` (**inclusive para quem não conseguiu se
identificar**, que é quem mais precisa), junto da mensagem de erro da
identificação e no rodapé dos dois e-mails.

#### Fundo cinza no iframe da Hotmart

`globals.css` pinta o `body` com `bg-background` (#f4f5f8). Dentro da aula, o
iframe fica sobre branco e o cinza virava uma caixa visível. `/p/*` força
branco **no `body`** — pintar só a `div` não resolve: quem pinta a área do
iframe é o `body`.

#### 🔴 O incidente das 13:00 — 11 de 20 e-mails perdidos em silêncio

O cron disparou os 20 e-mails de "falta 1 hora" de uma vez. **A Resend
limita 10 requisições por segundo**: 11 voltaram **429**. E como
`net.http_post` é **assíncrono** (devolve o id do pedido, não o resultado),
a função carimbava `email_sala_em` logo depois do post — as 11 pessoas
ficaram **sem o link E marcadas como avisadas**.

🔑 **O cron reportou `succeeded, 20 rows`.** O banco dizia que tinha dado
certo. Só apareceu porque fomos conferir destinatário a destinatário na API
(`GET /emails/{id}` devolve `to` e `last_event`). Falha silenciosa é a pior
espécie: ninguém investiga o que diz ter funcionado.

**As três correções (migration `…174`):**
1. `pg_sleep(0.15)` entre envios (~6,7 req/s) e **teto de 8 por passada** —
   o teto também protege o `statement_timeout` de 8s do `authenticator`.
2. **`gps.plantao_reconciliar_envios()`** — o carimbo passa a guardar o
   `request_id`; a função, chamada no início de cada passada, limpa o
   carimbo de quem não teve 2xx e devolve a pessoa para a fila.
   ⚠️ `http_collect_response(async := false)` resolveria na hora, mas
   **bloqueia até a resposta e estoura o timeout de 8s** — testado.
3. **Segundo e-mail, no início da live** ("começou agora"), além do de 1h
   antes. Alcança também quem se inscreveu nos últimos 59 minutos.

🔑 **A aritmética que quase falhou de novo:** `teto 8 × cron 10min × janela
15min` = **16 pessoas alcançáveis**, e havia 19 inscritos — 3 ficariam sem o
e-mail de abertura com a live rolando. Janela → **30 min**, cron → **5 min**.
**Regra:** fila com teto por passada exige conferir `teto × intervalo ×
janela` contra o tamanho real da fila. Não falha com erro — falha deixando
gente de fora.

Resultado do dia: **23 de 23 nos dois e-mails** (a base cresceu de 19 para
23 durante a própria live).

#### A lista do Plantão é um CSV CONGELADO

`gps.plantao_alunos` são 421 linhas carregadas em 01/09 (`origem =
'acelera_csv'`). **Nada a atualiza**: `plantao_reconciliar_elegibilidade` só
REMOVE (quem migrou para o Programa), nunca ADICIONA quem comprou o Acelera
depois. Todo comprador novo fica de fora até alguém recarregar a planilha.

Custou hoje: a Bianca (compradora desde 17/08) foi recusada na inscrição.
Há **49 compradores** criados depois da carga — não dá para saber quantos
são do Acelera, porque **não existe marcação de produto no banco** (foi por
isso que a base veio de CSV).

Remédio: **`gps.admin_liberar_aluno_plantao`** + botão "Liberar aluno" na
aba Alunos. Sempre grava `origem='liberacao_manual'` e
`bloqueio_excecao=true` — sem a exceção, o job noturno rebloquearia na
madrugada seguinte quem a equipe acabou de liberar. Log em
`gps.plantao_eventos`, **não** em `gps.acessos_log`: este referencia
`public.thb_alunos`, e quem é liberado aqui pode não ter cadastro lá.

#### Lições que custaram tempo

- **Resend via `urllib` sem `User-Agent` devolve 403 code 1010** (borda
  Cloudflare) e parece credencial inválida; com UA de navegador aparece o erro
  real. `pg_net` não sofre disso.
- **SVG não renderiza em Gmail/Outlook** — logo de e-mail em PNG
  (`public/logo-thb.png`, gerado com o `sharp` que vem do Next; `density:600`
  estoura o limite de pixels).
- **`plantao_slots.inicio_em` é coluna GERADA** — não aceita valor no insert.
- **Agendador de Tarefas do Windows não serviu** de plano B: `LastTaskResult 0`
  (sucesso) e o `.bat` não escrevia nada. `nohup` no bash também não sobrevive
  ao fim do shell. O cron do banco é o caminho — roda no servidor.
- 🔴 **`auth.users` é compartilhado pelos 7 sistemas do grupo.** As 3 mentoras
  já eram admin (Isabela e Cristiane `admin`, Elaine `dev`); a troca de senha
  pedida foi **recusada** porque trocaria a senha delas em **todos** os
  portais e derrubaria a sessão da Isabela, logada naquele momento. **Não
  existe senha "só deste sistema".**

⚠️ **A CSP não chega ao cliente em produção:** `/p/plantao` responde
`Content-Security-Policy: upgrade-insecure-requests` — o **LiteSpeed da
Hostinger sobrescreve** o header do Next, e **`frame-ancestors` não existe no
ar**. O `Referrer-Policy` passa. Ou seja, a pendência 5/6 ("fechar o
`*.hotmart.com`") é mais grave do que registrado: hoje **qualquer** site
embeda a página. Não é resolvível por código — precisa de config no hPanel.

### ⚠️ Agendamento — REMOVIDO do sistema (2026-08-10)

**Decisão do Marcio.** O motivo é **operacional, não técnico**: o fluxo não estava fluindo e
**a equipe não estava comparecendo**. Enquanto isso é um problema interno, **o sistema não pode
prometer uma reunião que não acontece**.

**Regra de produto que vale daqui pra frente:**
> Agendamento no GPS é **organização pessoal do aluno**. A UI **não deve dar a entender** que a
> equipe participa de reunião marcada pelo sistema, nem que o agendamento acontece dentro dele.

⚠️ **Histórico importante:** o fluxo já foi removido uma vez e **voltou** — em 2026-08-05 alguém
reconstruiu por cima (modelo "aluno solicita / equipe confirma", `EMAIL_EQUIPE`, fila com badge,
grade editável). **Não reconstruir sem decisão explícita do Marcio.**

O que foi **removido** (código):
- `src/lib/reuniao.ts`, `src/app/reuniao/actions.ts`, `src/app/admin/reunioes/`.
- Componentes: `ReunioesCalendario`, `AgendarAlunoModal`, `SolicitacoesReuniao`,
  `ReuniaoResponder`, `DisponibilidadeHorarios`, `ReuniaoAgendarModal`.
- `src/lib/data.ts`: todas as queries de reunião, incl. `contarReunioesPendentes` (o badge).
- `src/lib/types.ts`: `STATUS_REUNIAO`, `StatusReuniao`, `ReuniaoAgendamento(Detalhe)`,
  `ReuniaoHorario`, `ReuniaoEvento`, `ReuniaoBloqueio`, `SlotReuniao`.
- `src/lib/email.ts`: `emailsDaEquipe`, `equipeSemDestinatario`, `enviarReuniaoConfirmada`,
  `enviarSolicitacaoParaEquipe`, `enviarConfirmacaoParaEquipe`, `enviarReuniaoRecusada` + os
  helpers de `.ics`/Google Agenda. **Preservados:** `enviarCredenciaisAcesso` e
  `enviarAcessoLiberado` (de que `admin/actions.ts` e `senha-actions.ts` dependem) e a infra
  (`enviar`, `esc`, `layout`, `botao`, `ResultadoEmail`).
- A env **`EMAIL_EQUIPE`** (saiu do `.env.example`; pode sair do painel da Hostinger).
- A aba **Reuniões** e o campo `badge` do `NavItem` (existia só para a fila de reunião).

**Textos reposicionados** (agendamento = organização pessoal):
- Etapa 03: "A equipe acompanha apenas UM evento" → "marque a **apresentação principal**";
  badge "Equipe participa deste" → "Apresentação principal".
- Etapa 02, tarefa 3: saiu "a equipe acompanha 1 reunião e complementa se necessário".

**O que NÃO foi tocado** (é agenda do aluno com os clientes dele, fora do sistema):
`gps.etapa1_clientes.data_reuniao_preliminar`, `gps.membros.data_agendamento_disponivel`,
`gps.etapa3_agendamentos` (lista livre), a meta de 15 reuniões preliminares da Etapa 01 e o
"agendar o depoimento final" da Etapa 06.

- **Etapas = guia/mapa** (intuitivo): checklist + tutoriais + progresso. NÃO contém gestão.
- **Clientes = aba separada** (CRM): **Lista** (funil/busca/ordenação) e **Quadro** (kanban por
  status com arrastar-e-soltar), atalho de **WhatsApp** (`src/lib/whatsapp.ts`), e destaque do
  **cliente acompanhado pela equipe** (coluna `acompanhado_equipe`, único por aluno — a estrela).
  Cada cliente tem **ficha** com todos os campos (apenas dados; o antigo "fichário" de
  documentos por cliente foi **removido** da UI). Navegação por abas no header
  (Início / Clientes / Materiais), espelhada no admin (modo assistência) com
  `basePath = /admin/aluno/<id>`.
- Componentes reusados por aluno e admin via `basePath`: `ClientesManager`, `ClienteFicha`,
  `Etapa1Guide`, `AppHeader` + `NavTabs`, `PerfilEditor`.
- **Perfil**: `/perfil` (aluno) e `/admin/aluno/<id>/perfil` (admin, modo assistência); item
  "Perfil" no `NavTabs`. `salvarPerfilAluno(perfil, alunoId?)` — sem `alunoId` o aluno edita o
  próprio (`eq user_id`); com `alunoId` só o admin edita (`eq aluno_id`). A action confere as
  linhas afetadas via `.select()`: um `update` que não casa nada volta **sem erro**, e o admin
  (que não tem linha em `gps.membros`) veria "perfil salvo" sem gravar nada.
- **Documentos do cliente: removidos por completo (2026-07-09).** Saíram do app (`DocumentosSection`,
  `getDocumentos`, tipo `Documento`) **e do banco** (migração `gps_remove_documentos_do_cliente`:
  `drop table gps.documentos` + as 3 policies `gps_docs_*` de `storage.objects`). Os documentos do
  aluno vivem na **pasta do Drive**, só lá.
  ⚠️ O bucket **`gps-documentos` ainda existe** (com 1 PDF de teste): o Postgres do Supabase bloqueia
  `delete` direto em `storage.buckets`/`storage.objects` (trigger `storage.protect_delete`) — só sai
  pela Storage API ou pelo dashboard. Sem policies, ninguém acessa; falta só apagá-lo.
  **Não confundir com o bucket `documentos`** (público, do `sip`) nem com as policies
  `documentos_public_*` — esses são de outro sistema e devem ficar intactos.

## Rotas

- `/login` — login e-mail/senha (Supabase Auth). `/auth/signout` (POST).
- `/` — Início do aluno (mapa das 6 etapas; admin → `/admin`; sem vínculo → aviso).
- `/etapa/[n]` — guia da etapa. `/clientes` e `/clientes/[id]` (ficha+docs).
- `/financeiro` — aba Financeiro do aluno (leitura de `cs.contatos_hm` pela RPC
  `gps.financeiro_do_aluno`). **Só titular e admin** — o sócio não vê a aba nem a URL.
- `/chamados` e `/chamados/[id]` — suporte do aluno (abrir chamado com anexo, responder).
- `/materiais` — **acervo**: aulas + modelos de todas as etapas (busca/filtro por tipo), agregados
  de `CONTEUDO_ETAPAS` por `src/lib/materiais.ts` (`listarMateriais`). Navegação por abas com ícones
  (Início/Clientes/Materiais) em `NavTabs`.
- Admin espelha em `/admin/aluno/[id]`, `.../etapa/[n]`, `.../clientes`, `.../clientes/[id]`,
  `.../materiais`, `.../diario`, `.../financeiro`, `.../chamados` e **`.../resolver`** (Central de
  resolução, só admin).
- `/admin` — lista de alunos no GPS + "Adicionar aluno" (busca em `thb_alunos`). Header do admin
  tem só a aba **Alunos** (`adminNavItems` em `src/lib/nav.ts`) desde a remoção do agendamento.
- `/admin/aluno/[alunoId]` — admin dentro do ambiente do aluno (modo assistência, editável).
- `/cadastro` — auto-cadastro do aluno (Supabase signUp, metadata `origem=gps`).
- `/admin/chamados` e `/admin/chamados/[id]` — fila de chamados da equipe + configuração de
  `gps.config` (interruptor `chamados_aberto`, destinatários `chamados_email_equipe`) e expurgo
  de anexos de chamado fechado há mais de 180 dias.
- ~~`/admin/solicitacoes`~~ — **não existe mais como página** (09/09): virou `redirect` para
  `/admin` em `redirects()` do `next.config.ts`. A fila de solicitações vive dentro de `/admin`.
- ⚠️ **`/agenda` não existe** — a pasta `src/app/agenda/` foi apagada em 09/09; era só um
  `actions.ts` órfão (sem `page.tsx`) do agendamento removido em 08/2026, com Server Actions
  compiladas e expostas. **Não recriar.**
- ⚠️ **`/etapa-1` NÃO é rota** — `src/app/etapa-1/` só tem `actions.ts` (as Server Actions dos
  clientes da Etapa 01), sem `page.tsx`. A tela é `/etapa/[n]`. Em 09/09 os `revalidatePath` que
  apontavam para `/etapa-1` e para `/admin/solicitacoes` (as duas inexistentes) foram trocados
  pelas rotas reais. Na Onda 4 (`ea39d6b`) as actions foram para **`src/app/clientes/actions.ts`**
  e a pasta `src/app/etapa-1/` deixou de existir.
- `/captacao` — bloqueado (placeholder "em breve").
- `src/proxy.ts` — proteção de sessão (Next 16 usa `proxy`, não `middleware`). Públicas: `/login`, `/cadastro`, `/auth/*`.

## Pasta do aluno (Google Drive)

Cada aluno tem uma **pasta individual no Drive** (cópia da "PASTA PADRÃO", compartilhada
equipe↔aluno). Guardamos só **1 campo**: `gps.membros.pasta_drive_url` (sem sobrecarregar o banco).
Aba **`/pasta`** (e admin `.../pasta`): **pré-visualização embutida** (iframe
`embeddedfolderview`, via `embedPastaDrive()` em `src/lib/pasta.ts`) + botão "Abrir no Drive".
Admin define/edita o link (`salvarPastaDriveUrl`). Item "Pasta" no nav.
⚠️ O `embeddedfolderview` **só renderiza se a pasta estiver compartilhada por link** ("qualquer
pessoa com o link"); em pasta restrita a contas específicas o iframe vem vazio, mesmo para quem
tem acesso. (O antigo card "Como sua pasta é organizada" / mapa da estrutura padrão segue
**removido** da UI; a constante `ESTRUTURA_PASTA` de `pasta.ts` **não existe mais** — saiu com o
código morto na rodada final de 09/09.)

## Onboarding do aluno (modelo definido)

Alunos **não** são provisionados em massa e a base **não** é importada. Auto-cadastro padrão:
aluno se cadastra em `/cadastro` com **dados essenciais — CPF/CNPJ, e-mail e senha** →
o gatilho `on_auth_user_created_gps` (SECURITY DEFINER) **vincula automaticamente** o `thb_alunos`
correspondente **pelo CPF/CNPJ** (match por `lpad(digitos,14,'0')`, que reconstrói zero à esquerda
perdido; fallback por e-mail) e cria `gps.membros` → o aluno **já entra no programa**. Sem match,
cai em `gps.solicitacoes_acesso` (pendente). Documento em `raw_user_meta_data.documento`.

**Painel admin (`/admin`) com abas**: "Alunos ativos" (em `gps.membros`) x "Solicitações"
(pendentes). Botão **Criar acesso** (`CriarAcesso`): busca em `thb_alunos` (nome/e-mail/CPF/telefone).
A busca (`buscarAlunos`) é **tolerante**: quebra o termo em palavras (ordem não importa), casa cada
uma em qualquer campo, traz um conjunto amplo e **ranqueia por associação** (nº de palavras casadas,
sem acento; nome vale mais) — acha com pouca informação. Permite **atualizar o e-mail** do cadastro
(se antigo) e então **Criar login agora** ou **Só criar
ambiente** (aluno se cadastra depois). "Criar login agora" (`criarAcessoAluno`) usa `signUp` num
cliente Supabase **isolado** (sem persistir sessão, não afeta o admin) + gera senha temporária;
o gatilho/upsert vincula ao aluno escolhido. **Não usa service_role.** Solicitações são aprovadas/
recusadas em `SolicitacaoCard`.

### Gerenciar acesso do aluno (2026-07-31) — senha na hora e exclusão total

Botão **"Gerenciar acesso"** (`GerenciarAcesso`, em `/admin/aluno/<id>`) resolve o acesso sem
depender de e-mail. Três coisas num diálogo só:

1. **Diagnóstico** — checklist do que está OK ou não: tem login, tem senha, e-mail confirmado,
   e-mail do login == e-mail do cadastro, vínculo com o programa, último acesso, solicitação
   pendente. É onde se vê *por que* o aluno não entra.
2. **Definir senha agora** — grava a senha direto, confirma o e-mail, limpa tokens de recuperação,
   **derruba as sessões antigas** e garante `gps.membros.user_id`. Devolve login+senha para copiar
   ou mandar por WhatsApp (`linkWhatsapp`), e ainda tenta o e-mail de credenciais (não bloqueia).
3. **Excluir acesso** — apaga login (`auth.users`) + tudo do aluno no GPS (clientes, progresso,
   reuniões, ênfases, solicitações). **Preserva `public.thb_alunos`** (base compartilhada com o
   sip). Exige digitar `EXCLUIR`.

**Por que existe:** o único jeito de dar senha era `criarAcessoAluno` (`signUp`), que **falha em
usuário já existente** — o aluno que se cadastrou sozinho em `/cadastro` ficava sem caminho, e o
botão antigo só reenviava o e-mail de recuperação do Supabase (**SMTP embutido**, não é a Resend:
baixa entrega e limite por hora). Resultado prático: aluno preso fora do portal, sem ninguém
conseguir destravar. Caso real: `gugabatera@gmail.com`, criado em 17/07, destravado em 31/07.

**Sem `service_role`** (mantém a regra do projeto). O trabalho em `auth.users` fica em funções
SECURITY DEFINER no schema `gps`, migração `gps_admin_gestao_de_acesso`:
- `gps.admin_status_acesso(uuid)`, `gps.admin_definir_senha(uuid, text)`,
  `gps.admin_excluir_acesso(uuid)` — todas abrem com `public.gp_is_admin()` ou `raise 42501`;
  `execute` revogado de `public`/`anon`, concedido só a `authenticated`.
- Auxiliares: `gps.admin_user_do_aluno(uuid)` (resolve o `auth.users` pelo vínculo, com fallback
  por e-mail — **nunca aceita user_id vindo do cliente**) e `gps.admin_alvo_e_equipe(uuid)`
  (**bloqueia mexer em conta de perfil ativo dev/admin** — impede escalar privilégio por aqui).
- Senha gravada com `extensions.crypt(senha, extensions.gen_salt('bf', 10))` — bcrypt, formato
  que o GoTrue lê nativamente. Mínimo de 8 caracteres, validado no banco.
- Toda ação vira linha em **`gps.acessos_log`** (quem fez, em quem, quando; leitura só de admin).

**Aluno fora da base (cadastro manual):** se a busca não acha ninguém, o admin cadastra o aluno
direto em `thb_alunos` pelo `CadastrarAlunoForm` (action `cadastrarAluno`) — identificação,
contato, endereço, plano/turma e redes. Campos financeiros/Hotmart ficam nulos (pertencem ao
centro de controle do sip). As linhas nascidas aqui levam `fonte = 'gps_cadastro_manual'`.
O INSERT passa pelo RLS do próprio admin (policy `thb_alunos_insert_editores` →
`gp_pode_editar('centro_controle')`, que aceita cargo dev/admin) — **sem service_role**.
**Duplicatas:** `thb_alunos` tem índice único em `lower(trim(email))`, mas **nenhum único em
`documento`**. Como o gatilho vincula o login por CPF e, havendo empate, escolhe o `importado_em`
mais recente, um CPF duplicado grudaria o aluno na linha errada. Por isso `cadastrarAluno` checa
antes via `gps.aluno_por_documento(text)`, que replica exatamente a normalização do gatilho
(`lpad(dígitos,14,'0')`). A função é *invoker-rights* de propósito: o RLS de `thb_alunos` continua
valendo. CPF/CNPJ é validado pelos dígitos verificadores (`documentoValido` em `src/lib/masks.ts`).

## E-mails transacionais (Resend)

Domínio do portal: **`programa.timeholdingbrasil.com.br`** (antes `gps.`; trocado em 2026-07-09 —
atualizar também **Site URL / Redirect URLs** no Supabase Auth, senão o link de redefinir senha
volta para o domínio velho). Envio via **Resend** (HTTP direto, sem SDK)
em `src/lib/email.ts`. Dois e-mails, ambos com layout laranja: `enviarCredenciaisAcesso`
(login + senha temporária + link) disparado em `criarAcessoAluno`, e `enviarAcessoLiberado`
(aluno já tem senha própria) disparado em `aprovarSolicitacao`. Falha de envio **não** bloqueia a
criação do acesso (funções retornam `{ ok, erro? }`, nunca lançam); a UI de `CriarAcesso` mostra
se o e-mail saiu (`emailEnviado`).
Envs: `RESEND_API_KEY` (**segredo** — só `.env.local` em dev e painel da Hostinger em prod, NUNCA
no `.env.production` versionado), `EMAIL_FROM` (domínio precisa estar **verificado na Resend**),
`NEXT_PUBLIC_APP_URL` (link do portal nos e-mails).

## `public.perfis` é da equipe — limpeza de 31/07/2026

`public.perfis` define **quem é da equipe interna** (`gp_is_admin()` = perfil `ativo` com cargo
dev/admin). O gatilho legado `public.handle_new_user` (do sip, de quando só a equipe tinha login)
criava um perfil `pendente/visualizador` para **todo** signup — inclusive alunos dos portais.
Resultado: 1.285 linhas, sendo **1.245 de alunos** (workbook 1.148, gps 73, rede 30, central 1).

Não dava privilégio a ninguém (o gate exige `ativo` + dev/admin), mas era uma bomba armada:
qualquer ativação em massa ou sistema que leia "existe em perfis" como "é da equipe" viraria
escalada de privilégio — e o painel de usuários do sip listava 1.285 pessoas.

**Feito:**
- Backup completo em `public.perfis_backup_limpeza_20260731` (com o `raw_user_meta_data` de cada
  um; RLS ligada, sem policy — ninguém lê pela API). Restaurar: `insert into public.perfis
  (<colunas>) select <colunas> from public.perfis_backup_limpeza_20260731`.
- Apagadas as 1.245 linhas de aluno (nenhuma `ativo`, nenhuma `@advmais.com`, nenhuma referenciada
  por `hm_liberacoes` / `permissoes_usuario` / `thb_alunos.atualizado_por` / `log_acessos` —
  conferido antes). Sobraram **41 linhas, 19 ativas** (a equipe, intacta).
- Gatilho endurecido (migração `handle_new_user_so_para_equipe`): só cria perfil quando o cadastro
  **declara `cargo`/`status`** (é o que o `admin-proxy.php → create-user` do sip sempre manda) **ou**
  o e-mail é **@advmais.com**; e **nunca** quando o cadastro declara `origem`/`sistema` de portal
  de aluno. Testado nos 7 cenários (aluno gps/workbook/rede, externo sem metadata, equipe pelo sip,
  equipe pelo domínio, membro da equipe se cadastrando como aluno).

⚠️ O fluxo de criar membro da equipe no sip **depende deste gatilho** para materializar a linha em
`perfis` — ele não faz insert direto no `create-user`. Se mexer no gatilho de novo, teste esse
caminho.

## ✅ Ex-pendência de segurança — `thb_alunos` (desarmada em 2026-09-08)

Este documento dizia que "um aluno logado leria os 2.459 alunos" por causa das policies
`qual: true` em `public.thb_alunos`. **Testado com JWT real de aluno em 08/09: lê 1.** As
policies `qual=true` são RESTRICTIVE (combinam com AND) e `thb_alunos_gps_aluno_restrito`
limita à própria linha. Já estava resolvido; o documento é que não tinha sido atualizado.

## Estado atual (2026-07-08)

- [x] Scaffold Next.js 16 + TS + Tailwind v4 + shadcn/ui; tema laranja.
- [x] Supabase server/browser + `proxy.ts` (sessão/proteção de rotas).
- [x] Schema `gps` + RLS + exposto ao PostgREST.
- [x] Auth (login/logout) + resolução de papel (admin/aluno/sem_acesso).
- [x] UI Etapa 01: métricas, checklist (passos 1.1/1.2 + 2..8; passo 6 antigo absorvido no 1.1),
      tabela dos 30 clientes (CRUD via diálogo), data de agendamento. Etapas 2–6 bloqueadas.
- [x] Ênfase das tarefas (atual em destaque / futuras esmaecidas) + override manual do admin
      (`gps.tarefa_enfase`); indicador visual dos passos 1.1/1.2 apontando p/ a aba Clientes.
- [x] Cliente favoritado em destaque na home (aluno+admin) + "Continue de onde parou"; Etapa 05
      travada até haver favorito.
- [x] **Agendamento de reunião com a equipe REMOVIDO (2026-08-10)** — decisão operacional do
      Marcio (a equipe não estava comparecendo). Removidos o modelo de solicitação/confirmação
      (2026-08-05), a grade fixa (2026-07-28), a rota `/admin/reunioes`, os e-mails de reunião e
      a env `EMAIL_EQUIPE`. Tabelas mantidas no banco, sem uso. Ver a seção "⚠️ Agendamento".
      **Já voltou uma vez — não reconstruir sem decisão explícita.**
- [x] Busca de aluno tolerante (tokens + ranqueamento por associação); removido o mapa da pasta.
- [x] Admin: lista de alunos com resumo + entrar no ambiente do aluno (editável).
- [x] Portal de captação bloqueado.
- [x] UX: máscaras (CPF/CNPJ com detecção, telefone, moeda BRL) em `src/lib/masks.ts`;
      mostrar/ocultar senha; tutoriais por tarefa (`tutorialUrl`/`modelo` no catálogo, da planilha —
      tarefas 9 e 10 têm aula, tarefa 1 tem modelo); Etapa 01 como **central de clientes**
      (funil por status, busca, filtro, troca de status inline na tabela).
- [x] Auto-cadastro + solicitação de acesso + aprovação pelo admin (fila `/admin/solicitacoes`).
- [x] Cadastro manual de aluno fora da base (`CadastrarAlunoForm` + `cadastrarAluno`), com
      validação de CPF/CNPJ e guarda de duplicata via `gps.aluno_por_documento`.
- [x] `npm run build` passa (typecheck + lint OK).
- [x] Deploy Node na Hostinger configurado (`server.js`, `DEPLOY.md`).
- [x] Código versionado e enviado para `github.com/infra-grupo-participa/gps-thb` (main).
- [x] **Gerenciar acesso do aluno (2026-07-31):** diagnóstico + definir senha na hora + excluir
      acesso por completo, tudo pelo painel e sem `service_role` (migração
      `gps_admin_gestao_de_acesso`). Substituiu o `BotaoRedefinirSenha`, que só reenviava e-mail.
- [x] **Diário do aluno (2026-09-08 — frontend):** card de resumo no Modo Assistência + aba
      `admin/aluno/[alunoId]/diario` (registro/timeline/dar baixa) + badge/filtro de pendência no
      painel. Só-admin (LGPD). Ver seção "📓 Diário do aluno" acima.
- [x] **Diário Fase 2 — log de ações do aluno (2026-09-08):** `gps.aluno_eventos` + triggers de
      captura + backfill + trilha única (evento/macro/nota/ação administrativa) com filtros Foco e
      Janela resolvidos no servidor. Macro por agregação na leitura, nunca gravada. 3 índices com
      plano medido. Migrations `20260909000001..09`, todas aplicadas.
- [x] **Aluno troca a própria senha (2026-09-08):** card em `/perfil` — antes só existia caminho
      pelo link de e-mail, então quem recebia senha temporária do admin ficava preso a ela.
- [x] **`gps.admin_adotar_login_existente` consertada (2026-09-08):** estava quebrada desde 25/08
      por precedência de operadores (`||` vs `->>`); o botão de adotar login preexistente nunca
      funcionou. Migration `20260909000020` (também versiona a função, que só existia no banco).
- [x] **Polimento geral (2026-09-09):** design system mínimo em `src/components/ui/`
      (`PageHeader` + `<main id="conteudo">`, `EmptyState`, `KpiCard`, `ListaSkeleton`,
      `ErroPainel`), `loading.tsx` nas rotas pesadas, `global-error.tsx`, contraste AA no
      texto (`text-accent-foreground`), fim do `.dark`/`next-themes`; sessão memoizada com
      `cache()`, open redirect do login fechado por `destinoInterno()`, `nosniff`/HSTS/
      `Permissions-Policy` e `poweredByHeader:false`; `data.ts` sem `select("*")` e painel
      paginado; baseline do schema `gps` versionado (retrato) + `logErro` JSON sem PII.
      `src/app/agenda/` e a página `/admin/solicitacoes` removidas.
- [x] **Fase 5 — Diário descoberto (2026-09-09):** `gps.admin_painel_atendimento()` +
      última nota e "Nota rápida" no card do painel. B2 decidido: não há tela para o aluno.
- [x] **Fase 7-A — aba Financeiro (2026-09-09):** `/financeiro` e
      `/admin/aluno/[id]/financeiro`, RPC `gps.financeiro_do_aluno` lendo `cs.contatos_hm`
      (só leitura). **Sócio não vê** (B7-b); 31 de 125 sem registro veem "não disponível".
- [x] **Fase 7-B — honorários e meta de R$ 150.000 (2026-09-09):** `valor_honorarios` e
      `contrato_url` em `etapa1_clientes` (zero backfill), `resumoHonorarios`, evento
      `cliente_honorarios_definidos`. Sem catraca de fase (B9-b).
- [x] **Fase 6 — Suporte por chamados (2026-09-09):** `/chamados` e `/admin/chamados`,
      tabelas append-only, bucket `gps-chamados` (só o aluno anexa), `gps.config` com
      interruptor, retenção de 180 dias com expurgo por clique do admin.
- [x] **Rodada final de qualidade (2026-09-09, `2c03325..f257f24`):** confirmação nomeada em tudo
      que apaga ou tranca (`DialogoConfirmacao`); `proximoPasso` sem beco sem saída (devolve
      `bloqueio`); KPI de clientes em `comDados`; divergência de saldo nos dois sentidos; motivo na
      recusa de solicitação; chamado aberto com badge, filtro e contador (zero consulta nova);
      material de etapa bloqueada sem `url` **cortado no servidor**; `fallbackEnv` do
      `EMAIL_SUPORTE`. Ver "Rodada final de qualidade".
- [x] **Um lugar só para cada regra (2026-09-09):** `moeda.ts` e `datas.ts` como únicos
      formatadores, `texto.ts` com a única regex de e-mail, `masks.ts:soDigitos`,
      `traduzirErroBanco` em `src/lib/erros.ts`, `navDoAluno(ctx)` com a regra do sócio,
      `gps.config` como única tabela de configuração (`plantao_config` em compatibilidade) e as
      4 RPCs que só existiam no banco versionadas.
- [x] **Arquivos gigantes cortados (2026-09-09):** `data.ts` virou fachada
      (`src/lib/data/<assunto>.ts`), as actions do Plantão viraram
      `slots-/mentoras-/alunos-/config-actions.ts` e 4 componentes de 739–1212 linhas viraram pasta
      com `index.tsx` de até 400 linhas (o maior é `gerenciar-acesso/painel.tsx`, 410).
      **`slots-actions.ts` continua com 731 e é de propósito** — 7 actions da mesma entidade,
      compartilhando `validarZoomUrl`/`somarDias`. Movimento puro: 26 capturas
      Playwright com md5 idêntico antes/depois.
- [x] **`gps.admin_definir_senha_membro` (2026-09-09)** — "Definir senha" por membro do ambiente,
      o remédio que faltava para os 13 sócios. Pede confirmação nomeando os sistemas quando a conta
      tem papel em outro portal do grupo. Duração padrão do slot do Plantão passou a **120**.
- [x] **Onda 4 — bundle** (`ea39d6b`): SDK do Supabase fora do carregamento inicial (−60 a −106 KB
      gzip por rota autenticada; `/esqueci-senha` 312→235); `src/app/etapa-1/actions.ts` →
      `src/app/clientes/actions.ts`. `/login` ficou em 236 (197 sem o polyfill `noModule`) — o
      piso é framework, ver seção (e) da rodada final.
- [x] **Financeiro v2 (2026-09-09, `fab0c9f`)** — a aba virou o painel de progresso da mentoria:
      meta de R$ 150 mil (Áureo), bônus em R$ 250 mil, pagamento do programa por
      `cs.vw_hm_financeiro` + extrato. Ver "💰 Financeiro v2".
- [x] **Central de resolução (2026-09-09, `340d27a` + `e5176d4`, migrações `…150`–`…160`)** —
      diagnóstico de 20 verificações + 7 ações guardadas (liberar/travar etapa por aluno, reabrir
      etapa, vincular pessoa, trocar titular, mover sócio, vincular/desvincular contrato) na aba
      "Resolver". `admin_direito_ao_acesso` ganhou a guarda que faltava. Ver "🩺 Central".
- [x] **Redesign "Trilha" (2026-09-09, `cfe4938` + `17c3a88`)** — tokens quentes, tipografia com
      salto, 4 pares semânticos, botão primário AA, 17 telas; 0 falhas de contraste medidas.
      Ver "🎨 Redesign".
- [ ] **Validar logado** o roteiro de 15 passos da rodada final **+** a Central: abrir
      `/admin/aluno/<id>/resolver` num ambiente com problema e num 100% verde; teclado (Tab pelo
      `<details>`, Esc no diálogo, foco de volta ao gatilho); um erro real de action no diálogo;
      "Reconferir"; na home de um aluno com override, a etapa travada aparece travada.
- [ ] **Decisões visuais do Marcio**: laranja do botão primário (#C74600 × #B04300), anel de foco
      (#FF6300 = 2,82:1) e checkbox marcado.
- [ ] **B-T1 (troca de titular → o novo titular vê o Financeiro do anterior)** — confirmar com o
      João/Marcio; o remédio é uma linha em `gps.financeiro_pode_ler` (dado já pronto).
- [ ] **Corrida `aprovarSolicitacao` × `admin_mover_membro`** (pentest, BAIXO, código
      pré-existente): mover a lógica de `aprovarSolicitacao` para RPC ou `select … for update`.
- [ ] **Definir o canal de contato de quem não tem acesso (UX7)** — não existe e-mail nem WhatsApp
      no código; a tela de solicitação recusada só diz "fale com a equipe".
- [ ] **Configurar SMTP customizado (Resend) no Supabase Auth** — hoje "Esqueci minha senha" sai
      pelo SMTP embutido, de baixa entrega e com limite por hora.
- [ ] **Dropar `gps.plantao_config`** numa migration futura, depois de 1 semana de `gps.config`
      no ar.
- [x] ✅ **`gps.senhas_bkp_20260810` APAGADA (2026-09-09)** — 83 linhas de hash bcrypt paradas
      desde 10/08 sem finalidade (71 ainda idênticas às senhas atuais). Migração `…119`,
      autorizada pelo João. Ver "Rodada final de qualidade".
- [ ] **Preencher `chamados_email_equipe`** em `/admin/chamados` (ou `EMAIL_SUPORTE` no
      painel da Hostinger). Hoje as duas estão vazias: chamado novo não avisa ninguém.
- [x] ✅ **`pg_cron` do `primeiro_acesso` AGENDADO (2026-09-09)** — `gps-diario-primeiro-acesso`,
      `0 9 * * *` UTC, confirmado em `cron.job`. Ver `ATIVAR-DIARIO-EVENTOS.md`.
- [x] **RLS de `thb_alunos` — ex-pendência DESARMADA (2026-09-08).** Testado com JWT real de
      aluno: lê 1 linha. As policies `qual=true` são RESTRICTIVE e combinam com AND. Ver a
      seção "✅ Ex-pendência de segurança" acima — **não reabrir**.
- [ ] Verificar cadastro real ponta a ponta. (A dúvida sobre o GoTrue está respondida:
      `mailer_autoconfirm = true`, ou seja, o aluno entra sem confirmar o e-mail.)
- [x] **Deploy na Hostinger ativo e AUTOMÁTICO** — push na `main` dispara o build Node
      (confirmado em 09/09/2026 pelo painel de builds). Migrations continuam fora do push:
      aplicar no Supabase ANTES. Ver `DEPLOY.md`.
- [ ] Deixar o repositório privado, se desejado (`gh repo edit --visibility private`).
- [x] E-mails transacionais (Resend): credenciais + acesso liberado (`src/lib/email.ts`).
- [x] Domínio do portal trocado para `programa.timeholdingbrasil.com.br` (envs, `next.config.ts`,
      fallbacks de `email.ts` e `senha-actions.ts`).
- [x] **Supabase Auth → URL Configuration** corrigido em 2026-07-09 (via Management API).
      Estava `site_url = http://localhost:3000` e `uri_allow_list` **vazia** — os links de
      redefinição de senha apontavam para o localhost do próprio usuário. Agora:
      `site_url = https://programa.timeholdingbrasil.com.br` e
      `uri_allow_list = https://programa.timeholdingbrasil.com.br/**,http://localhost:3000/**`.
      Verificado por comportamento: `GET /auth/v1/verify?...&redirect_to=<x>` honra a URL do
      domínio novo e ignora as demais, caindo no `site_url`.
- **Confirmação de e-mail está DESLIGADA** (`mailer_autoconfirm = true`): quem se cadastra já
      entra sem confirmar. Por isso `criarAcessoAluno` devolve `precisaConfirmar = false`.
- [x] `RESEND_API_KEY` configurada no painel da Hostinger (prod). **Atenção:** a chave do
      `.env.local` (dev) continua sendo recusada (`API key is invalid`) — trocar para testar
      envio localmente.
- [x] **`programa.timeholdingbrasil.com.br` publicado na Resend.** Conferido por DNS em
      2026-07-09: `resend._domainkey.programa…` (DKIM), `send.programa…` TXT
      (`v=spf1 include:amazonses.com ~all`) e MX (`feedback-smtp.sa-east-1.amazonses.com`).
      DMARC da raiz é `p=none`, então não barra nada. **Não verificado daqui:** o flag "verified"
      no painel da Resend e uma entrega real — a chave do `.env.local` é recusada, e os e-mails
      transacionais só disparam em `criarAcessoAluno` / `aprovarSolicitacao`.
- [ ] Se o `EMAIL_FROM` estiver definido no painel da Hostinger, **atualizar lá**: mudou de
      `GPS — Time Holding Brasil <…>` para `Time Holding Brasil <…>`. O painel sobrepõe o
      `.env.production`.
- [x] DNS do novo domínio apontado para a Hostinger (147.93.34.90) com SSL; o portal responde e o
      login funciona. O domínio antigo (`gps.`) saiu do ar.

Lembrete: falha de envio de e-mail **não** aparece na tela — as funções de `email.ts` retornam
`{ ok:false }` e nunca lançam, para não bloquear a criação do acesso. A UI de `CriarAcesso`
mostra `emailEnviado`; é por ali que se percebe.

### Como testar agora
Admin já pode entrar: os 16 `perfis` (incl. marcio@advmais.com, cargo dev) usam a **senha
Supabase existente**. `npm run dev` → `/login` → adicionar um aluno em `/admin` → abrir o
ambiente e preencher a Etapa 01.

---
_Última atualização: 2026-09-09 (tarde) — **war-room do Plantão** (`18e2f16`
a `48fc5b9`; migrações `…170`–`…175`). O produto foi usado pela primeira vez (23
inscritos, 17 no plantão daquela tarde) e a entrega de e-mail não existia: rota
500, cron inexistente, `alter role` recusado pelo Supabase e chave Resend
inválida. O disparo passou a sair **do banco** por `pg_net` → Resend (cron
`plantao-emails-sala`, de 10 em 10 min, idempotente), com as credenciais em
`gps.config`. A sala passou a ficar aberta **durante** a live, o que revelou
`JANELA_DEPOIS_MIN = 60` fechando a sala na metade de um plantão de 120 e a tela
declarando "encerrada" no instante do início. Pentest reprovou e tinha razão:
`plantao_revelar_link` era a única RPC pública sem rate limit — ganhou
`p_ip_hash` (10/15min) e recusa genérica. Fundo cinza do iframe e link da
monitoria no ar. Às 13:00 o primeiro disparo real perdeu 11 de 20 e-mails em
silêncio (Resend: 10 req/s; `net.http_post` é assíncrono e o carimbo vinha antes
do resultado) — corrigido com pausa, teto por passada e reconciliação pelo
`request_id`; e a lista do Plantão revelou-se um CSV congelado de 01/09, que
ganhou o botão "Liberar aluno". Resultado: **23 de 23 nos dois e-mails**.
**Aberto: a CSP não chega ao cliente — o LiteSpeed sobrescreve e
`frame-ancestors` não existe em produção.**_

_Anterior: 2026-09-09 (noite) — **Financeiro v2 + Central de resolução + redesign
"Trilha"** (`fab0c9f`, `cfe4938`, `340d27a`, `e5176d4`, `17c3a88`; migrações `…140` e
`…150`–`…160` aplicadas e conferidas em rollback). A aba Financeiro virou painel de progresso
(meta 150k = Áureo, bônus 250k, pagamento do programa pelas views do sip); a Central dá ao admin
diagnóstico de 20 verificações + 7 ações guardadas e reversíveis (a única escrita fora do `gps` é
`cs.contatos_hm.aluno_id`, medida contra as 10 triggers); o redesign trocou a temperatura do
sistema inteiro com 0 falhas de contraste medidas. Dois furos pegos só pela conferência no banco:
`admin_direito_ao_acesso` sem guarda (pré-existente) e `etapa_liberada_para` falhando aberto sem
JWT. Pentest APROVADO nas duas passadas. **Falta o passe logado** (sem credencial de admin de
teste na máquina)._

_Anterior: 2026-09-09 (rodada final) — **rodada final de qualidade**
(`2c03325..f257f24`, 8 commits). Nada que apaga ou tranca acontece sem confirmação nomeada
(`DialogoConfirmacao`); `proximoPasso` não aponta mais para porta trancada; KPI de clientes em
`comDados`; material de etapa bloqueada vai sem `url` (corte no servidor); "Definir senha" por
membro (`gps.admin_definir_senha_membro`), com aviso quando a conta é de outro portal. Um lugar só
para cada regra (`moeda.ts`, `datas.ts`, `texto.ts`, `erros.ts`, `navDoAluno`, `gps.config`);
`data.ts` virou fachada e 4 componentes gigantes viraram pasta com `index.tsx`. Pentest APROVADO
(1 MÉDIO, 2 BAIXOS, 1 INFO, corrigidos). **Onda 4 (bundle) em execução.**_

_Anterior: 2026-09-09 (madrugada) — **polimento geral + Fases 5, 6 e 7 das 9
features** (`f9a763a..cb8fbdd`, 13 commits). Design system em `src/components/ui/`
(`PageHeader` + `<main id="conteudo">`), `loading.tsx`/`global-error.tsx`, texto em laranja
escuro (AA) e fim do `.dark`; sessão memoizada com `cache()` (1 `getUser` no lugar de 7),
open redirect do login fechado por `destinoInterno()`, nosniff/HSTS/Permissions-Policy;
`data.ts` sem `select("*")` e painel paginado; baseline do schema `gps` versionado (retrato,
**não se aplica**) e `logErro` sem PII. Fase 5 (nota rápida no painel), 7-A (Financeiro —
sócio não vê), 7-B (honorários + meta R$ 150.000) e 6 (chamados com anexo). Migrações
...080 a ...120 aplicadas e conferidas no banco. Pentest em curso._

_Anterior: 2026-09-08 (noite) — **Fases 1–4 e 8 das 9 features do Marcio**:
campo de senha único com olho, busca/filtros no painel, `gps.admin_painel_alunos()` no
lugar de varrer a base, copy sequencial (trava de UI), pré-visualização "como o aluno vê",
cliente com FASE (status congelado por trigger; backfill por evidência 842/37/0) e Plantão
com cancelar/pausar/trocar mentora/série semanal. Pentest aprovado nas duas rodadas (1 MÉDIO
e 1 BAIXO corrigidos). Migrações ...050, ...060, ...061, ...062, ...070 aplicadas. Ver a
seção "As 9 features do Marcio" e `PLANO-9-FEATURES.md`._

_Anterior: 2026-09-08 — **o Plantão virou link público sem login**.
Saíram 2 tabelas (`plantao_acessos`, `plantao_sessoes`, ambas vazias), 5 RPCs de
login/sessão e 537 linhas de front (sonda de cookie de terceiro, guarda de
CHIPS/Safari, login, troca de senha) — com elas foi embora todo o risco de iframe
no Safari, que nunca chegou a ser testado. A identidade agora é o **e-mail**,
conferido contra os 422 do Acelera: quem sabe o e-mail age pela pessoa, risco
aceito com as alternativas na mesa (a senha padrão anterior era a mesma para os
422 e ninguém trocou — o modelo antigo já era isso, com mais peças). Entraram
rate limit por IP (10/15min, e IP ausente cai num balde comum) e o interruptor
`app.plantao_inscricao_aberta`, que desliga TODAS as escritas sem deploy.
Junto: elegibilidade do Acelera (20 de 422 bloqueados), job de reconciliação,
cut-off de meio-dia da véspera, e-mail com o link 1h antes + trava de
cancelamento, e a Semana 1 de setembro publicada. Aprovado pelo
`security-pentester` sobre o SQL versionado. **Cron passa a ser DE HORA EM
HORA**; deploy continua manual. Ver `ATIVAR-PLANTAO-AGORA.md`._

_Anterior: 2026-09-08 — **Diário Fase 2: log de ações do aluno**. `gps.aluno_eventos`
(append-only por trigger, só-admin), trilha única fundindo log do aluno + diário da equipe + ações
administrativas, filtros Foco/Janela no servidor. Macro por agregação **na leitura** — micro-evento
é o único que se grava. 3 índices com `explain analyze` colado (um deles matando varredura sem teto
no corte de backfill). Triggers blindadas com `exception when others`: falha no log nunca aborta a
escrita do aluno. Junto: card **"Trocar senha"** em `/perfil` (antes só dava pelo link de e-mail) e
o conserto de `gps.admin_adotar_login_existente`, quebrada desde 25/08 por precedência de operadores
— o botão de adotar login preexistente nunca tinha funcionado. Migrations `...01..09` e `...20`
aplicadas. Build verde. **Falta agendar o `pg_cron` do `primeiro_acesso`** e o **deploy é manual**._

_Anterior: 2026-08-10 — **fluxo de agendamento de reunião com a equipe REMOVIDO**
(rota `/admin/reunioes`, actions, `src/lib/reuniao.ts`, os 6 componentes, queries, tipos, os 4
e-mails de reunião e a env `EMAIL_EQUIPE`). Motivo **operacional**: a equipe não estava
comparecendo. `FavoritoDestaque` virou card informativo (Server Component); textos de Etapa 02/03
reposicionados como **organização pessoal do aluno**. Tabelas `gps.reuniao_*` **mantidas no banco**,
órfãs. Preservados no mesmo commit: auto-logout de 30 min, `GerenciarAcesso`/`senha-actions`,
`prefetch={false}` das abas e os e-mails de acesso. Build verde. Deploy Hostinger é manual._

_Anterior: 2026-08-05 — agendamento virou solicitação + confirmação da equipe (revertido em 10/08)._

_Anterior: 2026-07-09 — fichário de documentos removido da ficha do cliente; Etapa 01 reestruturada (1.1/1.2, passo 6 absorvido, indicador p/ Clientes); ênfase de tarefas com override do admin (`gps.tarefa_enfase`); home com "continue de onde parou" + cliente favoritado em destaque e agendamento por janelas (`gps.reuniao_janelas`); Etapa 05 travada por favorito; busca de aluno tolerante; mapa da pasta removido. **Cadastro manual de aluno fora da base** (`CadastrarAlunoForm` + action `cadastrarAluno` + função `gps.aluno_por_documento`), com validação de dígitos do CPF/CNPJ e guarda contra CPF duplicado. Build verde. Próximo: verificar domínio na Resend + `RESEND_API_KEY` na Hostinger._
