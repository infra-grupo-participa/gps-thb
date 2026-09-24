import type { NavItem } from "@/components/nav-tabs";
import type { ContextoSessao } from "@/lib/auth";

/**
 * Abas de navegação do aluno. basePath = "" para o aluno logado;
 * "/admin/aluno/<id>" para o admin no modo assistência.
 *
 * `opts` é OBRIGATÓRIO e SEM valor padrão, de propósito — mesmo motivo de
 * `assistenciaNavItems(alunoId)` receber o id e não o basePath: a assinatura
 * força cada página a DECIDIR o que aquele usuário vê, em vez de herdar um
 * default permissivo. Um `{ financeiro = true }` faria a aba nascer visível
 * em toda página nova por esquecimento.
 *
 * 🔴 `financeiro`: o SÓCIO NÃO VÊ o Financeiro (B7-b). `gps.aluno_atual()`
 * devolve o aluno_id do AMBIENTE, então sócio e titular compartilham clientes
 * e progresso — mas não o contrato de pagamento, que é do titular e que o
 * sócio nunca assinou. São 13 sócios em 13 ambientes, gente real. Cada página
 * de aluno passa `financeiro: ctx.papelMembro === "titular"`; o admin em
 * assistência passa `true`. Esconder a aba NÃO é a fronteira: a página
 * `/financeiro` reconfere no servidor e a RPC `gps.financeiro_do_aluno`
 * levanta 42501 para o sócio.
 *
 * `equipe`: aba da feature "Equipe" (11/09/2026) — ao contrário do
 * Financeiro, os DOIS papéis veem (titular convida/gerencia; sócio só vê a
 * lista). Mesmo assim a flag é OBRIGATÓRIA e sem default, pelo motivo geral
 * do comentário acima: um `{ equipe = true }` faria a aba nascer visível em
 * toda página nova por esquecimento, mesmo sem essa página ter buscado o
 * dado de convite/membros.
 */
