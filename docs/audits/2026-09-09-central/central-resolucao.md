# Central de resolução — o ambiente do aluno se conserta por dentro

> Plano do `arquiteto` · 09/09/2026 · alvo: `main` pós `f257f24`
> Escopo: `/admin/aluno/[alunoId]/resolver` + 9 migrations + 11 actions.
> **Nenhuma linha de `src/` é escrita aqui.** Quem executa é `backend-engineer` e
> `frontend-engineer`; quem valida é o `fable-orchestrator`.

---

## 0. Conceito (leia isto antes de qualquer SQL)

**A Central de resolução não é um painel de poderes novos. É UMA LEITURA do ambiente —
um diagnóstico — em que cada linha vermelha tem, ao lado, o único remédio correspondente.**

A regra que decide tudo o que entra e o que não entra:

> Se o admin não consegue ler na tela **por que** está clicando, o botão não existe.
> Diagnóstico sem botão é aceitável (é informação). Botão sem diagnóstico não é.

O que **muda no modelo de domínio** (e é o coração do plano):

1. **`gps.membros` sabe qual LOGIN é de cada membro, mas não sabe qual PESSOA ele é.**
   `gps.admin_adicionar_socio(p_ambiente_aluno_id, p_socio_aluno_id, …)` recebe o cadastro do
   sócio e **joga fora** — usa `p_socio_aluno_id` só para copiar o `documento` para o
   `raw_user_meta_data` e para escrever um texto no log
   (`supabase/migrations/20260909000118_gps_admin_gestao_de_acesso_baseline.sql:212` e `:228-229`).
   O sistema já paga o preço disso em **dois lugares quentes**:
   - `src/lib/auth.ts:95-106` — para todo sócio, **toda requisição** faz um `ilike` em
     `thb_alunos.email` só para descobrir quem ele é;
   - `src/app/admin/senha-actions.ts:268-277` — o comentário explica que com `eq` o cadastro não
     casava e o admin recebia a senha certa **sem nome e sem telefone**.

   "Sócio não vinculado" e "sócio não encontrado" **não são bug de tela: é a coluna que falta.**
   → **`gps.membros.pessoa_aluno_id`** (a única coluna nova além da tabela de override de etapa).

2. **Liberação de etapa é global (`gps.etapas.liberada`) e o programa é individual.**
   → **`gps.etapa_liberacao_aluno`**, com a regra de leitura `coalesce(override, global)`.

3. **O ambiente é do titular por identidade, não por convenção.** `gps.membros.aluno_id` É o
   `thb_alunos.id` do titular. Trocar o titular tem duas leituras que dão trabalhos diferentes
   (§G.2) — e uma delas vaza o financeiro de um terceiro. **BLOQUEIO.**

---

## 1. Medições obrigatórias ANTES de escrever qualquer migration

Agente não tem banco (regra do projeto, `docs/audits/2026-09-08-9-features/9-features.md` §A.5).
**O orquestrador roda isto pelo MCP Supabase (`mbvybujpkwuorhtdzcde`) e cola o resultado neste
arquivo, na seção "MEDIDO", antes de liberar o backend.** Três destas são gates: se o número vier
diferente do esperado, a peça correspondente **não** entra.

```sql
-- M1 · GATE DO FINANCEIRO. cs.contatos_hm tem por onde casar pessoa?
--    O CLAUDE.md diz, na seção do Plantão, que "cs.contatos_hm não liga por e-mail".
--    Se NÃO houver coluna de e-mail NEM de documento, a peça "Vincular cadastro
--    financeiro" MORRE aqui e vale a alternativa B-F1b (só diagnóstico + chamado).
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'cs' and table_name = 'contatos_hm'
 order by ordinal_position;

-- M2 · GATE DO FINANCEIRO. Escrever em cs.contatos_hm dispara o quê?
--    Lição do vault: "procurar DELETE na cadeia de triggers" antes de todo backfill.
select t.tgname, p.proname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
 where n.nspname = 'cs' and c.relname = 'contatos_hm' and not t.tgisinternal;

-- M3 · quantos contratos estão órfãos e quantos ambientes estão sem contrato
select count(*) filter (where aluno_id is null)      as contratos_orfaos,
       count(*) filter (where aluno_id is not null)  as contratos_vinculados,
       count(*)                                       as total
  from cs.contatos_hm;
select count(*) from gps.membros m where m.papel = 'titular'
   and not exists (select 1 from cs.contatos_hm h where h.aluno_id = m.aluno_id);
-- esperado: 31 (o número do B7, medido em 09/09). Divergiu? o diagnóstico mente.

-- M4 · GATE DO pessoa_aluno_id. Quantos sócios casam com EXATAMENTE 1 cadastro?
select m.papel,
       count(*)                                                    as membros,
       count(*) filter (where a.id is not null)                    as casam_1,
       count(*) filter (where a.id is null and m.user_id is not null) as sem_cadastro,
       count(*) filter (where m.user_id is null)                   as sem_login
  from gps.membros m
  left join auth.users u on u.id = m.user_id
  left join public.thb_alunos a on lower(trim(a.email)) = lower(trim(u.email))
 group by m.papel;
-- Se `casam_1` < total de sócios, os que sobram nascem com pessoa_aluno_id NULL e
-- aparecem em VERMELHO no diagnóstico. Isso é o esperado — é a lacuna ficando visível.

-- M5 · o índice único de pessoa_aluno_id vai passar? (mesma pessoa em 2 ambientes)
with candidato as (
  select m.id, m.papel,
         case when m.papel = 'titular' then m.aluno_id
              else (select a.id from public.thb_alunos a
                     join auth.users u on u.id = m.user_id
                    where lower(trim(a.email)) = lower(trim(u.email)) limit 1) end as pessoa
    from gps.membros m)
select pessoa, count(*) from candidato where pessoa is not null
 group by pessoa having count(*) > 1;
-- Esperado: 0 linhas. Se vier alguma, NÃO criar o índice único nesta rodada:
-- é uma pessoa real em dois ambientes e a decisão é do João.

-- M6 · tamanho de gps.acessos_log (o CHECK novo revalida a tabela inteira)
select count(*), min(criado_em), max(criado_em) from gps.acessos_log;
select acao, count(*) from gps.acessos_log group by acao order by 2 desc;

-- M7 · quantos ambientes existem hoje, e quantos têm sócio
select count(*) as ambientes, count(*) filter (where n > 1) as compartilhados
  from (select aluno_id, count(*) n from gps.membros group by aluno_id) t;
-- esperado: 125 ambientes, 13 compartilhados.

-- M8 · progresso: quantas linhas o "zerar etapa" tocaria, por etapa
select etapa, count(*) filter (where concluida) as concluidas, count(*) as linhas
  from gps.progresso group by etapa order by etapa;

-- M9 · solicitações pendentes hoje (a fila que a Central passa a resolver por dentro)
select count(*) from gps.solicitacoes_acesso where status = 'pendente';
```

> **MEDIDO:** _(o orquestrador preenche aqui antes de o backend começar)_

---

## A. Inventário — problema × hoje × proposto

### A.1 Acesso

| Problema | Hoje | Proposto |
|---|---|---|
| Login não existe | `criarAcessoAluno` (`src/app/admin/actions.ts:480`) via `signUp` em cliente isolado, **dentro de `CriarAcesso`**, que só abre em `/admin` | **Reaproveitar sem tocar.** A Central linka: o diagnóstico diz "sem login" e o botão abre o mesmo diálogo, já com o aluno selecionado |
| Sem senha / senha perdida | `definirSenhaAluno` (titular, `senha-actions.ts:108`) e `definirSenhaMembro` (por membro, `:184`) | **Existe e está certo.** A Central só mostra o vermelho e o botão. Zero código novo |
| E-mail do login ≠ e-mail do cadastro | `admin_status_acesso` já devolve `email_bate` (`…118:94`); `atualizarEmailAluno` existe em `actions.ts:395` e **NUNCA é chamada** (`rg` → 0 chamadores) | `gps.admin_atualizar_email_cadastro` (RPC nova, com **log**) + a action passa a ser usada. **Alinha o CADASTRO ao LOGIN**, nunca o contrário — o login é o que a pessoa digita e é compartilhado por 7 sistemas |
| Login existe em outro sistema | `admin_adotar_login_existente` (`…020`), alcançável **só** pelo caminho de erro do `signUp` (`actions.ts:530-583`) | **Vira botão de primeira classe** no diagnóstico ("Adotar o login que já existe"), com a lista de programas do `admin_programas_do_email` na confirmação. Nenhuma RPC nova |
| Conta presa fora do portal (caso `gugabatera`) | Combinação de "adotar" + "definir senha"; o admin tinha de saber a ordem | O diagnóstico **nomeia o caso**: "existe login com este e-mail, mas ele não é membro deste ambiente" → um botão só |
| Solicitação pendente sem match | `admin_status_acesso.solicitacao_pendente` (booleano) + fila em `/admin` | O diagnóstico mostra a **linha** (nome/e-mail/telefone/quando) e leva a `/admin` com a fila. `aprovarSolicitacao` já recusa mover login de outro ambiente (`actions.ts:293-326`) — **não duplicar essa regra** |
| Login sem ambiente (`sem_acesso`) | Só a fila de solicitações | `adicionarAlunoGps` (`actions.ts:266`) exposta pelo diagnóstico quando não há linha em `gps.membros` |

### A.2 Sócio

| Problema | Hoje | Proposto |
|---|---|---|
| Adicionar | `admin_adicionar_socio` (`…118:161`) + `AdicionarSocio` | intocado |
| Remover | `admin_excluir_membro` (`…131:84`) + `DialogoRemoverSocio` | intocado |
| **Sócio sem vínculo com pessoa** | **Não existe.** `gps.membros` não guarda o cadastro do sócio (§0.1) | **`gps.membros.pessoa_aluno_id`** + `gps.admin_vincular_membro_cadastro` + busca tolerante (`buscarAlunos`, já existe) ou "Cadastrar aluno" (`CadastrarAlunoForm`, já existe) |
| Sócio "não encontrado" (e-mail digitado ≠ login) | `auth.ts:95-106` erra em silêncio: `membroNome` fica `null` e a tela mostra o nome do **titular** | Com `pessoa_aluno_id`, o nome vem por **PK**, não por `ilike`. O `ilike` fica só como fallback de quem ainda está NULL |
| Trocar o titular | **Não existe.** `membros_um_titular_por_ambiente` (índice único parcial, baseline:210) recusa dois titulares | `gps.admin_trocar_titular` — rebaixa e promove **na mesma transação, nessa ordem**. ⚠️ **BLOQUEIO B-T1** (§G.2): a Leitura A vaza o Financeiro do titular antigo |
| Mover membro para outro ambiente | **Não existe.** `membros.user_id` é UNIQUE → a pessoa está em no máximo 1 ambiente | `gps.admin_mover_membro` — **só sócio**, ambiente de destino precisa ter titular. O que a pessoa fez fica no ambiente antigo (dado é do ambiente) e a tela diz isso |

### A.3 Financeiro

| Problema | Hoje | Proposto |
|---|---|---|
| Ambiente sem linha em `cs.contatos_hm` (31 de 125) | A aba mostra "Financeiro não disponível para este cadastro" e o admin vê o diagnóstico — **e não tem o que fazer** | Diagnóstico lista **candidatos** em `cs.contatos_hm` (`aluno_id is null` **e** e-mail **ou** documento coincidem, teto 5) + botão **"Vincular cadastro financeiro"**. ⚠️ **BLOQUEIO B-F1** (§G.1) e **gate M1/M2** |
| Contrato vinculado ao aluno errado | nada | **"Desvincular"** — só quando existir linha `financeiro_vinculado` em `gps.acessos_log` para aquele contrato (**nós** fizemos o vínculo). Vínculo feito pelo sip **não** se desfaz por aqui |
| Contrato de outro produto (AURUM) | aviso na tela | intocado |

### A.4 Trilha

| Problema | Hoje | Proposto |
|---|---|---|
| Reabrir/concluir tarefa | **JÁ EXISTE**: `TarefaItem` no modo assistência → `marcarTarefa` (`src/app/clientes/actions.ts:267`), usado por `etapa-guide.tsx:55` e `etapa1-guide.tsx:99`; a trigger `…002` grava `tarefa_concluida`/`tarefa_reaberta` com `ator='equipe'` | **Nada de novo.** A Central **linka** para `/admin/aluno/[id]/etapa/[n]`. Duplicar o checkbox seria uma segunda porta para a mesma escrita |
| Zerar a etapa | não existe | 🔴 **NÃO apagar.** `gps.aluno_eventos_capturar_progresso` faz `if tg_op = 'DELETE' then return old;` (`…002:167`): **um DELETE em `gps.progresso` apaga o progresso sem deixar UMA linha na trilha.** Proposto: `update … set concluida=false` — gera N `tarefa_reaberta`, preserva a linha e o histórico |
| Liberar/travar etapa para UM aluno | `gps.etapas.liberada` é **global** (`etapas-actions.ts:9`) | `gps.etapa_liberacao_aluno` + `gps.etapas_do_aluno()`. Regra: **`coalesce(override, global)`** — o override VENCE (§C do conflito) |
| Trocar o cliente acompanhado | existe (`definirClienteEquipe`, `clientes/actions.ts:226`, com confirmação nomeada) | linkado, não reimplementado |
| Ênfase de tarefa | existe (`definirEnfaseTarefa`, `:297`) | linkado |

### A.5 Diagnóstico geral

| Hoje | Proposto |
|---|---|
| `admin_status_acesso` (acesso), `admin_direito_ao_acesso` (pagamento), `admin_programas_do_email` (outros portais), `admin_painel_atendimento` (pendências/chamados, **base inteira**), `financeiro_do_aluno` (contratos) — **cinco leituras espalhadas por três telas** | **`gps.admin_diagnostico_ambiente(p_aluno_id)`**: um JSON, uma tela. **CHAMA** `admin_status_acesso` e `admin_direito_ao_acesso` (não copia). Não chama `admin_painel_atendimento` (é da base inteira; aqui é um aluno) |

### A.6 Código morto que a Central resolve (crédito de otimização)

- `atualizarEmailAluno` (`actions.ts:395-408`) — **0 chamadores**. Ganha casa **e** log.
- `removerAlunoGps` (`actions.ts:659-669`) — **0 chamadores** e é cópia literal de
  `excluirAcessoAluno` (`senha-actions.ts:307`), a mesma RPC. **Apagar** (−11 linhas).
- `auth.ts:95-106` — o `ilike` por sócio em toda requisição vira `eq` por PK.

---

## B. Modelo — SQL completo

Convenções obrigatórias (herdadas): `supabase/migrations/AAAAMMDDNNNNNN_gps_<slug>.sql`; cabeçalho
com motivação **medida**, "o que NÃO faz" e a linha de reversão **literal**; `security definer` com
`set search_path = ''` e identificadores qualificados; abertura `if not public.gp_is_admin() then
raise … 42501`; **`revoke` de `public, anon` ANTES do `grant` a `authenticated`**; `comment on` em
tudo; **nunca `service_role`**.

### B.0 `…150_gps_acessos_log_acoes_da_central.sql`

Precisa vir **primeiro**: as RPCs abaixo escrevem `acao` que o CHECK atual recusa
(baseline:585-586 aceita só 5 valores).

