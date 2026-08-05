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
de tarefa pelo admin — `modo` ∈ {realce, esmaecer}, PK aluno/etapa/tarefa), `gps.reuniao_agendamentos`
(a reunião de implementação: 1 por aluno via `unique(aluno_id)`; guarda `cliente_id` do favorito
e `link_live` — **ambos nullable** desde 2026-07-28, pois o admin pode agendar antes de o aluno
favoritar/ter link), `gps.reuniao_horarios` (a grade de horários, **editável pela equipe**),
`gps.reuniao_eventos` (trilha de cada reunião, escrita só por trigger) e `gps.reuniao_bloqueios`
(o que a equipe fecha; coluna `horario`: **NULL = quarta inteira**, **preenchido = só aquele slot**;
índices únicos parciais por caso; as **datas** da grade são geradas em código, `src/lib/reuniao.ts`).
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
- **Cliente favoritado** (`FavoritoDestaque`, compartilhado aluno/admin): infos do cliente +
  **reunião com a equipe**.

  **Modelo atual (2026-08-05): o aluno SOLICITA, a equipe CONFIRMA.** Marcar não é reservar: a
  reunião só vale quando a equipe responde. Ciclo em `gps.reuniao_agendamentos.status`:
  - `pendente` — o aluno solicitou. **Segura o slot** (índice único parcial
    `(data,horario) where status <> 'recusada'`), então ninguém mais pede aquele horário.
  - `confirmada` — a equipe garantiu presença. Só a equipe põe esse status.
  - `recusada` — "não vou conseguir participar". **Libera o slot** e o aluno escolhe outro horário;
    a linha fica com `motivo_recusa` para o aluno ler.

  **O status nunca vem do cliente.** O trigger `gps.reuniao_guardar_status` (SECURITY DEFINER,
  BEFORE INSERT/UPDATE) decide pelo papel de quem escreve: aluno sempre cai em `pendente`; aluno que
  troca de data/horário **volta para `pendente`** (a confirmação anterior não vale mais); aluno que
  edita só link/pauta **preserva** a decisão da equipe. O mesmo trigger valida, para o aluno, data no
  passado, horário inativo e bloqueio — mesmo que alguém chame o PostgREST direto. A equipe pode
  furar a própria grade (é ela quem fecha os horários). Testado simulando os dois JWTs.

  **Grade editável (`gps.reuniao_horarios`).** Os horários deixaram de ser CHECK fixo (eram
  10/13/16h) e viraram tabela com FK — a equipe abre/fecha/cria horário no botão
  **"Disponibilidade"** do calendário (`DisponibilidadeHorarios`). `ativo = false` some da grade do
  aluno **sem apagar histórico**; remover só é possível se nenhuma reunião apontar para o horário
  (FK RESTRICT). Fechar **uma quarta** ou **um horário de uma semana** continua sendo bloqueio.
  `HORARIOS_REUNIAO` em `src/lib/reuniao.ts` virou só fallback; a fonte é `getHorariosReuniao()`.

  **Aluno:** `ReuniaoAgendarModal` deixa explícito que é solicitação; favorito, **link** e **pauta**
  (o que ele precisa resolver, mín. 15 caracteres) são obrigatórios — é o que a equipe lê para
  decidir e se preparar. O card mostra o status com cor e o que fazer a seguir (`ROTULO_STATUS`).
  **Equipe:** `/admin/reunioes` abre com a **fila de solicitações pendentes** (`SolicitacoesReuniao`,
  de hoje em diante, inclusive de semanas futuras) e um contador na aba do menu. `ReuniaoResponder`
  dá "Confirmar presença" e "Não vou conseguir" (motivo obrigatório na prática + opção de **fechar o
  horário para todos**). Agendar pela equipe (`AgendarAlunoModal`) já nasce **confirmada**.
  **Avisos:** e-mail ao aluno na confirmação, na recusa e no cancelamento feito pela equipe
  (`enviarReuniaoConfirmada`/`enviarReuniaoRecusada`); falha de envio não desfaz a ação.
  **Trilha:** `gps.reuniao_eventos` grava por trigger cada passo (solicitada/remarcada/confirmada/
  recusada/cancelada, com autor e se era equipe). Aluno só lê a própria.

  Actions em `src/app/reuniao/actions.ts` (`agendarReuniao`, `confirmarReuniao`, `recusarReuniao`,
  `cancelarReuniao`, `bloquearQuarta`, `desbloquearQuarta`, `bloquearSlot`, `desbloquearSlot`,
  `criarHorarioReuniao`, `definirHorarioAtivo`, `removerHorarioReuniao`, `buscarAlunosParaAgenda`).
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
  tem abas **Alunos / Reuniões** (`adminNavItems` em `src/lib/nav.ts`).
