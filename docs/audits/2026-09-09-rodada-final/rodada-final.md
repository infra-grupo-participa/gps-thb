# Rodada final de qualidade — GPS (arquiteto, 09/09/2026)

Commit analisado: `75b7138`. Método: leitura do `CLAUDE.md` inteiro, `PLANO-9-FEATURES.md`,
`docs/audits/2026-09-09-polimento/{polimento.md,fases-5-6-7.md}`, depois **caminhada pelo produto
na ordem do usuário** (aluno → sócio → admin), lendo página, componente e action de cada fluxo.
Medições próprias: `npm run build` (exit 0) + `next start` em `:3991` com o método da seção A do
`polimento.md` (soma gzip dos `<script>` que o HTML pede). O inventário do orquestrador
(`tmp/squad/inventario-qualidade.md`) foi usado como fonte para tamanho de arquivo, knip e
duplicação — não remedi o que já estava medido.

> **Nada de código de produção foi escrito. Nenhum comando tocou o banco.**

---

## A) Veredito por feature

| # | Feature / fluxo | O que promete ao usuário | Cumpre? | Encaixa na proposta? | Maiores problemas | Esforço |
|---|---|---|---|---|---|---|
| 1 | **Login / cadastro / esqueci / redefinir** | entrar, e recuperar o acesso sozinho | **Parcial** | sim | "Esqueci minha senha" depende do **SMTP embutido do Supabase** (baixa entrega, limite/hora) — o portal promete um e-mail que a Resend não manda (PL13). `/esqueci-senha` carrega o SDK do Supabase no browser (+64 KB gzip) para 1 chamada (PF1) | M |
| 2 | **Home do aluno** (continue de onde parou · favorito · meta · caminho · resumo) | "onde eu estou e o que faço agora" | **Parcial** | sim | "Continue de onde parou" aponta para tarefa **travada** (PL2) — beco sem saída. KPI "Clientes 30/30" convive com passo travado por `comDados` (PL3) | P |
| 3 | **Etapa 01** (guia, travas de favorito e de copy) | roteiro sequencial da planilha oficial | **Sim** | sim, é o coração do produto | Tarefa bloqueada usa `opacity-60` no bloco inteiro — a regra do polimento (estado por FORMA, nunca opacidade) não chegou aqui (UX3). B10 continua: a trava fecha a copy para 58 de 63 ambientes | P |
| 4 | **Clientes** (lista/quadro/ficha, fase, honorários, contrato, WhatsApp, DISC, perda) | CRM do aluno, com comprovação de faturamento | **Sim** | sim | **Excluir cliente sem confirmação e sem rastro** (PL9). Desfavoritar re-trava 5 passos em silêncio (PL11). "Abrir contrato **no Drive**" mente para link que não é do Drive (UX2). Salvamento misto: estrela grava na hora, resto exige botão, sem aviso de alteração não salva (UX4) | P–M |
| 5 | **Financeiro** (B7) | "quanto é, quanto paguei, quanto falta" | **Quase** | sim (só leitura do `sip`) | Saldo negativo **acima** da tolerância sem `quitado_em` vira "Quitado, R$ 0,00" **sem divergência para o admin** (FN1). Sócio leva `redirect("/")` mudo (FN2) | P |
| 6 | **Suporte por chamados** (B5/B6) | "fale com a equipe por aqui" | **Parcial — o canal é cego** | sim | `chamados_email_equipe` vazio **e** nenhum badge/contador em `/admin`: chamado novo não avisa ninguém e não aparece no painel, apesar de `chamadosAbertos` já vir na RPC (PL5). O aviso "ninguém recebe e-mail" ignora o fallback `EMAIL_SUPORTE` e pode mentir (PL6) | P |
| 7 | **Materiais** | acervo de aulas e modelos | **Cumpre demais** | **contradiz** a liberação por etapa | 10 links de aulas/modelos das etapas **2, 3 e 4 (bloqueadas)** abrem para qualquer aluno, ao lado do badge "bloqueada" (PL1) | P (depois da decisão) |
| 8 | **Pasta (Drive)** | "seus documentos, organizados" | **Sim** | sim (documento fora do GPS) | Cabeçalho promete o que o estado vazio nega; empty state fora do design system; o componente do aluno carrega o formulário de admin (UX6/PF4) | P |
| 9 | **Perfil / trocar senha** | trocar a senha pelo portal | **Sim** | sim | Carrega o SDK no browser (PF1). Sem gap de lógica | P |
| 10 | **Etapas 2–6 bloqueadas** | "libera conforme sua turma avança" | **Sim** | sim | Microcopy honesta e verificada. Único furo é o vazamento pelo acervo (PL1) | — |
| 11 | **Sócio** | mesmo ambiente, sem o contrato do titular | **Parcial** | sim (B7-b) | Sem caminho de senha para o sócio: o diagnóstico mostra "sem senha / nunca entrou" e não há botão nenhum (PL8). Redirect mudo no `/financeiro` (FN2) | M |
| 12 | **Painel `/admin`** (KPIs, lista, filtros, nota rápida, mostrar mais, criar acesso, cadastro manual) | "onde cada aluno está e quem precisa de mim" | **Quase** | sim | Chamado aberto invisível (PL5). Recusa de solicitação sem motivo, embora a action aceite `observacao` e a tela do aluno já o renderize (PL4) | P |
| 13 | **Modo assistência** (banner, prévia, abas espelhadas) | "entro no ambiente para destravar" | **Sim** | sim, é a definição de "assistida" | Prévia mostra a aba Financeiro mesmo em ambiente com sócio (UX8). Texto "GPS" vaza num toast (UX1) | P |
| 14 | **Diário (Fase 1+2)** | linha do tempo da equipe sobre o aluno, só-admin | **Sim** | sim (LGPD) | Nada a corrigir. É o fluxo mais bem construído do repo: janela vale para as 3 fontes, pendência sem teto, marcos fora do filtro, rodapé honesto sobre backfill | — |
| 15 | **`/admin/chamados`** (fila, config, retenção) | operar o suporte sem deploy | **Sim** | sim | Interruptor que fecha o canal para todos alterna sem confirmação (PL12) | P |
| 16 | **`/admin/plantao`** (calendário, alunos, mentoras, interruptor, cancelar, série) | operar o Plantão do **Acelera** sem dev | **Quase** | sim — e a fronteira com o GPS está bem marcada | Novo slot nasce com **60 min** contra a decisão dos **120** (PL7). `gps.plantao_config` × `gps.config`: duas tabelas para o mesmo padrão (CD9) | P |
| 17 | **E-mails** | credenciais, acesso liberado, chamado respondido, plantão | **Parcial** | sim | O único e-mail para a equipe (chamado novo) hoje **não tem destinatário**. Fechar chamado não avisa ninguém (aceitável). Falha de envio nunca aparece na tela (herdado, documentado) | P |

**Leitura geral.** O sistema está bem acima da média em honestidade de dado — `null` não vira zero,
prévia não vira sandbox, log não finge cobertura. Os defeitos que restam são de **três famílias**:
(1) *a tela sabe mais do que mostra* (chamado aberto, motivo da recusa, divergência de saldo);
(2) *ação destrutiva sem atrito* (excluir cliente, remover sócio, desfavoritar, fechar suporte);
(3) *repetição que já cobrou preço* (9 formatadores, 2 tabelas de config, 4 RPCs sem DDL, 64 KB de
SDK em toda página).

---

## B) Achados

### B.1 Produto e lógica

**PL1 — O acervo abre o que a etapa tranca.**
`src/components/materiais/materiais-view.tsx:166-176` renderiza "Assistir"/"Abrir modelo" com o
`m.url` **de todas as etapas**, inclusive as bloqueadas; só o link *para a etapa* é gateado
(`:110`) e o badge diz "bloqueada" (`:98`). Medido: **10 materiais** de etapas bloqueadas hoje
(`etapa2.ts` 5, `etapa3.ts` 3, `etapa4.ts` 2). Um aluno na Etapa 01 assiste hoje a aula da Reunião
Preliminar e baixa o modelo do Croqui.
*Contradiz* a regra registrada ("liberação controlada por `gps.etapas.liberada`, uma por dia").
**Correção:** decisão do Marcio (ver BLOQUEIO 1). Os dois caminhos são baratos:
(a) gatear o `<a>` quando `!liberada` (trocar por texto "libera com a Etapa 0N"), ou
(b) manter aberto e trocar o badge por "material adiantado — a etapa abre depois".
**Esforço P · risco baixo (a) / nenhum (b).**

**PL2 — "Continue de onde parou" leva a uma tarefa travada.**
`src/lib/etapas.ts:84` escolhe a primeira tarefa não concluída **sem olhar `exigeFavorito` nem
`exigeTarefa`**. Cenário real: aluno com 1.1/1.2/2/3 feitos e **sem favorito** recebe no topo da
home "4. Ligar e oferecer duas opções de agenda" → clica → cai na Etapa 01 com a tarefa cinza e o
checkbox desabilitado. O card é o elemento mais proeminente da home.
**Correção:** `proximoPasso(etapas, clientes, progresso, { temFavorito })` pula tarefa bloqueada e,
quando **todas** as pendentes estão travadas, devolve a tarefa com `bloqueio: "escolha o cliente da
equipe"` para o card virar CTA de destravamento em vez de link morto. `temFavorito` já está em mãos
nas duas páginas (`getClienteEquipe`). Arquivos: `src/lib/etapas.ts:58-97`, `src/app/page.tsx:121`,
`src/app/admin/aluno/[alunoId]/page.tsx:49`, `src/components/etapa/proximo-passo-card.tsx`.
**Esforço P · risco baixo.**

