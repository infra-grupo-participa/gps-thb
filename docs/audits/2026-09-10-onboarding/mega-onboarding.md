# Mega feature — Onboarding do aluno · Cadastro do cliente · Dashboard executivo do admin

Scratchpad da squad (10/09/2026). Cada agente lê o que os anteriores escreveram e acrescenta a sua seção no fim. Orquestrador: Claude (sessão principal). Modelos: arquiteto/back/front em **Opus**; pentest; Fable por último.

## 0. Pedido do João (literal, 10/09/2026)

> ONBOARDING (APÓS O CLIENTE ACESSAR PELA PRIMEIRA VEZ, ISSO VAI EXIBIR PARA TODOS SEM EXCEÇÃO)
>
> - Garantir o acesso de todos os alunos (Senha padrão para os que não tiverem acesso acessar e redefinir a senha)
> - Assim que ele ingressar tem que abrir um pop-up, com o seguinte campo para ele responder:
>   "No Programa de Implementação Assistida, nós faremos junto com você a sua primeira Holding. De onde virá o seu cliente 1, este que nós faremos a Holding juntos?"
>   1. Quero que façamos desde a captação, porque ele virá de lá.
>   2. Eu já tenho esse cliente e quero começar por ele → Em que fase da implementação você se encontra com este cliente, opções:
>      - Sessão de viabilidade já realizada e Croqui estrutural a apresentar
>      - Croqui Estrutural já apresentado e aguardando a execução
>      - Execução em andamento (Obrigatório ele informar o valor do contrato dos honorários e anexar o contrato de honorários assinado, sem isso ele não pode avançar) (Essa parte é fundamental pois a partir do valor do contrato ele está apto para pagar os 15k restantes do programa, caso ele já tenha uma execução em andamento)
> - Precisa vir um campo com o valor do honorários pactuado
> - Descreva o seu caso (Campo para ele preencher como está o rumo da execução da holding)
> - No que podemos te ajudar de pronto? (pergunta com campo para espaço aberto)
> - Anexo de documentos necessários
>
> CADASTRO DO CLIENTE:
> - O cliente favoritado não pode ser alterado sem o consentimento da equipe
>   - A equipe ao marcar que ele está acompanhando, o aluno não pode alterar mais
> - Na parte do diário, quando alguém mencionar outra pessoa (igual no whatsapp) a notificação cai no slack.
> - Dentro do cadastro do cliente, o cliente deveria poder descrever qual o grau de relação com a pessoa (parente, amigo, lead normal, etc)
> - Visão macro e persistência de scrollagem na tela, ou seja, quando definir um filtro e parar em determinada parte da lista, por exemplo, se eu sair da visualização do aluno, deve voltar pra onde eu parei.
>
> OBS:
> - O aluno pode cadastrar clientes que ele já tem, casos em andamento que ele precisa de ajuda, novos casos, casos em execução, tipo uma central para concentrar todos os seus clientes, independente do status, reunidos dentro do portal.
>
> [Complemento falado] É uma mega feature: micro coisas que formam uma feature grande. O onboarding segue uma linha, um passo a passo. Aproveitar o gancho para, no onboarding, colocar a **apresentação do sistema**: como funciona cada funcionalidade, de forma abrangente, para eles entenderem o que o sistema quer dizer. A finalidade do sistema é auxiliar advogados e contadores que querem fechar a sua primeira holding — o todo tem que fazer sentido, feature integrada ao sistema inteiro, não empilhada. O cadastro do cliente está embutido com a visão macro e a persistência de scroll, que faz parte da **tela inicial do admin**: uma visualização macro no começo e uma por pessoa em tabela, como já existe. Como principal, um **dashboard executivo** com gráficos de barras, pizza e linhas, que façam sentido no sistema como um todo: bater o olho no menu de admin e saber a performance média, quantas pessoas entraram no mês — micro KPIs dentro de uma macro KPI (ex.: 188 pessoas no sistema, quantas entraram no mês, no mesmo card). Bater o olho e entender o fluxo do sistema como um todo, para saber onde atacar: cada funcionalidade ou cada pessoa com dificuldade. Pipeline: arquiteto concebe tudo → back/front executam → pentest → orquestrador valida o todo; reprovou → mais uma rodada. Mínimo de erros. Seguir os pilares do projeto.

## 1. Contexto que a squad já tem (não refazer)

