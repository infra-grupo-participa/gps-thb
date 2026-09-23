-- ═══════════════════════════════════════════════════════════════════════════
-- Auditoria da Entrevista Prévia 2.0 (23/09) — 4 correções no banco.
-- APLICADAS EM PRODUÇÃO por MCP; este arquivo é o retrato + o racional.
--
-- 1) `entrevista_gravar` passou a CARIMBAR `disc_atualizado_em/_por`.
--    Das 3 funções que escrevem `perfil_disc`, era a única que não carimbava
--    (127 de 128 clientes com DISC e sem carimbo). Não quebrava tela — o
--    `divergiu` do briefing compara a LETRA, não a data — mas custava
--    auditoria: ninguém sabia quem mudou o DISC nem quando.
--    🔑 Carimba SÓ quando `p_disc is not null`: marcar "DISC atualizado" numa
--    ligação que não tocou no perfil mentiria pior do que não marcar.
--
-- 2) `sessao_briefing_ler` ganhou `decisores_ao_vivo`.
--    🔴 O DEFEITO MAIS SÉRIO DESTA AUDITORIA. O snapshot congela os decisores
--    no ato do AGENDAMENTO, e a Entrevista Prévia (que os descobre) roda
--    DEPOIS na maioria dos casos. A doutora abria o briefing com a lista
--    velha e conduzia a reunião acreditando estar com todos os decisores na
--    sala — quebrando a regra ("proibido participar da reunião sem os
--    decisores") no exato momento em que ela deveria valer.
--    Mesmo raciocínio que tirou o DISC do snapshot (…294): quem decide é
--    ATRIBUTO ESTÁVEL DA PESSOA, não fato datado. O congelado permanece em
--    `briefing.decisores` como histórico do que se sabia no dia.
--    Provado: decisor acrescentado depois do agendamento aparece ✓, snapshot
--    intacto ✓.
--
-- 3) Correção da referência: `v_a.cliente_id` (record), não `v_cliente_id` —
--    a 1ª tentativa usou uma variável que não existe naquela função.
--
-- 4) `entrevista_previa_pode` com curto-circuito de admin.
--    MEDIDO: cliente_decisores_pendentes 3,43 ms / 750 buffers, dos quais
--    2,38 ms / 547 na guarda — e 1,35 ms / 398 só em `gps.aluno_atual()`
--    (função PRÉ-EXISTENTE, usada por policies de dezenas de tabelas; não é
--    custo desta feature nem é aqui que se conserta). Pondo `gp_is_admin()`
--    primeiro, o caminho do admin não paga `aluno_atual()`.
--    DEPOIS: 2,53 ms / 452 buffers (−27% tempo, −40% buffers).
--    🔴 A ordem é de DESEMPENHO, nunca de segurança: as duas condições
--    continuam valendo. Provado nos 3 cenários (admin em cliente alheio true ·
--    parceiro no próprio true · parceiro no ALHEIO false).
--
-- ⚠️ Corpos aplicados: conferir `pg_get_functiondef` das funções vivas antes
-- de reescrever qualquer uma.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function gps.entrevista_previa_pode(p_cliente_id uuid)
returns boolean
language plpgsql stable security definer set search_path to ''
as $$
begin
  -- Curto-circuito: admin não paga `aluno_atual()` (1,35 ms / 398 buffers).
  if coalesce(public.gp_is_admin(), false) then
    return true;
  end if;
  return coalesce(
    exists (select 1 from gps.etapa1_clientes c
             where c.id = p_cliente_id and c.aluno_id = gps.aluno_atual()),
    false);
end $$;

revoke all on function gps.entrevista_previa_pode(uuid) from public, anon;
grant execute on function gps.entrevista_previa_pode(uuid) to authenticated;
