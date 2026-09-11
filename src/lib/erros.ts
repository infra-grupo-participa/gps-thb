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

  // 🔴 A frase que a trigger levanta HOJE (a de cima tem travessão e é a
  // versão antiga). O match é por igualdade exata, então sem esta linha a
  // recusa caía em "Sem permissão para esta ação." — genérica, sem caminho.
  // Só alcança quem a equipe JÁ confirmou; enquanto não confirma, a troca é
  // livre desde 11/09/2026.
  "A equipe está acompanhando este cliente. Para trocar, abra um chamado no Suporte.":
    "A equipe já assumiu este cliente. Para trocar, abra um chamado no Suporte.",

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

  // Guardas de PAPEL (mesmas RPCs). A frase é a de `42501`, escrita aqui para
  // não depender do SQLSTATE que a RPC escolheu.
  "apenas administradores": "Sem permissão para esta ação.",
  "sem permissao": "Sem permissão para esta ação.",

  // ── Anexo: variante que faltava (as outras já estão mapeadas acima) ────
  "tipo de anexo invalido": "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",

  // ── Config ausente (cron/RPC do Plantão, migrações ...170 a ...176) ────
  // Não é erro do usuário: é a chave da Resend faltando em `gps.config`. Quem
  // vê isto é a equipe, e a frase precisa dizer que ninguém recebeu o e-mail.
  "gps.config.resend_api_key nao configurada":
    "O envio de e-mail não está configurado no banco — a mensagem não foi enviada. Avise a equipe técnica.",
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
};

const GENERICA = "Não foi possível concluir agora. Tente de novo em instantes.";

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

  // Log SEMPRE: mesmo o erro previsto é sinal de fluxo travando na produção, e
  // é a única forma de descobrir que uma frase nova precisa entrar aqui.
  logErro(escopo, erro, { ...contexto, mapeado: Boolean(conhecida) });

  if (conhecida) return conhecida;
  if (bruto.startsWith(PREFIXO_DIREITO)) return bruto;
  return POR_CODIGO[erro.code ?? ""] ?? GENERICA;
}
