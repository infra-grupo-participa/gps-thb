# Deploy — Hostinger (Node.js app)

O GPS é uma aplicação **Next.js 16** que roda como **app Node** na Hostinger
(Phusion Passenger). O entrypoint é o [`server.js`](./server.js), que sobe o Next em
produção escutando na porta definida por `process.env.PORT`.

## Pré-requisitos
- Node.js **20+** (definido em `package.json` → `engines`).
- Repositório: `https://github.com/infra-grupo-participa/gps-thb`.

## Passos na Hostinger (hPanel → Node.js)
1. **Criar aplicação Node.js**
   - *Application root*: pasta onde o repositório será clonado.
   - *Application startup file*: `server.js`.
   - *Node version*: 20 (ou superior).
2. **Obter o código** — clonar o repositório na *Application root* (Git da Hostinger ou SSH):
   ```bash
   git clone https://github.com/infra-grupo-participa/gps-thb.git .
   ```
3. **Variáveis de ambiente** — as chaves públicas já estão em `.env.production`
   (versionadas). Os **segredos** vão no painel da Hostinger, nunca no repo:

   | Variável | Obrigatória? | Para quê |
   |---|---|---|
   | `RESEND_API_KEY` | sim (e-mail) | credenciais de acesso, liberação, avisos de chamado |
   | `EMAIL_FROM` | sim | remetente; o domínio precisa estar **verificado** na Resend |
   | `PLANTAO_MANUTENCAO_SEGREDO` | sim (Plantão) | ≥ 16 caracteres, **igual** ao setting `app.plantao_manutencao_segredo` no banco; a guarda falha FECHADO |
   | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | recomendada | sem ela cada build gera chave nova e Server Actions em voo falham no deploy |
   | `EMAIL_SUPORTE` | **opcional (nova em 09/2026)** | destinatário de aviso de chamado novo. É **apenas fallback**, nunca a fonte primária: a lista que vale é `gps.config.chamados_email_equipe`, editável em `/admin/chamados` **sem deploy**, e o fallback só entra quando ela está vazia. Aceita vários e-mails separados por vírgula. ⚠️ **Com as duas vazias, chamado novo não avisa ninguém** (a action grava `console.error` e a tela do admin mostra o aviso). Desde 09/09 a tela sabe que a env existe (`fallbackEnv`, só o booleano — o endereço nunca vai ao navegador) e para de afirmar que ninguém recebe. |

   `EMAIL_EQUIPE` **não volta** — era do fluxo de reunião, removido em 08/2026.
   > Nunca coloque a `service_role` do Supabase no repositório nem no client.
4. **Instalar e buildar** (no terminal da app / SSH):
   ```bash
   npm install
   npm run build
   ```
5. **Iniciar/Reiniciar** a aplicação pelo hPanel (Passenger executa `server.js`).
   Fora do Passenger, o comando é `npm start` (que roda `node server.js`).

## Atualizações (novo deploy)

> **Desde 09/2026 o deploy é AUTOMÁTICO: push na `main` dispara o build Node.js da Hostinger**
> (fonte `git`, Node 24, `npm run build`, ~1,5 min). Confirmado em 09/09/2026 02:14 UTC pelo
> painel de builds (`hosting_listNodeJSBuildsV1`). O fluxo manual abaixo fica só como fallback.
> **Migrations continuam fora do push** — aplicar no Supabase ANTES do push, e na mesma janela:
> trigger no banco + código antigo no ar = erro para o aluno (aconteceu com a ...062 em 08/09).

```bash
git pull
npm install
npm run build
# Reiniciar a aplicação no hPanel (ou "touch tmp/restart.txt" se Passenger)
```

## Passos de banco que NÃO saem no `git pull`

🔴 **Ordem obrigatória: migration primeiro, push depois.** O push na `main` publica o
código em ~1,5 min; se a migration não estiver aplicada, o código novo chama coluna/RPC que
não existe. E o inverso também morde: **trigger no banco + código antigo no ar = erro para o
aluno** (aconteceu com a `…062` em 08/09). Aplicar no Supabase **antes**, na mesma janela.

⚠️ **Tabela ou RPC nova exige recarregar o cache do PostgREST.** Sem isso o PostgREST
responde `PGRST202`/`PGRST205` ("could not find the function/table in the schema cache") mesmo
com o objeto criado e com grant. Depois de aplicar a migration, no SQL Editor:

```sql
notify pgrst, 'reload schema';
```

Valeu para as migrações de 09/09 que criaram `gps.chamados`, `gps.chamado_mensagens`,
`gps.config` e as RPCs `gps.financeiro_do_aluno` / `gps.admin_painel_atendimento` /
`gps.chamado_*`. Migration que só altera dado ou policy não precisa.

Há ainda um passo que **não é migration** e por isso não acontece sozinho:

- [ ] **Agendar o job diário do Diário** (uma vez, no SQL Editor) — ver
      [`ATIVAR-DIARIO-EVENTOS.md`](./ATIVAR-DIARIO-EVENTOS.md). Sem ele, o
      `primeiro_acesso` deixa de ser capturado para quem entrar depois do
      backfill. O job é idempotente (reprocessa dias anteriores sem duplicar),
      então atrasar não perde dado — mas cada dia sem ele é um dia de trilha
      incompleta.

## Notas
- ⚠️ **`gps.plantao_config` sai numa migration futura.** Desde 09/09/2026 a configuração do
  sistema vive toda em **`gps.config`**, que absorveu a chave `plantao_inscricao_aberta` com o
  valor vigente. A função `gps.plantao_escrita_liberada()` lê `config` → `plantao_config`
  (compatibilidade) → setting → ABERTO, então nada quebra na virada. A tabela antiga fica **cerca
  de uma semana** no ar e depois é dropada por migration própria — até lá, **não escrever nela** e
  **não criar tabela nova de configuração**: chave nova vai em `gps.config`.
- `next.config.ts` envia `Cache-Control: no-store` para os documentos HTML e cache
  imutável para `/_next/static`, evitando o ChunkLoadError de HTML velho em CDN
  (lição do sistema legado `sip`).
- O banco é o Supabase compartilhado `mbvybujpkwuorhtdzcde` (schema `gps`). Migrações
  já aplicadas via Supabase; não há passo de migração no deploy.
- Domínio sugerido: subdomínio dedicado (ex.: `gps.seudominio.com`) apontado para a app.
