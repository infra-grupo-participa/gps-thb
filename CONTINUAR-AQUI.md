# CONTINUAR AQUI — estado em 11/09/2026 (madrugada) e o que vem depois

> Para retomar de **outra máquina**: clone, `npm install`, `.env.local` (ver `.env.example`),
> leia este arquivo, depois o `CLAUDE.md` (seção "🔧 Feedback de produção + war-room") e
> `docs/audits/2026-09-10-war-room/war-room.md` (todo o material do war-room: auditores A–G,
> fixers, pentest, vereditos do Fable). Deploy = push na `main` (Hostinger builda sozinho, ~1,5
> min). **Migrations sempre ANTES do push**, pelo MCP do Supabase (projeto `mbvybujpkwuorhtdzcde`).

## Última entrega (11/09, madrugada): redesign da Visão geral do `/admin`

Faixa de 6 KPIs → 6 gráficos grandes (barras, linha com área, funil com taxa de passagem,
rosca do acesso, progresso da Etapa 01, onboarding) → fila de atendimento e grau de relação.
Ver "📊 Redesign da Visão geral" no `CLAUDE.md`. **Primeira coisa a fazer na outra máquina:
abrir `/admin` logado como admin e conferir a aba Visão geral** — foi validada só na prévia local
com o retrato real do dado (sem credencial de admin de teste). Se algo estiver estranho, a rota
de prévia é recriável em 2 minutos (seção "Prévia do dashboard" abaixo).

## Onde o produto está

- Produção: `https://programa.timeholdingbrasil.com.br`. Último push: ver `git log -1`.
- Migrações aplicadas até **`20260910000220`** (todas em `supabase/migrations/`; a `…211`
  `gps.segredos` está escrita e **NÃO aplicada** — decisão B-K1 do João).
- Apresentação do produto em 11/09 (manhã). O war-room de 10/09 rodou 4 ciclos
  (auditoria → correção → Fable) e foi encerrado a pedido do João.

## Conta de teste (aluno titular, sem dado real)

- Login: `onboarding.teste@programa.timeholdingbrasil.com.br`
- Senha: **fora do repo** (o repo é PÚBLICO). Está no ClickUp (tarefa `86akg41bd`, comentário
  de 11/09) e no brain do projeto — repositório privado `segundo-cerebro-ias`,
  `vault/12 Brains de projeto/gps-brain/Diário/2026-09-10.md` (na máquina original é a pasta
  `C:\Users\João\gps-brain`, ligada ao vault por junção). Rotacionada em 11/09.
- Estado esperado: primeiro acesso (passo 0 do onboarding pede senha nova).
- **Reset por SQL** (como `postgres` pelo MCP; as claims do admin vêm ANTES dos deletes porque a
  trigger `…215` recusa apagar o favorito até como `postgres`):

```sql
do $$
declare v_admin uuid; v_aluno uuid; v_pessoa uuid; v_r jsonb;
begin
  select id into v_admin from auth.users where email = 'marcio@advmais.com';
  select m.aluno_id, m.pessoa_aluno_id into v_aluno, v_pessoa
    from gps.membros m join auth.users u on u.id = m.user_id
   where u.email = 'onboarding.teste@programa.timeholdingbrasil.com.br' and m.papel = 'titular';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  delete from gps.chamado_mensagens where chamado_id in (select id from gps.chamados where aluno_id = v_aluno);
  delete from gps.chamados where aluno_id = v_aluno;
  delete from gps.onboarding_anexos where pessoa_aluno_id = v_pessoa;
  delete from gps.onboarding_respostas where pessoa_aluno_id = v_pessoa;
  delete from gps.etapa1_clientes where aluno_id = v_aluno;
  delete from gps.progresso where aluno_id = v_aluno;
  delete from gps.tarefa_enfase where aluno_id = v_aluno;
  delete from gps.aluno_eventos where aluno_id = v_aluno;
  delete from gps.aluno_notas where aluno_id = v_aluno;
  set local role authenticated;
  v_r := gps.admin_definir_senha(v_aluno, '<SENHA>');   -- grava gps_senha_temp_em (passo 0)
  reset role;
end $$;
```

## Pendências que dependem do João / Marcio (em ordem)

1. 🔴 **Plantão — `p_ip_hash` vem do cliente** (Auditor D3). As 3 RPCs públicas
   (`plantao_inscrever`, `plantao_cancelar`, `plantao_revelar_link`) recebem o hash do IP como
   parâmetro; quem chama a REST do Supabase direto com a anon key forja o balde de rate limit.
   Desenho: env **`PLANTAO_SERVIDOR_TOKEN`** na Hostinger + o mesmo valor em `gps.config`
   (lido só dentro das RPCs SECURITY DEFINER); a RPC confia em `p_ip_hash` apenas com token
   válido; sem token cai num balde único `direto:` (10/15 min para todos os chamadores
   diretos). Default seguro: token não configurado ⇒ comportamento atual. Exige `drop` +
   `create` das 3 assinaturas (sobrecarga ambígua quebra em runtime).
