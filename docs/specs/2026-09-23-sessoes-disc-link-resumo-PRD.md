# PRD — Evolução da Agenda de Sessões
### Perfil DISC no card · link compartilhado · resumo pós-reunião · entrevista feita pelo aluno

| | |
|---|---|
| **Data** | 23/09/2026 |
| **Sistema** | GPS — Programa de Implementação Assistida |
| **Estado** | 🟡 Desenho. 4 premissas reversíveis (§4). 2 medições pedidas ao Marcio (§5.6). 1 bloqueio real (§8 B2) |
| **Autor** | `arthur` (arquitetura) + Marcio (regra de negócio, 23/09) |
| **Base** | `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md` (v1) — **não repetido aqui** |
| **Banco** | Supabase `mbvybujpkwuorhtdzcde`, schema `gps` |

> Este documento cobre **só o delta** sobre a v1. Modelo de dados, grade
> derivada, travas de corrida, e-mails e RLS da v1 continuam valendo como
> escritos nas migrations `…291`/`…292`/`…293`, **já aplicadas em produção**.

---

## 1. O que o Marcio pediu, em uma linha cada

| # | Pedido | Onde vive no desenho |
|---|---|---|
| 1 | A Entrevista Prévia gera o DISC | §3 fatia G — o DISC já existe e a entrevista já o grava; falta o campo **rico** e o registro **pelo aluno** |
| 2 | Com o DISC pronto, agenda a Preliminar | §3 fatia A — **sem trava dura** (§6.2) |
| 3 | Cada pessoa com horário vê o card dela, com o DISC do cliente | §3 fatia E (aluno) · §3 fatia F (doutora) |
| 4 | Admin **e** parceiro preenchem, livre e visível | §3 fatia B — o parceiro **já escreve** o DISC hoje (§2.1) |
| 5 | DISC mostra mais que a letra: consciência, gatilhos, relacionamento | §3 fatia A — 3 colunas novas em `etapa1_clientes` |
| 6 | Link da sessão: ambos podem colocar | §3 fatia D — **dono por precedência**, premissa P3 |
| 7 | Entrevista feita **pelo aluno**; pode pular espaços; favorito automático | §3 fatia G — **fronteira nova**, RPC separada (§6.1) |
| 8 | Resumo depois da reunião | §3 fatia C — estado `realizado` + campo de resumo |
| 9 | Harmonioso, sem atrapalhar as demais features | §7 — a lista fechada do que **não** se toca |

---

## 2. Os três fatos que reorganizam o desenho

### 2.1 🔴 O DISC do cliente **já é escrito pelo aluno hoje**

Medido no repo em 23/09:

- `src/app/clientes/actions.ts:84` — `"perfil_disc"` está na **allowlist de runtime** de `PatchCliente`.
- `src/components/clientes/cliente-ficha.tsx:723-740` — o campo já está na ficha, com `Select` de D/I/S/C.
- `supabase/migrations/00000000000000_gps_baseline.sql:375,387` — `clientes_owner_update` + `grant update on gps.etapa1_clientes to authenticated`.

**Consequência:** o pedido 4 ("o parceiro pode colocar as informações") **já
está atendido para a letra**. Não existe fronteira nova a abrir para o DISC.
O que não existe são os campos ricos (pedido 5) — e esses nascem **na mesma
allowlist, na mesma ficha, com a mesma policy**. Risco novo: zero.

🔴 **Isto desarma o conflito que o Marcio listou como #1** — ver §6.1. Abrir
`gps.entrevista_gravar` ao aluno **não é** necessário para o DISC. É
necessário só para o pedido 7 (a entrevista inteira), e ali a resposta é
**outra RPC**, nunca a mesma.

### 2.2 🔴 O snapshot congela o DISC — e hoje já nasce errado para 27 de 34

A v1 congela `briefing_snapshot` **no ato do agendamento** (`…292:1018`). Os
campos novos serão preenchidos **depois** — inclusive pela doutora, minutos
antes da sessão. O snapshot não os terá.

E o problema é maior do que o enunciado: **27 dos 34 favoritos não têm nem a
letra**. Hoje, quem agendar com esses 27 congela `perfil_disc: null` — e a
tela da doutora mostraria vazio **para sempre**, mesmo depois de alguém
preencher. Nenhum erro, nenhum aviso: a tela sabe menos do que o banco.

**Resolução explícita (fatia F):** o DISC **sai do snapshot como fonte de
verdade** e passa a ser lido **ao vivo** na RPC de leitura do briefing. O
snapshot continua congelando as outras 4 fontes (onboarding, entrevista,
decisores, minutas) — que são histórico e devem mesmo ficar paradas.

> **Por que o DISC é diferente das outras 4:** as outras respondem *"o que se
> sabia quando marcamos"*. O DISC responde **"quem é essa pessoa"** — é
> atributo estável do cliente, não evento datado. Congelá-lo nunca foi
> correto; o defeito só não apareceu porque ninguém tinha preenchido nada.

Contrato: `briefing_snapshot` continua existindo e continua congelado;
`gps.sessao_briefing_ler` devolve `briefing` (congelado) **mais um bloco novo
`disc_ao_vivo`**, lido de `etapa1_clientes` no momento da chamada, com
`lido_em`. A tela mostra o bloco ao vivo e, se divergir do congelado, diz
*"atualizado depois do agendamento"*.

🔴 **Nenhuma migration reescreve snapshot antigo.** Reescrever briefing
congelado apagaria justamente o que ele existe para preservar. A reversão é
apagar o bloco novo da RPC de leitura.

### 2.3 O link já existe, com CHECK — e hoje **ninguém** o escreve

`sessao_agendamentos.link_reuniao` já tem `check (link_reuniao ~ '^https://')`
(`…291:315`) e está **dentro** do grant de coluna de `authenticated`
(`…291:547`) — o aluno **já vê**. Mas `authenticated` não tem `UPDATE` na
tabela (toda escrita é por RPC), e **não existe RPC de link** nas três
migrations. O campo está no ar, visível, e vazio por construção.

---

## 3. PLANO — 8 fatias

**Ordem:** A -> B -> C -> D -> (E || F) -> G -> H -> `kirad` -> `joao`.

🔴 **Nenhum arquivo aparece em duas fatias.** A coluna "Arquivos" é a
declaração de exclusividade — o risco não é conflito de merge, é **dívida de
commit**: arquivo que dois editam não acusa nada no git, e commitar por
arquivo inteiro publica o trabalho não revisado do outro. Fricção residual
declarada em §6.7.

---

### Fatia A — colunas do DISC rico, resumo, dono do link, interruptor
**Executor: `victor` (Sr.)** · migration nova