**PL3 — "Clientes listados 30/30" com o passo 2 travado.**
`calcularMetricasEtapa1` distingue `preenchidos` (tem nome) de `comDados` (nome + telefone +
nível), e a tarefa 1 exige **os dois** (`etapa1.ts:259`). Mas o KPI mostra `preenchidos`
(`etapa1-guide.tsx:133`, `home-resumo.tsx:60`, `alunos-ativos-lista.tsx:698`), enquanto a trava da
copy mostra "Faltam N cliente(s) com nome, telefone e nível" (`etapa1-guide.tsx:227`). O aluno lê
30/30 e um cadeado ao mesmo tempo. Com a B10 fechando a copy para 58 de 63 ambientes, essa é a tela
que 92% dos alunos vê.
**Correção:** KPI passa a mostrar `comDados`/30 com detalhe `"{preenchidos} listados · {comDados}
com os dados essenciais"`. Um número, uma verdade. **Esforço P · risco nenhum.**

**PL4 — Recusar solicitação sem dizer por quê, com o campo pronto no banco.**
`recusarSolicitacao(solicitacaoId, observacao?)` (`src/app/admin/actions.ts:328-330`) grava
`observacao`; `src/app/page.tsx:65` **já renderiza** "Observação: …" para o recusado. A UI
(`solicitacao-card.tsx:63-71`) nunca passa o segundo argumento. Resultado: a pessoa vê "Sua
solicitação não foi aprovada" e nada mais — e a tela também não oferece canal de contato (UX7).
**Correção (front, contrato já publicado):** campo "Motivo (o aluno vê)" + confirmação antes de
recusar. **Esforço P · risco nenhum.**

**PL5 — Chamado aberto é invisível no painel, e o dado já está na tela.**
`getAtendimentoPorAluno()` devolve `chamadosAbertos` por ambiente (`src/lib/data.ts:800`) e
`/admin` já a consome (`admin/page.tsx:69`) — mas: (a) o card do aluno mostra pendências do Diário
e **não** mostra chamado (`alunos-ativos-lista.tsx`, bloco de badges ~`:597-616`); (b)
`adminNavItems()` é chamado **sem** `chamadosAbertos` em `admin/page.tsx:102`, então a aba
"Chamados" não tem contador fora da própria página de chamados. Somado ao
`chamados_email_equipe` vazio, **um chamado novo hoje não avisa ninguém e não aparece em lugar
nenhum** até alguém abrir `/admin/chamados` por hábito.
**Correção:** badge no card (mesmo padrão do de pendências) + filtro "com chamado aberto" +
`adminNavItems({ chamadosAbertos: soma })` a partir do Map já carregado — **zero consulta nova**.
**Esforço P · risco nenhum.**

**PL6 — O aviso "ninguém recebe e-mail" pode ser falso.**
`getChamadosConfig()` (`src/lib/chamados-data.ts:283-316`) lê só `gps.config`; a UI decide
`semDestinatario = emailEquipe.length === 0` (`chamados-config.tsx:48`) e crava em vermelho
"Ninguém recebe e-mail quando um aluno abre chamado". Mas `avisarEquipe`
(`src/app/chamados/actions.ts:360`) cai em `process.env.EMAIL_SUPORTE`. Se o João definir a env na
Hostinger, a tela continuará gritando o contrário.
**Correção:** `getChamadosConfig` devolve `fallbackEnv: Boolean(process.env.EMAIL_SUPORTE)`; com
lista vazia **e** env presente, o aviso vira informativo ("a lista está vazia; o aviso vai para o
endereço configurado no servidor"). **Esforço P · risco nenhum.**

**PL7 — Plantão nasce com 60 minutos contra a decisão dos 120.**
`plantao-calendario.tsx:980` (`useState(String(slot?.duracaoMin ?? 60))`) e `:1004`
(`Number(duracaoMin) || 60`). A migração `…041` inseriu a Semana 1 com **120** e o comentário dela
diz literalmente "duração fixa de 2 horas"; a coluna ainda tem `default 60`
(`20260901000001:47`). Todo slot criado pela tela desde 08/09 nasce com metade da duração — e a
duração entra na conta de `revelar_link`, presença e NPS.
**Correção:** default do formulário 120 + fallback 120; opcionalmente `alter column duracao_min set
default 120` em migration própria. **Verificar no banco antes de fechar: quantos slots publicados
depois de 08/09 estão com 60.** **Esforço P · risco baixo.**

**PL8 — O sócio não tem caminho de senha.**
`GerenciarAcesso` diagnostica cada membro ("tem senha / nunca entrou",
`gerenciar-acesso.tsx:346-360`) mas o único remédio é "Nova senha **do titular**" (`:224`) —
`definirSenhaAluno(alunoId)` resolve o usuário pelo `admin_user_do_aluno` do ambiente. Para os 13
sócios reais, o admin vê o problema e não tem botão. A saída existente é remover e re-adicionar o
sócio (que apaga o login e o histórico dele).
**Correção:** RPC nova `gps.admin_definir_senha_membro(p_membro_id, p_senha)` com as mesmas guardas
(`gp_is_admin`, `admin_alvo_e_equipe`, log em `acessos_log`) + botão por linha. **É feature, não
polimento — ver BLOQUEIO 3.** **Esforço M · risco médio (mexe em `auth.users`).**

**PL9 — Excluir cliente: um clique, sem confirmação, sem rastro.**
`clientes-manager.tsx:413` (tabela) e `:663` (card mobile) chamam `excluir(id)` direto;
`removerCliente` (`src/app/etapa-1/actions.ts:234`) faz `DELETE`. Vão junto nome, telefone, perda
pela inércia, registro do contato, honorários e link do contrato. O botão fica **encostado em
"Abrir ficha"**. A regra da casa é "linha antiga vira `ativo=false`, não `delete`".
**Correção mínima (P):** `Dialog` de confirmação com o nome do cliente, no padrão do "Fechar
chamado". **Correção completa (M, decisão):** `arquivado_em` + filtro — ver BLOQUEIO 4.
**Risco: baixo (P) / médio (M).**

**PL10 — Remover sócio apaga o login sem confirmação.**
`gerenciar-acesso.tsx:152-159` → `excluirMembroAluno` → `gps.admin_excluir_membro`. Ao lado, no
mesmo diálogo, excluir o **ambiente** exige digitar `EXCLUIR`. Duas ações irreversíveis, dois
níveis de atrito opostos.
**Correção:** confirmação nomeada ("Remover {e-mail} do ambiente? O login dele é apagado."). **P.**

**PL11 — Desfavoritar re-trava 5 passos em silêncio.**
`toggleEquipe` (`clientes-manager.tsx:154-174`) só emite toast **ao ativar**; ao desativar, some o
banner verde, somem os passos 4–8 da Etapa 01 e nada é dito. A estrela fica a 8 px do nome do
cliente na tabela.
**Correção:** confirmar ao **desmarcar** ("Isso volta a travar os passos 4 a 8 da Etapa 01") e toast
no desfazer. **P.**

**PL12 — "Fechar entrada" do suporte alterna sem confirmação.**
`chamados-config.tsx:50`: um clique fecha a abertura **e a resposta** do aluno em todo o portal.
**Correção:** confirmação com a consequência escrita. **P.**

**PL13 — "Esqueci minha senha" depende do SMTP embutido do Supabase.**
`esqueci-form.tsx:21` usa `supabase.auth.resetPasswordForEmail`. O `CLAUDE.md` registra que esse
caminho é o **SMTP embutido** (baixa entrega, limite por hora) e foi exatamente o que prendeu o
`gugabatera@gmail.com` fora do portal em julho. O portal promete um e-mail que pode não chegar.
**Correção:** configurar SMTP customizado (Resend) no Supabase Auth — **painel, não código**; é
pendência do João. Enquanto isso, a tela de sucesso deve dizer "se não chegar em alguns minutos,
fale com a equipe" com canal. **P (copy) + config.**

**PL14 — Aprovar solicitação pode virar sócio em titular.**
`aprovarSolicitacao` (`admin/actions.ts:291-297`) faz `upsert(... papel:"titular", { onConflict:
"user_id" })`. Se a pessoa já for **sócio** de outro ambiente, a aprovação a move para o novo
ambiente **como titular**, em silêncio. Improvável, mas o dado (13 sócios) existe.
**Correção:** ler `gps.membros` antes e recusar com frase clara quando já houver vínculo.
**P · risco baixo.**

### B.2 UX e copy

**UX1 — "GPS" aparece para o usuário.** `gerenciar-acesso.tsx:148`: toast "Ambiente do GPS excluído
(não havia login)." Viola a decisão de marca de 09/07 ("GPS não aparece mais para o usuário"). É a
**única** ocorrência no repo (medido). **Correção:** "Ambiente excluído (não havia login)." **P.**

**UX2 — "Abrir contrato no Drive" afirma o que o dado não garante.**
`cliente-ficha.tsx:405` e `:431`. O CHECK do banco exige apenas `https://`; o aluno pode colar
Dropbox, OneDrive ou o site do cartório. O placeholder (`:374`) e a ajuda (`:386`) podem continuar
sugerindo o Drive — o **rótulo do botão**, não.
**Correção:** rótulo **"Abrir contrato"** nos dois pontos, mantendo o `sr-only` "(abre em nova
aba)". **P · risco nenhum.**

