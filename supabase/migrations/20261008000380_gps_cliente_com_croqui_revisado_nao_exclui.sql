-- 20261008000380 — fecha o contorno da trava "croqui revisado não pode ser apagado"
--
-- A …378 impede o parceiro de remover a FOLHA revisada (cliente_croqui_remover).
-- Achado do pentest (08/10): gps.cliente_croquis.cliente_id é ON DELETE CASCADE,
-- e o parceiro pode excluir um cliente SEM estrela (a trava de acompanhamento só
-- protege o cliente acompanhado). Medido: 4 anexos estão em clientes sem
-- estrela, e cliente_croqui_anexar não exige estrela. Excluir o cliente levaria
-- a folha revisada — e o parecer da equipe — junto.
--
-- Regra: quem não é admin não exclui cliente que tem croqui revisado.
-- Admin passa; contexto sem usuário (cron/service_role, auth.uid() nulo) passa.
-- Decisão do João (08/10): "croqui revisado não pode ser apagado" — esta é a
-- mesma regra, aplicada ao caminho indireto.
--
-- Reversão: drop trigger trg_etapa1_clientes_croqui_revisado on gps.etapa1_clientes;
--           drop function gps.etapa1_clientes_croqui_revisado_travado();

create or replace function gps.etapa1_clientes_croqui_revisado_travado()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(gps.eh_admin(), false) then
    return old;
  end if;

  if exists (
    select 1 from gps.cliente_croquis cq
     where cq.cliente_id = old.id
       and cq.status = 'revisada'
  ) then
    raise exception 'Este cliente tem croqui revisado pela equipe e não pode ser excluído. Fale com o Suporte.'
      using errcode = '42501';
  end if;

  return old;
end;
$function$;

revoke all on function gps.etapa1_clientes_croqui_revisado_travado() from public, anon, authenticated;

drop trigger if exists trg_etapa1_clientes_croqui_revisado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_croqui_revisado
  before delete on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_croqui_revisado_travado();

-- ═══ Prova (08/10/2026, produção, transação desfeita) ═══
-- cliente SEM estrela + croqui 'revisada' forjado → parceiro DELETE →
--   42501 "Este cliente tem croqui revisado pela equipe e não pode ser excluído. Fale com o Suporte."
-- mesmo cliente com o croqui em 'enviada' → parceiro DELETE → exclui (controle).
-- Custo: 1 exists por DELETE de cliente, pelo índice cliente_croquis(cliente_id, …).