**Por que Sr.:** toca `gps.etapa1_clientes`, a tabela mais quente do sistema,
que já carrega **4 triggers de trava** (status congelado, acompanhamento
travado, contrato travado, captura do diário). Acrescentar coluna ali exige
saber quais disparam no UPDATE e se o CHECK novo colide. Também mexe nos
CHECKs de `sessao_agendamentos`.

**Arquivo:** `supabase/migrations/20260923000294_gps_sessao_disc_link_resumo.sql`

> ⚠️ **Antes de numerar: `ls supabase/migrations | tail`.** Em 22/09 um
> executor num fork defasado numerou 0130, que já existia, e havia até um
> `verificacao-0130.sql` de outro assunto que seria sobrescrito. Hoje o último
> é `…293`; confirmar que `…294` está livre **no momento da escrita**.

**Conteúdo:**

1. **3 colunas em `gps.etapa1_clientes`** (pedido 5):
   - `disc_consciencia text` — CHECK de 3 a 2000 caracteres quando não nulo
   - `disc_gatilhos text` — mesmo CHECK
   - `disc_relacionamento text` — mesmo CHECK
   - `disc_atualizado_em timestamptz`
   - `disc_atualizado_por uuid references auth.users(id) on delete set null`

   🔴 **Teto de 2000**, o mesmo de `entrevista_observacoes` e
   `cliente_minutas.notas` — não inventar régua nova.
   🔴 **Nulo = não informado, nunca string vazia.**
   🔴 **Nenhuma é `not null`** — ver §6.2: 27 de 34 favoritos não têm nem a letra.

2. **Nenhum índice.** Hipótese a confirmar por medição — §5.2.

3. **O desfecho da sessão**, em `gps.sessao_agendamentos`:
   - `resumo text` — CHECK de 10 a 4000 caracteres quando não nulo
   - `resumo_em timestamptz` · `resumo_por uuid references auth.users(id) on delete set null`
   - CHECK novo: resumo só pode existir quando o estado for `realizado`

   🔴 **Piso de 10 caracteres**, não 3: resumo de reunião com 3 caracteres é
   ruído ocupando o lugar de informação. Teto 4000 espelha `descricao_caso`.
   ⚠️ **Sem subquery no CHECK** (0A000) — a lição de 09/09: um `not exists`
   com subquery passou no `tsc`, no build, no pentest e em 3 leituras, e
   **só o `alter table` pegou**.

4. **Dono do link**, em `gps.sessao_agendamentos`:
   - `link_definido_por uuid references auth.users(id) on delete set null`
   - `link_em timestamptz`

   É o que torna a precedência de P3 auditável, e o que a tela usa para dizer
   "colado pela equipe" contra "colado por você".

5. **`gps.config.sessoes_exige_disc`, nascendo desligado** — o interruptor de
   P1 (§4). Entra **false**, para a reversão existir no dia em que o Marcio
   quiser ligar. `on conflict (chave) do nothing`.
   ⚠️ **Não acrescentar à allowlist de `gps.config_definir` nem a
   `INTERRUPTORES_CONFIG`** — mexer naquela RPC é escopo próprio, e
   acrescentar só de um lado produz interruptor que a tela oferece e a RPC
   recusa. Mesma decisão que a `…291` já tomou para `sessoes_exige_confirmacao`.

6. **Antes de qualquer `alter`: `pg_get_constraintdef`.** ⚠️
   `sessao_agendamentos` tem **4 CHECKs** — filtrar por `conname`. CHECK
   reescrito de memória apaga valor em silêncio (7 conferências numa sessão
   de 09/09, 2 pegaram erro real).

7. **Reversão em SQL comentado no cabeçalho:** `drop column if exists` das 10
   colunas novas + remoção da chave em `gps.config`.

**Prova colada na própria migration** (resultado, não roteiro):
`pg_get_constraintdef` antes e depois, a contagem de clientes com
`perfil_disc` preenchido antes e depois (**tem de ser igual** — esta fatia não
toca dado), e o `explain (analyze, buffers)` de M1/M2 (§5.2).

---

### Fatia B — DISC rico na camada de dados
**Executor: `juan` (Jr.)** · TS puro

**Por que Jr.:** é acrescentar 3 chaves a uma allowlist que já existe e 3
campos a uma constante de colunas. **Não abre fronteira nova** (§2.1): policy,
grant e caminho de escrita são os mesmos que `perfil_disc` usa desde 07/2026.

**Arquivos:**
- `src/app/clientes/actions.ts` — as 3 chaves no `Pick` **e** em `CHAVES_PATCH_CLIENTE`
- `src/lib/types.ts` — 3 campos em `ClienteEtapa1`
- `src/lib/data/clientes.ts` — as 3 na constante de colunas

🔴 **As duas listas, sempre.** Só no `Pick`, o tipo some na compilação e o
filtro de runtime descarta o campo: a feature nasce morta, sem erro nenhum.
Já aconteceu com `valor_honorarios` e com `grau_relacao` — está escrito como
aviso dentro do próprio `actions.ts`.

🔴 **`src/lib/data.ts` não tem `select` com asterisco**: coluna fora da
constante não chega à tela, e o sintoma é campo sempre vazio, sem erro.

**Não toca:** `cliente-ficha.tsx` (é da fatia E).

---

### Fatia C — RPC do resumo e da conclusão
**Executor: `victor` (Sr.)** · migration nova

**Por que Sr.:** escreve estado e tem guarda de papel. É a primeira função que
move um agendamento para `realizado` — estado que o CHECK aceita desde a
`…291:303` e que **nenhuma função escreve**.

**Arquivo:** `supabase/migrations/20260923000295_gps_sessao_concluir.sql`

`gps.sessao_concluir(p_agendamento_id uuid, p_resumo text)`:

- **Guarda na entrada**, incondicional, antes de qualquer select: admin OU a
  responsável da sessão, envolvida em `coalesce(..., false)`.
  🔴 O `coalesce` **não é enfeite**: nulo em guarda **libera**, porque um `if`
  com condição nula não dispara o `raise`. Custou um vazamento em 22/09, na
  `sessao_pode_agendar`, neste mesmo pacote.
- 🔴 **O aluno NÃO conclui.** Quem diz que a reunião aconteceu é quem
  conduziu. Isso também evita que `realizado` vire caminho de o aluno liberar
  `sessao_aluno_tipo_viva` (índice parcial em estado agendado) e marcar duas
  sessões do mesmo tipo.
- **Recusa sessão que ainda não começou** com 22023.
  🔴 Compara `inicio_em`, **nunca a coluna `data` isolada** — o servidor roda
  em UTC e `data` mentiria o prazo das 21h à meia-noite.
- **Recusa estado diferente de agendado** com 22023.
- Grava `estado`, `resumo`, `resumo_em`, `resumo_por` + evento
  `sessao_realizada` em `gps.sessao_eventos`.
