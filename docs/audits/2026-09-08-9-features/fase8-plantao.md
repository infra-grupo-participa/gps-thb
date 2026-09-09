# FASE 8 — Agenda do Plantão com autonomia das operadoras (spec do orquestrador, 08/09/2026)

Pedido do João: operadoras (Isabela, Cristiane, Ilan; Elaine apresenta também) montam o próprio calendário de plantões
— data, hora, quem apresenta, e-mail da mentora, link do Zoom —, trocam a mentora de um dia por outra, pausam/cancelam,
sem depender do dev. Levantamento (Sonnet, 08/09): o CRUD JÁ EXISTE em `/admin/plantao` (`src/app/admin/plantao/actions.ts`,
`src/components/admin/plantao-calendario.tsx`, `plantao-mentoras.tsx`). Isabela e Cristiane já são admin; Elaine é dev;
**Ilan não tem conta** (pendência do João). Mentoras cadastradas com e-mail: Isabela, Elaine, Cristiane.

## O que falta (lacunas reais) → escopo desta fase
| # | Lacuna | Entrega |
|---|---|---|
| L1 | Trocar mentora não zera o aviso de véspera (`aviso_mentora_em`) → a mentora nova nunca é avisada | `editarSlot`/`trocarMentoraSlot`: se `mentora_id` mudou, `aviso_mentora_em = null` |
| L2 | Publicar plantão de mentora sem e-mail = ninguém avisado, sem alerta | `publicarSlot(true)` recusa se `plantao_mentoras.email` nulo, com mensagem que diz o que fazer |
| L3 | Não existe cancelar plantão publicado com inscritos (só remover, que é bloqueado) | `cancelarSlot(slotId, motivo)`: marca `cancelado_em/cancelado_motivo`, `publicado=false`, cancela inscrições ativas, e-mail aos inscritos |
| L4 | Pausar inscrições do plantão inteiro é só SQL na Hostinger | tabela `gps.plantao_config` + `plantao_escrita_liberada()` lê dela; toggle na UI |
| L5 | Cada plantão é criado um a um | `criarSlot` com `repetirSemanas` (0–12): cria a série semanal, pula conflito de unique |
| L6 | Nenhum fluxo dedicado "trocar quem apresenta" | ação `trocarMentoraSlot(slotId, mentoraId)` + select inline no card do dia |

Fora: e-mail à mentora nova na hora (o job de véspera cobre via L1); recorrência complexa; promoção de admin (fora do repo).

## Backend (`backend-engineer`, Opus) — arquivos: `supabase/migrations/**`, `src/app/admin/plantao/actions.ts`, `src/lib/plantao-tipos.ts`, `src/lib/plantao-data.ts` (leitura), `src/lib/email-plantao.ts`

**Migration `20260909000070_gps_plantao_cancelamento_e_config.sql`** (cabeçalho no padrão: motivação, o que NÃO faz, reversão):

```sql
alter table gps.plantao_slots
  add column cancelado_em timestamptz,
  add column cancelado_motivo text
    check (cancelado_motivo is null or length(cancelado_motivo) between 1 and 300);
-- comment: cancelado = despublicado + inscrições canceladas; nunca apagado (histórico e e-mail).
-- índice não: tabela pequena, leitura por mês já filtra por inicio_em.

create table gps.plantao_config (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
alter table gps.plantao_config enable row level security;
create policy gps_plantao_config_admin on gps.plantao_config for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());
revoke all on gps.plantao_config from anon;   -- anon não lê config; a RPC pública lê via SECURITY DEFINER
insert into gps.plantao_config (chave, valor) values ('inscricao_aberta', 'true') on conflict do nothing;

-- Corpo VIGENTE de plantao_escrita_liberada() (extraído do banco em 08/09):
--   language sql stable security definer set search_path = ''
--   select coalesce(current_setting('app.plantao_inscricao_aberta', true), 'true') <> 'false';
-- Novo: a tabela manda; o setting continua como fallback (desliga em emergência sem deploy, como antes).
create or replace function gps.plantao_escrita_liberada() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.valor from gps.plantao_config c where c.chave = 'inscricao_aberta'),
    current_setting('app.plantao_inscricao_aberta', true),
    'true') <> 'false';
$$;
-- manter grants como estão (revoke/grant iguais aos da ...043/044 — confira com rg antes).
```

**NÃO recriar** `plantao_calendario` / `plantao_minha_inscricao` / `plantao_inscrever`: cancelar = `publicado=false` + `inscricoes.cancelado_em`, e essas RPCs já filtram por isso (corpos vigentes conferidos no banco: `plantao_calendario` tem `where sl.publicado`; `plantao_minha_inscricao` tem `i.cancelado_em is null`). Zero mudança de contrato público.