```sql
-- Amplia gps.acessos_log.acao para as ações da Central de resolução.
-- Por que existe: acessos_log_acao_check (baseline 00000000000000, linha 585) aceita
-- 5 valores. Toda RPC nova desta rodada grava no MESMO log — auditoria de acesso e de
-- vínculo mora num lugar só — e sem isto cada uma morreria com 23514 no ÚLTIMO passo,
-- exatamente como admin_adotar_login_existente morreu por 15 dias (migração ...020).
-- O QUE NÃO FAZ: não muda RLS, grants, colunas nem linha existente.
-- REVERSÃO: alter table gps.acessos_log drop constraint acessos_log_acao_check;
--           alter table gps.acessos_log add constraint acessos_log_acao_check
--             check (acao = any (array['senha_definida','acesso_excluido',
--               'socio_adicionado','membro_excluido','ambiente_ambiguo']));
--           (só depois de apagar as linhas com as ações novas — senão o add falha)

alter table gps.acessos_log drop constraint if exists acessos_log_acao_check;
alter table gps.acessos_log add constraint acessos_log_acao_check
  check (acao = any (array[
    'senha_definida', 'acesso_excluido', 'socio_adicionado', 'membro_excluido',
    'ambiente_ambiguo',
    -- Central de resolução (09/09/2026)
    'membro_vinculado_cadastro',   -- membro ⇄ thb_alunos
    'membro_desvinculado_cadastro',
    'titular_trocado',
    'membro_movido',               -- sócio de um ambiente para outro
    'email_cadastro_alterado',     -- thb_alunos.email alinhado ao login
    'etapa_liberacao_aluno',       -- override de liberação por aluno
    'progresso_zerado',            -- etapa reaberta em bloco
    'financeiro_vinculado',        -- cs.contatos_hm.aluno_id preenchido
    'financeiro_desvinculado'
  ]));
```

> ⚠️ `drop`+`add` revalida a tabela inteira. Rodar **M6** antes; com < 10 mil linhas é
> instantâneo. Se `gps.acessos_log` tiver crescido, avisar antes de aplicar.

### B.1 `…151_gps_membros_pessoa_aluno_id.sql` — a coluna que faltava

```sql
-- gps.membros passa a saber QUAL PESSOA é cada membro.
--
-- POR QUÊ (medido no código, não suposto):
--   gps.admin_adicionar_socio recebe p_socio_aluno_id e NÃO GUARDA (migração ...118,
--   linhas 212 e 228): o cadastro do sócio some no ato de criar o login. Consequências
--   reais que o repo já paga:
--     * src/lib/auth.ts:95-106 — TODA requisição de sócio faz ilike em thb_alunos.email
--       só para descobrir de quem é a sessão;
--     * src/app/admin/senha-actions.ts:268-277 — o comentário registra que, com o
--       casamento por e-mail falhando, o admin recebia a senha certa SEM nome e SEM
--       telefone, e a tela sumia com o botão de WhatsApp.
--   "Sócio não vinculado" e "sócio não encontrado" são ESTA coluna faltando.
--
-- O QUE NÃO FAZ:
--   * NÃO cria linha em public.thb_alunos;
--   * NÃO muda papel, user_id, aluno_id nem RLS;
--   * NÃO ganha grant de update para `authenticated` (o grant de gps.membros é POR
--     COLUNA — só (perfil, atualizado_em), baseline:246. Escrita aqui é só por RPC);
--   * NÃO exige pessoa_aluno_id = aluno_id no titular: gps.admin_trocar_titular quebra
--     essa igualdade de propósito, e é justamente ela que a guarda do Financeiro lê.
--
-- REVERSÃO: alter table gps.membros drop column pessoa_aluno_id;  (a coluna é aditiva;
--   nenhum caminho existente lê ela até o deploy do TS)

alter table gps.membros
  add column if not exists pessoa_aluno_id uuid
    references public.thb_alunos(id) on delete set null;

comment on column gps.membros.pessoa_aluno_id is
  'Cadastro (public.thb_alunos) da PESSOA deste membro. Para o titular e igual a aluno_id (o ambiente E dele). Para o socio e o cadastro proprio -- o dado que gps.admin_adicionar_socio recebia e jogava fora. NULL = a equipe ainda nao vinculou: aparece em vermelho na Central de resolucao. Escrita SO por gps.admin_vincular_membro_cadastro (nao ha grant de update nesta coluna para authenticated).';

create index if not exists membros_pessoa_aluno_idx
  on gps.membros (pessoa_aluno_id) where pessoa_aluno_id is not null;

-- ── backfill 1: titular. IDENTIDADE, não inferência: gps.membros.aluno_id É o
--    thb_alunos.id do titular por definição (baseline, comentário de gps.ambientes).
update gps.membros m
   set pessoa_aluno_id = m.aluno_id
 where m.papel = 'titular' and m.pessoa_aluno_id is null;

-- ── backfill 2: sócio, SÓ quando o e-mail do login casa com EXATAMENTE 1 cadastro.
--    thb_alunos tem índice único em lower(trim(email)), então o count é sempre <= 1;
--    a condição fica escrita mesmo assim, porque o dia em que esse índice mudar o
--    backfill não pode passar a grudar gente na linha errada em silêncio.
update gps.membros m
   set pessoa_aluno_id = a.id
  from auth.users u
  join public.thb_alunos a
    on lower(trim(a.email)) = lower(trim(u.email))
 where m.user_id = u.id
   and m.papel   = 'socio'
   and m.pessoa_aluno_id is null
   and (select count(*) from public.thb_alunos a2
         where lower(trim(a2.email)) = lower(trim(u.email))) = 1;

-- ── o invariante que o BANCO passa a garantir sozinho: uma pessoa, um membro.
--    ⚠️ SÓ criar se M5 devolveu 0 linhas. Se devolveu alguma, é gente real em dois
--    ambientes e a decisão é do João — comentar esta linha e registrar em BLOQUEIOS.
create unique index if not exists membros_pessoa_uk
  on gps.membros (pessoa_aluno_id) where pessoa_aluno_id is not null;

-- ── a RPC de conserto
create or replace function gps.admin_vincular_membro_cadastro(
  p_membro_id uuid, p_pessoa_aluno_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare m record; a record; v_email text; v_antes uuid;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;

  select id, nome, email into a from public.thb_alunos where id = p_pessoa_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;

  -- O titular É o dono do ambiente. Apontar o titular para outro cadastro não é
  -- "vincular": é trocar o titular, que tem consequência no Financeiro e função
  -- própria. Recusar aqui é o que impede a troca acontecer pela porta errada.
  if m.papel = 'titular' and p_pessoa_aluno_id <> m.aluno_id then
    raise exception 'Para o titular, o cadastro é o dono do ambiente. Use "Trocar titular".'
      using errcode = '42501';
  end if;

  if exists (select 1 from gps.membros x
              where x.pessoa_aluno_id = p_pessoa_aluno_id and x.id <> p_membro_id) then
    -- Sem dizer de QUEM é o outro ambiente (mesma regra de aprovarSolicitacao,
    -- src/app/admin/actions.ts:311): quem resolve não precisa do dado alheio.
    raise exception 'Este cadastro já está vinculado a outra pessoa do programa.'
      using errcode = '23505';
  end if;

  v_antes := m.pessoa_aluno_id;
  update gps.membros set pessoa_aluno_id = p_pessoa_aluno_id where id = p_membro_id;

  if m.user_id is not null then
    select email into v_email from auth.users where id = m.user_id;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_vinculado_cadastro', m.aluno_id, m.user_id, v_email,
          format('membro %s vinculado ao cadastro %s (%s)%s',
                 coalesce(m.papel,'?'), coalesce(a.nome,'sem nome'),
                 coalesce(a.email,'sem e-mail'),
                 case when v_antes is null then '' else ' — antes: ' || v_antes::text end),
          auth.uid());

  return jsonb_build_object('membro_id', m.id, 'pessoa_aluno_id', p_pessoa_aluno_id,
                            'nome', a.nome, 'email', a.email, 'antes', v_antes);
end $function$;

comment on function gps.admin_vincular_membro_cadastro(uuid, uuid) is
  'Liga um membro do ambiente ao cadastro da PESSOA em public.thb_alunos. Recusa apontar o titular para cadastro diferente do dono do ambiente (isso e trocar titular) e recusa dois membros no mesmo cadastro. Registra em gps.acessos_log (membro_vinculado_cadastro). Reversao: chamar de novo com o cadastro certo, ou gps.admin_desvincular_membro_cadastro.';

create or replace function gps.admin_desvincular_membro_cadastro(p_membro_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare m record;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into m from gps.membros where id = p_membro_id;
  if not found then raise exception 'Membro não encontrado.' using errcode = 'P0002'; end if;
  if m.pessoa_aluno_id is null then
    raise exception 'Este membro já está sem cadastro vinculado.' using errcode = '22023';
  end if;
  if m.papel = 'titular' then
    raise exception 'O titular não pode ficar sem cadastro — o ambiente é dele.'
      using errcode = '42501';
  end if;
  update gps.membros set pessoa_aluno_id = null where id = p_membro_id;
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, detalhe, feito_por)
  values ('membro_desvinculado_cadastro', m.aluno_id, m.user_id,
          'antes: ' || m.pessoa_aluno_id::text, auth.uid());
  return jsonb_build_object('membro_id', m.id, 'antes', m.pessoa_aluno_id);
end $function$;

revoke execute on function gps.admin_vincular_membro_cadastro(uuid, uuid)  from public, anon;
revoke execute on function gps.admin_desvincular_membro_cadastro(uuid)     from public, anon;
grant  execute on function gps.admin_vincular_membro_cadastro(uuid, uuid)  to authenticated;
grant  execute on function gps.admin_desvincular_membro_cadastro(uuid)     to authenticated;
```

### B.2 `…152_gps_etapa_liberacao_aluno.sql` — a etapa que abre para UM aluno

```sql
-- Liberação de etapa por ALUNO. Hoje gps.etapas.liberada é GLOBAL (as 6 etapas para
-- os 125 ambientes; src/app/admin/etapas-actions.ts:9) e a equipe não tem como
-- destravar quem já está adiantado nem travar quem precisa refazer.
--
-- REGRA DE LEITURA: coalesce(override, global) — o override VENCE nos DOIS sentidos.
--   "global OR override" (a formulação do pedido) só permitiria LIBERAR: travar uma
--   etapa já liberada globalmente seria impossível, e travar é metade do pedido
--   ("trilha que não faz sentido").
--
-- O QUE NÃO FAZ: não altera gps.etapas nem definirEtapaLiberada (o interruptor global
--   continua sendo o padrão); não cria linha para os 125 ambientes (a ausência de linha
--   É o "segue o global"); não dá grant de escrita a authenticated.
--
-- REVERSÃO: drop table gps.etapa_liberacao_aluno cascade;
--           drop function gps.etapas_do_aluno(uuid),
--                gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text),
--                gps.admin_remover_liberacao_etapa(uuid, smallint);
--           e voltar getEtapasParaAluno → getEtapas no TS. O aluno volta ao global.

create table if not exists gps.etapa_liberacao_aluno (
  aluno_id      uuid     not null references public.thb_alunos(id) on delete cascade,
  etapa         smallint not null references gps.etapas(id) on delete cascade,
  liberada      boolean  not null,
  -- Motivo OBRIGATÓRIO: a linha muda o que UMA pessoa vê no produto. Override sem
  -- motivo vira mistério em 3 meses ("por que o fulano vê a etapa 4?").
  motivo        text     not null check (length(btrim(motivo)) between 3 and 300),
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz,
  primary key (aluno_id, etapa)
);

comment on table gps.etapa_liberacao_aluno is
  'Override de liberacao de etapa POR ALUNO. Ausencia de linha = segue gps.etapas.liberada. Presenca = manda (coalesce(override, global)), nos dois sentidos: libera quem esta adiantado e trava quem precisa refazer. Leitura unica por gps.etapas_do_aluno(); escrita SO por gps.admin_definir_liberacao_etapa (sem grant de insert/update/delete para authenticated).';

alter table gps.etapa_liberacao_aluno enable row level security;

do $$ begin
  create policy etapa_liberacao_admin_all on gps.etapa_liberacao_aluno
    for all to authenticated
    using (public.gp_is_admin()) with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- O aluno LÊ o próprio override (a UI precisa dizer "liberada para você pela equipe").
do $$ begin
  create policy etapa_liberacao_owner_select on gps.etapa_liberacao_aluno
    for select to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

-- Só SELECT. Grant largo sem policy foi o que deixou gps.acessos_log com
-- insert/update/delete concedidos e sem uso (baseline:602). Aqui nasce apertado.
grant select on gps.etapa_liberacao_aluno to authenticated;
grant all    on gps.etapa_liberacao_aluno to service_role;

drop trigger if exists trg_etapa_liberacao_touch on gps.etapa_liberacao_aluno;
create trigger trg_etapa_liberacao_touch
  before update on gps.etapa_liberacao_aluno
  for each row execute function gps.touch_atualizado_em();

-- ── a leitura única. SECURITY INVOKER: a RLS acima continua sendo a fonte de
--    verdade; a guarda existe para a falha ser barulhenta (42501) em vez de virar
--    "lista global" silenciosa quando alguém passar o aluno errado.
create or replace function gps.etapas_do_aluno(p_aluno_id uuid)
returns table (
  id smallint, nome text, descricao text, ordem smallint,
  liberada boolean,          -- efetiva (é esta que a UI usa)
  liberada_global boolean,   -- o que gps.etapas diz
  origem text,               -- 'global' | 'liberada_para_este_aluno' | 'travada_para_este_aluno'
  motivo text
)
language plpgsql stable security invoker set search_path = ''
as $function$
begin
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;
  if not (public.gp_is_admin() or p_aluno_id = gps.aluno_atual()) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  return query
  select e.id, e.nome, e.descricao, e.ordem,
         coalesce(o.liberada, e.liberada),
         e.liberada,
         case when o.liberada is null then 'global'
              when o.liberada        then 'liberada_para_este_aluno'
              else                        'travada_para_este_aluno' end,
         o.motivo
    from gps.etapas e
    left join gps.etapa_liberacao_aluno o
           on o.etapa = e.id and o.aluno_id = p_aluno_id
   order by e.ordem;
end $function$;

comment on function gps.etapas_do_aluno(uuid) is
  'As 6 etapas com a liberacao JA RESOLVIDA para este aluno: coalesce(override, global). Substitui getEtapas() em TODO caminho que renderiza para um aluno (home, /etapa/[n], materiais, proximoPasso, assistencia). Uma ida ao banco -- a mesma que getEtapas custava.';

-- ── a escrita
create or replace function gps.admin_definir_liberacao_etapa(
  p_aluno_id uuid, p_etapa smallint, p_liberada boolean, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_global boolean; v_nome text; v_antes boolean;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_liberada is null then
    raise exception 'Informe se a etapa fica liberada ou travada.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo — ele fica no histórico deste aluno.'
      using errcode = '22023';
  end if;

  select e.liberada, e.nome into v_global, v_nome from gps.etapas e where e.id = p_etapa;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from gps.membros m where m.aluno_id = p_aluno_id) then
    raise exception 'Este cadastro não tem ambiente no programa.' using errcode = 'P0002';
  end if;

  select o.liberada into v_antes from gps.etapa_liberacao_aluno o
   where o.aluno_id = p_aluno_id and o.etapa = p_etapa;

  insert into gps.etapa_liberacao_aluno (aluno_id, etapa, liberada, motivo, criado_por)
  values (p_aluno_id, p_etapa, p_liberada, btrim(p_motivo), auth.uid())
  on conflict (aluno_id, etapa) do update
    set liberada = excluded.liberada, motivo = excluded.motivo,
        criado_por = excluded.criado_por, atualizado_em = now();

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('etapa_liberacao_aluno', p_aluno_id,
          format('etapa %s (%s): %s para este aluno (global: %s). Motivo: %s',
                 p_etapa, v_nome,
                 case when p_liberada then 'LIBERADA' else 'TRAVADA' end,
                 case when v_global then 'liberada' else 'bloqueada' end,
                 btrim(p_motivo)),
          auth.uid());

  -- Toca a TRILHA (o que o aluno vê muda), então também vira evento do Diário.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values (p_aluno_id, now(), 'etapa_liberacao_mudou', 'etapa', null,
          left(format('Etapa %s — %s', p_etapa, v_nome), 300),
          jsonb_build_object('etapa', p_etapa, 'de', v_antes, 'para', p_liberada,
                             'global', v_global, 'motivo', btrim(p_motivo)),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('etapa', p_etapa, 'liberada', p_liberada,
                            'antes', v_antes, 'global', v_global);
end $function$;

create or replace function gps.admin_remover_liberacao_etapa(
  p_aluno_id uuid, p_etapa smallint)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_antes boolean; v_global boolean; v_nome text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select e.liberada, e.nome into v_global, v_nome from gps.etapas e where e.id = p_etapa;
  select o.liberada into v_antes from gps.etapa_liberacao_aluno o
   where o.aluno_id = p_aluno_id and o.etapa = p_etapa;
  if v_antes is null then
    raise exception 'Esta etapa já segue a regra geral para este aluno.'
      using errcode = '22023';
  end if;

  delete from gps.etapa_liberacao_aluno
   where aluno_id = p_aluno_id and etapa = p_etapa;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('etapa_liberacao_aluno', p_aluno_id,
          format('etapa %s (%s): override REMOVIDO (volta ao geral: %s)',
                 p_etapa, v_nome, case when v_global then 'liberada' else 'bloqueada' end),
          auth.uid());

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values (p_aluno_id, now(), 'etapa_liberacao_mudou', 'etapa', null,
          left(format('Etapa %s — %s', p_etapa, v_nome), 300),
          jsonb_build_object('etapa', p_etapa, 'de', v_antes, 'para', null,
                             'global', v_global, 'removido', true),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('etapa', p_etapa, 'antes', v_antes, 'global', v_global);
end $function$;

revoke execute on function gps.etapas_do_aluno(uuid)                                    from public, anon;
revoke execute on function gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text) from public, anon;
revoke execute on function gps.admin_remover_liberacao_etapa(uuid, smallint)            from public, anon;
grant  execute on function gps.etapas_do_aluno(uuid)                                    to authenticated;
grant  execute on function gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text) to authenticated;
grant  execute on function gps.admin_remover_liberacao_etapa(uuid, smallint)            to authenticated;
```

