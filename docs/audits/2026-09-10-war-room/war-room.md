# WAR ROOM — GPS 100% apresentável (10→11/09/2026)

Ordem do João: "o produto tem que estar 100% apresentável amanhã, sem falha nenhuma; roda ciclos de
melhoria até acabar os créditos; o que faltar vai para o ClickUp". Prazo ~9 h. Tokens com cuidado:
auditores só LEEM e devolvem achados com `arquivo:linha` + severidade + correção proposta; corretores
(Opus) só tocam nos arquivos listados; Fable fecha cada ciclo; push por ciclo aprovado.

Regras da casa: `CLAUDE.md` (seções "Rodada final (b)", "🎨 Redesign", "🚀 Mega feature"). Nada de
copy inventada, número inventado, `error.message`, `text-primary` em texto, `opacity` como estado,
`select("*")`, `service_role`, dado fake. Conta de ALUNO de teste existe (o orquestrador reseta
entre ciclos); não há credencial de admin.

## Ciclo 1 — auditoria de produto (leitura), 10/09 noite
### Auditor A — jornada do ALUNO
(home · onboarding · etapa/[n] · clientes (lista/quadro/ficha/novo/contrato/favorito) · materiais ·
pasta · financeiro · suporte/chamados · perfil · sócio · login/cadastro/esqueci/redefinir)

### Auditor B — jornada do ADMIN
(/admin visão geral · alunos · solicitações · etapas · criar acesso · lote · aluno/[id] (assistência,
prévia) · clientes do aluno · diário (notas, @menção, trilha) · financeiro do aluno · chamados do
aluno · resolver (Central) · gerenciar acesso · /admin/chamados · /admin/plantao (calendário,
inscritos, alunos, config))

### Auditor C — código: morto, duplicado, inconsistente
(knip/rg: exports sem uso, componentes órfãos, rotas sem page, textos "GPS", "Áureo", "Close",
`console.`, TODO/FIXME, imports circulares, arquivos > 400 linhas, `any`)

---

## Auditor A — achados

Jornada do ALUNO (login → cadastro → esqueci/redefinir → onboarding → home → etapa → clientes/ficha
→ materiais → pasta → financeiro → chamados → perfil → sócio → nav/proxy/layout), sobre leitura de
código. Não repete o que o `CLAUDE.md` já lista como pendência do João (UX7/canal de contato, SMTP
do Supabase, `chamados_email_equipe` vazio, B10, C7, CSP do LiteSpeed).

### 🔴 quebra / mentira (bloqueia apresentação)

| arquivo:linha | o que está errado | correção | agente |
|---|---|---|---|
| `src/app/auth/confirm/route.ts:14,25` | `next.startsWith("/")` aceita `//evil.com` e `/\evil.com` — é exatamente o open redirect que `destinoInterno()` fechou no login, e este caminho (link do e-mail de recuperação, rota pública) não usa o validador único | trocar por `const next = destinoInterno(searchParams.get("next"))` | backend |
| `src/components/etapa1/etapa1-guide.tsx:181-184` · `src/components/clientes/clientes-manager/index.tsx:307-308` | as duas telas centrais prometem que a aba Clientes "guarda os documentos de cada cliente"; o fichário de documentos foi removido em 07/2026 — só existe o contrato assinado, o resto vive no Drive | trocar a frase para "cadastra, controla o contato e anexa o contrato assinado" | frontend |
| `src/app/etapa/[etapa]/page.tsx:42` | etapa travada individualmente pela equipe (`etapa_liberacao_aluno.liberada=false`, com motivo obrigatório de 3..300) faz `redirect("/")` mudo: o motivo que a Central obriga a equipe a escrever nunca chega ao aluno | renderizar a página com o aviso "Travada para você pela equipe" + motivo, em vez de redirecionar | frontend |
| `src/components/etapas-overview.tsx:98-101,139-141` | a mesma etapa travada só para ele aparece como "Em breve · Libera conforme sua turma avança" — falso: não é a turma, é a equipe, e há motivo escrito | receber o override e dizer "Travada pela equipe" + motivo quando `overrides[etapa].liberada === false` | frontend |
| `src/app/onboarding/actions.ts:437-441` | no passo 0 (obrigatório para todo aluno com senha temporária), repetir a senha atual cai antes no teste `/password/i` e a tela acusa "Senha fraca: escolha uma senha mais forte" — mensagem errada sobre a senha da pessoa | testar `error.code === "same_password"` ANTES do ramo de senha fraca | backend |

### 🟡 UX / consistência

| arquivo:linha | o que está errado | correção | agente |
|---|---|---|---|
| `src/components/clientes/cliente-ficha.tsx:286-289` | `toast.error("Erro ao salvar.")` descarta a frase que a action já traduziu do banco — o aluno não descobre o que a ficha recusou (é a regra da casa desde 09/09) | mostrar `res.erro` num `role="alert"` na barra de salvar | frontend |
| `src/app/clientes/actions.ts:254-261` | `update … .eq("id", clienteId)` sem `.select()`: update que não casa linha nenhuma volta sem erro e a tela diz "Ficha salva." — mesma armadilha já corrigida em `salvarPerfilAluno` | devolver as linhas afetadas e tratar 0 como falha | backend |
| `src/components/etapa/tarefa-item.tsx:73-78` | o checkbox de tarefa (a interação principal do produto) não tem nome acessível: nem `<label>`, nem `aria-label` — leitor de tela anuncia "caixa de seleção" sem dizer qual passo | dar `aria-label` com o código e o título da tarefa | frontend |
| `src/components/auto-logout.tsx:63` | manda para `/login?motivo=inatividade` e nenhuma tela lê `motivo`: a sessão cai no meio do uso e o aluno vê o login limpo, sem explicação | `login/page.tsx` ler `motivo` e mostrar "Sua sessão foi encerrada por inatividade" (`role="status"`) | frontend |
| `src/app/cadastro/cadastro-form.tsx:95-112` | campo de senha escrito à mão (`type={senhaVisivel ? "text" : "password"}`) em vez do `InputSenha`; o botão "mostrar" não tem `aria-label`/`aria-pressed` e a checagem `rg 'type="password"'` do CLAUDE.md não pega essa forma | trocar por `InputSenha` | frontend |
| `src/app/cadastro/page.tsx:26-29` | "Seus dados são vinculados automaticamente e você já acessa o programa" promete acesso que só existe quando o CPF casa; sem match a pessoa vira solicitação pendente | "Se o seu CPF/CNPJ estiver na nossa base, você já entra; se não, a equipe libera" | frontend |
| `src/components/clientes/clientes-manager/index.tsx:307` | a aba Clientes mostra "X de 30 **preenchidos**" (só nome) enquanto home e Etapa 01 mostram `comDados` — três telas, duas réguas para o mesmo número (PL3: "um número, uma verdade") | usar `comDados` no número e `preenchidos` no detalhe | frontend |
| `src/app/page.tsx:216-220` | sem tarefa pendente o `ProximoPassoCard` simplesmente some: a peça mais forte da home vira vazio, sem nenhuma frase | estado "tudo em dia nas etapas liberadas" dizendo o que esperar | frontend |
| `src/components/pasta/pasta-view.tsx:61-68` | "Abrir no Drive" é um `<a>` à mão com `bg-primary` + branco = 2,98:1 (reprova AA), fora do `buttonVariants()` | usar `buttonVariants()` | frontend |
| `src/components/materiais/materiais-view.tsx:227` | chip ativo do filtro com `bg-primary` + `text-primary-foreground` (2,98:1) | trocar por `bg-marca-acao` | frontend |
| `src/app/auth/confirm/route.ts:18-22` | erro de `exchangeCodeForSession`/`verifyOtp` é ignorado: link expirado cai no formulário de nova senha e só falha depois de a pessoa digitar duas vezes | em caso de erro, redirecionar para `/esqueci-senha` com a frase do link expirado | backend |
| `src/components/perfil/trocar-senha.tsx:39` vs `src/components/onboarding/travas.ts:32` | mínimo de senha 6 no cadastro/perfil/redefinir e 8 no onboarding (e nas RPCs de admin): a mesma conta tem duas regras | padronizar 8 nas quatro telas | frontend |
| `src/components/clientes/cliente-ficha.tsx:420-423` | a legenda diz "Problemas (marque ao menos um)" e nada valida — salva com zero | validar antes de salvar ou tirar a exigência do rótulo | frontend |
| `src/app/clientes/actions.ts:318-332` | `definirClienteEquipe` desmarca todos ANTES e, se o segundo update não casar linha (id fora do ambiente), volta sem erro tendo apagado a estrela | conferir as linhas afetadas do segundo update e devolver erro quando for 0 | backend |
| `src/lib/supabase/middleware.ts:72-76` | usuário já logado que abre `/login?redirect=/clientes` vai para "/" e perde o destino do link | redirecionar para `destinoInterno(redirect)` | backend |

### 🔵 polimento

| arquivo:linha | o que está errado | correção | agente |
|---|---|---|---|
| `src/components/home-resumo.tsx:92,104` | "/30" e "/15" escritos à mão em vez de `META_CLIENTES`/`META_REUNIOES` — mudar a meta faz a home mentir | importar as constantes | frontend |
| `src/components/clientes/clientes-manager/index.tsx:105-106,520` | `criadoSemPatch` nunca é preenchido: o comentário descreve um caminho que não existe mais e `abrirFichaHref` é sempre `null` | remover o estado, o prop e o comentário | frontend |
| `src/app/cadastro/actions.ts:28-30` | valida só o tamanho do documento; `documentoValido` (dígitos verificadores), que o cadastro do admin usa, fica de fora — CPF errado só falha depois, virando solicitação pendente | usar `documentoValido` de `masks.ts` | backend |
| `src/app/cadastro/page.tsx:23-25` · `src/app/esqueci-senha/page.tsx:16-18` · `src/app/auth/redefinir/page.tsx:15-17` | `h1 text-lg font-semibold` e `Card` sem `elevacao/size`, enquanto `/login` usa `font-heading titulo-h2` + `Card raised lg`: as 4 telas de entrada não são a mesma família | alinhar com o login | frontend |
| `src/components/etapa1/etapa1-guide.tsx:326-332` | a data de agendamento grava a cada `onChange` do `input[type=date]` e dispara um toast por gravação | salvar no `blur` e um toast só | frontend |
| `src/app/layout.tsx:50` | o skip link usa `bg-primary` com texto branco (2,98:1) — justamente no controle de acessibilidade | trocar por `bg-marca-acao` | frontend |
| `src/app/captacao/page.tsx:16-21` | `AppHeader` sem `navItems`: quem cair em `/captacao` fica sem nenhuma aba, só com o logo | passar `navDoAluno(ctx)` (ou tirar a rota do ar) | frontend |
| `src/components/clientes/acompanhamento-equipe.tsx:50-56` | o único caminho de troca do cliente acompanhado é "abra um chamado"; com `chamados_aberto=false` o aluno chega numa tela que o manda "falar pelos canais de sempre" | quando o suporte estiver fechado, a frase da troca precisa dizer outra coisa | frontend |

**Conferido e OK (não mexer):** favorito da home = o mesmo da lista (`getClienteEquipe`); meta de
honorários igual em home/Clientes/Financeiro (`resumoHonorarios`); `null` nunca vira R$ 0,00 no
Financeiro nem no hero; corte de material de etapa bloqueada no servidor; `proximoPasso` nunca
aponta para tarefa travada; sócio barrado no `/financeiro` com página, não redirect mudo; anexo do
contrato (3 passos, sem `service_role`); diálogo de escolha única do favorito; skip link com alvo
`<main id="conteudo">` nas 17 telas, inclusive nas 4 de entrada (via `AuthLayout`).

---

## Auditor B — achados

Jornada do ADMIN (só leitura, sobre o HEAD atual). Não repete pendência já registrada no
`CLAUDE.md` (chamados_email_equipe, SMTP, B10, C7, CSP do LiteSpeed, revogação de plantão sem log,
validação logada). Ordem: por impacto dentro de cada severidade.

### 🔴 quebra / mentira

| # | arquivo:linha | o que está errado | correção | agente |
|---|---|---|---|---|
| 1 | `src/app/admin/page.tsx:96` × `src/app/admin/chamados/page.tsx:53` | o MESMO badge "Chamados" do header conta coisas diferentes: em `/admin` são os **não-fechados** (`admin_painel_atendimento`, `status <> fechado`), em `/admin/chamados` só os `aberto`. Trocar de tela muda o número sem nada ter mudado | uma definição só (sugerido: não-fechados), calculada num lugar e passada às duas páginas | backend-engineer |
| 2 | `src/app/admin/senha-actions.ts:105` (via `gerenciar-acesso/painel.tsx:194`) | "Definir senha agora" do **titular** chama `admin_definir_senha` sem a checagem de `admin_programas_do_email` que `definirSenhaMembro` faz — troca a senha da pessoa nos 7 portais e derruba as sessões dela **sem nomear os sistemas**. Duas portas para o mesmo efeito, com atritos opostos | `definirSenhaAluno` devolver `precisaConfirmar` + `programas`, e a UI reusar `DialogoOutrosPortais` | backend-engineer |
| 3 | `src/components/admin/criar-acesso.tsx:108` e `:269` | "Criar login agora" com e-mail já existente **adota** a conta (`permitirAdocao` default `true`) e troca a senha nos outros portais — sem `DialogoConfirmacao`, só uma caixa azul informativa. O lote usa `permitirAdocao:false` exatamente por isso | confirmação nomeando os programas antes de adotar (mesma copy do lote) | frontend-engineer |
| 4 | `src/components/admin/plantao-acessos.tsx:148` | `toast.success("Acesso revogado.")` dispara **fora** da transition, antes do resultado: se a action falhar, a tela mostra sucesso E erro. Idem `onReativar` (`:153`) | mover o toast para o callback de sucesso de `executar()` | frontend-engineer |
| 5 | `src/components/admin/plantao-calendario/index.tsx:168` + `supabase/migrations/20260901000001_gps_plantao_estrutura.sql:180` | "Remover" faz `delete` no slot e a FK é `on delete cascade`: leva junto as inscrições canceladas com **`presenca_em`, `nps_nota` e `nps_comentario`**. O `window.confirm` não diz isso e a copy do card cancelado ainda sugere "use remover para tirar da agenda" | arquivar (`removido_em`) em vez de apagar; no mínimo, confirmação nomeada dizendo que presença e NPS somem | arquiteto → backend-engineer |
| 6 | `src/components/admin/alunos-ativos-lista/lote-acesso.tsx:76` e `:91` | o relatório por pessoa lê `nomeDe`/`telefoneDe` de `candidatos`, que o `router.refresh()` esvazia (os alunos saem do filtro "sem login"): quem ficou **sem e-mail** vira "Aluno" e a mensagem de WhatsApp sai sem nome e sem telefone — justo o caso em que a senha só existe ali | congelar o mapa nome/telefone no clique, junto com `setRelatorio` | frontend-engineer |
| 7 | `src/lib/data/alunos.ts:302` → `alunos-ativos-lista/index.tsx:188` | falha da RPC devolve `{alunos:[],total:0}` e a lista mostra **"Nenhum aluno no programa ainda"** com CTA de criar acesso — indistinguível de base vazia. É o defeito que `getDashboard()` evita de propósito na aba ao lado | propagar `erro` e renderizar `ErroPainel`, nunca o `EmptyState` | backend-engineer + frontend-engineer |
| 8 | `src/components/admin/etapas-controle.tsx:73` | "Bloquear" tranca a etapa para **todos** os alunos num clique, com UI otimista e sem confirmação nomeada (regra da casa). Bloquear a Etapa 01 tira o portal do ar para os 158 ambientes | `DialogoConfirmacao` com a consequência e a contagem de ambientes afetados | frontend-engineer |
| 9 | `src/components/clientes/ficha-cabecalho.tsx:153` + `clientes/acompanhamento-equipe.tsx:283` | o bloco "Equipe" (Confirmar/Liberar acompanhamento) **não tem `previa-oculta`**: aparece na prévia "como o aluno vê", junto da variante `admin` do `AvisoAcompanhamento` (`:129`). A prévia mente na única pergunta que ela existe para responder | `previa-oculta` no bloco e `admin={false}` no aviso quando a prévia está ligada | frontend-engineer |
| 10 | `src/components/admin/solicitacao-card.tsx:66` | a action devolve instrução pronta ("este login já participa de outro ambiente… remova em Gerenciar acesso") e a tela troca por **"Erro ao aprovar solicitação."**; o admin nunca descobre o porquê. Idem `criar-acesso.tsx:141` | exibir `res.erro`, que já vem traduzido em português | frontend-engineer |

### 🟡 UX / consistência

| # | arquivo:linha | o que está errado | correção | agente |
|---|---|---|---|---|
| 11 | `supabase/migrations/20260909000158_gps_admin_diagnostico_ambiente.sql:286` + `central/catalogo.ts:173` | a Central conta chamados **não-fechados** mas escreve "Chamado aberto esperando resposta da equipe" — com `respondido` a bola é do aluno e a linha acusa a equipe indevidamente | separar aberto × respondido no `valor`/`detalhe` da verificação | backend-engineer |
| 12 | `src/components/admin/dashboard/index.tsx:381` | o card "Esperando a equipe" SOMA pendências + chamados (unidades diferentes — o card 5 proíbe isso em comentário) e vale só sobre o lote, enquanto o badge do header na mesma tela vale sobre a base inteira | dois números lado a lado, sem somar; alinhar o escopo com o badge | frontend-engineer |
| 13 | `src/app/admin/actions.ts:25` | a senha temporária nasce `Gps-3f9a2b` e vai por e-mail e WhatsApp ao aluno — "GPS" é nome interno e não aparece para o usuário desde 09/07. O outro gerador já usa `Thb-` (`senha-actions.ts:29`) | um gerador só, com prefixo `Thb-` | backend-engineer |
| 14 | `criar-acesso.tsx:208` e `:220` · `credenciais-view.tsx:81` · `cadastrar-aluno-form.tsx:183` · `plantao-acessos.tsx:278` · `plantao-calendario/interruptor-inscricoes.tsx:90` · `trilha-do-aluno.tsx:111` | seis blocos em paleta Tailwind CRUA (`amber-700`, `blue-700`, `green-700`) contornando os 4 pares semânticos do redesign; contraste nunca medido (essas telas não estavam nas 8 do `contraste-B.mjs`) e `AvisoInline` existe exatamente para isso | trocar por `AvisoInline`/tokens `sucesso\|atencao\|risco\|neutro` e remedir | frontend-engineer |
| 15 | `plantao-acessos.tsx:142` · `plantao-calendario/index.tsx:170` · `plantao-mentoras.tsx:82` | três ações destrutivas do Plantão ainda em `window.confirm`: sem consequência escrita, sem botão nomeado, sem devolução de foco, fora da linguagem visual | migrar as três para `DialogoConfirmacao` | frontend-engineer |
| 16 | `src/components/admin/plantao-calendario/card-slot.tsx:158` | "Remover" fica habilitado em slot com inscritos ativos e o servidor recusa depois; a tela **tem** `inscritosQtd`, e a regra do repo é não deixar clicar para o servidor recusar | desabilitar com a razão escrita ao lado, como no lote de acesso | frontend-engineer |
| 17 | `src/components/admin/alunos-ativos-lista/aluno-card.tsx:329` | o botão "Reenviar acesso" **não reenvia nada**: leva à mesma ficha do link do card, e lá o admin ainda tem de achar "Gerenciar acesso" | renomear ("Resolver acesso") ou abrir o diálogo direto | frontend-engineer |
| 18 | `src/components/admin/criar-acesso.tsx:87` | se `diagnosticarLoginAluno` falhar, `diag` fica `null` e a tela **não diz nada**: o admin cria login sem saber de outros portais nem de direito ao acesso | tratar o erro com aviso ("não foi possível conferir; confira antes de criar") | frontend-engineer |
| 19 | `src/app/admin/actions.ts:64` | `buscarAlunos` interpola o termo cru dentro do `.or()` do PostgREST: vírgula no que o admin digita vira filtro extra (injeção de filtro sobre `thb_alunos`; hoje só admin, mas é a base inteira) | escapar vírgula/parênteses ou migrar para RPC com parâmetro | security-pentester + backend-engineer |
| 20 | `src/app/admin/plantao/page.tsx:113` | as abas do Plantão vivem em `defaultValue` (estado local): navegar o mês (`?m=`) recarrega o Server Component e joga o admin de volta em "Calendário"; `/admin` e `/admin/chamados` já resolveram isso | `?aba=` com allowlist, no padrão de `abas-painel.tsx` | frontend-engineer |
| 21 | `src/components/admin/painel-url.ts:197` | se a última tela do painel foi a "Visão geral", "← Voltar aos alunos" devolve o **dashboard**, não a lista que o rótulo promete | forçar `aba=ativos` quando a URL gravada não tiver aba | frontend-engineer |

### 🔵 polimento

| # | arquivo:linha | o que está errado | correção | agente |
|---|---|---|---|---|
| 22 | `src/components/admin/alunos-ativos-lista/ancora.ts:47` | a chave da âncora só é consumida quando a lista MONTA (a aba `ativos` desmonta quando inativa): sair pela aba Plantão e voltar depois faz a tela pular sozinha para um card que ninguém pediu — o caso que o próprio comentário quer evitar | consumir a chave ao sair de `/admin`, ou dar validade curta | frontend-engineer |
| 23 | `src/components/admin/etapas-controle.tsx:20` | a aba Etapas diz "para **todos** os alunos" e ignora os overrides por ambiente (`gps.etapa_liberacao_aluno`): "Liberada" aqui pode não ser o que aquele aluno vê | contar os overrides e escrever a exceção ao lado do interruptor | backend-engineer + frontend-engineer |
| 24 | `src/app/admin/chamados/[chamadoId]/page.tsx:16` · `src/app/admin/aluno/[alunoId]/diario/page.tsx:27` | `metadata` estática ("Admin — Chamado", "Diário do aluno") — com 8 abas abertas a equipe não distingue de quem é cada uma | `generateMetadata` com o assunto / o nome do aluno | frontend-engineer |