**`src/app/admin/plantao/actions.ts`** (padrão atual: `ehAdmin()` + escrita direta via RLS; manter):
- `criarSlot(input & { repetirSemanas?: number })` → `{ ok, criados: number, pulados: string[] }`. Clamp 0–12. Série: mesma hora/mentora/duração/zoom/observação, `data + 7*i`. Insere um a um; 23505 vira "pulado" (data ISO), não erro. Tudo nasce **não publicado**, como hoje.
- `trocarMentoraSlot(slotId, mentoraId)` → `{ ok, erro? }`: mentora precisa estar `ativa`; update `mentora_id` + `aviso_mentora_em = null`; recusa se slot cancelado ou já iniciado (`inicio_em <= now()`); 23505 (mesma mentora/data/hora já existe) → erro legível.
- `editarSlot`: se `mentoraId` mudou em relação ao atual, também zera `aviso_mentora_em`. Recusa se cancelado.
- `publicarSlot(slotId, true)`: recusa se a mentora do slot não tem e-mail → `erro: "A mentora X não tem e-mail cadastrado; sem ele ela não recebe o aviso de véspera. Cadastre na aba Mentoras e publique de novo."`. Recusa se cancelado.
- `cancelarSlot(slotId, motivo)` → `{ ok, avisados: number, inscritos: number, falhas: number, erro? }`: em ordem — (1) lê slot + inscritos ativos (nome/e-mail via `plantao_alunos`), recusa se já cancelado ou já iniciado; (2) update slot `cancelado_em=now(), cancelado_motivo, publicado=false`; (3) update inscrições ativas `cancelado_em=now()`; (4) envia e-mail a cada inscrito com `enviarPlantaoCancelamento` (novo em `email-plantao.ts`, no mesmo padrão visual/remetente dos existentes: data/hora, mentora, motivo se houver, link para o calendário público para escolher outro dia); falha de e-mail não desfaz o cancelamento — conta em `falhas` e `console.error` com contexto; (5) grava evento de auditoria no padrão de `plantao_eventos` se houver tipo adequado; senão pular.
- `removerSlot`: deve permitir remover slot **cancelado** (inscrições já canceladas) — hoje só bloqueia por inscrito ativo; confirme.
- `definirInscricoesAbertas(aberta: boolean)` → `{ ok, erro? }`: upsert em `plantao_config` (`atualizado_por` = uid). E `lerInscricoesAbertas(): Promise<boolean>` em `plantao-data.ts`.
- Leitura (`plantao-data.ts`): o que alimenta o calendário admin passa a trazer `cancelado_em`, `cancelado_motivo`, e o e-mail da mentora (para a UI alertar antes de publicar).

Tipos em `src/lib/plantao-tipos.ts`: o tipo do slot admin ganha `canceladoEm: string | null`, `canceladoMotivo: string | null`, `mentoraEmail: string | null` (ou o equivalente no formato que já existe — decida e documente no retorno, o frontend vai ler o arquivo).

Critérios: `npx tsc --noEmit` limpo; `npm run lint` sem novo; `npm run build` verde; entregar bloco SQL de conferência pós-aplicação (config lida pela função: `select gps.plantao_escrita_liberada()` antes/depois de `update plantao_config set valor='false'` em transação com rollback; colunas novas; anon não lê config). NÃO aplicar no banco, NÃO commitar.

## Frontend (`frontend-engineer`, Opus) — arquivos: `src/components/admin/plantao-calendario.tsx`, `src/components/admin/plantao-mentoras.tsx` (se precisar), `src/app/admin/plantao/page.tsx` (só passar props novas)
Contratos acima são o combinado (assinaturas exatas). O backend trabalha em paralelo; leia `plantao-tipos.ts` e `actions.ts` antes de começar e de novo antes do build final.
- **Barra do topo do calendário**: pílula "Inscrições abertas / pausadas" + botão alternar (`definirInscricoesAbertas`) com confirmação em texto: pausar = "Ninguém consegue se inscrever, cancelar ou revelar o link até você reabrir. Os plantões continuam visíveis." Estado vem por prop do Server Component (`lerInscricoesAbertas`).
- **Card/diálogo do slot**: (a) select inline "Quem apresenta" com as mentoras ativas → `trocarMentoraSlot`, com aviso curto após sucesso: "O aviso de véspera será enviado para a mentora nova." (b) botão "Cancelar plantão" (só se não cancelado e não iniciado) → diálogo com motivo (opcional, ≤300) e a frase "N inscrito(s) serão avisados por e-mail"; resultado mostra `avisados/inscritos` e `falhas` se > 0. (c) slot cancelado: badge "Cancelado" + motivo; esconder publicar/editar/trocar; manter remover. (d) ao publicar, se `mentoraEmail` nulo, botão desabilitado com linha explicando (o backend também recusa).
- **Criar plantão**: campo "Repetir semanalmente por" (0–12 semanas, default 0) com prévia "Cria N plantões: dd/mm, dd/mm, …"; resultado mostra criados e pulados por data.
- a11y: labels reais, `aria-live` nas mensagens de resultado, foco volta ao gatilho ao fechar diálogo. Sem lib nova. Texto em português, sem jargão.
- Critérios: tsc/lint/build verdes (depois do backend), nenhum campo inventado além dos contratos.