- 🔴 **O `detalhe` do evento NÃO leva o resumo** — só o tamanho em caracteres.
  É texto livre sobre reunião com cliente de terceiro: a mesma regra de LGPD
  que já mantém `descricao_caso` fora da trilha, do CSV, do Slack e do e-mail,
  e que o comentário da coluna `detalhe` na `…291` escreve.
- `revoke all` de `public` e `anon` **antes** do `grant execute` a
  `authenticated`. ⚠️ Neste projeto **toda função nova nasce com execute para
  `authenticated`** (ALTER DEFAULT PRIVILEGES do schema `gps`) — e revogar só
  de `anon` não pega quando a permissão vem de `PUBLIC`: nomear `public`
  explicitamente.

No mesmo arquivo (mesma entidade, mesma guarda):
`gps.sessao_resumo_editar(uuid, text)` — corrigir resumo já gravado, evento
`sessao_resumo_editado`.

---

> ### ✅ Conferido em 22/09 — concluir NÃO deixa gatilho de e-mail órfão
>
> Medido contra a fila de `gps.sessao_disparar_emails`:
> - **Lembrete de 1h/24h de sessão já realizada:** a fila exige
>   `estado = 'agendado'` em todos os ramos de lembrete → **não dispara**.
>   Concluir **silencia** os lembretes pendentes, que é o correto.
> - **Carimbo que ficou NULL:** a janela é por `inicio_em` e não reabre.
> - 🟡 **LACUNA (não é defeito, é escopo):** não existe gatilho de e-mail para
>   `realizado`. Ninguém é avisado de que a sessão foi concluída nem de que o
>   resumo foi escrito. **Não inventei o e-mail** — se o Marcio quiser, é um 9º
>   ramo na fila e um par de carimbos, na mesma forma dos 8 existentes.
>
> **A UI já trata `realizado` sem mudança:** `ROTULO_ESTADO_SESSAO.realizado =
> "Realizada"` e `/admin/sessoes` já o inclui no Histórico
> (`estados: ["realizado","cancelado","falta"]`). A fatia C encaixa sem tocar
> em tela.

---

### Fatia D — RPC do link, com dono por precedência
**Executor: `victor` (Sr.)** · migration nova

**Por que Sr.:** escrita concorrente em campo compartilhado por dois papéis —
exatamente a corrida silenciosa que o Marcio identificou.

**Arquivo:** `supabase/migrations/20260923000296_gps_sessao_link.sql`

`gps.sessao_link_definir(p_agendamento_id uuid, p_link text)` — a precedência (P3):

1. **Podem escrever:** admin · a responsável da sessão · qualquer membro do
   ambiente (`aluno_id = gps.aluno_atual()`). Os dois lados que o Marcio citou.
2. 🔴 **A equipe vence o parceiro, sempre.** Se o link vigente foi posto por
   equipe (`link_definido_por` é admin ou a responsável), o parceiro recebe
   **22023 com frase própria**: "A equipe já definiu o link desta sessão. Se
   estiver errado, fale pelo Suporte."
3. O parceiro **pode** pôr o primeiro link e **pode** trocar o que ele mesmo pôs.
4. A equipe **pode** sobrescrever qualquer link — e a UI dela avisa quando
   está sobrescrevendo o do parceiro.
5. **Sob `for update`** na linha do agendamento: dois cliques simultâneos não
   podem os dois lerem "ainda não tem dono". Mesma técnica de
   `cliente_minuta_anexar` (`…273`) e de `sessao_agendar`.
6. Grava `link_em` e `link_definido_por` na mesma transação + evento
   `sessao_link_definido` com domínio de origem, domínio de destino e papel.
   🔴 **Só o domínio, nunca a URL inteira**: link de sala é credencial de
   acesso, e a trilha é lida por 16 admins.
7. **Validação:** o CHECK de https já existe na coluna. A RPC acrescenta teto
   de 500 caracteres e **recusa CR/LF** — o mesmo tratamento que
   `chamados_email_equipe` leva contra injeção de cabeçalho, porque o link
   entra em corpo de e-mail.

`gps.sessao_link_remover(uuid)` — mesma guarda, mesma precedência, zera os três campos.

**Custo declarado:** o parceiro que colou um link errado e teve a equipe
corrigindo **não consegue corrigir de volta**; ele vai ao Suporte. É o preço
de não ter corrida. A alternativa (último a escrever vence) é mais barata e
tem o modo de falha pior: **a sala muda debaixo de quem já entrou**, e nada no
sistema diz por quê.

---

### Fatia E — Card do aluno: DISC, link e os campos ricos na ficha
**Executor: `iromar` (Sr.)** · telas do aluno

**Por que Sr.:** estado compartilhado — o card lê de duas fontes (o
agendamento e o cliente) e escreve por duas actions distintas; e a ficha do
cliente é a tela mais usada do produto.

**Arquivos:**
- `src/components/sessoes/minha-sessao.tsx` — o card ganha o bloco DISC e o bloco link
- `src/components/sessoes/disc-do-cliente.tsx` (**novo**) — bloco de exibição reutilizável
- `src/components/clientes/cliente-ficha.tsx` — os 3 campos ricos, abaixo do Select de DISC que já existe
- `src/app/sessoes/page.tsx` — carrega os campos do DISC para o card
- `src/app/sessoes/link-actions.ts` (**novo**) — action do link pelo lado do aluno

🔴 **`src/app/sessoes/actions.ts` NÃO é tocado.** A action nova vive em
arquivo próprio, por duas razões: evitar que as fatias E e H disputem o mesmo
arquivo, e porque módulo com `"use server"` só exporta função async — arquivo
novo nasce limpo em vez de carregar o risco do antigo (15 arquivos do repo
ainda têm `export type` em módulo de servidor; é bomba armada, não teoria).

**Regras de tela:**
- **Denso e chapado.** Hierarquia por **posição**, não por card, ícone ou
  fonte grande. O `MinhaSessao` já é uma lista de linhas rotuladas — o DISC
  entra como mais linhas da mesma lista, não como card novo com sombra.
- 🔴 **DISC ausente não vira texto inventado.** Sem letra: "Perfil DISC ainda
  não informado" + link para a ficha do cliente. **Nunca** "Perfil D" por
  padrão, nunca um traço sozinho. **27 de 34 favoritos caem nesse caminho
  hoje** — é o estado mais comum, não a exceção.
- **Campo rico vazio some da tela**, não vira rótulo com valor em branco.
  Três rótulos vazios seguidos leem como defeito.
- O link aparece com o domínio visível e `rel="noopener noreferrer"`.
- ⚠️ **Esta fatia não toca `src/lib/nav.ts`** — a rota `/sessoes` já está
  roteada pela v1 (`nav.ts:101`).

