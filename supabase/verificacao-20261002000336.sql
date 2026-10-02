-- ═══════════════════════════════════════════════════════════════════════════
-- Entrevista Prévia sem DISC (card ClickUp 86akrypfm, 02/10/2026)
-- SÓ LEITURA. Nenhuma linha deste arquivo escreve. Rodar como postgres.
--
-- O que mudou no código (sem migration): `calcularDisc`
-- (src/lib/entrevista-previa-calculo.ts) volta a somar o peso das perguntas
-- APOSENTADAS que a entrevista respondeu. De 29/09 (96c737d) a 02/10 elas
-- ficavam fora, e entrevista começada no 2.0 e concluída no 3.0 (pulando as
-- perguntas novas) gravava perfil_disc = null + "Perfil DISC não definido".
--
-- 🔑 `perfil_disc` só é gravado na CONCLUSÃO (`entrevista_previa_concluir`).
-- Rascunho (concluida_em null) não tem letra por definição — não é este bug.
-- Entrevista concluída no 2.0 (antes de 29/09) usou o cálculo 2.0, que já
-- somava tudo — também não é este bug. O D1 separa os três grupos.
--
-- Fluxo do recálculo (nada aplicado por quem escreveu):
--   1. D1/D2/D3 abaixo → conferir quantos são corrigíveis.
--      ANTES/DEPOIS e o explain; só então trocar ROLLBACK por COMMIT.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── D1. Contagem por grupo (medido em 02/10: 38 entrevistas, as 16 sem DISC são TODAS rascunhos; 0 concluídas sem DISC → nada a recalcular) ─────────────────────────────────
-- antigas_formato = tem ao menos 1 chave de pergunta aposentada (as 20).
-- corrigiveis     = concluída, sem letra, e com chave de aposentada QUE TEM
--                   PESO (16 das 20). O script decide a letra exata.
-- sem_disc_3_0    = concluída, sem letra, sem aposentada com peso: o parceiro
--                   pulou as 5 perguntas que pesam — o recálculo NÃO resolve.
select count(*)                                                                  as total,
       count(*) filter (where e.concluida_em is null)                            as rascunhos,
       count(*) filter (where e.perfil_disc is null)                             as sem_disc,
       count(*) filter (where e.perfil_disc is null and e.concluida_em is null)  as sem_disc_rascunho,
       count(*) filter (where e.perfil_disc is null and e.concluida_em is not null) as sem_disc_concluida,
       count(*) filter (where e.respostas ?| array['urgencia','composicao','imoveis_heranca','imoveis_alugados','pro_labore','inventario_familia','risco_atividade','consulta_terceiro','quem_bate_martelo','estilo_decisao','o_que_convence','reacao_preco','lidar_com_erro','delega','mudanca','confianca_equipe','disposicao_reuniao','decide_investimento','temperatura','objecao_principal'])
                                                                                 as antigas_formato,
       count(*) filter (where e.perfil_disc is null and e.concluida_em is not null
                          and e.respostas ?| array['urgencia','pro_labore','inventario_familia','risco_atividade','consulta_terceiro','quem_bate_martelo','estilo_decisao','o_que_convence','reacao_preco','lidar_com_erro','delega','mudanca','confianca_equipe','disposicao_reuniao','decide_investimento','objecao_principal'])
                                                                                 as corrigiveis,
       count(*) filter (where e.perfil_disc is null and e.concluida_em is not null
                          and not e.respostas ?| array['urgencia','pro_labore','inventario_familia','risco_atividade','consulta_terceiro','quem_bate_martelo','estilo_decisao','o_que_convence','reacao_preco','lidar_com_erro','delega','mudanca','confianca_equipe','disposicao_reuniao','decide_investimento','objecao_principal'])
                                                                                 as sem_disc_3_0,
       -- 96c737d é de 29/09 10:41 -03; o deploy é automático no push (hora exata não medida).
       count(*) filter (where e.concluida_em >= timestamptz '2026-09-29 13:41:58+00') as concluidas_apos_3_0
  from gps.entrevista_previa e;

-- ── D2. Linha a linha das sem DISC (sem PII: só ids de opção; frases fora) ──
select e.id, e.cliente_id, e.criado_em, e.concluida_em,
       (e.respostas ?| array['urgencia','pro_labore','inventario_familia','risco_atividade','consulta_terceiro','quem_bate_martelo','estilo_decisao','o_que_convence','reacao_preco','lidar_com_erro','delega','mudanca','confianca_equipe','disposicao_reuniao','decide_investimento','objecao_principal']) as tem_aposentada_com_peso,
       (e.respostas ?| array['motivo_busca','criterio_valor','processamento','ritmo_conversa','obs_comportamento'])                                                                                                                       as tem_ativa_com_peso,
       (select string_agg(k, ',' order by k) from jsonb_object_keys(e.respostas) k where k <> 'frases_cliente') as chaves,
       c.perfil_disc as ficha_letra,
       left(c.disc_relacionamento, 50) as ficha_texto
  from gps.entrevista_previa e
  join gps.etapa1_clientes c on c.id = e.cliente_id
 where e.perfil_disc is null
 order by e.concluida_em nulls last, e.criado_em;

-- ── D3. Se os "38" forem SESSÕES de EP (tipo 1), e não linhas da tabela ───
-- Outra população: sessão concluída pela doutora sem preencher o DISC.
-- O recálculo deste card não mexe nela.
select s.estado,
       count(*)                                     as sessoes_ep,
       count(*) filter (where c.perfil_disc is null) as cliente_sem_disc,
       count(*) filter (where c.perfil_disc is null and exists (
                 select 1 from gps.entrevista_previa e
                  where e.cliente_id = s.cliente_id and e.concluida_em is not null)) as sem_disc_com_ep_concluida
  from gps.sessao_agendamentos s
  join gps.etapa1_clientes c on c.id = s.cliente_id
 where s.tipo_id = 1
 group by s.estado order by s.estado;
