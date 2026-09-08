# Ativar o Plantão — roteiro de execução (revisado em 08/09/2026, sem login)

Substitui as versões anteriores. O plantão **deixou de ter login**: é link
público, e o aluno se inscreve informando nome + e-mail. Sumiram a senha
padrão, a troca obrigatória de senha e todo o tratamento de cookie de
terceiro no Safari — com eles, sumiu também metade do risco de entrega.

> ⚠️ Os segredos NÃO estão neste arquivo — o repositório é público.

## Estado conferido no banco em 08/09/2026

| Item | Estado |
|---|---|
| Tabelas do plantão | ✅ 5 (eram 7 — `plantao_acessos` e `plantao_sessoes` dropadas) |
| RPCs de login/sessão | ✅ **nenhuma** (as 5 dropadas, sem sobrecarga por token) |
| 422 alunos do Acelera | ✅ carregados (402 aptos + 20 bloqueados) |
| 3 mentoras + e-mails | ✅ `isabela@` / `elaine@` / `cristiane@advmais.com` |
| 3 plantões da Semana 1 | ✅ publicados, **sem link do Zoom** |
| Inscrições | 0 — o produto nunca foi usado |
| `app.plantao_manutencao_segredo` | ❌ **não setado** |
| Envs na Hostinger | ❌ **não setadas** |
| Cron | ❌ **não agendado** |
| Deploy | ❌ **pendente** (é manual) |
| Teste em navegador | ❌ **nunca feito** |

---

## ⚠️ Antes de tudo: os 20 que perderam o Plantão

20 dos 422 compradores do Acelera também estão no Programa de Implementação
e, por decisão de 08/09/2026, **perderam o acesso ao Plantão**. Lista nominal
em `plantao-20-bloqueados.csv` (fora do repo — dado pessoal).

🔴 **O sistema não vai explicar nada a eles**: a recusa usa a mesma mensagem
de qualquer outra falha, para não confirmar a um estranho que aquele e-mail
comprou.

- [ ] **Avisar os 20 por WhatsApp/e-mail ANTES da abertura**
- [ ] **Conferir a lista** antes do passo 8

Agora eles aparecem no painel: `/admin/plantao` → aba **Alunos** → coluna de
bloqueio. Reverter uma pessoa, sem deploy:

```sql
update gps.plantao_alunos
   set bloqueado_por_programa = false, bloqueio_excecao = true
 where lower(btrim(email)) = 'pessoa@exemplo.com';
```

> `bloqueio_excecao = true` impede o job noturno de rebloquear.

---

## Passo 1 — Envs na Hostinger

```
PLANTAO_MANUTENCAO_SEGREDO=<segredo, mín. 16 caracteres>
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<32 bytes base64: openssl rand -base64 32>
```

A segunda **não é opcional**: sem ela, cada build gera uma chave nova e
derruba as Server Actions em voo **do portal inteiro**.

## Passo 2 — Segredo do job no banco — **o MESMO valor**

```sql
alter role authenticator set app.plantao_manutencao_segredo = '<o mesmo segredo>';
```

🔴 **Fazer o 2 sem o 1 deixa PIOR que desligado:** o job passa de 503
(diagnóstico claro) para 401 (obscuro).

> Não há mais senha padrão a configurar — esse passo morreu com o login.

## Passo 3 — Deploy (manual; o push NÃO publica)

```bash
git pull && npm install && npm run build
# reiniciar no hPanel (ou: touch tmp/restart.txt)
```

Conferir:

```bash
# Esperado: 401 (rota viva, pedindo o segredo)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://programa.timeholdingbrasil.com.br/api/plantao/manutencao
```

| Resposta | Significa |
|---|---|
| **401** | ✅ certo |
| **503** | falta o `alter role` do passo 2 |
| **500** | falta a env do passo 1 |
| **307** | o proxy está barrando (não deveria) |

## Passo 4 — Agendar o job — 🔴 **DE HORA EM HORA**, não 1×/dia

```sql
select cron.schedule(
  'plantao-manutencao-horaria',
  '0 * * * *',  -- toda hora cheia
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

🔴 **Por que de hora em hora:** o e-mail com o link da sala sai **1 hora antes**
do plantão, e a janela de envio é de 1 hora. Com cron diário, só os plantões
que começam na hora seguinte à execução receberiam e-mail — todos os outros
ficariam sem.

⚠️ **URL sem barra final.** Com barra, o Next devolve 308, o `pg_net` não segue
redirect e o job morre em silêncio.

O job faz, tudo idempotente: NPS pendente, **aviso de véspera à mentora**,
**e-mail com o link da sala (1h antes)**, **reconciliação da elegibilidade** e
expurgo de eventos com mais de 90 dias.

---

## Passo 5 — Ensaio em navegador (nunca foi feito)

1. `/admin/plantao` → conferir os 3 plantões da Semana 1
2. Abrir `/p/plantao` **dentro do iframe da Hotmart** — deve mostrar o
   calendário **sem pedir nada** (é público agora)
3. Informar nome + e-mail de um comprador real → inscrever
4. Conferir a **contagem de participantes** no horário
5. Conferir que o card diz "o link aparece aqui quando a equipe publicar" e
   **não** oferece "Entrar na sala" (gravaria presença numa sala inexistente)
6. Trocar de mês e voltar — a identidade deve se manter (`?e=` preservado)
7. Cadastrar um `zoom_url` num plantão de teste que comece em menos de 1h e
   conferir: o e-mail chega com o link, e o cancelamento passa a ser recusado

**Teste em Safari também** — mas o risco caiu muito: sem cookie de sessão, não
há mais CHIPS nem Storage Access API no caminho.

## Passo 6 — Fechar o `frame-ancestors`

A CSP de `/p/*` libera `https://*.hotmart.com` inteiro — domínio compartilhado
por **todos** os produtores da plataforma. Com o iframe aberto, rode no console:

```js
document.referrer   // ou, dentro do iframe: location.ancestorOrigins
```

Se aparecer **apenas** `hm.nivelouro.com.br`, apague as duas entradas
`hotmart.com` da CSP em `next.config.ts` e faça novo deploy.

## Passo 7 — Conferir a lista dos 20 (ver topo)

## Passo 8 — Divulgar o link público aos 402

```
https://programa.timeholdingbrasil.com.br/p/plantao
```

Não há senha a distribuir. Quem estiver na base do Acelera se inscreve
informando nome e e-mail **da compra**.

---

## Se algo der errado — desligar sem deploy

```sql
-- Para TODAS as escritas (inscrever/cancelar/presença). Leitura continua.
alter role authenticator set app.plantao_inscricao_aberta = 'false';

-- Tirar um plantão específico do ar
update gps.plantao_slots set publicado = false where id = '<slot>';

-- Revogar uma pessoa
update gps.plantao_alunos set ativo = false where lower(btrim(email)) = '<email>';
```