- `CLAUDE.md` do repo (fonte de verdade; ~1.600 linhas). Seções decisivas: "Papéis / acesso", "Onboarding do aluno (modelo definido)", "Gerenciar acesso do aluno", "Cliente tem FASE, não status", "📓 Diário do aluno" (LGPD: só admin), "💰 Financeiro v2", "🩺 Central de resolução", "🎨 Redesign Trilha", "Rodada final de qualidade (b) regras", "Dados alterados a mão em 09/09".
- Brain: `C:\Users\João\gps-brain\` (Home + Diário 08/09, 09/09, 09/09-noite).
- Specs anteriores em `docs/audits/2026-09-09-central/` (central-resolucao.md tem o formato de spec que funcionou: decisões, contratos, bloco de conferência B0–B9, vetores de pentest).
- Estado do banco (10/09): 171 `gps.membros` (todos com ambiente e pessoa desde a `…187`), ~128 ambientes ativos, 19+ membros sem `user_id`; `auth.users` compartilhado por 7 sistemas do grupo (senha é global — regra dura); `public.thb_alunos` 2.459 (base compartilhada com o sip, GPS só lê); `gps.etapa1_clientes` (~880; `fase` prospeccao/fechamento/contratado, `nivel_relacionamento`, `valor_honorarios`, `contrato_url` = LINK do Drive, `acompanhado_equipe` = favorito único por ambiente); `gps.aluno_notas` (diário, só admin, `texto` livre); `gps.aluno_eventos` (append-only por trigger); `gps.chamados` + bucket privado `gps-chamados` (precedente de anexo: 5 MB, png/jpeg/webp/pdf, path `<aluno_id>/<uuid>.<ext>`, MIME conferido em `storage.objects.metadata` pela RPC, `download=` sempre); `gps.config` (chaves de configuração; policy só-admin — segredo NÃO pode ficar legível por admin via REST); `gps.admin_painel_alunos(p_limite, p_offset)` (RPC agregada do painel, 125 linhas 7,7 ms), `gps.admin_painel_atendimento()`.
- Padrões obrigatórios: RPC SECURITY DEFINER com `public.gp_is_admin()` → 42501 na 1ª linha, `set search_path=''`, `revoke ... from public, anon` (e de `authenticated` quando interna — o projeto tem ALTER DEFAULT PRIVILEGES que concede execute a authenticated), nunca `service_role`, RLS em toda tabela `gps.*`, `gps.aluno_atual()` = ambiente, guarda com `coalesce(..., false)`; `drop function` antes de recriar com assinatura nova; toda escrita administrativa em `gps.acessos_log` (CHECK em `acao`) e/ou `gps.aluno_eventos` (CHECK em `tipo`); erro nunca cru (`traduzirErroBanco`), `logErro`; `emailValido`; formatadores só `moeda.ts`/`datas.ts`; `text-accent-foreground`; `DialogoConfirmacao` em tudo que apaga/tranca; `PageHeader` + `<main id="conteudo">`; consultas novas em `src/lib/data/<assunto>.ts`; componente grande em pasta com `index.tsx` ≤ 400 linhas; sem dado fake; sem tema escuro; sistema visual "Trilha" (Card/Badge/Secao/KpiCard/Progress/BarraMarcos/AvisoInline, `@utility` tipográfica, tokens semânticos); bundle `/login` ≤ 245 KB gzip; nada de `service_role`; nenhuma copy inventando número (bônus, preço) que o Marcio não deu.
- Decisões anteriores que este pedido TENSIONA (o arquiteto tem de tratar cada uma explicitamente): (a) "documento do cliente vive no Drive, não no GPS" (07/2026) × "anexar o contrato de honorários assinado" (agora, obrigatório); (b) "o aluno é dono do favorito" × "a equipe trava o favorito"; (c) senha única para todos × `auth.users` compartilhado por 7 sistemas (senha padrão igual para todos é inaceitável em segurança; o objetivo é acesso garantido + redefinição obrigatória); (d) Diário é só-admin (LGPD) × menção a colegas com notificação no Slack (o texto não pode sair do perímetro; a notificação deve carregar o mínimo); (e) "Sem dados fake" × dashboard precisa mostrar algo com base pequena.

## 2. O que a squad deve entregar (visão do orquestrador; o arquiteto refina)

1. **Onboarding do aluno** (obrigatório para TODOS os alunos, uma vez, com retomada): passo 0 acesso (quem não tem login recebe acesso garantido + troca de senha obrigatória no 1º acesso); passos do questionário (origem do cliente 1 → fase → honorários + contrato assinado quando "execução em andamento"; descreva o caso; no que podemos ajudar; anexos); **tour do sistema** (o que é cada aba, integrado ao propósito: fechar a 1ª holding); resultado visível para a equipe (Central/Diário/painel) e para o próprio fluxo (ex.: quem já tem cliente em execução entra com o cliente criado e favoritado; "apto a pagar os 15k restantes" vira sinal para a equipe, NÃO cobrança automática).
2. **Cadastro do cliente**: favorito travado quando a equipe marca acompanhamento (com caminho de destravar pela equipe e log); "grau de relação" (parente, amigo, lead, indicação…) além do `nivel_relacionamento` existente; central de todos os clientes independentemente do estágio (revisar `fase`: prospecção/fechamento/contratado cobre "execução em andamento"? o arquiteto decide, sem quebrar o backfill de 09/09).
3. **Diário com @menção** → notificação no Slack (webhook por config, mínimo de dado, falha não bloqueia a nota).
4. **Painel do admin**: dashboard executivo (macro → micro): KPIs com número + variação no mês + gráfico (barras/pizza/linhas) — entradas por mês, distribuição por etapa/fase, funil de clientes, honorários, acessos; tabela por pessoa continua; **persistência de filtro/ordenação/rolagem** ao voltar do ambiente do aluno.

## 3. Regras de pipeline (desta tarefa)

- Arquiteto (Opus) escreve a concepção INTEIRA aqui: modelo de domínio, migrações, RPCs, contratos TS, telas/fluxos com copy em pt-BR, ordem de ondas, divisão back/front, bloco de conferência, vetores de pentest, **CONFLITOS** (com a decisão que ele propõe) e **BLOQUEIOS** (só o que o João precisa decidir; o orquestrador decide o resto).
- Backend/Frontend (Opus) executam por ondas, publicam contratos aqui; nada de commit por agente.
- Pentest obrigatório (auth.users, storage, Slack webhook, dashboard = leitura agregada de PII).
- Fable por último, com implementação pronta. Reprovou → correção → Fable de novo.
- Migrations aplicadas pelo orquestrador (MCP) ANTES do push; push na `main` publica.

---
## 3b. Medições do orquestrador (10/09, banco de produção, leitura)

- Ambientes: **158** (distintos em `gps.membros`); titulares **sem login: 19**; titulares com login que **nunca entraram: 3**; membros que já entraram: 149.
- Entradas de titular por mês (`membros.criado_em`, SP): **2026-07 = 68 · 2026-08 = 40 · 2026-09 = 50**.
- Clientes por fase: **prospeccao 841 · fechamento 37 · contratado 0**. `valor_honorarios` preenchido: **0**. `contrato_url`: **0**. Favoritos (`acompanhado_equipe`): **25**. `nivel_relacionamento`: quente 200 · morno 231 · frio 233 · null 214.
- Equipe (`public.perfis` ativos): **20** (admin 16, gestor 1, dev 3) — universo das @menções.
- `gps.config`: policy única `gps_config_admin [ALL]` → **qualquer admin lê `resend_api_key` pela REST** (risco real; segredo novo do Slack NÃO pode entrar aí do mesmo jeito).
- Buckets: `gps-chamados` (privado, 5 MB, png/jpeg/webp/pdf) — molde para o contrato assinado; `gps-documentos` (privado, sem limite, sem allowlist, órfão — não usar).
- Diário: 23 notas; tarefas concluídas no total: 27; `gps.progresso` é esparso.
- `gps.membros` colunas: id, aluno_id, user_id, data_agendamento_disponivel, criado_em, atualizado_em, pasta_drive_url, perfil, papel, pessoa_aluno_id.


---

# 4. Concepção do arquiteto

> `arquiteto` (Opus) · 10/09/2026 · alvo: `main` pós `48fc5b9`
> Escopo: onboarding do aluno · cadastro do cliente · dashboard executivo do admin.
> **Nenhuma linha de `src/` é escrita aqui.** Quem executa é `backend-engineer` e
> `frontend-engineer` (Opus); quem audita é o `security-pentester`; quem julga é o
> `fable-orchestrator`. Formato herdado de `docs/audits/2026-09-09-central/central-resolucao.md`.

---

## A. Leitura do pedido (uma página)

### A.1 O que o aluno tem de sentir

O aluno do Programa é advogado ou contador que **nunca fechou uma holding**. Ele compra um
acompanhamento, entra num portal que não conhece, e a primeira coisa que vê hoje é um mapa de 6
etapas com 5 cadeados. O produto não pergunta nada a ele; ele é que tem de adivinhar por onde
começar.

O que o João pediu inverte isso: **na primeira vez que ele entra, o sistema pergunta.** E a
pergunta não é burocrática — é a pergunta do negócio: *"de onde virá o seu cliente 1?"*. A partir
da resposta, o portal deixa de ser genérico:

- quem **já tem** o cliente entra com esse cliente **criado, favoritado e na fase certa** — os
  passos 4 a 8 da Etapa 01 destravam no primeiro minuto, e a home passa a mostrar uma pessoa de
  verdade no card do favorito, não um vazio;
- quem **vem da captação** entra sabendo que a lista dos 30 é o começo, e o tour explica por quê;
- os dois saem do onboarding sabendo **o que é cada aba** e como ela serve a fechar a 1ª holding.

O sentimento-alvo em uma frase: *"o sistema sabe quem eu sou e onde eu estou."*

### A.2 O que a equipe tem de ver

Hoje a equipe tem 158 ambientes e três telas que respondem perguntas de UM aluno por vez
(Central, Diário, ficha). Não existe nenhuma tela que responda **"onde atacar hoje?"**. O painel
começa com 4 KPIs de contagem (alunos, com login, sem login, solicitações) e uma lista.

O pedido do dashboard é isso: macro → micro. **Todo gráfico tem de terminar num clique que leva
à lista filtrada de gente.** Gráfico bonito que não vira ação é ornamento, e ornamento é o
oposto da regra de otimização da casa.

E o que a equipe passa a ver de novo, graças ao onboarding, é o que hoje ela não tem em lugar
nenhum: **quantos alunos já têm um caso real na mão** — e, desses, quantos estão em execução com
contrato assinado. Esse é o número que muda a operação: é onde a equipe cobra o saldo do
programa, é onde ela sabe que a implementação começou de verdade.

### A.3 A regra que decide o que entra

> **Uma peça só entra se ela mudar o que alguém faz depois de ver.**
> Onboarding que só coleta = formulário. Onboarding que cria o cliente 1, favorita, destrava a
> etapa e acende um chip no painel = produto.
> Gráfico que só informa = ornamento. Gráfico que leva à lista filtrada = ferramenta.

### A.4 Com que peça existente cada coisa conversa (regra de não empilhar)

| Peça nova | Conversa com | Substitui / absorve |
|---|---|---|
| Onboarding (pop-up) | `proximoPasso`, `etapa1_clientes`, `aluno_eventos`, Central, painel | absorve o "primeiro acesso", que hoje só existe como linha de log |
| Tour do sistema | `navDoAluno(ctx)` — itera as abas REAIS da pessoa | substitui a ajuda inexistente; nada de tela de FAQ |
| Cliente 1 | `etapa1_clientes` + `acompanhado_equipe` + `FASES_CLIENTE` | **não cria fase nova** (§B.4) |
| Trava do favorito | `acompanhado_equipe`, `definirClienteEquipe`, `Etapa1Guide` | dá nome ao segundo estado que o boolean já misturava |
| Grau de relação | `nivel_relacionamento` (temperatura) | **não** substitui: é outro eixo (§B.6) |
| @menção no Diário | `registrarNota`, `public.perfis`, `gps.config` | primeiro canal de saída do Diário — e o mais restrito possível |
| Persistência do painel | `?mais=`, que já mora na URL | estende o mecanismo existente, não inventa outro |
| Dashboard | `admin_painel_alunos`, `admin_painel_atendimento` | **absorve os 4 KPIs de hoje** e acrescenta 1 RPC, nenhuma consulta por card |

---

## B. Modelo de domínio

### B.1 O onboarding é da PESSOA, não do ambiente

`gps.aluno_atual()` devolve o **ambiente** (do titular). Cliente, progresso, pasta e chamado são
do ambiente — titular e sócio dividem. Mas o onboarding é uma **conversa com uma pessoa**: *"de
onde virá o **seu** cliente 1"*. São 13 sócios em 13 ambientes; se a chave fosse o ambiente, o
sócio nunca seria perguntado e **nunca veria o tour** — que é a metade mais importante da
feature ("apresentação do sistema").

**Chave: `pessoa_aluno_id`** (`public.thb_alunos.id`), a mesma identidade que a Central
estabeleceu em `gps.membros.pessoa_aluno_id` (backfill de 09/09: 0 membros sem pessoa; índice
único parcial `membros_pessoa_uk`, migração `…160`). Motivos:

- sobrevive a `admin_mover_membro` e a remover/recriar o membro — `gps.membros.id` não;
- é a identidade que o Diário, a Central e `senha-actions` já usam para dizer "quem é essa gente";
- os 19 titulares sem login simplesmente não têm linha até responderem.

**Consequência que precisa estar escrita na tela:** o onboarding é por pessoa, mas o **efeito
colateral (o cliente 1) é do ambiente**. Se o sócio responder "já tenho esse cliente" num
ambiente que já tem favorito, o cliente é criado **sem favoritar**, e a tela diz: *"A equipe já
acompanha <Nome>. Este cliente entrou na sua lista de clientes."* Sem essa regra, o segundo a
responder derrubaria o favorito do primeiro em silêncio — e o índice único parcial de
`acompanhado_equipe` transformaria isso em erro de banco no meio do onboarding.

### B.2 `gps.onboarding_respostas` — retomável, versionado, tipado + texto livre

```sql
-- RASCUNHO COMENTADO — o backend transforma em migration …204
create table gps.onboarding_respostas (
  pessoa_aluno_id    uuid primary key references public.thb_alunos(id) on delete cascade,
  -- O ambiente onde a pessoa estava ao responder. Denormalizado de propósito:
  -- é por ele que o cliente 1 é criado e é por ele que o admin acha a resposta
  -- na Central. Se a pessoa for movida de ambiente depois, a resposta continua
  -- contando a verdade de quando foi dada -- histórico não se reescreve.
  ambiente_aluno_id  uuid not null references public.thb_alunos(id),
  -- VERSÃO DO QUESTIONÁRIO. 1 = o texto que o João escreveu em 10/09/2026.
  -- Mudar pergunta depois NÃO reabre o pop-up de quem já respondeu (§D.7);
  -- a versão existe para a equipe saber a QUE pergunta a resposta responde.
  versao             smallint not null default 1 check (versao between 1 and 99),
  -- Retomada: o passo em que a pessoa parou (0..9). Gravado a cada avanço.
  passo_atual        smallint not null default 0 check (passo_atual between 0 and 9),
  iniciado_em        timestamptz not null default now(),
  concluido_em       timestamptz,                    -- null = em andamento
  -- RESPOSTAS TIPADAS (CHECK fechado -- é o que o dashboard agrega)
  origem_cliente1    text check (origem_cliente1 in ('captacao','ja_tenho')),
  fase_cliente1      text check (fase_cliente1 in (
                        'viabilidade_feita',      -- "Sessão de viabilidade já realizada e croqui a apresentar"
                        'croqui_apresentado',     -- "Croqui já apresentado e aguardando a execução"
                        'execucao_andamento')),   -- "Execução em andamento"
  valor_honorarios   numeric(12,2) check (valor_honorarios is null or valor_honorarios >= 0),
  -- O cliente que ESTA resposta criou. on delete set null: o aluno pode apagar
  -- o cliente depois, e a resposta continua sendo história verdadeira.
  cliente_id         uuid references gps.etapa1_clientes(id) on delete set null,
  -- TEXTO LIVRE (as duas perguntas abertas do João)
  descricao_caso     text check (descricao_caso is null or char_length(descricao_caso) between 1 and 4000),
  ajuda_pronta       text check (ajuda_pronta   is null or char_length(ajuda_pronta)   between 1 and 4000),
  atualizado_em      timestamptz not null default now(),
  -- Coerência mínima, SEM catraca (lição B9-b): a fase só existe quando a
  -- origem é 'ja_tenho'. NÃO amarra honorários à fase -- voltar atrás não pode
  -- exigir apagar dado.
  constraint onboarding_fase_so_com_cliente
    check (fase_cliente1 is null or origem_cliente1 = 'ja_tenho')
);
```

**Anexos em tabela própria**, porque são N e porque o contrato tem regra diferente dos
"documentos necessários":

```sql
create table gps.onboarding_anexos (
  id              uuid primary key default gen_random_uuid(),
  pessoa_aluno_id uuid not null references gps.onboarding_respostas(pessoa_aluno_id) on delete cascade,
  -- 'contrato_honorarios' é ÚNICO por pessoa (unique parcial abaixo) e é o que
  -- a regra de obrigatoriedade cobra. 'documento' é a lista aberta do passo 7.
  tipo            text not null check (tipo in ('contrato_honorarios','documento')),
  path            text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$'),
  nome            text not null check (char_length(nome) between 1 and 120),
  mime            text not null check (mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  tamanho         integer not null check (tamanho between 1 and 5242880),
  criado_em       timestamptz not null default now()
);
create unique index onboarding_contrato_unico on gps.onboarding_anexos (pessoa_aluno_id)
  where tipo = 'contrato_honorarios';
```

- **RLS**: `select`/`insert`/`update` para o dono (a pessoa da sessão) e tudo para
  `gp_is_admin()`. **Sem `delete` para o aluno** nas respostas — resposta é histórico. O anexo,
  sim, pode ser trocado (o `unique` parcial força substituir, e a substituição é uma RPC).
- **A pessoa da sessão** resolve-se por `gps.membros.pessoa_aluno_id where user_id = auth.uid()`.
  Isso vira **`gps.pessoa_atual()`** (SECURITY INVOKER, guarda com `coalesce(..., false)` — lição
  de `etapa_liberada_para`, que falhava ABERTO sem JWT), irmã de `gps.aluno_atual()`.
  **É a única função nova de contexto** e paga uma dívida existente: `src/lib/auth.ts:95-106` faz
  um `ilike` em `thb_alunos.email` **em toda requisição de sócio** só para descobrir quem ele é, e
  `pessoa_aluno_id` já existe desde a `…154`. **Crédito de otimização: `getContextoSessao` passa
  a ler `pessoa_aluno_id` da MESMA linha de `gps.membros` que já lê — uma consulta a menos por
  requisição de sócio.**

### B.3 Bucket `gps-onboarding` — o contrato é PROVA, não fichário

Molde: `gps-chamados` (privado, 5 MB, `png/jpeg/webp/pdf`, path `<uuid>/<uuid>.<ext>`, policies
por prefixo, MIME/tamanho conferidos em `storage.objects.metadata` pela RPC, `download=` sempre).
**Prefixo = `ambiente_aluno_id`** (não a pessoa): mantém as guardas idênticas às do chamado
(`gps.aluno_atual()`), que já foram auditadas duas vezes. **Não usar o `gps-documentos` órfão**
(sem limite de tamanho, sem allowlist de MIME).

Diferenças do chamado, todas para menos:

- **quem lê**: o admin e **os membros do ambiente**. O sócio lê — é o mesmo ambiente e o mesmo
  cliente. (O Financeiro é exceção por ser contrato do titular com a empresa; aqui não é o caso.)
- **quem escreve**: só o aluno. A equipe não anexa, igual ao chamado (B5-c).
- **retenção**: BLOQUEIO B-R1 (§I.2).

### B.4 O cliente 1 e as 3 fases — **nenhuma fase nova**

As três opções do João mapeiam sem sobra nas 3 fases existentes, e os textos de ajuda de
`FASES_CLIENTE` (`src/lib/etapa1.ts:93-115`) já dizem isso literalmente:

| Resposta (literal do João) | `fase` | Por quê |
|---|---|---|
| Sessão de viabilidade já realizada e croqui a apresentar | `fechamento` | ajuda: *"Da reunião preliminar ao croqui estrutural."* |
| Croqui já apresentado e aguardando a execução | `fechamento` | croqui apresentado, contrato **não** assinado |
| Execução em andamento | `contratado` | ajuda: *"Contrato fechado — segue para a execução."* |

**Decisão (CONFLITO C-1): não criar a 4ª fase "execução".** Razões, com número:

1. **`contratado` tem 0 linhas hoje.** `valor_honorarios` preenchido: 0. `contrato_url`: 0. A
   ponta contratada do funil **nunca foi exercitada**. Criar valor novo agora é desenhar sobre
   hipótese, com o custo de reabrir o CHECK, a UI, `resumoHonorarios`, `progressoFaturamento`, a
   CTE `cli` de `admin_painel_alunos` e a coluna do quadro — em cima do backfill de 08/09, que
   custou a decisão "por evidência, não de-para".
2. **A distinção que se perde já fica guardada**: `onboarding_respostas.fase_cliente1` preserva
   as três respostas com a granularidade original. É o **retrato do dia 0**, e é honesto que ele
   fique lá em vez de virar estado vivo que ninguém atualiza.
3. **"Execução em andamento" não é um estado, é um FATO COMPROVADO.** O que a equipe precisa é o
   sinal derivado:

```
apto_ao_saldo := fase = 'contratado'
             AND valor_honorarios IS NOT NULL
             AND existe anexo tipo = 'contrato_honorarios'
```

   Derivado, não armazenado: não desatualiza, não precisa de backfill, não precisa de trigger.
   **É esse o "apto a pagar o saldo do programa"**, e vira chip + filtro no painel. Nenhum valor
   em reais aparece em tela até o João dar o texto (BLOQUEIO B-S1).

**O que muda em `etapa1_clientes`: NADA de estrutura para a fase.** Só a coluna de grau (§B.6) e
as duas de confirmação (§B.5).

⚠️ **Efeito no KPI, obrigatório no plano do frontend:** todo aluno que responder "já tenho" ganha
**+1** em `clientes.preenchidos`. Para não repetir "campo novo nasce vazio", o passo 3 pede
**nome + telefone + grau de relação** — a linha nasce contando também em `comDados`, que é o que
a tarefa 1 cobra. E **`comDados` continua sendo nome + telefone + nível de relacionamento**
(`src/lib/etapa1.ts:313`): acrescentar `grau_relacao` à regra **reabriria a tarefa 1 de quem já a
concluiu**. Proibido nesta rodada.

### B.5 Trava do favorito — o boolean guarda dois conceitos

Hoje `acompanhado_equipe` significa duas coisas ao mesmo tempo:

1. **"foi este que EU escolhi para a equipe acompanhar"** — escolha do aluno, reversível,
   destrava os passos 4–8 da Etapa 01;
2. **"a equipe ACEITOU e está acompanhando"** — não existe em lugar nenhum.

O pedido do João é o (2). **Não é uma trava a mais; é o segundo conceito ganhando nome.**

```sql
-- …203
alter table gps.etapa1_clientes
  add column acompanhamento_confirmado_em  timestamptz,
  add column acompanhamento_confirmado_por uuid references auth.users(id);
```

- `null` → **o aluno é dono da estrela** (comportamento de hoje; 25 favoritos, **backfill zero**
  — ninguém perde direito no dia 1);
- preenchido → **a equipe está acompanhando**: o aluno não troca a estrela, não apaga o cliente e
  não volta a fase para `prospeccao`. Só o admin libera.

**A trava é do BANCO, não da tela.** Trigger `trg_etapa1_clientes_acompanhamento_travado`
(`before update or delete`), no molde do `trg_etapa1_clientes_status_congelado` (`…062`), que
levanta **42501** com frase nossa quando `acompanhamento_confirmado_em is not null` e
`not coalesce(public.gp_is_admin(), false)`. Campos livres continuam livres (registro de contato,
telefone, honorários, DISC): trava o **vínculo**, não a ficha.

- ⚠️ `definirClienteEquipe` (`src/app/clientes/actions.ts:226`) desmarca **todos** antes de marcar
  um. Com um favorito confirmado, o `update ... acompanhado_equipe = false` bate na trava e a ação
  inteira falha — **que é o comportamento certo**, desde que (a) a frase seja boa
  (`traduzirErroBanco` + mapa `FRASES`) e (b) a UI **não ofereça** a estrela nos outros cards
  enquanto houver confirmado. Os dois são tarefa do frontend.
- **Quem confirma/libera**: `gps.admin_confirmar_acompanhamento(cliente_id, motivo)` e
  `gps.admin_liberar_acompanhamento(cliente_id, motivo)` — `gp_is_admin()` ou 42501, motivo
  3..300 obrigatório, log em `gps.acessos_log` (`favorito_confirmado` / `favorito_liberado`) e
  evento em `gps.aluno_eventos`. **Casa de origem: a ficha do cliente no modo assistência** — é
  onde o admin já está olhando o cliente. A **Central** mostra a linha de diagnóstico (`ok=null`,
  informação) com **link** para a ficha: a regra da Central é "nenhuma segunda porta para escrita
  que já existe".
- **O que a ficha mostra ao aluno**: badge *"A equipe está acompanhando este cliente desde
  <data>"*, estrela em somente-leitura com a explicação, e o caminho: *"Precisa trocar? Fale com a
  equipe pelo Suporte."* — **nunca um botão que falha**.

### B.6 Grau de relação — coluna nova, enum fechado

`nivel_relacionamento` (frio/morno/quente) é **temperatura**. O João pediu **tipo de vínculo**
(parente, amigo, lead normal). São eixos ortogonais: existe parente frio e lead quente. Renomear
ou reaproveitar o campo existente destruiria 664 valores preenchidos (200 quente · 231 morno ·
233 frio) para responder outra pergunta.

```sql
-- …202
alter table gps.etapa1_clientes add column grau_relacao text
  check (grau_relacao is null or grau_relacao in
    ('parente','amigo','conhecido','indicacao','cliente_atual','lead'));
```

**Enum fechado, não texto livre**, porque o pedido é explicitamente de **visão macro**: o João
quer filtrar e agrupar ("onde atacar"). Texto livre não agrega — viraria "amigo", "Amigo",
"amigo do pai", e o gráfico morre. Os 6 valores cobrem os 3 exemplos dele mais os 2 óbvios do
negócio; um 7º é uma linha no CHECK e uma no TS (B-G1).

- `null` = não informado, nas 878 linhas. **Nunca exibir como "Lead"** — o padrão não pode ser um
  palpite sobre a vida de terceiro.
- Onde aparece: ficha (Seção "Identificação", ao lado do nível), chip no card da lista, **filtro
  na aba Clientes** e fatia no dashboard.
- ⚠️ **Não entra em `comDados`** (§B.4).

### B.7 @menção no Diário → Slack

**O universo de destinatários é quem PODE LER o diário**, e isso é `public.gp_is_admin()` =
perfil `ativo` **com cargo dev/admin**. Os 20 perfis ativos medidos incluem **1 gestor**, que não
passa no guarda: mencioná-lo mandaria um aviso sobre uma nota que ele **não consegue abrir** —
notificação que não leva a lugar nenhum é exatamente o que treina o time a ignorar aviso.
→ **Mencionável = ativo E cargo em (dev, admin). Esperado 19, não 20. MEDIR M7.**

**A menção é gravada, não reparseada.** Nome muda, apelido colide, `@` aparece em e-mail dentro
do texto. Tabela lateral — a nota continua append-only, a lateral não a edita:

```sql
-- …207
create table gps.nota_mencoes (
  nota_id   uuid not null references gps.aluno_notas(id) on delete cascade,
  perfil_id uuid not null references public.perfis(id),
  criado_em timestamptz not null default now(),
  primary key (nota_id, perfil_id)
);
-- RLS: uma policy de SELECT para gp_is_admin(); insert pela mesma condição do
-- insert de aluno_notas. `anon`: nada. Sem update, sem delete.
```

- O cliente manda `mencoes: string[]` (ids de perfil) junto do texto. **O servidor revalida cada
  id contra ativo + dev/admin** e descarta o que não passar — o cliente escolhe destinatário,
  nunca autoriza. **Teto de 10 menções por nota**: uma nota não vira disparo em massa.
- **O que sai para o Slack — e só isto:**
  `"<Autor> mencionou você no diário de <Nome do aluno> · <link>"`.
  **NUNCA o texto da nota**, nunca o tipo, nunca o nome do cliente do aluno, nunca e-mail ou
  telefone. O link é `https://programa…/admin/aluno/<id>/diario`, que exige login de admin — o
  Slack não vira porta.
- ⚠️ **Um webhook posta num CANAL**, não em DM: os ~19 admins veem *"X mencionou Y no diário de
  Z"*. O nome do aluno é o nome de um cliente da empresa, num canal interno da empresa —
  aceitável. O dado do **cliente do aluno** (terceiro) é que **não pode sair**, e não sai.
  Decisão registrada; se o João quiser DM, é o mesmo payload por `chat.postMessage` (outra
  credencial) e o desenho não muda.
- **Falha no Slack nunca bloqueia a nota**: `registrarNota` grava, depois tenta o webhook com
  timeout de 3 s; erro vira `logErro` e a action devolve `ok: true`. Precedente:
  `enviarChamadoAbertoParaEquipe`.

#### Onde mora o segredo — **não em `gps.config`**

Medido: `gps.config` tem policy única `gps_config_admin [ALL]`, logo **qualquer um dos 16 admins
lê `resend_api_key` pela REST**. Repetir o padrão com o webhook do Slack seria repetir um furo
conhecido.

**Decisão: o webhook mora na env `SLACK_WEBHOOK_MENCOES` (painel da Hostinger) e o disparo sai do
Node**, dentro da própria Server Action.

- o segredo **nunca toca o banco** → nenhum admin o lê pela REST, e ele não aparece em
  `pg_get_functiondef` (a razão pela qual as chaves do Plantão foram para `gps.config` — e é
  justamente isso que criou o problema atual);
- **não precisa de `pg_net` nem de cron**: a menção é síncrona com um clique humano, ao contrário
  do e-mail do Plantão. Sem `net.http_post` assíncrono, **sem a classe de falha das 13:00** (o
  carimbo gravado antes do resultado);
- **interruptor sem deploy**: `gps.config.slack_mencoes_ativo` (`'true'/'false'`, **não é
  segredo**) desliga o canal para todos, no padrão do `chamados_aberto`;
- **healthcheck honesto**: a tela do admin mostra **só o booleano** "webhook configurado:
  sim/não", nunca a URL. Precedente literal: `getChamadosConfig().fallbackEnv`. Lição "env
  presente não é env válida": o aviso diz *"configurado"*, não *"funcionando"*, e o primeiro erro
  de envio vira `logErro` + aviso vermelho na tela de configuração.

🟡 **Achado colateral (rotear ao pentester, V11):** `resend_api_key` legível por 16 admins via
REST é um MÉDIO **pré-existente**. Migration `…211` (opcional, recomendada): `gps.segredos` com
**RLS ligada e ZERO policies** + `revoke all from anon, authenticated`, lida só de dentro de
SECURITY DEFINER; `gps.config` fica só com configuração não-sensível. Mesmo molde de
`public.perfis_backup_limpeza_20260731`.

### B.8 Persistência do painel — URL para estado, sessão para âncora

| Estado | Onde | Por quê |
|---|---|---|
| lote (`?mais=`) | **URL** (já é) | o Server Component é quem consulta o banco |
| busca, ordenação, filtros, aba | **URL** (`?q=&ordem=&f=&aba=`) | mesmo motivo do `?mais=`: recarregar, voltar pelo histórico e mandar o link a um colega devolvem **a mesma tela**. Zero storage novo, zero `useEffect` refazendo busca |
| "de qual card eu saí" | **`sessionStorage`**, 1 chave, 1 uuid | ver abaixo |
| diálogo aberto, texto sendo digitado, "Nota rápida" expandida, rolagem dentro de diálogo | **NADA** | estado efêmero; restaurar isso assusta em vez de ajudar |

**Rolagem: âncora por `alunoId`, não por pixel.** Salvar `scrollY` falha exatamente no caso que o
João descreveu: a lista é filtrada **no cliente**, então o navegador restaura a rolagem antes de a
lista ter altura e o admin cai no topo. Pior: o lote pode mudar (`?mais=`) e o mesmo pixel aponta
para outra pessoa.

→ Ao clicar num card, grava `sessionStorage["gps.admin.painel.ultimoAluno"] = alunoId`. Ao voltar,
um `useLayoutEffect` **depois** de a lista filtrada montar faz `scrollIntoView({ block: "center" })`
naquele card + anel de foco temporário. Se o aluno não estiver na lista atual (filtro mudou),
**não faz nada** — nunca rolar para o lugar errado. Sessão e não `localStorage`: morre com a aba e
nunca guarda PII (é um uuid opaco).

### B.9 Dashboard — uma RPC, agregada, sem PII

**`gps.admin_dashboard()` → `jsonb`**, SECURITY DEFINER, `set search_path = ''`, primeira linha
`if not coalesce(public.gp_is_admin(), false) then raise ... 42501`, `revoke from public, anon`,
`grant execute to authenticated`. Molde: `gps.admin_diagnostico_ambiente`.

**Uma ida ao banco por abertura do `/admin`.** Nenhum card consulta por conta própria — é o
defeito que `chamados-data.ts` já documenta.

| # | Card (macro + micro no mesmo card) | Gráfico | Fonte | Clique leva a |
|---|---|---|---|---|
| 1 | **No programa: 158** · entraram em setembro: 50 (ago 40) | barras, 12 meses | `gps.membros.criado_em` do **titular** (definição do João) | `/admin?ordem=recentes` |
| 2 | **Acesso: 139 de 158 com login** · 19 sem login · 3 nunca entraram | barra empilhada | `admin_painel_alunos` (`tem_login`, `ultimo_acesso`) | `/admin?f=sem_login` |
| 3 | **Onboarding: 0 concluídos** · 0 em andamento · 158 não iniciados | rosca (3 fatias) | `gps.onboarding_respostas` | `/admin?f=onb_nao` |
| 4 | **Clientes: 878** · 841 / 37 / 0 · N no mês | funil horizontal | `gps.etapa1_clientes` | `/admin?f=tem_fechamento` |
| 5 | **Contratados com honorários: 0** · ambientes no Áureo: 0 | KPI + lista | `fase='contratado'` + `valor_honorarios` | `/admin?ordem=honorarios` |
| 6 | **Trilha**: ambientes por faixa de progresso da Etapa 01 (0 / 1–49 / 50–99 / 100) | barras | `pct` agregado no banco | `/admin?f=<faixa>` |
| 7 | **Atendimento**: pendências abertas · chamados abertos · sem nenhuma nota · 30+ dias sem acessar | KPI-linha | `admin_painel_atendimento` (já existe) | filtros que **já existem** |
| 8 | **Atividade**: eventos por dia, 30 dias, aluno × equipe | linhas | `gps.aluno_eventos` | — (termômetro, não fila) |
| 9 | **Grau de relação**: distribuição dos clientes | rosca | `grau_relacao` | `/clientes` do aluno não se abre daqui; é leitura macro |

**Regras duras do dashboard:**

- 🔴 **O card 5 não mostra "% de uma meta global".** `META_HONORARIOS` é **por ambiente**
  (R$ 150.000); somar 158 × 150k para inventar uma meta do programa seria número inventado, o que
  é proibido. Mostra o **absoluto** e **quantos ambientes bateram**.
- 🔴 **Estado vazio é RESULTADO, com instrução** — não é tela quebrada e não é dado fake
  (CONFLITO C-5). O card 3 nasce 0/0/158; o 5 nasce zerado; o 9 nasce com 214 "não informado".
  Precedente literal: o hero do Financeiro sem contratado mostra a instrução, não
  "R$ 0 de R$ 150.000". Copy do card 3: *"Ninguém respondeu ainda — o questionário abre no
  próximo acesso de cada aluno."*
- **Variação do mês**: o mês corrente é comparado com **o mesmo dia** do mês anterior, e a tela
  **escreve isso** ("até o dia 10"). Sem isso, todo dia 1º o painel anuncia −95%.
- **Zero PII no retorno**: só contagens e datas. Nome de gente só na lista, que já é só-admin.
- **Custo**: o único card sem índice garantido é o 8. `gps.aluno_eventos` tem
  `(aluno_id, ocorrido_em desc)`; agregar por dia **sem** `aluno_id` não usa esse índice.
  **MEDIR M3**; se der `Seq Scan`, entra
  `idx_aluno_eventos_ocorrido_em on gps.aluno_eventos (ocorrido_em desc)` na mesma migration.

### B.10 Biblioteca de gráficos — **SVG próprio, Server Component, 0 KB**

| | `recharts` | SVG próprio |
|---|---|---|
| Peso | **~95–110 KB gzip** (recharts + deps d3) | **0 KB de JS** |
| `/admin` hoje 158 KB | vira ~260 KB | continua 158 KB |
| Client Component | obrigatório (`"use client"`) | **não** — os dados são estáticos por render |
| Tooltip | rico | `<title>` nativo por segmento + **tabela de valores visível** |
| Cor | paleta a integrar | **tokens semânticos já medidos** (4 pares AA) |
| Hidratação | risco (o `brlCompacto` já queimou o projeto com ICU divergente entre Node e browser) | nenhum |

**Decisão: SVG próprio em `src/components/ui/graficos/`** — `barras.tsx`, `barra-empilhada.tsx`,
`rosca.tsx`, `linha.tsx`, `funil.tsx`. Cada um de 40 a 90 linhas, Server Component, sem estado.
Precedente na casa: `PadraoTrilha` (SVG inline ~700 B), `BarraMarcos`, `Progress`.

A regra de otimização decide sozinha: **a rota mais usada pela equipe não pode dobrar de peso
para desenhar 9 números.** O custo de manutenção é baixo porque os 5 tipos são exatamente os que
o João pediu — barras, pizza (rosca), linhas — mais dois derivados.

**Acessibilidade (obrigatório, não opcional):** cada gráfico é `role="img"` com `aria-label`
contendo o resumo em texto ("Entradas por mês: julho 68, agosto 40, setembro 50"), e **a tabela
de valores fica visível** ao lado ou abaixo. Gráfico nunca é a única forma de ler o número — a
lição do redesign ("estado se diz por forma, não por cor") vale aqui em dobro.

---

## C. Acesso garantido — "senha padrão" não passa; a intenção passa

### C.1 O que está errado no pedido literal

> *"Senha padrão para os que não tiverem acesso acessar e redefinir a senha"*

`auth.users` é **compartilhado por 7 sistemas do grupo**. Não existe senha "só do GPS". Uma senha
única para 19 pessoas significa: (a) qualquer uma delas entra na conta das outras enquanto
ninguém trocar; (b) para quem **já tem conta em outro portal**, definir a senha padrão **troca a
senha do Workbook/Rede/Central e derruba a sessão da pessoa lá**. O Plantão já viveu esse modelo
(422 pessoas, a mesma senha, ninguém trocou) e foi abandonado.

**A intenção é legítima e é cumprida por inteiro** — ninguém fica de fora do onboarding.

### C.2 O caminho

1. **Lote de criação de acesso** (`/admin`, aba Alunos ativos, filtro "sem login" → seleção →
   "Criar acesso para os selecionados"). Reaproveita `criarAcessoAluno` **sem reescrevê-la**:
   nova action `criarAcessosEmLote(alunoIds[])` que a chama em série.
   - **senha temporária INDIVIDUAL** (`gerarSenha()`, que já existe);
   - **teto de 20 por clique** e **pausa de 150 ms entre envios** — a Resend limita 10 req/s e o
     war-room perdeu 11 de 20 e-mails exatamente aqui. A regra da casa: fila com teto exige
     conferir `teto × intervalo` contra o tamanho real da fila **antes** de começar;
   - **relatório por pessoa** (ok / falhou / precisa de decisão), nunca um "19 acessos criados"
     agregado. Falha silenciosa é a pior espécie — o cron do Plantão dizia `succeeded, 20 rows`.
2. 🔴 **No lote, a ADOÇÃO de login preexistente NÃO acontece.** Hoje `criarAcessoAluno`, ao ver
   `user_already_exists`, chama `admin_adotar_login_existente` — que **troca a senha da pessoa em
   todos os portais e derruba as sessões dela**. Fazer isso 19 vezes num clique é derrubar gente
   de sistemas que não têm nada a ver com esta feature (lição "ampliar escopo compartilhado
   amplia todo consumidor").
   → A action de lote passa `permitirAdocao: false`; quem cai nesse caso volta na lista **"precisa
   de decisão"**, com os programas em que o login já é usado, para o admin resolver **um a um** em
   Gerenciar acesso, que já tem a confirmação nomeando os sistemas.
3. **Troca obrigatória no 1º acesso = passo 0 do onboarding.**
   - Marca: **`auth.users.raw_user_meta_data.gps_senha_temp_em`**, gravada pelas RPCs que já
     escrevem senha (`admin_definir_senha`, `admin_definir_senha_membro`,
     `admin_adotar_login_existente`) — **uma linha em cada**, merge com `||`, chave prefixada
     `gps_` para não colidir com o metadata dos outros 6 sistemas.
   - **Custo de leitura: zero.** `ctx.user.user_metadata` já vem do `getUser()` que a sessão
     memoizada faz uma vez por requisição. Nenhuma consulta nova.
   - A troca chama `supabase.auth.updateUser({ password, data: { gps_senha_temp_em: null } })`.
   - ⚠️ **Isto é UX, não fronteira de segurança**, e está escrito: o próprio usuário pode limpar o
     metadata e pular o passo. Não importa — o passo existe para o bem dele, e a alternativa (RPC
     própria de troca de senha) reimplementaria o GoTrue com bcrypt à mão. Registrado no plano em
     vez de fingir que é trava.
   - **Backfill** para os **3 que têm login e nunca entraram**:
     `update auth.users set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('gps_senha_temp_em', now())`
     onde `last_sign_in_at is null` **e** existe `gps.membros` com esse `user_id`. **Merge, nunca
     sobrescrita.** MEDIR M2 antes.
4. **E-mail com credenciais**: `enviarCredenciaisAcesso` já existe e já dispara em
   `criarAcessoAluno`. No lote é o mesmo caminho, com a pausa. O texto ganha **uma** linha: *"Na
   primeira entrada o portal vai pedir que você crie a sua própria senha."*
5. **Quem já tem login e nunca entrou (3 pessoas):** não recriar acesso — botão **"Reenviar
   acesso"** = `definirSenhaAluno` (senha temporária nova, confirma e-mail, derruba sessões
   antigas, marca a flag) + e-mail. ⚠️ Se a conta tiver papel em **outro portal do grupo**, o
   caminho **obrigatório** é o de `definirSenhaMembro`, que devolve `precisaConfirmar` + a lista
   de sistemas **sem alterar nada**.
6. **Quem tem login e já entrou (136):** nada muda no acesso. Vê o onboarding a partir do passo 1,
   sem o passo 0.

---

## D. Fluxo do onboarding, passo a passo

**Onde monta:** um Client Component `<OnboardingPortal />` no **layout do aluno**, não na home —
o João disse *"assim que ele ingressar"*, e ingressar pode ser em `/clientes` por um link do
e-mail. O servidor decide (`getMeuOnboarding()`), o cliente só desenha. **Não abre para admin, nem
em modo assistência, nem na prévia "como o aluno vê"** (o admin não tem `pessoa_atual()`).

**Formato:** diálogo modal, um passo por tela, barra "passo N de M", **sem X de fechar no passo
0**, com "Continuar depois" a partir do passo 1 (fechar salva e reabre no mesmo passo). Cada passo
tem título, a pergunta e uma frase de porquê — nenhuma tela em branco.

| # | Tela | Copy (literal do João em **negrito**) | Regras |
|---|---|---|---|
| 0 | **Crie a sua senha** | "Você entrou com uma senha temporária. Crie a sua agora." + o aviso que já existe: *"esta senha vale para todos os portais do Time Holding Brasil"* | só se `gps_senha_temp_em`. `InputSenha` (o único campo de senha do portal). Não dá para pular |
| 1 | Boas-vindas | **"No Programa de Implementação Assistida, nós faremos junto com você a sua primeira Holding."** | 3 linhas + "Vamos começar" |
| 2 | Cliente 1 | **"De onde virá o seu cliente 1, este que nós faremos a Holding juntos?"** → **"1. Quero que façamos desde a captação, porque ele virá de lá."** / **"2. Eu já tenho esse cliente e quero começar por ele."** | opção 1 → pula para o passo 5 |
| 3 | Fase + identificação | **"Em que fase da implementação você se encontra com este cliente?"** — **"Sessão de viabilidade já realizada e Croqui estrutural a apresentar"** / **"Croqui Estrutural já apresentado e aguardando a execução"** / **"Execução em andamento"**. Mais: "Qual o nome desse cliente?", telefone, grau de relação | o **nome** é obrigatório (sem ele não há cliente a criar); telefone e grau são **pedidos** para a linha nascer completa (§B.4) |
| 4 | Honorários e contrato | **"Valor dos honorários pactuados"** + "Anexe o contrato de honorários assinado" | 🔴 **obrigatórios só em "Execução em andamento"** — sem os dois o "Continuar" fica **desabilitado com a razão escrita ao lado**, nunca um clique que falha. Nas outras 2 fases o valor é opcional e o contrato não aparece |
| 5 | Seu caso | **"Descreva o seu caso"** — ajuda: **"como está o rumo da execução da holding"** (opção 2) / "onde você está hoje e o que já tentou" (opção 1) | texto livre, 0–4000, opcional |
| 6 | Ajuda | **"No que podemos te ajudar de pronto?"** | texto livre, 0–4000, opcional |
| 7 | Documentos | **"Anexo de documentos necessários"** — enquanto a lista não vier: "Se já tiver algum documento do caso, anexe aqui." | 0 a 5 arquivos, 5 MB, png/jpg/webp/pdf. **BLOQUEIO B-D1** |
| 8 | **Tour** — 7 telas curtas | uma por aba, ver §D.1 | itera **`navDoAluno(ctx)`**, nunca uma lista fixa |
| 9 | Fim | "Pronto. A equipe já recebeu as suas respostas." + o próximo passo real (`proximoPasso`) | fecha e **nunca mais abre** |

### D.1 O tour — a aba explicada pelo propósito

🔑 **O tour itera as abas REAIS da pessoa** (`navDoAluno(ctx)`). O **sócio não vê Financeiro**
(B7-b, 13 pessoas): um tour com lista fixa mostraria a ele uma aba que não existe — a mesma classe
de mentira que `assistenciaNavItems({ ambienteCompartilhado })` corrigiu na prévia.

| Aba | Frase (uma linha, ligada a fechar a 1ª holding) |
|---|---|
| Início | "Onde você está e o que fazer agora. Se estiver perdido, comece por aqui." |
| Clientes | "A sua central de clientes: os que você já tem, os que estão em andamento e os que já estão em execução. É daqui que sai a sua primeira holding." |
| Pasta | "A pasta do seu programa no Drive, compartilhada com a equipe." |
| Materiais | "As aulas e os modelos de cada etapa, num lugar só." |
| Financeiro | "O seu contrato com o programa e a sua meta de faturamento." |
| Suporte | "Fale com a equipe por aqui." |
| Perfil | "Seus dados e a sua senha." |

**B-T2 (bloqueio com padrão):** o tour é **pulável** a partir do passo 8 ("Pular a apresentação"),
e a última tela oferece rever quando quiser — o botão fica em `/perfil`. Padrão escolhido porque
errar para o lado de prender custa caro (o aluno abandona a sessão) e errar para o lado de soltar
custa zero (ele revê em 1 clique).

### D.2 Efeitos colaterais da conclusão — **uma RPC, uma transação**

`gps.onboarding_concluir(...)` (SECURITY DEFINER, guarda `pessoa_atual()`), **tudo ou nada**:

1. valida a obrigatoriedade (execução em andamento ⇒ honorários **e** anexo de contrato) — **o
   banco é a garantia; a UI é conveniência**;
2. se `origem = 'ja_tenho'`: `insert` em `gps.etapa1_clientes` com nome, telefone, `grau_relacao`,
   `fase` (mapa de §B.4), `valor_honorarios`, `ordem = max + 1`;
3. **favorita se e somente se o ambiente não tiver favorito** (§B.1);
4. grava `concluido_em` e `cliente_id`;
5. eventos: `onboarding_concluido` (novo) + `cliente_cadastrado` / `cliente_favoritado` **pelas
   triggers de captura que já existem** — não duplicar (MEDIR M4 confirma o que o INSERT já grava);
6. 🔴 **não cobra nada, não manda e-mail de cobrança, não muda situação financeira.** O
   `apto_ao_saldo` é derivado e é **sinal para a equipe** (chip + filtro no painel), com o texto
   **bloqueado** até o João dar (B-S1).

**O que muda em `proximoPasso`:** com o favorito criado, `exigeFavorito` (nums 5, 7, 8, 9, 10)
deixa de bloquear. A tarefa 1 (30 clientes) segue pendente, então o card "Continue de onde parou"
continua apontando para ela — **correto**: 1 cliente não são 30. **`proximoPasso` não muda de
código**; muda o dado que ela recebe.

### D.3 Como a equipe vê o onboarding de cada aluno

| Onde | O quê |
|---|---|
| `/admin` (card do aluno) | chip **"Onboarding: não iniciado / em andamento / concluído"** + filtro. Vem de uma coluna nova em `admin_painel_alunos`, a RPC que **já roda** — **zero consulta nova** |
| `/admin` (dashboard) | card 3 (rosca) + clique → lista filtrada |
| `/admin/aluno/<id>/resolver` (Central) | bloco novo **"Onboarding"**: as respostas por extenso, os anexos (link com `download=`), a data e a versão do questionário. `ok = null` (informação) quando concluído; `ok = false` quando a pessoa está há mais de 7 dias em andamento |
| `/admin/aluno/<id>/diario` | evento `onboarding_concluido` na trilha, com rótulo legível |

**O aluno revê as respostas em `/perfil`**, seção "Suas respostas do início", somente leitura, com
*"Mudou alguma coisa? Fale com a equipe pelo Suporte."* — não é formulário reeditável: a resposta é
o retrato do dia 0, e o estado vivo é o cliente na aba Clientes.

---

## E. Cadastro do cliente

### E.1 Trava do favorito — regras exatas

| Situação | Aluno | Equipe |
|---|---|---|
| sem favorito | escolhe livremente | pode marcar e confirmar |
| favorito **não confirmado** (os 25 de hoje) | troca à vontade; desmarcar já pede confirmação nomeada | pode confirmar |
| favorito **confirmado** | ❌ não troca a estrela · ❌ não apaga o cliente · ❌ não volta a fase para `prospeccao` · ✅ edita todo o resto | libera (`admin_liberar_acompanhamento`, motivo obrigatório, log + evento) |

- A ficha do aluno mostra: badge *"A equipe está acompanhando desde <data>"*, estrela em
  somente-leitura com a explicação, e o caminho pelo Suporte. **Nenhum botão que falha.**
- `PatchCliente` não ganha campo para isso — a trava é do banco. A allowlist ganha **só
  `grau_relacao`**, e ele tem de entrar **nos dois lugares**: o `Pick` (tipo) e o `Set`
  `CHAVES_PATCH_CLIENTE` (runtime). Esquecer o `Set` faz a feature nascer morta sem erro, como o
  comentário de `valor_honorarios` já registra.
- RLS: **não muda**. A trava é trigger, não policy — policy não distingue "mudou a estrela" de
  "mudou o telefone".

### E.2 "Central de todos os clientes" — o que falta de verdade

O aluno **já pode** cadastrar cliente em qualquer estágio: `etapa1_clientes` não tem catraca e as
3 fases cobrem até a execução (§B.4). O que falta é **vocabulário e descoberta**:

1. **Copy da aba**: hoje ela se apresenta como "os 30 da Etapa 01". O `descricao` do `PageHeader`
   passa a dizer: *"Todos os seus clientes — os novos, os que já estão em andamento e os que já
   estão em execução."*
2. **Grau de relação** como chip no card, campo na ficha e **filtro** (chips `aria-pressed`, o
   padrão que já existe em `clientes-chips.tsx`).
3. **Coluna "Contratados" do quadro** ganha, no cabeçalho, a ajuda que já existe (*"Contrato
   fechado — segue para a execução"*) e o **valor de honorários no card**, quando houver.
4. **O KPI "X/30" ganha rodapé honesto**: *"a meta de 30 é da Etapa 01; clientes em andamento e em
   execução contam aqui também."* — senão o aluno com 3 clientes reais lê "3/30" como fracasso.

**O que NÃO entra:** nenhuma tabela nova de cliente, nenhuma "origem do cliente", nenhum
`arquivado_em` (registrado como evolução futura em F.4 da rodada de 09/09 — e continua futuro).

---

## F. Painel do admin

### F.1 Ordem da tela (macro → micro), em `/admin`

```
PageHeader + "Criar acesso"
├─ [NOVO] Dashboard executivo   ← 9 cards: número + variação + gráfico + link
├─ KPIs atuais (4)              ← ABSORVIDOS pelos cards 1, 2 e 7 → REMOVIDOS
└─ Tabs: Alunos ativos · Solicitações · Etapas   ← continua, com o estado na URL
```

🔑 **Os 4 KPIs de hoje somem.** "Alunos no programa", "Com login", "Sem login" e "Solicitações"
viram os cards 1, 2 e 7 do dashboard, **com** variação e **com** clique. Manter os dois seria
empilhar — é o crédito de otimização desta frente: **a tela substitui, não acumula** (lição
"tela substituída se remove, não se empilha").

### F.2 Persistência — ver §B.8

Contrato de URL do painel (o frontend implementa; o backend não precisa saber):

```
/admin?aba=ativos&q=silva&ordem=honorarios&f=chamado,onb_nao&mais=1
```

`f` é lista separada por vírgula, com **allowlist fechada** no parse — parâmetro desconhecido é
ignorado, nunca vira filtro. Escrito com `router.replace(..., { scroll: false })` e debounce de
300 ms na busca.

---

## G. Segurança e LGPD — o mapa completo

| Superfície | Regra |
|---|---|
| `auth.users` | o lote **não adota** login preexistente (§C.2); "Definir senha" continua listando os outros portais antes de trocar; `raw_user_meta_data` só por **merge**, chave prefixada `gps_`; nenhuma senha compartilhada |
| Bucket `gps-onboarding` | privado · 5 MB · `png/jpeg/webp/pdf` · path `<ambiente>/<uuid>.<ext>` com CHECK de formato · MIME e tamanho lidos de `storage.objects.metadata` pela RPC · **todo link com `download=`, nunca inline** · leitura: admin + membros do ambiente · escrita: só o aluno · expurgo por clique do admin |
| Contrato de honorários | **é documento de TERCEIRO** (o cliente do aluno). Não aparece em lista de "documentos", não vai por e-mail, não vai para o Slack, não entra em retorno agregado. Retenção = **B-R1** |
| Slack | segredo em **env**, nunca em `gps.config` (§B.7). Payload = autor + nome do aluno + link. **NUNCA o texto da nota, o tipo, o cliente ou qualquer contato.** Teto de 10 menções/nota. Falha nunca bloqueia a nota |
| Menções | destinatário revalidado no servidor contra `ativo + dev/admin`; a lista de mencionáveis é servida **só a admin**, com nome e id — **sem e-mail** |
| Diário | **nada muda na trava LGPD**: aluno e sócio continuam sem ver. A menção não cria leitor novo |
| Dashboard | retorno **100% agregado**, zero nome, zero e-mail. `gp_is_admin()` na 1ª linha ou 42501 |
| Onboarding (dados) | `descricao_caso` e `ajuda_pronta` são **texto livre do aluno sobre o caso dele** — podem conter dado de terceiro. Visíveis para: o próprio aluno e o admin. **Não** para o sócio (a resposta é da pessoa), **não** no Slack, **não** no dashboard |
| RLS | toda tabela nova com RLS ligada e policies explícitas; `anon` sem nada; função interna com `revoke ... from public, anon, authenticated` (o projeto tem ALTER DEFAULT PRIVILEGES concedendo a `authenticated` — conferir em `pg_proc.proacl`) |
| Nada de `service_role` | o upload usa a **sessão do usuário**; o expurgo usa a sessão do **admin** |

---

## H. Contratos, ondas e conferência

### H.1 Migrations, na ordem (o backend cria os arquivos)

| # | Arquivo | O que faz · o que **não** faz |
|---|---|---|
| 1 | `…200_gps_acessos_log_acoes_do_onboarding.sql` | + `favorito_confirmado`, `favorito_liberado`, `acessos_criados_em_lote`. Acha o CHECK **por CONTEÚDO, não pelo nome** (molde `…150`) ou **aborta**. Não remove valor antigo. **Vem primeiro de toda a rodada** — senão as RPCs morrem com 23514 no último passo e o botão "não faz nada" |
| 2 | `…201_gps_aluno_eventos_tipos_do_onboarding.sql` | tipos `onboarding_iniciado`, `onboarding_concluido`, `favorito_confirmado_pela_equipe`, `favorito_liberado_pela_equipe`; entidade `onboarding`. **Espelho obrigatório no TS**: `TIPOS_EVENTO`, `ROTULO_TIPO_EVENTO` (Record exaustivo — quebra o build se faltar) e `ROTULO_MACRO_POR_TIPO` (Partial — **não** quebra; esquecer deixa rótulo cru na tela) |
| 3 | `…202_gps_etapa1_clientes_grau_relacao.sql` | coluna + CHECK + `comment on column`. **Zero backfill**: as 878 linhas nascem `null` |
| 4 | `…203_gps_etapa1_clientes_acompanhamento.sql` | 2 colunas + trigger de trava (42501) + `admin_confirmar_acompanhamento` + `admin_liberar_acompanhamento`. **Zero backfill**: os 25 favoritos seguem livres |
| 5 | `…204_gps_onboarding_estrutura.sql` | `gps.pessoa_atual()`, `onboarding_respostas`, `onboarding_anexos`, RLS, grants |
| 6 | `…205_gps_onboarding_storage.sql` | bucket + 2 guardas + 3 policies em `storage.objects` (molde `…112`) |
| 7 | `…206_gps_onboarding_rpcs.sql` | `onboarding_meu()`, `onboarding_salvar_passo()`, `onboarding_concluir()`, `admin_onboarding_do_aluno()` |
| 8 | `…207_gps_nota_mencoes.sql` | tabela + `admin_mencionaveis()` |
| 9 | `…208_gps_senha_temporaria.sql` | marca `gps_senha_temp_em` nas 3 RPCs de senha (**`drop function` antes de recriar** se a assinatura mudar — sobrecarga ambígua já quebrou em runtime nos sistemas do João) + backfill dos 3 que nunca entraram |
| 10 | `…209_gps_admin_dashboard.sql` | a RPC agregada (+ `idx_aluno_eventos_ocorrido_em` **se** M3 mandar) |
| 11 | `…210_gps_admin_painel_alunos_v3.sql` | + `onboarding_status`, `em_fechamento`, `apto_ao_saldo`. **`drop function` da versão vigente** e recria (conferir que a sobrecarga fica = 1) |
| 12 | `…211_gps_segredos.sql` | **opcional/recomendada**: tira `resend_api_key`/`email_from` de `gps.config` para `gps.segredos` (RLS ligada, **zero policy**). Fica pronta e **não aplicada** até o orquestrador decidir (B-K1) |

### H.2 Contrato back↔front

```ts
// src/lib/types.ts
export const ORIGENS_CLIENTE1 = ["captacao", "ja_tenho"] as const;
export const FASES_CLIENTE1 = ["viabilidade_feita","croqui_apresentado","execucao_andamento"] as const;
export const GRAUS_RELACAO  = ["parente","amigo","conhecido","indicacao","cliente_atual","lead"] as const;
export type OrigemCliente1 = (typeof ORIGENS_CLIENTE1)[number];
export type FaseCliente1   = (typeof FASES_CLIENTE1)[number];
export type GrauRelacao    = (typeof GRAUS_RELACAO)[number];
export type StatusOnboarding = "nao_iniciado" | "em_andamento" | "concluido";

export interface OnboardingAnexo {
  id: string; tipo: "contrato_honorarios" | "documento";
  nome: string; mime: string; tamanho: number; path: string; criadoEm: string;
}
export interface MeuOnboarding {
  status: StatusOnboarding; versao: number; passoAtual: number;
  precisaTrocarSenha: boolean;               // ctx.user.user_metadata.gps_senha_temp_em — 0 consulta
  abas: { href: string; label: string }[];   // o TOUR itera ISTO (navDoAluno), nunca lista fixa
  origemCliente1: OrigemCliente1 | null; faseCliente1: FaseCliente1 | null;
  valorHonorarios: number | null; descricaoCaso: string | null; ajudaPronta: string | null;
  clienteId: string | null; anexos: OnboardingAnexo[];
  ambienteJaTemFavorito: boolean;            // decide o texto do passo 3 (§B.1)
}
// src/lib/etapa1.ts — rótulos, no molde de FASES_CLIENTE
export const GRAUS_RELACAO_UI: { id: GrauRelacao; rotulo: string }[]
export const FASES_CLIENTE1_UI: { id: FaseCliente1; rotulo: string; faseCliente: FaseCliente }[]
// ↑ o MAPA resposta → fase-do-cliente mora AQUI e na RPC. Um lugar cada, e os dois dizem o mesmo.
```

```ts
// src/lib/data/onboarding.ts   (consulta nova nasce em data/<assunto>.ts)
getMeuOnboarding(): Promise<MeuOnboarding>
getOnboardingDoAluno(alunoId: string): Promise<OnboardingDoAmbiente[]>   // admin (Central)
// src/lib/data/dashboard.ts
getDashboard(): Promise<Dashboard>                                        // 1 RPC, jsonb

// src/app/onboarding/actions.ts   ("use server", todas devolvem { erro } traduzido)
salvarPassoOnboarding(passo: number, dados: PatchOnboarding): Promise<{ erro?: string }>
criarUploadAssinadoOnboarding(i: { nome; mime; tamanho; tipo }): Promise<{ok:true;path;token;nome}|{ok:false;erro}>
registrarAnexoOnboarding(i: { tipo; path; nome; mime; tamanho }): Promise<{ erro?: string }>
removerAnexoOnboarding(id: string): Promise<{ erro?: string }>
concluirOnboarding(): Promise<{ erro?: string; clienteId?: string; favoritado?: boolean }>
trocarSenhaObrigatoria(nova: string): Promise<{ erro?: string }>

// src/app/admin/actions.ts   (acrescenta)
criarAcessosEmLote(alunoIds: string[]): Promise<{
  resultados: { alunoId: string; ok: boolean; erro?: string; precisaDecisao?: boolean; programas?: string[] }[]
}>
// src/app/admin/central-actions.ts   (acrescenta)
confirmarAcompanhamento(clienteId: string, motivo: string): Promise<{ erro?: string }>
liberarAcompanhamento(clienteId: string, motivo: string): Promise<{ erro?: string }>
// src/app/admin/diario-actions.ts   (estende)
registrarNota({ ...jaExiste, mencoes?: string[] })       // teto 10, revalidado no servidor
listarMencionaveis(): Promise<{ id: string; nome: string }[]>   // só admin, SEM e-mail
```

### H.3 Ondas e divisão de arquivos (paralelismo sem colisão)

**Onda 0 — orquestrador, antes de tudo:** rodar as MEDIÇÕES (§H.6) e colar o resultado aqui.
**M1 e M3 são gates.**

**Onda 1 — banco (backend sozinho).** Migrations 1 a 11. Em **paralelo**, o frontend monta os
**gráficos SVG** (`src/components/ui/graficos/*`) e o esqueleto do `<OnboardingPortal/>` com dados
de exemplo **em memória do componente** — nunca no banco, nunca commitado como seed.

**Onda 2 — paralela, arquivos disjuntos:**

| `backend-engineer` | `frontend-engineer` |
|---|---|
| `src/lib/types.ts` (tipos novos) | `src/components/onboarding/**` (novo) |
| `src/lib/etapa1.ts` (`GRAUS_RELACAO_UI`, `FASES_CLIENTE1_UI`) | `src/components/ui/graficos/**` (novo) |
| `src/lib/data/onboarding.ts`, `src/lib/data/dashboard.ts` (novos) | `src/components/admin/dashboard/**` (novo) |
| `src/lib/data/alunos.ts` (3 campos novos em `AlunoGps`) | `src/components/admin/alunos-ativos-lista/**` (URL + âncora + chip) |
| `src/app/onboarding/actions.ts` (novo) | `src/components/clientes/**` (grau + trava explicada) |
| `src/app/admin/actions.ts`, `central-actions.ts`, `diario-actions.ts` | `src/components/admin/diario-form.tsx` (@menção) |
| `src/lib/slack.ts` (novo) · `src/lib/erros.ts` (frases) | `src/app/admin/page.tsx` (monta o dashboard, **tira os 4 KPIs**) |
| `src/lib/auth.ts` (`pessoaAlunoId` no contexto, `ilike` removido) | layout do aluno (monta o portal) · `/perfil` (respostas + "rever a apresentação") |

⚠️ **`src/lib/types.ts` e `src/lib/etapa1.ts` são do backend nesta rodada.** O frontend importa,
não edita — é o único par de arquivos que os dois tocariam.

**Onda 3 — costura:** Central (bloco Onboarding), painel (filtros novos), tour, copy.
**Onda 4 — pentest** (§H.4). **Onda 5 — Fable.**

### H.4 Vetores nomeados para o `security-pentester` — **obrigatório**

(auth.users · storage · webhook externo · leitura agregada de PII)

1. **V1 — lote de acesso**: chamar `criarAcessosEmLote` com 1.000 ids; com id de aluno que é da
   equipe (`admin_alvo_e_equipe` tem de barrar); com id de outro ambiente. Provar que **nenhuma
   senha de portal externo é trocada** sem confirmação explícita.
2. **V2 — flag de senha**: aluno chamando `updateUser({ data: { gps_senha_temp_em: null } })` sem
   trocar a senha. Confirmar que isso **não concede nada** além de pular um passo de UX.
3. **V3 — bucket**: subir `.php`/`.svg` com `Content-Type: image/png`; path com `../`; path com o
   `aluno_id` de outro ambiente; baixar anexo de outro ambiente com JWT de aluno; **conferir que
   todo link sai com `download=`** e que nada é servido inline.
4. **V4 — trava do favorito**: aluno chamando `atualizarCliente` / `definirClienteEquipe` /
   `removerCliente` direto (Server Action é endpoint HTTP) sobre um cliente confirmado. Tem de ser
   **42501 do banco**, não erro de UI.
5. **V5 — menções**: mandar `mencoes` com id de perfil **inativo**, de perfil **gestor**, de
   `auth.users` que não é perfil, e 500 ids. Confirmar o teto de 10 e a revalidação no servidor.
6. **V6 — Slack**: forçar o webhook a falhar (URL inválida) e provar que **a nota é gravada**;
   capturar o corpo do POST e provar que **o texto da nota nunca aparece**; provar que o segredo
   **não** é legível por `select * from gps.config` com JWT de admin.
7. **V7 — dashboard**: `admin_dashboard()` sem JWT → 42501; com JWT de aluno → 42501; com JWT de
   sócio → 42501. Conferir `pg_proc.proacl` (nada para `anon`).
8. **V8 — onboarding de terceiro**: `onboarding_salvar_passo` / `onboarding_concluir` com
   `pessoa_aluno_id` forjado; ler `onboarding_respostas` de outra pessoa com JWT de sócio do
   **mesmo** ambiente — tem de ser negado (a resposta é da pessoa, não do ambiente).
9. **V9 — corrida do favorito**: dois onboardings concluindo no mesmo ambiente ao mesmo tempo → o
   índice único parcial tem de virar **23505 traduzido**, nunca estado partido.
10. **V10 — regressão**: `rg 'type="password"' src` = 0 · `rg "getSession\(" src` = 0 ·
    `rg "service_role" src` = 0 · nenhum `error.message` cru em action nova · nenhum `dark:` novo.
11. **V11 — pré-existente**: `resend_api_key` legível por 16 admins via REST (§B.7). Confirmar e
    dar severidade.

### H.5 Bloco de conferência (rodar no MCP, em transação com rollback)

```sql
-- B0 · GATES, ANTES de aplicar
select count(*) from gps.etapa1_clientes;                     -- add column com default null é instantâneo
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'gps.acessos_log'::regclass and contype = 'c';   -- achar o CHECK pelo CONTEÚDO
select indexdef from pg_indexes
 where schemaname='gps' and tablename='membros' and indexname='membros_pessoa_uk';
explain (analyze, buffers)
  select date_trunc('day', ocorrido_em), count(*) from gps.aluno_eventos
   where ocorrido_em > now() - interval '30 days' group by 1;      -- Seq Scan? → índice novo

-- B1 · as constraints cresceram e nenhuma linha antiga quebrou
select count(*) from gps.acessos_log;   select count(*) from gps.aluno_eventos;   -- iguais ao B0

-- B2 · BACKFILL ZERO (os números têm de ser exatamente estes)
select count(*) from gps.etapa1_clientes where grau_relacao is not null;                  -- 0
select count(*) from gps.etapa1_clientes where acompanhamento_confirmado_em is not null;  -- 0
select count(*) from gps.etapa1_clientes where acompanhado_equipe;                        -- 25 (inalterado)
select count(*) from gps.onboarding_respostas;                                            -- 0

-- B3 · 42501 sem JWT nas RPCs expostas; a interna fora do PostgREST
select p.proname, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps'
   and p.proname like any (array['onboarding%','admin_dashboard','admin_mencionaveis','%acompanhamento','pessoa_atual']);

-- B4 · a TRAVA do favorito morde (transação com rollback)
--   set role authenticated + JWT do dono  → update acompanhado_equipe=false  ⇒ 42501
--   admin (gp_is_admin)                   → passa
--   delete do cliente confirmado pelo aluno                                  ⇒ 42501
--   update do telefone do MESMO cliente pelo aluno                           ⇒ passa (trava o vínculo, não a ficha)

-- B5 · onboarding_concluir é ATÔMICA
--   'execucao_andamento' SEM anexo        ⇒ erro, e 0 linha nova em etapa1_clientes
--   com anexo                             ⇒ 1 cliente, 1 favorito (se não havia), 2..3 eventos, 1 resposta
--   ambiente que JÁ tem favorito          ⇒ 1 cliente, favorito INALTERADO
select count(*) from gps.etapa1_clientes;   -- volta ao valor do B0 depois do rollback

-- B6 · menção não vaza
--   registrarNota com 500 mencoes         ⇒ no máximo 10 linhas em gps.nota_mencoes
--   menção com perfil inativo ou gestor   ⇒ descartada
select count(*) from gps.nota_mencoes;      -- 0 depois do rollback

-- B7 · senha temporária: MERGE, nunca sobrescrita
select id, raw_user_meta_data from auth.users
 where last_sign_in_at is null
   and id in (select user_id from gps.membros where user_id is not null);
-- ANTES e DEPOIS: as chaves antigas (documento, origem, nome, telefone, cargo…) continuam TODAS lá

-- B8 · dashboard: uma ida, custo medido, números que batem
explain (analyze, buffers) select gps.admin_dashboard();
select count(distinct aluno_id) from gps.membros;                                    -- 158
select fase, count(*) from gps.etapa1_clientes group by fase;                        -- 841 / 37 / 0
select to_char(criado_em at time zone 'America/Sao_Paulo','YYYY-MM'), count(*)
  from gps.membros where papel = 'titular' group by 1 order by 1;                    -- 07=68 08=40 09=50

-- B9 · o log não vaza e o painel não regrediu
select acao, count(*) from gps.acessos_log group by 1;
select count(*) from gps.admin_painel_alunos(1000, 0);                               -- 158
```

### H.6 MEDIR — o orquestrador roda (**M1 e M3 são gates**)

```
MEDIR M1 (GATE) — select indexdef from pg_indexes where schemaname='gps'
  and tablename='membros' and indexname='membros_pessoa_uk';
  → para decidir se `pessoa_aluno_id` pode ser PK do onboarding. Se o índice NÃO existir,
    a chave passa a ser `gps.membros.id` e a §B.1 muda.

MEDIR M2 — select count(*), array_agg(distinct k) from auth.users u
  join gps.membros m on m.user_id = u.id,
  lateral jsonb_object_keys(u.raw_user_meta_data) k
  where u.last_sign_in_at is null;
  → para o backfill da flag de senha temporária não pisar no metadata de outro sistema.

MEDIR M3 (GATE) — explain (analyze, buffers) do group by por dia em gps.aluno_eventos (30 dias)
  + select count(*) from gps.aluno_eventos;
  → decide se entra idx_aluno_eventos_ocorrido_em. Seq Scan hoje é barato e cresce sem teto:
    se der Seq, o índice entra na MESMA migration.

MEDIR M4 — select tgname, pg_get_triggerdef(oid) from pg_trigger
  where tgrelid = 'gps.etapa1_clientes'::regclass and not tgisinternal;
  → para o trigger novo não brigar com trg_etapa1_clientes_status_congelado nem com a captura
    de eventos, e para saber se o INSERT já grava `cliente_favoritado` (evitar evento duplicado).

MEDIR M5 — pg_policy do bucket gps-chamados em storage.objects + pg_get_functiondef de
  gps.pode_ver_anexo_chamado e gps.pode_anexar_chamado
  + select has_table_privilege('postgres','storage.objects','select');
  → o bucket novo é cópia; sem o privilégio a RPC não confere MIME (lição da …111).

MEDIR M6 — select m.papel, count(*), count(*) filter (where pessoa_aluno_id is null)
  from gps.membros m group by 1;
  → sócio sem pessoa não consegue fazer onboarding. Se houver, a Central resolve ANTES.

MEDIR M7 — select cargo, count(*) from public.perfis
  where status = 'ativo' and cargo in ('dev','admin') group by 1;
  → o universo REAL das @menções (esperado 19, não 20 — o gestor não lê o Diário).

MEDIR M8 — select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
  → confirmar que gps-onboarding não existe e que gps-documentos segue órfão.
```

### H.7 Roteiro de validação logado (para o João, ~10 min)

*Como aluno com senha temporária* — (1) entra e **não consegue** fechar o passo 0; (2) troca a
senha e o passo 1 abre; (3) escolhe "já tenho" + "execução em andamento" e tenta avançar sem o
contrato: o botão está desabilitado **com a razão escrita ao lado**; (4) anexa e conclui; (5) a
home mostra o cliente **favoritado** e os passos 4–8 da Etapa 01 **destravaram**; (6) fecha o
navegador no passo 5 e volta: reabre **no 5**; (7) depois de concluir, recarrega: o pop-up **não
abre mais**; (8) `/perfil` mostra as respostas em somente leitura.

*Como sócio* — (9) o tour tem **6 telas, sem Financeiro**; (10) num ambiente que já tem favorito,
concluir cria o cliente **sem** roubar a estrela, e a tela diz isso.

*Como admin* — (11) `/admin` abre com o dashboard e **sem** os 4 KPIs antigos; (12) clicar na
fatia "não iniciado" filtra a lista; (13) filtrar + rolar + abrir um aluno + voltar: **o mesmo
filtro, e o card de onde saiu em destaque**; (14) recarregar com o filtro na URL: continua igual;
(15) na ficha do cliente, "Confirmar acompanhamento" pede motivo — depois disso, entrar como o
aluno e tentar desmarcar a estrela dá **frase em português**, não erro cru; (16) escrever `@` no
Diário, escolher um colega e salvar: a nota grava **mesmo com o Slack desligado**; (17) no canal
do Slack, a mensagem **não** contém o texto da nota.

### H.8 O que **NÃO** fazer

1. ❌ Senha igual para várias pessoas — em nenhuma variação, em nenhum lote.
2. ❌ Adoção automática de login preexistente em massa.
3. ❌ Criar a 4ª fase de cliente, mexer no CHECK de `fase` ou tocar no `status` congelado.
4. ❌ Acrescentar `grau_relacao` à regra de `comDados` / `tarefaConcluida`.
5. ❌ Mandar o texto da nota, o nome do cliente do aluno ou qualquer contato para o Slack.
6. ❌ Guardar o webhook (ou qualquer segredo novo) em `gps.config`.
7. ❌ `pg_cron` para expurgo de arquivo (SQL não apaga o byte) — expurgo é por clique do admin.
8. ❌ `recharts` ou qualquer dependência nova de gráfico.
9. ❌ Escrever qualquer valor em reais do saldo do programa ("15k") sem o João (B-S1).
10. ❌ Tela de Diário para o aluno (B2, decidido em 09/09), nem "espelho" do diário no onboarding.
11. ❌ Reconstruir o agendamento de reunião com a equipe (removido — e já voltou uma vez).
12. ❌ `service_role`, tema escuro, `select("*")`, `Intl.NumberFormat` novo, `EMAIL_REGEX` local,
    `text-*` custom, `getSession()`, `error.message` cru, item novo em `alunoNavItems` que vaze
    para o aluno.
13. ❌ Persistir preferência de UI do admin no banco.
14. ❌ Tour com lista fixa de abas.
15. ❌ Reabrir o pop-up de quem já concluiu, por mudança de versão do questionário.

---

## I. CONFLITOS e BLOQUEIOS

### I.1 CONFLITOS — decisão anterior × pedido novo (todos decididos aqui)

| # | Tensão | Decisão | Custo do outro lado |
|---|---|---|---|
| **C-1** | 3 fases de cliente × "execução em andamento" | **Não criar fase nova.** `contratado` já significa "segue para a execução"; a granularidade vive em `onboarding_respostas.fase_cliente1`; "em execução" é o **derivado** `apto_ao_saldo` | 4ª fase = reabrir CHECK + UI + `resumoHonorarios` + `progressoFaturamento` + CTE do painel + coluna do quadro, **em cima de 0 linhas contratadas**. Desenho sobre hipótese |
| **C-2** | "documento do cliente vive no Drive" (07/2026) × "anexar o contrato assinado", agora obrigatório | **Aceitar o upload como PROVA, não como fichário.** Bucket privado no molde do chamado; não aparece em nenhuma lista de "documentos"; `contrato_url` (link do Drive) continua sendo o lugar do documento | Recusar = o gate de obrigatoriedade vira link colável e a equipe não tem como conferir. Aceitar sem cerca = ressuscitar o fichário removido em 07/2026 |
| **C-3** | "o aluno é dono do favorito" × "a equipe trava" | **Dois conceitos, dois campos.** O aluno segue dono até a equipe **confirmar**; os 25 favoritos atuais nascem livres (backfill zero) | Travar tudo no dia 1 = 25 pessoas perdem um direito sem aviso. Não travar = o pedido não é atendido |
| **C-4** | senha única × `auth.users` de 7 sistemas | **Senha temporária individual + troca obrigatória no 1º acesso** (§C) | Senha única = incidente de segurança e senha trocada em portal alheio |
| **C-5** | "sem dados fake" × dashboard com base pequena | **Vazio é resultado, com a instrução do que fazer** (precedente: o hero do Financeiro) | Seed de demonstração = proibido pela regra herdada do sip |
| **C-6** | Diário só-admin (LGPD) × notificação no Slack | **A menção não cria leitor novo**: o destinatário é quem já podia ler, e o payload não carrega o texto | Mandar o texto = tirar PII de terceiro do perímetro por conveniência |
| **C-7** | "`gps.config` é a única tabela de configuração" × segredo do Slack | **Config sim, segredo não.** Interruptor em `gps.config`, webhook em env | Repetir o furo do `resend_api_key` (16 admins leem pela REST) |
| **C-8** | painel "busca e filtro valem só sobre o lote" × persistir filtro na URL | **Leitura A mantida**: a URL guarda o filtro e o rodapé continua dizendo que ele vale sobre os carregados | Busca no servidor é **feature**, não ajuste — e com 158 ambientes não se paga |
| **C-9** | KPIs do painel × dashboard | **Os 4 KPIs saem.** O dashboard os absorve com variação e clique | Manter os dois = empilhar, e a tela passa a ter dois lugares dizendo o mesmo número |

### I.2 BLOQUEIOS — só o João decide

| # | Decisão | Padrão provisório (para o trabalho não parar) | O que trava sem ele |
|---|---|---|---|
| **B-S1** 🔴 | **Texto e valor do "saldo restante do programa"** (os "15k") | **Nenhuma tela escreve valor.** O chip diz só *"Contrato de honorários enviado"*; o filtro se chama *"com contrato enviado"* | Trava só a **copy** do chip e do aviso. **Duro**: escrever "R$ 15.000" sem ele viola a regra de não inventar número |
| **B-D1** 🔴 | **Lista final de "documentos necessários"** | O passo 7 fica genérico e **opcional**: *"Se já tiver algum documento do caso, anexe aqui"* (0 a 5) | Trava a copy e a validação do passo 7. Sem a lista, **não** dá para torná-lo obrigatório |
| **B-W1** 🔴 | **URL do webhook do Slack + qual canal** (e se a mensagem pode nomear o aluno) | A feature nasce **desligada** (`slack_mencoes_ativo = false`); a menção é gravada e aparece na tela do Diário de qualquer jeito | Trava o envio, **não** a implementação |
| **B-R1** 🔴 | **Retenção do contrato anexado** e quem pode baixá-lo | Fica enquanto a pessoa estiver no programa; expurgo por clique do admin; leem admin + membros do ambiente | Trava o botão de expurgo em massa, não o upload |
| **B-T2** 🟡 | **O tour é pulável?** | **Sim**, a partir do passo 8, com "rever a apresentação" em `/perfil` | Uma linha |
| **B-G1** 🟡 | **Rótulos de "grau de relação"** — a lista de 6 serve? (parente · amigo · conhecido · indicação · cliente atual · lead) | Segue com os 6 | Uma linha no CHECK + uma no TS |
| **B-K1** 🟡 | **`resend_api_key` legível por 16 admins** — corrigir nesta rodada? | Migration `…211` fica **pronta e não aplicada** | Nada: é dívida pré-existente |

---

## J. Os 5 critérios do Fable

| Critério | O que este plano garante |
|---|---|
| **Segurança** | Nenhuma senha compartilhada; o lote não adota login de outro portal sem confirmação nomeada; bucket privado com MIME/tamanho/`download=` no molde já auditado duas vezes; segredo do Slack **fora do banco** (e o furo do `resend_api_key` fica documentado em vez de repetido); dashboard 100% agregado com `gp_is_admin()` ou 42501; a trava do favorito é **trigger de banco**, não UI; menção revalidada no servidor com teto de 10; toda tabela nova com RLS e `anon` sem nada. 11 vetores nomeados para o pentester. |
| **Escalabilidade** | Dashboard = **1 RPC agregada** por abertura (nenhum card consulta), com `explain` obrigatório e um índice **condicionado a medição**; o painel continua paginado e o filtro continua em memória sobre o lote; a persistência é **URL + sessionStorage**, sem tabela e sem escrita; o onboarding é 1 linha por pessoa (teto natural = 2.459) e 0..6 arquivos de 5 MB. A 10× (1.580 ambientes) o único custo que cresce é o `group by` de `aluno_eventos` — endereçado por M3 antes de aplicar. |
| **Solidificação** | O banco passa a garantir sozinho: CHECK fechado em `grau_relacao`, `origem_cliente1`, `fase_cliente1`, `tipo` de anexo e **formato do `path`**; `unique` parcial do contrato por pessoa; `check` de coerência fase↔origem; **trigger 42501** na troca do favorito confirmado; `onboarding_concluir` **atômica**, com a obrigatoriedade de honorários+contrato como regra de banco e não de tela; a PK do onboarding é a identidade única que a `…160` já protege. |
| **UX** | A copy do João entra **literal** onde ele escreveu; retomada real (fechou no 3, volta no 3); o gate de obrigatoriedade **desabilita com a razão ao lado**, nunca deixa clicar e falhar; o tour mostra **as abas que aquela pessoa tem**; a trava do favorito se explica na ficha em vez de virar erro; a volta ao painel devolve o filtro **e** o card de onde se saiu; todo gráfico tem `aria-label` e tabela de valores visível; vazio é instrução, nunca "R$ 0,00". |
| **Otimização** | **Saldo negativo em quatro frentes:** (1) os **4 KPIs do painel são removidos** — o dashboard os absorve com mais informação; (2) `getContextoSessao` perde o `ilike` em `thb_alunos` que rodava **em toda requisição de sócio** (passa a ler `pessoa_aluno_id` da linha de `gps.membros` que já lê); (3) **zero dependência nova** — 5 gráficos SVG em Server Component (0 KB de JS) contra ~100 KB gzip de `recharts` na rota mais usada pela equipe; (4) o chip de onboarding, o filtro `apto_ao_saldo` e o `em_fechamento` saem da RPC do painel que **já roda**, sem consulta nova. O dashboard inteiro custa **1 ida ao banco**. |

---

## K. Tarefas

### backend-engineer
- [ ] migrations `…200` a `…211` (§H.1), **na ordem** — a `…211` fica pronta e **não aplicada** (B-K1)
- [ ] `gps.pessoa_atual()` + `getContextoSessao` lendo `pessoa_aluno_id` e **removendo** o `ilike` de `auth.ts:95-106`
- [ ] `src/lib/data/onboarding.ts` e `src/lib/data/dashboard.ts` (colunas explícitas, sem `select("*")`)
- [ ] `src/app/onboarding/actions.ts` (6 actions) + `criarAcessosEmLote` + `confirmar/liberarAcompanhamento`
- [ ] `src/lib/slack.ts` — fire-and-forget, timeout 3 s, `logErro`, payload mínimo, interruptor `slack_mencoes_ativo`
- [ ] espelhos no TS: `TIPOS_EVENTO`, `ROTULO_TIPO_EVENTO`, `ROTULO_MACRO_POR_TIPO`, frases em `erros.ts`
- [ ] `PatchCliente` + `CHAVES_PATCH_CLIENTE` com `grau_relacao` (**os dois lugares**)
- [ ] publicar o contrato executado neste arquivo e o bloco B0–B9 rodado em rollback, com os números

### frontend-engineer
- [ ] `src/components/ui/graficos/**` — 5 SVG, Server Components, tokens semânticos, `aria-label` + tabela de valores
- [ ] `src/components/onboarding/**` — 10 passos, retomada, gate com razão escrita, tour por `navDoAluno`
- [ ] `src/components/admin/dashboard/**` + `/admin` **sem** os 4 KPIs antigos
- [ ] painel: estado na **URL**, âncora por `alunoId` em `sessionStorage`, chip + filtros novos
- [ ] Clientes: grau de relação (ficha, card, filtro), trava do favorito explicada, copy da "central"
- [ ] Diário: `@` com lista de mencionáveis (só admin, sem e-mail), teto de 10
- [ ] `/perfil`: respostas em somente leitura + "rever a apresentação"
- [ ] `PageHeader` + `<main id="conteudo">` em toda rota nova; `DialogoConfirmacao` em tudo que tranca

### security-pentester — **obrigatório**
- [ ] V1–V11 (§H.4), com severidade e remediação endereçada por agente

### fable-orchestrator
- [ ] diff completo, roteiro logado (§H.7), os 5 critérios (§J), veredito vinculante

---

**FIM DA CONCEPÇÃO DO ARQUITETO.** Próximo a escrever aqui: `backend-engineer` (contrato
publicado + bloco de conferência com os números reais).

## Onda 0 — medições e decisões do orquestrador (10/09)

**MEDIR (resultados reais):**
- **M1 ✅ GATE**: `membros_pessoa_uk` existe (`unique (pessoa_aluno_id) where not null`) → `pessoa_aluno_id` é a PK do onboarding (§B.1 vale).
- **M2**: 3 usuários com login que nunca entraram; chaves do `raw_user_meta_data` deles: `nome, sistema, telefone` → backfill da flag por MERGE (`||`) é seguro.
- **M3 🚩 GATE**: `explain` do group-by por dia (30 d) em `aluno_eventos` (1.450 linhas) = **Seq Scan** (`Rows Removed by Filter: 783`, 24,7 ms) → **entra `idx_aluno_eventos_ocorrido_em on gps.aluno_eventos (ocorrido_em desc)` na migration do dashboard**. Índices atuais: `timeline (aluno_id, ocorrido_em desc)`, `backfill_corte` parcial, pkey.
- **M4**: triggers em `etapa1_clientes`: `trg_aluno_eventos_etapa1_clientes` (AFTER INSERT OR DELETE OR UPDATE → `gps.aluno_eventos_capturar_etapa1_clientes()`), `trg_etapa1_clientes_status_congelado` (BEFORE UPDATE OF status), `trg_etapa1_clientes_touch` (BEFORE UPDATE). → O backend LÊ `aluno_eventos_capturar_etapa1_clientes` antes de decidir quais eventos `onboarding_concluir` grava (não duplicar `cliente_cadastrado`/`cliente_favoritado`). A trava nova é `BEFORE UPDATE OR DELETE` e não pode colidir com a do `status`.
- **M5**: bucket `gps-chamados`: policies `gps_chamados_anexo_select [SELECT] (bucket_id='gps-chamados' and gps.pode_ver_anexo_chamado(name))`, `gps_chamados_anexo_insert [INSERT]` (with_check via guarda), `gps_chamados_anexo_delete_admin [DELETE] gp_is_admin()`; guardas `gps.pode_ver_anexo_chamado`, `gps.pode_anexar_chamado`; `has_table_privilege('postgres','storage.objects','select') = true` → a RPC consegue conferir MIME/tamanho em `storage.objects.metadata`. Molde confirmado (migrações `…110–…116`).
- **M6**: 0 membros sem pessoa (desde a `…187`, com trigger).
- **M7**: mencionáveis = **19** (admin 16 + dev 3); o gestor fica fora.
- **M8**: `gps-onboarding` não existe; `gps-documentos` segue órfão (privado, sem limite). Outros buckets são de outros sistemas — não tocar.

**Decisões do orquestrador sobre os BLOQUEIOS (padrões provisórios em vigor até o João responder):**
- **B-S1**: nenhuma tela escreve valor em reais; chip/filtro = "Contrato de honorários enviado". Perguntado ao João.
- **B-D1**: passo 7 genérico e opcional (0–5 arquivos). Perguntado ao João.
- **B-W1**: Slack nasce desligado (`slack_mencoes_ativo='false'`, env `SLACK_WEBHOOK_MENCOES` ausente); menção gravada e visível no Diário. Perguntado ao João.
- **B-R1**: retenção = enquanto a pessoa estiver no programa; expurgo por clique do admin (botão fica de fora desta rodada); leem admin + membros do ambiente. Perguntado ao João.
- **B-T2**: tour pulável (sim). **B-G1**: os 6 rótulos. **B-K1**: a `…211` (segredos) fica **escrita e NÃO aplicada** — tocaria o caminho de e-mail do Plantão que roda sozinho por cron (`plantao_disparar_emails_sala` lê `gps.config`); vira pendência explícita para o João, com a migration pronta.
- **C-1…C-9**: aceitas como o arquiteto decidiu.


---

## Backend — Ondas 1–2 (CONTRATO PUBLICADO)

> `backend-engineer` (Opus) · 10/09/2026 · alvo: `main` pós `48fc5b9`
> **Nada aplicado, nada commitado.** As 12 migrations são arquivos; o orquestrador
> aplica pelo MCP na ordem abaixo e roda o bloco B0–B9 do fim desta seção.

### 1. Migrations — o que cada uma faz

| # | Arquivo | O que faz | O que NÃO faz |
|---|---|---|---|
| 200 | `20260910000200_gps_acessos_log_acoes_do_onboarding.sql` | acha o CHECK de `acessos_log.acao` **por conteúdo** (`financeiro_desvinculado`) ou aborta; recria com os 12 vigentes + `favorito_confirmado`, `favorito_liberado`, `acessos_criados_em_lote`. **+ `gps.admin_registrar_lote_de_acessos(int,int,int,int)`** | não remove valor, não toca RLS/grant/linha |
| 201 | `…201_gps_aluno_eventos_tipos_do_onboarding.sql` | acha os 2 CHECKs por conteúdo (`etapa_travada_pela_equipe` / `entidade`) ou aborta; `tipo` ganha `onboarding_iniciado`, `onboarding_concluido`, `favorito_confirmado_pela_equipe`, `favorito_liberado_pela_equipe`; `entidade` ganha `onboarding` | zero backfill, zero índice, nenhuma trigger tocada |
| 202 | `…202_gps_etapa1_clientes_grau_relacao.sql` | `grau_relacao text` + CHECK dos 6 + `comment on column` | **zero backfill** (878 nascem `null`), zero índice, não toca `nivel_relacionamento`/`fase`/`status` |
| 203 | `…203_gps_etapa1_clientes_acompanhamento.sql` | `acompanhamento_confirmado_em/_por` + trigger `trg_etapa1_clientes_acompanhamento_travado` (BEFORE UPDATE OR DELETE) + `admin_confirmar_acompanhamento(uuid,text)` + `admin_liberar_acompanhamento(uuid,text)` | **zero backfill** (os 25 favoritos seguem livres); não mexe em RLS |
| 204 | `…204_gps_onboarding_estrutura.sql` | `gps.pessoa_atual()`, `onboarding_respostas`, `onboarding_anexos`, RLS, grants, 3 índices | não cria bucket, não cria RPC, 0 linhas escritas |
| 205 | `…205_gps_onboarding_storage.sql` | bucket `gps-onboarding` (privado, 5 MB, 4 MIMEs) + `pode_ver_anexo_onboarding` + `pode_anexar_onboarding` + 3 policies em `storage.objects` | não apaga bucket nenhum, nada para `anon` |
| 206 | `…206_gps_onboarding_rpcs.sql` | `onboarding_meu()`, `onboarding_salvar_passo(smallint,jsonb)`, `onboarding_registrar_anexo(text,text,text,text,int)`, `onboarding_remover_anexo(uuid)`, `onboarding_concluir()`, `admin_onboarding_do_aluno(uuid)` | não cobra nada, não manda e-mail, não cria fase nova |
| 207 | `…207_gps_nota_mencoes.sql` | `gps.nota_mencoes` + RLS só-select-admin + `admin_mencionaveis()` + **`registrar_mencoes(uuid,uuid[])`** + `gps.config.slack_mencoes_ativo='false'` | não posta nada (quem posta é `src/lib/slack.ts`), não guarda texto de nota |
| 208 | `…208_gps_senha_temporaria.sql` | recria as 3 RPCs de senha **a partir do corpo vigente** (…118 / …132 / …020) com merge de `gps_senha_temp_em` + backfill idempotente | não muda nenhuma guarda, validação, log ou retorno |
| 209 | `…209_gps_admin_dashboard.sql` | `idx_aluno_eventos_ocorrido_em` + `gps.admin_dashboard()` jsonb, 7 blocos, 1 ida | 0 linha escrita; **não** lê `aluno_notas`; zero PII |
| 210 | `…210_gps_admin_painel_alunos_v3.sql` | `drop function (integer,integer)` + recria com `onboarding_status`, `em_fechamento`, `apto_ao_saldo` | não muda nenhum dos 14 valores antigos; sem índice novo |
| 211 | `…211_gps_segredos.sql` | **ESCRITA E NÃO APLICADA (B-K1)** — `gps.segredos` (RLS ligada, zero policy) + move `resend_api_key`/`email_from` + reescreve as leitoras do Plantão a partir do `pg_get_functiondef` VIGENTE | — |

**Ordem obrigatória: 200 → 210.** A 200 e a 201 vêm primeiro porque as RPCs das
demais gravam log/evento no ÚLTIMO passo: sem os catálogos, cada uma morre com
23514 depois de já ter feito o trabalho e "o botão não faz nada".

### 2. Contrato Dashboard — o SHAPE de `gps.admin_dashboard()`

```jsonc
{
  "gerado_em": "2026-09-10T…Z",
  "referencia": { "fuso":"America/Sao_Paulo", "hoje":"2026-09-10", "dia":10,
                  "mes":"2026-09", "mes_anterior":"2026-08" },
  "programa":   { "total":158, "no_mes":50, "no_mes_anterior_ate_o_dia":N,
                  "por_mes":[{"mes":"2025-10","qtd":3}, … 12 meses] },
  "acesso":     { "total":158, "com_login":139, "sem_login":19,
                  "nunca_entraram":3, "sem_acesso_30d":N, "ativos_30d":N },
  "onboarding": { "pessoas":171, "concluidos":0, "em_andamento":0,
                  "concluidos_no_mes":0, "parados_7d":0,
                  "com_cliente1":0, "em_execucao":0 },
  "clientes":   { "total":878, "prospeccao":841, "fechamento":37, "contratado":0,
                  "no_mes":N, "no_mes_anterior_ate_o_dia":N },
  "honorarios": { "clientes_contratados":0, "contratados_sem_valor":0,
                  "ambientes_com_contratado":0, "total_reais":null,
                  "somas_por_ambiente":[] },
  "atividade":  [ {"dia":"2026-09-01","aluno":3,"equipe":1,"sistema":0}, … 30 ],
  "grau_relacao": { "itens":[{"grau":"parente","qtd":0}, …], "nao_informado":878 }
}
```

**Desvio declarado — 7 blocos, não 9.** Os cards **6 (trilha)** e
**7 (atendimento)** NÃO vêm da RPC, e isso é o crédito de otimização:

- `faixasDeTrilha(alunos)` (`src/lib/data/dashboard.ts`, **função pura**) usa o
  `pct` que `getAlunosGps()` já calculou com `resumoEtapa1`. Reescrever o
  catálogo de tarefas em SQL criaria um segundo lugar para a MESMA regra
  divergir — e o número da tela do aluno e o do painel têm de ser o mesmo.
  Devolve `[{faixa:"0"|"1-49"|"50-99"|"100", rotulo, qtd}]`.
- `resumoAtendimento(alunos, atendimentoPorAluno)` (**pura**) usa o Map que
  `getAtendimentoPorAluno()` já devolve. Retorno:
  `{pendenciasAbertas, ambientesComPendencia, chamadosAbertos, ambientesComChamado, semNenhumaNota, semAcesso30d}`.

**Regras que o frontend precisa honrar:**
- `total_reais: null` não é R$ 0,00 — é "não informado".
- `ambientes_no_aureo` é calculado no TS (`somas.filter(s => s >= META_HONORARIOS)`):
  a meta é POR AMBIENTE e **não existe meta do programa**.
- a tela é **obrigada** a escrever "até o dia N" ao lado da variação
  (`referencia.dia`); sem isso, todo dia 1º o painel anuncia menos 95%.
- `grau_relacao.nao_informado` sai separado e **nunca** vira uma fatia "Lead".
- zero PII no retorno: nenhum nome, e-mail ou `aluno_id`.

### 3. Contrato `onboarding_meu()`

```jsonc
{
  "status": "nao_iniciado" | "em_andamento" | "concluido",
  "versao": 1,
  "passo_atual": 0,
  "respostas": {
    "origem_cliente1": null,          // 'captacao' | 'ja_tenho'
    "fase_cliente1": null,            // 'viabilidade_feita'|'croqui_apresentado'|'execucao_andamento'
    "valor_honorarios": null,
    "cliente_nome": null, "cliente_telefone": null, "cliente_grau_relacao": null,
    "descricao_caso": null, "ajuda_pronta": null,
    "cliente_id": null, "iniciado_em": null, "concluido_em": null
  },
  "anexos": [ {"id","tipo","nome","mime","tamanho","path","criado_em"} ],
  "ambiente_ja_tem_favorito": false
}
```

🔴 **DESVIO DECLARADO em relação ao §B.2 do arquiteto:** entraram 3 colunas —
`cliente_nome`, `cliente_telefone`, `cliente_grau_relacao`. O rascunho não tem
onde guardar o cliente 1 entre o passo 3 e a conclusão, e o onboarding é
**retomável** por contrato ("fechou no 3, volta no 3"); sem elas, fechar o
navegador no passo 4 apagaria o que a pessoa digitou, e `onboarding_concluir()`
(sem parâmetros, por contrato) não teria com que criar o cliente.

`onboarding_meu()` **não cria linha**: abrir o pop-up não é responder — uma
linha por abertura transformaria "em andamento" em ruído no dashboard. A linha
nasce em `onboarding_salvar_passo`.

`precisaTrocarSenha` **não vem do banco**: sai de
`ctx.user.user_metadata.gps_senha_temp_em`, que já chega no `getUser()` da
sessão memoizada. Zero consulta.

### 4. Assinaturas TS finais

```ts
// src/lib/types.ts (constantes/tipos novos)
GRAUS_RELACAO, GrauRelacao
ORIGENS_CLIENTE1, OrigemCliente1
FASES_CLIENTE1, FaseCliente1
StatusOnboarding, TipoAnexoOnboarding, OnboardingAnexo,
RespostasOnboarding, MeuOnboarding, OnboardingDaPessoa
MAX_DOCUMENTOS_ONBOARDING = 5
TIPOS_EVENTO += 4 tipos · EntidadeEvento += "onboarding"
ClienteEtapa1 += grau_relacao, acompanhamento_confirmado_em, acompanhamento_confirmado_por

// src/lib/etapa1.ts
GRAUS_RELACAO_UI:  { id: GrauRelacao; rotulo: string; ajuda: string }[]
FASES_CLIENTE1_UI: { id: FaseCliente1; rotulo: string; faseCliente: FaseCliente; exigeContrato: boolean }[]
// ↑ `rotulo` é a COPY LITERAL do João. `exigeContrato` é o gate do passo 4.

// src/lib/data/onboarding.ts  (reexportado por src/lib/data.ts)
getMeuOnboarding(): Promise<MeuOnboarding | null>        // null = não é aluno
getOnboardingDoAluno(alunoId): Promise<OnboardingDaPessoa[]>
urlDoAnexoOnboarding(path, nome): Promise<string | null> // SEMPRE com download=

// src/lib/data/dashboard.ts  (reexportado)
getDashboard(): Promise<Dashboard | null>                 // null = erro → tela de erro, nunca 9 zeros
faixasDeTrilha(alunos: AlunoGps[]): FaixaDeTrilha[]       // PURA
resumoAtendimento(alunos, atendimento): ResumoAtendimento // PURA

// src/lib/data/alunos.ts — AlunoGps ganhou 3 campos
onboardingStatus: StatusOnboarding · emFechamento: number · aptoAoSaldo: boolean

// src/app/onboarding/actions.ts  ("use server"; pasta SEM page.tsx, como clientes/)
salvarPassoOnboarding(passo: number, dados: PatchOnboarding): Promise<{erro?}>
criarUploadAssinadoOnboarding({nome,mime,tamanho,tipo}): Promise<{ok:true;path;token;nome}|{ok:false;erro}>
registrarAnexoOnboarding({tipo,path,nome,mime,tamanho}): Promise<{erro?}>
removerAnexoOnboarding(id: string): Promise<{erro?}>
concluirOnboarding(): Promise<{erro?; clienteId?: string|null; favoritado?: boolean}>
trocarSenhaObrigatoria(nova: string): Promise<{erro?}>

// src/app/admin/actions.ts
criarAcessoAluno(alunoId, opts?: {email?; senha?; permitirAdocao?: boolean})  // default true
LOTE_ACESSOS_MAXIMO = 20
criarAcessosEmLote(alunoIds: string[]): Promise<{erro?; resultados: ResultadoAcessoEmLote[]}>
// ResultadoAcessoEmLote = {alunoId, ok, erro?, email?, senha?, emailEnviado?, precisaDecisao?, programas?}

// src/app/admin/central-actions.ts
confirmarAcompanhamento(clienteId, alunoId, motivo): Promise<{erro?; clienteId?}>
liberarAcompanhamento(clienteId, alunoId, motivo): Promise<{erro?; clienteId?}>

// src/app/admin/diario-actions.ts
registrarNota({ ...jaExiste, mencoes?: string[] })   // teto 10 aqui e no banco
listarMencionaveis(): Promise<{id: string; nome: string}[]>   // 19 hoje, SEM e-mail

// src/lib/slack.ts
webhookConfigurado(): boolean        // só o booleano, NUNCA a URL
notificarMencao(dados, ativo): Promise<{ok; enviado}>   // nunca lança

// src/lib/auth.ts — ContextoSessao
+ pessoaAlunoId: string | null
  membroNome  → @deprecated, SEMPRE null (o `ilike` em thb_alunos.email SAIU)
```

### 5. Frases novas de erro (todas em `FRASES_DO_BANCO`, `src/lib/erros.ts`)

**Trava do favorito (…203):**
- "A equipe está acompanhando este cliente — só a equipe pode trocar o cliente acompanhado." → tela: *"…Para trocar, fale com a equipe pelo Suporte."*
- "…ele não pode ser excluído." · "…a fase não pode voltar para Prospecção."
- "Só a equipe confirma ou libera o acompanhamento deste cliente."

**RPCs de acompanhamento:** "Cliente não encontrado." · "Este cliente não é o
cliente acompanhado deste aluno. Marque a estrela antes de confirmar." · "A
equipe já está acompanhando este cliente." · "A equipe não está acompanhando
este cliente."

**Onboarding (…206):** "Seu cadastro ainda não está vinculado ao programa. Fale
com a equipe." · "Você já concluiu o questionário inicial." · "Responda o
questionário antes de concluir." · "Responda o questionário antes de anexar." ·
"Escolha de onde virá o seu cliente 1." · "Informe em que fase você está com
este cliente." · "Informe o nome do seu cliente 1." · **"Informe o valor dos
honorários pactuados para seguir."** · **"Anexe o contrato de honorários
assinado para seguir."** · "Informe o valor dos honorários como número." ·
"Honorários: valor fora do limite permitido." · "Escolha um grau de relação da
lista." · "O nome do cliente passa de 200 caracteres." · "Telefone inválido." ·
"A descrição passa de 4.000 caracteres." · "O texto passa de 4.000 caracteres."
· "Nome de arquivo inválido." · "Você já anexou 5 documentos." · "Anexo não
encontrado." + as 6 frases de anexo herdadas do molde do chamado.

**Menções (…207):** "Nota não encontrada."

### 6. Bloco de conferência B0–B9 — adaptado, pronto para colar

```sql
-- B0 · GATES, ANTES de aplicar (guardar os números)
select count(*) as clientes from gps.etapa1_clientes;              -- ~878
select count(*) as log      from gps.acessos_log;
select count(*) as eventos  from gps.aluno_eventos;                -- ~1.450
select count(distinct aluno_id) as ambientes from gps.membros;     -- 158
select fase, count(*) from gps.etapa1_clientes group by 1;         -- 841/37/0
select count(*) from gps.etapa1_clientes where acompanhado_equipe; -- 25
-- os CHECKs existem e têm o conteúdo que as ...200/...201 procuram:
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid in ('gps.acessos_log'::regclass,'gps.aluno_eventos'::regclass)
   and contype='c';
-- corpo VIGENTE das 3 RPCs de senha e do painel (as ...208/...210 partem daqui):
select p.proname, md5(pg_get_functiondef(p.oid)) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='gps'
  and p.proname in ('admin_definir_senha','admin_definir_senha_membro',
                    'admin_adotar_login_existente','admin_painel_alunos');
-- as 14 colunas antigas do painel, para comparar depois:
select * from gps.admin_painel_alunos(1000,0) order by aluno_id;
-- metadata dos 3 que nunca entraram (o backfill da ...208 não pode apagar chave):
select u.id, u.raw_user_meta_data from auth.users u
 where u.last_sign_in_at is null
   and exists (select 1 from gps.membros m where m.user_id=u.id);

-- B1 · as constraints cresceram e nenhuma linha antiga quebrou
select count(*) from gps.acessos_log;     -- IGUAL ao B0
select count(*) from gps.aluno_eventos;   -- IGUAL ao B0
select pg_get_constraintdef(oid) from pg_constraint
 where conname='acessos_log_acao_check';      -- 15 valores
select pg_get_constraintdef(oid) from pg_constraint
 where conname='aluno_eventos_tipo_check';    -- 24 tipos
select pg_get_constraintdef(oid) from pg_constraint
 where conname='aluno_eventos_entidade_check';-- 5 entidades

-- B2 · BACKFILL ZERO (os números têm de ser EXATAMENTE estes)
select count(*) from gps.etapa1_clientes where grau_relacao is not null;                 -- 0
select count(*) from gps.etapa1_clientes where acompanhamento_confirmado_em is not null; -- 0
select count(*) from gps.etapa1_clientes where acompanhado_equipe;                       -- 25
select count(*) from gps.onboarding_respostas;                                           -- 0
select count(*) from gps.onboarding_anexos;                                              -- 0
select count(*) from gps.nota_mencoes;                                                   -- 0
select count(*) from gps.etapa1_clientes;                                                -- IGUAL ao B0

-- B3 · ACLs: nada para anon; escrita direta fechada nas tabelas novas
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as auth
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='gps'
   and p.proname in ('pessoa_atual','onboarding_meu','onboarding_salvar_passo',
        'onboarding_registrar_anexo','onboarding_remover_anexo','onboarding_concluir',
        'admin_onboarding_do_aluno','admin_dashboard','admin_mencionaveis',
        'registrar_mencoes','admin_confirmar_acompanhamento',
        'admin_liberar_acompanhamento','admin_registrar_lote_de_acessos',
        'pode_ver_anexo_onboarding','pode_anexar_onboarding','admin_painel_alunos')
 order by 1;
-- ESPERADO: anon = false em TODAS · auth = true em TODAS.
select c.relname,
       has_table_privilege('anon',          c.oid,'select') as anon_sel,
       has_table_privilege('authenticated', c.oid,'select') as auth_sel,
       has_table_privilege('authenticated', c.oid,'insert') as auth_ins,
       has_table_privilege('authenticated', c.oid,'update') as auth_upd,
       has_table_privilege('authenticated', c.oid,'delete') as auth_del
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='gps' and c.relname in
   ('onboarding_respostas','onboarding_anexos','nota_mencoes');
-- ESPERADO: anon_sel=false; auth_sel=true; ins/upd/del = false nas TRÊS.
select count(*) as sobrecargas from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='gps' and p.proname='admin_painel_alunos';        -- 1

-- B4 · a TRAVA do favorito morde (em transação com ROLLBACK)
begin;
  -- <CID>/<AID> = um favorito qualquer:
  select id, aluno_id from gps.etapa1_clientes where acompanhado_equipe limit 1;
  select gps.admin_confirmar_acompanhamento('<CID>', 'teste de trava B4');
  select acao, detalhe from gps.acessos_log
   where acao='favorito_confirmado' order by criado_em desc limit 1;
  select tipo, ator from gps.aluno_eventos
   where tipo='favorito_confirmado_pela_equipe' order by ocorrido_em desc limit 1;  -- ator=equipe
  -- COMO O ALUNO (set role authenticated + JWT do dono):
  --   update gps.etapa1_clientes set acompanhado_equipe=false where id='<CID>';   => 42501
  --   delete from gps.etapa1_clientes where id='<CID>';                           => 42501
  --   update gps.etapa1_clientes set fase='prospeccao'   where id='<CID>';        => 42501
  --   update gps.etapa1_clientes set acompanhamento_confirmado_em=null
  --     where id='<CID>';                                                         => 42501
  --   update gps.etapa1_clientes set telefone='11999999999' where id='<CID>';     => PASSA
  select gps.admin_liberar_acompanhamento('<CID>', 'teste de liberacao B4');
  select acompanhado_equipe, acompanhamento_confirmado_em
    from gps.etapa1_clientes where id='<CID>';   -- true, NULL (liberar NÃO desmarca)
rollback;
select count(*) from gps.etapa1_clientes where acompanhamento_confirmado_em is not null; -- 0

-- B5 · onboarding_concluir é ATÔMICA (transação com ROLLBACK, JWT de aluno)
-- (a) 'execucao_andamento' SEM anexo => erro e ZERO cliente novo
begin;
  select gps.onboarding_salvar_passo(3::smallint, jsonb_build_object(
    'origem_cliente1','ja_tenho','fase_cliente1','execucao_andamento',
    'cliente_nome','Cliente de teste B5','cliente_telefone','11999999999',
    'cliente_grau_relacao','parente'));
  select gps.onboarding_concluir();  -- => 'Anexe o contrato de honorários assinado para seguir.'
  select count(*) from gps.etapa1_clientes;   -- IGUAL ao B0
rollback;
-- (b) fase 'croqui_apresentado' (sem gate) => 1 cliente, favorito só se não havia
begin;
  select gps.onboarding_salvar_passo(3::smallint, jsonb_build_object(
    'origem_cliente1','ja_tenho','fase_cliente1','croqui_apresentado',
    'cliente_nome','Cliente de teste B5b','cliente_grau_relacao','indicacao'));
  select gps.onboarding_concluir();  -- => {"cliente_id":"...","favoritado":true|false}
  select nome, fase, grau_relacao, acompanhado_equipe, ordem
    from gps.etapa1_clientes order by criado_em desc limit 1;   -- fase = fechamento
  select tipo, entidade, ator from gps.aluno_eventos order by ocorrido_em desc limit 3;
  -- ESPERADO: onboarding_concluido(onboarding) + cliente_favoritado?(cliente)
  --           + cliente_cadastrado(cliente). Os dois últimos VÊM DA TRIGGER; a
  --           RPC grava só o primeiro. NUNCA duplicados.
rollback;
select count(*) from gps.etapa1_clientes;      -- IGUAL ao B0
select count(*) from gps.onboarding_respostas; -- 0

-- B6 · menção não vaza
select count(*) from gps.admin_mencionaveis();                    -- 19
select * from gps.admin_mencionaveis() limit 3;                   -- id + nome, SEM e-mail
select count(*) from public.perfis
 where status='ativo' and cargo in ('dev','admin');               -- 19 (contador independente)
begin;
  -- <NID> = uma nota qualquer de gps.aluno_notas
  select gps.registrar_mencoes('<NID>', (select array_agg(id) from public.perfis));
  select count(*) from gps.nota_mencoes where nota_id='<NID>';    -- no máximo 10
  select count(*) from gps.nota_mencoes m join public.perfis p on p.id=m.perfil_id
   where p.status<>'ativo' or p.cargo not in ('dev','admin');     -- 0
rollback;
select count(*) from gps.nota_mencoes;                            -- 0
-- o SEGREDO do Slack não está no banco:
select chave from gps.config order by 1;
-- tem slack_mencoes_ativo='false'; NÃO tem nenhuma chave de webhook.

-- B7 · senha temporária: MERGE, nunca sobrescrita
select count(*) from auth.users where raw_user_meta_data ? 'gps_senha_temp_em';  -- 3
select u.id, array_agg(k order by k) from auth.users u,
  lateral jsonb_object_keys(u.raw_user_meta_data) k
 where u.raw_user_meta_data ? 'gps_senha_temp_em' group by u.id;
-- ESPERADO: nome, sistema, telefone CONTINUAM lá + gps_senha_temp_em.
-- Reaplicar a ...208 NÃO pode recarimbar (a data não pode andar).

-- B8 · dashboard: uma ida, custo medido, números que batem
explain (analyze, buffers) select gps.admin_dashboard();
select gps.admin_dashboard() -> 'programa'   -> 'total';       -- 158
select gps.admin_dashboard() -> 'clientes';                    -- 841/37/0
select gps.admin_dashboard() -> 'onboarding' -> 'concluidos';  -- 0
select gps.admin_dashboard() -> 'honorarios' -> 'total_reais'; -- null (NÃO 0)
select gps.admin_dashboard() -> 'grau_relacao' -> 'nao_informado';  -- ~878
-- contadores INDEPENDENTES (não passam pela função testada):
select count(distinct aluno_id) from gps.membros;                             -- 158
select to_char(criado_em at time zone 'America/Sao_Paulo','YYYY-MM'), count(*)
  from gps.membros where papel='titular' group by 1 order by 1;               -- 07=68 08=40 09=50
-- o índice do card 8 entrou no plano:
explain (analyze, buffers)
 select date_trunc('day', ocorrido_em), count(*) from gps.aluno_eventos
  where ocorrido_em > now() - interval '30 days' group by 1;   -- Index Scan, não Seq Scan
-- ZERO PII no retorno:
select gps.admin_dashboard()::text ~ '@' as tem_email;         -- false

-- B9 · o log não vaza e o painel não regrediu
select acao, count(*) from gps.acessos_log group by 1 order by 1;
select count(*) from gps.admin_painel_alunos(1000,0);                       -- 158
select onboarding_status, count(*) from gps.admin_painel_alunos(1000,0) group by 1;
-- ESPERADO no dia da aplicação: nao_iniciado = 158, e nada mais.
select count(*) filter (where apto_ao_saldo) as aptos,
       sum(em_fechamento) as em_fechamento from gps.admin_painel_alunos(1000,0);
-- ESPERADO: aptos = 0 · em_fechamento = 37
select count(*) from gps.etapa1_clientes where fase='fechamento';           -- 37 (independente)
-- as 14 colunas antigas IDÊNTICAS ao retrato do B0:
select * from gps.admin_painel_alunos(1000,0) order by aluno_id;
-- bucket e policies:
select id, public, file_size_limit, allowed_mime_types from storage.buckets
 where id='gps-onboarding';   -- privado, 5242880, os 4 MIMEs
select polname, polcmd from pg_policy where polrelid='storage.objects'::regclass
   and polname like 'gps_onboarding%' order by 1;   -- 3: select, insert, delete_admin
```

### 7. Desvios e riscos (para o pentester e para o Fable)

1. **3 colunas a mais em `onboarding_respostas`** (`cliente_nome/_telefone/_grau_relacao`) — o §B.2 não tinha onde guardar o cliente 1 entre o passo 3 e a conclusão, e o onboarding é retomável. Justificado no cabeçalho da …204.
2. **`authenticated` recebe só `select`** nas duas tabelas de onboarding (o §H.1 dizia select/insert/update). As policies de insert/update do dono EXISTEM; o grant é que não foi dado. Motivo: com `insert` direto em `gps.onboarding_anexos`, qualquer aluno forjaria uma linha `contrato_honorarios` pelo PostgREST e passaria pelo gate que o João chamou de fundamental. `onboarding_anexos` **nunca** deve ganhar grant de escrita. Precedente: `gps.chamados` (…110).
3. **Dashboard com 7 blocos, não 9** — cards 6 e 7 em TS, sobre dados já carregados (§2). Zero consulta nova; a regra do `pct` continua num lugar só.
4. **`registrar_mencoes` é RPC**, não escrita da action (o §H.1 deixava a escolha). Justificado na …207: a revalidação precisa ler `public.perfis` inteiro (tabela do sip, leitura ampla não garantida ao admin pela REST) e, sem RPC, a tabela precisaria de `grant insert` — abrindo menção forjada em nota alheia com perfil inativo.
5. **`ctx.membroNome` virou sempre `null`** (o `ilike` saiu). Os 2 consumidores já têm fallback (`chamados/actions.ts:402` busca por `membroAlunoId`; `page.tsx:128` usa `aluno?.nome`). **Tarefa do frontend:** tirar as leituras e o campo do tipo.
6. **`gps.admin_registrar_lote_de_acessos`** não estava no plano: `gps.acessos_log` não tem policy de insert, então um `.insert()` da action voltaria **sem erro e sem linha**. Sem ela, o lote não teria trilha nenhuma (o `signUp` de `criarAcessoAluno` não loga).
7. **`admin_confirmar_acompanhamento` exige que o cliente JÁ seja o favorito.** Confirmar um que não é a estrela criaria um terceiro estado que nenhuma tela sabe mostrar. O admin marca a estrela antes (a trava não o barra).
8. **`admin_liberar_acompanhamento` NÃO desmarca a estrela** — desmarcar travaria os passos 4–8 da Etapa 01 de quem não pediu nada.
9. **Corrida do favorito (V9):** `onboarding_concluir` pega `for update` na resposta da pessoa e captura `unique_violation` na favoritação num bloco `begin/exception` (subtransação): o cliente é criado, só não recebe a estrela — que é exatamente a regra §B.1. **Não** vira erro na cara do aluno.
10. **`onboarding_remover_anexo` tira a LINHA, não o BYTE.** A policy de DELETE no bucket é só de admin e o GPS não usa `service_role`. A tela precisa dizer isso (B-R1).
11. **A marca `gps_senha_temp_em` é UX, não trava** — o próprio usuário pode limpá-la pelo GoTrue. Escrito na …208 e no tipo, em vez de fingir que é fronteira (vetor V2).
12. **`…211` não aplicada** — toca o caminho de e-mail do Plantão, que roda por `pg_cron` e já perdeu 11 de 20 e-mails em silêncio. O cabeçalho traz o roteiro de 5 passos do que testar antes.
13. **Não fiz** (é do frontend): qualquer `src/components/**` (exceto `diario-labels.ts`), `page.tsx`, gráficos SVG, portal do onboarding, chips/filtros do painel, âncora de rolagem, e a copy das telas.

### 8. Verificação rodada

```
$ npx tsc --noEmit
src/components/admin/alunos-ativos-lista/index.tsx(48,10): error TS2305:
  Module '"./ordenacao"' has no exported member 'filtrarAlunos'.
```
→ **único erro, e não é do backend**: `filtrarAlunos` foi movida para
`filtros.ts` pelo `frontend-engineer` (mtime 21:24–21:26, edição em curso) e o
`index.tsx` ainda importa do lugar antigo — ele já importa a mesma função de
`./filtros` na linha 55. **Zero erro em qualquer arquivo desta entrega.**

```
$ npx eslint src/lib/types.ts src/lib/etapa1.ts src/lib/erros.ts src/lib/auth.ts \
    src/lib/slack.ts src/lib/log-agregacao.ts src/lib/data.ts \
    src/lib/data/onboarding.ts src/lib/data/dashboard.ts src/lib/data/alunos.ts \
    src/lib/data/clientes.ts src/lib/email.ts src/components/admin/diario-labels.ts \
    src/app/onboarding/actions.ts src/app/admin/actions.ts \
    src/app/admin/central-actions.ts src/app/admin/diario-actions.ts \
    src/app/clientes/actions.ts
(sem saída — 0 erro, 0 aviso)
```

⚠️ **Nenhuma migration foi aplicada e nada foi rodado no banco** — o backend não
tem acesso. Todo número acima é o ESPERADO a partir das medições da Onda 0; o
bloco B0–B9 é o que os confirma.

## Orquestrador — migrations 200–210 APLICADAS e bloco B0–B9 rodado (10/09)

- **Aplicadas** (MCP, nesta ordem): 200, 201, 202, 203, 204, 205, 207, 206, 208, 209, 210. **211 NÃO aplicada** (B-K1). As 3 RPCs de senha da 208 foram conferidas contra o `pg_get_functiondef` VIGENTE antes de aplicar: corpo idêntico + merge da flag.
- **B1/B2**: log 42 e eventos 1.450 inalterados; grau 0 · confirmados 0 · favoritos 25 · respostas 0 · anexos 0 · menções 0 · clientes 878 (backfill zero confirmado).
- **B3**: 16 funções com `anon=false`/`auth=true`; `onboarding_respostas`/`onboarding_anexos`/`nota_mencoes` com `authenticated` só SELECT (ins/upd/del false), `anon` nada; `admin_painel_alunos` sobrecarga = 1.
- **B4** (rollback): confirmar → log `favorito_confirmado` + evento `favorito_confirmado_pela_equipe` (ator equipe); como o ALUNO dono: desmarcar estrela 42501, apagar 42501, voltar fase 42501, limpar confirmação 42501, **telefone passa**; liberar → estrela continua `true`, `confirmado_em` null.
- **B5** (rollback, JWT do titular 67f5d002 / ambiente 191699db sem favorito): `execucao_andamento` sem anexo → `22023 Anexe o contrato de honorários assinado para seguir.` e 0 cliente novo; chave desconhecida → 22023; `passo_atual` só avança (voltou ao 1 e ficou 3); concluir com `croqui_apresentado` → cliente `fase=fechamento`, `grau=indicacao`, estrela `true`, `favoritado:true`; eventos recentes = `cliente_cadastrado` + `cliente_favoritado` (trigger) + `onboarding_iniciado` + `onboarding_concluido` (RPC) — **sem duplicata**; salvar após concluir → 22023; sócio do mesmo ambiente vê **0** respostas do titular e o próprio status `nao_iniciado`; `admin_onboarding_do_aluno` lista titular (concluido) + sócio (nao_iniciado).
- **B6**: `admin_mencionaveis` = 19 (independente = 19), só `id`+`nome`; `registrar_mencoes` com TODOS os perfis → 10 gravadas, 0 inválidas; `gps.config` tem `slack_mencoes_ativo` e **nenhuma chave de webhook**.
- **B7**: 3 usuários com `gps_senha_temp_em`; chaves `nome, sistema, telefone` preservadas.
- **B8**: dashboard programa 158 · no_mes 50 · por_mes 07=68/08=40/09=50 · clientes 878 (841/37/0) · onboarding concluidos 0 · honorários `total_reais` **null** · grau não informado 878 · atividade 28 dias · sem `@` no retorno; índice `idx_aluno_eventos_ocorrido_em` entrou no plano (**Index Only Scan, 0,57 ms**; era Seq Scan 24,7 ms).
- **B9**: painel 158 linhas; `onboarding_status` = nao_iniciado 158; aptos 0; em_fechamento 37 (independente 37); bucket `gps-onboarding` privado/5 MB/4 MIMEs; 3 policies (select, insert, delete_admin); log novo 0 fora dos ensaios.
- ⚠️ Para o frontend: `ctx.membroNome` é sempre `null` agora — tirar os consumidores; estrela nos outros cards não deve aparecer quando houver favorito confirmado.

---

## Frontend — Onda 1

> `frontend-engineer` (Opus) · 10/09/2026 · em paralelo com as migrations do backend.
> `npx tsc --noEmit` **limpo (0 erro)** · `npx eslint` nos arquivos entregues **limpo (0 erro, 0 aviso)**.
> **Nenhum commit.** Nenhum `next build` / `next dev` rodado; `.next` intacto.

### 1. Arquivos entregues (todos novos, salvo os 3 marcados ✏️)

| Arquivo (`src/components/…`) | Linhas | O que é |
|---|---:|---|
| `ui/graficos/tipos.ts` | 125 | tom → token, `caminhoBarra`, `escala` (piso 1 = sem `NaN`), `larguraTexto`; **a conta de contraste que proíbe paleta categórica** |
| `ui/graficos/tabela-valores.tsx` | 109 | a tabela obrigatória; `colunas={2}` para série longa |
| `ui/graficos/barras.tsx` | 191 | colunas (SVG) **+ modo horizontal em HTML** — ver §3 |
| `ui/graficos/barra-empilhada.tsx` | 136 | parte-e-todo, vão de 2 px na cor da superfície |
| `ui/graficos/rosca.tsx` | 136 | ≤ 4 fatias, `pathLength=100`, miolo com o número macro |
| `ui/graficos/linha.tsx` | 148 | ≤ 2 séries (`marca` × `neutro`), tabela de RESUMO |
| `ui/graficos/funil.tsx` | 114 | barras deitadas + trilho (etapa zerada continua visível) |
| `ui/graficos/index.ts` | 26 | barril |
| `admin/dashboard/tipos.ts` | 198 | **o contrato `Dashboard` proposto** (§2) |
| `admin/dashboard/card-dashboard.tsx` | 101 | a moldura fixa: rótulo · macro · variação · micro · gráfico · link |
| `admin/dashboard/variacao.tsx` | 58 | "+19 vs. agosto **até o dia 10**" |
| `admin/dashboard/index.tsx` | 389 | os 9 cards |
| `onboarding/tipos.ts` | 213 | `MeuOnboarding`, `PatchOnboarding`, `OnboardingActions` + **a copy literal do João** |
| `onboarding/index.tsx` | 391 | a máquina (sequência, gravação, conclusão) |
| `onboarding/rodape.tsx` | 108 | botões + **a razão do travamento escrita ao lado** |
| `onboarding/travas.ts` | 48 | `razaoParaTravar()` — pura, testável |
| `onboarding/barra-de-passos.tsx` | 39 | "passo N de M" |
| `onboarding/escolha.tsx` | 74 | radio NATIVO em cartão (passos 2 e 3) |
| `onboarding/passo-senha.tsx` | 62 | passo 0 |
| `onboarding/passo-cliente.tsx` | 200 | passos 2, 3 e 4 |
| `onboarding/passo-texto.tsx` | 61 | passos 5 e 6 |
| `onboarding/passo-tour.tsx` | 49 | passo 8 + `abasDoTour()` |
| `onboarding/anexo-onboarding.tsx` | 253 | upload assinado, molde do `chamados/anexo-campo.tsx` |
| `perfil/respostas-do-inicio.tsx` | 145 | "Suas respostas do início" (some quando `null`) |
| `perfil/rever-apresentacao.tsx` | 81 | "Rever a apresentação" (reabre só o tour) |
| `admin/alunos-ativos-lista/estado-na-url.ts` | 207 | parse/serialize com **allowlist fechada**, debounce 300 ms, `hrefComEstado` |
| `admin/alunos-ativos-lista/filtros.ts` | 153 | 1 entrada por filtro (rótulo + predicado + `disponivel`) + `filtrarAlunos` |
| `admin/alunos-ativos-lista/ancora.ts` | 75 | `sessionStorage["gps.admin.painel.ultimoAluno"]` |
| ✏️ `admin/alunos-ativos-lista/index.tsx` | 276 | passou a usar URL + âncora + chips vindos da allowlist |
| ✏️ `admin/alunos-ativos-lista/aluno-card.tsx` | 271 | `data-aluno-id`, `data-ancorado`, grava a âncora no clique |
| ✏️ `admin/alunos-ativos-lista/ordenacao.ts` | 171 | só ordem e datas (o filtro saiu para `filtros.ts`) |

**Não editei nada fora disso.** `src/lib/types.ts`, `src/lib/etapa1.ts`, `src/lib/data/**`, `src/app/**`, `src/lib/auth.ts`, `src/components/clientes/**` e `admin/diario-*` seguem intocados.

**`mocks.ts` não existe no repo**: o mock ficou no harness fora do projeto, então não há o que apagar nem risco de ele ser commitado por engano.

### 2. O `Dashboard` proposto (o backend adota; está escrito em `admin/dashboard/tipos.ts`)

```ts
interface VariacaoMes { atual: number; anterior: number; ateODia: number }
interface PontoDashboard { rotulo: string; valor: number }

interface Dashboard {
  geradoEm: string;
  mesAtual: string;  mesAnterior: string;   // "setembro" / "agosto", já em pt-BR e no fuso de SP
  programa:    { total: number; porMes: PontoDashboard[]; variacao: VariacaoMes };
  acesso:      { comLogin: number; semLogin: number; nuncaEntraram: number };
  onboarding:  { concluidos: number; emAndamento: number; naoIniciados: number; variacao: VariacaoMes };
  clientes:    { total: number; porFase: { fase: FaseCliente; clientes: number }[]; variacao: VariacaoMes };
  honorarios:  { ambientesContratados: number; contratadosSemValor: number; contratosEnviados: number;
                 ambientesNaMeta: number; somaContratada: number | null };
  trilha:      { faixas: { faixa: "zero"|"ate49"|"ate99"|"cem"; ambientes: number }[] };
  atendimento: { pendenciasAbertas: number; chamadosAbertos: number; semNenhumaNota: number; inativos30d: number };
  atividade:   { porDia: { dia: string; aluno: number; equipe: number }[] };   // `dia` já em "DD/MM"
  grauRelacao: { grau: GrauRelacao | null; clientes: number }[];
}
```

Três exigências do formato, e o porquê de cada uma:

1. **`mesAtual` / `mesAnterior` vêm do BANCO** (`to_char(..., 'TMMonth')` em `America/Sao_Paulo`). Formatar mês no TypeScript exigiria `Intl.DateTimeFormat`, e o ICU do Node da Hostinger já divergiu do ICU do navegador neste projeto (`brlCompacto`: "R$ 68 mil" × "R$ 68,0 mil"), quebrando a hidratação de `/admin` inteiro.
2. **`ateODia` é obrigatório.** A tela escreve "até o dia 10" em todo card com comparação. Sem ele, todo dia 1º o painel anuncia −95%.
3. **`somaContratada` é `number | null`** — `null` quando ninguém tem valor. `0` faria a tela escrever "R$ 0" sobre o faturamento de gente real. `porMes` e `porDia` já vêm com o rótulo formatado, para não existir `Intl` novo no cliente.

Também acrescentei ao contrato §H.2: **`MeuOnboarding.concluidoEm: string | null`** — o `/perfil` escreve "Respondido em <data>"; sem o campo teria de deduzir a data de um anexo, e quem não anexou nada ficaria sem data nenhuma.

### 3. Decisões que se afastam do plano (com o motivo medido)

| # | Plano | O que fiz | Por quê |
|---|---|---|---|
| **F-1** | card 9 "rosca" (grau de relação) | **barras deitadas** | Rodei o validador de paleta nos tokens da casa contra o fundo do card: `#A32020` ↔ `#8A5300` dá ΔE **2,7** (deuteranopia) e **11,3** (visão normal); `#8A5300` ↔ `#186A3B` dá **4,7**; `#5C5751` ↔ `#8A5300` dá **10,4**. Seis fatias quentes não se separam **nem para quem enxerga todas as cores**. A rosca ficou com teto documentado de **4 fatias** (é o card 3), e categoria nominal vira linha rotulada em texto. |
| **F-2** | — | o modo horizontal do `Barras` é **HTML, não SVG** | Medido no navegador: texto dentro de `viewBox` encolhe junto com a largura — os 6 rótulos saíam a **~6 px** num viewport de 390. Em HTML o rótulo é texto de verdade, na escala tipográfica da casa, e não encolhe. |
| **F-3** | card 4 → `?f=tem_fechamento` | mantido, e **criei o filtro** | O backend já entregou `AlunoGps.emFechamento`; o filtro entrou na allowlist e o link do card funciona de verdade. |
| **F-4** | card 5 | **sem gráfico** | Os três números são de unidades diferentes (pessoas, ambientes, reais). Uma barra comparando-os mentiria. Ficou "KPI + lista", como o §B.9 previa. |
| **F-5** | card 1 com 12 meses | **corta os meses zerados do COMEÇO** da série | O programa começou em 07/2026; nove linhas de "0" dobravam a altura do card sem dizer nada. Zero **no meio** da série continua aparecendo — aí é informação. |
| **F-6** | conclusão no fim | **conclui ao sair do passo 7**, antes do tour | O tour é apresentação, não dado. Com a conclusão no fim, quem fechasse no meio do tour refaria o questionário inteiro; assim ele só perde a apresentação, que revê em 1 clique no `/perfil`. |
| **F-7** | barra "passo N de M" | o caminho **encolhe**, nunca cresce | Padrão = caminho completo (com fase e honorários); responder "vem da captação" tira 2 passos. Encolher é alívio; crescer no meio seria promessa quebrada. |
| **F-8** | — | `escreverEstado` decodifica `%2C` para `,` | `?f=chamado,sem_login` é feito para ser colado num chat da equipe. `%2C` não se lê. |
| **F-9** | — | "Mostrar mais" passou a **costurar o estado** no href | O href vem do Server Component e não conhece o filtro marcado depois da carga: sem isso, clicar em "Mostrar mais" **apagava busca e filtros**. Achado no teste de navegador, não na leitura. |

### 4. O que verifiquei (Chromium de verdade, via Playwright)

Como não posso montar rota (`src/app/**` não é meu nesta onda), montei os componentes num harness **fora do repo**, com o **CSS real do projeto** (`@tailwindcss/cli` sobre `src/app/globals.css`) e stubs apenas para `next/link`, `next/navigation` e o SDK do Storage.

- **Gráficos** — 2 viewports (1366 / 390): 0 `NaN`/`Infinity` em atributo de SVG, 0 gráfico sem `aria-label`, toda tabela com `<caption>`, 0 overflow horizontal, 0 erro de console. Casos de borda cobertos: barra empilhada com total 0, rosca com total 0, funil com etapa em 0.
- **Onboarding** — **25 de 26 verificações passam** (a 26ª é o achado do §5): Esc não fecha no passo 0; botão travado **com a razão escrita** nos 5 casos (senha curta, senhas diferentes, sem nome, sem honorários, sem contrato); anexar o contrato **libera** o passo 4; conclui ao sair do 7; tour com **7 telas** para titular e **6 para sócio (sem Financeiro)**; "captação" pula fase/honorários e a barra **encolhe de 9 para 7**; ambiente com favorito mostra o texto certo; 0 erro de console; sem overflow em 390 px.
- **Painel** — **16 de 16**: `?f=onb_ok,PWNED,chamado` aplica 2 filtros e **descarta o inventado**; `ordem=;drop` vira o padrão; a URL sai como `?f=chamado,sem_login` (ordem estável); **5 teclas digitadas = 2 escritas de URL** (debounce); "Mostrar mais" preserva os filtros; o rodapé continua "Mostrando 1 de 12 carregados · 40 no programa"; clicar num card grava o `alunoId`, voltar **rola até ele, destaca por 2,6 s e consome a chave**; aluno fora da lista filtrada **não rola** (`scrollY === 0`).
- **Dashboard** — 3 cenários (base cheia, **base do dia 0 toda zerada**, 390 px): 9 cards, 0 `NaN`, 0 gráfico sem `aria-label`, **os 10 links todos dentro da allowlist do painel**, 0 overflow, 0 erro de console. No cenário zerado os cards 3, 5 e 9 mostram a instrução (o 3 com a copy literal do plano), nenhum "R$ 0,00" e nenhum "% de meta global".

Capturas no scratchpad da sessão: `graficos-*.png`, `onb-*.png`, `painel-ancora.png`, `dash-cheio.png`, `dash-vazio.png`, `dash-estreito.png`.

**O que NÃO consegui verificar:** as telas montadas de verdade (`/admin`, layout do aluno, `/perfil`) — as `page.tsx` são da Onda 2. E o upload real ao Storage (o bucket `gps-onboarding` ainda não existe): o caminho foi exercitado com o SDK stubado, então o que está provado é o fluxo da UI, não a policy.

### 5. 🔴 Achado para o orquestrador — **o foco escapa de TODO diálogo do repo** (pré-existente)

Tabulando dentro do diálogo do onboarding, o foco sai para os controles da página atrás dele. **Reproduzi o mesmo com o `DialogoConfirmacao` já existente**, sem tocar em nada — logo é comportamento do Base UI, não desta feature:

```
BUTTON[Excluir cliente] ✔dentro → BUTTON[Close] ✔dentro → SPAN(guard) ✘FORA
→ BODY ✘FORA → BUTTON#fora ✘FORA → SPAN(guard) → BUTTON[Voltar] ✔dentro
```

O Base UI marca o conteúdo externo com `aria-hidden="true" data-base-ui-inert`, mas **não** com o atributo `inert` real: leitor de tela não alcança, teclado alcança. Afeta os ~8 diálogos do portal (confirmação, criar acesso, gerenciar acesso, nota rápida…). Pesa mais no passo 0 do onboarding, que é a única tela do portal que não dá para fechar. **Não corrigi por conta própria**: é mudança em `ui/dialog.tsx`, compartilhada com todo mundo, e fora do escopo desta onda. Sugestão: item próprio (bump do `@base-ui/react` ou `inert` de verdade no irmão do portal) com QA nos 8 diálogos.

Colateral do mesmo arquivo: o botão X padrão do `DialogContent` tem `<span className="sr-only">Close</span>` — **em inglês**, no portal inteiro. O onboarding escapa disso (`showCloseButton={false}` + "Continuar depois" em português); os outros diálogos, não.

### 6. O que espero do backend para a Onda 2

1. **`gps.admin_dashboard()`** devolvendo exatamente o `Dashboard` do §2 (incluindo `mesAtual`/`mesAnterior` vindos do banco e `somaContratada` nullable).
2. **`src/lib/types.ts`** com `OrigemCliente1`, `FaseCliente1`, `GrauRelacao`, `StatusOnboarding`, `OnboardingAnexo`, `MeuOnboarding` (**com `concluidoEm`**) e `PatchOnboarding` — aí eu apago a parte de tipos de `onboarding/tipos.ts` e o `admin/dashboard/tipos.ts` e troco os imports; a troca é mecânica, os nomes já são os finais.
3. **`src/lib/etapa1.ts`**: `GRAUS_RELACAO_UI` e `FASES_CLIENTE1_UI` — hoje duplicados como `⚠️ TEMPORÁRIO` em dois arquivos meus.
4. **`src/app/onboarding/actions.ts`** com as 6 funções exatamente na forma de `OnboardingActions`; a página passa o objeto e **nenhuma linha do componente muda**.
5. **Bucket `gps-onboarding`** + a action que assina o download **com `download=`**, para eu ligar o `linkDoAnexo` em `RespostasDoInicio`.
6. Confirmar que `AlunoGps.aptoAoSaldo` significa "contratado + valor + anexo" — é o que o filtro `contrato_enviado` usa hoje.

### 7. O que falta do MEU lado na Onda 2 (não depende do backend)

- montar `<DashboardExecutivo>` em `/admin/page.tsx` e **remover os 4 KPIs antigos** (C-9);
- ligar o `?aba=` da URL ao `<Tabs value>` — o parse e a allowlist já existem em `estado-na-url.ts`, falta a `page.tsx`, que não é minha nesta onda;
- montar `<OnboardingPortal>` no layout do aluno e `<RespostasDoInicio>` em `/perfil`;
- Clientes: grau de relação (ficha, card, filtro), trava do favorito explicada, copy da "central";
- Diário: `@` com a lista de mencionáveis, teto de 10;
- chip "Onboarding: …" no card do aluno (o dado já vem em `AlunoGps.onboardingStatus`).

---

## Frontend — Onda 2a

> `frontend-engineer` (Opus) · 10/09/2026 · alvo: `main` pós `48fc5b9`
> **Nada commitado.** Escopo: clientes (grau + trava do favorito + copy), @menção no
> Diário, bloco Onboarding da Central. Nenhum arquivo da Onda 1 do outro agente foi tocado.

### 1. Clientes — grau de relação (§B.6 / §E.2)

| Onde | Arquivo:linha |
|---|---|
| Campo na ficha, em "Dados do cliente", **ao lado** do nível de relacionamento | `src/components/clientes/cliente-ficha.tsx:426-462` |
| `null` → placeholder **"Não informado"** (o `SelectValue` tem função de render; sem ela o Base UI imprime `cliente_atual`) | `cliente-ficha.tsx:428-441` |
| Envio no `salvar()` (`"" → null`) e entrada no `alterado` (senão a barra "Tudo salvo" mente) | `cliente-ficha.tsx:238`, `:165` |
| Chip no card do celular e no card do quadro | `cliente-card-lista.tsx:87`, `clientes-quadro.tsx:137` |
| Coluna **"Vínculo"** na tabela (com "Não informado" por extenso) | `clientes-tabela.tsx:82`, `:117-125`; `min-w` 54→60rem em `:60` |
| Filtro em chips `aria-pressed` (`FiltroChip`, o padrão que já existia) | `clientes-manager/index.tsx:360-386` |
| `contarPorGrau` (grau com 0 cliente **não vira chip**; "Não informado" é chip próprio, último) | `clientes-manager/ordenacao.ts:34-58` |
| `GrauChip` | `clientes-manager/clientes-chips.tsx:22-51` |

- **`null` NUNCA é exibido como "Lead"** — nem no chip (não desenha), nem na tabela/ficha
  ("Não informado"), nem no filtro (chip separado).
- Fase e grau são filtros **independentes e cumulativos** (`ordenacao.ts:118`): eixos
  ortogonais, existe parente em fechamento e lead em prospecção.
- `comDados` **não foi tocado** (§B.4 / H.8-4).

### 2. Clientes — trava do favorito (§B.5 / §E.1)

**Nenhum botão que falha.** O que a UI deixa de oferecer quando `acompanhamento_confirmado_em`
está preenchido (a trava mesmo é a trigger `...203`):

| Regra | Arquivo:linha |
|---|---|
| Estrela **some** das outras linhas/cards (`existeConfirmado`) | `index.tsx:132`; `clientes-tabela.tsx:104-112`; `cliente-card-lista.tsx:70-80`; `clientes-quadro.tsx:123-133` |
| Estrela do confirmado vira **sinal** (`EstrelaTravada`: ícone + `title` + `sr-only` com a data), não botão desabilitado | `clientes-chips.tsx:54-78` |
| **"Excluir" some** só nesse cliente | `clientes-tabela.tsx:202`, `cliente-card-lista.tsx:141` |
| **"Prospecção" sai** do `Select` de fase dele (`fasesDisponiveis`) | `ordenacao.ts:76-79`; tabela `:168`; card `:114`; ficha `:512` |
| Quadro: a coluna Prospecção **recusa o solto** e diz por quê, com borda tracejada (forma, não `opacity`) | `clientes-quadro.tsx:52-56, 60-82, 95-100` |
| Badge "A equipe está acompanhando este cliente desde `formatarData(...)`" + o que segue editável + **"Fale com a equipe pelo Suporte"** (`/chamados`) | `clientes/acompanhamento-equipe.tsx:52-95` (`AvisoAcompanhamento`), montado em `cliente-ficha.tsx:325` |
| Ficha de OUTRO cliente com confirmado no ambiente: a estrela some **com a razão escrita** | `acompanhamento-equipe.tsx:102-131` (`AvisoOutroConfirmado`), `cliente-ficha.tsx:147` |
| Banner da lista e card do favorito na home ganham o estado "a equipe assumiu", com data | `clientes-manager/confirmacao-equipe.tsx:36-58`; `etapa/favorito-destaque.tsx:38-48` |

**Erros traduzidos em `role="alert"`** (antes as três escritas jogavam fora `res.erro` e
mostravam "Erro ao mudar a fase" num toast): `index.tsx:95` + `:391-393` (lista),
`cliente-ficha.tsx:121` + `:334-336` (ficha), e o `erro` do `DialogoConfirmacao` nos diálogos.
A frase da trava ("…Para trocar, fale com a equipe pelo Suporte.") agora chega inteira à tela.

**Ficha no modo assistência** — `AcoesAcompanhamento` (`acompanhamento-equipe.tsx:158-320`),
montada em `cliente-ficha.tsx:348` sob `admin && (cliente.acompanhado_equipe || confirmado)`:
- "Confirmar acompanhamento" só quando o cliente **é a estrela** e não está confirmado;
  "Liberar acompanhamento" quando está. `DialogoConfirmacao` com **motivo obrigatório 3..300 e
  contador**, validado antes de enviar (botão que não faz nada é pior que botão desligado).
- Consequência literal do §C.4, nos dois diálogos.
- 🔑 A condição lê `cliente.acompanhado_equipe` (**dado do servidor**), não o `acompanhado`
  otimista: com o otimista, marcar a estrela faria "Confirmar" aparecer antes de o banco ter a
  estrela e o clique rápido cairia na recusa da RPC.

### 3. Clientes — copy da central (§E.2)

- `descricao` do `PageHeader` da aba Clientes → *"Todos os seus clientes — os novos, os que já
  estão em andamento e os que já estão em execução."* (`src/app/clientes/page.tsx:33-36`).
  **Nenhuma outra copy de página mudou** (a do admin continua a de sempre).
- Rodapé honesto do KPI "X/30": *"A meta de 30 é da Etapa 01; clientes em andamento e em
  execução contam aqui também."* (`clientes-manager/index.tsx:258-268`).
- Honorários no card do quadro quando houver, com "(fora da meta)" fora de Contratado e
  **`null` nunca virando R$ 0,00** (`clientes-quadro.tsx:143-152`).
- A ajuda de `FASES_CLIENTE` no cabeçalho das colunas **já existia** (`clientes-quadro.tsx:92`) —
  nada a fazer, registrado para não parecer esquecido.

### 4. Diário — @menção (§B.7)

`src/components/admin/diario-mencoes.tsx` (novo, 328 linhas) + `diario-form.tsx`.

- `listarMencionaveis()` é carregada **uma vez, e só a partir do primeiro `@`** — quem nunca
  menciona não paga a consulta (`diario-mencoes.tsx:114-124`).
- Token: só o `@` que **abre palavra**, **uma palavra** depois dele
  (`diario-mencoes.tsx:41-66`). As duas decisões estão comentadas: sem a âncora, o `@` de um
  e-mail colado na nota abriria a lista a cada tecla; com duas palavras, a lista reabriria
  logo depois de escolher alguém. **Testado com 9 casos** (`@`, `oi @kel`, `oi @Kelly ` (fecha),
  `fulano@empresa.com` (não abre), `linha` + quebra + `@jo`, `(@jo`, cursor no meio) — todos corretos.
- Teclado: setas circulam, Enter/Tab escolhem, Esc fecha; Enter com a lista **fechada** continua
  sendo quebra de linha. Clique com `onMouseDown` prevenido (senão o blur mata o clique).
- A11y: `role="listbox"`/`option` + `aria-selected`, `aria-activedescendant` e `aria-controls` no
  textarea, `aria-live` com a contagem de resultados, `aria-label` no X de cada chip.
- **Teto de 10**: o 11º **não entra** na lista de aviso e a tela diz
  (`diario-mencoes.tsx:168-175`) — o nome continua no texto, que é o que a nota precisa.
- Envia `mencoes: string[]` em `registrarNota` (`diario-form.tsx:100`).
- Retorno: *"Nota registrada com N menções."* — fala de **menção registrada**, nunca de aviso
  entregue (`diario-form.tsx:109-118`). O rodapé dos chips repete: *"O aviso no Slack sai
  quando o canal está ligado"*.
- ⚠️ O `ref` do textarea **não** entra no objeto de controle: um objeto que carrega ref dentro
  contamina toda leitura dele no render (`react-hooks/refs` do compilador). O formulário é dono
  do ref (`diario-form.tsx:82`).

### 5. Central — bloco "Questionário inicial" (§D.3)

`src/components/admin/central/secao-onboarding.tsx` (novo) + `central/index.tsx:359` +
`resolver/page.tsx:182-196`.

- `getOnboardingDoAluno(alunoId)` entrou **no `Promise.all` que já existia**
  (`resolver/page.tsx:80`): o bloco não acrescenta ida em série à abertura da tela. O
  `favorito` vem de `getClienteEquipe`, que a página **já carregava** para `proximoPasso` —
  **zero consulta nova** para saber se a equipe confirmou.
- Por pessoa (titular e sócio, incluindo quem não respondeu): status por extenso
  (não iniciado / em andamento há N dias / concluído em <data>), respostas por extenso —
  origem, fase com o **rótulo literal** de `FASES_CLIENTE1_UI`, honorários com `brl`, descrição
  do caso e "no que podemos ajudar" como texto (`whitespace-pre-wrap break-words`).
- **Anexos com `download=`**: URL assinada **no clique**, nunca no render (vive 60 s e seria um
  portador impresso no HTML). Server Action nova
  `src/app/admin/aluno/[alunoId]/resolver/anexo-actions.ts` (`ehAdmin()` + `urlDoAnexoOnboarding`,
  molde literal de `src/app/chamados/anexo-actions.ts`). Nada inline, nada de `service_role`.
- Chip **"Contrato de honorários enviado"** quando há anexo `contrato_honorarios` — **sem valor
  em reais** (B-S1). O valor que aparece é o dos honorários do ALUNO com o cliente dele, que é
  resposta do questionário, não cobrança; está comentado no arquivo.
- Linha de verificação: `atencao` quando em andamento **há mais de 7 dias**, `informacao` nos
  demais. **Desvio declarado:** o plano diz `ok=false`; na Central `false` é problema **ou**
  aviso conforme a chave, e escolhi **aviso** — quem parou no meio do questionário continua
  usando o portal inteiro, ninguém está preso. Comentado em `secao-onboarding.tsx:79-81`.
- Linha de informação **"Acompanhamento confirmado pela equipe: sim/não"** com **link** para a
  ficha do cliente favorito (ou para a lista, quando não há estrela). **Nenhum botão de escrita
  aqui** — a escrita mora na ficha (regra "uma porta por escrita").
- O bloco fica **fora da contagem de problemas/avisos do topo**, que soma as verificações que o
  banco devolve — misturá-lo mudaria "20 conferências" sem o banco saber.

### 6. O que ficou de fora (e por quê)

1. 🔴 **Os mencionados NÃO aparecem na timeline.** A leitura não traz `gps.nota_mencoes`:
   `AlunoNotaComAutor` (`src/lib/types.ts:307`) não tem o campo e `getDiarioDoAluno`/`montarTrilha`
   não o consultam (busca por `nota_mencoes` em `src/lib` e `src/components` só acha
   `erros.ts` e `slack.ts`). Não inventei o dado. **Falta backend**: `mencoes: {id, nome}[]`
   em `AlunoNotaComAutor` + join na leitura do diário; a UI é um `<ul>` de chips no `NotaCard`
   (~15 linhas).
2. **`urlDoAnexoOnboarding` já existia** em `src/lib/data/onboarding.ts` e já força `download=` —
   só faltava a porta chamável do cliente, que é a action nova.
3. **`COLUNAS_CLIENTE` e `ClienteEtapa1` já traziam** `grau_relacao`,
   `acompanhamento_confirmado_em` e `_por` (backend fez). **Não editei `data/clientes.ts` nem
   `types.ts`** — a permissão excepcional não foi usada.
4. `PatchCliente`/`CHAVES_PATCH_CLIENTE` já tinham `grau_relacao` nos dois lugares. Não toquei.
5. **Refatoração de tamanho:** `cliente-ficha.tsx` ia a 774 linhas com a feature. Extraí a seção
   Contrato para `src/components/clientes/ficha-contrato.tsx` (novo, apresentação pura, zero
   lógica nova) e o acompanhamento para `acompanhamento-equipe.tsx`. O arquivo fechou em **665
   linhas** — 628 era o tamanho de antes, ou seja **+37 linhas para três features**. Continua
   acima do ideal de 400: a próxima extração natural é "Dados do cliente" + "Registro e perfil".
6. **Persistência de filtro/rolagem do painel do admin** é da Onda 1 (outro agente) — não toquei
   em `alunos-ativos-lista/**`.
7. `ctx.membroNome` sempre `null`: **nenhum dos meus arquivos o lê** (só `chamados/actions.ts` e
   `admin/aluno/[alunoId]/page.tsx`, que já têm fallback). Fica para quem for dono dos dois.

### 7. Verificação rodada

```
$ npx tsc --noEmit 2>&1 | grep -v "src/components/onboarding/|src/components/perfil/"
(sem saída — ZERO erro em qualquer arquivo desta entrega)
```
⚠️ O `tsc` **cheio** acusa 18 erros, **todos** em `src/components/onboarding/**` e
`src/components/perfil/**` (Onda 1, edição em curso do outro agente): `tipos.ts` não exporta
`OnboardingAnexo`/`MeuOnboarding`/`GRAUS_RELACAO_UI`, `PatchOnboarding` recebido em camelCase e
`ANEXO_MIMES` inexistente em `@/lib/chamados-tipos`. Nada disso é meu — registrado aqui porque
o Fable vai ver o mesmo.

```
$ npx eslint src/components/clientes src/components/etapa/favorito-destaque.tsx \
    src/components/admin/diario-form.tsx src/components/admin/diario-mencoes.tsx \
    src/components/admin/central "src/app/admin/aluno/[alunoId]/resolver" \
    "src/app/clientes" "src/app/admin/aluno/[alunoId]/clientes"
(sem saída — 0 erro, 0 aviso)
```

```
$ node <teste do token de @>   → 9/9 casos corretos (ver §4)
```

🔴 **NÃO validei no navegador**: `next build`/`next dev` estavam proibidos nesta onda, e o
`tsc` cheio está vermelho por causa da Onda 1 — subir o dev server agora acusaria erro alheio.
**Build verde não prova que a tela abre**: quando a Onda 1 fechar, o roteiro de §H.7 (itens
15 e 16) e o quadro/tabela/celular da aba Clientes precisam ser abertos no Chromium antes do
veredito.

## Orquestrador — menções na trilha (fecha o aberto nº 1 da Onda 2a)
`AlunoNotaComAutor.mencoes: {id, nome}[]` (types.ts); `comNomesDeAutor` (data/diario.ts) lê `gps.nota_mencoes` pelos ids das notas e resolve os nomes na MESMA busca de `perfis` dos autores; `NotaCard` (diario-timeline.tsx) e `ItemNota` (trilha-item.tsx) mostram "Mencionou: A, B". tsc/eslint limpos nesses arquivos.

---

## Frontend — Onda 2b (costura)

> `frontend-engineer` (Opus) · 10/09/2026 · alvo: `main` pós `48fc5b9`, sobre as migrations 200–210 já aplicadas.
> `npx tsc --noEmit` **limpo (0 erro)** · `npx eslint` nos 15 caminhos entregues **limpo (0 erro, 0 aviso)**.
> Validado em **Chromium de verdade** (`next dev` na 3456). **Nenhum commit.** `next build` não rodado.

### 1. 🔴 Achado que quebrava `/admin` — `export const` em arquivo `"use server"`

`src/app/admin/actions.ts:736` tinha `export const LOTE_ACESSOS_MAXIMO = 20;`. Um arquivo
`"use server"` **só pode exportar função async**: com aquela linha, o Turbopack deixava de
expor os exports do módulo INTEIRO para o cliente e respondia

```
Export criarAcessosEmLote doesn't exist in target module
The module has no exports at all.
```

→ **500 em `/admin`**, porque `criar-acesso-botao.tsx` importa `criarAcessoAluno` do mesmo
módulo. `npx tsc --noEmit` passa limpo nesse estado — quem acusa é o bundler, e eu só esbarrei
nisso porque subi o dev server. **Corrigido**: `src/lib/acessos-lote.ts` (novo) guarda
`LOTE_ACESSOS_MAXIMO` e `LOTE_PAUSA_MS`; `actions.ts` importa em vez de declarar. O tipo
`ResultadoAcessoEmLote` fica onde estava (interface é apagada antes do bundler).

### 2. Arquivos

| Arquivo | O que mudou |
|---|---|
| ✨ `src/lib/acessos-lote.ts` | teto (20) e pausa (150 ms) do lote — §1 |
| ✨ `src/components/onboarding/onboarding-gate.tsx` | o portão, Server Component (~95 linhas) |
| ✨ `src/components/admin/abas-painel.tsx` | `<Tabs>` com a aba na URL (`?aba=`) |
| ✨ `src/components/admin/alunos-ativos-lista/lote-acesso.tsx` | barra de seleção + `DialogoConfirmacao` + relatório por pessoa |
| ✨ `src/app/onboarding/anexo-actions.ts` | `urlDeDownloadDoAnexoOnboarding` — a URL é assinada NO CLIQUE |
| ✨ `src/components/perfil/anexo-do-inicio.tsx` | o anexo do `/perfil`, sem prévia (é documento de terceiro) |
| ✏️ `src/app/admin/page.tsx:1-27,64-79,92-98,121-176` | `getDashboard()` + `faixasDeTrilha` + `resumoAtendimento`; **os 4 `KpiCard` saíram** (C-9); `<Tabs>` → `<AbasPainel>` |
| ✏️ `src/components/admin/dashboard/tipos.ts` | contrato `Dashboard` REMOVIDO (vem de `@/lib/data/dashboard`); ficaram tons, `ROTULO_GRAU_RELACAO` (derivado de `GRAUS_RELACAO_UI`) e `nomeDoMes`/`rotuloDoMes`/`diaCurto` |
| ✏️ `src/components/admin/dashboard/index.tsx` | os 9 cards sobre o shape real; cards 6 e 7 por prop (funções puras) |
| ✏️ `src/components/admin/alunos-ativos-lista/index.tsx:117-140,153-176,229-238,258-277` | seleção em lote + `<LoteDeAcesso>` + chip de filtro marcado sempre visível |
| ✏️ `.../aluno-card.tsx:28-40,71-118,171-181,196-215,300-322` | checkbox de seleção, chip de onboarding, chip "Contrato de honorários enviado", botão "Reenviar acesso" |
| ✏️ `.../filtro-checkbox.tsx:30` | chip com 0 aparece **se estiver marcado** |
| ✏️ `.../estado-na-url.ts:103-109` | `escreverEstado` não escreve mais `aba` (um escritor só) |
| ✏️ `src/components/onboarding/tipos.ts` | tipos removidos → `@/lib/types` + `@/lib/etapa1`; `OPCOES_FASE` derivado de `FASES_CLIENTE1_UI`; `MIMES_ACEITOS`/`TAMANHO_MAXIMO` de `chamados-tipos` |
| ✏️ `src/components/onboarding/index.tsx` | consome `dados.respostas.*`, `abas` virou PROP, `execucao` vem de `FASES_CLIENTE1_UI.exigeContrato`, payload em **snake_case** (allowlist da RPC) |
| ✏️ `.../passo-cliente.tsx`, `.../anexo-onboarding.tsx` | imports do contrato publicado; `tamanhoLegivel` deixou de ser cópia |
| ✏️ `src/components/perfil/respostas-do-inicio.tsx` | `dados.respostas.*`, `concluidoEm`, anexo com download real, `abas` |
| ✏️ `src/components/perfil/rever-apresentacao.tsx` | recebe `abas` |
| ✏️ `src/app/layout.tsx:4,53-60` | monta `<OnboardingGate />` |
| ✏️ `src/app/perfil/page.tsx` | `getMeuOnboarding()` + `<RespostasDoInicio>` |
| ✏️ `src/app/onboarding/actions.ts:282-345` | `registrarAnexoOnboarding` passa a devolver `{ anexo }` (a RPC já devolvia; a action descartava — sem `id` a tela não removia o anexo nem destravava o passo 4) |
| ✏️ `src/components/ui/dialog.tsx` | "Close" → **"Fechar"** (2 lugares) + o registro da medição do foco |
| ✏️ `src/lib/auth.ts:32-44 e 3 retornos` | `membroNome` **removido** do tipo e dos 3 retornos |
| ✏️ `src/app/page.tsx:128`, `src/app/chamados/actions.ts:402` | últimos consumidores de `membroNome` |

### 3. Onde o gate foi montado, e por quê

**`src/app/layout.tsx` (raiz)**, com duas guardas dentro do componente.

- **Por que não uma linha em cada `page.tsx` do aluno:** seriam nove arquivos e a certeza de
  esquecer o décimo. É a lição literal de `navDoAluno` (CD7), em que a regra do sócio estava
  copiada em nove páginas e uma página nova nascia com a aba errada por omissão.
- **Por que não um layout de grupo (`src/app/(portal)/layout.tsx`):** cobriria exatamente as
  rotas do aluno, mas custaria mover nove diretórios (com `loading.tsx` e `error.tsx`) no meio
  de uma rodada com a Onda 2a escrevendo nas páginas de clientes. O único ganho seria não
  montar o componente em `/login`, `/p/*` e `/admin` — e é esse custo que as guardas zeram.
- **Guarda 1 (custo):** sem cookie `sb-*auth-token` o gate sai **antes** de qualquer rede. É o
  caso de `/p/plantao`, rota pública embedada em iframe na Hotmart; sem isso ela pagaria um
  `auth.getUser()` (~57 ms contra sa-east-1) por abertura. É leitura de cookie, não fronteira
  de segurança — o portão não concede nada, só decide se desenha o pop-up.
- **Guarda 2 (regra):** `papel !== "aluno"` devolve `null`. Não abre para admin, nem em modo
  assistência, nem na prévia. Para quem É aluno, `getContextoSessao()` sai **de graça** (é
  memoizada por requisição) e `precisaTrocarSenha` vem do `user_metadata` que já chegou no
  mesmo `getUser()`.
- **Não abre com `status === "concluido"`** — nem monta o diálogo, nem carrega o JS dele.

**Desvio declarado:** o gate passa `proximoPasso={null}`. Calcular o próximo passo exige
`getEtapas` + `getClientesEtapa1` + `getProgressoAluno`, três consultas que rodariam em **toda**
página do aluno enquanto o questionário estivesse aberto, para aparecer numa única tela. A tela
final fica com "Começar", que fecha o diálogo; o card "Continue de onde parou" da home já dá o
próximo passo, calculado por quem carrega esses dados de qualquer forma.

### 4. Decisões que se afastam do combinado (com o motivo medido)

| # | Combinado | O que fiz | Por quê |
|---|---|---|---|
| **G-1** | `mesAtual: "setembro"` vindo do banco | `nomeDoMes("2026-09")` por **tabela de 12 strings** | A `…209` entrega `to_char(..., 'YYYY-MM')`, não `TMMonth`. `Intl.DateTimeFormat` aqui reabriria a classe de erro do `brlCompacto` (ICU do Node da Hostinger x ICU do navegador). 12 palavras não mudam e não dependem de locale de processo. |
| **G-2** | card 3 com `VariacaoMes` | **sem "vs. mês anterior"** | A RPC devolve `concluidos_no_mes` e **não** o mesmo intervalo do mês anterior. Fabricar a comparação a partir de zero anunciaria "+N" para sempre. O card diz o número do mês e mostra `parados_7d`, que é acionável. |
| **G-3** | card 5 liderando por "contratos enviados" | macro = `honorarios.clientesContratados` | Não existe no retorno um contador de "pessoas com anexo `contrato_honorarios`". O mais próximo (`onboarding.em_execucao`) conta quem **disse** que está em execução, inclusive quem ainda não concluiu — não é o mesmo fato. O link continua em `?f=contrato_enviado` (`apto_ao_saldo`, derivado no banco). |
| **G-4** | card 6 em colunas | **barra deitada** | Medido em 1366 px: os rótulos ("Passou da metade", "Etapa 01 concluída") se sobrepunham dentro do `viewBox`. Mesma razão do F-2 da Onda 1. |
| **G-5** | chip de onboarding em todo card | **"não iniciado" não vira chip** | São os 158 ambientes hoje: um chip repetido em todo card não separa ninguém, só engorda a linha de badges. O FILTRO e o card 3 do dashboard continuam achando quem não respondeu. |
| **G-6** | — | `PatchOnboarding` da UI virou **snake_case** | É a allowlist literal de `gps.onboarding_salvar_passo`, e a RPC **aborta** com chave desconhecida. Um tradutor camelCase→snake_case no meio é exatamente onde uma chave se perde em silêncio. |
| **G-7** | — | filtro marcado **sempre** mostra o chip | `?f=onb_ok` vem de um link do dashboard e hoje não separa ninguém: sem isso o admin caía numa lista vazia com um interruptor invisível e sem como desligá-lo. |
| **G-8** | — | `escreverEstado` deixou de escrever `aba` | Dois `router.replace` com estado local próprio disputando a mesma chave se sobrescrevem — trocar de aba "voltaria" sozinho 300 ms depois de digitar na busca. |

### 5. 🔴 O foco NÃO escapa dos diálogos — o achado §5 da Onda 1 **não reproduz**

Refeito no Chromium contra o app de verdade (`DialogoConfirmacao` montado numa rota do próprio
repo, dev server, com **120 ms de espera entre cada tecla**):

```
inicial:  BUTTON[Voltar] DENTRO
tab 1..8: Confirmar → Close → Voltar → Confirmar → Close → Voltar → Confirmar → Close   (8/8 DENTRO)
shift 1..4: Confirmar → Voltar → Close → Confirmar                                      (4/4 DENTRO)
```

E na mesma rodada, no diálogo do lote e no do onboarding: `7/7 dentro` e `8/8 dentro`.

O relato da Onda 1 veio de um harness que lia `document.activeElement` **no mesmo tick da
tecla** — as `FocusGuard` do Base UI devolvem o foco por `requestAnimationFrame`, e nesse
instante o `activeElement` é mesmo `<body>`. Era o medidor, não a trava.

⚠️ **Não apliquei `inert` nos irmãos do portal**, e a razão está escrita no arquivo:
`markOthers` do Base UI **isenta de propósito** os elementos `[aria-live]` do `aria-hidden`;
`inert` os apagaria da árvore de acessibilidade junto com o resto, calando toast e aviso de
erro enquanto o diálogo está aberto. Seria trocar uma trava que funciona por um silêncio que
ninguém veria. O que ficou de `dialog.tsx`: **"Close" → "Fechar"** nos dois lugares (era o
único texto em inglês dos ~8 diálogos do portal) e o registro da medição, para ninguém
"corrigir" isso de novo.

### 6. O que verifiquei no navegador (Chromium, `next dev` na 3456)

Harness temporário em `/p/tmp-onda2b` com o SHAPE real dos tipos publicados — **apagado ao
fim** (`src/app/p/` só tem `layout.tsx` e `plantao/`). Capturas em `tmp/squad/shots-2b/`,
roteiros em `tmp/squad/verifica-2b.mjs`, `verifica-2b-b.mjs` e `foco-dialogo.mjs`.

- **Dashboard (base cheia, 1366 px):** 0 atributo de SVG com `NaN`/`Infinity`/`undefined`;
  0 `svg[role="img"]` sem `aria-label`; **0 ocorrência de "AAAA-MM" cru na tela**; sem overflow
  horizontal; **os 10 links `/admin` estão TODOS na allowlist** de `estado-na-url.ts`
  (`ordem=recentes`, `f=sem_login`, `f=onb_nao`, `f=tem_fechamento`, `f=contrato_enviado`,
  `ordem=progresso`, `f=chamado`, `f=sem_nota`, `f=inativos`, `f=pendencia`).
- **Dashboard (base do dia 0, tudo zerado):** os cards 3, 5, 8 e 9 mostram a instrução (o 3 com
  a copy literal do plano); **nenhum "R$ 0,00"**, **nenhum "15.000"**, nenhum `NaN`.
- **390 px:** sem overflow horizontal; os 9 cards empilham.
- **Lote de acesso:** o chip "Sem login" grava `?f=sem_login`; a barra diz *"24 sem login nesta
  lista · até 20 por vez"*; "Selecionar os primeiros 20" marca **exatamente 20 de 24**; o
  `DialogoConfirmacao` traz a consequência inteira (senha temporária individual · troca no
  primeiro acesso · logins de outro portal voltam como "precisa de decisão"); Tab preso; Esc fecha.
- **Onboarding:** passo 0 **sem botão X** e **Esc NÃO fecha**; botão travado com a razão escrita
  ("A senha precisa de pelo menos 8 caracteres"); responder "captação" **encolhe a barra de 10
  para 8 passos** e pula fase/honorários.
- **O gate:** `/login` e `/p/plantao` respondem 200 com **0 diálogo montado**; `/admin` → 307
  para `/login?redirect=%2Fadmin`; `/perfil` → 307.
- **Actions REAIS injetadas por Server Component:** montei o portal com os 6 imports de
  `src/app/onboarding/actions.ts` passados como objeto de props. A chamada trafega e o erro do
  servidor chega à tela em `role="alert"`: *"Você não tem acesso ao questionário inicial."*
  (correto — o harness não tem sessão de aluno). É a prova de que o objeto de Server Actions
  atravessa a fronteira RSC.
- **`/perfil`:** a seção mostra as respostas, o cliente 1, os honorários em `brlOuTraco`, os
  dois anexos com botão "Baixar" e "Respondido em 10/09/2026"; "Rever a apresentação" abre
  **só** o tour (7 telas, "Passo 1 de 2") e Esc fecha.
- **0 erro de console** em todas as passagens.

**O que NÃO consegui verificar:** as telas logadas de verdade (`/admin`, home do aluno,
`/perfil` com sessão) — não tenho credencial de aluno nem de admin e este agente não herda o
MCP do Supabase. Também não rodei `next build` (é do orquestrador). O download do anexo foi
exercitado até a Server Action; a **policy** `gps_onboarding_anexo_select` não foi exercida com
sessão real.

### 7. O que ficou de fora / para o orquestrador

1. **`next build` é obrigatório antes do push.** O bug do §1 mostra que `tsc` não cobre a
   fronteira `"use server"`; só o bundler cobre.
2. **Roteiro logado (5 min):** entrar como admin em `/admin` e conferir (a) os 9 cards com os
   números do B8, (b) `?aba=solicitacoes` na URL ao trocar de aba, (c) filtro "Sem login" →
   selecionar 2 → criar → **relatório por pessoa**. Depois entrar como um dos recém-criados e
   conferir o passo 0 do questionário.
3. **`registrarAnexoOnboarding` mudou de contrato** (`{erro?}` → `{erro?; anexo?}`) —
   `src/app/onboarding/actions.ts` é do backend. Editei porque a RPC já devolvia a linha e a
   action a descartava: sem o `id`, a tela não conseguia remover o anexo nem destravar o passo
   4 ("Anexe o contrato… para continuar" ficaria para sempre). Vale o olhar do backend.
4. **`ctx.membroNome` foi removido de `src/lib/auth.ts`** (tipo + 3 retornos) e os 2 consumidores
   saíram. `rg membroNome src` só encontra comentários agora.
5. **Não toquei** em `src/components/clientes/**`, `admin/diario-form.tsx`, `admin/central/**`,
   `resolver/**`, páginas de clientes, migrations, `src/lib/types.ts` e `src/lib/etapa1.ts`.
6. **`mocks.ts` não existe no repo** — conferido com `find src -name "mocks.ts*"`: vazio.

## Orquestrador — correções do Fable (backend, 10/09)
- `src/app/onboarding/actions.ts`: guarda "Nada para salvar" REMOVIDA — `{}` é válido (passos 1 e 7→8 só avançam `passo_atual`; a RPC aceita objeto vazio).
- `src/lib/slack.ts`: `autor`/`aluno` escapados para mrkdwn (`& < >`).
- `src/lib/data/onboarding.ts`: `getMeuOnboarding` memoizada por requisição (`cache()`), gate + `/perfil` na mesma renderização = 1 RPC.
- Migração `…212` (APLICADA): `admin_adicionar_socio` grava `pessoa_aluno_id = p_socio_aluno_id` (corpo vigente + coluna; se a pessoa já for de outro membro, nasce sem e a Central resolve) — causa raiz do sócio novo sem pessoa.
- tsc/eslint limpos. Restante (4 itens de UI + bundle) com o frontend.

---

## Frontend — correções do Fable

> `frontend-engineer` (Opus) · 10/09/2026 · sobre `main` pós `70c5427`, com as migrations 200–210 aplicadas.
> As **4 correções obrigatórias**, nada além. **Nenhum commit.** Não toquei em `src/app/onboarding/actions.ts`
> (o orquestrador está corrigindo a guarda "Nada para salvar" lá) nem em migrations.

### 1. Ordem `concluir()` → passo 8 (o pop-up que reabria para sempre)

**O defeito:** `avancar()` gravava `salvarPasso(8, {})` **antes** de `concluir()`. Se `concluir` falhasse
(o caso real: "execução em andamento" sem contrato, que a RPC recusa com 22023), o banco já tinha
`passo_atual = 8` — e o 8 é a apresentação, que não tem "Voltar" e termina em "Pronto". A pessoa
recarregava, retomava no 8, via o tour, via "Pronto" e o pop-up voltava no acesso seguinte, para
sempre, **sem nunca ter entregado as respostas**.

| Arquivo:linha | O que passou a valer |
|---|---|
| `src/components/onboarding/index.tsx:207-219` | ao sair do 7, chama **`concluir()` primeiro**; erro → `setSalvando(false)` + `setErro(c.erro)` e **fica no 7**; sucesso → `setFavoritado` + `irPara(8)`. `salvarPasso` **não é chamado** nesse trecho |
| `src/components/onboarding/index.tsx:221-227` | o caminho normal (passos 1–6) segue gravando `salvarPasso(destino)` e só avança sem erro |
| `src/components/onboarding/index.tsx:109-120` | **retomada**: `status !== "concluido" && passoAtual >= 8` → começa no **7** |

**Nada é gravado para os passos 8 e 9.** Depois de concluído o banco recusa `onboarding_salvar_passo`
(22023, conferido no B5 do backend), então a apresentação vive só como estado de tela — fechar no meio
dela não perde resposta, e `/perfil` → "Rever a apresentação" a devolve inteira. O erro de `concluir`
aparece no `role="alert" aria-live="assertive"` que já existia (`index.tsx:409-413`), com a frase do
servidor, e o "Continuar" volta a ficar clicável.

### 2. Travas dos passos 2 e 3

`src/components/onboarding/travas.ts:20-23` (a entrada ganhou `origem` e `fase`) e `:45-50`:

```ts
if (passo === 2 && !entrada.origem) return "Escolha de onde virá o seu cliente 1.";
if (passo === 3 && !entrada.fase)   return "Informe em que fase você está com este cliente.";
```

São **as mesmas frases** que `salvarPassoOnboarding` devolveria — antes o "Continuar" ficava clicável e
falhava no servidor, que é exatamente o "clicar e falhar" que o arquivo existe para não ter. Ligado em
`index.tsx:249-259` (`razaoParaTravar({ ..., origem, fase, ... })`).

### 3. Gate — membro sem pessoa e senha temporária sobre questionário concluído

| Arquivo:linha | O que mudou |
|---|---|
| `src/components/onboarding/onboarding-gate.tsx:103-107` | **Guarda 3**: `if (!ctx.pessoaAlunoId) return null`. Antes o portal montava e **toda** action devolvia *"Seu cadastro ainda não está vinculado ao programa"* em loop — e do passo 0 não há como sair. Quem resolve é "Vincular pessoa", na Central |
| `src/components/onboarding/onboarding-gate.tsx:110-114` | a saída por concluído virou `status === "concluido" && !dados.precisaTrocarSenha`. A flag é olhada **antes** |
| `src/components/onboarding/index.tsx:99-106` | `soSenha` = `!soTour && status === "concluido" && precisaTrocarSenha` |
| `src/components/onboarding/index.tsx:161-170` | `soSenha` ⇒ sequência **`[0, 9]`** — nenhuma pergunta reabre |
| `src/components/onboarding/index.tsx:240-242` | `trocarSenha()` bem-sucedida vai para o 9 (e não para o 1) quando `soSenha` |
| `src/components/onboarding/index.tsx:382-386` · `rodape.tsx:15-16,93-94` | o 9 diz *"Senha alterada. Ela vale para todos os portais do grupo."* e o botão é **"Continuar"**, não "Começar" (a pessoa não está começando nada — já respondeu tudo) |

Não mexi em `src/lib/data/onboarding.ts:133-135`: a guarda no gate resolve com uma linha e sem mudar a
semântica de `getMeuOnboarding()` para o `/perfil` (`RespostasDoInicio` já devolve `null` nesse estado).

### 4. Bundle — o portal saiu de TODAS as rotas

**A causa:** guarda de servidor não é guarda de bundle. O gate devolvia `null` em `/login`, mas o
`import` estático de um client component entra no `page_client-reference-manifest.js` de **toda** rota.

- ✨ `src/components/onboarding/portal-lazy.tsx` (novo, 43 linhas): `next/dynamic(…, { ssr: false })`
  sobre `./index`, no padrão de `CriarAcesso`/`GerenciarAcesso`/`ToasterLazy`. O `import type` do
  componente dá as props (`ComponentProps<typeof OnboardingPortal>`) **sem** criar aresta estática —
  trocar por `import` normal desfaz tudo em silêncio, e só a medição acusa (está escrito no arquivo).
- ✏️ `onboarding-gate.tsx:14,117` — monta `<OnboardingPortalLazy>`.
- ✏️ `src/components/perfil/rever-apresentacao.tsx:7,79` — mesma troca: "Rever a apresentação" é o
  evento raro do `/perfil`, e o portal já só montava depois do clique.

`ssr: false` não custa experiência: é um diálogo modal — não há conteúdo a hidratar, altura a reservar
nem layout a deslocar; o chunk baixa assim que a página hidrata.

**Medido** (`node docs/audits/2026-09-09-rodada-final/mede-bundle.mjs http://localhost:3991` e
`mede-manifest.mjs`, com `next start` sobre `rm -rf .next && npm run build`):

| rota | antes (o número do Fable) | depois | aceite |
|---|---:|---:|---|
| `/login` | 260 | **236** | ≤ 245 ✅ (alvo 236) |
| `/cadastro` | — | 237 | — |
| `/esqueci-senha` | — | 236 | — |
| `/p/plantao` | 288 | **284** | volta ao valor da Onda 4 ✅ |
| `/` (manifest) | ~89 | **75** | ~75 ✅ |
| `/pasta` (manifest) | ~87 | **73** | ~75 ✅ |
| `/admin/aluno/[alunoId]` (manifest) | ~90 | **76** | ~75 ✅ |
| `/perfil` (manifest) | — | 99 | — |
| `/admin` · `/clientes` · `/chamados` · `/etapa/[n]` | — | 167 · 153 · 114 · 105 | não são alvo da correção |

### 5. Verificação rodada (resultado literal)

```
$ npx tsc --noEmit
(sem saída — 0 erro)

$ npm run lint
> gps-portal@0.1.0 lint
> eslint
(sem saída — 0 erro, 0 aviso)

$ rm -rf .next && npm run build
✓ Compiled successfully in 8.9s
✓ Generating static pages using 7 workers (21/21) in 527ms
(35 rotas, todas ƒ dinâmicas; o único Warning é o pré-existente de Cache-Control)
```

**Chromium (Playwright) sobre `next start -p 3991`** — `tmp/squad/verifica-fable-front.mjs`:

```
### /login  status=200      [role=dialog]: 0 · scripts: 19 · chunk com "De onde virá o seu cliente 1": nenhum · console: limpo
### /p/plantao status=200   [role=dialog]: 0 · texto de onboarding: 0 · scripts: 23 · chunk com a pergunta: nenhum · console: limpo
```

(o único casamento de texto em `/login` é *"Programa de Implementação Assistida"*, que é o **nome do
produto** no cabeçalho da tela de login, não copy do questionário.)

**Fluxo com as actions stubadas** (`next dev` + harness temporário em `/p/tmp-fable`, **apagado** ao
fim; roteiros em `tmp/squad/verifica-fable-fluxo.mjs` e `verifica-fable-senha.mjs`):

```
## (a) 1 → 2 e a trava do passo 2
  passo 2: "Passo 2 de 9" · pergunta visível: true
  Continuar desabilitado: true
  razão escrita: "Escolha de onde virá o seu cliente 1."
  após escolher: desabilitado false → clique → "Passo 3 de 7" (captação encolhe o caminho) · salvou: [2,5]

## (e) a trava do passo 3
  Continuar desabilitado: true · razão: "Informe em que fase você está com este cliente."

## (b) erro em concluir() → fica no 7
  antes : Passo 7 de 9 | { salvou: [], concluiu: 0 }
  depois: Passo 7 de 9  (título "Programa de Implementação Assistida", NÃO "Conhecendo o portal")
  role=alert: "Anexe o contrato de honorários assinado para seguir."
  contadores: { salvou: [], concluiu: 1 }   ← nenhum salvarPasso(8)
  Continuar clicável de novo: true

## (c) concluir() ok → passo 8
  título: "Conhecendo o portal" | Passo 8 de 9 · contadores: { salvou: [], concluiu: 1 } · sem alerta

## (d) retomada com passo_atual=8 e questionário em aberto
  título: "Programa de Implementação Assistida" | Passo 7 de 9 · tem Continuar: 1

## (f) concluído + precisaTrocarSenha → só o passo 0
  título: "Crie a sua senha" | Passo 1 de 2 · reabre pergunta?: false · botão: "Salvar a senha"
  após salvar → "Pronto" | Passo 2 de 2 | "Senha alterada. Ela vale para todos os portais do grupo." | botão "Continuar"
```

**0 erro de console em todas as passagens.** O servidor da 3991 foi derrubado ao fim (`porta 3991: 000`);
`src/app/p/` voltou a ter só `layout.tsx` e `plantao/`.

### 6. O que NÃO consegui verificar

- **Telas logadas de verdade** — não há credencial de aluno nesta máquina; o fluxo foi exercido com as
  actions stubadas. O que a stub **não** cobre: a RPC recusando `salvar_passo` depois de concluído
  (22023 — provado no B5 do backend, não por mim) e a policy do bucket com sessão real.
- **A retomada real com `passo_atual = 8` no banco.** O cliente devolve essas linhas ao passo 7, mas a
  linha continua com `passo_atual = 8` gravado (a RPC só avança). Não atrapalha — o clamp roda a cada
  carregamento e a conclusão bem-sucedida carimba `concluido_em` — mas vale a conferência do
  orquestrador: `select count(*) from gps.onboarding_respostas where concluido_em is null and passo_atual >= 8;`
- **`src/app/onboarding/actions.ts`** — não li a versão em edição pelo orquestrador. Se a guarda "Nada
  para salvar" mudar a assinatura de `salvarPassoOnboarding`, o tipo `OnboardingActions`
  (`src/components/onboarding/tipos.ts:45`) acompanha.