---

### Fatia F — Card da doutora: DISC ao vivo, link, resumo
**Executor: `luis` (Jr.)** · telas do admin

**Por que Jr.:** são lista e formulário. As decisões duras (quem lê o quê,
DISC ao vivo contra congelado) já estão resolvidas nas fatias A–D, e o
briefing já exibe o DISC hoje (`briefing.tsx:101`).

**Arquivos:**
- `src/components/admin/sessoes/briefing.tsx` — bloco DISC ao vivo + aviso de divergência
- `src/components/admin/sessoes/lista.tsx` — concluir, resumo e link por linha
- `src/components/admin/sessoes/resumo-form.tsx` (**novo**)
- `src/app/admin/sessoes/page.tsx`
- `src/app/admin/sessoes/sessao-actions.ts` (**novo**) — concluir, resumo, link

🔴 **`src/app/admin/sessoes/actions.ts` NÃO é tocado** — mesma razão da fatia E.

🔴 **Acompanha a mudança de §2.2:** `gps.sessao_briefing_ler` passa a devolver
`disc_ao_vivo`. **A alteração dessa RPC é da fatia A** (é SQL), não desta —
`luis` recebe o contrato pronto e só consome.

**Regra de tela:** exibir `disc_ao_vivo`; se o congelado divergir, uma linha
diz "atualizado depois do agendamento". **Não mostrar os dois lado a lado** —
dois valores para a mesma pergunta é justamente o defeito que se quer evitar.

---

### Fatia G — A Entrevista Prévia feita pelo próprio aluno
**Executor: `victor` (Sr.)** · migration nova + camada de dados

**Por que Sr.:** **é fronteira de segurança** — a parte mais delicada do
pedido inteiro. Ver §6.1.

**Arquivos:**
- `supabase/migrations/20260923000297_gps_entrevista_do_parceiro.sql`
- `src/lib/data/entrevistas-do-parceiro.ts` (**novo**)
- `src/lib/entrevista-parceiro-tipos.ts` (**novo**)

🔴 **`gps.entrevista_gravar` NÃO é alterada.** Nem a guarda, nem a assinatura,
nem o corpo. Ver §6.1 — abrir a RPC da equipe ao aluno entrega a ele a escrita
em **qualquer** cliente do sistema.

`gps.entrevista_parceiro_gravar(...)`, com o mesmo payload da versão da equipe:

- **Guarda própria e incondicional, na ENTRADA do corpo, antes de qualquer
  select:** o cliente informado tem de pertencer ao ambiente do chamador
  (`aluno_id = gps.aluno_atual()`), envolta em `coalesce(..., false)`.

  🔴 Sendo SECURITY DEFINER, **a RLS de `etapa1_clientes` não se aplica dentro
  dela** — a guarda tem de ser explícita. Foi exatamente esse o achado ALTO
  que o pentester explorou e confirmou em 22/09 na `sessao_pode_agendar`,
  neste mesmo pacote: a versão anterior confiava numa guarda interna de outra
  função, que era **condicional** e **falhava aberta** sem JWT. Os dois tipos
  vazaram uuid de cliente de terceiro. A mesma armadilha está armada aqui.

- **A regra de negócio não é duplicada às cegas.** Recomendação: extrair o
  corpo comum para `gps.entrevista_gravar_interna(...)`, **sem grant nenhum**
  (`revoke all from public, anon, authenticated`), chamada pelas duas RPCs
  públicas, cada uma com a sua guarda. **Uma regra, dois perímetros.**
  É o padrão que `sessao_briefing_montar` já usa neste mesmo pacote
  (`…292:917`), e é o antídoto à lição de 08/09: regra duplicada em duas
  camadas fica meia-aplicada.

  ⚠️ Se o executor concluir que a extração é arriscada demais (a função da
  equipe está viva e a fila depende dela), a alternativa é duplicar — mas
  então **o custo tem de estar escrito no comentário das duas funções**: quem
  mudar a regra da entrevista tem de mudar as duas. Duplicação declarada é
  administrável; a implícita não é.

- 🔴 **O aluno só grava sobre o cliente FAVORITADO dele**, não sobre os 30.
  Pedido 7: "se já tem favorito, é o favorito automaticamente". Isto também
  fecha um oráculo: sem a restrição, o aluno usaria a RPC para descobrir quais
  dos clientes dele já têm entrevista registrada pela equipe.

- **Carimba `entrevista_por` com o usuário logado** — o mesmo campo que a
  equipe usa. A distinção "quem registrou" já existe na tabela; não precisa de
  coluna nova.

- ⚠️ **Não mexe em `selecionado_entrevista`.** Esse campo é a porta da fila da
  equipe (`gps.fila_de_ligacoes`); o aluno registrando a própria entrevista
  não pode injetar ninguém na fila de ligações da equipe. Ver §6.4.

**A camada TS:** leitura com **filtro e teto** (regra dura do projeto), lendo
só do ambiente do chamador.

🔴 **A TELA do aluno para a entrevista NÃO está nesta fatia e NÃO está neste
PRD.** É trabalho de front de tamanho próprio (formulário de 7 campos,
decisores dinâmicos, retomada), e o pedido 7 traz uma pergunta de produto
ainda aberta (§8 B2). Esta fatia entrega a **fronteira** e o **contrato**; a
tela entra no ciclo seguinte, com a medição M4 em mãos.

---

### Fatia H — O card do aluno mostra o desfecho
**Executor: `luis` (Jr.)** · componente isolado

**Arquivo:** `src/components/sessoes/desfecho-da-sessao.tsx` (**novo**),
montado pela fatia E dentro de `minha-sessao.tsx`.

🔴 **O aluno vê que a sessão foi concluída; NÃO vê o texto do resumo.**
Ver §4 P4.

🔴 **Roda DEPOIS da fatia E, nunca em paralelo** — as duas encostam no ponto
de montagem dentro de `minha-sessao.tsx`. Em paralelo, as duas ficam verdes e
o build quebra.

---

### Sequência

```
A (victor)  — migration: colunas + interruptor + DISC ao vivo na RPC de leitura
 └─ B (juan)      — allowlist e colunas no TS
    ├─ C (victor) — RPC concluir/resumo
    ├─ D (victor) — RPC do link            (C e D: mesmo agente, sequenciais)
    ├─ E (iromar) || F (luis)              ← paralelo real, uma mensagem
    ├─ G (victor) — fronteira da entrevista do parceiro
    └─ H (luis)   — desfecho no card       ← depois de E
       -> kirad (pentest do diff inteiro)
       -> joao   (veredito nos 5 critérios)
```

