-- ═══════════════════════════════════════════════════════════════════════════
-- 367 — ADMIN DO GPS SEPARADO (2/5): conferência da carga inicial
-- ═══════════════════════════════════════════════════════════════════════════
-- O repositório é PÚBLICO: a lista nominal dos admins aprovada pelo João em
-- 08/10/2026 NÃO fica aqui. A carga é aplicada à parte, ENTRE a 366 e esta,
-- por um script fora do repo (guardado com o Marcio/João). Ela marca
-- gps.admins_via_rpc na própria transação, aborta se algum e-mail não tiver
-- login, e o gatilho admins_registrar_log grava uma linha 'concedido' por
-- pessoa (ator null = migração).
--
-- Esta migração só CONFERE: sem admin ativo, as 368–375 derrubariam a equipe
-- inteira no GPS — então ela aborta e impede a sequência de seguir.
--
-- MEDIDO ANTES (08/10/2026, begin…rollback, cada login @advmais.com simulado
-- com `set local role authenticated` + request.jwt.claims): todos os da lista
-- aprovada passam hoje e continuam passando. Duas contas que passam hoje
-- deixam de passar (uma por decisão do João; outra só entrava pela regra
-- gp_acesso_pode_editar('educacional')) — nomes no relatório da entrega, não
-- aqui. Conceder depois: select gps.admin_definir('<e-mail>', true, '<motivo>');
--
-- REVERTER: nada a reverter (não grava). A carga se desfaz pela RPC
-- (gps.admin_definir(<e-mail>, false, <motivo>)) — com 368–375 aplicadas,
-- prefira a reversão rápida global descrita na 366.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if (select count(*) from gps.admins where ativo) < 1 then
    raise exception 'gps.admins vazia: aplicar a carga inicial (fora do repo) antes da 367';
  end if;
  if (select count(*) from gps.admins_log where acao = 'concedido') < (select count(*) from gps.admins) then
    raise exception 'gps.admins com linha sem log de concessão';
  end if;
end $$;

commit;