**O que NÃO mexer:** a Central (`central/**` + `central-actions.ts`), o Diário/trilha, `estado-na-url.ts`,
o saneamento de `painel-url.ts`, a regra por id de `ancora.ts` e os espelhos do modo assistência
(guarda + `assistenciaNavItems` conferidos um a um) — lidos linha a linha, coerentes com o `CLAUDE.md`.

## Auditor C -- achados

### 1. Exports/arquivos sem uso em `src/` (knip + confirmacao por `rg`)

Confirmados mortos (zero import externo alem da propria declaracao/comentario):
- `src/app/admin/actions.ts:496` regiao -- export `removerAlunoGps` (so declarado, 0 chamadores)
- `src/app/admin/plantao/actions.ts:61-64` -- re-exports `marcarPresencaInscrito`, `editarNomeInscricao`, `cancelarInscricaoPeloAdmin`, `inscreverAlunoNoSlot` (barril morto: quem usa importa direto de `inscritos-actions.ts`)
- `src/components/admin/alunos-ativos-lista/estado-na-url.ts:86` -- `lerEstado` (so usado dentro do proprio arquivo)
- `src/components/admin/alunos-ativos-lista/estado-na-url.ts:108` -- `escreverEstado` (idem)
- `src/components/admin/alunos-ativos-lista/ordenacao.ts:34` -- `diaLocal` (so uso interno ao arquivo)
- `src/components/admin/alunos-ativos-lista/ordenacao.ts:43` -- `diasDesde` (idem; existe funcao homonima local nao relacionada em `secao-onboarding.tsx:52`)
- `src/components/admin/diario-mencoes.tsx:31` -- `MAX_MENCOES` (duplicada como const privada em `src/app/admin/diario-actions.ts:36`; o export do componente nao e importado em lugar nenhum)
- `src/components/admin/painel-url.ts:37` -- `CHAVE_URL_PAINEL`
- `src/components/admin/painel-url.ts:63` -- `sanitizarUrlDoPainel`
- `src/components/clientes/acompanhamento-equipe.tsx:50` -- `HREF_CHAMADO_TROCA`
- `src/components/clientes/clientes-manager/clientes-chips.tsx:56,86,140` -- `EstrelaTravada`, `EstrelaEscolhida`, `StarButton` (usados so entre si dentro do proprio arquivo)
- `src/components/onboarding/passo-texto.tsx:8` -- `MAX_TEXTO`
- `src/components/ui/badge.tsx:110` -- `badgeVariants`
- `src/components/ui/dialog.tsx:184-185` -- `DialogOverlay`, `DialogPortal`
- `src/components/ui/progress.tsx` -- `ProgressTrack`, `ProgressIndicator`, `ProgressLabel`, `ProgressValue`
- `src/components/ui/select.tsx` -- `SelectGroup`, `SelectLabel`, `SelectScrollDownButton`, `SelectScrollUpButton`, `SelectSeparator`
- `src/components/ui/table.tsx` -- `TableFooter`, `TableCaption`
- `src/components/ui/tabs.tsx` -- `tabsListVariants`
- `src/components/ui/graficos/index.ts:20,22` -- re-exports `LegendaValores`, `COR_DO_TOM` (barril morto: os 5 usos reais importam direto de `./legenda-valores` / `./tipos`)
- `src/lib/chamados-data.ts:244` -- `contarChamadosAbertosPorAluno` (so citado em comentario de `src/app/admin/chamados/page.tsx:28`)
- `src/lib/data.ts:41,56` -- re-exports `getClientesHonorarios`, `mapearStatusAcesso` (barril morto: os usos reais importam de `src/lib/data/clientes.ts` e `src/lib/data/central.ts`)
- `src/lib/etapas.ts:62` -- `etapaLiberadaPara` (so chamado internamente em `etapas.ts:84`)
- `src/lib/financeiro.ts:54` -- re-export `progressoFaturamento` (barril morto: usuario real e `src/lib/etapa1.ts`, importado direto)
- `src/lib/financeiro.ts:62` -- `TOLERANCIA_CENTAVOS` (so uso interno ao arquivo)
- `src/lib/slack.ts:67` -- `slackConfigurado` (0 chamadores; so citada em comentario)
- `src/lib/slack.ts:73` -- `webhookConfigurado` (marcada @deprecated, 0 chamadores)
- `src/lib/types.ts:373` -- `TIPOS_EVENTO` (usado so para derivar o tipo `TipoEvento` na linha seguinte; nenhum import externo do array)

Tipos exportados sem uso (11 grupos, ver knip): `ProgramaDoLogin` (admin/actions.ts), `CriarSlotInput`/`EditarSlotInput`/`CriarMentoraInput`/`EditarMentoraInput` (admin/plantao/actions.ts), `Mencionavel` (diario-mencoes.tsx), `SerieLinha`/`FormatarValor`/`PontoGrafico` (graficos/index.ts), 17 tipos de `src/lib/data.ts`, `SolicitacaoPendenteDiagnostico` (lib/data/central.ts), 8 tipos de `lib/data/dashboard.ts`, `NivelFaturamento`/`ContratadoResumo` (etapa1.ts e financeiro.ts, duplicados), `OverrideLiberacao` (etapas.ts), `StatusCliente`/`RespostasOnboarding` (types.ts).

knip tambem aponta 31 scripts de auditoria/shots em `tmp/squad/` e `docs/audits/` como "unused files" -- sao scripts de war-room anteriores, nao codigo de produto; nao listados aqui item a item.

### 2. Componentes/rotas orfaos

- Nenhum componente `.tsx` de `src/components/**` esta sem importador (checagem por nome de arquivo em todo `src`).
- `src/app/etapa/` e `src/app/onboarding/` so tem `actions.ts` (+ `anexo-actions.ts`) sem `page.tsx` proprio -- nao sao orfaos: `src/app/etapa/actions.ts` e importado por `src/app/etapa/[etapa]/page.tsx` (relativo) e por `src/components/etapa/etapa3-guide.tsx`; `src/app/onboarding/actions.ts`/`anexo-actions.ts` sao importados por `src/app/clientes/actions.ts`, `src/components/onboarding/onboarding-gate.tsx`, `src/components/onboarding/tipos.ts`, `src/components/perfil/anexo-do-inicio.tsx`. Padrao ja documentado no CLAUDE.md (barril de actions ao lado da rota dinamica).

### 3. Textos proibidos / padroes banidos

- GPS/Aureo em `.tsx`: todas as ocorrencias encontradas sao comentario ou identificador interno (`nivelAtual === "aureo"`, `p !== "GPS"` como chave de filtro) -- nenhum texto visivel ao usuario.
- `sr-only` com "Close": ja corrigido -- `src/components/ui/dialog.tsx:104` usa "Fechar", com comentario explicando a correcao anterior.
- Ingles em UI (Loading/Submit/Cancel/Save/Delete/Error): 0 ocorrencias.
- TODO/FIXME/XXX: 0 ocorrencias reais (so a palavra "TODO/TODOS" em portugues, ex. `src/app/admin/actions.ts:496`, `src/components/ui/button.tsx:15`).
- `console.(log|error|warn)` fora de `src/lib/log.ts`: `src/lib/email.ts:48,53,79,84` usa `console.warn`/`console.error` diretamente (deveria passar por `logErro` de `src/lib/log.ts`, conforme regra do CLAUDE.md).
- `error.message` fora de comentario: `src/app/admin/actions.ts:557,622,625` e `src/app/onboarding/actions.ts:437` leem `error.message` (regex sobre already/password/rate limit para decidir o fluxo -- nao expoem direto ao usuario, mas violam a letra da regra "nunca ler error.message").
- `select("*")`: `src/app/etapa/actions.ts:20` (addAgendamentoEtapa3) -- unico residuo; todo o resto do codigo ja declara colunas.
- `dark:`: 0 ocorrencias (.dark foi removido, confirma CLAUDE.md).
- `text-primary` em texto (nao icone): 0 ocorrencias -- todas as 20+ ocorrencias de `text-primary` em `.tsx` sao wrappers de icone (`<Icon className="... text-primary" />` ou `<div className="... text-primary"><Icon/></div>`), nenhuma aplicada a no de texto.
- `opacity-` como estado: 0 ocorrencias fora de hover/disabled -- os unicos usos livres sao decorativos (`opacity-70` em icone AtSign, `after:opacity-0/100` de sublinhado de aba ativa em `tabs.tsx:73`).
- `Intl.NumberFormat` fora de `src/lib/moeda.ts`: 0 ocorrencias.
- `America/Sao_Paulo` literal fora de `src/lib/datas.ts`: so comentarios, exceto `src/lib/data/dashboard.ts:182` -- `fuso: String(ref.fuso ?? "America/Sao_Paulo")` e literal de codigo (fallback), nao comentario.
- Regex de e-mail fora de `src/lib/texto.ts`: `src/app/admin/actions.ts:159` (`/^\S+@\S+\.\S+$/.test(email)`); `src/components/admin/cadastrar-aluno-form.tsx:98` (`/\S+@\S+\.\S+/.test(termoInicial)`, heuristica "parece e-mail" na busca, nao validacao, mas e regex de e-mail duplicada).
- `.replace(/\D/g` fora de `src/lib/masks.ts`: 0 ocorrencias (unico uso e a propria soDigitos em `masks.ts:4`).

### 4. Arquivos > 400 linhas e `any` explicito

`any`/`as any`: 0 ocorrencias em `src/`.

Arquivos `src/**/*.ts*` acima de 400 linhas (21 no total): `src/app/admin/actions.ts` 835, `src/app/admin/plantao/slots-actions.ts` 731 (documentado no CLAUDE.md como intencional), `src/app/clientes/actions.ts` 715, `src/components/clientes/cliente-ficha.tsx` 677, `src/lib/types.ts` 620, `src/lib/etapa1.ts` 598, `src/lib/financeiro.ts` 578, `src/components/clientes/clientes-manager/index.tsx` 561, `src/lib/data/diario.ts` 553, `src/components/admin/dashboard/index.tsx` 523, `src/components/onboarding/index.tsx` 467, `src/components/financeiro/programa-card.tsx` 453, `src/app/onboarding/actions.ts` 448, `src/lib/chamados-data.ts` 432, `src/app/admin/senha-actions.ts` 423, `src/lib/data/alunos.ts` 416, `src/app/admin/central-actions.ts` 416, `src/components/admin/gerenciar-acesso/painel.tsx` 410 (documentado como o maior aceitavel), `src/app/chamados/actions.ts` 410, `src/components/admin/central/index.tsx` 409, `src/components/admin/plantao-calendario/index.tsx` 404.

### 5. Rotulos exaustivos

- `TIPOS_EVENTO` (`src/lib/types.ts:373`, 26 valores) x `ROTULO_TIPO_EVENTO` (`src/components/admin/diario-labels.ts:45`, Record<TipoEvento,string>): alinhados (TS garante exaustividade; conferido 1 a 1).
- `TIPOS_EVENTO` x CHECK aluno_eventos_tipo_check em `supabase/migrations/20260910000214_gps_cliente_contrato_anexo.sql:281-309`: 26 valores em ambos, mesma lista, alinhados.
- `ROTULO_MACRO_POR_TIPO` (`src/lib/log-agregacao.ts:174`, Partial<Record<TipoEvento,...>>): tem 20 dos 26 tipos. Faltam (sem cair em erro, e Partial de proposito): cliente_excluido, conta_criada, email_confirmado, primeiro_acesso, entrou_no_programa (sem comentario justificando a ausencia, ao contrario de onboarding_iniciado/onboarding_concluido, que tem comentario explicito).
- `acessos_log.acao` (CHECK acessos_log_acao_check em `supabase/migrations/20260910000200_gps_acessos_log_acoes_do_onboarding.sql:66-78`, 15 valores) x `ROTULO_ACAO_ADMIN` (`src/components/admin/diario-labels.ts:90-108`, 15 valores): alinhados, mesma lista.
- `FRASES_DO_BANCO` (`src/lib/erros.ts:45-266`) x raise exception das migrations 20260909000150+ e 20260910000*: das 108 frases distintas levantadas, 26 nao aparecem no mapa (uma delas, "Sem direito ao acesso: %", e coberta por mecanismo a parte: PREFIXO_DIREITO/startsWith, erros.ts:273,315, portanto nao e gap real). As 25 frases realmente sem mapeamento (caem em POR_CODIGO/GENERICA, ou seja, o admin/aluno veria mensagem generica em vez da especifica):
  - Dominio Plantao (migrations 2026090900018{0,1,2,3}*.sql, chamadas por `src/app/admin/plantao/inscritos-actions.ts` e `alunos-actions.ts` sem frasesExtras): "A edicao do painel esta temporariamente indisponivel.", "Inscricao nao encontrada, ou ja cancelada.", "Inscricao nao encontrada.", "Esta inscricao ja estava cancelada, ou nao existe.", "O motivo pode ter no maximo 300 caracteres.", "O nome pode ter no maximo 120 caracteres.", "Este e-mail nao esta na base de compradores do Acelera (ou esta bloqueado). Use Liberar aluno antes de inscrever.", "Plantao nao encontrado."
  - Dominio Onboarding (`supabase/migrations/20260910000206_gps_onboarding_rpcs.sql`, chamado por `src/app/onboarding/actions.ts` sem frasesExtras): "Campo nao reconhecido no questionario: %" (placeholder, nunca bateria por igualdade mesmo se entrasse no mapa), "dados do passo em formato invalido", "passo fora da faixa"
  - Guardas internas de parametro ausente/sem permissao (minusculas, sem acento, varias RPCs de ...152 a ...214): "aluno nao informado", "aluno ou etapa nao informado", "ambiente ou membro nao informado", "anexo nao informado", "apenas administradores", "cliente nao informado", "contrato nao informado", "membro nao informado", "membro ou ambiente de destino nao informado", "nota nao informada", "sem permissao"
  - Config ausente (migrations 2026090900017{0,3,4,6}*.sql, cron/RPC do Plantao): "gps.config.resend_api_key nao configurada"

### 6. `.env.example` x envs lidas no codigo

Lidas em `src` (process.env.*) e ausentes de `.env.example`: SLACK_BOT_TOKEN, SLACK_CANAL_MENCOES, SLACK_WEBHOOK_MENCOES -- todas em `src/lib/slack.ts:58,59,61` (feature de mencao para Slack da mega feature de 10/09, ainda desligada; EMAIL_SUPORTE ja esta documentado em `.env.example`). Todas as demais envs lidas (EMAIL_FROM, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, PLANTAO_MANUTENCAO_SEGREDO, RESEND_API_KEY) estao documentadas.

---

## F3 — feito

Corretor da UI do ALUNO. Só os arquivos do escopo. `tsc` e `eslint` limpos (saída literal no fim).
**Nada validado no navegador**: não há dev server de pé e o F3 está proibido de rodar `next dev`.

