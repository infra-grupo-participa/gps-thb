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
1. Listar **30 clientes potenciais** com ≥1 dos **7 problemas** (dividendos, lucro presumido,
   aluguéis PF, negócio familiar, patrimônio dependente do fundador, patrimônio em risco,
   inventário caro).
2. Identificar a **perda pela inércia** de cada um dos 30.
3. Mensagem padrão (formação técnica + perda pela inércia).
4. Mensagem "estudo de caso" (dor específica; estimular conversa; não oferecer nada).
5. Ligação com **2 opções de agenda**. **Meta: 15 reuniões preliminares.**
6. **Campo de dados dos 30**: nome, telefone, nível de relacionamento, perda pela inércia (valor),
   registro do contato, data da reunião preliminar. + uma data por aluno para agendamento.
7. Criar grupos de WhatsApp com quem aderiu à Reunião Preliminar.
8. Entrevista prévia (formulário com **perfil DISC**); identificar tomadores de decisão.
9. Criar conta de negócio na Hotmart.
10. Criar produtos na Hotmart: Sessão de Viabilidade, Croqui Estrutural, Execução Holding.

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
`auth.users` ⇄ `thb_alunos` + data de agendamento), `gps.etapa1_clientes` (os 30 clientes),
`gps.progresso` (conclusão de tarefas manuais por aluno/etapa/tarefa).
Funções: `gps.aluno_atual()` (aluno_id do usuário logado), `gps.touch_atualizado_em()`.
RLS: admin (`public.gp_is_admin()`, cargo dev/admin) faz tudo; aluno só nos próprios registros
(via `gps.aluno_atual()`).

## Arquitetura de informação (decisão do usuário)

- **Etapas = guia/mapa** (intuitivo): checklist + tutoriais + progresso. NÃO contém gestão.
- **Clientes = aba separada** (CRM): lista/funil/busca + **ficha** de cada cliente com todos os
  campos e **documentos** (upload no Storage). Navegação por abas no header (Início / Clientes),
  espelhada no admin (modo assistência) com `basePath = /admin/aluno/<id>`.
- Componentes reusados por aluno e admin via `basePath`: `ClientesManager`, `ClienteFicha`,
  `DocumentosSection`, `Etapa1Guide`, `AppHeader` + `NavTabs`.
- **Documentos**: bucket privado `gps-documentos` (caminho `<aluno_id>/<cliente_id>/<arquivo>`),
  índice em `gps.documentos`; RLS de Storage por pasta (aluno só a própria; admin tudo) — testado.

## Rotas

- `/login` — login e-mail/senha (Supabase Auth). `/auth/signout` (POST).
- `/` — Início do aluno (mapa das 6 etapas; admin → `/admin`; sem vínculo → aviso).
- `/etapa-1` — guia da Etapa 01 (checklist + tutoriais). `/clientes` e `/clientes/[id]` (ficha+docs).
- Admin espelha em `/admin/aluno/[id]`, `/admin/aluno/[id]/etapa-1`, `.../clientes`, `.../clientes/[id]`.
- `/admin` — lista de alunos no GPS + "Adicionar aluno" (busca em `thb_alunos`).
- `/admin/aluno/[alunoId]` — admin dentro do ambiente do aluno (modo assistência, editável).
- `/cadastro` — auto-cadastro do aluno (Supabase signUp, metadata `origem=gps`).
- `/admin/solicitacoes` — fila de solicitações de acesso (aprovar/recusar, match por e-mail).
- `/captacao` — bloqueado (placeholder "em breve").
- `src/proxy.ts` — proteção de sessão (Next 16 usa `proxy`, não `middleware`). Públicas: `/login`, `/cadastro`, `/auth/*`.

## Onboarding do aluno (modelo definido)

Alunos **não** são provisionados em massa e a base **não** é importada. Auto-cadastro padrão:
aluno se cadastra em `/cadastro` com **dados essenciais — CPF/CNPJ, e-mail e senha** →
o gatilho `on_auth_user_created_gps` (SECURITY DEFINER) **vincula automaticamente** o `thb_alunos`
correspondente **pelo CPF/CNPJ** (match por `lpad(digitos,14,'0')`, que reconstrói zero à esquerda
perdido; fallback por e-mail) e cria `gps.membros` → o aluno **já entra no programa** (dados
pessoais vêm do `thb_alunos` vinculado). Se o documento **não** casar com a base, cai em
`gps.solicitacoes_acesso` (pendente) para o admin resolver em `/admin/solicitacoes` (exceção, não
o caminho principal). Documento é enviado em `raw_user_meta_data.documento`.

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
- [x] UI Etapa 01: métricas, checklist (10 tarefas, 3 automáticas), tabela dos 30 clientes
      (CRUD via diálogo), data de agendamento. Etapas 2–6 bloqueadas.
- [x] Admin: lista de alunos com resumo + entrar no ambiente do aluno (editável).
- [x] Portal de captação bloqueado.
- [x] UX: máscaras (CPF/CNPJ com detecção, telefone, moeda BRL) em `src/lib/masks.ts`;
      mostrar/ocultar senha; tutoriais por tarefa (`tutorialUrl`/`modelo` no catálogo, da planilha —
      tarefas 9 e 10 têm aula, tarefa 1 tem modelo); Etapa 01 como **central de clientes**
      (funil por status, busca, filtro, troca de status inline na tabela).
- [x] Auto-cadastro + solicitação de acesso + aprovação pelo admin (fila `/admin/solicitacoes`).
- [x] `npm run build` passa (typecheck + lint OK).
- [x] Deploy Node na Hostinger configurado (`server.js`, `DEPLOY.md`).
- [x] Código versionado e enviado para `github.com/infra-grupo-participa/gps-thb` (main).
- [ ] Endurecer RLS de `thb_alunos` (ver acima) antes de abrir o cadastro a alunos reais.
- [ ] Verificar cadastro real ponta a ponta (depende da config de confirmação de e-mail do GoTrue).
- [ ] Executar o deploy na Hostinger (clonar, `npm install`, `npm run build`, iniciar app).
- [ ] Deixar o repositório privado, se desejado (`gh repo edit --visibility private`).

### Como testar agora
Admin já pode entrar: os 16 `perfis` (incl. marcio@advmais.com, cargo dev) usam a **senha
Supabase existente**. `npm run dev` → `/login` → adicionar um aluno em `/admin` → abrir o
ambiente e preencher a Etapa 01.

---
_Última atualização: 2026-07-08 — Etapa 01 completa (aluno + admin), build verde. Próximo: provisionamento de login de aluno + hardening RLS thb_alunos._