### B.3 `…153_gps_aluno_eventos_tipos_da_central.sql`

`gps.aluno_eventos` tem CHECK em `tipo` (16 valores) e em `entidade` (3 valores) —
`…20260909000001:38-56` e `:58`. As duas precisam crescer **antes** das RPCs acima rodarem.

```sql
-- Dois tipos novos e uma entidade nova no log do Diário (Fase 2).
--   etapa_liberacao_mudou  — a equipe abriu/fechou uma etapa PARA ESTE ALUNO
--   titular_trocado        — o dono do ambiente mudou (entidade 'conta')
-- UM tipo com {de,para} em vez de dois ('liberada'/'travada'): é o padrão já usado por
-- cliente_status_mudou / cliente_fase_mudou, e a UI já sabe ler "de → para".
-- O QUE NÃO FAZ: não toca linha existente, não muda RLS (a tabela continua append-only,
--   sem policy de insert — a escrita é só por função SECURITY DEFINER).
-- REVERSÃO: repor os dois CHECK com as listas antigas (só depois de apagar as linhas
--   com os tipos novos).

alter table gps.aluno_eventos drop constraint if exists aluno_eventos_tipo_check;
alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check
  check (tipo in (
    'cliente_cadastrado','cliente_favoritado','cliente_desfavoritado',
    'cliente_status_mudou','cliente_mensagem_padrao','cliente_estudo_caso',
    'cliente_ligacao','cliente_aderiu_reuniao','cliente_reuniao_agendada',
    'cliente_excluido','tarefa_concluida','tarefa_reaberta','conta_criada',
    'email_confirmado','primeiro_acesso','entrou_no_programa',
    'etapa_liberacao_mudou','titular_trocado'
  ));

alter table gps.aluno_eventos drop constraint if exists aluno_eventos_entidade_check;
alter table gps.aluno_eventos add constraint aluno_eventos_entidade_check
  check (entidade in ('cliente','tarefa','conta','etapa'));
```

> ⚠️ Os nomes das constraints acima vêm do CHECK inline do `create table` — o Postgres os
> gera como `aluno_eventos_tipo_check` / `aluno_eventos_entidade_check`. **O backend confere
> o nome real** (`select conname from pg_constraint where conrelid='gps.aluno_eventos'::regclass`)
> antes de aplicar; nome gerado já mordeu este repo (baseline:1035).

### B.4 `…154_gps_admin_trocar_titular.sql` — ⚠️ BLOQUEIO B-T1

```sql
-- Troca o titular do ambiente (promove um sócio, rebaixa o titular).
--
-- 🔴 SÓ APLICAR DEPOIS DA DECISÃO DO JOÃO (B-T1). O que está em jogo:
--   gps.membros.aluno_id É o thb_alunos.id do titular. Esta função troca o PAPEL e
--   NÃO troca o aluno_id do ambiente — ou seja, os clientes, o progresso, o Diário, a
--   pasta e o financeiro continuam no ambiente do titular ANTIGO. Sem a mudança da
--   guarda abaixo, o novo titular passaria a LER o contrato de pagamento do antigo
--   (gps.financeiro_pode_ler só pergunta papel='titular').
--
-- A ORDEM IMPORTA: membros_um_titular_por_ambiente (índice único parcial,
--   baseline:210) recusa dois titulares. Rebaixa primeiro, promove depois — os dois
--   updates na MESMA transação, então nunca existe ambiente sem titular visível.
--
-- O QUE NÃO FAZ: não move dado nenhum entre ambientes; não mexe em auth.users; não
--   apaga o membro antigo (ele vira sócio e mantém login, histórico e senha).
-- REVERSÃO: chamar a função de novo com o membro antigo — é simétrica. O log guarda
--   os dois e-mails.

create or replace function gps.admin_trocar_titular(
  p_ambiente_aluno_id uuid, p_novo_titular_membro_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare novo record; velho record; v_email_novo text; v_email_velho text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo da troca — ele fica no histórico.'
      using errcode = '22023';
  end if;

  select * into novo from gps.membros
   where id = p_novo_titular_membro_id and aluno_id = p_ambiente_aluno_id;
  if not found then
    raise exception 'Este membro não pertence a este ambiente.' using errcode = 'P0002';
  end if;
  if novo.papel = 'titular' then
    raise exception 'Este membro já é o titular.' using errcode = '22023';
  end if;
  if novo.user_id is null then
    raise exception 'O novo titular precisa ter login. Defina o acesso dele primeiro.'
      using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(novo.user_id) then
    raise exception 'Esta conta é da equipe — não pode ser titular de um ambiente.'
      using errcode = '42501';
  end if;

  select * into velho from gps.membros
   where aluno_id = p_ambiente_aluno_id and papel = 'titular';
  if not found then
    raise exception 'Este ambiente não tem titular.' using errcode = 'P0002';
  end if;

  update gps.membros set papel = 'socio'   where id = velho.id;
  update gps.membros set papel = 'titular' where id = novo.id;

  select email into v_email_novo  from auth.users where id = novo.user_id;
  if velho.user_id is not null then
    select email into v_email_velho from auth.users where id = velho.user_id;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('titular_trocado', p_ambiente_aluno_id, novo.user_id, v_email_novo,
          format('titular: %s → %s. Motivo: %s',
                 coalesce(v_email_velho,'(sem login)'), coalesce(v_email_novo,'?'),
                 btrim(p_motivo)),
          auth.uid());

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values (p_ambiente_aluno_id, now(), 'titular_trocado', 'conta', null,
          left(format('Titular do ambiente passou a ser %s',
                      coalesce(v_email_novo,'outro membro')), 300),
          jsonb_build_object('de', v_email_velho, 'para', v_email_novo,
                             'motivo', btrim(p_motivo)),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('titular_anterior', velho.id, 'titular_atual', novo.id,
                            'email_anterior', v_email_velho, 'email_atual', v_email_novo);
end $function$;

revoke execute on function gps.admin_trocar_titular(uuid, uuid, text) from public, anon;
grant  execute on function gps.admin_trocar_titular(uuid, uuid, text) to authenticated;

-- ── a guarda do Financeiro passa a olhar a PESSOA, não só o papel.
--    Enquanto pessoa_aluno_id do titular = aluno_id (o backfill garante), o
--    comportamento é BIT A BIT o de hoje para os 125 ambientes. Depois de uma troca de
--    titular, o novo titular NÃO lê o contrato do antigo. O coalesce mantém o
--    comportamento antigo para qualquer linha que ainda não tenha sido vinculada.
create or replace function gps.financeiro_pode_ler(p_aluno_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.gp_is_admin()
      or exists (select 1
                   from gps.membros m
                  where m.user_id  = auth.uid()
                    and m.aluno_id = p_aluno_id
                    and m.papel    = 'titular'
                    and coalesce(m.pessoa_aluno_id, m.aluno_id) = m.aluno_id);
$$;

comment on function gps.financeiro_pode_ler(uuid) is
  'Guarda unica do Financeiro (B7-b): admin OU o TITULAR do ambiente, na MESMA linha de gps.membros, E que seja a PESSOA dona do ambiente (coalesce(pessoa_aluno_id, aluno_id) = aluno_id). O socio nao le. Depois de uma troca de titular (gps.admin_trocar_titular), o novo titular tambem nao le -- o contrato e do antigo, e mostrar a divida de alguem nao se desfaz. Sem JWT, auth.uid() e null: falha FECHADO.';
```

### B.5 `…155_gps_admin_mover_membro.sql`

```sql
-- Move UM SÓCIO para outro ambiente. gps.membros.user_id é UNIQUE (baseline:180):
-- uma pessoa está em no máximo um ambiente, então "mover" é update de aluno_id — não
-- há caminho de "estar nos dois".
--
-- O QUE NÃO FAZ (e a tela precisa dizer): NÃO move dado nenhum. Cliente, progresso,
--   nota, evento e chamado são do AMBIENTE (aluno_id), não da pessoa. O que o sócio
--   fez continua no ambiente de origem — é o modelo, não um efeito colateral.
-- NÃO move titular: sem titular, gps.admin_adicionar_socio recusa novos sócios e o
--   Financeiro do ambiente fica sem dono. Titular sai por "Trocar titular" + mover.
-- REVERSÃO: chamar de novo com o ambiente de origem (o log guarda os dois).

create or replace function gps.admin_mover_membro(
  p_membro_id uuid, p_destino_aluno_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare m record; v_email text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo da mudança de ambiente.' using errcode = '22023';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then raise exception 'Membro não encontrado.' using errcode = 'P0002'; end if;
  if m.papel = 'titular' then
    raise exception 'O titular não pode ser movido — o ambiente é dele. Troque o titular primeiro.'
      using errcode = '42501';
  end if;
  if m.aluno_id = p_destino_aluno_id then
    raise exception 'Este membro já está neste ambiente.' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.membros t
                  where t.aluno_id = p_destino_aluno_id and t.papel = 'titular') then
    raise exception 'O ambiente de destino não tem titular.' using errcode = 'P0002';
  end if;
  if exists (select 1 from gps.membros x
              where x.aluno_id = p_destino_aluno_id and x.user_id = m.user_id) then
    raise exception 'Este login já participa do ambiente de destino.' using errcode = '23505';
  end if;

  update gps.membros set aluno_id = p_destino_aluno_id where id = p_membro_id;

  if m.user_id is not null then
    select email into v_email from auth.users where id = m.user_id;
  end if;

  -- DUAS linhas de log, uma em cada ambiente: quem auditar o ambiente de origem
  -- precisa ver a saída, e quem auditar o destino precisa ver a entrada. Uma linha
  -- só some de uma das duas telas.
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_movido', m.aluno_id, m.user_id, v_email,
          format('sócio SAIU deste ambiente para %s. Motivo: %s',
                 p_destino_aluno_id::text, btrim(p_motivo)), auth.uid()),
         ('membro_movido', p_destino_aluno_id, m.user_id, v_email,
          format('sócio ENTROU vindo de %s. Motivo: %s',
                 m.aluno_id::text, btrim(p_motivo)), auth.uid());

  return jsonb_build_object('membro_id', m.id, 'de', m.aluno_id,
                            'para', p_destino_aluno_id, 'email', v_email);
end $function$;

revoke execute on function gps.admin_mover_membro(uuid, uuid, text) from public, anon;
grant  execute on function gps.admin_mover_membro(uuid, uuid, text) to authenticated;
```

### B.6 `…156_gps_admin_zerar_etapa.sql` — reabre, não apaga

```sql
-- Zera o progresso de UMA etapa para UM aluno.
--
-- 🔴 POR QUE NÃO É `delete from gps.progresso`:
--   gps.aluno_eventos_capturar_progresso() (migração ...0002, linha 167) começa com
--     if tg_op = 'DELETE' then return old; end if;
--   ou seja: apagar as linhas apagaria o progresso SEM UMA LINHA na trilha do Diário.
--   O admin veria o número cair e ninguém saberia quem fez, quando, nem o que havia
--   antes. Reabrir (update concluida=false) passa pelo ramo UPDATE e gera um
--   `tarefa_reaberta` por tarefa, com ator='equipe' e auth.uid() — a trilha conta a
--   história inteira, e o caminho de volta é remarcar.
--
-- O QUE NÃO FAZ: não apaga linha, não mexe em gps.tarefa_enfase, não toca as tarefas
--   AUTOMÁTICAS da Etapa 01 (1.1/1.2 são calculadas dos clientes em
--   src/lib/etapa1.ts — não existe linha de progresso para elas, e a tela diz isso).
-- REVERSÃO: remarcar as tarefas na tela da etapa (o retorno traz a lista do que caiu).

create or replace function gps.admin_zerar_etapa(
  p_aluno_id uuid, p_etapa smallint, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_afetadas smallint[]; v_qtd int; v_nome text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escreva o motivo — a trilha do aluno vai registrar.'
      using errcode = '22023';
  end if;
  select e.nome into v_nome from gps.etapas e where e.id = p_etapa;
  if not found then raise exception 'Etapa não encontrada.' using errcode = 'P0002'; end if;

  with reabertas as (
    update gps.progresso
       set concluida = false, concluida_em = null
     where aluno_id = p_aluno_id and etapa = p_etapa and concluida
    returning tarefa)
  select array_agg(tarefa order by tarefa), count(*) into v_afetadas, v_qtd from reabertas;

  if coalesce(v_qtd, 0) = 0 then
    raise exception 'Não há tarefa concluída nesta etapa para reabrir.'
      using errcode = '22023';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('progresso_zerado', p_aluno_id,
          format('etapa %s (%s): %s tarefa(s) reaberta(s) %s. Motivo: %s',
                 p_etapa, v_nome, v_qtd, v_afetadas::text, btrim(p_motivo)),
          auth.uid());

  return jsonb_build_object('etapa', p_etapa, 'reabertas', v_qtd, 'tarefas', v_afetadas);
end $function$;

revoke execute on function gps.admin_zerar_etapa(uuid, smallint, text) from public, anon;
grant  execute on function gps.admin_zerar_etapa(uuid, smallint, text) to authenticated;
```

### B.7 `…157_gps_admin_atualizar_email_cadastro.sql`

```sql
-- Alinha o e-mail do CADASTRO (public.thb_alunos) ao e-mail do LOGIN.
--
-- POR QUÊ: gps.admin_status_acesso já devolve `email_bate` (migração ...118, linha 94)
-- e a tela já mostra o vermelho — sem botão. A action atualizarEmailAluno existe em
-- src/app/admin/actions.ts:395 e NÃO É CHAMADA POR NINGUÉM (rg → 0 chamadores): ela
-- escreve direto em thb_alunos pelo RLS do admin e NÃO DEIXA RASTRO. Esta função é a
-- mesma escrita, com log — o cadastro é base compartilhada com o sip.
--
-- 🔴 DIREÇÃO ÚNICA: cadastro ← login. NUNCA o contrário. Trocar o e-mail do login
--   (auth.users) derruba o acesso da pessoa nos 7 sistemas do grupo e mexe em
--   auth.identities — é outra operação, e está em BLOQUEIOS (B-E1).
--
-- O QUE NÃO FAZ: não toca auth.users, não cria cadastro, não mexe em outra coluna de
--   thb_alunos (nome/documento/telefone continuam do sip).
-- REVERSÃO: chamar de novo com o e-mail antigo — ele está no `detalhe` do log.

create or replace function gps.admin_atualizar_email_cadastro(
  p_aluno_id uuid, p_email text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_antes text; v_novo text := lower(btrim(coalesce(p_email, ''))); v_conflito uuid;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if v_novo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;

  select a.email into v_antes from public.thb_alunos a where a.id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;
  if lower(btrim(coalesce(v_antes, ''))) = v_novo then
    raise exception 'O cadastro já está com este e-mail.' using errcode = '22023';
  end if;

  select a.id into v_conflito from public.thb_alunos a
   where lower(btrim(a.email)) = v_novo and a.id <> p_aluno_id limit 1;
  if v_conflito is not null then
    -- thb_alunos tem índice único em lower(trim(email)). Sem esta checagem o admin
    -- receberia 23505 cru; com ela, recebe a frase que diz o que fazer.
    raise exception 'Já existe outro cadastro com este e-mail. Verifique se não é duplicata antes de trocar.'
      using errcode = '23505';
  end if;

  update public.thb_alunos set email = v_novo where id = p_aluno_id;

  insert into gps.acessos_log (acao, aluno_id, email_alvo, detalhe, feito_por)
  values ('email_cadastro_alterado', p_aluno_id, v_novo,
          format('e-mail do cadastro: %s → %s', coalesce(v_antes,'(vazio)'), v_novo),
          auth.uid());

  return jsonb_build_object('antes', v_antes, 'email', v_novo);
end $function$;

revoke execute on function gps.admin_atualizar_email_cadastro(uuid, text) from public, anon;
grant  execute on function gps.admin_atualizar_email_cadastro(uuid, text) to authenticated;
```