| # | achado | arquivo:linha | o que ficou |
|---|---|---|---|
| 1 | 🔴 "guarda os documentos de cada cliente" | `src/components/etapa1/etapa1-guide.tsx:196-199` · `src/components/clientes/clientes-manager/index.tsx:319-320` | "cadastra/cadastre, controla/controle o contato e anexa/anexe o contrato assinado". Comentário nos dois lugares lembrando que o fichário saiu em 07/2026 e que o único arquivo é o contrato (`gps-onboarding`) |
| 2 | 🔴 etapa travada para ELE fazia `redirect("/")` mudo | `src/app/etapa/[etapa]/page.tsx:47-56,84-125` | `travadaPelaEquipe = override?.liberada === false` → a página ABRE: badge `warning` "Travada para você pela equipe" + motivo num bloco com `role="alert"`, e o conteúdo é substituído por `EmptyState` (cadeado + "Voltar ao início"). `EtapaConteudo` não monta. Etapa bloqueada só no global (sem override) continua redirecionando. `notFound()` novo para `etapaInfo` ausente (o guard antigo era `?.`) |
| 3 | 🔴 "Em breve · Libera conforme sua turma avança" numa etapa travada pela equipe | `src/components/etapas-overview.tsx:35-73,116-131,161-174` | prop opcional `overrides?: OverridesLiberacao`. `=== false` → badge `warning` + `Lock` "Travada pela equipe" e o motivo no lugar da microcopy da turma; `=== true` → badge `success` "Liberada para você" + linha "Liberada para você pela equipe." + motivo. Sem `overrides` o card é o de antes |
| 3b | passar `overrides` nos chamadores | `src/app/page.tsx:114-124,133,259` | o `Promise.all` passou a devolver `{ etapas, overrides }` (antes jogava o mapa fora) |
| 4 | 🟡 `toast.error("Erro ao salvar.")` engolia `res.erro` | `src/components/clientes/cliente-ficha.tsx:135-146,319,672-682` | estado `erroSalvar` → `role="alert"` na barra de salvar (substitui "Tudo salvo."/"alterações não salvas" enquanto existe). O erro do link do contrato foi para o mesmo lugar (era outro toast) |
| 4b | 🟡 "Problemas (marque ao menos um)" não validava | `src/components/clientes/cliente-ficha.tsx:211-216,281,457-462,487-494` | **escolhido validar.** Razão escrita no código: a tarefa 1 da Etapa 01 é "30 clientes com ao menos 1 dos 7 problemas" — o problema é o que qualifica a pessoa; rótulo que não vale ensina a ignorar rótulo. Custa 1 clique, marca o grupo (`aria-describedby` no `fieldset` + contorno) e **não mexe em métrica**: `comDados` é nome+telefone+nível |
| 5 | 🟡 checkbox de tarefa sem nome acessível | `src/components/etapa/tarefa-item.tsx:75-83` | `aria-label={`Passo ${codigo}: ${t.titulo}`}` |
| 6 | 🟡 `?motivo=inatividade` que ninguém lia | `src/app/login/page.tsx:12-26,44-52` | allowlist de 1 valor (nada da URL é ecoado) → `role="status"` + `AvisoInline` com `Clock`: "Sua sessão foi encerrada por inatividade. Entre de novo." |
| 6b | 🟡 `?erro=link` do `/auth/confirm` | `src/app/esqueci-senha/page.tsx:11-35` | "Este link expirou ou já foi usado. Peça um novo." em `role="status"`. (O F1 já tinha posto o redirect em `auth/confirm/route.ts:43`) |
| 7 | 🟡 campo de senha à mão no cadastro | `src/app/cadastro/cadastro-form.tsx:8,17-24,104-115` | `InputSenha` (o campo único do portal); saiu o estado `senhaVisivel` e o botão "mostrar" sem `aria-label`/`aria-pressed` |
| 7b | 🟡 copy do cadastro prometia acesso que só existe com match de CPF | `src/app/cadastro/page.tsx:24-40` | "Se o seu CPF/CNPJ estiver na nossa base, você já entra; se não, sua solicitação fica registrada e a equipe libera o acesso." |
| 7c | 🟡 mínimo de senha 6 × 8 na mesma conta | `cadastro-form.tsx:24` · `perfil/trocar-senha.tsx:16` · `auth/redefinir/redefinir-form.tsx:14` | `const SENHA_MINIMO = 8` por tela (comentário explicando), **mesmo texto nas três**: "A senha precisa ter ao menos 8 caracteres." / "Mínimo de 8 caracteres". O onboarding já era 8. `trocar-senha` ganhou `minLength`, que não tinha |
| 8 | 🟡 KPI "X de 30" com régua diferente da home | `src/components/clientes/clientes-manager/index.tsx:32-36,119-129,319-329` | número = `comDados`, detalhe = "N com nome · N com nome, telefone e nível". A conta vem de `calcularMetricasEtapa1(clientes, {})` — a MESMA função da home e da Etapa 01, em vez de um `filter` local |
| 8b | 🔵 `criadoSemPatch`/`abrirFichaHref` mortos | `clientes-manager/index.tsx` (estado, `abrirNovo`, `onCancelar`) · `clientes-manager/dialogo-novo-cliente.tsx:22,26,44-60,159-168` | removidos o estado, o prop, o comentário e o ramo "Abrir ficha"/"Fechar" do rodapé; os imports `Link`/`buttonVariants` saíram junto |
| 9 | 🟡 sem próximo passo, o bloco mais forte da home sumia | `src/components/etapa/tudo-em-dia-card.tsx` (novo) · `src/app/page.tsx:181-187,231-241` | `TudoEmDiaCard`: mesma forma do `ProximoPassoCard` (48 px, `rotulo`/`titulo-h2`/`corpo-sm`) **sem** `<a>` nem botão (não há ação). Expectativa verdadeira: nomeia a próxima etapa bloqueada e diz que ela abre "conforme sua turma avança, ou quando a equipe abrir para você"; sem etapa bloqueada, a frase muda |
| 10 | 🟡 contraste 2,98:1 | `pasta-view.tsx:64-73` (→ `buttonVariants()`) · `materiais-view.tsx:226-234` (chip ativo → `border-marca-acao bg-marca-acao text-white`) · `layout.tsx:50-53` (skip link → `focus:bg-marca-acao focus:text-white`) | os três com o comentário do par medido (#C74600 + branco = 4,88:1) |
| 11 | 🔵 "/30" e "/15" à mão | `src/components/home-resumo.tsx:2-6,95-101,109-110` | `META_CLIENTES`/`META_REUNIOES` importados de `@/lib/etapa1` |
| 11b | 🔵 telas de entrada fora da família do `/login` | `cadastro/page.tsx:24-25` · `esqueci-senha/page.tsx:40-42` · `auth/redefinir/page.tsx:15-18` | `Card elevacao="raised" size="lg"` + `h1 font-heading titulo-h2` nas três |
| 11c | 🔵 data de agendamento gravava a cada `onChange` | `src/components/etapa1/etapa1-guide.tsx:69-71,117-140,352-357` | grava no `blur`, um toast. A régua do "mudou?" é `dataSalva` (último valor **confirmado pelo servidor**), não a prop inicial — senão voltar ao valor de origem depois de gravar outro seria descartado em silêncio |
| 11d | 🔵 `/captacao` sem nenhuma aba | `src/app/captacao/page.tsx:3,23-33,41` | `adminNavItems()` para admin, `navDoAluno(ctx)` para aluno, nenhuma para `sem_acesso` (não há para onde mandá-lo) |

**Fora do meu escopo, para quem for dono:**
- `src/app/admin/aluno/[alunoId]/page.tsx:117` é o **outro chamador** de `EtapasOverview` e **não recebeu `overrides`** (arquivo do F2). Ele já carrega `getEtapasLiberadasPara(alunoId)` na linha 57 e só precisa de `overrides={...}` no componente — sem isso, o admin continua vendo "Em breve" numa etapa que ele mesmo travou. A prop é opcional, então nada quebra enquanto isso.
- `src/app/cadastro/actions.ts:32` ainda recusa senha com **6** caracteres no servidor (F1). O cliente agora exige 8 nas quatro telas; o servidor ficou mais frouxo que a UI — não é buraco (o `signUp` do Supabase é quem manda), mas é a mesma régua em dois lugares.
- `src/app/auth/redefinir/redefinir-form.tsx` não está na lista literal do F3 (que fala em `**/page.tsx`), mas era onde o mínimo de senha do `/auth/redefinir` vivia; ninguém mais mexeu nele nesta rodada.

**Saída literal:**

```
$ npx tsc --noEmit
(sem saída, exit 0)

$ npx eslint <os 16 caminhos do escopo do F3>
(sem saída, exit 0)
```

⚠️ `npx eslint src/app src/components` (repo inteiro) passou limpo às 2 primeiras rodadas e
agora **falha em 1 erro que não é do F3**, num arquivo do F2 que mudou no meio do caminho:

```
src/components/admin/gerenciar-acesso/index.tsx
  54:5  error  Calling setState synchronously within an effect can trigger cascading renders
         react-hooks/set-state-in-effect
✖ 1 problem (1 error, 0 warnings)
```

---

## F1 — feito

Corretor F1 (backend), 10/09. `npx tsc --noEmit` → **exit 0, zero saída**.
`npx eslint` nos 21 arquivos tocados → **exit 0, zero saída**. Sem commit, sem build.

### Item a item (arquivo:linha)

| # | o que foi feito | onde |
|---|---|---|
| 1 | `next` agora passa por `destinoInterno()` (fecha `//evil.com` e `/\evil.com`); erro de `exchangeCodeForSession`/`verifyOtp` deixa de ser descartado e redireciona para `/esqueci-senha?erro=link`, com `logErro` sem PII | `src/app/auth/confirm/route.ts:4,27,36-44` |
| 2 | logado em `/login?redirect=...` vai para `destinoInterno(redirect)` via `new URL(destino, request.url)` (preserva query/hash) | `src/lib/supabase/middleware.ts:5,75-83` |
| 3 | `same_password` testado ANTES de senha fraca e classificação por `error.code`; leitura de `error.message` sobrou só como fallback quando `code` é `null` | `src/app/onboarding/actions.ts:437-465` · `src/app/admin/actions.ts:595-602,617-641` |
| 4 | `atualizarCliente` com `.select("id")` + 0 linhas = erro nomeado; `definirClienteEquipe` confere o alvo ANTES de desmarcar e confere as linhas do 2º update | `src/app/clientes/actions.ts:258-281` · `:337-392` |
| 5 | `documentoValido` (dígito verificador) no cadastro público | `src/app/cadastro/actions.ts:4,31-37` |
| 6 | `saneParaFiltro()` antes do `.or()`; `emailValido`; gerador único `Thb-`; `removerAlunoGps` apagada | `src/app/admin/actions.ts:41-68,86-104,200,572,749-753` |
| 7 | `definirSenhaAluno` ganhou a guarda cross-sistema (shape abaixo) | `src/app/admin/senha-actions.ts:85-150` |
| 8 | badge "Chamados" com UMA definição (não-fechados) em `contarChamadosDoBadge`; `contarChamadosAbertosPorAluno` apagada | `src/lib/chamados-data.ts:230-266` · `src/app/admin/page.tsx:15,92-102` · `src/app/admin/chamados/page.tsx:4,27-31,54-57` |
| 9 | migração 216 (SQL executável, abaixo) + rótulo "Chamados em andamento" | `supabase/migrations/20260910000216_gps_diagnostico_chamados_respondidos.sql` · `src/components/admin/central/catalogo.ts:175-183` |
| 10 | `console.warn`/`console.error` → `logAviso`/`logErro` | `src/lib/email.ts:14-18,20,55,60,86-92,96` |
| 11 | 24 frases novas em `FRASES_DO_BANCO` + `FALTA_PARAMETRO`; log-agregação com a justificativa | `src/lib/erros.ts:45-50,271-345` · `src/lib/log-agregacao.ts:199-213` |
| 12 | `SLACK_BOT_TOKEN`, `SLACK_CANAL_MENCOES`, `SLACK_WEBHOOK_MENCOES` documentadas (sem valor) | `.env.example:47-64` |
| 13 | falha da RPC devolve `erro` (shape abaixo) | `src/lib/data/alunos.ts:237-259,310-320` |
| 14 | exports mortos removidos | ver lista abaixo |

### Shapes publicados (para o F2)

**Item 7 — `definirSenhaAluno(alunoId, opts?)`** (`src/app/admin/senha-actions.ts:85`).
O shape é o MESMO de `definirSenhaMembro`, de propósito — a UI reusa
`DialogoOutrosPortais` sem ramo novo:

```ts
definirSenhaAluno(alunoId: string, opts?: {
  senha?: string;
  enviarEmail?: boolean;
  confirmarOutrosSistemas?: boolean;   // só `true` DEPOIS de o admin ler os programas
}): Promise<{
  erro?: string;
  email?: string; senha?: string; emailEnviado?: boolean;
  nome?: string | null; telefone?: string | null;
  precisaConfirmar?: boolean;          // true = NADA foi alterado
  programas?: string[];                // nomes dos outros portais, "GPS" já filtrado
}>
```

Fluxo idêntico ao de `definirSenhaDeMembro` em
`gerenciar-acesso/painel.tsx:163-192`: se `res.precisaConfirmar`, guarde
`res.programas`, mostre o diálogo e repita com `confirmarOutrosSistemas: true`.
`definirSenha()` (`painel.tsx:194`) hoje ignora os dois campos — enquanto não
tratar, a troca de senha do titular **para** de acontecer quando a conta tem
papel em outro portal (falha fechada, de propósito: melhor não trocar do que
trocar sem avisar).

**Item 13 — `getAlunosGps()`** (`src/lib/data/alunos.ts:273`). O tipo continua
se chamando **`PaginaAlunosGps`** (não `ResultadoAlunosGps`), reexportado por
`@/lib/data`:

```ts
interface PaginaAlunosGps {
  alunos: AlunoGps[];
  total: number;
  erro?: string;   // undefined = leitura OK (lista vazia = base vazia de verdade)
}
```

Falha da RPC devolve `{ alunos: [], total: 0, erro: "Não foi possível carregar
a lista de alunos agora. Recarregue a página em instantes." }`. **Regra**:
`erro` presente ⇒ renderizar `ErroPainel`, NUNCA o `EmptyState` com CTA de
criar acesso (achado B7).

**Bônus do item 14 (config do Slack)** — `slackConfigurado()` continua exportada
e agora tem consumidor: `getChamadosConfig()` (`src/lib/chamados-data.ts:281-294`)
devolve `slack: { configurado: boolean; modo: "bot" | "webhook" | null }`. A
linha de configuração de `/admin/chamados` (`chamados-config.tsx`, tela do F2)
recebe isso pronto, sem tocar em `process.env` no cliente e sem nenhum segredo
no HTML.

### Migração 216 (SQL executável — João aplica)

`supabase/migrations/20260910000216_gps_diagnostico_chamados_respondidos.sql`,
313 linhas. `create or replace` de `gps.admin_diagnostico_ambiente(uuid)` a
partir do **corpo VIGENTE** (migração ...158 — única definição até aqui; a
...213 só a cita em comentário), com três mudanças e nada mais (assinatura,
`stable`, `security definer`, `search_path = ''`, `TimeZone`, `revoke`/`grant`
idênticos). **Sem DDL, sem backfill**: função de leitura.

1. contagem em DOIS números na MESMA ida ao banco:
   `count(*) filter (where ch.status = 'aberto')` e `... = 'respondido'`;
2. `valor` → `"3 (1 aguardando a equipe, 2 aguardando o aluno)"`;
3. `ok` → `false` só quando há `aberto`; com apenas `respondido` vem `null`
   (informação sem juízo, o contrato do campo). `detalhe` nomeia quem está com
   a bola, no vocabulário que a UI já usa (`chamados-tipos.ts:155-161`).

Reversão: reaplicar o corpo da ...158.

### Exports mortos removidos (item 14)

- `removerAlunoGps` — `src/app/admin/actions.ts:749` (0 chamadores, cópia
  literal de `excluirAcessoAluno`, mesma RPC; Server Action exportada é
  endpoint HTTP).
- barril de `./inscritos-actions` — `src/app/admin/plantao/actions.ts:56-60`
  (os 2 consumidores importam direto; conferido com `rg`).
- `contarChamadosAbertosPorAluno` — saiu de `src/lib/chamados-data.ts`
  (o `import { cache } from "react"` foi junto: ficou sem uso).
- `getClientesHonorarios` e `mapearStatusAcesso` — `src/lib/data.ts:44,60`.
- `progressoFaturamento` (reexport) — `src/lib/financeiro.ts:46`;
  `TOLERANCIA_CENTAVOS` virou interna (`:60`).
- `webhookConfigurado` — `src/lib/slack.ts:72` (`@deprecated`, 0 chamadores).
- `etapaLiberadaPara` virou interna — `src/lib/etapas.ts:64`.
- **`TIPOS_EVENTO` mantida** (deriva `TipoEvento`), como pedido.
- **`StatusCliente` / `RespostasOnboarding` NÃO mexidos**: não são 0-uso —
  `types.ts:176` e `:583` os referenciam como tipo de campo.

### Divergências e o que o próximo precisa saber

1. **O achado do Auditor C sobre `ROTULO_MACRO_POR_TIPO` é falso positivo.**
   Os 5 tipos "faltantes" (`cliente_excluido`, `conta_criada`,
   `email_confirmado`, `primeiro_acesso`, `entrou_no_programa`) estão em
   `TIPOS_NUNCA_AGREGAM` (`log-agregacao.ts:40-46`): por decisão do Marcio eles
   NUNCA formam macro. Rótulo para eles seria código morto por construção — e,
   no caso de `cliente_excluido`, contrariaria a regra escrita ("exclusão é
   evento sensível, não deve sumir dentro de uma macro"). Ficou o **comentário
   justificando**, não o rótulo.
2. **`EMAIL_SUPORTE` já estava no `.env.example`** (linhas 36-45); só as três
   do Slack faltavam.
3. **`/esqueci-senha?erro=link` ainda não tem tela.** `esqueci-senha/page.tsx`
   não lê `searchParams`. **F3**: ler `erro === "link"` e mostrar, em
   `role="alert"`, algo como "Este link expirou ou já foi usado. Peça um novo
   abaixo." Sem isso, o redirect leva a pessoa ao lugar certo, mudo.
4. **`gerarSenhaTemporaria` mora em arquivo NOVO**, `src/lib/senha-temporaria.ts`
   (`server-only`). Não podia ficar em nenhum dos dois `actions.ts` (módulo
   `"use server"` só exporta função async) nem em `acessos-lote.ts`, que é
   importado por client component — `crypto` iria para o bundle do navegador.
5. **`definirClienteEquipe`: escolhi pré-checagem, não RPC.** A ordem "desmarca
   todos → marca um" é obrigatória (índice único parcial
   `etapa1_clientes_unico_equipe`). Uma RPC exigiria migração aplicada pelo João
   e duplicaria em SQL a regra que a trigger da ...215 já impõe. A pré-checagem
   fecha o caso relatado (id fora do ambiente) ANTES de qualquer escrita; sobra
   uma corrida estreita (linha apagada entre a checagem e o update) que agora
   devolve erro em vez de dizer "salvo".
6. **`buscarAlunos`: escolhi saneamento, não RPC** (menor mudança segura).
   Efeito colateral consciente: termo que sobra vazio depois do saneamento
   (`",,,"`) devolve `[]` em vez de varrer a base — antes caía no fallback
   `nome.ilike.%<termo cru>%`.
7. **Não testei em navegador nem rodei build** (ordem do orquestrador). O que
   está verificado é `tsc` + `eslint`. O item 9 depende de o João aplicar a
   migração 216 — até lá a Central segue com a frase antiga.

---

## F2 — feito

Corretor da UI do admin. Escopo respeitado: só `src/components/admin/**` (sem `central/**`,
`diario-*`, `trilha-*`), `clientes/ficha-cabecalho.tsx`, `clientes/acompanhamento-equipe.tsx`
(só o item #9), `app/admin/plantao/page.tsx` e as 2 páginas de metadata. **Nada tocado em**
`app/admin/page.tsx`, `app/admin/chamados/page.tsx`, actions ou `src/lib/**`.

| # | onde | o que passou a acontecer |
|---|---|---|
| 3 | `admin/criar-acesso.tsx:107-160` (`criarLogin(permitirAdocao)`), diálogo em `:452-489` | "Criar login agora" chama a action com `permitirAdocao:false`; se voltar `precisaDecisao`, abre `DialogoConfirmacao` nomeando os programas ("Aproveitar esse login **troca a senha da pessoa em: X, Y** e derruba as sessões") e só o botão "Aproveitar e trocar a senha" refaz a chamada com `true`. Nada é alterado antes da confirmação — a action volta sem escrever. |
| 10 | `admin/solicitacao-card.tsx:59-84` e `:218-222` · `admin/criar-acesso.tsx:150-160,178-186` e `:352-357` | `res.erro` (já traduzido) vai para um `<p role="alert">` na própria tela, além do toast. Saíram "Erro ao aprovar solicitação.", "Erro ao recusar solicitação." e "Erro ao criar o ambiente.". |
| 18 | `admin/criar-acesso.tsx:96-113` (`selecionar`) e `:260-269` | Falha de `diagnosticarLoginAluno` grava `erroDiag` e a tela mostra `AvisoInline`: "Não foi possível conferir este e-mail nos outros portais do grupo (…) — confira antes de criar". |
| 4 | `admin/plantao-acessos.tsx:132-175` | `executar()` recebe a frase de sucesso e só dispara `toast.success` **depois** de `res.ok`, dentro da transição. Os dois toasts soltos (`:148`, `:153`) morreram. |
| 15 | `plantao-acessos.tsx:326-359` · `plantao-calendario/index.tsx:168-206,398-430` · `plantao-mentoras.tsx:78-108,278-306` | Os 3 `window.confirm` viraram `DialogoConfirmacao` (consequência escrita, botão nomeado, `erro` em `aria-live`, foco de volta — a linha/card do gatilho continua montado). |
| 5 | `plantao-calendario/index.tsx:398-430` | A consequência de "Remover" diz que o plantão é **apagado** e que somem junto as **presenças e as respostas de NPS** das inscrições (inclusive as canceladas), e aponta "Cancelar plantão" como o caminho que preserva o registro. |
| 16 | `plantao-calendario/card-slot.tsx:69-76,168-188,203-215` | "Remover" fica `disabled` quando `inscritosQtd > 0`, com a razão escrita no card (ligada por `aria-describedby`): "está travado: N pessoa(s) inscrita(s). Use Cancelar plantão". |
| 6 | `alunos-ativos-lista/lote-acesso.tsx:56-86,110-141,213-235` | `congelarPessoas()` fotografa nome/telefone/e-mail **no clique** (`RelatorioCongelado`), antes do `await`; o relatório lê só do snapshot. O `router.refresh()` não apaga mais o nome nem o link de WhatsApp de quem ficou sem e-mail. |
| 7 | `alunos-ativos-lista/index.tsx:66-91,199-200,470-508` | Prop `erro?: string \| null`; com erro renderiza `FalhaAoCarregar` (`role="alert"`, chip vermelho, "Tentar de novo") **antes** do teste de lista vazia — o `EmptyState` de base vazia deixou de cobrir falha de RPC. Não usei o `ErroPainel` de `ui/` de propósito: ele emite o próprio `<main id="conteudo">` com `min-h-screen` e, dentro do `<main>` de `/admin`, duplicaria o id que é alvo do skip link. |
| 8 | `admin/etapas-controle.tsx` (arquivo reescrito, 175 linhas) | "Bloquear"/"Liberar" passam por `DialogoConfirmacao` ("a Etapa N **sai do ar** para …, na hora e sem aviso; quem tem **liberação individual** continua vendo") e o estado só muda **depois** do `ok` do servidor — a UI otimista saiu. Prop opcional `totalAmbientes` escreve a contagem; sem ela a frase diz "todos os alunos do programa" (número inventado, não). |
| 12 | `admin/dashboard/index.tsx:379-441` + `dashboard/card-dashboard.tsx:36-45` (`valor` virou `ReactNode`) | O card "Esperando a equipe" mostra **dois números lado a lado** ("12 pendências · 3 chamados"), cada um linkando para o seu filtro; a soma sumiu. `contexto` escreve o escopo: "…nos N ambientes deste lote. Não se somam." "Chamados abertos" saiu da lista de baixo, para não repetir o mesmo número duas vezes no mesmo card. |
| 9 | `clientes/acompanhamento-equipe.tsx:100-160` e `:283-290` + `clientes/ficha-cabecalho.tsx:145-152` | O bloco "Equipe" (`AcoesAcompanhamento`) nasce com `previa-oculta`. Em `AvisoAcompanhamento`, a linha da equipe leva `previa-oculta` e a linha do aluno é montada junto com `hidden [html[data-previa=aluno]_&]:block` — **só CSS, zero JS**. A variante foi compilada e conferida rodando o PostCSS do projeto: gera `html[data-previa=aluno] & { display:block }`, com especificidade acima de `.hidden`. |
| 14 | `criar-acesso.tsx:270-289` · `credenciais-view.tsx:79-105` · `cadastrar-aluno-form.tsx:182-189` · `plantao-acessos.tsx:278-283` · `plantao-calendario/interruptor-inscricoes.tsx:84-99` | 5 dos 6 blocos migrados para os pares semânticos (`bg-atencao`/`text-atencao-foreground`, `bg-sucesso`/…, `bg-neutro`/…). Nenhum `amber-*`/`blue-*`/`green-*` sobrou nos meus arquivos. 🔴 **O 6º, `admin/trilha-do-aluno.tsx:111`, NÃO foi tocado: `trilha-*` está fora do meu escopo.** Patch pronto: trocar o `div` âmbar cru por `<AvisoInline>` com o mesmo texto. |
| 17 | `alunos-ativos-lista/aluno-card.tsx:329-346` + `admin/gerenciar-acesso/index.tsx:33-90` | "Reenviar acesso" → **"Resolver acesso"** (ícone `KeyRound`), href `/admin/aluno/<id>#acesso`; `GerenciarAcesso` abre o diálogo direto quando chega por essa âncora (lido no inicializador do estado, nunca `setState` em efeito) e consome o hash com `replaceState`, para o F5 não reabrir sozinho um diálogo de senha. |
| 20 | `admin/plantao-abas.tsx` (novo) + `app/admin/plantao/page.tsx:29,47,113-129` | Abas do Plantão em `?aba=` com allowlist fechada (calendario/acessos/mentoras), padrão fora do endereço, `m` preservado, `scroll:false` — molde de `abas-painel.tsx`. Navegar o mês não devolve mais o admin ao Calendário. |
| 21 | `admin/painel-url.ts:117-143` | `lerUrlDoPainel()` força `aba=ativos` quando a URL gravada não tem aba (é o caso da "Visão geral", cujo padrão sai do endereço). "← Voltar aos alunos" devolve a lista que o rótulo promete. |
| 22 | `alunos-ativos-lista/ancora.ts:26-46,58-75` | A marca virou `alunoId\|timestamp` e **vence em 10 min**; a chave é consumida em qualquer caso (válida ou vencida). Sair pela aba Plantão e voltar meia hora depois não faz mais a tela pular sozinha. O formato antigo (só o uuid) vence por ausência de carimbo. |
| 24 | `app/admin/chamados/[chamadoId]/page.tsx:1,16-42` · `app/admin/aluno/[alunoId]/diario/page.tsx:1,27-53` | `generateMetadata` com o assunto do chamado e o nome do aluno, **com guarda de papel** (não-admin recebe o título genérico — metadata roda em paralelo com a página) e `cache()` do React sobre `getChamado`/`getAlunoById`, para o título não custar uma segunda leitura por abertura de tela. |
| C | `estado-na-url.ts:86,108` · `ordenacao.ts:34,43` · `painel-url.ts:37,63` · `ui/graficos/index.ts:15-22` | `lerEstado`, `escreverEstado`, `diaLocal`, `diasDesde`, `CHAVE_URL_PAINEL` e `sanitizarUrlDoPainel` deixaram de ser `export` (uso interno). No barril dos gráficos saíram `LegendaValores`, `COR_DO_TOM`, `SerieLinha`, `FormatarValor` e `PontoGrafico`; ficou `TomGrafico`, o único importado de fora. `MAX_MENCOES` (`diario-mencoes.tsx`) **não** foi tocado — fora do escopo, como combinado. |

**Verificação (saída literal):**

```
$ npx tsc --noEmit
(sem saída — exit 0)

$ npx eslint src/components/admin src/components/clientes src/components/ui/graficos \
    "src/app/admin/plantao/page.tsx" "src/app/admin/chamados/[chamadoId]/page.tsx" \
    "src/app/admin/aluno/[alunoId]/diario/page.tsx"
(sem saída — exit 0)

$ grep -rn "window.confirm" src/components/admin src/components/clientes
src/components/admin/plantao-calendario/index.tsx:179:   * O `window.confirm` que estava aqui não dizia nada disso.   <- comentário

$ grep -rnE "(amber|blue|green|red|slate|gray)-[0-9]{3}" <arquivos do F2>
(sem saída — exceto trilha-do-aluno.tsx:111, fora do escopo)
```

**Sem validação em navegador**: `next dev`/`next build` estão proibidos nesta rodada, então
nenhuma tela foi aberta no Chromium. O que dependia de compilação de CSS (a variante
`[html[data-previa=aluno]_&]` do item #9) foi conferido rodando o PostCSS do projeto sobre um
arquivo de sonda, não por captura de tela.

**Pendências que NÃO são minhas (2 linhas + 1 arquivo):**
1. `app/admin/page.tsx:162` — passar `erro={pagina.erro ?? null}` (F1). O tipo já existe
   (`PaginaAlunosGps.erro`, `lib/data/alunos.ts:257`); sem essa linha o branch do #7 existe mas
   nunca dispara.
2. `app/admin/page.tsx:186` — passar `totalAmbientes={totalAlunos}` (F1). Sem ela a
   consequência do #8 fala em "todos os alunos do programa", sem número.
3. `admin/trilha-do-aluno.tsx:111` — último bloco do #14, com o dono de `trilha-*`.

## Orquestrador — fecho do ciclo 1 (10/09, após F1/F2/F3)

- Migração `20260910000216` **aplicada** (corpo vigente conferido antes: 1 sobrecarga, md5 `404fc908…`, ainda sem `v_chamados_aberto`). Prova em rollback (JWT do admin, `set local role authenticated`):
  - só `respondido` → `{"ok": null, "valor": "1 (0 aguardando a equipe, 1 aguardando o aluno)", "detalhe": "A equipe já respondeu — o chamado aguarda o aluno."}`
  - `respondido` + `aberto` → `{"ok": false, "valor": "2 (1 aguardando a equipe, 1 aguardando o aluno)", …}`
  - tudo `fechado` → `{"ok": true, "valor": "0"}`
  - sem JWT → 42501. `verificacoes` continua com 20 itens.
- Restos cruzados fechados pelo orquestrador:
  - `src/app/admin/aluno/[alunoId]/page.tsx` — `overrides` agora chegam ao `EtapasOverview` do espelho do admin (o `Promise.all` devolve `{ etapas, overrides }`).
  - `src/app/admin/page.tsx` — `erro={pagina.erro ?? null}` na `AlunosAtivosLista` e `totalAmbientes={totalAlunos}` no `EtapasControle` (os dois pedidos do F2).
  - `src/components/admin/trilha-do-aluno.tsx:111` — div âmbar crua → `AvisoInline` (o único bloco de paleta crua que o F2 deixou fora do escopo).
- `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0. `npm run build` em andamento (log: scratchpad `build-ciclo1.log`).

## Auditor E — Suporte · Diário · Central · Acesso (ciclo 2)

Sem tool MCP do Supabase nesta sessao (hostinger-* falharam e nenhum mcp supabase foi carregado) -
achados abaixo sao so por leitura de codigo/migracao. Nenhuma prova em banco foi rodada; onde o
CLAUDE.md ja registra prova em rollback de sessao anterior, cito a prova existente, nao repito.

### E1 - RED - admin_adicionar_socio troca senha de conta de OUTRO sistema sem a guarda cross-sistema (CWE-863, OWASP A01)

Onde: supabase/migrations/20260910000212_gps_admin_adicionar_socio_pessoa.sql linhas 45-62 (corpo
vigente, create or replace); chamada por adicionarSocioAluno em src/app/admin/senha-actions.ts
linhas 354-401; UI em src/components/admin/gerenciar-acesso/adicionar-socio.tsx linhas 62-78.

Impacto: admin digita um e-mail que ja existe em auth.users (compartilhada por 7 sistemas do grupo)
para adicionar como socio. Se essa conta nao for dev/admin (admin_alvo_e_equipe so bloqueia equipe
interna), a funcao sobrescreve a senha, confirma o e-mail e derruba todas as sessoes dessa pessoa em
TODOS os portais - sem aviso, sem precisaConfirmar, sem log nomeando os outros sistemas. E
exatamente a classe de bug que a migracao 131/132 ja corrigiu para admin_definir_senha (titular) e
admin_definir_senha_membro (membro) - o proprio comentario da migracao 118 (linha 85) chama isso de
achado B2 e diz que as duas rotas agora param, nomeiam os programas e esperam confirmacao.
admin_adicionar_socio e uma TERCEIRA rota de escrita de senha e ficou de fora da correcao.

Reproducao:
  1. Ler admin_adicionar_socio (migracao 212, linhas 45-62): quando o select em auth.users encontra
     uma conta existente, so confere admin_alvo_e_equipe (equipe interna) e "ja e membro de outro
     ambiente GPS" - nunca chama admin_programas_do_email (que definirSenhaAluno/
     definirSenhaMembro chamam antes de trocar senha).
  2. adicionarSocioAluno (senha-actions.ts:354) nao tem parametro confirmarOutrosSistemas nem chama
     admin_programas_do_email no lado do Node - vai direto ao RPC.
  3. adicionar-socio.tsx:62 chama adicionarSocioAluno sem dialogo de confirmacao nenhum: campo de
     e-mail livre + botao Adicionar, direto para toast de sucesso.
  4. Resultado (por leitura do SQL): senha trocada + delete em auth.refresh_tokens + delete em
     auth.sessions do usuario - sessao ativa em QUALQUER portal cai na hora, sem o dono saber por
     que.

Correcao esperada:
  - F1 backend: replicar em gps.admin_adicionar_socio a mesma guarda de admin_definir_senha /
    admin_definir_senha_membro: antes do update auth.users no branch em que v_user ja existe,
    consultar gps.admin_programas_do_email(v_email); se houver programa fora de GPS, devolver um
    sinal (precisa_confirmar true + lista de programas) e nao escrever nada.
  - F1 backend: adicionarSocioAluno ganha confirmarOutrosSistemas e repassa ao RPC (ou faz o
    pre-check em Node como definirSenhaAluno faz), devolvendo precisaConfirmar/programas ao
    componente.
  - F2 UI admin: adicionar-socio.tsx mostra a mesma tela de confirmacao nomeada que
    gerenciar-acesso/painel.tsx ja tem para o membro (listar os programas, exigir clique explicito)
    antes de reenviar com confirmarOutrosSistemas true.

### E2 - YELLOW - admin_excluir_acesso promete "ambiente foi limpo" numa mensagem que na verdade dispara ROLLBACK total (erro que mente)

Onde: supabase/migrations/20260909000114_gps_admin_excluir_acesso_inclui_chamados.sql linhas 101-108.

Impacto: quando o delete em auth.users falha por foreign_key_violation (conta com registro em
outro sistema do grupo), o handler faz raise exception dizendo que o login nao pode ser apagado mas
que "o ambiente do GPS foi limpo". Essa nova excecao nao e capturada por nada acima - propaga para
fora da funcao e o Postgres desfaz a transacao INTEIRA da chamada RPC, incluindo os 11 deletes que
rodaram antes (progresso, etapa1_clientes, aluno_notas, chamados, membros etc). Ou seja: a frase
"o ambiente do GPS foi limpo" e sempre falsa nesse caminho - nada foi apagado, tudo voltou. O admin
ve um erro que afirma sucesso parcial que nao ocorreu.

Reproducao: e uma questao de semantica do PL/pgSQL, nao precisa de banco vivo para confirmar - o
bloco begin/exception cria savepoint so para aquele bloco; a NOVA excecao levantada dentro do
handler nao e recapturada em lugar nenhum da funcao, propaga e aborta a transacao da chamada
completa (select gps.admin_excluir_acesso(...) e uma unica transacao implicita pelo PostgREST).

Correcao esperada:
  - F1 backend: trocar a frase por algo que nao afirme limpeza ("Nao foi possivel excluir: esta
    conta tem registros em outros sistemas do grupo. Nada foi alterado.") OU reestruturar em duas
    transacoes reais (uma que apaga so os dados do GPS e comita, outra separada so para o delete em
    auth.users).
  - F2 UI admin: confirmar antes da apresentacao se traduzirErroBanco (erros.ts) ja intercepta esse
    codigo (23503) com frase segura, ou se o error.message cru do Postgres chega ate a tela de
    excluirAcessoAluno - se for o cru, e o que a equipe le ao vivo se testarem "Excluir acesso" numa
    conta que tambem exista em outro portal do grupo.

### E3 - YELLOW - Payload do Slack de mencao contradiz o invariante documentado no CLAUDE.md ("nunca o texto, o tipo, o cliente ou contato")

Onde: src/lib/slack.ts linhas 1-48 (cabecalho) e 157-161 (montagem da mensagem);
src/app/admin/diario-actions.ts linhas 177-247 (registrarEAvisar, passa texto da nota e nome do
aluno para notificarMencao).

Impacto: o CLAUDE.md, na secao "Mega feature de 10/09/2026" (por volta da linha 1343), documenta a
decisao como: payload do Slack = "<Autor> mencionou voce no diario de <Aluno> - link" - NUNCA o
texto, o tipo, o cliente ou contato. O codigo implementado (mesma data, slack.ts linhas 5-17)
registra uma decisao oposta, tambem atribuida ao Joao: enviar o trecho da nota (ate 300 caracteres)
e o nome do aluno. gps.aluno_notas e admin-only por LGPD justamente porque o texto livre pode trazer
dado pessoal de TERCEIROS (IRPF, bens, processos, cliente PEP - comentario da migracao
20260908000001). Enviar ate 300 caracteres desse texto para o Slack tira esse dado do perimetro que
a RLS controla, mesmo que o canal seja privado.

Por que isso confunde a equipe amanha: se alguem no war-room disser "o Slack nao vaza nada, so
avisa que foi mencionado" (que e o que o CLAUDE.md descreve), e a feature for ligada para demo
(falta so a URL do webhook, pendencia B-W1), a primeira mencao com uma nota real manda nome do
aluno mais trecho do texto para o canal. Hoje esta OFF por padrao (slack_mencoes_ativo = false,
migracao 20260910000207) e depende de env nao setada - nao dispara sozinho, mas e decisao de
produto que diverge do doc oficial do projeto.

Correcao esperada:
  - Nao e bug de codigo, e decisao de produto nao sincronizada. Confirmar com Joao/Marcio antes da
    apresentacao qual das duas versoes vale. Se for a nova (texto vai), atualizar o CLAUDE.md para
    nao contradizer o codigo. Se for a antiga (LGPD-safe), reverter slack.ts e diario-actions.ts
    para mandar so a frase fixa sem texto/aluno.
  - Enquanto B-W1 (URL do webhook) nao for preenchida, o canal esta de fato fechado - nao bloqueia a
    apresentacao de amanha, mas e decisao a fechar antes de alguem ligar o interruptor.

### Confirmado OK (com prova de leitura de codigo)

- Suporte por chamados (RPCs 110-116): contarChamadosDoBadge e definicao unica, usada so em
  src/app/admin/page.tsx:100 e src/app/admin/chamados/page.tsx:57 - zero duplicacao
  (src/lib/chamados-data.ts:255-265). Tetos (5 abertos/ambiente, 20 msgs, reabrir 7 dias) impostos
  no BANCO (chamado_abrir/chamado_responder, migracao 111), nao so na UI. Papel do autor derivado
  no servidor (gp_is_admin/aluno_atual), nunca aceito como parametro. Anexo: bucket gps-chamados
  privado + 3 policies (112) + validacao de posse/existencia/MIME real via storage.objects.metadata
  na RPC; "equipe nunca anexa" imposto na propria chamado_gravar_mensagem desde a 116. Todo download
  sai com download= (chamados-data.ts:407-437), nunca inline. Copy "parado ha N dias" calculada no
  SERVIDOR (chamados-fila.tsx:44-71), sem relogio de cliente; ok=null em chamados_abertos (migracao
  216) corretamente tratado como informacao tanto em catalogo.ts:209-210 (estadoDaLinha) quanto em
  acao-da-linha.tsx:51 (precisa = problema ou atencao) - o botao "Abrir os chamados" so aparece
  quando a bola esta mesmo com a equipe.
- RLS do Diario (gps.aluno_notas, gps.nota_mencoes): policies so com gp_is_admin(), sem policy de
  delete (delete negado por ausencia), append-only real por trigger
  (aluno_notas_bloquear_edicao, migracao 20260908000001 linhas 73-99) - mesmo um admin nao reescreve
  o texto depois do insert. gps.nota_mencoes com a mesma regra - so a RPC registrar_mencoes
  (SECURITY DEFINER) escreve. Nao encontrei policy nenhuma que de ao aluno ou socio SELECT nessas
  duas tabelas - nao pude provar "0 linhas / 42501" em banco real (sem MCP disponivel), mas a
  ausencia de qualquer policy de leitura fora de gp_is_admin ja nega por padrao do RLS.
- Mencao: mencionaveis = perfis ativo com cargo dev/admin (19 pessoas), revalidado de novo dentro de
  registrar_mencoes (nao confia na lista que veio do cliente); teto de 10 aplicado NO BANCO (limit
  10 dentro do CTE, migracao 207 linha 186), nao so na Server Action. TextoComMencoes so realca
  nomes que estao em nota.mencoes (vindos de gps.nota_mencoes) - nao inventa destinatario novo, e
  decoracao de uma lista ja autorizada. Falha do Slack nunca bloqueia a nota: a nota e inserida e
  commitada antes de registrarEAvisar ser chamado, e toda falha vira logErro sem o texto da nota.
- Central de resolucao (migracao 216): catalogo.ts/acao-da-linha.tsx tratam ok=null sem inventar
  cor; a copy da linha chamados_abertos bate exatamente com o valor/detalhe novo (separa "aguardando
  a equipe" de "aguardando o aluno").
- Senha temporaria: gerarSenhaTemporaria usa crypto.randomBytes(4) - CSPRNG, nao Math.random().
  E-mails de credenciais escapam nome, senha, href/loginUrl com esc() (src/lib/email.ts). Nenhum
  texto "GPS" visivel em gerenciar-acesso/, criar-acesso.tsx ou lote-acesso.tsx (so em
  comentarios/logica de filtro).
- Lote de acesso: criarAcessosEmLote respeita LOTE_ACESSOS_MAXIMO=20, pausa 150ms entre envios,
  chama criarAcessoAluno com permitirAdocao false - o caminho de lote nao adota login preexistente
  (bate com a decisao documentada no CLAUDE.md), uma falha nao derruba o lote inteiro, log de
  auditoria por RPC porque gps.acessos_log nao tem policy de insert direto.

### Falsos positivos descartados

- Suspeitei que chamado_gravar_mensagem sem "for update" no chamado_abrir permitiria estourar o
  teto de 5 abertos por ambiente por corrida - e real, mas e um teto de UX, nao uma fronteira de
  seguranca, e o volume de trafego do GPS nao sustenta essa corrida. Nao vira achado.
- TextoComMencoes parecia, a primeira vista, "parse livre do texto" (contra a regra do escopo) - na
  leitura completa, o universo de nomes buscados vem sempre de nota.mencoes (gravado por
  registrar_mencoes), nunca de um dicionario externo. Nao e o parse livre que a regra proibe
  (extrair mencao NOVA do texto); e realce de uma mencao ja autorizada. OK.

## Summary (Auditor E)
- Critico: 0 | Bloqueia (vermelho): 1 (E1) | Corrigir hoje (amarelo): 2 (E2, E3) | Depois: 0
- Prioridade 1: E1 - fechar a guarda cross-sistema em admin_adicionar_socio antes de qualquer demo
  que envolva "adicionar socio" com e-mail de teste que possa colidir com outro sistema do grupo.
- Prioridade 2: E3 - decisao de produto (Slack manda texto ou nao) precisa ser fechada com
  Joao/Marcio antes de preencher B-W1 e ligar o interruptor; hoje o codigo e o CLAUDE.md dizem
  coisas diferentes.
- Prioridade 3: E2 - mensagem de erro que promete limpeza que nao aconteceu; baixo risco de
  aparecer amanha, mas facil de corrigir so o texto antes da apresentacao.
- Fora de escopo, para o Joao: a env SLACK_WEBHOOK_MENCOES/canal (B-W1) e a decisao de conteudo do
  E3 dependem dele; o achado V11 (resend_api_key legivel por 16 admins via gps.config) ja esta
  catalogado no CLAUDE.md como conhecido, nao repito aqui.

## Auditor D — Plantao (ciclo 2)

Escopo: /p/plantao (publico), /admin/plantao, src/lib/plantao*.ts, email-plantao.ts,
migrations *plantao* (ultimas: 170-186, mais 20260910000211_gps_segredos.sql - nao aplicada).
Servidor local next start -p 3993 sobre .next ja buildado; screenshots Playwright (chromium
ja instalado em ms-playwright/chromium-1243) em tmp/squad/shots-D/.

### D1 - amarelo corrigir hoje - CLAUDE.md descreve regra de prazo que o SQL nao tem mais (CWE-1059, doc/negocio)
Onde: CLAUDE.md linhas 380-398 (secao "Plantao de Duvidas - Acelera Holding, 2026-09-01") x
supabase/migrations/20260909000046_gps_plantao_inscricao_ate_inicio_presenca_antes.sql linhas 43-136
Impacto: quem apresentar o produto amanha usando o CLAUDE.md como roteiro vai descrever um
cut-off de 12:00 da vespera e um cancelamento condicionado a zoom_url que nao existem mais em
producao desde a noite de 08/09. Risco de contradizer a propria tela ao vivo.
Reproducao: ler CLAUDE.md 381-383 (Inscricao ate as 12:00 do dia ANTERIOR) e linha 398 (So trava
se o slot TIVER zoom_url) vs. o corpo vigente de plantao_inscrever/plantao_cancelar na
migration 046, que comenta explicitamente que o cut-off de 12:00 da vespera (migracao 040) SAIU
e que deixou de depender de sala em 08/09/2026. Migration 046 e a definicao mais recente das duas
funcoes (nenhuma migration posterior as recria).
Confirmado: o restante do CLAUDE.md (linha 1951, secao war-room de 09/09) ja registra a
mudanca corretamente - a secao de 09/01 e que ficou para tras e e a primeira que alguem le.
Correcao esperada: F1 (backend, dono do CLAUDE.md) - atualizar CLAUDE.md 380-398 com a regra
vigente (inscricao ate o inicio; cancelamento ate 1h antes, independente de zoom_url) ou
apagar a secao de 09/01 e apontar para a de 09/09.

### D2 - amarelo corrigir hoje - copy ao vivo mostra prazo de reinscricao que nao existe mais (CWE-1059, F3/UI)
Onde: src/components/plantao/minha-inscricao-card.tsx linha 276
Impacto: no dialogo de confirmacao de cancelamento, a tela diz ao aluno que da para se
inscrever de novo, neste ou em outro plantao, ate as 12:00 do dia anterior. Falso: desde a
migration 046, a unica trava de plantao_inscrever e o proprio inicio do plantao (sem cut-off
de vespera). Um aluno que cancelar a tarde vendo essa frase pode achar que perdeu a chance de
reagendar um plantao do dia seguinte, quando na verdade ainda pode.
Confirmado que o resto da tela esta atualizado: inscricao-painel.tsx linhas 165-172 ja tem o
comentario e o texto corretos (Inscricoes encerradas equivale a ja comecou, sem cut-off de
vespera) - so este card ficou para tras.
Correcao esperada: F3 (frontend) - trocar a frase de minha-inscricao-card.tsx linha 276 por algo
como: Da para se inscrever de novo, neste ou em outro plantao, ate o horario de inicio dele.

### D3 - vermelho bloqueia apresentacao - rate limit das 3 RPCs publicas e forjavel via chamada direta ao PostgREST (CWE-307/CWE-799, OWASP API4)
Onde: src/app/p/plantao/actions.ts linhas 67-81 (ipHashAtual) x plantao_inscrever,
plantao_cancelar, plantao_revelar_link (ultimos corpos: migrations 046, 172) x
src/lib/supabase/client.ts (confirma que NEXT_PUBLIC_SUPABASE_ANON_KEY e publica, embarcada
no bundle do navegador - uso padrao e esperado do Supabase, mas relevante aqui).
Impacto: a UNICA defesa contra varrer os 422 e-mails de comprador do Acelera (documentada
extensamente no CLAUDE.md como a unica trava desde que a rota perdeu login) e o rate limit de
10 tentativas por 15 minutos por p_ip_hash - mas p_ip_hash e um PARAMETRO escolhido pelo
chamador, nao algo que o banco calcula a partir da conexao real. O ipHashAtual() que produz um
hash verdadeiro do IP so roda dentro da Server Action do Next; nada impede um chamador de
ignorar o app e falar direto com a REST do Supabase usando a anon key publica, mandando um
p_ip_hash novo e aleatorio a cada chamada. Toda a conta de 10 por 15 minutos fica presa a um
valor que o proprio atacante escreve - na pratica, sem limite.
Reproducao (nao executada - respeitando o escopo so-leitura desta rodada; roteiro para o
backend confirmar):
  1. POST https://mbvybujpkwuorhtdzcde.supabase.co/rest/v1/rpc/plantao_inscrever com header
     apikey igual a anon key publica, body com p_email do alvo, p_nome qualquer, p_slot_id de
     um slot futuro e p_ip_hash aleatorio.
  2. Repetir 50 vezes trocando so p_ip_hash a cada chamada - nenhuma bate no teto de 10 por 15
     minutos porque cada uma parece ser de um IP diferente aos olhos da funcao.
  3. A mensagem de retorno ja distingue e-mail invalido (mensagem generica) de e-mail valido
     com inscricao ativa (frase especifica de conflito) - oraculo binario para confirmar quem
     esta na base dos 422 compradores, sem limite de tentativas.
Evidencia: plantao_inscrever (046, linhas 43-98) e plantao_revelar_link e plantao_cancelar
(172, 046) recebem p_ip_hash text como parametro de entrada e so o usam para uma leitura em
gps.plantao_eventos - nunca conferem contra o cabecalho real da requisicao.
Correcao esperada: F1 (backend) - dentro de cada uma das 3 funcoes, calcular o IP a partir do
proprio Postgres/PostgREST (GUC request.headers, decodificando o JSON e pegando o campo
x-forwarded-for, mesmo ultimo hop ja usado em ipHashAtual()) em vez de confiar em p_ip_hash
vindo do cliente. Se essa GUC nao estiver disponivel nesta versao do PostgREST hospedado pelo
Supabase, registrar a limitacao e avaliar mover o rate limit para uma camada que veja o IP de
verdade (por exemplo uma Edge Function na frente do RPC), ou aceitar o risco residual
documentado - mas nao como esta hoje, porque o controle e decorativo contra quem sabe chamar a
REST direto.

### D4 - azul depois - footer Fale com a monitoria existe no e-mail do banco mas nao no e-mail TypeScript (duplicacao ja assumida, conteudo divergente)
Onde: src/lib/email-plantao.ts (0 ocorrencias de monitoria em nenhum dos 4 e-mails) x
supabase/migrations/20260909000174_gps_plantao_segundo_email_e_rede_de_seguranca.sql linhas
115-388 (as duas versoes SQL do e-mail de sala e de abertura levam o link
https://o.aceleraholding.com.br/monitoria no rodape).
Impacto: hoje sem efeito pratico - o caminho HTTP (/api/plantao/manutencao para
email-plantao.ts) esta morto em producao (env ausente, sem cron agendado), entao so o e-mail
que sai do banco (com o link) chega a alguem. Mas o CLAUDE.md ja registra a duplicacao como
assumida, como se as duas implementacoes estivessem sincronizadas - nao estao, e se a rota HTTP
for reativada (e pendencia aberta, ver ATIVAR-PLANTAO-AGORA.md), o e-mail voltaria a sair sem o
canal de suporte.
Correcao esperada: F1 - acrescentar o rodape de monitoria as 4 funcoes de email-plantao.ts
(mesmo padrao de botao e paragrafo final usado no SQL), ou registrar explicitamente em codigo
que o arquivo esta congelado ou morto ate a consolidacao.

### D5 - amarelo corrigir hoje - foco de teclado invisivel no calendario publico (WCAG 2.4.7, CWE-1173)
Onde: src/components/plantao/calendario-mes.tsx linhas 160, 171 e 217 (setas de mes e celula de
dia) e src/components/plantao/nps-form.tsx linha 91 (botoes de nota 0 a 10)
Impacto: /p/plantao e a UNICA rota publica sem login do sistema - a mais provavel de ser usada
em iframe ou mobile por alguem navegando por teclado. Nessas 4 classes, o foco usa
focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50, o padrao que o
proprio projeto baniu explicitamente na Onda A do redesign (src/app/globals.css linhas 284-291,
comentario dizendo que o foco visivel deve ser por OUTLINE, nunca por ring, porque outline e
pintado fora do fluxo e nao e cortado, com a utility foco-visivel criada para substituir esse
padrao em todo o resto do sistema). O componente Button de shadcn ganhou
focus-visible:outline-solid (tambem documentado no CLAUDE.md como obrigatorio) - mas essas 4
classes nao sao o componente Button, sao button cru com Tailwind ad-hoc, e ficaram para tras.
Reproducao (medida, nao so lida): Playwright, http://localhost:3993/p/plantao, 390x844, 12 Tabs
ate o foco chegar na celula do dia 16 - document.activeElement.matches(focus-visible) devolve
true, mas getComputedStyle(...).boxShadow e zero e transparente em todas as camadas
(screenshot antes e depois do foco, pixel-identicos). O botao Continuar (componente Button), ao
contrario, mostra outline solid 2px de verdade.
Evidencia: tmp/squad/shots-D/cal-before.png, cal-after-focus16.png, plantao-390-tab12.png (foco
na celula 16, sem nenhum indicador visivel).
Correcao esperada: F3 (frontend) - trocar as classes focus-visible:outline-none
focus-visible:ring-3 focus-visible:ring-ring/50 pela utility foco-visivel (globals.css linha
284) nas 4 ocorrencias listadas.

### Confirmado OK (verificado nesta rodada, nao reabrir sem motivo novo)
- Layout responsivo: 0 overflow horizontal em 390x844 e 1366x900 (medido via
  document.documentElement.scrollWidth vs window.innerWidth); estado vazio de mes sem slot tem
  copy propria (Nenhum plantao liberado neste mes ainda) - tmp/squad/shots-D/plantao-390.png,
  plantao-1366.png, plantao-1366-mes-vazio.png.
- anon sem GRANT direto em tabela plantao_* - confirmado por grep em todas as migrations; a
  unica tabela com grant a um papel de sessao e gps.plantao_config (authenticated, atras de RLS
  gp_is_admin(), revoke antes do grant, delete revogado do authenticated - migration 070).
- Admin RPCs com defesa em duas camadas: ehAdmin() no Server Action (inscritos-actions.ts,
  alunos-actions.ts) e public.gp_is_admin() dentro de cada RPC (175, 180 a 183) - sai 42501 se
  so a segunda falhar.
- Allowlist fechada de abas (plantao-abas.tsx linhas 26 e 46-50): aba=qualquercoisa cai no
  padrao calendario, nao em tela vazia.
- Sem window.confirm vivo no modulo (so comentarios citando os que foram removidos);
  DialogoConfirmacao presente em plantao-calendario/index.tsx, dialogo-cancelamento.tsx,
  plantao-inscritos/index.tsx, plantao-mentoras.tsx, plantao-acessos.tsx.
- Sem paleta crua (amber, red, green, blue, slate ou gray fora de token semantico) em nenhum
  arquivo do escopo do Plantao.
- Toasts so em sucesso ou erro explicito, nunca otimista, nas 4 telas do admin conferidas.
- E-mails com esc() consistente em email-plantao.ts (todas as interpolacoes de nome, mentora,
  motivo e comentario) e zoomUrl restrito a esquema https antes de virar href - bloqueia
  javascript e data URIs e injecao de atributo (botao() tambem escapa o href).
- /api/plantao/manutencao: comparacao por timingSafeEqual sobre digest SHA-256 (tamanho fixo,
  sem vazar tamanho do segredo) e falha fechada com 500 se a env nao existir.
- gps.admin_liberar_aluno_plantao (175): guardas na ordem certa (admin, depois formato de
  e-mail, depois nome), on conflict idempotente, nunca mexe em auth.users nem em
  bloqueado_por_programa, log em plantao_eventos - bate com o texto do CLAUDE.md.

### Falsos positivos descartados
- plantao_registrar_nps e plantao_minha_inscricao sem rate limit - sao leitura (a segunda) ou
  exigem presenca ja registrada, plantao ja encerrado, inscricao_id (UUID aleatorio, nao
  enumeravel) e e-mail de dono batendo (a primeira). Risco residual muito menor que D3; nao abre
  oraculo por si so porque as duas devolvem conjunto vazio tanto para e-mail que nao e
  comprador quanto para comprador sem inscricao ativa - indistinguiveis.
- Duplicacao do e-mail de sala (HTTP x banco) causa envio duplicado hoje - nao: nao existe
  cron.schedule para /api/plantao/manutencao em nenhuma migration (so foi cogitado, nunca
  aplicado) e a rota responde 500 por falta de env - caminho morto, risco e so de regressao
  futura (ver D4), nao duplicidade atual.
- gps.config.resend_api_key legivel pelos 16 admins via REST - ja e achado catalogado (V11) com
  migration pronta e nao aplicada (211, pendencia B-K1 do proprio Joao); nao e um achado novo
  desta rodada, so reafirmo que segue aberto.
- frame-ancestors nao chega ao cliente (LiteSpeed sobrescreve) - pendencia conhecida (secao do
  CLAUDE.md), nao reaberta aqui por instrucao do prompt.

## Fable — veredito do ciclo 1

**VEREDITO: REPROVADO** (2 travas: uma regra em 5 lugares com o servidor ainda em 6, e a prova das telas do aluno que não pôde ser feita).

| Critério | Veredito | Uma linha |
|---|---|---|
| Segurança | APROVADO (com ressalvas) | open redirect do `/auth/confirm` fechado e provado por HTTP; `buscarAlunos` saneado; adoção só após confirmação; `precisaDecisao` volta ANTES de qualquer escrita; migração 216 com guarda na 1ª linha + revoke/grant; módulos `"use server"` só exportam async/tipos |
| Escalabilidade | APROVADO | zero consulta nova por render (`contarChamadosDoBadge` é função pura; `getChamadosConfig` só lê env; a 216 é a MESMA query com `filter`); a pré-checagem de `definirClienteEquipe` é 1 select numa ação rara |
| Solidificação | **REPROVADO** | a regra "senha mínima 8" tem 5 casas e uma delas ainda diz 6 (`src/app/cadastro/actions.ts:38`) — o servidor ficou mais frouxo que as 4 telas |
| UX | **REPROVADO** | telas do ALUNO não abertas no navegador: a credencial de teste é recusada pelo GoTrue (`invalid_credentials`); build verde não prova que a tela abre |
| Otimização | RESSALVA | 14 exports mortos e 1 action-endpoint sem tela removidos, 2 geradores viraram 1, badge com 1 definição; MAS `const SENHA_MINIMO = 8` nasceu em 3 cópias (F3 7c) + `travas.ts:32` + servidor — é a mesma trava de Solidificação |

### VERIFICADO (comando e saída real)

- `npx tsc --noEmit` = exit 0, sem saída (rodado por mim DEPOIS do arquivo novo `minha-inscricao-card.tsx`).
- `npx eslint src/components/plantao/minha-inscricao-card.tsx` e `src/components/admin/gerenciar-acesso/index.tsx` = exit 0 (o erro `set-state-in-effect` que o F3 viu já não existe).
- `npm run build` (log do orquestrador `build-ciclo1.log`) = `BUILD_EXIT=0`. ATENÇÃO: `BUILD_ID` é de 00:53:33 e `minha-inscricao-card.tsx` foi salvo às 00:58:21 — **o build de pé na 3991 NÃO contém o card novo do `/p/plantao`**; só tsc/eslint o cobrem.
- `npx next start -p 3991` = Ready; `curl /login` = 200. (Servidor continua de pé na 3991 para o passe do aluno.)
- `node tmp/squad/mede-bundle.mjs http://localhost:3991` = `/login` **236 KB** gzip (17 chunks; aceite 245 ok), `/cadastro` 237, `/esqueci-senha` 236, `/p/plantao` 285 (+1 vs 284 de referência).
- CSS compilado (`.next/static/chunks/3lfh0owslz7ep.css`) contém `html[data-previa=aluno] .<classe-escapada>{display:block}` e `html[data-previa=aluno] .previa-oculta{display:none!important}` — a variante Tailwind v4 do F2 #9 compila e vence `.hidden`.
- `grep -rn "window.confirm" src` = só 2 comentários (`plantao-calendario/index.tsx:179`, `minha-inscricao-card.tsx:57`).
- grep de `export (const|let|function <sync>)` em `admin/actions.ts`, `senha-actions.ts`, `clientes/actions.ts`, `cadastro/actions.ts`, `onboarding/actions.ts` = só `export interface`/`type` + `export async function` (`plantao/actions.ts` é barril sem a diretiva, como documentado).

- Passe PÚBLICO no Chromium (Playwright 1.63, 1366 e 390; script `scratchpad/passe-publico.mjs`; capturas `scratchpad/shots-ciclo1/pub-*`): `/login?motivo=inatividade` = `role=status` "Sua sessão foi encerrada por inatividade. Entre de novo."; `/login?motivo=<script>…` = nada ecoado; `/esqueci-senha?erro=link` = `role=status` "Este link expirou ou já foi usado. Peça um novo."; `/esqueci-senha?erro=<b>x</b>` = nada ecoado; `/cadastro` e `/auth/redefinir` com "8 caracteres"; **0 erro de console e 0 overflow horizontal** nas 12 combinações.
- Redirects sem seguir (`maxRedirects: 0`): `GET /auth/confirm?code=invalido&next=//evil.com` = 307 `/esqueci-senha?erro=link`; `GET /auth/confirm?token_hash=x&type=recovery&next=/%2fevil.com` = 307 `/esqueci-senha?erro=link`; `GET /auth/confirm` (vazio) = 307 `/esqueci-senha?erro=link`; `GET /clientes` = 307 `/login?redirect=%2Fclientes`; `GET /login?redirect=//evil.com` sem sessão = 200. Caminho de sucesso do `/auth/confirm` por leitura: `next = destinoInterno(...)` (linha 27), o mesmo validador do login (`//evil.com`, `/\evil.com`, `/%2f`, `/%5c`, esquema no meio caem em `/`). Loop `/login?redirect=/login` para usuário logado: **não acontece** — `new URL(destino, request.url)` descarta a query e a 2ª passada cai em `/`.
- Credencial do aluno de teste, direto no GoTrue (`POST /auth/v1/token?grant_type=password`, anon key do `.env.local`, projeto `mbvybujpkwuorhtdzcde`): `{"code":400,"error_code":"invalid_credentials"}`. A tela `/login` mostra "E-mail ou senha inválidos." (captura `00-login-debug.png`). Delegação do reset a um `backend-engineer`: **a tool MCP do Supabase não chega ao subagente**. Não há `psql`/CLI/DB URL nesta máquina.
- Leitura integral: `20260910000216_*.sql` (313 linhas: `create or replace` do corpo vigente, `stable`/`security definer`/`search_path` vazio, `gp_is_admin()` antes de tudo, `count(*) filter` nos dois status na MESMA query, `ok` null só com `respondido`, `revoke from public, anon` + `grant to authenticated`); `auth/confirm/route.ts`; `middleware.ts`; `senha-temporaria.ts` (`randomBytes(4)`, `server-only`); os diffs de `admin/actions.ts`, `senha-actions.ts`, `criar-acesso.tsx`, `clientes/actions.ts`, `cadastro/actions.ts`, `onboarding/actions.ts`, `chamados-data.ts`, `admin/page.tsx`, `admin/chamados/page.tsx`, `onboarding/index.tsx`, `etapas-overview.tsx`, `admin/aluno/[alunoId]/page.tsx`, `page.tsx`, `etapa/[etapa]/page.tsx`, `tarefa-item.tsx`, `login/page.tsx`, `esqueci-senha/page.tsx`, `etapas-controle.tsx`, `alunos-ativos-lista/{index,ancora,lote-acesso}`, `acompanhamento-equipe.tsx`, `gerenciar-acesso/index.tsx`, `plantao/page.tsx`, `data/alunos.ts`, `.env.example`, os 3 arquivos novos (`plantao-abas.tsx`, `tudo-em-dia-card.tsx`, `senha-temporaria.ts`) e `minha-inscricao-card.tsx`.

Item a item do pedido: (1) ok; (2) ok — `criarLogin(false)` primeiro, `precisaDecisao` volta em `admin/actions.ts:621-628` ANTES de `admin_adotar_login_existente`, e o `DialogoConfirmacao` é o único caminho para `criarLogin(true)`; `definirSenhaAluno` devolve `precisaConfirmar` sem chamar `admin_definir_senha`; (3) ok — `atualizarCliente` 0 linhas = erro nomeado + `logErro`; `definirClienteEquipe` confere o alvo com `.eq(aluno_id)` ANTES do desmarcar e confere o 2º update; (4) ok; (5) contador congelado com `useState(() => dados.precisaTrocarSenha)` e `trocarSenha()` não faz refresh (o portal não remonta) — **provado só por leitura**; overrides chegam aos DOIS `EtapasOverview`; `login`/`esqueci-senha` LEEM o parâmetro (provado no navegador); **`cadastro/actions.ts` NÃO tem min 8**; (6) ok por leitura + CSS compilado; (7) ok, medido; (8) **bloqueado**.

### PENDENTE (o que reprova)

- [F1] `src/app/cadastro/actions.ts:38` — `senha.length < 6` passa a 8, com a MESMA frase das telas ("A senha precisa ter ao menos 8 caracteres."). E `src/app/admin/actions.ts:669` e `:686` — "Senha fraca: use ao menos 6 caracteres." passa a 8 (as RPCs de senha do banco exigem 8 desde `gps_admin_gestao_de_acesso`).
- [F1] criar **`src/lib/senha-regras.ts`** (módulo puro, sem `crypto`, importável por client component) com `export const SENHA_MINIMO = 8` e usá-lo nos dois arquivos acima.
- [F3] trocar as 3 cópias locais `const SENHA_MINIMO = 8` (`src/app/cadastro/cadastro-form.tsx:24`, `src/components/perfil/trocar-senha.tsx:16`, `src/app/auth/redefinir/redefinir-form.tsx:14`) e o `8` de `src/components/onboarding/travas.ts:32` pelo import de `@/lib/senha-regras`. Uma regra, uma casa.
- [orquestrador] resetar a conta `teste.onboarding@…` (você tem o MCP; o subagente não) para `Holding#Teste2026` + `gps_senha_temp_em`, e rodar `node <scratchpad>/passe-aluno.mjs` (já escrito; servidor de pé na 3991). Ele: loga, lê "Passo X de Y" no passo 0, **troca a senha para `Holding#Teste2026x`** (registrar), lê a barra de novo (esperado "Passo 2 de 10", não "de 9"), dá F5 (esperado: passo 0 some), testa `/login?redirect=…` logado e abre `/`, `/clientes`, `/etapa/1`, `/materiais`, `/financeiro`, `/chamados`, `/perfil` em 1366 e 390 com contagem de erro de console e overflow, capturas em `shots-ciclo1/`. Para NÃO trocar a senha: 4º argumento `nao`. A saída colada aqui é a prova que falta para UX.
- [orquestrador] `npm run build` de novo antes do push (o build atual não tem `minha-inscricao-card.tsx`).

### RESSALVAS (não bloqueiam; o João lê)

1. **Guarda cross-sistema falha aberta em erro de RPC** — `senha-actions.ts:126-146` (`definirSenhaAluno`) e `:240-259` (`definirSenhaMembro`, pré-existente): `const { data } = rpc(...)` sem ler `error`; RPC fora do ar significa `programas = []` e a senha é trocada nos 7 portais sem confirmação. Correção (F1, 6 linhas): tratar `error` das duas RPCs como "não foi possível conferir os outros portais; nada foi alterado" e devolver `{ erro }`.
2. **`error.status === 422` tratado como "já existe"** (`admin/actions.ts:600-603`, pré-existente): o GoTrue devolve 422 também para `weak_password`; com `permitirAdocao:false` a UI abriria o diálogo de adoção para um erro de senha. Sem dano (a RPC de adoção recusaria), mas frase errada. Correção: só `codigo === "user_already_exists"` + fallback por mensagem quando `!codigo`.
3. **Ficha do cliente passou a EXIGIR ao menos 1 problema para salvar QUALQUER campo** (F3 4b, `cliente-ficha.tsx`) — decisão de produto tomada pelo corretor. Cliente antigo com 0 problemas (e possivelmente o "cliente 1" criado pelo onboarding, se `onboarding_concluir` não preencher `problemas`) fica com "salvar telefone" barrado até marcar um problema. A mensagem explica, mas na demo de amanhã isso pode aparecer. Medir com o MCP: `select count(*) filter (where coalesce(cardinality(problemas),0)=0), count(*) from gps.etapa1_clientes;` e conferir se `onboarding_concluir` grava `problemas`. Se o número for alto, a alternativa do auditor (tirar "marque ao menos um" do rótulo) é a de menor risco para amanhã. **Levar ao João.**
4. `TudoEmDiaCard` com NENHUMA etapa liberada diria "Tudo em dia nas etapas liberadas" — hoje impossível (Etapa 01 liberada), só registro.
5. `senha-temporaria.ts`: 32 bits de entropia (`randomBytes(4)`), igual ao gerador `Thb-` que já existia; senha de primeiro acesso com troca obrigatória e rate limit do GoTrue. `randomBytes(6)` daria folga mantendo o formato ditável.
6. `definirClienteEquipe`: a corrida "linha apagada entre a checagem e o update" ainda deixa o ambiente sem favorito — devolve erro e revalida, não mente. Fechar de vez é RPC (o F1 explicou por que não agora).
7. `/p/plantao` — o card novo (dois cliques, `autoFocus` no confirmar, tokens `risco`) está correto por leitura; não foi visto em navegador porque não está no build de pé.

### RISCO RESIDUAL

- Telas do aluno (home com `TudoEmDiaCard`/overrides, `/etapa/[n]` travada pela equipe, ficha com a validação nova, cadastro com `InputSenha`) **sem nenhuma captura** — a prova depende do reset da conta.
- Guarda cross-sistema falha aberta se `admin_status_acesso`/`admin_programas_do_email` errarem (ressalva 1).
- A validação de "ao menos 1 problema" pode barrar edições na demo (ressalva 3).

## Orquestrador — disposição dos achados do Auditor E (10/09)

- **E1 (🔴) CORRIGIDO** — `adicionarSocioAluno` (`src/app/admin/senha-actions.ts`) ganhou a guarda cross-sistema no MESMO contrato de `definirSenhaAluno`/`definirSenhaMembro`: consulta `admin_programas_do_email(email)` antes da RPC; havendo papel fora do GPS devolve `{ precisaConfirmar, programas }` sem tocar em nada. `adicionar-socio.tsx` mostra `DialogoConfirmacao` nomeando os portais ("TROCA a senha dessa conta e derruba as sessões") e repete com `confirmarOutrosSistemas: true`. Sem migração: a decisão vigente do projeto é guarda na action (idem senha); guarda no banco fica como evolução.
- **E2 (🟡) CORRIGIDO** — migração `20260910000217` (aplicada; corpo vigente = `…114`, 1 sobrecarga): FK em outro sistema deixa de abortar; `login_apagado=false` + `login_preservado_motivo`; log com o motivo. `excluirAcessoAluno` devolve `loginPreservadoMotivo`; `painel.tsx` mostra `toast.warning` com a descrição em vez de "excluído por completo".
- **E3 DESCARTADO como bug** — trecho da nota + nome do aluno no Slack é decisão explícita do João (10/09, "texto, aluno mencionado e link direto"). O CLAUDE.md da mega feature dizia o contrário e foi atualizado apontando para a decisão nova e o custo LGPD (canal privado).

### Adendo — E1/E2 do orquestrador (entraram no diff depois do veredito acima)

Diff final: **76 arquivos, +2074/−512** (5 novos: `plantao-abas.tsx`, `tudo-em-dia-card.tsx`, `senha-temporaria.ts`, migrações 216 e 217). `npx tsc --noEmit` = exit 0; `npx eslint senha-actions.ts adicionar-socio.tsx painel.tsx` = exit 0 (rodados por mim depois das duas correções).

- **E1 (`adicionarSocioAluno` + `adicionar-socio.tsx`) — APROVADO.** Guarda antes da RPC; `precisaConfirmar` volta sem tocar em nada; a UI testa `precisaConfirmar` ANTES de `erro`, o `DialogoConfirmacao` nomeia os portais e é o único caminho de `adicionar(true)`. Mesmas duas ressalvas da guarda irmã: (a) `const { data: prog }` ignora `error` da RPC — falha aberta em erro de banco; (b) conta preexistente **sem papel em portal nenhum** passa sem confirmação, e `admin_adicionar_socio` troca a senha dela do mesmo jeito (o `criar-acesso` cobre esse caso com o ramo "a conta existe, mas ainda não está em nenhum outro programa"). Nenhuma das duas bloqueia hoje.
- **E2 (migração 217 + `excluirAcessoAluno` + `painel.tsx`) — APROVADO por leitura; não provado por mim no banco (sem MCP).** Lido inteiro: `create or replace` do corpo da ...114, sub-bloco `begin … exception when foreign_key_violation` só no delete do titular (o dos outros membros já era assim), `v_login_apagado=false` + `login_preservado_motivo`, log distingue os dois casos, sem DDL, guarda `gp_is_admin()` intacta. A tela mostra `toast.warning` com a razão. **Ressalva 8:** a caixa "Excluir o ambiente inteiro" (`excluir-ambiente.tsx:34`) continua prometendo "Apaga o login de todos os membros" — depois da 217 isso é "quando o login não tiver registro em outro portal". Uma frase (F2): "Apaga o login de todos os membros que não existam em outro portal do grupo (se existirem, o login fica e só o ambiente é apagado)".
- O veredito **continua REPROVADO** pelas duas travas já listadas (senha mínima 8 em uma casa só · passe do aluno no navegador). E1/E2 não acrescentam trava.

## Orquestrador — disposição dos achados do Auditor D (10/09)

- **D1/D2 CORRIGIDOS** — o cut-off de 12:00 da véspera saiu na `…046` (08/09); a copy nova do card de cancelamento (`minha-inscricao-card.tsx`) e a seção do Plantão no CLAUDE.md foram alinhadas ("até o horário de início").
- **D3 (🔴) → PENDÊNCIA COM O JOÃO (ClickUp)** — `p_ip_hash` das 3 RPCs públicas vem do cliente: quem chamar a REST direto com a anon key forja o balde. Não dá para fechar sem um segredo que só o servidor Next tenha (o projeto não usa `service_role` e `alter role authenticator set app.*` é recusado pelo Supabase). Desenho: `PLANTAO_SERVIDOR_TOKEN` na Hostinger + o mesmo valor em `gps.config` (lido só dentro das RPCs SECURITY DEFINER); RPC confia em `p_ip_hash` apenas com token válido; sem token cai num balde único `direto:` (10/15min para TODOS os chamadores diretos). Com default seguro (token não configurado ⇒ comportamento atual) para não quebrar a apresentação. Não aplicado hoje de propósito: exige env nova e as 3 assinaturas mudam (drop + recreate, sobrecarga ambígua).
- **D4 CORRIGIDO** — `email-plantao.ts` (`enviarPlantaoSala`) ganhou a linha "Problemas para entrar? Fale com a monitoria" que o e-mail do banco (`…174`) já tinha.
- **D5 CORRIGIDO** — `calendario-mes.tsx` (3 sites) e `nps-form.tsx` trocaram `focus-visible:ring-3 …` (zerado pelo `globals.css`) pela utility `foco-visivel`.

## Orquestrador — resposta ao veredito do Fable (ciclo 1)

- **Solidificação (SENHA_MINIMO)** — `src/lib/senha-regras.ts` novo (`SENHA_MINIMO = 8`, `MSG_SENHA_MINIMO`, sem crypto). Importado em `cadastro-form.tsx`, `perfil/trocar-senha.tsx`, `auth/redefinir/redefinir-form.tsx`, `onboarding/travas.ts`; servidor `cadastro/actions.ts` passou de 6 para `SENHA_MINIMO`; as 2 frases "6 caracteres" de `admin/actions.ts` usam a constante. `rg "const SENHA_MINIMO" src` → só `senha-regras.ts`.
- **UX (passe do aluno)** — a credencial era `onboarding.teste@…` (o orquestrador tinha invertido o e-mail no relatório; corrigido no CLAUDE.md e no roteiro). Conta resetada e `passe-aluno.mjs` rodado (saída abaixo): passo 0 "Passo 1 de 10" → após trocar a senha "Passo 2 de 10" (contador estável) → F5 "Passo 1 de 9" (passo 0 sumiu); `?redirect=` com `//evil.com`, `/%2f/evil.com`, `/login` caem em `/`; `/clientes` honrado; 7 telas × 2 viewports: 0 erro de console, 0 overflow. Conta resetada de novo depois (senha `Holding#Teste2026`, respostas/clientes/progresso/eventos zerados, `gps_senha_temp_em` gravado).
- **Riscos residuais do Fable** — (a) guarda cross-sistema agora FALHA FECHADA nos 3 caminhos (`error` da RPC → `{ erro }`, `senha-actions.ts`); (b) ficha: 355 de 879 clientes (39 ambientes) têm 0 problema — a trava de salvar virou aviso âmbar no grupo, a ficha salva (`cliente-ficha.tsx`); (c) `excluir-ambiente.tsx` diz que login com registro em outro portal é preservado.
- `tsc` 0 · `eslint` 0 · rebuild em andamento (`build-ciclo1b.log`).

### Saída do passe-aluno.mjs (10/09)
```
passo 0 barra : Passo 1 de 10 · após troca barra : Passo 2 de 10 · após F5 barra : Passo 1 de 9
GET /login?redirect=/login → / · //evil.com → / · /%2f/evil.com → / · /clientes → /clientes
1366 e 390: / · /clientes · /etapa/1 · /materiais · /financeiro · /chamados · /perfil — overflow=não errosNovos=0 (14/14)
ERROS: nenhum · PASSE_EXIT=0
```

## Fable — re-veredito do ciclo 1

**VEREDITO: APROVADO** — liberado para commit + push (o orquestrador publica).

| Critério | Veredito | Uma linha |
|---|---|---|
| Segurança | APROVADO | guarda cross-sistema agora falha FECHADA nos 3 caminhos (`erroProg` → `{ erro }` em `senha-actions.ts:139,256,409`); redirects re-provados no rebuild: `/auth/confirm` inválido/vazio → 307 `/esqueci-senha?erro=link`; logado, `?redirect=/login`, `//evil.com`, `/%2f/evil.com` → `/`, `/clientes` honrado |
| Escalabilidade | APROVADO | nada mudou desde o veredito anterior; bundle `/login` 236 KB gzip no rebuild (aceite 245) |
| Solidificação | APROVADO | `src/lib/senha-regras.ts` é a fonte de `SENHA_MINIMO=8` nos 4 client files + `cadastro/actions.ts:41` (servidor 6→8) + `admin/actions.ts:670,687`; `rg "const SENHA_MINIMO" src` → 1; migração 217 lida inteira |
| UX | APROVADO | passe do aluno com a conta certa (`onboarding.teste@…`): eu mesmo re-rodei no rebuild (sem trocar senha) — passo 0 "Crie a sua senha · Passo 1 de 10", 14/14 telas (7 rotas × 1366/390) com 0 erro de console e 0 overflow; a troca de senha e o F5 ("Passo 2 de 10" → "Passo 1 de 9") ficam com a saída do orquestrador; ficha não trava mais o salvar por 0 problema (355/879 clientes), virou aviso âmbar; copy do excluir-ambiente diz que o login com registro em outro portal é preservado |
| Otimização | APROVADO (ressalva) | +1 módulo puro no lugar de 5 cópias; restam 7 literais `8` corretos mas soltos (`senha-actions.ts:116,228,390`, `onboarding/actions.ts:418`, `onboarding/index.tsx:236`, `gerenciar-acesso/painel.tsx:365`, `senha-de-membro.tsx:76`) — mesmo valor, não é trava; item de arrumação para o ciclo 2 |

VERIFICADO (por mim, sobre o rebuild `BUILD_ID` 01:15:21 > `senha-regras.ts` 01:11:54): `npx tsc --noEmit` → 0 · `npm run lint` → 0 · `grep window.confirm src` fora de comentário → 0 · `next start -p 3991` → `/login` 200 · `mede-bundle.mjs` → /login 236, /cadastro 237, /esqueci-senha 236, /p/plantao 285 · `passe-publico.mjs` 12/12 ok, 0 erro · `passe-aluno.mjs onboarding.teste@… Holding#Teste2026 x nao` → saída acima; conta NÃO alterada por mim. Diff final: 81 arquivos, +2128/−530 (5 novos).

RISCO RESIDUAL: (1) `/p/plantao` — `calendario-mes.tsx`/`nps-form.tsx`/`minha-inscricao-card.tsx` novos só por tsc/lint + carga da rota; sem clique testado em iframe; (2) as 7 cópias do `8` acima; (3) conta preexistente SEM papel em portal nenhum passa por `adicionarSocioAluno` sem confirmação (a RPC troca a senha dela do mesmo jeito); (4) `error.status === 422` ainda é lido como "já existe" em `admin/actions.ts:602` (pré-existente). O servidor `next start` da 3991 ficou de pé.

## F1b — ciclo 3

Base `548004f`. Nada commitado, nada aplicado no banco (sem MCP do Supabase nesta sessão — o roteiro de prova ficou dentro da própria migração).

### 1) Os 7 literais `8` viraram `SENHA_MINIMO`

| Antes | Depois |
|---|---|
| `src/app/admin/senha-actions.ts:117-118` (`definirSenhaAluno`) | `senha.length < SENHA_MINIMO` + `MSG_SENHA_MINIMO` |
| `src/app/admin/senha-actions.ts:229-230` (`definirSenhaMembro`) | idem |
| `src/app/admin/senha-actions.ts:398-399` (`adicionarSocioAluno`) | idem |
| `src/app/onboarding/actions.ts:418-419` (`trocarSenhaObrigatoria`) | idem |
| `src/components/onboarding/index.tsx:237` | `senha.length < SENHA_MINIMO \|\| senha !== senha2` |
| `src/components/admin/gerenciar-acesso/painel.tsx:360,365` | texto `Mínimo de {SENHA_MINIMO} caracteres` + `disabled` |
| `src/components/admin/gerenciar-acesso/senha-de-membro.tsx:69,76` | idem |

Imports novos: `senha-actions.ts:13`, `onboarding/actions.ts:31`, `onboarding/index.tsx:31`, `painel.tsx:57`, `senha-de-membro.tsx:20`. As 4 mensagens de erro que eram string literal passaram a `MSG_SENHA_MINIMO` (uma frase só, do mesmo módulo).

Sweep final — `rg -n "\b8 caracteres|< 8\b|>= 8\b|length\(trim\(p_senha\)\) < 8" src`:

```
src\lib\erros.ts:59,60  ← chave VERBATIM do raise das RPCs; casa por igualdade exata (comentário novo em :54-58 explica por que fica literal)
src\lib\senha-regras.ts:6 ← comentário citando o SQL do banco
src\components\onboarding\index.tsx:114,119,251 ← número do PASSO do onboarding
src\components\onboarding\rodape.tsx:57          ← número do PASSO
```

Sobrou só o legítimo. `rg "const SENHA_MINIMO" src` continua em 1 (`senha-regras.ts:14`).

### 2) Sócio em e-mail que JÁ tem login — a fronteira desceu para o banco

- **Migração `supabase/migrations/20260910000218_gps_admin_adicionar_socio_confirma_login_existente.sql`** (nova, NÃO aplicada). `drop function gps.admin_adicionar_socio(uuid,uuid,text,text)` + `create` com 5º parâmetro `p_confirmar_login_existente boolean default false`. Corpo copiado da `…212` (`pessoa_aluno_id` no insert e no `on conflict`), com **uma** mudança:
  ```sql
  if not coalesce(p_confirmar_login_existente, false) then
    raise exception 'Este e-mail já tem login no grupo. Confirme para trocar a senha dessa conta e adicioná-la como sócio.'
      using errcode = 'P0003';
  end if;
  ```
  Fica **depois** de `admin_alvo_e_equipe` e da checagem de "outro ambiente" (as duas são LEITURA e recusas definitivas: pedir confirmação para depois responder "esta conta é da equipe" faria o admin confirmar uma troca de senha impossível) e **antes** da primeira escrita, que é o `update auth.users`. `revoke … from public, anon` + `grant … to authenticated` refeitos (o `drop` apaga as ACLs); `comment` atualizado.
- `src/app/admin/senha-actions.ts:441` — `p_confirmar_login_existente: opts?.confirmarOutrosSistemas === true`.
- `src/app/admin/senha-actions.ts:446-451` — `error.code === "P0003"` → `{ precisaConfirmar: true, programas: [], loginExistente: true }` (campo novo, opcional, documentado em `:386-393`). A guarda por `admin_programas_do_email` ficou intacta (`:413-427`): ela nomeia os portais; a RPC é a fronteira.
- `src/components/admin/gerenciar-acesso/adicionar-socio.tsx:50,82,86,104,154-172,178-181` — um booleano de estado (`loginExistente`), `semPortais = lista vazia && loginExistente`; título "Este e-mail já tem login no grupo" e descrição "**{email}** já tem login em um portal do grupo" (sem listar portais); `consequencia`, rótulos e `destrutivo` inalterados. O `onCancelar` limpa os dois estados.
- `src/lib/erros.ts:83-95` — a frase do P0003 entrou em `FRASES_DO_BANCO` (o mapa casa por TEXTO; `P0003` **não** entrou em `POR_CODIGO` porque no Postgres ele é `too_many_rows` e só é sinal custom dentro das nossas funções). É rede: o caminho normal não passa por aqui, a action intercepta antes.

**Roteiro de prova em rollback**: está no fim da própria migração, comentado, num `do $$ … end $$` que termina em `raise exception 'PROVA …'` (o RAISE aborta tudo; não há `commit`). Cobre A) e-mail novo sem confirmação → cria; B) e-mail existente sem confirmação → `sqlstate=P0003` + `senha_intacta`/`updated_at_intacto` + contadores de `auth.users`/`gps.membros`/`gps.acessos_log` iguais antes e depois; C) e-mail existente com `true` → reaproveita o login e troca a senha; D) `set_config('request.jwt.claims','')` → 42501. Fecha com a conferência de assinatura (`pg_proc` → **1** linha, `anon=f`, `authenticated=t`) — se voltarem 2, a sobrecarga velha sobreviveu e a chamada de 4 argumentos ainda troca senha sem confirmar.

