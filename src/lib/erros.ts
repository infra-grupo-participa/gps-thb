/**
 * Tradução de erro de banco para frase de tela — um lugar só.
 *
 * POR QUE EXISTE (CD6, 09/09/2026)
 *   As actions de cliente e de admin devolviam `{ erro: error.message }`, e a
 *   UI jogava isso num toast. O aluno lia
 *   `new row for relation "etapa1_clientes" violates check constraint
 *   "etapa1_clientes_contrato_url_check"`: frase que não ajuda quem está
 *   preenchendo a ficha e entrega nome de tabela, de coluna e de constraint a
 *   quem estiver testando o portal (SG2 do relatório do arquiteto).
 *
 *   O padrão certo já existia em `src/app/chamados/actions.ts` (`traduzirErro`
 *   + `logErro`): frase em português para a tela, detalhe cru para o log. Este
 *   módulo é esse padrão promovido a helper, para as duas actions não
 *   manterem duas tabelas de frases.
 *
 * 🔒 O detalhe NUNCA volta ao navegador. Ele vai para `logErro`, que redige
 *    e-mail e sequências longas de dígitos antes de emitir a linha JSON.
 *
 * ⚠️ NÃO é o lugar de mensagem de regra de negócio nova. Regra de negócio
 *    nasce no código que a conhece (validação da action) ou como `raise` na
 *    função do banco — e, nesse caso, entra em `FRASES_DO_BANCO` abaixo.
 */

import { logErro, type ContextoLog } from "@/lib/log";

