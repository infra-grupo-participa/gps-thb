import type { NavItem } from "@/components/nav-tabs";

/**
 * Abas de navegação do aluno. basePath = "" para o aluno logado;
 * "/admin/aluno/<id>" para o admin no modo assistência.
 */
export function alunoNavItems(basePath: string): NavItem[] {
  return [
    { href: basePath || "/", label: "Início", icon: "inicio", exact: true },
    { href: `${basePath}/clientes`, label: "Clientes", icon: "clientes" },
    { href: `${basePath}/pasta`, label: "Pasta", icon: "pasta" },
    { href: `${basePath}/materiais`, label: "Materiais", icon: "materiais" },
    { href: `${basePath}/perfil`, label: "Perfil", icon: "perfil" },
  ];
}

/**
 * Abas do modo assistência do admin (aluno + Diário). NUNCA usar
 * `alunoNavItems` para incluir o Diário: ele também é chamado pelo aluno
 * (basePath=""), e o Diário é dado sensível de terceiros (LGPD), exclusivo
 * do admin. Esta função recebe `alunoId` (não `basePath`) de propósito —
 * torna impossível chamá-la com "" por engano.
 */
export function assistenciaNavItems(alunoId: string): NavItem[] {
  return [
    ...alunoNavItems(`/admin/aluno/${alunoId}`),
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