⚠️ **Ordem de publicação:** a action passa a mandar 5 argumentos. Aplicar a `…218` **antes** do deploy — com a `…212` de pé, a chamada com `p_confirmar_login_existente` volta `PGRST202` (função não encontrada).

### 3) `signUp` 422 não é mais lido como "já existe"

`src/app/admin/actions.ts:594-616` — `error.status === 422` **saiu** da condição de adoção; entrou `codigo === "email_exists"`. O 422 do GoTrue também é `weak_password`, `validation_failed` e `signup_disabled`: com o status na condição, senha fraca caía no ramo de **adoção de login** (troca de senha em 7 portais) em vez de "senha fraca". Agora 422 **com** código decide pelo código e cai nos ramos de `weak_password`/rate limit de `:681-707`; 422 **sem** código nenhum segue para a genérica traduzida. `logErro("criarAcessoAluno.signUp", …)` em `:677-680` passou a gravar `status` junto do `code`. O fallback por mensagem (`!codigo && /already/i`) e todo o fluxo de adoção continuam como estavam.

### Verificação

```
$ npx tsc --noEmit
EXIT=0
$ npx eslint src/app/admin/senha-actions.ts src/app/admin/actions.ts src/app/onboarding/actions.ts \
    src/components/onboarding/index.tsx src/components/admin/gerenciar-acesso/painel.tsx \
    src/components/admin/gerenciar-acesso/senha-de-membro.tsx \
    src/components/admin/gerenciar-acesso/adicionar-socio.tsx src/lib/erros.ts
EXIT=0
```