export function alunoNavItems(
  basePath: string,
  opts: {
    financeiro: boolean;
    financeiroEmBreve?: boolean;
    // 🔴 Navegação em 2 níveis (24/09/2026, pedido do Marcio: "abas reunidas
    // dentro de uma aba"). MESMO MOLDE de `financeiroEmBreve`: "Pasta" nasce
    // "em breve" por padrão (`opts.pastaEmBreve !== false`) — a assistência
    // (`assistenciaNavItems`) passa `false` porque a equipe usa a Pasta para
    // atender; `navDoAluno` (o aluno de verdade) passa `true` porque a tela
    // ainda não conta a história certa para ele. Copiado literalmente do
    // comentário do Financeiro logo abaixo — não inverter a polaridade.
    pastaEmBreve?: boolean;
    equipe: boolean;
  },
): NavItem[] {
  const itens: NavItem[] = [
    { href: basePath || "/", label: "Início", icon: "inicio", exact: true },
    { href: `${basePath}/clientes`, label: "Clientes", icon: "clientes" },
    // 🔴 SUPORTE EM 3º, NÃO EM 7º (10/09/2026).
    //
    // MEDIDO: **zero chamados abertos** com 104 alunos travados no funil. A
    // aba era a 7ª de 8, dentro de um `overflow-x-auto` — no celular ela
    // nascia FORA DA TELA. O aluno travado teria de rolar a barra para
    // descobrir que existe um canal de ajuda.
    //
    // O comentário mais abaixo já dizia que "esconder o canal de suporte
    // deixaria o aluno sem saber que ele existe"; a posição contradizia o
    // princípio. Aqui ela cai na primeira dobra, ao lado da aba onde o aluno
    // trava (Clientes).
    { href: `${basePath}/chamados`, label: "Suporte", icon: "suporte" },
    // 📅 Sessões com a equipe jurídica (22/09/2026) — Entrevista Prévia e
    // Reunião Preliminar com as Dras. Elaine e Cristiane. O aluno escolhe um
    // horário que a equipe JÁ declarou que pode (`gps.sessao_*`).
    //
    // 🔴 4ª POSIÇÃO, NÃO 7ª (23/09/2026) — o MESMO remédio que a aba Suporte
    // recebeu logo acima, pelo MESMO defeito medido. Pedido do Marcio:
    // *"a aba da sessão está presente no sistema mas não é visível. A gente
    // tem que prosseguir depois da entrevista prévia para lá. Esse é o buraco
    // na parte do sistema"*.
    //
    // Em 7º, dentro do `overflow-x-auto` do header, ela nascia FORA DA TELA
    // no celular: o parceiro que acabou de concluir a Entrevista Prévia teria
    // de rolar a barra horizontal para descobrir que existe onde marcar a
    // sessão. Foi exatamente assim que o Suporte ficou com ZERO chamados e
    // 104 alunos travados (10/09).
    //
    // ⚠️ Ela entra DEPOIS de Suporte, não antes: Suporte em 3º é decisão
    // registrada de 10/09 e não se rebaixa para abrir espaço. A ordem do topo
    // (Início · Clientes · Suporte) fica intacta; Sessões toma o 4º lugar,
    // que era da Pasta.
    //
    // ⚠️ NÃO é o "agendamento de reunião com a equipe" removido em 10/08/2026
    // e já reconstruído por engano uma vez (05/08). Aquela decisão foi
    // REVOGADA pelo Marcio em 22/09 — "agora a disponibilidade parte delas" —
    // e a revogação autorizou `gps.sessao_*`, e SÓ isso: as tabelas
    // `gps.reuniao_*` e `gps.agenda` seguem órfãs e PROIBIDAS.
    //
    // 🔴 Esta linha é a PORTA DE ENTRADA da tela. Sem ela, `/sessoes`
    // existiria completa e só seria alcançável digitando a URL — o defeito
    // que este portal já pagou três vezes (a tela de respostas do onboarding
    // com 77 questionários dentro, a aba Tutoriais, a aba do Inventário).
    //
    // 🔑 `basePath === ""` é o sinal de "é o aluno de verdade" — a MESMA
    // condição do Plantão logo abaixo, e pelo mesmo motivo: não existe
    // `admin/aluno/[id]/sessoes/page.tsx` (a tela da equipe é `/admin/sessoes`,
    // fatia 5, e é outra tela). Sem este filtro, o link apareceria no modo
    // assistência e o admin cairia num 404 ao clicar. Se um dia houver tela
    // de assistência para as sessões, é só tirar a condição.
    //
    // 🔴 ÍCONE PRÓPRIO (`"sessoes"` = `CalendarDays`), e isto REVOGA o que
    // este mesmo comentário dizia até 23/09 ("a regra do projeto é não
    // inventar chave nova"). Aquela regra continua valendo em geral — o que a
    // suspende aqui é o pedido explícito do Marcio por "mais visual e mais
    // intuitiva". Com `"materiais"` (BookOpen), esta aba usava o ícone de
    // Materiais e do Plantão: três abas de livro lado a lado, e o ícone
    // deixava de informar qualquer coisa. Ver `NavItem["icon"]` em
    // `nav-tabs.tsx`, onde a exceção está registrada junto da chave.
    ...(basePath === ""
      ? [{ href: "/sessoes", label: "Sessões", icon: "sessoes" as const }]
      : []),
    // 🔴 PASTA "EM BREVE" (24/09/2026, navegação em 2 níveis): MESMO MOLDE do
    // Financeiro logo abaixo — a aba continua aparecendo, apagada e sem link,
    // em vez de sumir. `opts.pastaEmBreve` é obrigatório na assinatura de
    // `opts`, mas aceita `undefined` só através de `navDoAluno`/
    // `assistenciaNavItems`, que sempre o preenchem; ver o comentário de cada
    // uma. `!== false` é a MESMA polaridade do `financeiroEmBreve`: por
    // padrão em breve, `false` explícito é que libera o link.
    { href: `${basePath}/pasta`, label: "Pasta", icon: "pasta", emBreve: opts.pastaEmBreve !== false },
    { href: `${basePath}/materiais`, label: "Materiais", icon: "materiais" },
    // 🎧 Plantão de Dúvidas — aba do aluno do PROGRAMA dentro do sistema
    // (decisão do Marcio, 10/09/2026). Não confundir com a rota pública
    // `/p/plantao` (embedada na Hotmart, exclusiva do Acelera): esta aba usa
    // `/plantao` (sem `/p/`) e RPCs próprias (`gps.plantao_*_logado`), que
    // identificam a pessoa pela SESSÃO — nunca por e-mail digitado.
    //
    // 🔑 `basePath === ""` é o sinal de "é o aluno de verdade" (só ele chama
    // com basePath vazio; `assistenciaNavItems` sempre passa
    // `/admin/aluno/<id>`). A rota `/plantao` só existe para o ALUNO — não
    // há `admin/aluno/[id]/plantao/page.tsx` (fora do escopo desta feature):
    // sem este filtro, o link apareceria no modo assistência e o admin
    // cairia num 404 ao clicar. Se um dia existir tela de assistência para
    // o Plantão do Programa, é só tirar a condição.
    //
    // Ícone reaproveitado ("materiais", o mesmo do Plantão no admin em
    // `adminNavItems`) — não existe chave dedicada a plantão em
    // `NavItem["icon"]` e a regra do projeto é não inventar uma nova.
    //
    // ⚠️ NÃO reaproveitar aqui a chave `"sessoes"` (CalendarDays) criada em
    // 23/09 para a aba Sessões: o pedido do Marcio era distinguir SESSÕES do
    // resto, e dar o mesmo calendário ao Plantão refaria a confusão em outro
    // par de abas. Plantão é atendimento em grupo, não hora marcada.
    ...(basePath === ""
      ? [{ href: "/plantao", label: "Plantão", icon: "materiais" as const }]
      : []),
    // ⏸️ FINANCEIRO EM ESPERA (decisão do Marcio, 10/09/2026): "esconder a
    // aba do financeiro, dado que ainda não está pronta, deixa mockado com
    // uma aba de em breve".
    //
    // A aba CONTINUA aparecendo, apagada e sem link. Sumir com ela faria o
    // aluno não saber que o Financeiro vai existir; deixá-la clicável o
    // levaria a uma tela que ainda não conta a história certa.
    //
    // 🔑 A regra do sócio (B7-b) continua valendo por baixo: quando o
    // Financeiro voltar, é só trocar `emBreve: true` por nada — a flag
    // `opts.financeiro` já decide quem vê.
    ...(opts.financeiro
      ? [
          {
            href: `${basePath}/financeiro`,
            label: "Financeiro",
            icon: "financeiro" as const,
            // 🔑 "Em breve" é para o ALUNO. A EQUIPE continua entrando: o
            // Financeiro do aluno é ferramenta de atendimento, e escondê-lo
            // deixaria a equipe sem o dado na hora de responder ao aluno.
            emBreve: opts.financeiroEmBreve !== false,
          },
        ]
      : []),
    // Suporte NÃO tem chave em `opts`: titular e sócio veem os dois. O
    // chamado é do AMBIENTE (`gps.aluno_atual()`), como cliente e progresso —
    // ao contrário do Financeiro, que é o contrato do titular (B7-b). Quem
    // responde "posso abrir chamado?" é o interruptor `chamados_aberto`,
    // dentro da página e com texto — nunca a presença da aba: esconder o
    // canal de suporte deixaria o aluno sem saber que ele existe, que é
    // exatamente o defeito que esta fase corrige.
    // 🔴 Feature "Equipe" (11/09/2026): atrás de flag OBRIGATÓRIA, igual ao
    // Financeiro — ver o comentário no topo do arquivo. Posição: logo antes
    // de "Perfil" (decisão do plano da feature).
    //
    // 🔴 Navegação em 2 níveis (24/09/2026): quando `basePath === ""` (o
    // aluno de verdade, nunca a assistência) o item passa a morar no menu
    // "Sua conta" (`noMenuDeContas: true`), não no trilho — `NavTabs` não o
    // desenha; `app-header.tsx` o filtra e entrega ao `MenuDeContas` via
    // `itensExtras`. Na assistência (`basePath !== ""`) Equipe continua aba
    // normal do trilho: é onde a equipe resolve chamado olhando a mesma tela
    // do aluno (ver `assistenciaNavItems`), e o menu "Sua conta" ali é o DO
    // ADMIN, não do aluno assistido.
    ...(opts.equipe
      ? [
          basePath === ""
            ? {
                href: "/equipe",
                label: "Equipe",
                icon: "equipe" as const,
                noMenuDeContas: true,
              }
            : { href: `${basePath}/equipe`, label: "Equipe", icon: "equipe" as const },
        ]
      : []),
    // 🔴 Navegação em 2 níveis (24/09/2026): "Perfil" SAI quando
    // `basePath === ""` — já está acessível pelo menu "Sua conta" ("Seu
    // perfil", em `menu-de-contas.tsx`), e repeti-lo no trilho seria a mesma
    // rota em dois lugares. Na assistência (`basePath !== ""`) o item
    // continua: o admin edita o perfil do aluno numa aba própria, e o menu
    // "Sua conta" ali é o do ADMIN — não leva a `/admin/aluno/<id>/perfil`.
    ...(basePath === ""
      ? []
      : [{ href: `${basePath}/perfil`, label: "Perfil", icon: "perfil" as const }]),
    // 🔴 Ordem `emBreve` ao fim (24/09/2026, navegação em 2 níveis): "em breve
    // fica na lista, não na frente" (pedido do Marcio). `.sort()` do array é
    // ESTÁVEL (spec ECMAScript desde 2019, V8/Node cumprem) — dois itens que
    // empatam no critério (ambos `emBreve` ou ambos não) mantêm a ordem
    // relativa em que entraram acima. Não reordenar item por item: a lista já
    // muda de posição conforme as flags (`financeiro`, `pastaEmBreve`), e um
    // reposicionamento manual quebraria na primeira combinação nova.
  ];
  return itens.sort((a, b) => Number(!!a.emBreve) - Number(!!b.emBreve));
}