### B.8 `…158_gps_admin_financeiro_vinculo.sql` — 🔴 **NÃO APLICAR** sem B-F1 e M1/M2

```sql
-- ⚠️⚠️ ESTA MIGRAÇÃO ESCREVE NA TABELA DO SIP (cs.contatos_hm). NÃO APLICAR ANTES DE:
--   (1) o João autorizar (BLOQUEIO B-F1);
--   (2) M1 provar que cs.contatos_hm tem coluna de e-mail E/OU de documento — sem
--       nenhuma das duas, NÃO EXISTE casamento seguro e a peça é cancelada;
--   (3) M2 provar que não há trigger em cs.contatos_hm que faça mais do que tocar
--       timestamp. Trigger que apaga/reclassifica em cascata cancela a peça.
--   Os nomes de coluna abaixo (h.email, h.documento) são HIPÓTESE de M1 e devem ser
--   trocados pelos reais antes de aplicar. Se M1 devolver outro nome, o backend
--   ajusta AQUI e em mais lugar nenhum.
--
-- O QUE FAZ: preenche cs.contatos_hm.aluno_id de UM contrato ÓRFÃO escolhido
--   explicitamente pelo admin, quando e-mail OU documento coincidem com o cadastro do
--   ambiente. É a diferença entre "o financeiro do aluno não aparece" e "o dinheiro
--   dele aparece na tela dele".
--
-- AS QUATRO TRAVAS (todas no mesmo `update`, não só no `if`):
--   1. `where aluno_id is null` NO PRÓPRIO UPDATE — nunca ROUBA contrato de outro
--      aluno, nem em corrida (dois admins clicando junto). Zero linha afetada = erro.
--   2. o e-mail OU o documento normalizado tem de coincidir — o admin não pode
--      escolher um contrato qualquer da base do sip.
--   3. um id explícito, escolhido na tela. Nada de "vincular o mais provável".
--   4. só admin, e o contrato precisa estar na lista de candidatos daquele aluno.
--
-- O QUE NÃO FAZ: não cria contrato, não altera valor, parcela, produto, status,
--   cancelamento nem qualquer outra coluna de cs.*; não apaga nada; não toca as views
--   (cs.vw_hm_financeiro / cs.vw_hm_extrato leem por contato_hm_id).
-- REVERSÃO: gps.admin_desvincular_contrato_financeiro (abaixo), que só desfaz o que
--   ESTA função fez (exige a linha 'financeiro_vinculado' em gps.acessos_log).

create or replace function gps.admin_candidatos_financeiro(p_aluno_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare v_aluno record; v_out jsonb;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select id, nome, email, documento into v_aluno
    from public.thb_alunos where id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;

  -- Sem e-mail E sem documento não há casamento possível: devolve VAZIO em vez de
  -- listar contrato órfão qualquer. Listar tudo transformaria o diagnóstico num
  -- navegador da base financeira do sip.
  if coalesce(btrim(v_aluno.email),'') = ''
     and coalesce(regexp_replace(coalesce(v_aluno.documento,''), '\D', '', 'g'),'') = '' then
    return jsonb_build_object('candidatos', '[]'::jsonb, 'motivo',
      'O cadastro não tem e-mail nem CPF/CNPJ — não há como casar com um contrato.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'contato_hm_id', c.id::text, 'produto', c.produto, 'plano', c.plano,
           'turma', c.turma, 'email', c.email,
           'documento_final', right(regexp_replace(coalesce(c.documento,''), '\D','','g'), 4),
           'casou_por', c.casou_por, 'ja_vinculado', c.aluno_id is not null)
         order by c.casou_por, c.id::text), '[]'::jsonb)
    into v_out
    from (
      select h.*,
             case when lower(btrim(coalesce(h.email,''))) = lower(btrim(coalesce(v_aluno.email,'')))
                    and coalesce(btrim(v_aluno.email),'') <> '' then 'e-mail'
                  else 'documento' end as casou_por
        from cs.contatos_hm h
       where h.aluno_id is null
         and (
           (coalesce(btrim(v_aluno.email),'') <> ''
            and lower(btrim(coalesce(h.email,''))) = lower(btrim(v_aluno.email)))
           or
           (coalesce(regexp_replace(coalesce(v_aluno.documento,''), '\D','','g'),'') <> ''
            and lpad(regexp_replace(coalesce(h.documento,''), '\D','','g'), 14, '0')
              = lpad(regexp_replace(v_aluno.documento,       '\D','','g'), 14, '0'))
         )
       limit 5   -- teto: candidato é escolha, não listagem
    ) c;

  return jsonb_build_object('candidatos', v_out,
                            'ja_tem', (select count(*) from cs.contatos_hm h
                                        where h.aluno_id = p_aluno_id));
end $function$;

create or replace function gps.admin_vincular_contrato_financeiro(
  p_aluno_id uuid, p_contato_hm_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_ok boolean; v_linhas int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- O contrato precisa estar entre os CANDIDATOS deste aluno. Reusar a função é o
  -- que garante que a regra de casamento é a MESMA que o admin viu na tela.
  select exists (
    select 1 from jsonb_array_elements(
      (gps.admin_candidatos_financeiro(p_aluno_id))->'candidatos') x
     where x->>'contato_hm_id' = p_contato_hm_id) into v_ok;
  if not v_ok then
    raise exception 'Este contrato não é candidato deste aluno (e-mail e CPF/CNPJ não coincidem, ou ele já pertence a outro cadastro).'
      using errcode = '42501';
  end if;

  update cs.contatos_hm
     set aluno_id = p_aluno_id
   where id::text = p_contato_hm_id
     and aluno_id is null;          -- ← a trava que sobrevive a corrida
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'O contrato deixou de estar livre. Recarregue o diagnóstico.'
      using errcode = '40001';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('financeiro_vinculado', p_aluno_id,
          'contrato cs.contatos_hm ' || p_contato_hm_id, auth.uid());

  return jsonb_build_object('contato_hm_id', p_contato_hm_id, 'aluno_id', p_aluno_id);
end $function$;

create or replace function gps.admin_desvincular_contrato_financeiro(
  p_aluno_id uuid, p_contato_hm_id text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_linhas int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  -- 🔑 Só desfaz o que NÓS fizemos. Vínculo criado pelo sip não se desmancha por
  -- aqui: tirar o aluno_id de um contrato que o sip vinculou é apagar o trabalho de
  -- outro sistema, num banco que ele nem sabe que este schema existe.
  if not exists (select 1 from gps.acessos_log l
                  where l.acao = 'financeiro_vinculado'
                    and l.aluno_id = p_aluno_id
                    and l.detalhe = 'contrato cs.contatos_hm ' || p_contato_hm_id) then
    raise exception 'Este vínculo não foi feito pelo portal. Abra um chamado para a equipe do sistema de origem.'
      using errcode = '42501';
  end if;

  update cs.contatos_hm set aluno_id = null
   where id::text = p_contato_hm_id and aluno_id = p_aluno_id;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'O contrato não está vinculado a este aluno.' using errcode = 'P0002';
  end if;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('financeiro_desvinculado', p_aluno_id,
          'contrato cs.contatos_hm ' || p_contato_hm_id, auth.uid());

  return jsonb_build_object('contato_hm_id', p_contato_hm_id);
end $function$;

revoke execute on function gps.admin_candidatos_financeiro(uuid)               from public, anon;
revoke execute on function gps.admin_vincular_contrato_financeiro(uuid, text)  from public, anon;
revoke execute on function gps.admin_desvincular_contrato_financeiro(uuid,text) from public, anon;
grant  execute on function gps.admin_candidatos_financeiro(uuid)               to authenticated;
grant  execute on function gps.admin_vincular_contrato_financeiro(uuid, text)  to authenticated;
grant  execute on function gps.admin_desvincular_contrato_financeiro(uuid,text) to authenticated;
```

### B.9 `…159_gps_admin_diagnostico_ambiente.sql` — a leitura da Central

```sql
-- O diagnóstico do ambiente, num JSON só. É a razão de a Central existir: nenhuma
-- correção aparece na tela sem o dado que a justifica ao lado.
--
-- REUSA, NÃO COPIA: chama gps.admin_status_acesso (acesso/membros) e
-- gps.admin_direito_ao_acesso (pagamento). Copiar os predicados criaria duas
-- verdades sobre a mesma pergunta — foi o que gps.financeiro_pode_ler evitou.
-- NÃO chama gps.admin_painel_atendimento: aquela varre a base inteira para os cards
-- de /admin; aqui é UM aluno.
--
-- NÃO calcula "tarefa atual": o catálogo de tarefas vive em TypeScript
-- (src/lib/etapa1.ts … etapa6.ts) e `proximoPasso` (src/lib/etapas.ts:92) é a regra
-- única. Reimplementar em SQL seria a segunda fonte de verdade do checklist — a página
-- chama proximoPasso com o dado que já carrega.
--
-- SECURITY DEFINER: lê auth.users e cs.contatos_hm, onde `authenticated` não tem (e
-- não pode ganhar) grant. Guarda gp_is_admin() na PRIMEIRA linha; sem JWT, falha
-- fechado com 42501.
-- NÃO ESCREVE NADA e é `stable` — o próprio Postgres recusa escrita se alguém
-- acrescentar uma depois.
-- REVERSÃO: drop function gps.admin_diagnostico_ambiente(uuid);

create or replace function gps.admin_diagnostico_ambiente(p_aluno_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
set "TimeZone" = 'America/Sao_Paulo'
as $function$
declare
  v_aluno record; v_acesso jsonb; v_direito jsonb;
  v_membros_sem_cadastro int; v_contratos int; v_clientes int; v_com_dados int;
  v_favorito boolean; v_chamados int; v_pendencias int; v_pasta text;
  v_etapas jsonb; v_solic jsonb; v_progresso jsonb; v_titular int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  select id, nome, email, documento, telefone into v_aluno
    from public.thb_alunos where id = p_aluno_id;
  if not found then
    raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
  end if;

  v_acesso  := gps.admin_status_acesso(p_aluno_id);
  v_direito := gps.admin_direito_ao_acesso(p_aluno_id);

  select count(*) filter (where m.papel = 'titular'),
         count(*) filter (where m.pessoa_aluno_id is null)
    into v_titular, v_membros_sem_cadastro
    from gps.membros m where m.aluno_id = p_aluno_id;

  select count(*) into v_contratos from cs.contatos_hm h where h.aluno_id = p_aluno_id;

  select count(*),
         count(*) filter (where coalesce(btrim(c.nome),'') <> ''
                            and coalesce(btrim(c.telefone),'') <> ''
                            and c.nivel_relacionamento is not null),
         bool_or(c.acompanhado_equipe)
    into v_clientes, v_com_dados, v_favorito
    from gps.etapa1_clientes c where c.aluno_id = p_aluno_id;

  select count(*) into v_chamados
    from gps.chamados ch where ch.aluno_id = p_aluno_id and ch.status <> 'fechado';

  select count(*) into v_pendencias
    from gps.aluno_notas n
   where n.aluno_id = p_aluno_id and n.tipo = 'pendencia' and n.resolvido_em is null;

  select a.pasta_drive_url into v_pasta from gps.ambientes a where a.aluno_id = p_aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etapa', e.id, 'nome', e.nome, 'liberada', coalesce(o.liberada, e.liberada),
           'global', e.liberada,
           'origem', case when o.liberada is null then 'global'
                          when o.liberada then 'liberada_para_este_aluno'
                          else 'travada_para_este_aluno' end,
           'motivo', o.motivo) order by e.ordem), '[]'::jsonb)
    into v_etapas
    from gps.etapas e
    left join gps.etapa_liberacao_aluno o on o.etapa = e.id and o.aluno_id = p_aluno_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etapa', p.etapa, 'concluidas', p.n) order by p.etapa), '[]'::jsonb)
    into v_progresso
    from (select etapa, count(*) filter (where concluida) as n
            from gps.progresso where aluno_id = p_aluno_id group by etapa) p;

  -- A solicitação pendente NOMEADA (admin_status_acesso só devolve o booleano).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'email', s.email, 'telefone', s.telefone,
           'criado_em', s.criado_em)), '[]'::jsonb)
    into v_solic
    from gps.solicitacoes_acesso s
   where s.status = 'pendente'
     and (s.aluno_id = p_aluno_id
          or lower(btrim(coalesce(s.email,''))) = lower(btrim(coalesce(v_aluno.email,'')))
          or s.user_id in (select m.user_id from gps.membros m
                            where m.aluno_id = p_aluno_id and m.user_id is not null));

  return jsonb_build_object(
    'aluno_id', p_aluno_id,
    'nome', v_aluno.nome,
    'email_cadastro', v_aluno.email,
    'gerado_em', now(),
    'acesso', v_acesso,
    'direito', v_direito,
    'membros_sem_cadastro', v_membros_sem_cadastro,
    'tem_titular', v_titular > 0,
    'financeiro', jsonb_build_object('contratos', v_contratos),
    'clientes', jsonb_build_object('total', v_clientes, 'com_dados', v_com_dados,
                                   'favorito', coalesce(v_favorito, false)),
    'chamados_abertos', v_chamados,
    'pendencias_diario', v_pendencias,
    'pasta_drive', v_pasta,
    'etapas', v_etapas,
    'progresso', v_progresso,
    'solicitacoes_pendentes', v_solic
  );
end $function$;

comment on function gps.admin_diagnostico_ambiente(uuid) is
  'Diagnostico do ambiente do aluno para a Central de resolucao: acesso (reusa gps.admin_status_acesso), direito ao acesso (reusa gps.admin_direito_ao_acesso), membros sem cadastro vinculado, contratos em cs.contatos_hm, clientes, chamados abertos, pendencias do Diario, pasta, etapas com override e progresso por etapa. SO LEITURA (stable). SECURITY DEFINER porque le auth.users e cs.*; guarda gp_is_admin() na primeira linha, 42501 sem JWT. NAO calcula a tarefa atual: o catalogo de tarefas vive no TypeScript e proximoPasso() e a regra unica.';

revoke execute on function gps.admin_diagnostico_ambiente(uuid) from public, anon;
grant  execute on function gps.admin_diagnostico_ambiente(uuid) to authenticated;
```

> **Nomes de coluna a conferir antes de aplicar** (o backend valida contra o banco e
> ajusta **só** aqui): `gps.etapa1_clientes.nivel_relacionamento`,
> `gps.chamados.status`, `cs.contatos_hm.email/documento` (M1).

---

## C. Actions TypeScript — assinaturas exatas

Arquivo novo: **`src/app/admin/resolucao-actions.ts`** (`"use server"`).
Motivo de arquivo próprio: `senha-actions.ts` já tem 445 linhas e um assunto (senha/login);
`actions.ts` tem 669 e três. Coesão: aqui moram as correções **de vínculo e de trilha**.

Toda action segue o padrão vigente do repo: `ehAdmin()` como primeira porta (não é a
fronteira — quem decide é a RPC), `traduzirErroBanco(...)` no erro (**nunca `error.message`
cru**), `revalidatePath` explícito, retorno `{ erro?: string }` ou payload.

