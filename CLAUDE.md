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
de tarefa pelo admin — `modo` ∈ {realce, esmaecer}, PK aluno/etapa/tarefa), `gps.reuniao_janelas`
(dias que a equipe disponibiliza p/ a reunião do cliente favoritado; aluno marca `escolhida`,
índice único parcial de 1 escolhida por aluno).
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
  **agendamento da reunião com a equipe** (o admin abre janelas em `gps.reuniao_janelas`; o aluno
  escolhe uma → data oferecida ao cliente).
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
- **Documentos do cliente**: removidos da ficha (componente `DocumentosSection`, helper
  `getDocumentos` e o tipo `Documento`). O bucket `gps-documentos` e a tabela `gps.documentos`
  seguem existindo no Supabase, sem uso pelo app — os documentos do aluno vivem na
  **pasta do Drive**. Se forem descartados de vez, apagar bucket + tabela.

## Rotas

- `/login` — login e-mail/senha (Supabase Auth). `/auth/signout` (POST).
- `/` — Início do aluno (mapa das 6 etapas; admin → `/admin`; sem vínculo → aviso).
- `/etapa/[n]` — guia da etapa. `/clientes` e `/clientes/[id]` (ficha+docs).
- `/materiais` — **acervo**: aulas + modelos de todas as etapas (busca/filtro por tipo), agregados
  de `CONTEUDO_ETAPAS` por `src/lib/materiais.ts` (`listarMateriais`). Navegação por abas com ícones
  (Início/Clientes/Materiais) em `NavTabs`.
- Admin espelha em `/admin/aluno/[id]`, `.../etapa/[n]`, `.../clientes`, `.../clientes/[id]`, `.../materiais`.
- `/admin` — lista de alunos no GPS + "Adicionar aluno" (busca em `thb_alunos`).
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
      travada até haver favorito; agendamento por janelas da equipe (`gps.reuniao_janelas`).
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
- [ ] Endurecer RLS de `thb_alunos` (ver acima) antes de abrir o cadastro a alunos reais.
- [ ] Verificar cadastro real ponta a ponta (depende da config de confirmação de e-mail do GoTrue).
- [ ] Executar o deploy na Hostinger (clonar, `npm install`, `npm run build`, iniciar app).
- [ ] Deixar o repositório privado, se desejado (`gh repo edit --visibility private`).
- [x] E-mails transacionais (Resend): credenciais + acesso liberado (`src/lib/email.ts`).
- [x] Domínio do portal trocado para `programa.timeholdingbrasil.com.br` (envs, `next.config.ts`,
      fallbacks de `email.ts` e `senha-actions.ts`).
- [ ] **Supabase Auth → URL Configuration**: trocar o *Site URL* e incluir
      `https://programa.timeholdingbrasil.com.br/**` nas *Redirect URLs*. Sem isso, o link de
      redefinição de senha (`/auth/confirm?next=/auth/redefinir`) volta para o domínio antigo.
- [x] `RESEND_API_KEY` configurada no painel da Hostinger (prod). **Atenção:** a chave do
      `.env.local` (dev) continua sendo recusada (`API key is invalid`) — trocar para testar
      envio localmente.
- [ ] **Verificar `programa.timeholdingbrasil.com.br` na Resend** (adicionar o domínio no painel
      e publicar DKIM + SPF + MX). Checado por DNS em 2026-07-09: `resend._domainkey.programa…`
      dá NXDOMAIN. Já existe DKIM na **raiz** `timeholdingbrasil.com.br` (us-east-1) e no antigo
      `gps.` (sa-east-1) — mas não no subdomínio novo, que é o do `EMAIL_FROM`. Enquanto não
      subir, o envio falha em silêncio (as funções de `email.ts` nunca lançam).
- [ ] Apontar o DNS do novo domínio para a Hostinger e ajustar o vhost/SSL.

### Como testar agora
Admin já pode entrar: os 16 `perfis` (incl. marcio@advmais.com, cargo dev) usam a **senha
Supabase existente**. `npm run dev` → `/login` → adicionar um aluno em `/admin` → abrir o
ambiente e preencher a Etapa 01.

---
_Última atualização: 2026-07-09 — fichário de documentos removido da ficha do cliente; Etapa 01 reestruturada (1.1/1.2, passo 6 absorvido, indicador p/ Clientes); ênfase de tarefas com override do admin (`gps.tarefa_enfase`); home com "continue de onde parou" + cliente favoritado em destaque e agendamento por janelas (`gps.reuniao_janelas`); Etapa 05 travada por favorito; busca de aluno tolerante; mapa da pasta removido. **Cadastro manual de aluno fora da base** (`CadastrarAlunoForm` + action `cadastrarAluno` + função `gps.aluno_por_documento`), com validação de dígitos do CPF/CNPJ e guarda contra CPF duplicado. Build verde. Próximo: verificar domínio na Resend + `RESEND_API_KEY` na Hostinger._