🔴 **`kirad` é obrigatório, não opcional.** A mudança toca RLS, guarda de
papel, dado pessoal de terceiro (resumo e campos DISC descrevem pessoas que
nunca ouviram falar do portal) e **abre um perímetro novo de escrita para o
aluno** (fatia G).

---

## 4. Premissas reversíveis — o que decidi no lugar de devolver a pergunta

| # | Decisão | Por quê | Como se reverte |
|---|---|---|---|
| **P1** | **O DISC NÃO trava a Reunião Preliminar** | 27 de 34 favoritos não têm DISC. Trava dura recusaria **79%** dos elegíveis, e a tela carregaria **sem erro nenhum** — o modo de falha mais caro que há. Repete exatamente o erro de 22/09: recomendei "favorito confirmado pela equipe", o Marcio aprovou, e o número medido depois era **0 alunos** | `gps.config.sessoes_exige_disc`, lida por `sessao_pode_agendar`. UPDATE de uma linha, sem migration e sem deploy. **A chave entra na fatia A, desligada**, para a reversão existir |
| **P2** | **A tela EMPURRA o DISC sem bloquear** | O pedido é "livre para preenchimento" e "visível". Aviso no card e na grade: "Este cliente ainda não tem perfil DISC — a doutora chega sem esse contexto", com link para a ficha | Apagar o aviso |
| **P3** | **A equipe vence o parceiro no link** | O Marcio disse que não define quem põe primeiro. Precedência resolve a corrida **sem exigir a decisão**: os dois põem, e quando há conflito manda quem conduz a reunião. Link é o acesso à sala, e a doutora é quem a abre | Trocar a condição na RPC por "último a escrever vence". Uma cláusula |
| **P4** | **O resumo é da EQUIPE; o aluno vê que houve resumo, não o texto** | O pedido 8 é "para **a gente** poder ter isso anotado" — a gente é a equipe. E é a regra que já governa o **Diário** (texto da equipe sobre o aluno, nunca visível a ele), pela mesma razão de LGPD: texto livre sobre reunião carrega dado de terceiro | Acrescentar o ambiente à guarda de leitura + o campo na tela |

⚠️ **P4 é a única assimétrica.** Abrir o resumo ao aluno depois é barato;
**fechar depois de ter mostrado não se desfaz.** Na dúvida, o default
conservador é o certo.

---

## 5. AS 5 PERGUNTAS

### 5.1 Escala — "e com 10x mais linha?"

| Leitura | Hoje | 10x | Cresce com |
|---|---|---|---|
| Card do aluno (`getSessoesDoAmbiente`) | até 2 linhas vivas por ambiente | até 2 | **nada** — `sessao_aluno_tipo_viva` garante 1 viva por tipo |
| 3 campos DISC na ficha | 1 cliente | 1 cliente | nada — leitura por PK |
| `sessao_briefing_ler` + DISC ao vivo | 1 agendamento + 1 cliente | idem | nada |
| Lista da doutora | ~8 linhas vivas | ~80 | **linhas vivas**, não a base |
| Sessões concluídas com resumo | 0 hoje | 4/semana/doutora | ~416/ano com 2 doutoras |

🔴 **O único crescimento real é `sessao_agendamentos` por acumulação
histórica:** 4 sessões/semana x 2 doutoras x 52 semanas = **~416 linhas/ano**;
em 10 anos, ~4.160 — exatamente o cenário que a v1 já mediu (§9b.1) e onde o
planner escolheu `Seq Scan` em 0,833 ms.

⚠️ **O texto novo muda o PESO DA LINHA, não a contagem.** `resumo` até 4.000
caracteres + 3 campos DISC até 2.000 cada = até **10 KB por linha** a mais que
hoje. Com o `briefing_snapshot` (~6 KB), a linha chega a ~16 KB. O Postgres
manda para TOAST acima de ~2 KB, então a leitura que **não pede** essas
colunas não paga — e é por isso que §5.4 exige coluna explícita.

🔴 **Trava dura para os executores:** `getSessoesDaResponsavel` e a lista da
doutora **não podem** declarar `resumo` na constante de colunas. Resumo se lê
**uma linha por vez**, ao abrir. Declarar na lista multiplicaria 4 KB por
linha exibida, e o egress do Supabase é teto **da organização**, dividido com
o `sip`.

---

### 5.2 Índice — "o planner VAI usar?"

🔴 **Não posso afirmar plano sem `explain analyze`, e não vou fabricar um.**
Em 18/09 previ `Index Scan` de cabeça e era `Seq Scan` (tabela de 4 linhas);
plano previsto de memória contamina a leitura seguinte.

**Minha hipótese, a ser confirmada: nenhum índice novo.** Três precedentes
medidos neste banco: `etapa1_clientes(fase)` (Seq 0,686 ms contra Index
0,809 ms em 1.222 linhas), `cs.estagios` (41 linhas) e a própria §9b.1 da v1
(Seq Scan em 4.160 linhas simuladas, 0,833 ms).

**As 3 medições que peço ao Marcio** — M1 e M2 depois da fatia A e antes da E;
M3 a qualquer momento:

```sql
-- M1 — a leitura mais quente: o card do aluno.
explain (analyze, buffers)
select id, tipo_id, responsavel_id, aluno_id, cliente_id, data, hora_inicio,
       inicio_em, fim_em, duracao_min, estado, link_reuniao
  from gps.sessao_agendamentos
 where aluno_id = '<um thb_alunos.id com sessão>'
   and estado in ('agendado', 'realizado')
 order by inicio_em
 limit 20;

-- M2 — a lista da doutora, a tela que mais cresce.
explain (analyze, buffers)
select id, tipo_id, aluno_id, cliente_id, data, hora_inicio, inicio_em,
       fim_em, duracao_min, estado, link_reuniao
  from gps.sessao_agendamentos
 where responsavel_id = '<uuid da Cristiane>'
   and inicio_em >= now() - interval '30 days'
 order by inicio_em
 limit 50;

-- M3 — o DISC ao vivo dentro do briefing (leitura por PK; deve ser trivial).
explain (analyze, buffers)
select perfil_disc, disc_consciencia, disc_gatilhos, disc_relacionamento
  from gps.etapa1_clientes where id = '<um cliente favoritado>';
```

🔴 **Se M1 ou M2 der `Seq Scan` com `Rows Removed by Filter` baixo, NÃO criar
índice** — criá-lo custaria escrita em todo agendamento sem mudar o plano.
**Se `Rows Removed by Filter` vier alto**, aí há caso, e o plano medido vai
colado na migration.

⚠️ **Medir a RPC, não o corpo dela.** Lição de 17/09: o select interno
isolado dava 0,66 ms e a RPC inteira (`Function Scan`) dava 2,7 ms. A tela
paga o segundo número.