/**
 * As abas do aluno LOGADO, decididas a partir do contexto de sessão.
 *
 * 🔑 Existe para que a regra do sócio (B7-b) more num lugar só. Ela estava
 * copiada como `financeiro: ctx.papelMembro === "titular"` em NOVE
 * `page.tsx` (CD7): home, clientes, ficha do cliente, etapa, materiais,
 * pasta, perfil, chamados e chamado. Uma página nova que esquecesse a linha
 * ganhava a aba Financeiro por omissão — e o comentário de `alunoNavItems`
 * pedia atenção justamente para isso. Avisar do erro é pior do que remover a
 * chance dele.
 *
 * `basePath` continua existindo (default "") porque `alunoNavItems` é
 * compartilhada com o modo assistência; para o aluno logado é sempre "".
 *
 * ⚠️ NÃO é fronteira de segurança — esconder a aba nunca foi. Quem barra o
 * sócio é a página `/financeiro` (reconfere no servidor) e a RPC
 * `gps.financeiro_do_aluno`, que levanta 42501. Ver `src/lib/financeiro.ts`.
 */
export function navDoAluno(ctx: ContextoSessao, basePath = ""): NavItem[] {
  return alunoNavItems(basePath, {
    financeiro: ctx.papelMembro === "titular",
    // Navegação em 2 níveis (24/09/2026): a Pasta continua "em breve" para o
    // aluno de verdade — mesmo padrão do Financeiro, ver o comentário em
    // `alunoNavItems`.
    pastaEmBreve: true,
    // Equipe é dos DOIS papéis (ao contrário do Financeiro): titular convida
    // e gerencia, sócio só vê a lista — a página `/equipe` decide o que
    // renderizar a partir de `ctx.papelMembro`, a aba não escolhe por ele.
    equipe: true,
  });
}