2. **`gps.config.chamados_email_equipe` está VAZIO** — preencher em `/admin/chamados` (ou
   `EMAIL_SUPORTE` na Hostinger). Enquanto isso, chamado novo aparece na fila mas ninguém
   recebe e-mail; o toast do aluno já diz a verdade.
3. **Slack (menções do Diário)** — código está pronto (`src/lib/slack.ts`, modo bot). Falta:
   login do Slack CLI (`slackcli login --no-prompt` → `/slackauthticket <ticket>` no workspace
   Grupo Participa → `slackcli login --ticket <t> --challenge <código>`), criar o app pelo
   `docs/slack/manifest.json` (`slackcli app create/install`, ver `--help`), copiar o
   `xoxb-…` para `SLACK_BOT_TOKEN` e `SLACK_CANAL_MENCOES=C0C0QPMDFML` na Hostinger.
   Interruptor `gps.config.slack_mencoes_ativo` já está `true`.
4. **B-S1** texto/valor do saldo do programa ("15k") · **B-D1** lista de documentos do
   onboarding (passo 7 genérico) · **B-R1** retenção/expurgo do contrato anexado
   (`gps-onboarding`) · **B-K1** aplicar `…211`.
5. **CSP / LiteSpeed** — `frame-ancestors` não chega ao cliente em produção (o LiteSpeed
   sobrescreve o header do Next). Só o hPanel resolve.
6. **Decisão de produto**: mover o cliente favorito de fase (até de volta a Prospecção) é
   permitido hoje (não troca *qual* cliente a equipe acompanha). Se o Marcio quiser travar, é
   uma linha na trigger da `…215`.
7. **Passe navegado do lado admin** exige uma credencial de admin de teste — não foi criada
   (`public.perfis` dá admin em todos os sistemas do grupo; precisa de autorização).

## Arrumações técnicas (sem risco para a apresentação)

- Formatador de data fora de `src/lib/datas.ts` em `email-plantao.ts` e `trilha-do-aluno.tsx`.
- `loading.tsx` faltando em `/admin/plantao` e `/admin/chamados/[id]`.
- `esc()` do Slack não escapa `*_~` (cosmético no mrkdwn).
- `permitirAdocao` deveria ser obrigatório em `criarAcessoAluno`.
- Senha temporária com 32 bits (uso único + troca obrigatória; subir para 48 se quiser).
- Renderizar os e-mails depois da mudança de marca (script do Auditor G em
  `tmp/squad/emails-G/` precisa de stub de `server-only`).

## Como validar rápido (scripts em `docs/audits/2026-09-10-war-room/scripts/`)

```bash
npm run build && npx next start -p 3991
node docs/audits/2026-09-10-war-room/scripts/passe-aluno.mjs '<senha atual>' '<senha nova>' nao   # 7 telas × 2 viewports
node docs/audits/2026-09-10-war-room/scripts/passe-publico.mjs                                     # /login /cadastro /esqueci /p/plantao
node docs/audits/2026-09-10-war-room/scripts/mede-bundle.mjs                                       # gzip dos <script> (aceite /login ≤ 245 KB)
```

Os scripts carregam o Playwright do cache do `npx` (ver as 9 primeiras linhas) — se não houver,
`npx playwright install chromium` uma vez.

## Prévia do dashboard sem login de admin

`src/app/p/previa-dash/page.tsx` **não existe no repo de propósito** (rota pública). Para iterar
o design: criar a página que lê um retrato do `gps.admin_dashboard()` (agregados, sem PII) e
chama `mapearDashboard()` (`src/lib/data/dashboard.ts`, função pura) → `DashboardExecutivo`;
capturar com `scripts/shot-dash.mjs`; apagar antes do commit.

## Regras de trabalho que valeram no war-room

- Pipeline: auditores só-leitura (Sonnet) em paralelo → fixers (Opus) → pentest quando toca
  auth/RLS/upload/admin → Fable por último, veredito vinculante → commit por ciclo aprovado.
- Toda RPC nova/alterada: `gp_is_admin()` na 1ª linha (`coalesce(..., false)`),
  `set search_path = ''`, `revoke … from public, anon` antes do `grant`, `drop function` antes
  de mudar assinatura, corpo sempre a partir do VIGENTE (`pg_get_functiondef`), prova em
  rollback (`do $$ … raise exception $$`) colada no relatório.
- O gatilho `on_auth_user_created_gps` roda DENTRO de qualquer `insert into auth.users` feito
  por RPC: quem cria login tem de esperar um `gps.membros` já criado para o `user_id`
  (`on conflict (user_id)`), como a `…219`.
- `OnboardingGate` nunca devolve `null` por status — `concluir()` revalida o layout e
  desmontaria o portal antes do tour (`portal-lazy.tsx` decide uma vez na montagem).
- Nada de credencial no repo (é público). Segredos só na Hostinger; `gps.config` só para
  interruptor e chaves que o cron do banco precisa.