```ts
// ── diagnóstico ────────────────────────────────────────────────────────────
export interface DiagnosticoAmbiente {
  alunoId: string; nome: string | null; emailCadastro: string | null; geradoEm: string;
  acesso: StatusAcesso;                    // reusa o tipo de senha-actions.ts:41
  direito: { temDireito: boolean; motivo: string | null };
  membrosSemCadastro: number; temTitular: boolean;
  financeiro: { contratos: number };
  clientes: { total: number; comDados: number; favorito: boolean };
  chamadosAbertos: number; pendenciasDiario: number; pastaDrive: string | null;
  etapas: {
    etapa: number; nome: string; liberada: boolean; global: boolean;
    origem: "global" | "liberada_para_este_aluno" | "travada_para_este_aluno";
    motivo: string | null;
  }[];
  progresso: { etapa: number; concluidas: number }[];
  solicitacoesPendentes: { id: string; nome: string | null; email: string | null;
                           telefone: string | null; criadoEm: string }[];
}
export async function diagnosticarAmbiente(
  alunoId: string,
): Promise<{ erro?: string; diagnostico?: DiagnosticoAmbiente }>;

// ── vínculo de pessoa ──────────────────────────────────────────────────────
export async function vincularMembroCadastro(
  membroId: string, pessoaAlunoId: string,
): Promise<{ erro?: string; nome?: string | null; email?: string | null }>;
export async function desvincularMembroCadastro(
  membroId: string,
): Promise<{ erro?: string }>;

// ── papéis e ambiente ──────────────────────────────────────────────────────
export async function trocarTitular(
  ambienteAlunoId: string, novoTitularMembroId: string, motivo: string,
): Promise<{ erro?: string; emailAnterior?: string | null; emailAtual?: string | null }>;
export async function moverMembro(
  membroId: string, destinoAlunoId: string, motivo: string,
): Promise<{ erro?: string; email?: string | null }>;

// ── e-mail do cadastro ─────────────────────────────────────────────────────
export async function alinharEmailCadastro(
  alunoId: string, email: string,
): Promise<{ erro?: string; antes?: string | null; email?: string }>;

// ── trilha ─────────────────────────────────────────────────────────────────
export async function definirLiberacaoEtapa(
  alunoId: string, etapa: number, liberada: boolean, motivo: string,
): Promise<{ erro?: string; antes?: boolean | null; global?: boolean }>;
export async function removerLiberacaoEtapa(
  alunoId: string, etapa: number,
): Promise<{ erro?: string; global?: boolean }>;
export async function zerarEtapa(
  alunoId: string, etapa: number, motivo: string,
): Promise<{ erro?: string; reabertas?: number; tarefas?: number[] }>;

// ── financeiro (só entra com B-F1 aprovado) ────────────────────────────────
export interface CandidatoFinanceiro {
  contatoHmId: string; produto: string | null; plano: string | null;
  turma: string | null; email: string | null; documentoFinal: string | null;
  casouPor: "e-mail" | "documento"; jaVinculado: boolean;
}
export async function candidatosFinanceiro(
  alunoId: string,
): Promise<{ erro?: string; candidatos?: CandidatoFinanceiro[]; motivo?: string | null }>;
export async function vincularContratoFinanceiro(
  alunoId: string, contatoHmId: string,
): Promise<{ erro?: string }>;
export async function desvincularContratoFinanceiro(
  alunoId: string, contatoHmId: string,
): Promise<{ erro?: string }>;
```

**Como cada uma confirma / loga / revalida**

| Action | Confirmação (UI) | Log | Nota automática | `revalidatePath` |
|---|---|---|---|---|
| `diagnosticarAmbiente` | — (leitura) | — | — | — |
| `vincularMembroCadastro` | `DialogoConfirmacao` com **nome e e-mail do cadastro escolhido** | `acessos_log` | não (é conserto de cadastro, não fato do programa) | `/admin/aluno/[id]` layout |
| `trocarTitular` | `DialogoConfirmacao` + campo **Motivo** obrigatório; consequência escrita: "o titular atual vira sócio, mantém login e histórico; **o novo titular NÃO passa a ver o Financeiro** — o contrato é de quem assinou" | `acessos_log` + `aluno_eventos` | **sim** — `registrarNota({voz:'equipe',tipo:'combinado',origem:'plataforma'})` | `/admin/aluno/[id]` layout, `/admin` layout |
| `moverMembro` | `DialogoConfirmacao` + Motivo; consequência: "o que ele registrou **fica** no ambiente atual" | `acessos_log` ×2 | **sim** nos DOIS ambientes | os dois `/admin/aluno/[id]` + `/admin` |
| `alinharEmailCadastro` | `DialogoConfirmacao` mostrando **de → para** | `acessos_log` | não | `/admin/aluno/[id]`, `/admin` |
| `definirLiberacaoEtapa` | `DialogoConfirmacao` + Motivo; consequência: "só este aluno; a regra geral continua **{liberada/bloqueada}**" | `acessos_log` + `aluno_eventos` | **sim** | `/` layout (o aluno vê), `/admin/aluno/[id]` layout |
| `removerLiberacaoEtapa` | idem, consequência: "volta a seguir a regra geral" | `acessos_log` + `aluno_eventos` | não | idem |
| `zerarEtapa` | `DialogoConfirmacao` **destrutivo** + Motivo; consequência: "**N tarefas** voltam a ficar pendentes para o aluno; nada é apagado e a trilha registra cada uma" | `acessos_log` + N × `tarefa_reaberta` (trigger) | **sim** | `/` layout, `/etapa` layout, `/admin/aluno/[id]` layout |
| `vincularContratoFinanceiro` | `DialogoConfirmacao` com produto + **como casou** (e-mail ou documento) | `acessos_log` | **sim** | `/financeiro`, `/admin/aluno/[id]` layout |
| `desvincularContratoFinanceiro` | `DialogoConfirmacao` destrutivo | `acessos_log` | **sim** | idem |

> A nota automática usa `registrarNota` (`src/app/admin/diario-actions.ts:48`) **do servidor**,
> com `voz:'equipe'`, `origem:'plataforma'` e texto do tipo *"A equipe liberou a Etapa 03 só para
> este aluno. Motivo: <motivo>."* — `autor_id` sai de `ctx.user.id`, nunca do cliente
> (`diario-actions.ts:12-14`). **Falha da nota não desfaz a correção**: mesma regra do e-mail em
> `definirSenhaAluno` — a nota é registro, não a operação. Loga com `logErro` e segue.

**Mudanças em arquivo existente**

| Arquivo | Mudança | Por quê |
|---|---|---|
| `src/lib/data/progresso.ts:23` | **nova** `getEtapasParaAluno(alunoId)` via `gps.etapas_do_aluno` (mesmo `Etapa[]` + `origem`/`motivo`); `getEtapas()` **fica** só para `/admin` (interruptor global) | uma ida ao banco, a mesma de hoje |
| `src/app/page.tsx:103`, `src/app/etapa/[etapa]/page.tsx:27`, `src/app/materiais/page.tsx:20`, `src/app/admin/aluno/[alunoId]/page.tsx:49`, `.../etapa/[etapa]/page.tsx:38`, `.../materiais/page.tsx:32` | trocam `getEtapas()` por `getEtapasParaAluno(alunoId)` | senão o override não vale em metade das telas — e uma etapa liberada na home que redireciona em `/etapa/[n]` é pior que não ter a feature |
| `src/lib/auth.ts:82-106` | `select("aluno_id, papel, pessoa_aluno_id")`; nome por `eq("id", pessoa_aluno_id)`; o `ilike` fica só como fallback de `pessoa_aluno_id === null` | −1 consulta fuzzy por requisição de sócio, e passa a acertar quando o e-mail difere |
| `src/lib/auth.ts` (`ContextoSessao`) | novo `financeiroLiberado: boolean` = `papelMembro==='titular' && coalesce(pessoa,aluno)===aluno` | espelha `gps.financeiro_pode_ler`; `navDoAluno` (`nav.ts:71`) passa a usar isto no lugar de `papelMembro==='titular'` — **uma regra, dois lados** |
| `src/lib/nav.ts:102` | `assistenciaNavItems` ganha `{ href: base+'/resolver', label:'Resolver', icon:'resolver', adminOnly:true }` | `adminOnly` = some na prévia "como o aluno vê" |
| `src/components/nav-tabs.tsx:24-48` | chave de ícone `"resolver": Stethoscope` | não existe chave que sirva; `suporte` colidiria com a aba Suporte |
| `src/lib/log-agregacao.ts` | rótulo pt-BR para `etapa_liberacao_mudou` e `titular_trocado` | tipo sem rótulo vira linha crua na trilha |
| `src/app/admin/actions.ts:395-408` | `atualizarEmailAluno` passa a chamar `gps.admin_atualizar_email_cadastro` (mantém o nome exportado) | ganha log; para de escrever direto |
| `src/app/admin/actions.ts:659-669` | **apagar** `removerAlunoGps` | 0 chamadores, duplica `excluirAcessoAluno` |

---

## D. UI

**Rota:** `src/app/admin/aluno/[alunoId]/resolver/page.tsx` (Server Component) +
`loading.tsx` (esqueleto com a altura real do checklist, **nunca spinner**) +
`error.tsx` sobre `ErroPainel`. `PageHeader` + `<main id="conteudo">` (obrigatórios).
Aba **"Resolver"** com `adminOnly: true`.

**Layout — checklist → ação, nesta ordem** (a ordem é a do socorro: sem login nada mais
importa):

```
┌ Resolver · <Nome do aluno> ────────────────── [Reconferir] ┐
│ 3 problemas · 2 avisos · 9 conferências ok  ·  às 14h32     │
├────────────────────────────────────────────────────────────┤
│ ACESSO                                                      │
│  ✓ Ambiente criado — titular desde 12/07/2026               │
│  ✗ Sem login — ninguém consegue entrar neste ambiente       │
│      Já existe um login com joao@x.com (Workbook CNHF).     │
│      [Adotar esse login]  [Criar login novo]                │
│  ✓ E-mail confirmado                                        │
│  ! E-mail do cadastro (joao@x.com) ≠ do login (joao@y.com)  │
│      A pessoa entra com joao@y.com. [Alinhar o cadastro]    │
│  ! Solicitação pendente de João Silva, 07/09  [Ver fila]    │
│                                                             │
│ PESSOAS DO AMBIENTE (2)                                     │
│  ✓ joao@y.com · titular · João Silva                        │
│  ✗ maria@z.com · sócia · sem cadastro vinculado             │
│      [Vincular a um cadastro]  [Cadastrar esta pessoa]      │
│      [Definir senha]  [Mover de ambiente]  [Remover]        │
│      [Tornar titular]                                       │
│                                                             │
│ FINANCEIRO                                                  │
│  ✗ Nenhum contrato ligado a este cadastro                   │
│      2 contratos livres batem com o CPF: …                  │
│      [Vincular cadastro financeiro]                         │
│                                                             │
│ TRILHA                                                      │
│  ✓ 30 clientes · 24 com dados · cliente da equipe escolhido │
│  ! Etapa 03 liberada só para este aluno (14/09 — "adiantou")│
│      [Voltar à regra geral]                                 │
│  ✓ Próximo passo: Etapa 01 · passo 4 [Abrir a etapa]        │
│      Etapa 01: 6 concluídas [Reabrir a etapa]               │
│                                                             │
│ ATENDIMENTO                                                 │
│  ! 1 chamado aberto [Abrir]   ! 2 pendências no Diário [Ver]│
└────────────────────────────────────────────────────────────┘
```

**Regras de tela (não negociáveis)**

- **Três estados, nunca dois:** `ok` (✓, neutro), `atencao` (!, âmbar — é informação, não
  falha), `falha` (✗, `text-destructive`). Estado dito **por forma e por texto**, nunca só
  por cor (regra de contraste da rodada final: `text-primary` é decorativo).
- **Cada linha carrega o DADO.** "Sem login" sozinho é acusação; "Sem login — ninguém
  consegue entrar neste ambiente" + o e-mail é diagnóstico.
- **Botão só onde há vermelho ou âmbar.** Linha verde não ganha ação — senão a Central vira
  painel de "tudo pode".
- **Nada de checkbox de tarefa aqui.** "Abrir a etapa" leva ao `TarefaItem` que já existe.
  Duas portas para a mesma escrita é como as duas telas de status do CNHF divergiram.
- **Confirmação nomeada** (`src/components/ui/dialogo-confirmacao.tsx`) em **toda** ação, com
  `consequencia` escrita e botão com nome próprio ("Tornar titular", "Reabrir a etapa").
  Onde a RPC exige motivo, o `children` do diálogo é o campo **"Motivo (fica no histórico
  do aluno)"** — como o "Motivo (o aluno vê)" da recusa de solicitação.
- **Estado vazio:** ambiente 100% verde → `EmptyState` "Nada a resolver por aqui" + a lista
  das conferências em modo compacto (o admin precisa ver **o que foi conferido**, senão a
  tela verde não vale nada).
- **Erro:** falha do `diagnosticarAmbiente` → `ErroPainel` com o texto de
  `traduzirErroBanco` e botão "Tentar de novo". **Nunca** meia tela: diagnóstico parcial
  faria o admin concluir "está tudo bem" sobre o que não carregou.
- **`Reconferir`** re-chama a action (não `router.refresh()` cego) e re-renderiza o
  checklist; toda ação bem-sucedida reconfere sozinha, como `carregarStatus()` já faz em
  `gerenciar-acesso/painel.tsx:184`.

**Textos (pt-BR, dizem o que aconteceu e o que fazer)**

| Situação | Texto |
|---|---|
| sem login | "Sem login: ninguém consegue entrar neste ambiente. Crie o acesso ou aproveite um login que já exista com este e-mail." |
| login em outros portais | "Este e-mail já é usado em: Workbook CNHF. Aproveitar o login **troca a senha nesses portais** e derruba as sessões. Avise a pessoa." |
| sócio sem cadastro | "Esta pessoa tem login, mas não sabemos quem ela é no cadastro do Time Holding Brasil. Sem isso, o nome e o telefone dela não aparecem nas mensagens da equipe." |
| financeiro sem contrato | "Nenhum contrato de pagamento está ligado a este cadastro. O aluno vê 'Financeiro não disponível'. Isto é lacuna de cadastro no sistema de origem, não dívida." |
| candidato financeiro | "Contrato {produto} · casou pelo {e-mail/CPF} · ainda sem aluno. Vincular faz o pagamento dele aparecer na aba Financeiro." |
| trocar titular | "{sócio} passa a ser o titular e {titular} passa a sócio, mantendo login e histórico. **O Financeiro continua sendo o do contrato assinado — o novo titular não passa a ver.** Para desfazer, troque de volta." |
| zerar etapa | "{N} tarefas da Etapa {n} voltam a ficar pendentes para o aluno. Nada é apagado: cada uma fica registrada como reaberta no Diário, e dá para marcar de novo." |
| liberar etapa | "A Etapa {n} abre **só para este aluno**. Os outros continuam com a regra geral ({liberada/bloqueada})." |
| tudo ok | "Nada a resolver por aqui. As 12 conferências passaram." |

---

## E. Contrato back↔front e ordem de execução

**Contrato (o backend publica no fim deste arquivo: "CONTRATO CENTRAL PUBLICADO"):**
`DiagnosticoAmbiente` (§C) é o único tipo que atravessa; a página **não** chama RPC direto.
`StatusAcesso`/`MembroAcesso` continuam vindo de `src/app/admin/senha-actions.ts:31-55` —
**não duplicar**. `MembroAcesso` ganha `pessoaAlunoId: string | null` e `pessoaNome: string |
null` (vindos de `admin_status_acesso`, que passa a incluí-los — **1 linha no `jsonb_build_object`
de `…118:75-83`**, migração de retrato à parte, mesma família).

**Ordem (o que roda em paralelo)**

