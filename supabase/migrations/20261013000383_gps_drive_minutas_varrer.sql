-- Varredura automática da blindagem das minutas (edge drive-minutas, modo `varrer`).
-- A pasta "03 Minutas" nasce dentro da árvore do aluno (matriz copiada pela drive-provisionar);
-- este cron a tira de lá (move para "Minutas (equipe)" + atalho) a cada 10 minutos.
-- Nasce DESLIGADO: gps.config.drive_minutas_varrer_ativo = 'false'.
-- Desligar: update gps.config set valor = 'false' where chave = 'drive_minutas_varrer_ativo';
-- Reverter o cron: select cron.unschedule('drive-minutas-varrer');

insert into gps.config (chave, valor) values
  ('drive_minutas_varrer_ativo', 'false'),
  ('drive_minutas_url', 'https://mbvybujpkwuorhtdzcde.supabase.co/functions/v1/drive-minutas')
on conflict (chave) do nothing;

create or replace function gps.drive_minutas_varrer()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ativo   text;
  v_url     text;
  v_segredo text;
  v_req     bigint;
begin
  select valor into v_ativo from gps.config where chave = 'drive_minutas_varrer_ativo';
  if coalesce(v_ativo, 'false') <> 'true' then
    return null;
  end if;

  select nullif(btrim(valor), '') into v_url from gps.config where chave = 'drive_minutas_url';
  v_segredo := gps.drive_segredo();
  if v_url is null or v_segredo is null then
    raise warning 'drive-minutas: url ou segredo ausente';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := '{"modo":"varrer","simular":false}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-drive-segredo', v_segredo),
    timeout_milliseconds := 10000
  ) into v_req;
  return v_req;
end;
$$;

-- função interna: só o cron (postgres) chama
revoke execute on function gps.drive_minutas_varrer() from public, anon, authenticated;

select cron.schedule('drive-minutas-varrer', '7-59/10 * * * *', $cron$select gps.drive_minutas_varrer()$cron$);
