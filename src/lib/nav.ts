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
 */
export function alunoNavItems(
  basePath: string,
  opts: { financeiro: boolean },
): NavItem[] {
  return [
    { href: basePath || "/", label: "Início", icon: "inicio", exact: true },
    { href: `${basePath}/clientes`, label: "Clientes", icon: "clientes" },
    { href: `${basePath}/pasta`, label: "Pasta", icon: "pasta" },
    { href: `${basePath}/materiais`, label: "Materiais", icon: "materiais" },
    ...(opts.financeiro
      ? [
          {
            href: `${basePath}/financeiro`,
            label: "Financeiro",
            icon: "financeiro" as const,
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
    { href: `${basePath}/chamados`, label: "Suporte", icon: "suporte" },
    { href: `${basePath}/perfil`, label: "Perfil", icon: "perfil" },
  ];
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
    ...alunoNavItems(base, { financeiro: true }).map((item) =>
      opts.ambienteCompartilhado && item.href === hrefFinanceiro
        ? { ...item, adminOnly: true }
        : item,
    ),
    {
      href: `${base}/diario`,
      label: "Diário",
      icon: "diario",
      adminOnly: true,
    },
    // Central de resolução (09/09): diagnóstico do ambiente + ações guardadas
    // (acesso, pessoas, financeiro, trilha). `adminOnly`: some na prévia "como
    // o aluno vê" — o aluno nunca tem essa tela.
    {
      href: `${base}/resolver`,
      label: "Resolver",
      icon: "resolver",
      adminOnly: true,
    },
  ];
}

/**
 * Abas do painel do admin (nível topo, não o modo assistência do aluno).
 *
 * `chamadosAbertos` é OPCIONAL de propósito e só deve ser passado por quem já
 * tem o número em mãos — hoje, `/admin/chamados`, que carrega a fila de
 * qualquer jeito. Nenhuma página gasta uma consulta a mais para pintar uma
 * pílula: `contarChamadosAbertosPorAluno()` e `getAtendimentoPorAluno()` batem
 * na MESMA RPC (`gps.admin_painel_atendimento`), e chamar as duas na mesma
 * página seria uma ida ao banco pelo mesmo dado (ver `chamados-data.ts`).
 */
export function adminNavItems(
  opts: { chamadosAbertos?: number } = {},
): NavItem[] {
  return [
    // `restauraPainel`: o clique leva à ÚLTIMA URL do painel (aba, busca,
    // ordem, filtros, lote), não a `/admin` pelado. Sem isso, a aba do header
    // desfazia exatamente o estado que a URL do painel existe para guardar —
    // era a segunda porta de volta, e ela apagava tudo.
    {
      href: "/admin",
      label: "Alunos",
      icon: "alunos",
      exact: true,
      restauraPainel: true,
    },
    // Ícone "materiais" (BookOpen) reaproveitado: não há chave dedicada a
    // calendário/atendimento em NavItem["icon"] (nav-tabs.tsx) e a regra do
    // projeto é não inventar chave nova de ícone.
    { href: "/admin/plantao", label: "Plantão", icon: "materiais" },
    {
      href: "/admin/chamados",
      label: "Chamados",
      icon: "suporte",
      badge: opts.chamadosAbertos,
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