```
ONDA 0 (orquestrador, sozinho)  M1..M9 no banco → preenche "MEDIDO" → decide B-F1/B-T1 com o João
        ↓ gate: sem M1/M2, B.8 não entra; sem M5=0, membros_pessoa_uk não entra
ONDA 1 (backend, sequencial)    B.0 → B.3 → B.1 → B.2  (constraints antes das RPCs que gravam)
        ‖ (frontend, em paralelo, contra o contrato de §C, com dado de fixture)
                                rota /resolver + checklist + diálogos, sem chamar as actions ainda
        ↓
ONDA 2 (backend)                B.5, B.6, B.7 + resolucao-actions.ts + getEtapasParaAluno
        ‖ (frontend)            troca de getEtapas nas 6 páginas + auth.ts/nav.ts + log-agregacao
        ↓
ONDA 3 (só com decisão do João) B.4 (trocar titular + guarda do Financeiro) e/ou B.8 (financeiro)
        ↓
ONDA 4 (security-pentester)     OBRIGATÓRIO — §F
        ↓
ONDA 5 (fable-orchestrator)     build + roteiro logado + 5 critérios
```

**Roteiro de validação logado** (o Fable exige; "build verde não prova que a tela abre"):
1. `/admin/aluno/<id>/resolver` abre e o resumo bate com o que a aba "Gerenciar acesso" diz.
2. Ambiente sem contrato (um dos 31) mostra o vermelho do Financeiro **e** o candidato certo.
3. Liberar a Etapa 03 para UM aluno → entrar **como aquele aluno**: a etapa abre na home **e**
   em `/etapa/3` **e** o material dela ganha link. Entrar com **outro** aluno: continua fechada.
4. Travar uma etapa liberada globalmente para um aluno → ele perde o acesso; o `proximoPasso`
   dele não aponta mais para lá.
5. "Reabrir a etapa" → conferir no Diário que apareceram N linhas `tarefa_reaberta` com
   ator "equipe" — e que **nenhuma linha sumiu** de `gps.progresso`.
6. Vincular sócio a cadastro → o nome dele passa a aparecer no header **dele** (`/perfil`) e
   no "Definir senha" do painel.
7. Sem JWT: `curl` nas RPCs novas → **42501 em todas**.

---

## F. Vetores para o `security-pentester` — **obrigatório** (auth.users + tabela do sip)

1. **`gps.admin_diagnostico_ambiente` é `SECURITY DEFINER` sobre `auth.users` + `cs.contatos_hm`.**
   Sem JWT? Com JWT de **aluno**? Com JWT de **sócio**? Com `p_aluno_id` de outro ambiente?
   Esperado: 42501 em todos, sem vazar existência do ambiente.
2. **Enumeração pelo diagnóstico.** A função aceita qualquer uuid. Um admin é legítimo — mas
   confirme que a mensagem para "cadastro inexistente" e "ambiente alheio" não permite mapear a
   base por diferença de erro.
3. **`gps.admin_candidatos_financeiro` lista dado do sip.** Prove que **não existe entrada** que
   devolva contrato sem casamento de e-mail/documento (aluno sem os dois → lista vazia, não
   lista cheia). Prove que o teto de 5 não é contornável. Prove que `documento_final` (4 dígitos)
   é o máximo de documento que sai.
4. **`gps.admin_vincular_contrato_financeiro` ESCREVE em `cs.contatos_hm`.** Tente: contrato de
   outro aluno; contrato já vinculado; corrida (dois vínculos simultâneos — a trava é
   `and aluno_id is null` **no update**, não o `if`); id como texto com espaço/`'` (é `text`,
   comparado por `id::text` — confira se não abre injeção via `id::text` em nenhum caminho);
   `p_contato_hm_id` que casa por prefixo.
5. **Escalada por `admin_trocar_titular`.** Promover uma conta de **equipe** a titular (deve
   recusar por `admin_alvo_e_equipe`); promover membro de outro ambiente; deixar o ambiente sem
   titular (dois updates fora de ordem); dois admins trocando ao mesmo tempo (o índice único
   parcial é a rede — confirme que a falha é 23505 e não estado partido).
6. **A guarda nova do Financeiro.** `gps.financeiro_pode_ler` mudou. Reexecute o teste do B7-b:
   sócio 42501, titular lê, **novo titular após troca 42501**, sem JWT 42501. Confirme que
   nenhum dos 125 ambientes atuais perdeu leitura (o `coalesce` é o que garante).
7. **`admin_mover_membro`.** Mover para ambiente sem titular; mover titular; mover para o mesmo
   ambiente; mover conta de equipe; mover e depois aprovar solicitação (o `onConflict user_id`
   de `aprovarSolicitacao`, `actions.ts:331`, ainda protege?).
8. **`gps.etapa_liberacao_aluno`.** Aluno consegue INSERT/UPDATE pela REST? (não há grant — prove).
   Aluno lê override de **outro** aluno? `gps.etapas_do_aluno` com id alheio?
9. **`gps.admin_atualizar_email_cadastro` escreve em `public.thb_alunos`** (base do sip).
   Injeção de cabeçalho no e-mail; e-mail com `%`/`_`; colisão com o índice único; e o efeito
   colateral: **mudar o e-mail do cadastro muda o casamento do gatilho de signup** — confira se
   dá para "roubar" um cadastro alheio trocando o e-mail dele para o de um login existente.
10. **Nota automática.** `registrarNota` é chamada do servidor com texto montado — confirme que
    o `motivo` do admin não entra em nenhum caminho de HTML/e-mail sem escape, e que o teto de
    300 do motivo e 8000 da nota são impostos **no servidor**.
11. **Log.** Nenhuma das RPCs novas grava senha, token ou documento completo em
    `gps.acessos_log.detalhe`. Confirme linha a linha.

---

## G. O que NÃO fazer, e os BLOQUEIOS

### G.0 Fora do escopo — permanente

- ❌ **Não editar `public.thb_alunos` além do e-mail.** Nome, documento, telefone, plano, turma
  e financeiro pertencem ao centro de controle do sip. O cadastro manual existente
  (`cadastrarAluno`) já é a exceção decidida.
- ❌ **Não tocar em `public.perfis`.** É a tabela da EQUIPE. Nenhuma correção da Central cria,
  ativa ou promove perfil. `gps.admin_alvo_e_equipe` continua sendo a trava.
- ❌ **Não apagar histórico.** Nem `gps.progresso` (vira reabertura), nem `gps.etapa1_clientes`,
  nem `aluno_notas`/`aluno_eventos` (append-only por trigger), nem linha de `acessos_log`.
- ❌ **Não usar `service_role`** em lugar nenhum.
- ❌ **Não escrever direto em tabela sensível pelo cliente.** `gps.membros` tem grant **por
  coluna** (baseline:246): `.from("membros").update()` de admin **falha com 42501** mesmo com a
  policy permitindo. Toda escrita nova passa por RPC.
- ❌ **Não recriar o agendamento** nem ler `gps.reuniao_*` / `gps.agenda`.
- ❌ **Não virar painel de "tudo pode".** Sem "editar cliente do aluno por aqui", sem "apagar
  chamado", sem "editar nota do Diário" (é append-only por decisão de LGPD).
- ❌ **Não duplicar o checkbox de tarefa** nem o interruptor global de etapa.

### G.1 🔴 BLOQUEIO **B-F1** — escrever em `cs.contatos_hm` é aceitável?

**O fato:** 31 dos 125 ambientes não têm contrato ligado. O aluno vê "Financeiro não
disponível"; o admin vê o diagnóstico e **não tem o que fazer** — hoje isso só se resolve com
SQL manual no banco do sip.

**Opção A (mínima, desenhada em B.8).** RPC `SECURITY DEFINER` no schema `gps` que preenche
**só** `aluno_id`, **só** em contrato órfão, **só** quando e-mail ou documento coincidem, **só**
num id escolhido na tela, com log e caminho de volta.
*Risco honesto:* `authenticated` não tem grant em `cs.*` — **a RLS do `cs` fica por baixo do
DEFINER, então a guarda desta função é a única barreira**. É a mesma exposição que
`gps.financeiro_do_aluno` já aceita para **ler**; a diferença é que agora **escreve**. Se houver
trigger em `cs.contatos_hm` (M2), ele roda com os privilégios do dono da função.

**Opção B (conservadora).** A Central **só diagnostica**: mostra os candidatos, e o botão vira
*"Registrar pendência para o sistema de origem"* — cria uma nota tipo `pendencia` no Diário do
aluno com o id do contrato. Zero escrita em `cs`. Custo: a lacuna continua dependendo de alguém
fora do portal, que é exatamente o que o João pediu para acabar.

**Recomendação do arquiteto:** **A**, condicionada a M1 e M2. É a única peça do plano que sai do
schema `gps`, e a versão desenhada é a mais estreita possível. Se M1 mostrar que não há e-mail
nem documento em `cs.contatos_hm`, **A morre por falta de casamento** e B é o que sobra.

### G.2 🔴 BLOQUEIO **B-T1** — "trocar o titular" tem duas leituras

- **Leitura A — trocar o PAPEL** (desenhada em B.4). Dois updates em `gps.membros`. Barato,
  reversível. **Consequência:** o ambiente continua sendo o `thb_alunos.id` do titular antigo;
  clientes, progresso, Diário, pasta e **contrato** continuam lá. Sem a mudança de
  `financeiro_pode_ler` que vai junto, **o novo titular passa a ver a dívida do antigo** — dado
  financeiro de terceiro, e "ter mostrado a dívida de alguém não se desfaz" (B7-b).
- **Leitura B — trocar o DONO do ambiente.** Reescrever `aluno_id` em `gps.membros`,
  `gps.ambientes`, `gps.etapa1_clientes`, `gps.progresso`, `gps.tarefa_enfase`,
  `gps.aluno_notas`, `gps.aluno_eventos`, `gps.chamados`, `gps.etapa_liberacao_aluno`,
  `gps.solicitacoes_acesso` — **e o Financeiro não acompanha** (`cs.contatos_hm.aluno_id` aponta
  para o antigo). É migração de dados com backfill, não botão. **Fora desta rodada.**

**Decisão que o João precisa dar:** A (com o Financeiro fechado para o novo titular) ou nada.
Não implemento B por conta própria.

### G.3 🔴 BLOQUEIO **B-E1** — trocar o e-mail do LOGIN

O plano alinha **cadastro ← login**. O caminho inverso (mudar `auth.users.email`) exige mexer em
`auth.identities.identity_data`, limpar `email_change*` e **derrubar o acesso da pessoa nos 7
sistemas do grupo**. Existe demanda real ("sócio com e-mail digitado diferente"), mas o remédio
hoje é: adotar/criar o login com o e-mail certo, ou a pessoa trocar pelo `/perfil`.
**Só entra com autorização explícita.**

### G.4 ⚠️ Conflitos menores (resolvidos no plano, registrados aqui)

1. **"global OR override"** não permite **travar**. Adotado `coalesce(override, global)` — o
   override manda nos dois sentidos. Se o João quiser só-liberar, é uma linha.
2. **"zerar a etapa = apagar `gps.progresso`"** apagaria sem trilha (`…002:167`). Adotado
   reabrir por `update`. O efeito visível para o aluno é o mesmo; o histórico sobrevive.
3. **`membros_pessoa_uk`** (uma pessoa, um membro) só entra se M5 der 0. Se der linha, é gente
   real em dois ambientes → vira BLOQUEIO novo.
4. **Ícone da aba:** não há chave que sirva; adiciono `"resolver"`. Se o Fable preferir zero
   chave nova, a aba fica sem ícone (`icon` é opcional).

---

## H. Os 5 critérios do Fable

| Critério | O que este plano garante |
|---|---|
| **Segurança** | Nenhuma escrita nova pelo cliente: 11 RPCs `SECURITY DEFINER` com `gp_is_admin()` na primeira linha, `search_path=''`, `revoke` antes do `grant`, zero `service_role`. A **única** ampliação de superfície é `cs.contatos_hm.aluno_id` — travada por 4 condições e **sob BLOQUEIO B-F1**. E o plano **fecha** um vazamento que hoje existiria na primeira troca de titular: `financeiro_pode_ler` passa a exigir a pessoa dona do contrato. Pentest obrigatório com 11 vetores nomeados. |
| **Escalabilidade** | O diagnóstico é ~10 consultas por aluno, todas em índice existente (`membros_aluno_id_idx`, `progresso_aluno_idx`, `etapa1_clientes_aluno_idx`, `idx_chamados_aluno`, `idx_aluno_notas_pendencia`), disparadas **uma vez por abertura de tela de um aluno** — não cresce com a base. `gps.etapa_liberacao_aluno` é PK `(aluno_id, etapa)`, ≤ 6 linhas por aluno, lida por `left join` de 6 linhas. **Índice novo: 1** (`membros_pessoa_aluno_idx`, parcial). A 10× (1.250 ambientes) nada muda: nenhuma consulta varre a base. |
| **Solidificação** | O banco passa a garantir sozinho o que hoje é convenção: `membros_pessoa_uk` (uma pessoa, um membro), FK `pessoa_aluno_id → thb_alunos`, `motivo` obrigatório com CHECK 3..300 em toda liberação individual, `acessos_log_acao_check` ampliado (ação sem valor previsto **falha alto** em vez de virar log mudo), a trava `and aluno_id is null` **dentro do update** do financeiro (sobrevive a corrida, o `if` não), e a guarda do Financeiro amarrada à pessoa em vez do papel. |
| **UX** | O admin passa a ver **por que** o aluno está travado antes de qualquer botão; cada ação tem confirmação nomeada com a consequência escrita e campo de motivo que vira **nota no Diário** — quem abrir o histórico daqui a 3 meses entende. Estados vazio/erro desenhados (verde total mostra o que foi conferido; erro nunca vira meia tela). O **aluno** vê a etapa abrir com a explicação da equipe, e nunca vê a aba (`adminOnly`). |
| **Otimização** | Saldo de código **negativo** fora da feature: `removerAlunoGps` apagada (−11), `atualizarEmailAluno` sai de código morto para caminho auditado, o `ilike` por sócio de `auth.ts:95-106` vira `eq` por PK (−1 consulta fuzzy **por requisição** de todo sócio), `definirSenhaMembro` passa a achar nome/telefone pelo vínculo em vez do casamento por e-mail. A `getEtapasParaAluno` **substitui** `getEtapas()` nas telas de aluno — mesma ida ao banco. O diagnóstico **reusa** `admin_status_acesso` e `admin_direito_ao_acesso` em vez de copiar predicado, e **substitui** a garimpagem manual em 3 telas. Nenhuma dependência nova. |

---

## I. Tarefas

### backend-engineer
- [ ] migration `…150_gps_acessos_log_acoes_da_central` — amplia `acao`; **não** toca RLS/grants/linhas. Rodar M6 antes.
- [ ] migration `…151_gps_membros_pessoa_aluno_id` — coluna + índice + backfill (titular por identidade, sócio só com 1 casamento) + `admin_vincular_membro_cadastro` / `admin_desvincular_membro_cadastro`. **`membros_pessoa_uk` só se M5 = 0.**
- [ ] migration `…152_gps_etapa_liberacao_aluno` — tabela + RLS (`select` apenas) + `etapas_do_aluno` + `admin_definir_liberacao_etapa` + `admin_remover_liberacao_etapa`.
- [ ] migration `…153_gps_aluno_eventos_tipos_da_central` — 2 tipos + entidade `etapa`; **conferir o nome real das constraints** antes.
- [ ] migration `…155_gps_admin_mover_membro` · `…156_gps_admin_zerar_etapa` (update, **nunca delete**) · `…157_gps_admin_atualizar_email_cadastro`.
- [ ] migration `…159_gps_admin_diagnostico_ambiente` — conferir nomes de coluna contra o banco antes de aplicar.
- [ ] migration de retrato: `admin_status_acesso` passa a devolver `pessoa_aluno_id`/`pessoa_nome` por membro (1 linha no `jsonb_build_object`).
- [ ] `src/app/admin/resolucao-actions.ts` — as 11 actions de §C, com `ehAdmin()`, `traduzirErroBanco`, `revalidatePath` da tabela de §C e a nota automática por `registrarNota` (falha da nota **não** desfaz a correção).
- [ ] `src/lib/data/progresso.ts` — `getEtapasParaAluno`; **não** apagar `getEtapas` (o interruptor global usa).
- [ ] `src/lib/auth.ts` — `pessoa_aluno_id` no select, nome por PK, `financeiroLiberado` no `ContextoSessao`.
- [ ] `src/app/admin/actions.ts` — `atualizarEmailAluno` passa pela RPC; **apagar `removerAlunoGps`**.
- [ ] ⛔ `…154` (trocar titular + guarda do Financeiro) e `…158` (financeiro) **só depois de B-T1 / B-F1**.
- [ ] Bloco de conferência para o orquestrador: 42501 sem JWT nas 11 RPCs; override valendo nas 6 páginas; `zerarEtapa` gerando N eventos e 0 linhas apagadas; os 125 ambientes sem perda de leitura do Financeiro.

