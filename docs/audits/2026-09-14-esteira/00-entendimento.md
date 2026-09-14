# A esteira da Etapa 01 — entendimento confirmado (14/09/2026)

Nove pedidos do Marcio que, lidos juntos, descrevem **uma esteira só**.
Confirmado por ele antes de qualquer código.

> *"estamos em produção, precisamos ser assertivos e evitar erros ao máximo,
> temos que estar 100% alinhados"*

## O fluxo

```
1. Parceiro dispara as 3 mensagens padrão da trilha
2. Parceiro marca QUEM respondeu com interesse
3. Parceiro escolhe 5 CLIENTES:
      · os 5      → equipe faz a ENTREVISTA PRÉVIA (ligação)
      · 1 dos 5   → é o FAVORITO: a equipe acompanha o programa inteiro
                    e faz com ele a REUNIÃO PRELIMINAR
4. Operador da equipe liga para os 5 → registra resultado, DISC e decisores
5. Equipe propõe DATA para a reunião preliminar do favorito
6. Parceiro aceita ou CONTESTA → contestação vira aviso no /admin para
   a equipe reagendar
7. O advogado que fará a reunião preliminar vê o DOSSIÊ do favorito:
   DISC, decisores, observações da entrevista
```

## 🔴 A correção que quase virou bug

Meu primeiro entendimento foi **"5 para entrevista + 1 para acompanhar" = 6
clientes**. ERRADO. O Marcio corrigiu:

> *"entre os 5, um deles eh o favorito, que a equipe vai acompanhar o status
> sempre"*

**São 5 no total.** O favorito é um DOS cinco, não um sexto. A regra de
seleção é: escolha 5, e marque qual deles é o favorito.

Consequência de desenho: a tela de seleção é **uma só** (escolher os 5, com
um rádio para dizer qual é o favorito), não duas listas separadas. E a trava
de "1 favorito por ambiente" (migração …215) continua valendo dentro dos 5.

## O que JÁ EXISTE no banco (medido em 14/09, com dado real)

`gps.etapa1_clientes`, 1.213 clientes:

| Coluna | Tipo | Preenchidos | Papel no fluxo |
|---|---|---:|---|
| `mensagem_padrao_enviada` | boolean | 85 | passo 1 |
| `aderiu_reuniao` | boolean | 19 | passo 2 (respondeu com interesse) |
| `data_reuniao_preliminar` | date | 33 | passo 5 |
| `perfil_disc` | text | **124** | passo 4 |
| `registro_contato` | text | **400** | passo 4 |
| `acompanhado_equipe` | boolean | 34 | o favorito (passo 3) |

✅ **Marcio confirmou: são os MESMOS conceitos do fluxo novo.** Reaproveitar
as colunas — não criar paralelas. Menos migração, menos risco, e os 124 DISC
e 400 registros já existentes continuam valendo.

## Ordem de execução (decisão do Marcio: um por vez, do menor ao maior)

Cada item publicado e validado por ele antes do próximo.

**Rápidos, risco baixo:**
1. Busca/filtro por fase na tela de parceiros
2. Ver as respostas do onboarding (mini-botão no card do aluno)
3. Número do indicador clicável → lista + CSV

**Médios:**
4. Campo de anexo das minutas (com a instrução do vermelho)
5. Indicador visual de quem tem reunião preliminar agendada + fila do operador

**A esteira (maior, mexe no fluxo):**
6. Registro do resultado do disparo (quem recebeu, quem teve interesse)
7. Seleção dos 5 + marcação do favorito
8. Registro da entrevista prévia (resultado, DISC, decisores)
9. Proposta de data → aceite/contestação → aviso de reagendamento
10. Dossiê do favorito para o advogado

## Divergência registrada

O Marcio pediu *"clicar em 1213 e ver a lista dos 1213"*. Uma tabela de 1.213
linhas no navegador trava e ninguém acha nada nela. O desenho será **lista
paginada com busca e filtro + CSV com o conjunto inteiro** — o arquivo
aguenta, a tela não. Ele não contestou esse ponto.
