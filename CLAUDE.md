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
`getPendenciasPorAluno` — badges do painel; todas com `ehAdmin()` de guarda), `src/app/admin/diario-actions.ts`
(`registrarNota`/`darBaixaPendencia`, autoria sempre do `ctx.user.id` do
servidor, nunca do cliente).

Frontend: card de resumo no topo do Modo Assistência
(`DiarioResumoCard`, acima do `ProximoPassoCard` em
`admin/aluno/[alunoId]/page.tsx`) + aba própria
`admin/aluno/[alunoId]/diario` (`DiarioForm` + `DiarioTimeline` +
`DiarioBaixaButton`) — a timeline recebe DUAS listas: as notas (teto de 50) e
as pendências abertas (sem teto), exibidas numa seção fixa no topo com botão
de baixa, sem repetir no histórico + badge/filtro de pendência na lista "Alunos ativos"
do painel (`AlunosAtivosLista`, alimentada por `getPendenciasPorAluno()` —
uma query só, filtro em memória).

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

⚠️ **`primeiro_acesso` depende de job diário** — ver `ATIVAR-DIARIO-EVENTOS.md`.
Sem agendar o `pg_cron`, quem entrar depois do backfill não tem o evento
capturado.

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
⚠️ **Contrato pendente:** `AlunoPlantaoAdmin` (`src/lib/plantao-tipos.ts`) e
`getAlunosPlantao()` (`src/lib/plantao-data.ts`) ainda não expõem esses dois
campos — a UI declara `AlunoPlantaoAdminComBloqueio` localmente e o
`admin/plantao/page.tsx` faz cast documentado até o backend atualizar.

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

**Fora deste ciclo (dependem do Marcio):** notas por aluno (B2), ticket com anexo (B5/B6),
financeiro (B7–B9), feature 1 (sócio — já existe). Ver tabela de bloqueios no plano.

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
- `/materiais` — **acervo**: aulas + modelos de todas as etapas (busca/filtro por tipo), agregados
  de `CONTEUDO_ETAPAS` por `src/lib/materiais.ts` (`listarMateriais`). Navegação por abas com ícones
  (Início/Clientes/Materiais) em `NavTabs`.
- Admin espelha em `/admin/aluno/[id]`, `.../etapa/[n]`, `.../clientes`, `.../clientes/[id]`, `.../materiais`.
- `/admin` — lista de alunos no GPS + "Adicionar aluno" (busca em `thb_alunos`). Header do admin
  tem só a aba **Alunos** (`adminNavItems` em `src/lib/nav.ts`) desde a remoção do agendamento.
- `/admin/aluno/[alunoId]` — admin dentro do ambiente do aluno (modo assistência, editável).
- `/cadastro` — auto-cadastro do aluno (Supabase signUp, metadata `origem=gps`).
- `/admin/solicitacoes` — fila de solicitações de acesso (aprovar/recusar, match por e-mail).
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
**removido** da UI; `ESTRUTURA_PASTA` em `pasta.ts` continua sem uso.)

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
- [ ] **Agendar o `pg_cron` do `primeiro_acesso`** — 1 comando, ver `ATIVAR-DIARIO-EVENTOS.md`.
      Sem isso, quem entrar depois do backfill não tem o evento capturado.
- [ ] Endurecer RLS de `thb_alunos` (ver acima) antes de abrir o cadastro a alunos reais.
      **Parcialmente resolvido:** um aluno logado hoje só enxerga a própria linha (conferido em
      31/07 simulando o JWT do aluno) — confirmar se as policies antigas `read_authenticated`
      ainda existem.
- [ ] Verificar cadastro real ponta a ponta. (A dúvida sobre o GoTrue está respondida:
      `mailer_autoconfirm = true`, ou seja, o aluno entra sem confirmar o e-mail.)
- [ ] Executar o deploy na Hostinger (clonar, `npm install`, `npm run build`, iniciar app).
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
_Última atualização: 2026-09-08 (noite) — **Fases 1–4 e 8 das 9 features do Marcio**:
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
