-- ═══════════════════════════════════════════════════════════════════════════
-- Agenda de Sessões — a porta de LEITURA do resumo.
--
-- 🔴 POR QUE ESTA MIGRATION EXISTE (achado da INTEGRAÇÃO, 22/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- A fatia C (…295) criou `gps.sessao_concluir` e `gps.sessao_resumo_editar`, e
-- a fatia A (…294) manteve a coluna `resumo` FORA do grant de coluna de
-- `authenticated` — as duas decisões corretas, pela premissa P4 do PRD: o
-- aluno vê QUE houve resumo (`resumo_em` está no grant), nunca o TEXTO, porque
-- texto livre sobre uma reunião com cliente de terceiro é a mesma família do
-- Diário.
--
-- Ao integrar a fatia F (a tela da doutora), o executor dela reportou o que
-- ninguém tinha visto: **não existia nenhum caminho de LEITURA do texto**.
-- Fora do grant e sem RPC, o resumo era inalcançável — a doutora escrevia e
-- **nunca mais via**, só podendo reescrever às cegas num formulário vazio.
--
-- Conferido no banco antes de escrever isto:
--   resumo no grant de authenticated?      NAO -- fora do grant
--   alguma RPC devolve o texto do resumo?  NENHUMA
--
-- Isso não é limitação aceitável, é a feature entregue pela metade: "anotado
-- no sistema" que ninguém consegue reler **não está anotado**. O pedido 8 do
-- Marcio é *"um resumo de como foi a reunião para a gente poder ter isso
-- anotado dentro do sistema"* — anotar pressupõe consultar depois.
--
-- 🔴 A correção NÃO é abrir a coluna no grant. Isso entregaria o texto ao
-- aluno e romperia P4, que é ASSIMÉTRICO: abrir depois é barato, fechar depois
-- de ter mostrado não se desfaz. A correção é uma porta de leitura com a
-- MESMA guarda da escrita.
--
-- ⚠️ ESTA FUNÇÃO JÁ ESTÁ NO BANCO desde 22/09 (aplicada como
-- `gps_sessao_resumo_ler`). Este arquivo existe para o repo não ficar sem ela
-- — sem isto, reconstruir o banco a partir das migrations produziria um
-- sistema em que a doutora não lê o próprio resumo, e o defeito voltaria sem
-- ninguém entender por quê. Ver `LEIA-ANTES-DE-DAR-PUSH.md`.
--
-- REVERSÃO: `drop function if exists gps.sessao_resumo_ler(uuid);`
-- Nada mais depende dela; a tela volta a não conseguir ler o texto.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.sessao_resumo_ler(p_agendamento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_a     record;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.estado,
         a.resumo, a.resumo_em, a.resumo_por
    into v_a
    from gps.sessao_agendamentos a
   where a.id = p_agendamento_id;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  -- MESMA guarda de `sessao_concluir`/`sessao_resumo_editar`: admin ou a
  -- doutora DONA. O aluno NÃO entra — ele vê `resumo_em` (que está no grant)
  -- e sabe QUE a equipe registrou o desfecho, nunca o texto.
  --
  -- 🔴 `coalesce(..., false)` OBRIGATÓRIO. Sem ele, `auth.uid()` NULL faz
  -- `v_a.responsavel_id = auth.uid()` virar NULL, `false or NULL` é NULL, e
  -- `if not NULL then raise` **NÃO DISPARA** — a guarda falharia ABERTA.
  -- Foi o achado ALTO explorado e confirmado em 22/09 em `sessao_pode_agendar`
  -- (devolvia o cliente favoritado de qualquer ambiente), e o mesmo defeito
  -- estava em `sessao_briefing_ler`. NULO EM GUARDA LIBERA, NÃO BLOQUEIA.
  if not coalesce(v_admin or v_a.responsavel_id = auth.uid(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'agendamento_id', v_a.id,
    'estado',         v_a.estado,
    'resumo',         v_a.resumo,
    'resumo_em',      v_a.resumo_em,
    'resumo_por',     v_a.resumo_por);
end;
$function$;

comment on function gps.sessao_resumo_ler(uuid) is
  'Devolve o TEXTO do resumo para quem pode escrevê-lo. Existe porque o resumo esta fora do grant de coluna (P4/LGPD) e, sem esta porta, a doutora escrevia e nunca mais lia -- reescreveria as cegas num formulario vazio. Mesma guarda da escrita: admin ou a doutora DONA (responsavel_id = auth.uid()). O ALUNO NAO LE: ele ve resumo_em (que esta no grant) e sabe QUE a equipe registrou o desfecho, nunca o texto.

⚠️ NAO grava trilha, diferente de sessao_briefing_ler. Motivo: o briefing e dado pessoal do CLIENTE DE TERCEIRO (descricao_caso, decisores) e a trilha E a guarda ali; o resumo e texto que a PROPRIA equipe escreveu sobre a propria reuniao, e registrar acesso a cada abertura do formulario de edicao encheria acessos_log de ruido sem proteger ninguem novo. Se um dia o resumo passar a conter transcricao do cliente, isto se revisa.

Provado em 22/09 contra o banco: doutora rele o proprio resumo OK; aluno recebe 42501; aluno ve resumo_em. P4 preservado.';

revoke all on function gps.sessao_resumo_ler(uuid) from public, anon;
grant execute on function gps.sessao_resumo_ler(uuid) to authenticated;