**UX3 — Tarefa bloqueada esmaece o bloco inteiro.** `tarefa-item.tsx:45`: `opacity-60` no
container. É exatamente o padrão que o polimento removeu de `etapas-overview.tsx:47` com o
argumento escrito ("opacidade derruba o contraste do texto junto; estado se diz por forma"). A
regra não chegou ao item de tarefa, que é onde o aluno passa o tempo.
**Correção:** borda tracejada + fundo `muted/20` + chip neutro, sem `opacity`; manter o `Badge` com
o cadeado e o `detalheBloqueio`. **P · risco nenhum.**

**UX4 — Ficha do cliente salva por dois regimes.** A estrela grava na hora
(`cliente-ficha.tsx:100-110`); os outros 15 campos só com "Salvar ficha" (`:118`). Sair da página
com o formulário sujo perde tudo sem aviso.
**Correção:** `beforeunload` + guarda de navegação quando houver alteração pendente, e microcopy
"as alterações são salvas ao clicar em Salvar ficha". **P/M · risco baixo.**

**UX5 — Três `Label` sem `htmlFor` na ficha.** `cliente-ficha.tsx:219` (Nível de relacionamento),
`:236` (Problemas), `:445` (Perfil DISC): o `Select` não tem `id` e o rótulo não é clicável nem
associado. WCAG 1.3.1/4.1.2. **Correção:** `id` no `SelectTrigger` + `htmlFor`. **P.**

**UX6 — Pasta: cabeçalho promete, corpo nega.** `app/pasta/page.tsx:35` diz "Todos os documentos e
arquivos do seu processo, organizados no Drive" mesmo quando não há pasta configurada; o vazio
(`pasta-view.tsx:105-114`) é um `Card` à mão, fora do `EmptyState` do design system.
**Correção:** `EmptyState` + descrição condicional. **P.**

**UX7 — Tela de "sem acesso" e "recusada" não tem canal.** `app/page.tsx:60-77` manda "Fale com a
equipe do Time Holding Brasil" sem link, telefone ou e-mail — e essa pessoa **não** tem acesso ao
`/chamados` (o suporte exige `gps.membros`). É o único beco sem saída absoluto do produto.
**Correção:** um `mailto:`/WhatsApp da equipe no card (a mesma string que a config de chamados
guarda). **P · depende de qual endereço (BLOQUEIO 2).**

**UX8 — Prévia "como o aluno vê" mostra a aba Financeiro sempre.** `nav.ts:64`
(`assistenciaNavItems` passa `financeiro: true`, correto para o admin) — mas na prévia de um
ambiente **compartilhado** o admin vê uma aba que o sócio nunca terá. A prévia é a ferramenta de
suporte usada para responder "o que você está vendo aí?".
**Correção:** a prévia aceita um seletor titular/sócio, ou a aba Financeiro ganha `previa-oculta`
quando o ambiente tem sócio. **P · risco baixo.**

### B.3 Código

**CD1 — 9 `Intl.NumberFormat` BRL, nenhum helper.** `alunos-ativos-lista.tsx:106,113` ·
`home-resumo.tsx:9` · `clientes-manager.tsx:50` · `favorito-destaque.tsx:10` ·
`financeiro-view.tsx:47` · `meta-honorarios.tsx:10,20` · `etapa1-guide.tsx:32` ·
`cliente-ficha.tsx:44`. `masks.ts:123` tem `numeroParaMoeda` (entrada de formulário), que não serve
para exibição.
**Correção:** `src/lib/moeda.ts` com `brl(n)`, `brlRedondo(n)`, `brlCompacto(n)` e a regra
`null → "—"` num lugar só. **M · risco baixo (é troca mecânica; conferir os `maximumFractionDigits`
de cada chamador).**

**CD2 — Datas em 4 dialetos.** `datas.ts` (`formatarData`/`formatarDataHora`, com fuso explícito)
já existe e é a referência — mas continuam crus: `gerenciar-acesso.tsx:359,381`,
`solicitacao-card.tsx:87`, `clientes-manager.tsx:395,625`. Mais 5 `Intl.DateTimeFormat` e 17
literais `"America/Sao_Paulo"` em 12 arquivos.
**Correção:** consumir `datas.ts`; para `date` sem fuso (`data_reuniao_preliminar`) usar o recorte
de string que `financeiro-view.tsx:68` já implementa — promovê-lo a `formatarDataSimples` em
`datas.ts`. **P/M · risco baixo — mas atenção: `new Date("2026-08-11")` é meia-noite UTC e volta um
dia em São Paulo.**

**CD3 — Rota fantasma `src/app/etapa-1/`.** A pasta tem só `actions.ts` (326 linhas), **sem
`page.tsx`** — a mesma forma de `src/app/agenda/`, apagada em 09/09 por ter Server Actions órfãs
expostas. Aqui as actions **estão em uso**, então não é código morto: é **nome que mente**. E
`revalidar()` (`:131-138`) chama `revalidatePath("/etapa-1")`, rota que não existe;
`recusarSolicitacao` (`admin/actions.ts:352`) revalida `/admin/solicitacoes`, que virou redirect em
09/09.
**Correção:** mover para `src/app/clientes/actions.ts` (4 importadores) e apagar as duas linhas
mortas. **M · risco baixo — mudança mecânica, mas toca arquivos do frontend: fazer numa onda em que
o frontend não os toque.**

**CD4 — Mortos confirmados (knip + `rg`).** Arquivos: `src/app/auth/actions.ts` (a `sair()` foi
substituída pelo `LogoutButton` client-side), `src/components/ui/avatar.tsx`,
`src/components/ui/dropdown-menu.tsx` (268 linhas). ~30 exports/tipos não usados — lista em
`tmp/squad/inventario-qualidade.md §3`.
**Correção:** apagar os 3 arquivos e os exports de `ui/*`; **manter** os que documentam contrato de
domínio (`types.ts:TIPOS_EVENTO`… são catálogo do Diário, revisar um a um). **P · risco baixo.**

**CD5 — Seis arquivos pedindo corte por responsabilidade** (nenhum muda comportamento):
| arquivo | linhas | cortes propostos |
|---|---|---|
| `admin/plantao-calendario.tsx` | 1197 | `plantao-calendario.tsx` (grade + estado) · `plantao-slot-dialogo.tsx` (`FormularioSlot` + série) · `plantao-cancelamento.tsx` (`DialogoCancelamento` + `TrocaDeMentora`) · `plantao-gravacao.tsx` |
| `lib/data.ts` | 1049 | `data.ts` (aluno/ambiente/cliente/progresso) · `data-painel.ts` (`getAlunosGps`, `getAtendimentoPorAluno`, tipos do painel) · `data-diario.ts` (notas, eventos, marcos, `comNomesDeAutor*`) |
| `admin/plantao/actions.ts` | 957 | `actions-slots.ts` · `actions-mentoras.ts` · `actions-config.ts` |
| `clientes/clientes-manager.tsx` | 801 | `clientes-manager.tsx` (estado + ações) · `clientes-tabela.tsx` · `clientes-quadro.tsx` · `cliente-card-lista.tsx` · `clientes-chips.tsx` (`FiltroChip`/`ViewButton`/`StarButton`/`WhatsappLink`/`MarcaRecusou`) |
| `admin/alunos-ativos-lista.tsx` | 761 | `alunos-ativos-lista.tsx` (barra + estado) · `aluno-card.tsx` · `alunos-ordenacao.ts` (funções puras de filtro/ordem — **testáveis**) |
| `admin/gerenciar-acesso.tsx` | 624 | `gerenciar-acesso.tsx` · `membros-view.tsx` · `adicionar-socio.tsx` · `credenciais-view.tsx` (ver CD11) |
**M cada · risco baixo se o diff for só movimento.**

**CD6 — `error.message` cru devolvido ao navegador.** `etapa-1/actions.ts:180,203,241,…` e
`admin/actions.ts:298,349,…` devolvem `{ erro: error.message }`, que a UI joga num toast: o aluno
lê `new row for relation "etapa1_clientes" violates check constraint
"etapa1_clientes_contrato_url_check"`. As actions de chamados já fazem o certo (`traduzirErro` +
`logErro`).
**Correção:** mesma dupla — frase em português para a tela, detalhe para o `logErro`.
**M · risco baixo.**

**CD7 — A regra do sócio copiada 9 vezes.** `financeiro: ctx.papelMembro === "titular"` aparece em
9 páginas (`page.tsx:142`, `clientes/page.tsx:29`, `clientes/[clienteId]:33`, `etapa/[etapa]:40`,
`materiais:35`, `pasta:28`, `perfil:35`, `chamados:52`, `chamados/[id]:56`). Uma página nova que
esqueça vira aba indevida — e o comentário de `nav.ts:7-21` explica que `opts` é obrigatório
justamente para isso. O passo que falta é remover a chance de erro, não avisá-la.
**Correção:** `navDoAluno(ctx)` em `nav.ts` (recebe o `ContextoSessao`, decide a flag). Assinatura
antiga permanece para o admin. **P · risco baixo.**