/**
 * Abas do modo assistência do admin (aluno + Diário). NUNCA usar
 * `alunoNavItems` para incluir o Diário: ele também é chamado pelo aluno
 * (basePath=""), e o Diário é dado sensível de terceiros (LGPD), exclusivo
 * do admin. Esta função recebe `alunoId` (não `basePath`) de propósito —
 * torna impossível chamá-la com "" por engano.
 *
 * `financeiro: true` porque o admin sempre enxerga o financeiro do ambiente
 * (é ele que responde a divergência) — a mesma regra da guarda da RPC.
 *
 * 🔑 `ambienteCompartilhado` (UX8) existe só para a PRÉVIA "como o aluno vê".
 * O admin continua com a aba: o que muda é que, num ambiente com sócio, ela
 * ganha `adminOnly` — e `nav-tabs.tsx` a marca com `previa-oculta`. Motivo:
 * a prévia é a ferramenta de suporte usada para responder "o que você está
 * vendo aí?", e num ambiente compartilhado o admin não sabe se quem ligou é
 * o titular ou o sócio. Mostrar uma aba que o sócio nunca terá faz a
 * ferramenta mentir na única pergunta que ela existe para responder.
 * Esconder na prévia é o custo baixo do lado seguro: some para os dois
 * papéis num ambiente com sócio, em vez de aparecer para quem não tem.
 *
 * ⚠️ NÃO é fronteira de segurança: quem barra o sócio é a página
 * `/financeiro` (reconfere no servidor) e a RPC `gps.financeiro_do_aluno`
 * (42501). Isto aqui é honestidade de prévia. `opts` é obrigatório pelo
 * mesmo motivo de `alunoNavItems`: default permissivo vira esquecimento.
 */
