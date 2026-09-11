# Feature "Equipe" — decisões do Marcio (11/09/2026)

## O que a feature É (e o que não é)

🔑 **O portal compartilhado JÁ EXISTE.** Medido: 142 titulares, **10 sócios em
10 ambientes**, todos com exatamente 1 sócio. Tarefas, clientes e progresso já
são do AMBIENTE. A feature **inverte quem convida** — hoje só o admin
(`gps.admin_adicionar_socio`). Não redesenha `gps.membros`.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| 1 | Rafael Pinheiro Aguilar (único sócio que está como titular) | **Rebaixar a sócio da Michelle** |
| 2 | 3 pares mal formados na planilha | **Ignorar** — restam 11 válidos |
| 3 | Como o sócio recebe acesso | **Link por e-mail, ele cria a própria senha** |
| 4 | Remover sócio **ativo** | **Só a equipe, por chamado** (igual à troca do favorito) |
| 5 | Sócio que já tem login no grupo | **Instruir a entrar com a senha atual** — nunca adotar |
| 6 | Ativação | **Um titular de teste primeiro**, depois abrir sem deploy |
| 7 | Validade do link | **7 dias**, com reenvio pelo titular |
| 8 | Quem convida | **Só o titular** (teto de 1 por ambiente) |

### Card do admin — o que SAI (para caber o sócio sem poluir)
- badge **"N pessoas"** (redundante com o nome do sócio escrito)
- chip **"com login"** (está em 100% dos cards — não separa ninguém)
- badge **"onboarding concluído"** (notícia é a falta, não a ordem)
- **"Entrou em"** e **"Último acesso"** viram `title` (é o que estoura a altura)

Entram 2 linhas, saem 3 elementos + 1 linha. O card não cresce.

## Correções ao plano do arquiteto (conferidas no banco)

1. ✅ **Não existe teto de sócios hoje.** `membros_um_titular_por_ambiente` é
   parcial `where papel='titular'`; `socio` escapa. O teto de 1 é **novo** e
   nasce na RPC (a contagem vive em `gps.membros`, não na tabela de convites).
   Os 10 ambientes têm exatamente 1 sócio → **o teto não quebra ninguém**.
2. 🔴 **`membros_pessoa_uk` EXISTE** (`unique (pessoa_aluno_id) where not null`)
   — o arquiteto afirmou que não. Importa na unificação do Rafael: se a
   `pessoa_aluno_id` dele colidir no destino, o update falha com 23505.

## Armadilhas registradas (não descobrir de novo)

- 🔴 **`membros_user_id_key` é UNIQUE** e o gatilho `on_auth_user_created_gps`
  cria membro **dentro** do insert em `auth.users` → `on conflict (user_id) do
  update` (lição da migração …219).
- 🔴 **`acessos_log.acao` tem CHECK fechado** (15 valores). Acrescentar
  `socio_convidado`/`socio_convite_aceito` **antes**, senão o log aborta a
  transação inteira.
- 🔴 **Comparação de e-mail = `lower(trim(both from email))`**, a expressão
  exata do índice de `thb_alunos`. `btrim(lower())` não usa o índice (o
  incidente de 19/08 foi isso).
- 🔴 **Resend: 10 req/s.** Nada de disparo em lote sem pausa.
- 🔴 **`/convite` é rota pública** → allowlist do middleware **e** fora de
  `publicaQuePrecisaDeSessao` (o `getUser()` custa ~390 ms e derruba a tela de
  quem ainda não tem conta).

## O onboarding do Rafael (achado que quase passou)

`gps.onboarding_respostas` dele tem `ambiente_aluno_id = eccb2de7…`, o ambiente
que será apagado. **A unificação precisa repontar** para o ambiente da Michelle.
Ele está travado no **passo 3** (`concluido_em` nulo) — virar sócio não resolve.

## Não fazer

- Não converter os "65 sócios na planilha, titulares no sistema": **sem o par
  "sócio de quem", não há o que unificar**.
- Não usar `thb_alunos.socio_de_aluno_id` / `eh_socio` — dado sujo provado.
- Não mexer no ambiente Alexsandro/Paula (`006cae01-…`): e-mail trocado que
  funciona fica como está, ordem do Marcio.
- Não importar os 11 pares como convite pendente — o titular convida quando
  quiser.
