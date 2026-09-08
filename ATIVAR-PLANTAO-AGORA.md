# Ativar o Plantão — roteiro de execução (revisado em 08/09/2026)

Substitui o passo a passo do `ATIVAR-PLANTAO.md`, que ficou **desatualizado**:
o 1º acesso não pede mais os 4 dígitos do documento, e a ordem dos passos
mudou por causa de uma janela perigosa (ver passo 5).

> ⚠️ Os segredos NÃO estão neste arquivo — o repositório é público. Gere-os na
> hora e use o **mesmo valor** onde indicado.

## Estado conferido no banco em 08/09/2026

| Item | Estado |
|---|---|
| 7 tabelas `plantao_*` | ✅ existem |
| 422 alunos do Acelera carregados | ✅ (402 aptos + 20 bloqueados) |
| 3 mentoras + e-mails cadastrados | ✅ `isabela@` / `elaine@` / `cristiane@advmais.com` |
| Código (rota pública, painel, job) | ✅ commitado |
| Inscrições existentes | 0 — **o produto nunca foi usado** |
| `app.plantao_senha_padrao` | ❌ **não setado** |
| `app.plantao_manutencao_segredo` | ❌ **não setado** |
| Envs na Hostinger | ❌ **não setadas** |
| Cron `plantao-manutencao-diaria` | ❌ **não agendado** |
| Deploy do código novo | ❌ **pendente** (é manual) |
| Teste real em navegador | ❌ **nunca feito** |

---

## ⚠️ Antes de tudo: os 20 que perderam o Plantão

20 dos 422 compradores do Acelera também estão no Programa de Implementação e,
por decisão de 08/09/2026, **perderam o acesso ao Plantão**. A lista nominal
está em `plantao-20-bloqueados.csv` (gerada fora do repo, porque tem dado
pessoal).

🔴 **O sistema não vai explicar nada a eles.** Por segurança, a recusa usa a
mesma mensagem de "senha errada" — dizer "você migrou para o Programa" num
login público permitiria a qualquer um descobrir quem comprou o quê. Então:

- [ ] **Avisar os 20 por WhatsApp/e-mail ANTES da abertura.** Sem isso, são 20
      pessoas tentando entrar em loop e 20 tickets de suporte.
- [ ] **Conferir a lista** antes do passo 10. É ponto de não-retorno: depois que
      alguém cria senha e se inscreve, desfazer é caro; agora é um `update`.

Reverter uma pessoa (sem deploy):

```sql
update gps.plantao_alunos
   set bloqueado_por_programa = false, bloqueio_excecao = true
 where lower(btrim(email)) = 'pessoa@exemplo.com';
```

> `bloqueio_excecao = true` é o que impede o job noturno de rebloquear. Sem
> essa flag, o desbloqueio dura até a próxima madrugada.

---

## Passo 1 — Senha padrão do 1º acesso (SQL Editor)

```sql
alter role authenticator set app.plantao_senha_padrao = '<a senha que será divulgada>';
```

**Seguro fazer sozinho:** falha fechado. Sem o setting, nenhum 1º acesso é
criado — a recusa é a mensagem genérica de sempre.

🔴 **Mas não divulgue a senha ainda.** Ver passo 5.

## Passo 2 — Envs na Hostinger

```
PLANTAO_MANUTENCAO_SEGREDO=<segredo, mín. 16 caracteres>
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<32 bytes em base64: openssl rand -base64 32>
```

A segunda **não é opcional**: sem ela cada build gera uma chave nova e derruba
as Server Actions em voo **do portal inteiro**, não só do plantão.

## Passo 3 — Segredo do job no banco — **o MESMO valor do passo 2**

```sql
alter role authenticator set app.plantao_manutencao_segredo = '<o mesmo segredo>';
```

🔴 **Fazer o 3 sem o 2 deixa PIOR que desligado:** as RPCs passam a aceitar,
mas o job manda um segredo diferente e falha com **401** em vez do 503 atual —
diagnóstico mais obscuro.

## Passo 4 — Deploy (manual; o push NÃO publica)

```bash
git pull && npm install && npm run build
# reiniciar a app no hPanel (ou: touch tmp/restart.txt)
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
| **503** | falta o `alter role` do passo 3 |
| **500** | falta a env do passo 2 |
| **307** | o proxy está barrando (não deveria) |

## Passo 5 — 🔴 A janela perigosa entre o passo 1 e o 4

Entre setar a senha padrão (passo 1) e publicar o código novo (passo 4), o
portal no ar ainda é o **antigo**: ele pede os 4 dígitos do documento e não
conhece a tela de troca de senha.

O banco ignora o campo do documento. Então, nessa janela, quem digitar a senha
padrão **entra** — e cai no código velho, que **não mostra a tela de troca**.
Resultado: fica com a senha provisória e acesso, sem nunca trocar.

**Como evitar:** faça o passo 1 e o passo 4 na mesma janela, e **só divulgue a
senha padrão depois do deploy concluído** (passo 10).

## Passo 6 — Agendar o job diário

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

⚠️ **URL sem barra final.** Com barra, o Next devolve 308, o `pg_net` não segue
redirect e o job morre em silêncio.

O job faz, tudo idempotente: envia NPS pendente, avisa a mentora na véspera,
reconcilia a elegibilidade (quem entrou no Programa perde o Plantão), expurga
sessões vencidas e eventos com mais de 90 dias.

---

## Passo 7 — Ensaio em navegador (nunca foi feito)

1. `/admin/plantao` → criar um plantão de teste (mentora, data, hora)
2. **Publicar** — funciona **sem link do Zoom** desde 08/09
3. Abrir `/p/plantao` **dentro do iframe da Hotmart**, com um e-mail real da
   lista e a **senha padrão** (não pede mais documento)
4. Conferir que aparece a **tela de troca de senha** e que ela é obrigatória
5. Trocar a senha → conferir que cai no calendário
6. Inscrever-se → conferir a **contagem de participantes** no horário
7. Conferir que o card diz "o link aparece aqui quando a equipe publicar" e
   **não** oferece "Entrar na sala" (isso gravaria presença numa sala que não
   existe)
8. No dia seguinte de manhã, conferir se a mentora recebeu o e-mail de véspera
   com a lista de inscritos

**Teste em Safari também.** Ele não implementa CHIPS: a tela deve pedir "Ativar
acesso" ou oferecer "abrir em nova aba" — nunca voltar ao login em loop.

## Passo 8 — Fechar o `frame-ancestors`

Achado do `security-pentester` (médio): a CSP em `next.config.ts` libera
`https://*.hotmart.com` inteiro — domínio compartilhado por **todos** os
produtores da plataforma. Outro produtor poderia embedar `/p/plantao` e
sobrepor elementos no formulário de senha (clickjacking). Não foi restringido
às cegas porque derrubar o host errado tira os 422 do ar.

**Com o iframe aberto**, rode no console:

```js
document.referrer   // ou, dentro do iframe: location.ancestorOrigins
```

Se aparecer **apenas** `hm.nivelouro.com.br`, apague as duas entradas
`hotmart.com` da CSP e faça novo deploy.

## Passo 9 — Conferir a lista dos 20 (ver topo)

## Passo 10 — Só então divulgar a senha padrão aos 402