### frontend-engineer
- [ ] `src/app/admin/aluno/[alunoId]/resolver/{page,loading,error}.tsx` — Server Component, `PageHeader`, `<main id="conteudo">`, esqueleto com altura real, `ErroPainel`.
- [ ] `src/components/admin/resolucao/` (pasta com `index.tsx` ≤ 400 linhas) — checklist com 3 estados por forma+texto, ação só no vermelho/âmbar, `EmptyState` no verde total, "Reconferir".
- [ ] Diálogos sobre `DialogoConfirmacao` com `consequencia` escrita + campo **Motivo** (`children`) nas ações que exigem; textos de §D.
- [ ] `src/lib/nav.ts` + `nav-tabs.tsx` — aba "Resolver" `adminOnly` + chave de ícone; `navDoAluno` passa a usar `ctx.financeiroLiberado`.
- [ ] Trocar `getEtapas()` por `getEtapasParaAluno(alunoId)` nas **6** páginas de §C e mostrar, na etapa com override, quem liberou e por quê (para o aluno: "liberada pela equipe"; para o admin: motivo + data).
- [ ] `src/lib/log-agregacao.ts` — rótulos de `etapa_liberacao_mudou` e `titular_trocado`.
- [ ] Conferir no navegador (Chromium, logado): diagnóstico, um vermelho de cada família, celular retrato com as 8 abas, foco voltando ao botão depois de cada diálogo.

### security-pentester — **obrigatório**
- [ ] Auditar as 11 RPCs novas (`SECURITY DEFINER` sobre `auth.users`) e a **escrita em
      `cs.contatos_hm`**, pelos 11 vetores de §F. Reexecutar o teste de B7-b sobre a
      `financeiro_pode_ler` alterada. Aprovar explicitamente ("nenhum finding crítico/alto
      pendente") antes de o Fable fechar.

### fable-orchestrator
- [ ] Rodar M1–M9 **antes** da Onda 1 e preencher "MEDIDO". Levar B-F1, B-T1 e B-E1 ao João.
- [ ] Aplicar as migrations pelo MCP; julgar os 5 critérios de §H; roteiro logado de §E.

---

_Plano do arquiteto · 09/09/2026 · nenhuma linha de `src/` escrita aqui._

---

## DECISÕES DO ORQUESTRADOR (09/09) — o João autorizou seguir sem ele
- **B-F1 (vincular cadastro financeiro): OPÇÃO A, mínima.** M1 passou: `cs.contatos_hm.comprador_id → public.compradores(id)` e `public.compradores` tem `email` e `documento`. Medido: 193 órfãos (`aluno_id is null`) no total; **18** casam por e-mail com alunos do GPS (os mesmos 18 por documento); **10 ambientes sem financeiro têm candidato**. M2: `cs.contatos_hm` tem 10 triggers (`trg_hm_a_dono_por_aba`, `trg_hm_b_congela_comercial`, `trg_hm_c_trava_coluna_hotmart`, `trg_hm_cancelamento_avisa`, `trg_hm_carimba_equipe_padrao`, `trg_hm_revisar_nome_invalido`, `trg_hm_revogacao`, `trg_hm_revogacao_espelho`, `trg_hm_sincroniza_cards_irmaos`, `trg_hm_sync_responsavel`) — a RPC só faz `update cs.contatos_hm set aluno_id = p_aluno where id = p_contato and aluno_id is null`; o orquestrador vai provar em rollback o que as triggers fazem nesse UPDATE antes de liberar. Guarda: candidato = comprador cujo e-mail (lower/trim) OU documento normalizado (lpad 14) bate com o `thb_alunos` do ambiente; id escolhido explicitamente; log em `gps.acessos_log` (nova ação `financeiro_vinculado` / `financeiro_desvinculado`) com `detalhe` = contato_hm_id; reversão = RPC `desvincular` que só age se `aluno_id = p_aluno` e grava log.
- **B-T1 (trocar titular): OPÇÃO A** (troca de papel dentro do ambiente), com a consequência escrita na confirmação: "O novo titular passa a ver o Financeiro do ambiente e o antigo deixa de ver; a Etapa 01, os clientes e o Diário continuam os mesmos." Feita numa RPC única (rebaixa e promove na mesma transação, respeitando `membros_um_titular_por_ambiente`), log `titular_trocado`.
- **B-E1:** fora — trocar e-mail do LOGIN não entra. Só "alinhar e-mail do cadastro ao do login" (`atualizarEmailAluno` já existe, expor na Central).
- **M5 (`membros_pessoa_uk`):** criar a coluna `gps.membros.pessoa_aluno_id` (backfill: titular = `aluno_id`; sócio = `thb_alunos` casado pelo e-mail do login, quando único; senão NULL) e o índice único **parcial** só depois de medir duplicidade; se houver pessoa em dois ambientes, registrar e NÃO criar o índice (decisão do João).
- **Trilha:** "zerar etapa" = `update gps.progresso set concluida=false` (nunca DELETE) para a trilha registrar; `gps.etapa_liberacao_aluno` com `coalesce(override, global)` (permite travar e liberar); `etapaLiberadaPara(alunoId)` consumida por `EtapasOverview`, `/etapa/[n]`, `proximoPasso`, materiais e `progressoGeral` (média das liberadas para ESTE aluno).

---

# CONTRATO CENTRAL PUBLICADO — backend-engineer, 09/09/2026

> Escopo entregue: as 8 peças da seção "Sua tarefa" do orquestrador. **Não** entram
> `financeiro_pode_ler` alterada, `admin_status_acesso` com `pessoa_*`, `admin_adicionar_socio`,
> `auth.ts`, `removerAlunoGps`, `nav.ts` e a página `/resolver` — ver "Desvios e o que ficou de fora".
> `npx tsc --noEmit`, `npm run lint` e `npm run build`: **os três verdes** (build com 35 rotas).
> Nada commitado, nada empurrado.

## A. Migrations, na ordem de aplicação

| # | Arquivo | O que entra |
|---|---|---|
| 1 | `20260909000150_gps_acessos_log_acoes_da_central.sql` | `acessos_log_acao_check` + 7 ações |
| 2 | `20260909000151_gps_aluno_eventos_tipos_da_central.sql` | 2 tipos + entidade `etapa` |
| 3 | `20260909000152_gps_etapa_liberacao_aluno.sql` | tabela + RLS + `etapa_liberada_para` + `admin_definir_liberacao_etapa` |
| 4 | `20260909000153_gps_admin_reabrir_etapa.sql` | `admin_reabrir_etapa` |
| 5 | `20260909000154_gps_membros_pessoa_aluno_id.sql` | coluna + índice parcial + backfill + `admin_vincular_pessoa_membro` |
| 6 | `20260909000155_gps_admin_trocar_titular.sql` | `admin_trocar_titular` |
| 7 | `20260909000156_gps_admin_mover_membro.sql` | `admin_mover_membro` |
| 8 | `20260909000157_gps_admin_financeiro_vinculo.sql` | `financeiro_candidatos_do_aluno` (interna) + `admin_financeiro_candidatos/vincular/desvincular` |
| 9 | `20260909000158_gps_admin_diagnostico_ambiente.sql` | `admin_diagnostico_ambiente` |

**A ordem é dura de 1 a 3 e de 8 para 9.** As duas primeiras ampliam CHECK que as RPCs seguintes
gravam no ÚLTIMO passo — fora de ordem, cada função morre com 23514 depois de já ter feito o
trabalho, a transação volta e, de fora, "o botão não faz nada" (o modo de falha que deixou
`admin_adotar_login_existente` quebrada por 15 dias). A ...158 chama a ...157 e a ...152.

**Duas migrations abortam de propósito em vez de criar peça quebrada:**

- ...150 / ...151 acham a constraint **pelo conteúdo**, nunca pelo nome (`if exists` com nome
  errado é NO-OP silencioso). Sem achar, `raise exception` e a migração inteira volta.
- ...157 tem um **gate de coluna**: confere `cs.contatos_hm.{id,aluno_id,comprador_id,produto,
  plano,turma,valor_total,criado_em}` e `public.compradores.{id,email,documento}`. Faltando
  alguma, aborta dizendo **qual** — o agente não tem banco, e função com coluna errada só falharia
  na primeira chamada, na tela do admin. Se um nome divergir, o conserto é **nesta migration e em
  mais lugar nenhum** (a regra de casamento vive numa função só).

## B. Bloco de conferência (rodar no MCP, projeto `mbvybujpkwuorhtdzcde`)

Identidades usadas abaixo: admin `81d2eaee-…`; ambiente `191699db-…`; sócio membro
`c50988da-d4ba-401a-9ed5-dcb786d6a487`. **O membro titular do ambiente não foi informado** —
preencher `:MEMBRO_TITULAR` com o resultado de B0.

### B0 · antes de aplicar (gates)

```sql
-- M6: o CHECK novo revalida a tabela inteira. Abaixo de ~10 mil linhas, instantâneo.
select count(*) as linhas, min(criado_em), max(criado_em) from gps.acessos_log;
select acao, count(*) from gps.acessos_log group by acao order by 2 desc;

-- Os membros do ambiente de teste (pega o :MEMBRO_TITULAR aqui).
select m.id as membro_id, m.papel, m.user_id, u.email
  from gps.membros m left join auth.users u on u.id = m.user_id
 where m.aluno_id = '191699db-...'::uuid
 order by (m.papel = 'titular') desc;

-- M5 · GATE do índice único de pessoa_aluno_id (NÃO criado nesta rodada).
-- Esperado: 0 linhas. Se vier alguma, é pessoa REAL em dois ambientes: a
-- decisão é do João e o índice continua fora. Rodar DEPOIS da ...154 também.
select pessoa_aluno_id, count(*), array_agg(aluno_id)
  from gps.membros where pessoa_aluno_id is not null
 group by pessoa_aluno_id having count(*) > 1;
```

### B1 · depois de aplicar — as constraints cresceram

```sql
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid in ('gps.acessos_log'::regclass, 'gps.aluno_eventos'::regclass)
   and contype = 'c';
-- esperado: acao com 12 valores; tipo com 20; entidade com 4 (inclui 'etapa').
```

### B2 · backfill de `pessoa_aluno_id` (o número tem de fechar)

```sql
select m.papel,
       count(*)                                              as membros,
       count(*) filter (where m.pessoa_aluno_id is not null) as vinculados,
       count(*) filter (where m.pessoa_aluno_id is null)     as sem_pessoa
  from gps.membros m group by m.papel;
-- titular: sem_pessoa = 0 (identidade, não inferência).
-- socio:   sem_pessoa = os que o e-mail do login não casou. É o resultado
--          CORRETO, e é o que aparece em vermelho no diagnóstico.

-- nenhum titular apontando para cadastro que não é o dono do ambiente:
select count(*) from gps.membros
 where papel = 'titular' and pessoa_aluno_id is distinct from aluno_id;  -- 0
```

### B3 · 42501 sem JWT nas 8 RPCs expostas, e a interna fora do PostgREST

```sql
-- Sem claims: auth.uid() é null, gp_is_admin() é false. Todas têm de falhar.
begin;
set local role authenticated;
select gps.admin_definir_liberacao_etapa('191699db-...'::uuid, 1::smallint, true, 'teste');
rollback;   -- esperado: 42501 "Sem permissão."
-- repetir para: admin_reabrir_etapa, admin_vincular_pessoa_membro,
-- admin_trocar_titular, admin_mover_membro, admin_financeiro_candidatos,
-- admin_financeiro_vincular, admin_financeiro_desvincular,
-- admin_diagnostico_ambiente  -> 42501 em TODAS.
-- e gps.etapa_liberada_para(...) -> 42501 (não é admin nem o próprio aluno).

-- A função interna NÃO pode estar no PostgREST:
select p.proname, array_to_string(p.proacl, ',') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'gps' and p.proname like '%financeiro%';
-- financeiro_candidatos_do_aluno: SEM 'authenticated=X'. As demais: com.
-- Nenhuma delas com execute para PUBLIC ou anon.
```

### B4 · liberação por aluno vale nos dois sentidos (JWT do sócio)

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"81d2eaee-...","role":"authenticated"}';  -- ADMIN

-- 1) libera a etapa 3 (global = bloqueada) só para este ambiente
select gps.admin_definir_liberacao_etapa('191699db-...'::uuid, 3::smallint, true,
       'aluno adiantado - conferência 09/09');

-- 2) trava a etapa 1 (global = liberada) só para este ambiente
select gps.admin_definir_liberacao_etapa('191699db-...'::uuid, 1::smallint, false,
       'precisa refazer a base de clientes - conferência');

-- 3) a leitura, pelo JWT do SÓCIO do ambiente
set local request.jwt.claims = '{"sub":"<user_id do socio c50988da-...>","role":"authenticated"}';
select e.id, e.liberada as global,
       gps.etapa_liberada_para('191699db-...'::uuid, e.id) as efetiva
  from gps.etapas e order by e.ordem;
-- esperado: etapa 1 efetiva = false (global true) e etapa 3 efetiva = true (global false).

-- 4) OUTRO aluno não é afetado nem consegue perguntar por este ambiente
select gps.etapa_liberada_para('<outro aluno_id>'::uuid, 3::smallint);  -- 42501

-- 5) o aluno NÃO escreve na tabela pela REST (não há grant)
insert into gps.etapa_liberacao_aluno (aluno_id, etapa, liberada, motivo)
values ('191699db-...'::uuid, 2::smallint, true, 'tentativa');  -- 42501
rollback;
```

### B5 · reabrir etapa: N eventos, ZERO linha apagada

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"81d2eaee-...","role":"authenticated"}';

select count(*) as progresso_antes from gps.progresso  where aluno_id = '191699db-...'::uuid;
select count(*) as eventos_antes   from gps.aluno_eventos where aluno_id = '191699db-...'::uuid;

select gps.admin_reabrir_etapa('191699db-...'::uuid, 1::smallint,
       'conferência da rodada - reabrir para remarcar');

select count(*) as progresso_depois from gps.progresso where aluno_id = '191699db-...'::uuid;
-- TEM de ser igual ao "antes". Reabrir não apaga.

select tipo, ator, count(*) from gps.aluno_eventos
 where aluno_id = '191699db-...'::uuid and ocorrido_em > now() - interval '1 minute'
 group by tipo, ator;
-- esperado: tarefa_reaberta / equipe / N, com N igual ao `reabertas` do retorno.
-- É isto que prova que gp_is_admin() continua valendo dentro do SECURITY DEFINER
-- (a trigger deriva o ator dele) e que não é preciso parâmetro `ator`.
rollback;
```

### B6 · trocar titular e mover membro

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"81d2eaee-...","role":"authenticated"}';

-- promove o sócio, rebaixa o titular. Nunca dois titulares, nunca zero.
select gps.admin_trocar_titular('191699db-...'::uuid,
       'c50988da-d4ba-401a-9ed5-dcb786d6a487'::uuid);
select papel, count(*) from gps.membros where aluno_id = '191699db-...'::uuid group by papel;
-- esperado: titular = 1, socio = 1.

-- A CONSEQUÊNCIA (B-T1 opção A, decidida): quem lê o Financeiro agora?
set local request.jwt.claims = '{"sub":"<user_id do socio promovido>","role":"authenticated"}';
select count(*) from gps.financeiro_do_aluno('191699db-...'::uuid);
-- LÊ. É o comportamento decidido, e é o que a confirmação da tela promete.
set local request.jwt.claims = '{"sub":"<user_id do titular rebaixado>","role":"authenticated"}';
select * from gps.financeiro_do_aluno('191699db-...'::uuid);  -- 42501