---

### 5.3 Frequência — "quantas vezes por dia?"

| Caminho | Frequência |
|---|---|
| Card do aluno | 1x por abertura de `/sessoes`. Até 34 pessoas elegíveis hoje |
| Lista da doutora | 2 doutoras, algumas vezes por dia |
| Escrita do DISC rico | **raríssima** — uma vez por cliente, na vida |
| Escrita do link | 1x por sessão (4 a 8 por semana) |
| Escrita do resumo | 1x por sessão realizada |
| Entrevista do parceiro (fatia G) | desconhecida — depende de M4 (§5.6) |

🔴 **Nenhum cron novo. Nenhum job novo. Nenhuma tabela nova em Realtime.**

🔴 **O caminho de e-mail da `…293` NÃO é tocado.** Mexer em disparo que roda
por cron tem custo próprio e já cobrado: em 09/09, **11 de 20 e-mails foram
perdidos em silêncio** (a Resend limita 10 req/s; `net.http_post` é assíncrono
e o carimbo vinha antes do resultado) e **o cron reportou sucesso**. O link da
sala continua **fora do corpo do e-mail** — o e-mail leva data, hora, nome e o
link do portal, nunca a URL da sala.

### 5.4 Repetição — "N telas = N queries?"

**O risco concreto:** o DISC passa a ser lido em **3 lugares** — card do
aluno, card da doutora, ficha do cliente.

**Resolução: os três já carregam o cliente por outro motivo.**

| Tela | Hoje | Depois |
|---|---|---|
| Ficha do cliente | já lê `etapa1_clientes` | **0 query nova**, só colunas a mais |
| Card do aluno | já lê o cliente para mostrar o nome (`minha-sessao.tsx:42`) | **0 query nova**, só colunas a mais |
| Card da doutora | já vai ao cliente pela RPC do briefing | **0 query nova**, um campo a mais no jsonb |

🔴 **Saldo de queries da feature: ZERO.** É o critério de **otimização** do
`joao` — feature nova não pode deixar o sistema pior do que achou. Executor
que acrescentar uma query só para o DISC reprova.

⚠️ **E a feature ainda LIMPA uma coisa:** o `briefing_snapshot` deixa de ser a
fonte do DISC (§2.2), removendo uma mentira estrutural que hoje afetaria **27
de 34** clientes. Não é código a menos — é **uma afirmação falsa a menos**,
que é o que o critério de otimização de fato cobra.

**Toda leitura nova leva filtro e teto.** Sem exceção.

### 5.5 Reversão — "como desligo?"

| Peça | Desligamento | Precisa deploy? |
|---|---|---|
| Trava de DISC (P1) | `gps.config.sessoes_exige_disc` | **não** |
| 3 campos DISC | tirar das 2 allowlists | sim (TS) |
| RPC do link | `revoke execute` | **não** |
| RPC de concluir/resumo | `revoke execute` | **não** |
| Entrevista do parceiro (G) | `revoke execute` | **não** |
| Colunas novas | `drop column if exists` (no cabeçalho de cada migration) | **não** |
| DISC ao vivo no briefing | apagar o bloco da RPC de leitura | **não** |

🔴 **`revoke execute` é o botão de pânico real** — derruba a escrita sem
deploy e sem tocar em dado.

⚠️ **Defeito conhecido do sistema, declarado e não resolvido aqui:** os 4
interruptores existentes do GPS (`videos_ativo`, `convite_socio_ativo`,
`troca_email_login_ativa`, `tutoriais_ativo`) **só se ligam por SQL** — são
botões de pânico inacessíveis no pânico. `sessoes_exige_disc` nasce com o
mesmo defeito, e **a fatia A não o corrige de propósito**: mexer em
`gps.config_definir` e em `INTERRUPTORES_CONFIG` é escopo próprio, e
acrescentar só de um lado produz interruptor que a tela oferece e a RPC
recusa.

---

### 5.6 ✅ MEDIDO em 22/09 — M4 e M5 respondidas

| # | Resultado | Consequência |
|---|---|---|
| **M4** | 🔴 **`entrevista_em` = 0 e `entrevista_resultado` = 0 nos 34 favoritos.** A equipe **NUNCA** entrevistou nenhum. Os 34 estão `selecionado_entrevista = true`, esperando. | **O risco §6.4 NÃO se materializa.** "O aluno faz a entrevista" não é segundo registro sobre o mesmo fato — é o primeiro. **A fatia G continua válida.** |
| **M5** | **0 sessões agendadas** (o teste de ponta a ponta foi limpo). | Toda coluna nova nasce sem backfill. O card do DISC é visto por 0 pessoas hoje — mas por até 34 assim que a tela publicar. |
| **BÔNUS** | 🔴 **Os 127 DISC do sistema vieram da FICHA, não da entrevista** — `entrevista_em` é nulo nos 127. | **O parceiro JÁ preenche DISC hoje**, direto em `cliente-ficha.tsx`. Confirma **P1** (não travar) com folga, e mostra que a fatia E amplia um caminho que já existe e já é usado, em vez de criar um. |

**As 3 medições de plano (M1/M2/M3) seguem pendentes** — eu as rodo quando a
fatia A aplicar, porque dependem das colunas novas existirem.

---

### 5.6-bis (histórico) — o que o arquiteto pediu para medir

| # | Pergunta | Por que importa |
|---|---|---|
| **M4** | Quantos dos 34 favoritos já têm `entrevista_em` preenchida? | 🔴 **A mais importante.** Se for alto, a equipe já entrevistou, e "o aluno faz a entrevista" não é feature nova — é **segundo registro sobre o mesmo fato**. Muda a pergunta de produto do §8 B2 |
| **M5** | Quantos ambientes têm sessão agendada hoje? | Define se o card do DISC é visto por 2 pessoas ou por 30 — e portanto se a fatia E merece Sr. |

```sql
-- M4
select count(*) filter (where entrevista_em is not null) as com_entrevista,
       count(*) filter (where perfil_disc  is not null)  as com_disc,
       count(*)                                          as favoritos
  from gps.etapa1_clientes
 where acompanhado_equipe;

-- M5
select count(distinct aluno_id) as ambientes_com_sessao,
       count(*)                 as sessoes_vivas
  from gps.sessao_agendamentos
 where estado = 'agendado';
```

---

## 6. CONFLITO — onde a regra nova briga com o que existe

### 6.1 ✅ O conflito #1 do Marcio está DESARMADO — o aluno já escreve o DISC

**Julgamento: o conflito, como enunciado, não existe.**

