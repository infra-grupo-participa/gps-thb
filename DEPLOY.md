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
   (versionadas). Não é necessário segredo adicional para a Etapa 01.
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

As migrations são aplicadas fora do deploy (Supabase), mas há um passo que **não
é migration** e por isso não acontece sozinho:

- [ ] **Agendar o job diário do Diário** (uma vez, no SQL Editor) — ver
      [`ATIVAR-DIARIO-EVENTOS.md`](./ATIVAR-DIARIO-EVENTOS.md). Sem ele, o
      `primeiro_acesso` deixa de ser capturado para quem entrar depois do
      backfill. O job é idempotente (reprocessa dias anteriores sem duplicar),
      então atrasar não perde dado — mas cada dia sem ele é um dia de trilha
      incompleta.

## Notas
- `next.config.ts` envia `Cache-Control: no-store` para os documentos HTML e cache
  imutável para `/_next/static`, evitando o ChunkLoadError de HTML velho em CDN
  (lição do sistema legado `sip`).
- O banco é o Supabase compartilhado `mbvybujpkwuorhtdzcde` (schema `gps`). Migrações
  já aplicadas via Supabase; não há passo de migração no deploy.
- Domínio sugerido: subdomínio dedicado (ex.: `gps.seudominio.com`) apontado para a app.