export function assistenciaNavItems(
  alunoId: string,
  opts: { ambienteCompartilhado: boolean },
): NavItem[] {
  const base = `/admin/aluno/${alunoId}`;
  const hrefFinanceiro = `${base}/financeiro`;
  return [
    ...alunoNavItems(base, {
      financeiro: true,
      // A equipe entra no Financeiro do aluno; só o aluno vê "em breve".
      financeiroEmBreve: false,
      // Navegação em 2 níveis (24/09/2026): a equipe usa a Pasta para
      // atender — mesmo padrão do Financeiro logo acima, o link fica ativo.
      pastaEmBreve: false,
      // A equipe também enxerga a aba Equipe no modo assistência — é onde ela
      // resolve chamado sobre convite/sócio olhando a mesma tela do aluno.
      equipe: true,
    }).map((item) =>
      opts.ambienteCompartilhado && item.href === hrefFinanceiro
        ? { ...item, adminOnly: true }
        : item,
    ),
    // 🔴 Navegação em 2 níveis (24/09/2026): Diário e Resolver deixam de ser
    // dois itens soltos do 1º nível e viram `filhos` do grupo
    // "Acompanhamento". `href` do grupo é o do Diário (o clique direto no
    // grupo abre a mesma tela de sempre); `adminOnly` no grupo E nos dois
    // filhos — a prévia "como o aluno vê" tem de esconder o grupo inteiro,
    // não só os itens de dentro, senão sobraria uma aba vazia na prévia.
    {
      href: `${base}/diario`,
      label: "Acompanhamento",
      icon: "diario",
      adminOnly: true,
      filhos: [
        { href: `${base}/diario`, label: "Diário", adminOnly: true },
        // Central de resolução (09/09): diagnóstico do ambiente + ações
        // guardadas (acesso, pessoas, financeiro, trilha).
        { href: `${base}/resolver`, label: "Resolver", adminOnly: true },
      ],
    },
  ];
}

/**
 * 🔴 24/09/2026 — pedido do Marcio: "abas reunidas dentro de uma aba; Clientes
 * vira sub-aba de Alunos; em breve fica na lista, não na frente". É o que
 * organiza as 10 abas soltas do ramo `souAdmin` em 5 grupos com `filhos`.
 *
 * Abas do painel do admin (nível topo, não o modo assistência do aluno).
 *
 * `chamadosAbertos` é OPCIONAL de propósito e só deve ser passado por quem já
 * tem o número em mãos — hoje, `/admin/chamados`, que carrega a fila de
 * qualquer jeito. Nenhuma página gasta uma consulta a mais para pintar uma
 * pílula: `contarChamadosAbertosPorAluno()` e `getAtendimentoPorAluno()` batem
 * na MESMA RPC (`gps.admin_painel_atendimento`), e chamar as duas na mesma
 * página seria uma ida ao banco pelo mesmo dado (ver `chamados-data.ts`).
 *
 * `solicitacoesPendentes` segue a MESMA regra de `chamadosAbertos`: OPCIONAL,
 * só quem já tem o número em mãos passa — hoje, `/admin`, que carrega a fila
 * de solicitações de qualquer jeito para desenhar a aba "Solicitações". Não
 * gasta consulta extra: nenhuma outra página do admin busca esse número.
 *
 * `souAdmin` é OBRIGATÓRIO e SEM valor padrão — mesmo motivo do comentário no
 * topo do arquivo (`alunoNavItems`): esta função hoje é chamada só por telas
 * 100% admin, mas a Fatia 5 (15/09/2026, papel "equipe da esteira") abriu
 * `/admin/fila` também para OPERADOR não-admin (`ehEquipeDaEsteira()`). Um
 * operador logado nunca pode ver, no header, um item de menu que leva a uma
 * tela que ele não acessa — link que dá erro é pior que link ausente (ver
 * `ehEquipeDaEsteira` em `src/lib/auth.ts`). Com `souAdmin: false`, a função
 * devolve só o subconjunto que a Fatia 5 abriu ao operador puro (hoje: Fila
 * de ligações); as outras 8 abas do admin exigem `gp_is_admin()`/`ehAdmin()`
 * em RPC ou guarda de página, e o operador cairia num redirect ao clicar.
 */