**CD8 — `not-found.tsx` × `ErroPainel`.** `src/app/not-found.tsx:6-23` repete a estrutura do
`ErroPainel` (selo, chip circular, `h1`, descrição, ação) com espaçamento e largura diferentes.
**Correção:** `ErroPainel` ganha `tom?: "erro" | "neutro"` e `icone?`; `not-found` passa a
consumi-lo. **P · risco nenhum.**

**CD9 — `gps.config` × `gps.plantao_config`.** Duas tabelas chave/valor, mesmo padrão, mesmas
policies, mesma trigger. A própria migração `…110:185` diz "`plantao_config` FICA como está —
migrar as chaves depois, em tarefa própria". É esta a tarefa.
**Correção (migration `…130`):**
```
-- 1. insert into gps.config (chave, valor)
--    select 'plantao_inscricao_aberta', valor from gps.plantao_config
--    where chave = 'inscricao_aberta' on conflict (chave) do nothing;
-- 2. create or replace gps.plantao_escrita_liberada() lendo gps.config
--    (chave 'plantao_inscricao_aberta'), MANTENDO security definer +
--    search_path = '' + o fallback current_setting('app.plantao_inscricao_aberta')
--    + o default ABERTO. Partir do corpo VIGENTE extraído do banco.
-- 3. NÃO dropar gps.plantao_config nesta migration — vira órfã, como as
--    gps.reuniao_*; dropar é passo separado, depois de uma janela.
-- Reversão: recriar a função apontando para gps.plantao_config.
```
⚠️ **Diferença de CHECK que precisa entrar no cabeçalho:** `plantao_config.valor` exige
`length between 1 and 200`; `config.valor` aceita vazio e proíbe CR/LF. O valor migrado
(`'true'/'false'`) passa nos dois.
Leitura no TS: `plantao-data.ts:224` e `admin/plantao/actions.ts:691`.
**M · risco médio — é o interruptor que desliga TODAS as escritas públicas do Plantão. Aceite:
`select gps.plantao_escrita_liberada()` = true antes e depois, e a tela de `/admin/plantao`
alternando o estado.**

**CD10 — 4 RPCs que o app chama e o repo não versiona.** `gps.admin_excluir_membro`,
`gps.aluno_por_documento`, `gps.admin_direito_ao_acesso`, `gps.admin_programas_do_email` não têm
DDL em `supabase/migrations/**` (nem no baseline `00000000000000`, nem na `…118`). É exatamente a
condição que deixou `admin_adotar_login_existente` **quebrada por 15 dias sem ninguém ver**, e duas
delas ficam no caminho de exclusão de login e de conferência de direito de acesso.
**Correção:** extrair `pg_get_functiondef` do banco e versionar como retrato idempotente
(migration `…131`), no formato da `…118`. **NÃO escrever o corpo de cabeça.**
**M · risco baixo · BLOQUEIO técnico: exige o dump do João/orquestrador.**

**CD11 — `CredenciaisView` duplicado com capacidades diferentes.** `criar-acesso.tsx:380-443`
(copiar) e `gerenciar-acesso.tsx:~570` (copiar + WhatsApp). Mesmo conceito, uma delas pior.
**Correção:** extrair `components/admin/credenciais-view.tsx` com a união. **P.**

**CD12 — Consulta buscada e descartada.** `etapa-conteudo.tsx:36-38` sempre busca
`getEnfasesEtapa`, mas o ramo da etapa 3 (`:70-79`) não repassa `enfasesIniciais` ao `Etapa3Guide`.
Um round-trip por abertura da Etapa 03.
**Correção:** passar (se o guia suportar) ou buscar só quando for usada. **P.**

**CD13 — 37 classes `dark:` mortas** em 15 arquivos. O `globals.css:13` neutralizou o variant de
propósito (aponta para um atributo que ninguém escreve), então não pintam nada — mas continuam
sendo armadilha para quem for escrever a próxima tela. **Correção:** remover na passagem do CD1
(mesmos arquivos). **P · risco nenhum — NÃO reintroduzir tema escuro (ver D).**

**CD14 — Regex de e-mail em três versões.** `plantao.ts:95` (`emailValido`, helper),
`app/chamados/actions.ts:404` e `app/admin/chamados/actions.ts:34` (`EMAIL_REGEX` própria, padrão
diferente). O de chamados é o que filtra destinatário de e-mail — divergir aqui é divergir na
superfície de injeção de cabeçalho. **Correção:** um helper só. **P.**

**CD15 — `soDigitos` reimplementado 4×.** `cadastro/actions.ts:22`, `admin/actions.ts:56,91,92` —
`masks.ts:4` já existe e é o mesmo código que o gatilho de vínculo por CPF usa. **P.**

**CD16 — `CLAUDE.md` já nasceu desatualizado nesta parte.** Lista `gps.senhas_bkp_20260810` como
pendência 🔴 "decisão do João", mas a migration `20260909000119_gps_drop_senhas_bkp_20260810.sql`
existe no repo. Um documento que é fonte de verdade não pode pedir uma decisão já tomada.
**Correção:** atualizar as duas ocorrências (seção (i) item 1 e o checklist de Estado atual). **P.**

### B.4 Performance

**PF1 — O SDK do Supabase (64 KB gzip) está em toda página autenticada.**
Medido: o chunk `27a10y8ptnm0k.js` (239 KB bruto / **62–64 KB gzip**) contém `AuthClient`,
`GoTrueClient` e `RealtimeClient`; ele aparece em `/esqueci-senha` e **não** em `/login`; e o
`page_client-reference-manifest.js` da **home** o referencia 21 vezes. Entram por:
`components/logout-button.tsx:4` e `components/auto-logout.tsx:4` (presentes em todo `AppHeader`),
`esqueci-form.tsx:4`, `auth/redefinir/redefinir-form.tsx:5`, `perfil/trocar-senha.tsx:6`,
`chamados/anexo-campo.tsx:5`.
**Correção de menor risco:** `const { createClient } = await import("@/lib/supabase/client")`
**dentro** do handler (`sair()`, tick do auto-logout, submit dos formulários de senha). O
comportamento é idêntico — inclusive o `signOut({ scope: "local" })` que existe porque
redirect de route handler quebrava atrás do proxy da Hostinger (`logout-button.tsx:7-12`) — e o
chunk sai do carregamento inicial. `anexo-campo` já é interação: `next/dynamic`.
**M · risco baixo · aceite com número.**

**PF2 — Baseline do bundle (medido hoje, `next start` :3991, mesmo método do `polimento.md`):**
| rota | chunks | bruto | **gzip** | baseline 08/09 |
|---|---|---:|---:|---:|
| `/login` | 16 | 791 KB | **242 KB** | 235 KB |
| `/cadastro` | 16 | 793 KB | 243 KB | — |
| `/esqueci-senha` | 17 | 1030 KB | **304 KB** | 297 KB |
| `/p/plantao` | 19 | 907 KB | 280 KB | 282 KB |
(O inventário do orquestrador mediu 248/312 com o mesmo método em outra porta; a diferença é ruído
de nível de gzip. **Use um dos dois como "antes" e o MESMO comando como "depois".**)
Piorou ~3% desde 08/09 sem ninguém decidir isso — a Onda 4 do `polimento.md` nunca rodou.

**PF3 — Dois waterfalls pequenos.** `etapa-conteudo.tsx:35-44` faz `Promise.all` e depois outro
`Promise.all` (2 idas em série, ~44 ms); `app/page.tsx:118` deixa `getTurmaCodigo` em série porque
depende de `aluno.turma_id`. O primeiro é resolvível (as consultas da etapa 1 não dependem das
duas primeiras); o segundo só com join. **P · risco baixo.**

**PF4 — O aluno baixa o formulário do admin.** `pasta-view.tsx` é um único client component que
importa `salvarPastaDriveUrl` (action de admin, corretamente guardada por `ehAdmin()`) e renderiza
o form sob `isAdmin`. Para o aluno é código e uma referência de Server Action que não deveriam
existir no bundle dele. **Correção:** `PastaView` vira Server Component; `PastaConfigForm` (client)
só é montado no ramo admin. **P/M · risco baixo.**

### B.5 Segurança

**SG1 — Nada crítico novo.** Conferi as fronteiras que o pedido cita e elas se sustentam: o Diário
não tem caminho para o aluno (`assistenciaNavItems` + RLS só-admin); `getChamado` devolve `null`
igual para "não existe" e "não é seu"; `financeiro_do_aluno` tem guarda em três camadas (nav, page,
RPC); `destinoInterno()` é o único validador de redirect; `PatchCliente` tem allowlist em runtime;
`anon` não tem grant nas tabelas de chamados/plantão. Os dois pentests de 09/09 aprovaram e não
encontrei regressão.
**SG2 — `error.message` cru** (= CD6) é o único vazamento de estrutura interna que achei — nome de
constraint e de coluna chegam ao navegador do aluno. Baixo, mas é o tipo de detalhe que orienta
quem for tentar algo.
**SG3 — `frame-ancestors https://*.hotmart.com`** continua liberando qualquer produtor da Hotmart a
embedar `/p/plantao` (dívida consciente, `next.config.ts:96`; fechar depende do ensaio do
`ATIVAR-PLANTAO-AGORA.md` passo 5).
**Tarefa de pentester nesta rodada: OBRIGATÓRIA na Onda 2** — a migration do CD9 mexe no
interruptor de escrita pública do Plantão e o CD10 expõe 4 funções `SECURITY DEFINER` a code review
pela primeira vez.