Medido no repo (§2.1): `perfil_disc` está na allowlist de runtime de
`PatchCliente` (`actions.ts:84`), o campo está na ficha com Select de D/I/S/C
(`cliente-ficha.tsx:723`), e `clientes_owner_update` + `grant update` já
permitem. **O parceiro escreve o DISC do cliente dele desde 07/2026.** Os
campos ricos entram pela mesma porta, com a mesma policy.

🔴 **O que continua verdadeiro do alerta:** abrir `gps.entrevista_gravar` ao
aluno **seria** fronteira de segurança — mas por outra razão, e para outra
feature. A RPC é SECURITY DEFINER e recebe `p_cliente_id` do chamador: sem
`gps.eh_equipe()`, o aluno escreveria `entrevista_resultado` e `perfil_disc`
de **qualquer cliente do sistema**, inclusive dos ~1.700 que não são dele.

**Isto não é hipótese.** É o achado ALTO que o pentester explorou e confirmou
em 22/09 na `sessao_pode_agendar` (`…292:224-252`), neste mesmo pacote, por
engano de forma idêntica — dois caminhos vazaram uuid de cliente de terceiro.

**Resolução:** a RPC da equipe **não é tocada** (fatia G). O aluno ganha RPC
própria, com guarda própria e incondicional na entrada, limitada ao favorito
do ambiente dele.

### 6.2 ✅ "DISC livre" contra 27 de 34 sem DISC — resolvido por P1/P2

**Julgamento: trava dura está fora de cogitação, e não por opinião.**

Em 22/09 recomendei "favorito confirmado pela equipe" como filtro de
elegibilidade e o Marcio aprovou. Medido **depois**: dava **0 alunos** — a
coluna `acompanhamento_confirmado_em` nunca foi preenchida. A tela teria
recusado 100% e carregado sem erro nenhum.

Exigir DISC hoje recusaria **79%** (27 de 34). A regra de 22/09 vale sem
adaptação: **filtro de elegibilidade tem de ser CONTADO antes de escolhido.**

**Resolução:** P1 (interruptor nascendo desligado) + P2 (a tela empurra).

⚠️ **A segunda parte do conflito, que o Marcio identificou certo:** "o DISC
hoje é uma LETRA". Os campos ricos não existem — a fatia A os cria. Mas isso
significa que, no dia do deploy, **34 de 34 favoritos** estarão sem os campos
ricos. A tela tem de nascer falando com esse estado, não com o estado ideal.
É a mesma classe do defeito "a feature existe, a porta de entrada some
sozinha": aba do Inventário, onboarding com 77 preenchidos, GPS Tutoriais
vazia — 3 casos registrados.

### 6.3 ✅ Link sem dono — resolvido por precedência (P3), com custo declarado

**Julgamento: a corrida é real e silenciosa.** Dois UPDATE no mesmo campo não
geram conflito no git, não geram erro no banco, e **o perdedor não sabe que
perdeu** — descobre quando a sala não abre.

**Resolução:** fatia D. Custo declarado ali.

### 6.4 🔴 CONFLITO NOVO — a entrevista tem DOIS registradores e UMA coluna

**Não estava na lista do Marcio.**

`gps.etapa1_clientes` tem `entrevista_resultado`, `entrevista_em`,
`entrevista_por`, `entrevista_observacoes`, `entrevista_encerrada`,
`entrevista_motivo_encerramento`, `entrevista_remarcacoes`,
`entrevista_tentativas_sem_contato` — **campos únicos por cliente**.

Se o aluno passa a registrar entrevista **e** a equipe continua registrando,
os dois escrevem nos **mesmos campos**. Pior: a fila da equipe
(`gps.fila_de_ligacoes`) lê `entrevista_encerrada` e
`entrevista_tentativas_sem_contato` para decidir quem ainda precisa de
ligação. Se o aluno gravar "interessado", o cliente **sai da fila da equipe**
sem que ninguém da equipe tenha ligado.

**Isto não é bug de implementação; é pergunta de produto.** → §8 B2.

**O que a fatia G faz enquanto isso não se decide:** grava em
`gps.entrevista_tentativas` e nos campos do cliente com `entrevista_por` do
aluno, **mas NÃO toca `selecionado_entrevista`** — a porta da fila da equipe.
É o recorte mais conservador que ainda entrega o pedido 7.

### 6.5 🔴 CONFLITO NOVO — concluir libera o índice de sessão viva

`sessao_aluno_tipo_viva` é parcial em estado agendado (`…291:358`). Ao
concluir, a sessão sai do índice e o ambiente pode marcar outra do mesmo tipo.

**Isso é correto e intencional** (é assim que se remarca depois de cancelar),
mas cria caminho novo: com 4 slots por semana para 34 elegíveis, um ambiente
poderia marcar Entrevista após Entrevista sem limite.

**Resolução desta v2: nenhuma, e é decisão consciente.** Quem conclui é a
doutora (fatia C), então quem libera o slot é a própria equipe. Fica
**registrado** para o dia em que a fila apertar. Travar hoje seria resolver
problema que a medição não mostrou.

### 6.6 ⚠️ CONFLITO NOVO — o snapshot já está errado nos agendamentos existentes

Se já houver agendamento criado (M5 responde), o `briefing_snapshot` dele
carrega o `perfil_disc` do momento do agendamento — possivelmente nulo.

**Resolução:** §2.2 — o DISC passa a ser lido ao vivo, então os snapshots
existentes ficam corretos **por construção**, sem backfill.
🔴 **Nenhuma migration reescreve snapshot.** Reescrever briefing congelado
apagaria justamente o que ele existe para preservar.

### 6.7 ⚠️ Fricção de arquivo — declarada

| Arquivo | Quem toca | Tratamento |
|---|---|---|
| `src/components/sessoes/minha-sessao.tsx` | **E (iromar)** cria o ponto de montagem; **H (luis)** o consome | 🔴 **H roda DEPOIS de E, nunca em paralelo.** Juntas, as duas ficam verdes e o build quebra — e commitar o arquivo inteiro publica o trabalho não revisado do outro |
| `src/app/clientes/actions.ts` | **B (juan)** apenas | E não toca; a ficha consome o tipo, não a action |
| `src/lib/nav.ts` | **ninguém** | já roteado pela v1 |
| `src/app/sessoes/actions.ts` e `src/app/admin/sessoes/actions.ts` | **ninguém** | as actions novas vivem em arquivos novos, de propósito |

**Separar lendo o diff, nunca a lista de nomes.**

---

## 7. O que NÃO se toca (o pedido 9: harmonia)

🔴 Lista fechada. Executor que encostar em qualquer item reprova em
**solidificação**, sem discussão:

- `gps.reuniao_*` e `gps.agenda` — órfãs e **proibidas**. A decisão de 10/08
  foi revogada **só** para `gps.sessao_*`; e a feature já foi reconstruída por
  engano uma vez (05/08)