- `/admin/reunioes` — fila de solicitações a responder + calendário da semana (quartas, horários de
  `gps.reuniao_horarios`), navegação por semana, disponibilidade, bloquear/liberar data ou horário.
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

## ⚠️ Pendências de segurança (antes de dar login a alunos)

Hoje `public.thb_alunos` tem SELECT com `qual: true` p/ **qualquer autenticado** (2 policies:
`read_authenticated`, `thb_alunos_read_authenticated`). Isso era seguro só porque apenas a equipe
tinha login. **Ao provisionar login para alunos, um aluno logado conseguiria ler os 2.459 alunos.**
Endurecer com policy que restrinja o aluno à própria linha — mas cuidado: é tabela compartilhada
com o `sip` ao vivo. Coordenar antes de aplicar. O GPS em si (schema `gps`) já está seguro.

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
- [x] **Agendamento de reunião reconstruído (2026-07-28):** grade fixa (quartas 09/11/13/15h),
      aluno se encaixa num slot livre + cola o link da live, 1 por aluno, sempre com o favorito;
      remarcar/cancelar; aba admin `/admin/reunioes` (calendário + bloquear data). Substituiu
      `gps.reuniao_janelas` (removida) por `gps.reuniao_agendamentos` + `gps.reuniao_bloqueios`.
- [x] **Reunião por solicitação + confirmação (2026-08-05):** o aluno solicita (com pauta), a equipe
      confirma ou recusa com motivo (podendo fechar o horário), e-mail em cada resposta, trilha em
      `gps.reuniao_eventos`, grade de horários editável (`gps.reuniao_horarios`) e fila de pendentes
      no `/admin/reunioes`. Migração `gps_reuniao_solicitacao_e_confirmacao`; status blindado por
      trigger no banco (aluno não se autoconfirma). As 5 reuniões que já existiam viraram
      `confirmada` — ninguém perdeu horário.
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
_Última atualização: 2026-08-05 — **agendamento virou solicitação + confirmação da equipe**
(`status` pendente/confirmada/recusada em `gps.reuniao_agendamentos`, blindado por trigger;
pendente segura o slot, recusada libera), **grade de horários editável** (`gps.reuniao_horarios`,
botão "Disponibilidade"), **fila de pendentes** e resposta da equipe em `/admin/reunioes`, **pauta
obrigatória** do aluno, e-mails de confirmação/recusa/cancelamento, trilha em `gps.reuniao_eventos`.
Build verde; fluxo testado no banco simulando JWT de aluno e de admin (11 cenários)._

_Anterior: 2026-07-09 — fichário de documentos removido da ficha do cliente; Etapa 01 reestruturada (1.1/1.2, passo 6 absorvido, indicador p/ Clientes); ênfase de tarefas com override do admin (`gps.tarefa_enfase`); home com "continue de onde parou" + cliente favoritado em destaque e agendamento por janelas (`gps.reuniao_janelas`); Etapa 05 travada por favorito; busca de aluno tolerante; mapa da pasta removido. **Cadastro manual de aluno fora da base** (`CadastrarAlunoForm` + action `cadastrarAluno` + função `gps.aluno_por_documento`), com validação de dígitos do CPF/CNPJ e guarda contra CPF duplicado. Build verde. Próximo: verificar domínio na Resend + `RESEND_API_KEY` na Hostinger._