---

## C) Plano em ondas

Regra: **um commit por agente por onda**; `backend-engineer` e `frontend-engineer` rodam em
paralelo, **sem nenhum arquivo compartilhado dentro da mesma onda**. Cada onda declara a fronteira
e o contrato. Nenhuma onda adiciona dependência. `npm run build` verde é pré-requisito de fechar.

### 🌊 Onda 1 — o que a tela promete passa a ser verdade

#### `backend-engineer` — commit `fix(dados): saldo divergente, proximo passo travado e aviso de suporte honesto`
- [ ] **FN1** `src/lib/financeiro.ts:148-166` — em `derivar()`, calcular `divergenciaQuitacao`
      sempre que `Math.abs(saldo) > TOLERANCIA_CENTAVOS` e a situação resultar em `"quitado"`,
      **não só quando `quitadoEm !== null`**. Hoje um `valor_pago` muito acima do total vira
      "Quitado, R$ 0,00" e o admin não vê número nenhum. Manter: aluno nunca vê divergência.
- [ ] **PL2** `src/lib/etapas.ts:58-97` — `proximoPasso(etapas, clientes, progresso, opts:
      { temFavorito: boolean })`; pular tarefa com `exigeFavorito`/`exigeTarefa` não satisfeito e,
      se **todas** as pendentes estiverem travadas, devolver a primeira com
      `bloqueio: "Escolha o cliente que a equipe vai acompanhar"`. Ajustar os 2 chamadores
      (`src/app/page.tsx:121`, `src/app/admin/aluno/[alunoId]/page.tsx:49`) — **estes dois
      `page.tsx` são seus nesta onda**.
- [ ] **PL6** `src/lib/chamados-data.ts:283-316` — `getChamadosConfig` devolve também
      `fallbackEnv: Boolean(process.env.EMAIL_SUPORTE)`.
- [ ] **PL14** `src/app/admin/actions.ts:291-297` — recusar aprovação quando o `user_id` já tiver
      vínculo em `gps.membros`, com frase clara (hoje o upsert promove sócio a titular em silêncio).
- [ ] **CD6** `src/app/etapa-1/actions.ts` + `src/app/admin/actions.ts` — trocar
      `{ erro: error.message }` por frase em português + `logErro(...)` com o detalhe.
- [ ] **CD3 (parcial)** apagar `revalidatePath("/etapa-1")` (`etapa-1/actions.ts:132`) e
      `revalidatePath("/admin/solicitacoes")` (`admin/actions.ts:352`) — rotas que não existem.
- **Não tocar:** `src/components/**`, `src/app/admin/page.tsx`, `next.config.ts`.
- **Contrato publicado para o front (Onda 2):** `ProximoPasso` ganha
  `bloqueio?: string` e `ChamadosConfig` ganha `fallbackEnv: boolean`.
- **Aceite:** `npx tsc --noEmit` limpo · `rg "erro: error.message" src/app/etapa-1 src/app/admin/actions.ts` → 0 ·
  `rg 'revalidatePath\("/etapa-1"\)|admin/solicitacoes"\)' src` → 0.

#### `frontend-engineer` — commit `fix(ui): confirmacao no que apaga, rotulo que nao mente e chamado visivel`
- [ ] **UX1** `gerenciar-acesso.tsx:148` — tirar "GPS" do toast.
      Aceite: `rg -n "\bGPS\b" src/components src/app --glob '!*.md'` só devolve comentário/código.
- [ ] **UX2** `cliente-ficha.tsx:405,431` — rótulo **"Abrir contrato"** (mantendo `sr-only`).
- [ ] **UX3** `tarefa-item.tsx:44-51` — estado bloqueado por forma (borda tracejada + chip neutro),
      **sem `opacity`**; mesma regra já aplicada em `etapas-overview.tsx:43-47`.
- [ ] **PL3** `etapa1-guide.tsx:131-135`, `home-resumo.tsx:57-62`, `alunos-ativos-lista.tsx:696-700`
      — KPI de clientes passa a mostrar `comDados`/30, com `preenchidos` no detalhe.
      (`comDados` já vem de `calcularMetricasEtapa1`; no painel, de `clientes_com_dados` da RPC —
      **se o campo não estiver em `AlunoGps`, deixar o card como está e reportar**, não inventar.)
- [ ] **PL9/PL10/PL11/PL12** confirmação (padrão do `Dialog` "Fechar chamado", já no repo) em:
      excluir cliente (`clientes-manager.tsx:413,663`), remover sócio
      (`gerenciar-acesso.tsx:152-159`), **desmarcar** o cliente da equipe
      (`clientes-manager.tsx:154-174` e `cliente-ficha.tsx:100-110`) e fechar a entrada do suporte
      (`chamados-config.tsx:50`). Cada texto diz **a consequência**, não "tem certeza?".
- [ ] **PL4** `solicitacao-card.tsx:63-71` — campo "Motivo (o aluno vê)" passado como 2º argumento
      de `recusarSolicitacao` (**a action já aceita**) + confirmação.
- [ ] **PL5** `alunos-ativos-lista.tsx` — badge de chamado aberto no card (padrão do de pendências,
      usando `atendimento.chamadosAbertos`, já presente) + filtro "com chamado aberto"; e
      `src/app/admin/page.tsx:102` → `adminNavItems({ chamadosAbertos: soma do Map })`, **sem
      consulta nova**.
- [ ] **PL7** `plantao-calendario.tsx:980,1004` — duração padrão **120**.
- [ ] **UX5** `cliente-ficha.tsx:219,236,445` — `id` no `SelectTrigger` + `htmlFor`.
- [ ] **CD8** `ErroPainel` ganha `tom`/`icone`; `src/app/not-found.tsx` passa a consumi-lo.
- **Não tocar:** `src/lib/**`, `src/app/**/actions.ts`, `src/app/page.tsx`,
  `src/app/admin/aluno/[alunoId]/page.tsx`.
- **Aceite:** build verde; `rg -n "opacity-60" src/components/etapa/tarefa-item.tsx` → 0;
  `rg -n "no Drive<" src/components/clientes` → 0.

### 🌊 Onda 2 — um lugar só para cada regra (+ pentest obrigatório)

#### `backend-engineer` — commit `chore(db): interruptor do plantao migra para gps.config e as 4 RPCs entram no controle de versao`
- [ ] **CD9** migration `20260909000130_gps_plantao_config_para_gps_config.sql` (rascunho no B.3) +
      leitura em `src/lib/plantao-data.ts:224` e `src/app/admin/plantao/actions.ts:691`.
      **Não dropar `gps.plantao_config`** — órfã, como as `gps.reuniao_*`.
- [ ] **CD10** migration `…131` versionando `gps.admin_excluir_membro`, `gps.aluno_por_documento`,
      `gps.admin_direito_ao_acesso`, `gps.admin_programas_do_email` a partir do
      `pg_get_functiondef` **do banco** (formato da `…118`). Corpo de cabeça é proibido.
- [ ] **CD14/CD15** um `emailValido` só (`plantao.ts:95`) nas actions de chamados; `soDigitos` de
      `masks.ts` em `cadastro/actions.ts:22` e `admin/actions.ts:56,91,92`.
- [ ] **CD12** `src/components/etapa/etapa-conteudo.tsx:35-44` — não buscar `getEnfasesEtapa` no
      ramo da etapa 3 (**este arquivo é seu nesta onda**; o front não o toca).
- **Não tocar:** o resto de `src/components/**`, `next.config.ts`.
- **Aceite:** migrations com cabeçalho (motivação · o que NÃO faz · reversão literal);
  `select gps.plantao_escrita_liberada()` devolve o mesmo valor antes e depois (o **João** aplica e
  confere — o agente não aplica); `rg -n "EMAIL_REGEX" src` → 0.

#### `frontend-engineer` — commit `refactor(ui): moeda e data num lugar so; morto fora`
- [ ] **CD1** criar `src/lib/moeda.ts` (`brl`, `brlRedondo`, `brlCompacto`, ausência = `"—"`) e
      converter os 9 pontos. **Conferir chamador a chamador**: `meta-honorarios` usa
      `maximumFractionDigits: 0` de propósito e `alunos-ativos-lista` usa `notation: "compact"`.
- [ ] **CD2** trocar as 5 datas cruas por `datas.ts`; promover o recorte de string de
      `financeiro-view.tsx:59-70` a `formatarDataSimples` (para `date` sem fuso).
- [ ] **CD4** apagar `src/components/ui/avatar.tsx`, `src/components/ui/dropdown-menu.tsx` e os
      exports não usados de `ui/*` (lista no inventário §3).
