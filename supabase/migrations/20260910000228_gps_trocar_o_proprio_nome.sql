-- Cada um troca o PROPRIO nome -- aluno e equipe.
--
-- Pedido do Marcio (10/09/2026): "permita que ele possa mudar seu nome por
-- favor, livremente, incluindo adm e alunos". Ate entao o nome era so
-- EXIBIDO: nao havia caminho na interface para corrigi-lo, nem para o
-- proprio dono. Quem tinha o nome errado no cadastro dependia de SQL.
--
-- 🔑 POR QUE UMA RPC, E NAO UM UPDATE DIRETO
--   • o nome do ALUNO mora em `public.thb_alunos`, base COMPARTILHADA com o
--     sip -- o GPS so LE, e a policy de escrita exige `gp_pode_editar`;
--   • o nome da EQUIPE mora em `public.perfis`, cuja policy e de admin;
--   • as duas tabelas estao FORA do schema `gps`.
--   Um SECURITY DEFINER com guarda de identidade resolve as duas sem
--   afrouxar policy nenhuma.
--
-- 🔴 A GUARDA E A IDENTIDADE, NAO O PAPEL
--   Nao existe parametro de "de quem": o alvo sai sempre de `auth.uid()`.
--   Entao nao ha como pedir a troca do nome de terceiro, nem forjando a
--   chamada. Admin que precise corrigir o nome de um aluno continua usando
--   a ficha do aluno, que ja tem trilha propria.
--
-- 🔑 O aluno e resolvido por `pessoa_aluno_id`, NAO por `aluno_id`: num
--    ambiente com socio os dois compartilham o `aluno_id` do ambiente, e
--    usa-lo trocaria o nome do TITULAR quando quem pediu foi o socio.
--
-- ⚠️ `thb_alunos` e compartilhada: o nome trocado aqui aparece nos outros
--    sistemas do grupo. O card na tela avisa isso em texto.
--
-- PROVA (em rollback, com JWT real):
--   admin  -> gravou em `perfis`
--   aluno  -> gravou em `thb_alunos`
--   "X"    -> recusado ("Escreva o seu nome completo.")
--
-- REVERSAO
--   drop function gps.trocar_meu_nome(text);
--   (e remover o card `src/components/perfil/trocar-nome.tsx`)

create or replace function gps.trocar_meu_nome(p_nome text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_nome text := btrim(coalesce(p_nome, ''));
  v_aluno uuid;
  v_onde text := null;
begin
  if v_user is null then
    raise exception 'Faça login para alterar o seu nome.' using errcode = '42501';
  end if;
  if char_length(v_nome) < 2 then
    raise exception 'Escreva o seu nome completo.' using errcode = '22023';
  end if;
  if char_length(v_nome) > 120 then
    raise exception 'O nome passa de 120 caracteres.' using errcode = '22023';
  end if;
  -- Sem quebra de linha: o nome vai para e-mail e para o Slack.
  if v_nome ~ '[\r\n]' then
    raise exception 'O nome não pode ter quebra de linha.' using errcode = '22023';
  end if;

  -- (a) equipe
  update public.perfis set nome = v_nome, atualizado_em = now() where id = v_user;
  if found then v_onde := 'perfis'; end if;

  -- (b) aluno: a PESSOA daquele login, nao o titular do ambiente.
  select m.pessoa_aluno_id into v_aluno
    from gps.membros m where m.user_id = v_user and m.pessoa_aluno_id is not null
   limit 1;
  if v_aluno is not null then
    update public.thb_alunos set nome = v_nome where id = v_aluno;
    if found then v_onde := coalesce(v_onde || '+', '') || 'thb_alunos'; end if;
  end if;

  if v_onde is null then
    raise exception 'Não encontramos o seu cadastro para alterar o nome.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('nome', v_nome, 'onde', v_onde);
end;
$fn$;

comment on function gps.trocar_meu_nome(text) is
  'Troca o nome de quem esta logado -- em public.perfis (equipe) e/ou public.thb_alunos (aluno), conforme o cadastro. A guarda e a IDENTIDADE: nao ha parametro de alvo, o destino sai de auth.uid(), entao ninguem troca o nome de terceiro.';

revoke all on function gps.trocar_meu_nome(text) from public, anon;
grant execute on function gps.trocar_meu_nome(text) to authenticated;