(as duas saíram sem nenhuma linha de saída). `next build`/`next dev` não rodados, por instrução. Diff: 8 arquivos, +98/−25, mais a migração nova.

### Aberto para o orquestrador

- Aplicar a `…218` e rodar o `do $$` de prova (colar A/B/C/D aqui) **antes** do push.
- A tela do sócio com login preexistente não foi aberta no navegador — o caminho novo do `DialogoConfirmacao` está provado só por tsc/eslint e leitura.

## Orquestrador — ciclo 3: migrações 218 e 219 aplicadas

- `…218` aplicada; a prova em rollback do próprio arquivo FALHOU no caso A com `23505 membros_user_id_key` — **bug pré-existente** (desde a criação da função): o gatilho `on_auth_user_created_gps` roda no `insert into auth.users` da própria função e, casando o CPF/e-mail do sócio, já grava um `gps.membros` para o user_id novo; o `on conflict (aluno_id, user_id)` não cobria `membros_user_id_key`. "Adicionar sócio" com e-mail novo falhava para todo sócio com documento na base.
- `…219` (corpo vigente = 218): `on conflict (user_id) do update set aluno_id = excluded.aluno_id, papel='socio', pessoa_aluno_id = coalesce(...)` + apaga o `gps.ambientes` órfão que o gatilho criou NESTA transação (`criado_em >= now()`, sem membros). Prova em rollback: A = OK (papel=socio, ambiente certo, 0 ambiente órfão, 1 membro) · B = OK P0003 com senha/updated_at intactos e users 11051→11051, membros 172→172, log 45→45 · C = OK reaproveitou e trocou a senha · D = OK 42501. Assinatura única `(uuid,uuid,text,text,boolean)`, anon=f, authenticated=t.
- Produção (`548004f`) chama com 4 argumentos nomeados: o 5º tem default, então a chamada continua válida até o deploy do ciclo 3.

