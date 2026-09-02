# Ativar o Plantão de Dúvidas — passo a passo

Código commitado e migrations já aplicadas no banco. Faltam **4 passos** para
o plantão ficar de pé. Enquanto não forem feitos, nada quebra — o job responde
erro explícito em vez de falhar em silêncio.

> ⚠️ **Escolha um segredo forte (mín. 16 caracteres) e use o MESMO nos passos 1 e 2.**
> Não use o exemplo abaixo se ele já circulou por chat/e-mail — gere outro.

---

## 1. Painel da Hostinger → Variáveis de ambiente

```
PLANTAO_MANUTENCAO_SEGREDO=<seu segredo, mín. 16 caracteres>
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<32 bytes aleatórios em base64>
```

A segunda **não é opcional**: sem ela cada build gera uma chave nova e as
Server Actions em voo falham no momento do deploy. Isso afeta o portal todo,
não só o plantão.

Gerar a chave: `openssl rand -base64 32`

## 2. No banco (SQL Editor do Supabase) — MESMO valor do passo 1

```sql
alter role authenticator set app.plantao_manutencao_segredo = '<o mesmo segredo>';
```

Sem isso as 3 funções de manutenção recusam tudo com `42501` — de propósito.

## 3. Deploy (é manual — push não publica)

```bash
git pull && npm install && npm run build && <restart do app na Hostinger>
```

## 4. Agendar o job diário

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

⚠️ **URL sem barra final.** Com barra o Next devolve 308 e o `pg_net` não segue
redirect — o job morreria em silêncio.

O job faz 3 coisas, todas idempotentes: envia o NPS de quem participou,
expurga sessões vencidas e apaga eventos com mais de 90 dias.

---

## Conferir que funcionou

```bash
# Esperado: 401 (o handler foi alcançado). Se vier 307, o proxy está barrando.
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://programa.timeholdingbrasil.com.br/api/plantao/manutencao
```

| Resposta | Significa |
|---|---|
| **401** | Certo — a rota está viva e pedindo o segredo |
| **307** | O proxy está barrando (não deveria acontecer) |
| **500** | Falta `PLANTAO_MANUTENCAO_SEGREDO` na Hostinger (passo 1) |
| **503** | Falta o `alter role` no banco (passo 2) |

---

## Antes de abrir para os 421

O fluxo real **nunca foi testado em navegador**. Faça um ensaio:

1. `/admin/plantao` → criar um plantão de teste (mentora, data, hora, link do Zoom)
2. Publicar (sem link do Zoom ele não aparece para o aluno — proposital)
3. Abrir `/p/plantao` **dentro do iframe da Hotmart**, com um e-mail real da lista
   e os 4 últimos dígitos do documento dele
4. Inscrever-se, esperar a janela (1h antes) e revelar o link
5. Conferir em `/admin/plantao` se a presença apareceu

**Teste em Safari também.** Ele bloqueia cookie de terceiro: a tela deve pedir
"Ativar acesso" ou oferecer "abrir em nova aba" — nunca voltar ao login em loop.

## Os 46 sem documento

Vieram do CSV sem CPF/CNPJ e **não conseguem** fazer o primeiro acesso sozinhos.
Em `/admin/plantao` → aba de acessos, eles aparecem marcados em vermelho com
"sem documento — precisa de liberação". Confirme a identidade por WhatsApp/e-mail
e clique em **"Liberar 1º acesso"**. A liberação vale para um acesso só.

## Re-carga do próximo mês

Botão "Carregar lote" no painel. Regras: quem sumir do CSV **não** perde acesso
(só `Cancelou? = SIM` desativa), e quem já criou senha **nunca** a perde.
