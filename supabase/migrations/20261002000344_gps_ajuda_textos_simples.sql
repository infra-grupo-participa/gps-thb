-- ═══════════════════════════════════════════════════════════════════════════
-- 20261002000344 — Central de ajuda: textos simples (pedido do João, 02/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O QUE MUDA: reescreve titulo e corpo dos 12 artigos do seed da …342 para um
--   público mais velho, com pouca prática em tecnologia: título em forma de
--   pergunta, corpo curto (resposta em 1 frase + passos numerados com o nome
--   exato do botão/aba + linha final de saída). Texto puro, sem markdown.
--   Cada passo é um parágrafo próprio (o front junta linha simples com
--   espaço; só linha em branco separa parágrafo).
--   NÃO mexe em rotas, categorias, palavras_chave, sinonimos, ordem, ativo.
--
-- POR QUE: "tudo tem que ser bem intuitivo e não precisa encher com palavras,
--   seja direto mas didático" (João). Os textos antigos tinham 120–200
--   palavras e explicavam o sistema, não a tarefa.
--
-- NÃO SOBRESCREVE EDIÇÃO DA EQUIPE: `where atualizado_em = criado_em`. A
--   trigger gps.touch_atualizado_em move `atualizado_em` em todo update (inclusive
--   neste), então artigo editado pelo admin — ou já reescrito por esta migration —
--   fica de fora; reaplicar é no-op. A coluna gerada `busca` se recalcula sozinha.
--
-- REVERSÃO: o texto anterior está no seed da …342 (insert do passo 9). Para
--   voltar, um `update gps.ajuda_artigos set titulo=…, corpo=… where id=…` com
--   o texto de lá (ou editar pelo admin, em /admin/ajuda).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- 01 — cadastro de clientes
update gps.ajuda_artigos
   set titulo = 'Como cadastro meus clientes?',
       corpo  = $t$Cadastre na aba "Clientes", um por um ou vários de uma vez.

1. Um por um: clique em "Adicionar cliente", escreva nome e telefone com DDD e escolha a fase e o grau de relação.

2. Depois, clique em "Salvar e adicionar outro" ou em "Criar e abrir a ficha".

3. Vários de uma vez: clique em "Colar lista" e cole uma pessoa por linha, com nome e telefone. Cabem até 50 por vez.

Só conta para os 30 quem tem nome e telefone.

Não deu certo? Abra um chamado na aba Suporte.$t$
 where id = 'a7a00000-0000-4000-8000-000000000001'
   and atualizado_em = criado_em;

-- 02 — modelos de mensagem / passo travado
update gps.ajuda_artigos
   set titulo = 'Por que não consigo concluir o passo das mensagens?',
       corpo  = $t$Os 3 modelos já estão abertos para você copiar, mas o passo "Enviar a sequência de 3 mensagens" só libera com os 30 clientes na lista.

1. Abra a aba "Clientes".

2. Cadastre até chegar a 30 clientes, cada um com nome e telefone.

3. Volte à Etapa 01. O passo "Listar 30 clientes potenciais" conclui sozinho na 30ª ficha.

Tem 30 nomes e continua travado? Veja quais fichas estão sem telefone.

Não deu certo? Abra um chamado na aba Suporte.$t$
 where id = 'a7a00000-0000-4000-8000-000000000002'
   and atualizado_em = criado_em;

-- 03 — estrela
update gps.ajuda_artigos
   set titulo = 'Para que serve a estrela do cliente?',
       corpo  = $t$A estrela escolhe o único cliente que a equipe acompanha com você até a execução da holding.

1. Na aba "Clientes", clique na estrela do cliente.

2. Leia o aviso e clique em "Escolher este cliente". Os passos 4 a 8 da Etapa 01 são liberados.

Você mesmo troca enquanto ele estiver em Prospecção e sem reunião preliminar marcada. Depois disso, abra um chamado na aba Suporte, escolha "Troca de cliente" e diga quem fica no lugar.$t$
 where id = 'a7a00000-0000-4000-8000-000000000003'
   and atualizado_em = criado_em;

-- 04 — grau de relação
update gps.ajuda_artigos
   set titulo = 'O que é o grau de relação?',
       corpo  = $t$É como você conhece o cliente: Parente, Amigo, Conhecido, Indicação, Cliente atual, Lead ou "Eu mesmo (minha família)".

1. Na aba "Clientes", escolha o grau ao cadastrar ou depois, na ficha do cliente.

2. Sem escolha, fica "Não informado".

"Eu mesmo (minha família)" é para quando o cliente é você. O grau não muda a contagem dos 30: contam nome e telefone. No "Salvar e adicionar outro", o grau escolhido fica guardado para o próximo.

Não deu certo? Abra um chamado na aba Suporte.$t$
 where id = 'a7a00000-0000-4000-8000-000000000004'
   and atualizado_em = criado_em;

-- 05 — chamado
update gps.ajuda_artigos
   set titulo = 'Como abro um chamado e vejo a resposta?',
       corpo  = $t$Use a aba "Suporte".

1. Clique em "Abrir chamado".

2. Escreva um assunto curto e conte o que tentou, o que aconteceu e em qual tela. Se ajudar, anexe um print ou PDF.

3. Quando a opção aparecer, escolha a categoria: Dificuldade no sistema, Troca de cliente, Troca de sócio ou Outros.

A resposta aparece dentro do chamado, na aba "Suporte" (com um selo numerado), e chega por e-mail. Para continuar a conversa, responda ali. Resolvido? Clique em "Fechar chamado". Pode ter até 5 chamados abertos.$t$
 where id = 'a7a00000-0000-4000-8000-000000000005'
   and atualizado_em = criado_em;

-- 06 — senha
update gps.ajuda_artigos
   set titulo = 'Esqueci a senha. E agora?',
       corpo  = $t$Na tela de entrada, escolha um caminho:

1. "Receber um link por e-mail": crie a senha nova pelo link. Pode demorar e cair no spam. Vencido? Peça outro.

2. "Recuperar com e-mail e CPF": informe o código de acesso, o e-mail e o CPF e crie a senha na hora.

3. Com o código de acesso da equipe: digite o e-mail e, no lugar da senha, o código. Depois, em "Sua conta", "Seu perfil", "Trocar senha".

A senha nova vale para todos os portais do Grupo Participa.

Não deu certo? Fale com a secretaria pelo WhatsApp do Programa.$t$
 where id = 'a7a00000-0000-4000-8000-000000000006'
   and atualizado_em = criado_em;

-- 07 — sócio
update gps.ajuda_artigos
   set titulo = 'Como dou acesso ao meu sócio?',
       corpo  = $t$O sócio entra no mesmo ambiente que você. Só o titular convida.

1. Abra o menu "Sua conta" e vá em "Equipe".

2. Escreva o e-mail do sócio e clique em "Convidar meu sócio".

O convite vale 7 dias. Venceu? Use "Reenviar". Se o e-mail não sair, a tela mostra o link para você copiar e mandar. Sem o botão de convite? Ainda não foi liberado para o seu ambiente, e a tela avisa.

Para trocar o sócio, abra um chamado na aba Suporte, categoria "Troca de sócio".$t$
 where id = 'a7a00000-0000-4000-8000-000000000007'
   and atualizado_em = criado_em;

-- 08 — plantão
update gps.ajuda_artigos
   set titulo = 'Como me inscrevo no Plantão de dúvidas?',
       corpo  = $t$Na aba "Plantão", escolha o dia e clique em "Inscrever". Não precisa informar nome nem e-mail.

1. Abra a aba "Plantão" e escolha o dia.

2. Clique em "Inscrever" no horário desejado.

Prazo: até as 12h (meio-dia) do dia anterior. Um plantão por vez. Depois de cada plantão, o seguinte fica de fora: com plantões na segunda, terça e quarta, quem foi na segunda escolhe a quarta. A tela diz quando você pode voltar. Horários de Brasília.

Não deu certo? Abra um chamado na aba Suporte.$t$
 where id = 'a7a00000-0000-4000-8000-000000000008'
   and atualizado_em = criado_em;

-- 09 — sessões
update gps.ajuda_artigos
   set titulo = 'Como marco uma sessão com a equipe jurídica?',
       corpo  = $t$Na aba "Sessões" você marca a Entrevista Prévia e a Reunião Preliminar.

1. Antes, na aba "Clientes", marque a estrela do cliente que a equipe acompanha.

2. Abra a aba "Sessões" e escolha um horário da grade. Sem horário aberto, a tela avisa.

3. Clique no botão que começa com "Marcar" e confirme. O link da sala aparece na sessão.

Para cancelar, clique em "Cancelar sessão" até 24 horas antes. Depois disso, fale com a equipe na aba Suporte.$t$
 where id = 'a7a00000-0000-4000-8000-000000000009'
   and atualizado_em = criado_em;

-- 10 — pasta do Drive
update gps.ajuda_artigos
   set titulo = 'Como abro a minha pasta do Drive?',
       corpo  = $t$Clique na aba "Pasta": ela abre a pasta do seu ambiente no Google Drive, em outra aba.

1. Se a tela pedir o link, cole o link da pasta e clique em "Salvar link". Ele começa com https://drive.google.com/ ou https://docs.google.com/.

2. Se você mesmo criou a pasta, clique antes em "Compartilhar" no Drive e dê acesso de editor aos e-mails da equipe que aparecem na tela.

3. Pediu permissão? Confira se está na conta Google certa.

Conta certa? Abra um chamado na aba Suporte com o e-mail dessa conta Google.$t$
 where id = 'a7a00000-0000-4000-8000-000000000010'
   and atualizado_em = criado_em;

-- 11 — minuta
update gps.ajuda_artigos
   set titulo = 'Como anexo a minuta do contrato?',
       corpo  = $t$Na ficha do cliente, aba "Fechamento da Holding", seção Minutas. Só PDF (exporte o Word antes), até 5 MB.

1. Primeira minuta: preencha "Descreva o caso", "O que foi feito" e "Em que ponto você precisa de ajuda primeiro?". Nas seguintes: "O que mudou em relação à minuta anterior?". Até 2.000 caracteres cada.

2. Clique em "Escolher arquivo" (depois, "Enviar nova versão").

3. Deixe em vermelho o que mudou. Envie uma minuta por vez; as anteriores ficam na lista.

Não deu certo? Abra um chamado na aba Suporte.$t$
 where id = 'a7a00000-0000-4000-8000-000000000011'
   and atualizado_em = criado_em;

-- 12 — portal × área de membros
update gps.ajuda_artigos
   set titulo = 'Qual a diferença entre este portal e a área de membros?',
       corpo  = $t$Este portal é do Programa: clientes, tarefas, Suporte, Sessões, Plantão e Pasta. As aulas gravadas ficam na área de membros (membros.holdingmasters.com.br), em outra plataforma.

1. Para assistir a uma aula, abra a aba "Materiais" ou o link da tarefa. A área de membros abre em outra aba.

2. Material de etapa ainda não liberada aparece sem link.

Não consegue entrar na área de membros? Abra um chamado na aba Suporte ou fale com a secretaria.$t$
 where id = 'a7a00000-0000-4000-8000-000000000012'
   and atualizado_em = criado_em;

commit;
