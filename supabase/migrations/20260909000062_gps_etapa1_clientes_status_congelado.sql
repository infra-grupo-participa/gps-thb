-- `status` de gps.etapa1_clientes CONGELADO também no banco.
--
-- A migração 20260909000060 declarou `status` congelado e fez disso a garantia de
-- reversão da Fase 4 (`drop column fase` restaura o estado anterior). Até aqui a
-- garantia era só de TIPO: PatchCliente perdeu o campo, mas Server Action é
-- endpoint HTTP e uma chamada forjada podia mandar `{ status: ... }` — o RLS
-- deixa (dono da linha) e a coluna aceitaria. Achado do pentest de 08/09/2026
-- (MÉDIO). A aplicação ganhou allowlist em runtime (src/app/etapa-1/actions.ts);
-- este trigger é a trava que não depende de código.
--
-- Por que trigger e não `revoke update (status)`: revoke de coluna é no-op
-- quando existe grant de UPDATE na tabela inteira (já aconteceu neste banco,
-- ver memória "recriar função parte do corpo vigente / revoke de coluna").
--
-- O QUE NÃO FAZ: não impede INSERT com status (o default da coluna segue valendo
-- para cliente novo); não toca em `fase`; não muda a trigger do diário.
--
-- Reversão: drop trigger trg_etapa1_clientes_status_congelado on gps.etapa1_clientes;
--           drop function gps.etapa1_clientes_status_congelado();

create or replace function gps.etapa1_clientes_status_congelado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    raise exception 'etapa1_clientes.status esta congelado desde a migracao 20260909000060; use `fase`'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function gps.etapa1_clientes_status_congelado() is
  'BEFORE UPDATE em gps.etapa1_clientes: recusa (42501) qualquer mudanca em `status`, coluna congelada pela migracao ...060 e usada como caminho de volta da Fase 4. Remover junto com a coluna.';

drop trigger if exists trg_etapa1_clientes_status_congelado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_status_congelado
  before update of status on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_status_congelado();