- [ ] **CD13** remover as 37 classes `dark:` (mesmos arquivos do CD1). **Não** mexer no
      `@custom-variant dark` do `globals.css:13`.
- [ ] **UX6** `pasta-view.tsx:105-114` → `EmptyState`; descrição condicional em
      `src/app/pasta/page.tsx:35`.
- [ ] **UX8** aba Financeiro com `previa-oculta` quando o ambiente tem sócio (ou seletor na prévia).
- **Não tocar:** `src/lib/{plantao-data,chamados-data,etapas,financeiro,nav}.ts`, actions,
  `etapa-conteudo.tsx`.
- **Aceite:** `rg -n "Intl.NumberFormat" src/components` → 0 ·
  `rg -n "dark:" src --glob '!src/components/ui/**'` → 0 · build verde · a tela de Clientes,
  a home e o Financeiro mostram **os mesmos números de antes** (comparar prints).

#### `security-pentester` — **obrigatório**
- [ ] Auditar a migration do CD9 contra o incidente CNHF: `revoke` antes de `grant`,
      `security definer` + `search_path = ''` preservados, **default ABERTO** mantido, e nenhuma
      janela em que `plantao_escrita_liberada()` devolva `null`/erro (falharia ABERTO ou FECHADO?).
- [ ] Revisar as **4 funções do CD10** que entram em code review pela primeira vez: guarda de
      admin, `search_path`, grants a `anon`/`authenticated`, e se `admin_excluir_membro` confere
      `admin_alvo_e_equipe` (impedir escalada apagando conta de equipe).
- [ ] Confirmar que a Onda 1 não afrouxou nada: `destinoInterno` intocado, `ehAdmin()` intocado,
      nenhuma nova action exportada.

### 🌊 Onda 3 — cortar os arquivos gigantes (zero mudança de comportamento)

#### `backend-engineer` — commit `refactor(lib): data.ts e as actions do plantao divididos por responsabilidade`
- [ ] **CD5** `src/lib/data.ts` (1049) → `data.ts` · `data-painel.ts` · `data-diario.ts`, mantendo
      re-export para não quebrar importadores.
- [ ] **CD5** `src/app/admin/plantao/actions.ts` (957) → `actions-slots.ts` · `actions-mentoras.ts`
      · `actions-config.ts` (o arquivo original vira o barril `"use server"`).
- [ ] **CD7** `navDoAluno(ctx)` em `src/lib/nav.ts` + os 9 chamadores em `src/app/**/page.tsx`
      (**as páginas do aluno são suas nesta onda**).
- **Não tocar:** `src/components/**`.
- **Aceite:** `git diff --stat` só com movimento; `npx tsc --noEmit` limpo; `rg -n
  'papelMembro === "titular"' src/app` → 0.

#### `frontend-engineer` — commit `refactor(ui): clientes, painel, plantao e acesso divididos por responsabilidade`
- [ ] **CD5** os 4 cortes de componente da tabela do B.3 (clientes-manager, alunos-ativos-lista,
      plantao-calendario, gerenciar-acesso) + **CD11** (`credenciais-view.tsx`).
- [ ] Extrair as funções puras de `alunos-ativos-lista` (`diasDesde`, `descreverAcesso`, `porData`,
      ordenações) para `alunos-ordenacao.ts` — é o único lugar do repo com lógica de ordenação
      não trivial e hoje ela não é testável.
- **Não tocar:** `src/lib/**`, `src/app/**`.
- **Aceite:** build verde + **prints antes/depois idênticos** das 4 telas (o Chromium do
  `tmp/squad/shots.mjs` já faz isso). Diff que muda pixel nesta onda é regressão.

### 🌊 Onda 4 — bundle, com número

#### `frontend-engineer` — commit `perf(bundle): o SDK do Supabase sai do carregamento inicial`
- [ ] **Medir antes** com o método da seção A do `polimento.md` (o comando está no E abaixo).
      Baseline: **`/login` 242 KB gzip · `/esqueci-senha` 304 KB** (medido hoje, `next start`).
- [ ] **PF1** `import()` dinâmico de `@/lib/supabase/client` **dentro** dos handlers de
      `logout-button.tsx:26`, `auto-logout.tsx:40-53`, `esqueci-form.tsx:16`,
      `redefinir-form.tsx:18`, `perfil/trocar-senha.tsx`. **Manter `signOut({ scope: "local" })` e o
      `window.location.assign`** — existem porque redirect de route handler quebrava atrás do proxy
      da Hostinger (`logout-button.tsx:7-12`); não trocar por Server Action nesta onda.
- [ ] `next/dynamic` no `AnexoCampo` (`chamados/anexo-campo.tsx`), no diálogo `GerenciarAcesso` e
      no `PlantaoCalendario`.
- [ ] **PF4** `PastaView` vira Server Component + `PastaConfigForm` só no ramo admin.
- [ ] `experimental.optimizePackageImports: ["lucide-react"]` em `next.config.ts` **com medição
      antes/depois — se não mover a agulha, reverter.**
- **Aceite (sem número a onda não fecha):** `/login` **≤ 190 KB gzip**; `/esqueci-senha` **≤ 245 KB
  gzip**; e `rg -c 27a10y... ` no manifest da home mostrando que o chunk do SDK saiu do
  carregamento inicial (o nome do chunk muda a cada build — conferir por
  `grep -l AuthClient .next/static/chunks/*.js` e checar se ele aparece no
  `.next/server/app/page_client-reference-manifest.js`).

#### `backend-engineer` — commit `chore: actions de cliente saem da rota fantasma /etapa-1`
- [ ] **CD3** mover `src/app/etapa-1/actions.ts` → `src/app/clientes/actions.ts` e atualizar os 4
      importadores (`clientes-manager.tsx`, `cliente-ficha.tsx`, `etapa1-guide.tsx`,
      `etapa3-guide.tsx` — conferir com `rg`). **Nesta onda o frontend não toca esses arquivos.**
- [ ] **CD16** atualizar o `CLAUDE.md`: `gps.senhas_bkp_20260810` **já foi apagada** (migration
      `…119`) e não é mais pendência; registrar as decisões desta rodada.
- **Aceite:** `rg -n "app/etapa-1" src` → 0; build verde.

---

## D) O que NÃO mudar

| Não fazer | Por quê |
|---|---|
| **Reconstruir agendamento com a equipe** | Removido em 10/08 por decisão **operacional** do Marcio (a equipe não comparecia) e já voltou uma vez por engano. As tabelas `gps.reuniao_*` e `gps.agenda` são histórico preservado, sem escrita (policies derrubadas na `…117`). |
| **Abrir o Diário (ou a última nota) para o aluno ou para o sócio** | LGPD, não preferência: texto livre com dado de terceiro. A migração `20260908000001` proíbe **em texto**. E não acrescentar "Diário" em `alunoNavItems`. |
| **Mostrar o Financeiro ao sócio** | B7-b, 13 pessoas reais. "Mostrar a dívida de alguém não se desfaz." O que muda na Onda 3 é o **aviso** no lugar do redirect mudo — não o acesso. |
| **`coalesce(saldo, 0)` / `?? 0` em honorários** | B7-d e B8: campo recém-criado que nasce `NULL`. Zero é uma afirmação sobre o dinheiro de gente real. |
| **CHECK ligando `valor_honorarios` a `fase='contratado'`** | B9-b: viraria catraca — voltar de fase falharia até alguém apagar o valor. |
| **`drop column status` de `etapa1_clientes`** | É o caminho de volta da migração de `fase`, e o marcador "Recusou" (1 linha) não tem lugar nas 3 fases. C7 continua aberto. |
| **Trocar `getUser()` por `getSession()`** | Trocaria latência por buraco de auth. `rg "getSession\(" src` tem de continuar 0. |
| **`unstable_cache`/ISR em página de aluno** | Todo dado é por usuário e atrás de RLS. `React.cache` (por requisição) sim; cache cross-request é vazamento esperando acontecer. |
| **Reintroduzir tema escuro ao limpar os `dark:`** | O `@custom-variant` de `globals.css:13` foi neutralizado **de propósito**, com o argumento escrito. Tema escuro é feature com provider e QA de 24 telas. |
| **Mover busca/filtro do painel para o servidor** | Leitura A decidida em 09/09: memória sobre o lote, com rodapé honesto. Com 125 ambientes, mover é feature com risco de piorar a busca tolerante. |
| **Trocar o logout client-side por route handler/Server Action** | O comentário de `logout-button.tsx:7-12` registra que isso quebrava atrás do proxy LiteSpeed da Hostinger. Na Onda 4 o SDK sai do bundle **sem** mudar o mecanismo. |
| **Apagar `gps.plantao_config` na mesma migration do CD9** | Mesma regra das órfãs: remove-se o caminho de código, não o histórico. |
| **"Simplificar" `getMarcosDeTrilha` juntando com a lista filtrada** | Se o primeiro acesso e o corte de backfill saírem da lista já filtrada por `desde`, escolher "30 dias" apaga o marco e a tela mente. |
| **Anexo da equipe no chamado / upload de documento do cliente** | B5-c e a decisão de 07/2026: documento do cliente vive **só** no Drive. |

## BLOQUEIO — só o Marcio/João decidem