## Auditor F — passo a passo do aluno (ciclo 3)

Percorrido no Chromium (Playwright), servidor `.next` de produção (`npx next start -p 3995`,
commit `548004f`), conta `onboarding.teste@programa.timeholdingbrasil.com.br`. 1366 px e 390 px.
Scripts em `C:\Users\João\AppData\Local\Temp\claude\...\scratchpad\auditor-f2.mjs`/`auditor-f3.mjs`
(referência, fora do repo). Capturas em `tmp/squad/shots-F/`.

### F-1 🔴 — o Quadro/Kanban deixa mover o cliente acompanhado de volta para Prospecção sem chamado, contradizendo o próprio aviso na tela

**Reprodução:** com um cliente favoritado (`acompanhado_equipe=true`, sem confirmação do admin —
é exatamente o estado em que o `onboarding_concluir()` deixa o cliente 1), abrir `/clientes` →
Quadro → arrastar o card do favorito de "Fechamento" para "Prospecção". O drag é aceito sem
aviso, sem confirmação, sem erro. **Recarregando a página, a fase persiste como Prospecção**
(confirmado na Lista: o dropdown inline de fase mostra "Prospecção" depois do F5).
Capturas: `41-apos-drag-card0.png` (card em Fechamento antes) → `42-drag-favorito-para-
prospeccao.png` (card já em Prospecção) → `43-apos-reload-verificando-persistencia.png` e
`44-lista-apos-drag.png` (persistido após F5).

**Por que isso contradiz a tela:** o próprio card do favorito (e o banner verde no topo de
`/clientes` e na ficha) diz: *"Este é o cliente que a equipe acompanha... Para trocar o cliente
acompanhado, abra um chamado — a equipe faz a troca com você."* Mas o aluno **não precisou de
chamado nenhum** para tirar esse cliente de Fechamento e jogá-lo de volta em Prospecção — um
arraste bastou. O CLAUDE.md (seção "Feedback de produção", migração `…215`) documenta que a
trigger recusa com 42501 "que o aluno desmarque ou apague" o favorito, e a seção da mega feature
(migração `…203`) documenta que voltar a fase para prospecção só é bloqueado **depois que o
admin confirma o acompanhamento** (`acompanhamento_confirmado_em`) — o que quase nunca acontece
na prática (não vi nenhum fluxo de confirmação do admin acontecer automaticamente). Resultado
prático: a trava anunciada na tela **não existe** para o cliente 1 recém-criado pelo onboarding,
que é exatamente o caso mais comum (todo aluno novo).

**Correção esperada:** decidir com o Marcio se a trava de fase deveria valer sempre que
`acompanhado_equipe = true` (independente de confirmação do admin), ou reescrever a copy do
banner/aviso para não prometer uma trava que só existe depois que a equipe confirma manualmente
(raro). Se a decisão for travar sempre: ajustar a guarda da trigger e desabilitar o `select`/drag
de fase para o card favorito na UI (kanban e lista) até lá. Destino: F1 backend (trigger/guarda) +
F3 UI (Quadro e select da lista).

### F-2 🟡 — a apresentação (tour) prometida ao concluir o onboarding nunca aparece sozinha

**Reprodução:** completar os 10 passos do onboarding até o passo 7 (documentos) e clicar
"Continuar" — isso dispara `onboarding_concluir()`. O diálogo **fecha direto para a Home**, sem
mostrar os passos 8/9 (a apresentação "Conhecendo o portal", 7 telas). Reproduzido 2x
(`ob-08-tour-0.png`/`ob-08-tour-1.png` mostram a Home, sem diálogo, logo após concluir).
O tour em si **funciona** — testado clicando "Rever a apresentação" em `/perfil`, que abre o
mesmo diálogo normalmente (`33-perfil-rever-tour.png`). O defeito é só na transição automática
pós-conclusão.

