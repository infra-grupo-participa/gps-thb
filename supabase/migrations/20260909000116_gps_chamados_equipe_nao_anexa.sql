-- Pentest da Fase 6 (09/09/2026): dois ajustes em gps.chamado_gravar_mensagem.
--
-- BAIXO (CWE-863): a regra B5-c ("so o aluno anexa; a equipe responde com texto
-- e link") era imposta pela UI (podeAnexar=false no admin) e pela policy de
-- INSERT do bucket (o admin nao consegue SUBIR arquivo). Mas responderChamado e
-- endpoint HTTP: um admin podia mandar `anexo` apontando para um objeto JA
-- existente no prefixo do ambiente (orfao ou anexo de outra mensagem) e a RPC
-- gravava a mensagem da equipe com anexo. Nao e escalada (o admin ja ve o
-- ambiente inteiro), mas viola o invariante declarado. Agora a propria RPC
-- recusa anexo quando p_autor_papel = 'equipe' -- e o unico lugar que decide
-- o papel, entao e o unico lugar que precisa saber da regra.
--
-- MEDIO (CWE-434), so documentacao: o comentario anterior dizia que "o que o
-- objeto REALMENTE e vence o que o cliente declarou". Isso superestima a
-- garantia: storage.objects.metadata (mimetype/size) reflete o Content-Type e
-- o tamanho que o PROPRIO cliente mandou no PUT -- nao ha inspecao dos bytes
-- (magic number). Um PNG declarado pode ser HTML. A mitigacao real e que TODO
-- download sai com `download=` (Content-Disposition: attachment) e a previa e
-- <img>, que nao executa script. REGRA: nenhum consumidor futuro pode servir
-- anexo de chamado inline sem essa mesma trava. Verificar conteudo de verdade
-- exigiria Edge Function lendo o arquivo -- fora deste ciclo.
--
-- O QUE NAO FAZ: nao muda assinatura, nao muda grants (a funcao continua sem
-- execute para public/anon/authenticated), nao toca nas outras 3 RPCs.
--
-- Reversao: reaplicar o corpo da 20260909000111 (sem o bloco de 'equipe').

create or replace function gps.chamado_gravar_mensagem(
  p_chamado_id    uuid,
  p_autor_papel   text,
  p_texto         text,
  p_anexo_path    text     default null,
  p_anexo_nome    text     default null,
  p_anexo_mime    text     default null,
  p_anexo_tamanho integer  default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id     uuid;
  v_qtd          integer;
  v_prefixo      text;
  v_ext          text;
  v_meta_size    bigint;
  v_meta_mime    text;
  v_mime         text;
  v_tamanho      integer;
  v_existe       boolean;
begin
  select c.aluno_id into v_aluno_id from gps.chamados c where c.id = p_chamado_id;
  if v_aluno_id is null then
    raise exception 'chamado nao encontrado' using errcode = '42501';
  end if;
  if p_autor_papel not in ('aluno','equipe') then
    raise exception 'papel invalido' using errcode = '22023';
  end if;
  if p_texto is null or length(btrim(p_texto)) = 0 then
    raise exception 'escreva uma mensagem' using errcode = '22023';
  end if;
  if length(btrim(p_texto)) > 4000 then
    raise exception 'a mensagem passa de 4.000 caracteres' using errcode = '22023';
  end if;
  select count(*) into v_qtd from gps.chamado_mensagens m where m.chamado_id = p_chamado_id;
  if v_qtd >= 20 then
    raise exception 'este chamado ja tem 20 mensagens' using errcode = '42501';
  end if;

  -- B5-c no banco: a equipe responde com texto e link; nunca com anexo.
  if p_autor_papel = 'equipe'
     and (p_anexo_path is not null or p_anexo_nome is not null
          or p_anexo_mime is not null or p_anexo_tamanho is not null) then
    raise exception 'a equipe responde sem anexo' using errcode = '42501';
  end if;

  if p_anexo_path is not null then
    if p_anexo_nome is null or p_anexo_mime is null or p_anexo_tamanho is null then
      raise exception 'anexo incompleto' using errcode = '22023';
    end if;
    v_prefixo := split_part(p_anexo_path, '/', 1);
    if v_prefixo <> v_aluno_id::text then
      raise exception 'anexo nao pertence a este chamado' using errcode = '42501';
    end if;
    begin
      select true,
             nullif(o.metadata->>'size','')::bigint,
             nullif(o.metadata->>'mimetype','')
        into v_existe, v_meta_size, v_meta_mime
        from storage.objects o
       where o.bucket_id = 'gps-chamados'
         and o.name = p_anexo_path;
    exception when insufficient_privilege then
      raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
    end;
    if not coalesce(v_existe, false) then
      raise exception 'anexo nao encontrado' using errcode = '42501';
    end if;
    v_mime    := coalesce(v_meta_mime, p_anexo_mime);
    v_tamanho := coalesce(v_meta_size, p_anexo_tamanho::bigint)::integer;
    if v_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then
      raise exception 'formato de anexo nao aceito' using errcode = '22023';
    end if;
    if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
      raise exception 'anexo maior que 5 MB' using errcode = '22023';
    end if;
    v_ext := lower(regexp_replace(p_anexo_path, '^.*\.', ''));
    if not (
         (v_mime = 'image/png'       and v_ext = 'png')
      or (v_mime = 'image/jpeg'      and v_ext in ('jpg','jpeg'))
      or (v_mime = 'image/webp'      and v_ext = 'webp')
      or (v_mime = 'application/pdf' and v_ext = 'pdf')
    ) then
      raise exception 'extensao do anexo nao confere com o tipo do arquivo' using errcode = '22023';
    end if;
  elsif p_anexo_nome is not null or p_anexo_mime is not null or p_anexo_tamanho is not null then
    raise exception 'anexo incompleto' using errcode = '22023';
  end if;

  insert into gps.chamado_mensagens
    (chamado_id, autor_id, autor_papel, texto,
     anexo_path, anexo_nome, anexo_mime, anexo_tamanho)
  values
    (p_chamado_id, auth.uid(), p_autor_papel, btrim(p_texto),
     p_anexo_path, p_anexo_nome, v_mime, v_tamanho);

  update gps.chamados c
     set status             = case when p_autor_papel = 'aluno' then 'aberto' else 'respondido' end,
         ultima_mensagem_em = now(),
         fechado_em         = null,
         fechado_por        = null
   where c.id = p_chamado_id;
end;
$$;

comment on function gps.chamado_gravar_mensagem(uuid, text, text, text, text, text, integer) is
  'PRIVADA (sem grant): valida o anexo, grava a mensagem e move o status. Chamada por gps.chamado_abrir e gps.chamado_responder. Equipe NUNCA anexa (B5-c, imposto aqui desde a ...116). Tamanho e MIME saem de storage.objects.metadata -- que e o Content-Type/Content-Length que o CLIENTE mandou no PUT, nao inspecao dos bytes: a protecao real contra conteudo disfarcado e todo download sair com download= (attachment) e a previa ser <img>. Nunca servir anexo de chamado inline.';

revoke execute on function gps.chamado_gravar_mensagem(uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