1. 🔴 **PL1 — o acervo abre material de etapa bloqueada.** Duas leituras legítimas do produto:
   (a) *o programa é sequencial* → gatear os 10 links e dizer "libera com a Etapa 0N";
   (b) *material é acervo, a etapa é o roteiro* → manter aberto e trocar o badge "bloqueada" por
   "a etapa abre depois". As duas dão trabalhos diferentes e a escolha muda a promessa do produto.
   **Não escolhi.**
2. **UX7 — qual canal a pessoa sem acesso usa?** A tela de solicitação recusada manda "falar com a
   equipe" e não existe endereço no código (`rg "mailto|suporte@"` → 0). Preciso de **um** e-mail
   ou WhatsApp para colocar ali (pode ser o mesmo de `chamados_email_equipe`).
3. **PL8 — senha do sócio.** Hoje o admin vê o problema e não tem remédio; a única saída é apagar o
   login do sócio. Criar `admin_definir_senha_membro` é feature nova em `auth.users` (pentest
   obrigatório). Vale a pena, ou os 13 sócios são atendidos por fora?
4. **PL9 — excluir cliente: confirmar ou arquivar?** A confirmação (P) resolve o acidente; o
   arquivamento (`arquivado_em`, M) resolve o arrependimento e segue a regra da casa de não apagar
   histórico — mas mexe em `etapa1_clientes`, que é a tabela mais quente do sistema.
5. **PL13 — SMTP do Supabase.** Configurar SMTP customizado (Resend) no painel do Supabase Auth é
   decisão/acesso do João. Sem isso, "Esqueci minha senha" continua sendo uma promessa frágil.
6. **B10 (herdado, ainda aberto)** — a copy sequencial fecha a Etapa 01 para **58 de 63 ambientes**.
   O número precisa ir ao Marcio.
7. **Herdadas e ainda abertas:** `chamados_email_equipe` vazio (ninguém é avisado de chamado novo);
   `pg_cron` do `primeiro_acesso` não agendado; ensaio do iframe da Hotmart para fechar
   `frame-ancestors *.hotmart.com`; C7 (onde "recusou" mora); conta do Ilan.

---

## E) Roteiro de validação para o João (logado, ≤ 15 passos)

**Antes:** `npm run build && npx next start -p 3991`. Guardar o número do bundle:
```bash
for r in login esqueci-senha; do
  s=$(curl -s "http://127.0.0.1:3991/$r" | grep -o '/_next/static/[A-Za-z0-9_./-]*\.js' | sort -u)
  g=0; for x in $s; do f=".next${x#/_next}"; [ -f "$f" ] && g=$((g+$(gzip -c "$f" | wc -c))); done
  echo "$r: $((g/1024)) KB gzip"
done
```

### Como **aluno titular**
1. `/` — o card "Continue de onde parou" leva a uma tarefa que você **consegue** marcar (ou diz o
   que destravar). Nunca a um passo cinza. *(PL2)*
2. `/` — "Clientes X/30" bate com o que a Etapa 01 cobra; se o passo 2 estiver travado, o número
   **não** pode ser 30/30. *(PL3)*
3. `/clientes` → clicar "Excluir" num cliente: tem de pedir confirmação com o nome dele. Cancele.
   *(PL9)*
4. `/clientes` → desmarcar a estrela do cliente da equipe: tem de avisar que isso volta a travar os
   passos 4–8. Cancele. *(PL11)*
5. `/clientes/<id>` com fase **Contratado** → o botão do link diz **"Abrir contrato"**. *(UX2)*
6. `/materiais` — abrir um material de etapa marcada "bloqueada": confirme se o comportamento é o
   que o Marcio decidiu no BLOQUEIO 1.
7. `/financeiro` — nenhum "R$ 0,00" onde deveria estar "não informado".
8. `/chamados` → abrir um chamado de teste. **Confira se alguém recebeu e-mail** (hoje, sem
   `chamados_email_equipe`, ninguém recebe).

### Como **sócio** (usar um dos 13 ambientes compartilhados)
9. O header **não** mostra a aba Financeiro; digitar `/financeiro` na barra mostra um **aviso**
   explicando que o contrato é do titular — não um redirect mudo para a home. *(FN2)*
10. `/chamados` abre normalmente e o chamado do titular aparece (é do ambiente, não da pessoa).
11. `/perfil` mostra **o seu** nome, não o do titular.

### Como **admin**
12. `/admin` — a aba "Chamados" tem contador e o card do aluno com chamado aberto mostra o badge.
    *(PL5)*
13. `/admin` → Solicitações → "Recusar" pede um motivo, e esse motivo aparece na tela do aluno
    recusado. *(PL4)*
14. `/admin/aluno/<id>` → "Gerenciar acesso" → "Remover" um sócio pede confirmação nomeada
    (**cancele**); nenhum texto diz "GPS". *(PL10/UX1)*
15. `/admin/plantao` → criar slot: a duração já vem **120** *(PL7)*; e `/admin/chamados` →
    "Fechar entrada" pede confirmação e, com a lista de e-mails vazia mas `EMAIL_SUPORTE` definido,
    o aviso vermelho **não** afirma que ninguém recebe. *(PL12/PL6)*

---

## Os 5 critérios do Fable

| Critério | O que este plano garante |
|---|---|
| **Segurança** | Ninguém ganha permissão nova. `error.message` cru sai da resposta ao navegador (CD6). As 4 RPCs `SECURITY DEFINER` que o app chama e o repo não versionava entram em code review pela primeira vez (CD10) — é a mesma classe de risco que deixou `admin_adotar_login_existente` quebrada por 15 dias. Pentest obrigatório na Onda 2 porque a migration toca o interruptor de escrita pública do Plantão. As fronteiras de LGPD (Diário), de papel (sócio × Financeiro) e de redirect ficam **intactas**. |
| **Escalabilidade** | Nenhuma consulta nova em nenhuma onda: o badge de chamados (PL5) usa Map já carregado, a meta usa a lista já em memória, e a Onda 2 **remove** uma consulta por abertura da Etapa 03 (CD12). O bundle cai ~50 KB gzip **em toda página autenticada** (PF1) — em 3G isso é meio segundo por navegação, no volume atual e em 10×. `gps.config` passa a ser a única tabela de configuração, então a próxima chave não cria a terceira. |
| **Solidificação** | Aqui está a fraqueza que assumo: **não proponho constraint nova**. Justificativa explícita: as duas candidatas óbvias já foram recusadas com argumento escrito (CHECK de honorário × fase = catraca, B9-b; `drop column status` = perda do caminho de volta, C7). As invariantes que este plano cria são de código e de esquema-em-código: `proximoPasso` deixa de poder devolver tarefa travada (PL2), `navDoAluno(ctx)` deixa de permitir que uma página nova esqueça a regra do sócio (CD7), `moeda.ts`/`datas.ts` passam a ser o único lugar onde "R$" e fuso existem (CD1/CD2), e 4 funções do banco deixam de existir só no banco (CD10). |
| **UX** | O usuário vê: (a) nenhuma ação que apaga acontece sem confirmação nomeada; (b) o card mais proeminente da home para de apontar para porta trancada; (c) "30/30" para de conviver com cadeado; (d) "Abrir contrato" para de afirmar Drive; (e) a pessoa recusada passa a saber **por quê**; (f) a equipe passa a **ver** o chamado que chegou. Nenhum texto de produto muda de tom, e nenhuma tela é redesenhada. |
| **Otimização** | Saldo de código **negativo**: saem 3 arquivos mortos (~400 linhas), ~30 exports, 8 formatadores BRL, 5 formatadores de data, 37 classes `dark:`, 4 `soDigitos`, 2 regex de e-mail, 2 `revalidatePath` para rotas inexistentes, 1 consulta por abertura da Etapa 03, 1 `CredenciaisView` duplicado e uma tabela de configuração inteira do caminho de leitura. Entram: `moeda.ts`, `navDoAluno` e 2 migrations. A Onda 4 só fecha **com número**: `/login` ≤ 190 KB gzip ou justificativa escrita. Zero dependência nova. |

---

## F) Decisões do orquestrador sobre os BLOQUEIOS (09/09, João autorizou seguir)
1. **PL1 (acervo × etapa bloqueada): leitura (a)** — gatear os 10 links de etapas bloqueadas em `materiais-view.tsx` (consistente com "liberação controlada"; reversível em uma linha). O card continua listado, com o badge "bloqueada" e sem link ativo; microcopy "Libera com a etapa".
2. **UX7 (canal para quem não tem acesso): fica aberto** — não existe e-mail/WhatsApp no código; não inventar. Copy continua "fale com a equipe"; registrar como pendência do João.
3. **PL8 (senha do sócio): ENTRA** — `gps.admin_definir_senha_membro(p_membro_id uuid, p_senha text)` espelhando `admin_definir_senha` (guardas: `gp_is_admin()`, `admin_alvo_e_equipe`, membro precisa ter `user_id`, log em `acessos_log` com ação `senha_definida`), botão "Definir senha" por membro em `gerenciar-acesso.tsx`. Pentest obrigatório (Onda 2).
4. **PL9 (excluir cliente): confirmação nomeada agora (P)**; arquivamento fica registrado como evolução futura.
5. **PL13 (SMTP do Supabase): copy honesta agora**; configuração é do João.
6. **B10: segue com o Marcio.**
- PL7 medido no banco: os 3 slots existentes têm 120; nenhum com 60. O default da coluna vira 120 na migração ...120x (orquestrador) e o form também.
- `gps.senhas_bkp_20260810` já apagada (...119) — CD16 vira só atualizar o CLAUDE.md.