**Por que importa:** o CLAUDE.md descreve isso como parte do desenho ("a conclusão acontece ao
sair do passo de documentos, antes do tour: o tour é apresentação, não dado") — ou seja, ver a
apresentação faz parte do produto entregue amanhã, e hoje **nenhum aluno novo a vê** a menos que
descubra sozinho o botão "Rever a apresentação" em Perfil (que ele não sabe que existe, porque
nunca viu o tour para saber que dá pra rever). Suspeita de causa: o `router.refresh()`/remount do
`OnboardingGate` depois de `concluir()` busca `onboarding_meu()` de novo; se o `passoAtual`
salvo pela RPC não ficar em 8, o `useState` inicial do `OnboardingPortal` (que decide o passo pela
condição `Math.max(1, dados.passoAtual)`) pode não cair no tour. Não li a RPC para confirmar —
achado por comportamento observado, não por leitura de código (orçamento de tokens do auditor).
Destino: F1 backend (conferir o que `onboarding_concluir`/`onboarding_meu` devolvem de
`passoAtual`/`status` logo após concluir) + F3 (garantir que o componente aterrisse no passo 8).

### F-3 🔵 — toast "Chamado aberto. A equipe foi avisada." não confere com o estado documentado do e-mail

Ao abrir um chamado, `chamado-novo-dialog.tsx:89` sempre mostra `toast.success("Chamado aberto.
A equipe foi avisada.")`, incondicional. O próprio CLAUDE.md lista como pendência aberta hoje
(10/09): `chamados_email_equipe` vazio no banco e `EMAIL_SUPORTE` **não definida** neste ambiente
(`.env.local` não tem a chave; `.env.example` também vazia) — nessas condições "ninguém é avisado"
(texto do próprio CLAUDE.md). Não tenho acesso ao MCP do Supabase nesta sessão (auditor
só-leitura) para confirmar `gps.config.chamados_email_equipe` em produção — **pedir ao
orquestrador para conferir antes de amanhã**: se a coluna seguir vazia e `EMAIL_SUPORTE` não
estiver setada na Hostinger, o toast está mentindo para todo aluno que abrir chamado. Correção
(se confirmado): toast condicional ao `getChamadosConfig().fallbackEnv`/config, ou preencher os
destinatários antes da demo. Destino: F1 (config) ou F3 (copy condicional).

### F-4 🔵 — passo "fase" do onboarding: rótulo "Croqui Estrutural já apresentado e aguardando a execução" e "Execução em andamento" têm sobreposição textual

Não é bug de produto, é achado de teste: minha primeira tentativa de automação selecionou a fase
errada porque o rótulo do meio ("...aguardando a **execução**") contém a palavra "execução", que
também está no rótulo de baixo ("**Execução** em andamento"). Um aluno lendo com atenção não erra
(o texto completo é claro), mas software de leitura de tela ou busca por texto poderia colidir.
Não bloqueia nada — registro por transparência, não peço correção.

### Confirmado OK (tela por tela, o que vi)

- **Login → onboarding passo 0 (senha)**: força mínimo 8, aceitou a troca, "Passo 1 de 10".
- **Onboarding passos 1–7**: intro, origem (2 opções acessíveis por `<fieldset>`/rádio nativo),
  fase + nome/telefone/grau na mesma tela (nenhum cliente "sem dados" nasceu), honorários +
  contrato (só aparece quando a fase é execução — testei e confirmei o `AvisoInline` e o texto
  "Opcional agora" mudando corretamente conforme a fase), casos/ajuda (opcionais, contador de
  caracteres), documentos. Nenhum erro de console, nenhum HTTP ≥ 400 em toda a sequência.
- **Início**: hero + "Continue de onde parou" + cliente favoritado com estrela + "Seu caminho"
  (6 etapas, só a 1 disponível) + painel de progresso/meta de faturamento. Sem overflow.
- **Etapa 01**: 4 KPIs (progresso, clientes com dados, reuniões, perda pela inércia), trilho
  numerado com "Foco agora" no passo atual, passos 2/3 travados com badge "Após listar os 30
  clientes" e explicação de quanto falta, passo "Ligar" (4) destravado assim que há favorito —
  bate com a regra documentada. Nenhum "NaN"/"undefined" na tela.
- **Clientes — Lista**: banner verde de favorito, KPI "0 de 30 com dados", meta de faturamento,
  busca, ordenação, filtros de fase e de vínculo (grau de relação) com contador; "Sem nome" e
  "Não informado" honestos (nunca "Lead" como padrão, exatamente o que o CLAUDE.md pede).
- **Clientes — Quadro**: 3 colunas (Prospecção/Fechamento/Contratados) com contador; drag-and-drop
  funcionou (mouse simulado) para o card SEM favorito, moveu e persistiu depois do F5; a Meta de
  faturamento aparece dentro do quadro também.
- **Novo cliente**: diálogo enxuto (só Fase + Grau; nome/telefone ficam para a ficha, que abre
  em seguida) — "Criar e abrir a ficha" bem rotulado, sem prometer mais do que faz.
- **Ficha do cliente**: 4 seções (Dados, Andamento do contato, Contrato, Registro e perfil), barra
  inferior "Tudo salvo"/"Salvar ficha" sticky sem cobrir campo nenhum quando rolado normalmente
  (o overlap que vi numa captura era artefato do `fullPage` do Playwright sobre elemento sticky,
  não reproduz em uso real — conferido rolando de verdade). **Contrato como anexo funcionou**:
  upload do PNG de teste, mostrou nome/tamanho/data e os botões Baixar/Substituir/Remover.
- **Favoritar (caixa de certeza)**: o favorito nasceu pelo onboarding (auto-favorita quando não
  há favorito no ambiente); a ficha e a lista mostram consistentemente "Cliente acompanhado pela
  equipe" nos dois lugares.
- **Materiais**: filtros Todos/Aulas/Modelos com contador, agrupado por etapa; etapas bloqueadas
  (02, 03, 04...) mostram badge "bloqueada" e cada item sem link ativo ("Libera com a Etapa 0X"
  em vez de "Assistir"/"Abrir modelo") — bate com a decisão F.1 do CLAUDE.md.
- **Pasta**: título "Minha pasta" carregou sem erro (ambiente de teste sem pasta configurada —
  não travou a navegação).
- **Financeiro**: "Seu faturamento" com a meta R$ 150.000 · o AURUM, sem menção a bônus em
  lugar nenhum; "Seu programa" com estado vazio honesto ("Ainda não recebemos o registro do seu
  programa por aqui — a equipe está cuidando disso"), zero "R$ 0,00" fantasma, zero texto de
  sistema (`cs.`, RPC, `contatos_hm`) na tela.
- **Suporte**: abri 1 chamado de teste ("teste do war-room — pode fechar") com anexo PNG — criado,
  detalhe mostra anexo com Prévia/Baixar, campo de resposta e "Fechar chamado" disponíveis.
- **Perfil**: cartão de identificação, "Trocar senha" (com aviso de que vale para os 7 sistemas),
  "Suas respostas do início" mostrando o que respondi no onboarding, e "Rever a apresentação"
  (que É o tour funcionando — ver F-2).
- **390 px**: as 8 rotas (`/`, `/clientes`, `/etapa/1`, `/materiais`, `/pasta`, `/financeiro`,
  `/chamados`, `/perfil`) sem overflow horizontal, header rolável, kanban de clientes virou cards
  legíveis.
- **Teclado**: Tab em `/clientes` percorre skip link → logo → Sair → abas do header, todos com
  contorno de foco visível (outline 1–2px), exceto o próprio skip link no instante do teste (ver
  nota abaixo — não investigado a fundo).
- **Console/rede**: 0 erros de console, 0 respostas HTTP ≥ 400 em todas as ~9 passadas de script
  rodadas (onboarding completo, Clientes, Materiais, Pasta, Financeiro, Chamados, Perfil, 390px,
  drags do kanban).

### Não verificado / fora do orçamento desta sessão

- Skip link ("Pular para o conteúdo"): o primeiro Tab não mostrou `outline`/`boxShadow` no
  computed style no instante da leitura — pode ser técnica de exibição via posição (comum e
  válida) ou pode faltar indicador; não tirei screenshot exatamente nesse frame para confirmar
  visualmente. Vale um olhar de 30 segundos do F3.
- Perfil DISC e demais campos "de gestão" da ficha (não testados a fundo, fora do escopo do
  pedido).
- Central admin / modo assistência — fora do escopo (auditoria era do PASSO A PASSO DO ALUNO).

### Estado em que deixei a conta de teste

- **Senha atual:** `Holding#Teste2026x` (troquei de `Holding#Teste2026` durante o passo 0 do
  onboarding, como o orquestrador autorizou).
- **Onboarding:** concluído (10 passos respondidos com dados fictícios: origem "já tenho o
  cliente", fase "Croqui Estrutural já apresentado e aguardando a execução" — não "Execução em
  andamento", ver F-4 —, nome "Cliente Teste F Auditor", telefone 11999990000, grau "Parente",
  honorários R$ 15.000,00, caso e ajuda com texto de teste, sem documento anexado no passo 7).
- **Clientes criados:** 2 — "Cliente Teste F Auditor" (favorito/acompanhado pela equipe, fase
  **Prospecção** por causa do F-1 acima — estava em Fechamento antes do meu teste de drag;
  telefone (11) 99999-0000, grau Parente, honorários R$ 15.000,00, 1 anexo de contrato
  `_teste-1x1.png`) e "Sem nome" (sem nome/telefone, grau "Não informado", movido para
  Fechamento por teste de drag).
- **Chamado aberto:** 1 — "teste do war-room" / "teste do war-room — pode fechar", com anexo
  `_teste-1x1.png`, status "Aguardando a equipe". Pode ser fechado.
- **Servidor de teste**: `next start -p 3995` foi **derrubado** ao final desta auditoria.

Pedido ao orquestrador: resetar a conta (respostas/clientes/progresso/eventos/chamados do
ambiente) como de praxe, e decidir F-1 com o Marcio antes da apresentação de amanhã — é o
achado que, sozinho, mais contradiz o que a tela promete ao aluno.

## Orquestrador — disposição dos achados do Auditor F (ciclo 3)

- **F-1 (🔴 do auditor) → NÃO É BUG, é o desenho.** Mover o favorito de fase (inclusive de volta a Prospecção) não troca *qual* cliente a equipe acompanha — `acompanhado_equipe` continua nele. A trava da `…215` é sobre desmarcar/apagar (a escolha do aluno); a da `…203` (voltar a prospecção) só existe quando a EQUIPE confirmou o acompanhamento. O aviso da tela fala em "trocar o cliente acompanhado", não em mudar a fase. Registrado; se o Marcio quiser travar a fase do favorito não confirmado, é uma linha na trigger da `…215`.
- **F-2 (🟡) CORRIGIDO** — causa confirmada: `concluir()` revalida o layout; `OnboardingGate` re-renderizava com `status: "concluido"`, devolvia `null` e desmontava o portal antes do tour. Agora o gate sempre rende `OnboardingPortalLazy` para o aluno com pessoa, e o wrapper decide UMA vez na montagem (`precisa`) e congela os `dados` daquela montagem — o tour segue; quem já concluiu nunca dispara o `import()` do chunk (`portal-lazy.tsx`, `onboarding-gate.tsx`). `soTour` (Rever a apresentação) preservado.
- **F-3 (🔵) CORRIGIDO** — `gps.config.chamados_email_equipe` está VAZIO em produção (conferido via MCP). `avisarEquipe` devolve se o e-mail SAIU; `abrirChamado` devolve `equipeAvisada`; o toast diz "A equipe foi avisada por e-mail" só nesse caso e, senão, "Ele já aparece na fila da equipe" (`chamados-tipos.ts`, `chamados/actions.ts`, `chamado-novo-dialog.tsx`). Preencher os destinatários em `/admin/chamados` continua pendência do João.
- **F-4** nota, sem ação.
- Conta de teste resetada ao primeiro acesso (senha `Holding#Teste2026`; respostas/clientes/chamados/eventos zerados).

## Fable — veredito do ciclo 3

**VEREDITO: APROVADO** — liberado para commit + push (migrações 218/219 já aplicadas pelo orquestrador; deploy só depois delas, como está).

| Critério | Veredito | Uma linha |
|---|---|---|
| Segurança | APROVADO | `…218/219` lidas inteiras: `gp_is_admin()` na 1ª linha, P0003 levantado ANTES do 1º write (`update auth.users`), `drop` + `create` (1 assinatura), `revoke from public, anon` + `grant authenticated`, `search_path ''`; action decide por `error.code === "P0003"` e o erro genérico segue em `traduzirErroBanco` (`senha-actions.ts:446-452`); `criarAcessoAluno` não usa mais `status === 422` para adotar — só `user_already_exists`/`email_exists`/fallback por mensagem SEM código (`admin/actions.ts:610-614`) |
| Escalabilidade | APROVADO | zero consulta nova (`getMeuOnboarding()` já rodava em toda página do aluno; `avisarEquipe` só mudou o retorno); bundle `/login` 236 KB gz (aceite 245), `/cadastro` 237, `/esqueci-senha` 236, `/p/plantao` 285 — iguais ao ciclo 1; `/` logado e concluído 233 KB, `/perfil` 258; nenhum chunk com strings do portal no HTML de nenhuma rota; o chunk do portal (`14h69lh9dz8m-.js`) só desceu por `dynamic()` durante o questionário |
| Solidificação | APROVADO | `rg "const SENHA_MINIMO" src` → 1; `219`: `on conflict (user_id)` cobre a constraint real (`membros_user_id_key`) e o órfão só sai se `criado_em >= now()` (mesma transação) e sem membro; provas A/B/C/D do orquestrador em rollback aceitas (sem MCP nesta sessão); `avisarEquipe` devolve boolean nos 3 caminhos (`:384`, `:413`) e `responderChamado:282` ignora o retorno de propósito (continua compilando, tsc 0) |
| UX | APROVADO | **F-2 provado no Chromium** (`prova-f2-fable.mjs`, build `BUILD_ID` 01:49:06 > último fonte 01:47:36): passo 0 "Passo 1 de 10" → senha trocada → passos 1-7 (fase "Execução em andamento", honorários R$ 12.345, contrato PNG) → "Continuar" no 7 → **diálogo segue para "Conhecendo o portal · Passo 8 de 9 · 1 de 7"** → 6× Próxima + Terminar → "Pronto · Passo 9 de 9 · A equipe já recebeu as suas respostas · cliente 1 marcado" → Começar fecha → **F5: diálogo 0** → soft nav `/clientes`: 0 → `/perfil` → "Rever a apresentação" abre "Conhecendo o portal · Passo 1 de 2", Pular → "Pronto · 2 de 2" → Fechar → 2ª abertura funciona. **F-3 provado**: chamado aberto no navegador → toast "Chamado aberto. Ele já aparece na fila da equipe." (sem `EMAIL_SUPORTE` local e config vazia). 7 telas × 1366/390: 0 erro de console, 0 HTTP ≥ 400, 0 overflow. Sair → `/login` (rota, navegação completa: o wrapper remonta no próximo login) |
| Otimização | APROVADO (ressalva) | −7 literais de senha; nenhum JS novo em rota nenhuma; MAS o gate agora serializa `dados` do onboarding (respostas + anexos, ~1,5 KB brutos) no payload RSC de **toda** página do aluno concluído — antes devolvia `null`. Medido: `/` 125,4 KB (14,7 gz), `/materiais` 100,4 KB (10,4 gz) com `clienteNome`/`descricaoCaso` dentro. Aceitável hoje; arrumação: o gate mandar `dados` enxuto quando `concluido && !precisaTrocarSenha` (o wrapper nunca os usa nesse caso). E o bloco "O que ele NÃO faz" em `onboarding-gate.tsx:64-68` ficou desatualizado ("o portão devolve null") |

VERIFICADO: `npx tsc --noEmit` → 0 · `npx eslint` nos 13 arquivos do diff → 0 · `npm run build` (log do orquestrador) `BUILD_EXIT=0` · `next start -p 3991` → `/login` 200 · `mede-bundle` (cópia no scratchpad) → 236/237/236/285 · `prova-f2-fable.mjs` e `abrir-chamado-c3.mjs` (saídas acima; capturas em `scratchpad/shots-fable-c3/`) · leitura integral de `218`, `219`, `portal-lazy.tsx` (só `import type` + `dynamic`), `onboarding-gate.tsx`, `rever-apresentacao.tsx`, `chamados/actions.ts:180-414`, diff completo dos 14 arquivos.

SEM PROVA (aceito por leitura): o `DialogoConfirmacao` do sócio com login preexistente (`adicionar-socio.tsx`, título "Este e-mail já tem login no grupo") — exige admin e um e-mail com login sem papel; o roteiro SQL da 219 não foi re-rodado por mim (sem MCP).

F-1: **concordo com o orquestrador** — mover o favorito de fase não troca *qual* cliente é acompanhado; a copy ("Para trocar o cliente acompanhado, abra um chamado") não promete trava de fase. Fica como decisão de produto para o Marcio (travar fase do favorito não confirmado = uma linha na trigger da `…215`).

RISCO RESIDUAL: (1) payload RSC do onboarding em toda página do aluno concluído (acima); (2) `219` no caminho CONFIRMADO com e-mail que já é o TITULAR do mesmo ambiente rebaixa o papel para `socio` (`on conflict … set papel='socio'`) — pré-existente desde a `…118`, só o admin confirmando chega lá; (3) se o gatilho de signup casar um cadastro DIFERENTE do escolhido na tela, `pessoa_aluno_id` fica o do gatilho (`coalesce`) e o retorno diz o da tela; (4) `chamados_email_equipe` continua vazio em produção — o toast agora é honesto, mas ninguém é avisado por e-mail até o João preencher em `/admin/chamados`.

CONTA DE TESTE: senha final **`Holding#Teste2026x`**; onboarding concluído (cliente "Cliente Ficticio Fable C3", execução, R$ 12.345, contrato + documento PNG 1×1), 1 chamado "teste Fable c3 — pode fechar" (`3f7411e0-…`). Resetar como de praxe. Servidor 3991 derrubado por mim.

## Orquestrador — ciclo 4 (fechamento a pedido do João: "só termina, dá uma polidinha")

- `…220` aplicada e provada em rollback: e-mail do próprio titular → 22023, zero escrita, titular continua titular (membros 172→172, users 11050→11050); e-mail novo → pessoa final = a escolhida na tela, retorno bate, 0 ambiente órfão. Assinatura única, anon=f. `erros.ts` ganhou a frase.
- Tempos das RPCs do admin (JWT real): `admin_painel_alunos(200,0)` 56 ms · `admin_dashboard()` 41 ms · `admin_painel_atendimento()` 19 ms · `admin_diagnostico_ambiente` 307 ms.
- Dashboard reconciliado contra contagens diretas: 159 ambientes · 879 clientes (842/37/0) · 0 onboarding concluído · honorários null — bate.
- Resíduo de teste no banco: 0 logins `exemplo.invalid`, 0 chamados de prova, 0 ambientes sem membro; só "João teste" em `etapa1_clientes` (é do próprio João, não dos agentes).
- Em andamento: pentest do diff dos ciclos 1–3 e Auditor G (copy/a11y/e-mails). Aplico só o que for rápido; o resto vai para o ClickUp.

## Auditor G — admin: copy · a11y · e-mails (ciclo 4)

Só leitura, sem credencial de admin de teste — auditoria por leitura de código + renderização
isolada dos 3 e-mails (`src/lib/email.ts`, `email-plantao.ts`, `email-chamados.ts`) chamando as
funções REAIS (stub só em `fetch`/`RESEND_API_KEY`, zero produto tocado) e captura em
`tmp/squad/emails-G/*.png` (600 px, Playwright). Não repito o que o Auditor B/E já achou no admin
(central/diário/acesso/plantão já cobertos nos ciclos 1–2); foco no que ficou de fora do escopo
deles (`diario-*`/`trilha-*`, ficaram fora do F2 de propósito) e nos e-mails, que nenhum auditor
tinha renderizado ainda.

### 🔴 bloqueia apresentação

**G-1 — Os 4 e-mails do Plantão em TypeScript ainda saem com a marca ERRADA (Time Holding
Brasil/GPS) — a decisão do Marcio de 09/09 (migração `20260909000173_gps_plantao_email_marca_acelera.sql`)
rebatizou isso para Acelera Holding só no lado do banco, e o caminho TS ficou pra trás.**
`src/lib/email-plantao.ts:53-77` (`enviarPlantaoNps`), `:98-155` (`enviarPlantaoCancelamento`),
`:169-241` (`enviarPlantaoAvisoMentora`), `:263-318` (`enviarPlantaoSala`) — as 4 chamam
`layout()`/`botao()` de `email.ts` sem trocar nada. Renderizado e comprovado:
`tmp/squad/emails-G/5-plantao-cancelamento.png` mostra cabeçalho laranja "Programa de
Implementação Assistida / Time Holding Brasil" e o rodapé "Você recebeu este e-mail porque faz
parte do Programa de Implementação Assistida" — para um comprador do Acelera que pode nunca ter
ouvido falar do GPS. A migração `…173` já documenta a correção completa (cabeçalho `#180B00`,
logo `/logo-acelera-email.png`, laranja `#ED6D05`, copy "plantão de dúvidas do Acelera Holding",
remetente "Acelera Holding") — é o spec pronto, só falta aplicar no TS.
**Exposição real hoje:** `enviarPlantaoCancelamento` é chamada por `cancelarSlot`
(`src/app/admin/plantao/slots-actions.ts:627`) — ação viva, qualquer cancelamento manual de slot
dispara esse e-mail errado agora. As outras 3 só disparam por `/api/plantao/manutencao`, que está
em 500 em produção (`PLANTAO_MANUTENCAO_SEGREDO` nunca setado, ver CLAUDE.md) — sem exposição
hoje, mas precisam do mesmo conserto antes de reativar a rota (senão volta o mesmo erro que a
migração já resolveu uma vez do outro lado).
Texto atual (rodapé, `email.ts:136`): "Você recebeu este e-mail porque faz parte do Programa de
Implementação Assistida do Time Holding Brasil." → proposto para os 4 e-mails do Plantão: copiar
literalmente o texto/cores/logo que `…173` já usa no e-mail equivalente do banco.
Destino: backend-engineer (fazer `email-plantao.ts` compartilhar a mesma marca Acelera do SQL, ou
extrair para uma segunda `layout()`/`botao()` com o tema Acelera importável dos dois lados).

### 🟡 corrigir hoje

**G-2 — Botão e link de e-mail reprovam contraste AA (mesma classe de bug que o app já corrigiu em
`text-primary`).** `LARANJA = "#EA580C"` (`src/lib/email.ts:33`), usado em texto branco no botão
(`:122-124` header, `:150-154` `botao()`) e como cor de link (`:201`, `:256`, `:296`): branco
sobre `#EA580C` = **3,56:1** (abaixo de 4,5:1; o botão tem 15px bold, não chega ao limiar de
"texto grande" que aceitaria 3:1) e o link laranja sobre branco tem a mesma razão. Medido com a
fórmula de luminância relativa do WCAG. É idêntico ao achado já corrigido no app (`text-primary`
#FF6300 = 2,98:1 → `text-accent-foreground` = 5,76:1) — só que o e-mail tem constante própria e
ficou fora daquela auditoria. Afeta os 9 e-mails (todos usam `botao()`/`layout()`).
Destino: backend-engineer — usar um tom mais escuro no `LARANJA` do e-mail (ex. o mesmo #C74600
já validado no produto) ou manter #EA580C só no fundo do botão e aceitar que o link do "copie e
cole" precisa de outra cor de texto.

**G-3 — Formatação de data reimplementada fora de `datas.ts`, contrariando a regra da casa
("datas.ts é o único formatador de data").** `src/lib/email-plantao.ts:31-40`
(`dataLongaBrasilia`, `toLocaleDateString` direto) e `src/components/admin/trilha-item.tsx`… não,
**`src/components/admin/trilha-do-aluno.tsx:16-22`** (`tituloDoDia`, `toLocaleDateString` direto)
e `:25-28` (`diaLocalDoItem`, `Intl.DateTimeFormat` direto) — nenhum bug hoje (saída em pt-BR
correta, fuso fixo em `FUSO`), mas é o mesmo padrão que já causou "um dia a menos" antes (seção
(b) do CLAUDE.md) quando a formatação de data morava em vários lugares. Nenhum dos dois arquivos
importa `formatarData`/`formatarDataHora` para o formato longo porque ele não existe lá ainda.
Destino: backend-engineer/frontend-engineer — mover para `datas.ts` como `formatarDataLonga`.

**G-4 — Paleta crua fora dos tokens semânticos em `diario-*`/`trilha-*` (ficou fora do F2 do
ciclo 1 de propósito — escopo excluía essas duas pastas).** `src/components/admin/trilha-item.tsx:66-67`
(`faixaPorAtor`: `border-l-amber-500` para "equipe", `border-l-sky-500` para "sistema"), `:247`
(repete `border-l-amber-500`), `:287` (`text-emerald-700`, "Baixa dada por…"), `:306-307`
(`border-l-sky-500` + `text-sky-600` no `ShieldAlert`); `src/components/admin/diario-timeline.tsx:63`
(`text-emerald-700`, mesma frase "Baixa dada por…"). Nunca entraram no `contraste-B.mjs` (só 8
telas medidas na Onda B). Proposto: `text-sucesso-foreground` no lugar de `text-emerald-700` (já
é o par certo, 5,91:1 medido); as faixas por ator (aluno/equipe/sistema) são categoria, não
status — se for para manter 3 cores distintas, criar 3 variáveis próprias em vez de classe
Tailwind crua, para dar pra medir contraste depois.
Destino: frontend-engineer.

### 🔵 depois

**G-5 — `loading.tsx` ausente em duas rotas pesadas do admin.** `src/app/admin/plantao/page.tsx`
(3 fetches em `Promise.all` + N+1 de listas de inscritos por slot) e
`src/app/admin/chamados/[chamadoId]/page.tsx` (chamado + aluno em série, incluindo
`generateMetadata` chamando a mesma RPC de novo). A regra da casa ("Carregamento e erro", seção
(a) do CLAUDE.md) pede esqueleto nas rotas pesadas, nunca spinner nem tela anterior congelada.
Destino: frontend-engineer.

### Confirmado OK

- As 3 pendências do F2 do ciclo 1 fecharam: `app/admin/page.tsx:166` (`erro=pagina.erro ?? null`)
  e `:191` (`totalAmbientes={totalAlunos}`) já estão escritas; `trilha-do-aluno.tsx:111` já usa
  `AvisoInline` (não é mais `amber-*` cru) — o item 14 do Auditor B está 6/6 fechado hoje, não 5/6.
- Nenhum "GPS" visível em nenhum dos 9 e-mails renderizados; `esc()` presente em toda variável
  interpolada nos 3 arquivos (`nome`, `senha`, `para`, `assunto`, `motivo`, `zoomUrl`/href) —
  conferido lendo os 3 arquivos inteiros, não só o grep.
  `enviarChamadoAbertoParaEquipe`/`RespondidoParaAluno` deliberadamente NÃO levam o texto da
  mensagem (comentário no topo do arquivo bate com o LGPD do Diário) — confirmado no HTML gerado.
- Nenhum botão só-ícone sem `aria-label` nos arquivos varridos (`plantao-calendario/card-slot.tsx`,
  `plantao-inscritos/linha.tsx`, `trilha-item.tsx`, `aluno-card.tsx`, `gerenciar-acesso/*`,
  `dashboard/*`, `chamados-fila.tsx`, `solicitacao-card.tsx`, `previa-aluno.tsx`, `central/*`).
- Nenhum `null`/`undefined`/`NaN`/texto de sistema (nome de tabela, "RPC") vazando pra JSX no
  escopo lido; nenhum `R$ 0,00` hardcoded fora de comentário; `window.confirm` e `dark:` em 0
  ocorrências; `text-primary` como texto em 0 (só decorativo, `plantao-calendario/grade-mes.tsx:111`,
  permitido pela regra da casa).
- `text-primary` do e-mail não existe — `LARANJA` é constante própria do e-mail (ver G-2), não
  reaproveita a variável CSS do app (então a correção de contraste do app não "vazou" pro e-mail
  nem pra pior nem pra melhor).

### E-mails renderizados (`tmp/squad/emails-G/*.png`, 600 px)

1. `1-credenciais-sem-confirmar.png` — `enviarCredenciaisAcesso` (sem confirmação pendente)
2. `2-credenciais-precisa-confirmar.png` — `enviarCredenciaisAcesso` (com aviso de confirmar e-mail)
3. `3-acesso-liberado.png` — `enviarAcessoLiberado`
4. `4-plantao-nps.png` — `enviarPlantaoNps` (marca errada, ver G-1)
5. `5-plantao-cancelamento.png` — `enviarPlantaoCancelamento` (marca errada, ver G-1 — exposição real)
6. `6-plantao-aviso-mentora.png` — `enviarPlantaoAvisoMentora` (marca errada, ver G-1)
7. `7-plantao-sala.png` — `enviarPlantaoSala` (marca errada, ver G-1)
8. `8-chamado-aberto-equipe.png` — `enviarChamadoAbertoParaEquipe`
9. `9-chamado-respondido-aluno.png` — `enviarChamadoRespondidoParaAluno`

**Resumo:** 1 bloqueante (G-1, marca errada do Plantão em produção via `cancelarSlot`), 3 amarelos
(G-2 contraste do botão/link em todos os e-mails; G-3 data fora de `datas.ts`; G-4 paleta crua em
`diario-*`/`trilha-*`), 1 azul (G-5 `loading.tsx`). Nada de novo em `central/`, `gerenciar-acesso/`,
`dashboard/`, `chamados-*` além do que B/E já fecharam — 6/6 do item 14 do Auditor B confirmado
fechado. Prioridade para amanhã: G-1 antes de qualquer demo que cancele um slot do Plantão na
frente de alguém.

## Pentest — diff dos ciclos 1-3 (ciclo 4)

Escopo: git diff a2135e0..HEAD (548004f, ef864e9, 9935a08), sem MCP Supabase (achados de banco
verificados por leitura de migracao + roteiro SQL em rollback quando aplicavel, nao executados
por mim). Nao repito o que os auditores A-F e os vereditos do Fable (ciclos 1-3) ja julgaram - so
reabro se discordasse, e nao discordo de nada do que esta registrado. Cobri os 10 vetores
exigidos; achados abaixo sao o que sobrou depois de verificar cada um contra o codigo atual
(HEAD).

### BAIXO — mrkdwn do Slack nao escapa asterisco/underline/til/crase (CWE-116, OWASP A03)
**Onde:** `src/lib/slack.ts:90-92` (`esc()`), usado em `dados.aluno`/`m.nome` (nome do aluno e de
quem foi mencionado).
**Impacto:** `esc()` so neutraliza `&`, `<`, `>` — o suficiente para impedir forjar `<@Uxxxx>`
(mencao falsa) ou `<https://x|texto>` (link falso), que sao os vetores realmente perigosos do
mrkdwn. Nao escapa `*` `_` `~` `` ` ``. Se `thb_alunos.nome` (dado que pode ter entrado por
autocadastro ou cadastro manual, nao e texto da equipe) contiver esses caracteres, a mensagem no
canal privado da equipe pode sair com negrito/italico/tachado quebrado ou um bloco de codigo que
engole o resto da linha — nao e injecao de mrkdwn com efeito (sem forjar mencao real nem link), e
corrupcao de leitura dentro do proprio canal da equipe.
**Reproducao:** cadastrar/editar um aluno com nome contendo uma crase solta ou um asterisco no
inicio do nome, fazer uma mencao no Diario dele, ver a mensagem no Slack com a formatacao
vazando para o resto do texto (autor, trecho da nota, link).
**Evidencia:** esc() faz s.replace de & < > apenas.
**Remediacao:**
  - backend-engineer: em `src/lib/slack.ts:90-92`, escapar tambem `*` `_` `~` `` ` `` (mrkdwn do
    Slack aceita escape por barra invertida) nos campos que vem de dado de terceiro
    (`dados.aluno`, `m.nome`); `dados.autor` e `dados.texto` sao texto que a propria equipe
    escreveu e podem continuar como estao (a equipe ja usa `*negrito*` de proposito no Diario).
**Referencias:** OWASP A03:2021 (Injection, format-string/markup class), CWE-116 (Improper
Encoding of Output).

### INFO — senha temporaria com 32 bits de entropia
**Onde:** `src/lib/senha-temporaria.ts:28-31`.
**Nota:** `randomBytes(4)` = 32 bits. E senha de PRIMEIRO acesso com troca obrigatoria no passo 0
do onboarding (nao protege nada permanente) e o gerador e CSPRNG correto (`crypto.randomBytes`,
sem vies de modulo, `Math.random` explicitamente proibido no comentario) — nao e uma
vulnerabilidade em si. Registro so porque o vetor pedia medir a entropia: 32 bits e baixo para um
segredo que trafega por e-mail/WhatsApp (o canal de entrega e o elo mais fraco de qualquer
forma). Sem acesso ao painel do GoTrue, nao da para confirmar se ha limite de tentativas de login
por e-mail — se nao houver, uma senha de 32 bits combinada com e-mails conhecidos (a base de
alunos nao e secreta) e um espaco pequeno o bastante para justificar rate limit explicito no
login, nao so na senha.
**Remediacao:** confirmar com o Joao/Supabase se o rate limit de login (GoTrue) esta ativo por
identidade; se a resposta for "nao sei", vale subir para 6 bytes (48 bits) sem custo de ditado
por telefone (formato Thb-xxxx-xxxxxx, ainda hexadecimal).

### INFO — criarAcessoAluno: "adotar login" sem trava de default (defesa em profundidade)
**Onde:** `src/app/admin/actions.ts:525-547` (comentario linhas 533-536) e uso em `:630`.
**Nota, nao achado exploravel hoje:** o comentario diz "default true", mas a funcao nao tem
`= true` de fato — o teste e `opts?.permitirAdocao === false`; qualquer chamada que NAO passe
`permitirAdocao` (`undefined`) cai no ramo de adocao direta sem `DialogoConfirmacao`. Hoje os
DOIS chamadores (`criar-acesso.tsx:148`, `admin/actions.ts:845`) sempre passam o campo
explicitamente, entao nao ha caminho vivo ate esse comportamento — mas e o inverso da convencao
que o proprio projeto adota em `alunoNavItems`/`assistenciaNavItems` (opts e OBRIGATORIO e SEM
valor padrao, de proposito). Isso e friccao de UX, nao fronteira de seguranca (quem chama ja e
admin, ja pode trocar a senha de qualquer forma via `admin_definir_senha`), mas um terceiro
chamador futuro que esqueca o campo herdaria "adota sem perguntar" em silencio.
**Remediacao:** backend-engineer — trocar o tipo de `permitirAdocao` de opcional para
obrigatorio em `opts`, forcando toda chamada nova a decidir.

### Verificado e OK (prova dos 10 vetores pedidos, nao e achado)
1. **Open redirect / `?erro=`/`?motivo=`** (auth/confirm, destinoInterno, middleware.ts). Fuzzed
   destinoInterno() com 19 payloads (`//evil.com`, barra-invertida+evil.com, `%2f`, `%5c`, duplo
   encode, tab/CR/LF, unicode fullwidth barra U+FF0F, `%2e%2e`, `javascript:`, esquema embutido)
   — todos ou caem em "/" ou, quando sobrevivem (ex.: fullwidth+evil.com), o `new URL(next,
   origin)` do chamador (auth/confirm/route.ts:46, middleware.ts:82) resolve como caminho no
   MESMO origin (percent-encoda o caractere, nao interpreta como separador de host) — confirmado
   com node reproduzindo a funcao + `new URL()`. `erro=link` e `motivo=inatividade` sao
   comparados por igualdade estrita a um literal e nunca interpolados no HTML — sem XSS
   refletido.
2. **buscarAlunos/saneParaFiltro.** Remove virgula, parenteses, aspas, barra, asterisco,
   porcento, underline + controle antes do `.or()`; testei unicode fullwidth dos mesmos
   caracteres — PostgREST so reconhece os operadores ASCII, entao fullwidth nao quebra a sintaxe
   do filtro (nao e bypass, e caractere de busca inofensivo). criarAcessoAluno: 422 decidido por
   code, nunca por status (ciclo 3), adocao so com `permitirAdocao:true` vindo do 2o clique do
   DialogoConfirmacao (criar-acesso.tsx:144-184, :345, :488) — sem chamador vivo que puxe o ramo
   default (ver INFO acima). cadastrarAluno: e-mail via emailValido unico do projeto, documento
   via digito verificador, duplicata checada por aluno_por_documento (mesma normalizacao do
   gatilho) antes do e-mail.
3. **senha-actions.ts — guarda cross-sistema.** `confirmarOutrosSistemas:true` vindo direto do
   cliente na PRIMEIRA chamada (pulando o passo de diagnostico) nao e escalada de privilegio:
   quem chama ja passou por ehAdmin() e ja tem autoridade para admin_definir_senha/
   admin_definir_senha_membro/admin_adicionar_socio de qualquer jeito — a confirmacao e friccao
   de UX (nomeia os sistemas ANTES de agir), nao uma fronteira que um chamador nao-admin pudesse
   atravessar. Falha FECHADA confirmada: erroProg (erro ao consultar admin_programas_do_email)
   retorna { erro } sem seguir, nos 3 caminhos. P0003 de admin_adicionar_socio nao vaza
   e-mail/detalhe (programas vazio, loginExistente true). excluirAcessoAluno/
   login_preservado_motivo: lido por completo, begin/exception when foreign_key_violation
   isolado do delete do titular, sem DDL.
4. **Migracoes 213-219.** gp_is_admin() (ou coalesce(gp_is_admin(),false) nas guardas de
   trigger) e a primeira checagem em toda funcao nova lida; search_path vazio nas 7; revoke from
   public,anon seguido de grant to authenticated em todas; conferi por assinatura unica (sem
   sobrecarga) nas migracoes 218 para 219 (drop function antes de recriar, documentado linha a
   linha no proprio SQL). Trigger de contrato (214) usa
   `coalesce(gp_is_admin(),false) or current_user = postgres` — NUNCA `current_user <>
   session_user` (o projeto ja registrou por que: authenticator faz set role, os dois sempre
   diferem, a guarda ficaria sempre aberta). P0003 da 218/219 e levantado ANTES de qualquer
   update em auth.users ou insert — so duas leituras (equipe / outro ambiente) acontecem antes,
   e sao recusas definitivas, nao dados sensiveis novos. **A 219 (on conflict por user_id) NAO
   permite "roubar" membro de outro ambiente**: o ramo em que o login ja existe ja recusa em
   23505 quando o aluno_id existente e diferente do ambiente pedido, ANTES de chegar no
   P0003/no insert — o on conflict novo so entra em jogo no ramo de e-mail NOVO, onde o ambiente
   do gatilho so pode ser um ambiente que o PROPRIO gatilho de signup acabou de criar/casar para
   ESTE user recem-gerado (nao pode ser ambiente de terceiro pre-existente com dono diferente).
   O delete em gps.ambientes que segue so atinge linha criada na MESMA transacao e sem membro —
   nao apaga ambiente alheio com historico.
5. **chamados/actions.ts.** equipeAvisada e boolean puro (nunca o endereco) nas 3 saidas.
   avisarEquipe/chamados_email_fallback (184): RPC SECURITY DEFINER sem guarda de admin (correto
   — quem chama e o aluno) que expoe SO a chave chamados_email_fallback, nunca a tabela
   gps.config inteira (que guarda resend_api_key); authenticated executa a funcao, nao le a
   tabela. nomeDeArquivoSeguro remove barra, barra-invertida e todo controle, corta em 120 — sem
   filtro de RTLO (U+202E) mas o nome e so exibicao/download=, o MIME/extensao real do arquivo
   servido vem do mapa MIME-para-extensao (derivado do MIME real, nao do nome), entao RTLO no
   nome nao troca o tipo do arquivo que o navegador recebe.
6. **onboarding-gate.tsx + portal-lazy.tsx — dado de outra sessao sobrevivendo na mesma aba.**
   Testei o caminho completo: LogoutButton.sair() (src/components/logout-button.tsx:60) SEMPRE
   termina em `window.location.assign("/login")` — reload completo, zera todo useState do React
   (inclusive o congelado/precisa congelados em portal-lazy.tsx:67-76). Para o cenario sem
   logout explicito (sessao expira/token invalido no meio do uso): OnboardingGate reavalia a
   CADA navegacao (e Server Component), e a Guarda 1 (cookie ausente) ou a Guarda 2 (ctx nulo ou
   papel diferente de aluno) devolve null assim que a sessao para de bater — e ir para null
   troca o TIPO do no na arvore (de OnboardingPortalLazy para nada), o que desmonta a instancia
   anterior e descarta o useState congelado; um login seguinte (de outra pessoa) monta uma
   instancia NOVA com dados do novo contexto. Nao encontrei um caminho em que a troca de
   identidade aconteca sem passar por esse colapso para null. Middleware
   (proxy.ts/middleware.ts:68-73) redireciona toda rota protegida sem usuario para /login, e
   usuario JA logado que abre /login e redirecionado para dentro (nao ve o formulario) — nao ha
   caminho de UI normal para "logar como outra pessoa" sem passar pelo logout (hard reload).
   Risco residual: e protecao EMERGENTE (efeito colateral do design dos guards), nao um teste
   dedicado a este cenario — vale um teste de regressao explicito (ver Remediacao), nao uma
   correcao agora.
7. **minha-inscricao-card.tsx.** revelarLink/cancelar exigem clique em estado "entrar" ou
   "cancelar" primeiro (estado local `pedindo`), com texto da consequencia e botao nomeado antes
   de chamar a action — nenhuma das duas dispara no primeiro clique. `p_ip_hash` client-side
   continua sendo o D3 conhecido do ClickUp; nao reaberto aqui.
8. Ver achado BAIXO acima (unico ponto novo).
9. Ver achado INFO acima (unico ponto novo).
10. **Headers/CSP (next.config.ts).** nosniff, HSTS (includeSubDomains, sem preload — ja
    justificado, dominio compartilhado), Permissions-Policy e poweredByHeader:false intactos em
    todas as rotas; frame-ancestors do /p/* e Referrer-Policy mantidos como documentado (o
    alcance largo do *.hotmart.com e o LiteSpeed sobrescrevendo CSP em producao ja sao
    pendencias conhecidas — nao eram objeto desta rodada).

### Fora de escopo desta auditoria (para o Joao, nao para os agentes)
`supabase/migrations/20260910000220_gps_admin_adicionar_socio_titular_e_pessoa.sql` esta
UNTRACKED (fora de a2135e0..HEAD, trabalho do orquestrador ja em cima do ciclo 3/4 antes do meu
pentest). Nao entra neste relatorio — pede uma passada propria quando for commitada.

### Resumo
- Critico: 0 | Alto: 0 | Medio: 0 | Baixo: 1 | Info: 2
- **Nenhum finding critico/alto pendente.**
- Prioridade unica (baixa severidade, nao bloqueia): escapar asterisco/underline/til/crase em
  src/lib/slack.ts:90-92 para os campos de dado de terceiro (nome do aluno/mencionado).
- Os outros dois (INFO) sao hardening opcional — nao exigem acao antes da apresentacao de 11/09.

## Orquestrador — disposição do ciclo 4 (Auditor G + pentest) e FECHAMENTO

- **G-1 (🔴) CORRIGIDO** — `layout()` de `src/lib/email.ts` ganhou `marca: "acelera"` (cabeçalho escuro `#180b00` + `/logo-acelera-email.png` + rodapé "exclusivo de quem faz parte do Acelera Holding"), `botao(href, rotulo, cor)` e `remetente(nome)` (mesmo endereço verificado, nome "Acelera Holding"). `email-plantao.ts` usa os três nos 4 e-mails (o de cancelamento é o que dispara hoje por `cancelarSlot`). Paridade com a migração `…173`.
- **G-2 (🟡) CORRIGIDO** — `LARANJA` dos e-mails passou de `#EA580C` (3,56:1) para `#C74600` (4,88:1, o `--color-marca-acao`).
- **G-4 (🟡) CORRIGIDO** — `trilha-item.tsx` e `diario-timeline.tsx` sem paleta crua (`atencao/neutro/sucesso-foreground`).
- **G-3 / G-5 (🟡/🔵) → ClickUp** — formatador de data fora de `datas.ts` (2 sites) e `loading.tsx` faltando em `/admin/plantao` e `/admin/chamados/[id]`: arrumação, sem risco para a apresentação.
- **Pentest do diff dos ciclos 1–3: 0 crítico · 0 alto · 0 médio · 1 baixo · 2 info.** BAIXO (`slack.ts` `esc()` não escapa `*_~` — cosmético no mrkdwn) e INFOs (32 bits na senha temporária de uso único; `permitirAdocao` opcional em `criarAcessoAluno`) → ClickUp. `…220` ficou fora do diff auditado (foi aplicada depois); provas em rollback acima.
- Fechamento a pedido do João ("só termina, dá uma polidinha"): sem ciclo novo depois deste.
