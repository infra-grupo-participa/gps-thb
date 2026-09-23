-- Fecha a fuga pela data da reunião e limita a trava ao cliente ESCOLHIDO.
--
-- Corrige DOIS defeitos da ...304, achados pela auditoria de 23/09/2026.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DEFEITO 1 — a trava pegava cliente que NINGUÉM escolheu
-- ─────────────────────────────────────────────────────────────────────────
--   A ...304 recusava voltar para Prospecção TODO cliente que tivesse andado,
--   com ou sem estrela, e com a frase "A equipe está acompanhando este
--   cliente" — falsa para quem nunca foi escolhido.
--
--   MEDIDO em produção: **40 clientes avançados SEM estrela** ficaram presos
--   por engano. Um toque errado no `Select` da lista virava irreversível para
--   o parceiro, com uma frase que mentia sobre o motivo.
--
--   A decisão registrada (Marcio, 23/09/2026) é sobre "o cliente que a equipe
--   vai acompanhar". Sem estrela, nada aqui se aplica: `if not
--   old.acompanhado_equipe then return`.
--
-- ─────────────────────────────────────────────────────────────────────────
-- DEFEITO 2 — a porta dos fundos: apagar a data destravava a troca
-- ─────────────────────────────────────────────────────────────────────────
--   A ...304 lê o estado ANTERIOR para decidir se trava — e isso está certo,
--   porque com `new` o próprio ato de avançar seria recusado.
--
--   Mas sobrava uma saída, que o rollback da ...304 não testou: o favorito em
--   Prospecção COM reunião marcada estava travado; bastava **apagar a data**
--   na ficha e salvar (a trigger não recusava essa escrita), e na escrita
--   seguinte o `old` já dizia "não andou" — desmarcar passava a ser livre.
--
--   MEDIDO: **5 favoritos** estão exatamente nessa posição hoje.
--
--   Apagar a data de um favorito cujo caso andou é, na prática, destravar a
--   troca. Recusa com a MESMA frase: para o parceiro é um problema só.
--
-- ⚠️ LIÇÃO DE MÉTODO: a ...304 declarou "provado em transação com rollback"
--   sobre 4 casos. Os dois defeitos acima estavam nos casos que o rollback
--   NÃO cobriu (cliente sem estrela; limpar a data). Prova parcial apresentada
--   como prova é pior que ausência de prova.
--
-- PROVADO AQUI, 8 casos em transação com rollback (todos corretos):
--   1) sem estrela volta a Prospecção .......... PASSA
--   2) sem estrela pode ser apagado ............ PASSA
--   3) favorito livre em Prospecção ............ PASSA
--   4) marcar reunião (ato de avançar) ......... PASSA
--   5) apagar a data para destravar ............ RECUSA 42501  <- defeito 2
--   6) desmarcar após reunião marcada .......... RECUSA 42501
--   7) favorito avança de fase ................. PASSA
--   8) favorito volta a Prospecção ............. RECUSA 42501
--
-- ZERO coluna, ZERO índice, ZERO backfill, ZERO linha escrita.
-- REVERSÃO: repor o corpo da ...304 (nenhum dado a desfazer).


-- (o corpo abaixo é o que está VIVO no banco, lido por pg_get_functiondef
--  depois de aplicado — não é transcrição de memória)

create or replace function gps.etapa1_clientes_acompanhamento_travado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(public.gp_is_admin(), false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and (new.acompanhamento_confirmado_em  is distinct from old.acompanhamento_confirmado_em
       or new.acompanhamento_confirmado_por is distinct from old.acompanhamento_confirmado_por)
  then
    raise exception 'Só a equipe confirma ou libera o acompanhamento deste cliente.'
      using errcode = '42501';
  end if;

  -- CORREÇÃO 1: sem estrela, nada aqui se aplica (40 presos por engano).
  if not old.acompanhado_equipe then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- CORREÇÃO 2: apagar a data de um favorito que andou destravaria a troca.
  if tg_op = 'UPDATE'
     and old.data_reuniao_preliminar is not null
     and new.data_reuniao_preliminar is null
  then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  -- O caso ainda não andou -> livre. `old`, NUNCA `new`.
  if old.fase = 'prospeccao' and old.data_reuniao_preliminar is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and not new.acompanhado_equipe then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.fase = 'prospeccao' and old.fase is distinct from 'prospeccao'
  then
    raise exception 'A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_etapa1_clientes_acompanhamento_travado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_acompanhamento_travado
  before update or delete on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_acompanhamento_travado();