---

## CONTRATO ONDA 1 PUBLICADO (backend-engineer, 09/09)

`src/lib/etapas.ts` e `src/lib/chamados-data.ts` estão **fechados**. O que mudou no contrato
que o frontend consome:

### 1. `ProximoPasso` ganha `bloqueio?: string` — `src/lib/etapas.ts`

```ts
export interface ProximoPasso {
  etapa: number;
  etapaNome: string;
  tarefaNum: number;
  codigo: string;
  titulo: string;
  /** Só vem preenchido quando TODAS as tarefas pendentes estão travadas. */
  bloqueio?: string;
}

export interface OpcoesProximoPasso { temFavorito: boolean }

export function proximoPasso(
  etapas: Etapa[],
  clientes: ClienteEtapa1[],
  progressoTodas: ProgressoTarefa[],
  opts: OpcoesProximoPasso,          // ← 4º argumento, OBRIGATÓRIO
): ProximoPasso | null
```

**Garantia nova:** `proximoPasso` **nunca devolve tarefa travada sem `bloqueio`**. Ele varre as
etapas liberadas em ordem e devolve a primeira pendente **livre**; só quando não há nenhuma livre
em etapa alguma é que devolve a primeira travada, aí **com `bloqueio` preenchido**.

Os dois valores possíveis de `bloqueio` (constantes em `etapas.ts`, mesma precedência do
`Etapa1Guide` — trava de tarefa antes da de favorito):
- `"Liste os 30 clientes"` — `exigeTarefa` não satisfeito;
- `"Escolha o cliente que a equipe vai acompanhar"` — `exigeFavorito` sem favorito.

**Para o `proximo-passo-card.tsx` (frontend):** quando `passo.bloqueio` existir, o card **não deve
ser um `Link` para `/etapa/N`** (é a porta trancada que o PL2 descreve) — vira CTA de
destravamento. Sugestão de destino, sem inventar rota: `${basePath}/clientes` nos dois casos (é
onde se lista cliente e onde se marca a estrela). Rótulo sugerido: "Destrave para continuar" +
a frase de `bloqueio`. Quando `bloqueio` for `undefined`, **nada muda**: o card continua exatamente
como está hoje.

Os dois chamadores já passam `opts` (`src/app/page.tsx`, `src/app/admin/aluno/[alunoId]/page.tsx`)
com `temFavorito: favorito !== null` — o `favorito` já vinha do `Promise.all`, **zero query nova**.

### 2. `ChamadosConfig` ganha `fallbackEnv: boolean` — `src/lib/chamados-data.ts`

```ts
getChamadosConfig(): Promise<{
  aberto: boolean;
  emailEquipe: string[];
  fallbackEnv: boolean;   // = Boolean(process.env.EMAIL_SUPORTE?.trim())
}>
```

**O endereço nunca sai do servidor** — só o booleano. Para não-admin, `fallbackEnv` volta `false`.

**Para o `chamados-config.tsx` (frontend):** a condição do aviso vermelho deixa de ser
`emailEquipe.length === 0`. Passa a ser:
- `emailEquipe.length === 0 && !fallbackEnv` → **vermelho**, "Ninguém recebe e-mail quando um aluno
  abre chamado." (verdade);
- `emailEquipe.length === 0 && fallbackEnv` → **informativo (neutro)**, algo como "A lista está
  vazia; o aviso vai para o endereço de suporte configurado no servidor. Preencher aqui é melhor:
  a lista é editável sem deploy."

### 3. Frase de erro nas actions (CD6)

`src/app/etapa-1/actions.ts` e `src/app/admin/actions.ts` não devolvem mais `error.message` cru.
O campo `erro` continua `string | undefined` — **nenhuma mudança de tipo** —, mas agora sempre em
português. Toasts que hoje mostram `res.erro` continuam funcionando sem alteração.

### 4. Achado para o frontend (fora da minha fronteira: `src/components/**`)

`src/components/financeiro/financeiro-view.tsx:280-289` — com o FN1, `divergenciaQuitacao` agora
também vem **negativa** (pagou acima do total, sem `quitado_em`). A copy atual — *"Contrato marcado
como quitado, mas o saldo apurado é −R$ X"* — fica imprecisa nesse ramo (não há `quitado_em` e não
é dívida, é crédito). Sugestão para a onda em que esse arquivo for de alguém:

```
divergencia < 0
  → "Pago acima do total em {brl(-divergencia)}. Confira no cadastro financeiro."
divergencia > 0
  → texto atual ("marcado como quitado, mas o saldo apurado é …").
```
Continua sendo linha só-admin (`ehAdmin &&`), e o aluno segue vendo "Quitado · R$ 0,00".

---

## CONTRATO ONDA 2 PUBLICADO: definirSenhaMembro (backend-engineer, 09/09)

**Action** — `src/app/admin/senha-actions.ts` (mesmo arquivo de `definirSenhaAluno`,
mesmo padrão de retorno, para o `CredenciaisView` reaproveitar sem adaptador):

```ts
definirSenhaMembro(
  membroId: string,                                   // gps.membros.id, NÃO aluno_id
  opts?: { senha?: string; enviarEmail?: boolean },   // sem senha → gera "Thb-xxxx-xxxx"
): Promise<{
  erro?: string;
  email?: string;          // e-mail do LOGIN do membro (auth.users)
  senha?: string;          // a senha usada — é o que o admin copia/dita
  emailEnviado?: boolean;
  papel?: "titular" | "socio";
  nome?: string | null;    // de thb_alunos casado pelo E-MAIL do login
  telefone?: string | null;// idem — alimenta `linkWhatsapp` (pode ser null)
}>
```

⚠️ **Desvio registrado:** a decisão F.3 escreveu `definirSenhaMembro(membroId, senha)`.
Entregue como `(membroId, opts?)` para ficar idêntica a `definirSenhaAluno(alunoId, opts?)` —
senha opcional (gerada quando ausente) e `enviarEmail` para o botão que não quer disparar
e-mail. Chamada equivalente: `definirSenhaMembro(m.membroId, { senha })`.

**Como usar em `gerenciar-acesso.tsx`** (arquivo do frontend, não tocado por mim): o botão
"Definir senha" por linha já tem tudo o que precisa — `status.membros[].membroId` vem de
`statusAcessoAluno`. O retorno alimenta o mesmo `setCredenciais({ email, senha, emailEnviado,
nome, telefone })` que `definirSenha()` (titular) usa hoje, então a tela de credenciais
(copiar + WhatsApp) serve os dois sem mudança.

**Erros que voltam com texto pronto para o toast** (vêm da RPC, em português):
"Sem permissão." · "A senha precisa ter ao menos 8 caracteres." · "Membro não encontrado." ·
"Este membro ainda não tem login." · "Esta conta é da equipe — a senha não pode ser trocada
por aqui." · "Você não pode trocar a própria senha por aqui — use o seu perfil."
Qualquer outro erro do Postgres vira `"Não foi possível definir a senha deste membro."`
(CD6: nome de constraint não vai ao navegador).

**Banco:** `gps.admin_definir_senha_membro(p_membro_id uuid, p_senha text) returns jsonb`,
migração `supabase/migrations/20260909000132_gps_admin_definir_senha_membro.sql`.
SECURITY DEFINER, `search_path=''`, execute só para `authenticated`. Derruba sessões e
refresh tokens do alvo e grava `gps.acessos_log` com `acao='senha_definida'` e
`detalhe='membro <papel>'`.

### Também mudou de contrato nesta onda (Onda 2, backend)

`assistenciaNavItems(alunoId)` → **`assistenciaNavItems(alunoId, { ambienteCompartilhado })`**
(`src/lib/nav.ts`, UX8). Segundo argumento OBRIGATÓRIO, mesmo motivo de `alunoNavItems`.
Com `ambienteCompartilhado: true` a aba **Financeiro** ganha `adminOnly` → `nav-tabs.tsx` a
marca com `previa-oculta` e ela some na prévia "como o aluno vê". As 10 páginas de
`admin/aluno/[alunoId]/**` já foram convertidas: 3 usam `membros.length > 1` (já carregavam a
lista) e 7 usam `contarMembrosDoAmbiente(alunoId)` (novo em `src/lib/data.ts`, `head:true` +
`cache()` por requisição). **Não é fronteira de segurança** — quem barra o sócio continua sendo
a página `/financeiro` e a RPC `gps.financeiro_do_aluno`.

`gps.plantao_escrita_liberada()` passa a ler **`gps.config` chave `plantao_inscricao_aberta`**
(migração ...130). `src/lib/plantao-data.ts` e `src/app/admin/plantao/actions.ts` já leem/gravam
lá. Sobrou comentário desatualizado citando `gps.plantao_config` em
`src/components/admin/plantao-calendario.tsx:22,155` — arquivo do frontend, **só texto**,
sem efeito de comportamento.
