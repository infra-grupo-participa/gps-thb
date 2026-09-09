import type { NavItem } from "@/components/nav-tabs";

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
    { href: `${basePath}/perfil`, label: "Perfil", icon: "perfil" },
  ];
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
 */
export function assistenciaNavItems(alunoId: string): NavItem[] {
  return [
    ...alunoNavItems(`/admin/aluno/${alunoId}`, { financeiro: true }),
    {
      href: `/admin/aluno/${alunoId}/diario`,
      label: "Diário",
      icon: "diario",
      adminOnly: true,
    },
  ];
}

/** Abas do painel do admin (nível topo, não o modo assistência do aluno). */
export function adminNavItems(): NavItem[] {
  return [
    { href: "/admin", label: "Alunos", icon: "alunos", exact: true },
    // Ícone "materiais" (BookOpen) reaproveitado: não há chave dedicada a
    // calendário/atendimento em NavItem["icon"] (nav-tabs.tsx) e a regra do
    // projeto é não inventar chave nova de ícone.
    { href: "/admin/plantao", label: "Plantão", icon: "materiais" },
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
