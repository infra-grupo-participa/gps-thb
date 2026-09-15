-- Conserta a busca do "Criar acesso" (e as outras 2 telas que reusam
-- `buscarAlunos`): nome com acento e telefone com máscara não casavam.
--
-- POR QUE EXISTE
--   O Marcio buscou por e-mail e não achou; só achou pelo nome. A busca
--   (`buscarAlunos`, src/app/admin/actions.ts) já tentava os 4 campos — o
--   PostgREST `.or()` com `ilike` não tinha como resolver dois problemas
--   estruturais medidos em produção:
--     1. `nome ilike '%joao%'` NÃO casa `João` — 375 de 1.858 pessoas
--        (20,2% da base) têm acento no nome e só apareciam com o acento
--        digitado exatamente igual. Não existe `unaccent()` em lugar nenhum
--        do caminho de banco.
--     2. `telefone ilike '%<digitos>%'` NÃO casa telefone gravado com
--        máscara — 285 linhas de `thb_alunos.telefone` têm espaço ou
--        hífen (`(51) 99366-2779`), e dígitos-só nunca é substring disso.
--
-- POR QUE RPC (E NÃO CONTORNO EM TYPESCRIPT)
--   `unaccent()` já está instalada em produção (schema public, v1.1) — não
--   é extensão nova, não precisa de autorização para instalar. O PostgREST
--   não deixa chamar função no lado esquerdo do filtro (`.or()` só aceita
--   `coluna.operador.valor`), então usar `unaccent()` de verdade exige SQL
--   no banco. A alternativa (gerar variantes acentuadas do termo em TS)
--   cobriria só as combinações adivinhadas e não usa o dicionário real.
--
-- POR QUE NENHUM ÍNDICE NOVO
--   `unaccent()` não é `immutable` (depende do dicionário) — o Postgres
--   recusa índice funcional direto sobre ela. `thb_alunos` tem 1.858 linhas
--   e 18 índices; um Seq Scan sobre a base por busca de admin (não é rota
--   de tráfego do aluno) já mede na casa de poucos milissegundos (a busca
--   por documento, medida em produção, deu 2,2 ms de Seq Scan). Não propor
--   índice sem `explain (analyze)` provando que o planner o usaria — regra
--   do projeto.
--
-- O QUE A RPC FAZ E O QUE CONTINUA NO TYPESCRIPT
--   `gps.buscar_alunos_admin` recebe as PALAVRAS já saneadas (o saneamento
--   contra injeção de filtro `saneParaFiltro` continua em `actions.ts`,
--   ANTES de qualquer interpolação) e o bloco de dígitos, e devolve um
--   conjunto amplo (teto 80, igual ao `.limit()` anterior) comparando:
--     - nome/e-mail por PALAVRA, com `unaccent(lower(...))` dos dois lados;
--     - telefone por DÍGITOS, com `regexp_replace(telefone,'\D','','g')`;
--     - documento por `ilike` frouxo (mantido; RG-4 do pedido trata CPF/CNPJ
--       exato à parte, em TS, via `gps.aluno_por_documento` já existente).
--   O ranqueamento por associação (nº de palavras casadas, nome vale mais)
--   CONTINUA em TypeScript — é lógica de exibição, não de banco, e não fazia
--   parte do que estava quebrado.
--
-- SEGURANÇA
--   SECURITY INVOKER (mesmo padrão de `gps.aluno_por_documento`, …131): quem
--   chama é sempre o admin logado por trás de `ehAdmin()` na Server Action, e
--   a RLS de `public.thb_alunos` continua valendo por cima — este SQL não
--   amplia quem lê o quê, só melhora o `WHERE`. `execute` revogado de
--   `public`/`anon` antes do `grant` a `authenticated` (mesmo antídoto ao
--   incidente do CNHF: nunca GRANT na frente da RLS).
--
-- NÃO APLICADA — só escrita para revisão. Não é destrutiva (função nova).

-- Escapa os curingas de LIKE (`%`, `_`) e a própria barra. Existe para a
-- RPC de busca não depender do saneamento do chamador -- ver o comentário
-- dentro dela. `immutable`: só manipula texto.
create or replace function gps.escapar_like(p_termo text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select replace(replace(replace(coalesce(p_termo, ''), '\', '\\'), '%', '\%'), '_', '\_');
$function$;

revoke execute on function gps.escapar_like(text) from public, anon;
grant  execute on function gps.escapar_like(text) to authenticated;

comment on function gps.escapar_like(text) is
  'Escapa %, _ e \ para uso literal em LIKE ... ESCAPE. Criada em 15/09/2026 por achado do pentest: gps.buscar_alunos_admin dependia de saneParaFiltro do chamador para nao aceitar curinga.';

create or replace function gps.buscar_alunos_admin(
  p_palavras text[],
  p_digitos text
)
 returns table (
   id uuid,
   nome text,
   email text,
   telefone text,
   turma_id bigint,
   plano text,
   status_acesso text,
   eh_socio boolean,
   documento text
 )
 language sql
 stable
 set search_path to 'public', 'gps'
as $function$
  select a.id, a.nome, a.email, a.telefone, a.turma_id, a.plano,
         a.status_acesso, a.eh_socio, a.documento
  from public.thb_alunos a
  where
    (
      p_palavras is not null and exists (
        select 1 from unnest(p_palavras) as p(termo)
        -- 🔴 `%`, `_` e `\` escapados AQUI DENTRO (achado MÉDIO do pentest,
        -- 15/09/2026). Hoje o único chamador sanea antes (saneParaFiltro, de
        -- um pentest anterior), mas uma função não pode depender da higiene
        -- de quem a chama: chamada direta com `p_palavras => '{"%"}'` casaria
        -- a tabela inteira, e `_` casaria qualquer caractere. Mesma lição de
        -- `emailParaIlike` (src/lib/texto.ts:69).
        where unaccent(lower(a.nome))
                like '%' || gps.escapar_like(unaccent(lower(p.termo))) || '%' escape '\'
           or unaccent(lower(coalesce(a.email, '')))
                like '%' || gps.escapar_like(unaccent(lower(p.termo))) || '%' escape '\'
      )
    )
    or (
      -- p_digitos é sempre dígitos-só (soDigitos no TS), mas o filtro abaixo
      -- reforça no SQL: se vier qualquer outra coisa, não casa nada.
      p_digitos is not null and length(p_digitos) >= 3
      and p_digitos ~ '^[0-9]+$' and (
        coalesce(a.documento, '') like '%' || p_digitos || '%'
        or regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g') like '%' || p_digitos || '%'
      )
    )
  order by a.nome nulls last, a.id
  limit 80
$function$;

comment on function gps.buscar_alunos_admin(text[], text) is
  'Busca em public.thb_alunos por nome/e-mail (sem acento, unaccent) e telefone (sem mascara, so digitos) -- consertando os dois bugs medidos em 15/09/2026 (20,2% da base com acento no nome; 285 telefones mascarados). Documento continua ilike frouxo aqui -- igualdade exata por CPF/CNPJ valido passa por gps.aluno_por_documento, chamada a parte pelo TypeScript. SECURITY INVOKER: RLS de thb_alunos vale para quem chama. Unico chamador: buscarAlunos (src/app/admin/actions.ts), atras de ehAdmin(). Sem indice novo: unaccent() nao e immutable (nao entra em indice funcional) e o Seq Scan em 1.858 linhas mede poucos ms.';

revoke execute on function gps.buscar_alunos_admin(text[], text) from public, anon;
grant execute on function gps.buscar_alunos_admin(text[], text) to authenticated;
