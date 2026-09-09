# Squad — 9 features do GPS · Fases 1, 2, 2-bis, 3 e 4 (reconstrução resumida)

> O arquivo original (spec do `arquiteto`, 08/09/2026) foi perdido ao limpar `tmp/squad` antes de
> arquivar. Esta é a reconstrução, a partir do retorno do arquiteto e das medições do orquestrador.
> Os detalhes de implementação estão nos commits `282c1a7..f7b4116` e no `CLAUDE.md`
> (seção "As 9 features do Marcio"). O plano de produto está em `PLANO-9-FEATURES.md`.

## A) Mapa do sistema (o que todo agente precisa saber)

1. **Camadas.** Página (`src/app/**/page.tsx`, Server Component) → leitura em `src/lib/data.ts`
   (`get*`, `createClient()` de `@/lib/supabase/server`) → escrita em `src/app/**/actions.ts`
   (`"use server"`). Componentes recebem dado por prop; `"use client"` só onde há estado.
2. **Papel.** `getContextoSessao()` (`src/lib/auth.ts`) resolve `admin | aluno | sem_acesso`.
   Admin = `public.perfis` com `status='ativo'` e `cargo in ('dev','admin')` — o mesmo teste de
   `public.gp_is_admin()` no banco. `ehAdmin()` é a guarda em toda função de admin de `data.ts`.
3. **`alunoId` (AMBIENTE = `thb_alunos.id` do titular) ≠ `membroAlunoId` (PESSOA logada).**
   Dado é por ambiente; identidade é por pessoa. Titular e sócio compartilham `alunoId`.
4. **RPC/RLS.** RLS em toda tabela `gps.*`; admin por `gp_is_admin()`, aluno por
   `gps.aluno_atual()`. O que toca `auth.users` ou agrega entre alunos vive em função
   SECURITY DEFINER no schema `gps`: abre com `if not public.gp_is_admin() then raise ... 42501`,
   `set search_path = ''` com identificadores qualificados, `revoke execute from public, anon`
   ANTES de `grant execute to authenticated`. Nunca `service_role`.
5. **Migration.** `supabase/migrations/AAAAMMDDNNNNNN_gps_<slug>.sql`, cabeçalho com motivação
   medida, o que NÃO faz e a linha de reversão literal; `comment on` em tudo. O orquestrador aplica
   pelo MCP Supabase (`mbvybujpkwuorhtdzcde`); agente não tem banco.
6. **Interruptor.** Padrão do Plantão: função de escrita lê `current_setting('app.<flag>', true)`
   (falha fechado quando ausente) — e desde 08/09 `gps.plantao_config` (tabela editável pela
   equipe) é a fonte primária do interruptor de inscrições.
7. **Fim de sessão.** Atualizar `CLAUDE.md` (seção nova, "Estado atual", rodapé
   `_Última atualização_`) e `PLANO-9-FEATURES.md`.

## B) Decisões de desenho por fase (resumo)

| Fase | Decisão | Commit |
|---|---|---|
| 1 | `InputSenha` único (`type` interpolado); busca/ordenação em memória com `texto.ts` | `282c1a7` |
| 2 | `exigeTarefa` no catálogo (nums 3 e 4 → 1); trava de UI; `motivoBloqueio`/`detalheBloqueio` em `TarefaItem` | `4ada717` |
| 2-bis | Pré-visualização puramente visual (`html[data-previa="aluno"] .previa-oculta`), `ehAdmin()` intocado, `adminOnly` no Diário | `b4cf375` |
| 3 | RPC `gps.admin_painel_alunos()` (SECURITY DEFINER) em vez de view; `ultimo_acesso` de `auth.users`, nunca de `acessos_log`; `resumoEtapa1` como fonte única de `pct`; índice ...051 dispensado (já existia) | `2f6a9a9`, `e05c27e` |
| 4 | `fase` + CHECK, backfill por evidência (`recusou` primeiro → prospecção; `agendado`/`realizada`/evidência → fechamento), `status` congelado (trigger ...062), trigger do diário audita `cliente_fase_mudou`, `agendados` por evidência (...061) | `503ac60`, `4dcd96a`, `b65746f` |

## C) Medições do orquestrador (banco real, 08/09)

- B10: 63 ambientes com cliente; 13 com ≥30 nomes; **5** cumprem 30 com dados completos.
- Índices em `etapa1_clientes`: `etapa1_clientes_aluno_idx (aluno_id)` + parcial `unico_equipe`.
- `atualizado_em` + `trg_etapa1_clientes_touch`: bump aceito (ninguém lê o de clientes).
- Projeção do backfill: prospecção 842 / fechamento 37 / contratado 0. `aluno_eventos` 1.443 → 1.443.
- RPC do painel: 125 linhas = 125 ambientes, 0 divergências (clientes e membros), 7,7 ms, width 85.
- `agendados`: 10 (status) → 36 (evidência).
- Trigger nova testada em transação com rollback (`cliente_fase_mudou` com `{de,para}`); CHECK 23514; trava de `status` 42501 com `fase` livre.

## D) Conflitos e bloqueios remanescentes

- **C7** — as 3 fases não têm lugar para "recusou"; não remover `status` sem decidir.
- **C8** — `agendados` é compartilhado entre painel e tela do aluno: Fase 3 foi refatoração de resultado idêntico; a semântica mudou só na Fase 4.
- **B10** — copy fechada para 58/63 ambientes: decisão de produto do Marcio.
- **B11** — `gps.admin_painel_alunos()` é superfície SECURITY DEFINER sobre `auth.users`: pentest feito (APROVADO).

## E) Pentest

- Fases 1–4: APROVADO; MÉDIO (allowlist runtime + trigger de `status`) e BAIXO (`autoComplete="new-password"`) corrigidos em `b65746f`.
- Fase 8: APROVADO; LOW (TOCTOU em editar/trocar/publicar) e INFO (timeout do fetch da Resend) corrigidos em `e596a9e`.
- Fable: reprovado em otimização (mentora casada por nome) → corrigido em `0d3f6c7` → APROVADO.