/** Shape comum de `PostgrestError` e do erro de `rpc()`. */
export interface ErroDeBanco {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Mensagens que as próprias funções `gps.*` levantam (`raise exception ...
 * using errcode`). São texto NOSSO, escrito em português para a equipe — não
 * detalhe interno do Postgres. Passam adiante (algumas reescritas: "GPS" não
 * aparece para o usuário desde 07/2026).
 *
 * Mapa explícito, e não "deixa passar tudo que veio com errcode custom":
 * `42501` também é o código do `permission denied for table gps.membros` do
 * próprio Postgres, que não pode chegar à tela.
 */
/**
 * Frase única das guardas de "faltou argumento" das RPCs (`aluno nao
 * informado`, `cliente nao informado`, ...). Ver o bloco no fim do mapa.
 */
const FALTA_PARAMETRO =
  "Faltou um dado obrigatório para concluir esta ação. Recarregue a tela e tente de novo.";

const FRASES_DO_BANCO: Record<string, string> = {
  "Sem permissão.": "Sem permissão para esta ação.",
  // ⚠️ O "8" fica LITERAL aqui: a chave é o texto VERBATIM que as RPCs do
  // admin levantam (`length(trim(p_senha)) < 8`), e o mapa casa por igualdade
  // exata. Interpolar `SENHA_MINIMO` faria a chave deixar de casar no dia em
  // que o mínimo do TypeScript mudasse sem migração — o mínimo do banco é o
  // que está escrito na função. Ver `src/lib/senha-regras.ts`.
  "A senha precisa ter ao menos 8 caracteres.":
    "A senha precisa ter ao menos 8 caracteres.",
  "Aluno não encontrado.": "Aluno não encontrado.",
  "Este aluno não tem e-mail no cadastro.":
    "Este aluno não tem e-mail no cadastro.",
  'Não existe login com este e-mail. Use "Criar acesso".':
    'Não existe login com este e-mail. Use "Criar acesso".',
  "Esta conta é da equipe — não pode virar acesso de aluno.":
    "Esta conta é da equipe — não pode virar acesso de aluno.",
  "Este login já pertence a outro ambiente do GPS.":
    "Este login já pertence a outro ambiente do programa.",

  // --- gps.admin_definir_senha (migração ...118) ---
  'Este aluno ainda não tem login. Use "Criar acesso".':
    'Este aluno ainda não tem login. Use "Criar acesso".',
  "Esta conta é da equipe — a senha não pode ser trocada por aqui.":
    "Esta conta é da equipe — a senha não pode ser trocada por aqui.",

  // --- gps.admin_definir_senha_membro (migração ...132) ---
  "Membro não encontrado.": "Membro não encontrado.",
  "Este membro ainda não tem login.": "Este membro ainda não tem login.",
  "Você não pode trocar a própria senha por aqui — use o seu perfil.":
    "Você não pode trocar a própria senha por aqui — use o seu perfil.",
  "O login deste membro não existe mais.":
    "O login deste membro não existe mais.",

  // --- gps.admin_adicionar_socio (migração ...118) ---
  "Informe o e-mail do sócio.": "Informe o e-mail do sócio.",

  // --- gps.admin_adicionar_socio, guarda de login preexistente (...218) ---
  // O caminho normal NÃO passa por aqui: `adicionarSocioAluno` intercepta o
  // `P0003` e devolve `precisaConfirmar`, que abre o diálogo. Esta entrada é a
  // rede: qualquer outro chamador (ou uma tela futura) lê a frase inteira em
  // vez de "Não foi possível concluir agora" — `P0003` não está em POR_CODIGO
  // de propósito, porque no Postgres ele é `too_many_rows` e serve de sinal
  // custom só nas nossas funções.
  "Este e-mail já tem login no grupo. Confirme para trocar a senha dessa conta e adicioná-la como sócio.":
    "Este e-mail já tem login no grupo. Confirme para trocar a senha dessa conta e adicioná-la como sócio.",
  "Este ambiente não tem titular — crie o acesso do titular primeiro.":
    "Este ambiente não tem titular — crie o acesso do titular primeiro.",
  // ...220: sem esta chave o 22023 cairia em "Algum dado enviado está fora do formato".
  "Este e-mail é do titular deste ambiente — o sócio precisa de um e-mail próprio.":
    "Este e-mail é do titular deste ambiente — o sócio precisa de um e-mail próprio.",
  "Esta conta é da equipe — não pode virar sócio de um ambiente.":
    "Esta conta é da equipe — não pode virar sócio de um ambiente.",
  "Este e-mail já pertence a outro ambiente do GPS. Remova o acesso anterior antes.":
    "Este e-mail já pertence a outro ambiente do programa. Remova o acesso anterior antes.",

  // --- gps.admin_excluir_membro (migração ...131) ---
  'Este é o titular do ambiente. Para remover, use "Excluir acesso".':
    'Este é o titular do ambiente. Para remover, use "Excluir acesso".',
  "Você não pode excluir o próprio acesso.":
    "Você não pode excluir o próprio acesso.",
  "Esta conta é da equipe — não pode ser excluída por aqui.":
    "Esta conta é da equipe — não pode ser excluída por aqui.",

  // --- gps.admin_excluir_acesso (migração ...114) ---
  // Não é recusa: o ambiente FOI limpo e só o login sobreviveu. Trocar por uma
  // frase genérica faria o admin repetir a exclusão de um ambiente já vazio.
  "O login não pôde ser apagado: esta conta tem registros em outros sistemas do grupo. O ambiente do GPS foi limpo.":
    "O login não pôde ser apagado: esta conta tem registros em outros sistemas do grupo. O ambiente do programa foi limpo.",

  // ── Central de resolução (migrações ...152 a ...157) ──
  // Todas estas frases são `raise exception` NOSSO, escrito em português para
  // a equipe. Sem entrada aqui, elas cairiam no mapa por SQLSTATE e o admin
  // leria "Algum dado enviado está fora do formato aceito" no lugar da única
  // informação acionável da recusa.

  // gps.admin_definir_liberacao_etapa / gps.admin_reabrir_etapa
  "Escreva o motivo — ele fica no histórico deste aluno.":
    "Escreva o motivo — ele fica no histórico deste aluno.",
  "Escreva o motivo — a trilha deste aluno vai registrar.":
    "Escreva o motivo — a trilha deste aluno vai registrar.",
  "O motivo passa de 300 caracteres.": "O motivo passa de 300 caracteres.",
  "Etapa não encontrada.": "Etapa não encontrada.",
  "Este cadastro não tem ambiente no programa.":
    "Este cadastro não tem ambiente no programa.",
  "Esta etapa já segue a regra geral para este aluno.":
    "Esta etapa já segue a regra geral para este aluno.",
  "Não há tarefa concluída nesta etapa para reabrir.":
    "Não há tarefa concluída nesta etapa para reabrir.",

  // gps.admin_vincular_pessoa_membro
  "Cadastro não encontrado.": "Cadastro não encontrado.",
  "O titular não pode ficar sem cadastro — o ambiente é dele.":
    "O titular não pode ficar sem cadastro — o ambiente é dele.",
  "Este membro já está sem cadastro vinculado.":
    "Este membro já está sem cadastro vinculado.",
  'Para o titular, o cadastro é o dono do ambiente. Use "Trocar titular".':
    'Para o titular, o cadastro é o dono do ambiente. Use "Trocar titular".',
  "Este cadastro já está vinculado a outra pessoa do programa.":
    "Este cadastro já está vinculado a outra pessoa do programa.",
  "Este membro já está vinculado a este cadastro.":
    "Este membro já está vinculado a este cadastro.",

  // gps.admin_trocar_titular
  "Este membro não pertence a este ambiente.":
    "Este membro não pertence a este ambiente.",
  "Este membro já é o titular.": "Este membro já é o titular.",
  "O novo titular precisa ter login. Defina o acesso dele primeiro.":
    "O novo titular precisa ter login. Defina o acesso dele primeiro.",
  "Esta conta é da equipe — não pode ser titular de um ambiente.":
    "Esta conta é da equipe — não pode ser titular de um ambiente.",
  "Este ambiente não tem titular.": "Este ambiente não tem titular.",

  // gps.admin_mover_membro
  "O titular não pode ser movido — o ambiente é dele. Troque o titular primeiro.":
    "O titular não pode ser movido — o ambiente é dele. Troque o titular primeiro.",
  "Este membro já está neste ambiente.": "Este membro já está neste ambiente.",
  "O ambiente de destino não tem titular.":
    "O ambiente de destino não tem titular.",
  "Este login já participa do ambiente de destino.":
    "Este login já participa do ambiente de destino.",
  "O ambiente de destino já tem um membro sem login.":
    "O ambiente de destino já tem um membro sem login.",

  // gps.admin_financeiro_vincular / _desvincular
  "Este contrato não é candidato deste aluno (e-mail e CPF/CNPJ não coincidem, ou ele já pertence a outro cadastro).":
    "Este contrato não é candidato deste aluno (e-mail e CPF/CNPJ não coincidem, ou ele já pertence a outro cadastro).",
  "O contrato deixou de estar livre. Recarregue o diagnóstico.":
    "O contrato deixou de estar livre. Recarregue o diagnóstico.",
  "O contrato não está vinculado a este aluno.":
    "O contrato não está vinculado a este aluno.",

  // --- gps.admin_liberar_aluno_plantao (migração ...175) ---
  "Informe um e-mail válido.": "Informe um e-mail válido.",
  "Informe o nome.": "Informe o nome.",

  // ══════════════════════════════════════════════════════════════════════
  // Mega feature — onboarding, trava do favorito e menções (migrações
  // 20260910000200 a ...210). Todas estas frases são `raise exception` NOSSO,
  // escrito em português. Sem entrada aqui elas cairiam no mapa por SQLSTATE:
  // o aluno leria "Sem permissão para esta ação" quando tenta desmarcar a
  // estrela de um cliente acompanhado — e não saberia por quê nem o que fazer.
  // ══════════════════════════════════════════════════════════════════════

  // trg_etapa1_clientes_acompanhamento_travado (...203 + ...215)
  //
  // ⚠️ A PRIMEIRA é a recusa da ...215 e é a que o aluno vê no dia a dia: a
  // escolha do cliente acompanhado é UMA, e trocar passa pela equipe. Ela
  // dispara em dois caminhos (desmarcar a estrela e apagar o cliente marcado)
  // com a mesma frase de propósito: para o aluno é um problema só.
  "Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.":
    "Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.",

  // ⚠️ Esta ficou INALCANÇÁVEL com a ...215 (a recusa acima pega o mesmo caso
  // antes, e com uma frase que diz o que fazer). Continua aqui enquanto a
  // ...215 puder ser revertida — o custo é uma linha, e o custo de faltar é o
  // aluno lendo "Sem permissão para esta ação" sem saber por quê.
  "A equipe está acompanhando este cliente — só a equipe pode trocar o cliente acompanhado.":
    "A equipe está acompanhando este cliente. Para trocar, fale com a equipe pelo Suporte.",
  "A equipe está acompanhando este cliente — ele não pode ser excluído.":
    "A equipe está acompanhando este cliente, por isso ele não pode ser excluído. Fale com a equipe pelo Suporte.",
  "A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.":
    "A equipe está acompanhando este cliente, por isso a fase não volta para Prospecção. Fale com a equipe pelo Suporte.",
  "Só a equipe confirma ou libera o acompanhamento deste cliente.":
    "Só a equipe confirma ou libera o acompanhamento deste cliente.",

  // gps.selecao_entrevista_definir (migração 20260915000261) — os 5 clientes
  // da entrevista prévia. As duas primeiras são regra de negócio (teto e
  // pertencimento ao ambiente); a terceira é a invariante "o favorito é um
  // dos 5", com a mesma copy de "abra um chamado" usada acima para trocar o
  // favorito — para o aluno é o mesmo caminho.
  "Selecione no máximo 5 clientes para a entrevista.":
    "Selecione no máximo 5 clientes para a entrevista.",
  "Um dos clientes selecionados não pertence a este ambiente.":
    "Um dos clientes selecionados não pertence a este ambiente. Recarregue a lista e tente de novo.",
  "O cliente favorito da equipe precisa continuar entre os 5 selecionados. Para trocar o favorito, abra um chamado no Suporte.":
    "O cliente favorito da equipe precisa continuar entre os 5 selecionados. Para trocar o favorito, abra um chamado no Suporte.",

  // 🔴 A frase que a trigger levanta HOJE (a de cima tem travessão e é a
  // versão antiga). O match é por igualdade exata, então sem esta linha a
  // recusa caía em "Sem permissão para esta ação." — genérica, sem caminho.
  // Só alcança quem a equipe JÁ confirmou; enquanto não confirma, a troca é
  // livre desde 11/09/2026.
  "A equipe está acompanhando este cliente. Para trocar, abra um chamado no Suporte.":
    "A equipe já assumiu este cliente. Para trocar, abra um chamado no Suporte.",

  // gps.entrevista_gravar (migração 20260915000262) — entrevista prévia +
  // decisores. "cliente nao informado" JÁ mapeia para FALTA_PARAMETRO (bloco
  // acima); as entradas abaixo são regra de negócio própria desta RPC — a
  // última é a guarda da decisão (E) do plano: só grava quem está na fila
  // dos 5 selecionados pelo parceiro.
  "Escolha um resultado válido para a ligação.":
    "Escolha um resultado válido para a ligação.",
  "Perfil DISC inválido.": "Perfil DISC inválido.",
  "As observações passam de 2000 caracteres.":
    "As observações passam de 2000 caracteres.",
  "Este cliente não está entre os selecionados para a entrevista prévia.":
    "Este cliente não está entre os selecionados para a entrevista prévia.",
  "Lista de decisores inválida.": "Lista de decisores inválida.",
  "Todo decisor precisa de nome.": "Todo decisor precisa de nome.",
  "O nome do decisor passa de 200 caracteres.":
    "O nome do decisor passa de 200 caracteres.",
  "O papel do decisor no negócio passa de 200 caracteres.":
    "O papel do decisor no negócio passa de 200 caracteres.",

  // ═══ Fila não perde quem não atendeu (…266, 16/09/2026, decisões do
  // Marcio) — gps.entrevista_gravar (assinatura nova, 7 args) e
  // gps.fila_de_ligacoes (assinatura nova, 3 args) ═══
  // Frases NOSSAS (`raise exception`), copiadas caractere por caractere do
  // corpo da migração `…266` — match por igualdade EXATA. "Cliente não
  // encontrado." já está mapeada acima (mesmo texto de outra RPC).
  "Informe a data do retorno para remarcar.":
    "Informe a data do retorno para remarcar.",
  "A data do retorno precisa ser no futuro.":
    "A data do retorno precisa ser no futuro.",
  "A nota de qualidade vai de 1 a 5.": "A nota de qualidade vai de 1 a 5.",
  "Este cliente já teve a entrevista encerrada com um desfecho. Para reabrir, ajuste a ficha diretamente.":
    "Este cliente já teve a entrevista encerrada com um desfecho. Para reabrir, ajuste a ficha diretamente.",
  "Modo de fila inválido.": "Modo de fila inválido.",

  // ═══ Chamados: categoria + aprovação de troca (…250) ═══
  // As frases destas RPCs NÃO moram aqui, de propósito: ficam em `FRASES`
  // (`src/app/chamados/actions.ts`) e `FRASES_SOLICITACAO`
  // (`src/app/admin/chamados/actions.ts`), passadas por `frasesExtras`.
  //
  // É o padrão que o próprio `frasesExtras` documenta logo abaixo — copy de
  // UM domínio fica com o domínio. Eu havia duplicado as 18 frases aqui;
  // funcionava (o `frasesExtras` tem prioridade), mas criava dois lugares
  // para manter: mudar o texto de um `raise exception` e atualizar só um dos
  // mapas deixaria a divergência silenciosa, sem erro de compilação.

  // ═══ Feature Equipe — convite de sócio (…244/…246) ═══
  // 🔴 As 15 frases vieram de `pg_get_functiondef` do BANCO, não do arquivo
  // da migração (11/09/2026). O match é por igualdade EXATA — acento e
  // travessão inclusive —, então frase copiada à mão vira "Algum dado
  // enviado está fora do formato aceito".
  //
  // A primeira é a mais cara de errar: ela carrega a decisão do Marcio de
  // NÃO adotar login existente. Sem o mapa, o sócio que já tem conta no
  // grupo lia "formato aceito", tentava de novo, queimava o rate limit e
  // abria chamado — em vez de simplesmente entrar com a senha que já tem.
  "Este e-mail já tem acesso aos sistemas do grupo. Entre com a sua senha atual e fale com a equipe para concluir o vínculo.":
    "Este e-mail já tem acesso aos sistemas do Grupo Participa. Entre com a sua senha atual — e, se precisar de ajuda para concluir o vínculo, fale com a equipe pelo Suporte.",

  "Não confere. Confira o link e o e-mail.":
    "Não confere. Confira o link do convite e o e-mail — o convite só vale para o e-mail que o titular informou.",
  "Este recurso ainda não está disponível.":
    "O convite de sócio ainda não está liberado. Assim que abrir, o botão aparece na aba Equipe.",
  // "Informe o e-mail do sócio." já está no mapa (linha ~86, vem de
  // `gps.admin_adicionar_socio` com o texto idêntico) — chave repetida é
  // erro de compilação, não último-ganha.
  "Só o titular do ambiente pode convidar um sócio.":
    "Só o titular do ambiente pode convidar um sócio.",
  "Este ambiente já tem um sócio.":
    "Este ambiente já tem um sócio. Para trocar, fale com a equipe pelo Suporte.",
  // 🔴 A MESMA situação, frase DIFERENTE no banco (auditoria de 11/09/2026).
  // `socio_convite_criar` levanta a de cima; `socio_convite_aceitar` levanta
  // esta, com o sufixo. `traduzirErroBanco` casa por igualdade EXATA, então
  // sem esta linha o sócio que clica num convite tardio caía no genérico de
  // 23505 ("Já existe um registro com esses dados") — sem entender o que
  // houve nem com quem falar. As duas precisam coexistir.
  "Este ambiente já tem um sócio. Fale com a equipe pelo Suporte.":
    "Este ambiente já tem um sócio. Para trocar, fale com a equipe pelo Suporte.",
  "Já existe um convite em aberto para este ambiente.":
    "Já existe um convite em aberto. Revogue o atual antes de convidar outra pessoa.",
  "Este e-mail é o seu — o sócio precisa de um e-mail próprio.":
    "Este e-mail é o seu — o sócio precisa entrar com um e-mail próprio.",
  "Este e-mail é da equipe — não pode virar sócio de um ambiente.":
    "Este e-mail é de alguém da equipe do Grupo Participa e não pode entrar como sócio.",
  "Muitos convites enviados nas últimas 24 horas. Tente novamente mais tarde.":
    "Muitos convites enviados nas últimas 24 horas. Tente de novo amanhã ou fale com a equipe.",
  "Muitas tentativas. Aguarde 15 minutos e tente de novo.":
    "Muitas tentativas. Aguarde 15 minutos e tente de novo.",
  "Convite não encontrado.": "Convite não encontrado.",
  "Este convite já não está mais pendente.":
    "Este convite já foi aceito ou revogado.",
  // `Sem permissão.` e `A senha precisa ter ao menos 8 caracteres.` já estão
  // no mapa (vêm de outras RPCs com o mesmo texto) — não duplicar.

  // ═══ gps.entrada_pelo_codigo (/entrar) ═══
  // 🔴 Nenhuma destas estava mapeada: todas caíam em 22023 → "Algum dado
  // enviado está fora do formato aceito." — a frase que a Vanessa leu quando
  // o problema real era outro. Quem usa esta tela é justamente quem não
  // consegue entrar; uma recusa sem motivo ali vira chamado.
  "Código incorreto.": "Código incorreto. Confira o código que a equipe passou.",
  "Não encontramos este e-mail no Programa. Confira se é o mesmo da sua compra.":
    "Não encontramos este e-mail no Programa. Confira se é o mesmo da sua compra.",
  "Muitas tentativas deste dispositivo. Aguarde 15 minutos.":
    "Muitas tentativas deste dispositivo. Aguarde 15 minutos e tente de novo.",
  "Esta conta é da equipe — entre com a sua senha.":
    "Esta conta é da equipe — entre com a sua senha, não pelo código.",
  "Este caminho está indisponível no momento.":
    "Este caminho está indisponível no momento. Fale com a equipe.",

  // ═══ gps.resgate_concluir (/resgate) ═══
  // A recusa genérica de `resgate_iniciar` ("Não confere…") fica como está:
  // é anti-enumeração deliberada. Esta aqui não é — o link já foi validado.
  "Este link expirou. Recomece o resgate.":
    "Este link expirou. Recomece o resgate com o código e o seu e-mail.",

  // gps.admin_confirmar_acompanhamento / gps.admin_liberar_acompanhamento (...203)
  "Cliente não encontrado.": "Cliente não encontrado.",
  "Este cliente não é o cliente acompanhado deste aluno. Marque a estrela antes de confirmar.":
    "Este cliente não é o cliente acompanhado deste aluno. Marque a estrela antes de confirmar.",
  "A equipe já está acompanhando este cliente.":
    "A equipe já está acompanhando este cliente.",
  "A equipe não está acompanhando este cliente.":
    "A equipe não está acompanhando este cliente.",

  // gps.onboarding_* (...206)
  "Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.":
    "Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.",
  "Você já concluiu o questionário inicial.":
    "Você já concluiu o questionário inicial.",
  "Responda o questionário antes de concluir.":
    "Responda o questionário antes de concluir.",
  "Responda o questionário antes de anexar.":
    "Responda o questionário antes de anexar.",
  "Escolha de onde virá o seu cliente 1.":
    "Escolha de onde virá o seu cliente 1.",
  "Informe em que fase você está com este cliente.":
    "Informe em que fase você está com este cliente.",
  "Informe o nome do seu cliente 1.": "Informe o nome do seu cliente 1.",
  "Informe o valor dos honorários pactuados para seguir.":
    "Informe o valor dos honorários pactuados para seguir.",
  "Anexe o contrato de honorários assinado para seguir.":
    "Anexe o contrato de honorários assinado para seguir.",
  "Informe o valor dos honorários como número.":
    "Informe o valor dos honorários como número.",
  "Honorários: valor fora do limite permitido.":
    "Honorários: valor fora do limite permitido.",
  "Escolha um grau de relação da lista.":
    "Escolha um grau de relação da lista.",
  "O nome do cliente passa de 200 caracteres.":
    "O nome do cliente passa de 200 caracteres.",
  "Telefone inválido.": "Telefone inválido.",
  "A descrição passa de 4.000 caracteres.":
    "A descrição passa de 4.000 caracteres.",
  "O texto passa de 4.000 caracteres.": "O texto passa de 4.000 caracteres.",
  "Nome de arquivo inválido.": "Nome de arquivo inválido.",
  "Você já anexou 5 documentos.":
    "Você já anexou 5 documentos. Remova um antes de enviar outro.",
  "Anexo não encontrado.": "Anexo não encontrado.",
  "anexo nao encontrado":
    "O anexo não chegou ao servidor. Envie o arquivo de novo.",
  "anexo nao pertence a este ambiente":
    "Não foi possível anexar o arquivo. Tente enviar de novo.",
  "anexo em caminho invalido":
    "Não foi possível anexar o arquivo. Tente enviar de novo.",
  "nao foi possivel validar o anexo":
    "Não foi possível validar o anexo agora. Tente de novo em instantes.",
  "formato de anexo nao aceito":
    "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",
  "extensao do anexo nao confere com o tipo do arquivo":
    "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",
  "anexo maior que 5 MB": "Arquivo maior que 5 MB.",

  // gps.registrar_mencoes (...207)
  "Nota não encontrada.": "Nota não encontrada.",

  // ══════════════════════════════════════════════════════════════════════
  // Contrato do cliente como ANEXO (migração ...214)
  // ══════════════════════════════════════════════════════════════════════
  //
  // As frases de anexo (caminho inválido, objeto inexistente, MIME/tamanho,
  // extensão que não confere) são as MESMAS do questionário e já estão
  // mapeadas acima: mesmo bucket, mesma conferência, mesma RPC-molde. Não
  // duplicar aqui é o que garante que as duas telas digam a mesma coisa.
  "Este cliente não tem contrato anexado.": "Este cliente não tem contrato anexado.",

  // trg_etapa1_clientes_contrato_travado (...214). Quem lê isto é quem chamou
  // o PostgREST direto — a tela nunca escreve estas colunas.
  "O contrato do cliente é anexado pelo próprio portal — este campo não pode ser escrito direto.":
    "O contrato é anexado pelo próprio portal, no botão de anexar da ficha do cliente.",

  // ══════════════════════════════════════════════════════════════════════
  // Minutas da ficha do cliente (migração ...259)
  // ══════════════════════════════════════════════════════════════════════
  //
  // As frases de anexo (caminho inválido, objeto inexistente, MIME, tamanho)
  // já estão mapeadas acima — mesmo bucket-molde, mesma conferência. Só as
  // que são EXCLUSIVAS de `gps.cliente_minuta_anexar`/`_remover` entram aqui.
  // "minuta nao informada"/"Minuta não encontrada." não cai em
  // FALTA_PARAMETRO/"Cliente não encontrado.": são frases próprias porque o
  // parâmetro identifica a VERSÃO, não a ficha.
  "minuta nao informada":
    "Não foi possível identificar a minuta. Recarregue a página e tente de novo.",
  "Minuta não encontrada.": "Minuta não encontrada.",
  "Notas da minuta muito longas.": "As notas da minuta estão muito longas.",

  // Contexto obrigatório da minuta (decisão do Marcio, 17/09/2026, migração
  // ...273) — 4 frases, cada uma cobrindo um campo diferente. `traduzirErroBanco`
  // casa por igualdade EXATA: as 4 precisam coexistir, mesmo parecidas.
  "Descreva o caso para enviar a primeira minuta.":
    "Descreva o caso para enviar a primeira minuta.",
  "Informe o que já foi feito no caso.":
    "Informe o que já foi feito no caso.",
  "Informe o primeiro ponto em que você precisa de ajuda.":
    "Informe o primeiro ponto em que você precisa de ajuda.",
  "Informe o que foi alterado em relação à minuta anterior.":
    "Informe o que foi alterado em relação à minuta anterior.",

  // ══════════════════════════════════════════════════════════════════════
  // PLANTÃO DE DÚVIDAS (migrações ...180 a ...183)
  // ══════════════════════════════════════════════════════════════════════
  //
  // As actions do Plantão (`src/app/admin/plantao/inscritos-actions.ts` e
  // `alunos-actions.ts`) chamam `traduzirErroBanco` SEM `frasesExtras`, então
  // tudo o que não estivesse aqui virava "Algum dado enviado está fora do
  // formato aceito" — genérica onde havia uma frase pronta em português, que é
  // a única informação acionável da recusa (Auditor C, 10/09).
  "A edição do painel está temporariamente indisponível.":
    "A edição do painel está temporariamente indisponível.",
  "Plantão não encontrado.": "Plantão não encontrado.",
  "Inscrição não encontrada.": "Inscrição não encontrada.",
  "Inscrição não encontrada, ou já cancelada.":
    "Inscrição não encontrada, ou já cancelada.",
  "Esta inscrição já estava cancelada, ou não existe.":
    "Esta inscrição já estava cancelada, ou não existe.",
  "O motivo pode ter no máximo 300 caracteres.":
    "O motivo pode ter no máximo 300 caracteres.",
  "O nome pode ter no máximo 120 caracteres.":
    "O nome pode ter no máximo 120 caracteres.",
  // ⚠️ Verbatim da migração, COM as aspas em «Liberar aluno»: o mapa casa por
  // igualdade exata e a frase é o passo seguinte que o admin tem de dar.
  'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.':
    'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.',

  // ── Onboarding: recusas de FORMA do passo (...206) ─────────────────────
  //
  // ⚠️ `'Campo não reconhecido no questionário: %'` NÃO entra: `%` é
  // placeholder do `raise` e o texto que chega tem o nome do campo no lugar
  // dele — nenhuma chave por igualdade casaria. Ela cai em POR_CODIGO['22023'],
  // que é o comportamento certo: o aluno não escolhe nome de campo, quem vê
  // isso é quem chamou a RPC fora da tela.
  "passo fora da faixa":
    "Não foi possível salvar este passo. Recarregue a página e tente de novo.",
  "dados do passo em formato invalido":
    "Não foi possível salvar este passo. Recarregue a página e tente de novo.",

  // ══════════════════════════════════════════════════════════════════════
  // GUARDAS INTERNAS DE PARÂMETRO (RPCs ...152 a ...214)
  // ══════════════════════════════════════════════════════════════════════
  //
  // Minúsculas e sem acento de propósito: NÃO são copy, são a guarda de
  // "faltou argumento" no topo de cada RPC. Chegar aqui significa chamador
  // errado (ou chamada direta ao PostgREST), nunca erro de digitação do
  // usuário — por isso a frase de tela é a mesma para todas e não cita nome de
  // parâmetro. Mapeadas para o log marcar `mapeado: true` e a tela parar de
  // dizer "Algum dado enviado está fora do formato aceito", que sugere ao
  // admin conferir o que ele digitou.
  "aluno nao informado": FALTA_PARAMETRO,
  "aluno ou etapa nao informado": FALTA_PARAMETRO,
  "ambiente ou membro nao informado": FALTA_PARAMETRO,
  "anexo nao informado": FALTA_PARAMETRO,
  "cliente nao informado": FALTA_PARAMETRO,
  "contrato nao informado": FALTA_PARAMETRO,
  "membro nao informado": FALTA_PARAMETRO,
  "membro ou ambiente de destino nao informado": FALTA_PARAMETRO,
  "nota nao informada": FALTA_PARAMETRO,
  "proposta nao informada": FALTA_PARAMETRO,

  // Guardas de PAPEL (mesmas RPCs). A frase é a de `42501`, escrita aqui para
  // não depender do SQLSTATE que a RPC escolheu.
  "apenas administradores": "Sem permissão para esta ação.",
  "sem permissao": "Sem permissão para esta ação.",

  // ── Anexo: variante que faltava (as outras já estão mapeadas acima) ────
  "tipo de anexo invalido": "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",

  // ═══ gps.admin_trocar_email_login — troca de e-mail do login pelo admin
  // (…252, 11/09/2026) ═══
  // Frases NOSSAS (`raise exception`), copiadas caractere por caractere do
  // `raise` da função — o match é por igualdade EXATA, acento e travessão
  // inclusive. "Sem permissão.", "A senha precisa ter ao menos 8
  // caracteres.", "Membro não encontrado.", "Este membro ainda não tem
  // login.", "Informe um e-mail válido." e "O login deste membro não existe
  // mais." JÁ estão mapeadas acima (vêm de outras RPCs com o texto idêntico)
  // — chave repetida é erro de compilação, não último-ganha.
  "A troca de e-mail do login está desligada no momento.":
    "A troca de e-mail do login está desligada no momento.",
  "Esta conta é da equipe — o e-mail do login não pode ser trocado por aqui.":
    "Esta conta é da equipe — o e-mail do login não pode ser trocado por aqui.",
  "Este já é o e-mail do login.": "Este já é o e-mail do login.",
  "Este e-mail já está em uso por outra conta.":
    "Este e-mail já está em uso por outra conta.",
  "Esta conta tem papel em outro sistema do grupo. Confirme para trocar o e-mail em todos.":
    "Esta conta tem papel em outro sistema do grupo. Confirme para trocar o e-mail em todos.",

  // ── Config ausente (cron/RPC do Plantão, migrações ...170 a ...176) ────
  // Não é erro do usuário: é a chave da Resend faltando em `gps.config`. Quem
  // vê isto é a equipe, e a frase precisa dizer que ninguém recebeu o e-mail.
  "gps.config.resend_api_key nao configurada":
    "O envio de e-mail não está configurado no banco — a mensagem não foi enviada. Avise a equipe técnica.",

  // ═══ gps.socio_cadastro_gravar — onboarding obrigatório do sócio (…256,
  // 15/09/2026) ═══
  // `gravarCadastroSocio` já valida os 10 campos ANTES de chamar a RPC (para
  // o erro comum não gastar ida ao banco), mas a RPC é a fronteira real — sem
  // estas entradas, uma chamada que driblasse a validação do servidor (RPC
  // direta ao PostgREST) cairia no genérico de 22023/42501/P0002.
  "Faça login para preencher o seu cadastro.":
    "Faça login para preencher o seu cadastro.",
  "Não encontramos o seu vínculo com o programa.":
    "Não encontramos o seu vínculo com o programa. Fale com a equipe pelo Suporte.",
  "Este cadastro é só para o sócio convidado.":
    "Este cadastro é só para o sócio convidado.",
  "Este cadastro já foi preenchido.": "Este cadastro já foi preenchido.",
  "Não encontramos o e-mail do seu login.":
    "Não encontramos o e-mail do seu login. Fale com a equipe pelo Suporte.",
  "Escreva o nome completo.": "Escreva o nome completo.",
  "O nome passa de 120 caracteres.": "O nome passa de 120 caracteres.",
  "O nome não pode ter quebra de linha.":
    "O nome não pode ter quebra de linha.",
  "Informe o CPF.": "Informe o CPF.",
  "CPF inválido.": "CPF inválido.",
  "CEP inválido.": "CEP inválido.",
  "Informe a cidade.": "Informe a cidade.",
  "Escolha o estado na lista.": "Escolha o estado na lista.",
  "Informe o bairro.": "Informe o bairro.",
  "Informe o endereço.": "Informe o endereço.",
  "Informe o número.": "Informe o número.",
  "Informe o país.": "Informe o país.",

  // ═══ gps.config_definir — tela de interruptores em /admin (…260,
  // 15/09/2026) ═══
  // Frases NOSSAS (`raise exception`), copiadas caractere por caractere do
  // `raise` da função — o match é por igualdade EXATA. A allowlist já é
  // conferida em `alternarInterruptor` (`src/app/admin/config-actions.ts`)
  // antes de chamar a RPC, mas a RPC é a fronteira real (Server Action é
  // endpoint HTTP) — sem esta entrada, uma chamada direta ao PostgREST com
  // uma chave fora da allowlist cairia no genérico de 22023.
  "Este interruptor não existe.": "Este interruptor não existe.",

  // ═══ Reunião preliminar — proposta, aceite e contestação (…263,
  // 15/09/2026, decisões do Marcio) ═══
  // Frases NOSSAS (`raise exception`), copiadas caractere por caractere das
  // 3 RPCs (`gps.reuniao_propor_data`/`gps.reuniao_responder`/
  // `gps.reuniao_cancelar_proposta`) — match por igualdade EXATA. "Sem
  // permissão.", "Cliente não encontrado." e "O motivo passa de 300
  // caracteres." já estão mapeadas acima (mesmo texto de outras RPCs);
  // "cliente nao informado"/"proposta nao informada" caem em
  // FALTA_PARAMETRO, no bloco das guardas internas mais abaixo.
  "Informe a data proposta.": "Informe a data proposta.",
  "A reunião preliminar só pode ser proposta para o cliente que a equipe acompanha.":
    "A reunião preliminar só pode ser proposta para o cliente que a equipe acompanha.",
  "Já existe uma proposta de data aguardando resposta para este cliente.":
    "Já existe uma proposta de data aguardando resposta para este cliente.",
  "Escolha uma resposta válida.": "Escolha uma resposta válida.",
  "Proposta não encontrada.": "Proposta não encontrada.",
  "Esta proposta já foi respondida ou cancelada.":
    "Esta proposta já foi respondida ou cancelada.",
  "Escreva o motivo da contestação (ao menos 3 caracteres).":
    "Escreva o motivo da contestação (ao menos 3 caracteres).",
  // 🔴 Contestação 1 vez só (decisão do Marcio): sem teto vira loop de
  // reagendamento — foi "reunião que não acontece" que matou o agendamento
  // antigo em 08/2026. Sem esta linha, a recusa cairia no genérico de 22023
  // e o parceiro não saberia que o caminho certo é abrir um chamado.
  "Você já contestou uma proposta para este cliente. Para reagendar de novo, abra um chamado no Suporte.":
    "Você já contestou uma proposta para este cliente. Para reagendar de novo, abra um chamado no Suporte.",
  "Só é possível cancelar uma proposta ainda aguardando resposta.":
    "Só é possível cancelar uma proposta ainda aguardando resposta.",

  // ═══ Papel de operador + dossiê do cliente (…264, 15/09/2026, decisão do
  // Marcio: "um papel só — equipe da esteira") ═══
  // Frases NOSSAS (`raise exception`), copiadas caractere por caractere de
  // `gps.operador_definir` e `gps.dossie_do_cliente` — match por igualdade
  // EXATA. "Sem permissão." e "cliente nao informado" (este cai em
  // FALTA_PARAMETRO, bloco das guardas internas mais abaixo) já estão
  // mapeados; só as frases NOVAS entram aqui.
  "Login não encontrado.": "Login não encontrado.",
  "O nome passa de 200 caracteres.": "O nome passa de 200 caracteres.",

  // ═══ gps.admin_converter_titular_em_socio — a terceira porta da Central
  // (21/09/2026, chamado do Jonas) ═══
  // Frases NOSSAS (`raise exception`), copiadas caractere por caractere dos
  // `raise` da função — o match é por igualdade EXATA, acento e travessão
  // inclusive. "Sem permissão." e "Membro não encontrado." JÁ estão mapeadas
  // acima (mesmo texto de outras RPCs) — chave repetida é erro de compilação,
  // não último-ganha.
  //
  // 🔴 Sem estas entradas, as SEIS guardas da RPC (titular do próprio
  // ambiente · destino com titular · destino ≠ origem · origem sem outro
  // membro · confirmação nomeada) cairiam todas no genérico de 22023
  // ("Algum dado enviado está fora do formato aceito") — e o admin leria a
  // mesma frase inútil para seis situações diferentes, numa ação que copia
  // clientes e não se desfaz sozinha. O diálogo já mostra o `impedimento` da
  // prévia antes do clique; isto aqui é a rede para a corrida entre conferir
  // e confirmar, e para qualquer chamada direta ao PostgREST.
  // ⚠️ "O ambiente de destino não tem titular." NÃO entra aqui: já está
  // mapeada mais acima, vinda de `gps.admin_mover_membro`, com texto
  // idêntico. Chave repetida é erro de compilação neste arquivo (TS1117).
  // ⚠️ "Ambiente de destino não encontrado." NÃO precisa de entrada: nenhuma
  // das duas RPCs a levanta como exceção — ela só aparece como `impedimento`
  // da PRÉVIA, que a tela escreve direto, sem passar por `traduzirErroBanco`.
  // (Um comentário anterior afirmava que ela já estava mapeada acima; não
  // estava, e a afirmação foi corrigida no veredito de 21/09/2026.)
  // 🔴 CHAVES CONFERIDAS CONTRA O `raise exception` DA RPC APLICADA EM
  // PRODUÇÃO (21/09/2026), não contra o que a tela imaginava. Uma versão
  // anterior deste bloco tinha quatro frases inventadas ("Esta pessoa não é
  // titular de um ambiente próprio.", "O nome digitado não confere…") que não
  // existem em SQL nenhum: casavam com nada e as recusas caíam no genérico.
  // ⚠️ Travessão é EM DASH (—, U+2014) e as aspas em "Mover membro" são
  // retas (U+0022) — é assim que a RPC emite. Normalizar qualquer um dos dois
  // quebra a igualdade exata.
  "Este membro já é sócio — para mudá-lo de ambiente use \"Mover membro\".":
    "Este membro já é sócio. Para mudá-lo de ambiente use \"Mover membro\".",
  "Este membro é titular de um ambiente que não é o cadastro dele. Use \"Trocar titular\" antes.":
    "Este membro é titular de um ambiente que não é o cadastro dele — converter aqui deixaria o ambiente alheio sem dono. Use \"Trocar titular\" antes.",
  "O ambiente de destino é o mesmo de origem.":
    "O ambiente de destino é o mesmo da origem — não há o que converter.",
  "O ambiente de origem tem outro membro. Resolva o outro membro antes de converter este.":
    "O ambiente de origem tem outro membro. Mova ou remova esse membro antes: converter deixaria o ambiente dele sem titular.",
  "O ambiente de origem está sem nome no cadastro — não é possível confirmar a conversão. Corrija o nome antes.":
    "O ambiente de origem está sem nome no cadastro, então não há o que digitar na confirmação. Corrija o nome do cadastro antes de converter.",
  "Nenhum acesso encontrado para este cadastro.":
    "Este cadastro não tem acesso ao programa. Crie o acesso antes de convertê-lo em sócio.",
  // 🔴 Guarda de parâmetro das DUAS RPCs de conversão, com acento e inicial
  // maiúscula — não confundir com as chaves minúsculas sem acento do bloco
  // de "chamador errado" mais abaixo. Sem esta entrada a recusa cai no
  // genérico de 22023 ("Algum dado enviado está fora do formato aceito").
  "Membro ou ambiente de destino não informado.": FALTA_PARAMETRO,
  "Este cadastro tem mais de um acesso no programa — resolva a duplicidade antes de converter.":
    "Este cadastro tem mais de um acesso no programa. Resolva a duplicidade antes de converter — escolher um deles em silêncio moveria os clientes da pessoa errada.",

  // Guardas internas de parâmetro de gps.operador_definir — mesma família de
  // "aluno nao informado" etc. (bloco abaixo), minúsculas e sem acento de
  // propósito: chegar aqui significa chamador errado, nunca erro de digitação
  // do usuário.
  "usuario nao informado": FALTA_PARAMETRO,
  // ⚠️ As chaves minúsculas sem acento acima ("membro nao informado",
  // "membro ou ambiente de destino nao informado") vêm de OUTRAS RPCs e NÃO
  // cobrem `gps.admin_converter_titular_em_socio`: ela emite
  // "Membro ou ambiente de destino não informado." com acento e maiúscula, e
  // `FRASES_DO_BANCO` casa por igualdade EXATA. A entrada dela está no bloco
  // da conversão, acima. (Um comentário anterior afirmava a cobertura; era
  // falso — corrigido no veredito de 21/09/2026.)
  "confirmacao nao informada": FALTA_PARAMETRO,
  "ativo nao informado": FALTA_PARAMETRO,
};

/**
 * `raise exception 'Sem direito ao acesso: %', motivo` — o motivo vem de
 * `gps.admin_direito_ao_acesso` e é a única informação acionável da recusa.
 * Só aparece em tela de admin.
 */
const PREFIXO_DIREITO = "Sem direito ao acesso:";

/** Códigos SQLSTATE que a UI sabe explicar sem citar tabela nem constraint. */
const POR_CODIGO: Record<string, string> = {
  // unique_violation
  "23505": "Já existe um registro com esses dados.",
  // check_violation — algum campo não passou na regra da coluna
  "23514": "Algum campo está fora do formato aceito. Revise e tente de novo.",
  // insufficient_privilege (RLS, grant, guarda de admin)
  "42501": "Sem permissão para esta ação.",
  // invalid_parameter_value — as funções `gps.*` usam para argumento inválido
  "22023": "Algum dado enviado está fora do formato aceito.",
  // no_data_found — as funções `gps.*` usam para "não achei o registro"
  P0002: "Registro não encontrado.",
  // 🔴 Confirmação NOMEADA recusada. A frase do banco é DINÂMICA
  // (`'... origem: %', v_nome_origem`), então nunca casa por igualdade exata
  // em FRASES_DO_BANCO — só o código a alcança. Usado por
  // `gps.admin_converter_titular_em_socio` e por `gps.admin_excluir_acesso`
  // (que o emite com as contagens do ambiente no texto).
  P0004:
    "O nome digitado não confere com o do ambiente. Copie o nome exatamente como aparece na tela.",
  // cardinality_violation — mais de uma linha onde só podia haver uma.
  // `gps.admin_converter_titular_em_socio` usa quando o cadastro resolve para
  // dois membros: recusar é o certo, escolher um moveria dado da pessoa errada.
  "21000":
    "Este cadastro tem mais de um acesso no programa. Resolva a duplicidade antes de continuar.",
};

/**
 * Tradução por NOME DE CONSTRAINT — mecanismo separado de `FRASES_DO_BANCO` de
 * propósito (Central de resolução, 23/09/2026).
 *
 * `FRASES_DO_BANCO` casa por IGUALDADE EXATA da mensagem inteira. O PostgREST
 * não devolve uma mensagem fixa para violação de CHECK: ele devolve algo como
 * `new row for relation "etapa1_clientes" violates check constraint
 * "chk_etapa1_clientes_favorito_e_selecionado"`, com o nome da TABELA
 * embutido — igualdade exata nunca casaria de forma estável. O nome da
 * CONSTRAINT, esse sim é estável, e por isso o casamento aqui é por
 * SUBSTRING do nome, não da frase inteira.
 *
 * ⚠️ Isto NÃO ensina `erros.ts` a regra de negócio "quem pode ser estrela".
 * A verdade continua só no CHECK (`chk_etapa1_clientes_favorito_e_selecionado`
 * em `gps.etapa1_clientes`, migração 20260915000261: só vira estrela quem já
 * está entre os 5 selecionados da Entrevista Prévia). Este mapa só TRADUZ o
 * nome que o banco já devolve — se o CHECK mudar de regra sem mudar de nome,
 * a frase abaixo é que fica desatualizada, não o inverso.
 *
 * Consultado ANTES de `POR_CODIGO["23514"]`: sem esta entrada, a recusa caía
 * no genérico "Algum campo está fora do formato aceito. Revise e tente de
 * novo." — que não existe campo errado nenhum, e o parceiro não tinha como
 * saber o que fazer.
 */
const POR_CONSTRAINT: Array<{ contem: string; frase: string }> = [
  {
    contem: "chk_etapa1_clientes_favorito_e_selecionado",
    frase:
      "Este cliente precisa estar entre os 5 escolhidos para a Entrevista Prévia antes de ser marcado como cliente da equipe.",
  },
];

const GENERICA = "Não foi possível concluir agora. Tente de novo em instantes.";

/**
 * Frase única para quando `getContextoSessao()` lança `SessaoIndeterminadaError`
 * (16/09/2026, `src/lib/auth.ts`) — a consulta que resolve o papel falhou, o
 * que não é o mesmo que "sem permissão" ou "sem acesso". Toda Server Action
 * que chama `getContextoSessao()` usa esta frase no `catch` estreito
 * (`if (!ehSessaoIndeterminada(e)) throw e;`), em vez de inventar variação.
 */
export const MSG_SESSAO_INDETERMINADA =
  "Não conseguimos confirmar seu acesso agora. Atualize a página e tente de novo.";

/**
 * Frase em português para a tela; o erro cru vai para o log com `contexto`.
 *
 * @param escopo identificador da operação no log (ex.: `"atualizarCliente"`).
 * @param frasesExtras frases de UM domínio, consultadas ANTES do mapa comum.
 *   Existe para `src/app/chamados/actions.ts`, cujas RPCs levantam mensagem
 *   sem acento e específica do chamado ("voce ja tem 5 chamados em aberto") —
 *   copy que não faz sentido no mapa compartilhado. O que ficou aqui é o que
 *   estava duplicado: ler `error.message`, o mapa por SQLSTATE e o `logErro`.
 */
export function traduzirErroBanco(
  escopo: string,
  erro: ErroDeBanco,
  contexto?: ContextoLog,
  frasesExtras?: Record<string, string>,
): string {
  const bruto = (erro.message ?? "").trim();
  const conhecida = frasesExtras?.[bruto] ?? FRASES_DO_BANCO[bruto];

  // Nome de constraint: casamento por SUBSTRING, não por igualdade da frase
  // inteira — ver o comentário de `POR_CONSTRAINT`. Procura em `message` e em
  // `details`, porque o PostgREST varia onde coloca o texto da violação.
  const textoParaConstraint = `${erro.message ?? ""} ${erro.details ?? ""}`;
  const porConstraint = POR_CONSTRAINT.find((c) =>
    textoParaConstraint.includes(c.contem),
  );

  // Log SEMPRE: mesmo o erro previsto é sinal de fluxo travando na produção, e
  // é a única forma de descobrir que uma frase nova precisa entrar aqui.
  logErro(escopo, erro, {
    ...contexto,
    mapeado: Boolean(conhecida) || Boolean(porConstraint),
  });

  if (conhecida) return conhecida;
  if (porConstraint) return porConstraint.frase;
  if (bruto.startsWith(PREFIXO_DIREITO)) return bruto;
  return POR_CODIGO[erro.code ?? ""] ?? GENERICA;
}