- `gps.plantao_*` — outro produto, outro público
- `gps.entrevista_gravar`, `/admin/fila`, `gps.fila_de_ligacoes`,
  `src/components/admin/fila/registrar-entrevista.tsx`,
  `src/lib/entrevista-tipos.ts`, `src/lib/data/entrevistas.ts`,
  `src/app/admin/entrevista-actions.ts`
- `gps.sessao_horarios_livres`, `sessao_agendar`, `sessao_cancelar`,
  `sessao_marcar_falta`, `sessao_pode_agendar` — a v1 funciona; esta v2
  **acrescenta**, não reescreve
- `gps.sessao_disparar_emails` e o cron — §5.3
- `briefing_snapshot` de linhas existentes
- **A duração** — vive só em `gps.sessao_tipos.duracao_min`. Nenhum literal em
  lugar nenhum do repo
- `public.gp_is_admin()` — lida por policies de **50 tabelas em 3 schemas**
- `gps.eh_equipe()` — a guarda da esteira. Se ela mudar, **buscar os
  chamadores em TypeScript é parte DA MESMA migração**: foi a falta dessa
  varredura em 15/09 que deixou o operador puro recusado na action enquanto o
  banco já o aceitava

**E a regra que vale para toda guarda nova, sem exceção:** envolver em
`coalesce(..., false)`. **Nulo em guarda LIBERA.** Custou um vazamento em
22/09, neste mesmo pacote.

---

## 8. BLOQUEIO — o que só o Marcio decide

### B1 — 🟡 Resolvido por premissa; ele pode reverter com o custo à vista

P1 a P4 (§4) são premissas declaradas, cada uma com caminho de reversão
escrito. **Nenhuma devolve pergunta crua.** Se ele discordar de alguma, o
preço está na coluna "Como se reverte".

⚠️ **P4 é assimétrica** — abrir depois é barato, fechar depois não se desfaz.

### B2 — 🔴 BLOQUEIO REAL: quando aluno e equipe registram a mesma entrevista, quem manda?

**Não é decisão de arquitetura.** §6.4.

Hoje `entrevista_resultado` é **um valor por cliente**, e a fila da equipe lê
dele para decidir quem ainda precisa de ligação.

**Recomendação, para ele aprovar ou recusar:**

> A entrevista do aluno e a da equipe são **o mesmo fato registrado por quem
> estava lá**. Vale o **último registro**, e a tela sempre mostra **quem
> registrou** (`entrevista_por`, que já existe). O que **não** muda é a fila
> da equipe: o registro do aluno não tira ninguém dela
> (`selecionado_entrevista` intocado).

**Se ele recusar**, a alternativa é separar os campos (coluna própria para o
registro do parceiro) — e aí a fatia G cresce, o `gps.dossie_do_cliente`
precisa exibir os dois, e `gps.sessao_briefing_montar` também. É feature
maior, não ajuste.

🔴 **Medir M4 (§5.6) antes de levar a pergunta.** Se ninguém registrou
entrevista ainda, a decisão é barata hoje e cara em três meses.

### B3 — 🟡 Dado, não código

A Dra. Elaine continua sem disponibilidade declarada (D8 da v1). Com 34
elegíveis e 4 slots por semana, **a fila é estrutural**. Entra por INSERT, sem
deploy — e a v1 já faz a tela dizer a verdade quando não há horário
(`sem-horario.tsx`).

---

## 9. Riscos

| Risco | Grau | Mitigação |
|---|---|---|
| Trava de DISC recusando 79% dos elegíveis | 🔴 | P1: nasce desligada. **Precedente idêntico em 22/09 deu 0 alunos** |
| Aluno escrevendo em cliente de terceiro (fatia G) | 🔴 | Guarda própria, incondicional, na entrada do corpo, com `coalesce(...,false)`. Pentest obrigatório. **O mesmo erro foi explorado em 22/09 neste pacote** |
| Registro duplo de entrevista bagunçando a fila da equipe | 🔴 | B2 + `selecionado_entrevista` intocado |
| DISC congelado mentindo na tela da doutora | 🟠 | §2.2 — leitura ao vivo, sem backfill |
| Corrida no link | 🟠 | P3 + `for update` + trilha com quem escreveu |
| Resumo (4 KB) entrando numa lista | 🟠 | Proibido declarar `resumo` em constante de lista; `joao` confere |
| URL da sala vazando em trilha ou e-mail | 🟠 | Só o domínio no evento; e-mail nunca leva a URL da sala |
| H e E no mesmo arquivo | 🟠 | Sequencial, declarado em §6.7 |
| Interruptor sem tela | 🟡 | Declarado em §5.5 — defeito conhecido do sistema, não introduzido aqui |
| 34 de 34 favoritos sem campos ricos no dia 1 | 🟡 | P2 + regra de tela: campo vazio **some**, não vira rótulo em branco |
| Migration numerada por cima de outra | 🟡 | `ls supabase/migrations \| tail` antes de numerar (fatia A) |

---

## 10. Fontes

- `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md` — a v1
- `supabase/migrations/20260922000291_gps_sessao_estrutura.sql` — 5 tabelas; `:303` CHECK de estado; `:315` CHECK do link; `:349-361` os 2 índices únicos; `:545` grant por coluna
- `supabase/migrations/20260922000292_gps_sessao_rpcs.sql` — 8 RPCs; `:205-270` a guarda de `sessao_pode_agendar` (o achado ALTO explorado); `:917` peça interna sem grant; `:1018` congelamento do snapshot
- `supabase/migrations/20260922000293_gps_sessao_emails.sql` — e-mail por cron
- `supabase/migrations/20260915000264_gps_operadores_e_dossie.sql:222` — `gps.eh_equipe()`
- `supabase/migrations/20260916000268_gps_teto_remarcacoes.sql:165` — `entrevista_gravar` vigente
- `supabase/migrations/00000000000000_gps_baseline.sql:375,387` — `clientes_owner_update` + grant de UPDATE
- `src/app/clientes/actions.ts:59,84` — `perfil_disc` no `Pick` e na allowlist de runtime
- `src/components/clientes/cliente-ficha.tsx:723` — o campo DISC na ficha
- `src/components/admin/sessoes/briefing.tsx:101` — DISC já exibido no briefing
- `src/components/sessoes/minha-sessao.tsx:42` — o card já carrega o nome do cliente
- `src/lib/nav.ts:101,340` — `/sessoes` e `/admin/sessoes` já roteadas
- Contagens do Marcio, medidas no banco em 23/09: 127 clientes com DISC · 34 favoritos, 7 com DISC · `entrevista_tentativas` e `cliente_decisores` com 0 linhas · Etapa 02 liberada, 34 elegíveis nos dois tipos