export function adminNavItems(
  opts: {
    chamadosAbertos?: number;
    solicitacoesPendentes?: number;
    souAdmin: boolean;
  },
): NavItem[] {
  // Operador não-admin: só o que a Fatia 5 liberou para ele. Nada de
  // Chamados, Vídeos, Clientes (lista de todos os ambientes), Tutoriais ou
  // Interruptores — todas essas guardam por `gp_is_admin()`/`ehAdmin()`, não
  // por `eh_equipe()`/`ehEquipeDaEsteira()`.
  if (!opts.souAdmin) {
    return [
      {
        href: "/admin/fila",
        label: "Fila de ligações",
        icon: "suporte",
        exact: true,
      },
    ];
  }

  return [
    // 🔴 NAVEGAÇÃO EM 2 NÍVEIS (24/09/2026, pedido do Marcio): "abas reunidas
    // dentro de uma aba; Clientes vira sub-aba de Alunos; em breve fica na
    // lista, não na frente". As 10 abas soltas viram 5 GRUPOS com `filhos`
    // (2º nível, renderizado pela 3ª linha do header quando o grupo está
    // ativo — ver `NavItem["filhos"]` em `nav-tabs.tsx`). Cada grupo mantém
    // `href` próprio (a rota do clique direto no rótulo do grupo).
    //
    // Grupo "Parceiros": `restauraPainel` continua no GRUPO — o clique leva à
    // ÚLTIMA URL do painel (aba, busca, ordem, filtros, lote), não a `/admin`
    // pelado. Sem isso, a aba do header desfazia exatamente o estado que a
    // URL do painel existe para guardar — era a segunda porta de volta, e ela
    // apagava tudo.
    //
    // 🔑 Rótulo "Parceiros", não "Alunos": é o rótulo que `abas-painel.tsx`
    // já usa hoje na `TabsTrigger` de 1º nível (`AbasPainel`) — confira lá e
    // em `alunos-ativos-lista/estado-na-url.ts` antes de mudar; os dois
    // lugares têm de dizer a mesma palavra para a mesma coisa.
    //
    // 🔴 Sub-aba `abaDoPainel: "ativos"` chama-se "Ativos", NÃO "Parceiros"
    // (24/09/2026, 2ª rodada): com o grupo já rotulado "Parceiros", repetir a
    // mesma palavra na sub-aba ("Parceiros" dentro de "Parceiros") confundia
    // qual das duas era o rótulo clicado. "Ativos" descreve o recorte (quem
    // já está na base, oposto de "em breve"/pendente) sem repetir o nome do
    // grupo. Ver o mesmo cuidado em `abas-painel.tsx`/`estado-na-url.ts` —
    // aquele rótulo de UI é de outra fatia (iromar); aqui é só o mapa.
    //
    // Sub-abas: `abaDoPainel` casa com a allowlist `ABAS` de
    // `estado-na-url.ts` ("visao"/"ativos"/"solicitacoes"/"etapas") — só as 4
    // que a URL do painel aceita. "Clientes" NÃO é uma delas: é a lista de
    // TODOS os ambientes, rota própria (`/admin/clientes`), por isso entra
    // como sub-aba de `href` puro, sem `abaDoPainel`.
    {
      href: "/admin",
      label: "Parceiros",
      icon: "alunos",
      exact: true,
      restauraPainel: true,
      // Badge de solicitações pendentes: o mecanismo é o mesmo do grupo
      // "Atendimento" com `chamadosAbertos` (`nav-tabs.tsx` suprime o badge
      // do grupo ativo e o mostra na sub-aba "Solicitações").
      // ⚠️ HOJE só `/admin/page.tsx` passa `solicitacoesPendentes`, e em
      // `/admin` este grupo está sempre ATIVO — ou seja, o número aparece na
      // sub-aba, e o badge no grupo fechado NÃO acontece em nenhuma tela
      // real (as outras 11 chamadas de `adminNavItems` não têm o número, e
      // buscá-lo custaria uma consulta por tela). Se um dia outra página
      // passar o número, o badge do grupo passa a existir sem mais código.
      badge: opts.solicitacoesPendentes,
      filhos: [
        // 🔴 "Visão geral" com `href: "/admin"` + `exact: true` (2ª rodada,
        // veredito do João), NÃO `href: "/admin?aba=visao"`: a regra "padrão
        // (`visao`) = URL limpa" passa a morar AQUI, no mapa, em vez de em
        // `SubNavTabs` (`nav-tabs.tsx`) — o iromar apaga a normalização que
        // fazia essa troca no componente. `SubNavTabs` decide "ativa" por
        // `abaDoPainel === abaAtual` (dentro de `/admin`) e por `casaSozinho`
        // (fora, via `href`/`exact`) — os dois continuam funcionando com
        // `href` limpo, sem depender de reescrever `?aba=` em lugar nenhum.
        { href: "/admin", exact: true, label: "Visão geral", abaDoPainel: "visao" },
        { href: "/admin?aba=ativos", label: "Ativos", abaDoPainel: "ativos" },
        {
          href: "/admin?aba=solicitacoes",
          label: "Solicitações",
          abaDoPainel: "solicitacoes",
          badge: opts.solicitacoesPendentes,
        },
        { href: "/admin?aba=etapas", label: "Etapas", abaDoPainel: "etapas" },
        // Lista consolidada de clientes do programa (item 3 dos 9,
        // 14/09/2026) — ícone "clientes", o MESMO que `alunoNavItems` usa
        // para a aba Clientes do parceiro (mesmo assunto, vocabulário de
        // ícone já existente).
        //
        // 🔴 SÓ AQUI, NUNCA em `alunoNavItems`: aquela função também é
        // chamada pelo ALUNO (basePath=""), e qualquer item nela vaza para o
        // menu dele — esta lista é de TODOS os ambientes, dado de terceiro
        // que o parceiro não pode ver fora da própria ficha.
        { href: "/admin/clientes", label: "Clientes", icon: "clientes" },
      ],
    },
    // Grupo "Agenda": Sessões (a tela DA EQUIPE) + Plantão. As duas eram abas
    // soltas de calendário/atendimento; juntas sob um rótulo que diz do que
    // se trata sem abrir nada.
    //
    // 📅 Sessões com a equipe jurídica (22/09/2026) — a tela DELAS: próximas
    // sessões, briefing do cliente, cancelar. A tela do parceiro é `/sessoes`
    // (em `alunoNavItems`); esta é a contraparte da equipe.
    //
    // 🔴 A ROTA É ROTEADA AQUI, PELA FATIA 4, e a tela é construída pela
    // fatia 5 — `src/lib/nav.ts` é EXCLUSIVO desta fatia porque é o único
    // arquivo que as duas disputariam (PRD §10). Dois agentes no mesmo
    // arquivo ficam ambos verdes e o build quebra; pior, commitar o arquivo
    // inteiro publica o trabalho não revisado do outro.
    //
    // ⚠️ ESTE GRUPO FICA NO RAMO `souAdmin`, e é uma decisão, não descuido: a
    // RLS da `…291` dá à doutora `responsavel_id = auth.uid()` e ao admin
    // `gp_is_admin()` — o OPERADOR puro (`gps.eh_equipe()`, papel "equipe da
    // esteira") NÃO lê sessão nenhuma e não tem por que ver o link. As duas
    // doutoras são admin/dev em `public.perfis` (§9b.3: cristiane@advmais.com
    // admin, elaine@advmais.com dev), então elas caem neste ramo. Link que dá
    // erro é pior que link ausente.
    //
    // Ícone "sessoes" no grupo (a mesma família de agenda que a aba do
    // parceiro usa desde 23/09); Plantão mantém "materiais" (BookOpen) — não
    // há chave dedicada e a regra do projeto é não inventar uma nova.
    {
      href: "/admin/sessoes",
      label: "Agenda",
      icon: "sessoes",
      filhos: [
        { href: "/admin/sessoes", label: "Sessões" },
        { href: "/admin/plantao", label: "Plantão", icon: "materiais" },
      ],
    },
    // Grupo "Atendimento": Chamados (com o badge, que sobe também para o
    // GRUPO — some na régua de 1º nível se o admin não abrir o grupo) e a
    // Fila de ligações da entrevista prévia (Fatia 3 da esteira, 15/09/2026):
    // a equipe liga para os 5 clientes que cada parceiro selecionou e
    // registra resultado + DISC + decisores.
    {
      href: "/admin/chamados",
      label: "Atendimento",
      icon: "suporte",
      badge: opts.chamadosAbertos,
      filhos: [
        {
          href: "/admin/chamados",
          label: "Chamados",
          badge: opts.chamadosAbertos,
        },
        // 🔴 Esta linha é a PORTA DE ENTRADA da tela — sem ela, `/admin/fila`
        // existiria completa e só seria alcançável digitando a URL (o mesmo
        // defeito já pago com a tela de respostas do onboarding).
        { href: "/admin/fila", label: "Fila de ligações" },
      ],
    },
    // Grupo "Conteúdo": Vídeos (demanda 5, 11/09/2026) + Tutoriais
    // (15/09/2026, a tela que alimenta a aba fixa do parceiro). Ícone
    // "materiais" (BookOpen) no grupo — mesmo catálogo, mesmo vocabulário.
    {
      href: "/admin/videos",
      label: "Conteúdo",
      icon: "materiais",
      filhos: [
        { href: "/admin/videos", label: "Vídeos" },
        // 🔴 Esta linha é a PORTA DE ENTRADA da tela. Sem ela, `/admin/tutoriais`
        // existiria completa e só seria alcançável digitando a URL — que é
        // exatamente o defeito já pago aqui: a tela de respostas do
        // onboarding ficou escondida com 77 questionários preenchidos dentro
        // dela.
        { href: "/admin/tutoriais", label: "Tutoriais" },
      ],
    },
    // Grupo "Configurações": Interruptores de `gps.config` (15/09/2026) — os
    // botões de pânico que só se ligavam por SQL direto no banco — e
    // Operadores (Fatia 5, ÚLTIMA, 15/09/2026): quem entra aqui vê a fila de
    // ligações E o dossiê do cliente; a tela ativa/desativa o papel "equipe
    // da esteira" para um login existente. Guarda `gp_is_admin()` na RPC
    // (`gps.operador_definir`): operador não promove operador, então este
    // item SÓ aparece no ramo `souAdmin` acima, nunca no ramo do operador
    // puro. Ícone "resolver" (Stethoscope) no grupo — não há chave dedicada a
    // "painel de controle" em `NavItem["icon"]` e a regra do projeto é não
    // inventar chave nova; é o ícone mais próximo (destravar/consertar o
    // sistema), já em uso na Central de resolução do admin no mesmo
    // espírito.
    {
      href: "/admin/configuracoes",
      label: "Configurações",
      icon: "resolver",
      filhos: [
        // 🔴 Esta linha é a PORTA DE ENTRADA da tela — sem ela,
        // `/admin/configuracoes` existiria completa e só seria alcançável
        // digitando a URL.
        { href: "/admin/configuracoes", label: "Interruptores" },
        // 🔴 Esta linha é a PORTA DE ENTRADA da tela — sem ela,
        // `/admin/operadores` existiria completa e só seria alcançável
        // digitando a URL.
        { href: "/admin/operadores", label: "Operadores" },
      ],
    },
  ];
}