-- guardas que têm de recusar
set local request.jwt.claims = '{"sub":"81d2eaee-...","role":"authenticated"}';
select gps.admin_trocar_titular('191699db-...'::uuid, '<membro de OUTRO ambiente>'::uuid); -- P0002
select gps.admin_mover_membro('<:MEMBRO_TITULAR>'::uuid, '<outro ambiente>'::uuid);        -- 42501
select gps.admin_mover_membro('c50988da-...'::uuid, '<ambiente SEM titular>'::uuid);       -- P0002
rollback;

-- Nenhum dos 125 ambientes perdeu leitura do Financeiro (a guarda não mudou):
select count(*) from gps.membros m
 where m.papel = 'titular'
   and exists (select 1 from cs.contatos_hm h where h.aluno_id = m.aluno_id);
-- comparar com o número de antes da rodada: tem de ser IGUAL.
```

### B7 · FINANCEIRO — o que as 10 triggers de `cs.contatos_hm` fazem nesse UPDATE

**Gate do orquestrador: rodar isto ANTES de liberar a ...157 para uso.** O `update` da RPC toca
UMA coluna (`aluno_id`), mas as triggers rodam com os privilégios do dono da função. O teste conta
linhas alteradas em **outras** tabelas.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"81d2eaee-...","role":"authenticated"}';

-- 1) um candidato real (um dos 10 ambientes sem financeiro que têm candidato)
select * from gps.admin_financeiro_candidatos('<aluno_id sem contrato>'::uuid);

-- 2) RETRATO ANTES. Genérico e sem depender de adivinhar o nome das tabelas das
--    triggers: xmin muda em TODA linha atualizada.
create temp table _xmin_antes as
select id::text as pk, xmin::text as v from cs.contatos_hm;

-- 3) o vínculo
select gps.admin_financeiro_vincular('<aluno_id sem contrato>'::uuid, '<contato_hm_id>');

-- 4) QUANTAS linhas de cs.contatos_hm mudaram? Esperado: EXATAMENTE 1.
select count(*) from cs.contatos_hm c
  join _xmin_antes a on a.pk = c.id::text
 where c.xmin::text <> a.v;

-- 5) e nas OUTRAS tabelas (o que as triggers escreveram nesta transação):
select schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del
  from pg_stat_xact_user_tables
 where n_tup_ins + n_tup_upd + n_tup_del > 0
 order by schemaname, relname;
-- ACEITÁVEL: cs.contatos_hm 1 upd + gps.acessos_log 1 ins, e nada mais.
-- PARA A PEÇA: qualquer n_tup_del > 0, ou insert/update em tabela de card, de
-- espelho ou de responsável. A decisão volta ao João (opção B-F1b, só diagnóstico).

-- 6) o desfazer, e a recusa de desvincular contrato alheio
select gps.admin_financeiro_desvincular('<aluno_id sem contrato>'::uuid, '<contato_hm_id>');
select gps.admin_financeiro_desvincular('<OUTRO aluno_id>'::uuid, '<contato_hm_id>'); -- P0002
rollback;

select count(*) filter (where aluno_id is null) as orfaos_depois from cs.contatos_hm;
-- tem de voltar aos 193 medidos.
```

E as travas de escolha:

```sql
-- aluno sem e-mail e sem documento -> lista VAZIA (nunca a base do sip)
select gps.admin_financeiro_candidatos('<aluno sem email e sem documento>'::uuid);
-- contrato que não casa -> 42501 mesmo com id válido
select gps.admin_financeiro_vincular('191699db-...'::uuid, '<id de contrato de terceiro>');
-- id com espaço, aspas ou prefixo -> 42501 (comparação é por parâmetro, nunca concatenação)
select gps.admin_financeiro_vincular('191699db-...'::uuid, '4'' or 1=1 --');
-- corrida: em duas sessões, o segundo vínculo do MESMO contrato -> 40001
```

### B8 · diagnóstico

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"81d2eaee-...","role":"authenticated"}';
select jsonb_pretty(gps.admin_diagnostico_ambiente('191699db-...'::uuid));
rollback;
-- conferir: `verificacoes` com 20 entradas; `acesso` bate com
-- gps.admin_status_acesso do mesmo aluno (é ele mesmo, não uma cópia);
-- `membros[].pessoa_nome` preenchido para quem foi backfillado;
-- ok = null exatamente em: ultimo_acesso, financeiro_candidatos, tarefa_atual, etapas
-- (e em senha/email_confirmado/email_bate quando não há login).

-- Com JWT de ALUNO e de SÓCIO: 42501. Sem JWT: 42501.
-- Com uuid inexistente (admin): P0002 "Cadastro não encontrado." A mesma
-- mensagem vale para ambiente alheio, então não dá para mapear a base por
-- diferença de erro (o admin vê a base inteira de qualquer forma).

-- Nada foi escrito pelo diagnóstico:
select count(*) from gps.acessos_log where criado_em > now() - interval '2 minutes';
```

### B9 · o log não vaza

```sql
select acao, detalhe from gps.acessos_log
 where acao in ('etapa_liberacao_alterada','progresso_reaberto','membro_pessoa_vinculada',
                'titular_trocado','membro_movido','financeiro_vinculado','financeiro_desvinculado')
 order by criado_em desc limit 50;
-- conferir linha a linha: nenhuma senha, nenhum token, nenhum documento completo.
-- `financeiro_*` grava SÓ o contato_hm_id (é o que a desvinculação procura).
```

## C. Contrato para o frontend (Onda B)

### C.1 Leitura — `src/lib/data/central.ts` (reexportado por `@/lib/data`)

```ts
getDiagnosticoAmbiente(alunoId: string): Promise<{ erro?: string; diagnostico?: DiagnosticoAmbiente }>
getEtapasLiberadasPara(alunoId: string): Promise<OverridesLiberacao>
mapearStatusAcesso(bruto: unknown): StatusAcesso            // o mapeador único da RPC de acesso

interface VerificacaoDiagnostico { chave: string; ok: boolean | null; valor: string | null; detalhe: string | null }

interface DiagnosticoAmbiente {
  alunoId; nome; emailCadastro; geradoEm;
  acesso: StatusAcesso;                        // MESMO tipo de senha-actions.ts, não duplicar
  direito: { temDireito: boolean; motivo: string | null };
  verificacoes: VerificacaoDiagnostico[];      // o checklist da tela, já na ordem
  membros: MembroDiagnostico[];                // + pessoaAlunoId/pessoaNome/pessoaEmail/emailBate
  etapas: EtapaDiagnostico[];                  // liberada (efetiva) | global | origem | motivo | em
  progresso: { etapa: number; concluidas: number }[];
  candidatosFinanceiro: CandidatoFinanceiro[]; // já vem no diagnóstico: ZERO consulta extra
  solicitacoesPendentes: SolicitacaoPendenteDiagnostico[];
}
```

**As 20 chaves de `verificacoes`, na ordem em que o banco devolve** — é a ordem da tela:
`login · senha · email_confirmado · email_bate · vinculo_programa · titular · membros_com_pessoa ·
membros_com_login · ultimo_acesso · solicitacao_pendente · direito_ao_acesso ·
financeiro_contrato · financeiro_candidatos · clientes · cliente_favorito · tarefa_atual · etapas ·
chamados_abertos · pendencias_diario · pasta_drive`.

🔑 **`ok` é do servidor.** `true` verde, `false` vermelho/âmbar, **`null` = informação, sem juízo**
(nem verde nem vermelho). A tela **não** deduz cor a partir do texto de `valor`/`detalhe`.
`ok: null` sai em `ultimo_acesso`, `financeiro_candidatos`, `tarefa_atual`, `etapas` — e em
`senha`/`email_confirmado`/`email_bate` quando não há login ("não dá para saber" não é "não bate").

🔴 **`tarefa_atual` vem com `ok: null` e só o número de tarefas concluídas.** O catálogo de tarefas
vive no TypeScript e `proximoPasso()` é a regra única, inclusive as travas `exigeFavorito` e
`exigeTarefa`. A página monta a frase chamando `proximoPasso` com o dado que já carrega — o banco
não sabe quantas tarefas uma etapa tem, e inventar isso em SQL seria a segunda fonte de verdade do
checklist.

### C.2 Liberação de etapa nas 6 páginas do aluno — `src/lib/etapas.ts`

```ts
interface OverrideLiberacao { liberada: boolean; motivo?: string }
type OverridesLiberacao = Record<number, OverrideLiberacao>

etapaLiberadaPara(etapa: Pick<Etapa,"id"|"liberada">, overrides): boolean
etapasComLiberacaoDoAluno(etapas: Etapa[], overrides): Etapa[]   // array novo, ordem preservada
```

Troca de uma linha por página (home, `/etapa/[n]`, materiais, `proximoPasso`, progresso geral e os
espelhos de admin):

```ts
const etapas = etapasComLiberacaoDoAluno(
  await getEtapas(),
  await getEtapasLiberadasPara(alunoId),
);
```

Nada abaixo disso precisa saber que existe override — `proximoPasso`, `EtapasOverview` e
`listarMateriais({ etapasLiberadas })` continuam recebendo `Etapa[]` com `liberada` já resolvida.
Para a UI dizer **quem liberou e por quê**, use `diagnostico.etapas[].origem/motivo/em` (admin) ou
`overrides[n].motivo` (aluno: "liberada pela equipe — <motivo>").

`getEtapas()` **continua existindo e não deve ser apagada**: é o que o interruptor global usa.

### C.3 Escrita — `src/app/admin/central-actions.ts` (`"use server"`)

```ts
definirLiberacaoEtapa(alunoId, etapa: number, liberada: boolean | null, motivo: string)
  -> { erro? } | { liberada: boolean; removido: boolean }     // liberada = null REMOVE o override
reabrirEtapa(alunoId, etapa: number, motivo: string)          -> { erro? } | { reabertas: number }
vincularPessoaMembro(membroId, pessoaAlunoId: string | null, alunoId?)
  -> { erro? } | { nome; email }                              // null desvincula (só sócio)
trocarTitular(alunoId, novoTitularMembroId)
  -> { erro? } | { emailAnterior; emailAtual; financeiroPassaAVer: boolean }
moverMembro(membroId, novoAlunoId, alunoIdOrigem?)            -> { erro? } | { de; para }
vincularFinanceiro(alunoId, contatoHmId)                      -> { erro? }
desvincularFinanceiro(alunoId, contatoHmId)
  -> { erro? } | { vinculadoPeloPortal: boolean }
```

- **`atualizarEmailAluno` NÃO é reexportada.** Importe direto de `@/app/admin/actions` — reexporte
  em módulo `"use server"` sai do build com zero exports (o caso está registrado em
  `admin/plantao/actions.ts`). É a mesma função de sempre, agora com uma tela que a chama.
- **Motivo obrigatório (3..300)** em `definirLiberacaoEtapa` e `reabrirEtapa`, imposto no servidor
  E no banco. O campo entra como `children` do `DialogoConfirmacao`.
- **Todas devolvem `{ erro }` em português** (`traduzirErroBanco`; as frases novas das RPCs já
  estão em `FRASES_DO_BANCO`). Nunca `throw`, nunca `error.message` cru.
- **`revalidatePath`** já é feito pelas actions: `/admin/aluno/<id>` (layout), `/admin` (layout) e
  `/` (layout, que cobre as 6 telas do aluno). `moverMembro` revalida os DOIS ambientes.

### C.4 Textos que a tela é obrigada a escrever antes de confirmar

- **Trocar titular** — "O novo titular passa a ver o Financeiro do ambiente e o antigo deixa de
  ver; a Etapa 01, os clientes e o Diário continuam os mesmos." (`financeiroPassaAVer` vem no
  retorno para a copy não divergir da regra.)
- **Mover sócio** — "O que ele registrou (clientes, progresso, notas e chamados) é do ambiente e
  **fica** no ambiente de origem."
- **Reabrir etapa** — "As N tarefas voltam a ficar pendentes e a trilha registra cada uma. Nada é
  apagado; para desfazer, remarque na tela da etapa."
- **Desvincular financeiro com `vinculadoPeloPortal = false`** — "Este vínculo **não** foi feito
  por aqui: veio do sistema de origem. Desfazer apaga o trabalho dele."
- **Travar etapa** — "O aluno perde o acesso a esta etapa mesmo que ela esteja liberada para todo
  mundo."

### C.5 Catálogos já atualizados (não repetir)

`TIPOS_EVENTO` e `EntidadeEvento` (`src/lib/types.ts`), `ROTULO_TIPO_EVENTO` e `ROTULO_ACAO_ADMIN`
(`src/components/admin/diario-labels.ts`, com as 7 ações novas) e `ROTULO_MACRO_POR_TIPO`
(`src/lib/log-agregacao.ts`). A trilha do Diário já mostra "Etapa liberada pela equipe" /
"Etapa travada pela equipe" e as 7 ações administrativas novas com rótulo em português.

## D. Desvios e o que ficou de fora (para o Fable e o pentester)

1. **`gps.financeiro_pode_ler` NÃO foi alterada.** A ...154 do plano do arquiteto trocava a guarda
   do papel pela pessoa. A decisão do orquestrador (B-T1 opção A) escreve a consequência oposta na
   confirmação ("o novo titular passa a ver o Financeiro"), então a guarda ficou como está.
   **Risco que permanece, por decisão:** depois de uma troca de titular, o novo titular lê o
   contrato do anterior. O remédio, se o João mudar de ideia, é UMA linha (exigir
   `coalesce(m.pessoa_aluno_id, m.aluno_id) = m.aluno_id`), e o backfill da ...154 já deixou o dado
   pronto — hoje todo titular tem `pessoa_aluno_id = aluno_id`, então a mudança seria bit a bit
   idêntica para os 125 ambientes atuais. **Item para o pentester decidir se aceita.**
2. **`admin_trocar_titular` e `admin_mover_membro` não recebem `p_motivo`** — as assinaturas do
   orquestrador não o preveem, e acrescentar parâmetro quebraria o contrato publicado ao frontend.
   O log guarda quem fez, quando, em quem e a consequência; falta a justificativa em texto.
3. **`admin_financeiro_desvincular` age sempre que `aluno_id = p_aluno_id`** (regra literal do
   orquestrador) e **não** exige que o vínculo tenha saído do portal (o §A.3 do plano exigia).
   Compensação: a função devolve `vinculadoPeloPortal` e o log grava
   "(vínculo de origem: sistema externo)". A tela avisa; o banco não impede.
4. **Índice único `membros_pessoa_uk` NÃO criado** (M5 não medido). A RPC recusa dois membros no
   mesmo cadastro, então a regra vale para toda escrita nova; falta a rede do banco para o que já
   existe. Query de medição em B0.
5. **`gps.admin_direito_ao_acesso` não tem guarda `gp_is_admin()`** (migração ...131, retrato de
   função que nasceu no banco): é SECURITY DEFINER sobre `cs.vw_gps_acessos` com
   `grant execute to authenticated`. **Qualquer aluno logado consegue chamá-la pelo PostgREST com
   um `aluno_id` alheio e ler nome, e-mail, turma, plano e situação financeira.** É pré-existente,
   está **fora do escopo desta tarefa** e não foi tocada — mas o diagnóstico passou a depender
   dela, então fica registrado aqui para o pentester e para a próxima rodada.
6. **Não entram nesta rodada** (estavam no plano do arquiteto, não na tarefa): `admin_status_acesso`
   devolvendo `pessoa_aluno_id`/`pessoa_nome`; `gps.admin_adicionar_socio` gravando
   `pessoa_aluno_id`; `src/lib/auth.ts` trocando o `ilike` por PK; `removerAlunoGps` apagada;
   `nav.ts` com a aba "Resolver"; a página `/resolver`. O crédito de otimização do plano (−1
   consulta fuzzy por requisição de sócio) **ainda não foi cobrado** — o dado existe, o consumidor
   não mudou.
7. **`src/app/admin/senha-actions.ts` encolheu**: o mapeamento inline de `admin_status_acesso`
   (28 linhas) virou `mapearStatusAcesso` em `src/lib/data/central.ts`, agora usado pelas duas
   leituras. Uma RPC, um mapeamento.
