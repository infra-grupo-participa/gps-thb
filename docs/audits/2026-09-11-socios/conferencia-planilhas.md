# Conferência das planilhas de sócios × sistema (11/09/2026)

Fonte: `C:\Users\infra\Downloads\Sócios` (9 CSVs).

## O que as planilhas realmente têm

Só **uma** traz o par titular↔sócio:
`Alunos T1-T41 Ativação - Sócios T41 - Acelera Holding - Set_26.csv`

| | |
|---|---:|
| Linhas no arquivo | 996 |
| Linhas preenchidas | 16 |
| **Pares únicos** | **14** |
| Pares válidos (após descartes) | **11** |

As outras 8 planilhas têm coluna `Sócio` praticamente vazia — 2 "SIM"
(Gabriela Gavioli e Adner Saraiva, T40) **sem contraparte informada**, ou seja,
sem o par não há o que associar.

⚠️ **Não confundir com os "65 sócios viraram titulares"** do CLAUDE.md: aquilo
veio da coluna `Sócio?` da planilha dos 141 compradores, que **não diz de quem**
a pessoa é sócia. Sem o par, não há unificação possível. Esta planilha é a única
fonte com a relação explícita.

## Os 3 pares descartados (decisão do Marcio: ignorar)

| Titular | Sócio | Problema |
|---|---|---|
| marcusmvale@gmail.com | robertolitel@gmail.com **e** robertolitel@yahoo.com.br | 2 sócios — viola o teto de 1 |
| eureliojs@gmail.com | eureliojs@gmail.com | sócio de si mesmo |
| asantana10@hotmail.com | nao.tem@kksj.com.br ("Não Tem") | e-mail falso |

Nenhum dos três está no sistema — ignorar não quebra nada.

## Cruzamento com o sistema

Dos 14 sócios da planilha:

- **13 não têm login nenhum** no GPS
- **1 existe, como TITULAR**: Rafael Pinheiro Aguilar

| | |
|---|---:|
| Titulares no sistema | 142 |
| Sócios no sistema | 10 |
| Ambientes compartilhados | 10 |

🔑 **O modelo de ambiente compartilhado já existe e funciona.** A feature pedida
não é "criar sócio" — é **inverter quem convida** (hoje só o admin, por
`gps.admin_adicionar_socio`).

## O único caso de unificação: Rafael → sócio da Michelle

Ambiente do Rafael (`eccb2de7-337d-4c12-87e5-fed8742ac924`):

| item | qtd |
|---|---:|
| clientes | 0 |
| progresso | 0 |
| chamados | 0 |
| notas | 0 |
| eventos | 2 |
| onboarding | 1 |

Destino — Michelle (`5acd4b8c-3d86-45e4-bbe9-c2901d82b38b`): 1 membro, 0 clientes.

🔴 **ARMADILHA:** o onboarding do Rafael tem
`ambiente_aluno_id = eccb2de7…` — o ambiente que será apagado. A migration
**precisa repontar** para o ambiente da Michelle, senão a linha fica órfã.

⚠️ Ele está **travado no passo 3** (`concluido_em` nulo, `origem = ja_tenho`) —
é um dos 10 parados ali. Rebaixá-lo não resolve isso sozinho.

⚠️ Reler a migração **…219** antes de escrever: `membros_user_id_key` é UNIQUE e
o gatilho `on_auth_user_created_gps` cria membro dentro do insert em
`auth.users`. Já mordeu antes.

## O caso "Alexander" (citado pelo Marcio)

Não existe "Alexander" no sistema. Há 4 variantes (Alexandre/Alexandro), **todas
com e-mail próprio e acesso funcionando**.

O caso real é o **inverso** e é **um só** — ambiente
`006cae01-5c64-46e8-ba00-63a9606487bd`:

- `thb_alunos` = **Paula Maria Alves de Lima Monteiro** (paulamontei@hotmail.com)
- **login = alexmontei@hotmail.com** (Alexsandro Monteiro da Silva)
- `pessoa_aluno_id` → Alexsandro

Ele acessa; ela não tem acesso próprio. É exatamente o par que a feature resolve.

✅ **É o ÚNICO titular no sistema com login diferente do cadastro** (conferido).
Ordem do Marcio: **não mexer** — e-mail trocado que funciona fica como está.
