# Ativar o Plantão — roteiro com os valores prontos (08/09/2026)

Complementa o `ATIVAR-PLANTAO.md` (que explica o *porquê* de cada passo).
Aqui estão os **valores já gerados** e a ordem exata, para executar de uma vez.

> ⚠️ Estes segredos foram gerados nesta máquina e passaram por esta sessão.
> Se preferir, gere outros — mas o **mesmo valor** tem de ir nos passos 1 e 2.
> Nunca commite estes valores: este arquivo **não** os contém (ver abaixo).

## Estado conferido no banco em 08/09/2026

| Item | Estado |
|---|---|
| 7 tabelas `plantao_*` | ✅ existem |
| 421 compradores da Acelera | ✅ carregados em `gps.plantao_alunos` |
| 3 mentoras + e-mails | ✅ cadastrados (`isabela@`/`elaine@`/`cristiane@advmais.com`) |
| Código (rota pública, painel, job) | ✅ commitado (`142381a`) |
| `app.plantao_manutencao_segredo` no banco | ❌ **não setado** |
| `PLANTAO_MANUTENCAO_SEGREDO` na Hostinger | ❌ **não setado** |
| Cron `plantao-manutencao-diaria` | ❌ **não agendado** |
| Deploy do código novo | ❌ **pendente** (é manual) |
| Teste real no navegador | ❌ **nunca feito** |

---

## Passo 1 — Hostinger → Variáveis de ambiente

Escolha um segredo de no mínimo 16 caracteres (ou use o que foi gerado na
sessão) e adicione as DUAS variáveis:

```
PLANTAO_MANUTENCAO_SEGREDO=<o segredo escolhido>
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<32 bytes em base64>
```

A segunda **não é opcional**: sem ela, cada build gera uma chave nova e as
Server Actions em voo quebram no momento do deploy — isso afeta o portal
inteiro, não só o plantão. Gerar: `openssl rand -base64 32`.

## Passo 2 — Banco (SQL Editor) — **o MESMO valor do passo 1**

```sql
alter role authenticator set app.plantao_manutencao_segredo = '<o mesmo segredo>';
```

⚠️ Fazer só este passo, sem o passo 1, deixa o sistema **pior** do que
desligado: as RPCs passam a aceitar, mas o job manda um segredo diferente e
falha com 401 em vez do 503 atual — erro mais difícil de diagnosticar. Os dois
lados andam juntos.

Conferir:

```sql
select rolconfig from pg_roles where rolname = 'authenticator';
-- deve aparecer app.plantao_manutencao_segredo=...
```

## Passo 3 — Deploy (manual; o push NÃO publica)

```bash
git pull && npm install && npm run build
# reiniciar a app no hPanel (ou: touch tmp/restart.txt)
```

Conferir que a rota subiu:

```bash
# Esperado: 401 (a rota está viva e pedindo o segredo)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://programa.timeholdingbrasil.com.br/api/plantao/manutencao
```

| Resposta | Significa |
|---|---|
| **401** | ✅ certo |
| **503** | falta o `alter role` do passo 2 |
| **500** | falta a env do passo 1 |
| **307** | o proxy está barrando (não deveria) |

## Passo 4 — Agendar o job diário

```sql
select cron.schedule(
  'plantao-manutencao-diaria',
  '0 9 * * *',  -- 09:00 UTC = 06:00 em São Paulo
  $$
  select net.http_post(
    url := 'https://programa.timeholdingbrasil.com.br/api/plantao/manutencao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-plantao-segredo', '<o mesmo segredo>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

⚠️ **URL sem barra final.** Com barra, o Next devolve 308 e o `pg_net` não
segue redirect — o job morreria em silêncio.

O job faz 4 coisas, todas idempotentes: envia NPS pendente, **avisa a mentora
na véspera** (novo), expurga sessões vencidas e apaga eventos com mais de 90
dias.

---

## Passo 5 — Ensaio antes de abrir para os 421

O fluxo **nunca rodou em navegador**. Faça um ensaio completo:

1. `/admin/plantao` → criar um plantão de teste (mentora, data de amanhã, hora)
2. **Publicar** — desde 08/09 isso funciona **sem link do Zoom**
3. Abrir `/p/plantao` **dentro do iframe da Hotmart**, com um e-mail real da
   lista e os 4 últimos dígitos do documento
4. Inscrever-se → conferir que aparece a contagem de participantes no horário
5. Conferir que o card diz "o link aparece aqui quando a equipe publicar"
   (e **não** oferece "Entrar na sala", que gravaria presença numa sala
   inexistente)
6. No dia seguinte de manhã, conferir se a mentora recebeu o e-mail de véspera
   com a lista de inscritos

**Teste em Safari também.** Ele não implementa CHIPS: a tela deve pedir
"Ativar acesso" ou oferecer "abrir em nova aba" — nunca voltar ao login em
loop.

### 🔒 Aproveite o ensaio para fechar o `frame-ancestors`

Achado do `security-pentester` (severidade média): a política em
`next.config.ts` libera `https://*.hotmart.com` inteiro — domínio compartilhado
por **todos** os produtores da plataforma, não só pelo Grupo Participa. Outro
produtor poderia embedar `/p/plantao` e sobrepor elementos no formulário que
pede e-mail + senha + 4 dígitos (clickjacking). Não foi restringido às cegas
porque derrubar o domínio errado tira os 421 do ar.

**Com o iframe aberto**, rode no console da página de cima:

```js
document.referrer          // ou, dentro do iframe: location.ancestorOrigins
```

Se aparecer **apenas** `hm.nivelouro.com.br`, apague as duas entradas
`hotmart.com` da CSP em `next.config.ts` e faça um novo deploy.

## Os 46 sem documento

Vieram do CSV sem CPF/CNPJ e **não** conseguem fazer o 1º acesso sozinhos. Em
`/admin/plantao` → aba de acessos, aparecem em vermelho com "sem documento —
precisa de liberação". Confirme a identidade por WhatsApp/e-mail e clique em
**"Liberar 1º acesso"** (vale para um acesso só).
