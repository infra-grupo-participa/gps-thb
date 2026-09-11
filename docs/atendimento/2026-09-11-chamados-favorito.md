# Respostas dos 5 chamados do primeiro dia (11/09/2026)

Todos sobre a trava do cliente favorito, **já corrigida e publicada**.
Conferido no banco: nenhum dos 5 clientes foi confirmado pela equipe
(`acompanhamento_confirmado_em IS NULL`) → **os 5 parceiros já resolvem
sozinhos**, sem intervenção no dado.

⚠️ Confira o estado antes de enviar (o parceiro pode já ter resolvido):

```sql
select a.nome, c.nome cliente, c.acompanhado_equipe,
       c.acompanhamento_confirmado_em
  from gps.etapa1_clientes c
  join public.thb_alunos a on a.id = c.aluno_id
 where c.acompanhado_equipe
   and a.nome in ('Vania Claudie Thomaz','Rodrigo Gonçalves Maria',
                  'Elisama Teodoro da Silva','Marineide Sousa de Carvalho',
                  'Frederico Garcia Aziz');
```

---

## Vania Claudie Thomaz — Sidinei Giacomin
**Bug nosso.** Ela não clicou: `cliente_favoritado` e `onboarding_concluido`
no MESMO microssegundo. O questionário marcou por ela.

> Você tem razão, e o erro foi nosso: não foi você que marcou a estrela. O questionário inicial marca automaticamente o primeiro cliente cadastrado como "cliente acompanhado pela equipe", e até ontem o sistema não deixava desfazer — daí o chamado.
>
> Já está corrigido. Você mesma resolve agora:
>
> 1. Abra a aba **Clientes**.
> 2. Clique na estrela no card do **Sidinei Giacomin**.
> 3. Confirme em **Tirar do acompanhamento**.
> 4. Marque a estrela do cliente que você realmente quer que a equipe acompanhe.
>
> Marque o novo logo em seguida: sem nenhum cliente marcado, os passos 4 a 8 da Etapa 01 voltam a travar. Nenhum dado do Sidinei se perde.

---

## Rodrigo Gonçalves Maria — Dr. Murilo Foppa
**Bug nosso** (trava cedo demais). Ele escolheu, mas não podia desfazer.

> Faz sentido, e você não precisa mais de nós para isso. A trava era cedo demais: o sistema pedia chamado desde o instante em que você clicava na estrela, mesmo antes de a equipe assumir o cliente. Corrigimos ontem.
>
> 1. Aba **Clientes**.
> 2. Clique na estrela no card do Dr. Murilo.
> 3. Confirme em **Tirar do acompanhamento**.
> 4. Marque a estrela de quem for de fato o cliente da sua primeira holding.
>
> Marque outro na sequência: sem cliente acompanhado, os passos 4 a 8 da Etapa 01 ficam travados.

---

## Elisama Teodoro da Silva — Patrícia
🔴 **Ela fechou o PRÓPRIO chamado 20 segundos depois de abrir** (`fechado_por`
= o login dela, não da equipe) **e a Patrícia continua marcada**. O problema
NÃO foi resolvido. **Procurar ativamente** — é o caso com maior risco de ficar
no vácuo.

> Voltando no seu chamado: ele foi fechado, mas a Patrícia continua marcada como cliente acompanhado — então o que você pediu não chegou a acontecer. A trava que te obrigou a abrir o chamado foi corrigida, e agora você mesma resolve.
>
> 1. Aba **Clientes**.
> 2. Clique na estrela no card da **Patrícia**.
> 3. Confirme em **Tirar do acompanhamento**.
> 4. Marque a estrela do cliente que você quer no lugar.
>
> Não deixe sem ninguém marcado: os passos 4 a 8 da Etapa 01 ficam travados até você escolher outro. Se a estrela não sair, me diga que eu vejo na hora.

---

## Marineide Sousa de Carvalho — Gilson
**Manuseio + conceito.** Não é bug. Ela entendeu "favoritar" como "por onde
quero começar". O cliente está em `prospeccao`, mas o relato dela descreve
`fechamento`.

> Entendo a confusão, e ela é justa — o nome "favoritar" sugere mesmo "por onde eu quero começar". Não é isso: a estrela marca **o cliente que a equipe vai acompanhar com você até a primeira holding sair**, do croqui ao contrato. É o caso que levamos junto nas reuniões, não uma ordem de prioridade.
>
> Pelo que você descreve, o Gilson pode ser exatamente a escolha certa: já fez a sessão de viabilidade e quer o croqui — é o seu caso mais adiantado. Se quiser mantê-lo, não precisa fazer nada.
>
> Duas coisas na aba **Clientes**:
>
> - Para trocar: clique na estrela do Gilson, confirme em **Tirar do acompanhamento** e marque a do escolhido.
> - A ficha do Gilson está em **Prospecção**, mas pelo seu relato ele já está em **Fechamento**. Troque no seletor de fase do card dele.

---

## Frederico Garcia Aziz — MOACIR PAIVA → NAZY FUAD
**Manuseio.** A NAZY já existe no ambiente (**NAZY FUAD IBRAHIM**).
⚠️ Troca de cliente associado — o Marcio pediu para tratar depois, com calma.
Esta resposta só ensina o caminho, não executa nada.

> Dá para fazer você mesmo agora, e a NAZY já está cadastrada no seu ambiente (**NAZY FUAD IBRAHIM**) — não precisa cadastrar nada.
>
> A ordem importa, porque só um cliente fica marcado por vez:
>
> 1. Aba **Clientes**.
> 2. Clique na estrela do **MOACIR PAIVA** e confirme em **Tirar do acompanhamento**.
> 3. Clique na estrela da **NAZY FUAD IBRAHIM** e confirme em **Escolher este cliente**.
>
> Faça os dois na mesma sessão: entre um e outro você fica sem cliente acompanhado e os passos 4 a 8 da Etapa 01 travam.

---

## Acompanhar depois do envio
- **Elisama** — confirmar se desmarcou a Patrícia e quem entrou no lugar.
- **Marineide** — confirmar se manteve o Gilson e se a fase virou Fechamento.

## ⚠️ Pendência de configuração (não é código)
`gps.config.chamados_email_equipe` está **VAZIO** e `EMAIL_SUPORTE` também.
Os 5 chamados de ontem **não avisaram ninguém** — a equipe só os vê abrindo
`/admin/chamados`. Preencher em `/admin/chamados` (sem deploy).