/**
 * Sanitiza o `?redirect=` do login. Devolve SEMPRE um caminho interno —
 * qualquer coisa suspeita vira "/".
 *
 * 🔴 Por que existir: `destino.startsWith("/")` (a regra anterior,
 * duplicada na página e na action) ACEITA `//evil.com` e `/\evil.com` — URLs
 * protocolo-relativas. `redirect("//evil.com")` emite `Location: //evil.com`
 * e o browser sai do domínio levando o usuário que acabou de digitar a senha.
 * O `proxy.ts` alimenta esse parâmetro em toda rota protegida, então o link é
 * trivial de montar.
 *
 * Usar nos DOIS lugares (`login/page.tsx` monta o campo oculto,
 * `login/actions.ts` recebe de volta do cliente e precisa revalidar — campo
 * oculto é input do usuário, não do servidor).
 */
export function destinoInterno(v: string | null | undefined): string {
  const PADRAO = "/";
  if (typeof v !== "string") return PADRAO;

  // Browsers descartam TAB/LF/CR em QUALQUER posição da URL: "/<tab>/evil.com"
  // resolve como "//evil.com". Tirar caractere de controle (e espaço nas
  // pontas) ANTES de qualquer teste, senão a validação olha uma string
  // diferente da que o browser vai resolver.
  const limpo = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  // Cobre "", "https://evil.com", "\/evil.com", "evil.com", "javascript:...".
  if (!limpo.startsWith("/")) return PADRAO;
  if (limpo === "/") return PADRAO;

  // "%2f" e "%5c" viram "/" e "\" quando o browser resolve o Location.
  // Normaliza só para VALIDAR; o valor devolvido continua sendo o original.
  const normalizado = limpo
    .replace(/%2f/gi, "/")
    .replace(/%5c/gi, "/")
    .replace(/\\/g, "/")
    // Controle percent-encoded (%09, %0a, %0d, %00...): nenhum browser
    // decodifica isso ao seguir o `Location`, mas qualquer proxy que
    // normalize a URL no caminho transformaria "/%09//host" em "//host".
    // Sumir com eles ANTES do teste custa nada.
    .replace(/%0[0-9a-f]|%1[0-9a-f]|%7f/gi, "");

  // Segundo caractere não pode ser barra: bloqueia "//host" e "/\host".
  if (normalizado.startsWith("//")) return PADRAO;
  // Nenhum esquema no meio do caminho.
  if (/^\/[^?#]*:\/\//.test(normalizado)) return PADRAO;

  return limpo;
}

/**
 * A aba FIXA "Tutoriais" (feature 15/09/2026) — vive fora do trilho que rola
 * (ver `app-header.tsx`/`nav-tabs.tsx`), então é uma prop SEPARADA de
 * `alunoNavItems`/`navDoAluno`/`assistenciaNavItems`/`adminNavItems`, não um
 * item a mais nessas listas.
 *
 * `opts` é OBRIGATÓRIO e SEM valor padrão — mesmo motivo do comentário no
 * topo deste arquivo (`alunoNavItems`): um `{ tutoriais = true }` faria a aba
 * nascer visível em toda página nova por esquecimento, mesmo antes de a
 * página ter conferido o interruptor.
 *
 * 🔴 Interruptor desligado ⇒ a aba SOME (decisão do Marcio; não é "em
 * breve") — devolve `undefined`, e quem chama (`app-header.tsx`) não
 * renderiza o bloco fixo nem o `border-l` dele.
 */
export function navFixoDoAluno(
  basePath: string,
  opts: { tutoriais: boolean },
): NavItem | undefined {
  if (!opts.tutoriais) return undefined;
  return { href: `${basePath}/tutoriais`, label: "Tutoriais", icon: "tutoriais" };
}
